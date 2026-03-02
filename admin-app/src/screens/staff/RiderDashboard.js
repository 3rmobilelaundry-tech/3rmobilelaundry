import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { staff } from '../../services/api';
import Card from '../../components/ui/Card';
import { getTokens } from '../../theme/tokens';
import { Ionicons } from '@expo/vector-icons';
import { useSync } from '../../context/SyncContext';

const tokens = getTokens();

export default function RiderDashboard({ navigation }) {
  const { lastEvent } = useSync();
  const [stats, setStats] = useState({
    pending: 0,
    accepted: 0,
    picked_up: 0,
    processing: 0,
    ready: 0,
    delivered: 0
  });
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = async () => {
    // Only set loading on initial fetch if not refreshing
    if (!refreshing) setLoading(true);
    try {
      // Fetch all orders and count locally (View-only data)
      const response = await staff.getOrders({});
      const orders = response.data;
      
      const newStats = {
        pending: 0,
        accepted: 0,
        picked_up: 0,
        processing: 0,
        ready: 0,
        delivered: 0
      };

      orders.forEach(o => {
        if (newStats[o.status] !== undefined) {
          newStats[o.status]++;
        }
      });

      setStats(newStats);
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchStats();
    }, [])
  );

  // Real-time Sync
  useEffect(() => {
    if (lastEvent && (lastEvent.type === 'order_created' || lastEvent.type === 'order_updated' || lastEvent.type === 'pickup_event')) {
        console.log('RiderDashboard: Sync event received', lastEvent.type);
        fetchStats();
    }
  }, [lastEvent]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchStats();
  };

  const StatCard = ({ title, count, icon, color }) => (
    <View style={styles.cardWrapper}>
      <Card style={[styles.card, { borderLeftColor: color, borderLeftWidth: 4 }]}>
        <View style={styles.cardContent}>
          <View>
            <Text style={styles.cardTitle}>{title}</Text>
            <Text style={[styles.cardCount, { color }]}>{count}</Text>
          </View>
          <View style={[styles.iconContainer, { backgroundColor: color + '20' }]}>
            <Ionicons name={icon} size={24} color={color} />
          </View>
        </View>
      </Card>
    </View>
  );

  if (loading && !refreshing && Object.values(stats).reduce((a, b) => a + b, 0) === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={tokens.colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <Text style={styles.greeting}>Rider Dashboard</Text>
        <Text style={styles.subtitle}>Order Pipeline Overview</Text>
      </View>

      <View style={styles.grid}>
        <StatCard 
          title="Pending" 
          count={stats.pending} 
          icon="time-outline" 
          color={tokens.colors.warning} 
        />
        <StatCard 
          title="Accepted" 
          count={stats.accepted} 
          icon="checkmark-circle-outline" 
          color={tokens.colors.info} 
        />
        <StatCard 
          title="Picked Up" 
          count={stats.picked_up} 
          icon="cube-outline" 
          color={tokens.colors.primary} 
        />
        <StatCard 
          title="Processing" 
          count={stats.processing} 
          icon="water-outline" 
          color={tokens.colors.secondary} 
        />
        <StatCard 
          title="Ready" 
          count={stats.ready} 
          icon="happy-outline" 
          color={tokens.colors.success} 
        />
        <StatCard 
          title="Delivered" 
          count={stats.delivered} 
          icon="home-outline" 
          color={tokens.colors.textSecondary} 
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.colors.background,
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    marginBottom: 24,
  },
  greeting: {
    fontSize: 24,
    fontWeight: 'bold',
    color: tokens.colors.text,
  },
  subtitle: {
    fontSize: 16,
    color: tokens.colors.textSecondary,
    marginTop: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    justifyContent: 'space-between',
  },
  cardWrapper: {
    width: '47%', // roughly half width with gap
    marginBottom: 16,
  },
  card: {
    padding: 16,
    height: 120,
    justifyContent: 'center',
  },
  cardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 14,
    color: tokens.colors.textSecondary,
    marginBottom: 8,
  },
  cardCount: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  iconContainer: {
    padding: 10,
    borderRadius: 12,
  },
});
