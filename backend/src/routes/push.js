const express = require('express');
const router = express.Router();
const { UserDeviceToken } = require('../models');
const { verifyToken } = require('../middleware/auth');

router.post('/register-device', verifyToken, async (req, res) => {
  try {
    const { deviceToken, platform } = req.body;
    const userId = req.user.user_id;

    if (!deviceToken) {
      return res.status(400).json({ error: 'Device token is required' });
    }

    const [tokenRecord, created] = await UserDeviceToken.findOrCreate({
      where: { fcm_token: deviceToken },
      defaults: {
        user_id: userId,
        device_type: platform || 'web',
        created_at: new Date()
      }
    });

    if (!created) {
      if (Number(tokenRecord.user_id) !== Number(userId)) {
          tokenRecord.user_id = userId;
      }
      if (platform) tokenRecord.device_type = platform;
      await tokenRecord.save();
    }

    console.log(`Device token registered for user ${userId}`);
    res.json({ success: true, message: 'Device token registered' });
  } catch (error) {
    console.error('Device registration error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
