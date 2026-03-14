const express = require('express');
const router = express.Router();
const { User, DeviceToken } = require('../models');
const { verifyToken } = require('../middleware/auth');

// Register Device Token
router.post('/register-device', verifyToken, async (req, res) => {
  try {
    const { userId, deviceToken } = req.body;
    
    // Allow user_id from body if matches authenticated user (or if admin)
    // But primarily use req.user.user_id
    const effectiveUserId = userId || req.user.user_id;

    if (Number(effectiveUserId) !== Number(req.user.user_id) && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    if (!deviceToken) {
      return res.status(400).json({ error: 'Device token is required' });
    }

    // Upsert token
    const [tokenRecord, created] = await DeviceToken.findOrCreate({
      where: { token: deviceToken },
      defaults: {
        user_id: effectiveUserId,
        platform: req.body.platform || 'web',
        last_active: new Date()
      }
    });

    if (!created) {
      // If token exists but user is different, update user_id (device changed hands?)
      // Or just update last_active
      if (Number(tokenRecord.user_id) !== Number(effectiveUserId)) {
          tokenRecord.user_id = effectiveUserId;
      }
      tokenRecord.last_active = new Date();
      if (req.body.platform) tokenRecord.platform = req.body.platform;
      await tokenRecord.save();
    }

    console.log(`Device token registered for user ${effectiveUserId}`);
    res.json({ success: true, message: 'Device token registered' });
  } catch (error) {
    console.error('Device registration error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
