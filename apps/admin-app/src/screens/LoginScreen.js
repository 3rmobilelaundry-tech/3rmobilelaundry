import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { auth, setAuthToken, normalizeApiError, saveAuthSession, loadAuthSession } from '../services/api';

export default function LoginScreen({ navigation }) {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    console.log('AdminApp: LoginScreen mounted');
  }, []);

  const routeByRole = (user) => {
    if (user.role === 'admin') {
      navigation.replace('HeadAdmin', { user, initialTab: 'Overview' });
      return;
    }
    if (user.role === 'receptionist') {
      navigation.replace('ReceptionistScreen', { user });
      return;
    }
    if (user.role === 'washer') {
      navigation.replace('WasherScreen', { user });
      return;
    }
    if (user.role === 'rider') {
      navigation.replace('RiderScreen', { user });
      return;
    }
    navigation.replace('Dashboard', { user });
  };

  useEffect(() => {
    let active = true;
    const restoreSession = async () => {
      setLoading(true);
      try {
        const { token, user } = await loadAuthSession();
        if (!active) return;
        if (token && user && user.role !== 'student') {
          routeByRole(user);
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    restoreSession();
    return () => {
      active = false;
    };
  }, []);

  const handleLogin = async () => {
    console.log('AdminApp: Login attempt', phone);
    if (!phone || !password) {
      Alert.alert('Error', 'Please enter Phone and Password');
      return;
    }

    setLoading(true);
    try {
      const response = await auth.login(phone, password);
      const { token, user } = response.data;
      
      if (user.role === 'student') {
        Alert.alert('Error', 'Students cannot access Staff App');
        return;
      }

      setAuthToken(token);
      await saveAuthSession(token, user);
      routeByRole(user);
    } catch (error) {
      const normalized = error?.normalized || normalizeApiError(error);
      Alert.alert('Login Failed', normalized.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Staff Login</Text>
      <Text style={{textAlign: 'center', color: '#999', marginBottom: 10}}>v2.0 (Fixes Loaded)</Text>
      <TextInput
        style={styles.input}
        placeholder="Phone Number"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      
      {loading ? (
        <ActivityIndicator size="large" color="#0000ff" />
      ) : (
        <Button title="Login" onPress={handleLogin} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#eee',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#999',
    padding: 10,
    marginBottom: 10,
    borderRadius: 5,
    backgroundColor: '#fff',
  },
});
