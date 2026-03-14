import { Platform } from 'react-native';
import { student } from './api';
import { messaging } from '../firebase';

const VAPID_KEY = 'BGiLli9FQyuwrMnhlTZAYLnU8V2RDVFRRtL39jExoYE5WVIzAy9MbWc1cDoU1VluKo1jywTZjgdp54yrFZf6Eik';

export const registerPushToken = async (userId) => {
  try {
    let token = null;

    if (Platform.OS === 'web') {
      // 1. Try to get token from global variable set by index.html script
      if (typeof window !== 'undefined' && window.fcmToken) {
        token = window.fcmToken;
      } 
      // 2. Or try to get it from the messaging instance
      else if (typeof window !== 'undefined' && window.firebaseMessaging) {
         try {
           // In compat SDK (CDN), usage is messaging.getToken({ vapidKey: ... }) which returns Promise<string>
           // Note: The V9 modular SDK uses getToken(messaging, ...), but compat uses messaging.getToken(...)
           token = await window.firebaseMessaging.getToken({ vapidKey: VAPID_KEY });
         } catch (e) {
           console.warn('Failed to retrieve token from messaging instance:', e);
         }
      }

      if (token) {
        console.log('FCM Token retrieved for registration:', token);
      } else {
        console.log('FCM Token not available yet. Make sure notification permission is granted.');
      }

    } else {
      // Native (Android/iOS)
      // Mock for now or use expo-notifications if installed
      token = `native-push-mock-${Platform.OS}-${Date.now()}`;
    }

    if (token && userId) {
      console.log('Registering push token with backend:', token);
      await student.registerPushToken(userId, token);
    }
  } catch (error) {
    console.error('Failed to register push token:', error);
  }
};
