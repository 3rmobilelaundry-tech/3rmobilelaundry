const admin = require('firebase-admin');

if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(require('./firebase-service-account.json'))
    });
  } catch (e) {
    console.error("Firebase initialization error:", e.message);
  }
}

module.exports = admin;
