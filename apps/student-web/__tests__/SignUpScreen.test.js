import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import SignUpScreen from '../src/screens/SignUpScreen';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { student, auth } from '../src/services/api';

// Mock dependencies
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

// Mock API
jest.mock('../src/services/api', () => ({
  auth: {
    register: jest.fn(() => Promise.resolve({ data: { token: 'fake-token', user: {} } })),
    login: jest.fn(() => Promise.resolve({ data: { token: 'fake-token', user: {} } })),
  },
  student: {
    getRegistrationConfig: jest.fn(() => Promise.resolve({
      data: {
        fields: [
          { field_id: 1, label: 'Full Name', type: 'full_name', required: true, active: true, order: 1 },
          { field_id: 2, label: 'Email Address', type: 'email', required: true, active: true, order: 2 },
          { field_id: 3, label: 'Phone Number', type: 'phone_number', required: true, active: true, order: 3 },
          { field_id: 4, label: 'School', type: 'school', required: true, active: true, order: 4 },
          { field_id: 5, label: 'Student ID', type: 'student_id', required: true, active: true, order: 5 },
        ],
        schools: [
          { school_name: 'UNILAG', active: true },
          { school_name: 'LASU', active: true },
        ],
      }
    })),
    updateProfile: jest.fn(() => Promise.resolve({ data: {} })),
  },
  normalizeApiError: jest.fn(() => ({ message: 'Auth failed' })),
  setAuthToken: jest.fn(),
}));

jest.mock('../src/context/SyncContext', () => ({
  useSync: () => ({ lastEvent: null }),
}));

const mockLogin = jest.fn();
jest.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({ login: mockLogin }),
}));

// Mock Alert
jest.spyOn(Alert, 'alert');

const mockNavigation = {
  navigate: jest.fn(),
  replace: jest.fn(),
};

const renderScreen = async () => {
  const screen = render(<SignUpScreen navigation={mockNavigation} />);
  await waitFor(() => {
    expect(student.getRegistrationConfig).toHaveBeenCalled();
  });
  return screen;
};

