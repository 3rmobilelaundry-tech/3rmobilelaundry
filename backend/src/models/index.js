const sequelize = require('../config/database');
const User = require('./User');
const Notification = require('./Notification');
const Invite = require('./Invite');
const Payment = require('./Payment');
const AuditLog = require('./AuditLog');
const Plan = require('./Plan');
const Subscription = require('./Subscription');
const Order = require('./Order');
const Code = require('./Code');
const AnalyticsSnapshot = require('./AnalyticsSnapshot');
const CarouselItem = require('./CarouselItem');
const ChatThread = require('./ChatThread');
const ChatMessage = require('./ChatMessage');
const SyncEvent = require('./SyncEvent');
const InventoryItem = require('./InventoryItem');
const RegistrationField = require('./RegistrationField');
const School = require('./School');
const DeviceToken = require('./DeviceToken');
const UserDeviceToken = require('./UserDeviceToken');

// Associations
User.hasMany(DeviceToken, { foreignKey: 'user_id' });
DeviceToken.belongsTo(User, { foreignKey: 'user_id' });

User.hasMany(UserDeviceToken, { foreignKey: 'user_id' });
UserDeviceToken.belongsTo(User, { foreignKey: 'user_id' });


User.hasMany(Notification, { foreignKey: 'user_id' });
Notification.belongsTo(User, { foreignKey: 'user_id' });

User.hasMany(AuditLog, { foreignKey: 'actor_user_id' });
AuditLog.belongsTo(User, { foreignKey: 'actor_user_id' });

User.hasMany(SyncEvent, { foreignKey: 'actor_user_id' });
SyncEvent.belongsTo(User, { as: 'Actor', foreignKey: 'actor_user_id' });
User.hasMany(SyncEvent, { foreignKey: 'target_user_id' });
SyncEvent.belongsTo(User, { as: 'Target', foreignKey: 'target_user_id' });

User.hasMany(Payment, { foreignKey: 'user_id' });
Payment.belongsTo(User, { foreignKey: 'user_id' });

User.hasMany(Subscription, { foreignKey: 'user_id' });
Subscription.belongsTo(User, { foreignKey: 'user_id' });
Plan.hasMany(Subscription, { foreignKey: 'plan_id' });
Subscription.belongsTo(Plan, { foreignKey: 'plan_id' });

User.hasMany(Order, { foreignKey: 'user_id' });
Order.belongsTo(User, { foreignKey: 'user_id' });
Order.belongsTo(User, { as: 'Rider', foreignKey: 'assigned_rider_id' });

Subscription.hasMany(Order, { foreignKey: 'subscription_id' });
Order.belongsTo(Subscription, { foreignKey: 'subscription_id' });

Order.hasMany(Code, { foreignKey: 'order_id' });
Code.belongsTo(Order, { foreignKey: 'order_id' });

// Chat Associations
Order.hasOne(ChatThread, { foreignKey: 'order_id' });
ChatThread.belongsTo(Order, { foreignKey: 'order_id' });

User.hasMany(ChatThread, { foreignKey: 'user_id' });
ChatThread.belongsTo(User, { as: 'Customer', foreignKey: 'user_id' });

User.hasMany(ChatThread, { foreignKey: 'staff_id' });
ChatThread.belongsTo(User, { as: 'Staff', foreignKey: 'staff_id' });

ChatThread.hasMany(ChatMessage, { foreignKey: 'thread_id' });
ChatMessage.belongsTo(ChatThread, { foreignKey: 'thread_id' });

module.exports = {
  sequelize,
  User,
  Notification,
  Invite,
  Payment,
  AuditLog,
  Plan,
  Subscription,
  Order,
  Code,
  AnalyticsSnapshot,
  CarouselItem,
  ChatThread,
  ChatMessage,
  SyncEvent,
  InventoryItem,
  RegistrationField,
  School,
  DeviceToken,
  UserDeviceToken
};
