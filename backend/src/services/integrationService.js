const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { Notification, User } = require('../models');
const emailService = require('./emailService');
const pushService = require('./pushService');


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
    const line = `[${new Date().toISOString()}] ${scope} ${error?.message || error}\n${JSON.stringify(meta)}\n\n`;
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
      return true;
    }, 'WhatsApp');
  },

  async sendEmail(to, subject, body, html = null) {
    try {
      // Use Resend service
      // If html is not provided, wrap body in simple p tag or use text
      const content = html || `<p>${body}</p>`;
      return await withRetry(async () => {
        return await emailService.sendEmail(to, subject, content);
      }, 'Email');
    } catch (e) {
      logApiError('Email', e, {
        to,
        subject
      });
      throw e;
    }
  },

  async verifyEmailConfig(override = {}) {
    // Check if Resend API key is present
    if (!process.env.RESEND_API_KEY) {
        throw new Error('RESEND_API_KEY is missing');
    }
    return {
        provider: 'Resend',
        enabled: true
    };
  },

  async sendPushNotification(userId, title, message) {
    try {
      console.log(`[Push Notification] To User ${userId}: ${title} - ${message}`);
      await pushService.sendPushNotification(userId, title, message);
      return true;
    } catch (e) {
      console.error('Failed to send push notification:', e);
      return false;
    }
  }
};

module.exports = IntegrationService;
