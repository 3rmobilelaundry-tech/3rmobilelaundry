const fs = require('fs');
const path = require('path');
const axios = require('axios');
const nodemailer = require('nodemailer');
const { Notification, User } = require('../models');

const SETTINGS_PATH = path.join(__dirname, '..', 'config', 'app-settings.json');
const API_LOG_PATH = path.join(__dirname, '..', 'logs', 'api-errors.log');

function readSettings() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      const raw = fs.readFileSync(SETTINGS_PATH, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Failed to read settings:', e);
  }
  return {};
}

function logApiError(scope, error, meta = {}) {
  try {
    const dir = path.dirname(API_LOG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const safeMeta = { ...meta };
    if (safeMeta.smtp_pass) safeMeta.smtp_pass = '***';
    const line = `[${new Date().toISOString()}] ${scope} ${error?.message || error}\n${JSON.stringify(safeMeta)}\n\n`;
    fs.appendFileSync(API_LOG_PATH, line, 'utf-8');
  } catch (e) {
    console.error('Failed to write api log:', e);
  }
}

async function notifyAdmins(title, message) {
  try {
    const admins = await User.findAll({ where: { role: 'admin' } });
    const notifications = admins.map(admin => ({
      user_id: admin.user_id,
      title,
      message,
      type: 'personal',
      event_type: 'system',
      channel: 'app'
    }));
    if (notifications.length > 0) {
      await Notification.bulkCreate(notifications);
    }
  } catch (e) {
    console.error('Failed to notify admins:', e);
  }
}

function resolveEmailConfig(override = {}) {
  const settings = readSettings();
  const base = settings.integrations?.email || {};
  const merged = { ...base, ...override };
  const host = merged.smtp_host || process.env.SMTP_HOST;
  const port = Number(merged.smtp_port || process.env.SMTP_PORT || 587);
  const user = merged.smtp_user || process.env.SMTP_USER;
  const pass = merged.smtp_pass || process.env.SMTP_PASS;
  const from = merged.smtp_from || merged.from || user;
  const enabled = merged.enabled !== false;
  return { enabled, host, port, user, pass, from };
}

function buildTransportOptions(config) {
  if (!config.host || !config.port || !config.user || !config.pass) {
    throw new Error('Email SMTP settings are incomplete');
  }
  const port = Number(config.port);
  const secure = port === 465;
  const requireTLS = port === 587;
  return {
    host: config.host,
    port,
    secure,
    requireTLS,
    auth: { user: config.user, pass: config.pass },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000
  };
}

async function withRetry(operation, name, maxRetries = 3) {
  let lastError;
  for (let i = 1; i <= maxRetries; i++) {
    try {
      return await operation();
    } catch (e) {
      console.warn(`[${name}] Attempt ${i}/${maxRetries} failed: ${e.message}`);
      lastError = e;
      if (i < maxRetries) {
        await new Promise(res => setTimeout(res, 1000 * i)); // Exponential backoffish
      }
    }
  }
  
  // All retries failed
  const errorMsg = `Integration ${name} failed after ${maxRetries} attempts. Error: ${lastError.message}`;
  console.error(errorMsg);
  await notifyAdmins('Integration Failure', errorMsg);
  throw lastError;
}

const IntegrationService = {
  // PAYSTACK INTEGRATION
  async verifyPaystack(publicKey, secretKey) {
    // If keys not provided, read from settings or env
    if (!publicKey || !secretKey) {
        const settings = readSettings();
        const ps = settings.integrations?.paystack || {};
        publicKey = publicKey || ps.public_key || process.env.PAYSTACK_PUBLIC_KEY;
        secretKey = secretKey || ps.secret_key || process.env.PAYSTACK_SECRET_KEY;
    }

    if (!publicKey || !secretKey) {
        throw new Error('Missing Paystack keys');
    }

    // Verify keys format (Basic check)
    if (!publicKey.startsWith('pk_live_') && !publicKey.startsWith('pk_test_')) {
        throw new Error('Invalid Public Key format');
    }
    if (!secretKey.startsWith('sk_live_') && !secretKey.startsWith('sk_test_')) {
        throw new Error('Invalid Secret Key format');
    }

    // Call Paystack API to verify (e.g. list banks or just check balance/connection)
    // Using /transaction/verify/fake_ref to check auth is valid? No, that might 404.
    // Use /bank (List Banks) as a lightweight authenticated call.
    try {
        const response = await axios.get('https://api.paystack.co/bank?perPage=1', {
            headers: { Authorization: `Bearer ${secretKey}` }
        });
        return response.status === 200;
    } catch (error) {
        console.error('Paystack verification failed:', error.response?.data || error.message);
        throw new Error(error.response?.data?.message || 'Failed to connect to Paystack');
    }
  },

  async initializePaystackTransaction(email, amount, callbackUrl, metadata = {}) {
    const settings = readSettings();
    const ps = settings.integrations?.paystack;
    const secretKey = ps?.secret_key || process.env.PAYSTACK_SECRET_KEY;
    
    if ((!ps || !ps.enabled) && !process.env.PAYSTACK_SECRET_KEY) {
        throw new Error('Paystack is not enabled or configured');
    }
    
    if (!secretKey) {
         throw new Error('Paystack secret key is missing');
    }

    return withRetry(async () => {
        const response = await axios.post('https://api.paystack.co/transaction/initialize', {
            email,
            amount: Math.round(amount * 100), // Convert to kobo/cents
            callback_url: callbackUrl,
            metadata: JSON.stringify(metadata)
        }, {
            headers: { 
                Authorization: `Bearer ${secretKey}`,
                'Content-Type': 'application/json'
            }
        });

        return response.data.data; // { authorization_url, access_code, reference }
    }, 'Paystack_Init');
  },

  async verifyPaystackTransaction(reference) {
    const settings = readSettings();
    const ps = settings.integrations?.paystack;
    const secretKey = ps?.secret_key || process.env.PAYSTACK_SECRET_KEY;
    
    if (!secretKey) {
        throw new Error('Paystack is not configured');
    }

    return withRetry(async () => {
        const response = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`, {
            headers: { Authorization: `Bearer ${secretKey}` }
        });
        return response.data.data;
    }, 'Paystack_Verify');
  },

  async sendWhatsApp(phone, message) {
    const settings = readSettings();
    const waConfig = settings.integrations?.whatsapp;

    if (!waConfig || !waConfig.enabled) {
      console.log('WhatsApp integration disabled or missing config');
      return false;
    }

    return withRetry(async () => {
      console.log(`[WhatsApp] Sending to ${phone}: ${message}`);
      
      // Simulate sporadic failure for testing if needed, or assume success
      // In real implementation: 
      // const res = await fetch(...)
      // if (!res.ok) throw new Error(res.statusText);
      
      return true;
    }, 'WhatsApp');
  },

  async sendEmail(to, subject, body, html = null) {
    const emailConfig = readSettings().integrations?.email;
    if (!emailConfig || !emailConfig.enabled) {
      console.log('Email integration disabled');
      return false;
    }
    const resolved = resolveEmailConfig(emailConfig);
    const transportOptions = buildTransportOptions(resolved);
    try {
      return await withRetry(async () => {
        const transport = nodemailer.createTransport(transportOptions);
        return transport.sendMail({
          from: resolved.from,
          to,
          subject,
          text: body,
          html: html || undefined
        });
      }, 'Email');
    } catch (e) {
      logApiError('Email', e, {
        host: resolved.host,
        port: resolved.port,
        user: resolved.user,
        from: resolved.from,
        secure: transportOptions.secure,
        requireTLS: transportOptions.requireTLS
      });
      throw e;
    }
  },

  async verifyEmailConfig(override = {}) {
    const resolved = resolveEmailConfig(override);
    const transportOptions = buildTransportOptions(resolved);
    try {
      const transport = nodemailer.createTransport(transportOptions);
      await transport.verify();
      return {
        host: resolved.host,
        port: Number(resolved.port),
        user: resolved.user,
        from: resolved.from,
        secure: transportOptions.secure,
        requireTLS: transportOptions.requireTLS
      };
    } catch (e) {
      logApiError('EmailVerify', e, {
        host: resolved.host,
        port: resolved.port,
        user: resolved.user,
        from: resolved.from,
        secure: transportOptions.secure,
        requireTLS: transportOptions.requireTLS
      });
      throw e;
    }
  },

  async sendPushNotification(userId, title, message) {
    // Placeholder for Push Notification Service (e.g., Expo, Firebase)
    // Since we don't have push tokens stored yet, we just log this action.
    // In a real implementation, we would fetch the user's push token and send via Expo API.
    console.log(`[Push Notification] To User ${userId}: ${title} - ${message}`);
    return true;
  }
};

module.exports = IntegrationService;
