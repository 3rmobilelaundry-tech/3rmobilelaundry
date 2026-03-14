const express = require('express');
const router = express.Router();
const { User, Notification, AuditLog, Plan, Subscription, Order, Code, Payment, ChatThread, ChatMessage, RegistrationField, School, DeviceToken } = require('../models');
const { Op } = require('sequelize');
const fs = require('fs');
const path = require('path');
const IntegrationService = require('../services/integrationService');
const sse = require('../services/sse');
const { createSyncEvent, queuePaymentEmail, queueOrderStatusEmail, queueEmailNotification } = require('../services/syncService');
const pushNotificationService = require('../services/pushNotificationService');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const { verifyToken } = require('../middleware/auth');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const SETTINGS_PATH = path.join(__dirname, '..', 'config', 'app-settings.json');
const FRONT_LOG_PATH = path.join(__dirname, '..', 'logs', 'frontend-student.log');
const registrationConfigCache = (() => {
  if (!global.__registrationConfigCache) {
    global.__registrationConfigCache = { value: null, fetchedAt: 0, ttlMs: 15000, version: 0 };
  }
  return global.__registrationConfigCache;
})();
let lastRegistrationConfigFailureAt = 0;
const shouldNotifyRegistrationConfigFailure = () => Date.now() - lastRegistrationConfigFailureAt > 5 * 60 * 1000;
const normalizePaymentMethod = (method) => {
  if (!method) return null;
  const normalized = String(method).toLowerCase();
  return normalized === 'transfer' ? 'bank_transfer' : normalized;
};
const normalizePlanPaymentMethods = (value) => {
  const defaults = ['cash', 'bank_transfer', 'paystack'];
  let list = [];
  if (Array.isArray(value)) {
    list = value;
  } else if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) list = parsed;
    } catch (e) {
      list = [];
    }
  }
  if (!list.length) list = defaults;
  const normalized = list
    .map((method) => normalizePaymentMethod(method))
    .filter((method) => defaults.includes(method));
  return Array.from(new Set(normalized));
};
const normalizeNigerianPhone = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return { error: 'Phone number is required' };
  const digits = raw.replace(/[^0-9]/g, '');
  if (!digits) return { error: 'Phone number is required' };
  if (digits.startsWith('0')) {
    if (!/^0(70|80|81|90|91)\d{8}$/.test(digits)) {
      return { error: 'Invalid Nigerian phone number' };
    }
    return { normalized: `+234${digits.slice(1)}`, local: digits };
  }
  if (digits.startsWith('234')) {
    if (!/^234(70|80|81|90|91)\d{8}$/.test(digits)) {
      return { error: 'Invalid Nigerian phone number' };
    }
    return { normalized: `+${digits}`, local: `0${digits.slice(3)}` };
  }
  return { error: 'Invalid Nigerian phone number' };
};
const generateOtp = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');
const otpExpiresAt = () => new Date(Date.now() + 10 * 60 * 1000);
const generateCodeValue = () => String(crypto.randomInt(100000, 1000000));
const createUniqueCode = async (payload, options, maxAttempts = 8) => {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const code_value = generateCodeValue();
    try {
      return await Code.create({ ...payload, code_value }, options);
    } catch (e) {
      if (e?.name === 'SequelizeUniqueConstraintError') {
        lastError = e;
        continue;
      }
      throw e;
    }
  }
  const error = lastError || new Error('Unable to generate unique code');
  throw error;
};
const STAFF_ROLES = new Set(['admin', 'receptionist', 'washer', 'rider']);
const isStaffRole = (role) => STAFF_ROLES.has(role);
const buildStaffEmail = (title, message, meta = {}) => {
  const time = new Date().toISOString();
  const lines = [
    title,
    message,
    `Time: ${time}`
  ];
  if (meta.userName) lines.push(`User: ${meta.userName}`);
  if (meta.orderId) lines.push(`Order ID: ${meta.orderId}`);
  if (meta.paymentType) lines.push(`Payment Type: ${meta.paymentType}`);
  if (meta.status) lines.push(`Status: ${meta.status}`);
  if (meta.reference) lines.push(`Reference: ${meta.reference}`);
  if (meta.details) lines.push(`Details: ${meta.details}`);
  return lines.join('\n');
};
const notifyAdmins = async ({ title, message, subject, text, action, meta, actorUserId }) => {
  const admins = await User.findAll({ where: { role: 'admin' } });
  if (admins.length === 0) return;
  await Notification.bulkCreate(admins.map((admin) => ({
    user_id: admin.user_id,
    title,
    message,
    event_type: 'system',
    channel: 'app'
  })));
  const emailSubject = subject || title;
  const emailText = text || message;
  await Promise.all(admins.map((admin) => (
    queueEmailNotification({
      action,
      entityId: `admin:${action}:${admin.user_id}:${Date.now()}`,
      to: admin.email,
      subject: emailSubject,
      text: emailText,
      html: null,
      userId: admin.user_id,
      meta,
      source: 'student',
      actorUserId
    })
  )));
};
const notifyRoleUsers = async ({ role, title, message, eventType = 'system' }) => {
  if (!role) return [];
  const users = await User.findAll({ where: { role } });
  if (!users.length) return [];
  await Notification.bulkCreate(users.map((user) => ({
    user_id: user.user_id,
    title,
    message,
    event_type: eventType,
    channel: 'app'
  })));
  return users;
};
const emitPickupSync = (req, action, order, fields = {}) => {
  const io = req.app.get('io');
  if (!io || !order) return;
  const payload = {
    action,
    order,
    fields,
    source: 'student',
    actor_user_id: req.user?.user_id || null,
    timestamp: new Date().toISOString()
  };
  io.to('pickup_staff').emit('pickup_event', payload);
  io.to(`pickup_user_${order.user_id}`).emit('pickup_event', payload);
  io.to(`pickup_order_${order.order_id}`).emit('pickup_event', payload);
};
const ensureOrderCodes = async (order_id, user_id) => {
  try {
    const options = {};
    let pickup = await Code.findOne({ where: { order_id, type: 'pickup' }, ...options });
    if (!pickup) {
      pickup = await createUniqueCode({
        order_id,
        type: 'pickup',
        status: 'active',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }, options);
      if (user_id) {
        await AuditLog.create({
          actor_user_id: user_id,
          action: 'auto_generate_code',
          entity_type: 'code',
          entity_id: String(pickup.code_id),
          details: `Auto Pickup: ${pickup.code_value}`
        });
      }
    }
    let delivery = await Code.findOne({ where: { order_id, type: 'release' }, ...options });
    if (!delivery) {
      delivery = await createUniqueCode({
        order_id,
        type: 'release',
        status: 'active',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }, options);
      if (user_id) {
        await AuditLog.create({
          actor_user_id: user_id,
          action: 'auto_generate_code',
          entity_type: 'code',
          entity_id: String(delivery.code_id),
          details: `Auto Delivery: ${delivery.code_value}`
        });
      }
    }
    return { pickup, delivery };
  } catch (e) {
    console.error('Error generating codes:', { order_id, message: e.message });
    throw e;
  }
};
const shouldThrottle = (sentAt, cooldownSeconds = 60) => {
  if (!sentAt) return false;
  const sinceMs = Date.now() - new Date(sentAt).getTime();
  return sinceMs < cooldownSeconds * 1000;
};
const remainingCooldown = (sentAt, cooldownSeconds = 60) => {
  if (!sentAt) return 0;
  const sinceMs = Date.now() - new Date(sentAt).getTime();
  return Math.max(0, cooldownSeconds - Math.floor(sinceMs / 1000));
};
function readSettings() {
  try {
    const raw = fs.readFileSync(SETTINGS_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed.operations) {
      parsed.operations = { pickup_time_frame: null, extra_item_price: 500, processing_timeline_text: 'Laundry is ready within 24–48 hours after pickup.' };
      return parsed;
    }
    if (!parsed.operations.processing_timeline_text) {
      parsed.operations.processing_timeline_text = 'Laundry is ready within 24–48 hours after pickup.';
    }
    return parsed;
  } catch {
    return {
      branding: { app_name: '3R Laundry Services', logo_url: '', description: '' },
      theme: { primary: '#2563EB', accent: '#111827', dark_mode: false },
      payments: { paystack: { enabled: false, public_key: '' }, bank_accounts: [] },
      operations: { pickup_time_frame: null, extra_item_price: 500, processing_timeline_text: 'Laundry is ready within 24–48 hours after pickup.' },
      emergency: {
        enabled: false,
        available: true,
        pricing_mode: 'per_item',
        price_per_item: 400,
        base_fee: 0,
        delivery_window_text: 'Delivered within 2–8 hours (same day)',
        description: 'Same-day delivery within 2–8 hours'
      },
      integrations: {}
    };
  }
}
const { v4: uuidv4 } = require('uuid');

