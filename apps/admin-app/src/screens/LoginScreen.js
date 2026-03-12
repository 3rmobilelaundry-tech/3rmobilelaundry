import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { auth, setAuthToken, normalizeApiError, saveAuthSession, loadAuthSession, tryDevDefaultLogin } from '../services/api';

const { width } = Dimensions.get('window');

export default function LoginScreen({ navigation }) {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    console.log('AdminApp: LoginScreen mounted');
  }, []);

  const routeByRole = (user) => {
    switch (user.role) {
      case 'head_admin':
        navigation.replace('HeadAdmin', { user, initialTab: 'Overview' });
        break;
      case 'receptionist':
        navigation.replace('ReceptionistScreen', { user });
        break;
      case 'washer':
        navigation.replace('WasherScreen', { user });
        break;
      case 'rider':
        navigation.replace('RiderScreen', { user });
        break;
      default:
        navigation.replace('Dashboard', { user });
    }
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
      Alert.alert('Error', 'Please enter Phone/Email and Password');
      return;
    }

    setLoading(true);
    try {
      // Try development default login first, then fall back to API
      const response = await tryDevDefaultLogin(phone, password);
      const { token, user } = response.data;

      if (user.role === 'student') {
        Alert.alert('Error', 'Students cannot access Admin App');
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
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Login</Text>

        <TextInput
          style={styles.input}
          placeholder="Phone Number or Email"
          value={phone}
          onChangeText={setPhone}
          keyboardType="default"
          autoCapitalize="none"
        />

        <View style={styles.passwordContainer}>
          <TextInput
            style={styles.input}
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
          />
          <TouchableOpacity
            style={styles.eyeIcon}
            onPress={() => setShowPassword(!showPassword)}
          >
            <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={24} color="#666" />
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color="#007bff" />
        ) : (
          <TouchableOpacity style={styles.button} onPress={handleLogin}>
            <Text style={styles.buttonText}>Login</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity onPress={() => navigation.navigate('Signup')}>
          <Text style={styles.link}>Don't have an account? Sign Up</Text>
        </TouchableOpacity>

        {/* DEVELOPMENT ONLY: Default test credentials */}
        <Text style={styles.devNote}>
          Dev Test Account - Phone: 09000000000 | Password: admin123
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 30,
    width: Math.min(width * 0.9, 400),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 5,
    padding: 15,
    marginVertical: 10,
    fontSize: 16,
  },
  passwordContainer: {
    position: 'relative',
    marginVertical: 10,
  },
  eyeIcon: {
    position: 'absolute',
    right: 15,
    top: 15,
  },
  button: {
    backgroundColor: '#007bff',
    paddingVertical: 15,
    borderRadius: 5,
    marginVertical: 20,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  link: {
    color: '#007bff',
    textAlign: 'center',
    marginTop: 10,
  },
  devNote: {
    textAlign: 'center',
    color: '#666',
    marginTop: 20,
    fontSize: 11,
  },
});
