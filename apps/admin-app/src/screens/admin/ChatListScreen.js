import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';
import { getTokens } from '../../theme/tokens';

const tokens = getTokens();

export default function ChatListScreen() {
  const navigation = useNavigation();
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchChats = async () => {
    try {
      const response = await api.get('/api/chats');
      setChats(response.data);
    } catch (error) {
      console.error('Error fetching chats:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchChats();
      // Optional: Set up polling or socket listener for updates
      const interval = setInterval(fetchChats, 10000); // Poll every 10s for new messages
      return () => clearInterval(interval);
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchChats();
  };

  const renderItem = ({ item }) => {
    const isUnread = item.unreadCount > 0;
    
    const customer = item.Customer || item.user || {};
    return (
      <TouchableOpacity 
        style={[styles.chatItem, isUnread && styles.unreadItem]}
        onPress={() => navigation.navigate('Chat', { orderId: item.order_id })}
      >
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {customer.full_name?.charAt(0) || 'U'}
            </Text>
          </View>
          {isUnread && <View style={styles.badge} />}
        </View>
        
        <View style={styles.chatContent}>
          <View style={styles.headerRow}>
            <Text style={[styles.userName, isUnread && styles.unreadText]}>
              {customer.full_name || 'Unknown User'}
            </Text>
            <Text style={styles.time}>
              {item.lastMessage ? new Date(item.lastMessage.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
            </Text>
          </View>
          
          <View style={styles.subRow}>
            <Text style={styles.orderId}>Order #{item.order_id}</Text>
            <View style={styles.statusContainer}>
               <Text style={styles.orderStatus}>{item.Order?.status || 'Unknown'}</Text>
            </View>
          </View>

          <Text style={[styles.lastMessage, isUnread && styles.unreadMessage]} numberOfLines={1}>
            {item.lastMessage?.message || 'No messages yet'}
          </Text>
        </View>
        
        <Ionicons name="chevron-forward" size={20} color={tokens.colors.textMuted} />
      </TouchableOpacity>
    );
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={tokens.colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Messages</Text>
      </View>
      
      <FlatList
        data={chats}
        renderItem={renderItem}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="chatbubbles-outline" size={48} color={tokens.colors.textMuted} />
            <Text style={styles.emptyText}>No active conversations</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    padding: tokens.spacing.lg,
    backgroundColor: tokens.colors.card,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.border,
  },
  title: {
    fontSize: tokens.typography.sizes.xl,
    fontWeight: tokens.typography.weights.bold,
    color: tokens.colors.text,
  },
  listContent: {
    padding: tokens.spacing.md,
  },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tokens.colors.card,
    padding: tokens.spacing.md,
    borderRadius: tokens.radius.md,
    marginBottom: tokens.spacing.sm,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  unreadItem: {
    borderColor: tokens.colors.primary,
    backgroundColor: 'rgba(37, 99, 235, 0.05)',
  },
  avatarContainer: {
    position: 'relative',
    marginRight: tokens.spacing.md,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: tokens.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: tokens.typography.sizes.lg,
    fontWeight: tokens.typography.weights.bold,
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: tokens.colors.danger,
    borderWidth: 2,
    borderColor: tokens.colors.card,
  },
  chatContent: {
    flex: 1,
    marginRight: tokens.spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  userName: {
    fontSize: tokens.typography.sizes.md,
    fontWeight: tokens.typography.weights.bold,
    color: tokens.colors.text,
  },
  unreadText: {
    color: tokens.colors.primary,
  },
  time: {
    fontSize: tokens.typography.sizes.xs,
    color: tokens.colors.textMuted,
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  orderId: {
    fontSize: tokens.typography.sizes.xs,
    color: tokens.colors.textMuted,
    marginRight: 8,
    fontWeight: '600',
  },
  statusContainer: {
    backgroundColor: tokens.colors.background,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  orderStatus: {
    fontSize: 10,
    color: tokens.colors.text,
    textTransform: 'uppercase',
  },
  lastMessage: {
    fontSize: tokens.typography.sizes.sm,
    color: tokens.colors.textMuted,
  },
  unreadMessage: {
    color: tokens.colors.text,
    fontWeight: '500',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.spacing.xxl,
  },
  emptyText: {
    marginTop: tokens.spacing.md,
    color: tokens.colors.textMuted,
    fontSize: tokens.typography.sizes.md,
  },
});
