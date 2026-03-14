import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { Platform } from 'react-native';

const firebaseConfig = {
  apiKey: "AIzaSyA6xhtNQOjneQQ4UhAHhiIOxSGTq4GuqIQ",
  authDomain: "r-mobile-laundry.firebaseapp.com",
  projectId: "r-mobile-laundry",
  storageBucket: "r-mobile-laundry.firebasestorage.app",
  messagingSenderId: "399581573326",
  appId: "1:399581573326:web:3668d176c0caa99d09209f"
};

let app;
let messaging;

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  try {
    app = initializeApp(firebaseConfig);
    messaging = getMessaging(app);
  } catch (error) {
    console.error("Firebase initialization error:", error);
  }
}

export { app, messaging, getToken, onMessage };
