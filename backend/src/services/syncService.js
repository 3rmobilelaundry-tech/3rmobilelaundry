const fs = require('fs');
const path = require('path');
const { SyncEvent, AuditLog, Notification, User, Subscription, Payment, Order, InventoryItem, sequelize } = require('../models');
const { Op } = require('sequelize');
const sse = require('./sse');
const { sendEmail } = require('./emailService');

const MAX_RETRIES = 5;
const SETTINGS_PATH = path.join(__dirname, '..', 'config', 'app-settings.json');

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

function buildDefaultEmailTemplates(appName) {
  return {
    enabled: true,
    login: {
      enabled: true,
      subject: `New login to {{app_name}}`,
      text: `Hi {{user_name}},\n\nA successful login to {{app_name}} was detected.\nTime: {{login_time}}\nIP: {{ip_address}}\nDevice: {{user_agent}}\n\nIf this was not you, please reset your password.`,
      html: `<h2>Login alert</h2><p>Hi {{user_name}},</p><p>A successful login to {{app_name}} was detected.</p><ul><li>Time: {{login_time}}</li><li>IP: {{ip_address}}</li><li>Device: {{user_agent}}</li></ul><p>If this was not you, please reset your password.</p>`
    },
    payment: {
      enabled: true,
      subject: `Payment update: {{payment_event}}`,
      text: `Hi {{user_name}},\n\nPayment update: {{payment_event}}\nPlan: {{plan_name}}\nAmount: {{amount}}\nStatus: {{status}}\nReference: {{reference}}\nTime: {{event_time}}\n`,
      html: `<h2>Payment update</h2><p>Hi {{user_name}},</p><p>{{payment_event}}</p><ul><li>Plan: {{plan_name}}</li><li>Amount: {{amount}}</li><li>Status: {{status}}</li><li>Reference: {{reference}}</li><li>Time: {{event_time}}</li></ul>`
    },
    order_status: {
      enabled: true,
      subject: `Order {{order_id}}: {{status}}`,
      text: `Hi {{user_name}},\n\nYour order {{order_id}} status is now {{status}}.\n{{status_explanation}}\nNext step: {{next_step}}\n`,
      html: `<h2>Order status update</h2><p>Hi {{user_name}},</p><p>Your order <strong>{{order_id}}</strong> status is now <strong>{{status}}</strong>.</p><p>{{status_explanation}}</p><p>Next step: {{next_step}}</p>`
    }
  };
}

function normalizeEmailSettings(raw = {}, appName) {
  const defaults = buildDefaultEmailTemplates(appName);
  return {
    enabled: raw.enabled !== undefined ? raw.enabled : defaults.enabled,
    login: { ...defaults.login, ...(raw.login || {}) },
    payment: { ...defaults.payment, ...(raw.payment || {}) },
    order_status: { ...defaults.order_status, ...(raw.order_status || {}) }
  };
}

function renderTemplate(template, variables) {
  if (!template) return '';
  return String(template).replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => {
    const value = variables[key];
    if (value === undefined || value === null) return '';
    return String(value);
  });
}

const orderStatusDetails = {
  pending: {
    label: 'Order placed',
    explanation: 'We have received your order and it is queued.',
    next: 'We will confirm and schedule pickup.'
  },
  accepted: {
    label: 'Order accepted',
    explanation: 'Your order has been accepted and a rider will be assigned.',
    next: 'Prepare your items for pickup.'
  },
  picked_up: {
    label: 'Picked up',
    explanation: 'Your items have been picked up and are on the way to the laundry.',
    next: 'We will begin processing soon.'
  },
  processing: {
    label: 'Processing',
    explanation: 'Your laundry is being washed and processed.',
    next: 'We will notify you when it is ready.'
  },
  ready: {
    label: 'Ready',
    explanation: 'Your laundry is ready for delivery.',
    next: 'A rider will deliver your items shortly.'
  },
  delivered: {
    label: 'Delivered',
    explanation: 'Your order has been delivered successfully.',
    next: 'Thank you for using our service.'
  },
  cancelled: {
    label: 'Cancelled',
    explanation: 'Your order has been cancelled.',
    next: 'Contact support if you need help.'
  }
};

