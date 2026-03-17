const express = require('express');
const router = express.Router();
const { UserDeviceToken } = require('../models');
const { verifyToken } = require('../middleware/auth');

// POST /api/device/register
router.post('/register', verifyToken, async (req, res) => {
  try {
    if (!req.user || !req.user.user_id) {
      console.error("Device registration failed: Missing user in request");
      return res.status(401).json({ error: 'Unauthorized: User not found' });
    }

    const { fcmToken, deviceType } = req.body;
    const userId = req.user.user_id;

    if (!fcmToken) {
      return res.status(400).json({ error: 'fcmToken is required' });
    }

    console.log("Authenticated user:", req.user);
    console.log("Saving FCM token:", fcmToken);

    // Upsert token
    const [tokenRecord, created] = await UserDeviceToken.findOrCreate({
      where: { fcm_token: fcmToken },
      defaults: {
        user_id: userId,
        device_type: deviceType || 'android',
        created_at: new Date()
      }
    });

    if (!created) {
      // If token exists but user is different, update user_id (device changed hands)
      if (Number(tokenRecord.user_id) !== Number(userId)) {
        tokenRecord.user_id = userId;
      }
      tokenRecord.device_type = deviceType || 'android';
      await tokenRecord.save();
    }

    console.log(`FCM Device token registered for user ${userId}`);
    res.json({ success: true, message: 'Device token registered' });
  } catch (error) {
    console.error('Device registration error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/device/test-device
router.get('/test-device', verifyToken, async (req, res) => {
  try {
    if (!req.user || !req.user.user_id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const devices = await UserDeviceToken.findAll({
      where: { user_id: req.user.user_id }
    });

    return res.json({
      user: req.user,
      devices
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

