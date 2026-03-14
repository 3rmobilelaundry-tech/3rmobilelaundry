// Service Worker for Firebase Messaging
// This file runs in the background to handle notifications when the app is closed.

// Import Firebase compat scripts
importScripts('https://www.gstatic.com/firebasejs/9.6.10/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.6.10/firebase-messaging-compat.js');

// Initialize Firebase
firebase.initializeApp({
  apiKey: "AIzaSyA6xhtNQOjneQQ4UhAHhiIOxSGTq4GuqIQ",
  authDomain: "r-mobile-laundry.firebaseapp.com",
  projectId: "r-mobile-laundry",
  storageBucket: "r-mobile-laundry.firebasestorage.app",
  messagingSenderId: "399581573326",
  appId: "1:399581573326:web:3668d176c0caa99d09209f"
});

// Retrieve an instance of Firebase Messaging so that it can handle background
// messages.
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  // Customize notification here
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/logo.png' // Ensure logo.png exists in public
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