async function queueEmailNotification({ action, entityId, to, subject, text, html, userId, meta = {}, source = 'system', actorUserId }) {
  if (!to || !subject) return null;
  const existing = await SyncEvent.findOne({
    where: {
      entity_type: 'email_notification',
      entity_id: String(entityId),
      action
    }
  });
  if (existing) return existing;
  return createSyncEvent({
    actor_user_id: actorUserId || null,
    target_user_id: userId || null,
    source,
    entity_type: 'email_notification',
    entity_id: String(entityId),
    action,
    payload: {
      to,
      subject,
      text,
      html,
      user_id: userId || null,
      meta
    },
    critical: false
  });
}

async function queueLoginEmail({ user, ipAddress, userAgent }) {
  if (!user?.email) return null;
  const settings = readSettings();
  const appName = settings.branding?.app_name || '3R Laundry';
  const emailSettings = normalizeEmailSettings(settings.notifications?.email, appName);
  if (!emailSettings.enabled || !emailSettings.login?.enabled) return null;
  const now = new Date();
  const vars = {
    app_name: appName,
    user_name: user.full_name || user.first_name || user.email,
    login_time: now.toISOString(),
    ip_address: ipAddress || 'Unknown',
    user_agent: userAgent || 'Unknown'
  };
  const subject = renderTemplate(emailSettings.login.subject, vars);
  const text = renderTemplate(emailSettings.login.text, vars);
  const html = renderTemplate(emailSettings.login.html, vars);
  const entityId = `login:${user.user_id}:${now.toISOString()}`;
  return queueEmailNotification({
    action: 'login_success',
    entityId,
    to: user.email,
    subject,
    text,
    html,
    userId: user.user_id,
    meta: { type: 'login', variables: vars }
  });
}

async function queuePaymentEmail({ user, payment, planName, amount, status, event, reference, source = 'system', actorUserId }) {
  if (!user?.email) return null;
  const settings = readSettings();
  const appName = settings.branding?.app_name || '3R Laundry';
  const emailSettings = normalizeEmailSettings(settings.notifications?.email, appName);
  if (!emailSettings.enabled || !emailSettings.payment?.enabled) return null;
  const now = new Date();
  const vars = {
    app_name: appName,
    user_name: user.full_name || user.first_name || user.email,
    plan_name: planName || payment?.metadata?.plan_name || '',
    amount: amount !== undefined && amount !== null ? amount : payment?.amount,
    status: status || payment?.status || '',
    reference: reference || payment?.reference || payment?.payment_reference || '',
    event_time: now.toISOString(),
    payment_event: event
  };
  const subject = renderTemplate(emailSettings.payment.subject, vars);
  const text = renderTemplate(emailSettings.payment.text, vars);
  const html = renderTemplate(emailSettings.payment.html, vars);
  const entityId = payment?.payment_id
    ? `payment:${payment.payment_id}:${event}`
    : `payment:${vars.reference || event}:${vars.event_time}`;
  return queueEmailNotification({
    action: 'payment_event',
    entityId,
    to: user.email,
    subject,
    text,
    html,
    userId: user.user_id,
    meta: { type: 'payment', event, status: vars.status, payment_id: payment?.payment_id, reference: vars.reference },
    source,
    actorUserId
  });
}

