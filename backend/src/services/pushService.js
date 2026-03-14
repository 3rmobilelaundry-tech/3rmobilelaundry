const admin = require('firebase-admin');
const { DeviceToken } = require('../models');

let isInitialized = false;

try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    isInitialized = true;
    console.log('Firebase Admin initialized successfully');
  } else {
    console.warn('FIREBASE_SERVICE_ACCOUNT environment variable not found. Push notifications will be disabled.');
  }
} catch (error) {
  console.error('Failed to initialize Firebase Admin:', error);
}

/**
 * Send a push notification to a specific user
 * @param {number} userId - The ID of the user
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {object} data - Optional data payload
 */
const sendPushNotification = async (userId, title, body, data = {}) => {
  if (!isInitialized) return;

  try {
    const tokens = await DeviceToken.findAll({ where: { user_id: userId } });
    if (!tokens.length) return;

    const registrationTokens = tokens.map(t => t.token);

    // Multicast message
    const message = {
      notification: { title, body },
      data: {
        ...data,
        click_action: 'FLUTTER_NOTIFICATION_CLICK' // Standard for many cross-platform apps
      },
      tokens: registrationTokens
    };

    const response = await admin.messaging().sendMulticast(message);
    
    // Clean up invalid tokens
    if (response.failureCount > 0) {
      const failedTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          failedTokens.push(registrationTokens[idx]);
        }
      });
      if (failedTokens.length > 0) {
        await DeviceToken.destroy({ where: { token: failedTokens } });
        console.log('Removed invalid tokens:', failedTokens.length);
      }
    }
    
    console.log(`Push notification sent to user ${userId}: ${response.successCount} success, ${response.failureCount} failure`);
  } catch (error) {
    console.error('Error sending push notification:', error);
  }
};

/**
 * Register a device token for a user
 * @param {number} userId 
 * @param {string} token 
 * @param {string} platform 
 */
const registerDeviceToken = async (userId, token, platform = 'web') => {
  try {
    const [record, created] = await DeviceToken.findOrCreate({
      where: { token },
      defaults: { user_id: userId, platform }
    });

    if (!created && record.user_id !== userId) {
      // Token exists but belongs to someone else (e.g. logout/login on same device)
      await record.update({ user_id: userId, platform, last_used_at: new Date() });
    } else {
      await record.update({ last_used_at: new Date() });
    }
    return record;
  } catch (error) {
    console.error('Error registering device token:', error);
    throw error;
  }
};

module.exports = {
  sendPushNotification,
  registerDeviceToken
};
