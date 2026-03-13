import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Button, StyleSheet, FlatList, RefreshControl, Alert } from 'react-native';
import { isInvalidTokenError, normalizeApiError, onAuthExpired, staff } from '../services/api';
import { useFocusEffect } from '@react-navigation/native';
import { useSync } from '../context/SyncContext';

export default function DashboardScreen({ route, navigation }) {
  const { user } = route.params;
  const { lastEvent } = useSync();
  const [orders, setOrders] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [navLock, setNavLock] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthExpired(() => {
      navigation.replace('Login');
    });
    return unsubscribe;
  }, [navigation]);

  const fetchOrders = async () => {
    try {
      let status = '';
      if (user.role === 'rider') status = 'awaiting_pickup';
      if (user.role === 'washer') status = 'processing';
      if (user.role === 'receptionist') status = 'ready';
      
      const response = await staff.getOrders(status);
      setOrders(response.data);
    } catch (error) {
      const normalized = error?.normalized || normalizeApiError(error);
      if (isInvalidTokenError(normalized)) return;
      // Suppress 404 errors for orders
      if (error.response?.status === 404) {
          setOrders([]);
          return;
      }
      console.log('Error fetching orders', normalized);
    } finally {
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchOrders();
    }, [])
  );

  // Real-time Sync
  useEffect(() => {
    if (lastEvent && (lastEvent.type === 'order_created' || lastEvent.type === 'order_updated' || lastEvent.type === 'pickup_event')) {
        fetchOrders();
    }
  }, [lastEvent]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchOrders();
  };

  const handleUpdateStatus = async (orderId, newStatus) => {
    try {
      const order = orders.find(o => o.order_id === orderId);
      // Pass version for conflict resolution
      await staff.updateStatus(orderId, { status: newStatus, version: order?.version });
      Alert.alert('Success', `Order marked as ${newStatus}`);
      fetchOrders();
    } catch (error) {
      if (error.response?.status === 409) {
          Alert.alert('Update Conflict', 'This order has been updated by someone else. Refreshing data...', [
              { text: 'OK', onPress: () => fetchOrders() }
          ]);
      } else {
          Alert.alert('Error', error.response?.data?.error || 'Update failed');
      }
    }
  };

  const renderOrderItem = ({ item }) => (
    <View style={styles.orderItem}>
      <Text style={styles.orderTitle}>Order #{item.order_id} - {item.status.toUpperCase()}</Text>
      <Text>User: {item.User?.full_name}</Text>
      <Text>Address: {item.User?.hostel_address}</Text>
      <Text>Clothes: {item.clothes_count}</Text>
      {item.notes ? <Text style={{fontStyle:'italic'}}>Note: {item.notes}</Text> : null}
      
      <View style={styles.actions}>
        {user.role === 'rider' && item.status === 'awaiting_pickup' && (
          <Button
            title="Pick Up (Scan)"
            onPress={() => {
              if (navLock) return;
              setNavLock(true);
              navigation.navigate('ScanCode', { action: 'pickup', orderId: item.order_id, version: item.version });
              setTimeout(() => setNavLock(false), 600);
            }}
          />
        )}
        
        {user.role === 'washer' && item.status === 'processing' && (
          <Button title="Mark Ready" onPress={() => handleUpdateStatus(item.order_id, 'ready')} />
        )}

        {(user.role === 'receptionist' || user.role === 'admin' || user.role === 'head_admin') && item.status === 'ready' && (
          <Button
            title="Release (Scan)"
            onPress={() => {
              if (navLock) return;
              setNavLock(true);
              navigation.navigate('ScanCode', { action: 'release', orderId: item.order_id, version: item.version });
              setTimeout(() => setNavLock(false), 600);
            }}
          />
        )}

        {/* Admin/Washer can start processing picked up items */}
        {(user.role === 'admin' || user.role === 'head_admin' || user.role === 'washer') && item.status === 'picked_up' && (
           <Button title="Start Washing" onPress={() => handleUpdateStatus(item.order_id, 'processing')} color="orange" />
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Staff Portal: {user.role.toUpperCase()}</Text>
      <Text style={styles.subHeader}>Welcome, {user.full_name}</Text>

      {(user.role === 'admin' || user.role === 'head_admin') && (
        <View style={{ marginBottom: 20 }}>
          <Button
            title="Manage Plans"
            onPress={() => {
              if (navLock) return;
              setNavLock(true);
              navigation.navigate('HeadAdmin');
              setTimeout(() => setNavLock(false), 600);
            }}
            color="#0EA5A8"
          />
        </View>
      )}

      <Text style={styles.sectionTitle}>Pending Tasks</Text>
      <FlatList
        data={orders}
        keyExtractor={(item) => item.order_id.toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={renderOrderItem}
        ListEmptyComponent={<Text>No pending tasks found.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f0f0f0',
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  subHeader: {
    fontSize: 18,
    marginBottom: 20,
    color: '#555',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  orderItem: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
  },
  orderTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  actions: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
});
