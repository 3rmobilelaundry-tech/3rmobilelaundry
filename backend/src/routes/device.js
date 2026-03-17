const express = require('express');
const router = express.Router();
const { UserDeviceToken } = require('../models');
const { verifyToken } = require('../middleware/auth'); // ✅ ADD THIS

// POST /api/device/register
router.post('/register', verifyToken, async (req, res) => { // ✅ ADD verifyToken
  try {
    const { fcmToken, deviceType } = req.body;
    const userId = req.user.user_id;

    if (!fcmToken) {
      return res.status(400).json({
        error: 'fcmToken is required'
      });
    }

    const [tokenRecord, created] = await UserDeviceToken.findOrCreate({
      where: { fcm_token: fcmToken },
      defaults: {
        user_id: userId,
        device_type: deviceType || 'android',
        created_at: new Date()
      }
    });

    if (!created) {
      tokenRecord.user_id = userId;
      tokenRecord.device_type = deviceType || 'android';
      await tokenRecord.save();
    }

    console.log(`FCM token saved for user ${userId}`);

    res.json({
      success: true,
      message: "Device token registered"
    });

  } catch (error) {
    console.error("Device register error:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
