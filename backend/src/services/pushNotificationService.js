const admin = require('firebase-admin');
const { UserDeviceToken } = require('../models');

let isInitialized = false;

try {
  if (!admin.apps.length) {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });

      isInitialized = true;
      console.log('Firebase Admin initialized successfully in PushNotificationService');
    } else {
      console.warn('FIREBASE_SERVICE_ACCOUNT environment variable not found. Push notifications will be disabled.');
    }
  } else {
    isInitialized = true;
  }
} catch (error) {
  console.error('Failed to initialize Firebase Admin in PushNotificationService:', error);
}

/**
 * Send push notification to a user
 */
const sendPushNotification = async (userId, title, message, data = {}) => {
  if (!isInitialized) return;

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
