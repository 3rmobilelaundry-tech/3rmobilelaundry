import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Linking, Image, useWindowDimensions, Modal, TextInput, KeyboardAvoidingView, Platform, Pressable, AccessibilityInfo, findNodeHandle, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSync } from '../context/SyncContext';
import { student, normalizeApiError } from '../services/api';
import { theme } from '../constants/theme';
import Carousel from '../components/Carousel';
import PageLayout from '../components/PageLayout';

// --- Constants & Helpers ---

const THEME = {
  primary: theme.colors.primary,
  secondary: theme.colors.text,
  bg: theme.colors.background,
  white: theme.colors.surface,
  text: theme.colors.text,
  textLight: theme.colors.textSecondary,
  success: theme.colors.success,
  warning: theme.colors.warning,
  error: theme.colors.error,
  border: theme.colors.border,
};

const homescreenIllustration = require('../../assets/homescreen.png');
const SUCCESS_BANNER_MS = 10000;
const PENDING_KEY = 'bank_transfer_pending';
const SUCCESS_UNTIL_KEY = 'bank_transfer_success_until';
const LEGACY_SUCCESS_KEY = 'bank_transfer_success';
const EMERGENCY_CACHE_KEY = 'emergency_config_cache';

const getDaysRemaining = (endDate) => {
  const diff = new Date(endDate) - new Date();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  return days > 0 ? `${days} days remaining` : 'Expired';
};

const normalizeNigerianPhone = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return { error: 'Phone number is required' };
  const digits = raw.replace(/[^0-9]/g, '');
  if (!digits) return { error: 'Phone number is required' };
  if (digits.startsWith('0')) {
    if (!/^0(70|80|81|90|91)\d{8}$/.test(digits)) {
      return { error: 'Invalid Nigerian phone number' };
    }
    return { normalized: `+234${digits.slice(1)}`, local: digits };
  }
  if (digits.startsWith('234')) {
    if (!/^234(70|80|81|90|91)\d{8}$/.test(digits)) {
      return { error: 'Invalid Nigerian phone number' };
    }
    return { normalized: `+${digits}`, local: `0${digits.slice(3)}` };
  }
  return { error: 'Invalid Nigerian phone number' };
};

const StatusBadge = ({ status }) => {
  const stylesMap = {
    pending: { bg: '#FEF3C7', text: '#D97706' },
    accepted: { bg: '#DBEAFE', text: '#2563EB' },
    processing: { bg: '#DBEAFE', text: '#2563EB' },
    picked_up: { bg: '#E0E7FF', text: '#4F46E5' },
    ready: { bg: '#D1FAE5', text: '#059669' },
    delivered: { bg: '#F3F4F6', text: '#374151' },
    cancelled: { bg: '#FEE2E2', text: '#DC2626' },
  };
  const style = stylesMap[status] || stylesMap.pending;
  
  return (
    <View style={[styles.badge, { backgroundColor: style.bg }]}>
      <Text style={[styles.badgeText, { color: style.text }]}>{status.replace('_', ' ').toUpperCase()}</Text>
    </View>
  );
};

// --- Main Component ---

