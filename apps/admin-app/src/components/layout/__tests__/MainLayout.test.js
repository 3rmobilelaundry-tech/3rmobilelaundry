import React from 'react';
import { render } from '@testing-library/react-native';

let authListener = null;

jest.mock('../../../services/api', () => ({
  onAuthExpired: jest.fn((listener) => {
    authListener = listener;
    return () => {
      authListener = null;
    };
  })
}));

jest.mock('expo-asset', () => ({
  Asset: {
    fromModule: () => ({ downloadAsync: jest.fn() }),
    loadAsync: jest.fn()
  }
}));

jest.mock('expo-font', () => ({
  loadAsync: jest.fn()
}));

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const Ionicons = ({ name }) => React.createElement(Text, null, name);
  return { Ionicons };
});

import MainLayout from '../MainLayout';

describe('MainLayout', () => {
  it('triggers logout on auth expiration', () => {
    const onLogout = jest.fn();
    render(
      <MainLayout
        activeTab="Overview"
        onTabChange={() => {}}
        title="Overview"
        menuItems={[]}
        onLogout={onLogout}
      >
        {null}
      </MainLayout>
    );
    expect(typeof authListener).toBe('function');
    authListener();
    expect(onLogout).toHaveBeenCalled();
  });
});
