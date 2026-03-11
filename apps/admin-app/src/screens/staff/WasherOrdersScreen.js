import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { staff } from '../../services/api';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import { getTokens } from '../../theme/tokens';
import { Ionicons } from '@expo/vector-icons';
import { useSync } from '../../context/SyncContext';

const tokens = getTokens();

export default function WasherOrdersScreen({ currentUser }) {
  const { lastEvent } = useSync();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [processingId, setProcessingId] = useState(null);

  const fetchOrders = useCallback(async (isRefreshing = false) => {
    if (isRefreshing) {
        setRefreshing(true);
    } else {
        setLoading(true);
    }
    try {
      // Washer only sees Processing orders
      const response = await staff.getOrders({ status: 'processing' });
      setOrders(response.data);
    } catch (error) {
      console.error('Error fetching orders:', error);
      Alert.alert('Error', 'Failed to fetch orders');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    if (lastEvent && (lastEvent.type === 'order_created' || lastEvent.type === 'order_updated' || lastEvent.type === 'pickup_event')) {
        fetchOrders();
    }
  }, [lastEvent, fetchOrders]);

  const onRefresh = () => {
      fetchOrders(true);
  };

  const handleMarkReady = useCallback(async (order) => {
    setProcessingId(order.order_id);
    try {
        console.log(`[Washer] Marking order ${order.order_id} as ready...`);
        // Optimistic Update: Remove from list immediately
        setOrders(prev => prev.filter(o => o.order_id !== order.order_id));
        
        // Washer Logic: Processing -> Ready ONLY
        await staff.updateStatus(order.order_id, { 
            status: 'ready',
            version: order.version 
        });
        console.log(`[Washer] Order ${order.order_id} updated successfully.`);
        
        // Slight delay to ensure DB propagation before re-fetching
        setTimeout(() => {
            fetchOrders();
        }, 500);
        
    } catch (error) {
        console.error(`[Washer] Failed to update order ${order.order_id}:`, error);
        // If failed, we might need to restore the item, but usually a refresh is safer
        // Check if error suggests it was already updated (403 or 409)
        if (error.response?.status === 409) {
            Alert.alert('Update Conflict', 'Order was modified by someone else. Refreshing list.');
        } else if (error.response?.status === 403 && error.response?.data?.error?.toLowerCase().includes('processing')) {
            // Likely already moved from processing
            // No alert needed, just refresh, as it's what we wanted (it's gone)
        } else {
            // Restore item if it was a genuine error (e.g. network)
            Alert.alert('Error', error.response?.data?.error || 'Failed to update order');
            // Re-fetch to restore state
        }
        fetchOrders();
    } finally {
        setProcessingId(null);
    }
  }, [fetchOrders]);

  const renderItem = useCallback(({ item }) => (
    <Card style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.idContainer}>
          <Ionicons name="receipt-outline" size={20} color={tokens.colors.primary} />
          <Text style={styles.orderId}>Order #{item.order_id}</Text>
        </View>
        <Badge style={{ backgroundColor: '#06B6D4' }}>Processing</Badge>
      </View>
      
      <View style={styles.divider} />
      
      <View style={styles.detailsContainer}>
        <View style={styles.detailRow}>
            <Ionicons name="person-outline" size={16} color="#6B7280" />
            <Text style={styles.detailText}>{item.User?.full_name || 'Unknown User'}</Text>
        </View>
        <View style={styles.detailRow}>
            <Ionicons name="location-outline" size={16} color="#6B7280" />
            <Text style={styles.detailText}>{item.pickup_address || item.User?.hostel_address || 'No Address'}</Text>
        </View>
        <View style={styles.detailRow}>
            <Ionicons name="shirt-outline" size={16} color="#6B7280" />
            <Text style={styles.detailText}>{item.clothes_count} Items</Text>
        </View>
      </View>

      <View style={styles.actionContainer}>
        <Button 
            title="Mark Ready" 
            onPress={() => handleMarkReady(item)}
            loading={processingId === item.order_id}
            disabled={processingId !== null} 
            variant="primary"
            style={{ width: '100%' }}
        />
      </View>
    </Card>
  ), [processingId, handleMarkReady]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Processing Orders</Text>
        <Text style={styles.subtitle}>Orders waiting for wash/dry/fold</Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={tokens.colors.primary} />
        </View>
      ) : (
        <FlatList
          data={orders}
          renderItem={renderItem}
          keyExtractor={item => String(item.order_id)}
          contentContainerStyle={styles.listContent}
          refreshControl={
             <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[tokens.colors.primary]} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
                <Ionicons name="checkmark-circle-outline" size={64} color={tokens.colors.success} />
                <Text style={styles.emptyText}>All Caught Up!</Text>
                <Text style={styles.emptySubtext}>No orders pending processing</Text>
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
