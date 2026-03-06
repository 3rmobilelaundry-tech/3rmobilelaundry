jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import api, { API_URL } from './api';

test('api imports correctly', () => {
  expect(api).toBeDefined();
  expect(API_URL).toBeDefined();
});
