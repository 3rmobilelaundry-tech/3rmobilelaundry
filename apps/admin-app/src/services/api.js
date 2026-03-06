import axios from 'axios';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL_NATIVE = 'http://10.69.192.33:5000';
const ENV_WEB_URL = process.env.EXPO_PUBLIC_API_URL || process.env.REACT_APP_API_URL || process.env.API_URL;
let BASE_URL_WEB = ENV_WEB_URL || 'http://localhost:5000';

if (Platform.OS === 'web') {
  if (process.env.NODE_ENV === 'production') {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    if (ENV_WEB_URL) {
      BASE_URL_WEB = ENV_WEB_URL;
    } else if (origin && !origin.includes('localhost') && !origin.includes('127.0.0.1')) {
      // IMPORTANT: When deployed to production (e.g., Vercel), you MUST set the EXPO_PUBLIC_API_URL environment variable
      // pointing to your actual backend API server. Otherwise, the app will try to call APIs on the deployment URL.
      // Example: EXPO_PUBLIC_API_URL=https://your-api-server.com
      BASE_URL_WEB = origin;
      console.warn('[AdminApp API Config] WARNING: No EXPO_PUBLIC_API_URL set in production. Using current origin:', origin);
      console.warn('[AdminApp API Config] Set EXPO_PUBLIC_API_URL environment variable to your actual backend API URL');
    } else {
      BASE_URL_WEB = 'http://localhost:5000';
    }
  } else {
    BASE_URL_WEB = ENV_WEB_URL || 'http://localhost:5000';
  }
}

export const API_URL = Platform.OS === 'web' ? BASE_URL_WEB : BASE_URL_NATIVE;

const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
});

export const normalizeApiError = (error) => {
  const status = error?.response?.status || null;
  const data = error?.response?.data;
  const isTimeout = error?.code === 'ECONNABORTED';
  const isNetworkError = !error?.response && !!error?.request;
  
  // Safely extract message and ensure it's a string
  let messageFromServer = data?.error || data?.message;
  if (typeof messageFromServer !== 'string') {
    messageFromServer = typeof messageFromServer === 'object' ? JSON.stringify(messageFromServer) : '';
  }

  if (isTimeout) {
    return { message: 'Request timed out. Please try again.', code: 'timeout', status, isTimeout, isNetworkError };
  }

  if (isNetworkError) {
    return { message: 'Network error. Check your connection and try again.', code: 'network_error', status, isTimeout, isNetworkError };
  }

  if (status === 401) {
    const loweredCode = (data?.code || '').toLowerCase();
    const loweredMessage = (messageFromServer || '').toLowerCase();
    const isInvalidToken = loweredCode === 'invalid_token' || loweredMessage.includes('invalid token');
    const isMissingUser = loweredCode === 'user_not_found' || loweredMessage.includes('user not found');
    if (isInvalidToken || isMissingUser) {
      return { message: 'Session expired. Please log in again.', code: loweredCode || 'invalid_token', status, isTimeout, isNetworkError };
    }
    return { message: messageFromServer || 'Invalid credentials.', code: data?.code || 'invalid_credentials', status, isTimeout, isNetworkError };
  }

  if (status === 403) {
    return { message: messageFromServer || 'Access denied.', code: data?.code || 'forbidden', status, isTimeout, isNetworkError };
  }

  if (status >= 500) {
    return { message: messageFromServer || 'Server error. Please try again later.', code: data?.code || 'server_error', status, isTimeout, isNetworkError };
  }

  return { message: messageFromServer || 'Request failed.', code: data?.code || 'request_failed', status, isTimeout, isNetworkError };
};

if (typeof console !== 'undefined') {
  try {
    console.log('API base URL', api.defaults.baseURL);
  } catch {}
}

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
    if (isInvalidTokenError(normalized)) {
      handleAuthExpired().catch(() => {});
    }
    if (typeof console !== 'undefined') {
      console.error('APIError', info, error?.response?.data, normalized);
    }
    return Promise.reject(error);
  }
);

