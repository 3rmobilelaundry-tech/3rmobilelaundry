import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, Dimensions } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';
import { auth, setAuthToken, saveAuthSession, normalizeApiError } from '../services/api';

const { width } = Dimensions.get('window');

export default function SignupScreen({ navigation }) {
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    role: 'head_admin',
    password: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const validateForm = () => {
    if (!form.name.trim()) return 'Name is required';
    if (!form.phone.trim()) return 'Phone number is required';
    if (!/^\+?[0-9]{10,15}$/.test(form.phone.trim())) return 'Invalid phone format';
    if (!form.email.trim()) return 'Email is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return 'Invalid email format';
    if (!form.password) return 'Password is required';
    if (form.password.length < 6) return 'Password must be at least 6 characters';
    if (form.password !== form.confirmPassword) return 'Passwords do not match';
    return null;
  };

  const handleSignup = async () => {
    const error = validateForm();
    if (error) {
      Alert.alert('Validation Error', error);
      return;
    }

    setLoading(true);
    try {
      const payload = {
        full_name: form.name,
        phone_number: form.phone,
        email: form.email,
        password: form.password,
        role: form.role,
      };
      const response = await auth.register(payload);
      const { token, user } = response.data || response;

      if (token) {
        setAuthToken(token);
        await saveAuthSession(token, user);
        routeByRole(user);
      }
    } catch (error) {
      const normalized = normalizeApiError(error);
      Alert.alert('Signup Failed', normalized.message);
    } finally {
      setLoading(false);
    }
  };

  const routeByRole = (user) => {
    if (user.role === 'head_admin') {
      navigation.replace('HeadAdmin', { user, initialTab: 'Overview' });
    } else if (user.role === 'receptionist') {
      navigation.replace('ReceptionistScreen', { user });
    } else if (user.role === 'washer') {
      navigation.replace('WasherScreen', { user });
    } else if (user.role === 'rider') {
      navigation.replace('RiderScreen', { user });
    } else {
      navigation.replace('Dashboard', { user });
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Sign Up</Text>

        <TextInput
          style={styles.input}
          placeholder="Full Name"
          value={form.name}
          onChangeText={(text) => setForm({ ...form, name: text })}
        />

        <TextInput
          style={styles.input}
          placeholder="Phone Number"
          value={form.phone}
          onChangeText={(text) => setForm({ ...form, phone: text })}
          keyboardType="phone-pad"
        />

        <TextInput
          style={styles.input}
          placeholder="Email"
          value={form.email}
          onChangeText={(text) => setForm({ ...form, email: text })}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={form.role}
            onValueChange={(itemValue) => setForm({ ...form, role: itemValue })}
            style={styles.picker}
          >
            <Picker.Item label="Head Admin" value="head_admin" />
            <Picker.Item label="Washer" value="washer" />
            <Picker.Item label="Receptionist" value="receptionist" />
            <Picker.Item label="Rider" value="rider" />
          </Picker>
        </View>

        <View style={styles.passwordContainer}>
          <TextInput
            style={styles.input}
            placeholder="Password"
            value={form.password}
            onChangeText={(text) => setForm({ ...form, password: text })}
            secureTextEntry={!showPassword}
          />
          <TouchableOpacity
            style={styles.eyeIcon}
            onPress={() => setShowPassword(!showPassword)}
          >
            <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={24} color="#666" />
          </TouchableOpacity>
        </View>

        <View style={styles.passwordContainer}>
          <TextInput
            style={styles.input}
            placeholder="Confirm Password"
            value={form.confirmPassword}
            onChangeText={(text) => setForm({ ...form, confirmPassword: text })}
            secureTextEntry={!showConfirmPassword}
          />
          <TouchableOpacity
            style={styles.eyeIcon}
            onPress={() => setShowConfirmPassword(!showConfirmPassword)}
          >
            <Ionicons name={showConfirmPassword ? 'eye-off' : 'eye'} size={24} color="#666" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.button} onPress={handleSignup} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? 'Signing Up...' : 'Sign Up'}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('Login')}>
          <Text style={styles.link}>Already have an account? Login</Text>
        </TouchableOpacity>
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
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 5,
    marginVertical: 10,
  },
  picker: {
    height: 50,
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
    backgroundColor: '#28a745',
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
});