const admin = require('../config/firebase');

const sendNotification = async (token, title, body, data = {}) => {
  try {
    if (!token) {
        console.warn('Push notification failed: missing device token');
        return null;
    }

    if (!admin.apps.length) {
        console.warn('Firebase Admin not initialized, skipping notification');
        return null;
    }

    const message = {
      notification: {
        title: title,
        body: body
      },
      data: data,
      token: token
    };

    const response = await admin.messaging().send(message);
    console.log('Push notification sent successfully:', response);
    return response;
  } catch (error) {
    console.error('Push notification failed:', error.message);
    return null; 
  }
};

module.exports = sendNotification;