let currentToken = null;
const ADMIN_TOKEN_KEY = 'adminToken';
const ADMIN_USER_KEY = 'adminUser';
let authExpiredNotified = false;
const authExpiredListeners = new Set();

export const onAuthExpired = (listener) => {
  authExpiredListeners.add(listener);
  return () => authExpiredListeners.delete(listener);
};

export const isInvalidTokenError = (normalized) => {
  if (!normalized) return false;
  const code = (normalized.code || '').toLowerCase();
  const message = (normalized.message || '').toLowerCase();
  return normalized.status === 401 && (
    code === 'invalid_token' ||
    code === 'user_not_found' ||
    message.includes('invalid token') ||
    message.includes('session expired') ||
    message.includes('user not found')
  );
};

export const handleAuthExpired = async () => {
  if (authExpiredNotified) return;
  authExpiredNotified = true;
  await clearAuthSession();
  setAuthToken(null);
  authExpiredListeners.forEach((listener) => {
    try {
      listener();
    } catch {}
  });
};

export const setAuthToken = (token) => {
  currentToken = token;
  if (token) {
    authExpiredNotified = false;
  }
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common['Authorization'];
  }
};

export const getToken = () => currentToken;

export const saveAuthSession = async (token, user) => {
  if (token) {
    await AsyncStorage.setItem(ADMIN_TOKEN_KEY, token);
  } else {
    await AsyncStorage.removeItem(ADMIN_TOKEN_KEY);
  }
  if (user) {
    await AsyncStorage.setItem(ADMIN_USER_KEY, JSON.stringify(user));
  } else {
    await AsyncStorage.removeItem(ADMIN_USER_KEY);
  }
};

export const clearAuthSession = async () => {
  await AsyncStorage.multiRemove([ADMIN_TOKEN_KEY, ADMIN_USER_KEY]);
};

export const loadAuthSession = async () => {
  const token = await AsyncStorage.getItem(ADMIN_TOKEN_KEY);
  const userRaw = await AsyncStorage.getItem(ADMIN_USER_KEY);
  let user = null;
  if (userRaw) {
    try {
      user = JSON.parse(userRaw);
    } catch (e) {
      await AsyncStorage.removeItem(ADMIN_USER_KEY);
    }
  }
  if (token) {
    setAuthToken(token);
  } else {
    setAuthToken(null);
  }
  return { token, user };
};

/**
 * DEVELOPMENT ONLY: Helper function for default admin login during development/testing
 * Default credentials:
 * - Phone: 09000000000
 * - Password: admin123
 * - Role: head_admin (admin)
 * 
 * This is a fallback for testing without a backend API.
 * Remove or disable this in production.
 */
export const tryDevDefaultLogin = (phone_number, password) => {
  const DEFAULT_DEV_PHONE = '09000000000';
  const DEFAULT_DEV_PASSWORD = 'admin123';
  
  // Check if this is the default development credential
  if (phone_number === DEFAULT_DEV_PHONE && password === DEFAULT_DEV_PASSWORD) {
    console.log('DEBUG: Using development default admin account');
    
    // Return a mock successful response matching the API response structure
    return Promise.resolve({
      data: {
        token: 'dev-admin-token-' + Date.now(),
        user: {
          id: '999999',
          phone_number: DEFAULT_DEV_PHONE,
          name: 'Dev Admin',
          role: 'admin', // Note: server uses 'admin', UI shows as Head Admin
          email: 'dev@admin.local',
          created_at: new Date().toISOString(),
          is_dev_account: true, // Flag to indicate this is dev account
        }
      }
    });
  }
  
  // Otherwise, proceed with actual API login
  return api.post('/auth/login', { phone_number, password });
};

export const auth = {
  login: (phone_number, password) => api.post('/auth/login', { phone_number, password }),
  logout: () => api.post('/auth/logout')
};

