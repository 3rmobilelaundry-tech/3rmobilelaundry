import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, Platform, useWindowDimensions, TouchableOpacity } from 'react-native';
import { Card, Badge, useTheme } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { isInvalidTokenError, normalizeApiError, staff } from '../../services/api';
import { useFocusEffect } from '@react-navigation/native';
import { getTokens } from '../../theme/tokens';
import { useSync } from '../../context/SyncContext';

const tokens = getTokens();

export default function OverviewScreen({ navigation }) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const isLargeScreen = width > 768;
  const { lastEvent } = useSync();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [greeting, setGreeting] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [data, setData] = useState({
    users: 0,
    active_subscriptions: 0,
    orders: {
      pending: 0, accepted: 0, picked_up: 0, processing: 0, ready: 0, delivered: 0, cancelled: 0
    },
    revenue: { today: 0, week: 0, month: 0 },
    alerts: {
      stalled_orders: 0,
      pending_payments: 0,
      failed_payments: 0,
      code_expired: 0,
      code_failed_attempts: 0
    }
  });

  const fetchData = async () => {
    try {
      setErrorMessage('');
      const response = await staff.getOverview();
      setData(response.data);
    } catch (error) {
      const normalized = normalizeApiError(error);
      setErrorMessage(normalized.message);
      console.error('Error fetching overview data:', normalized);
      if (!isInvalidTokenError(normalized)) {
        try {
          await staff.logFrontError({
            source: 'admin-web',
            message: normalized.message,
            href: typeof window !== 'undefined' ? window.location.href : undefined,
            context: {
              endpoint: '/admin/overview',
              status: normalized.status,
              code: normalized.code
            }
          });
        } catch {}
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good Morning');
    else if (hour < 18) setGreeting('Good Afternoon');
    else setGreeting('Good Evening');
  }, []);

  // Real-time updates via SSE
  useEffect(() => {
    if (lastEvent) {
        console.log('OverviewScreen: Sync event received', lastEvent.type);
        // Refresh on any relevant event
        const relevantEvents = [
            'order_created', 'order_updated', 
            'user_registered', 'user_updated', 
            'subscription_created', 
            'payment_created', 'payment_updated',
            'pickup_event'
        ];
        
        if (relevantEvents.includes(lastEvent.type)) {
            fetchData();
        }
    }
  }, [lastEvent]);

  useFocusEffect(
    useCallback(() => {
      // Polling fallback (every 60s instead of 30s since we have SSE)
      const interval = setInterval(fetchData, 60000);
      return () => clearInterval(interval);
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const StatCard = ({ title, value, icon, color, bg }) => (
    <View style={[styles.statCard, { backgroundColor: bg || 'white' }]}>
      <View style={[styles.iconBox, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon} size={24} color={color} />
      </View>
      <View style={styles.statContent}>
        <Text style={styles.statLabel}>{title}</Text>
        <Text style={[styles.statValue, { color: tokens.colors.text }]}>{typeof value === 'number' ? value.toLocaleString() : value}</Text>
      </View>
    </View>
  );

  const StatusPill = ({ label, count, color, icon }) => (
    <View style={styles.statusPill}>
      <View style={[styles.statusIcon, { backgroundColor: color + '15' }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <View>
        <Text style={styles.statusCount}>{count}</Text>
        <Text style={styles.statusLabelSmall}>{label}</Text>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={tokens.colors.primary} />
      </View>
    );
  }

  const hasRedFlags = 
    data.alerts.stalled_orders > 0 || 
    data.alerts.failed_payments > 0 || 
    data.alerts.code_failed_attempts > 0;

  return (
    <ScrollView 
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {!!errorMessage && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{errorMessage}</Text>
        </View>
      )}

      {/* Header Section */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{greeting}, Head Admin</Text>
          <Text style={styles.date}>{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</Text>
        </View>
        <View style={styles.updateBadge}>
           <View style={[styles.dot, { backgroundColor: '#10B981' }]} />
           <Text style={styles.updateText}>Live Updates</Text>
        </View>
      </View>

      {/* Red Flags Alert */}
      {hasRedFlags && (
        <View style={styles.alertBanner}>
          <View style={styles.alertHeader}>
             <Ionicons name="warning" size={24} color="#EF4444" />
             <Text style={styles.alertTitle}>Action Required</Text>
          </View>
          <View style={styles.alertGrid}>
             {data.alerts.stalled_orders > 0 && (
               <View style={styles.alertItem}>
                 <Text style={styles.alertLabel}>Stalled Orders</Text>
                 <Badge style={{ backgroundColor: '#EF4444' }}>{data.alerts.stalled_orders}</Badge>
               </View>
             )}
             {data.alerts.failed_payments > 0 && (
               <View style={styles.alertItem}>
                 <Text style={styles.alertLabel}>Failed Payments</Text>
                 <Badge style={{ backgroundColor: '#EF4444' }}>{data.alerts.failed_payments}</Badge>
               </View>
             )}
             {data.alerts.code_failed_attempts > 0 && (
               <View style={styles.alertItem}>
                 <Text style={styles.alertLabel}>Security Alerts</Text>
                 <Badge style={{ backgroundColor: '#EF4444' }}>{data.alerts.code_failed_attempts}</Badge>
               </View>
             )}
          </View>
        </View>
      )}

      {/* KPI Grid */}
      <View style={styles.grid}>
        <View style={styles.gridItem}>
          <StatCard 
            title="Total Users" 
            value={data.users} 
            icon="people" 
            color={tokens.colors.primary} 
          />
        </View>
        <View style={styles.gridItem}>
          <StatCard 
            title="Active Subs" 
            value={data.active_subscriptions} 
            icon="card" 
            color={tokens.colors.secondary} 
          />
        </View>
        <View style={styles.gridItem}>
          <StatCard 
            title="Revenue (Today)" 
            value={`₦${data.revenue.today.toLocaleString()}`} 
            icon="cash" 
            color={tokens.colors.accent} 
          />
        </View>
        <View style={styles.gridItem}>
          <StatCard 
            title="Pending Orders" 
            value={data.orders.pending} 
            icon="time" 
            color={tokens.colors.warning} 
          />
        </View>
      </View>

      <View style={[styles.mainGrid, { flexDirection: isLargeScreen ? 'row' : 'column' }]}>
        {/* Order Pipeline */}
        <View style={[styles.section, { flex: 2 }]}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Order Pipeline</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Orders')}>
               <Text style={styles.linkText}>View All</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.pipelineGrid}>
             <StatusPill label="Pending" count={data.orders.pending} icon="time-outline" color="#F59E0B" />
             <StatusPill label="Accepted" count={data.orders.accepted} icon="checkmark-circle-outline" color="#3B82F6" />
             <StatusPill label="Picked Up" count={data.orders.picked_up} icon="cube-outline" color="#8B5CF6" />
             <StatusPill label="Processing" count={data.orders.processing} icon="water-outline" color="#06B6D4" />
             <StatusPill label="Ready" count={data.orders.ready} icon="shirt-outline" color="#10B981" />
             <StatusPill label="Delivered" count={data.orders.delivered} icon="bicycle-outline" color="#6B7280" />
          </View>
        </View>

        {/* Revenue Breakdown */}
        <View style={[styles.section, { flex: 1 }]}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Revenue</Text>
            <Ionicons name="stats-chart" size={20} color={tokens.colors.textSecondary} />
          </View>
          <View style={styles.revenueList}>
             <View style={styles.revenueRow}>
                <View style={styles.revenueIconBox}>
                   <Ionicons name="calendar-outline" size={18} color={tokens.colors.textSecondary} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                   <Text style={styles.revenueLabel}>Today</Text>
                   <Text style={styles.revenueValue}>₦{data.revenue.today.toLocaleString()}</Text>
                </View>
             </View>
             <Divider />
             <View style={styles.revenueRow}>
                <View style={styles.revenueIconBox}>
                   <Ionicons name="calendar" size={18} color={tokens.colors.textSecondary} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                   <Text style={styles.revenueLabel}>This Week</Text>
                   <Text style={styles.revenueValue}>₦{data.revenue.week.toLocaleString()}</Text>
                </View>
             </View>
             <Divider />
             <View style={styles.revenueRow}>
                <View style={styles.revenueIconBox}>
                   <Ionicons name="calendar-number" size={18} color={tokens.colors.textSecondary} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                   <Text style={styles.revenueLabel}>This Month</Text>
                   <Text style={styles.revenueValue}>₦{data.revenue.month.toLocaleString()}</Text>
                </View>
             </View>
          </View>
        </View>
      </View>

    </ScrollView>
  );
}

const Divider = () => <View style={{ height: 1, backgroundColor: '#F3F4F6', marginVertical: 12 }} />;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  contentContainer: {
    padding: 24,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  greeting: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  date: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  updateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  updateText: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '600',
  },
  errorBanner: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FCA5A5',
    borderWidth: 1,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorBannerText: {
    color: '#B91C1C',
    fontSize: 13,
    fontWeight: '600',
  },
  alertBanner: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  alertTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#991B1B',
    marginLeft: 8,
  },
  alertGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  alertItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
    gap: 8,
  },
  alertLabel: {
    fontSize: 13,
    color: '#991B1B',
    fontWeight: '600',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 24,
  },
  gridItem: {
    flex: 1,
    minWidth: 200,
  },
  statCard: {
    padding: 20,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  statContent: {
    flex: 1,
  },
  statLabel: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  mainGrid: {
    gap: 24,
  },
  section: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  linkText: {
    fontSize: 14,
    color: tokens.colors.primary,
    fontWeight: '600',
  },
  pipelineGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statusPill: {
    flex: 1,
    minWidth: 140,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  statusIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  statusCount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  statusLabelSmall: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  revenueList: {
    gap: 0,
  },
  revenueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  revenueIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  revenueLabel: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 2,
  },
  revenueValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
});
