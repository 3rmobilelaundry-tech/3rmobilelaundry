import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Platform, Dimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { student } from '../services/api';
import { useAuth } from '../context/AuthContext';

const { width } = Dimensions.get('window');

export default function PlanScreen({ navigation, route }) {
  const { userData } = useAuth();
  const user = route.params?.user || userData;

  if (!user) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>Error: User not found</Text>
      </View>
    );
  }

  const [plans, setPlans] = useState([]);
  const [currentSub, setCurrentSub] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState('weekly'); // weekly | monthly | semester

  const fetchData = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      // Only show loading on first load to avoid flicker
      if (plans.length === 0) setLoading(true);
      
      const [pRes, sRes] = await Promise.all([
        student.getPlans(),
        student.getSubscription(user.user_id)
      ]);
      setPlans(pRes.data);
      setCurrentSub(sRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [user, plans.length]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  const handleSubscribe = (plan) => {
    navigation.navigate('PlanPayment', { plan, user });
  };

  const filteredPlans = plans.filter(p => {
    const type = p.type || 'monthly';
    return type === selectedTab && p.status === 'active';
  });

  const renderTab = (key, label) => (
    <TouchableOpacity 
      style={[styles.tab, selectedTab === key && styles.activeTab]} 
      onPress={() => setSelectedTab(key)}
    >
      <Text style={[styles.tabText, selectedTab === key && styles.activeTabText]}>{label}</Text>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Header */}
      <View style={styles.headerContainer}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Choose Your Plan</Text>
        <View style={{width: 24}} /> 
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        {renderTab('weekly', 'Weekly Plans')}
        {renderTab('monthly', 'Monthly Plans')}
        {renderTab('semester', 'Semester Plans')}
      </View>

      {/* Plans List */}
      <View style={styles.plansList}>
        {filteredPlans.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No plans available for this category.</Text>
          </View>
        ) : (
          filteredPlans.map((plan) => (
            <View key={plan.plan_id} style={styles.planCard}>
              <View style={styles.planHeader}>
                <Text style={styles.planName}>{plan.name}</Text>
                <Text style={styles.planPrice}>₦{parseInt(plan.price).toLocaleString()}</Text>
              </View>
              <Text style={styles.planDesc}>{plan.description_text}</Text>
              
              <View style={styles.featuresList}>
                <View style={styles.featureItem}>
                  <Ionicons name="shirt-outline" size={16} color="#666" />
                  <Text style={styles.featureText}>{plan.max_laundry_items} Items/Week</Text>
                </View>
                <View style={styles.featureItem}>
                  <Ionicons name="time-outline" size={16} color="#666" />
                  <Text style={styles.featureText}>{plan.duration_days} Days Validity</Text>
                </View>
              </View>

              <TouchableOpacity 
                style={styles.subBtn}
                onPress={() => handleSubscribe(plan)}
              >
                <Text style={styles.subBtnText}>Subscribe Now</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingTop: 50 },
  headerTitle: { fontSize: 20, fontWeight: 'bold' },
  tabsContainer: { flexDirection: 'row', justifyContent: 'center', marginBottom: 20, paddingHorizontal: 20 },
  tab: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, marginHorizontal: 4, backgroundColor: '#F3F4F6' },
  activeTab: { backgroundColor: '#4F46E5' },
  tabText: { color: '#374151', fontWeight: '500' },
  activeTabText: { color: '#fff' },
  plansList: { paddingHorizontal: 20 },
  planCard: { backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 3, borderWidth: 1, borderColor: '#F3F4F6' },
  planHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  planName: { fontSize: 18, fontWeight: 'bold', color: '#111827' },
  planPrice: { fontSize: 18, fontWeight: 'bold', color: '#4F46E5' },
  planDesc: { color: '#6B7280', marginBottom: 16, lineHeight: 20 },
  featuresList: { marginBottom: 20, gap: 8 },
  featureItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  featureText: { color: '#4B5563', fontSize: 14 },
  subBtn: { backgroundColor: '#4F46E5', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  subBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  emptyState: { padding: 40, alignItems: 'center' },
  emptyText: { color: '#9CA3AF' }
});
