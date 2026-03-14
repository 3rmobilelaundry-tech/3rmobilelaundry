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
 * Send a push notification to a specific user using FCM
 * @param {number} userId - The ID of the user
 * @param {string} title - Notification title
 * @param {string} message - Notification message body
 * @param {object} data - Optional data payload for click behavior
 */
const sendPushNotification = async (userId, title, message, data = {}) => {
  if (!isInitialized) return;

  try {
    const tokens = await UserDeviceToken.findAll({ where: { user_id: userId } });
    if (!tokens.length) return;

    const registrationTokens = tokens.map(t => t.fcm_token);

    const payload = {
      notification: {
        title: title,
        body: message
      },
      android: {
        priority: "high"
      },
      data: {
        ...data,
        click_action: "FLUTTER_NOTIFICATION_CLICK"
      },
      tokens: registrationTokens
    };

    const response = await admin.messaging().sendMulticast(payload);
    
    // Clean up invalid tokens
    if (response.failureCount > 0) {
      const failedTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          failedTokens.push(registrationTokens[idx]);
        }
      });
      if (failedTokens.length > 0) {
        await UserDeviceToken.destroy({ where: { fcm_token: failedTokens } });
        console.log('Removed invalid FCM tokens:', failedTokens.length);
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
