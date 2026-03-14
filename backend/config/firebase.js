const admin = require("firebase-admin")
const serviceAccount = require("./firebase-service-account.json")

// Check if service account has actual keys, otherwise use env var or skip
// But per user instruction:
try {
    if (serviceAccount.project_id) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        })
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        const serviceAccountEnv = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccountEnv)
        });
    } else {
        console.warn("Firebase Service Account not found in config/firebase-service-account.json or ENV. Push notifications may fail.");
    }
} catch (e) {
    console.error("Firebase initialization error:", e.message);
}

module.exports = admin