export const staff = {
  // User Management
  listUsers: (params) => api.get('/api/users', { params }),
  createUser: (data) => api.post('/api/staff', data),
  updateUser: (user_id, data) => api.put(`/api/users/${user_id}`, data),
  deleteUser: (user_id) => api.delete(`/api/users/${user_id}`),
  verifyUserEmail: (user_id) => api.post(`/api/users/${user_id}/email/verify`),
  revokeUserEmail: (user_id) => api.post(`/api/users/${user_id}/email/revoke`),
  resendUserEmail: (user_id) => api.post(`/api/users/${user_id}/email/resend`),
  verifyUserPhone: (user_id) => api.post(`/api/users/${user_id}/phone/verify`),
  revokeUserPhone: (user_id) => api.post(`/api/users/${user_id}/phone/revoke`),
  logUserDetailView: (user_id) => api.post(`/api/users/${user_id}/view`),
  createInvite: (role, phone_number) => api.post('/api/invite', { role, phone_number }),
  listInvites: () => api.get('/api/invites'),
  updateInvite: (invite_id, data) => api.put(`/api/invites/${invite_id}`, data),
  deleteInvite: (invite_id) => api.delete(`/api/invites/${invite_id}`),
  assignRole: (user_id, role) => api.post('/api/assign-role', { user_id, role }),
  
  // System
  metrics: () => api.get('/api/metrics'),
  getOverview: () => api.get('/api/overview'),
  getSettings: () => api.get('/api/settings'),
  updateSettings: (payload) => api.put('/api/settings', payload),
  syncEmergencySettings: () => api.post('/api/settings/emergency/sync'),
  listRegistrationFields: () => api.get('/api/registration-fields'),
  createRegistrationField: (payload) => api.post('/api/registration-fields', payload),
  updateRegistrationField: (field_id, payload) => api.put(`/api/registration-fields/${field_id}`, payload),
  deleteRegistrationField: (field_id) => api.delete(`/api/registration-fields/${field_id}`),
  listSchools: () => api.get('/api/schools'),
  createSchool: (payload) => api.post('/api/schools', payload),
  updateSchool: (school_id, payload) => api.put(`/api/schools/${school_id}`, payload),
  deleteSchool: (school_id) => api.delete(`/api/schools/${school_id}`),
  uploadSettingsFile: (type, file) => {
    const formData = new FormData();
    formData.append('type', type);
    // React Native: { uri, name, type }
    // Web: File object
    formData.append('file', file);
    return api.post('/api/settings/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  
  // Orders
  getOrders: (params) => {
    let finalParams = params || {};
    if (typeof params === 'string') finalParams = { status: params };
    return api.get('/api/orders', { params: finalParams });
  },
  notifyUser: (order_id) => api.post(`/api/orders/${order_id}/notify`),
  createOrder: (data) => api.post('/api/orders', data),
  updateStatus: (order_id, data) => api.put(`/api/orders/${order_id}/status`, typeof data === 'string' ? { status: data } : data),
  acceptOrder: (order_id, data) => api.post(`/api/orders/${order_id}/accept`, data),
  editOrder: (order_id, data) => api.put(`/api/orders/${order_id}`, data),
  releaseOrder: (order_id, data) => api.post(`/api/orders/${order_id}/release`, data),
  generateCode: (order_id, type) => api.post('/api/codes/generate', { order_id, type }),

  getIntegrations: () => api.get('/api/integrations'),
  updateIntegrations: (data) => api.put('/api/integrations', data),
  testIntegration: (type, data) => api.post(`/api/integrations/test/${type}`, data),
  configurePaystack: (enabled, public_key) => api.put('/api/integrations/paystack', { enabled, public_key }),
  
  // Plans & Subscriptions
  listPlans: () => api.get('/api/plans'),
  searchPlans: (params) => api.get('/api/plans', { params }),
  createPlan: (payload) => api.post('/api/plans', payload),
  updatePlan: (plan_id, payload) => api.put(`/api/plans/${plan_id}`, payload),
  deletePlan: (plan_id) => api.delete(`/api/plans/${plan_id}`),
  bulkUpdatePlans: (updates) => api.put('/api/plans/bulk', { updates }),
  publishPlan: (plan_id) => api.post(`/api/plans/${plan_id}/publish`),
  planVersions: (plan_id) => api.get(`/api/plans/${plan_id}/versions`),
  
  listSubscriptions: () => api.get('/api/subscriptions'),
  createSubscription: (payload) => api.post('/api/subscriptions', payload),
  updateSubscription: (subscription_id, payload) => api.put(`/api/subscriptions/${subscription_id}`, payload),
  deleteSubscription: (subscription_id) => api.delete(`/api/subscriptions/${subscription_id}`),
  
  // Payments
  listPayments: (params) => api.get('/api/payments', { params }),
  createPayment: (payload) => api.post('/api/payments', payload),
  updatePayment: (payment_id, payload) => api.put(`/api/payments/${payment_id}`, payload),
  updatePaymentStatus: (payment_id, payload) => api.patch(`/api/payments/${payment_id}/status`, payload),
  deletePayment: (payment_id) => api.delete(`/api/payments/${payment_id}`),
  
  // Logs
  events: () => api.get('/api/events', { responseType: 'stream' }),
  recentFrontLogs: (lines = 200) => api.get(`/api/front-logs/recent?lines=${lines}`),
  auditLogs: (params) => api.get('/api/audit-logs', { params }),
  logFrontError: (payload) => api.post('/api/front-logs', payload),
  passwordResetLogs: () => api.get('/api/password-resets'),
  forcePasswordReset: (payload) => api.post('/api/password-resets/force', payload),

  syncPull: (params) => api.get('/api/sync/pull', { params }),
  syncStatus: () => api.get('/api/sync/status'),
  syncQueue: (params) => api.get('/api/sync/queue', { params }),

  listInventory: (params) => api.get('/api/inventory', { params }),
  createInventory: (payload) => api.post('/api/inventory', payload),
  updateInventory: (id, payload) => api.put(`/api/inventory/${id}`, payload),
  deleteInventory: (id) => api.delete(`/api/inventory/${id}`),
  
  // Security
  getSecurityLogs: (type, limit) => api.get('/api/security/logs', { params: { type, limit } }),
  getFlaggedUsers: () => api.get('/api/security/flagged-users'),
  unflagUser: (user_id) => api.post(`/api/security/users/${user_id}/unflag`),

  // Notifications
  listNotifications: (params) => api.get('/api/notifications', { params }),
  sendNotification: (payload) => api.post('/api/notifications', payload),
  resendNotification: (id) => api.post(`/api/notifications/${id}/resend`),
  deleteNotification: (id) => api.delete(`/api/notifications/${id}`),

  // Codes
  listCodes: (params) => api.get('/api/codes', { params }),
  generateCode: (payload) => api.post('/api/codes/generate', payload),
  invalidateCode: (id, reason) => api.post(`/api/codes/${id}/invalidate`, { reason }),
  getCodeAudit: (id) => api.get(`/api/codes/${id}/audit`),
  verifyCode: (data) => api.post('/api/codes/verify', data),

  // Analysis
  getAnalysis: (period) => api.get('/api/analysis', { params: { period } }),
  getAnalysisReports: (type, limit) => api.get('/api/analysis/reports', { params: { type, limit } }),

  // Carousel
  listCarouselItems: () => api.get('/carousel'),
  createCarouselItem: (data) => {
    // data is FormData
    return api.post('/carousel', data, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  updateCarouselItem: (id, data) => {
    // data is FormData
    return api.put(`/carousel/${id}`, data, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  deleteCarouselItem: (id) => api.delete(`/carousel/${id}`),
  reorderCarouselItems: (items) => api.put('/carousel/reorder', { items }), // Assuming we implement reorder
};

export default api;
