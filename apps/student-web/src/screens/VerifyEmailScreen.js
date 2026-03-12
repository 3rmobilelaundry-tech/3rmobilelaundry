import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  Alert, 
  SafeAreaView, 
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { auth, normalizeApiError } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { theme } from '../constants/theme';

export default function VerifyEmailScreen({ navigation, route }) {
  const { email } = route.params || {};
  const { login } = useAuth();
  
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!email) {
      Alert.alert('Error', 'Email address is missing. Please sign up again.');
      navigation.replace('SignUp');
    }
  }, [email]);

  useEffect(() => {
    let timer;
    if (cooldown > 0) {
      timer = setInterval(() => setCooldown(c => c - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleVerify = async () => {
    if (!otp || otp.length < 6) {
      setError('Please enter a valid 6-digit code');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      const response = await auth.verifyEmail(email, otp);
      const { token, user, success } = response.data;
      
      if (success || token) {
        Alert.alert('Success', 'Email verified successfully!');
        if (token && user) {
            await login(token, user);
        } else {
            navigation.replace('Login', { email });
        }
      } else {
        setError('Verification failed. Please try again.');
      }
    } catch (err) {
      const normalized = normalizeApiError(err);
      setError(normalized.message || 'Invalid verification code');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    
    setResending(true);
    setError('');
    
    try {
      const response = await auth.resendEmailVerification(email);
      const { cooldown_seconds } = response.data;
      setCooldown(cooldown_seconds || 60);
      Alert.alert('Sent', 'A new verification code has been sent to your email.');
    } catch (err) {
      const normalized = normalizeApiError(err);
      if (normalized.code === 'cooldown') {
          setCooldown(err.response?.data?.cooldown_seconds || 60);
          setError(`Please wait ${err.response?.data?.cooldown_seconds}s before resending.`);
      } else {
          setError(normalized.message || 'Failed to resend code');
      }
    } finally {
      setResending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.card}>
            <View style={styles.header}>
              <Ionicons name="mail-unread-outline" size={64} color={theme.colors.primary} />
              <Text style={styles.title}>Verify Your Email</Text>
              <Text style={styles.subtitle}>
                We sent a verification code to:{'\n'}
                <Text style={styles.emailText}>{email}</Text>
              </Text>
            </View>

            <View style={styles.form}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Verification Code</Text>
                <TextInput
                  style={[styles.input, error && styles.inputError]}
                  placeholder="Enter 6-digit code"
                  placeholderTextColor={theme.colors.text.placeholder}
                  value={otp}
                  onChangeText={setOtp}
                  keyboardType="number-pad"
                  maxLength={6}
                  autoFocus
                />
                {error ? (
                  <View style={styles.errorContainer}>
                    <Ionicons name="alert-circle" size={16} color={theme.colors.text.error} />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}
              </View>

              <TouchableOpacity 
                style={[styles.verifyBtn, loading && styles.disabledBtn]}
                onPress={handleVerify}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.verifyBtnText}>Verify Email</Text>
                )}
              </TouchableOpacity>

              <View style={styles.resendContainer}>
                <Text style={styles.resendText}>Didn't receive code? </Text>
                <TouchableOpacity 
                  onPress={handleResend} 
                  disabled={cooldown > 0 || resending}
                >
                  <Text style={[styles.resendLink, (cooldown > 0 || resending) && styles.disabledLink]}>
                    {resending ? 'Sending...' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend Code'}
                  </Text>
                </TouchableOpacity>
              </View>
              
              <TouchableOpacity 
                style={styles.backBtn}
                onPress={() => navigation.navigate('Login')}
              >
                <Text style={styles.backBtnText}>Back to Login</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  container: { flexGrow: 1, justifyContent: 'center', padding: theme.spacing.l },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 24,
    padding: theme.spacing.l,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  header: { alignItems: 'center', marginBottom: theme.spacing.xl },
  title: { ...theme.typography.h2, color: theme.colors.text.primary, marginTop: theme.spacing.m, textAlign: 'center' },
  subtitle: { ...theme.typography.body, color: theme.colors.text.secondary, textAlign: 'center', marginTop: theme.spacing.s },
  emailText: { fontWeight: '700', color: theme.colors.primary },
  form: { width: '100%' },
  inputGroup: { marginBottom: theme.spacing.l },
  label: { ...theme.typography.caption, color: theme.colors.text.primary, marginBottom: theme.spacing.xs, fontWeight: '600' },
  input: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 16,
    paddingHorizontal: theme.spacing.m,
    paddingVertical: 14,
    ...theme.typography.h2,
    textAlign: 'center',
    letterSpacing: 8,
    color: theme.colors.text.primary,
  },
  inputError: { borderColor: theme.colors.text.error },
  errorContainer: { flexDirection: 'row', alignItems: 'center', marginTop: theme.spacing.s, justifyContent: 'center' },
  errorText: { ...theme.typography.small, color: theme.colors.text.error, marginLeft: 4 },
  verifyBtn: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: theme.spacing.l,
  },
  disabledBtn: { opacity: 0.7 },
  verifyBtnText: { ...theme.typography.h2, color: '#fff', fontWeight: '700' },
  resendContainer: { flexDirection: 'row', justifyContent: 'center', marginBottom: theme.spacing.l },
  resendText: { ...theme.typography.body, color: theme.colors.text.secondary },
  resendLink: { ...theme.typography.body, color: theme.colors.primary, fontWeight: '600' },
  disabledLink: { color: theme.colors.text.placeholder },
  backBtn: { alignItems: 'center' },
  backBtnText: { ...theme.typography.body, color: theme.colors.text.secondary },
});
