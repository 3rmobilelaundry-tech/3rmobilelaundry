
import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import StaffManagementScreen from './StaffManagementScreen';
import { staff } from '../../services/api';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const initialWindowMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

// Mock dependencies
jest.mock('../../services/api', () => ({
  staff: {
    listUsers: jest.fn(),
    createUser: jest.fn(),
    updateUser: jest.fn(),
  },
}));

jest.mock('../../context/SyncContext', () => ({
  useSync: () => ({ lastEvent: null }),
}));

jest.mock('../../services/logger', () => ({
  log: jest.fn(),
  error: jest.fn(),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Icon',
}));

describe('StaffManagementScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    staff.listUsers.mockResolvedValue({ data: [] });
  });

  const renderComponent = () => {
    return render(
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <StaffManagementScreen />
      </SafeAreaProvider>
    );
  };

  it('renders correctly', async () => {
    const { getByText } = renderComponent();
    await waitFor(() => {
      expect(getByText('Add Staff')).toBeTruthy();
    });
  });

  it('validates form inputs', async () => {
    const { getByText, getByTestId, queryByText } = renderComponent();
    
    // Open modal
    fireEvent.press(getByText('Add Staff'));
    
    // Press save without filling
    fireEvent.press(getByText('Save Staff'));
    
    await waitFor(() => {
      // Check for toast/error message
      expect(getByText('Name, Phone and Role are required')).toBeTruthy();
    });
    
    expect(staff.createUser).not.toHaveBeenCalled();
  });

  it('submits valid data', async () => {
    staff.createUser.mockResolvedValue({});
    const { getByText, getByTestId } = renderComponent();

    fireEvent.press(getByText('Add Staff'));

    // Fill form
    fireEvent.changeText(getByTestId('input-fullname'), 'John Doe');
    fireEvent.changeText(getByTestId('input-phone'), '08012345678');
    fireEvent.changeText(getByTestId('input-email'), 'john@example.com');
    fireEvent.changeText(getByTestId('input-password'), 'Password123');

    // Save
    fireEvent.press(getByText('Save Staff'));

    await waitFor(() => {
      expect(staff.createUser).toHaveBeenCalledWith({
        full_name: 'John Doe',
        phone_number: '08012345678',
        email: 'john@example.com',
        role: 'receptionist',
        password: 'Password123',
        status: 'active'
      });
    });
  });

  it('handles API errors', async () => {
    staff.createUser.mockRejectedValue({ response: { data: { error: 'Email exists' } } });
    const { getByText, getByTestId } = renderComponent();

    fireEvent.press(getByText('Add Staff'));
    
    fireEvent.changeText(getByTestId('input-fullname'), 'Jane Doe');
    fireEvent.changeText(getByTestId('input-phone'), '08099999999');
    fireEvent.changeText(getByTestId('input-email'), 'jane@example.com');
    fireEvent.changeText(getByTestId('input-password'), 'Password123');

    fireEvent.press(getByText('Save Staff'));

    await waitFor(() => {
      expect(getByText('Email exists')).toBeTruthy();
    });
  });
});
