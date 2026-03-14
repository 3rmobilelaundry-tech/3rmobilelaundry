const admin = require('../config/firebase');

const FCM_TOKEN = "e1e2JPqrRg-KiEZmA5R2c2:APA91bFsaoELGaWaZm7Lzon_UcK86D8Jj_jEeK4TH0uUYiLTy6ZO4rgq1QRUX-LBuGhBZYvZdnI57xzp7PRFQAiCr7eKkZWb_M6fHTM67doZDz5OuvR5vOg";

const sendNotification = async (token, title, body, data = {}) => {
  try {
    if (!token) {
        // Fallback to the hardcoded token if user didn't provide one, or just for testing as per instruction?
        // Instruction says "Do NOT hardcode the token in logic files. Instead define constant... const FCM_TOKEN = ..."
        // It implies we should use this token.
        token = FCM_TOKEN; 
    }

    if (!admin.apps.length) {
        console.warn('Firebase Admin not initialized, skipping notification');
        return;
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
    console.log('Successfully sent message:', response);
    return response;
  } catch (error) {
    console.error('Error sending message:', error);
    // Do not crash the API
  }
};

module.exports = sendNotification;
