const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User');

const Notification = sequelize.define('Notification', {
  notification_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  user_id: {
    type: DataTypes.INTEGER,
    references: {
      model: User,
      key: 'user_id'
    },
    allowNull: true // Null for broadcast messages
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'Notification'
  },
  message: {
    type: DataTypes.STRING,
    allowNull: false
  },
  type: {
    type: DataTypes.ENUM('personal', 'broadcast'),
    defaultValue: 'personal'
  },
  event_type: {
    type: DataTypes.ENUM('order_update', 'payment', 'subscription', 'system', 'promo'),
    defaultValue: 'system'
  },
  channel: {
    type: DataTypes.ENUM('app', 'whatsapp'),
    defaultValue: 'app'
  },
  read_status: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false
});

module.exports = Notification;
