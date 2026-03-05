import React, { createContext, useState, useEffect, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setAuthToken } from '../services/api';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [userToken, setUserToken] = useState(null);
  const [userData, setUserData] = useState(null);

  const login = async (token, user) => {
    setIsLoading(true);
    try {
      setUserToken(token);
      setUserData(user);
      await AsyncStorage.setItem('userToken', token);
      await AsyncStorage.setItem('userData', JSON.stringify(user));
      await setAuthToken(token);
    } catch (e) {
      console.error('Login error', e);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      console.log('AuthContext: Logout called');
      setUserToken(null);
      setUserData(null);
      await AsyncStorage.removeItem('userToken');
      await AsyncStorage.removeItem('userData');
      await setAuthToken(null);
      console.log('AuthContext: Logout complete');
    } catch (e) {
      console.error('Logout error', e);
    } finally {
      setIsLoading(false);
    }
  };

  const isLoggedIn = async () => {
    try {
      console.log('AuthContext: Starting auth check...');
      setIsLoading(true);
      const token = await AsyncStorage.getItem('userToken');
      const userStr = await AsyncStorage.getItem('userData');
      
      if (token && userStr) {
        console.log('AuthContext: Found stored credentials');
        setUserToken(token);
        setUserData(JSON.parse(userStr));
        await setAuthToken(token);
      } else {
        console.log('AuthContext: No stored credentials found');
        // Ensure clean state if partial data exists
        setUserToken(null);
        setUserData(null);
        await setAuthToken(null);
        await AsyncStorage.removeItem('userToken'); // Cleanup potential garbage
      }
    } catch (e) {
      console.error('AuthContext: Auth check error', e);
    } finally {
      console.log('AuthContext: Auth check complete, isLoading -> false');
      setIsLoading(false);
    }
  };

  useEffect(() => {
    isLoggedIn();
  }, []);

  return (
    <AuthContext.Provider value={{ login, logout, isLoading, userToken, userData }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
