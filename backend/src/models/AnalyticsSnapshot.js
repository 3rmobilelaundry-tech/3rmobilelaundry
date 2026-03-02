const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const AnalyticsSnapshot = sequelize.define('AnalyticsSnapshot', {
  snapshot_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  period_type: {
    type: DataTypes.ENUM('daily', 'weekly', 'monthly'),
    allowNull: false
  },
  period_start: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  period_end: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  metrics: {
    type: DataTypes.TEXT, // JSON string
    allowNull: false
  }
}, {
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false
});

module.exports = AnalyticsSnapshot;
