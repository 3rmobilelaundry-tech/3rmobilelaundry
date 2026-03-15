const express = require('express');
const router = express.Router();
const { UserDeviceToken } = require('../models');
const authenticate = require('../middleware/auth'); // or wherever your auth middleware is

// Save device token
router.post('/device-token', authenticate, async (req, res) => {
  try {

    const userId = req.user.user_id;
    const { fcm_token, device_type } = req.body;

    if (!fcm_token) {
      return res.status(400).json({ error: 'Missing FCM token' });
    }

    await UserDeviceToken.upsert({
      user_id: userId,
      fcm_token,
      device_type: device_type || 'android'
    });

    res.json({ success: true });

  } catch (error) {
    console.error('Error saving device token:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
