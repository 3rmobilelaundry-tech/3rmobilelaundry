const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  phone: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  role: { type: String, required: true },
  name: String,
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('User', UserSchema);