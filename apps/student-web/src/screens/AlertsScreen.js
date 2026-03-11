import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { theme } from '../constants/theme';
import api, { student } from '../services/api';
import { useSync } from '../context/SyncContext';

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

  if (loading && !refreshing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={theme.typography.h2}>Notifications</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    ...theme.shadows.sm,
  },
  countBadge: {
    backgroundColor: theme.colors.error,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: theme.spacing.sm,
  },
  countText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  listContent: {
    padding: theme.spacing.md,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    marginBottom: theme.spacing.md,
    ...theme.shadows.sm,
  },
  unreadCard: {
    backgroundColor: theme.colors.primaryLight, // Highlight unread
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.primary,
  },
  iconContainer: {
    marginRight: theme.spacing.md,
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
    padding: theme.spacing.xl,
  },
  emptyTitle: {
    ...theme.typography.h3,
    marginTop: theme.spacing.lg,
  },
  emptySub: {
    ...theme.typography.body,
    color: theme.colors.textTertiary,
    textAlign: 'center',
    marginTop: theme.spacing.sm,
  },
});
