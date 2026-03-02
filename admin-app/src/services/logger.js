import * as Sentry from 'sentry-expo';
import { Platform } from 'react-native';

// Initialize Sentry
// Replace 'YOUR_DSN_HERE' with your actual Sentry DSN
Sentry.init({
  dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
  enableInExpoDevelopment: true,
  debug: true,
});

const logger = {
  log: (message, data) => {
    console.log(`[LOG] ${message}`, data || '');
    if (Platform.OS !== 'web') {
        Sentry.Native.captureMessage(message, {
            extra: data,
            level: 'info'
        });
    } else {
        Sentry.Browser.captureMessage(message, {
            extra: data,
            level: 'info'
        });
    }
  },
  error: (message, error) => {
    console.error(`[ERROR] ${message}`, error);
    if (Platform.OS !== 'web') {
        Sentry.Native.captureException(error, {
            tags: {
                message: message
            }
        });
    } else {
        Sentry.Browser.captureException(error, {
            tags: {
                message: message
            }
        });
    }
  },
  info: (message, data) => {
    console.info(`[INFO] ${message}`, data || '');
    if (Platform.OS !== 'web') {
        Sentry.Native.captureMessage(message, {
            extra: data,
            level: 'info'
        });
    } else {
        Sentry.Browser.captureMessage(message, {
            extra: data,
            level: 'info'
        });
    }
  }
};

export default logger;
