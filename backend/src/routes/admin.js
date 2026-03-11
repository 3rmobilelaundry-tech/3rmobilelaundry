const express = require('express');
const router = express.Router();
const multer = require('multer');
const { User, Notification, Invite, Payment, AuditLog, Plan, Subscription, Order, Code, AnalyticsSnapshot, CarouselItem, ChatThread, ChatMessage, SyncEvent, InventoryItem, RegistrationField, School, sequelize } = require('../models');
const { verifyToken, verifyRole } = require('../middleware/auth');
const { Op } = require('sequelize');
const fs = require('fs');
const path = require('path');
const IntegrationService = require('../services/integrationService');
const sse = require('../services/sse');
const { createSyncEvent, queueOrderStatusEmail, queuePaymentEmail, queueEmailNotification } = require('../services/syncService');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const EXTRA_ITEM_PRICE = 500; 
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
const normalizeEmail = (value) => {
  if (!value) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed.toLowerCase() : null;
};
const generateOtp = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');
const otpExpiresAt = () => new Date(Date.now() + 10 * 60 * 1000);

// SSE Endpoint (must be before verifyToken to allow query param auth for EventSource)
router.get('/events', async (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(401).json({ error: 'Token required' });

  try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
        const user = await User.findByPk(decoded.user_id);
        if (!user || !['admin', 'receptionist', 'rider', 'washer', 'head_admin'].includes(user.role)) {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        // Connected
        sse.addClient(res);
    } catch (e) {
        res.status(401).json({ error: 'Invalid token' });
    }
});

// Middleware: all staff have access to these admin routes
router.use(verifyToken);
router.use(verifyRole(['rider', 'washer', 'receptionist', 'admin', 'head_admin']));

const SETTINGS_PATH = path.join(__dirname, '..', 'config', 'app-settings.json');
const FRONT_LOG_PATH = path.join(__dirname, '..', 'logs', 'frontend.log');
const invalidateRegistrationConfigCache = () => {
  if (global.__registrationConfigCache) {
    global.__registrationConfigCache.value = null;
    global.__registrationConfigCache.fetchedAt = 0;
    global.__registrationConfigCache.version = Date.now();
  }
};

// SSE notification clients
function broadcastEvent(event, payload) {
  sse.broadcast(event, payload);
}
function emitPickupSync(req, action, order, fields = {}) {
  const io = req.app.get('io');
  if (!io || !order) return;
  const payload = {
    action,
    order,
    fields,
    source: 'admin',
    actor_user_id: req.user?.user_id || null,
    timestamp: new Date().toISOString()
  };
  io.to('pickup_staff').emit('pickup_event', payload);
  io.to(`pickup_user_${order.user_id}`).emit('pickup_event', payload);
  io.to(`pickup_order_${order.order_id}`).emit('pickup_event', payload);
}

const STAFF_ROLES = new Set(['admin', 'receptionist', 'washer', 'rider', 'head_admin']);
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
const notifyUserInApp = async (userId, title, message, eventType = 'system', transaction) => {
  if (!userId) return null;
  const payload = {
    user_id: userId,
    title,
    message,
    event_type: eventType,
    channel: 'app'
  };
  return transaction ? Notification.create(payload, { transaction }) : Notification.create(payload);
};
const notifyAdmins = async ({ title, message, subject, text, action, meta, actorUserId, transaction, skipEmail = false, skipInApp = false }) => {
  const admins = await User.findAll({ where: { role: 'admin' } });
  if (admins.length === 0) return;
  if (!skipInApp) {
    const rows = admins.map((admin) => ({
      user_id: admin.user_id,
      title,
      message,
      event_type: 'system',
      channel: 'app'
    }));
    if (transaction) {
      await Notification.bulkCreate(rows, { transaction });
    } else {
      await Notification.bulkCreate(rows);
    }
  }
  if (!skipEmail) {
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
        source: 'admin',
        actorUserId
      })
    )));
  }
};
const notifyStaffUser = async ({ user, title, message, subject, text, action, meta, actorUserId, eventType = 'system', transaction }) => {
  if (!user || !isStaffRole(user.role)) return;
  await notifyUserInApp(user.user_id, title, message, eventType, transaction);
  await queueEmailNotification({
    action,
    entityId: `staff:${action}:${user.user_id}:${Date.now()}`,
    to: user.email,
    subject: subject || title,
    text: text || message,
    html: null,
    userId: user.user_id,
    meta,
    source: 'admin',
    actorUserId
  });
};
const notifyRoleUsers = async ({ role, title, message, eventType = 'system', transaction }) => {
  if (!role) return [];
  const users = await User.findAll({ where: { role } });
  if (!users.length) return [];
  const rows = users.map((user) => ({
    user_id: user.user_id,
    title,
    message,
    event_type: eventType,
    channel: 'app'
  }));
  if (transaction) {
    await Notification.bulkCreate(rows, { transaction });
  } else {
    await Notification.bulkCreate(rows);
  }
  return users;
};

async function injectChatSystemMessage(order, status, t, io) {
    const messages = {
        accepted: 'Your order has been accepted.',
        rider_on_the_way: 'Rider is on the way.',
        rider_arrived: 'Rider has arrived.',
        picked_up: 'Your laundry has been picked up.',
        processing: 'Your laundry is being processed.',
        ready: 'Your laundry is ready.',
        out_for_delivery: 'Your laundry is out for delivery.',
        delivered: 'Your order has been delivered.',
        cancelled: 'Your order has been cancelled.'
    };
    
    if (!messages[status]) return;

    let thread = await ChatThread.findOne({ where: { order_id: order.order_id }, transaction: t });
    if (!thread) {
        thread = await ChatThread.create({
            order_id: order.order_id,
            user_id: order.user_id,
            rider_id: order.assigned_rider_id || null,
            status: 'active'
        }, { transaction: t });
    } else if (order.assigned_rider_id && thread.rider_id !== order.assigned_rider_id) {
        thread.rider_id = order.assigned_rider_id;
        await thread.save({ transaction: t });
    }

    if (['delivered', 'cancelled'].includes(status)) {
        thread.status = 'locked';
        thread.locked_at = new Date();
        await thread.save({ transaction: t });
    }

    const msg = await ChatMessage.create({
        thread_id: thread.id,
        sender_role: 'system',
        sender_id: 0, 
        message_type: 'system',
        message: messages[status],
        read_status: false
    }, { transaction: t });

    await ChatThread.update(
        { updated_at: new Date() },
        { where: { id: thread.id }, transaction: t }
    );

    if (io) {
        io.to(`order_${order.order_id}`).emit('receive_message', msg);
        io.to(`order_${order.order_id}`).emit('chat_status', { status: thread.status });
    }
}

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

// Helper to ensure pickup/delivery codes exist for an order
async function ensureOrderCodes(order_id, user_id, t = null) {
    try {
        const options = t ? { transaction: t } : {};

        // 1. Pickup Code
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
                }, options);
            }
        }

        // 2. Delivery Code (type='release')
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
                }, options);
            }
        }
        return { pickup, delivery };
    } catch (e) {
        console.error('Error generating codes:', { order_id, message: e.message });
        throw e;
    }
}

