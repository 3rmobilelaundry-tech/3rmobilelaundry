import React from 'react';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import PaymentsScreen from '../PaymentsScreen';
import { staff } from '../../services/api';

// Mocks
jest.mock('../../services/api', () => ({
  staff: {
    listPayments: jest.fn(),
    listUsers: jest.fn(),
    updatePaymentStatus: jest.fn(),
    logFrontError: jest.fn()
  },
  normalizeApiError: (error) => ({ message: error?.message || 'Request failed' })
}));

jest.mock('../../context/SyncContext', () => ({
  useSync: () => ({ lastEvent: null })
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons'
}));

jest.mock('@react-native-picker/picker', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Picker: ({ children, onValueChange, testID }) => (
      <View testID={testID} onValueChange={onValueChange} accessible={true}>
        {children}
      </View>
    ),
    PickerItem: ({ label, value }) => <View label={label} value={value} />
  };
});

// Mock react-native-paper components
jest.mock('react-native-paper', () => {
  const React = require('react');
  const { View, Text, TouchableOpacity } = require('react-native');
  return {
    Text: ({ children }) => <Text>{children}</Text>,
    Button: ({ children, onPress, testID }) => (
      <TouchableOpacity onPress={onPress} testID={testID}>
        <Text>{children}</Text>
      </TouchableOpacity>
    ),
    Card: ({ children, onPress }) => (
      <TouchableOpacity onPress={onPress}>
        <View>{children}</View>
      </TouchableOpacity>
    ),
    TextInput: () => <View />,
    Modal: ({ visible, children }) => (visible ? <View>{children}</View> : null),
    Portal: ({ children }) => <View>{children}</View>,
    Provider: ({ children }) => <View>{children}</View>,
    Chip: ({ children, onPress, testID }) => (
      <TouchableOpacity onPress={onPress} testID={testID}>
        <Text>{children}</Text>
      </TouchableOpacity>
    ),
    Badge: ({ children }) => <Text>{children}</Text>,
    ActivityIndicator: () => <View />,
    Snackbar: ({ visible, children }) => (visible ? <Text>{children}</Text> : null),
    HelperText: () => null,
    FAB: () => null
  };
});

// Helper to wait for timers
const runTimers = async () => {
  await act(async () => {
    jest.runOnlyPendingTimers();
  });
};

describe('PaymentsScreen Permissions', () => {
  const mockPayment = {
    payment_id: 1,
    status: 'pending',
    amount: 500,
    created_at: new Date().toISOString(),
    payment_type: 'subscription',
    gateway: 'cash',
    User: { full_name: 'Test User' }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    staff.listPayments.mockResolvedValue({ data: [mockPayment] });
    staff.listUsers.mockResolvedValue({ data: [] });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('allows Receptionist to update payment status', async () => {
    const { getByTestId } = render(<PaymentsScreen currentUser={{ role: 'receptionist' }} readOnly={false} />);
    
    await runTimers();
    
    // Check if status picker exists
    const picker = getByTestId('payment-status-1');
    expect(picker).toBeTruthy();
  });

  it('allows Admin to update payment status', async () => {
    const { getByTestId } = render(<PaymentsScreen currentUser={{ role: 'admin' }} readOnly={false} />);
    
    await runTimers();
    
    const picker = getByTestId('payment-status-1');
    expect(picker).toBeTruthy();
  });

  it('does NOT allow Student to update payment status', async () => {
    const { queryByTestId } = render(<PaymentsScreen currentUser={{ role: 'student' }} readOnly={false} />);
    
    await runTimers();
    
    const picker = queryByTestId('payment-status-1');
    expect(picker).toBeNull();
  });

  it('does NOT allow update when readOnly is true', async () => {
    const { queryByTestId } = render(<PaymentsScreen currentUser={{ role: 'admin' }} readOnly={true} />);
    
    await runTimers();
    
    const picker = queryByTestId('payment-status-1');
    expect(picker).toBeNull();
  });
});
