import React from 'react';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import PaymentsScreen from '../PaymentsScreen';
import { staff } from '../../../services/api';

jest.mock('../../../services/api', () => ({
  staff: {
    listPayments: jest.fn(),
    listUsers: jest.fn(),
    updatePaymentStatus: jest.fn(),
    logFrontError: jest.fn()
  },
  normalizeApiError: (error) => ({ message: error?.message || 'Request failed' })
}));

jest.mock('../../../context/SyncContext', () => ({
  useSync: () => ({ lastEvent: null })
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons'
}));

jest.mock('@react-native-picker/picker', () => ({
  Picker: ({ children, onValueChange, testID }) => (
    <picker testID={testID} onValueChange={onValueChange}>
      {children}
    </picker>
  ),
  Item: ({ label, value }) => <item label={label} value={value} />
}));

jest.mock('react-native-paper', () => {
  const React = require('react');
  const { View, Text, TouchableOpacity } = require('react-native');
  const Card = ({ children, onPress }) => (
    <TouchableOpacity onPress={onPress}>
      <View>{children}</View>
    </TouchableOpacity>
  );
  Card.Content = ({ children }) => <View>{children}</View>;
  const TextInput = () => <View />;
  TextInput.Icon = () => null;
  return {
    Text: ({ children }) => <Text>{children}</Text>,
    Button: ({ children, onPress, testID }) => (
      <TouchableOpacity onPress={onPress} testID={testID}>
        <Text>{children}</Text>
      </TouchableOpacity>
    ),
    Card,
    TextInput,
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

describe('PaymentsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('debounces payments reload on filter change', async () => {
    staff.listPayments.mockResolvedValueOnce({ data: [] }).mockResolvedValueOnce({ data: [] });
    staff.listUsers.mockResolvedValueOnce({ data: [] });

    const { getByTestId } = render(<PaymentsScreen currentUser={{ role: 'admin' }} readOnly={false} />);

    await act(async () => {
      jest.runOnlyPendingTimers();
    });

    await waitFor(() => {
      expect(staff.listPayments).toHaveBeenCalledTimes(1);
    });

    fireEvent.press(getByTestId('filter-status-paid'));

    await act(async () => {
      jest.runOnlyPendingTimers();
    });

    await waitFor(() => {
      expect(staff.listPayments).toHaveBeenCalledTimes(2);
    });
  });

  it('updates payment status from inline picker', async () => {
    staff.listPayments.mockResolvedValueOnce({
      data: [
        {
          payment_id: 1,
          status: 'pending',
          amount: 500,
          created_at: new Date().toISOString(),
          payment_type: 'subscription',
          gateway: 'cash',
          User: { full_name: 'Test User' }
        }
      ]
    });
    staff.listUsers.mockResolvedValueOnce({ data: [] });
    staff.updatePaymentStatus.mockResolvedValueOnce({ data: { status: 'paid' } });

    const { getByTestId } = render(<PaymentsScreen currentUser={{ role: 'admin' }} readOnly={false} />);

    await act(async () => {
      jest.runOnlyPendingTimers();
    });

    await waitFor(() => {
      expect(staff.listPayments).toHaveBeenCalledTimes(1);
    });

    fireEvent(getByTestId('payment-status-1'), 'valueChange', 'paid');

    await waitFor(() => {
      expect(staff.updatePaymentStatus).toHaveBeenCalledWith(1, { status: 'paid' });
    });
  });
});
