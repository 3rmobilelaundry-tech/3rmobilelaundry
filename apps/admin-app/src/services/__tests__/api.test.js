jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizeApiError, isInvalidTokenError, onAuthExpired, handleAuthExpired, setAuthToken, getToken } from '../api';

describe('normalizeApiError', () => {
  it('returns timeout message', () => {
    const error = { code: 'ECONNABORTED' };
    const result = normalizeApiError(error);
    expect(result.code).toBe('timeout');
  });

  it('returns network error message', () => {
    const error = { request: {} };
    const result = normalizeApiError(error);
    expect(result.code).toBe('network_error');
  });

  it('returns invalid credentials for 401', () => {
    const error = { response: { status: 401, data: { error: 'Invalid credentials' } } };
    const result = normalizeApiError(error);
    expect(result.code).toBe('invalid_credentials');
    expect(result.message).toBe('Invalid credentials');
  });

  it('returns session expired for invalid token', () => {
    const error = { response: { status: 401, data: { error: 'Invalid Token', code: 'invalid_token' } } };
    const result = normalizeApiError(error);
    expect(result.code).toBe('invalid_token');
    expect(result.message).toBe('Session expired. Please log in again.');
    expect(isInvalidTokenError(result)).toBe(true);
  });

  it('returns session expired for missing user', () => {
    const error = { response: { status: 401, data: { error: 'User not found', code: 'user_not_found' } } };
    const result = normalizeApiError(error);
    expect(result.code).toBe('user_not_found');
    expect(result.message).toBe('Session expired. Please log in again.');
    expect(isInvalidTokenError(result)).toBe(true);
  });

  it('returns server error for 500', () => {
    const error = { response: { status: 500, data: {} } };
    const result = normalizeApiError(error);
    expect(result.code).toBe('server_error');
  });
});

describe('auth expiration flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('clears auth session and notifies once per token', async () => {
    const listener = jest.fn();
    const unsubscribe = onAuthExpired(listener);
    setAuthToken('token');
    await handleAuthExpired();
    expect(getToken()).toBe(null);
    expect(AsyncStorage.multiRemove).toHaveBeenCalledWith(['adminToken', 'adminUser']);
    expect(listener).toHaveBeenCalledTimes(1);
    await handleAuthExpired();
    expect(listener).toHaveBeenCalledTimes(1);
    setAuthToken('new-token');
    await handleAuthExpired();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });
});
