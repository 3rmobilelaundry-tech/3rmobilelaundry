import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { staff } from '../../services/api';
import Card from '../../components/ui/Card';
import { getTokens } from '../../theme/tokens';
import { Ionicons } from '@expo/vector-icons';
import { useSync } from '../../context/SyncContext';

const tokens = getTokens();

export default function ReceptionistDashboard({ navigation }) {
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

  const fetchStats = async () => {
    setLoading(true);
    try {
      // We can use the admin overview endpoint or just fetch all orders and count locally if API doesn't support fine-grained stats yet for staff.
      // However, /admin/overview might be restricted or too heavy.
      // Let's use getOrders and count locally for now as it's safer and we need the list anyway.
      // Optimization: create a specific endpoint later if needed.
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
        console.log('ReceptionistDashboard: Sync event received', lastEvent.type);
        fetchStats();
    }
  }, [lastEvent]);

  const StatCard = ({ title, count, icon, color, statusFilter }) => (
    <TouchableOpacity 
      style={styles.cardWrapper}
      onPress={() => navigation.navigate('Orders', { status: statusFilter })}
    >
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
    </TouchableOpacity>
  );

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchStats} />}
    >
      <View style={styles.header}>
        <Text style={styles.greeting}>Receptionist Dashboard</Text>
        <Text style={styles.subtitle}>Order Pipeline Overview</Text>
      </View>

      <View style={styles.grid}>
        <StatCard 
          title="Pending" 
          count={stats.pending} 
          icon="time-outline" 
          color={tokens.colors.warning} 
          statusFilter="pending"
        />
        <StatCard 
          title="Accepted" 
          count={stats.accepted} 
          icon="checkmark-circle-outline" 
          color={tokens.colors.info} 
          statusFilter="accepted"
        />
        <StatCard 
          title="Picked Up" 
          count={stats.picked_up} 
          icon="cube-outline" 
          color={tokens.colors.primary} 
          statusFilter="picked_up"
        />
        <StatCard 
          title="Processing" 
          count={stats.processing} 
          icon="water-outline" 
          color={tokens.colors.secondary} 
          statusFilter="processing"
        />
        <StatCard 
          title="Ready" 
          count={stats.ready} 
          icon="happy-outline" 
          color={tokens.colors.success} 
          statusFilter="ready"
        />
        <StatCard 
          title="Delivered" 
          count={stats.delivered} 
          icon="home-outline" 
          color={tokens.colors.textSecondary} 
          statusFilter="delivered"
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
