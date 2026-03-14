// Give the service worker access to Firebase Messaging.
// Note that you can only use Firebase Messaging here. Other Firebase libraries
// are not available in the service worker.
importScripts('https://www.gstatic.com/firebasejs/8.10.0/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/8.10.0/firebase-messaging.js');

// Initialize the Firebase app in the service worker by passing in
// your app's Firebase config object.
// https://firebase.google.com/docs/web/setup#config-object
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
