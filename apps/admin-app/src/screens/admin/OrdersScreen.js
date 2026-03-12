import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, ScrollView, Modal, TextInput, Alert, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Picker } from '@react-native-picker/picker';
import { staff, normalizeApiError } from '../../services/api';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import { getTokens } from '../../theme/tokens';
import { Ionicons } from '@expo/vector-icons';
import { useSync } from '../../context/SyncContext';
import logger from '../../services/logger';

const tokens = getTokens();

export default function OrdersScreen({ lastUpdate, currentUser }) {
  const navigation = useNavigation();
  const { lastEvent } = useSync();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [riders, setRiders] = useState([]);
  const [users, setUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modals state
  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState(null); // 'create', 'accept', 'edit', 'deliver', 'status'
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [formData, setFormData] = useState({});
  const isHeadAdmin = currentUser?.role === 'admin' || currentUser?.role === 'head_admin';
  const isReceptionist = currentUser?.role === 'receptionist';

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = filterStatus !== 'all' ? { status: filterStatus } : {};
      const response = await staff.getOrders(params);
      setOrders(response.data);
    } catch (error) {
      const normalized = error?.normalized || normalizeApiError(error);
      logger.error('Orders fetch failed', normalized);
      Alert.alert('Error', normalized.message);
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  const fetchRiders = useCallback(async () => {
    try {
      const response = await staff.listUsers();
      const allUsers = response.data.items || [];
      const riderUsers = allUsers.filter(u => u.role === 'rider');
      setRiders(riderUsers);
    } catch (error) {
      console.error('Error fetching riders:', error);
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const response = await staff.listUsers();
      setUsers(response.data.items || []);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders, lastUpdate]);

  useEffect(() => {
    if (lastEvent && (lastEvent.type === 'order_created' || lastEvent.type === 'order_updated' || lastEvent.type === 'pickup_event')) {
        console.log('OrdersScreen: Sync event received', lastEvent);
        fetchOrders();
    }
  }, [lastEvent]);

  useEffect(() => {
    if (modalType === 'accept' || modalType === 'edit') {
      fetchRiders();
    }
    if (modalType === 'create') {
      fetchUsers();
    }
  }, [modalType, fetchRiders, fetchUsers]);

  const handleOpenModal = (type, order) => {
    setModalType(type);
    setSelectedOrder(order);
    setModalVisible(true);
    setSearchQuery('');
    
    // Initialize form data based on type
    if (type === 'create') {
        setFormData({
            user_id: '',
            clothes_count: '',
            pickup_date: new Date().toISOString().split('T')[0],
            pickup_time: '08:00-10:00',
            status: 'pending'
        });
    } else if (type === 'accept') {
      setFormData({ rider_id: '' });
    } else if (type === 'edit') {
      setFormData({
        clothes_count: String(order.clothes_count || 0),
        extra_clothes_count: String(order.extra_clothes_count || 0),
        notes: order.notes || '',
        pickup_date: order.pickup_date || '',
        pickup_time: order.pickup_time || '',
        rider_id: order.assigned_rider_id || '',
        pickup_code: order.pickup_code || ''
      });
    } else if (type === 'deliver') {
      setFormData({ code_value: '', override: false });
    } else if (type === 'status') {
      setFormData({ status: order.status });
    }
  };

  const handleCloseModal = () => {
    setModalVisible(false);
    setModalType(null);
    setSelectedOrder(null);
    setFormData({});
    setSearchQuery('');
  };

  const handleSubmit = async () => {
    try {
      if (modalType === 'create') {
          if (!formData.user_id || !formData.clothes_count) {
              Alert.alert('Error', 'Please select a user and enter clothes count');
              return;
          }
          await staff.createOrder(formData);
          Alert.alert('Success', 'Order created successfully');
      } else if (modalType === 'accept') {
        if (!formData.rider_id) {
          Alert.alert('Error', 'Please select a rider');
          return;
        }
        await staff.acceptOrder(selectedOrder.order_id, { rider_id: formData.rider_id, version: selectedOrder.version });
        Alert.alert('Success', 'Order accepted and rider assigned');
      } else if (modalType === 'edit') {
        const updates = {
          ...formData,
          clothes_count: parseInt(formData.clothes_count) || 0,
          extra_clothes_count: parseInt(formData.extra_clothes_count) || 0,
          rider_id: formData.rider_id || null,
          version: selectedOrder.version
        };
        await staff.editOrder(selectedOrder.order_id, updates);
        Alert.alert('Success', 'Order updated successfully');
      } else if (modalType === 'deliver') {
        await staff.releaseOrder(selectedOrder.order_id, {
          code_value: formData.code_value,
          override: formData.override,
          version: selectedOrder.version
        });
        Alert.alert('Success', 'Order marked as delivered');
      } else if (modalType === 'status') {
        const payload = { status: formData.status, version: selectedOrder.version };
        if (formData.code_value) {
            payload.code_value = formData.code_value;
        }
        await staff.updateStatus(selectedOrder.order_id, payload);
        Alert.alert('Success', 'Order status updated');
      }
      
      handleCloseModal();
      fetchOrders();
    } catch (error) {
      console.error('Action error:', error);
      if (error.response?.status === 409) {
          Alert.alert(
              'Update Conflict',
              'This order has been updated by someone else. The list will be refreshed.',
              [{ text: 'OK', onPress: () => { handleCloseModal(); fetchOrders(); } }]
          );
      } else {
          Alert.alert('Error', error.response?.data?.error || 'Action failed');
      }
    }
  };

  const getStatusVariant = (status) => {
    switch (status) {
      case 'pending': return 'warning';
      case 'accepted': return 'info';
      case 'picked_up': return 'info';
      case 'processing': return 'info';
      case 'ready': return 'success';
      case 'delivered': return 'success';
      case 'cancelled': return 'danger';
      default: return 'neutral';
    }
  };

  const renderStatusFilter = () => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterContainer}>
      {['all', 'pending', 'accepted', 'picked_up', 'processing', 'ready', 'delivered', 'cancelled'].map(status => (
        <TouchableOpacity
          key={status}
          style={[styles.filterTab, filterStatus === status && styles.activeFilterTab]}
          onPress={() => setFilterStatus(status)}
        >
          <Text style={[styles.filterText, filterStatus === status && styles.activeFilterText]}>
            {status.toUpperCase().replace('_', ' ')}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  const renderItem = ({ item }) => (
    <Card style={styles.orderCard}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.orderId}>Order #{item.order_id}</Text>
          <Text style={styles.customerName}>{item.User?.full_name}</Text>
        </View>
        <Badge variant={getStatusVariant(item.status)}>{item.status.replace('_', ' ')}</Badge>
      </View>
      
      <View style={styles.cardBody}>
        <View style={styles.infoRow}>
          <Ionicons name="calendar-outline" size={16} color={tokens.colors.textSecondary} />
          <Text style={styles.infoText}>{item.pickup_date} at {item.pickup_time}</Text>
        </View>
        <View style={styles.infoRow}>
          <Ionicons name="location-outline" size={16} color={tokens.colors.textSecondary} />
          <Text style={styles.infoText}>{item.pickup_address || item.User?.hostel_address || 'No Address'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Ionicons name="shirt-outline" size={16} color={tokens.colors.textSecondary} />
          <Text style={styles.infoText}>{item.clothes_count} items (+{item.extra_clothes_count} extra)</Text>
        </View>
        {item.Rider && (
          <View style={styles.infoRow}>
            <Ionicons name="bicycle-outline" size={16} color={tokens.colors.textSecondary} />
            <Text style={styles.infoText}>Rider: {item.Rider.full_name}</Text>
          </View>
        )}
        {item.notes && (
          <View style={styles.noteContainer}>
             <Text style={styles.noteText}>Note: {item.notes}</Text>
          </View>
        )}

        {(item.pickup_code || item.delivery_code) && (
          <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: tokens.colors.border }}>
             {item.pickup_code && (
                <View style={styles.infoRow}>
                  <Ionicons name="key-outline" size={16} color={tokens.colors.primary} />
                  <Text style={[styles.infoText, { fontWeight: 'bold', color: tokens.colors.primary }]}>
                    Pickup Code: {isReceptionist ? '****' : item.pickup_code}
                  </Text>
                </View>
             )}
             {item.delivery_code && (
                <View style={styles.infoRow}>
                  <Ionicons name="gift-outline" size={16} color={tokens.colors.success} />
                  <Text style={[styles.infoText, { fontWeight: 'bold', color: tokens.colors.success }]}>
                    Delivery Code: {isReceptionist ? '****' : item.delivery_code}
                  </Text>
                </View>
             )}
          </View>
        )}
      </View>

      <View style={styles.actionButtons}>
        {item.status === 'pending' && (
          <Button 
            title="Accept" 
            size="sm" 
            onPress={() => handleOpenModal('accept', item)} 
            style={styles.actionBtn}
          />
        )}
        
        {/* Allow changing status for pending (e.g. to cancel) and active states */}
        {['pending', 'accepted', 'picked_up', 'processing'].includes(item.status) && (
          <Button 
            title="Update Status" 
            variant="outline" 
            size="sm" 
            onPress={() => handleOpenModal('status', item)}
            style={styles.actionBtn}
          />
        )}

        {isHeadAdmin && (
          <Button 
            title="Chat (Read Only)"
            variant="outline" 
            size="sm" 
            onPress={() => navigation.navigate('Chat', { orderId: item.order_id })}
            style={styles.actionBtn}
            icon="eye-outline"
          />
        )}

        {item.status === 'ready' && (
          <Button 
            title="Deliver" 
            variant="primary" 
            size="sm" 
            onPress={() => handleOpenModal('deliver', item)}
            style={styles.actionBtn}
          />
        )}

        {/* Head Admin Edit - allowed unless delivered/cancelled */}
        {isHeadAdmin && !['delivered', 'cancelled'].includes(item.status) && (
          <Button 
            title="Edit" 
            variant="ghost" 
            size="sm" 
            icon="create-outline"
            onPress={() => handleOpenModal('edit', item)}
            style={styles.actionBtn}
          />
        )}
      </View>
    </Card>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Order Management</Text>
        <View style={{flexDirection: 'row', gap: 8}}>
          {isHeadAdmin && (
            <Button title="Add Order" variant="primary" icon="add" onPress={() => handleOpenModal('create')} />
          )}
          <Button title="Refresh" variant="ghost" icon="refresh" onPress={fetchOrders} />
        </View>
      </View>
      
      {renderStatusFilter()}

      {loading ? (
        <View style={styles.centered}>
          <Text>Loading orders...</Text>
        </View>
      ) : (
        <FlatList
          data={orders}
          renderItem={renderItem}
          keyExtractor={item => item.order_id.toString()}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.emptyText}>No orders found</Text>}
        />
      )}

      {/* Modal Handling */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {modalType === 'create' && 'Create New Order'}
              {modalType === 'accept' && 'Accept Order'}
              {modalType === 'edit' && 'Edit Order Details'}
              {modalType === 'deliver' && 'Deliver Order'}
              {modalType === 'status' && 'Update Status'}
            </Text>

            <ScrollView style={styles.modalBody}>
              {modalType === 'create' && (
                <View>
                  <View style={styles.fieldGroup}>
                    <Text style={styles.label}>Select User</Text>
                    {formData.user_id ? (
                       <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, backgroundColor: tokens.colors.surfaceAlt, borderRadius: 8, marginBottom: 8 }}>
                          <View>
                              <Text style={{ fontWeight: 'bold', color: tokens.colors.text }}>{users.find(u => u.user_id === formData.user_id)?.full_name}</Text>
                              <Text style={{ color: tokens.colors.textSecondary, fontSize: 12 }}>
                                  {(() => {
                                      const u = users.find(u => u.user_id === formData.user_id);
                                      const plan = u?.Subscriptions?.find(s => s.status === 'active')?.Plan;
                                      return plan ? `Plan: ${plan.name} (Limit: ${plan.clothes_limit})` : 'No Active Plan';
                                  })()}
                              </Text>
                          </View>
                          <TouchableOpacity onPress={() => setFormData({...formData, user_id: ''})}>
                              <Ionicons name="close-circle" size={24} color={tokens.colors.danger} />
                          </TouchableOpacity>
                       </View>
                    ) : (
                       <View>
                           <TextInput 
                              style={styles.input} 
                              placeholder="Search by name or phone..." 
                              value={searchQuery}
                              onChangeText={setSearchQuery}
                              autoCapitalize="none"
                           />
                           {searchQuery.length > 0 && (
                              <View style={{ maxHeight: 150, borderWidth: 1, borderColor: tokens.colors.border, borderRadius: 8, marginTop: 4 }}>
                                  <ScrollView nestedScrollEnabled style={{maxHeight: 150}}>
                                      {users.filter(u => 
                                          u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                          u.phone_number?.includes(searchQuery)
                                      ).map(u => (
                                          <TouchableOpacity 
                                              key={u.user_id} 
                                              style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: tokens.colors.border }}
                                              onPress={() => {
                                                  setFormData({...formData, user_id: u.user_id});
                                                  setSearchQuery('');
                                              }}
                                          >
                                              <Text style={{ fontWeight: '500' }}>{u.full_name}</Text>
                                              <Text style={{ fontSize: 12, color: tokens.colors.textSecondary }}>{u.phone_number}</Text>
                                          </TouchableOpacity>
                                      ))}
                                      {users.filter(u => 
                                          u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                          u.phone_number?.includes(searchQuery)
                                      ).length === 0 && (
                                          <Text style={{ padding: 10, color: tokens.colors.textSecondary, fontStyle: 'italic' }}>No users found</Text>
                                      )}
                                  </ScrollView>
                              </View>
                           )}
                       </View>
                    )}
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.label}>Clothes Count</Text>
                    <TextInput
                      style={styles.input}
                      keyboardType="numeric"
                      value={formData.clothes_count}
                      onChangeText={(val) => setFormData({...formData, clothes_count: val})}
                      placeholder="Enter number of clothes"
                    />
                    {formData.user_id && formData.clothes_count ? (
                        <Text style={{ fontSize: 12, color: tokens.colors.textSecondary, marginTop: 4 }}>
                            {(() => {
                                const u = users.find(u => u.user_id === formData.user_id);
                                const plan = u?.Subscriptions?.find(s => s.status === 'active')?.Plan;
                                const limit = plan?.clothes_limit || 0;
                                const count = parseInt(formData.clothes_count) || 0;
                                const extra = plan ? Math.max(0, count - limit) : count;
                                return extra > 0 ? `Est. Extra: ${extra} items` : 'Within plan limit';
                            })()}
                        </Text>
                    ) : null}
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.label}>Pickup Date</Text>
                    <TextInput
                      style={styles.input}
                      value={formData.pickup_date}
                      onChangeText={(val) => setFormData({...formData, pickup_date: val})}
                      placeholder="YYYY-MM-DD"
                    />
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.label}>Initial Status</Text>
                    <View style={styles.pickerContainer}>
                      <Picker
                        selectedValue={formData.status}
                        onValueChange={(val) => setFormData({...formData, status: val})}
                      >
                        <Picker.Item label="Pending" value="pending" />
                        <Picker.Item label="Accepted" value="accepted" />
                        <Picker.Item label="In Progress" value="processing" />
                      </Picker>
                    </View>
                  </View>
                </View>
              )}

              {modalType === 'accept' && (
                <View>
                  <Text style={styles.label}>Assign Rider:</Text>
                  <View style={styles.pickerContainer}>
                    <Picker
                      selectedValue={formData.rider_id}
                      onValueChange={(val) => setFormData({...formData, rider_id: val})}
                    >
                      <Picker.Item label="Select a rider..." value="" />
                      {riders.map(r => <Picker.Item key={r.user_id} label={r.full_name} value={r.user_id} />)}
                    </Picker>
                  </View>
                </View>
              )}

              {modalType === 'status' && (
                <View>
                  <Text style={styles.label}>New Status:</Text>
                  <View style={styles.pickerContainer}>
                    <Picker
                      selectedValue={formData.status}
                      onValueChange={(val) => setFormData({...formData, status: val})}
                    >
                      {['pending', 'accepted', 'picked_up', 'processing', 'ready', 'delivered', 'cancelled'].map(s => (
                         <Picker.Item key={s} label={s.toUpperCase().replace('_', ' ')} value={s} />
                      ))}
                    </Picker>
                  </View>
                  {/* Code Input for Receptionist/Validation */}
                  {['picked_up', 'delivered'].includes(formData.status) && (
                      <View>
                        <Text style={styles.label}>
                            {formData.status === 'picked_up' ? 'Pickup Code:' : 'Delivery Code:'}
                        </Text>
                        <TextInput
                            style={styles.input}
                            value={formData.code_value}
                            onChangeText={v => setFormData({...formData, code_value: v})}
                            placeholder="Enter user code to verify"
                        />
                      </View>
                  )}
                </View>
              )}

              {modalType === 'edit' && (
                <View>
                  <Text style={styles.label}>Clothes Count:</Text>
                  <TextInput
                    style={styles.input}
                    value={formData.clothes_count}
                    onChangeText={v => setFormData({...formData, clothes_count: v})}
                    keyboardType="numeric"
                  />
                  <Text style={styles.label}>Extra Clothes:</Text>
                  <TextInput
                    style={styles.input}
                    value={formData.extra_clothes_count}
                    onChangeText={v => setFormData({...formData, extra_clothes_count: v})}
                    keyboardType="numeric"
                  />
                  <Text style={styles.label}>Pickup Date (YYYY-MM-DD):</Text>
                  <TextInput
                    style={styles.input}
                    value={formData.pickup_date}
                    onChangeText={v => setFormData({...formData, pickup_date: v})}
                    placeholder="YYYY-MM-DD"
                  />
                  <Text style={styles.label}>Pickup Time:</Text>
                  <TextInput
                    style={styles.input}
                    value={formData.pickup_time}
                    onChangeText={v => setFormData({...formData, pickup_time: v})}
                    placeholder="e.g. 10:00 AM"
                  />
                  <Text style={styles.label}>Notes:</Text>
                  <TextInput
                    style={styles.input}
                    value={formData.notes}
                    onChangeText={v => setFormData({...formData, notes: v})}
                    multiline
                  />
                  <Text style={styles.label}>Pickup Code:</Text>
                  <TextInput
                    style={styles.input}
                    value={formData.pickup_code}
                    onChangeText={v => setFormData({...formData, pickup_code: v})}
                    placeholder="6-digit code"
                  />
                  <Text style={styles.label}>Assign Rider:</Text>
                  <View style={styles.pickerContainer}>
                    <Picker
                      selectedValue={formData.rider_id}
                      onValueChange={(val) => setFormData({...formData, rider_id: val})}
                    >
                       <Picker.Item label="Unassigned" value={null} />
                       {riders.map(r => <Picker.Item key={r.user_id} label={r.full_name} value={r.user_id} />)}
                    </Picker>
                  </View>
                </View>
              )}

              {modalType === 'deliver' && (
                <View>
                   <Text style={styles.label}>Enter Release Code:</Text>
                   <TextInput
                      style={styles.input}
                      value={formData.code_value}
                      onChangeText={v => setFormData({...formData, code_value: v})}
                      placeholder="e.g. 123456"
                   />
                   {isHeadAdmin && (
                     <TouchableOpacity 
                        style={styles.checkboxRow}
                        onPress={() => setFormData({...formData, override: !formData.override})}
                     >
                       <View style={[styles.checkbox, formData.override && styles.checked]}>
                         {formData.override && <Ionicons name="checkmark" size={14} color="white" />}
                       </View>
                       <Text style={styles.checkboxLabel}>Admin Override (No Code)</Text>
                     </TouchableOpacity>
                   )}
                </View>
              )}
            </ScrollView>

            <View style={styles.modalButtons}>
              <Button title="Cancel" variant="outline" onPress={handleCloseModal} style={styles.modalBtn} />
              <Button title="Confirm" onPress={handleSubmit} style={styles.modalBtn} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    padding: tokens.spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.border,
  },
  title: {
    fontSize: tokens.typography.sizes.xl,
    fontWeight: tokens.typography.weights.bold,
    color: tokens.colors.text,
  },
  filterContainer: {
    maxHeight: 50,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.border,
  },
  filterTab: {
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.md,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeFilterTab: {
    borderBottomColor: tokens.colors.primary,
  },
  filterText: {
    color: tokens.colors.textSecondary,
    fontWeight: tokens.typography.weights.medium,
  },
  activeFilterText: {
    color: tokens.colors.primary,
  },
  listContent: {
    padding: tokens.spacing.lg,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  orderCard: {
    marginBottom: tokens.spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: tokens.spacing.sm,
  },
  orderId: {
    fontSize: tokens.typography.sizes.sm,
    color: tokens.colors.textSecondary,
    fontWeight: tokens.typography.weights.bold,
  },
  customerName: {
    fontSize: tokens.typography.sizes.lg,
    fontWeight: tokens.typography.weights.semibold,
    color: tokens.colors.text,
  },
  cardBody: {
    marginBottom: tokens.spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: tokens.spacing.xs,
  },
  infoText: {
    marginLeft: tokens.spacing.xs,
    color: tokens.colors.text,
  },
  noteContainer: {
    marginTop: tokens.spacing.sm,
    padding: tokens.spacing.sm,
    backgroundColor: tokens.colors.surfaceAlt,
    borderRadius: tokens.radius.sm,
  },
  noteText: {
    fontSize: tokens.typography.sizes.sm,
    color: tokens.colors.textSecondary,
    fontStyle: 'italic',
  },
  actionButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: tokens.colors.border,
    paddingTop: tokens.spacing.md,
  },
  actionBtn: {
    marginRight: tokens.spacing.sm,
    marginBottom: tokens.spacing.xs,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: tokens.spacing.xl,
    color: tokens.colors.textSecondary,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: tokens.spacing.lg,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.xl,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: tokens.typography.sizes.xl,
    fontWeight: tokens.typography.weights.bold,
    marginBottom: tokens.spacing.lg,
    textAlign: 'center',
  },
  modalBody: {
    marginBottom: tokens.spacing.lg,
  },
  label: {
    fontSize: tokens.typography.sizes.sm,
    fontWeight: tokens.typography.weights.medium,
    marginBottom: tokens.spacing.xs,
    marginTop: tokens.spacing.md,
    color: tokens.colors.textSecondary,
  },
  input: {
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.sm,
    fontSize: tokens.typography.sizes.base,
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderRadius: tokens.radius.md,
    backgroundColor: '#fff',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: tokens.spacing.md,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 1,
    borderColor: tokens.colors.primary,
    borderRadius: 4,
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checked: {
    backgroundColor: tokens.colors.primary,
  },
  checkboxLabel: {
    fontSize: tokens.typography.sizes.base,
    color: tokens.colors.text,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: tokens.spacing.md,
  },
  modalBtn: {
    minWidth: 100,
  },
});
