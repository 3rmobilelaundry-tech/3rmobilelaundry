import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Platform, ActivityIndicator, Linking, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { student } from '../services/api';

export default function PlanPaymentScreen({ navigation, route }) {
  const { plan, user, order, order_type, payment_context, emergency } = route.params || {};

  if (!plan || !user) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>Error: Missing plan or user information</Text>
      </View>
    );
  }

  const isEmergency = payment_context === 'emergency_laundry' || order_type === 'emergency' || plan?.type === 'emergency';
  const orderId = order?.order_id;
  const emergencyClothesCount = emergency?.clothes_count || order?.clothes_count;
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [paystackRef, setPaystackRef] = useState(null);
  const normalizePaymentMethods = (methods) => {
    const defaults = ['cash', 'bank_transfer', 'paystack'];
    let list = [];
    if (Array.isArray(methods)) {
      list = methods;
    } else if (typeof methods === 'string') {
      try {
        const parsed = JSON.parse(methods);
        if (Array.isArray(parsed)) list = parsed;
      } catch (e) {
        list = [];
      }
    }
    if (!list.length) {
      list = defaults;
    }
    const normalized = list
      .map((method) => String(method).toLowerCase())
      .map((method) => (method === 'transfer' ? 'bank_transfer' : method))
      .filter((method) => defaults.includes(method));
    return Array.from(new Set(normalized));
  };
  const allowedMethods = normalizePaymentMethods(plan?.payment_methods).filter((method) => {
    if (!isEmergency) return true;
    return method !== 'bank_transfer';
  });

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

  const formatPrice = (price) => {
    return parseInt(price).toLocaleString();
  };

  const handlePaymentFailure = (message) => {
    const msg = message || 'Payment failed. Please try again.';
    if (Platform.OS === 'web') {
      window.alert(msg);
      navigation.navigate('MainTabs', { user, screen: 'Home', params: { refresh: true, paymentStatus: 'failed' } });
    } else {
      Alert.alert('Payment Failed', msg, [
        { text: 'Go Home', onPress: () => navigation.navigate('MainTabs', { user, screen: 'Home', params: { refresh: true, paymentStatus: 'failed' } }) }
      ]);
    }
  };

  const handlePaystack = async () => {
    if (!user.email) {
      const msg = 'Email required for Paystack payment';
      Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Error', msg);
      return;
    }
    if (isEmergency && !orderId) {
      const msg = 'Emergency order is missing. Please retry.';
      Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Error', msg);
      return;
    }

    try {
      setLoading(true);
      let callbackUrl = 'https://standard-callback.com';
      if (Platform.OS === 'web') {
        callbackUrl = window.location.href;
      }

      const metadata = isEmergency ? {
        user_id: user.user_id,
        order_id: orderId,
        order_type: 'emergency',
        payment_context: 'emergency_laundry',
        clothes_count: emergencyClothesCount,
        emergency_total_amount: plan.price,
        custom_fields: [
          { display_name: 'Payment For', variable_name: 'payment_for', value: 'Emergency Laundry' }
        ]
      } : {
        user_id: user.user_id,
        plan_id: plan.plan_id,
        custom_fields: [
          { display_name: "Payment For", variable_name: "payment_for", value: `Subscription: ${plan.name}` }
        ]
      };
      const res = await student.initializePayment({
        email: user.email,
        amount: plan.price, 
        callback_url: callbackUrl,
        metadata
      });

      const { authorization_url, reference } = res.data;
      setPaystackRef(reference);
      setLoading(false);

      if (Platform.OS === 'web') {
        window.open(authorization_url, '_blank');
        setVerifying(true);
      } else {
        const supported = await Linking.canOpenURL(authorization_url);
        if (supported) {
          await Linking.openURL(authorization_url);
          setVerifying(true);
        } else {
          Alert.alert('Error', 'Cannot open payment link');
          setVerifying(false);
        }
      }
    } catch (error) {
      setLoading(false);
      const msg = error.response?.data?.error || error.message;
      Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Payment Error', msg);
    }
  };

  const handleManualPayment = (method) => {
    if (method === 'transfer' || method === 'bank_transfer') {
      navigation.navigate('BankTransfer', { plan, user, order, order_type, payment_context, emergency });
      return;
    }
    const title = method === 'cash' ? 'Cash Payment' : 'Bank Transfer';
    const message = method === 'cash' 
      ? (isEmergency ? 'Please pay at the counter to activate your emergency order.' : 'Please pay at the counter to activate your subscription.')
      : 'Please transfer to the provided bank account and send proof to admin.';
    const proceed = () => {
      if (isEmergency) {
        activateEmergencyPayment(method);
      } else {
        activateSubscription(method);
      }
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${message}\n\nProceed to place pending order?`)) {
        proceed();
      }
    } else {
      Alert.alert(
        title,
        message,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'I Have Paid / Will Pay', onPress: proceed }
        ]
      );
    }
  };

  const activateEmergencyPayment = async (method = 'cash', reference = null) => {
    if (!orderId) {
      const msg = 'Emergency order is missing. Please retry.';
      Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Error', msg);
      return;
    }
    try {
      setLoading(true);
      if (method === 'paystack') {
        const res = await student.confirmEmergencyPayment({
          user_id: user.user_id,
          order_id: orderId,
          payment_reference: reference || paystackRef
        });
        const payment = res.data;
        if (payment?.status === 'paid') {
          const msg = 'Payment successful! Your emergency order is active.';
          if (Platform.OS === 'web') {
            window.alert(msg);
            navigation.navigate('MainTabs', { user, screen: 'Home', params: { refresh: true } });
          } else {
            Alert.alert('Success', msg, [
              { text: 'OK', onPress: () => navigation.navigate('MainTabs', { user, screen: 'Home', params: { refresh: true } }) }
            ]);
          }
          return;
        }
      } else {
        const res = await student.initiateEmergencyPayment({
          user_id: user.user_id,
          order_id: orderId,
          payment_method: method
        });
        const payment = res.data;
        const msg = payment?.status === 'pending'
          ? 'Payment recorded! Your emergency order is pending admin confirmation.'
          : 'Payment recorded for your emergency order.';
        if (Platform.OS === 'web') {
          window.alert(msg);
          navigation.navigate('MainTabs', { user, screen: 'Home', params: { refresh: true } });
        } else {
          Alert.alert('Payment Pending', msg, [
            { text: 'OK', onPress: () => navigation.navigate('MainTabs', { user, screen: 'Home', params: { refresh: true } }) }
          ]);
        }
      }
    } catch (error) {
      const msg = error.response?.data?.error || 'Failed to record emergency payment';
      handlePaymentFailure(msg);
    } finally {
      setLoading(false);
    }
  };

  const activateSubscription = async (method = 'paystack', reference = null) => {
    try {
      setLoading(true);
      const res = await student.subscribe(user.user_id, plan.plan_id, method, reference || paystackRef);
      const sub = res.data;
      
      if (sub.status === 'pending') {
          const msg = 'Payment recorded! Your subscription is PENDING Admin approval. You cannot book orders until confirmed.';
          if (Platform.OS === 'web') {
            window.alert(msg);
            navigation.navigate('MainTabs', { user, screen: 'Home', params: { refresh: true } });
          } else {
            Alert.alert('Payment Pending', msg, [
              { text: 'OK', onPress: () => navigation.navigate('MainTabs', { user, screen: 'Home', params: { refresh: true } }) }
            ]);
          }
      } else {
          const msg = 'Subscription activated successfully!';
          if (Platform.OS === 'web') {
            window.alert(msg);
            navigation.navigate('MainTabs', { user, screen: 'Home', params: { refresh: true } });
          } else {
            Alert.alert('Success', msg, [
              { text: 'OK', onPress: () => navigation.navigate('MainTabs', { user, screen: 'Home', params: { refresh: true } }) }
            ]);
          }
      }
    } catch (error) {
      const msg = error.response?.data?.error || 'Failed to activate subscription';
      handlePaymentFailure(msg);
    } finally {
      setLoading(false);
    }
  };

  const verifyPaystack = async () => {
     if (!paystackRef) {
       const msg = 'Payment reference missing. Please restart the payment.';
       Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Error', msg);
       setVerifying(false);
       return;
     }
     // Prompt user to confirm they have completed payment
     if (Platform.OS === 'web') {
       if (window.confirm('Have you completed the payment transaction?')) {
         if (isEmergency) {
           activateEmergencyPayment('paystack', paystackRef);
         } else {
           activateSubscription('paystack', paystackRef);
         }
       }
     } else {
       Alert.alert(
         'Confirm Payment',
         'Have you completed the payment transaction?',
         [
           { text: 'No, not yet', style: 'cancel' },
          { text: 'Yes, I have paid', onPress: () => {
            if (isEmergency) {
              activateEmergencyPayment('paystack', paystackRef);
            } else {
              activateSubscription('paystack', paystackRef);
            }
          } }
         ]
       );
     }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4F46E5" />
        <Text style={{marginTop: 20, color: '#6B7280'}}>Processing...</Text>
      </View>
    );
  }

  if (verifying) {
    return (
      <View style={styles.container}>
        <View style={styles.center}>
          <Ionicons name="card-outline" size={64} color="#4F46E5" />
          <Text style={styles.verifyTitle}>Complete Payment</Text>
          <Text style={styles.verifyDesc}>
            Please complete the payment in the browser window that opened.
          </Text>
          
          <TouchableOpacity style={styles.primaryBtn} onPress={verifyPaystack}>
            <Text style={styles.primaryBtnText}>I have completed payment</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryBtn} onPress={() => setVerifying(false)}>
            <Text style={styles.secondaryBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const methodCards = {
    paystack: {
      title: 'Pay with Paystack',
      description: 'Secure online payment via Card/Bank',
      icon: 'card',
      iconColor: '#4F46E5',
      iconBg: '#EEF2FF',
      onPress: handlePaystack,
    },
    bank_transfer: {
      title: 'Bank Transfer',
      description: 'Transfer to our bank account',
      icon: 'swap-horizontal',
      iconColor: '#10B981',
      iconBg: '#ECFDF5',
      onPress: () => handleManualPayment('bank_transfer'),
    },
    cash: {
      title: 'Cash Payment',
      description: 'Pay at our physical location',
      icon: 'cash',
      iconColor: '#F59E0B',
      iconBg: '#FFFBEB',
      onPress: () => handleManualPayment('cash'),
    },
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Payment Method</Text>
        <View style={{width: 24}} />
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
        <View style={[styles.row, styles.totalRow]}>
          <Text style={styles.totalLabel}>Total Amount</Text>
          <Text style={styles.totalValue}>₦{formatPrice(plan.price)}</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Select Payment Method</Text>

      {allowedMethods.length === 0 ? (
        <View style={styles.emptyMethods}>
          <Text style={styles.emptyMethodsText}>No payment methods available for this plan.</Text>
        </View>
      ) : (
        allowedMethods.map((method) => {
          const config = methodCards[method];
          if (!config) return null;
          return (
            <TouchableOpacity key={method} style={styles.methodCard} onPress={config.onPress} testID={`method-${method}`}>
              <View style={[styles.methodIcon, { backgroundColor: config.iconBg }]}>
                <Ionicons name={config.icon} size={24} color={config.iconColor} />
              </View>
              <View style={styles.methodInfo}>
                <Text style={styles.methodTitle}>{config.title}</Text>
                <Text style={styles.methodDesc}>{config.description}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          );
        })
      )}

    </ScrollView>
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
  methodCard: { 
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', 
    marginHorizontal: 16, marginBottom: 12, padding: 16, borderRadius: 12, 
    borderWidth: 1, borderColor: '#E5E7EB' 
  },
  methodIcon: { 
    width: 48, height: 48, borderRadius: 24, backgroundColor: '#EEF2FF', 
    alignItems: 'center', justifyContent: 'center', marginRight: 16 
  },
  methodInfo: { flex: 1 },
  methodTitle: { fontSize: 16, fontWeight: 'bold', color: '#111827' },
  methodDesc: { fontSize: 13, color: '#6B7280' },
  emptyMethods: { marginHorizontal: 16, padding: 16, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  emptyMethodsText: { color: '#6B7280' },
  verifyTitle: { fontSize: 20, fontWeight: 'bold', marginTop: 16, marginBottom: 8 },
  verifyDesc: { textAlign: 'center', color: '#6B7280', marginBottom: 24 },
  primaryBtn: { backgroundColor: '#4F46E5', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8, width: '100%', alignItems: 'center', marginBottom: 12 },
  primaryBtnText: { color: '#fff', fontWeight: 'bold' },
  secondaryBtn: { paddingVertical: 12, width: '100%', alignItems: 'center' },
  secondaryBtnText: { color: '#6B7280', fontWeight: 'bold' },
});
