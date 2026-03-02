import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import PlansScreen from '../PlansScreen';
import { staff } from '../../../services/api';

jest.mock('../../../services/api', () => ({
  staff: {
    listPlans: jest.fn(() => Promise.resolve({ data: [] })),
    createPlan: jest.fn(),
    updatePlan: jest.fn(),
  },
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

jest.spyOn(Alert, 'alert');

describe('PlansScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const openModalAndFillRequired = (getByText, getByTestId) => {
    fireEvent.press(getByText('Create Plan'));
    fireEvent.changeText(getByTestId('input-plan-name'), 'Gold Plan');
    fireEvent.changeText(getByTestId('input-plan-price'), '5000');
    fireEvent.changeText(getByTestId('input-plan-pickups'), '4');
  };

  it('requires at least one payment method', async () => {
    const { getByText, getByTestId } = render(<PlansScreen />);

    await waitFor(() => {
      expect(staff.listPlans).toHaveBeenCalled();
    });

    openModalAndFillRequired(getByText, getByTestId);

    fireEvent.press(getByTestId('payment-method-cash'));
    fireEvent.press(getByTestId('payment-method-transfer'));
    fireEvent.press(getByTestId('payment-method-paystack'));

    fireEvent.press(getByTestId('btn-save-plan'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith('Error', 'Select at least one payment method');
      expect(staff.createPlan).not.toHaveBeenCalled();
    });
  });

  it('saves selected payment methods', async () => {
    staff.createPlan.mockResolvedValueOnce({ data: {} });
    const { getByText, getByTestId } = render(<PlansScreen />);

    await waitFor(() => {
      expect(staff.listPlans).toHaveBeenCalled();
    });

    openModalAndFillRequired(getByText, getByTestId);

    fireEvent.press(getByTestId('payment-method-paystack'));

    fireEvent.press(getByTestId('btn-save-plan'));

    await waitFor(() => {
      expect(staff.createPlan).toHaveBeenCalled();
      const payload = staff.createPlan.mock.calls[0][0];
      expect(JSON.parse(payload.payment_methods)).toEqual(['cash', 'transfer']);
    });
  });
});
