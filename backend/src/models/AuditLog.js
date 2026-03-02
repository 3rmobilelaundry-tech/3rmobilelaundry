const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User');

const AuditLog = sequelize.define('AuditLog', {
  log_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  actor_user_id: {
    type: DataTypes.INTEGER,
    references: { model: User, key: 'user_id' }
  },
  action: {
    type: DataTypes.STRING,
    allowNull: false
  },
  entity_type: {
    type: DataTypes.STRING,
    allowNull: false
  },
  entity_id: {
    type: DataTypes.STRING,
    allowNull: false
  },
  details: {
    type: DataTypes.TEXT
  }
}, {
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false
});

module.exports = AuditLog;
