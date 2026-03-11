import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import CarouselScreen from '../CarouselScreen';
import { staff } from '../../../services/api';

const initialWindowMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

jest.mock('../../../services/api', () => ({
  api: { defaults: { baseURL: 'http://localhost:5000' } },
  staff: {
    listCarouselItems: jest.fn(),
    createCarouselItem: jest.fn(),
    updateCarouselItem: jest.fn(),
    deleteCarouselItem: jest.fn(),
  },
  normalizeApiError: jest.fn((error) => ({
    message: error?.message || 'Request failed.',
  })),
  __esModule: true,
  default: { defaults: { baseURL: 'http://localhost:5000' } },
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Icon',
}));

describe('CarouselScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('validates missing image on create', async () => {
    staff.listCarouselItems.mockResolvedValue({ data: [] });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    const { getByText } = render(
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <CarouselScreen />
      </SafeAreaProvider>
    );

    await waitFor(() => expect(getByText('Add Slide')).toBeTruthy());
    fireEvent.press(getByText('Add Slide'));
    fireEvent.press(getByText('Save Slide'));

    expect(alertSpy).toHaveBeenCalledWith('Validation Error', 'Image is required for new items');
    expect(staff.createCarouselItem).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('validates order index on edit', async () => {
    staff.listCarouselItems.mockResolvedValue({
      data: [{ id: 1, title: 'Slide', order_index: 0, image_url: '/uploads/test.png' }],
    });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    const { getByText, getByPlaceholderText } = render(
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <CarouselScreen />
      </SafeAreaProvider>
    );

    await waitFor(() => expect(getByText('Edit')).toBeTruthy());
    fireEvent.press(getByText('Edit'));
    fireEvent.changeText(getByPlaceholderText('0'), 'abc');
    fireEvent.press(getByText('Save Slide'));

    expect(alertSpy).toHaveBeenCalledWith('Validation Error', 'Order index must be a non-negative whole number');
    expect(staff.updateCarouselItem).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('updates a slide successfully', async () => {
    staff.listCarouselItems.mockResolvedValue({
      data: [{ id: 2, title: 'Slide', order_index: 1, image_url: '/uploads/test.png' }],
    });
    staff.updateCarouselItem.mockResolvedValue({ data: { id: 2 } });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    const { getByText } = render(
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <CarouselScreen />
      </SafeAreaProvider>
    );

    await waitFor(() => expect(getByText('Edit')).toBeTruthy());
    fireEvent.press(getByText('Edit'));
    fireEvent.press(getByText('Save Slide'));

    await waitFor(() => expect(staff.updateCarouselItem).toHaveBeenCalled());
    expect(alertSpy).toHaveBeenCalledWith('Success', 'Item updated');
    alertSpy.mockRestore();
  });
});
