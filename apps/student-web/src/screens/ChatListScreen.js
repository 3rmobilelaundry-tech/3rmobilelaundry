import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { student } from '../services/api';
import { theme } from '../constants/theme';
import { useSync } from '../context/SyncContext';

export default function ChatListScreen({ route, navigation }) {
  const { user } = route.params || {};
  const { lastEvent } = useSync();
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchChats = useCallback(async () => {
    if (!user?.user_id) {
      setLoading(false);
      setRefreshing(false);
      setChats([]);
      return;
    }
    try {
      const res = await student.getChats(user.user_id);
      setChats(res.data || []);
    } catch (error) {
      console.error('Error fetching chats:', error);
      setChats([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      fetchChats();
    }, [fetchChats])
  );

  useEffect(() => {
    if (lastEvent && (lastEvent.type === 'order_updated' || lastEvent.type === 'poll_refresh')) {
      fetchChats();
    }
  }, [lastEvent, fetchChats]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchChats();
  };

  const renderItem = ({ item }) => {
    const isUnread = item.unreadCount > 0;
    const orderStatus = item.Order?.status;
    const lastMessage = item.lastMessage?.message || 'No messages yet';
    const lastTime = item.lastMessage?.timestamp
      ? new Date(item.lastMessage.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '';

    return (
      <TouchableOpacity
        style={[styles.chatItem, isUnread && styles.unreadItem]}
        onPress={() => navigation.navigate('Chat', { orderId: item.order_id })}
      >
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={20} color="#fff" />
          </View>
          {isUnread && <View style={styles.badge} />}
        </View>

        <View style={styles.chatContent}>
          <View style={styles.headerRow}>
            <Text style={[styles.title, isUnread && styles.unreadText]}>Order #{item.order_id}</Text>
            <Text style={styles.time}>{lastTime}</Text>
          </View>
          <View style={styles.subRow}>
            <Text style={styles.statusText}>{orderStatus ? orderStatus.toUpperCase().replace('_', ' ') : 'UNKNOWN'}</Text>
          </View>
          <Text style={[styles.lastMessage, isUnread && styles.unreadText]} numberOfLines={1}>
            {lastMessage}
          </Text>
        </View>

        <Ionicons name="chevron-forward" size={20} color={theme.colors.textTertiary} />
      </TouchableOpacity>
    );
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Messages</Text>
      </View>
      <FlatList
        data={chats}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="chatbubbles-outline" size={48} color={theme.colors.textTertiary} />
            <Text style={styles.emptyText}>No conversations yet</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  listContent: {
    padding: 16,
  },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  unreadItem: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary + '10',
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#EF4444',
    borderWidth: 2,
    borderColor: theme.colors.surface,
  },
  chatContent: {
    flex: 1,
    marginRight: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text,
  },
  unreadText: {
    color: theme.colors.primary,
  },
  time: {
    fontSize: 11,
    color: theme.colors.textTertiary,
  },
  subRow: {
    marginBottom: 4,
  },
  statusText: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },
  lastMessage: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyText: {
    marginTop: 10,
    color: theme.colors.textTertiary,
  },
});
