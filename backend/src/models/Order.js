const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User');
const Subscription = require('./Subscription');

const Order = sequelize.define('Order', {
  order_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  user_id: {
    type: DataTypes.INTEGER,
    references: { model: User, key: 'user_id' },
    allowNull: false
  },
  subscription_id: {
    type: DataTypes.INTEGER,
    references: { model: Subscription, key: 'subscription_id' },
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('pending', 'accepted', 'picked_up', 'processing', 'ready', 'delivered', 'cancelled'),
    defaultValue: 'pending'
  },
  pickup_date: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  pickup_time: {
    type: DataTypes.STRING,
    allowNull: false
  },
  clothes_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  extra_clothes_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  extra_amount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  is_emergency: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  emergency_total_amount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  assigned_rider_id: {
    type: DataTypes.INTEGER,
    references: { model: User, key: 'user_id' },
    allowNull: true
  },
  pickup_address: {
    type: DataTypes.STRING,
    allowNull: true
  },
  delivery_address: {
    type: DataTypes.STRING,
    allowNull: true
  },
  completed_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  is_locked: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  version: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  }
}, {
  timestamps: true,
  version: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = Order;
