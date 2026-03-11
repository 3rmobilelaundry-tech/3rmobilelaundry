const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Invite = sequelize.define('Invite', {
  invite_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  token: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false
  },
  role: {
    type: DataTypes.ENUM('rider', 'washer', 'receptionist'),
    allowNull: false
  },
  phone_number: {
    type: DataTypes.STRING,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('pending', 'accepted', 'expired'),
    defaultValue: 'pending'
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = Invite;
