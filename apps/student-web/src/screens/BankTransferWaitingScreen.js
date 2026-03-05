import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { student } from '../services/api';
import { useSync } from '../context/SyncContext';

export default function BankTransferWaitingScreen({ navigation, route }) {
  const { user, subscription_id, plan, resolved_status, resolved_message } = route.params || {};
  const { lastEvent } = useSync();
  const [checking, setChecking] = useState(false);
  const allowExitRef = useRef(false);
  const [resolvedStatus, setResolvedStatus] = useState(resolved_status || null);
  const [resolvedMessage, setResolvedMessage] = useState(resolved_message || '');

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (allowExitRef.current) return;
      e.preventDefault();
    });
    return unsubscribe;
  }, [navigation]);

  const handleResolved = (status, message) => {
    allowExitRef.current = true;
    if (status === 'paid') {
      setResolvedStatus('paid');
      setResolvedMessage(message || 'Subscription Activated Successfully');
      AsyncStorage.setItem('bank_transfer_success', 'true');
      navigation.replace('MainTabs', { user, screen: 'Home', params: { refresh: true, bank_transfer_success: true } });
      return;
    }
    setResolvedStatus('rejected');
    setResolvedMessage(message || 'Payment was rejected. Please retry the payment.');
  };

  const checkPaymentStatus = async () => {
    if (!user?.user_id || checking || resolvedStatus) return;
    setChecking(true);
    try {
      const res = await student.syncPull({ user_id: user.user_id, entity_type: 'payment' });
      const payments = res.data?.items || [];
      const match = payments.find(p => p.gateway === 'bank_transfer' && p.payment_type === 'subscription' && (!subscription_id || p.metadata?.subscription_id === subscription_id));
      if (match && (match.status === 'paid' || match.status === 'rejected' || match.status === 'declined')) {
        handleResolved(match.status === 'declined' ? 'rejected' : match.status);
      }
    } catch {}
    setChecking(false);
  };

  useEffect(() => {
    if (resolvedStatus) return;
    const interval = setInterval(checkPaymentStatus, 5000);
    checkPaymentStatus();
    return () => clearInterval(interval);
  }, [user?.user_id, subscription_id, resolvedStatus]);

  useEffect(() => {
    if (resolved_status) {
      handleResolved(resolved_status, resolved_message);
      return;
    }
    if (!lastEvent) return;
    if (resolvedStatus) return;
    if (lastEvent.type === 'payment_updated') {
      const payment = lastEvent.payload;
      if (payment.user_id === user?.user_id && payment.gateway === 'bank_transfer') {
        if (payment.status === 'paid' || payment.status === 'rejected' || payment.status === 'declined') {
          handleResolved(payment.status === 'declined' ? 'rejected' : payment.status);
        }
      }
    }
    if (lastEvent.type === 'batch_sync') {
      const payments = lastEvent.payload?.payments || [];
      const match = payments.find(p => p.gateway === 'bank_transfer' && p.payment_type === 'subscription' && (!subscription_id || p.metadata?.subscription_id === subscription_id));
      if (match && (match.status === 'paid' || match.status === 'rejected' || match.status === 'declined')) {
        handleResolved(match.status === 'declined' ? 'rejected' : match.status);
      }
    }
  }, [lastEvent, user?.user_id, subscription_id, resolvedStatus, resolved_status, resolved_message]);

  const isResolved = resolvedStatus === 'paid' || resolvedStatus === 'rejected';

  return (
    <View style={styles.container}>
      {resolvedStatus === 'paid' ? (
        <Ionicons name="checkmark-circle" size={72} color="#10B981" />
      ) : resolvedStatus === 'rejected' ? (
        <Ionicons name="close-circle" size={72} color="#EF4444" />
      ) : (
        <Ionicons name="time-outline" size={64} color="#4F46E5" />
      )}
      <Text style={styles.title}>
        {resolvedStatus === 'paid' ? 'Payment Confirmed' : resolvedStatus === 'rejected' ? 'Payment Rejected' : 'Waiting for Verification'}
      </Text>
      <Text style={styles.subtitle}>
        {resolvedMessage || 'Waiting for payment confirmation...'}
      </Text>
      {subscription_id ? (
        <Text style={styles.reference}>Order ID: #{subscription_id}</Text>
      ) : null}
      {!isResolved && (
        <>
          <View style={{ marginTop: 20 }}>
            <ActivityIndicator size="large" color="#4F46E5" />
          </View>
          <TouchableOpacity style={styles.refreshBtn} onPress={checkPaymentStatus}>
            <Text style={styles.refreshText}>Refresh Status</Text>
          </TouchableOpacity>
        </>
      )}
      {resolvedStatus === 'rejected' && (
        <TouchableOpacity
          style={styles.retryBtn}
          onPress={() => navigation.replace('BankTransfer', { user, plan })}
        >
          <Text style={styles.retryText}>Retry Payment</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: '#F9FAFB' },
  title: { fontSize: 20, fontWeight: 'bold', marginTop: 16 },
  subtitle: { textAlign: 'center', color: '#6B7280', marginTop: 8 },
  reference: { marginTop: 10, fontWeight: 'bold', color: '#111827' },
  refreshBtn: { marginTop: 24, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  refreshText: { color: '#4F46E5', fontWeight: 'bold' },
  retryBtn: { marginTop: 20, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 10, backgroundColor: '#4F46E5' },
  retryText: { color: '#fff', fontWeight: 'bold' }
});
