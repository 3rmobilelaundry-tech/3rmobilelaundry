import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, FlatList, StyleSheet, KeyboardAvoidingView, Platform, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import io from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../services/api';
import { theme } from '../constants/theme';

export default function ChatScreen({ route, navigation }) {
  const { orderId } = route.params;
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [socket, setSocket] = useState(null);
  const [isOnline, setIsOnline] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [myId, setMyId] = useState(null);
  const [offlineQueue, setOfflineQueue] = useState([]);
  const flatListRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const [chatStatus, setChatStatus] = useState('active');

  const mergeMessages = (current, incoming) => {
    const map = new Map();
    current.forEach((msg) => {
      const key = msg.id ? `id:${msg.id}` : msg.tempId ? `temp:${msg.tempId}` : `idx:${map.size}`;
      map.set(key, msg);
    });
    incoming.forEach((msg) => {
      const key = msg.id ? `id:${msg.id}` : msg.tempId ? `temp:${msg.tempId}` : `idx:${map.size}`;
      if (map.has(key)) {
        map.set(key, { ...map.get(key), ...msg });
      } else {
        map.set(key, msg);
      }
    });
    return Array.from(map.values()).sort((a, b) => {
      const at = new Date(a.timestamp || 0).getTime();
      const bt = new Date(b.timestamp || 0).getTime();
      if (at !== bt) return at - bt;
      const aid = a.id || a.tempId || 0;
      const bid = b.id || b.tempId || 0;
      return aid - bid;
    });
  };

  const sendQueuedMessages = async (queued, socketRef) => {
    for (const queuedMsg of queued) {
      await new Promise((resolve) => {
        socketRef.emit('send_message', { orderId, message: queuedMsg.message }, (ack) => {
          if (ack && ack.status === 'ok') {
            setMessages((current) => mergeMessages(current, [{
              ...queuedMsg,
              id: ack.messageId,
              timestamp: ack.timestamp,
              status: 'sent'
            }]));
          } else {
            setMessages((current) => mergeMessages(current, [{
              ...queuedMsg,
              status: 'failed'
            }]));
          }
          resolve();
        });
      });
    }
  };

  useEffect(() => {
    let newSocket;

    const initSocket = async () => {
      try {
        const token = await AsyncStorage.getItem('userToken');
        const userDataStr = await AsyncStorage.getItem('userData');
        const userData = userDataStr ? JSON.parse(userDataStr) : {};
        const userId = userData.user_id;
        setMyId(userId);
        setConnectionStatus('connecting');

        const socketUrl = API_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5000');

        newSocket = io(socketUrl, {
          auth: { token },
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionAttempts: 5
        });

        const loadingTimeout = setTimeout(() => {
          if (loading) {
            console.warn('[Chat] Loading timeout reached - forcing stop');
            setLoading(false);
          }
        }, 8000);

        newSocket.on('connect', () => {
          console.log('Socket connected');
          setIsOnline(true);
          setConnectionStatus('online');
          if (orderId) {
            newSocket.emit('join_room', { orderId });
          } else {
            console.error('[Chat] No orderId provided');
            setLoading(false);
          }

          setOfflineQueue(prev => {
            if (prev.length > 0) {
              sendQueuedMessages([...prev], newSocket);
            }
            return [];
          });
        });

        newSocket.on('disconnect', () => {
          console.log('[Chat] Socket disconnected');
          setIsOnline(false);
          setConnectionStatus('offline');
        });

        newSocket.on('connect_error', (err) => {
          console.error('[Chat] Connection error:', err.message);
          setIsOnline(false);
          setConnectionStatus('reconnecting');
        });

        newSocket.on('error', (err) => {
          console.error('[Chat] Socket error:', err);
          setIsOnline(false);
          setLoading(false);
          setConnectionStatus('offline');
        });

        newSocket.on('reconnect_attempt', () => {
          setConnectionStatus('reconnecting');
        });

        newSocket.on('reconnect', () => {
          setConnectionStatus('online');
        });

        newSocket.on('reconnect_failed', () => {
          setConnectionStatus('offline');
        });

        newSocket.on('user_status', ({ userId: statusUserId, status }) => {
          if (statusUserId !== userId) {
            setIsOnline(status === 'online');
          }
        });

        newSocket.on('history', (history) => {
          clearTimeout(loadingTimeout);
          setMessages((current) => mergeMessages(current, history));
          setLoading(false);
          setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

          const unreadIds = history
            .filter(m => !m.read_status && m.sender_id !== userId)
            .map(m => m.id);
          if (unreadIds.length > 0) {
            newSocket.emit('mark_read', { orderId, messageIds: unreadIds });
          }
        });

        newSocket.on('chat_status', ({ status }) => {
          setChatStatus(status || 'active');
        });

        newSocket.on('messages_read', ({ messageIds }) => {
          setMessages((prev) => mergeMessages(prev, prev.map((msg) =>
            messageIds.includes(msg.id) ? { ...msg, read_status: true } : msg
          )));
        });

        newSocket.on('receive_message', (msg) => {
          setMessages((prev) => mergeMessages(prev, [msg]));
          setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

          if (msg.sender_id !== userId) {
            newSocket.emit('mark_read', { orderId, messageIds: [msg.id] });
          }
        });

        setSocket(newSocket);
      } catch (error) {
        console.error('[Chat] Initialization error:', error);
        setLoading(false);
      }
    };

    initSocket();

    return () => {
      if (newSocket) newSocket.disconnect();
    };
  }, [orderId]);

  const handleTyping = (text) => {
    setMessage(text);
    if (!socket) return;

    socket.emit('typing', { orderId, isTyping: true });

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    typingTimeoutRef.current = setTimeout(() => {
        socket.emit('typing', { orderId, isTyping: false });
    }, 2000);
  };

  const sendMessage = () => {
    if (chatStatus === 'locked') {
      return;
    }
    if (!message.trim()) return;

    const tempId = Date.now();
    const tempMsg = {
      id: tempId,
      tempId,
      sender_role: 'student',
      sender_id: myId,
      message,
      timestamp: new Date().toISOString(),
      read_status: false,
      status: 'pending'
    };

    setMessages(prev => [...prev, tempMsg]);
    setMessage('');

    if (socket && socket.connected) {
      socket.emit('send_message', { orderId, message: tempMsg.message }, (ack) => {
        if (ack && ack.status === 'ok') {
          setMessages((current) => mergeMessages(current, [{
            ...tempMsg,
            id: ack.messageId,
            timestamp: ack.timestamp,
            status: 'sent'
          }]));
        } else {
          setMessages((current) => mergeMessages(current, [{
            ...tempMsg,
            status: 'failed'
          }]));
        }
      });
      socket.emit('typing', { orderId, isTyping: false });
    } else {
      setOfflineQueue(prev => [...prev, tempMsg]);
    }
  };

  const renderItem = ({ item }) => {
    if (item.message_type === 'system') {
      return (
        <View style={styles.systemMessageContainer}>
          <Text style={styles.systemMessageText}>{item.message}</Text>
        </View>
      );
    }

    // Strict alignment: Right if it's me, Left if it's anyone else
    const isMe = String(item.sender_id) === String(myId);
    
    // Role Display Label
    let roleLabel = '';
    if (!isMe) {
        if (item.sender_role === 'rider') roleLabel = 'RIDER';
        else if (item.sender_role === 'admin') roleLabel = 'SUPPORT';
        else if (item.sender_role === 'system') roleLabel = 'SYSTEM';
        else roleLabel = 'USER';
    }

    // Status Icon Logic
    let statusIcon = "checkmark"; 
    let statusColor = "rgba(255,255,255,0.6)";
    
    if (item.status === 'pending') {
        statusIcon = "time-outline";
    } else if (item.status === 'failed') {
        statusIcon = "close-circle";
        statusColor = theme.colors.error;
    } else if (item.read_status) {
        statusIcon = "checkmark-done";
        statusColor = "#fff";
    }

    return (
      <View style={[
        styles.messageBubble, 
        isMe ? styles.myMessage : styles.theirMessage
      ]}>
        {!isMe && (
           <Text style={styles.senderName}>
             {roleLabel}
           </Text>
        )}
        <Text style={[styles.messageText, isMe ? styles.myMessageText : styles.theirMessageText]}>
          {item.message}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4 }}>
          <Text style={[styles.timestamp, isMe ? styles.myTimestamp : styles.theirTimestamp, { marginTop: 0 }]}>
            {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
          {isMe && (
            <Ionicons 
              name={statusIcon} 
              size={14} 
              color={statusColor}
              style={{ marginLeft: 4 }}
            />
          )}
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <View style={styles.header}>
         <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
           <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
         </TouchableOpacity>
         <View>
            <Text style={styles.headerTitle}>Order #{orderId} Support</Text>
            {connectionStatus === 'online' && <Text style={{fontSize: 12, color: theme.colors.success, fontWeight: 'bold'}}>Online</Text>}
            {connectionStatus === 'reconnecting' && <Text style={{fontSize: 12, color: theme.colors.warning, fontWeight: 'bold'}}>Reconnecting</Text>}
            {connectionStatus === 'offline' && <Text style={{fontSize: 12, color: theme.colors.error, fontWeight: 'bold'}}>Offline</Text>}
         </View>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderItem}
          keyExtractor={(item) => item.id ? item.id.toString() : item.tempId ? item.tempId.toString() : Math.random().toString()}
          contentContainerStyle={styles.listContent}
        />
      )}

      <View style={styles.inputContainer}>
        {chatStatus === 'locked' && (
          <Text style={styles.lockedText}>This chat is closed because the order has been completed.</Text>
        )}
        <TextInput
          style={styles.input}
          value={message}
          onChangeText={(text) => {
            setMessage(text);
            if (!socket || chatStatus === 'locked') return;
            socket.emit('typing', { orderId, isTyping: true });
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = setTimeout(() => {
              socket.emit('typing', { orderId, isTyping: false });
            }, 2000);
          }}
          placeholder="Type a message..."
          onSubmitEditing={sendMessage}
          editable={chatStatus !== 'locked'}
        />
        <TouchableOpacity onPress={sendMessage} style={styles.sendButton} disabled={!message.trim() || chatStatus === 'locked'}>
          <Ionicons name="send" size={24} color={message.trim() ? theme.colors.primary : '#ccc'} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  backButton: {
    marginRight: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
    marginBottom: 8,
  },
  myMessage: {
    alignSelf: 'flex-end',
    backgroundColor: theme.colors.primary,
    borderTopRightRadius: 0,
  },
  theirMessage: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 0,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderBottomLeftRadius: 4,
  },
  senderName: {
    fontSize: 10,
    color: theme.colors.textTertiary,
    marginBottom: 4,
    fontWeight: 'bold',
  },
  messageText: {
    fontSize: 16,
  },
  myMessageText: {
    color: '#fff',
  },
  theirMessageText: {
    color: theme.colors.textPrimary,
  },
  timestamp: {
    fontSize: 10,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  myTimestamp: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  theirTimestamp: {
    color: theme.colors.textTertiary,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: theme.colors.background,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginRight: 12,
    fontSize: 16,
  },
  sendButton: {
    padding: 8,
  },
  systemMessageContainer: {
    alignSelf: 'center',
    marginVertical: 10,
    paddingHorizontal: 16,
    paddingVertical: 4,
    backgroundColor: '#e0e0e0',
    borderRadius: 12,
  },
  systemMessageText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
    textAlign: 'center',
  },
  lockedText: {
      color: theme.colors.textTertiary,
      fontStyle: 'italic',
      textAlign: 'center',
      width: '100%',
      padding: 10,
  }
});
