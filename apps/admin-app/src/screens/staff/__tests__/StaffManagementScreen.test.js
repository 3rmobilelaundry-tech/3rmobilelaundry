import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import StaffManagementScreen from '../StaffManagementScreen';
import { staff } from '../../../services/api';
import logger from '../../../services/logger';

const initialWindowMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

// Mock API and Context
jest.mock('../../../services/api', () => ({
  staff: {
    listUsers: jest.fn(() => Promise.resolve({ data: [] })),
    createUser: jest.fn(),
    updateUser: jest.fn(),
  },
}));

jest.mock('../../../context/SyncContext', () => ({
  useSync: () => ({ lastEvent: null }),
}));

jest.mock('../../../services/logger', () => ({
  log: jest.fn(),
  error: jest.fn(),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Icon',
}));

describe('StaffManagementScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('validates fields before submission', async () => {
    const { getByText, getByTestId } = render(
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <StaffManagementScreen />
      </SafeAreaProvider>
    );

    // Open Modal
    fireEvent.press(getByText('Add Staff'));

    // Submit empty form
    fireEvent.press(getByTestId('btn-save-staff'));

    await waitFor(() => {
      expect(logger.log).toHaveBeenCalledWith('Validation Failed', expect.anything());
      expect(staff.createUser).not.toHaveBeenCalled();
    });
  });

  it('submits valid data successfully', async () => {
    staff.createUser.mockResolvedValueOnce({ data: { user_id: 1, full_name: 'John Doe' } });
    const { getByText, getByTestId } = render(
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <StaffManagementScreen />
      </SafeAreaProvider>
    );

    // Open Modal
    fireEvent.press(getByText('Add Staff'));

    // Fill Form
    fireEvent.changeText(getByTestId('input-fullname'), 'John Doe');
    fireEvent.changeText(getByTestId('input-phone'), '08012345678');
    fireEvent.changeText(getByTestId('input-email'), 'john@example.com');
    fireEvent.changeText(getByTestId('input-password'), 'Password123'); // Valid password
    
    // Select Role (default is receptionist, let's keep it)

    fireEvent.press(getByTestId('btn-save-staff'));

    await waitFor(() => {
      expect(staff.createUser).toHaveBeenCalledWith(expect.objectContaining({
        full_name: 'John Doe',
        phone_number: '08012345678',
        email: 'john@example.com',
        role: 'receptionist',
        password: 'Password123'
      }));
      expect(logger.log).toHaveBeenCalledWith('Staff Save Success');
    });
  });

  it('handles network failure gracefully', async () => {
    staff.createUser.mockRejectedValueOnce({ response: { data: { error: 'Network Error' } } });
    const { getByText, getByTestId } = render(
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <StaffManagementScreen />
      </SafeAreaProvider>
    );

    // Open Modal
    fireEvent.press(getByText('Add Staff'));

    // Fill Form
    fireEvent.changeText(getByTestId('input-fullname'), 'Jane Doe');
    fireEvent.changeText(getByTestId('input-phone'), '08098765432');
    fireEvent.changeText(getByTestId('input-password'), 'Password123');

    fireEvent.press(getByTestId('btn-save-staff'));

    await waitFor(() => {
      expect(staff.createUser).toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith('Staff Save Error', expect.anything());
      // Button should not be disabled anymore (loading false) - hard to test state directly, but can infer from logger
    });
  });

  it('updates role correctly', async () => {
    staff.createUser.mockResolvedValueOnce({});
    const { getByText, getByTestId } = render(
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <StaffManagementScreen />
      </SafeAreaProvider>
    );

    fireEvent.press(getByText('Add Staff'));
    
    // Change to Rider
    fireEvent.press(getByTestId('role-rider'));

    fireEvent.changeText(getByTestId('input-fullname'), 'Rider John');
    fireEvent.changeText(getByTestId('input-phone'), '08011112222');
    fireEvent.changeText(getByTestId('input-password'), 'Password123');

    fireEvent.press(getByTestId('btn-save-staff'));

    await waitFor(() => {
      expect(staff.createUser).toHaveBeenCalledWith(expect.objectContaining({
        role: 'rider'
      }));
    });
  });
});
