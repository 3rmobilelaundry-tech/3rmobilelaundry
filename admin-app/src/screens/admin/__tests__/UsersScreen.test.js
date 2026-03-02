import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import UsersScreen from '../UsersScreen';
import { staff } from '../../../services/api';

const initialWindowMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};
const adminUser = { user_id: 1, role: 'admin', full_name: 'Head Admin' };

let mockLastEvent = null;

jest.mock('../../../services/api', () => ({
  staff: {
    listUsers: jest.fn(),
    listSchools: jest.fn(),
    deleteUser: jest.fn(),
    updateUser: jest.fn(),
    createUser: jest.fn(),
    auditLogs: jest.fn(),
  },
}));

jest.mock('../../../context/SyncContext', () => ({
  useSync: () => ({ lastEvent: mockLastEvent }),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Icon',
}));

describe('UsersScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLastEvent = null;
  });

  it('requires sign-up school for student users', async () => {
    staff.listUsers.mockResolvedValue({ data: [] });
    staff.listSchools.mockResolvedValue({ data: [{ school_name: 'UNILAG', active: true }] });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    const { getByText, getByTestId } = render(
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <UsersScreen currentUser={adminUser} />
      </SafeAreaProvider>
    );

    await waitFor(() => expect(getByText('Add User')).toBeTruthy());
    fireEvent.press(getByText('Add User'));

    fireEvent.changeText(getByTestId('input-full-name'), 'Test User');
    fireEvent.changeText(getByTestId('input-phone-number'), '08000000000');

    fireEvent.press(getByText('Save User'));

    expect(alertSpy).toHaveBeenCalledWith('Error', 'Sign-up School is required.');
    expect(staff.createUser).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('loads schools from registration setup', async () => {
    staff.listUsers.mockResolvedValue({ data: [] });
    staff.listSchools.mockResolvedValue({
      data: [
        { school_name: 'UNILAG', active: true },
        { school_name: 'Inactive School', active: false },
      ],
    });

    const { getByText, getByTestId, queryByText } = render(
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <UsersScreen currentUser={adminUser} />
      </SafeAreaProvider>
    );

    await waitFor(() => expect(getByText('Add User')).toBeTruthy());
    fireEvent.press(getByText('Add User'));

    await waitFor(() => expect(staff.listSchools).toHaveBeenCalled());
    fireEvent.press(getByTestId('school-dropdown'));

    await waitFor(() => {
      expect(getByText('UNILAG')).toBeTruthy();
      expect(queryByText('Inactive School')).toBeNull();
    });
  });

  it('refreshes school list when schools are updated', async () => {
    staff.listUsers.mockResolvedValue({ data: [] });
    staff.listSchools
      .mockResolvedValueOnce({ data: [{ school_name: 'UNILAG', active: true }] })
      .mockResolvedValueOnce({ data: [{ school_name: 'LASU', active: true }] });

    const { getByText, getByTestId, rerender } = render(
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <UsersScreen currentUser={adminUser} />
      </SafeAreaProvider>
    );

    await waitFor(() => expect(getByText('Add User')).toBeTruthy());
    fireEvent.press(getByText('Add User'));
    await waitFor(() => expect(staff.listSchools).toHaveBeenCalledTimes(1));

    fireEvent.press(getByTestId('school-dropdown'));
    await waitFor(() => expect(getByText('UNILAG')).toBeTruthy());
    fireEvent.press(getByText('UNILAG'));

    mockLastEvent = { type: 'schools_updated', payload: { school_id: 1 } };
    rerender(
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <UsersScreen currentUser={adminUser} />
      </SafeAreaProvider>
    );

    await waitFor(() => expect(staff.listSchools).toHaveBeenCalledTimes(2));
    fireEvent.press(getByTestId('school-dropdown'));
    await waitFor(() => {
      expect(getByText('LASU')).toBeTruthy();
      expect(getByText('Selected school is no longer active')).toBeTruthy();
    });
  });

  it('blocks save when schools fail to load', async () => {
    staff.listUsers.mockResolvedValue({ data: [] });
    staff.listSchools.mockRejectedValue(new Error('boom'));
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    const { getByText, getByTestId } = render(
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <UsersScreen currentUser={adminUser} />
      </SafeAreaProvider>
    );

    await waitFor(() => expect(getByText('Add User')).toBeTruthy());
    fireEvent.press(getByText('Add User'));
    await waitFor(() => expect(staff.listSchools).toHaveBeenCalled());

    fireEvent.changeText(getByTestId('input-full-name'), 'Test User');
    fireEvent.changeText(getByTestId('input-phone-number'), '08000000000');
    fireEvent.press(getByText('Save User'));

    expect(alertSpy).toHaveBeenCalledWith('Error', 'Failed to load schools. Please try again.');
    alertSpy.mockRestore();
  });

  it('deletes a user after confirmation', async () => {
    const user = { user_id: 10, full_name: 'Delete User', phone_number: '08000000000', role: 'student', status: 'active' };
    staff.listUsers.mockResolvedValue({ data: [user] });
    staff.deleteUser.mockResolvedValue({ data: { message: 'Deleted', user_id: user.user_id } });

    jest.spyOn(Alert, 'alert').mockImplementation((title, message, buttons) => {
      if (Array.isArray(buttons)) {
        const deleteBtn = buttons.find((b) => b.text === 'Delete');
        deleteBtn?.onPress();
      }
    });

    const { getByText, queryByText } = render(
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <UsersScreen currentUser={adminUser} />
      </SafeAreaProvider>
    );

    await waitFor(() => expect(getByText('Delete')).toBeTruthy());
    fireEvent.press(getByText('Delete'));

    await waitFor(() => {
      expect(staff.deleteUser).toHaveBeenCalledWith(user.user_id);
      expect(queryByText('Delete User')).toBeNull();
    });
  });
});