// Upload config
const uploadsDir = path.join(__dirname, '..', '..', 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const base = path.basename(file.originalname, ext).replace(/[^a-z0-9-_]/gi, '_');
    cb(null, `avatar-${Date.now()}-${base}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif'];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Invalid file type'));
  },
});

// Get Public Config (Pickup Time Frame)
router.get('/config', (req, res) => {
  try {
    const settings = readSettings();
    const accounts = Array.isArray(settings.payments?.bank_accounts) ? settings.payments.bank_accounts : [];
    const activeAccount = accounts.find(a => a && a.active) || accounts[0] || null;
    const emergencyDefaults = {
      enabled: false,
      available: true,
      pricing_mode: 'per_item',
      price_per_item: 400,
      base_fee: 0,
      delivery_window_text: 'Delivered within 2–8 hours (same day)',
      description: 'Same-day delivery within 2–8 hours',
      estimated_completion_text: '2–8 hours',
      estimated_completion_minutes: 360,
      instructions: '',
      restrictions: '',
      updated_at: null,
      version: 0
    };
    const emergency = { ...emergencyDefaults, ...(settings.emergency || {}) };
    res.json({
      pickup_window: settings.operations?.pickup_time_frame || null,
      processing_timeline_text: settings.operations?.processing_timeline_text || '',
      bank_accounts: accounts,
      active_bank_account: activeAccount,
      emergency,
      settings_version: settings.version || emergency.version || 0
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/registration-config', async (req, res) => {
  try {
    const now = Date.now();
    if (registrationConfigCache.value && now - registrationConfigCache.fetchedAt < registrationConfigCache.ttlMs) {
      res.set('Cache-Control', 'no-store');
      res.set('X-Config-Version', String(registrationConfigCache.version || 0));
      return res.json(registrationConfigCache.value);
    }
    const [fields, schools, fieldsUpdatedAt, schoolsUpdatedAt] = await Promise.all([
      RegistrationField.findAll({ where: { active: true }, order: [['order', 'ASC'], ['field_id', 'ASC']] }),
      School.findAll({ where: { active: true }, order: [['school_name', 'ASC'], ['school_id', 'ASC']] }),
      RegistrationField.max('updated_at'),
      School.max('updated_at')
    ]);
    const version = Math.max(
      new Date(fieldsUpdatedAt || 0).getTime(),
      new Date(schoolsUpdatedAt || 0).getTime()
    );
    const payload = { fields, schools, version };
    registrationConfigCache.value = payload;
    registrationConfigCache.fetchedAt = now;
    registrationConfigCache.version = version;
    res.set('Cache-Control', 'no-store');
    res.set('X-Config-Version', String(version));
    res.json(payload);
  } catch (e) {
    const now = Date.now();
    if (shouldNotifyRegistrationConfigFailure()) {
      lastRegistrationConfigFailureAt = now;
      try {
        const admins = await User.findAll({ where: { role: 'admin' } });
        if (admins.length > 0) {
          await Notification.bulkCreate(admins.map((admin) => ({
            user_id: admin.user_id,
            title: 'Registration Sync Error',
            message: 'Failed to load registration configuration for signup',
            type: 'system',
            event_type: 'sync',
            channel: 'app'
          })));
        }
        await AuditLog.create({
          actor_user_id: null,
          action: 'registration_config_failed',
          entity_type: 'registration',
          entity_id: 'registration-config',
          details: e.message
        });
      } catch {}
    }
    console.error('Registration config error:', e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/front-logs', express.json(), async (req, res) => {
  try {
    const dir = path.dirname(FRONT_LOG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const line = `[${new Date().toISOString()}] ${req.ip} ${req.body?.source || 'student-web'} ${req.body?.message || ''}\n${req.body?.stack || ''}\n${req.body?.href || ''}\n${req.body?.context ? JSON.stringify(req.body.context) : ''}\n\n`;
    fs.appendFileSync(FRONT_LOG_PATH, line, 'utf-8');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'log_failed' });
  }
});

router.get('/bank-accounts', (req, res) => {
  try {
    const settings = readSettings();
    const accounts = Array.isArray(settings.payments?.bank_accounts) ? settings.payments.bank_accounts : [];
    const activeAccount = accounts.find(a => a && a.active) || accounts[0] || null;
    res.json({ accounts, active: activeAccount });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// SSE Endpoint for Students
router.get('/events', async (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(401).json({ error: 'Token required' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    const user = await User.findByPk(decoded.user_id);
    if (!user) {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    // Connected
    sse.addClient(res, user.user_id);
  } catch (e) {
    console.error('SSE Error:', e);
    res.status(401).json({ error: 'Invalid token', details: e.message });
  }
});

router.use(verifyToken);
router.use((req, res, next) => {
  if (req.user?.role === 'student' && !req.user?.email_verified) {
    return res.status(403).json({ error: 'Email not verified', code: 'email_unverified' });
  }
  return next();
});

router.post('/phone-verification/request', async (req, res) => {
  try {
    const bodyUserId = req.body?.user_id;
    if (bodyUserId && Number(bodyUserId) !== Number(req.user?.user_id)) {
      return res.status(403).json({ error: 'Access denied', code: 'forbidden' });
    }
    const user = await User.findByPk(req.user?.user_id);
    if (!user) return res.status(404).json({ error: 'User not found', code: 'user_not_found' });
    if (!user.phone_number) return res.status(400).json({ error: 'Phone number is required', code: 'missing_phone' });
    if (user.phone_verified) return res.status(400).json({ error: 'Phone already verified', code: 'already_verified' });
    if (shouldThrottle(user.phone_verification_sent_at)) {
      return res.status(429).json({ error: 'Please wait before resending', code: 'cooldown', cooldown_seconds: remainingCooldown(user.phone_verification_sent_at) });
    }
    const otp = generateOtp();
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = otpExpiresAt();
    await user.update({
      phone_verification_otp_hash: otpHash,
      phone_verification_expires_at: expiresAt,
      phone_verification_sent_at: new Date()
    });
    await IntegrationService.sendWhatsApp(
      user.phone_number,
      `Your phone verification code is ${otp}. It expires in 10 minutes.`
    );
    await AuditLog.create({
      actor_user_id: user.user_id,
      action: 'phone_verification_requested',
      entity_type: 'user',
      entity_id: String(user.user_id),
      details: 'Phone verification requested by user'
    });
    await createSyncEvent({
      actor_user_id: user.user_id,
      target_user_id: user.user_id,
      source: 'student',
      entity_type: 'profile',
      entity_id: user.user_id,
      action: 'phone_verification_requested',
      payload: { phone_verified: false },
      critical: true
    });
    res.json({ message: 'Verification code sent', cooldown_seconds: 60 });
  } catch (error) {
    res.status(500).json({ error: 'Server error', code: 'server_error' });
  }
});

router.post('/phone-verification/verify', async (req, res) => {
  try {
    const bodyUserId = req.body?.user_id;
    if (bodyUserId && Number(bodyUserId) !== Number(req.user?.user_id)) {
      return res.status(403).json({ error: 'Access denied', code: 'forbidden' });
    }
    const otp = String(req.body?.otp || '').trim();
    if (!otp) return res.status(400).json({ error: 'OTP is required', code: 'missing_otp' });
    const user = await User.findByPk(req.user?.user_id);
    if (!user) return res.status(404).json({ error: 'User not found', code: 'user_not_found' });
    if (user.phone_verified) return res.json({ message: 'Phone verified', user });
    if (!user.phone_verification_otp_hash || !user.phone_verification_expires_at) {
      return res.status(400).json({ error: 'No verification code found', code: 'missing_otp' });
    }
    if (new Date(user.phone_verification_expires_at) < new Date()) {
      return res.status(400).json({ error: 'Verification code expired', code: 'otp_expired' });
    }
    const validOtp = await bcrypt.compare(otp, user.phone_verification_otp_hash);
    if (!validOtp) return res.status(400).json({ error: 'Invalid verification code', code: 'otp_invalid' });
    await user.update({
      phone_verified: true,
      phone_verified_at: new Date(),
      phone_verification_otp_hash: null,
      phone_verification_expires_at: null
    });
    await AuditLog.create({
      actor_user_id: user.user_id,
      action: 'phone_verified',
      entity_type: 'user',
      entity_id: String(user.user_id),
      details: 'Phone verified by user'
    });
    await createSyncEvent({
      actor_user_id: user.user_id,
      target_user_id: user.user_id,
      source: 'student',
      entity_type: 'profile',
      entity_id: user.user_id,
      action: 'phone_verified',
      payload: { phone_verified: true },
      critical: true
    });
    sse.broadcast('user_updated', user);
    res.json({ message: 'Phone verified', user });
  } catch (error) {
    res.status(500).json({ error: 'Server error', code: 'server_error' });
  }
});

router.post('/emergency-contact', async (req, res) => {
  try {
    const { name, phone_number, relationship, message } = req.body || {};
    const trimmedName = String(name || '').trim();
    const trimmedRelationship = String(relationship || '').trim();
    const trimmedMessage = String(message || '').trim();
    const phoneResult = normalizeNigerianPhone(phone_number);
    if (!trimmedName) return res.status(400).json({ error: 'Name is required', code: 'missing_name' });
    if (phoneResult.error) return res.status(400).json({ error: phoneResult.error, code: 'invalid_phone' });
    if (!trimmedRelationship) return res.status(400).json({ error: 'Relationship is required', code: 'missing_relationship' });
    if (!trimmedMessage) return res.status(400).json({ error: 'Message is required', code: 'missing_message' });
    const userId = req.user?.user_id || null;
    const contactId = `emergency_contact_${Date.now()}_${uuidv4()}`;
    await AuditLog.create({
      actor_user_id: userId,
      action: 'emergency_contact_submitted',
      entity_type: 'emergency_contact',
      entity_id: contactId,
      details: `Emergency contact submitted: ${trimmedName} (${phoneResult.normalized}) - ${trimmedRelationship}`
    });
    const admins = await User.findAll({ where: { role: 'admin' } });
    if (admins.length) {
      await Notification.bulkCreate(
        admins.map((admin) => ({
          user_id: admin.user_id,
          title: 'Emergency Contact Request',
          message: `${trimmedName} (${phoneResult.normalized}) • ${trimmedRelationship}`,
          channel: 'app'
        }))
      );
    }
    res.status(201).json({
      id: contactId,
      name: trimmedName,
      phone_number: phoneResult.normalized,
      relationship: trimmedRelationship,
      message: trimmedMessage
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Server error', code: 'server_error' });
  }
});

// Get all plans
router.get('/plans', async (req, res) => {
  try {
    const plans = await Plan.findAll();
    const result = plans.map((plan) => {
      const json = plan.toJSON();
      return {
        ...json,
        payment_methods: normalizePlanPaymentMethods(json.payment_methods),
      };
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get My Subscription
router.get('/subscription', async (req, res) => {
  try {
    const { user_id } = req.query;
    if (!user_id) return res.status(400).json({ error: 'User ID required' });
    
    const sub = await Subscription.findOne({
      where: { user_id, status: 'active' },
      include: [Plan]
    });
    
    if (!sub) return res.json(null);
    const json = sub.toJSON();
    if (json.Plan) {
      json.Plan.payment_methods = normalizePlanPaymentMethods(json.Plan.payment_methods);
    }
    res.json(json);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Initialize Payment (Paystack)
router.post('/payments/initialize', async (req, res) => {
  try {
    const { email, amount, callback_url, metadata } = req.body;
    
    if (!email || !amount) {
      return res.status(400).json({ error: 'Email and amount are required' });
    }

    const result = await IntegrationService.initializePaystackTransaction(
      email, 
      amount, 
      callback_url, 
      metadata
    );

    try {
      let user = req.user;
      if (!user?.email && req.user?.user_id) {
        user = await User.findByPk(req.user.user_id);
      }
      await queuePaymentEmail({
        user,
        planName: metadata?.plan_name || metadata?.plan || metadata?.plan_id,
        amount,
        status: 'initiated',
        event: 'Payment initiated',
        reference: result?.reference
      });
    } catch (e) {
      console.error('Payment email queue failed:', e.message);
    }
    
    res.json(result);
  } catch (error) {
    console.error('Payment initialization error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/payments/emergency/initiate', async (req, res) => {
  try {
    const { user_id, order_id, payment_method } = req.body;
    const authUserId = req.user?.user_id;
    if (!authUserId) return res.status(401).json({ error: 'Unauthorized' });
    if (user_id && Number(user_id) !== Number(authUserId)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    if (!order_id) return res.status(400).json({ error: 'Order ID required' });
    const order = await Order.findByPk(order_id);
    if (!order || !order.is_emergency) return res.status(404).json({ error: 'Emergency order not found' });
    if (Number(order.user_id) !== Number(authUserId)) return res.status(403).json({ error: 'Unauthorized' });
    const gateway = normalizePaymentMethod(payment_method);
    if (!gateway || !['cash'].includes(gateway)) {
      return res.status(400).json({ error: 'Invalid payment method' });
    }
    const candidates = await Payment.findAll({
      where: {
        user_id: authUserId,
        payment_type: 'emergency',
        gateway,
        status: { [Op.in]: ['pending', 'awaiting_verification', 'paid'] }
      },
      order: [['created_at', 'DESC']]
    });
    const existing = candidates.find((payment) => {
      const relatedId = payment.metadata?.related_order_id || payment.metadata?.order_id;
      return String(relatedId) === String(order_id);
    });
    if (existing) return res.json(existing);
    const amount = Number(order.emergency_total_amount || 0);
    if (Number.isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Invalid emergency amount' });
    }
    const payment = await Payment.create({
      user_id: authUserId,
      amount,
      payment_type: 'emergency',
      reference: `EMG-${order.order_id}-${Date.now()}`,
      status: 'pending',
      gateway,
      metadata: {
        payment_reason: 'Emergency Laundry',
        order_type: 'emergency',
        payment_context: 'emergency_laundry',
        related_order_id: order.order_id,
        clothes_count: order.clothes_count,
        emergency_clothes_count: order.clothes_count,
        emergency_total_amount: amount,
        pickup_address: order.pickup_address,
        delivery_address: order.delivery_address
      }
    });
    const admins = await User.findAll({ where: { role: 'admin' } });
    if (admins.length) {
      const notifications = admins.map((admin) => ({
        user_id: admin.user_id,
        title: 'New Emergency Laundry Payment Initiated',
        message: 'New Emergency Laundry Payment Initiated',
        channel: 'app'
      }));
      await Notification.bulkCreate(notifications);
    }
    sse.broadcast('payment_updated', payment);
    res.status(201).json(payment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/payments/emergency/confirm', async (req, res) => {
  try {
    const { user_id, order_id, payment_reference } = req.body;
    const authUserId = req.user?.user_id;
    if (!authUserId) return res.status(401).json({ error: 'Unauthorized' });
    if (user_id && Number(user_id) !== Number(authUserId)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    if (!order_id) return res.status(400).json({ error: 'Order ID required' });
    if (!payment_reference) return res.status(400).json({ error: 'Payment reference required' });
    const order = await Order.findByPk(order_id);
    if (!order || !order.is_emergency) return res.status(404).json({ error: 'Emergency order not found' });
    if (Number(order.user_id) !== Number(authUserId)) return res.status(403).json({ error: 'Unauthorized' });
    const existing = await Payment.findOne({
      where: { user_id: authUserId, payment_type: 'emergency', reference: payment_reference }
    });
    if (existing) return res.json(existing);
    const verified = await IntegrationService.verifyPaystackTransaction(payment_reference);
    if (!verified || verified.status !== 'success') {
      return res.status(400).json({ error: 'Payment verification failed' });
    }
    const amount = Number(order.emergency_total_amount || 0);
    if (Number.isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Invalid emergency amount' });
    }
    const payment = await Payment.create({
      user_id: authUserId,
      amount,
      payment_type: 'emergency',
      reference: payment_reference,
      status: 'paid',
      gateway: 'paystack',
      metadata: {
        payment_reason: 'Emergency Laundry',
        order_type: 'emergency',
        payment_context: 'emergency_laundry',
        related_order_id: order.order_id,
        clothes_count: order.clothes_count,
        emergency_clothes_count: order.clothes_count,
        emergency_total_amount: amount,
        pickup_address: order.pickup_address,
        delivery_address: order.delivery_address
      }
    });
    if (order.status === 'pending') {
      await order.update({ status: 'accepted' });
      await createSyncEvent({
        actor_user_id: authUserId,
        target_user_id: order.user_id,
        source: 'student',
        entity_type: 'order',
        entity_id: order.order_id,
        action: 'update',
        payload: { status: 'accepted' },
        critical: true
      });
      sse.broadcast('order_updated', order);
    }
    try {
      await ensureOrderCodes(order.order_id, authUserId);
    } catch (e) {
      await AuditLog.create({
        actor_user_id: authUserId,
        action: 'code_generation_failed',
        entity_type: 'order',
        entity_id: String(order.order_id),
        details: `Auto code generation failed: ${e.message}`
      });
      return res.status(500).json({ error: 'Failed to generate pickup and release codes' });
    }
    await Notification.create({
      user_id: order.user_id,
      title: 'Emergency Laundry Payment Successful',
      message: 'Your emergency laundry payment was successful.',
      channel: 'app'
    });
    const admins = await User.findAll({ where: { role: 'admin' } });
    if (admins.length) {
      const notifications = admins.map((admin) => ({
        user_id: admin.user_id,
        title: 'Emergency Laundry Payment Received',
        message: 'Emergency Laundry Payment Received',
        channel: 'app'
      }));
      await Notification.bulkCreate(notifications);
    }
    sse.broadcast('payment_updated', payment);
    res.status(201).json(payment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Subscribe to a plan
router.post('/subscribe', async (req, res) => {
  const t = await require('../config/database').transaction();
  try {
    const { user_id, plan_id, payment_method, payment_reference } = req.body;
    const plan = await Plan.findByPk(plan_id, { transaction: t });
    if (!plan) {
      await t.rollback();
      return res.status(404).json({ error: 'Plan not found' });
    }
    const allowedMethods = normalizePlanPaymentMethods(plan.payment_methods);
    const selectedMethod = normalizePaymentMethod(payment_method);
    if (!selectedMethod || !allowedMethods.includes(selectedMethod)) {
      await t.rollback();
      return res.status(400).json({ error: 'Selected payment method is not available for this plan' });
    }
    
    // Deactivate old subscription
    await Subscription.update({ status: 'cancelled' }, { where: { user_id, status: 'active' }, transaction: t });
    
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(startDate.getDate() + plan.duration_days);
    
    // Determine statuses based on payment method
    let subStatus = 'active';
    let payStatus = 'paid';
    
    if (selectedMethod === 'cash' || selectedMethod === 'bank_transfer') {
        subStatus = 'pending';
        payStatus = 'pending';
    } else if (selectedMethod === 'paystack') {
        // Double check payment verification if needed, or assume verified by frontend/middleware
        // Ideally we should verify here if reference is provided
        if (payment_reference) {
            const verified = await IntegrationService.verifyPaystackTransaction(payment_reference);
            if (!verified || verified.status !== 'success') {
                await t.rollback();
                return res.status(400).json({ error: 'Payment verification failed' });
            }
        }
    }

    const sub = await Subscription.create({
      user_id,
      plan_id,
      start_date: startDate,
      end_date: endDate,
      remaining_pickups: plan.max_pickups,
      remaining_clothes: plan.clothes_limit,
      used_clothes: 0,
      status: subStatus
    }, { transaction: t });
    
    // Create Payment Record
    let gateway = selectedMethod || 'manual';
    
    const payment = await Payment.create({
        user_id,
        amount: plan.price,
        payment_type: 'subscription',
        reference: payment_reference || `SUB-${sub.subscription_id}-${Date.now()}`,
        status: payStatus,
        gateway: gateway,
        metadata: {
            user_id,
            plan_id,
            plan_name: plan.name,
            subscription_id: sub.subscription_id
        }
    }, { transaction: t });
    
    await t.commit();
    
    // Broadcast events
    sse.broadcast('subscription_created', sub);
    sse.broadcast('payment_created', { 
        user_id, 
        amount: plan.price, 
        reference: payment_reference || `SUB-${sub.subscription_id}-${Date.now()}`,
        status: payStatus 
    });

    try {
      let user = req.user;
      if (!user?.email && user_id) {
        user = await User.findByPk(user_id);
      }
      await queuePaymentEmail({
        user,
        payment,
        planName: plan.name,
        amount: plan.price,
        status: payStatus,
        event: 'Plan selected'
      });
      if (payStatus === 'paid') {
        await queuePaymentEmail({
          user,
          payment,
          planName: plan.name,
          amount: plan.price,
          status: 'paid',
          event: 'Payment successful'
        });
      } else {
        await queuePaymentEmail({
          user,
          payment,
          planName: plan.name,
          amount: plan.price,
          status: payStatus,
          event: 'Payment initiated'
        });
      }
    } catch (e) {
      console.error('Payment email queue failed:', e.message);
    }

    res.status(201).json(sub);
  } catch (error) {
    await t.rollback();
    res.status(500).json({ error: error.message });
  }
});

router.post('/payments/bank-transfer/submit', async (req, res) => {
  try {
    const { user_id, payment_id, subscription_id, order_id, payment_type } = req.body;
    if (!user_id) return res.status(400).json({ error: 'User ID required' });
    const normalizedType = payment_type === 'emergency' ? 'emergency' : payment_type === 'extra_clothes' ? 'extra_clothes' : 'subscription';
    const where = {
      user_id,
      gateway: 'bank_transfer',
      status: { [Op.in]: ['pending', 'awaiting_verification'] },
      payment_type: normalizedType
    };
    if (payment_id) where.payment_id = payment_id;
    let payment = await Payment.findOne({ where, order: [['created_at', 'DESC']] });
    if (normalizedType === 'subscription' && subscription_id && payment && payment.metadata?.subscription_id !== subscription_id) {
      const candidates = await Payment.findAll({ where, order: [['created_at', 'DESC']] });
      payment = candidates.find(p => p.metadata?.subscription_id === subscription_id) || null;
    }
    if (normalizedType === 'emergency' && order_id && payment) {
      const relatedId = payment.metadata?.related_order_id || payment.metadata?.order_id;
      if (String(relatedId) !== String(order_id)) {
        const candidates = await Payment.findAll({ where, order: [['created_at', 'DESC']] });
        payment = candidates.find((p) => {
          const candidateId = p.metadata?.related_order_id || p.metadata?.order_id;
          return String(candidateId) === String(order_id);
        }) || null;
      }
    }
    if (!payment) return res.status(404).json({ error: 'Pending bank transfer payment not found' });
    const nextMeta = { ...(payment.metadata || {}), submitted_at: new Date().toISOString() };
    if (order_id && !nextMeta.related_order_id) nextMeta.related_order_id = order_id;
    await payment.update({ status: 'awaiting_verification', metadata: nextMeta });
    await createSyncEvent({
      actor_user_id: user_id,
      target_user_id: user_id,
      source: 'student',
      entity_type: 'payment',
      entity_id: payment.payment_id,
      action: 'submit_bank_transfer',
      payload: { status: 'awaiting_verification' },
      critical: true
    });
    try {
      let user = req.user;
      if (!user?.email && user_id) {
        user = await User.findByPk(user_id);
      }
      await queuePaymentEmail({
        user,
        payment,
        planName: payment.metadata?.plan_name,
        amount: payment.amount,
        status: payment.status,
        event: 'Payment initiated',
        reference: payment.reference,
        source: 'student',
        actorUserId: req.user?.user_id
      });
    } catch (e) {
      console.error('Payment email queue failed:', e.message);
    }
    const admins = await User.findAll({ where: { role: 'admin' } });
    if (admins.length) {
      const message = normalizedType === 'emergency'
        ? 'New Emergency Laundry Bank Transfer Submitted'
        : 'New Bank Transfer Payment Submitted';
      const notifications = admins.map((admin) => ({
        user_id: admin.user_id,
        title: message,
        message,
        channel: 'app'
      }));
      await Notification.bulkCreate(notifications);
    }
    sse.broadcast('payment_updated', payment);
    res.json(payment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/emergency', async (req, res) => {
  const t = await require('../config/database').transaction();
  try {
    const { user_id, clothes_count, pickup_address, delivery_address, description } = req.body;
    const authUserId = req.user?.user_id;
    if (!authUserId) {
      await t.rollback();
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (user_id && Number(user_id) !== Number(authUserId)) {
      await t.rollback();
      return res.status(403).json({ error: 'Unauthorized' });
    }
    const count = parseInt(clothes_count || 0, 10);
    if (Number.isNaN(count) || count <= 0) {
      await t.rollback();
      return res.status(400).json({ error: 'Invalid clothes count' });
    }
    const cleanedPickup = String(pickup_address || '').trim();
    if (!cleanedPickup) {
      await t.rollback();
      return res.status(400).json({ error: 'Pickup address is required' });
    }
    const user = await User.findByPk(authUserId, { transaction: t });
    if (!user) {
      await t.rollback();
      return res.status(404).json({ error: 'User not found' });
    }
    const settings = readSettings();
    const emergency = settings.emergency || {};
    if (!emergency.enabled) {
      await t.rollback();
      return res.status(403).json({ error: 'Emergency laundry is disabled' });
    }
    if (emergency.available === false) {
      await t.rollback();
      return res.status(403).json({ error: 'Emergency laundry is currently unavailable' });
    }
    const pricingMode = emergency.pricing_mode || 'per_item';
    const pricePerItem = Number(emergency.price_per_item || 0);
    const baseFee = Number(emergency.base_fee || 0);
    let total = 0;
    if (pricingMode === 'flat') {
      total = baseFee;
    } else if (pricingMode === 'hybrid') {
      total = baseFee + count * pricePerItem;
    } else {
      total = count * pricePerItem;
    }
    const now = new Date();
    const pickupDate = now.toISOString().split('T')[0];
    const pickupTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const order = await Order.create({
      user_id: authUserId,
      subscription_id: null,
      pickup_date: pickupDate,
      pickup_time: pickupTime,
      clothes_count: count,
      extra_clothes_count: 0,
      extra_amount: 0,
      notes: description || null,
      pickup_address: cleanedPickup,
      delivery_address: String(delivery_address || '').trim() || cleanedPickup,
      status: 'pending',
      is_emergency: true,
      emergency_total_amount: total
    }, { transaction: t });
    await createSyncEvent({
      actor_user_id: authUserId,
      target_user_id: authUserId,
      source: 'student',
      entity_type: 'order',
      entity_id: order.order_id,
      action: 'created',
      payload: {
        status: order.status,
        pickup_date: order.pickup_date,
        pickup_time: order.pickup_time,
        notes: order.notes,
        version: order.version
      },
      critical: true,
      transaction: t
    });
    await t.commit();
    
    // Notify User
    const emergencyNotification = await Notification.create({
      user_id: authUserId,
      title: 'Emergency Order Created',
      message: `Your emergency order #${order.order_id} has been created.`,
      event_type: 'order_update',
      channel: 'app'
    });
    
    sse.broadcast('order_created', order);
    sse.broadcast('notification', emergencyNotification, authUserId);
    try { await IntegrationService.sendPushNotification(authUserId, emergencyNotification.title, emergencyNotification.message); } catch (e) { console.warn('Push failed:', e.message); }
    emitPickupSync(req, 'created', order, { status: order.status });
    const baseMeta = {
      userName: user ? (user.full_name || user.email || `User ${user.user_id}`) : `User ${authUserId}`,
      orderId: order.order_id,
      status: order.status
    };
    const receptionists = await notifyRoleUsers({
      role: 'receptionist',
      title: 'New order',
      message: `New order ${order.order_id} created.`,
      eventType: 'order_update'
    });
    await Promise.all(receptionists.map((receptionist) => {
      const text = buildStaffEmail('New order', `New order ${order.order_id} created.`, baseMeta);
      return queueEmailNotification({
        action: 'order_created_receptionist',
        entityId: `order:created:receptionist:${receptionist.user_id}:${order.order_id}`,
        to: receptionist.email,
        subject: 'New order',
        text,
        html: null,
        userId: receptionist.user_id,
        meta: baseMeta,
        source: 'student',
        actorUserId: authUserId
      });
    }));
    await notifyAdmins({
      title: 'New order',
      message: `New order ${order.order_id} created.`,
      subject: 'New order',
      text: buildStaffEmail('New order', `New order ${order.order_id} created.`, baseMeta),
      action: 'order_created',
      meta: baseMeta,
      actorUserId: authUserId
    });
    try {
      await queueOrderStatusEmail({
        user,
        order,
        status: order.status,
        source: 'student',
        actorUserId: req.user?.user_id
      });
    } catch (e) {
      console.error('Order email queue failed:', e.message);
    }
    res.status(201).json({
      order,
      pricing: {
        mode: pricingMode,
        price_per_item: pricePerItem,
        base_fee: baseFee,
        total
      }
    });
  } catch (error) {
    await t.rollback();
    console.error('Emergency order error', { user_id: req.body?.user_id, message: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Book laundry
router.post('/book', async (req, res) => {
  const t = await require('../config/database').transaction();
  try {
    const { user_id, pickup_date, pickup_time, clothes_count, notes, payment_method, payment_reference } = req.body;
    console.log('Student book request', {
      user_id,
      pickup_date,
      pickup_time,
      clothes_count,
      payment_method
    });
    
    // Validate against Global Pickup Time Frame
    const settings = readSettings();
    const timeframe = settings.operations?.pickup_time_frame;
    
    if (timeframe) {
      const pDate = new Date(pickup_date);
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayName = days[pDate.getDay()];
      const rawDays = Array.isArray(timeframe.pickup_days)
        ? timeframe.pickup_days
        : (Array.isArray(timeframe.days) ? timeframe.days : (timeframe.day ? [timeframe.day] : []));
      const cleanedDays = rawDays.filter(day => days.includes(day));
      const uniqueDays = Array.from(new Set(cleanedDays));
      const allowedDays = uniqueDays.length ? uniqueDays : (timeframe.day ? [timeframe.day] : []);
      
      if (allowedDays.length && !allowedDays.includes(dayName)) {
        await t.rollback();
        return res.status(400).json({ error: `Pickup only available on ${allowedDays.join(', ')}` });
      }
      
      // 2. Validate Time Block
      let isValidTime = false;
      if (timeframe.blocks) {
         Object.values(timeframe.blocks).forEach(block => {
             const range = `${block.start} - ${block.end}`;
             if (pickup_time === range) isValidTime = true;
         });
      }
      
      if (!isValidTime) {
        await t.rollback();
        return res.status(400).json({ error: 'Selected time is outside available pickup windows' });
      }
    }

    // 1. Check active subscription
    const sub = await Subscription.findOne({
      where: { user_id, status: 'active' },
      include: [Plan],
      lock: true,
      transaction: t
    });
    
    if (!sub) {
      await t.rollback();
      return res.status(403).json({ error: 'No active subscription found' });
    }

    const user = await User.findByPk(user_id, { transaction: t });

    if (sub.remaining_pickups <= 0) {
      await t.rollback();
      return res.status(403).json({ error: 'No pickups remaining in current subscription' });
    }
    
    // 2. Calculate Clothes Split
    const requestedCount = parseInt(clothes_count || 0);
    if (Number.isNaN(requestedCount) || requestedCount <= 0) {
      await t.rollback();
      return res.status(400).json({ error: 'Invalid clothes count' });
    }

    const pickupLimit = sub.Plan?.max_pickups ?? 0;
    const clothLimit = sub.Plan?.clothes_limit ?? 0;
    const planType = sub.Plan?.type;
    const remainingClothes = sub.remaining_clothes;
    const pickupsUsed = pickupLimit > 0 ? pickupLimit - sub.remaining_pickups : 0;
    const isWeeklyPickupLimitOne = pickupLimit === 1;
    const isMonthlyOrSemester = planType === 'monthly' || planType === 'semester';
    const shouldLockToClothLimit = isWeeklyPickupLimitOne;
    const shouldLockToRemaining = isMonthlyOrSemester && sub.remaining_pickups === 1;
    const rawMin = shouldLockToClothLimit ? clothLimit : (shouldLockToRemaining ? remainingClothes : 1);
    const requiredMin = Math.max(rawMin || 1, 1);

    if (pickupLimit > 0 && pickupsUsed >= pickupLimit) {
      await t.rollback();
      return res.status(403).json({ error: 'Pickup limit reached' });
    }
    if (requestedCount < requiredMin) {
      await t.rollback();
      return res.status(400).json({ error: `Minimum clothes count is ${requiredMin}` });
    }
    
    let planUsage = 0;
    let extraClothes = 0;

    const baseRemaining = shouldLockToClothLimit ? clothLimit : remainingClothes;
    const allowedRemaining = Math.max(baseRemaining || 0, 0);
    if (requestedCount <= allowedRemaining) {
      planUsage = requestedCount;
      extraClothes = 0;
    } else {
      planUsage = allowedRemaining;
      extraClothes = requestedCount - allowedRemaining;
    }
    
    const pricePerItem = settings.emergency?.price_per_item || 400;
    const extraAmount = extraClothes * pricePerItem;
    
    // 3. Payment Validation for Extra Clothes
    if (extraClothes > 0) {
        if (!payment_method) {
            await t.rollback();
            return res.status(400).json({ error: 'Payment method required for extra clothes' });
        }
        
        // If Paystack, verify reference
        if (payment_method === 'paystack') {
            if (!payment_reference) {
                await t.rollback();
                return res.status(400).json({ error: 'Payment reference required for Paystack' });
            }
            
            try {
                const verified = await IntegrationService.verifyPaystackTransaction(payment_reference);
                if (!verified || verified.status !== 'success') {
                    await t.rollback();
                    return res.status(400).json({ error: 'Payment verification failed' });
                }
                
                // Optional: Verify amount (verified.amount is in kobo)
                const expectedAmountKobo = extraAmount * 100;
                if (verified.amount < expectedAmountKobo) {
                     await t.rollback();
                     return res.status(400).json({ error: 'Payment amount mismatch' });
                }
            } catch (e) {
                await t.rollback();
                return res.status(400).json({ error: 'Payment verification error: ' + e.message });
            }
        }
    }

    // 4. Check for existing pending order
    const pendingOrder = await Order.findOne({
      where: { 
        user_id, 
        status: { [require('sequelize').Op.in]: ['pending', 'accepted', 'picked_up', 'processing', 'ready'] } 
      },
      transaction: t
    });
    
    if (pendingOrder) {
      await t.rollback();
      return res.status(400).json({ error: 'You have an active order in progress' });
    }
    
    const cleanedHostelAddress = String(user?.hostel_address || '').trim() || null;

    // 5. Create Order
    console.log('Creating order...', { user_id, status: 'pending', payment_method });
    const order = await Order.create({
      user_id,
      subscription_id: sub.subscription_id,
      pickup_date,
      pickup_time,
      clothes_count: requestedCount,
      extra_clothes_count: extraClothes,
      extra_amount: extraAmount,
      notes,
      pickup_address: cleanedHostelAddress,
      delivery_address: cleanedHostelAddress,
      status: 'pending' // If cash/transfer, maybe manual confirmation needed? For now, standard flow.
    }, { transaction: t });
    console.log('Order created successfully', { order_id: order.order_id, user_id });
    
    // 6. Update Subscription Usage
    sub.remaining_pickups -= 1;
    sub.remaining_clothes -= planUsage;
    sub.used_clothes += planUsage; // Only track what was covered by plan? Or total? Requirement: "Deduct used clothes from remaining_clothes". 
    // Usually used_clothes tracks total plan usage.
    await sub.save({ transaction: t });
    
    let extraPaymentReference = null;
    // 7. Record Payment if applicable
    if (extraAmount > 0) {
        const Payment = require('../models/Payment');
        // Map frontend payment method to backend enum
        let gateway = payment_method;
        if (gateway === 'transfer') gateway = 'bank_transfer';
        extraPaymentReference = payment_reference || `EXT-${order.order_id}-${Date.now()}`;

        await Payment.create({
            user_id,
            amount: extraAmount,
            payment_type: 'extra_clothes',
            reference: extraPaymentReference,
            status: payment_method === 'paystack' ? 'paid' : 'pending',
            gateway: gateway,
            metadata: {
                payment_reason: 'Extra clothes',
                related_order_id: order.order_id,
                user_id: user_id,
                user_name: user ? user.full_name : 'Unknown',
                subscription_plan_name: sub.Plan.name,
                plan_clothes_limit: sub.Plan.clothes_limit,
                remaining_clothes_before_order: remainingClothes,
                ordered_clothes: requestedCount,
                extra_clothes_count: extraClothes,
                price_per_cloth: pricePerItem,
                extra_clothes_total_amount: extraAmount
            }
        }, { transaction: t });
    }
    await createSyncEvent({
      actor_user_id: user_id,
      target_user_id: user_id,
      source: 'student',
      entity_type: 'order',
      entity_id: order.order_id,
      action: 'created',
      payload: {
        status: order.status,
        pickup_date: order.pickup_date,
        pickup_time: order.pickup_time,
        notes: order.notes,
        version: order.version
      },
      critical: true,
      transaction: t
    });
    
    await t.commit();
    console.log('Student order committed', { order_id: order.order_id, user_id });

    // NEW PUSH NOTIFICATION TRIGGER
    pushNotificationService.sendPushNotification(
      user_id,
      'Laundry Pickup Scheduled',
      'Your laundry pickup request has been successfully created.',
      { type: 'order_created', orderId: order.order_id }
    ).catch(err => console.error('Push error:', err));

    // Create User Notification
    const userNotification = await Notification.create({
      user_id: user_id,
      title: 'Order Placed Successfully',
      message: `Your order #${order.order_id} has been placed successfully.`,
      event_type: 'order_update',
      channel: 'app'
    });

    sse.broadcast('order_created', order);
    sse.broadcast('notification', userNotification, user_id);
    try { await IntegrationService.sendPushNotification(user_id, userNotification.title, userNotification.message); } catch (e) { console.warn('Push failed:', e.message); }
    emitPickupSync(req, 'created', order, { status: order.status });
    if (extraAmount > 0) {
        // Find the payment we just created? Or just broadcast a generic 'payment_created' event
        // The frontend will likely just refresh the payments list
        sse.broadcast('payment_created', { user_id, amount: extraAmount, reference: extraPaymentReference || payment_reference || `EXT-${order.order_id}` });
    }
    const baseMeta = {
      userName: user ? (user.full_name || user.email || `User ${user.user_id}`) : `User ${user_id}`,
      orderId: order.order_id,
      status: order.status
    };
    const receptionists = await notifyRoleUsers({
      role: 'receptionist',
      title: 'New order',
      message: `New order ${order.order_id} created.`,
      eventType: 'order_update'
    });
    await Promise.all(receptionists.map((receptionist) => {
      const text = buildStaffEmail('New order', `New order ${order.order_id} created.`, baseMeta);
      return queueEmailNotification({
        action: 'order_created_receptionist',
        entityId: `order:created:receptionist:${receptionist.user_id}:${order.order_id}`,
        to: receptionist.email,
        subject: 'New order',
        text,
        html: null,
        userId: receptionist.user_id,
        meta: baseMeta,
        source: 'student',
        actorUserId: req.user?.user_id
      });
    }));
    await notifyAdmins({
      title: 'New order',
      message: `New order ${order.order_id} created.`,
      subject: 'New order',
      text: buildStaffEmail('New order', `New order ${order.order_id} created.`, baseMeta),
      action: 'order_created',
      meta: baseMeta,
      actorUserId: req.user?.user_id
    });
    if (extraAmount > 0) {
      const paymentRecord = extraPaymentReference ? await Payment.findOne({ where: { reference: extraPaymentReference } }) : null;
      const paymentMeta = {
        ...baseMeta,
        paymentType: 'extra_clothes',
        status: paymentRecord?.status || (payment_method === 'paystack' ? 'paid' : 'pending'),
        reference: paymentRecord?.reference || extraPaymentReference || payment_reference || `EXT-${order.order_id}`
      };
      await notifyAdmins({
        title: 'Payment created',
        message: `Payment created for order ${order.order_id}.`,
        subject: 'Payment created',
        text: buildStaffEmail('Payment created', `Payment created for order ${order.order_id}.`, paymentMeta),
        action: 'payment_created',
        meta: paymentMeta,
        actorUserId: req.user?.user_id
      });
    }

    try {
      let targetUser = req.user;
      if (!targetUser?.email && user_id) {
        targetUser = await User.findByPk(user_id);
      }
      await queueOrderStatusEmail({
        user: targetUser,
        order,
        status: order.status,
        source: 'student',
        actorUserId: req.user?.user_id
      });
    } catch (e) {
      console.error('Order email queue failed:', e.message);
    }

    res.status(201).json(order);
  } catch (error) {
    await t.rollback();
    console.error('Student book error', { user_id: req.body?.user_id, message: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Get My Orders
router.get('/orders', async (req, res) => {
  try {
    const { user_id } = req.query;
    if (!user_id) return res.status(400).json({ error: 'User ID required' });
    
    const orders = await Order.findAll({
      where: { user_id },
      order: [['created_at', 'DESC']],
      include: [Code] 
    });
    
    const result = orders.map(o => {
        const json = o.toJSON();
        const pickup = json.Codes ? json.Codes.find(c => c.type === 'pickup' && c.status === 'active') : null;
        const delivery = json.Codes ? json.Codes.find(c => c.type === 'release' && c.status === 'active') : null;
        json.pickup_code = pickup ? pickup.code_value : null;
        json.delivery_code = delivery ? delivery.code_value : null;
        json.Code = pickup; // Backward compatibility
        return json;
    });
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/orders/:id/cancel', async (req, res) => {
  const t = await require('../config/database').transaction();
  try {
    const authUserId = req.user?.user_id;
    if (!authUserId) {
      await t.rollback();
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { id } = req.params;
    const { version } = req.body || {};
    const order = await Order.findByPk(id, { transaction: t });
    if (!order) {
      await t.rollback();
      return res.status(404).json({ error: 'Order not found' });
    }
    if (Number(order.user_id) !== Number(authUserId)) {
      await t.rollback();
      return res.status(403).json({ error: 'Unauthorized' });
    }
    if (version !== undefined && order.version !== version) {
      await t.rollback();
      return res.status(409).json({ error: 'Data has changed. Please refresh.', current_version: order.version });
    }
    if (!['pending', 'accepted'].includes(order.status)) {
      await t.rollback();
      return res.status(400).json({ error: `Order cannot be cancelled in status ${order.status}` });
    }
    const previousStatus = order.status;
    order.status = 'cancelled';
    await order.save({ transaction: t });

    if (order.subscription_id) {
      const sub = await Subscription.findByPk(order.subscription_id, { transaction: t, include: [Plan] });
      if (sub) {
        const planUsage = Math.max(0, (order.clothes_count || 0) - (order.extra_clothes_count || 0));
        const pickupLimit = sub.Plan?.pickup_limit;
        const clothesLimit = sub.Plan?.clothes_limit;
        sub.remaining_pickups = (sub.remaining_pickups || 0) + 1;
        sub.remaining_clothes = (sub.remaining_clothes || 0) + planUsage;
        sub.used_clothes = Math.max(0, (sub.used_clothes || 0) - planUsage);
        if (pickupLimit !== undefined && pickupLimit !== null) {
          sub.remaining_pickups = Math.min(sub.remaining_pickups, pickupLimit);
        }
        if (clothesLimit !== undefined && clothesLimit !== null) {
          sub.remaining_clothes = Math.min(sub.remaining_clothes, clothesLimit);
        }
        await sub.save({ transaction: t });
      }
    }

    await AuditLog.create({
      actor_user_id: authUserId,
      action: 'cancel_order',
      entity_type: 'order',
      entity_id: String(order.order_id),
      details: `Cancelled from ${previousStatus}`
    }, { transaction: t });

    const cancelNotification = await Notification.create({
      user_id: order.user_id,
      title: 'Order Cancelled',
      message: 'Your order has been cancelled.',
      event_type: 'order_update',
      channel: 'app'
    }, { transaction: t });

    await createSyncEvent({
      actor_user_id: authUserId,
      target_user_id: order.user_id,
      source: 'student',
      entity_type: 'order',
      entity_id: order.order_id,
      action: 'status_update',
      payload: {
        from: previousStatus,
        to: 'cancelled',
        version: order.version
      },
      critical: true,
      transaction: t
    });

    await t.commit();
    sse.broadcast('order_updated', order);
    sse.broadcast('notification', cancelNotification, order.user_id);
    try { await IntegrationService.sendPushNotification(order.user_id, cancelNotification.title, cancelNotification.message); } catch (e) { console.warn('Push failed:', e.message); }
    emitPickupSync(req, 'status_update', order, { from: previousStatus, to: 'cancelled' });
    res.json(order);
  } catch (error) {
    await t.rollback();
    res.status(500).json({ error: error.message });
  }
});

router.get('/chats', async (req, res) => {
  try {
    const { user_id } = req.query;
    if (!user_id) return res.status(400).json({ error: 'User ID required' });

    const threads = await ChatThread.findAll({
      where: { user_id },
      include: [
        { 
          model: Order,
          attributes: ['order_id', 'status', 'assigned_rider_id']
        }
      ],
      order: [['updated_at', 'DESC']]
    });

    const result = await Promise.all(threads.map(async (thread) => {
      const lastMessage = await ChatMessage.findOne({
        where: { thread_id: thread.id },
        order: [['timestamp', 'DESC']]
      });
      
      const unreadCount = await ChatMessage.count({
        where: {
          thread_id: thread.id,
          read_status: false,
          sender_role: { [Op.notIn]: ['student', 'user'] }
        }
      });

      return {
        ...thread.toJSON(),
        lastMessage,
        unreadCount
      };
    }));

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Sync endpoints for student app
router.get('/sync/pull', async (req, res) => {
  try {
    const { user_id, entity_type, since } = req.query;
    if (!user_id) return res.status(400).json({ error: 'User ID required' });
    const limit = Number(req.query.limit || 200);
    const where = { user_id };
    if (since) where.updated_at = { [Op.gte]: new Date(since) };

    if (entity_type === 'profile') {
      const user = await User.findByPk(user_id);
      if (!user) return res.status(404).json({ error: 'User not found' });
      return res.json({ items: [user], server_time: new Date().toISOString() });
    }

    if (entity_type === 'payment') {
      const payments = await Payment.findAll({ where, order: [['updated_at', 'DESC']], limit });
      return res.json({ items: payments, server_time: new Date().toISOString() });
    }

    if (entity_type === 'subscription') {
      const subs = await Subscription.findAll({ where, order: [['updated_at', 'DESC']], limit });
      return res.json({ items: subs, server_time: new Date().toISOString() });
    }

    if (entity_type === 'order') {
      const orders = await Order.findAll({ where, order: [['updated_at', 'DESC']], limit, include: [Code] });
      const result = orders.map(o => {
        const json = o.toJSON();
        const pickup = json.Codes ? json.Codes.find(c => c.type === 'pickup' && c.status === 'active') : null;
        const delivery = json.Codes ? json.Codes.find(c => c.type === 'release' && c.status === 'active') : null;
        json.pickup_code = pickup ? pickup.code_value : null;
        json.delivery_code = delivery ? delivery.code_value : null;
        json.Code = pickup;
        return json;
      });
      return res.json({ items: result, server_time: new Date().toISOString() });
    }

    return res.status(400).json({ error: 'Unsupported entity_type' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/sync/push', async (req, res) => {
  try {
    const { user_id, entity_type, payload, action } = req.body;
    if (!user_id) return res.status(400).json({ error: 'User ID required' });
    if (entity_type !== 'profile') return res.status(400).json({ error: 'Unsupported entity_type' });
    const user = await User.findByPk(user_id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const allowed = ['full_name', 'email', 'student_id', 'school', 'hostel_address', 'profile_fields'];
    const nextPayload = {};
    allowed.forEach((key) => {
      if (payload && payload[key] !== undefined) nextPayload[key] = payload[key];
    });
    if (payload && typeof payload.phone_number === 'string' && payload.phone_number.trim()) {
      const phoneResult = normalizeNigerianPhone(payload.phone_number);
      if (phoneResult.error) return res.status(400).json({ error: phoneResult.error, code: 'invalid_phone' });
      const exists = await User.findOne({
        where: {
          phone_number: { [Op.in]: [phoneResult.normalized, phoneResult.local] },
          user_id: { [Op.ne]: user.user_id }
        }
      });
      if (exists) return res.status(400).json({ error: 'Phone number already registered', code: 'duplicate_phone' });
      nextPayload.phone_number = phoneResult.normalized;
    }
    if (typeof nextPayload.school === 'string') {
      const cleanSchool = nextPayload.school.trim();
      if (cleanSchool) {
        const match = await School.findOne({ where: { school_name: cleanSchool, active: true } });
        if (!match) return res.status(400).json({ error: 'Selected school is not available', code: 'invalid_school' });
        nextPayload.school = match.school_name;
      } else {
        nextPayload.school = null;
      }
    }
    await user.update(nextPayload);
    await createSyncEvent({
      actor_user_id: user.user_id,
      target_user_id: user.user_id,
      source: 'student',
      entity_type: 'profile',
      entity_id: user.user_id,
      action: action || 'update',
      payload: nextPayload,
      critical: true
    });
    sse.broadcast('user_updated', user);
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/sync/payments', async (req, res) => {
  try {
    const { user_id, since } = req.query;
    if (!user_id) return res.status(400).json({ error: 'User ID required' });
    const where = { user_id };
    if (since) where.updated_at = { [require('sequelize').Op.gte]: new Date(since) };
    const payments = await require('../models').Payment.findAll({ where, order: [['updated_at','DESC']] });
    res.json({ items: payments });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
router.get('/sync/profile', async (req, res) => {
  try {
    const { user_id } = req.query;
    if (!user_id) return res.status(400).json({ error: 'User ID required' });
    const user = await User.findByPk(user_id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update Profile (Unified with Avatar)
router.put('/profile', upload.single('avatar'), async (req, res) => {
  try {
    const { user_id, phone_number, student_id, school, hostel_address, email, full_name, profile_fields } = req.body;
    if (!user_id) return res.status(400).json({ error: 'User ID required' });
    const user = await User.findByPk(user_id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    const payload = {};
    if (typeof full_name === 'string' && full_name.trim()) payload.full_name = full_name.trim();
    if (typeof phone_number === 'string' && phone_number.trim()) {
      const phoneResult = normalizeNigerianPhone(phone_number);
      if (phoneResult.error) return res.status(400).json({ error: phoneResult.error, code: 'invalid_phone' });
      const exists = await User.findOne({
        where: {
          phone_number: { [Op.in]: [phoneResult.normalized, phoneResult.local] },
          user_id: { [Op.ne]: user.user_id }
        }
      });
      if (exists) return res.status(400).json({ error: 'Phone number already registered', code: 'duplicate_phone' });
      payload.phone_number = phoneResult.normalized;
    }
    if (typeof student_id === 'string') payload.student_id = student_id.trim();
    if (typeof school === 'string' && school.trim()) {
      const cleanSchool = school.trim();
      const match = await School.findOne({ where: { school_name: cleanSchool, active: true } });
      if (!match) return res.status(400).json({ error: 'Selected school is not available' });
      payload.school = match.school_name;
    }
    if (typeof hostel_address === 'string') payload.hostel_address = hostel_address.trim();
    if (typeof email === 'string') {
      const cleanEmail = email.trim().toLowerCase();
      if (cleanEmail) {
        const existsEmail = await User.findOne({
          where: {
            email: cleanEmail,
            user_id: { [Op.ne]: user.user_id }
          }
        });
        if (existsEmail) return res.status(400).json({ error: 'Email already registered', code: 'duplicate_email' });
      }
      payload.email = cleanEmail;
    }
    if (profile_fields !== undefined) {
      if (typeof profile_fields === 'string') {
        try {
          payload.profile_fields = JSON.parse(profile_fields);
        } catch {
          return res.status(400).json({ error: 'Invalid profile fields payload' });
        }
      } else if (typeof profile_fields === 'object' && !Array.isArray(profile_fields)) {
        payload.profile_fields = profile_fields;
      }
    }
    
    // Handle Avatar Upload
    if (req.file) {
      console.log('Avatar upload started', { user_id, filename: req.file.filename });
      payload.avatar_url = `/uploads/${req.file.filename}`;
    }

    await user.update(payload);
    await createSyncEvent({
      actor_user_id: user.user_id,
      target_user_id: user.user_id,
      source: 'student',
      entity_type: 'profile',
      entity_id: user.user_id,
      action: 'update',
      payload,
      critical: true
    });
    sse.broadcast('user_updated', user);
    sse.broadcast('user_updated', user);
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload Avatar
router.post('/profile/avatar', upload.single('avatar'), async (req, res) => {
  try {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'User ID required' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const user = await User.findByPk(user_id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const url = `/uploads/${req.file.filename}`;
    // Ensure column exists; server.js adds it if missing
    await user.update({ avatar_url: url });
    res.json({ url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Notifications
router.get('/notifications', async (req, res) => {
  try {
    const { user_id } = req.query;
    if (!user_id) return res.status(400).json({ error: 'User ID required' });
    
    const notifications = await Notification.findAll({
      where: { user_id },
      order: [['created_at', 'DESC']],
      limit: 50
    });
    
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Initialize Paystack Payment
router.post('/payments/initialize', async (req, res) => {
  try {
    const { email, amount, metadata, callback_url } = req.body;
    
    if (!email || !amount) {
        return res.status(400).json({ error: 'Email and amount are required' });
    }

    const result = await IntegrationService.initializePaystackTransaction(
        email, 
        amount, 
        callback_url, 
        metadata
    );

    res.json(result);
  } catch (error) {
    console.error('Paystack Init Error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/push-token', async (req, res) => {
  try {
    const { user_id, token } = req.body;
    if (!user_id || !token) return res.status(400).json({ error: 'User ID and token required' });
    
    // Store in DeviceToken table
    const [record, created] = await DeviceToken.findOrCreate({
      where: { token },
      defaults: {
        user_id,
        platform: 'web',
        last_active: new Date()
      }
    });

    if (!created && Number(record.user_id) !== Number(user_id)) {
        await record.update({ user_id, last_active: new Date() });
    } else if (!created) {
        await record.update({ last_active: new Date() });
    }
    
    // Legacy support: update profile_fields for backward compatibility if needed
    // But we are moving away from it.
    
    console.log('Push token registered (DeviceToken)', { user_id, token: token.substring(0, 20) + '...' });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Push token registration failed:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
