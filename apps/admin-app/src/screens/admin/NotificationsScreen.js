import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Alert, Platform } from 'react-native';
import { Text, Button, Card, TextInput, Modal, Portal, Provider, Chip, FAB, IconButton, ActivityIndicator } from 'react-native-paper';
import { Picker } from '@react-native-picker/picker';
import { staff } from '../../services/api';

const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString();
};

const getEventColor = (type) => {
  switch (type) {
    case 'order_update': return '#2196F3'; // Blue
    case 'payment': return '#4CAF50'; // Green
    case 'subscription': return '#FF9800'; // Orange
    case 'system': return '#9C27B0'; // Purple
    case 'promo': return '#E91E63'; // Pink
    default: return '#757575';
  }
};

export default function NotificationsScreen({ mode = 'admin', currentUser = null, titleOverride = '' }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState([]); // For user picker
  const [errorMessage, setErrorMessage] = useState('');

  // Filters
  const [filterType, setFilterType] = useState(''); // event_type
  const [filterUser, setFilterUser] = useState(''); // user_id

  // Modal
  const [visible, setVisible] = useState(false);
  const [sendType, setSendType] = useState('personal'); // personal | broadcast
  const [targetUser, setTargetUser] = useState('');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [eventType, setEventType] = useState('system');

  const isStaffView = mode === 'staff';

  useEffect(() => {
    loadNotifications();
    if (!isStaffView) {
      loadUsers();
    }
  }, [filterType, filterUser, isStaffView, currentUser?.user_id]);

  const loadNotifications = async () => {
    if (isStaffView && !currentUser?.user_id) {
      setNotifications([]);
      setErrorMessage('Session expired. Please log in again.');
      return;
    }
    setLoading(true);
    setErrorMessage('');
    try {
      const params = {};
      if (filterType) params.event_type = filterType;
      if (!isStaffView && filterUser) params.user_id = filterUser;
      
      const res = await staff.listNotifications(params);
      const data = res.data.items || res.data || [];
      
      if (isStaffView) {
        const scoped = data.filter((item) => {
          if (item.type === 'broadcast') return true;
          if (!item.user_id) return true;
          return String(item.user_id) === String(currentUser.user_id);
        });
        setNotifications(scoped);
      } else {
        setNotifications(data);
      }
    } catch (error) {
      setErrorMessage(error?.response?.data?.error || error?.message || 'Failed to load notifications.');
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const res = await staff.listUsers();
      setUsers(res.data.items || res.data || []);
    } catch (error) {
      setErrorMessage('Failed to load users.');
    }
  };

  const handleSend = async () => {
    if (!title || !message) {
      Alert.alert('Error', 'Title and Message are required');
      return;
    }
    if (sendType === 'personal' && !targetUser) {
        Alert.alert('Error', 'Please select a user');
        return;
    }

    try {
      await staff.sendNotification({
        type: sendType,
        user_id: sendType === 'personal' ? targetUser : null,
        title,
        message,
        event_type: eventType
      });
      Alert.alert('Success', 'Notification sent');
      setVisible(false);
      // Reset form
      setTitle('');
      setMessage('');
      setTargetUser('');
      loadNotifications();
    } catch (error) {
      Alert.alert('Error', error.response?.data?.error || error.message);
    }
  };

  const handleResend = async (id) => {
    try {
      await staff.resendNotification(id);
      Alert.alert('Success', 'Notification resent');
      loadNotifications();
    } catch (error) {
      Alert.alert('Error', 'Failed to resend');
    }
  };

  return (
    <Provider>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text variant="headlineMedium" style={styles.title}>{titleOverride || (isStaffView ? 'Notifications' : 'Notifications')}</Text>
          {!isStaffView && <Button mode="contained" onPress={() => setVisible(true)} icon="plus">Compose</Button>}
          {isStaffView && <Button mode="contained" onPress={loadNotifications} icon="refresh">Refresh</Button>}
        </View>

        <View style={styles.filters}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <Chip selected={filterType === ''} onPress={() => setFilterType('')} style={styles.chip}>All Events</Chip>
            <Chip selected={filterType === 'order_update'} onPress={() => setFilterType('order_update')} style={styles.chip}>Orders</Chip>
            <Chip selected={filterType === 'payment'} onPress={() => setFilterType('payment')} style={styles.chip}>Payments</Chip>
            <Chip selected={filterType === 'system'} onPress={() => setFilterType('system')} style={styles.chip}>System</Chip>
            
            {/* Simple User Filter Input could go here, but let's stick to event types for cleaner UI */}
          </ScrollView>
        </View>

        {errorMessage ? (
          <Text style={{ textAlign: 'center', marginTop: 20, color: '#B00020' }}>{errorMessage}</Text>
        ) : loading ? (
          <ActivityIndicator animating={true} size="large" style={{ marginTop: 20 }} />
        ) : (
          <ScrollView style={styles.list}>
            {notifications.map((n) => (
              <Card key={n.notification_id} style={styles.card}>
                <Card.Content>
                  <View style={styles.cardHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Chip style={{ backgroundColor: getEventColor(n.event_type), marginRight: 10, height: 24 }} textStyle={{ color: 'white', fontSize: 10, lineHeight: 12 }}>
                            {n.event_type?.toUpperCase() || 'SYSTEM'}
                        </Chip>
                        <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>{n.title}</Text>
                    </View>
                    {!isStaffView && <IconButton icon="refresh" size={20} onPress={() => handleResend(n.notification_id)} />}
                  </View>
                  
                  <Text variant="bodyMedium" style={{ marginTop: 5 }}>{n.message}</Text>
                  
                  <View style={styles.cardFooter}>
                    {!isStaffView && (
                      <Text variant="bodySmall" style={{ color: '#666' }}>
                        To: {n.type === 'broadcast' ? 'Everyone' : (n.User?.full_name || `User #${n.user_id}`)}
                      </Text>
                    )}
                    <Text variant="bodySmall" style={{ color: '#666' }}>{formatDate(n.created_at)}</Text>
                  </View>
                </Card.Content>
              </Card>
            ))}
            {notifications.length === 0 && (
                <Text style={{ textAlign: 'center', marginTop: 20, color: '#666' }}>No notifications found.</Text>
            )}
          </ScrollView>
        )}

        {!isStaffView && <Portal>
          <Modal visible={visible} onDismiss={() => setVisible(false)} contentContainerStyle={styles.modal}>
            <Text variant="headlineSmall" style={{ marginBottom: 15 }}>Send Notification</Text>
            
            <Text style={styles.label}>Type</Text>
            <View style={styles.pickerContainer}>
                <Picker
                    selectedValue={sendType}
                    onValueChange={setSendType}
                    style={styles.picker}
                >
                    <Picker.Item label="Personal (Specific User)" value="personal" />
                    <Picker.Item label="Broadcast (All Users)" value="broadcast" />
                </Picker>
            </View>

            {sendType === 'personal' && (
                <>
                    <Text style={styles.label}>Select User</Text>
                    <View style={styles.pickerContainer}>
                        <Picker
                            selectedValue={targetUser}
                            onValueChange={setTargetUser}
                            style={styles.picker}
                        >
                            <Picker.Item label="Select a user..." value="" />
                            {users.map(u => (
                                <Picker.Item key={u.user_id} label={`${u.full_name} (${u.phone_number})`} value={u.user_id} />
                            ))}
                        </Picker>
                    </View>
                </>
            )}

            <Text style={styles.label}>Event Category</Text>
            <View style={styles.pickerContainer}>
                <Picker
                    selectedValue={eventType}
                    onValueChange={setEventType}
                    style={styles.picker}
                >
                    <Picker.Item label="System" value="system" />
                    <Picker.Item label="Promo" value="promo" />
                    <Picker.Item label="Order Update" value="order_update" />
                    <Picker.Item label="Payment" value="payment" />
                </Picker>
            </View>

            <TextInput
                label="Title"
                value={title}
                onChangeText={setTitle}
                mode="outlined"
                style={styles.input}
            />

            <TextInput
                label="Message"
                value={message}
                onChangeText={setMessage}
                mode="outlined"
                multiline
                numberOfLines={3}
                style={styles.input}
            />

            <View style={styles.modalActions}>
              <Button onPress={() => setVisible(false)} style={{ marginRight: 10 }}>Cancel</Button>
              <Button mode="contained" onPress={handleSend}>Send</Button>
            </View>
          </Modal>
        </Portal>}
      </View>
    </Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontWeight: 'bold',
  },
  filters: {
    marginBottom: 15,
    height: 40,
  },
  chip: {
    marginRight: 8,
  },
  list: {
    flex: 1,
  },
  card: {
    marginBottom: 10,
    backgroundColor: 'white',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 5,
  },
  modal: {
    backgroundColor: 'white',
    padding: 20,
    margin: 20,
    borderRadius: 8,
    maxHeight: '90%',
  },
  input: {
    marginBottom: 10,
    backgroundColor: 'white',
  },
  label: {
    marginTop: 10,
    marginBottom: 5,
    fontWeight: '500',
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    marginBottom: 10,
    ...(Platform.OS === 'web' ? { height: 40, justifyContent: 'center' } : {}),
  },
  picker: {
    ...(Platform.OS === 'web' ? { height: 40, border: 'none' } : {}),
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 20,
  },
});
