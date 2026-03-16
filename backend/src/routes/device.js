const express = require('express');
const router = express.Router();
const { UserDeviceToken } = require('../models');

// POST /api/device/register
router.post('/register', async (req, res) => {
  try {

    // Accept both fcmToken and fcmtoken (to avoid frontend mistakes)
    const userId = req.body.userId;
    const fcmToken = req.body.fcmToken || req.body.fcmtoken;
    const deviceType = req.body.deviceType || 'android';

    if (!userId || !fcmToken) {
      console.log("Invalid device registration payload:", req.body);
      return res.status(400).json({
        error: 'userId and fcmToken are required'
      });
    }

    // Check if token already exists
    let tokenRecord = await UserDeviceToken.findOne({
      where: { fcm_token: fcmToken }
    });

    if (!tokenRecord) {

      // Create new token
      tokenRecord = await UserDeviceToken.create({
        user_id: userId,
        fcm_token: fcmToken,
        device_type: deviceType,
        created_at: new Date()
      });

      console.log(`New FCM token stored for user ${userId}`);

    } else {

      // Update existing token owner if necessary
      if (Number(tokenRecord.user_id) !== Number(userId)) {
        console.log(`FCM token reassigned from user ${tokenRecord.user_id} to ${userId}`);
        tokenRecord.user_id = userId;
      }

      tokenRecord.device_type = deviceType;
      await tokenRecord.save();

      console.log(`Existing FCM token updated for user ${userId}`);
    }

    return res.json({
      success: true,
      message: 'Device token registered'
    });

  } catch (error) {

    console.error('Device registration error:', error);

    return res.status(500).json({
      error: 'Failed to register device token'
    });

  }
});

module.exports = router;