export default function HomeScreen({ navigation, route }) {
  const { user: initialUser } = route.params || {};
  const [user, setUser] = useState(initialUser);
  const [subscription, setSubscription] = useState(null);
  const [activeOrder, setActiveOrder] = useState(null);
  const [emergencyOrder, setEmergencyOrder] = useState(null);
  const [carouselItems, setCarouselItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [navLock, setNavLock] = useState(false);
  const [pendingTransfer, setPendingTransfer] = useState(false);
  const [pendingTransferStored, setPendingTransferStored] = useState(false);
  const [successTransfer, setSuccessTransfer] = useState(false);
  const [emergencyConfig, setEmergencyConfig] = useState(null);
  const [emergencyModalVisible, setEmergencyModalVisible] = useState(false);
  const [emergencyForm, setEmergencyForm] = useState({ name: '', phone_number: '', relationship: '', message: '' });
  const [emergencyErrors, setEmergencyErrors] = useState({});
  const [emergencyTouched, setEmergencyTouched] = useState({});
  const [emergencySubmitting, setEmergencySubmitting] = useState(false);
  const [emergencySubmitError, setEmergencySubmitError] = useState('');
  const { lastEvent } = useSync();
  const { width: screenWidth } = useWindowDimensions();
  const successTimeoutRef = useRef(null);
  const emergencyNameRef = useRef(null);
  
  const [illustrationAspectRatio, setIllustrationAspectRatio] = useState(1);
  const illustrationSource = useMemo(() => {
    if (typeof homescreenIllustration === 'number' && Image.resolveAssetSource) {
      return Image.resolveAssetSource(homescreenIllustration);
    }
    return homescreenIllustration;
  }, []);
  const illustrationHeight = useMemo(() => Math.round(screenWidth / illustrationAspectRatio), [screenWidth, illustrationAspectRatio]);
  const emergencyModalWidth = useMemo(() => Math.min(screenWidth - 32, 520), [screenWidth]);
  const primaryActiveOrder = emergencyOrder || activeOrder;

  useEffect(() => {
    const width = illustrationSource?.width;
    const height = illustrationSource?.height;
    if (width && height) {
      setIllustrationAspectRatio(width / height);
      return;
    }
    const uri = typeof illustrationSource === 'string' ? illustrationSource : illustrationSource?.uri;
    if (uri && Image.getSize) {
      Image.getSize(
        uri,
        (resolvedWidth, resolvedHeight) => {
          if (resolvedWidth && resolvedHeight) {
            setIllustrationAspectRatio(resolvedWidth / resolvedHeight);
          }
        },
        () => setIllustrationAspectRatio(1.8)
      );
      return;
    }
    setIllustrationAspectRatio(1.8);
  }, [illustrationSource]);

  useEffect(() => {
    if (!emergencyModalVisible) return;
    const timer = setTimeout(() => {
      const node = findNodeHandle(emergencyNameRef.current);
      if (node && AccessibilityInfo.setAccessibilityFocus) {
        AccessibilityInfo.setAccessibilityFocus(node);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [emergencyModalVisible]);

  // Safety check for user session
  useEffect(() => {
    if (!initialUser && !user) {
      Alert.alert('Session Error', 'Please log in again.', [
        { text: 'OK', onPress: () => navigation.replace('Login') }
      ]);
    }
  }, [initialUser, user, navigation]);

  const scheduleSuccessBanner = useCallback((until) => {
    setSuccessTransfer(true);
    if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
    const remaining = Math.max(0, until - Date.now());
    successTimeoutRef.current = setTimeout(() => {
      setSuccessTransfer(false);
      AsyncStorage.removeItem(SUCCESS_UNTIL_KEY);
    }, remaining);
  }, []);

  useEffect(() => {
    let active = true;
    const loadSuccess = async () => {
      const [pendingRaw, successUntilRaw, legacySuccess] = await Promise.all([
        AsyncStorage.getItem(PENDING_KEY),
        AsyncStorage.getItem(SUCCESS_UNTIL_KEY),
        AsyncStorage.getItem(LEGACY_SUCCESS_KEY)
      ]);
      if (!active) return;
      setPendingTransferStored(pendingRaw === 'true');
      let until = parseInt(successUntilRaw || '0', 10);
      if (!until && legacySuccess === 'true') {
        until = Date.now() + SUCCESS_BANNER_MS;
        AsyncStorage.setItem(SUCCESS_UNTIL_KEY, String(until));
        AsyncStorage.removeItem(LEGACY_SUCCESS_KEY);
      }
      if (until && until > Date.now()) {
        scheduleSuccessBanner(until);
      } else {
        setSuccessTransfer(false);
        if (successUntilRaw) AsyncStorage.removeItem(SUCCESS_UNTIL_KEY);
      }
    };
    loadSuccess();
    return () => {
      active = false;
      if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
    };
  }, [scheduleSuccessBanner]);

  const fetchData = useCallback(async (targetUserId = user?.user_id) => {
    if (!targetUserId) return;

    try {
      const [profileRes, subRes, ordersRes, carouselRes, paymentsRes, configRes] = await Promise.all([
        student.getProfile(targetUserId),
        student.getSubscription(targetUserId),
        student.getOrders(targetUserId),
        student.getCarousel().catch(() => ({ data: [] })),
        student.syncPull({ user_id: targetUserId, entity_type: 'payment' }).catch(() => ({ data: { items: [] } })),
        student.getConfig().catch((error) => ({ data: null, error }))
      ]);

      setUser(profileRes.data);
      AsyncStorage.setItem('userData', JSON.stringify(profileRes.data));
      setSubscription(subRes.data);
      setCarouselItems(Array.isArray(carouselRes.data) ? carouselRes.data : []);
      const incomingEmergency = configRes.data?.emergency || null;
      if (incomingEmergency) {
        const payload = {
          emergency: incomingEmergency,
          settings_version: configRes.data?.settings_version || incomingEmergency.version || 0,
          synced_at: new Date().toISOString()
        };
        setEmergencyConfig(incomingEmergency);
        AsyncStorage.setItem(EMERGENCY_CACHE_KEY, JSON.stringify(payload));
      } else {
        const cached = await AsyncStorage.getItem(EMERGENCY_CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          setEmergencyConfig(parsed?.emergency || null);
        } else {
          setEmergencyConfig(null);
        }
      }
      
      const orders = Array.isArray(ordersRes.data) ? ordersRes.data : [];
      const activeEmergency = orders.find(o =>
        ['pending', 'accepted', 'processing', 'picked_up', 'ready'].includes(o.status) && o.is_emergency
      );
      const activeRegular = orders.find(o =>
        ['pending', 'accepted', 'processing', 'picked_up', 'ready'].includes(o.status)
      );
      setEmergencyOrder(activeEmergency || null);
      setActiveOrder(activeRegular && !activeRegular.is_emergency ? activeRegular : null);
      const payments = paymentsRes.data?.items || [];
      const hasPendingTransfer = payments.some((payment) => (
        payment.gateway === 'bank_transfer' &&
        payment.payment_type === 'subscription' &&
        ['pending', 'awaiting_verification'].includes(payment.status)
      ));
      setPendingTransfer(hasPendingTransfer);
      if (hasPendingTransfer) {
        setPendingTransferStored(true);
        AsyncStorage.setItem(PENDING_KEY, 'true');
      } else {
        setPendingTransferStored(false);
        AsyncStorage.removeItem(PENDING_KEY);
      }
    } catch (error) {
      console.error('Fetch error:', error);
      // Optional: Show a toast or silent fail. 
      // Avoid blocking Alert on every background refresh.
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.user_id]);

  // Real-time Sync
  useEffect(() => {
    if (typeof lastEvent === 'undefined' || !lastEvent) return;
    if (lastEvent.type === 'settings_updated') {
      const payload = lastEvent.payload || {};
      if (payload.emergency) {
        persistEmergencyCache(payload.emergency, payload.version || payload.emergency?.version || 0);
      }
      return;
    }
    if (lastEvent.type === 'order_updated' || lastEvent.type === 'order_created' || lastEvent.type === 'poll_refresh' || lastEvent.type === 'user_updated') {
      console.log('HomeScreen: Sync event received, refreshing...');
      fetchData();
    }
    if (typeof lastEvent !== 'undefined' && lastEvent && lastEvent.type === 'payment_updated') {
      const payment = lastEvent.payload;
      if (payment.user_id === user?.user_id && payment.gateway === 'bank_transfer' && payment.payment_type === 'subscription') {
        const nextPending = ['pending', 'awaiting_verification'].includes(payment.status);
        setPendingTransfer(nextPending);
        if (payment.status === 'paid') {
          const successUntil = Date.now() + SUCCESS_BANNER_MS;
          AsyncStorage.setItem(SUCCESS_UNTIL_KEY, String(successUntil));
          AsyncStorage.removeItem(PENDING_KEY);
          AsyncStorage.removeItem(LEGACY_SUCCESS_KEY);
          setPendingTransferStored(false);
          scheduleSuccessBanner(successUntil);
        } else if (['rejected', 'declined'].includes(payment.status)) {
          AsyncStorage.removeItem(PENDING_KEY);
          AsyncStorage.removeItem(SUCCESS_UNTIL_KEY);
          AsyncStorage.removeItem(LEGACY_SUCCESS_KEY);
          setPendingTransferStored(false);
          setSuccessTransfer(false);
        } else if (nextPending) {
          AsyncStorage.setItem(PENDING_KEY, 'true');
          setPendingTransferStored(true);
        }
      }
    }
    if (typeof lastEvent !== 'undefined' && lastEvent && lastEvent.type === 'batch_sync') {
      const payments = lastEvent.payload?.payments || [];
      const hasPendingTransfer = payments.some((payment) => (
        payment.gateway === 'bank_transfer' &&
        payment.payment_type === 'subscription' &&
        ['pending', 'awaiting_verification'].includes(payment.status)
      ));
      setPendingTransfer(hasPendingTransfer);
      if (hasPendingTransfer) {
        AsyncStorage.setItem(PENDING_KEY, 'true');
        setPendingTransferStored(true);
      } else {
        AsyncStorage.removeItem(PENDING_KEY);
        setPendingTransferStored(false);
      }
    }
  }, [typeof lastEvent !== 'undefined' ? lastEvent : null, fetchData, persistEmergencyCache, scheduleSuccessBanner, user?.user_id]);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      const hydrateUser = async () => {
        const storedUser = await AsyncStorage.getItem('userData');
        const parsedUser = storedUser ? JSON.parse(storedUser) : null;
        if (parsedUser?.user_id && isActive) {
          setUser(parsedUser);
        }
      };
      hydrateUser();
      fetchData();
      const updateTransferState = async () => {
        if (route.params?.bank_transfer_success) {
          const successUntil = Date.now() + SUCCESS_BANNER_MS;
          await AsyncStorage.setItem(SUCCESS_UNTIL_KEY, String(successUntil));
          await AsyncStorage.removeItem(LEGACY_SUCCESS_KEY);
          if (isActive) scheduleSuccessBanner(successUntil);
        }
        const storedSuccessUntil = await AsyncStorage.getItem(SUCCESS_UNTIL_KEY);
        const parsedSuccessUntil = parseInt(storedSuccessUntil || '0', 10);
        if (!route.params?.bank_transfer_success && parsedSuccessUntil > Date.now()) {
          if (isActive) scheduleSuccessBanner(parsedSuccessUntil);
        }
        if (route.params?.pending_transfer) {
          await AsyncStorage.setItem(PENDING_KEY, 'true');
          if (isActive) setPendingTransferStored(true);
          return;
        }
        const pendingRaw = await AsyncStorage.getItem(PENDING_KEY);
        if (isActive) setPendingTransferStored(pendingRaw === 'true');
      };
      updateTransferState();
      return () => {
        isActive = false;
      };
    }, [fetchData, route.params?.bank_transfer_success, route.params?.pending_transfer, scheduleSuccessBanner, user?.user_id])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const safeNav = useCallback((name, params) => {
    if (navLock) return;
    setNavLock(true);
    navigation.navigate(name, params);
    setTimeout(() => setNavLock(false), 500);
  }, [navLock, navigation]);

  const handleBookPickup = () => {
    if (!subscription || subscription.status !== 'active') {
      if (subscription && subscription.status === 'pending') {
         Alert.alert('Payment Pending', 'Your subscription payment is awaiting admin confirmation. You cannot book pickups yet.', [
           { text: 'OK' }
         ]);
      } else {
         Alert.alert('No Active Plan', 'You need an active subscription to book a pickup.', [
           { text: 'View Plans', onPress: () => safeNav('Plan', { user }) },
           { text: 'Cancel', style: 'cancel' }
         ]);
      }
      return;
    }
    
    if (subscription.remaining_pickups <= 0) {
      Alert.alert('Quota Exceeded', 'You have used all your pickups for this plan.', [
        { text: 'Renew Plan', onPress: () => safeNav('Plan', { user }) },
        { text: 'Cancel', style: 'cancel' }
      ]);
      return;
    }

    if (activeOrder) {
       Alert.alert('Order In Progress', 'You already have an active order. Please wait until it is completed.', [
         { text: 'Track Order', onPress: () => safeNav('OrderDetails', { order: activeOrder }) },
         { text: 'OK' }
       ]);
       return;
    }

    safeNav('BookPickup', { user });
  };

  const openEmergencyModal = useCallback((message = '') => {
    setEmergencyForm({
      name: user?.full_name || '',
      phone_number: user?.phone_number || '',
      relationship: '',
      message: ''
    });
    setEmergencyErrors({});
    setEmergencyTouched({});
    setEmergencySubmitError(message);
    setEmergencyModalVisible(true);
  }, [user]);

  const closeEmergencyModal = useCallback(() => {
    setEmergencyModalVisible(false);
  }, []);

  const validateEmergencyForm = useCallback((form) => {
    const nextErrors = {};
    if (!form.name.trim()) nextErrors.name = 'Name is required';
    const phoneResult = normalizeNigerianPhone(form.phone_number);
    if (phoneResult.error) nextErrors.phone_number = phoneResult.error;
    if (!form.relationship.trim()) nextErrors.relationship = 'Relationship is required';
    if (!form.message.trim()) nextErrors.message = 'Message is required';
    return nextErrors;
  }, []);

  const persistEmergencyCache = useCallback(async (incomingEmergency, settingsVersion = 0) => {
    if (!incomingEmergency) return false;
    const backupKey = `${EMERGENCY_CACHE_KEY}_backup`;
    const payload = {
      emergency: incomingEmergency,
      settings_version: settingsVersion || incomingEmergency.version || 0,
      synced_at: new Date().toISOString()
    };
    const previous = await AsyncStorage.getItem(EMERGENCY_CACHE_KEY);
    if (previous) {
      await AsyncStorage.setItem(backupKey, previous);
    }
    try {
      await AsyncStorage.setItem(EMERGENCY_CACHE_KEY, JSON.stringify(payload));
      setEmergencyConfig(incomingEmergency);
      return true;
    } catch {
      if (previous) {
        await AsyncStorage.setItem(EMERGENCY_CACHE_KEY, previous);
        try {
          const parsed = JSON.parse(previous);
          setEmergencyConfig(parsed?.emergency || null);
        } catch {}
      }
      return false;
    }
  }, []);

  const handleEmergencySubmit = useCallback(async () => {
    const nextErrors = validateEmergencyForm(emergencyForm);
    if (Object.keys(nextErrors).length > 0) {
      setEmergencyErrors(nextErrors);
      setEmergencyTouched({ name: true, phone_number: true, relationship: true, message: true });
      return;
    }
    setEmergencySubmitting(true);
    setEmergencySubmitError('');
    try {
      const normalizedPhone = normalizeNigerianPhone(emergencyForm.phone_number);
      await student.submitEmergencyContact({
        user_id: user?.user_id,
        name: emergencyForm.name.trim(),
        phone_number: normalizedPhone.normalized || emergencyForm.phone_number.trim(),
        relationship: emergencyForm.relationship.trim(),
        message: emergencyForm.message.trim()
      });
      setEmergencySubmitting(false);
      setEmergencyModalVisible(false);
      Alert.alert('Submitted', 'Your emergency contact has been sent.');
    } catch (error) {
      const normalized = error?.normalized || normalizeApiError(error);
      setEmergencySubmitError(normalized?.message || 'Failed to submit emergency contact.');
      setEmergencySubmitting(false);
    }
  }, [emergencyForm, normalizeApiError, user?.user_id, validateEmergencyForm]);

  const handleEmergencyLaundry = () => {
    const showNotice = (message) => {
      if (Platform.OS === 'web') {
        window.alert(message);
        return;
      }
      Alert.alert('Emergency Laundry', message, [{ text: 'OK' }]);
    };
    if (!emergencyConfig) {
      safeNav('BookPickup', { user, mode: 'emergency' });
      return;
    }
    if (!emergencyConfig?.enabled) {
      showNotice('Emergency laundry is not available right now.');
      return;
    }
    if (emergencyConfig?.available === false) {
      showNotice('Emergency laundry is temporarily unavailable. Please try again later.');
      return;
    }
    safeNav('BookPickup', { user, mode: 'emergency', emergencyConfig });
  };

  const handleTrackOrder = () => {
    if (!primaryActiveOrder) {
      Alert.alert('No Active Order', 'You don\'t have any order in progress.', [
        { text: 'Book Pickup', onPress: handleBookPickup },
        { text: 'OK' }
      ]);
      return;
    }
    safeNav('OrderDetails', { order: primaryActiveOrder });
  };

  const openWhatsApp = () => {
    const PHONE_NUMBER = '+2348155529957'; 
    const sanitizedPhone = PHONE_NUMBER.replace(/[^0-9]/g, '');
    const message = 'Hello, I need help with my laundry service.';
    const url = `https://wa.me/${sanitizedPhone}?text=${encodeURIComponent(message)}`;
    Linking.openURL(url).catch(() => {
      Alert.alert('Error', 'Could not open WhatsApp');
    });
  };

  const handleChat = () => {
    if (primaryActiveOrder) {
      safeNav('Chat', { orderId: primaryActiveOrder.order_id });
    } else {
      Alert.alert(
        'Chat Support', 
        'Please select an order to chat about.',
        [
          { text: 'Go to Orders', onPress: () => safeNav('Orders') },
          { text: 'Cancel', style: 'cancel' }
        ]
      );
    }
  };

  const background = (
    <View style={[styles.backgroundIllustrationWrap, { height: illustrationHeight }]} pointerEvents="none">
      <Image source={homescreenIllustration} style={[styles.backgroundIllustration, { width: screenWidth, height: illustrationHeight }]} resizeMode="contain" />
      <View style={styles.backgroundOverlay} />
    </View>
  );

  return (
    <PageLayout 
      user={user} 
      loading={loading}
      refreshing={refreshing} 
      onRefresh={onRefresh}
      background={background}
    >
        {successTransfer && (
          <View style={styles.successBanner}>
            <Ionicons name="checkmark-circle-outline" size={18} color="#065F46" />
            <Text style={styles.successBannerText}>
              Your bank transfer is successful.
            </Text>
          </View>
        )}
        {(pendingTransfer || pendingTransferStored) && (
          <View style={styles.pendingBanner}>
            <Ionicons name="time-outline" size={18} color="#92400E" />
            <Text style={styles.pendingBannerText}>
              Your bank transfer payment is pending confirmation. You will be notified once the payment is confirmed.
            </Text>
          </View>
        )}

        {/* 1.5 CAROUSEL */}
        {carouselItems.length > 0 && (
          <View style={styles.section}>
            <Carousel data={carouselItems} />
          </View>
        )}

        {/* 2. ACTIVE PLAN CARD */}
        <View style={styles.section}>
          {subscription ? (
            <View style={[styles.card, styles.planCard, subscription.status === 'pending' && { backgroundColor: '#F59E0B' }]}>
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.planTitle}>{subscription.Plan?.name || 'Standard Plan'}</Text>
                  {subscription.status === 'pending' ? (
                      <Text style={styles.pendingText}>
                        Payment Pending – Awaiting Admin Confirmation
                      </Text>
                  ) : (
                      <Text style={styles.planExpiry}>{getDaysRemaining(subscription.end_date)}</Text>
                  )}
                </View>
                <View style={[styles.planBadge, subscription.status === 'pending' && { backgroundColor: 'rgba(0,0,0,0.2)' }]}>
                  <Text style={styles.planBadgeText}>{subscription.status.toUpperCase()}</Text>
                </View>
              </View>
              
              <View style={styles.usageContainer}>
                <View style={styles.usageRow}>
                  <Text style={styles.usageLabel}>Pickups Used</Text>
                  <Text style={styles.usageValue}>
                    {subscription.Plan?.max_pickups - subscription.remaining_pickups} / {subscription.Plan?.max_pickups}
                  </Text>
                </View>
                <View style={styles.progressBar}>
                  <View 
                    style={[
                      styles.progressFill, 
                      { width: `${((subscription.Plan?.max_pickups - subscription.remaining_pickups) / subscription.Plan?.max_pickups) * 100}%` }
                    ]} 
                  />
                </View>

                <View style={[styles.usageRow, { marginTop: 12 }]}>
                  <Text style={styles.usageLabel}>Clothes Used</Text>
                  <Text style={styles.usageValue}>
                    {subscription.used_clothes || 0} / {subscription.Plan?.clothes_limit || '∞'}
                  </Text>
                </View>
                <View style={styles.progressBar}>
                  <View 
                    style={[
                      styles.progressFill, 
                      { width: `${Math.min(((subscription.used_clothes || 0) / (subscription.Plan?.clothes_limit || 1)) * 100, 100)}%` }
                    ]} 
                  />
                </View>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={[styles.card, styles.planCard, styles.emptyPlanCard]} onPress={() => safeNav('Plan', { user })}>
              <View>
                <Text style={styles.planTitle}>No Active Plan</Text>
                <Text style={styles.planExpiry}>Subscribe to start booking pickups</Text>
              </View>
              <Ionicons name="chevron-forward-circle" size={32} color={THEME.white} />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.section}>
          <TouchableOpacity
            style={[
              styles.emergencyButton,
              (!emergencyConfig?.enabled || emergencyConfig?.available === false) && styles.emergencyButtonDisabled
            ]}
            onPress={handleEmergencyLaundry}
            activeOpacity={0.9}
            accessibilityRole="button"
            accessibilityLabel="Emergency laundry"
            accessibilityHint="Open emergency laundry form"
          >
            <View style={styles.emergencyRow}>
              <View style={styles.emergencyIconWrap}>
                <Ionicons name="flash" size={22} color={THEME.white} />
              </View>
              <View style={styles.emergencyTextWrap}>
                <Text style={styles.emergencyTitle}>Emergency Laundry</Text>
                <Text style={styles.emergencySubText}>
                  {emergencyConfig?.delivery_window_text || 'Delivered within 2–8 hours (same day)'}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>

        {/* 3. QUICK ACTIONS */}
          <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionsGrid}>
            <TouchableOpacity style={[styles.actionBtn, styles.actionBtnPrimary]} onPress={handleBookPickup} activeOpacity={0.9}>
              <View style={styles.actionIconWrapLight}>
                <Ionicons name="add-circle" size={22} color={THEME.white} />
              </View>
              <Text style={styles.actionBtnTextLight}>Book Pickup</Text>
              <Text style={styles.actionHintLight}>Schedule a laundry pickup</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.actionBtn, styles.actionBtnSecondary]} onPress={handleTrackOrder} activeOpacity={0.9}>
              <View style={styles.actionIconWrap}>
                <Ionicons name="time" size={22} color={THEME.primary} />
              </View>
              <Text style={styles.actionBtnText}>Track Order</Text>
              <Text style={styles.actionHint}>View order status</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 4. CURRENT ORDER CARD */}
        {primaryActiveOrder && (
          <View style={styles.section}>
            <View style={styles.rowBetween}>
              <Text style={styles.sectionTitle}>Current Order</Text>
              <TouchableOpacity onPress={() => safeNav('Orders', { user })}>
                <Text style={styles.seeAll}>See All</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={[styles.card, styles.cardElevated]} onPress={() => safeNav('OrderDetails', { order: primaryActiveOrder })} activeOpacity={0.9}>
              <View style={styles.cardHeader}>
                <Text style={styles.orderId}>Order #{primaryActiveOrder.order_id}</Text>
                <View style={styles.rowGap}>
                  {primaryActiveOrder.is_emergency && (
                    <View style={styles.emergencyBadge}>
                      <Text style={styles.emergencyBadgeText}>EMERGENCY</Text>
                    </View>
                  )}
                  <StatusBadge status={primaryActiveOrder.status} />
                </View>
              </View>
              <View style={styles.divider} />
              <View style={styles.orderDetailRow}>
                <Ionicons name="calendar-outline" size={16} color={THEME.textLight} />
                <Text style={styles.orderDetailText}>Pickup: {new Date(primaryActiveOrder.pickup_date).toDateString()}</Text>
              </View>
              <View style={styles.orderDetailRow}>
                <Ionicons name="shirt-outline" size={16} color={THEME.textLight} />
                <Text style={styles.orderDetailText}>{primaryActiveOrder.clothes_count} Items</Text>
              </View>
              <View style={styles.cardFooter}>
                <Text style={styles.viewDetails}>View Details</Text>
                <Ionicons name="arrow-forward" size={16} color={THEME.primary} />
              </View>
            </TouchableOpacity>
          </View>
        )}
        
        {!primaryActiveOrder && !subscription && (
           <View style={styles.emptyStateCard}>
             <View style={styles.emptyIcon}>
               <Ionicons name="basket-outline" size={28} color={THEME.primary} />
             </View>
             <View style={styles.emptyTextWrap}>
               <Text style={styles.emptyStateText}>Ready to do laundry?</Text>
               <Text style={styles.emptyStateSubText}>Choose a plan to start booking pickups.</Text>
             </View>
             <TouchableOpacity onPress={() => safeNav('Plan', { user })} style={styles.emptyAction} activeOpacity={0.9}>
               <Text style={styles.emptyStateLink}>Browse Plans</Text>
               <Ionicons name="arrow-forward" size={16} color={THEME.primary} />
             </TouchableOpacity>
           </View>
        )}
        
        {/* Extra spacing for FAB */}
        <View style={{ height: 80 }} />

      {/* 6. WHATSAPP FAB */}
      <TouchableOpacity style={styles.fab} onPress={openWhatsApp}>
        <Ionicons name="logo-whatsapp" size={28} color="white" />
      </TouchableOpacity>

      {/* 7. IN-APP CHAT FAB */}
      <TouchableOpacity style={styles.chatFab} onPress={handleChat}>
        <Ionicons name="chatbubbles" size={28} color="white" />
      </TouchableOpacity>

      <Modal
        transparent
        visible={emergencyModalVisible}
        animationType="fade"
        onRequestClose={closeEmergencyModal}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={closeEmergencyModal}
            accessibilityRole="button"
            accessibilityLabel="Close emergency contact form"
            accessibilityHint="Dismiss the emergency contact form"
          />
          <Pressable
            style={[styles.modalCard, { width: emergencyModalWidth }]}
            onPress={() => {}}
            accessibilityRole="dialog"
            accessibilityViewIsModal
            onKeyDown={(event) => {
              if (event.nativeEvent?.key === 'Escape') closeEmergencyModal();
            }}
          >
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={styles.modalKeyboard}
            >
              <View style={styles.modalHeaderRow}>
                <Text style={styles.modalTitle}>Emergency Contact</Text>
                <TouchableOpacity onPress={closeEmergencyModal} accessibilityRole="button" accessibilityLabel="Close emergency contact form">
                  <Ionicons name="close" size={22} color={THEME.text} />
                </TouchableOpacity>
              </View>
              <Text style={styles.modalSubtitle}>Share who we should contact and how to reach them.</Text>
              <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Name</Text>
                  <TextInput
                    ref={emergencyNameRef}
                    style={[styles.input, emergencyErrors.name && emergencyTouched.name && styles.inputError]}
                    value={emergencyForm.name}
                    onChangeText={(value) => setEmergencyForm((prev) => ({ ...prev, name: value }))}
                    onBlur={() => setEmergencyTouched((prev) => ({ ...prev, name: true }))}
                    placeholder="Full name"
                    placeholderTextColor={theme.colors.textPlaceholder}
                    accessibilityLabel="Emergency contact name"
                    accessibilityHint="Required"
                  />
                  {emergencyErrors.name && emergencyTouched.name ? (
                    <Text style={styles.errorText} accessibilityLiveRegion="polite">{emergencyErrors.name}</Text>
                  ) : null}
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Phone Number</Text>
                  <TextInput
                    style={[styles.input, emergencyErrors.phone_number && emergencyTouched.phone_number && styles.inputError]}
                    value={emergencyForm.phone_number}
                    onChangeText={(value) => setEmergencyForm((prev) => ({ ...prev, phone_number: value }))}
                    onBlur={() => setEmergencyTouched((prev) => ({ ...prev, phone_number: true }))}
                    placeholder="e.g. 08012345678"
                    placeholderTextColor={theme.colors.textPlaceholder}
                    keyboardType="phone-pad"
                    accessibilityLabel="Emergency contact phone number"
                    accessibilityHint="Required"
                  />
                  {emergencyErrors.phone_number && emergencyTouched.phone_number ? (
                    <Text style={styles.errorText} accessibilityLiveRegion="polite">{emergencyErrors.phone_number}</Text>
                  ) : null}
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Relationship</Text>
                  <TextInput
                    style={[styles.input, emergencyErrors.relationship && emergencyTouched.relationship && styles.inputError]}
                    value={emergencyForm.relationship}
                    onChangeText={(value) => setEmergencyForm((prev) => ({ ...prev, relationship: value }))}
                    onBlur={() => setEmergencyTouched((prev) => ({ ...prev, relationship: true }))}
                    placeholder="e.g. Parent, Guardian"
                    placeholderTextColor={theme.colors.textPlaceholder}
                    accessibilityLabel="Emergency contact relationship"
                    accessibilityHint="Required"
                  />
                  {emergencyErrors.relationship && emergencyTouched.relationship ? (
                    <Text style={styles.errorText} accessibilityLiveRegion="polite">{emergencyErrors.relationship}</Text>
                  ) : null}
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Message</Text>
                  <TextInput
                    style={[styles.input, styles.textArea, emergencyErrors.message && emergencyTouched.message && styles.inputError]}
                    value={emergencyForm.message}
                    onChangeText={(value) => setEmergencyForm((prev) => ({ ...prev, message: value }))}
                    onBlur={() => setEmergencyTouched((prev) => ({ ...prev, message: true }))}
                    placeholder="Let us know what's urgent"
                    placeholderTextColor={theme.colors.textPlaceholder}
                    multiline
                    numberOfLines={4}
                    accessibilityLabel="Emergency message"
                    accessibilityHint="Required"
                  />
                  {emergencyErrors.message && emergencyTouched.message ? (
                    <Text style={styles.errorText} accessibilityLiveRegion="polite">{emergencyErrors.message}</Text>
                  ) : null}
                </View>
                {emergencySubmitError ? (
                  <Text style={styles.submitError} accessibilityLiveRegion="polite">{emergencySubmitError}</Text>
                ) : null}
                <TouchableOpacity
                  style={[styles.submitBtn, emergencySubmitting && styles.submitBtnDisabled]}
                  onPress={handleEmergencySubmit}
                  disabled={emergencySubmitting}
                  accessibilityRole="button"
                  accessibilityLabel="Submit emergency contact form"
                  >
                  {emergencySubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Submit</Text>}
                </TouchableOpacity>
              </ScrollView>
            </KeyboardAvoidingView>
          </Pressable>
        </View>
      </Modal>
    </PageLayout>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.bg },
  backgroundIllustrationWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'flex-end', zIndex: 0 },
  backgroundIllustration: { opacity: 0.16 },
  backgroundOverlay: { position: 'absolute', left: 0, right: 0, bottom: 0, top: 0, backgroundColor: 'rgba(244,247,255,0.7)' },
  chatFab: {
    position: 'absolute',
    bottom: 96,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: THEME.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    zIndex: 999,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#25D366', // WhatsApp Green
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    zIndex: 999,
  },
  successBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ECFDF3', borderRadius: 14, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#BBF7D0' },
  successBannerText: { flex: 1, marginLeft: 8, color: '#065F46', fontWeight: '600', fontSize: 13 },
  pendingBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFBEB', borderRadius: 14, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: '#FDE68A' },
  pendingBannerText: { flex: 1, marginLeft: 8, color: '#92400E', fontWeight: '600', fontSize: 13 },
  
  // Section
  section: { marginBottom: 22 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: THEME.text, marginBottom: 10 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  rowGap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  seeAll: { color: THEME.primary, fontSize: 13, fontWeight: '700' },

  // Cards
  card: { backgroundColor: THEME.white, borderRadius: 18, padding: 18, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.06, shadowRadius: 18, elevation: 4, borderWidth: 1, borderColor: 'rgba(15,23,42,0.04)' },
  cardElevated: { shadowOpacity: 0.1, shadowRadius: 22, elevation: 6 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  divider: { height: 1, backgroundColor: 'rgba(15,23,42,0.08)', marginVertical: 12 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 12 },
  
  // Plan Card
  planCard: { backgroundColor: THEME.primary, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  emptyPlanCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  planTitle: { fontSize: 19, fontWeight: '700', color: THEME.white },
  planExpiry: { fontSize: 12, color: '#E0F2FE', marginTop: 4 },
  planBadge: { backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  planBadgeText: { color: THEME.white, fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  usageContainer: { marginTop: 16 },
  usageRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  usageLabel: { color: '#E0F2FE', fontSize: 12, fontWeight: '600' },
  usageValue: { color: THEME.white, fontWeight: '700', fontSize: 12 },
  progressBar: { height: 7, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 6, overflow: 'hidden' },
  progressFill: { height: 7, backgroundColor: THEME.white, borderRadius: 6 },
  remainingText: { color: '#E0F2FE', fontSize: 11, marginTop: 8, textAlign: 'right' },
  pendingText: { color: '#FFF', fontWeight: '700', marginTop: 4, fontSize: 12 },

  // Quick Actions
  actionsGrid: { flexDirection: 'row', gap: 12 },
  actionBtn: { flex: 1, padding: 16, borderRadius: 18, alignItems: 'flex-start', justifyContent: 'center', minHeight: 110 },
  actionBtnPrimary: { backgroundColor: THEME.secondary },
  actionBtnSecondary: { backgroundColor: THEME.white, borderWidth: 1, borderColor: 'rgba(15,23,42,0.08)' },
  actionIconWrap: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.04)', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  actionIconWrapLight: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  actionBtnText: { fontWeight: '700', color: THEME.text, fontSize: 14 },
  actionBtnTextLight: { fontWeight: '700', color: THEME.white, fontSize: 14 },
  actionHint: { marginTop: 6, color: THEME.textLight, fontSize: 12 },
  actionHintLight: { marginTop: 6, color: 'rgba(255,255,255,0.82)', fontSize: 12 },

  emergencyButton: { backgroundColor: '#DC2626', borderRadius: 18, padding: 16 },
  emergencyButtonDisabled: { opacity: 0.65 },
  emergencyRow: { flexDirection: 'row', alignItems: 'center' },
  emergencyIconWrap: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  emergencyTextWrap: { flex: 1 },
  emergencyTitle: { color: THEME.white, fontWeight: '800', fontSize: 15 },
  emergencySubText: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 4 },
  emergencyBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: '#FEE2E2' },
  emergencyBadgeText: { color: '#B91C1C', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  modalCard: { backgroundColor: THEME.white, borderRadius: 20, padding: 18, maxHeight: '90%', borderWidth: 1, borderColor: 'rgba(15,23,42,0.08)' },
  modalKeyboard: { flex: 1 },
  modalHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: THEME.text },
  modalSubtitle: { marginTop: 6, marginBottom: 14, color: THEME.textLight, fontSize: 13 },
  modalContent: { paddingBottom: 8 },
  inputGroup: { marginBottom: 12 },
  inputLabel: { fontSize: 12, fontWeight: '700', color: THEME.text, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: 'rgba(15,23,42,0.12)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: THEME.text, backgroundColor: '#fff' },
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  inputError: { borderColor: '#DC2626' },
  errorText: { marginTop: 6, color: '#DC2626', fontSize: 12, fontWeight: '600' },
  submitError: { marginBottom: 10, color: '#B91C1C', fontSize: 12, fontWeight: '600' },
  submitBtn: { backgroundColor: THEME.primary, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  submitBtnDisabled: { opacity: 0.7 },
  submitBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // Order Card
  orderId: { fontSize: 16, fontWeight: '700', color: THEME.text },
  orderDetailRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 8 },
  orderDetailText: { color: THEME.textLight, fontSize: 14 },
  viewDetails: { color: THEME.primary, fontWeight: '600', fontSize: 14, marginRight: 4 },
  
  // Badges
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { fontSize: 11, fontWeight: 'bold' },
  
  // Empty State
  emptyStateCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 18, backgroundColor: THEME.white, borderWidth: 1, borderColor: 'rgba(15,23,42,0.06)', shadowColor: '#0F172A', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.06, shadowRadius: 18, elevation: 4 },
  emptyIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(59,130,246,0.12)', alignItems: 'center', justifyContent: 'center' },
  emptyTextWrap: { flex: 1 },
  emptyStateText: { color: THEME.text, fontWeight: '700', fontSize: 14, marginBottom: 4 },
  emptyStateSubText: { color: THEME.textLight, fontSize: 12 },
  emptyAction: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  emptyStateLink: { color: THEME.primary, fontWeight: '700', fontSize: 13 },
});        {successTransfer && (
          <View style={styles.successBanner}>
            <Ionicons name="checkmark-circle-outline" size={18} color="#065F46" />
            <Text style={styles.successBannerText}>
              Your bank transfer is successful.
            </Text>
          </View>
        )}
        {(pendingTransfer || pendingTransferStored) && (
          <View style={styles.pendingBanner}>
            <Ionicons name="time-outline" size={18} color="#92400E" />
            <Text style={styles.pendingBannerText}>
              Your bank transfer payment is pending confirmation. You will be notified once the payment is confirmed.
            </Text>
          </View>
        )}

        {/* 1.5 CAROUSEL */}
        {carouselItems.length > 0 && (
          <View style={styles.section}>
            <Carousel data={carouselItems} />
          </View>
        )}

        {/* 2. ACTIVE PLAN CARD */}
        <View style={styles.section}>
          {subscription ? (
            <View style={[styles.card, styles.planCard, subscription.status === 'pending' && { backgroundColor: '#F59E0B' }]}>
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.planTitle}>{subscription.Plan?.name || 'Standard Plan'}</Text>
                  {subscription.status === 'pending' ? (
                      <Text style={styles.pendingText}>
                        Payment Pending – Awaiting Admin Confirmation
                      </Text>
                  ) : (
                      <Text style={styles.planExpiry}>{getDaysRemaining(subscription.end_date)}</Text>
                  )}
                </View>
                <View style={[styles.planBadge, subscription.status === 'pending' && { backgroundColor: 'rgba(0,0,0,0.2)' }]}>
                  <Text style={styles.planBadgeText}>{subscription.status.toUpperCase()}</Text>
                </View>
              </View>
              
              <View style={styles.usageContainer}>
                <View style={styles.usageRow}>
                  <Text style={styles.usageLabel}>Pickups Used</Text>
                  <Text style={styles.usageValue}>
                    {subscription.Plan?.max_pickups - subscription.remaining_pickups} / {subscription.Plan?.max_pickups}
                  </Text>
                </View>
                <View style={styles.progressBar}>
                  <View 
                    style={[
                      styles.progressFill, 
                      { width: `${((subscription.Plan?.max_pickups - subscription.remaining_pickups) / subscription.Plan?.max_pickups) * 100}%` }
                    ]} 
                  />
                </View>

                <View style={[styles.usageRow, { marginTop: 12 }]}>
                  <Text style={styles.usageLabel}>Clothes Used</Text>
                  <Text style={styles.usageValue}>
                    {subscription.used_clothes || 0} / {subscription.Plan?.clothes_limit || '∞'}
                  </Text>
                </View>
                <View style={styles.progressBar}>
                  <View 
                    style={[
                      styles.progressFill, 
                      { width: `${Math.min(((subscription.used_clothes || 0) / (subscription.Plan?.clothes_limit || 1)) * 100, 100)}%` }
                    ]} 
                  />
                </View>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={[styles.card, styles.planCard, styles.emptyPlanCard]} onPress={() => safeNav('Plan', { user })}>
              <View>
                <Text style={styles.planTitle}>No Active Plan</Text>
                <Text style={styles.planExpiry}>Subscribe to start booking pickups</Text>
              </View>
              <Ionicons name="chevron-forward-circle" size={32} color={THEME.white} />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.section}>
          <TouchableOpacity
            style={[
              styles.emergencyButton,
              (!emergencyConfig?.enabled || emergencyConfig?.available === false) && styles.emergencyButtonDisabled
            ]}
            onPress={handleEmergencyLaundry}
            activeOpacity={0.9}
            accessibilityRole="button"
            accessibilityLabel="Emergency laundry"
            accessibilityHint="Open emergency laundry form"
          >
            <View style={styles.emergencyRow}>
              <View style={styles.emergencyIconWrap}>
                <Ionicons name="flash" size={22} color={THEME.white} />
              </View>
              <View style={styles.emergencyTextWrap}>
                <Text style={styles.emergencyTitle}>Emergency Laundry</Text>
                <Text style={styles.emergencySubText}>
                  {emergencyConfig?.delivery_window_text || 'Delivered within 2–8 hours (same day)'}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>

        {/* 3. QUICK ACTIONS */}
          <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionsGrid}>
            <TouchableOpacity style={[styles.actionBtn, styles.actionBtnPrimary]} onPress={handleBookPickup} activeOpacity={0.9}>
              <View style={styles.actionIconWrapLight}>
                <Ionicons name="add-circle" size={22} color={THEME.white} />
              </View>
              <Text style={styles.actionBtnTextLight}>Book Pickup</Text>
              <Text style={styles.actionHintLight}>Schedule a laundry pickup</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.actionBtn, styles.actionBtnSecondary]} onPress={handleTrackOrder} activeOpacity={0.9}>
              <View style={styles.actionIconWrap}>
                <Ionicons name="time" size={22} color={THEME.primary} />
              </View>
              <Text style={styles.actionBtnText}>Track Order</Text>
              <Text style={styles.actionHint}>View order status</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 4. CURRENT ORDER CARD */}
        {primaryActiveOrder && (
          <View style={styles.section}>
            <View style={styles.rowBetween}>
              <Text style={styles.sectionTitle}>Current Order</Text>
              <TouchableOpacity onPress={() => safeNav('Orders', { user })}>
                <Text style={styles.seeAll}>See All</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={[styles.card, styles.cardElevated]} onPress={() => safeNav('OrderDetails', { order: primaryActiveOrder })} activeOpacity={0.9}>
              <View style={styles.cardHeader}>
                <Text style={styles.orderId}>Order #{primaryActiveOrder.order_id}</Text>
                <View style={styles.rowGap}>
                  {primaryActiveOrder.is_emergency && (
                    <View style={styles.emergencyBadge}>
                      <Text style={styles.emergencyBadgeText}>EMERGENCY</Text>
                    </View>
                  )}
                  <StatusBadge status={primaryActiveOrder.status} />
                </View>
              </View>
              <View style={styles.divider} />
              <View style={styles.orderDetailRow}>
                <Ionicons name="calendar-outline" size={16} color={THEME.textLight} />
                <Text style={styles.orderDetailText}>Pickup: {new Date(primaryActiveOrder.pickup_date).toDateString()}</Text>
              </View>
              <View style={styles.orderDetailRow}>
                <Ionicons name="shirt-outline" size={16} color={THEME.textLight} />
                <Text style={styles.orderDetailText}>{primaryActiveOrder.clothes_count} Items</Text>
              </View>
              <View style={styles.cardFooter}>
                <Text style={styles.viewDetails}>View Details</Text>
                <Ionicons name="arrow-forward" size={16} color={THEME.primary} />
              </View>
            </TouchableOpacity>
          </View>
        )}
        
        {!primaryActiveOrder && !subscription && (
           <View style={styles.emptyStateCard}>
             <View style={styles.emptyIcon}>
               <Ionicons name="basket-outline" size={28} color={THEME.primary} />
             </View>
             <View style={styles.emptyTextWrap}>
               <Text style={styles.emptyStateText}>Ready to do laundry?</Text>
               <Text style={styles.emptyStateSubText}>Choose a plan to start booking pickups.</Text>
             </View>
             <TouchableOpacity onPress={() => safeNav('Plan', { user })} style={styles.emptyAction} activeOpacity={0.9}>
               <Text style={styles.emptyStateLink}>Browse Plans</Text>
               <Ionicons name="arrow-forward" size={16} color={THEME.primary} />
             </TouchableOpacity>
           </View>
        )}
        
        {/* Extra spacing for FAB */}
        <View style={{ height: 80 }} />
      </ScrollView>

      {/* 6. WHATSAPP FAB */}
      <TouchableOpacity style={styles.fab} onPress={openWhatsApp}>
        <Ionicons name="logo-whatsapp" size={28} color="white" />
      </TouchableOpacity>

      {/* 7. IN-APP CHAT FAB */}
      <TouchableOpacity style={styles.chatFab} onPress={handleChat}>
        <Ionicons name="chatbubbles" size={28} color="white" />
      </TouchableOpacity>

      <Modal
        transparent
        visible={emergencyModalVisible}
        animationType="fade"
        onRequestClose={closeEmergencyModal}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={closeEmergencyModal}
            accessibilityRole="button"
            accessibilityLabel="Close emergency contact form"
            accessibilityHint="Dismiss the emergency contact form"
          />
          <Pressable
            style={[styles.modalCard, { width: emergencyModalWidth }]}
            onPress={() => {}}
            accessibilityRole="dialog"
            accessibilityViewIsModal
            onKeyDown={(event) => {
              if (event.nativeEvent?.key === 'Escape') closeEmergencyModal();
            }}
          >
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={styles.modalKeyboard}
            >
              <View style={styles.modalHeaderRow}>
                <Text style={styles.modalTitle}>Emergency Contact</Text>
                <TouchableOpacity onPress={closeEmergencyModal} accessibilityRole="button" accessibilityLabel="Close emergency contact form">
                  <Ionicons name="close" size={22} color={THEME.text} />
                </TouchableOpacity>
              </View>
              <Text style={styles.modalSubtitle}>Share who we should contact and how to reach them.</Text>
              <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Name</Text>
                  <TextInput
                    ref={emergencyNameRef}
                    style={[styles.input, emergencyErrors.name && emergencyTouched.name && styles.inputError]}
                    value={emergencyForm.name}
                    onChangeText={(value) => setEmergencyForm((prev) => ({ ...prev, name: value }))}
                    onBlur={() => setEmergencyTouched((prev) => ({ ...prev, name: true }))}
                    placeholder="Full name"
                    placeholderTextColor={theme.colors.textPlaceholder}
                    accessibilityLabel="Emergency contact name"
                    accessibilityHint="Required"
                  />
                  {emergencyErrors.name && emergencyTouched.name ? (
                    <Text style={styles.errorText} accessibilityLiveRegion="polite">{emergencyErrors.name}</Text>
                  ) : null}
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Phone Number</Text>
                  <TextInput
                    style={[styles.input, emergencyErrors.phone_number && emergencyTouched.phone_number && styles.inputError]}
                    value={emergencyForm.phone_number}
                    onChangeText={(value) => setEmergencyForm((prev) => ({ ...prev, phone_number: value }))}
                    onBlur={() => setEmergencyTouched((prev) => ({ ...prev, phone_number: true }))}
                    placeholder="e.g. 08012345678"
                    placeholderTextColor={theme.colors.textPlaceholder}
                    keyboardType="phone-pad"
                    accessibilityLabel="Emergency contact phone number"
                    accessibilityHint="Required"
                  />
                  {emergencyErrors.phone_number && emergencyTouched.phone_number ? (
                    <Text style={styles.errorText} accessibilityLiveRegion="polite">{emergencyErrors.phone_number}</Text>
                  ) : null}
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Relationship</Text>
                  <TextInput
                    style={[styles.input, emergencyErrors.relationship && emergencyTouched.relationship && styles.inputError]}
                    value={emergencyForm.relationship}
                    onChangeText={(value) => setEmergencyForm((prev) => ({ ...prev, relationship: value }))}
                    onBlur={() => setEmergencyTouched((prev) => ({ ...prev, relationship: true }))}
                    placeholder="e.g. Parent, Guardian"
                    placeholderTextColor={theme.colors.textPlaceholder}
                    accessibilityLabel="Emergency contact relationship"
                    accessibilityHint="Required"
                  />
                  {emergencyErrors.relationship && emergencyTouched.relationship ? (
                    <Text style={styles.errorText} accessibilityLiveRegion="polite">{emergencyErrors.relationship}</Text>
                  ) : null}
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Message</Text>
                  <TextInput
                    style={[styles.input, styles.textArea, emergencyErrors.message && emergencyTouched.message && styles.inputError]}
                    value={emergencyForm.message}
                    onChangeText={(value) => setEmergencyForm((prev) => ({ ...prev, message: value }))}
                    onBlur={() => setEmergencyTouched((prev) => ({ ...prev, message: true }))}
                    placeholder="Let us know what's urgent"
                    placeholderTextColor={theme.colors.textPlaceholder}
                    multiline
                    numberOfLines={4}
                    accessibilityLabel="Emergency message"
                    accessibilityHint="Required"
                  />
                  {emergencyErrors.message && emergencyTouched.message ? (
                    <Text style={styles.errorText} accessibilityLiveRegion="polite">{emergencyErrors.message}</Text>
                  ) : null}
                </View>
                {emergencySubmitError ? (
                  <Text style={styles.submitError} accessibilityLiveRegion="polite">{emergencySubmitError}</Text>
                ) : null}
                <TouchableOpacity
                  style={[styles.submitBtn, emergencySubmitting && styles.submitBtnDisabled]}
                  onPress={handleEmergencySubmit}
                  disabled={emergencySubmitting}
                  accessibilityRole="button"
                  accessibilityLabel="Submit emergency contact form"
                >
                  {emergencySubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Submit</Text>}
                </TouchableOpacity>
              </ScrollView>
            </KeyboardAvoidingView>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.bg },
  center: { justifyContent: 'center', alignItems: 'center' },
  scrollContent: { paddingHorizontal: 20, paddingTop: 16, width: '100%', maxWidth: 760, alignSelf: 'center' },
  backgroundIllustrationWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'flex-end', zIndex: 0 },
  backgroundIllustration: { opacity: 0.16 },
  backgroundOverlay: { position: 'absolute', left: 0, right: 0, bottom: 0, top: 0, backgroundColor: 'rgba(244,247,255,0.7)' },
  chatFab: {
    position: 'absolute',
    bottom: 96,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: THEME.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    zIndex: 999,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#25D366', // WhatsApp Green
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    zIndex: 999,
  },
  
  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, marginTop: 8 },
  headerInfo: { flex: 1 },
  greetingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  successBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ECFDF3', borderRadius: 14, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#BBF7D0' },
  successBannerText: { flex: 1, marginLeft: 8, color: '#065F46', fontWeight: '600', fontSize: 13 },
  pendingBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFBEB', borderRadius: 14, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: '#FDE68A' },
  pendingBannerText: { flex: 1, marginLeft: 8, color: '#92400E', fontWeight: '600', fontSize: 13 },
  greeting: { fontSize: 13, color: THEME.textLight, fontWeight: '600', letterSpacing: 0.2 },
  userName: { fontSize: 26, color: THEME.text, fontWeight: '800', marginBottom: 2 },
  institution: { fontSize: 13, color: THEME.primary, fontWeight: '600' },
  profileBtn: { padding: 4 },
  profileBadge: { width: 44, height: 44, borderRadius: 22, backgroundColor: THEME.white, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', shadowColor: '#1F2937', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 10, elevation: 6 },
  profileAvatar: { width: 44, height: 44, borderRadius: 22 },
  profileAvatarOverlay: { position: 'absolute', width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(15,23,42,0.35)', alignItems: 'center', justifyContent: 'center' },

  // Section
  section: { marginBottom: 22 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: THEME.text, marginBottom: 10 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  rowGap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  seeAll: { color: THEME.primary, fontSize: 13, fontWeight: '700' },

  // Cards
  card: { backgroundColor: THEME.white, borderRadius: 18, padding: 18, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.06, shadowRadius: 18, elevation: 4, borderWidth: 1, borderColor: 'rgba(15,23,42,0.04)' },
  cardElevated: { shadowOpacity: 0.1, shadowRadius: 22, elevation: 6 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  divider: { height: 1, backgroundColor: 'rgba(15,23,42,0.08)', marginVertical: 12 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 12 },
  
  // Plan Card
  planCard: { backgroundColor: THEME.primary, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  emptyPlanCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  planTitle: { fontSize: 19, fontWeight: '700', color: THEME.white },
  planExpiry: { fontSize: 12, color: '#E0F2FE', marginTop: 4 },
  planBadge: { backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  planBadgeText: { color: THEME.white, fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  usageContainer: { marginTop: 16 },
  usageRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  usageLabel: { color: '#E0F2FE', fontSize: 12, fontWeight: '600' },
  usageValue: { color: THEME.white, fontWeight: '700', fontSize: 12 },
  progressBar: { height: 7, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 6, overflow: 'hidden' },
  progressFill: { height: 7, backgroundColor: THEME.white, borderRadius: 6 },
  remainingText: { color: '#E0F2FE', fontSize: 11, marginTop: 8, textAlign: 'right' },
  pendingText: { color: '#FFF', fontWeight: '700', marginTop: 4, fontSize: 12 },

  // Quick Actions
  actionsGrid: { flexDirection: 'row', gap: 12 },
  actionBtn: { flex: 1, padding: 16, borderRadius: 18, alignItems: 'flex-start', justifyContent: 'center', minHeight: 110 },
  actionBtnPrimary: { backgroundColor: THEME.secondary },
  actionBtnSecondary: { backgroundColor: THEME.white, borderWidth: 1, borderColor: 'rgba(15,23,42,0.08)' },
  actionIconWrap: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.04)', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  actionIconWrapLight: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  actionBtnText: { fontWeight: '700', color: THEME.text, fontSize: 14 },
  actionBtnTextLight: { fontWeight: '700', color: THEME.white, fontSize: 14 },
  actionHint: { marginTop: 6, color: THEME.textLight, fontSize: 12 },
  actionHintLight: { marginTop: 6, color: 'rgba(255,255,255,0.82)', fontSize: 12 },

  emergencyButton: { backgroundColor: '#DC2626', borderRadius: 18, padding: 16 },
  emergencyButtonDisabled: { opacity: 0.65 },
  emergencyRow: { flexDirection: 'row', alignItems: 'center' },
  emergencyIconWrap: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  emergencyTextWrap: { flex: 1 },
  emergencyTitle: { color: THEME.white, fontWeight: '800', fontSize: 15 },
  emergencySubText: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 4 },
  emergencyBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: '#FEE2E2' },
  emergencyBadgeText: { color: '#B91C1C', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  modalCard: { backgroundColor: THEME.white, borderRadius: 20, padding: 18, maxHeight: '90%', borderWidth: 1, borderColor: 'rgba(15,23,42,0.08)' },
  modalKeyboard: { flex: 1 },
  modalHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: THEME.text },
  modalSubtitle: { marginTop: 6, marginBottom: 14, color: THEME.textLight, fontSize: 13 },
  modalContent: { paddingBottom: 8 },
  inputGroup: { marginBottom: 12 },
  inputLabel: { fontSize: 12, fontWeight: '700', color: THEME.text, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: 'rgba(15,23,42,0.12)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: THEME.text, backgroundColor: '#fff' },
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  inputError: { borderColor: '#DC2626' },
  errorText: { marginTop: 6, color: '#DC2626', fontSize: 12, fontWeight: '600' },
  submitError: { marginBottom: 10, color: '#B91C1C', fontSize: 12, fontWeight: '600' },
  submitBtn: { backgroundColor: THEME.primary, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  submitBtnDisabled: { opacity: 0.7 },
  submitBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // Order Card
  orderId: { fontSize: 16, fontWeight: '700', color: THEME.text },
  orderDetailRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 8 },
  orderDetailText: { color: THEME.textLight, fontSize: 14 },
  viewDetails: { color: THEME.primary, fontWeight: '600', fontSize: 14, marginRight: 4 },
  
  // Badges
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { fontSize: 11, fontWeight: 'bold' },
  
  // Empty State
  emptyStateCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 18, backgroundColor: THEME.white, borderWidth: 1, borderColor: 'rgba(15,23,42,0.06)', shadowColor: '#0F172A', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.06, shadowRadius: 18, elevation: 4 },
  emptyIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(59,130,246,0.12)', alignItems: 'center', justifyContent: 'center' },
  emptyTextWrap: { flex: 1 },
  emptyStateText: { color: THEME.text, fontWeight: '700', fontSize: 14, marginBottom: 4 },
  emptyStateSubText: { color: THEME.textLight, fontSize: 12 },
  emptyAction: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  emptyStateLink: { color: THEME.primary, fontWeight: '700', fontSize: 13 },

  // FAB
  fab: { position: 'absolute', bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: '#25D366', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8 },
});
