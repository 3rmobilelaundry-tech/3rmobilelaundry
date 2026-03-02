const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Order = require('./Order');

const Code = sequelize.define('Code', {
  code_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  order_id: {
    type: DataTypes.INTEGER,
    references: { model: Order, key: 'order_id' },
    allowNull: false
  },
  code_value: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  type: {
    type: DataTypes.ENUM('pickup', 'release'),
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('active', 'used', 'expired'),
    defaultValue: 'active'
  },
  attempt_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: false
  }
}, {
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = Code;
