import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, ScrollView, StyleSheet, Alert, Platform, TouchableOpacity } from 'react-native';
import { Text, Button, Card, TextInput, Modal, Portal, Provider, Chip, FAB, Badge, ActivityIndicator, HelperText, Snackbar } from 'react-native-paper';
import { Picker } from '@react-native-picker/picker';
import { useSync } from '../../context/SyncContext';
import { normalizeApiError, staff } from '../../services/api';

const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString();
};

const getStatusColor = (status) => {
  switch (status) {
    case 'paid': return '#4CAF50'; // Green
    case 'pending': return '#FF9800'; // Orange
    case 'awaiting_verification': return '#3B82F6';
    case 'rejected': return '#EF4444';
    case 'declined': return '#EF4444';
    case 'failed': return '#F44336'; // Red
    default: return '#9E9E9E';
  }
};

export default function PaymentsScreen({ currentUser, readOnly }) {
  const { lastEvent } = useSync();
  const [payments, setPayments] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusUpdatingId, setStatusUpdatingId] = useState(null);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' });
  const debounceRef = useRef(null);
  
  // Filters
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterGateway, setFilterGateway] = useState('');
  
  // Modal
  const [visible, setVisible] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [currentId, setCurrentId] = useState(null);
  const [selectedPayment, setSelectedPayment] = useState(null);
  
  // Form Data
  const [userId, setUserId] = useState('');
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState('subscription');
  const [gateway, setGateway] = useState('cash');
  const [status, setStatus] = useState('paid');
  const [reference, setReference] = useState('');

  const isReceptionist = currentUser?.role === 'receptionist';
  const canUpdateStatus = !readOnly && (currentUser?.role === 'admin' || currentUser?.role === 'receptionist');
  const canCreatePayment = !readOnly && currentUser?.role === 'admin';
  const canEditPayment = !readOnly && (currentUser?.role === 'admin' || currentUser?.role === 'receptionist');

  const showToast = useCallback((message, type = 'info') => {
    setToast({ visible: true, message, type });
  }, []);

  useEffect(() => {
    loadUsers();
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
    scheduleLoadPayments('filters');
  }, [filterStatus, filterType, filterGateway]);

  useEffect(() => {
    if (!lastEvent?.type) return;
    if (!['payment_created', 'payment_updated', 'payment_deleted'].includes(lastEvent.type)) return;
    scheduleLoadPayments('sync');
  }, [lastEvent]);

  const loadUsers = async () => {
    try {
      const res = await staff.listUsers();
      const nextUsers = Array.isArray(res.data) ? res.data : (res.data?.items || []);
      setUsers(nextUsers);
    } catch (error) {
      const normalized = normalizeApiError(error);
      console.error('Failed to load users', normalized);
      try {
        await staff.logFrontError({
          source: 'admin-web',
          message: 'Failed to load users',
          context: { scope: 'PaymentsScreen.loadUsers', normalized }
        });
      } catch {}
    }
  };

  const scheduleLoadPayments = useCallback((reason) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      loadPayments(reason);
    }, 600);
  }, [filterStatus, filterType, filterGateway]);

  const loadPayments = async (reason) => {
    setLoading(true);
    try {
      const params = {};
      if (filterStatus) params.status = filterStatus;
      if (filterType) params.type = filterType;
      if (filterGateway) params.gateway = filterGateway;
      
      const res = await staff.listPayments(params);
      const nextPayments = Array.isArray(res.data) ? res.data : (res.data?.items || []);
      setPayments(nextPayments);
    } catch (error) {
      const normalized = normalizeApiError(error);
      console.error('Failed to load payments', { reason, normalized });
      try {
        await staff.logFrontError({
          source: 'admin-web',
          message: 'Failed to load payments',
          context: { scope: 'PaymentsScreen.loadPayments', reason, normalized }
        });
      } catch {}
      showToast(normalized.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setIsEdit(false);
    setUserId('');
    setUserSearchQuery('');
    setAmount('');
    setType('subscription');
    setGateway('cash');
    setStatus('paid');
    setReference('');
    setVisible(true);
  };

  const openEditModal = (payment) => {
    setIsEdit(true);
    setSelectedPayment(payment);
    setCurrentId(payment.payment_id);
    setUserId(String(payment.user_id));
    setAmount(String(payment.amount));
    setType(payment.payment_type);
    setGateway(payment.gateway);
    setStatus(payment.status);
    setReference(payment.reference || '');
    setVisible(true);
  };

  const handleSave = async () => {
    try {
      if (isEdit) {
        // Only status update allowed for edit as per requirements "Edit payment status"
        await staff.updatePayment(currentId, { status });
        showToast('Payment status updated', 'success');
      } else {
        if (!userId || !amount) {
          Alert.alert('Error', 'User ID and Amount are required');
          return;
        }
        await staff.createPayment({
          user_id: parseInt(userId),
          amount: parseFloat(amount),
          payment_type: type,
          gateway,
          status,
          reference
        });
        showToast('Payment recorded', 'success');
      }
      setVisible(false);
      scheduleLoadPayments('save');
    } catch (error) {
      const normalized = normalizeApiError(error);
      showToast(normalized.message, 'error');
      try {
        await staff.logFrontError({
          source: 'admin-web',
          message: 'Payment save failed',
          context: { scope: 'PaymentsScreen.handleSave', normalized }
        });
      } catch {}
    }
  };

  const handleQuickStatus = async (paymentId, nextStatus) => {
    if (!canUpdateStatus) {
      showToast('You do not have permission to update payment status.', 'error');
      return;
    }
    setStatusUpdatingId(paymentId);
    try {
      await staff.updatePaymentStatus(paymentId, { status: nextStatus });
      setPayments((prev) => prev.map((p) => p.payment_id === paymentId ? { ...p, status: nextStatus } : p));
      showToast('Payment status updated', 'success');
    } catch (error) {
      const normalized = normalizeApiError(error);
      showToast(normalized.message, 'error');
      try {
        await staff.logFrontError({
          source: 'admin-web',
          message: 'Payment quick status update failed',
          context: { scope: 'PaymentsScreen.handleQuickStatus', normalized }
        });
      } catch {}
    } finally {
      setStatusUpdatingId(null);
    }
  };

  const handleInlineStatusChange = async (payment, nextStatus) => {
    if (payment.status === nextStatus) return;
    if (!canUpdateStatus) {
      showToast('You do not have permission to update payment status.', 'error');
      return;
    }
    setStatusUpdatingId(payment.payment_id);
    try {
      await staff.updatePaymentStatus(payment.payment_id, { status: nextStatus });
      setPayments((prev) => prev.map((p) => p.payment_id === payment.payment_id ? { ...p, status: nextStatus } : p));
      showToast('Status updated', 'success');
    } catch (error) {
      const normalized = normalizeApiError(error);
      showToast(normalized.message, 'error');
      try {
        await staff.logFrontError({
          source: 'admin-web',
          message: 'Payment inline status update failed',
          context: { scope: 'PaymentsScreen.handleInlineStatusChange', normalized }
        });
      } catch {}
    } finally {
      setStatusUpdatingId(null);
    }
  };

  const renderPaymentDetails = () => {
    if (!selectedPayment) return null;
    const meta = selectedPayment.metadata || {};
    const user = selectedPayment.User || {};
    const planName = meta.subscription_plan_name || meta.plan_name;
    const accountName = meta.account_name || meta.bank_account_name || meta.accountName || meta.account;
    const accountNumber = meta.account_number || meta.bank_account_number || meta.accountNumber;
    const organization = meta.school || meta.organization || meta.organization_name || user.school;
  const purpose = meta.payment_reason || (selectedPayment.payment_type === 'subscription' ? 'Subscription' : selectedPayment.payment_type === 'extra_clothes' ? 'Extra clothes' : selectedPayment.payment_type === 'emergency' ? 'Emergency laundry' : selectedPayment.payment_type);
    const submittedAt = meta.submitted_at || meta.submittedAt;
    const hasItemizedDetails = Boolean(
      planName ||
      meta.subscription_id ||
      meta.plan_clothes_limit !== undefined ||
      meta.ordered_clothes !== undefined ||
      meta.extra_clothes_count !== undefined ||
      meta.price_per_cloth !== undefined ||
      meta.extra_clothes_total_amount !== undefined ||
      meta.emergency_clothes_count !== undefined ||
      meta.emergency_total_amount !== undefined ||
      meta.related_order_id
    );
    return (
      <View style={{ marginBottom: 15 }}>
        <View style={{ marginBottom: 12, padding: 10, backgroundColor: '#f9f9f9', borderRadius: 4 }}>
          <Text style={{ fontWeight: 'bold', marginBottom: 8 }}>Payer Information</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={{ color: '#666' }}>Full Name:</Text>
            <Text>{user.full_name || '-'}</Text>
          </View>
          {user.phone_number && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: '#666' }}>Phone:</Text>
              <Text>{user.phone_number}</Text>
            </View>
          )}
          {user.email && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: '#666' }}>Email:</Text>
              <Text>{user.email}</Text>
            </View>
          )}
          {user.student_id && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: '#666' }}>Student ID:</Text>
              <Text>{user.student_id}</Text>
            </View>
          )}
          {organization && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: '#666' }}>School/Organization:</Text>
              <Text>{organization}</Text>
            </View>
          )}
          {accountName && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: '#666' }}>Account Name:</Text>
              <Text>{accountName}</Text>
            </View>
          )}
          {accountNumber && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: '#666' }}>Account Number:</Text>
              <Text>{accountNumber}</Text>
            </View>
          )}
        </View>

        <View style={{ marginBottom: 12, padding: 10, backgroundColor: '#f0f7ff', borderRadius: 4, borderColor: '#cce5ff', borderWidth: 1 }}>
          <Text style={{ fontWeight: 'bold', marginBottom: 8, color: '#0056b3' }}>Payment Information</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={{ color: '#666' }}>Purpose:</Text>
            <Text style={{ fontWeight: 'bold' }}>{purpose || '-'}</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={{ color: '#666' }}>Type:</Text>
            <Text>{selectedPayment.payment_type}</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={{ color: '#666' }}>Amount:</Text>
            <Text>₦{selectedPayment.amount}</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={{ color: '#666' }}>Date:</Text>
            <Text>{formatDate(selectedPayment.created_at)}</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={{ color: '#666' }}>Status:</Text>
            <Text>{selectedPayment.status}</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={{ color: '#666' }}>Gateway:</Text>
            <Text>{selectedPayment.gateway}</Text>
          </View>
          {selectedPayment.reference && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: '#666' }}>Reference:</Text>
              <Text>{selectedPayment.reference}</Text>
            </View>
          )}
          {submittedAt && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: '#666' }}>Time Submitted:</Text>
              <Text>{formatDate(submittedAt)}</Text>
            </View>
          )}
          {selectedPayment.receipt_url && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: '#666' }}>Receipt:</Text>
              <Text>{selectedPayment.receipt_url}</Text>
            </View>
          )}
        </View>

        <View style={{ padding: 10, backgroundColor: '#fff7e6', borderRadius: 4, borderColor: '#ffe0b2', borderWidth: 1 }}>
          <Text style={{ fontWeight: 'bold', marginBottom: 8, color: '#8a6d3b' }}>Itemized Details</Text>
          {planName && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: '#666' }}>Plan:</Text>
              <Text>{planName}</Text>
            </View>
          )}
          {meta.subscription_id && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: '#666' }}>Subscription ID:</Text>
              <Text>{meta.subscription_id}</Text>
            </View>
          )}
          {meta.plan_clothes_limit !== undefined && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: '#666' }}>Plan Clothes Limit:</Text>
              <Text>{meta.plan_clothes_limit}</Text>
            </View>
          )}
          {meta.ordered_clothes !== undefined && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: '#666' }}>Ordered Clothes:</Text>
              <Text>{meta.ordered_clothes}</Text>
            </View>
          )}
          {meta.extra_clothes_count !== undefined && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: '#666' }}>Extra Clothes:</Text>
              <Text>{meta.extra_clothes_count} items</Text>
            </View>
          )}
          {meta.price_per_cloth !== undefined && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: '#666' }}>Rate:</Text>
              <Text>₦{meta.price_per_cloth}/item</Text>
            </View>
          )}
          {meta.extra_clothes_total_amount !== undefined && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: '#666' }}>Total Extra Cost:</Text>
              <Text>₦{meta.extra_clothes_total_amount}</Text>
            </View>
          )}
          {meta.remaining_clothes_before_order !== undefined && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: '#666' }}>Remaining Before:</Text>
              <Text>{meta.remaining_clothes_before_order}</Text>
            </View>
          )}
          {meta.emergency_clothes_count !== undefined && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: '#666' }}>Emergency Clothes:</Text>
              <Text>{meta.emergency_clothes_count} items</Text>
            </View>
          )}
          {meta.emergency_total_amount !== undefined && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: '#666' }}>Emergency Total:</Text>
              <Text>₦{meta.emergency_total_amount}</Text>
            </View>
          )}
          {meta.related_order_id && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: '#666' }}>Related Order ID:</Text>
              <Text>#{meta.related_order_id}</Text>
            </View>
          )}
          {!hasItemizedDetails && (
            <Text style={{ fontStyle: 'italic', color: '#666' }}>No itemized details available.</Text>
          )}
        </View>
      </View>
    );
  };

  const pendingTransferCount = payments.filter((p) => p.status === 'awaiting_verification' && p.gateway === 'bank_transfer').length;

  return (
    <Provider>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text variant="headlineMedium" style={styles.title}>Payments</Text>
          {canCreatePayment && <Button mode="contained" onPress={openAddModal} icon="plus">Add Payment</Button>}
        </View>

        <View style={styles.filters}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <Chip 
              selected={filterStatus === ''} 
              onPress={() => setFilterStatus('')} 
              style={styles.chip}
              testID="filter-status-all"
            >All Status</Chip>
            <Chip 
              selected={filterStatus === 'paid'} 
              onPress={() => setFilterStatus('paid')} 
              style={styles.chip}
              testID="filter-status-paid"
            >Paid</Chip>
            <Chip 
              selected={filterStatus === 'pending'} 
              onPress={() => setFilterStatus('pending')} 
              style={styles.chip}
              testID="filter-status-pending"
            >Pending</Chip>
            <Chip 
              selected={filterStatus === 'awaiting_verification'} 
              onPress={() => setFilterStatus('awaiting_verification')} 
              style={styles.chip}
              testID="filter-status-awaiting"
            >Awaiting Verification</Chip>
            <Chip 
              selected={filterStatus === 'rejected'} 
              onPress={() => setFilterStatus('rejected')} 
              style={styles.chip}
              testID="filter-status-rejected"
            >Rejected</Chip>
            <Chip 
              selected={filterStatus === 'failed'} 
              onPress={() => setFilterStatus('failed')} 
              style={styles.chip}
              testID="filter-status-failed"
            >Failed</Chip>
            
            <View style={{ width: 10 }} />
            
            <Chip 
              selected={filterType === ''} 
              onPress={() => setFilterType('')} 
              style={styles.chip}
              testID="filter-type-all"
            >All Types</Chip>
            <Chip 
              selected={filterType === 'subscription'} 
              onPress={() => setFilterType('subscription')} 
              style={styles.chip}
              testID="filter-type-subscription"
            >Subscription</Chip>
            <Chip 
              selected={filterType === 'extra_clothes'} 
              onPress={() => setFilterType('extra_clothes')} 
              style={styles.chip}
              testID="filter-type-extra"
            >Extra Clothes</Chip>
            <Chip 
              selected={filterType === 'emergency'} 
              onPress={() => setFilterType('emergency')} 
              style={styles.chip}
              testID="filter-type-emergency"
            >Emergency</Chip>

            <View style={{ width: 10 }} />

            <Chip 
              selected={filterGateway === ''} 
              onPress={() => setFilterGateway('')} 
              style={styles.chip}
              testID="filter-gateway-all"
            >All Gateways</Chip>
            <Chip 
              selected={filterGateway === 'bank_transfer'} 
              onPress={() => setFilterGateway('bank_transfer')} 
              style={styles.chip}
              testID="filter-gateway-bank-transfer"
            >Bank Transfer</Chip>
            <Chip 
              selected={filterGateway === 'cash'} 
              onPress={() => setFilterGateway('cash')} 
              style={styles.chip}
              testID="filter-gateway-cash"
            >Cash</Chip>
            <Chip 
              selected={filterGateway === 'paystack'} 
              onPress={() => setFilterGateway('paystack')} 
              style={styles.chip}
              testID="filter-gateway-paystack"
            >Paystack</Chip>
          </ScrollView>
        </View>
        {pendingTransferCount > 0 && (
          <View style={{ marginBottom: 10, flexDirection: 'row', alignItems: 'center' }}>
            <Text variant="bodyMedium">Pending bank transfers</Text>
            <Badge style={{ marginLeft: 8 }}>{pendingTransferCount}</Badge>
          </View>
        )}

        {loading ? (
          <ActivityIndicator animating={true} size="large" style={{ marginTop: 20 }} />
        ) : (
          <ScrollView style={styles.list}>
            {payments.map((p) => {
              const meta = p.metadata || {};
              const planName = meta.subscription_plan_name || meta.plan_name;
              const purpose = meta.payment_reason || (p.payment_type === 'subscription' ? 'Subscription' : p.payment_type === 'extra_clothes' ? 'Extra clothes' : p.payment_type === 'emergency' ? 'Emergency laundry' : p.payment_type);
              const itemCount = meta.extra_clothes_count !== undefined ? `${meta.extra_clothes_count} items` : '';
              const metaLine = [purpose, planName].filter(Boolean).join(' • ');
              const pendingOrderId = meta.subscription_id || meta.related_order_id;
              const submittedAt = meta.submitted_at || meta.submittedAt;
              return (
                <Card key={p.payment_id} style={styles.card} onPress={() => openEditModal(p)}>
                  <Card.Content style={styles.cardContent}>
                    <View style={styles.cardRow}>
                      <View>
                        <Text variant="titleMedium">#{p.payment_id} • {p.User?.full_name || 'Unknown User'}</Text>
                        <Text variant="bodySmall" style={{ color: '#666' }}>{formatDate(p.created_at)}</Text>
                      </View>
                      <Badge style={{ backgroundColor: getStatusColor(p.status), fontSize: 12, paddingHorizontal: 10 }}>
                        {p.status.toUpperCase()}
                      </Badge>
                    </View>
                    
                    <View style={styles.detailsRow}>
                      <Text variant="bodyMedium" style={{ fontWeight: 'bold' }}>₦{p.amount}</Text>
                      <Text variant="bodySmall">{p.payment_type} • {p.gateway}</Text>
                    </View>
                    {(metaLine || itemCount) && (
                      <Text variant="bodySmall" style={{ color: '#0056b3', marginTop: 2 }}>
                        {metaLine}{itemCount ? ` (${itemCount})` : ''}
                      </Text>
                    )}
                    {p.status === 'awaiting_verification' && (
                      <View style={{ marginTop: 6 }}>
                        <Text variant="bodySmall">Order ID: {pendingOrderId ? `#${pendingOrderId}` : '-'}</Text>
                        <Text variant="bodySmall">Time Submitted: {submittedAt ? formatDate(submittedAt) : '-'}</Text>
                      </View>
                    )}
                    {canUpdateStatus && p.status === 'awaiting_verification' && (
                      <View style={{ flexDirection: 'row', marginTop: 12 }}>
                        <Button mode="contained" onPress={() => handleQuickStatus(p.payment_id, 'paid')} style={{ marginRight: 8 }} disabled={statusUpdatingId === p.payment_id}>
                          Mark Paid
                        </Button>
                        <Button mode="outlined" onPress={() => handleQuickStatus(p.payment_id, 'rejected')} disabled={statusUpdatingId === p.payment_id}>
                          Reject
                        </Button>
                      </View>
                    )}
                    {canUpdateStatus && (
                      <View style={{ marginTop: 12 }}>
                        <Text style={styles.inlineLabel}>Status</Text>
                        <View style={styles.inlinePickerContainer}>
                          <Picker
                            selectedValue={p.status}
                            onValueChange={(value) => handleInlineStatusChange(p, value)}
                            style={styles.inlinePicker}
                            enabled={statusUpdatingId !== p.payment_id}
                            testID={`payment-status-${p.payment_id}`}
                          >
                            <Picker.Item label="Paid" value="paid" />
                            <Picker.Item label="Pending" value="pending" />
                            <Picker.Item label="Awaiting Verification" value="awaiting_verification" />
                            <Picker.Item label="Rejected" value="rejected" />
                            <Picker.Item label="Declined" value="declined" />
                            <Picker.Item label="Failed" value="failed" />
                          </Picker>
                        </View>
                      </View>
                    )}
                  </Card.Content>
                </Card>
              );
            })}
            {payments.length === 0 && (
              <Text style={{ textAlign: 'center', marginTop: 20, color: '#666' }}>No payments found.</Text>
            )}
          </ScrollView>
        )}

        <Portal>
          <Modal visible={visible} onDismiss={() => setVisible(false)} contentContainerStyle={styles.modal}>
            <Text variant="headlineSmall" style={{ marginBottom: 15 }}>
              {readOnly || !canEditPayment ? 'Payment Details' : (isEdit ? 'Edit Payment Status' : 'Add New Payment')}
            </Text>
            
            {isEdit && renderPaymentDetails()}
            
            {!isEdit && canCreatePayment && (
              <>
                {userId ? (
                   <View style={{ marginBottom: 15, padding: 10, backgroundColor: '#f0f0f0', borderRadius: 4, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View>
                        <Text style={{ fontWeight: 'bold' }}>Selected User:</Text>
                        <Text>{users.find(u => u.user_id === parseInt(userId))?.full_name || userId}</Text>
                        <Text style={{ fontSize: 12, color: '#666' }}>{users.find(u => u.user_id === parseInt(userId))?.phone_number}</Text>
                      </View>
                      <Button mode="text" onPress={() => setUserId('')} compact>Change</Button>
                   </View>
                ) : (
                  <View style={{ marginBottom: 15 }}>
                    <TextInput 
                      label="Select User (Search Name/Phone)" 
                      value={userSearchQuery} 
                      onChangeText={setUserSearchQuery} 
                      mode="outlined" 
                      style={styles.input}
                      right={<TextInput.Icon icon="magnify" />}
                    />
                    <ScrollView style={{ maxHeight: 200, backgroundColor: '#fff', borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#ccc', marginTop: -5 }}>
                        {users.filter(u => 
                           !userSearchQuery || 
                           u.full_name?.toLowerCase().includes(userSearchQuery.toLowerCase()) || 
                           u.phone_number?.includes(userSearchQuery)
                        ).map(u => (
                          <TouchableOpacity 
                            key={u.user_id} 
                            style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: '#eee' }}
                            onPress={() => {
                              setUserId(String(u.user_id));
                              setUserSearchQuery('');
                            }}
                          >
                             <Text style={{ fontWeight: 'bold' }}>{u.full_name}</Text>
                             <Text style={{ fontSize: 12, color: '#666' }}>{u.phone_number}</Text>
                          </TouchableOpacity>
                        ))}
                        {users.length === 0 && <Text style={{ padding: 10, color: '#666' }}>No users found</Text>}
                    </ScrollView>
                  </View>
                )}
                <TextInput 
                  label="Amount (₦)" 
                  value={amount} 
                  onChangeText={setAmount} 
                  keyboardType="numeric" 
                  mode="outlined" 
                  style={styles.input}
                />
                
                <Text style={styles.label}>Payment Type</Text>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={type}
                    onValueChange={setType}
                    style={styles.picker}
                  >
                    <Picker.Item label="Subscription" value="subscription" />
                    <Picker.Item label="Extra Clothes" value="extra_clothes" />
                    <Picker.Item label="Emergency" value="emergency" />
                  </Picker>
                </View>

                <Text style={styles.label}>Gateway</Text>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={gateway}
                    onValueChange={setGateway}
                    style={styles.picker}
                  >
                    <Picker.Item label="Cash" value="cash" />
                    <Picker.Item label="Bank Transfer" value="bank_transfer" />
                    <Picker.Item label="Paystack" value="paystack" />
                  </Picker>
                </View>
              </>
            )}

            <Text style={styles.label}>Status</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={status}
                onValueChange={setStatus}
                style={styles.picker}
                enabled={canEditPayment}
              >
                <Picker.Item label="Paid" value="paid" />
                <Picker.Item label="Pending" value="pending" />
                <Picker.Item label="Awaiting Verification" value="awaiting_verification" />
                <Picker.Item label="Rejected" value="rejected" />
                <Picker.Item label="Declined" value="declined" />
                <Picker.Item label="Failed" value="failed" />
              </Picker>
            </View>

            {!isEdit && canCreatePayment && (
              <TextInput 
                label="Reference / Note" 
                value={reference} 
                onChangeText={setReference} 
                mode="outlined" 
                style={styles.input}
              />
            )}

            <View style={styles.modalActions}>
              <Button onPress={() => setVisible(false)} style={{ marginRight: 10 }}>{readOnly || !canEditPayment ? 'Close' : 'Cancel'}</Button>
              {canEditPayment && <Button mode="contained" onPress={handleSave} testID="btn-save-payment">Save</Button>}
            </View>
          </Modal>
        </Portal>
        <Snackbar
          visible={toast.visible}
          onDismiss={() => setToast((prev) => ({ ...prev, visible: false }))}
          duration={3000}
        >
          {toast.message}
        </Snackbar>
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
  cardContent: {
    paddingVertical: 10,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modal: {
    backgroundColor: 'white',
    padding: 20,
    margin: 20,
    borderRadius: 8,
    maxHeight: '90%', // Ensure it doesn't overflow
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
  inlineLabel: {
    marginBottom: 6,
    fontSize: 12,
    color: '#666',
  },
  inlinePickerContainer: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    ...(Platform.OS === 'web' ? { height: 40, justifyContent: 'center' } : {}),
  },
  inlinePicker: {
    ...(Platform.OS === 'web' ? { height: 40, border: 'none' } : {}),
  },
});
