const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ChatThread = sequelize.define('ChatThread', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  order_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Orders',
      key: 'order_id',
    },
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'user_id',
    },
  },
  staff_id: {
    type: DataTypes.INTEGER,
    allowNull: true, 
    references: {
      model: 'Users',
      key: 'user_id',
    },
  },
  rider_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'Users',
      key: 'user_id',
    },
  },
  status: {
    type: DataTypes.ENUM('active', 'locked'),
    defaultValue: 'active',
  },
  locked_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'chat_threads',
  timestamps: false,
});

module.exports = ChatThread;
