import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSync } from '../context/SyncContext';
import { student } from '../services/api';
import { Ionicons } from '@expo/vector-icons';

export default function CodesScreen({ route }) {
  const { user } = route.params || {};
  const [orders, setOrders] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const { lastEvent } = useSync();

  const fetchCodes = useCallback(async () => {
    if (!user) return;
    try {
      const res = await student.getOrders(user.user_id);
      setOrders(res.data || []);
    } catch {
      setOrders([]);
    } finally {
      setRefreshing(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      fetchCodes();
    }, [fetchCodes])
  );

  // Real-time Sync
  useEffect(() => {
    if (lastEvent && (lastEvent.type === 'order_updated' || lastEvent.type === 'order_created' || lastEvent.type === 'poll_refresh')) {
        console.log('CodesScreen: Sync event, refreshing...');
        fetchCodes();
    }
  }, [lastEvent, fetchCodes]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchCodes();
  };

  const allCodes = orders.flatMap(o => (o.Codes || []).map(c => ({ ...c, order: o })));
  const activeRelease = allCodes.find(
    c =>
      c.type === 'release' &&
      c.order?.status === 'ready' &&
      !c.used &&
      (!c.expires_at || new Date(c.expires_at) > new Date())
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>My Codes</Text>
      <Text style={styles.sub}>Show these codes when collecting laundry</Text>

      <FlatList
        data={allCodes}
        keyExtractor={(item) => String(item.code_id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <>
            <View style={[styles.card, activeRelease && styles.cardActive]}>
              {activeRelease ? (
                <>
                  <Text style={[styles.label, styles.labelActive]}>Release Code</Text>
                  <Text style={[styles.code, styles.codeActive]}>{activeRelease.code_value}</Text>
                  <Text style={[styles.small, styles.smallActive]}>Show this code at the counter to collect your laundry</Text>
                </>
              ) : (
                <>
                  <View style={styles.emptyIcon}><Ionicons name="key-outline" color="#6B7280" size={28} /></View>
                  <Text style={styles.emptyTitle}>No Active Release Code</Text>
                  <Text style={styles.emptySub}>Your release code will appear here when your laundry is ready for collection</Text>
                </>
              )}
            </View>

            {activeRelease && (
              <View style={styles.card}>
                <Text style={styles.label}>Order Details</Text>
                <Text style={styles.small}>Order Code: #{activeRelease.order.order_id}</Text>
                <Text style={styles.small}>Items: {activeRelease.order.clothes_count} pieces</Text>
                <View style={[styles.badgeInline, styles.badgeReady]}>
                  <Text style={styles.badgeText}>READY FOR COLLECTION</Text>
                </View>
              </View>
            )}

            <Text style={styles.sectionTitle}>All Order Codes</Text>
          </>
        }
        ListEmptyComponent={
          <Text style={styles.emptyList}>No active orders</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.item}>
            <View style={styles.rowBetween}>
              <Text style={styles.orderId}>#{item.order.order_id}</Text>
              <View style={[styles.badge, item.type === 'release' ? styles.badgeReady : styles.badgePickup]}>
                <Text style={styles.badgeText}>{item.type === 'release' ? 'RELEASE' : 'PICKUP'}</Text>
              </View>
            </View>
            <Text style={styles.code}>{item.code_value}</Text>
            <Text style={styles.small}>
              {item.used ? 'Used' : 'Not used'} • {item.expires_at ? `Expires ${new Date(item.expires_at).toDateString()}` : 'No expiry'}
            </Text>
            <View style={[styles.badgeInline, item.order.status === 'ready' ? styles.badgeReady : styles.badgePickup]}>
              <Text style={styles.badgeText}>{item.order.status === 'ready' ? 'READY FOR COLLECTION' : item.order.status.replace('_', ' ').toUpperCase()}</Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC', padding: 16 },
  title: { fontSize: 20, fontWeight: 'bold' },
  sub: { color: '#6B7280', marginBottom: 12 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16 },
  cardActive: { backgroundColor: '#10B981' },
  label: { color: '#374151' },
  labelActive: { color: '#D1FAE5' },
  code: { fontSize: 24, fontWeight: 'bold', letterSpacing: 2, color: '#111827' },
  codeActive: { color: '#ECFDF5' },
  small: { color: '#6B7280', marginTop: 6 },
  smallActive: { color: '#ECFDF5' },
  emptyIcon: { alignItems: 'center', marginBottom: 6 },
  emptyTitle: { textAlign: 'center', fontWeight: 'bold', color: '#111827' },
  emptySub: { textAlign: 'center', color: '#6B7280', marginTop: 4 },
  sectionTitle: { fontWeight: 'bold', marginBottom: 8 },
  emptyList: { color: '#6B7280' },
  item: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderId: { fontWeight: 'bold', color: '#111827' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { color: '#fff', fontSize: 12 },
  badgeReady: { backgroundColor: '#10B981' },
  badgePickup: { backgroundColor: '#F59E0B' },
  badgeInline: { alignSelf: 'flex-start', marginTop: 8 }
});
