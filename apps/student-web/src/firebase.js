import { Platform } from 'react-native';

// Exporting messaging instance if available globally (from index.html script)
let messaging = null;

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  // We expect window.firebaseMessaging to be initialized in index.html
  if (window.firebaseMessaging) {
    messaging = window.firebaseMessaging;
  }
}

export { messaging };
