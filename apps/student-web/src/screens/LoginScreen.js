import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet, Alert, ActivityIndicator, TouchableOpacity, Animated, SafeAreaView, ScrollView, KeyboardAvoidingView, Platform, Image } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, normalizeApiError } from '../services/api';
import { useAuth } from '../context/AuthContext';

const palette = {
  primary: '#4F46E5',
  primaryDark: '#3730A3',
  secondary: '#7C3AED',
  background: '#F5F7FF',
  surface: '#FFFFFF',
  text: '#111827',
  textSoft: '#4B5563',
  textMuted: '#9CA3AF',
  border: '#E5E7EB',
  shadow: '#111827',
};

const welcomeIllustration = require('../../assets/welcome-illustration.png.png');
const loginIllustration = require('../../assets/login-illustration.png.png');

export default function LoginScreen({ navigation, route }) {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState('intro');
  const [checking, setChecking] = useState(true);
  const [resetEmail, setResetEmail] = useState('');
  const [resetOtp, setResetOtp] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');
  const [emailVerifyEmail, setEmailVerifyEmail] = useState('');
  const [emailVerifyOtp, setEmailVerifyOtp] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;
  const { login } = useAuth();

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const seen = await AsyncStorage.getItem('hasSeenWelcome');
        if (active) {
          const preferredMode = route?.params?.mode;
          setStage(preferredMode || (seen === 'true' ? 'intro' : 'welcome'));
        }
      } finally {
        if (active) setChecking(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [route?.params?.mode]);

  useEffect(() => {
    const nextMode = route?.params?.mode;
    if (nextMode) setStage(nextMode);
    const nextEmail = route?.params?.email;
    if (nextEmail) {
      setEmailVerifyEmail(nextEmail);
      setResetEmail(nextEmail);
    }
  }, [route?.params?.mode, route?.params?.email]);

  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 280, useNativeDriver: true }).start();
  }, [stage, fade]);

  const handleLogin = async (p = phone, pw = password) => {
    if (!p || !pw) {
      Alert.alert('Error', 'Please enter phone and password');
      return;
    }

    setLoading(true);
    try {
      const response = await auth.login(p, pw);
      const { token, user } = response.data;
      await login(token, user);
    } catch (error) {
      const code = error?.response?.data?.code;
      if (code === 'email_unverified') {
        const email = error?.response?.data?.email;
        if (email) setEmailVerifyEmail(email);
        setStage('emailVerify');
        return;
      }
      const normalized = normalizeApiError(error);
      Alert.alert('Error', normalized.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestPasswordReset = async () => {
    if (!resetEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resetEmail)) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }
    setResetLoading(true);
    try {
      await auth.requestPasswordReset(resetEmail);
      setStage('resetVerify');
      setResetOtp('');
    } catch (error) {
      const normalized = normalizeApiError(error);
      Alert.alert('Error', normalized.message);
    } finally {
      setResetLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetEmail || !resetOtp || !resetPassword) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    if (resetPassword !== resetConfirm) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }
    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/;
    if (!passwordRegex.test(resetPassword)) {
      Alert.alert('Error', 'Password must be at least 8 characters and include letters and numbers');
      return;
    }
    setResetLoading(true);
    try {
      await auth.resetPassword(resetEmail, resetOtp, resetPassword);
      Alert.alert('Success', 'Password reset successful. You can log in now.');
      setStage('form');
      setResetOtp('');
      setResetPassword('');
      setResetConfirm('');
    } catch (error) {
      const normalized = normalizeApiError(error);
      Alert.alert('Error', normalized.message);
    } finally {
      setResetLoading(false);
    }
  };

  const handleResendEmailVerification = async () => {
    if (!emailVerifyEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVerifyEmail)) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }
    setResendLoading(true);
    try {
      await auth.resendEmailVerification(emailVerifyEmail);
      Alert.alert('Sent', 'Verification code sent to your email');
    } catch (error) {
      const normalized = normalizeApiError(error);
      Alert.alert('Error', normalized.message);
    } finally {
      setResendLoading(false);
    }
  };

  const handleVerifyEmail = async () => {
    if (!emailVerifyEmail || !emailVerifyOtp) {
      Alert.alert('Error', 'Email and code are required');
      return;
    }
    setVerifyLoading(true);
    try {
      await auth.verifyEmail(emailVerifyEmail, emailVerifyOtp);
      Alert.alert('Verified', 'Email verified. You can log in now.');
      setStage('form');
      setEmailVerifyOtp('');
    } catch (error) {
      const normalized = normalizeApiError(error);
      Alert.alert('Error', normalized.message);
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleGetStarted = async () => {
    await AsyncStorage.setItem('hasSeenWelcome', 'true');
    setStage('intro');
  };

  if (checking) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={palette.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.bgLayer} />
      <View style={styles.bgAccentOne} />
      <View style={styles.bgAccentTwo} />
      <Animated.View style={[styles.full, { opacity: fade }]}>
        {stage === 'welcome' && (
          <View style={styles.screenWrap}>
            <View style={styles.illustrationWrap}>
              <Image source={welcomeIllustration} style={styles.illustrationImage} resizeMode="contain" />
            </View>
            <Text style={styles.heroTitle}>Welcome to 3R Laundry</Text>
            <Text style={styles.heroSubtitle}>Smart laundry pickup & delivery for students.</Text>
            <Text style={styles.heroBody}>
              Book pickups in seconds, track your laundry in real-time, chat with your rider, and enjoy stress-free campus living.
            </Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={handleGetStarted} accessibilityRole="button">
              <Text style={styles.primaryBtnText}>Get Started</Text>
            </TouchableOpacity>
          </View>
        )}

        {stage === 'intro' && (
          <View style={styles.screenWrap}>
            <View style={styles.illustrationWrap}>
              <Image source={loginIllustration} style={styles.illustrationImage} resizeMode="contain" />
            </View>
            <Text style={styles.heroTitle}>Welcome Back</Text>
            <Text style={styles.heroSubtitle}>Sign in to manage your laundry, track orders, and stay fresh.</Text>
            <View style={styles.buttonRow}>
              <TouchableOpacity style={[styles.primaryBtn, styles.buttonFlex]} onPress={() => setStage('form')} accessibilityRole="button">
                <Text style={styles.primaryBtnText}>Login</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.secondaryBtn, styles.buttonFlex]} onPress={() => navigation.navigate('SignUp')} accessibilityRole="button">
                <Text style={styles.secondaryBtnText}>Sign Up</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {stage === 'form' && (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.full}>
            <ScrollView contentContainerStyle={styles.formWrap} keyboardShouldPersistTaps="handled">
              <View style={styles.formCard}>
                <View style={styles.illustrationWrap}>
                  <Image source={loginIllustration} style={styles.illustrationImage} resizeMode="contain" />
                </View>
                <Text style={styles.formTitle}>Login</Text>
                <Text style={styles.formSubtitle}>Use your phone number and password to continue.</Text>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Phone Number</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter phone number"
                    placeholderTextColor={palette.textMuted}
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    autoCapitalize="none"
                  />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Password</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter password"
                    placeholderTextColor={palette.textMuted}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                  />
                </View>
                <TouchableOpacity style={styles.forgotBtn} onPress={() => setStage('resetRequest')} accessibilityRole="button">
                  <Text style={styles.forgotText}>Forgot password?</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.primaryBtn} onPress={() => handleLogin()} disabled={loading} accessibilityRole="button">
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Login</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={styles.ghostBtn} onPress={() => handleLogin('08000000001', '123456')} accessibilityRole="button">
                  <Text style={styles.ghostBtnText}>Use Demo Login</Text>
                </TouchableOpacity>
                <View style={styles.bottomRow}>
                  <Text style={styles.bottomText}>New here?</Text>
                  <TouchableOpacity onPress={() => navigation.navigate('SignUp')} accessibilityRole="link">
                    <Text style={styles.bottomLink}>Create an account</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity style={styles.backBtn} onPress={() => setStage('intro')} accessibilityRole="button">
                  <Text style={styles.backBtnText}>Back</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        )}

        {stage === 'resetRequest' && (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.full}>
            <ScrollView contentContainerStyle={styles.formWrap} keyboardShouldPersistTaps="handled">
              <View style={styles.formCard}>
                <Text style={styles.formTitle}>Reset Password</Text>
                <Text style={styles.formSubtitle}>Enter your email to receive a reset code.</Text>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Email Address</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="you@example.com"
                    placeholderTextColor={palette.textMuted}
                    value={resetEmail}
                    onChangeText={setResetEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
                <TouchableOpacity style={styles.primaryBtn} onPress={handleRequestPasswordReset} disabled={resetLoading} accessibilityRole="button">
                  {resetLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Send Reset Code</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={styles.ghostBtn} onPress={() => setStage('form')} accessibilityRole="button">
                  <Text style={styles.ghostBtnText}>Back to Login</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        )}

        {stage === 'resetVerify' && (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.full}>
            <ScrollView contentContainerStyle={styles.formWrap} keyboardShouldPersistTaps="handled">
              <View style={styles.formCard}>
                <Text style={styles.formTitle}>Enter Reset Code</Text>
                <Text style={styles.formSubtitle}>Check your email and set a new password.</Text>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Email Address</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="you@example.com"
                    placeholderTextColor={palette.textMuted}
                    value={resetEmail}
                    onChangeText={setResetEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Reset Code</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter code"
                    placeholderTextColor={palette.textMuted}
                    value={resetOtp}
                    onChangeText={setResetOtp}
                    keyboardType="number-pad"
                  />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>New Password</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="New password"
                    placeholderTextColor={palette.textMuted}
                    value={resetPassword}
                    onChangeText={setResetPassword}
                    secureTextEntry
                  />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Confirm Password</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Confirm password"
                    placeholderTextColor={palette.textMuted}
                    value={resetConfirm}
                    onChangeText={setResetConfirm}
                    secureTextEntry
                  />
                </View>
                <TouchableOpacity style={styles.primaryBtn} onPress={handleResetPassword} disabled={resetLoading} accessibilityRole="button">
                  {resetLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Reset Password</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={styles.ghostBtn} onPress={handleRequestPasswordReset} disabled={resetLoading} accessibilityRole="button">
                  <Text style={styles.ghostBtnText}>Resend Code</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.ghostBtn} onPress={() => setStage('form')} accessibilityRole="button">
                  <Text style={styles.ghostBtnText}>Back to Login</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        )}

        {stage === 'emailVerify' && (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.full}>
            <ScrollView contentContainerStyle={styles.formWrap} keyboardShouldPersistTaps="handled">
              <View style={styles.formCard}>
                <Text style={styles.formTitle}>Verify Email</Text>
                <Text style={styles.formSubtitle}>Enter the verification code sent to your email.</Text>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Email Address</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="you@example.com"
                    placeholderTextColor={palette.textMuted}
                    value={emailVerifyEmail}
                    onChangeText={setEmailVerifyEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Verification Code</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter code"
                    placeholderTextColor={palette.textMuted}
                    value={emailVerifyOtp}
                    onChangeText={setEmailVerifyOtp}
                    keyboardType="number-pad"
                  />
                </View>
                <TouchableOpacity style={styles.primaryBtn} onPress={handleVerifyEmail} disabled={verifyLoading} accessibilityRole="button">
                  {verifyLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Verify Email</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={styles.ghostBtn} onPress={handleResendEmailVerification} disabled={resendLoading} accessibilityRole="button">
                  {resendLoading ? <ActivityIndicator color={palette.primary} /> : <Text style={styles.ghostBtnText}>Resend Code</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={styles.ghostBtn} onPress={() => setStage('form')} accessibilityRole="button">
                  <Text style={styles.ghostBtnText}>Back to Login</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        )}
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.background },
  full: { flex: 1 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.background },
  bgLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: palette.background },
  bgAccentOne: { position: 'absolute', width: 320, height: 320, borderRadius: 160, backgroundColor: '#E0E7FF', top: -80, right: -120, opacity: 0.9 },
  bgAccentTwo: { position: 'absolute', width: 280, height: 280, borderRadius: 140, backgroundColor: '#EDE9FE', bottom: -120, left: -80, opacity: 0.85 },
  screenWrap: { flex: 1, paddingHorizontal: 24, justifyContent: 'center', alignItems: 'center' },
  heroTitle: { fontSize: 28, fontWeight: '700', color: palette.text, textAlign: 'center', marginTop: 12 },
  heroSubtitle: { fontSize: 16, color: palette.textSoft, textAlign: 'center', marginTop: 8 },
  heroBody: { fontSize: 14, color: palette.textMuted, textAlign: 'center', marginTop: 12, lineHeight: 20, paddingHorizontal: 8 },
  buttonRow: { flexDirection: 'row', gap: 12, marginTop: 24, width: '100%' },
  buttonFlex: { flex: 1 },
  primaryBtn: { backgroundColor: palette.primary, paddingVertical: 14, borderRadius: 20, alignItems: 'center', justifyContent: 'center', width: '100%', shadowColor: palette.shadow, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.15, shadowRadius: 18, elevation: 4, marginTop: 20 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryBtn: { backgroundColor: '#fff', borderWidth: 1, borderColor: palette.border, paddingVertical: 14, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  secondaryBtnText: { color: palette.primaryDark, fontSize: 16, fontWeight: '600' },
  formWrap: { padding: 24, flexGrow: 1, justifyContent: 'center' },
  formCard: { backgroundColor: palette.surface, borderRadius: 24, padding: 24, shadowColor: palette.shadow, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.12, shadowRadius: 20, elevation: 4 },
  formTitle: { fontSize: 24, fontWeight: '700', color: palette.text, textAlign: 'center', marginTop: 12 },
  formSubtitle: { fontSize: 14, color: palette.textSoft, textAlign: 'center', marginTop: 6, marginBottom: 16 },
  inputGroup: { marginBottom: 12 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: palette.textSoft, marginBottom: 6 },
  input: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: palette.border, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 16, fontSize: 15, color: palette.text },
  forgotBtn: { alignSelf: 'flex-end', marginBottom: 14 },
  forgotText: { color: palette.primaryDark, fontSize: 13, fontWeight: '600' },
  ghostBtn: { marginTop: 10, alignItems: 'center', paddingVertical: 12, borderRadius: 16, borderWidth: 1, borderColor: '#E0E7FF' },
  ghostBtnText: { color: palette.primaryDark, fontSize: 14, fontWeight: '600' },
  bottomRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 16 },
  bottomText: { color: palette.textSoft, fontSize: 13 },
  bottomLink: { marginLeft: 6, color: palette.primaryDark, fontSize: 13, fontWeight: '600' },
  backBtn: { alignSelf: 'center', marginTop: 16 },
  backBtnText: { color: palette.textMuted, fontSize: 13, fontWeight: '600' },
  illustrationWrap: { width: '100%', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  illustrationImage: { width: '100%', maxWidth: 360, height: 220 },
});