function readSettings() {
  try {
    const raw = fs.readFileSync(SETTINGS_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {
      branding: { app_name: '3R Laundry Services', logo_url: '', favicon_url: '', description: '', app_color: '#2563EB', accent_color: '#111827' },
      operations: {
        pickup_windows: [
          { day: 'Mon', start: '08:00', end: '10:00' },
          { day: 'Wed', start: '08:00', end: '10:00' },
          { day: 'Fri', start: '08:00', end: '10:00' }
        ],
        extra_item_price: 500,
        processing_timeline_text: 'Laundry is ready within 24–48 hours after pickup.'
      },
      rules: {
        code_expiry_hours: 168, // 7 days
        school_rules: {}
      },
      emergency: {
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
      },
      notifications: {
        templates: {
          order_ready: 'Your order is ready! Code: {{code}}',
          order_delivered: 'Your order has been delivered.'
        }
      },
      payments: { paystack: { enabled: false, public_key: '' }, bank_accounts: [] },
      integrations: {
          paystack: { enabled: false, public_key: '', secret_key: '' },
          whatsapp: { enabled: false, api_key: '', phone_number_id: '' },
          email: { enabled: false, smtp_host: '', smtp_port: 587, smtp_user: '', smtp_pass: '' }
      },
      version: 0
    };
  }
}

function writeSettings(next) {
  const dir = path.dirname(SETTINGS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(next, null, 2), 'utf-8');
}

// Configure Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', '..', 'public', 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// Chat Endpoints
router.get('/chats', async (req, res) => {
    try {
        const { role, user_id } = req.user;
        
        // Strict Role Access: Only Admin and Rider allowed
        if (role === 'receptionist' || role === 'washer') {
             return res.status(403).json({ error: 'Unauthorized' });
        }

        let where = {};

        // Filter for Rider
        if (role === 'rider') {
            // Find orders assigned to this rider
            const orders = await Order.findAll({
                where: { assigned_rider_id: user_id },
                attributes: ['order_id']
            });
            const orderIds = orders.map(o => o.order_id);
            where.order_id = { [Op.in]: orderIds };
        }
        // Admin/Receptionist see all

        const threads = await ChatThread.findAll({
            where,
            include: [
                { 
                    model: Order,
                    attributes: ['order_id', 'status', 'assigned_rider_id']
                },
                {
                    model: User, // Student
                    as: 'Customer', 
                    attributes: ['user_id', 'full_name', 'email']
                }
            ],
            order: [['updated_at', 'DESC']]
        });

        // Enhance with last message and unread count
        const result = await Promise.all(threads.map(async (thread) => {
            const lastMessage = await ChatMessage.findOne({
                where: { thread_id: thread.id },
                order: [['timestamp', 'DESC']]
            });
            
            const unreadCount = await ChatMessage.count({
                where: {
                    thread_id: thread.id,
                    read_status: false,
                    sender_role: 'student' // Count unread from student
                }
            });

            return {
                ...thread.toJSON(),
                lastMessage,
                unreadCount
            };
        }));

        res.json(result);
    } catch (e) {
        console.error('Error fetching chats:', e);
        res.status(500).json({ error: e.message });
    }
});

// Settings Endpoints
router.get('/settings', (req, res) => {
    try {
        const settings = readSettings();
        // Ensure structure exists if missing
        if (!settings.operations) settings.operations = { pickup_windows: [], extra_item_price: 500, processing_timeline_text: 'Laundry is ready within 24–48 hours after pickup.' };
        if (!settings.operations.processing_timeline_text) settings.operations.processing_timeline_text = 'Laundry is ready within 24–48 hours after pickup.';
        if (!settings.rules) settings.rules = { code_expiry_hours: 168, school_rules: {} };
        if (!settings.emergency) settings.emergency = { enabled: false, available: true, pricing_mode: 'per_item', price_per_item: 400, base_fee: 0, delivery_window_text: 'Delivered within 2–8 hours (same day)', description: 'Same-day delivery within 2–8 hours', estimated_completion_text: '2–8 hours', estimated_completion_minutes: 360, instructions: '', restrictions: '', updated_at: null, version: 0 };
        if (!settings.emergency.delivery_window_text) settings.emergency.delivery_window_text = 'Delivered within 2–8 hours (same day)';
        if (!settings.emergency.description) settings.emergency.description = 'Same-day delivery within 2–8 hours';
        if (!settings.emergency.estimated_completion_text) settings.emergency.estimated_completion_text = '2–8 hours';
        if (settings.emergency.estimated_completion_minutes === undefined || settings.emergency.estimated_completion_minutes === null) settings.emergency.estimated_completion_minutes = 360;
        if (settings.emergency.instructions === undefined || settings.emergency.instructions === null) settings.emergency.instructions = '';
        if (settings.emergency.restrictions === undefined || settings.emergency.restrictions === null) settings.emergency.restrictions = '';
        if (!settings.emergency.updated_at) settings.emergency.updated_at = null;
        if (!settings.emergency.version && settings.emergency.version !== 0) settings.emergency.version = 0;
        if (!settings.version && settings.version !== 0) settings.version = 0;
        if (!settings.notifications) settings.notifications = { templates: {} };
        if (!settings.payments) settings.payments = { paystack: { enabled: false, public_key: '' }, bank_accounts: [] };
        res.json(settings);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/integrations', (req, res) => {
    try {
        const settings = readSettings();
        const integrations = settings.integrations || {
            paystack: { enabled: false, public_key: '', secret_key: '' },
            whatsapp: { enabled: false, api_key: '', phone_number_id: '' },
            email: { enabled: false, smtp_host: '', smtp_port: 587, smtp_user: '', smtp_pass: '' }
        };
        res.json(integrations);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/integrations', async (req, res) => {
    try {
        if (!['admin', 'head_admin'].includes(req.user.role)) return res.status(403).json({ error: 'Admin only' });
        const current = readSettings();
        const incoming = req.body || {};
        const nextIntegrations = {
            paystack: { ...(current.integrations?.paystack || {}), ...(incoming.paystack || {}) },
            whatsapp: { ...(current.integrations?.whatsapp || {}), ...(incoming.whatsapp || {}) },
            email: { ...(current.integrations?.email || {}), ...(incoming.email || {}) }
        };
        if (nextIntegrations.email?.smtp_port !== undefined && nextIntegrations.email?.smtp_port !== null) {
            const parsed = Number(nextIntegrations.email.smtp_port);
            nextIntegrations.email.smtp_port = Number.isNaN(parsed) ? nextIntegrations.email.smtp_port : parsed;
        }
        const updated = { ...current, integrations: nextIntegrations };
        writeSettings(updated);
        const actor = await User.findByPk(req.user.user_id);
        if (actor && isStaffRole(actor.role)) {
          await notifyUserInApp(actor.user_id, 'Integrations updated', 'You updated integrations settings.', 'system');
          const text = buildStaffEmail('Integrations updated', 'Integrations settings were updated.', {});
          await queueEmailNotification({
            action: 'integrations_updated_actor',
            entityId: `settings:integrations:actor:${actor.user_id}:${Date.now()}`,
            to: actor.email,
            subject: 'Integrations updated',
            text,
            html: null,
            userId: actor.user_id,
            meta: { details: 'integrations' },
            source: 'admin',
            actorUserId: req.user.user_id
          });
        }
        await notifyAdmins({
          title: 'Integrations updated',
          message: 'Integrations settings updated.',
          subject: 'Integrations updated',
          text: buildStaffEmail('Integrations updated', 'Integrations settings updated.', {}),
          action: 'integrations_updated',
          meta: { details: 'integrations' },
          actorUserId: req.user.user_id
        });
        res.json(nextIntegrations);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/settings', async (req, res) => {
    try {
        if (!['admin', 'head_admin'].includes(req.user.role)) return res.status(403).json({ error: 'Admin only' });
        const current = readSettings();
        const incomingVersion = req.body?.version;
        if (incomingVersion !== undefined && Number(incomingVersion) !== Number(current.version || 0)) {
            return res.status(409).json({ error: 'Settings conflict', code: 'version_conflict', current });
        }
        
        // Merge updates carefully
        const updated = {
            ...current,
            branding: { ...current.branding, ...(req.body.branding || {}) },
            operations: { ...current.operations, ...(req.body.operations || {}) },
            rules: { ...current.rules, ...(req.body.rules || {}) },
            emergency: { ...current.emergency, ...(req.body.emergency || {}) },
            notifications: { ...current.notifications, ...(req.body.notifications || {}) },
            integrations: { ...current.integrations, ...(req.body.integrations || {}) },
            payments: { ...current.payments, ...(req.body.payments || {}) }
        };
        const nextVersion = Number(current.version || 0) + 1;
        updated.version = nextVersion;
        updated.emergency = {
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
            updated_at: new Date().toISOString(),
            version: nextVersion,
            ...updated.emergency
        };

        try {
            writeSettings(updated);
        } catch (writeError) {
            try {
                writeSettings(current);
            } catch {}
            throw writeError;
        }
        broadcastEvent('settings_updated', {
            emergency: updated.emergency,
            operations: updated.operations,
            branding: updated.branding,
            version: updated.version,
            updated_at: new Date().toISOString()
        });
        const actor = await User.findByPk(req.user.user_id);
        if (actor && isStaffRole(actor.role)) {
          await notifyUserInApp(actor.user_id, 'Settings updated', 'You updated application settings.', 'system');
          const text = buildStaffEmail('Settings updated', 'Application settings updated.', {});
          await queueEmailNotification({
            action: 'settings_updated_actor',
            entityId: `settings:updated:actor:${actor.user_id}:${Date.now()}`,
            to: actor.email,
            subject: 'Settings updated',
            text,
            html: null,
            userId: actor.user_id,
            meta: { details: 'settings' },
            source: 'admin',
            actorUserId: req.user.user_id
          });
        }
        await notifyAdmins({
          title: 'Settings updated',
          message: 'Application settings updated.',
          subject: 'Settings updated',
          text: buildStaffEmail('Settings updated', 'Application settings updated.', {}),
          action: 'settings_updated',
          meta: { details: 'settings' },
          actorUserId: req.user.user_id
        });
        res.json(updated);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/settings/emergency/sync', (req, res) => {
    try {
        if (!['admin', 'head_admin'].includes(req.user.role)) return res.status(403).json({ error: 'Admin only' });
        const settings = readSettings();
        const emergency = {
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
            updated_at: settings.emergency?.updated_at || new Date().toISOString(),
            version: settings.emergency?.version ?? settings.version ?? 0,
            ...(settings.emergency || {})
        };
        const payload = {
            emergency,
            operations: settings.operations || {},
            branding: settings.branding || {},
            version: settings.version || emergency.version || 0,
            updated_at: new Date().toISOString()
        };
        broadcastEvent('settings_updated', payload);
        res.json({ ok: true, payload });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Registration Form Setup
router.get('/registration-fields', async (req, res) => {
    try {
        const fields = await RegistrationField.findAll({ order: [['order', 'ASC'], ['field_id', 'ASC']] });
        res.json(fields);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/registration-fields', async (req, res) => {
    try {
        if (!['admin', 'head_admin'].includes(req.user.role)) return res.status(403).json({ error: 'Admin only' });
        const { label, type, required, active, order } = req.body || {};
        if (!label || !type) return res.status(400).json({ error: 'Label and type are required' });
        const created = await RegistrationField.create({
            label: String(label).trim(),
            type: String(type).trim(),
            required: Boolean(required),
            active: active === undefined ? true : Boolean(active),
            order: Number.isFinite(Number(order)) ? Number(order) : 0
        });
        broadcastEvent('registration_fields_updated', created);
        invalidateRegistrationConfigCache();
        const actor = await User.findByPk(req.user.user_id);
        const meta = { details: created.label || created.field_id };
        if (actor && isStaffRole(actor.role)) {
            await notifyUserInApp(actor.user_id, 'Registration field created', `You created registration field ${created.field_id}.`, 'system');
            const text = buildStaffEmail('Registration field created', `Registration field ${created.field_id} created.`, meta);
            await queueEmailNotification({
                action: 'registration_field_created_actor',
                entityId: `registration_field:created:actor:${actor.user_id}:${created.field_id}`,
                to: actor.email,
                subject: 'Registration field created',
                text,
                html: null,
                userId: actor.user_id,
                meta,
                source: 'admin',
                actorUserId: req.user.user_id
            });
        }
        await notifyAdmins({
            title: 'Registration field created',
            message: `Registration field ${created.field_id} created.`,
            subject: 'Registration field created',
            text: buildStaffEmail('Registration field created', `Registration field ${created.field_id} created.`, meta),
            action: 'registration_field_created',
            meta,
            actorUserId: req.user.user_id
        });
        res.json(created);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/registration-fields/:field_id', async (req, res) => {
    try {
        if (!['admin', 'head_admin'].includes(req.user.role)) return res.status(403).json({ error: 'Admin only' });
        const field = await RegistrationField.findByPk(req.params.field_id);
        if (!field) return res.status(404).json({ error: 'Field not found' });
        const { label, type, required, active, order } = req.body || {};
        if (label !== undefined) field.label = String(label).trim();
        if (type !== undefined) field.type = String(type).trim();
        if (required !== undefined) field.required = Boolean(required);
        if (active !== undefined) field.active = Boolean(active);
        if (order !== undefined && Number.isFinite(Number(order))) field.order = Number(order);
        await field.save();
        broadcastEvent('registration_fields_updated', field);
        invalidateRegistrationConfigCache();
        const actor = await User.findByPk(req.user.user_id);
        const meta = { details: field.label || field.field_id };
        if (actor && isStaffRole(actor.role)) {
            await notifyUserInApp(actor.user_id, 'Registration field updated', `You updated registration field ${field.field_id}.`, 'system');
            const text = buildStaffEmail('Registration field updated', `Registration field ${field.field_id} updated.`, meta);
            await queueEmailNotification({
                action: 'registration_field_updated_actor',
                entityId: `registration_field:updated:actor:${actor.user_id}:${field.field_id}`,
                to: actor.email,
                subject: 'Registration field updated',
                text,
                html: null,
                userId: actor.user_id,
                meta,
                source: 'admin',
                actorUserId: req.user.user_id
            });
        }
        await notifyAdmins({
            title: 'Registration field updated',
            message: `Registration field ${field.field_id} updated.`,
            subject: 'Registration field updated',
            text: buildStaffEmail('Registration field updated', `Registration field ${field.field_id} updated.`, meta),
            action: 'registration_field_updated',
            meta,
            actorUserId: req.user.user_id
        });
        res.json(field);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/registration-fields/:field_id', async (req, res) => {
    try {
        if (!['admin', 'head_admin'].includes(req.user.role)) return res.status(403).json({ error: 'Admin only' });
        const field = await RegistrationField.findByPk(req.params.field_id);
        if (!field) return res.status(404).json({ error: 'Field not found' });
        await field.destroy();
        broadcastEvent('registration_fields_updated', { field_id: Number(req.params.field_id), deleted: true });
        invalidateRegistrationConfigCache();
        const actor = await User.findByPk(req.user.user_id);
        const meta = { details: field.label || field.field_id };
        if (actor && isStaffRole(actor.role)) {
            await notifyUserInApp(actor.user_id, 'Registration field deleted', `You deleted registration field ${field.field_id}.`, 'system');
            const text = buildStaffEmail('Registration field deleted', `Registration field ${field.field_id} deleted.`, meta);
            await queueEmailNotification({
                action: 'registration_field_deleted_actor',
                entityId: `registration_field:deleted:actor:${actor.user_id}:${field.field_id}`,
                to: actor.email,
                subject: 'Registration field deleted',
                text,
                html: null,
                userId: actor.user_id,
                meta,
                source: 'admin',
                actorUserId: req.user.user_id
            });
        }
        await notifyAdmins({
            title: 'Registration field deleted',
            message: `Registration field ${field.field_id} deleted.`,
            subject: 'Registration field deleted',
            text: buildStaffEmail('Registration field deleted', `Registration field ${field.field_id} deleted.`, meta),
            action: 'registration_field_deleted',
            meta,
            actorUserId: req.user.user_id
        });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/schools', async (req, res) => {
    try {
        const schools = await School.findAll({ order: [['school_name', 'ASC'], ['school_id', 'ASC']] });
        res.json(schools);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/schools', async (req, res) => {
    try {
        if (!['admin', 'head_admin'].includes(req.user.role)) return res.status(403).json({ error: 'Admin only' });
        const { school_name, active } = req.body || {};
        if (!school_name) return res.status(400).json({ error: 'School name is required' });
        const created = await School.create({
            school_name: String(school_name).trim(),
            active: active === undefined ? true : Boolean(active)
        });
        broadcastEvent('schools_updated', created);
        invalidateRegistrationConfigCache();
        const actor = await User.findByPk(req.user.user_id);
        const meta = { details: created.school_name || created.school_id };
        if (actor && isStaffRole(actor.role)) {
            await notifyUserInApp(actor.user_id, 'School created', `You created school ${created.school_id}.`, 'system');
            const text = buildStaffEmail('School created', `School ${created.school_id} created.`, meta);
            await queueEmailNotification({
                action: 'school_created_actor',
                entityId: `school:created:actor:${actor.user_id}:${created.school_id}`,
                to: actor.email,
                subject: 'School created',
                text,
                html: null,
                userId: actor.user_id,
                meta,
                source: 'admin',
                actorUserId: req.user.user_id
            });
        }
        await notifyAdmins({
            title: 'School created',
            message: `School ${created.school_id} created.`,
            subject: 'School created',
            text: buildStaffEmail('School created', `School ${created.school_id} created.`, meta),
            action: 'school_created',
            meta,
            actorUserId: req.user.user_id
        });
        res.json(created);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/schools/:school_id', async (req, res) => {
    try {
        if (!['admin', 'head_admin'].includes(req.user.role)) return res.status(403).json({ error: 'Admin only' });
        const school = await School.findByPk(req.params.school_id);
        if (!school) return res.status(404).json({ error: 'School not found' });
        const { school_name, active } = req.body || {};
        if (school_name !== undefined) school.school_name = String(school_name).trim();
        if (active !== undefined) school.active = Boolean(active);
        await school.save();
        broadcastEvent('schools_updated', school);
        invalidateRegistrationConfigCache();
        const actor = await User.findByPk(req.user.user_id);
        const meta = { details: school.school_name || school.school_id };
        if (actor && isStaffRole(actor.role)) {
            await notifyUserInApp(actor.user_id, 'School updated', `You updated school ${school.school_id}.`, 'system');
            const text = buildStaffEmail('School updated', `School ${school.school_id} updated.`, meta);
            await queueEmailNotification({
                action: 'school_updated_actor',
                entityId: `school:updated:actor:${actor.user_id}:${school.school_id}`,
                to: actor.email,
                subject: 'School updated',
                text,
                html: null,
                userId: actor.user_id,
                meta,
                source: 'admin',
                actorUserId: req.user.user_id
            });
        }
        await notifyAdmins({
            title: 'School updated',
            message: `School ${school.school_id} updated.`,
            subject: 'School updated',
            text: buildStaffEmail('School updated', `School ${school.school_id} updated.`, meta),
            action: 'school_updated',
            meta,
            actorUserId: req.user.user_id
        });
        res.json(school);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/schools/:school_id', async (req, res) => {
    try {
        if (!['admin', 'head_admin'].includes(req.user.role)) return res.status(403).json({ error: 'Admin only' });
        const school = await School.findByPk(req.params.school_id);
        if (!school) return res.status(404).json({ error: 'School not found' });
        await school.destroy();
        broadcastEvent('schools_updated', { school_id: Number(req.params.school_id), deleted: true });
        invalidateRegistrationConfigCache();
        const actor = await User.findByPk(req.user.user_id);
        const meta = { details: school.school_name || school.school_id };
        if (actor && isStaffRole(actor.role)) {
            await notifyUserInApp(actor.user_id, 'School deleted', `You deleted school ${school.school_id}.`, 'system');
            const text = buildStaffEmail('School deleted', `School ${school.school_id} deleted.`, meta);
            await queueEmailNotification({
                action: 'school_deleted_actor',
                entityId: `school:deleted:actor:${actor.user_id}:${school.school_id}`,
                to: actor.email,
                subject: 'School deleted',
                text,
                html: null,
                userId: actor.user_id,
                meta,
                source: 'admin',
                actorUserId: req.user.user_id
            });
        }
        await notifyAdmins({
            title: 'School deleted',
            message: `School ${school.school_id} deleted.`,
            subject: 'School deleted',
            text: buildStaffEmail('School deleted', `School ${school.school_id} deleted.`, meta),
            action: 'school_deleted',
            meta,
            actorUserId: req.user.user_id
        });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/settings/upload', upload.single('file'), async (req, res) => {
    try {
        if (!['admin', 'head_admin'].includes(req.user.role)) return res.status(403).json({ error: 'Admin only' });
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        
        const type = req.body.type; // 'logo' or 'favicon'
        const fileUrl = `/uploads/${req.file.filename}`;
        
        const settings = readSettings();
        if (!settings.branding) settings.branding = {};
        
        if (type === 'logo') settings.branding.logo_url = fileUrl;
        else if (type === 'favicon') settings.branding.favicon_url = fileUrl;
        
        writeSettings(settings);
        const actor = await User.findByPk(req.user.user_id);
        const meta = { details: type || 'branding' };
        if (actor && isStaffRole(actor.role)) {
            await notifyUserInApp(actor.user_id, 'Branding updated', `You updated ${type || 'branding'} asset.`, 'system');
            const text = buildStaffEmail('Branding updated', `Branding asset updated (${type || 'branding'}).`, meta);
            await queueEmailNotification({
                action: 'settings_upload_actor',
                entityId: `settings:upload:actor:${actor.user_id}:${Date.now()}`,
                to: actor.email,
                subject: 'Branding updated',
                text,
                html: null,
                userId: actor.user_id,
                meta,
                source: 'admin',
                actorUserId: req.user.user_id
            });
        }
        await notifyAdmins({
            title: 'Branding updated',
            message: `Branding asset updated (${type || 'branding'}).`,
            subject: 'Branding updated',
            text: buildStaffEmail('Branding updated', `Branding asset updated (${type || 'branding'}).`, meta),
            action: 'settings_upload',
            meta,
            actorUserId: req.user.user_id
        });
        res.json({ url: fileUrl });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Test Integrations
router.post('/integrations/test/paystack', async (req, res) => {
    try {
        if (!['admin', 'head_admin'].includes(req.user.role)) return res.status(403).json({ error: 'Admin only' });
        
        // Use keys from body (if testing new input) or stored settings
        const { public_key, secret_key } = req.body;
        
        const success = await IntegrationService.verifyPaystack(public_key, secret_key);
        if (success) {
            res.json({ status: 'success', message: 'Paystack connection verified' });
        } else {
            res.status(400).json({ error: 'Paystack verification failed' });
        }
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

router.post('/integrations/test/email', async (req, res) => {
    try {
        if (!['admin', 'head_admin'].includes(req.user.role)) return res.status(403).json({ error: 'Admin only' });
        const payload = req.body || {};
        const current = readSettings();
        const base = current.integrations?.email || {};
        const merged = { ...base, ...payload };
        const result = await IntegrationService.verifyEmailConfig(merged);
        const host = String(merged.smtp_host || result.host || '');
        const pass = String(merged.smtp_pass || '');
        const warnings = [];
        if (host.toLowerCase().includes('gmail')) {
            const stripped = pass.replace(/\s/g, '');
            if (stripped.length !== 16) {
                warnings.push('Gmail SMTP requires a 16-character App Password, not your normal account password.');
            }
        }
        const mode = result.secure ? 'SSL' : result.requireTLS ? 'STARTTLS' : 'PLAIN';
        const message = `Email SMTP connection verified (${mode} on port ${result.port}).`;
        res.json({ status: 'success', message, warnings, details: result });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// Frontend logs 
router.post('/front-logs', express.json(), async (req, res) => {
  try {
    const dir = path.dirname(FRONT_LOG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const line = `[${new Date().toISOString()}] ${req.ip} ${req.body?.source || 'web'} ${req.body?.message || ''}\n${req.body?.stack || ''}\n${req.body?.href || ''}\n\n`;
    fs.appendFileSync(FRONT_LOG_PATH, line, 'utf-8');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'log_failed' });
  }
});

router.get('/front-logs/recent', async (req, res) => {
  try {
    if (!['admin', 'head_admin'].includes(req.user.role)) return res.status(403).json({ error: 'Admin only' });
    const lines = Number(req.query.lines || 200);
    if (!fs.existsSync(FRONT_LOG_PATH)) return res.json({ logs: [] });
    const content = fs.readFileSync(FRONT_LOG_PATH, 'utf-8');
    const arr = content.split('\n').filter(Boolean);
    const tail = arr.slice(Math.max(0, arr.length - lines));
    res.json({ logs: tail });
  } catch (e) {
    res.status(500).json({ error: 'read_failed' });
  }
});

// Overview
router.get('/overview', async (req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.setHours(0,0,0,0));
    const weekStart = new Date(new Date().setDate(new Date().getDate() - 7));
    const monthStart = new Date(new Date().setDate(new Date().getDate() - 30));

    const totalUsers = await User.count();
    const activeSubs = await Subscription.count({ where: { status: 'active' } });

    const orders = await Order.findAll({ attributes: ['status', 'updated_at'], raw: true });
    const orderStats = { pending: 0, accepted: 0, picked_up: 0, processing: 0, ready: 0, delivered: 0, cancelled: 0 };
    let stalledOrders = 0;
    const STALL_THRESHOLD = 24 * 60 * 60 * 1000;

    orders.forEach(o => {
      if (orderStats[o.status] !== undefined) orderStats[o.status]++;
      if (['pending', 'accepted', 'picked_up', 'processing', 'ready'].includes(o.status)) {
        if (Date.now() - new Date(o.updated_at).getTime() > STALL_THRESHOLD) stalledOrders++;
      }
    });

    const payments = await Payment.findAll({ attributes: ['amount', 'status', 'created_at'], raw: true });
    const revenue = { today: 0, week: 0, month: 0 };
    const paymentAlerts = { pending: 0, failed: 0 };

    payments.forEach(p => {
      if (p.status === 'paid') {
        const pDate = new Date(p.created_at);
        if (pDate >= todayStart) revenue.today += Number(p.amount);
        if (pDate >= weekStart) revenue.week += Number(p.amount);
        if (pDate >= monthStart) revenue.month += Number(p.amount);
      } else if (p.status === 'pending' || p.status === 'awaiting_verification') paymentAlerts.pending++;
      else if (p.status === 'failed') paymentAlerts.failed++;
    });

    const codeStats = await Code.findAll({
      attributes: ['status', 'attempt_count'],
      where: { [Op.or]: [{ status: 'expired' }, { attempt_count: { [Op.gt]: 0 } }] },
      raw: true
    });

    const codeAlerts = { expired: 0, failed_attempts: 0 };
    codeStats.forEach(c => {
      if (c.status === 'expired') codeAlerts.expired++;
      if (c.attempt_count > 0) codeAlerts.failed_attempts += c.attempt_count;
    });

    res.json({
      users: totalUsers,
      active_subscriptions: activeSubs,
      orders: orderStats,
      revenue,
      alerts: { stalled_orders: stalledOrders, pending_payments: paymentAlerts.pending, failed_payments: paymentAlerts.failed, code_expired: codeAlerts.expired, code_failed_attempts: codeAlerts.failed_attempts }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/analysis', async (req, res) => {
  try {
    if (!['admin', 'head_admin'].includes(req.user.role)) return res.status(403).json({ error: 'Head Admin only' });
    const period = String(req.query.period || 'daily');
    const days = period === 'weekly' ? 7 : period === 'monthly' ? 30 : 1;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const orders = await Order.findAll({
      where: { created_at: { [Op.gte]: startDate } },
      include: [
        { model: Subscription, include: [Plan] }
      ]
    });

    const total_orders = orders.length;
    const deliveredOrders = orders.filter((o) => o.status === 'delivered');
    const completion_rate = total_orders > 0 ? (deliveredOrders.length / total_orders) * 100 : 0;

    const turnaroundHours = deliveredOrders.map((o) => {
      const completedAt = o.completed_at ? new Date(o.completed_at) : new Date(o.updated_at);
      const createdAt = new Date(o.created_at);
      return (completedAt.getTime() - createdAt.getTime()) / 3600000;
    });
    const avg_turnaround_hours = turnaroundHours.length > 0 ? turnaroundHours.reduce((a, b) => a + b, 0) / turnaroundHours.length : 0;

    const dayCounts = {};
    orders.forEach((o) => {
      const d = new Date(o.pickup_date);
      const day = d.toLocaleDateString('en-US', { weekday: 'short' });
      dayCounts[day] = (dayCounts[day] || 0) + 1;
    });
    const peak_pickup_days = Object.entries(dayCounts).map(([day, count]) => ({ day, count }));

    const planCounts = {};
    orders.forEach((o) => {
      const planName = o.Subscription?.Plan?.name;
      if (!planName) return;
      planCounts[planName] = (planCounts[planName] || 0) + 1;
    });
    const popular_plans = Object.entries(planCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    const payments = await Payment.findAll({
      where: { status: 'paid', created_at: { [Op.gte]: startDate } },
      include: [{ model: User, attributes: ['school'] }]
    });
    const revenueBySchool = {};
    payments.forEach((p) => {
      const school = p.User?.school || 'Unknown';
      revenueBySchool[school] = (revenueBySchool[school] || 0) + Number(p.amount || 0);
    });
    const revenue_by_school = Object.entries(revenueBySchool)
      .map(([school, total_revenue]) => ({ school, total_revenue }))
      .sort((a, b) => b.total_revenue - a.total_revenue);

    res.json({
      popular_plans,
      revenue_by_school,
      avg_turnaround_hours,
      peak_pickup_days,
      completion_rate,
      total_orders
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/analysis/reports', async (req, res) => {
  try {
    if (!['admin', 'head_admin'].includes(req.user.role)) return res.status(403).json({ error: 'Head Admin only' });
    const type = req.query.type ? String(req.query.type) : null;
    const limit = Math.min(Number(req.query.limit || 10), 50);
    const where = {};
    if (type) where.period_type = type;
    const snapshots = await AnalyticsSnapshot.findAll({
      where,
      order: [['created_at', 'DESC']],
      limit
    });
    const result = snapshots.map((s) => {
      let metrics = null;
      try {
        metrics = JSON.parse(s.metrics);
      } catch {
        metrics = null;
      }
      return { ...s.toJSON(), metrics };
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Orders
router.post('/orders', async (req, res) => {
    try {
        if (!['admin', 'receptionist'].includes(req.user.role)) return res.status(403).json({ error: 'Unauthorized' });
        
        const { user_id, pickup_date, pickup_time, clothes_count, extra_clothes_count, notes, pickup_address, delivery_address } = req.body;
        
        const order = await Order.create({
            user_id,
            pickup_date,
            pickup_time,
            clothes_count: clothes_count || 0,
            extra_clothes_count: extra_clothes_count || 0,
            notes,
            pickup_address,
            delivery_address,
            status: 'pending'
        });
        await createSyncEvent({
          actor_user_id: req.user.user_id,
          target_user_id: order.user_id,
          source: 'admin',
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
          critical: true
        });
        sse.broadcast('order_created', order);
        emitPickupSync(req, 'created', order, { status: order.status });
        res.status(201).json(order);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/orders', async (req, res) => {
  try {
    const { status, user_id, start_date, end_date } = req.query;
    const where = {};
    if (status) where.status = status;
    if (user_id) where.user_id = user_id;
    if (start_date && end_date) {
        where.created_at = { [Op.between]: [new Date(start_date), new Date(end_date)] };
    }
    
    const orders = await Order.findAll({ 
        where, 
        include: [
            { model: User, attributes: ['full_name', 'phone_number', 'email', 'avatar_url'] },
            { model: User, as: 'Rider', attributes: ['full_name', 'phone_number'] },
            { model: Code }
        ],
        order: [['created_at', 'DESC']]
    });
    const result = orders.map((order) => {
        const json = order.toJSON();
        const codes = json.Codes || [];
        const pickup = codes.find((c) => c.type === 'pickup' && c.status === 'active') || codes.find((c) => c.type === 'pickup');
        const delivery = codes.find((c) => c.type === 'release' && c.status === 'active') || codes.find((c) => c.type === 'release');
        json.pickup_code = pickup ? pickup.code_value : null;
        json.delivery_code = delivery ? delivery.code_value : null;
        return json;
    });
    console.log('Admin orders fetched', { count: result.length, status, user_id, start_date, end_date });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});



router.put('/orders/:id/status', async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const { status, code_value, version } = req.body;
        const order = await Order.findByPk(id, { transaction: t });
        if (!order) {
            await t.rollback();
            return res.status(404).json({ error: 'Order not found' });
        }
        const actor = await User.findByPk(req.user.user_id, { transaction: t });
        const staffEmailQueue = [];
        const adminEmailQueue = [];

        // Conflict Resolution (Optimistic Locking)
        if (version !== undefined && order.version !== version) {
            console.log(`[Admin] Version conflict for order ${id}: DB=${order.version}, Req=${version}`);
            await t.rollback();
            return res.status(409).json({ error: 'Data has changed. Please refresh.', current_version: order.version });
        }

        // Washer Role Restrictions
        if (req.user.role === 'washer') {
            console.log(`[Admin] Washer ${req.user.user_id} updating order ${id} from ${order.status} to ${status}`);
            if (order.status !== 'processing' || status !== 'ready') {
                console.log(`[Admin] Washer blocked: Invalid transition.`);
                await t.rollback();
                return res.status(403).json({ error: 'Washers can only update status from Processing to Ready' });
            }
        }
        
        // Validation for restricted statuses
        if (['picked_up', 'delivered'].includes(status)) {
            // Receptionist MUST provide code. Admin might override (not implemented here yet, assuming code provided or bypass via other endpoint)
            // Actually, let's enforce code if code_value is provided, or if user is receptionist.
            // Requirement: "Pickup or delivery MUST require correct code"
            
            if (req.user.role === 'receptionist' || code_value) {
                 if (!code_value) {
                     await t.rollback();
                     return res.status(400).json({ error: 'Code required for this status change' });
                 }
                 
                 const type = status === 'picked_up' ? 'pickup' : 'release';
                 const code = await Code.findOne({ 
                     where: { order_id: id, type, code_value, status: 'active' },
                     transaction: t
                 });
                 
                 if (!code) {
                     await t.rollback();
                     return res.status(400).json({ error: `Invalid ${type} code` });
                 }
                 
                 code.status = 'used';
                 await code.save({ transaction: t });
            }
        }
        
        const oldStatus = order.status;
        order.status = status;
        if (status === 'delivered') order.completed_at = new Date();
        await order.save({ transaction: t });
        await createSyncEvent({
          actor_user_id: req.user.user_id,
          target_user_id: order.user_id,
          source: 'admin',
          entity_type: 'order',
          entity_id: order.order_id,
          action: 'status_update',
          payload: {
            from: oldStatus,
            to: status,
            version: order.version
          },
          critical: true,
          transaction: t
        });
        
        // AUTO-GENERATE CODES IF ACCEPTED
        if (status === 'accepted') {
            await ensureOrderCodes(id, req.user.user_id, t);
        }

        // Chat System Message Injection
        await injectChatSystemMessage(order, status, t, req.app.get('io'));
        
        await AuditLog.create({ 
            actor_user_id: req.user.user_id, 
            action: 'update_status', 
            entity_type: 'order', 
            entity_id: String(id), 
            details: `${oldStatus} -> ${status}` 
        }, { transaction: t });
        
        // Notify user
        if (['accepted', 'ready', 'picked_up', 'delivered'].includes(status)) {
            const title = status === 'accepted' ? 'Order Accepted' : 'Order Update';
            const message = status === 'accepted' ? 'Your order has been accepted!' : `Your order is now ${status}`;
            await Notification.create({ user_id: order.user_id, title, message, channel: 'app' }, { transaction: t });
        }

        if (actor && isStaffRole(actor.role)) {
          await notifyUserInApp(actor.user_id, 'Order updated', `You updated order ${order.order_id} to ${status}.`, 'order_update', t);
          staffEmailQueue.push({
            user: actor,
            title: 'Order updated',
            message: `You updated order ${order.order_id} to ${status}.`,
            action: 'order_update_actor',
            meta: { status }
          });
        }

        if (status === 'accepted') {
          if (order.assigned_rider_id) {
            const rider = await User.findByPk(order.assigned_rider_id, { transaction: t });
            if (rider) {
              await notifyUserInApp(rider.user_id, 'Order assigned', `Order ${order.order_id} has been assigned to you for pickup.`, 'order_update', t);
              staffEmailQueue.push({
                user: rider,
                title: 'Order assigned',
                message: `Order ${order.order_id} has been assigned to you for pickup.`,
                action: 'order_assigned',
                meta: { status }
              });
            }
          }
          await notifyAdmins({
            title: 'Order accepted',
            message: `Order ${order.order_id} accepted.`,
            action: 'order_accepted',
            meta: { status },
            actorUserId: req.user.user_id,
            transaction: t,
            skipEmail: true
          });
          adminEmailQueue.push({
            title: 'Order accepted',
            message: `Order ${order.order_id} accepted.`,
            action: 'order_accepted',
            meta: { status }
          });
        }

        if (status === 'picked_up') {
          const washers = await notifyRoleUsers({
            role: 'washer',
            title: 'Order picked up',
            message: `Order ${order.order_id} has been picked up and is ready for processing.`,
            eventType: 'order_update',
            transaction: t
          });
          washers.forEach((washer) => {
            staffEmailQueue.push({
              user: washer,
              title: 'Order picked up',
              message: `Order ${order.order_id} has been picked up and is ready for processing.`,
              action: 'order_picked_up',
              meta: { status }
            });
          });
          await notifyAdmins({
            title: 'Order picked up',
            message: `Order ${order.order_id} picked up.`,
            action: 'order_picked_up',
            meta: { status },
            actorUserId: req.user.user_id,
            transaction: t,
            skipEmail: true
          });
          adminEmailQueue.push({
            title: 'Order picked up',
            message: `Order ${order.order_id} picked up.`,
            action: 'order_picked_up',
            meta: { status }
          });
        }

        if (status === 'ready') {
          if (order.assigned_rider_id) {
            const rider = await User.findByPk(order.assigned_rider_id, { transaction: t });
            if (rider) {
              await notifyUserInApp(rider.user_id, 'Order ready', `Order ${order.order_id} is ready for delivery.`, 'order_update', t);
              staffEmailQueue.push({
                user: rider,
                title: 'Order ready',
                message: `Order ${order.order_id} is ready for delivery.`,
                action: 'order_ready',
                meta: { status }
              });
            }
          }
          await notifyAdmins({
            title: 'Order ready',
            message: `Order ${order.order_id} marked ready.`,
            action: 'order_ready',
            meta: { status },
            actorUserId: req.user.user_id,
            transaction: t,
            skipEmail: true
          });
          adminEmailQueue.push({
            title: 'Order ready',
            message: `Order ${order.order_id} marked ready.`,
            action: 'order_ready',
            meta: { status }
          });
        }

        if (status === 'delivered') {
          const receptionists = await notifyRoleUsers({
            role: 'receptionist',
            title: 'Order delivered',
            message: `Order ${order.order_id} has been delivered.`,
            eventType: 'order_update',
            transaction: t
          });
          receptionists.forEach((receptionist) => {
            staffEmailQueue.push({
              user: receptionist,
              title: 'Order delivered',
              message: `Order ${order.order_id} has been delivered.`,
              action: 'order_delivered',
              meta: { status }
            });
          });
          await notifyAdmins({
            title: 'Order delivered',
            message: `Order ${order.order_id} delivered.`,
            action: 'order_delivered',
            meta: { status },
            actorUserId: req.user.user_id,
            transaction: t,
            skipEmail: true
          });
          adminEmailQueue.push({
            title: 'Order delivered',
            message: `Order ${order.order_id} delivered.`,
            action: 'order_delivered',
            meta: { status }
          });
        }
        
        await t.commit();
        sse.broadcast('order_updated', order);
        emitPickupSync(req, 'status_update', order, { from: oldStatus, to: status });
        try {
            const user = await User.findByPk(order.user_id);
            await queueOrderStatusEmail({
                user,
                order,
                status,
                source: 'admin',
                actorUserId: req.user.user_id
            });
            const userName = user ? (user.full_name || user.email || `User ${order.user_id}`) : `User ${order.user_id}`;
            const baseMeta = { userName, orderId: order.order_id, status };
            await Promise.all(staffEmailQueue.map((entry) => {
              const meta = { ...baseMeta, ...(entry.meta || {}) };
              const text = buildStaffEmail(entry.title, entry.message, meta);
              return queueEmailNotification({
                action: entry.action,
                entityId: `order:${entry.action}:${entry.user.user_id}:${Date.now()}`,
                to: entry.user.email,
                subject: entry.title,
                text,
                html: null,
                userId: entry.user.user_id,
                meta,
                source: 'admin',
                actorUserId: req.user.user_id
              });
            }));
            await Promise.all(adminEmailQueue.map((entry) => {
              const meta = { ...baseMeta, ...(entry.meta || {}) };
              const text = buildStaffEmail(entry.title, entry.message, meta);
              return notifyAdmins({
                title: entry.title,
                message: entry.message,
                subject: entry.title,
                text,
                action: entry.action,
                meta,
                actorUserId: req.user.user_id,
                skipInApp: true
              });
            }));
        } catch (e) {
            console.error('Order email queue failed:', e.message);
        }
        res.json(order);
    } catch (e) { 
        await t.rollback();
        res.status(500).json({ error: e.message }); 
    }
});

router.post('/orders/:id/accept', async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const { rider_id, version } = req.body;
        const order = await Order.findByPk(id, { transaction: t });
        if (!order) {
            await t.rollback();
            return res.status(404).json({ error: 'Order not found' });
        }
        
        // Conflict Resolution (Optimistic Locking)
        if (version !== undefined && order.version !== version) {
            await t.rollback();
            return res.status(409).json({ error: 'Data has changed. Please refresh.', current_version: order.version });
        }
        
        order.status = 'accepted';
        order.assigned_rider_id = rider_id;
        await order.save({ transaction: t });
        await createSyncEvent({
          actor_user_id: req.user.user_id,
          target_user_id: order.user_id,
          source: 'admin',
          entity_type: 'order',
          entity_id: order.order_id,
          action: 'status_update',
          payload: {
            to: 'accepted',
            assigned_rider_id: rider_id || null,
            version: order.version
          },
          critical: true,
          transaction: t
        });
        const actor = await User.findByPk(req.user.user_id, { transaction: t });
        const staffEmailQueue = [];
        const adminEmailQueue = [];
        
        await ensureOrderCodes(id, req.user.user_id, t);
        
        await Notification.create({ user_id: order.user_id, title: 'Order Accepted', message: 'Your order has been accepted!', channel: 'app' }, { transaction: t });
        if (actor && isStaffRole(actor.role)) {
          await notifyUserInApp(actor.user_id, 'Order accepted', `You accepted order ${order.order_id}.`, 'order_update', t);
          staffEmailQueue.push({
            user: actor,
            title: 'Order accepted',
            message: `You accepted order ${order.order_id}.`,
            action: 'order_accepted_actor',
            meta: { status: 'accepted' }
          });
        }
        if (rider_id) {
          const rider = await User.findByPk(rider_id, { transaction: t });
          if (rider) {
            await notifyUserInApp(rider.user_id, 'Order assigned', `Order ${order.order_id} has been assigned to you for pickup.`, 'order_update', t);
            staffEmailQueue.push({
              user: rider,
              title: 'Order assigned',
              message: `Order ${order.order_id} has been assigned to you for pickup.`,
              action: 'order_assigned',
              meta: { status: 'accepted' }
            });
          }
        }
        await notifyAdmins({
          title: 'Order accepted',
          message: `Order ${order.order_id} accepted.`,
          action: 'order_accepted',
          meta: { status: 'accepted' },
          actorUserId: req.user.user_id,
          transaction: t,
          skipEmail: true
        });
        adminEmailQueue.push({
          title: 'Order accepted',
          message: `Order ${order.order_id} accepted.`,
          action: 'order_accepted',
          meta: { status: 'accepted' }
        });
        
        // Chat System Message Injection
        await injectChatSystemMessage(order, 'accepted', t, req.app.get('io'));

        await t.commit();
        sse.broadcast('order_updated', order);
        emitPickupSync(req, 'status_update', order, { to: 'accepted', assigned_rider_id: rider_id || null });
        try {
            const user = await User.findByPk(order.user_id);
            await queueOrderStatusEmail({
                user,
                order,
                status: 'accepted',
                source: 'admin',
                actorUserId: req.user.user_id
            });
            const userName = user ? (user.full_name || user.email || `User ${order.user_id}`) : `User ${order.user_id}`;
            const baseMeta = { userName, orderId: order.order_id, status: 'accepted' };
            await Promise.all(staffEmailQueue.map((entry) => {
              const meta = { ...baseMeta, ...(entry.meta || {}) };
              const text = buildStaffEmail(entry.title, entry.message, meta);
              return queueEmailNotification({
                action: entry.action,
                entityId: `order:${entry.action}:${entry.user.user_id}:${Date.now()}`,
                to: entry.user.email,
                subject: entry.title,
                text,
                html: null,
                userId: entry.user.user_id,
                meta,
                source: 'admin',
                actorUserId: req.user.user_id
              });
            }));
            await Promise.all(adminEmailQueue.map((entry) => {
              const meta = { ...baseMeta, ...(entry.meta || {}) };
              const text = buildStaffEmail(entry.title, entry.message, meta);
              return notifyAdmins({
                title: entry.title,
                message: entry.message,
                subject: entry.title,
                text,
                action: entry.action,
                meta,
                actorUserId: req.user.user_id,
                skipInApp: true
              });
            }));
        } catch (e) {
            console.error('Order email queue failed:', e.message);
        }
        res.json(order);
    } catch (e) { 
        await t.rollback();
        res.status(500).json({ error: e.message }); 
    }
});

router.put('/orders/:id', async (req, res) => {
  try {
    if (!['admin', 'head_admin'].includes(req.user.role)) return res.status(403).json({ error: 'Head Admin only' });
    const { id } = req.params;
    const order = await Order.findByPk(id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    
    const { clothes_count, extra_clothes_count, pickup_date, pickup_time, notes, rider_id, pickup_code, version } = req.body;
    const changedFields = {};

    // Conflict Resolution
    if (version !== undefined && order.version !== version) {
        return res.status(409).json({ error: 'Data has changed. Please refresh.', current_version: order.version });
    }

    if (clothes_count !== undefined) {
        order.clothes_count = clothes_count;
        changedFields.clothes_count = clothes_count;
    }
    if (extra_clothes_count !== undefined) {
        order.extra_clothes_count = extra_clothes_count;
        changedFields.extra_clothes_count = extra_clothes_count;
    }
    if (pickup_date !== undefined) {
        order.pickup_date = pickup_date;
        changedFields.pickup_date = pickup_date;
    }
    if (pickup_time !== undefined) {
        order.pickup_time = pickup_time;
        changedFields.pickup_time = pickup_time;
    }
    if (notes !== undefined) {
        order.notes = notes;
        changedFields.notes = notes;
    }
    if (rider_id !== undefined) {
        order.assigned_rider_id = rider_id;
        changedFields.assigned_rider_id = rider_id;
    }

    if (pickup_code !== undefined) {
        let code = await Code.findOne({ where: { order_id: id, type: 'pickup', status: 'active' } });
        if (code) {
            if (code.code_value !== pickup_code) {
                code.code_value = pickup_code;
                await code.save();
                await AuditLog.create({ actor_user_id: req.user.user_id, action: 'UPDATE_CODE', entity_type: 'code', entity_id: String(code.code_id), details: `Changed to ${pickup_code}` });
            }
        } else {
             await Code.create({
                order_id: id,
                code_value: pickup_code,
                type: 'pickup',
                status: 'active',
                expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            });
            await AuditLog.create({ actor_user_id: req.user.user_id, action: 'create_code_manual', entity_type: 'order', entity_id: String(id), details: `Manual code: ${pickup_code}` });
        }
        changedFields.pickup_code = pickup_code;
    }
    
    await order.save();
    if (Object.keys(changedFields).length) {
      await createSyncEvent({
        actor_user_id: req.user.user_id,
        target_user_id: order.user_id,
        source: 'admin',
        entity_type: 'order',
        entity_id: order.order_id,
        action: 'update',
        payload: {
          fields: changedFields,
          version: order.version
        },
        critical: true
      });
    }
    
    sse.broadcast('order_updated', order);
    emitPickupSync(req, 'update', order, { fields: changedFields });
    
    await AuditLog.create({ actor_user_id: req.user.user_id, action: 'edit_order', entity_type: 'order', entity_id: String(id), details: 'Admin edit' });
    await Notification.create({ user_id: order.user_id, title: 'Order Modified', message: 'Admin updated your order details.', channel: 'app' });
    
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/orders/:id/release', async (req, res) => {
  try {
    const { id } = req.params;
    const { code_value, override, version } = req.body;
    const order = await Order.findByPk(id, { include: [Code] });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    
    // Conflict Resolution (Optimistic Locking)
    if (version !== undefined && order.version !== version) {
        return res.status(409).json({ error: 'Data has changed. Please refresh.', current_version: order.version });
    }

    if (order.status !== 'ready' && !override) return res.status(400).json({ error: 'Order not ready' });
    
    if (!override) {
      if (!code_value) return res.status(400).json({ error: 'Code required' });
      const code = await Code.findOne({ where: { order_id: id, type: 'release', code_value, status: 'active' } });
      
      if (!code) {
        // SECURITY: Log invalid code attempt
        await AuditLog.create({
            actor_user_id: req.user.user_id,
            action: 'code_misuse',
            entity_type: 'order',
            entity_id: String(id),
            details: `Invalid code attempt: ${code_value}`
        });
        return res.status(400).json({ error: 'Invalid code' });
      }
      
      code.status = 'used';
      await code.save();
    } else {
       if (!['admin', 'head_admin'].includes(req.user.role) && req.user.role !== 'receptionist') return res.status(403).json({ error: 'Unauthorized' });
    }
    
    order.status = 'delivered';
    order.completed_at = new Date();
    await order.save();
    await createSyncEvent({
      actor_user_id: req.user.user_id,
      target_user_id: order.user_id,
      source: 'admin',
      entity_type: 'order',
      entity_id: order.order_id,
      action: 'status_update',
      payload: {
        to: 'delivered',
        version: order.version
      },
      critical: true
    });
    const actor = await User.findByPk(req.user.user_id);
    const staffEmailQueue = [];
    const adminEmailQueue = [];
    
    sse.broadcast('order_updated', order);
    emitPickupSync(req, 'status_update', order, { to: 'delivered' });
    
    await AuditLog.create({ actor_user_id: req.user.user_id, action: 'release_order', entity_type: 'order', entity_id: String(id), details: override ? 'override' : 'code' });
    await Notification.create({ user_id: order.user_id, message: 'Order delivered.', channel: 'app' });
    if (actor && isStaffRole(actor.role)) {
      await notifyUserInApp(actor.user_id, 'Order delivered', `You delivered order ${order.order_id}.`, 'order_update');
      staffEmailQueue.push({
        user: actor,
        title: 'Order delivered',
        message: `You delivered order ${order.order_id}.`,
        action: 'order_delivered_actor',
        meta: { status: 'delivered' }
      });
    }
    const receptionists = await notifyRoleUsers({
      role: 'receptionist',
      title: 'Order delivered',
      message: `Order ${order.order_id} has been delivered.`,
      eventType: 'order_update'
    });
    receptionists.forEach((receptionist) => {
      staffEmailQueue.push({
        user: receptionist,
        title: 'Order delivered',
        message: `Order ${order.order_id} has been delivered.`,
        action: 'order_delivered',
        meta: { status: 'delivered' }
      });
    });
    await notifyAdmins({
      title: 'Order delivered',
      message: `Order ${order.order_id} delivered.`,
      action: 'order_delivered',
      meta: { status: 'delivered' },
      actorUserId: req.user.user_id,
      skipEmail: true
    });
    adminEmailQueue.push({
      title: 'Order delivered',
      message: `Order ${order.order_id} delivered.`,
      action: 'order_delivered',
      meta: { status: 'delivered' }
    });
    if (order.assigned_rider_id) {
      const rider = await User.findByPk(order.assigned_rider_id);
      if (rider) {
        await notifyUserInApp(rider.user_id, 'Chat locked', `Chat was locked after delivery for order ${order.order_id}.`, 'chat');
        staffEmailQueue.push({
          user: rider,
          title: 'Chat locked',
          message: `Chat was locked after delivery for order ${order.order_id}.`,
          action: 'chat_locked',
          meta: { status: 'delivered' }
        });
      }
    }
    if (receptionists.length) {
      await Promise.all(receptionists.map((receptionist) => (
        notifyUserInApp(receptionist.user_id, 'Chat locked', `Chat was locked after delivery for order ${order.order_id}.`, 'chat')
      )));
    }
    await notifyAdmins({
      title: 'Chat locked',
      message: `Chat locked after delivery for order ${order.order_id}.`,
      action: 'chat_locked',
      meta: { status: 'delivered' },
      actorUserId: req.user.user_id,
      skipEmail: true
    });
    adminEmailQueue.push({
      title: 'Chat locked',
      message: `Chat locked after delivery for order ${order.order_id}.`,
      action: 'chat_locked',
      meta: { status: 'delivered' }
    });
    
    // WhatsApp Automation
    const user = await User.findByPk(order.user_id);
    if (user && user.phone_number) {
        await IntegrationService.sendWhatsApp(user.phone_number, 'Your order has been delivered. Thank you for choosing 3R Laundry!');
    }

    try {
        await queueOrderStatusEmail({
            user,
            order,
            status: 'delivered',
            source: 'admin',
            actorUserId: req.user.user_id
        });
        const userName = user ? (user.full_name || user.email || `User ${order.user_id}`) : `User ${order.user_id}`;
        const baseMeta = { userName, orderId: order.order_id, status: 'delivered' };
        await Promise.all(staffEmailQueue.map((entry) => {
          const meta = { ...baseMeta, ...(entry.meta || {}) };
          const text = buildStaffEmail(entry.title, entry.message, meta);
          return queueEmailNotification({
            action: entry.action,
            entityId: `order:${entry.action}:${entry.user.user_id}:${Date.now()}`,
            to: entry.user.email,
            subject: entry.title,
            text,
            html: null,
            userId: entry.user.user_id,
            meta,
            source: 'admin',
            actorUserId: req.user.user_id
          });
        }));
        await Promise.all(adminEmailQueue.map((entry) => {
          const meta = { ...baseMeta, ...(entry.meta || {}) };
          const text = buildStaffEmail(entry.title, entry.message, meta);
          return notifyAdmins({
            title: entry.title,
            message: entry.message,
            subject: entry.title,
            text,
            action: entry.action,
            meta,
            actorUserId: req.user.user_id,
            skipInApp: true
          });
        }));
    } catch (e) {
        console.error('Order email queue failed:', e.message);
    }

    res.json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/orders/:id/code', async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Order.findByPk(id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    
    const existing = await Code.findOne({ where: { order_id: id, type: 'release', status: 'active' } });
    const codeRecord = existing || await createUniqueCode({
        order_id: id,
        type: 'release',
        status: 'active',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    });
    
    await Notification.create({ user_id: order.user_id, message: `Order READY! Code: ${codeRecord.code_value}`, channel: 'app' });
    
    // WhatsApp Automation
    const user = await User.findByPk(order.user_id);
    if (user && user.phone_number) {
        await IntegrationService.sendWhatsApp(user.phone_number, `Order READY! Your collection code is: ${codeRecord.code_value}`);
    }

    try {
        await queueOrderStatusEmail({
            user,
            order,
            status: 'ready',
            source: 'admin',
            actorUserId: req.user.user_id
        });
    } catch (e) {
        console.error('Order email queue failed:', e.message);
    }

    res.json({ code: codeRecord.code_value });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Verify code (Receptionist/Admin)
router.post('/orders/:id/notify', async (req, res) => {
    try {
        const { id } = req.params;
        const order = await Order.findByPk(id);
        if (!order) return res.status(404).json({ error: 'Order not found' });
        
        // Authorization
        if (!['admin', 'receptionist', 'rider'].includes(req.user.role)) {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        
        let message = '';
        let title = 'Order Update';
        
        if (order.status === 'accepted') {
            message = 'Your rider is around to pick up your laundry. Please get ready.';
            title = 'Rider Arriving';
        } else if (order.status === 'ready') {
            message = 'Your rider is at your location to deliver your laundry. Please come out.';
            title = 'Rider Arriving';
        } else {
             return res.status(400).json({ error: 'Notification not available for this status' });
        }

        await Notification.create({ 
            user_id: order.user_id, 
            title, 
            message, 
            channel: 'app' 
        });
        
        // Broadcast event to trigger client updates if they are listening to general events
        // Using a custom event type that clients might not listen to yet, but it's safe.
        // Or reuse 'order_updated' to force refresh? No, that's bad.
        // For now, relying on polling as per existing 'Notification' architecture.
        
        res.json({ success: true, message });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/codes/verify', async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { code_value, expected_order_id, version } = req.body;
        if (!code_value) return res.status(400).json({ error: 'Code required' });
        
        // Find code
        const code = await Code.findOne({ 
            where: { code_value, status: 'active' },
            transaction: t
        });
        
        if (!code) {
            await t.rollback();
             // SECURITY: Log invalid code attempt
             await AuditLog.create({
                actor_user_id: req.user.user_id,
                action: 'code_misuse_global',
                entity_type: 'code',
                entity_id: 'unknown',
                details: `Invalid code attempt: ${code_value}`
            });
            return res.status(400).json({ error: 'Invalid or expired code' });
        }
        
        // Optional: Verify order ID matches if provided (e.g. from specific order screen)
        if (expected_order_id && String(code.order_id) !== String(expected_order_id)) {
            await t.rollback();
            return res.status(400).json({ error: 'Code is valid but belongs to a different order!' });
        }

        // Find order
        const order = await Order.findByPk(code.order_id, { transaction: t });
        if (!order) {
            await t.rollback();
            return res.status(404).json({ error: 'Order not found for code' });
        }
        
        // Optimistic Locking Check
        if (version !== undefined && order.version !== version) {
            await t.rollback();
            return res.status(409).json({ 
                error: 'Order has been modified by another user. Please refresh.',
                current_version: order.version 
            });
        }

        // Logic based on code type
        let newStatus = null;
        if (code.type === 'pickup') {
            if (order.status !== 'accepted') {
                 await t.rollback();
                 return res.status(400).json({ error: `Order is ${order.status}, cannot pickup (must be 'accepted')` });
            }
            newStatus = 'picked_up';
        } else if (code.type === 'release') {
            if (order.status !== 'ready') {
                await t.rollback();
                return res.status(400).json({ error: `Order is ${order.status}, cannot deliver (must be 'ready')` });
            }
            newStatus = 'delivered';
            order.completed_at = new Date();
        }
        
        // Update Order
        const oldStatus = order.status;
        order.status = newStatus;
        await order.save({ transaction: t });
        await createSyncEvent({
          actor_user_id: req.user.user_id,
          target_user_id: order.user_id,
          source: 'admin',
          entity_type: 'order',
          entity_id: order.order_id,
          action: 'status_update',
          payload: {
            from: oldStatus,
            to: newStatus,
            version: order.version
          },
          critical: true,
          transaction: t
        });
        
        // Expire Code
        code.status = 'used';
        await code.save({ transaction: t });
        
        // Chat System Message Injection
        await injectChatSystemMessage(order, newStatus, t, req.app.get('io'));

        // Log & Notify
        await AuditLog.create({ 
            actor_user_id: req.user.user_id, 
            action: code.type === 'pickup' ? 'pickup_with_code' : 'release_with_code', 
            entity_type: 'order', 
            entity_id: String(order.order_id), 
            details: `Code: ${code_value}` 
        }, { transaction: t });
        
        const msg = code.type === 'pickup' ? 'Order picked up.' : 'Order delivered.';
        await Notification.create({ user_id: order.user_id, title: 'Order Update', message: msg, channel: 'app' }, { transaction: t });
        
        if (code.type === 'release') {
             const user = await User.findByPk(order.user_id, { transaction: t });
             if (user && user.phone_number) {
                 await IntegrationService.sendWhatsApp(user.phone_number, 'Your order has been delivered. Thank you!');
             }
        }
        
        await t.commit();
        sse.broadcast('order_updated', order);
        emitPickupSync(req, 'status_update', order, { from: oldStatus, to: newStatus });
        try {
            const user = await User.findByPk(order.user_id);
            await queueOrderStatusEmail({
                user,
                order,
                status: newStatus,
                source: 'admin',
                actorUserId: req.user.user_id
            });
        } catch (e) {
            console.error('Order email queue failed:', e.message);
        }
        res.json({ success: true, order, type: code.type });
        
    } catch (e) {
        await t.rollback();
        res.status(500).json({ error: e.message });
    }
});

// Users
router.get('/users', async (req, res) => {
    try {
        if (!['admin', 'head_admin'].includes(req.user.role)) return res.status(403).json({ error: 'Head Admin only' });
        const page = Math.max(Number(req.query.page || 1), 1);
        const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);
        const offset = (page - 1) * limit;
        const sortKey = String(req.query.sort_by || 'created_at');
        const sortOrder = String(req.query.sort_order || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
        const sortMap = {
            full_name: 'full_name',
            email: 'email',
            phone_number: 'phone_number',
            role: 'role',
            status: 'status',
            school: 'school',
            student_id: 'student_id',
            hostel_address: 'hostel_address',
            created_at: 'created_at'
        };
        const order = [[sortMap[sortKey] || 'created_at', sortOrder]];

        const where = { is_deleted: false };
        const role = req.query.role ? String(req.query.role).trim() : '';
        if (role && role !== 'all') where.role = role;
        const status = req.query.status ? String(req.query.status).trim() : '';
        if (status && status !== 'all') where.status = status;
        const school = req.query.school ? String(req.query.school).trim() : '';
        if (school) {
            const schoolLower = school.toLowerCase();
            where.school = sequelize.where(
                sequelize.fn('LOWER', sequelize.col('school')),
                { [Op.like]: `%${schoolLower}%` }
            );
        }

        const search = req.query.search ? String(req.query.search).trim().toLowerCase() : '';
        if (search) {
            where[Op.or] = [
                sequelize.where(sequelize.fn('LOWER', sequelize.col('full_name')), { [Op.like]: `%${search}%` }),
                sequelize.where(sequelize.fn('LOWER', sequelize.col('email')), { [Op.like]: `%${search}%` }),
                sequelize.where(sequelize.fn('LOWER', sequelize.col('phone_number')), { [Op.like]: `%${search}%` }),
                sequelize.where(sequelize.fn('LOWER', sequelize.col('school')), { [Op.like]: `%${search}%` }),
                sequelize.where(sequelize.fn('LOWER', sequelize.col('student_id')), { [Op.like]: `%${search}%` }),
                sequelize.where(sequelize.fn('LOWER', sequelize.col('hostel_address')), { [Op.like]: `%${search}%` })
            ];
        }

        const { rows, count } = await User.findAndCountAll({
            where,
            order,
            limit,
            offset
        });
        const pages = Math.max(1, Math.ceil(count / limit));
        res.json({
            items: rows,
            meta: { total: count, page, pages, limit }
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/users/:id/view', async (req, res) => {
    try {
        if (!['admin', 'head_admin'].includes(req.user.role)) return res.status(403).json({ error: 'Head Admin only' });
        const user = await User.findByPk(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        await AuditLog.create({
            actor_user_id: req.user.user_id,
            action: 'user_details_viewed',
            entity_type: 'user',
            entity_id: String(user.user_id),
            details: 'User details viewed in admin'
        });
        res.json({ message: 'Logged' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// User Creation Handler
const createUserHandler = async (req, res) => {
    try {
        if (!['admin', 'head_admin'].includes(req.user.role)) return res.status(403).json({ error: 'Head Admin only' });
        
        const { full_name, email, phone_number, password, role, status, school, student_id, hostel_address } = req.body;
        
        // Validation
        if (!full_name || !phone_number || !password) {
            return res.status(400).json({ error: 'Full name, phone number and password are required' });
        }
        const phoneResult = normalizeNigerianPhone(phone_number);
        if (phoneResult.error) {
            return res.status(400).json({ error: phoneResult.error, code: 'invalid_phone' });
        }
        
        // Check duplicates
        const existingPhone = await User.findOne({ where: { phone_number: { [Op.in]: [phoneResult.normalized, phoneResult.local] } } });
        if (existingPhone) return res.status(400).json({ error: 'Phone number already registered' });
        
        // Handle email (empty string -> null to respect unique constraint)
        const emailValue = normalizeEmail(email);
        if (emailValue) {
            const existingEmail = await User.findOne({ where: { email: emailValue } });
            if (existingEmail) return res.status(400).json({ error: 'Email already registered' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const resolvedRole = role || 'student';
        let cleanSchool = school ? String(school).trim() : null;
        if (cleanSchool) {
            const match = await School.findOne({ where: { school_name: cleanSchool, active: true } });
            if (!match) return res.status(400).json({ error: 'Selected school is not available', code: 'invalid_school' });
            cleanSchool = match.school_name;
        }
        const user = await User.create({
            full_name,
            phone_number: phoneResult.normalized,
            email: emailValue,
            password: hashedPassword,
            role: resolvedRole,
            status: status || 'active',
            email_verified: resolvedRole !== 'student',
            email_verified_at: resolvedRole !== 'student' ? new Date() : null,
            school: cleanSchool,
            student_id: student_id || null,
            hostel_address: hostel_address || null
        });
        const actor = await User.findByPk(req.user.user_id);
        const meta = { details: `${user.full_name || user.user_id} (${user.role})` };
        if (actor && isStaffRole(actor.role)) {
            await notifyUserInApp(actor.user_id, 'User created', `You created user ${user.user_id}.`, 'system');
            const text = buildStaffEmail('User created', `User ${user.user_id} created.`, meta);
            await queueEmailNotification({
                action: 'user_created_actor',
                entityId: `user:created:actor:${actor.user_id}:${user.user_id}`,
                to: actor.email,
                subject: 'User created',
                text,
                html: null,
                userId: actor.user_id,
                meta,
                source: 'admin',
                actorUserId: req.user.user_id
            });
        }
        await notifyAdmins({
            title: 'User created',
            message: `User ${user.user_id} created.`,
            subject: 'User created',
            text: buildStaffEmail('User created', `User ${user.user_id} created.`, meta),
            action: 'user_created',
            meta,
            actorUserId: req.user.user_id
        });
        
        res.json(user);
    } catch (e) { res.status(500).json({ error: e.message }); }
};

router.post('/users', createUserHandler);
router.post('/staff', createUserHandler);

router.put('/users/:id', async (req, res) => {
    try {
        const user = await User.findByPk(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        const nextPayload = { ...req.body };
        // Prevent password overwrite without hash
        if (nextPayload.password) {
             // Password Complexity Check (if changing password)
             const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/;
             if (!passwordRegex.test(nextPayload.password)) {
                return res.status(400).json({ error: 'Password must be at least 8 characters long and contain both letters and numbers.' });
             }
             nextPayload.password = await bcrypt.hash(nextPayload.password, 10);
             nextPayload.token_version = (user.token_version || 0) + 1;
        }

        if (nextPayload.phone_number) {
            const phoneResult = normalizeNigerianPhone(nextPayload.phone_number);
            if (phoneResult.error) {
                return res.status(400).json({ error: phoneResult.error, code: 'invalid_phone' });
            }
            const existingPhone = await User.findOne({
                where: { 
                  phone_number: { [Op.in]: [phoneResult.normalized, phoneResult.local] },
                  user_id: { [Op.ne]: user.user_id }
                }
            });
            if (existingPhone) return res.status(400).json({ error: 'Phone number already registered' });
            nextPayload.phone_number = phoneResult.normalized;
        }
        if (nextPayload.email !== undefined) {
            const emailValue = normalizeEmail(nextPayload.email);
            if (emailValue) {
                const existingEmail = await User.findOne({
                    where: {
                        email: emailValue,
                        user_id: { [Op.ne]: user.user_id }
                    }
                });
                if (existingEmail) return res.status(400).json({ error: 'Email already registered' });
            }
            nextPayload.email = emailValue;
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
        
        const actor = await User.findByPk(req.user.user_id);
        const meta = { details: `${user.full_name || user.user_id} (${user.role})` };
        if (actor && isStaffRole(actor.role)) {
            await notifyUserInApp(actor.user_id, 'User updated', `You updated user ${user.user_id}.`, 'system');
            const text = buildStaffEmail('User updated', `User ${user.user_id} updated.`, meta);
            await queueEmailNotification({
                action: 'user_updated_actor',
                entityId: `user:updated:actor:${actor.user_id}:${user.user_id}`,
                to: actor.email,
                subject: 'User updated',
                text,
                html: null,
                userId: actor.user_id,
                meta,
                source: 'admin',
                actorUserId: req.user.user_id
            });
        }
        await notifyAdmins({
            title: 'User updated',
            message: `User ${user.user_id} updated.`,
            subject: 'User updated',
            text: buildStaffEmail('User updated', `User ${user.user_id} updated.`, meta),
            action: 'user_updated',
            meta,
            actorUserId: req.user.user_id
        });
        broadcastEvent('user_updated', user);
        
        res.json(user);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/users/:id/email/verify', async (req, res) => {
    try {
        if (!['admin', 'head_admin'].includes(req.user.role)) return res.status(403).json({ error: 'Head Admin only' });
        const user = await User.findByPk(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        await user.update({
            email_verified: true,
            email_verified_at: new Date(),
            email_verification_otp_hash: null,
            email_verification_expires_at: null
        });
        await AuditLog.create({
            actor_user_id: req.user.user_id,
            action: 'email_verified_admin',
            entity_type: 'user',
            entity_id: String(user.user_id),
            details: 'Email verified by admin'
        });
        await createSyncEvent({
            actor_user_id: req.user.user_id,
            target_user_id: user.user_id,
            source: 'admin',
            entity_type: 'profile',
            entity_id: user.user_id,
            action: 'email_verified',
            payload: { email_verified: true },
            critical: true
        });
        broadcastEvent('user_updated', user);
        res.json(user);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/users/:id/email/revoke', async (req, res) => {
    try {
        if (!['admin', 'head_admin'].includes(req.user.role)) return res.status(403).json({ error: 'Head Admin only' });
        const user = await User.findByPk(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        await user.update({
            email_verified: false,
            email_verified_at: null
        });
        await AuditLog.create({
            actor_user_id: req.user.user_id,
            action: 'email_revoked_admin',
            entity_type: 'user',
            entity_id: String(user.user_id),
            details: 'Email verification revoked by admin'
        });
        await createSyncEvent({
            actor_user_id: req.user.user_id,
            target_user_id: user.user_id,
            source: 'admin',
            entity_type: 'profile',
            entity_id: user.user_id,
            action: 'email_revoked',
            payload: { email_verified: false },
            critical: true
        });
        broadcastEvent('user_updated', user);
        res.json(user);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/users/:id/email/resend', async (req, res) => {
    try {
        if (!['admin', 'head_admin'].includes(req.user.role)) return res.status(403).json({ error: 'Head Admin only' });
        const user = await User.findByPk(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        if (!user.email) return res.status(400).json({ error: 'User has no email' });
        if (user.email_verified) return res.status(400).json({ error: 'Email already verified' });
        const otp = generateOtp();
        const otpHash = await bcrypt.hash(otp, 10);
        const expiresAt = otpExpiresAt();
        await user.update({
            email_verification_otp_hash: otpHash,
            email_verification_expires_at: expiresAt,
            email_verification_sent_at: new Date()
        });
        await IntegrationService.sendEmail(
            user.email,
            'Verify your email',
            `Your verification code is ${otp}. It expires in 10 minutes.`
        );
        await AuditLog.create({
            actor_user_id: req.user.user_id,
            action: 'email_verification_resent',
            entity_type: 'user',
            entity_id: String(user.user_id),
            details: 'Verification email resent by admin'
        });
        res.json({ message: 'Verification email sent' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/users/:id/phone/verify', async (req, res) => {
    try {
        if (!['admin', 'head_admin'].includes(req.user.role)) return res.status(403).json({ error: 'Head Admin only' });
        const user = await User.findByPk(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        await user.update({
            phone_verified: true,
            phone_verified_at: new Date(),
            phone_verified_by: req.user.user_id
        });
        await AuditLog.create({
            actor_user_id: req.user.user_id,
            action: 'phone_verified_admin',
            entity_type: 'user',
            entity_id: String(user.user_id),
            details: 'Phone verified by admin'
        });
        await createSyncEvent({
            actor_user_id: req.user.user_id,
            target_user_id: user.user_id,
            source: 'admin',
            entity_type: 'profile',
            entity_id: user.user_id,
            action: 'phone_verified',
            payload: { phone_verified: true },
            critical: true
        });
        broadcastEvent('user_updated', user);
        res.json(user);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/users/:id/phone/revoke', async (req, res) => {
    try {
        if (!['admin', 'head_admin'].includes(req.user.role)) return res.status(403).json({ error: 'Head Admin only' });
        const user = await User.findByPk(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        await user.update({
            phone_verified: false,
            phone_verified_at: null,
            phone_verified_by: null
        });
        await AuditLog.create({
            actor_user_id: req.user.user_id,
            action: 'phone_revoked_admin',
            entity_type: 'user',
            entity_id: String(user.user_id),
            details: 'Phone verification revoked by admin'
        });
        await createSyncEvent({
            actor_user_id: req.user.user_id,
            target_user_id: user.user_id,
            source: 'admin',
            entity_type: 'profile',
            entity_id: user.user_id,
            action: 'phone_revoked',
            payload: { phone_verified: false },
            critical: true
        });
        broadcastEvent('user_updated', user);
        res.json(user);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/password-resets', async (req, res) => {
    try {
        if (!['admin', 'head_admin'].includes(req.user.role)) return res.status(403).json({ error: 'Head Admin only' });
        const actions = ['password_reset_requested', 'password_reset_failed', 'password_reset_completed', 'password_reset_forced'];
        const logs = await AuditLog.findAll({
            where: { action: { [Op.in]: actions } },
            include: [User],
            order: [['created_at', 'DESC']],
            limit: 200
        });
        const mapped = logs.map((log) => ({
            log_id: log.log_id,
            user_id: log.entity_id,
            email: log.User?.email || null,
            action: log.action,
            status: log.action.includes('failed') ? 'failed' : log.action.includes('completed') ? 'success' : 'requested',
            created_at: log.created_at,
            details: log.details
        }));
        res.json(mapped);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/password-resets/force', async (req, res) => {
    try {
        if (!['admin', 'head_admin'].includes(req.user.role)) return res.status(403).json({ error: 'Head Admin only' });
        const cleanEmail = normalizeEmail(req.body?.email);
        const userId = req.body?.user_id;
        let user = null;
        if (userId) {
            user = await User.findByPk(userId);
        } else if (cleanEmail) {
            user = await User.findOne({ where: { email: cleanEmail } });
        }
        if (!user) return res.status(404).json({ error: 'User not found' });
        if (!user.email) return res.status(400).json({ error: 'User has no email' });
        const otp = generateOtp();
        const otpHash = await bcrypt.hash(otp, 10);
        const expiresAt = otpExpiresAt();
        await user.update({
            password_reset_otp_hash: otpHash,
            password_reset_expires_at: expiresAt,
            password_reset_requested_at: new Date()
        });
        await IntegrationService.sendEmail(
            user.email,
            'Password reset code',
            `Your password reset code is ${otp}. It expires in 10 minutes.`
        );
        await AuditLog.create({
            actor_user_id: req.user.user_id,
            action: 'password_reset_forced',
            entity_type: 'user',
            entity_id: String(user.user_id),
            details: 'Password reset forced by admin'
        });
        res.json({ message: 'Password reset code sent' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/users/:id', async (req, res) => {
    try {
        if (!['admin', 'head_admin'].includes(req.user.role)) return res.status(403).json({ error: 'Head Admin only' });
        const targetId = Number(req.params.id);
        if (Number.isNaN(targetId)) return res.status(400).json({ error: 'Invalid user id' });
        if (req.user.user_id === targetId) return res.status(400).json({ error: 'Cannot delete your own account' });
        const user = await User.findByPk(targetId);
        if (!user || user.is_deleted) return res.status(404).json({ error: 'User not found' });

        const activeOrders = await Order.count({
          where: { 
            user_id: targetId, 
            status: { [Op.in]: ['pending', 'accepted', 'picked_up', 'processing', 'ready'] } 
          }
        });
        if (activeOrders > 0) {
          return res.status(409).json({ error: 'User has active orders', code: 'active_orders' });
        }

        const now = new Date();
        const replacementPhone = `deleted-${targetId}-${Date.now()}`;

        await sequelize.transaction(async (t) => {
          await Notification.destroy({ where: { user_id: targetId }, transaction: t });

          await Subscription.update(
            { status: 'cancelled' },
            { 
              where: { 
                user_id: targetId, 
                status: { [Op.in]: ['active', 'pending', 'paused'] } 
              }, 
              transaction: t 
            }
          );

          await ChatThread.update(
            { status: 'locked', locked_at: now },
            { 
              where: { 
                [Op.or]: [{ user_id: targetId }, { staff_id: targetId }, { rider_id: targetId }] 
              }, 
              transaction: t 
            }
          );

          await user.update({
            full_name: 'Deleted User',
            email: null,
            phone_number: replacementPhone,
            student_id: null,
            school: null,
            hostel_address: null,
            avatar_url: null,
            status: 'inactive',
            is_deleted: true,
            deleted_at: now
          }, { transaction: t });

          await AuditLog.create({
            actor_user_id: req.user.user_id,
            action: 'user_deleted',
            entity_type: 'user',
            entity_id: String(targetId),
            details: JSON.stringify({ deleted_user_id: targetId })
          }, { transaction: t });

          await createSyncEvent({
            actor_user_id: req.user.user_id,
            target_user_id: targetId,
            source: 'admin',
            entity_type: 'profile',
            entity_id: targetId,
            action: 'delete',
            payload: { user_id: targetId },
            critical: true,
            transaction: t
          });
        });

        broadcastEvent('user_deleted', { user_id: targetId });
        const actor = await User.findByPk(req.user.user_id);
        const meta = { details: `${user.full_name || user.user_id} (${user.role})` };
        if (actor && isStaffRole(actor.role)) {
            await notifyUserInApp(actor.user_id, 'User deleted', `You deleted user ${targetId}.`, 'system');
            const text = buildStaffEmail('User deleted', `User ${targetId} deleted.`, meta);
            await queueEmailNotification({
                action: 'user_deleted_actor',
                entityId: `user:deleted:actor:${actor.user_id}:${targetId}`,
                to: actor.email,
                subject: 'User deleted',
                text,
                html: null,
                userId: actor.user_id,
                meta,
                source: 'admin',
                actorUserId: req.user.user_id
            });
        }
        await notifyAdmins({
            title: 'User deleted',
            message: `User ${targetId} deleted.`,
            subject: 'User deleted',
            text: buildStaffEmail('User deleted', `User ${targetId} deleted.`, meta),
            action: 'user_deleted',
            meta,
            actorUserId: req.user.user_id
        });
        res.json({ message: 'Deleted', user_id: targetId });
    } catch (e) { 
        if (e?.name === 'SequelizeForeignKeyConstraintError') {
          return res.status(409).json({ error: 'User has linked records', code: 'foreign_key_constraint' });
        }
        res.status(500).json({ error: e.message }); 
    }
});

// Plans
router.get('/plans', async (req, res) => {
    try {
        if (!['admin', 'head_admin'].includes(req.user.role)) return res.status(403).json({ error: 'Head Admin only' });
        const plans = await Plan.findAll();
        res.json(plans);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/plans', async (req, res) => {
    try {
        if (!['admin', 'head_admin'].includes(req.user.role)) return res.status(403).json({ error: 'Head Admin only' });
        const plan = await Plan.create(req.body);
        const actor = await User.findByPk(req.user.user_id);
        const meta = { details: plan.name || plan.plan_id };
        if (actor && isStaffRole(actor.role)) {
            await notifyUserInApp(actor.user_id, 'Plan created', `You created plan ${plan.plan_id}.`, 'system');
            const text = buildStaffEmail('Plan created', `Plan ${plan.plan_id} created.`, meta);
            await queueEmailNotification({
                action: 'plan_created_actor',
                entityId: `plan:created:actor:${actor.user_id}:${plan.plan_id}`,
                to: actor.email,
                subject: 'Plan created',
                text,
                html: null,
                userId: actor.user_id,
                meta,
                source: 'admin',
                actorUserId: req.user.user_id
            });
        }
        await notifyAdmins({
            title: 'Plan created',
            message: `Plan ${plan.plan_id} created.`,
            subject: 'Plan created',
            text: buildStaffEmail('Plan created', `Plan ${plan.plan_id} created.`, meta),
            action: 'plan_created',
            meta,
            actorUserId: req.user.user_id
        });
        res.status(201).json(plan);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/plans/:id', async (req, res) => {
    try {
        const plan = await Plan.findByPk(req.params.id);
        if (!plan) return res.status(404).json({ error: 'Plan not found' });
        await plan.update(req.body);
        const actor = await User.findByPk(req.user.user_id);
        const meta = { details: plan.name || plan.plan_id };
        if (actor && isStaffRole(actor.role)) {
            await notifyUserInApp(actor.user_id, 'Plan updated', `You updated plan ${plan.plan_id}.`, 'system');
            const text = buildStaffEmail('Plan updated', `Plan ${plan.plan_id} updated.`, meta);
            await queueEmailNotification({
                action: 'plan_updated_actor',
                entityId: `plan:updated:actor:${actor.user_id}:${plan.plan_id}`,
                to: actor.email,
                subject: 'Plan updated',
                text,
                html: null,
                userId: actor.user_id,
                meta,
                source: 'admin',
                actorUserId: req.user.user_id
            });
        }
        await notifyAdmins({
            title: 'Plan updated',
            message: `Plan ${plan.plan_id} updated.`,
            subject: 'Plan updated',
            text: buildStaffEmail('Plan updated', `Plan ${plan.plan_id} updated.`, meta),
            action: 'plan_updated',
            meta,
            actorUserId: req.user.user_id
        });
        res.json(plan);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/plans/:id', async (req, res) => {
    try {
        const plan = await Plan.findByPk(req.params.id);
        if (!plan) return res.status(404).json({ error: 'Plan not found' });
        const actor = await User.findByPk(req.user.user_id);
        const meta = { details: plan.name || plan.plan_id };
        if (actor && isStaffRole(actor.role)) {
            await notifyUserInApp(actor.user_id, 'Plan deleted', `You deleted plan ${plan.plan_id}.`, 'system');
            const text = buildStaffEmail('Plan deleted', `Plan ${plan.plan_id} deleted.`, meta);
            await queueEmailNotification({
                action: 'plan_deleted_actor',
                entityId: `plan:deleted:actor:${actor.user_id}:${plan.plan_id}`,
                to: actor.email,
                subject: 'Plan deleted',
                text,
                html: null,
                userId: actor.user_id,
                meta,
                source: 'admin',
                actorUserId: req.user.user_id
            });
        }
        await notifyAdmins({
            title: 'Plan deleted',
            message: `Plan ${plan.plan_id} deleted.`,
            subject: 'Plan deleted',
            text: buildStaffEmail('Plan deleted', `Plan ${plan.plan_id} deleted.`, meta),
            action: 'plan_deleted',
            meta,
            actorUserId: req.user.user_id
        });
        await plan.destroy();
        res.json({ message: 'Deleted' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Subscriptions
router.get('/subscriptions', async (req, res) => {
    try {
        if (req.user.role === 'rider') return res.status(403).json({ error: 'Unauthorized' });
        const subs = await Subscription.findAll({ include: [User, Plan], order: [['created_at', 'DESC']] });
        res.json(subs);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/subscriptions', async (req, res) => {
    try {
        if (!['admin', 'head_admin'].includes(req.user.role)) return res.status(403).json({ error: 'Head Admin only' });
        const { user_id, plan_id, status, start_date, end_date, remaining_pickups } = req.body || {};
        if (!user_id || !plan_id) return res.status(400).json({ error: 'user_id and plan_id are required' });
        if (!start_date || !end_date) return res.status(400).json({ error: 'start_date and end_date are required' });
        const user = await User.findByPk(user_id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        const plan = await Plan.findByPk(plan_id);
        if (!plan) return res.status(404).json({ error: 'Plan not found' });

        const startDate = new Date(start_date);
        const endDate = new Date(end_date);
        if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
            return res.status(400).json({ error: 'Invalid dates' });
        }
        if (endDate < startDate) {
            return res.status(400).json({ error: 'end_date must be after start_date' });
        }

        const sub = await Subscription.create({
            user_id,
            plan_id,
            status: status || 'active',
            start_date,
            end_date,
            remaining_pickups: remaining_pickups !== undefined ? remaining_pickups : plan.max_pickups
        });

        await AuditLog.create({
            actor_user_id: req.user.user_id,
            action: 'CREATE_SUBSCRIPTION',
            entity_type: 'subscription',
            entity_id: String(sub.subscription_id),
            details: `User ${user_id} Plan ${plan_id}`
        });

        sse.broadcast('subscription_created', sub);
        res.status(201).json(sub);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/subscriptions/:id', async (req, res) => {
    try {
        if (!['admin', 'head_admin'].includes(req.user.role)) return res.status(403).json({ error: 'Head Admin only' });
        const sub = await Subscription.findByPk(req.params.id);
        if (!sub) return res.status(404).json({ error: 'Subscription not found' });

        const { plan_id, status, start_date, end_date, remaining_pickups } = req.body || {};
        const updates = {};

        if (plan_id !== undefined) {
            const plan = await Plan.findByPk(plan_id);
            if (!plan) return res.status(404).json({ error: 'Plan not found' });
            updates.plan_id = plan_id;
            if (remaining_pickups === undefined) updates.remaining_pickups = plan.max_pickups;
        }
        if (status !== undefined) updates.status = status;
        if (start_date !== undefined) {
            const startDate = new Date(start_date);
            if (Number.isNaN(startDate.getTime())) return res.status(400).json({ error: 'Invalid start_date' });
            updates.start_date = start_date;
        }
        if (end_date !== undefined) {
            const endDate = new Date(end_date);
            if (Number.isNaN(endDate.getTime())) return res.status(400).json({ error: 'Invalid end_date' });
            updates.end_date = end_date;
        }
        if (updates.start_date && updates.end_date) {
            if (new Date(updates.end_date) < new Date(updates.start_date)) {
                return res.status(400).json({ error: 'end_date must be after start_date' });
            }
        }
        if (remaining_pickups !== undefined) updates.remaining_pickups = remaining_pickups;

        await sub.update(updates);

        await AuditLog.create({
            actor_user_id: req.user.user_id,
            action: 'UPDATE_SUBSCRIPTION',
            entity_type: 'subscription',
            entity_id: String(sub.subscription_id),
            details: `Updates: ${Object.keys(updates).join(', ') || 'none'}`
        });

        sse.broadcast('subscription_updated', sub);
        res.json(sub);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Notifications
router.get('/notifications', async (req, res) => {
    try {
        const notifs = await Notification.findAll({ order: [['created_at', 'DESC']], limit: 100 });
        res.json(notifs);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/notifications', async (req, res) => {
    try {
        const notif = await Notification.create(req.body);
        res.json(notif);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/notifications/email/logs', async (req, res) => {
    try {
        if (!['admin', 'head_admin'].includes(req.user.role)) return res.status(403).json({ error: 'Admin only' });
        const status = req.query.status;
        const limit = Number(req.query.limit || 200);
        const where = { entity_type: 'email_notification' };
        if (status) where.status = status;
        if (req.query.user_id) where.target_user_id = req.query.user_id;
        const items = await SyncEvent.findAll({
            where,
            order: [['created_at', 'DESC']],
            limit
        });
        res.json({ items });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/notifications/email/trigger', async (req, res) => {
    try {
        if (!['admin', 'head_admin'].includes(req.user.role)) return res.status(403).json({ error: 'Admin only' });
        const { to, subject, text, html, user_id, meta } = req.body || {};
        if (!to || !subject) return res.status(400).json({ error: 'to and subject required' });
        const event = await createSyncEvent({
            actor_user_id: req.user.user_id,
            target_user_id: user_id || null,
            source: 'admin',
            entity_type: 'email_notification',
            entity_id: `manual:${Date.now()}`,
            action: 'manual_email',
            payload: { to, subject, text: text || '', html: html || null, user_id: user_id || null, meta },
            critical: false
        });
        res.json(event);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Codes
router.get('/codes', async (req, res) => {
    try {
        const codes = await Code.findAll({ include: [Order], order: [['created_at', 'DESC']] });
        res.json(codes);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Audit Logs
router.get('/audit-logs', async (req, res) => {
    try {
        const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 200);
        const where = {};
        const entityType = req.query.entity_type ? String(req.query.entity_type) : '';
        if (entityType) where.entity_type = entityType;
        const action = req.query.action ? String(req.query.action) : '';
        if (action) where.action = action;
        const actorUserId = req.query.actor_user_id ? Number(req.query.actor_user_id) : null;
        if (actorUserId) where.actor_user_id = actorUserId;
        const userId = req.query.user_id ? String(req.query.user_id) : '';
        if (userId) {
            where.entity_id = userId;
            if (!where.entity_type) where.entity_type = 'user';
        }
        const logs = await AuditLog.findAll({
            where,
            include: [User],
            order: [['created_at', 'DESC']],
            limit
        });
        res.json(logs);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Payments
router.get('/payments', async (req, res) => {
  try {
    if (req.user.role === 'rider') return res.status(403).json({ error: 'Unauthorized' });
    const { status, user_id, type, gateway } = req.query;
    const where = {};
    if (status) where.status = status;
    if (user_id) where.user_id = user_id;
    if (type) where.payment_type = type;
    if (gateway) where.gateway = gateway;
    
    const payments = await Payment.findAll({ where, order: [['created_at', 'DESC']], include: [{ model: User, attributes: ['full_name', 'phone_number', 'email', 'school', 'student_id'] }] });
    res.json(payments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/payments', async (req, res) => {
  try {
    if (req.user.role === 'rider') return res.status(403).json({ error: 'Unauthorized' });
    const { user_id, amount, payment_type, type, gateway, method, status, reference, currency, metadata } = req.body;
    const resolvedType = payment_type || type || 'subscription';
    const resolvedGateway = gateway || method || 'cash';
    const payment = await Payment.create({
      user_id,
      amount,
      currency,
      payment_type: resolvedType,
      gateway: resolvedGateway,
      status: status || 'pending',
      reference,
      metadata
    });
    const actor = await User.findByPk(req.user.user_id);
    const paymentUser = await User.findByPk(user_id);
    const orderId = payment.metadata?.related_order_id || payment.metadata?.order_id || null;
    const baseMeta = {
      userName: paymentUser ? (paymentUser.full_name || paymentUser.email || `User ${paymentUser.user_id}`) : `User ${user_id}`,
      orderId,
      paymentType: payment.payment_type,
      status: payment.status,
      reference: payment.reference
    };
    if (payment.status === 'paid' && payment.payment_type === 'subscription') {
      const sub = await Subscription.findOne({ where: { user_id }, order: [['created_at', 'DESC']] });
      if (sub) await sub.update({ status: 'active' });
    }
    
    // Notification logic omitted for brevity but should be here
    await Notification.create({ user_id, title: 'Payment Update', message: `Payment ${payment.status}`, channel: 'app' });
    if (actor && isStaffRole(actor.role)) {
      await notifyUserInApp(actor.user_id, 'Payment created', `You recorded payment ${payment.payment_id}.`, 'payment_update');
      const text = buildStaffEmail('Payment created', `Payment ${payment.payment_id} recorded.`, baseMeta);
      await queueEmailNotification({
        action: 'payment_created_actor',
        entityId: `payment:created:actor:${actor.user_id}:${payment.payment_id}`,
        to: actor.email,
        subject: 'Payment created',
        text,
        html: null,
        userId: actor.user_id,
        meta: baseMeta,
        source: 'admin',
        actorUserId: req.user.user_id
      });
    }
    await notifyAdmins({
      title: 'Payment created',
      message: `Payment ${payment.payment_id} created.`,
      subject: 'Payment created',
      text: buildStaffEmail('Payment created', `Payment ${payment.payment_id} created.`, baseMeta),
      action: 'payment_created',
      meta: baseMeta,
      actorUserId: req.user.user_id
    });
    
    await AuditLog.create({ actor_user_id: req.user.user_id, action: 'CREATE_PAYMENT', entity_type: 'payment', entity_id: String(payment.payment_id), details: `Amount: ${amount}, Type: ${payment_type}` });

    try {
      const user = paymentUser || await User.findByPk(user_id);
      const eventLabel = payment.status === 'paid' ? 'Payment successful' : 'Payment initiated';
      await queuePaymentEmail({
        user,
        payment,
        planName: payment.metadata?.plan_name,
        amount: payment.amount,
        status: payment.status,
        event: eventLabel,
        reference: payment.reference,
        source: 'admin',
        actorUserId: req.user.user_id
      });
    } catch (e) {
      console.error('Payment email queue failed:', e.message);
    }

    res.status(201).json(payment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/payments/:id/status', async (req, res) => {
  try {
    if (!['admin', 'head_admin'].includes(req.user.role) && req.user.role !== 'receptionist') return res.status(403).json({ error: 'Unauthorized' });
    const { status } = req.body;
    const allowedStatuses = ['paid', 'pending', 'failed', 'awaiting_verification', 'rejected', 'declined'];
    if (!allowedStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const payment = await Payment.findByPk(req.params.id);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    const previousStatus = payment.status;

    await payment.update({ status });
    const actor = await User.findByPk(req.user.user_id);
    const paymentUser = await User.findByPk(payment.user_id);
    const orderId = payment.metadata?.related_order_id || payment.metadata?.order_id || null;
    const baseMeta = {
      userName: paymentUser ? (paymentUser.full_name || paymentUser.email || `User ${paymentUser.user_id}`) : `User ${payment.user_id}`,
      orderId,
      paymentType: payment.payment_type,
      status: payment.status,
      reference: payment.reference
    };
    if (actor && isStaffRole(actor.role)) {
      await notifyUserInApp(actor.user_id, 'Payment updated', `You updated payment ${payment.payment_id} to ${status}.`, 'payment_update');
      const text = buildStaffEmail('Payment updated', `Payment ${payment.payment_id} updated to ${status}.`, baseMeta);
      await queueEmailNotification({
        action: 'payment_updated_actor',
        entityId: `payment:updated:actor:${actor.user_id}:${payment.payment_id}`,
        to: actor.email,
        subject: 'Payment updated',
        text,
        html: null,
        userId: actor.user_id,
        meta: baseMeta,
        source: 'admin',
        actorUserId: req.user.user_id
      });
    }
    await notifyAdmins({
      title: 'Payment updated',
      message: `Payment ${payment.payment_id} updated to ${status}.`,
      subject: 'Payment updated',
      text: buildStaffEmail('Payment updated', `Payment ${payment.payment_id} updated to ${status}.`, baseMeta),
      action: 'payment_updated',
      meta: baseMeta,
      actorUserId: req.user.user_id
    });
    
    if (status === 'paid' && payment.payment_type === 'subscription') {
       let sub;
       if (payment.metadata && payment.metadata.subscription_id) {
           sub = await Subscription.findByPk(payment.metadata.subscription_id);
       } else {
           sub = await Subscription.findOne({ where: { user_id: payment.user_id }, order: [['created_at', 'DESC']] });
       }
       
       if (sub) {
           await sub.update({ status: 'active' });
           
           await Notification.create({
               user_id: payment.user_id,
               title: 'Subscription Activated',
               message: 'Your payment has been confirmed and your subscription is now ACTIVE!',
               channel: 'app'
           });
       }
    }

    if (status === 'paid' && payment.payment_type === 'emergency') {
       const relatedOrderId = payment.metadata?.related_order_id || payment.metadata?.order_id;
       if (relatedOrderId) {
         const order = await Order.findByPk(relatedOrderId);
         if (order && order.status === 'pending') {
           await order.update({ status: 'accepted' });
           await createSyncEvent({
             actor_user_id: req.user.user_id,
             target_user_id: order.user_id,
             source: 'admin',
             entity_type: 'order',
             entity_id: order.order_id,
             action: 'status_update',
             payload: { to: 'accepted', version: order.version },
             critical: true
           });
           sse.broadcast('order_updated', order);
           emitPickupSync(req, 'status_update', order, { to: 'accepted' });
         }
         try {
           await ensureOrderCodes(order.order_id, req.user.user_id);
         } catch (e) {
           await AuditLog.create({
             actor_user_id: req.user.user_id,
             action: 'code_generation_failed',
             entity_type: 'order',
             entity_id: String(order.order_id),
             details: `Auto code generation failed: ${e.message}`
           });
           return res.status(500).json({ error: 'Failed to generate pickup and release codes' });
         }
       }
       await Notification.create({
         user_id: payment.user_id,
         title: 'Emergency Laundry Payment Confirmed',
         message: 'Your emergency laundry payment has been confirmed.',
         channel: 'app'
       });
    }

    if ((status === 'rejected' || status === 'declined') && payment.payment_type === 'subscription') {
       let sub;
       if (payment.metadata && payment.metadata.subscription_id) {
           sub = await Subscription.findByPk(payment.metadata.subscription_id);
       } else {
           sub = await Subscription.findOne({ where: { user_id: payment.user_id }, order: [['created_at', 'DESC']] });
       }
       if (sub) {
           await sub.update({ status: 'denied' });
           await Notification.create({
               user_id: payment.user_id,
               title: 'Payment Rejected',
               message: 'Your bank transfer was rejected. Please contact support or try again.',
               channel: 'app'
           });
       }
    }
    
    try {
      const user = paymentUser || await User.findByPk(payment.user_id);
      let eventLabel = 'Payment update';
      if (status === 'paid') eventLabel = 'Payment successful';
      if (status === 'rejected' || status === 'declined') eventLabel = 'Payment failed';
      await queuePaymentEmail({
        user,
        payment,
        planName: payment.metadata?.plan_name,
        amount: payment.amount,
        status: payment.status,
        event: eventLabel,
        reference: payment.reference,
        source: 'admin',
        actorUserId: req.user.user_id
      });
    } catch (e) {
      console.error('Payment email queue failed:', e.message);
    }

    await AuditLog.create({
      actor_user_id: req.user.user_id,
      action: 'UPDATE_PAYMENT_STATUS',
      entity_type: 'payment',
      entity_id: String(payment.payment_id),
      details: `Status: ${previousStatus} -> ${status}`
    });

    sse.broadcast('payment_updated', payment);
    res.json(payment);
  } catch (e) {
      res.status(500).json({ error: e.message });
  }
});

router.put('/payments/:id', async (req, res) => {
  try {
    if (req.user.role === 'rider') return res.status(403).json({ error: 'Unauthorized' });
    const { status } = req.body;
    const payment = await Payment.findByPk(req.params.id);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    
    payment.status = status;
    await payment.update({ status });
    const actor = await User.findByPk(req.user.user_id);
    const paymentUser = await User.findByPk(payment.user_id);
    const orderId = payment.metadata?.related_order_id || payment.metadata?.order_id || null;
    const baseMeta = {
      userName: paymentUser ? (paymentUser.full_name || paymentUser.email || `User ${paymentUser.user_id}`) : `User ${payment.user_id}`,
      orderId,
      paymentType: payment.payment_type,
      status: payment.status,
      reference: payment.reference
    };
    if (actor && isStaffRole(actor.role)) {
      await notifyUserInApp(actor.user_id, 'Payment updated', `You updated payment ${payment.payment_id} to ${status}.`, 'payment_update');
      const text = buildStaffEmail('Payment updated', `Payment ${payment.payment_id} updated to ${status}.`, baseMeta);
      await queueEmailNotification({
        action: 'payment_updated_actor',
        entityId: `payment:updated:actor:${actor.user_id}:${payment.payment_id}`,
        to: actor.email,
        subject: 'Payment updated',
        text,
        html: null,
        userId: actor.user_id,
        meta: baseMeta,
        source: 'admin',
        actorUserId: req.user.user_id
      });
    }
    await notifyAdmins({
      title: 'Payment updated',
      message: `Payment ${payment.payment_id} updated to ${status}.`,
      subject: 'Payment updated',
      text: buildStaffEmail('Payment updated', `Payment ${payment.payment_id} updated to ${status}.`, baseMeta),
      action: 'payment_updated',
      meta: baseMeta,
      actorUserId: req.user.user_id
    });
    
    if (status === 'paid' && payment.payment_type === 'subscription') {
       let sub;
       if (payment.metadata && payment.metadata.subscription_id) {
           sub = await Subscription.findByPk(payment.metadata.subscription_id);
       } else {
           // Fallback for old records
           sub = await Subscription.findOne({ where: { user_id: payment.user_id }, order: [['created_at', 'DESC']] });
       }
       
       if (sub) {
           await sub.update({ status: 'active' });
           
           // Notify User
           await Notification.create({
               user_id: payment.user_id,
               title: 'Subscription Activated',
               message: 'Your payment has been confirmed and your subscription is now ACTIVE!',
               channel: 'app'
           });
       }
    }

    if (status === 'paid' && payment.payment_type === 'emergency') {
       const relatedOrderId = payment.metadata?.related_order_id || payment.metadata?.order_id;
       if (relatedOrderId) {
         const order = await Order.findByPk(relatedOrderId);
         if (order && order.status === 'pending') {
           await order.update({ status: 'accepted' });
           await createSyncEvent({
             actor_user_id: req.user.user_id,
             target_user_id: order.user_id,
             source: 'admin',
             entity_type: 'order',
             entity_id: order.order_id,
             action: 'status_update',
             payload: { to: 'accepted', version: order.version },
             critical: true
           });
           sse.broadcast('order_updated', order);
           emitPickupSync(req, 'status_update', order, { to: 'accepted' });
         }
         try {
           await ensureOrderCodes(order.order_id, req.user.user_id);
         } catch (e) {
           await AuditLog.create({
             actor_user_id: req.user.user_id,
             action: 'code_generation_failed',
             entity_type: 'order',
             entity_id: String(order.order_id),
             details: `Auto code generation failed: ${e.message}`
           });
           return res.status(500).json({ error: 'Failed to generate pickup and release codes' });
         }
       }
       await Notification.create({
         user_id: payment.user_id,
         title: 'Emergency Laundry Payment Confirmed',
         message: 'Your emergency laundry payment has been confirmed.',
         channel: 'app'
       });
    }

    if ((status === 'rejected' || status === 'declined') && payment.payment_type === 'subscription') {
       let sub;
       if (payment.metadata && payment.metadata.subscription_id) {
           sub = await Subscription.findByPk(payment.metadata.subscription_id);
       } else {
           sub = await Subscription.findOne({ where: { user_id: payment.user_id }, order: [['created_at', 'DESC']] });
       }
       if (sub) {
           await sub.update({ status: 'denied' });
           await Notification.create({
               user_id: payment.user_id,
               title: 'Payment Rejected',
               message: 'Your bank transfer was rejected. Please contact support or try again.',
               channel: 'app'
           });
       }
    }
    
    try {
      const user = paymentUser || await User.findByPk(payment.user_id);
      let eventLabel = 'Payment update';
      if (status === 'paid') eventLabel = 'Payment successful';
      if (status === 'rejected' || status === 'declined') eventLabel = 'Payment failed';
      await queuePaymentEmail({
        user,
        payment,
        planName: payment.metadata?.plan_name,
        amount: payment.amount,
        status: payment.status,
        event: eventLabel,
        reference: payment.reference,
        source: 'admin',
        actorUserId: req.user.user_id
      });
    } catch (e) {
      console.error('Payment email queue failed:', e.message);
    }

    sse.broadcast('payment_updated', payment);
    res.json(payment);
  } catch (e) {
      res.status(500).json({ error: e.message });
  }
});

router.delete('/payments/:id', async (req, res) => {
  try {
    if (req.user.role === 'rider') return res.status(403).json({ error: 'Unauthorized' });
    const payment = await Payment.findByPk(req.params.id);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    await payment.destroy();
    const actor = await User.findByPk(req.user.user_id);
    const paymentUser = await User.findByPk(payment.user_id);
    const orderId = payment.metadata?.related_order_id || payment.metadata?.order_id || null;
    const baseMeta = {
      userName: paymentUser ? (paymentUser.full_name || paymentUser.email || `User ${paymentUser.user_id}`) : `User ${payment.user_id}`,
      orderId,
      paymentType: payment.payment_type,
      status: 'deleted',
      reference: payment.reference
    };
    if (actor && isStaffRole(actor.role)) {
      await notifyUserInApp(actor.user_id, 'Payment deleted', `You deleted payment ${payment.payment_id}.`, 'payment_update');
      const text = buildStaffEmail('Payment deleted', `Payment ${payment.payment_id} deleted.`, baseMeta);
      await queueEmailNotification({
        action: 'payment_deleted_actor',
        entityId: `payment:deleted:actor:${actor.user_id}:${payment.payment_id}`,
        to: actor.email,
        subject: 'Payment deleted',
        text,
        html: null,
        userId: actor.user_id,
        meta: baseMeta,
        source: 'admin',
        actorUserId: req.user.user_id
      });
    }
    await notifyAdmins({
      title: 'Payment deleted',
      message: `Payment ${payment.payment_id} deleted.`,
      subject: 'Payment deleted',
      text: buildStaffEmail('Payment deleted', `Payment ${payment.payment_id} deleted.`, baseMeta),
      action: 'payment_deleted',
      meta: baseMeta,
      actorUserId: req.user.user_id
    });
    res.json({ message: 'Payment deleted' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const SYNC_ENTITY_MODELS = {
  order: Order,
  payment: Payment,
  subscription: Subscription,
  profile: User,
  inventory: InventoryItem,
  sync_event: SyncEvent
};

router.get('/sync/status', async (req, res) => {
  try {
    if (!['admin', 'head_admin'].includes(req.user.role)) return res.status(403).json({ error: 'Admin only' });
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [pending, failed, sent] = await Promise.all([
      SyncEvent.count({ where: { status: 'pending' } }),
      SyncEvent.count({ where: { status: 'failed' } }),
      SyncEvent.count({ where: { status: 'sent', updated_at: { [Op.gte]: since } } })
    ]);
    res.json({ pending, failed, sent_last_24h: sent });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/sync/queue', async (req, res) => {
  try {
    if (!['admin', 'head_admin'].includes(req.user.role)) return res.status(403).json({ error: 'Admin only' });
    const status = req.query.status || 'failed';
    const items = await SyncEvent.findAll({
      where: { status },
      order: [['updated_at', 'DESC']],
      limit: Number(req.query.limit || 200)
    });
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/sync/pull', async (req, res) => {
  try {
    const { entity_type, since, user_id } = req.query;
    if (!entity_type) return res.status(400).json({ error: 'entity_type required' });
    const model = SYNC_ENTITY_MODELS[entity_type];
    if (!model) return res.status(400).json({ error: 'Unsupported entity_type' });
    const where = {};
    const limit = Number(req.query.limit || 200);
    if (entity_type === 'sync_event') {
      where.status = 'sent';
      if (since) where.created_at = { [Op.gte]: new Date(since) };
    } else {
      if (since) where.updated_at = { [Op.gte]: new Date(since) };
      if (user_id) where.user_id = user_id;
    }
    const orderField = entity_type === 'sync_event' ? 'created_at' : 'updated_at';
    const items = await model.findAll({ where, order: [[orderField, 'DESC']], limit });
    res.json({ items, server_time: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/sync/push', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { entity_type, action, payload, entity_id, version, critical, source } = req.body;
    if (!entity_type || !action) return res.status(400).json({ error: 'entity_type and action required' });
    const normalizedPayload = payload || {};
    let result;

    if (entity_type === 'inventory') {
      const resolvedId = entity_id || normalizedPayload.item_id;
      let item = resolvedId ? await InventoryItem.findByPk(resolvedId, { transaction: t }) : null;
      if (item) {
        if (version !== undefined && item.version !== version) {
          await t.rollback();
          return res.status(409).json({ error: 'Data has changed. Please refresh.', current_version: item.version });
        }
        const nextVersion = item.version + 1;
        await item.update({ ...normalizedPayload, version: nextVersion }, { transaction: t });
      } else {
        item = await InventoryItem.create({ ...normalizedPayload, version: 0 }, { transaction: t });
      }
      await createSyncEvent({
        actor_user_id: req.user.user_id,
        target_user_id: null,
        source: source || 'admin',
        entity_type: 'inventory',
        entity_id: item.item_id,
        action,
        payload: normalizedPayload,
        critical: !!critical,
        transaction: t
      });
      result = item;
    } else if (entity_type === 'order') {
      const resolvedId = entity_id || normalizedPayload.order_id;
      if (!resolvedId) return res.status(400).json({ error: 'order_id required' });
      const order = await Order.findByPk(resolvedId, { transaction: t });
      if (!order) return res.status(404).json({ error: 'Order not found' });
      if (version !== undefined && order.version !== version) {
        await t.rollback();
        return res.status(409).json({ error: 'Data has changed. Please refresh.', current_version: order.version });
      }
      await order.update(normalizedPayload, { transaction: t });
      await createSyncEvent({
        actor_user_id: req.user.user_id,
        target_user_id: order.user_id,
        source: source || 'admin',
        entity_type: 'order',
        entity_id: order.order_id,
        action,
        payload: normalizedPayload,
        critical: !!critical,
        transaction: t
      });
      sse.broadcast('order_updated', order);
      emitPickupSync(req, action || 'update', order, { fields: normalizedPayload || {} });
      result = order;
    } else if (entity_type === 'payment') {
      const resolvedId = entity_id || normalizedPayload.payment_id;
      if (!resolvedId) return res.status(400).json({ error: 'payment_id required' });
      const payment = await Payment.findByPk(resolvedId, { transaction: t });
      if (!payment) return res.status(404).json({ error: 'Payment not found' });
      await payment.update(normalizedPayload, { transaction: t });
      await createSyncEvent({
        actor_user_id: req.user.user_id,
        target_user_id: payment.user_id,
        source: source || 'admin',
        entity_type: 'payment',
        entity_id: payment.payment_id,
        action,
        payload: normalizedPayload,
        critical: !!critical,
        transaction: t
      });
      sse.broadcast('payment_updated', payment);
      result = payment;
    } else if (entity_type === 'subscription') {
      const resolvedId = entity_id || normalizedPayload.subscription_id;
      if (!resolvedId) return res.status(400).json({ error: 'subscription_id required' });
      const subscription = await Subscription.findByPk(resolvedId, { transaction: t });
      if (!subscription) return res.status(404).json({ error: 'Subscription not found' });
      await subscription.update(normalizedPayload, { transaction: t });
      await createSyncEvent({
        actor_user_id: req.user.user_id,
        target_user_id: subscription.user_id,
        source: source || 'admin',
        entity_type: 'subscription',
        entity_id: subscription.subscription_id,
        action,
        payload: normalizedPayload,
        critical: !!critical,
        transaction: t
      });
      sse.broadcast('subscription_updated', subscription);
      result = subscription;
    } else if (entity_type === 'profile') {
      const resolvedId = entity_id || normalizedPayload.user_id;
      if (!resolvedId) return res.status(400).json({ error: 'user_id required' });
      const user = await User.findByPk(resolvedId, { transaction: t });
      if (!user) return res.status(404).json({ error: 'User not found' });
      const allowed = ['full_name', 'phone_number', 'email', 'student_id', 'school', 'hostel_address', 'status', 'role'];
      const nextPayload = {};
      allowed.forEach((key) => {
        if (normalizedPayload[key] !== undefined) nextPayload[key] = normalizedPayload[key];
      });
      await user.update(nextPayload, { transaction: t });
      await createSyncEvent({
        actor_user_id: req.user.user_id,
        target_user_id: user.user_id,
        source: source || 'admin',
        entity_type: 'profile',
        entity_id: user.user_id,
        action,
        payload: nextPayload,
        critical: !!critical,
        transaction: t
      });
      sse.broadcast('user_updated', user);
      result = user;
    } else {
      await t.rollback();
      return res.status(400).json({ error: 'Unsupported entity_type' });
    }

    await t.commit();
    res.json(result);
  } catch (e) {
    await t.rollback();
    res.status(500).json({ error: e.message });
  }
});

router.get('/inventory', async (req, res) => {
  try {
    const { status } = req.query;
    const where = {};
    if (status) where.status = status;
    const items = await InventoryItem.findAll({ where, order: [['updated_at', 'DESC']] });
    res.json(items);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/inventory', async (req, res) => {
  try {
    if (!['admin', 'head_admin'].includes(req.user.role)) return res.status(403).json({ error: 'Admin only' });
    const item = await InventoryItem.create(req.body);
    await createSyncEvent({
      actor_user_id: req.user.user_id,
      target_user_id: null,
      source: 'admin',
      entity_type: 'inventory',
      entity_id: item.item_id,
      action: 'create',
      payload: item.toJSON(),
      critical: true
    });
    const actor = await User.findByPk(req.user.user_id);
    if (actor && isStaffRole(actor.role)) {
      await notifyUserInApp(actor.user_id, 'Inventory created', `You created inventory item ${item.item_id}.`, 'system');
      const text = buildStaffEmail('Inventory created', `Inventory item ${item.item_id} created.`, { details: item.name || item.item_id });
      await queueEmailNotification({
        action: 'inventory_created_actor',
        entityId: `inventory:created:actor:${actor.user_id}:${item.item_id}`,
        to: actor.email,
        subject: 'Inventory created',
        text,
        html: null,
        userId: actor.user_id,
        meta: { item_id: item.item_id },
        source: 'admin',
        actorUserId: req.user.user_id
      });
    }
    await notifyAdmins({
      title: 'Inventory created',
      message: `Inventory item ${item.item_id} created.`,
      subject: 'Inventory created',
      text: buildStaffEmail('Inventory created', `Inventory item ${item.item_id} created.`, { details: item.name || item.item_id }),
      action: 'inventory_created',
      meta: { item_id: item.item_id },
      actorUserId: req.user.user_id
    });
    res.status(201).json(item);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/inventory/:id', async (req, res) => {
  try {
    if (!['admin', 'head_admin'].includes(req.user.role)) return res.status(403).json({ error: 'Admin only' });
    const item = await InventoryItem.findByPk(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    const nextVersion = item.version + 1;
    await item.update({ ...req.body, version: nextVersion });
    await createSyncEvent({
      actor_user_id: req.user.user_id,
      target_user_id: null,
      source: 'admin',
      entity_type: 'inventory',
      entity_id: item.item_id,
      action: 'update',
      payload: req.body,
      critical: true
    });
    const actor = await User.findByPk(req.user.user_id);
    if (actor && isStaffRole(actor.role)) {
      await notifyUserInApp(actor.user_id, 'Inventory updated', `You updated inventory item ${item.item_id}.`, 'system');
      const text = buildStaffEmail('Inventory updated', `Inventory item ${item.item_id} updated.`, { details: item.name || item.item_id });
      await queueEmailNotification({
        action: 'inventory_updated_actor',
        entityId: `inventory:updated:actor:${actor.user_id}:${item.item_id}`,
        to: actor.email,
        subject: 'Inventory updated',
        text,
        html: null,
        userId: actor.user_id,
        meta: { item_id: item.item_id },
        source: 'admin',
        actorUserId: req.user.user_id
      });
    }
    await notifyAdmins({
      title: 'Inventory updated',
      message: `Inventory item ${item.item_id} updated.`,
      subject: 'Inventory updated',
      text: buildStaffEmail('Inventory updated', `Inventory item ${item.item_id} updated.`, { details: item.name || item.item_id }),
      action: 'inventory_updated',
      meta: { item_id: item.item_id },
      actorUserId: req.user.user_id
    });
    res.json(item);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/inventory/:id', async (req, res) => {
  try {
    if (!['admin', 'head_admin'].includes(req.user.role)) return res.status(403).json({ error: 'Admin only' });
    const item = await InventoryItem.findByPk(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    await item.destroy();
    await createSyncEvent({
      actor_user_id: req.user.user_id,
      target_user_id: null,
      source: 'admin',
      entity_type: 'inventory',
      entity_id: req.params.id,
      action: 'delete',
      payload: { item_id: req.params.id },
      critical: true
    });
    const actor = await User.findByPk(req.user.user_id);
    if (actor && isStaffRole(actor.role)) {
      await notifyUserInApp(actor.user_id, 'Inventory deleted', `You deleted inventory item ${item.item_id}.`, 'system');
      const text = buildStaffEmail('Inventory deleted', `Inventory item ${item.item_id} deleted.`, { details: item.name || item.item_id });
      await queueEmailNotification({
        action: 'inventory_deleted_actor',
        entityId: `inventory:deleted:actor:${actor.user_id}:${item.item_id}`,
        to: actor.email,
        subject: 'Inventory deleted',
        text,
        html: null,
        userId: actor.user_id,
        meta: { item_id: item.item_id },
        source: 'admin',
        actorUserId: req.user.user_id
      });
    }
    await notifyAdmins({
      title: 'Inventory deleted',
      message: `Inventory item ${item.item_id} deleted.`,
      subject: 'Inventory deleted',
      text: buildStaffEmail('Inventory deleted', `Inventory item ${item.item_id} deleted.`, { details: item.name || item.item_id }),
      action: 'inventory_deleted',
      meta: { item_id: item.item_id },
      actorUserId: req.user.user_id
    });
    res.json({ message: 'Item deleted' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Carousel Management
router.get('/carousel', async (req, res) => {
    try {
        const items = await CarouselItem.findAll({ order: [['order_index', 'ASC']] });
        res.json(items);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/carousel', upload.single('image'), async (req, res) => {
    try {
        if (!['admin', 'head_admin'].includes(req.user.role)) return res.status(403).json({ error: 'Admin only' });
        
        const { title, description, link, status, order_index } = req.body;
        const image_url = req.file ? `/uploads/${req.file.filename}` : null;
        
        if (!image_url) return res.status(400).json({ error: 'Image is required' });

        const item = await CarouselItem.create({
            image_url,
            title,
            description,
            link,
            status: status || 'active',
            order_index: order_index || 0
        });
        const actor = await User.findByPk(req.user.user_id);
        const meta = { details: item.title || item.carousel_id || item.id };
        if (actor && isStaffRole(actor.role)) {
            await notifyUserInApp(actor.user_id, 'Carousel item created', `You created carousel item ${item.carousel_id || item.id}.`, 'system');
            const text = buildStaffEmail('Carousel item created', `Carousel item ${item.carousel_id || item.id} created.`, meta);
            await queueEmailNotification({
                action: 'carousel_created_actor',
                entityId: `carousel:created:actor:${actor.user_id}:${item.carousel_id || item.id}`,
                to: actor.email,
                subject: 'Carousel item created',
                text,
                html: null,
                userId: actor.user_id,
                meta,
                source: 'admin',
                actorUserId: req.user.user_id
            });
        }
        await notifyAdmins({
            title: 'Carousel item created',
            message: `Carousel item ${item.carousel_id || item.id} created.`,
            subject: 'Carousel item created',
            text: buildStaffEmail('Carousel item created', `Carousel item ${item.carousel_id || item.id} created.`, meta),
            action: 'carousel_created',
            meta,
            actorUserId: req.user.user_id
        });

        res.json(item);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.put('/carousel/:id', upload.single('image'), async (req, res) => {
    try {
        if (!['admin', 'head_admin'].includes(req.user.role)) return res.status(403).json({ error: 'Admin only' });
        
        const { id } = req.params;
        const item = await CarouselItem.findByPk(id);
        if (!item) return res.status(404).json({ error: 'Item not found' });

        const { title, description, link, status, order_index } = req.body;
        
        if (req.file) {
            item.image_url = `/uploads/${req.file.filename}`;
        }
        if (title !== undefined) item.title = title;
        if (description !== undefined) item.description = description;
        if (link !== undefined) item.link = link;
        if (status !== undefined) item.status = status;
        if (order_index !== undefined) item.order_index = order_index;

        await item.save();
        const actor = await User.findByPk(req.user.user_id);
        const meta = { details: item.title || item.carousel_id || item.id };
        if (actor && isStaffRole(actor.role)) {
            await notifyUserInApp(actor.user_id, 'Carousel item updated', `You updated carousel item ${item.carousel_id || item.id}.`, 'system');
            const text = buildStaffEmail('Carousel item updated', `Carousel item ${item.carousel_id || item.id} updated.`, meta);
            await queueEmailNotification({
                action: 'carousel_updated_actor',
                entityId: `carousel:updated:actor:${actor.user_id}:${item.carousel_id || item.id}`,
                to: actor.email,
                subject: 'Carousel item updated',
                text,
                html: null,
                userId: actor.user_id,
                meta,
                source: 'admin',
                actorUserId: req.user.user_id
            });
        }
        await notifyAdmins({
            title: 'Carousel item updated',
            message: `Carousel item ${item.carousel_id || item.id} updated.`,
            subject: 'Carousel item updated',
            text: buildStaffEmail('Carousel item updated', `Carousel item ${item.carousel_id || item.id} updated.`, meta),
            action: 'carousel_updated',
            meta,
            actorUserId: req.user.user_id
        });
        res.json(item);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.delete('/carousel/:id', async (req, res) => {
    try {
        if (!['admin', 'head_admin'].includes(req.user.role)) return res.status(403).json({ error: 'Admin only' });
        
        const { id } = req.params;
        const item = await CarouselItem.findByPk(id);
        if (!item) return res.status(404).json({ error: 'Item not found' });

        await item.destroy();
        const actor = await User.findByPk(req.user.user_id);
        const meta = { details: item.title || item.carousel_id || item.id };
        if (actor && isStaffRole(actor.role)) {
            await notifyUserInApp(actor.user_id, 'Carousel item deleted', `You deleted carousel item ${item.carousel_id || item.id}.`, 'system');
            const text = buildStaffEmail('Carousel item deleted', `Carousel item ${item.carousel_id || item.id} deleted.`, meta);
            await queueEmailNotification({
                action: 'carousel_deleted_actor',
                entityId: `carousel:deleted:actor:${actor.user_id}:${item.carousel_id || item.id}`,
                to: actor.email,
                subject: 'Carousel item deleted',
                text,
                html: null,
                userId: actor.user_id,
                meta,
                source: 'admin',
                actorUserId: req.user.user_id
            });
        }
        await notifyAdmins({
            title: 'Carousel item deleted',
            message: `Carousel item ${item.carousel_id || item.id} deleted.`,
            subject: 'Carousel item deleted',
            text: buildStaffEmail('Carousel item deleted', `Carousel item ${item.carousel_id || item.id} deleted.`, meta),
            action: 'carousel_deleted',
            meta,
            actorUserId: req.user.user_id
        });
        res.json({ message: 'Deleted' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