async function queueOrderStatusEmail({ user, order, status, source = 'system', actorUserId }) {
  if (!user?.email || !order) return null;
  const settings = readSettings();
  const appName = settings.branding?.app_name || '3R Laundry';
  const emailSettings = normalizeEmailSettings(settings.notifications?.email, appName);
  if (!emailSettings.enabled || !emailSettings.order_status?.enabled) return null;
  const details = orderStatusDetails[status] || {
    label: status,
    explanation: 'Your order status has been updated.',
    next: ''
  };
  const vars = {
    app_name: appName,
    user_name: user.full_name || user.first_name || user.email,
    order_id: order.order_id || order.id,
    status: details.label,
    status_explanation: details.explanation,
    next_step: details.next
  };
  const subject = renderTemplate(emailSettings.order_status.subject, vars);
  const text = renderTemplate(emailSettings.order_status.text, vars);
  const html = renderTemplate(emailSettings.order_status.html, vars);
  const entityId = `order:${order.order_id || order.id}:${status}`;
  return queueEmailNotification({
    action: 'order_status',
    entityId,
    to: user.email,
    subject,
    text,
    html,
    userId: user.user_id,
    meta: { type: 'order_status', status, order_id: order.order_id || order.id },
    source,
    actorUserId
  });
}

function computeNextRetry(attempt) {
  const delay = Math.min(60000, 1000 * Math.pow(2, attempt));
  return new Date(Date.now() + delay);
}

async function createSyncEvent({
  actor_user_id,
  target_user_id,
  source = 'system',
  entity_type,
  entity_id,
  action,
  payload,
  critical = false,
  transaction
}) {
  const syncEvent = await SyncEvent.create({
    actor_user_id,
    target_user_id,
    source,
    entity_type,
    entity_id: String(entity_id),
    action,
    payload,
    critical,
    status: 'pending',
    attempts: 0,
    next_retry_at: new Date()
  }, transaction ? { transaction } : undefined);

  await AuditLog.create({
    actor_user_id: actor_user_id || null,
    action: 'sync_event_created',
    entity_type,
    entity_id: String(entity_id),
    details: JSON.stringify({ source, action, critical })
  }, transaction ? { transaction } : undefined);

  return syncEvent;
}

async function ensurePaymentSubscriptionConsistency(payment, t) {
  if (payment.payment_type !== 'subscription' || payment.status !== 'paid') return;
  let sub;
  if (payment.metadata && payment.metadata.subscription_id) {
    sub = await Subscription.findByPk(payment.metadata.subscription_id, { transaction: t });
  } else {
    sub = await Subscription.findOne({ where: { user_id: payment.user_id }, order: [['created_at', 'DESC']], transaction: t });
  }
  if (!sub) throw new Error('Subscription missing for paid payment');
  if (sub.status !== 'active') {
    await sub.update({ status: 'active' }, { transaction: t });
  }
}

async function ensureOrderCompletionStamp(order, t) {
  if (order.status !== 'delivered') return;
  if (!order.completed_at) {
    await order.update({ completed_at: new Date() }, { transaction: t });
  }
}

async function ensureInventoryNonNegative(item) {
  if (item.quantity < 0) {
    throw new Error('Inventory quantity below zero');
  }
}

async function applyEventIntegrity(syncEvent, t) {
  const payload = syncEvent.payload || {};
  if (syncEvent.entity_type === 'payment') {
    const payment = await Payment.findByPk(syncEvent.entity_id, { transaction: t });
    if (!payment) throw new Error('Payment not found');
    await ensurePaymentSubscriptionConsistency(payment, t);
    return { entity: payment, payload };
  }
  if (syncEvent.entity_type === 'order') {
    const order = await Order.findByPk(syncEvent.entity_id, { transaction: t });
    if (!order) throw new Error('Order not found');
    await ensureOrderCompletionStamp(order, t);
    return { entity: order, payload };
  }
  if (syncEvent.entity_type === 'profile') {
    const user = await User.findByPk(syncEvent.entity_id, { transaction: t });
    if (!user) throw new Error('User not found');
    return { entity: user, payload };
  }
  if (syncEvent.entity_type === 'inventory') {
    const item = await InventoryItem.findByPk(syncEvent.entity_id, { transaction: t });
    if (!item) throw new Error('Inventory item not found');
    await ensureInventoryNonNegative(item);
    return { entity: item, payload };
  }
  return { entity: null, payload };
}

