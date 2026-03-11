jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import { normalizeApiError } from '../api';

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

  it('returns not found for 404', () => {
    const error = { response: { status: 404, data: { error: 'User not found' } } };
    const result = normalizeApiError(error);
    expect(result.code).toBe('not_found');
    expect(result.message).toBe('User not found');
  });

  it('returns server error for 500', () => {
    const error = { response: { status: 500, data: {} } };
    const result = normalizeApiError(error);
    expect(result.code).toBe('server_error');
  });
});
