import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, RefreshControl, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { theme } from '../constants/theme';
import { student } from '../services/api';
import { useSync } from '../context/SyncContext';
import PageLayout from '../components/PageLayout';

const STEPS = [
  { key: 'pending', label: 'Order Created', icon: 'cart' },
  { key: 'picked_up', label: 'Picked Up', icon: 'shirt' },
  { key: 'processing', label: 'Processing', icon: 'water' },
  { key: 'ready', label: 'Ready for Collection', icon: 'checkmark-circle' },
  { key: 'delivered', label: 'Delivered', icon: 'home' },
];

const STATUS_ORDER = ['pending', 'accepted', 'picked_up', 'processing', 'ready', 'delivered'];

export default function OrderDetailsScreen({ route }) {
  const navigation = useNavigation();
  const { order: initialOrder } = route.params || {};
  const [order, setOrder] = useState(initialOrder);
  const [user, setUser] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const { lastEvent } = useSync();

  useEffect(() => {
    AsyncStorage.getItem('userData').then(data => {
        if (data) setUser(JSON.parse(data));
    });
  }, []);

  const onRefresh = useCallback(async () => {
    if (!order?.user_id) return;
    
    setRefreshing(true);
    try {
      const response = await student.getOrders(order.user_id);
      const updatedOrder = response.data.find(o => String(o.order_id) === String(order.order_id));
      
      if (updatedOrder) {
        setOrder(updatedOrder);
      }
    } catch (error) {
      console.error('Refresh failed:', error);
      Alert.alert('Error', 'Failed to refresh order details');
    } finally {
      setRefreshing(false);
    }
  }, [order?.user_id, order?.order_id]);

  // Real-time Sync
  useEffect(() => {
    if (!lastEvent) return;
    
    if (lastEvent.type === 'poll_refresh') {
        onRefresh();
    } else if (lastEvent.type === 'order_updated' && String(lastEvent.payload?.order_id) === String(order?.order_id)) {
        console.log('OrderDetails: Order updated event received');
        onRefresh();
    } else if (lastEvent.type === 'pickup_event' && String(lastEvent.payload?.order?.order_id) === String(order?.order_id)) {
        console.log('OrderDetails: Pickup event received');
        onRefresh();
    }
  }, [lastEvent, order?.order_id, onRefresh]);

  if (!order) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>Error: Order not found</Text>
      </View>
    );
  }

  const codes = order.Codes || [];
  const pickupCode = codes.find(c => c.type === 'pickup');
  const releaseCode = codes.find(c => c.type === 'release');

  const currentStatusIndex = STATUS_ORDER.indexOf(order.status);
  
  const isStepActive = (stepKey) => {
    if (stepKey === 'pending' && order.status === 'accepted') return true;
    const stepIndex = STATUS_ORDER.indexOf(stepKey);
    return stepIndex <= currentStatusIndex && stepIndex !== -1;
  };

  const getStatusColor = () => {
    switch (order.status) {
      case 'ready': return theme.colors.success;
      case 'delivered': return theme.colors.primary;
      case 'cancelled': return theme.colors.error;
      default: return theme.colors.warning;
    }
  };

  const renderTimeline = () => {
    return (
      <View style={styles.timelineContainer}>
        <Text style={styles.sectionTitle}>Track Order</Text>
        <View style={styles.timeline}>
          {STEPS.map((step, index) => {
            const active = isStepActive(step.key);
            const isLast = index === STEPS.length - 1;
            
            return (
              <View key={step.key} style={styles.timelineItem}>
                <View style={styles.timelineLeft}>
                  <View style={[styles.timelineDot, active && styles.timelineDotActive]}>
                    <Ionicons name={step.icon} size={16} color={active ? '#fff' : theme.colors.textTertiary} />
                  </View>
                  {!isLast && <View style={[styles.timelineLine, active && isStepActive(STEPS[index+1].key) && styles.timelineLineActive]} />}
                </View>
                <View style={styles.timelineContent}>
                  <Text style={[styles.timelineLabel, active && styles.timelineLabelActive]}>{step.label}</Text>
                  {active && order.status === step.key && (
                    <Text style={styles.timelineStatus}>Current Status</Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <PageLayout 
      user={user} 
      showBack 
      refreshing={refreshing} 
      onRefresh={onRefresh}
      scrollable={true}
    >
      {/* Header Status Card */}
      <View style={styles.headerCard}>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor() + '20' }]}>
          <Text style={[styles.statusText, { color: getStatusColor() }]}>
            {order.status.replace('_', ' ').toUpperCase()}
          </Text>
        </View>
        {order.is_emergency && (
          <View style={styles.emergencyBadge}>
            <Text style={styles.emergencyBadgeText}>EMERGENCY</Text>
          </View>
        )}
        <Text style={styles.orderId}>Order #{order.order_id}</Text>
        <Text style={styles.date}>Placed on {new Date(order.created_at || Date.now()).toLocaleDateString()}</Text>
      </View>

      {renderTimeline()}

      {/* Codes Section */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Access Codes</Text>
        
        <View style={styles.codeRow}>
          <View style={styles.codeInfo}>
            <Text style={styles.label}>Pickup Code</Text>
            <Text style={styles.codeValue}>{pickupCode?.code_value || 'Generating...'}</Text>
          </View>
          <Ionicons name="qr-code-outline" size={32} color={theme.colors.primary} />
        </View>
        <View style={styles.divider} />
        <View style={styles.codeRow}>
          <View style={styles.codeInfo}>
            <Text style={styles.label}>Release Code</Text>
            <Text style={[styles.codeValue, !releaseCode && { color: theme.colors.textTertiary, fontSize: 16 }]}>
              {releaseCode?.code_value || 'Available when ready'}
            </Text>
          </View>
          <Ionicons name="lock-open-outline" size={32} color={releaseCode ? theme.colors.success : theme.colors.textTertiary} />
        </View>
      </View>

      {/* Order Details */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Order Details</Text>
        <View style={styles.detailRow}>
          <Ionicons name="calendar" size={20} color={theme.colors.textSecondary} />
          <Text style={styles.detailText}>Pickup: {new Date(order.pickup_date).toDateString()}</Text>
        </View>
        <View style={styles.detailRow}>
          <Ionicons name="time" size={20} color={theme.colors.textSecondary} />
          <Text style={styles.detailText}>Window: {order.pickup_time_slot || 'Anytime'}</Text>
        </View>
        <View style={styles.detailRow}>
          <Ionicons name="shirt" size={20} color={theme.colors.textSecondary} />
          <Text style={styles.detailText}>{order.clothes_count} Items</Text>
        </View>
        {order.is_emergency && (
          <View style={styles.detailRow}>
            <Ionicons name="flash" size={20} color={theme.colors.textSecondary} />
            <Text style={styles.detailText}>Emergency Total: ₦{order.emergency_total_amount || 0}</Text>
          </View>
        )}
        {order.pickup_address && (
          <View style={styles.detailRow}>
            <Ionicons name="location" size={20} color={theme.colors.textSecondary} />
            <Text style={styles.detailText}>Pickup Address: {order.pickup_address}</Text>
          </View>
        )}
        {order.delivery_address && (
          <View style={styles.detailRow}>
            <Ionicons name="navigate" size={20} color={theme.colors.textSecondary} />
            <Text style={styles.detailText}>Delivery Address: {order.delivery_address}</Text>
          </View>
        )}
        {order.notes && (
          <View style={styles.noteBox}>
            <Text style={styles.noteText}>"{order.notes}"</Text>
          </View>
        )}
      </View>

      {/* Chat Action */}
      <TouchableOpacity 
        style={[styles.helpBtn, { backgroundColor: theme.colors.primary, marginBottom: 12 }]}
        onPress={() => navigation.navigate('Chat', { orderId: order.order_id })}
      >
        <Ionicons name="chatbubbles-outline" size={20} color="#fff" />
        <Text style={styles.helpText}>Chat with Rider</Text>
      </TouchableOpacity>

      {/* Help Action */}
      <TouchableOpacity 
        style={styles.helpBtn}
        onPress={() => Linking.openURL(`https://wa.me/2348155529957?text=I need help with order ${order.order_id}`)}
      >
        <Ionicons name="logo-whatsapp" size={20} color="#fff" />
        <Text style={styles.helpText}>Need Help with this Order?</Text>
      </TouchableOpacity>
    </PageLayout>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: theme.spacing.md,
  },
  headerCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    alignItems: 'center',
    ...theme.shadows.md,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.full,
    marginBottom: theme.spacing.sm,
  },
  emergencyBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.full,
    backgroundColor: '#FEE2E2',
    marginBottom: theme.spacing.sm,
  },
  emergencyBadgeText: {
    color: '#B91C1C',
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 0.6,
  },
  statusText: {
    fontWeight: 'bold',
    fontSize: 12,
    letterSpacing: 1,
  },
  orderId: {
    ...theme.typography.h2,
    marginBottom: 4,
  },
  date: {
    ...theme.typography.caption,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    ...theme.shadows.sm,
  },
  sectionTitle: {
    ...theme.typography.h3,
    marginBottom: theme.spacing.md,
  },
  // Timeline
  timelineContainer: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    ...theme.shadows.sm,
  },
  timeline: {
    marginTop: theme.spacing.sm,
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: 2, // Spacing handled by content/minHeight
  },
  timelineLeft: {
    alignItems: 'center',
    marginRight: theme.spacing.md,
    width: 30,
  },
  timelineDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: theme.colors.border,
    zIndex: 1,
  },
  timelineDotActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: theme.colors.border,
    minHeight: 30,
  },
  timelineLineActive: {
    backgroundColor: theme.colors.primary,
  },
  timelineContent: {
    flex: 1,
    paddingBottom: theme.spacing.lg,
    justifyContent: 'center',
  },
  timelineLabel: {
    fontSize: 16,
    color: theme.colors.textTertiary,
    fontWeight: '500',
  },
  timelineLabelActive: {
    color: theme.colors.text,
    fontWeight: 'bold',
  },
  timelineStatus: {
    fontSize: 12,
    color: theme.colors.primary,
    marginTop: 2,
  },
  // Codes
  codeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
  },
  codeInfo: {
    flex: 1,
  },
  label: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  codeValue: {
    fontSize: 20,
    fontWeight: 'bold',
    letterSpacing: 2,
    color: theme.colors.text,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: theme.spacing.md,
  },
  // Details
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  detailText: {
    fontSize: 16,
    color: theme.colors.text,
    marginLeft: theme.spacing.md,
  },
  noteBox: {
    backgroundColor: theme.colors.background,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    marginTop: theme.spacing.sm,
  },
  noteText: {
    fontStyle: 'italic',
    color: theme.colors.textSecondary,
  },
  // Help
  helpBtn: {
    backgroundColor: theme.colors.success,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.full,
    marginTop: theme.spacing.sm,
    ...theme.shadows.md,
  },
  helpText: {
    color: '#fff',
    fontWeight: 'bold',
    marginLeft: theme.spacing.sm,
    fontSize: 16,
  },
});
