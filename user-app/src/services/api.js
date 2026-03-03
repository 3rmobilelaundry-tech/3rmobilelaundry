import axios from 'axios';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Use 10.0.2.2 for Android Emulator, localhost for iOS simulator
// For physical device, use your machine's IP address (e.g., 192.168.1.x)
// For Web, localhost is perfect
let BASE_URL = 'http://10.69.192.33:5000';

let BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  'https://3rmobilelaundry-production.up.railway.app';

if (__DEV__) {
  BASE_URL = 'http://10.69.192.33:5000';
}

export const API_URL = BASE_URL;

if (typeof console !== 'undefined') {
  console.log('UserApp: API Base URL:', BASE_URL);
}

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
});

export const normalizeApiError = (error) => {
  const status = error?.response?.status || null;
  const data = error?.response?.data;
  const isTimeout = error?.code === 'ECONNABORTED';
  const isNetworkError = !error?.response && !!error?.request;
  const messageFromServer = data?.error || data?.message;

  if (isTimeout) {
    return { message: 'Request timed out. Please try again.', code: 'timeout', status, isTimeout, isNetworkError };
  }

  if (isNetworkError) {
    return { message: 'Network error. Check your connection and try again.', code: 'network_error', status, isTimeout, isNetworkError };
  }

  if (status === 401) {
    return { message: messageFromServer || 'Invalid credentials.', code: data?.code || 'invalid_credentials', status, isTimeout, isNetworkError };
  }

  if (status === 403) {
    return { message: messageFromServer || 'Access denied.', code: data?.code || 'forbidden', status, isTimeout, isNetworkError };
  }

  if (status === 404) {
    return { message: messageFromServer || 'Resource not found.', code: data?.code || 'not_found', status, isTimeout, isNetworkError };
  }

  if (status >= 500) {
    return { message: messageFromServer || 'Server error. Please try again later.', code: data?.code || 'server_error', status, isTimeout, isNetworkError };
  }

  return { message: messageFromServer || 'Request failed.', code: data?.code || 'request_failed', status, isTimeout, isNetworkError };
};

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const info = {
      url: error?.config?.url,
      method: error?.config?.method,
      status: error?.response?.status,
    };
    const normalized = normalizeApiError(error);
    error.normalized = normalized;
    if (typeof console !== 'undefined') {
      console.error('APIError', info, error?.response?.data, normalized);
    }
    return Promise.reject(error);
  }
);

export const setAuthToken = async (token) => {
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    await AsyncStorage.setItem('userToken', token);
  } else {
    delete api.defaults.headers.common['Authorization'];
    await AsyncStorage.removeItem('userToken');
  }
};

export const getAuthToken = async () => {
  return await AsyncStorage.getItem('userToken');
};

export const auth = {
  login: (phone_number, password) => api.post('/auth/login', { phone_number, password }),
  register: (userData) => api.post('/auth/register', userData),
  resendEmailVerification: (email) => api.post('/auth/email-verification/resend', { email }),
  verifyEmail: (email, otp) => api.post('/auth/email-verification/verify', { email, otp }),
  requestPasswordReset: (email) => api.post('/auth/password-reset/request', { email }),
  resetPassword: (email, otp, password) => api.post('/auth/password-reset/reset', { email, otp, password }),
  logout: async () => {
    await setAuthToken(null);
    await AsyncStorage.removeItem('userData');
  },
};

export const student = {
  getOrders: (user_id) => api.get(`/student/orders?user_id=${user_id}`),
  getChats: (user_id) => api.get(`/student/chats?user_id=${user_id}`),
  bookPickup: (data) => api.post('/student/book', data),
  bookEmergency: (data) => api.post('/student/emergency', data),
  cancelOrder: (order_id, data) => api.post(`/student/orders/${order_id}/cancel`, data),
  getPlans: () => api.get('/student/plans'),
  getSubscription: (user_id) => api.get(`/student/subscription?user_id=${user_id}`),
  subscribe: (user_id, plan_id, payment_method, payment_reference) => api.post('/student/subscribe', { user_id, plan_id, payment_method, payment_reference }),
  getProfile: (user_id) => api.get(`/student/sync/profile?user_id=${user_id}`),
  syncPull: (params) => api.get('/student/sync/pull', { params }),
  getRegistrationConfig: () => api.get('/student/registration-config'),
  updateProfile: (data, onUploadProgress) => {
    const isFormData = data instanceof FormData;
    return api.put('/student/profile', data, {
      headers: isFormData ? { 'Content-Type': 'multipart/form-data' } : undefined,
      onUploadProgress,
    });
  },
  requestPhoneVerification: (user_id) => api.post('/student/phone-verification/request', { user_id }),
  verifyPhoneVerification: (user_id, otp) => api.post('/student/phone-verification/verify', { user_id, otp }),
  submitEmergencyContact: (payload) => api.post('/student/emergency-contact', payload),
  getNotifications: (user_id) => api.get(`/student/notifications?user_id=${user_id}`),
  getConfig: () => api.get('/student/config'),
  getBankAccounts: () => api.get('/student/bank-accounts'),
  submitBankTransfer: (payload) => api.post('/student/payments/bank-transfer/submit', payload),
  initializePayment: (data) => api.post('/student/payments/initialize', data),
  initiateEmergencyPayment: (payload) => api.post('/student/payments/emergency/initiate', payload),
  confirmEmergencyPayment: (payload) => api.post('/student/payments/emergency/confirm', payload),
  getCarousel: () => api.get('/carousel/active'),
};

export const logFrontError = (payload) => api.post('/student/front-logs', payload);

export default api;
