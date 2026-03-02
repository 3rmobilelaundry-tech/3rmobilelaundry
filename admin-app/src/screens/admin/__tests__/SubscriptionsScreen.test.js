import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import SubscriptionsScreen from '../SubscriptionsScreen';
import { staff } from '../../../services/api';

jest.mock('../../../services/api', () => ({
  staff: {
    listSubscriptions: jest.fn(),
    listPlans: jest.fn(),
    listUsers: jest.fn(),
    createSubscription: jest.fn(),
    updateSubscription: jest.fn(),
    logFrontError: jest.fn()
  },
  normalizeApiError: (error) => ({ message: error?.message || 'Request failed' })
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons'
}));

jest.mock('react-native', () => {
  const RN = jest.requireActual('react-native');
  return {
    ...RN,
    Modal: ({ visible, children }) => (visible ? <RN.View>{children}</RN.View> : null)
  };
});

describe('SubscriptionsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('filters users and creates subscription', async () => {
    const plan = { plan_id: 1, name: 'Gold', price: 5000, duration_days: 30, max_pickups: 4 };
    const user = { user_id: 10, full_name: 'Alice Doe', student_id: 'STU001', email: 'alice@example.com' };
    staff.listSubscriptions.mockResolvedValueOnce({ data: [] });
    staff.listPlans.mockResolvedValueOnce({ data: [plan] });
    staff.listUsers.mockResolvedValueOnce({ data: { items: [user] } });
    staff.createSubscription.mockResolvedValueOnce({ data: { subscription_id: 1 } });

    const { getByText, getByPlaceholderText, getByDisplayValue } = render(<SubscriptionsScreen />);

    await waitFor(() => {
      expect(staff.listSubscriptions).toHaveBeenCalled();
    });

    fireEvent.press(getByText('Add Student'));

    const searchInput = getByPlaceholderText('Search student name or ID...');
    fireEvent.changeText(searchInput, 'Alice');

    await waitFor(() => {
      expect(getByText('Alice Doe (STU001)')).toBeTruthy();
    });

    fireEvent.press(getByText('Alice Doe (STU001)'));

    await waitFor(() => {
      expect(getByDisplayValue('alice@example.com')).toBeTruthy();
    });

    fireEvent.press(getByText('Gold'));

    const startDateInput = getByPlaceholderText('YYYY-MM-DD');
    fireEvent.changeText(startDateInput, '2025-01-01');
    const endDateInput = getByPlaceholderText('YYYY-MM-DD');
    fireEvent.changeText(endDateInput, '2025-01-31');

    const priceInput = getByPlaceholderText('0.00');
    fireEvent.changeText(priceInput, '5000');

    await act(async () => {
      fireEvent.press(getByText('Save Subscription'));
      jest.runOnlyPendingTimers();
    });

    await waitFor(() => {
      expect(staff.createSubscription).toHaveBeenCalled();
    });
  });

  it('blocks save when required fields are missing', async () => {
    staff.listSubscriptions.mockResolvedValueOnce({ data: [] });
    staff.listPlans.mockResolvedValueOnce({ data: [] });
    staff.listUsers.mockResolvedValueOnce({ data: { items: [] } });

    const { getByText } = render(<SubscriptionsScreen />);

    await waitFor(() => {
      expect(staff.listSubscriptions).toHaveBeenCalled();
    });

    fireEvent.press(getByText('Add Student'));

    fireEvent.press(getByText('Save Subscription'));

    await waitFor(() => {
      expect(staff.createSubscription).not.toHaveBeenCalled();
    });
  });
});
