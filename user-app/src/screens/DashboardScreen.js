import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Button, StyleSheet, FlatList, Alert, RefreshControl } from 'react-native';
import { student } from '../services/api';
import { useFocusEffect } from '@react-navigation/native';

export default function DashboardScreen({ route, navigation }) {
  const { user } = route.params || {};
  const [activePlan, setActivePlan] = useState(null);
  const [orders, setOrders] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [navLock, setNavLock] = useState(false);

  const fetchData = async () => {
    if (!user) return;
    try {
      // Mock Subscription Fetch - In real app, create getSubscription endpoint
      const subRes = await student.getSubscription(user.user_id);
      setActivePlan(subRes.data);
      
      const orderRes = await student.getOrders(user.user_id);
      setOrders(orderRes.data);
    } catch (error) {
      console.error('Error fetching data', error);
    } finally {
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [user])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  if (!user) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text>No user data found.</Text>
        <Button title="Go to Login" onPress={() => navigation.replace('Login')} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.welcome}>Welcome, {user.full_name}</Text>

      {activePlan && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Current Plan: {activePlan.Plan?.name}</Text>
          <Text>Remaining Pickups: {activePlan.remaining_pickups} / {activePlan.Plan?.max_pickups}</Text>
        </View>
      )}

      <Button
        title="Book Pickup"
        onPress={() => {
          if (navLock) return;
          setNavLock(true);
          navigation.navigate('BookPickup', { user, activePlan });
          setTimeout(() => setNavLock(false), 600);
        }}
      />

      <Text style={styles.sectionTitle}>Active Orders</Text>
      <FlatList
        data={orders}
        keyExtractor={(item) => item.order_id.toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => (
          <View style={styles.orderItem}>
            <Text style={styles.orderText}>Order #{item.order_id} - {item.pickup_date}</Text>
            <Text style={styles.orderStatus}>Status: {item.status.toUpperCase()}</Text>
            {item.Codes && item.Codes.length > 0 && (
              <Text>Code: {item.Codes[0].code_value} ({item.Codes[0].type})</Text>
            )}
            <Text>Clothes: {item.clothes_count} (+{item.extra_clothes} extra)</Text>
          </View>
        )}
        ListEmptyComponent={<Text>No active orders</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  welcome: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  card: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 20,
    marginBottom: 10,
  },
  orderItem: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    flexDirection: 'column',
  },
  orderText: {
    fontWeight: 'bold',
  },
  orderStatus: {
    color: 'blue',
    marginTop: 5,
  },
});
