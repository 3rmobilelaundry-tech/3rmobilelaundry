import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { normalizeApiError, staff } from '../../services/api';
import { getTokens } from '../../theme/tokens';
import { useSync } from '../../context/SyncContext';

const tokens = getTokens();

export default function WasherDashboard({ onNavigate }) {
  const { lastEvent } = useSync();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState({
    orders: {
      pending: 0, accepted: 0, picked_up: 0, processing: 0, ready: 0, delivered: 0, cancelled: 0
    }
  });

  const fetchData = async () => {
    try {
      const response = await staff.getOverview();
      setData(response.data);
    } catch (error) {
      const normalized = normalizeApiError(error);
      console.error('Error fetching overview data:', normalized);
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
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (lastEvent && (lastEvent.type === 'order_created' || lastEvent.type === 'order_updated' || lastEvent.type === 'pickup_event')) {
        fetchData();
    }
  }, [lastEvent]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const StatusPill = ({ label, count, color, icon }) => (
    <View style={styles.statusPill}>
      <View style={[styles.statusIcon, { backgroundColor: color + '15' }]}>
        <Ionicons name={icon} size={24} color={color} />
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

  return (
    <ScrollView 
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Washer Dashboard</Text>
        <Text style={styles.subtitle}>Overview of current operations</Text>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Order Pipeline</Text>
          <TouchableOpacity onPress={() => onNavigate('Orders')}>
             <Text style={styles.linkText}>View Orders</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.pipelineGrid}>
             <StatusPill label="Pending" count={data.orders?.pending || 0} icon="time-outline" color="#F59E0B" />
             <StatusPill label="Accepted" count={data.orders?.accepted || 0} icon="checkmark-circle-outline" color="#3B82F6" />
             <StatusPill label="Picked Up" count={data.orders?.picked_up || 0} icon="cube-outline" color="#8B5CF6" />
             <StatusPill label="Processing" count={data.orders?.processing || 0} icon="water-outline" color="#06B6D4" />
             <StatusPill label="Ready" count={data.orders?.ready || 0} icon="shirt-outline" color="#10B981" />
             <StatusPill label="Delivered" count={data.orders?.delivered || 0} icon="bicycle-outline" color="#6B7280" />
        </View>
      </View>
    </ScrollView>
  );
}

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
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    marginTop: 4,
  },
  section: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
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
    fontWeight: '600',
    color: '#111827',
  },
  linkText: {
    color: tokens.colors.primary,
    fontWeight: '600',
  },
  pipelineGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  statusPill: {
    width: '47%', // 2 columns
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  statusIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
  },
});
