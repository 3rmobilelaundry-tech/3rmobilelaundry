import { Platform } from 'react-native';
import { student } from './api';

export const registerPushToken = async (userId) => {
  try {
    let token = null;

    if (Platform.OS === 'web') {
      if ('Notification' in window) {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          // In a real PWA, you would subscribe to pushManager here.
          // For now, we generate a mock token for the backend to store.
          // If using FCM, you would get the token from firebase.messaging().getToken()
          token = `web-push-mock-${Date.now()}`;
        }
      }
    } else {
      // Native (Android/iOS)
      // Normally use expo-notifications
      // import * as Notifications from 'expo-notifications';
      // const { status } = await Notifications.requestPermissionsAsync();
      // if (status === 'granted') {
      //   const tokenData = await Notifications.getExpoPushTokenAsync();
      //   token = tokenData.data;
      // }
      // Mock for now since package is missing
      token = `native-push-mock-${Platform.OS}-${Date.now()}`;
    }

    if (token && userId) {
      console.log('Registering push token:', token);
      await student.registerPushToken(userId, token);
    }
  } catch (error) {
    console.error('Failed to register push token:', error);
  }
};