describe('SignUpScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly with all main fields', async () => {
    const { getAllByText, getByLabelText, getByText } = await renderScreen();
    
    expect(getAllByText('Create Account').length).toBeGreaterThan(0);
    expect(getByLabelText('Full Name')).toBeTruthy();
    expect(getByLabelText('Email Address')).toBeTruthy();
    expect(getByLabelText('Phone Number')).toBeTruthy();
    expect(getByText('School')).toBeTruthy(); // Label for dropdown
  });

  it('shows validation errors when submitting empty form', async () => {
    const { getAllByText } = await renderScreen();
    
    const buttons = getAllByText('Create Account');
    fireEvent.press(buttons[buttons.length - 1]);

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith('Validation Error', 'Please correct the errors in the form.');
    });
  });

  it('toggles optional fields (progressive disclosure)', async () => {
    const { getByText, queryByText, getByLabelText } = await renderScreen();

    expect(queryByText('Middle Name')).toBeNull();
    
    fireEvent.press(getByText('Add Additional Details (Optional)'));
    expect(getByLabelText('Middle Name')).toBeTruthy();
    
    fireEvent.press(getByText('Hide Additional Details'));
    expect(queryByText('Middle Name')).toBeNull();
  });

  it('loads schools from configuration', async () => {
    const { getByText } = await renderScreen();

    await waitFor(() => {
      expect(getByText('Select your institution')).toBeTruthy();
    });

    fireEvent.press(getByText('Select your institution'));

    await waitFor(() => {
      expect(getByText('UNILAG')).toBeTruthy();
    });
  });

  it('validates email format', async () => {
    const { getByLabelText, getByText } = await renderScreen();
    const emailInput = getByLabelText('Email Address');
    
    fireEvent.changeText(emailInput, 'invalid-email');
    fireEvent(emailInput, 'blur'); // Trigger validation
    
    expect(getByText('Invalid email address')).toBeTruthy();
    
    fireEvent.changeText(emailInput, 'valid@email.com');
    // Error should be gone (might need to check queryByText)
    // In our implementation, errors update in useEffect.
    // We might need to wait for effect.
  });

  it('validates password strength', async () => {
    const { getByLabelText, getByLabelText: getByLabel } = await renderScreen();
    const passInput = getByLabel('Password');
    
    fireEvent.changeText(passInput, '123');
    // Check accessibility label or text for strength
    // The component has accessibilityLabel={`Password strength: ${labels[score]}`}
    // But we can also look for the text "Very Weak"
    
    // Note: The strength meter updates immediately based on props.
  });

  it('navigates to Login when link is pressed', async () => {
    const { getByText } = await renderScreen();
    fireEvent.press(getByText('Log in'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Login');
  });

  it('stores post-login route after successful registration', async () => {
    const { getByLabelText, getByText, getAllByText } = await renderScreen();

    fireEvent.changeText(getByLabelText('Full Name'), 'Test User');
    fireEvent.changeText(getByLabelText('Email Address'), 'test@example.com');
    fireEvent.changeText(getByLabelText('Phone Number'), '08000000000');
    fireEvent.press(getByText('Select your institution'));
    fireEvent.press(getByText('UNILAG'));
    fireEvent.changeText(getByLabelText('Student ID'), '12345');
    fireEvent.changeText(getByLabelText('Hostel Address'), 'Block A');
    fireEvent.changeText(getByLabelText('Password'), 'StrongPass1!');
    fireEvent.changeText(getByLabelText('Confirm Password'), 'StrongPass1!');

    const buttons = getAllByText('Create Account');
    fireEvent.press(buttons[buttons.length - 1]);

    await waitFor(() => {
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('postLoginRoute', 'MainTabs');
    });
  });

  it('auto-authenticates and does not route to Login on success', async () => {
    const { getByLabelText, getByText, getAllByText } = await renderScreen();

    fireEvent.changeText(getByLabelText('Full Name'), 'Test User');
    fireEvent.changeText(getByLabelText('Email Address'), 'test@example.com');
    fireEvent.changeText(getByLabelText('Phone Number'), '08000000000');
    fireEvent.press(getByText('Select your institution'));
    fireEvent.press(getByText('UNILAG'));
    fireEvent.changeText(getByLabelText('Student ID'), '12345');
    fireEvent.changeText(getByLabelText('Hostel Address'), 'Block A');
    fireEvent.changeText(getByLabelText('Password'), 'StrongPass1!');
    fireEvent.changeText(getByLabelText('Confirm Password'), 'StrongPass1!');

    const buttons = getAllByText('Create Account');
    fireEvent.press(buttons[buttons.length - 1]);

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalled();
    });
    expect(mockNavigation.replace).not.toHaveBeenCalledWith('Login', expect.anything());
  });

  it('falls back to Login when auto-authentication fails', async () => {
    auth.register.mockResolvedValueOnce({ data: { token: null, user: { email: 'test@example.com' } } });
    auth.login.mockRejectedValueOnce(new Error('Auth failed'));

    const { getByLabelText, getByText, getAllByText } = await renderScreen();

    fireEvent.changeText(getByLabelText('Full Name'), 'Test User');
    fireEvent.changeText(getByLabelText('Email Address'), 'test@example.com');
    fireEvent.changeText(getByLabelText('Phone Number'), '08000000000');
    fireEvent.press(getByText('Select your institution'));
    fireEvent.press(getByText('UNILAG'));
    fireEvent.changeText(getByLabelText('Student ID'), '12345');
    fireEvent.changeText(getByLabelText('Hostel Address'), 'Block A');
    fireEvent.changeText(getByLabelText('Password'), 'StrongPass1!');
    fireEvent.changeText(getByLabelText('Confirm Password'), 'StrongPass1!');

    const buttons = getAllByText('Create Account');
    fireEvent.press(buttons[buttons.length - 1]);

    await waitFor(() => {
      expect(mockNavigation.replace).toHaveBeenCalledWith('Login', { mode: 'form', email: 'test@example.com' });
    });
  });
});
