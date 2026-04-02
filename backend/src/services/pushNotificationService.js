const admin = require('../../config/firebase');
const { UserDeviceToken } = require('../models');

const sendPushNotification = async (userId, title, message, data = {}) => {
  if (!admin.apps.length) return;

  try {

    const tokens = await UserDeviceToken.findAll({
      where: { user_id: userId }
    });

    if (!tokens.length) {
      console.log(`No device tokens found for user ${userId}`);
      return;
    }

    const registrationTokens = tokens.map(t => t.fcm_token);

    const payload = {
      tokens: registrationTokens,
      notification: {
        title: title,
        body: message
      },
      android: {
        priority: "high",
        notification: {
          channelId: "default"
        }
      },
      data: {
        ...data
      }
    };

    // ✅ Correct Firebase method
    const response = await admin.messaging().sendEachForMulticast(payload);

    // Clean invalid tokens
    if (response.failureCount > 0) {

      const failedTokens = [];

      response.responses.forEach((resp, index) => {
        if (!resp.success) {
          failedTokens.push(registrationTokens[index]);
        }
      });

      if (failedTokens.length > 0) {
        await UserDeviceToken.destroy({
          where: { fcm_token: failedTokens }
        });

        console.log(`Removed ${failedTokens.length} invalid FCM tokens`);
      }
    }

    console.log(`Push notification sent to user ${userId}: ${title}`);

  } catch (error) {
    console.error('Error sending push notification:', error);
  }
};

module.exports = {
  sendPushNotification
};
