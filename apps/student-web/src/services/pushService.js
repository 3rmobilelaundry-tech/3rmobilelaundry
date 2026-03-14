import { Platform } from 'react-native';
import { student } from './api';
import { messaging } from '../firebase';
import { getToken, onMessage } from 'firebase/messaging';

const VAPID_KEY = 'BGiLli9FQyuwrMnhlTZAYLnU8V2RDVFRRtL39jExoYE5WVIzAy9MbWc1cDoU1VluKo1jywTZjgdp54yrFZf6Eik';

export const registerPushToken = async (userId) => {
  try {
    let token = null;

    if (Platform.OS === 'web') {
      if ('Notification' in window) {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          if (messaging) {
            token = await getToken(messaging, { vapidKey: VAPID_KEY });
            console.log('FCM Token:', token);
            
            // Register foreground listener
            onMessage(messaging, (payload) => {
              console.log('Foreground Message:', payload);
              // You can show a toast or alert here
              if (window.alert) {
                 const { title, body } = payload.notification || {};
                 if (title) window.alert(`${title}\n${body}`);
              }
            });
          }
        } else {
            console.log('Notification permission denied');
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
      // Mock for now since package is missing or not configured
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
