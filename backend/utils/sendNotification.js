const admin = require('../config/firebase');

const FCM_TOKEN = "e1e2JPqrRg-KiEZmA5R2c2:APA91bFsaoELGaWaZm7Lzon_UcK86D8Jj_jEeK4TH0uUYiLTy6ZO4rgq1QRUX-LBuGhBZYvZdnI57xzp7PRFQAiCr7eKkZWb_M6fHTM67doZDz5OuvR5vOg";

const sendNotification = async (token, title, body, data = {}) => {
  // Wrap everything in a new Promise implicitly via async function
  // Requirement 3: Ensure the notification helper returns a Promise. (Async functions always return a promise)
  // Requirement 4: Ensure Node.js async/await is used properly.
  try {
    if (!token) {
        token = FCM_TOKEN; 
    }

    if (!admin.apps.length) {
        console.warn('Firebase Admin not initialized, skipping notification');
        return Promise.resolve(null); // Return resolved promise to avoid hanging if awaited
    }

    const message = {
      notification: {
        title: title,
        body: body
      },
      data: data,
      token: token
    };

    // Requirement 1: If Firebase fails, backend must still return success (handled by try/catch in caller, but also safe here)
    const response = await admin.messaging().send(message);
    
    // Requirement 2: Add console logging "Push notification sent successfully"
    console.log('Push notification sent successfully:', response);
    return response;
  } catch (error) {
    // Requirement 2: Add console logging "Push notification failed"
    console.error('Push notification failed:', error.message);
    // Requirement 1: If Firebase fails, backend must still return success. 
    // We catch the error here so it doesn't propagate and crash the API.
    return null; 
  }
};

module.exports = sendNotification;
