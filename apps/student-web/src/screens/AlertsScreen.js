import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { theme } from '../constants/theme';
import api, { student } from '../services/api';
import { useSync } from '../context/SyncContext';
import PageLayout from '../components/PageLayout';

export default function AlertsScreen({ route }) {
  const { user } = route.params || {};
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { lastEvent } = useSync();

  const fetchNotifications = useCallback(async () => {
    if (!user) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const res = await student.getNotifications(user.user_id);
      setNotifications(res.data);
    } catch (error) {
      console.error('Failed to fetch notifications', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      fetchNotifications();
    }, [fetchNotifications])
  );

  // Real-time Sync
  useEffect(() => {
    if (lastEvent && (lastEvent.type === 'order_updated' || lastEvent.type === 'order_created' || lastEvent.type === 'poll_refresh')) {
        console.log('AlertsScreen: Sync event, refreshing...');
        fetchNotifications();
    }
  }, [lastEvent, fetchNotifications]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchNotifications();
  };

  const getIcon = (type) => {
    switch (type) {
      case 'success': return { name: 'checkmark-circle', color: theme.colors.success };
      case 'warning': return { name: 'alert-circle', color: theme.colors.warning };
      case 'error': return { name: 'close-circle', color: theme.colors.error };
      default: return { name: 'information-circle', color: theme.colors.info };
    }
  };

  const renderItem = ({ item }) => {
    const icon = getIcon(item.type);
    const date = new Date(item.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    return (
      <View style={[styles.card, !item.read_at && styles.unreadCard]}>
        <View style={styles.iconContainer}>
          <Ionicons name={icon.name} size={24} color={icon.color} />
        </View>
        <View style={styles.contentContainer}>
          <Text style={styles.cardTitle}>{item.title}</Text>
          <Text style={styles.cardBody}>{item.message}</Text>
          <Text style={styles.timestamp}>{date}</Text>
        </View>
        {!item.read_at && <View style={styles.badge} />}
      </View>
    );
  };

  return (
    <PageLayout 
      user={user} 
      loading={loading} 
      refreshing={refreshing} 
      onRefresh={onRefresh}
      scrollable={false}
      noPadding
    >
      <View style={styles.fixedHeader}>
        <Text style={styles.pageTitle}>Notifications</Text>
        {notifications.length > 0 && (
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{notifications.length}</Text>
          </View>
        )}
      </View>

      {notifications.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="notifications-off-outline" size={64} color={theme.colors.textTertiary} />
          <Text style={styles.emptyTitle}>No notifications yet</Text>
          <Text style={styles.emptySub}>We'll let you know when there's an update.</Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => String(item.id || Math.random())}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
        />
      )}
    </PageLayout>
  );
}

const styles = StyleSheet.create({
  fixedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  countBadge: {
    backgroundColor: theme.colors.error,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 8,
  },
  countText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  unreadCard: {
    backgroundColor: '#F0F9FF', // Light blue highlight
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.primary,
  },
  iconContainer: {
    marginRight: 12,
    justifyContent: 'flex-start',
    marginTop: 2,
  },
  contentContainer: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 4,
  },
  cardBody: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 8,
    lineHeight: 20,
  },
  timestamp: {
    fontSize: 12,
    color: theme.colors.textTertiary,
  },
  badge: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.primary,
    position: 'absolute',
    top: 16,
    right: 16,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 20,
    color: theme.colors.text,
  },
  emptySub: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
  },
});
