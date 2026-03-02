const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const User = sequelize.define('User', {
  user_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  full_name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  email: {
    type: DataTypes.STRING,
    allowNull: true, // Initially true for migration, enforce in logic if needed
    unique: true
  },
  phone_number: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  },
  student_id: {
    type: DataTypes.STRING,
    allowNull: true // Optional for staff
  },
  school: {
    type: DataTypes.STRING,
    allowNull: true // Optional for staff
  },
  hostel_address: {
    type: DataTypes.STRING,
    allowNull: true
  },
  profile_fields: {
    type: DataTypes.JSON,
    allowNull: true
  },
  profile_fields: {
    type: DataTypes.JSON,
    allowNull: true
  },
  avatar_url: {
    type: DataTypes.STRING,
    allowNull: true
  },
  role: {
    type: DataTypes.ENUM('student', 'rider', 'washer', 'receptionist', 'admin'),
    defaultValue: 'student'
  },
  status: {
    type: DataTypes.ENUM('active', 'suspended', 'inactive'),
    defaultValue: 'active'
  },
  is_deleted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  deleted_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  failed_login_attempts: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  last_failed_login: {
    type: DataTypes.DATE,
    allowNull: true
  },
  is_flagged: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  flag_reason: {
    type: DataTypes.STRING,
    allowNull: true
  },
  email_verified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  email_verified_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  email_verification_otp_hash: {
    type: DataTypes.STRING,
    allowNull: true
  },
  email_verification_expires_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  email_verification_sent_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  phone_verified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  phone_verified_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  phone_verified_by: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  phone_verification_otp_hash: {
    type: DataTypes.STRING,
    allowNull: true
  },
  phone_verification_expires_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  phone_verification_sent_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  password_reset_otp_hash: {
    type: DataTypes.STRING,
    allowNull: true
  },
  password_reset_expires_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  password_reset_requested_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  token_version: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  }
}, {
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = User;
