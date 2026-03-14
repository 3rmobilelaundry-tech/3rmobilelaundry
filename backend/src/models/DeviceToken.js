const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User');

const DeviceToken = sequelize.define('DeviceToken', {
  token_id: {
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
    allowNull: false
  },
  token: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  platform: {
    type: DataTypes.STRING,
    defaultValue: 'web' // web, android, ios
  },
  last_used_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = DeviceToken;
