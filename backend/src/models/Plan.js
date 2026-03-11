const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Plan = sequelize.define('Plan', {
  plan_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  duration_days: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  max_pickups: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  clothes_limit: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 15
  },
  type: {
    type: DataTypes.ENUM('weekly', 'monthly', 'semester'),
    defaultValue: 'monthly'
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    defaultValue: 'active'
  },
  is_popular: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  payment_methods: {
    type: DataTypes.STRING, // JSON string e.g. ["cash", "transfer"]
    allowNull: true,
    defaultValue: '["cash","transfer","paystack"]'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = Plan;