async function notifyAdminFailure(syncEvent, errorMessage) {
  const admins = await User.findAll({ where: { role: 'admin' } });
  if (admins.length === 0) return;
  const notifications = admins.map(admin => ({
    user_id: admin.user_id,
    title: 'Sync Failure',
    message: `Event ${syncEvent.entity_type}:${syncEvent.entity_id} ${syncEvent.action} failed`,
    type: 'system',
    event_type: 'sync',
    channel: 'app'
  }));
  await Notification.bulkCreate(notifications);
}

async function processSingleEvent(syncEvent) {
  const nextAttempt = syncEvent.attempts + 1;
  try {
    if (syncEvent.entity_type === 'email_notification') {
      const payload = syncEvent.payload || {};
      // Use Resend directly
      await sendEmail(payload.to, payload.subject, payload.html || `<p>${payload.text}</p>`);
      
      await sequelize.transaction(async (t) => {
        await SyncEvent.update({
          status: 'sent',
          attempts: nextAttempt,
          last_error: null,
          next_retry_at: null
        }, { where: { event_id: syncEvent.event_id }, transaction: t });
        await AuditLog.create({
          actor_user_id: syncEvent.actor_user_id || null,
          action: 'sync_event_sent',
          entity_type: syncEvent.entity_type,
          entity_id: String(syncEvent.entity_id),
          details: JSON.stringify({ attempts: nextAttempt })
        }, { transaction: t });
      });
      return;
    }
    await sequelize.transaction(async (t) => {
      await applyEventIntegrity(syncEvent, t);
      await SyncEvent.update({
        status: 'sent',
        attempts: nextAttempt,
        last_error: null,
        next_retry_at: null
      }, { where: { event_id: syncEvent.event_id }, transaction: t });
      await AuditLog.create({
        actor_user_id: syncEvent.actor_user_id || null,
        action: 'sync_event_sent',
        entity_type: syncEvent.entity_type,
        entity_id: String(syncEvent.entity_id),
        details: JSON.stringify({ attempts: nextAttempt })
      }, { transaction: t });
    });

    if (syncEvent.critical) {
      sse.broadcast('sync_event', {
        event_id: syncEvent.event_id,
        entity_type: syncEvent.entity_type,
        entity_id: syncEvent.entity_id,
        action: syncEvent.action,
        payload: syncEvent.payload || null,
        created_at: syncEvent.created_at
      });
    }
  } catch (e) {
    console.error(`SyncEvent failed (ID: ${syncEvent.event_id}):`, e);
    const nextRetryAt = nextAttempt >= MAX_RETRIES ? null : computeNextRetry(nextAttempt);
    await SyncEvent.update({
      status: 'failed',
      attempts: nextAttempt,
      last_error: e.message,
      next_retry_at: nextRetryAt
    }, { where: { event_id: syncEvent.event_id } });
    await AuditLog.create({
      actor_user_id: syncEvent.actor_user_id || null,
      action: 'sync_event_failed',
      entity_type: syncEvent.entity_type,
      entity_id: String(syncEvent.entity_id),
      details: JSON.stringify({ attempts: nextAttempt, error: e.message })
    });
    await notifyAdminFailure(syncEvent, e.message);
    if (nextAttempt >= MAX_RETRIES) {
      return;
    }
  }
}

async function processPendingSyncEvents() {
  const now = new Date();
  const events = await SyncEvent.findAll({
    where: {
      status: { [Op.in]: ['pending', 'failed'] },
      [Op.or]: [
        { next_retry_at: null },
        { next_retry_at: { [Op.lte]: now } }
      ]
    },
    order: [['created_at', 'ASC']],
    limit: 100
  });
  for (const event of events) {
    await processSingleEvent(event);
  }
}

module.exports = {
  createSyncEvent,
  processPendingSyncEvents,
  queueEmailNotification,
  queueLoginEmail,
  queuePaymentEmail,
  queueOrderStatusEmail
};
