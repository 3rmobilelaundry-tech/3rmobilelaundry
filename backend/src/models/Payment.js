const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User');

const Payment = sequelize.define('Payment', {
  payment_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  user_id: {
    type: DataTypes.INTEGER,
    references: { model: User, key: 'user_id' }
  },
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  currency: {
    type: DataTypes.STRING,
    defaultValue: 'NGN'
  },
  status: {
    type: DataTypes.ENUM('paid', 'pending', 'failed', 'awaiting_verification', 'rejected', 'declined'),
    defaultValue: 'pending'
  },
  gateway: {
    type: DataTypes.ENUM('cash', 'bank_transfer', 'paystack'),
    defaultValue: 'cash'
  },
  payment_type: {
    type: DataTypes.ENUM('subscription', 'extra_clothes', 'emergency'),
    allowNull: false
  },
  metadata: {
    type: DataTypes.JSON,
    allowNull: true
  },
  reference: {
    type: DataTypes.STRING
  },
  receipt_url: {
    type: DataTypes.STRING
  }
}, {
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = Payment;
