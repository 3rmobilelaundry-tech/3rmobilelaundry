const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const router = express.Router();

// Login route
router.post('/login', async (req, res) => {
  try {
    const { phone_number, password } = req.body;

    const user = await User.findOne({ phone: phone_number });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    res.json({ token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Register route (alias for signup)
router.post('/register', async (req, res) => {
  try {
    const { phone_number, password, full_name, role, email } = req.body;

    // Validate required fields
    if (!phone_number || !password || !full_name || !role) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ phone: phone_number });
    if (existingUser) {
      return res.status(409).json({ error: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const newUser = await User.create({
      phone: phone_number,
      password: hashedPassword,
      name: full_name,
      role,
      email,
    });

    // Generate token for immediate login
    const token = jwt.sign(
      { id: newUser._id, role: newUser.role },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    // Return success with token and user
    res.status(201).json({
      token,
      user: {
        id: newUser._id,
        phone: newUser.phone,
        name: newUser.name,
        role: newUser.role,
        email: newUser.email,
      }
    });

  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;