import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  FlatList, 
  TextInput, 
  ScrollView,
  StatusBar,
  RefreshControl
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { student } from '../services/api';
import { theme } from '../constants/theme';
import { useSync } from '../context/SyncContext';

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'awaiting', label: 'Awaiting' },
  { id: 'processing', label: 'Processing' },
  { id: 'ready', label: 'Ready' },
  { id: 'delivered', label: 'Delivered' },
];

export default function OrdersScreen({ route, navigation }) {
  const { user } = route.params || {};
  const { lastEvent } = useSync();
  const [activeTab, setActiveTab] = useState('all');
  const [searchText, setSearchText] = useState('');
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Safety check for user session
  useEffect(() => {
    if (!user) {
      // If we somehow got here without a user, redirect to Login
      // This is a fallback; App.js should prevent this.
      setLoading(false);
      // Optional: Navigation redirect if needed, but let's just show empty for now to avoid loops
    }
  }, [user]);

  const fetchOrders = useCallback(async () => {
    if (!user) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const res = await student.getOrders(user.user_id);
      setOrders(res.data || []);
    } catch (err) {
      console.error(err);
      setOrders([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      fetchOrders();
    }, [fetchOrders])
  );

  // Real-time Sync
  useEffect(() => {
    if (lastEvent && (lastEvent.type === 'order_updated' || lastEvent.type === 'order_created' || lastEvent.type === 'poll_refresh' || lastEvent.type === 'pickup_event')) {
        console.log('OrdersScreen: Sync event received, refreshing...');
        fetchOrders();
    }
  }, [lastEvent, fetchOrders]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchOrders();
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'ready':
        return { bg: '#DCFCE7', text: '#166534' }; // Light green
      case 'delivered':
        return { bg: '#F3F4F6', text: '#374151' }; // Light gray
      case 'cancelled':
        return { bg: '#FEE2E2', text: '#991B1B' }; // Light red
      case 'processing':
      case 'picked_up':
        return { bg: '#DBEAFE', text: '#1E40AF' }; // Light blue
      default:
        return { bg: '#FEF3C7', text: '#92400E' }; // Light orange (Awaiting)
    }
  };

  const getStatusLabel = (status) => {
    if (status === 'ready') return 'READY FOR COLLECTION';
    return status.toUpperCase().replace('_', ' ');
  };

  const filteredOrders = useMemo(() => {
    let result = orders;

    // 1. Filter by Tab
    if (activeTab !== 'all') {
      result = result.filter(o => {
        const s = o.status;
        if (activeTab === 'awaiting') return ['pending', 'accepted', 'awaiting_pickup'].includes(s);
        if (activeTab === 'processing') return ['picked_up', 'processing'].includes(s);
        if (activeTab === 'ready') return s === 'ready';
        if (activeTab === 'delivered') return s === 'delivered';
        return false;
      });
    }

    // 2. Filter by Search
    if (searchText) {
      const lower = searchText.toLowerCase();
      result = result.filter(o => 
        (o.pickup_code && o.pickup_code.toLowerCase().includes(lower)) ||
        (o.delivery_code && o.delivery_code.toLowerCase().includes(lower)) ||
        String(o.order_id).includes(lower) ||
        (o.pickup_date && o.pickup_date.includes(lower))
      );
    }

    return result;
  }, [orders, activeTab, searchText]);

  const getTabCount = (tabId) => {
    if (tabId === 'all') return orders.length;
    return orders.filter(o => {
      const s = o.status;
      if (tabId === 'awaiting') return ['pending', 'accepted', 'awaiting_pickup'].includes(s);
      if (tabId === 'processing') return ['picked_up', 'processing'].includes(s);
      if (tabId === 'ready') return s === 'ready';
      if (tabId === 'delivered') return s === 'delivered';
      return false;
    }).length;
  };

  const renderOrderCard = ({ item }) => {
    const statusStyle = getStatusColor(item.status);
    // Display pickup code if available, else Order ID
    const displayCode = item.pickup_code ? `#${item.pickup_code}` : `#${item.order_id}`;
    
    // Format date: "Jan 1, 2026"
    const dateObj = new Date(item.pickup_date);
    const dateStr = isNaN(dateObj) ? item.pickup_date : dateObj.toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    });

    return (
      <View style={styles.card}>
        {/* Header: Code & Status */}
        <View style={styles.cardHeader}>
          <Text style={styles.cardCode}>{displayCode}</Text>
          <View style={styles.badgeRow}>
            {item.is_emergency && (
              <View style={styles.emergencyBadge}>
                <Text style={styles.emergencyBadgeText}>EMERGENCY</Text>
              </View>
            )}
            <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
              <Text style={[styles.statusText, { color: statusStyle.text }]}>
                {getStatusLabel(item.status)}
              </Text>
            </View>
          </View>
        </View>

        {/* Date */}
        <Text style={styles.cardDate}>{dateStr}</Text>

        {/* Details: Pieces & Time */}
        <View style={styles.detailsContainer}>
          <View style={styles.detailRow}>
            <Ionicons name="shirt-outline" size={18} color="#6B7280" />
            <Text style={styles.detailText}>{item.clothes_count} pieces</Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="time-outline" size={18} color="#6B7280" />
            <Text style={styles.detailText}>
              {item.pickup_time_slot || item.pickup_time || 'Morning (8AM - 12PM)'}
            </Text>
          </View>
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Footer: View Details */}
        <TouchableOpacity 
          style={styles.cardFooter}
          onPress={() => navigation.navigate('OrderDetails', { order: item })}
        >
          <Text style={styles.viewDetailsText}>View Details</Text>
          <Ionicons name="chevron-forward" size={16} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      
      {/* Header Title */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Orders</Text>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={20} color="#9CA3AF" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by code..."
            placeholderTextColor="#9CA3AF"
            value={searchText}
            onChangeText={setSearchText}
          />
        </View>
      </View>

      {/* Scrollable Tabs */}
      <View style={styles.tabsContainer}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsContent}
        >
          {TABS.map(tab => {
            const isActive = activeTab === tab.id;
            const count = getTabCount(tab.id);
            return (
              <TouchableOpacity
                key={tab.id}
                style={[styles.tab, isActive && styles.tabActive]}
                onPress={() => setActiveTab(tab.id)}
              >
                <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                  {tab.label}
                </Text>
                {count > 0 && (
                  <View style={[styles.tabBadge, isActive ? styles.tabBadgeActive : styles.tabBadgeInactive]}>
                    <Text style={[styles.tabBadgeText, isActive ? styles.tabBadgeTextActive : styles.tabBadgeTextInactive]}>
                      {count}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Orders List */}
      <FlatList
        data={filteredOrders}
        keyExtractor={item => String(item.order_id)}
        renderItem={renderOrderCard}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          !loading && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No orders found</Text>
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff', // Or slightly off-white if needed, but design looks white/clean
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20, // Adjust for status bar if needed
    paddingBottom: 10,
    backgroundColor: '#fff',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
  },
  searchContainer: {
    paddingHorizontal: 20,
    paddingBottom: 10,
    backgroundColor: '#fff',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6', // Light gray bg for search
    borderRadius: 12, // Rounded corners
    paddingHorizontal: 12,
    height: 48,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#111827',
  },
  tabsContainer: {
    backgroundColor: '#fff',
    paddingBottom: 10,
  },
  tabsContent: {
    paddingHorizontal: 20,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginRight: 10,
    backgroundColor: '#F3F4F6', // Inactive bg (Gray 100)
  },
  tabActive: {
    backgroundColor: '#EFF6FF', // Active bg (Blue 50)
    borderColor: '#2563EB',
    borderWidth: 1,
  },
  tabText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#6B7280', // Inactive text
  },
  tabTextActive: {
    color: '#2563EB', // Active text (Blue 600)
    fontWeight: '600',
  },
  tabBadge: {
    marginLeft: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 12,
    minWidth: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeInactive: {
    backgroundColor: '#9CA3AF', // Gray 400
  },
  tabBadgeActive: {
    backgroundColor: '#2563EB', // Blue 600
  },
  tabBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  tabBadgeTextInactive: {
    color: '#FFFFFF',
  },
  tabBadgeTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: '#F8FAFC', // List background slightly grey?
    minHeight: '100%',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
    // Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardCode: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  emergencyBadge: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  emergencyBadgeText: {
    color: '#B91C1C',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  cardDate: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 16,
  },
  detailsContainer: {
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  detailText: {
    marginLeft: 8,
    fontSize: 15,
    color: '#4B5563',
  },
  divider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginBottom: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  viewDetailsText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.primary,
    marginRight: 4,
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 40,
  },
  emptyText: {
    color: '#9CA3AF',
    fontSize: 16,
  },
});
