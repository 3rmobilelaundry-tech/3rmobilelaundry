const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User');

const SyncEvent = sequelize.define('SyncEvent', {
  event_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  actor_user_id: {
    type: DataTypes.INTEGER,
    references: { model: User, key: 'user_id' }
  },
  target_user_id: {
    type: DataTypes.INTEGER,
    references: { model: User, key: 'user_id' }
  },
  source: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'system'
  },
  entity_type: {
    type: DataTypes.STRING,
    allowNull: false
  },
  entity_id: {
    type: DataTypes.STRING,
    allowNull: false
  },
  action: {
    type: DataTypes.STRING,
    allowNull: false
  },
  payload: {
    type: DataTypes.JSON,
    allowNull: true
  },
  critical: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  status: {
    type: DataTypes.ENUM('pending', 'sent', 'failed'),
    defaultValue: 'pending'
  },
  attempts: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  next_retry_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  last_error: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = SyncEvent;
