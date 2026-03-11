import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Platform, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { student } from '../services/api';
import { useSync } from '../context/SyncContext';

const SUCCESS_BANNER_MS = 10000;
const PENDING_KEY = 'bank_transfer_pending';
const SUCCESS_UNTIL_KEY = 'bank_transfer_success_until';
const LEGACY_SUCCESS_KEY = 'bank_transfer_success';

export default function BankTransferScreen({ navigation, route }) {
  const { plan, user, order, order_type, payment_context, emergency } = route.params || {};
  const isEmergency = payment_context === 'emergency_laundry' || order_type === 'emergency' || plan?.type === 'emergency';
  const orderId = order?.order_id;

  if (!plan || !user) {
    return (
      <View style={styles.center}>
        <Text style={{ color: '#EF4444' }}>Missing payment details</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 20 }}>
          <Text style={{ color: '#4F46E5' }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [accounts, setAccounts] = useState([]);
  const [activeAccount, setActiveAccount] = useState(null);
  const [subscriptionId, setSubscriptionId] = useState(route.params?.subscription_id || null);
  const [paymentId, setPaymentId] = useState(null);
  const [creatingSubscription, setCreatingSubscription] = useState(false);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [countdownSeconds, setCountdownSeconds] = useState(0);
  const [statusNote, setStatusNote] = useState('');
  const [pendingSubscriptionId, setPendingSubscriptionId] = useState(null);
  const [pendingOrderId, setPendingOrderId] = useState(null);
  const countdownRef = useRef(null);
  const pollRef = useRef(null);
  const deadlineRef = useRef(null);
  const timeoutHandledRef = useRef(false);
  const { lastEvent } = useSync();

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (!overlayVisible) return;
      e.preventDefault();
    });
    return unsubscribe;
  }, [navigation, overlayVisible]);

  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  useEffect(() => {
    let isActive = true;
    student.getBankAccounts().then((res) => {
      if (!isActive) return;
      const nextAccounts = res.data?.accounts || [];
      const nextActive = res.data?.active || nextAccounts.find((account) => account.active) || nextAccounts[0] || null;
      setAccounts(nextAccounts);
      setActiveAccount(nextActive);
    }).catch((error) => {
      if (!isActive) return;
      const msg = error.response?.data?.error || error.message;
      Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Error', msg);
    }).finally(() => {
      if (isActive) setFetching(false);
    });
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!plan || !user || creatingSubscription || (isEmergency ? paymentId : subscriptionId)) return;
    let isActive = true;
    const createSubscription = async () => {
      setCreatingSubscription(true);
      try {
        if (isEmergency) {
          const res = await student.initiateEmergencyPayment({
            user_id: user.user_id,
            order_id: orderId,
            payment_method: 'bank_transfer'
          });
          if (!isActive) return;
          setPaymentId(res.data?.payment_id || null);
        } else {
          const res = await student.subscribe(user.user_id, plan.plan_id, 'bank_transfer');
          if (!isActive) return;
          setSubscriptionId(res.data?.subscription_id || null);
        }
      } catch (error) {
        if (!isActive) return;
        const msg = error.response?.data?.error || error.message;
        Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Error', msg);
      } finally {
        if (isActive) setCreatingSubscription(false);
      }
    };
    createSubscription();
    return () => {
      isActive = false;
    };
  }, [plan, user, subscriptionId, creatingSubscription, isEmergency, paymentId, orderId]);

  const handleCopy = async (value) => {
    if (!value) return;
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(String(value));
      window.alert('Account number copied');
      return;
    }
    Alert.alert('Account Number', String(value));
  };

  const ensureSubscription = async () => {
    if (isEmergency) {
      if (paymentId) return { payment_id: paymentId };
      const res = await student.initiateEmergencyPayment({
        user_id: user.user_id,
        order_id: orderId,
        payment_method: 'bank_transfer'
      });
      const payment = res.data;
      setPaymentId(payment.payment_id);
      return payment;
    }
    if (subscriptionId) return { subscription_id: subscriptionId };
    const res = await student.subscribe(user.user_id, plan.plan_id, 'bank_transfer');
    const sub = res.data;
    setSubscriptionId(sub.subscription_id);
    return sub;
  };

  const stopMonitoring = () => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (pollRef.current) clearInterval(pollRef.current);
    countdownRef.current = null;
    pollRef.current = null;
  };

  const handleTimeout = () => {
    if (timeoutHandledRef.current) return;
    timeoutHandledRef.current = true;
    console.log('BankTransfer: timeout reached, redirecting home');
    stopMonitoring();
    setOverlayVisible(false);
    setLoading(false);
    setStatusNote('');
    AsyncStorage.setItem(PENDING_KEY, 'true');
    navigation.replace('MainTabs', { user, screen: 'Home', params: { refresh: true, pending_transfer: true } });
  };

  const handleResolvedStatus = async (status, payment) => {
    stopMonitoring();
    setOverlayVisible(false);
    setLoading(false);
    setStatusNote('');
    const normalizedStatus = status === 'declined' ? 'rejected' : status;
    if (normalizedStatus === 'paid') {
      const successUntil = Date.now() + SUCCESS_BANNER_MS;
      await AsyncStorage.removeItem(PENDING_KEY);
      await AsyncStorage.removeItem(LEGACY_SUCCESS_KEY);
      await AsyncStorage.setItem(SUCCESS_UNTIL_KEY, String(successUntil));
      navigation.replace('MainTabs', { user, screen: 'Home', params: { refresh: true, bank_transfer_success: true } });
      return;
    }
    await AsyncStorage.removeItem(PENDING_KEY);
    await AsyncStorage.removeItem(LEGACY_SUCCESS_KEY);
    await AsyncStorage.removeItem(SUCCESS_UNTIL_KEY);
    const reason = payment?.metadata?.rejection_reason || payment?.metadata?.reason || 'Payment was rejected by admin.';
    const msg = `Payment was cancelled. ${reason}`;
    Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Payment Cancelled', msg);
    if (isEmergency) {
      navigation.replace('PlanPayment', { user, plan, order, order_type, payment_context, emergency });
    } else {
      navigation.replace('PlanPayment', { user, plan });
    }
  };

  const checkPaymentStatus = async () => {
    if (!user?.user_id) return;
    try {
      const res = await student.syncPull({ user_id: user.user_id, entity_type: 'payment' });
      const items = res.data?.items || [];
      const match = items.find((payment) => {
        if (payment.gateway !== 'bank_transfer') return false;
        if (isEmergency) {
          if (payment.payment_type !== 'emergency') return false;
          if (pendingOrderId) {
            const relatedId = payment.metadata?.related_order_id || payment.metadata?.order_id;
            if (String(relatedId) !== String(pendingOrderId)) return false;
          }
          return true;
        }
        if (payment.payment_type !== 'subscription') return false;
        if (pendingSubscriptionId && payment.metadata?.subscription_id !== pendingSubscriptionId) return false;
        return true;
      });
      if (!match) return;
      if (['paid', 'rejected', 'declined'].includes(match.status)) {
        console.log('BankTransfer: payment resolved', match.status);
        handleResolvedStatus(match.status, match);
      }
    } catch (error) {
      console.error('BankTransfer: status check failed', error?.response?.data || error?.message);
    }
  };

  const startCountdown = () => {
    timeoutHandledRef.current = false;
    deadlineRef.current = Date.now() + 180000;
    setCountdownSeconds(180);
    countdownRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
      setCountdownSeconds(remaining);
      if (remaining <= 0) {
        handleTimeout();
      }
    }, 1000);
  };

  const startPolling = () => {
    checkPaymentStatus();
    pollRef.current = setInterval(checkPaymentStatus, 5000);
  };

  const handleIHavePaid = async () => {
    if (loading) return;
    setOverlayVisible(true);
    setLoading(true);
    setStatusNote('Submitting payment confirmation...');
    startCountdown();
    try {
      const sub = await ensureSubscription();
      if (isEmergency) {
        setPendingOrderId(orderId);
        await student.submitBankTransfer({
          user_id: user.user_id,
          order_id: orderId,
          payment_type: 'emergency',
          payment_id: sub.payment_id
        });
      } else {
        setPendingSubscriptionId(sub.subscription_id);
        await student.submitBankTransfer({ user_id: user.user_id, subscription_id: sub.subscription_id });
      }
      await AsyncStorage.setItem(PENDING_KEY, 'true');
      console.log('BankTransfer: submit confirmed');
      setStatusNote('Waiting for admin confirmation...');
      startPolling();
    } catch (error) {
      stopMonitoring();
      setOverlayVisible(false);
      setLoading(false);
      await AsyncStorage.removeItem(PENDING_KEY);
      const msg = error.response?.data?.error || error.message || 'Failed to submit bank transfer';
      console.error('BankTransfer: submit failed', msg);
      Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Error', msg);
    }
  };

  useEffect(() => {
    if (!overlayVisible || !lastEvent) return;
    if (lastEvent.type === 'payment_updated') {
      const payment = lastEvent.payload;
      if (payment.user_id === user?.user_id && payment.gateway === 'bank_transfer') {
        if (isEmergency) {
          const relatedId = payment.metadata?.related_order_id || payment.metadata?.order_id;
          if (!pendingOrderId || String(relatedId) === String(pendingOrderId)) {
            if (['paid', 'rejected', 'declined'].includes(payment.status)) {
              console.log('BankTransfer: realtime payment update', payment.status);
              handleResolvedStatus(payment.status, payment);
            }
          }
        } else if (!pendingSubscriptionId || payment.metadata?.subscription_id === pendingSubscriptionId) {
          if (['paid', 'rejected', 'declined'].includes(payment.status)) {
            console.log('BankTransfer: realtime payment update', payment.status);
            handleResolvedStatus(payment.status, payment);
          }
        }
      }
    }
    if (lastEvent.type === 'batch_sync') {
      const payments = lastEvent.payload?.payments || [];
      const match = payments.find((payment) => {
        if (payment.gateway !== 'bank_transfer') return false;
        if (isEmergency) {
          if (payment.payment_type !== 'emergency') return false;
          if (pendingOrderId) {
            const relatedId = payment.metadata?.related_order_id || payment.metadata?.order_id;
            if (String(relatedId) !== String(pendingOrderId)) return false;
          }
          return true;
        }
        if (payment.payment_type !== 'subscription') return false;
        if (pendingSubscriptionId && payment.metadata?.subscription_id !== pendingSubscriptionId) return false;
        return true;
      });
      if (match && ['paid', 'rejected', 'declined'].includes(match.status)) {
        console.log('BankTransfer: batch sync resolved', match.status);
        handleResolvedStatus(match.status, match);
      }
    }
  }, [lastEvent, overlayVisible, pendingSubscriptionId, user?.user_id, isEmergency, pendingOrderId]);

  const formatPrice = (price) => {
    return parseInt(price).toLocaleString();
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.container} scrollEnabled={!overlayVisible}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Bank Transfer</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Order Summary</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Plan</Text>
          <Text style={styles.value}>{plan.name}</Text>
        </View>
        {isEmergency ? (
          <View style={styles.row}>
            <Text style={styles.label}>Delivery</Text>
            <Text style={styles.value}>{plan.delivery_window_text || 'Same day'}</Text>
          </View>
        ) : (
          <View style={styles.row}>
            <Text style={styles.label}>Duration</Text>
            <Text style={styles.value}>{plan.duration_days} Days</Text>
          </View>
        )}
        <View style={styles.row}>
          <Text style={styles.label}>Order ID</Text>
          <Text style={styles.value}>{isEmergency ? (orderId ? `#${orderId}` : '-') : (subscriptionId ? `#${subscriptionId}` : (creatingSubscription ? 'Generating...' : '-'))}</Text>
        </View>
        <View style={[styles.row, styles.totalRow]}>
          <Text style={styles.totalLabel}>Total Amount</Text>
          <Text style={styles.totalValue}>₦{formatPrice(plan.price)}</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Transfer To</Text>

      {fetching ? (
        <ActivityIndicator size="large" color="#4F46E5" style={{ marginTop: 20 }} />
      ) : (
        <View style={styles.accountCard}>
          {activeAccount ? (
            <>
              <View style={styles.accountRow}>
                <Text style={styles.accountLabel}>Bank</Text>
                <Text style={styles.accountValue}>{activeAccount.bank_name || '-'}</Text>
              </View>
              <View style={styles.accountRow}>
                <Text style={styles.accountLabel}>Account Name</Text>
                <Text style={styles.accountValue}>{activeAccount.account_name || '-'}</Text>
              </View>
              <View style={styles.accountRow}>
                <Text style={styles.accountLabel}>Account Number</Text>
                <Text style={styles.accountValue}>{activeAccount.account_number || '-'}</Text>
              </View>
              <TouchableOpacity style={styles.copyBtn} onPress={() => handleCopy(activeAccount.account_number)}>
                <Ionicons name="copy-outline" size={18} color="#4F46E5" />
                <Text style={styles.copyBtnText}>Copy Account Number</Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={{ color: '#6B7280' }}>No active bank account configured.</Text>
          )}
        </View>
      )}

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>After Transfer</Text>
        <Text style={styles.infoText}>Use your name as the transfer narration for faster verification.</Text>
      </View>

      <TouchableOpacity style={styles.primaryBtn} disabled={loading || !activeAccount} onPress={handleIHavePaid}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>I Have Paid</Text>}
      </TouchableOpacity>
      </ScrollView>
      {overlayVisible && (
        <View style={styles.overlay}>
          <View style={styles.overlayCard}>
            <ActivityIndicator size="large" color="#4F46E5" />
            <Text style={styles.overlayTitle}>Verifying Payment</Text>
            <Text style={styles.overlayText}>{statusNote || 'Processing...'}</Text>
            <Text style={styles.overlayCountdown}>
              Time remaining: {Math.floor(countdownSeconds / 60)}:{String(countdownSeconds % 60).padStart(2, '0')}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  header: { 
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', 
    padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' 
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold' },
  summaryCard: { margin: 16, padding: 16, backgroundColor: '#fff', borderRadius: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, elevation: 2 },
  summaryTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 12, color: '#374151' },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  label: { color: '#6B7280' },
  value: { fontWeight: '500', color: '#111827' },
  totalRow: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  totalLabel: { fontWeight: 'bold', fontSize: 16 },
  totalValue: { fontWeight: 'bold', fontSize: 18, color: '#4F46E5' },
  sectionTitle: { marginLeft: 16, marginBottom: 8, fontSize: 14, fontWeight: 'bold', color: '#6B7280', textTransform: 'uppercase' },
  accountCard: { marginHorizontal: 16, backgroundColor: '#fff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#E5E7EB' },
  accountRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  accountLabel: { color: '#6B7280' },
  accountValue: { fontWeight: '600', color: '#111827' },
  copyBtn: { marginTop: 10, flexDirection: 'row', alignItems: 'center' },
  copyBtnText: { marginLeft: 6, color: '#4F46E5', fontWeight: 'bold' },
  infoCard: { margin: 16, backgroundColor: '#EEF2FF', borderRadius: 12, padding: 16 },
  infoTitle: { fontSize: 14, fontWeight: 'bold', marginBottom: 6, color: '#1E40AF' },
  infoText: { color: '#4B5563' },
  primaryBtn: { backgroundColor: '#4F46E5', paddingVertical: 14, marginHorizontal: 16, borderRadius: 10, alignItems: 'center', marginBottom: 24 },
  primaryBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(17, 24, 39, 0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  overlayCard: { backgroundColor: '#fff', padding: 24, borderRadius: 16, alignItems: 'center', width: '100%', maxWidth: 320 },
  overlayTitle: { marginTop: 12, fontSize: 18, fontWeight: 'bold', color: '#111827' },
  overlayText: { marginTop: 8, textAlign: 'center', color: '#6B7280' },
  overlayCountdown: { marginTop: 12, fontWeight: 'bold', color: '#1F2937' }
});
