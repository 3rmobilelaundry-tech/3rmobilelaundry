const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ChatMessage = sequelize.define('ChatMessage', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  thread_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'chat_threads',
      key: 'id',
    },
  },
  sender_role: {
    type: DataTypes.STRING, // 'student' (mapped from 'user' in prompt), 'admin', 'rider', 'receptionist'
    allowNull: false,
  },
  sender_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  message_type: {
    type: DataTypes.ENUM('text', 'system'),
    defaultValue: 'text',
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  read_status: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  timestamp: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'chat_messages',
  timestamps: false,
});

module.exports = ChatMessage;
