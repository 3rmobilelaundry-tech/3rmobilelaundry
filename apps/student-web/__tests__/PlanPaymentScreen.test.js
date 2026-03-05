import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import PlanPaymentScreen from '../src/screens/PlanPaymentScreen';
import { student } from '../src/services/api';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

jest.mock('../src/services/api', () => ({
  student: {
    subscribe: jest.fn(),
    initializePayment: jest.fn(),
  },
}));

describe('PlanPaymentScreen', () => {
  const plan = { plan_id: 1, name: 'Basic', price: 5000, duration_days: 30, payment_methods: ['cash'] };
  const user = { user_id: 7, email: 'test@example.com' };
  const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates pending subscription for cash payments', async () => {
    student.subscribe.mockResolvedValue({ data: { status: 'pending' } });
    jest.spyOn(Alert, 'alert').mockImplementation((title, message, buttons) => {
      if (title === 'Cash Payment') {
        const confirm = buttons.find((b) => b.text === 'I Have Paid / Will Pay');
        confirm.onPress();
      }
      if (title === 'Payment Pending') {
        const ok = buttons.find((b) => b.text === 'OK');
        ok.onPress();
      }
    });

    const { getByTestId } = render(
      <PlanPaymentScreen navigation={mockNavigation} route={{ params: { plan, user } }} />
    );

    fireEvent.press(getByTestId('method-cash'));

    await waitFor(() => {
      expect(student.subscribe).toHaveBeenCalledWith(user.user_id, plan.plan_id, 'cash', null);
      expect(mockNavigation.navigate).toHaveBeenCalledWith('MainTabs', { user, screen: 'Home', params: { refresh: true } });
    });
  });

  it('routes home when payment fails', async () => {
    student.subscribe.mockRejectedValue({ response: { data: { error: 'Verification failed' } } });
    jest.spyOn(Alert, 'alert').mockImplementation((title, message, buttons) => {
      if (title === 'Cash Payment') {
        const confirm = buttons.find((b) => b.text === 'I Have Paid / Will Pay');
        confirm.onPress();
      }
      if (title === 'Payment Failed') {
        const goHome = buttons.find((b) => b.text === 'Go Home');
        goHome.onPress();
      }
    });

    const { getByTestId } = render(
      <PlanPaymentScreen navigation={mockNavigation} route={{ params: { plan, user } }} />
    );

    fireEvent.press(getByTestId('method-cash'));

    await waitFor(() => {
      expect(student.subscribe).toHaveBeenCalledWith(user.user_id, plan.plan_id, 'cash', null);
      expect(mockNavigation.navigate).toHaveBeenCalledWith('MainTabs', {
        user,
        screen: 'Home',
        params: { refresh: true, paymentStatus: 'failed' },
      });
    });
  });
});
