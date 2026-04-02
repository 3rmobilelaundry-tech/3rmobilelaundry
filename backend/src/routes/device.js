const express = require('express');
const router = express.Router();
const { UserDeviceToken } = require('../models');
const { verifyToken } = require('../middleware/auth');

// Register device token
router.post('/register', verifyToken, async (req, res) => {
  console.log("DEVICE REGISTER ENDPOINT HIT");
  console.log("REQ.USER:", req.user);
  console.log("BODY:", req.body);
  try {
    const { fcmToken, deviceType } = req.body;
    const userId = req.user.user_id;

    if (!fcmToken) {
      return res.status(400).json({ error: 'fcmToken is required' });
    }

    console.log("User registering device:", userId);
    console.log("Token:", fcmToken);

    const [record, created] = await UserDeviceToken.findOrCreate({
      where: { fcm_token: fcmToken },
      defaults: {
        user_id: userId,
        device_type: deviceType || 'android',
        created_at: new Date()
      }
    });

    if (!created) {
      record.user_id = userId;
      record.device_type = deviceType || 'android';
      await record.save();
    }

    console.log(`FCM token saved for user ${userId}`);

    res.json({ success: true });

  } catch (err) {
    console.error("Device error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/test', verifyToken, async (req, res) => {
  const devices = await UserDeviceToken.findAll({
    where: { user_id: req.user.user_id }
  });

  res.json({ devices });
});

module.exports = router;

