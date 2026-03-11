import { Platform } from 'react-native';

// simple logger that wraps console methods, no external services
const logger = {
  log: (message, data) => {
    console.log(`[LOG] ${message}`, data || '');
  },
  error: (message, error) => {
    console.error(`[ERROR] ${message}`, error);
  },
  info: (message, data) => {
    console.info(`[INFO] ${message}`, data || '');
  }
};

export default logger;
