import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Alert } from 'react-native';
import { staff, loadAuthSession } from '../../services/api';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import { getTokens } from '../../theme/tokens';
import { Ionicons } from '@expo/vector-icons';
import { useSync } from '../../context/SyncContext';

const tokens = getTokens();

export default function RiderOrdersScreen({ navigation, currentUser }) {
  const { lastEvent } = useSync();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [notifyingId, setNotifyingId] = useState(null);
  const [sessionUser, setSessionUser] = useState(currentUser || null);
  const myId = sessionUser?.user_id ?? sessionUser?.id ?? null;

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const response = await staff.getOrders({});
      // Filter out Pending orders. Show everything else.
      const visibleOrders = response.data.filter(o => o.status !== 'pending');
      setOrders(visibleOrders);
    } catch (error) {
      console.error('Error fetching orders:', error);
      Alert.alert('Error', 'Failed to fetch orders');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    if (lastEvent && (lastEvent.type === 'order_created' || lastEvent.type === 'order_updated' || lastEvent.type === 'pickup_event')) {
        fetchOrders();
    }
  }, [lastEvent]);

  useEffect(() => {
    if (currentUser) {
      setSessionUser(currentUser);
    }
  }, [currentUser]);

  useEffect(() => {
    let active = true;
    if (currentUser) return () => {
      active = false;
    };
    const restoreSession = async () => {
      try {
        const { user } = await loadAuthSession();
        if (!active) return;
        if (user) {
          setSessionUser(user);
        }
      } catch {}
    };
    restoreSession();
    return () => {
      active = false;
    };
  }, [currentUser]);

  const handleNotify = async (order) => {
    setNotifyingId(order.order_id);
    try {
      await staff.notifyUser(order.order_id);
      Alert.alert('Success', 'Notification sent to user');
    } catch (error) {
      Alert.alert('Error', error.response?.data?.error || 'Failed to send notification');
    } finally {
      setNotifyingId(null);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'accepted': return tokens.colors.info;
      case 'picked_up': return tokens.colors.primary;
      case 'processing': return tokens.colors.secondary;
      case 'ready': return tokens.colors.success;
      case 'delivered': return tokens.colors.textSecondary;
      case 'cancelled': return tokens.colors.danger;
      default: return tokens.colors.textMuted;
    }
  };

  const renderItem = ({ item }) => {
    const canNotify = ['accepted', 'ready'].includes(item.status);
    
    return (
    <Card style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.idContainer}>
          <Ionicons name="receipt-outline" size={20} color={tokens.colors.primary} />
          <Text style={styles.orderId}>Order #{item.order_id}</Text>
        </View>
        <Badge style={{ backgroundColor: getStatusColor(item.status) }}>
          {item.status.replace('_', ' ').toUpperCase()}
        </Badge>
      </View>
      
      <View style={styles.divider} />
      
      <View style={styles.detailsContainer}>
        <View style={styles.detailRow}>
            <Ionicons name="person-outline" size={16} color="#6B7280" />
            <Text style={styles.detailText}>{item.User?.full_name || 'Unknown User'}</Text>
        </View>
        <View style={styles.detailRow}>
            <Ionicons name="call-outline" size={16} color="#6B7280" />
            <Text style={styles.detailText}>{item.User?.phone_number || 'No Phone'}</Text>
        </View>
        <View style={styles.detailRow}>
            <Ionicons name="location-outline" size={16} color="#6B7280" />
            <Text style={styles.detailText}>
              {item.status === 'ready' || item.status === 'delivered' 
                ? (item.delivery_address || item.pickup_address || item.User?.hostel_address || 'No Address') 
                : (item.pickup_address || item.User?.hostel_address || 'No Address')}
            </Text>
        </View>
      </View>

      {canNotify && (
        <View style={styles.actionContainer}>
          <Button 
              title={notifyingId === item.order_id ? "Sending..." : "Notify User"} 
              onPress={() => handleNotify(item)}
              disabled={notifyingId === item.order_id}
              variant="outline"
              style={{ width: '100%', marginBottom: 8 }}
              icon="notifications-outline"
          />
        </View>
      )}

      {myId !== null && item.assigned_rider_id !== null && String(item.assigned_rider_id) === String(myId) && (
        <View style={!canNotify ? styles.actionContainer : {}}>
          <Button 
              title="Chat with User" 
              onPress={() => navigation.navigate('Chat', { 
                orderId: item.order_id,
                orderUser: {
                  name: item.User?.full_name || 'Unknown User',
                  phone: item.User?.phone_number || 'No Phone'
                },
                orderStatus: item.status
              })}
              variant="primary"
              style={{ width: '100%' }}
              icon="chatbubble-ellipses-outline"
          />
        </View>
      )}
    </Card>
  )};

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Orders</Text>
        <Text style={styles.subtitle}>View and notify active orders</Text>
      </View>

      {loading && !orders.length ? (
        <ActivityIndicator size="large" color={tokens.colors.primary} style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={orders}
          renderItem={renderItem}
          keyExtractor={item => String(item.order_id)}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="list-outline" size={64} color="#D1D5DB" />
              <Text style={styles.emptyText}>No active orders found</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    padding: 16,
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
  listContent: {
    paddingBottom: 20,
  },
  card: {
    marginBottom: 16,
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  idContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  orderId: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginBottom: 12,
  },
  detailsContainer: {
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  detailText: {
    fontSize: 16,
    color: '#374151',
    flex: 1, // Allow text to wrap
  },
  actionContainer: {
    marginTop: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
  },
});
