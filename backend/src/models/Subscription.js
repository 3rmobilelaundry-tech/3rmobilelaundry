const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User');
const Plan = require('./Plan');

const Subscription = sequelize.define('Subscription', {
  subscription_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  user_id: {
    type: DataTypes.INTEGER,
    references: {
      model: User,
      key: 'user_id'
    }
  },
  plan_id: {
    type: DataTypes.INTEGER,
    references: {
      model: Plan,
      key: 'plan_id'
    }
  },
  start_date: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  end_date: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  remaining_pickups: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  remaining_clothes: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  used_clothes: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  status: {
    type: DataTypes.ENUM('active', 'expired', 'cancelled', 'pending', 'paused', 'denied'),
    defaultValue: 'active'
  }
}, {
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = Subscription;
