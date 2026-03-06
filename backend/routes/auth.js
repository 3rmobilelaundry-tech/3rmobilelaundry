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

// Signup route for creating head admin
router.post('/signup', async (req, res) => {
  try {
    const { phone_number, password, name, role } = req.body;

    // Validate required fields
    if (!phone_number || !password || !name || !role) {
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
      name,
      role,
    });

    // Return success (don't return the password)
    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: newUser._id,
        phone: newUser.phone,
        name: newUser.name,
        role: newUser.role,
      }
    });

  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;