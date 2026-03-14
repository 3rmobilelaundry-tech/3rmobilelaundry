const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const UserDeviceToken = sequelize.define('UserDeviceToken', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  fcm_token: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  device_type: {
    type: DataTypes.STRING,
    defaultValue: 'android'
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'user_device_tokens',
  timestamps: false
});

module.exports = UserDeviceToken;
