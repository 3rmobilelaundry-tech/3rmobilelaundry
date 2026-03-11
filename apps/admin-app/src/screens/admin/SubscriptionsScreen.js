import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity, Alert, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Card from '../../components/ui/Card';
import Table from '../../components/ui/Table';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Input from '../../components/ui/Input';
import { getTokens } from '../../theme/tokens';
import { normalizeApiError, staff } from '../../services/api';

const tokens = getTokens();

export default function SubscriptionsScreen() {
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [extendModalVisible, setExtendModalVisible] = useState(false);
  const [selectedSub, setSelectedSub] = useState(null);
  const [extendDays, setExtendDays] = useState('30');
  
  // New State for Subscription Management
  const [plans, setPlans] = useState([]);
  const [users, setUsers] = useState([]);
  const [subModalVisible, setSubModalVisible] = useState(false);
  const [isEditingSub, setIsEditingSub] = useState(false);
  const [subFormData, setSubFormData] = useState({
    user_id: '',
    plan_id: '',
    status: 'active',
    start_date: '',
    end_date: '',
    price: '',
    coupon: '',
    email: ''
  });
  const [userSearch, setUserSearch] = useState('');
  const [showUserList, setShowUserList] = useState(false);
  const [subFormErrors, setSubFormErrors] = useState({});
  const [savingSub, setSavingSub] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' });

  useEffect(() => {
    fetchSubs();
    fetchResources();
  }, []);

  useEffect(() => {
    setSubFormErrors(validateSubForm(subFormData));
  }, [subFormData]);

  const showToast = useCallback((message, type = 'info') => {
    setToast({ visible: true, message, type });
    setTimeout(() => {
      setToast((prev) => ({ ...prev, visible: false }));
    }, 3000);
  }, []);

  const fetchResources = async () => {
    try {
      const [pRes, uRes] = await Promise.all([staff.listPlans(), staff.listUsers()]);
      setPlans(pRes.data);
      const nextUsers = Array.isArray(uRes.data) ? uRes.data : (uRes.data?.items || []);
      setUsers(nextUsers);
    } catch (e) {
      const normalized = normalizeApiError(e);
      console.log('Failed to load resources', normalized);
      showToast(normalized.message, 'error');
      try {
        await staff.logFrontError({
          source: 'admin-web',
          message: 'Failed to load subscription resources',
          context: { scope: 'SubscriptionsScreen.fetchResources', normalized }
        });
      } catch {}
    }
  };

  const fetchSubs = async () => {
    try {
      setLoading(true);
      const res = await staff.listSubscriptions();
      setSubs(res.data);
    } catch (error) {
      const normalized = normalizeApiError(error);
      showToast(normalized.message, 'error');
      try {
        await staff.logFrontError({
          source: 'admin-web',
          message: 'Failed to load subscriptions',
          context: { scope: 'SubscriptionsScreen.fetchSubs', normalized }
        });
      } catch {}
    } finally {
      setLoading(false);
    }
  };

  const handlePauseResume = async (sub) => {
    try {
      const newStatus = sub.status === 'active' ? 'paused' : 'active';
      await staff.updateSubscription(sub.subscription_id, { status: newStatus });
      fetchSubs();
      Alert.alert('Success', `Subscription ${newStatus === 'active' ? 'resumed' : 'paused'}`);
    } catch (error) {
      Alert.alert('Error', error.message);
    }
  };

  const handleCancel = async (sub) => {
    Alert.alert(
      'Cancel Subscription',
      'Are you sure you want to cancel this subscription? This cannot be undone.',
      [
        { text: 'No', style: 'cancel' },
        { 
          text: 'Yes, Cancel', 
          style: 'destructive',
          onPress: async () => {
            try {
              await staff.updateSubscription(sub.subscription_id, { status: 'cancelled' });
              fetchSubs();
            } catch (error) {
              Alert.alert('Error', error.message);
            }
          }
        }
      ]
    );
  };

  const openExtendModal = (sub) => {
    setSelectedSub(sub);
    setExtendDays('30');
    setExtendModalVisible(true);
  };

  const handleExtend = async () => {
    if (!selectedSub) return;
    try {
      const days = parseInt(extendDays);
      if (isNaN(days) || days <= 0) {
        Alert.alert('Error', 'Invalid days');
        return;
      }
      
      const currentEnd = new Date(selectedSub.end_date);
      const newEnd = new Date(currentEnd);
      newEnd.setDate(newEnd.getDate() + days);
      
      await staff.updateSubscription(selectedSub.subscription_id, { 
        end_date: newEnd.toISOString().split('T')[0] 
      });
      
      setExtendModalVisible(false);
      fetchSubs();
      Alert.alert('Success', 'Subscription extended');
    } catch (error) {
      Alert.alert('Error', error.message);
    }
  };

  const openAddSubscription = () => {
    setIsEditingSub(false);
    setSubFormData({ user_id: '', plan_id: '', status: 'active', start_date: '', end_date: '', price: '', coupon: '', email: '' });
    setUserSearch('');
    setSubModalVisible(true);
  };

  const openEditSubscription = (sub) => {
    setIsEditingSub(true);
    setSelectedSub(sub);
    const plan = plans.find((p) => p.plan_id === sub.plan_id);
    const price = plan?.price ? String(plan.price) : '';
    setSubFormData({
      user_id: sub.user_id,
      plan_id: sub.plan_id,
      status: sub.status,
      start_date: sub.start_date || '',
      end_date: sub.end_date || '',
      price,
      coupon: '',
      email: sub.User?.email || ''
    });
    const user = sub.User; // Use sub.User directly if available, fallback to list
    setUserSearch(user ? (user.full_name || user.email) : '');
    setSubModalVisible(true);
  };

  const isValidDate = (value) => {
    if (!value) return false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value);
    return !Number.isNaN(date.getTime());
  };

  const validateSubForm = (data) => {
    const errors = {};
    if (!data.user_id) errors.user_id = 'Select a student';
    if (!data.plan_id) errors.plan_id = 'Select a plan';
    if (!data.status) errors.status = 'Select a status';
    if (!data.start_date || !isValidDate(data.start_date)) errors.start_date = 'Enter a valid start date';
    if (!data.end_date || !isValidDate(data.end_date)) errors.end_date = 'Enter a valid end date';
    if (data.start_date && data.end_date && isValidDate(data.start_date) && isValidDate(data.end_date)) {
      if (new Date(data.end_date) < new Date(data.start_date)) errors.end_date = 'End date must be after start date';
    }
    const priceValue = Number(data.price);
    if (!data.price || Number.isNaN(priceValue) || priceValue <= 0) errors.price = 'Enter a valid price';
    if (data.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(data.email)) errors.email = 'Enter a valid email';
    } else {
      errors.email = 'Email is required';
    }
    if (data.coupon) {
      const couponRegex = /^[A-Za-z0-9_-]{3,}$/;
      if (!couponRegex.test(data.coupon)) errors.coupon = 'Coupon must be at least 3 characters';
    }
    return errors;
  };

  const handleSaveSubscription = async () => {
    const errors = validateSubForm(subFormData);
    setSubFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      showToast('Fix form errors before saving', 'error');
      return;
    }
    
    try {
        setSavingSub(true);
        const plan = plans.find(p => p.plan_id === subFormData.plan_id);
        if (!plan) {
            showToast('Invalid plan', 'error');
            return;
        }

        if (isEditingSub) {
             const payload = {};
             if (subFormData.status !== selectedSub.status) payload.status = subFormData.status;
             
             if (subFormData.plan_id !== selectedSub.plan_id) {
                 payload.plan_id = subFormData.plan_id;
                 payload.start_date = subFormData.start_date;
                 payload.end_date = subFormData.end_date;
                 payload.remaining_pickups = plan.max_pickups;
             }
             if (subFormData.start_date !== selectedSub.start_date) payload.start_date = subFormData.start_date;
             if (subFormData.end_date !== selectedSub.end_date) payload.end_date = subFormData.end_date;
             
             if (Object.keys(payload).length > 0) {
                 await staff.updateSubscription(selectedSub.subscription_id, payload);
                 showToast('Subscription updated', 'success');
             }
        } else {
            const payload = {
                user_id: subFormData.user_id,
                plan_id: subFormData.plan_id,
                status: subFormData.status,
                start_date: subFormData.start_date,
                end_date: subFormData.end_date,
                remaining_pickups: plan.max_pickups
            };
            await staff.createSubscription(payload);
            showToast('Subscription created', 'success');
        }
        
        setSubModalVisible(false);
        fetchSubs();
    } catch (error) {
        const normalized = normalizeApiError(error);
        showToast(normalized.message, 'error');
        try {
          await staff.logFrontError({
            source: 'admin-web',
            message: 'Failed to save subscription',
            context: { scope: 'SubscriptionsScreen.handleSaveSubscription', normalized }
          });
        } catch {}
    } finally {
        setSavingSub(false);
    }
  };

  const getFilteredSubs = () => {
    if (filter === 'all') return subs;
    return subs.filter(s => s.status === filter);
  };

  const filteredUsers = useMemo(() => {
    if (!userSearch) return users;
    const q = userSearch.toLowerCase();
    return users.filter(u =>
      (u.full_name?.toLowerCase() || '').includes(q) ||
      (u.student_id?.toLowerCase() || '').includes(q) ||
      (u.email?.toLowerCase() || '').includes(q) ||
      (u.phone_number || '').includes(userSearch)
    );
  }, [users, userSearch]);

  const columns = [
    { title: 'User', key: 'user', flex: 1, render: (item) => (
      <View>
        <Text style={styles.userName}>{item.User?.full_name || 'Unknown'}</Text>
        <Text style={styles.userSub}>{item.User?.student_id || item.User?.email}</Text>
      </View>
    )},
    { title: 'Plan', key: 'plan', width: 100, render: (item) => (
      <View>
        <Text style={styles.planName}>{item.Plan?.name || 'Unknown'}</Text>
        <Text style={styles.planType}>{item.Plan?.type || ''}</Text>
      </View>
    )},
    { title: 'Pickups', key: 'usage', width: 120, render: (item) => {
      const max = item.Plan?.max_pickups || 0;
      const remaining = item.remaining_pickups;
      const used = max - remaining;
      const progress = max > 0 ? (used / max) : 0;
      
      return (
        <View>
          <Text style={styles.usageText}>{used} used / {remaining} left</Text>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${Math.min(progress * 100, 100)}%` }]} />
          </View>
        </View>
      );
    }},
    { title: 'Expiry', key: 'expiry', width: 100, render: (item) => (
      <View>
        <Text style={styles.dateText}>{item.end_date}</Text>
        {new Date(item.end_date) < new Date() && item.status !== 'expired' && (
           <Text style={styles.expiredLabel}>Expired</Text>
        )}
      </View>
    )},
    { title: 'Status', key: 'status', width: 80, render: (item) => (
      <Badge variant={
        item.status === 'active' ? 'success' : 
        item.status === 'expired' ? 'error' : 
        item.status === 'paused' ? 'warning' : 'secondary'
      }>
        {item.status.toUpperCase()}
      </Badge>
    )},
    { title: 'Actions', key: 'actions', width: 120, render: (item) => (
      <View style={styles.actions}>
        <TouchableOpacity onPress={() => openEditSubscription(item)} style={styles.actionBtn}>
          <Ionicons name="pencil" size={18} color={tokens.colors.text} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => openExtendModal(item)} style={styles.actionBtn}>
          <Ionicons name="time-outline" size={18} color={tokens.colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handlePauseResume(item)} style={styles.actionBtn}>
          <Ionicons name={item.status === 'active' ? "pause-circle-outline" : "play-circle-outline"} size={18} color={tokens.colors.warning} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleCancel(item)} style={styles.actionBtn}>
          <Ionicons name="close-circle-outline" size={18} color={tokens.colors.error} />
        </TouchableOpacity>
      </View>
    )}
  ];

  return (
    <View style={styles.container}>
      <Card title="Subscriptions" 
        action={
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 12}}>
            <View style={styles.filterRow}>
              {['all', 'active', 'expired', 'paused'].map(f => (
                <TouchableOpacity key={f} onPress={() => setFilter(f)} style={[styles.filterChip, filter === f && styles.filterChipActive]}>
                  <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>{f.toUpperCase()}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Button title="Add Student" icon="add" size="sm" onPress={openAddSubscription} />
          </View>
        }
      >
        <Table columns={columns} data={getFilteredSubs()} />
      </Card>

      <Modal visible={extendModalVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Extend Subscription</Text>
            <Text style={styles.modalSub}>Add days to the current expiry date.</Text>
            
            <Input 
              label="Days to Add" 
              value={extendDays} 
              onChangeText={setExtendDays} 
              keyboardType="numeric" 
              placeholder="e.g. 30" 
            />
            
            <View style={styles.modalFooter}>
              <Button title="Cancel" variant="outline" onPress={() => setExtendModalVisible(false)} style={{marginRight: 8, flex: 1}} />
              <Button title="Extend" onPress={handleExtend} style={{flex: 1}} />
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={subModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{isEditingSub ? 'Edit Subscription' : 'New Subscription'}</Text>
              <TouchableOpacity onPress={() => setSubModalVisible(false)}>
                <Ionicons name="close" size={24} color={tokens.colors.text} />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalBody}>
              <Text style={styles.label}>Student</Text>
              {isEditingSub ? (
                 <Input value={userSearch} editable={false} />
              ) : (
                 <View style={{zIndex: 100}}>
                    <Input 
                      placeholder="Search student name or ID..." 
                      value={userSearch} 
                      onChangeText={t => { setUserSearch(t); setShowUserList(true); }}
                      onFocus={() => setShowUserList(true)}
                      onBlur={() => setTimeout(() => setShowUserList(false), 150)}
                      error={subFormErrors.user_id}
                    />
                    {showUserList && (
                       <View style={styles.dropdownList}>
                          <FlatList
                             data={filteredUsers}
                             keyExtractor={item => String(item.user_id)}
                             style={{maxHeight: 200}}
                             nestedScrollEnabled
                             renderItem={({item}) => (
                               <TouchableOpacity style={styles.dropdownItem} onPress={() => {
                                  setSubFormData({...subFormData, user_id: item.user_id, email: item.email || ''});
                                  setUserSearch(item.full_name || item.email || '');
                                  setShowUserList(false);
                               }}>
                                  <Text style={styles.dropdownItemText}>{item.full_name} ({item.student_id || 'No ID'})</Text>
                               </TouchableOpacity>
                             )}
                             ListEmptyComponent={() => (
                               <Text style={styles.dropdownEmpty}>No matching students</Text>
                             )}
                          />
                       </View>
                    )}
                 </View>
              )}
              <Input
                label="Email"
                placeholder="student@example.com"
                value={subFormData.email}
                onChangeText={(value) => setSubFormData({ ...subFormData, email: value })}
                error={subFormErrors.email}
              />

              <Text style={styles.label}>Plan</Text>
              <View style={styles.typeRow}>
                {plans.map(plan => (
                  <TouchableOpacity 
                    key={plan.plan_id} 
                    style={[styles.typeChip, subFormData.plan_id === plan.plan_id && styles.typeChipActive]}
                    onPress={() => {
                      const duration = plan.duration_days || 30;
                      const startDate = subFormData.start_date && isValidDate(subFormData.start_date) ? new Date(subFormData.start_date) : new Date();
                      const endDate = new Date(startDate);
                      endDate.setDate(startDate.getDate() + duration);
                      setSubFormData({
                        ...subFormData,
                        plan_id: plan.plan_id,
                        price: String(plan.price),
                        start_date: startDate.toISOString().split('T')[0],
                        end_date: endDate.toISOString().split('T')[0]
                      });
                    }}
                  >
                    <Text style={[styles.typeText, subFormData.plan_id === plan.plan_id && styles.typeTextActive]}>
                      {plan.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {subFormErrors.plan_id ? <Text style={styles.errorText}>{subFormErrors.plan_id}</Text> : null}

              <Input
                label="Start Date"
                placeholder="YYYY-MM-DD"
                value={subFormData.start_date}
                onChangeText={(value) => setSubFormData({ ...subFormData, start_date: value })}
                error={subFormErrors.start_date}
              />
              <Input
                label="End Date"
                placeholder="YYYY-MM-DD"
                value={subFormData.end_date}
                onChangeText={(value) => setSubFormData({ ...subFormData, end_date: value })}
                error={subFormErrors.end_date}
              />
              <Input
                label="Price"
                placeholder="0.00"
                value={subFormData.price}
                onChangeText={(value) => setSubFormData({ ...subFormData, price: value })}
                keyboardType="numeric"
                error={subFormErrors.price}
              />
              <Input
                label="Coupon"
                placeholder="Optional"
                value={subFormData.coupon}
                onChangeText={(value) => setSubFormData({ ...subFormData, coupon: value })}
                error={subFormErrors.coupon}
              />

              <Text style={styles.label}>Status</Text>
              <View style={styles.typeRow}>
                 {['active', 'pending', 'denied', 'paused'].map(status => (
                    <TouchableOpacity 
                       key={status}
                       style={[styles.typeChip, subFormData.status === status && styles.typeChipActive]}
                       onPress={() => setSubFormData({...subFormData, status})}
                    >
                       <Text style={[styles.typeText, subFormData.status === status && styles.typeTextActive]}>
                          {status.charAt(0).toUpperCase() + status.slice(1)}
                       </Text>
                    </TouchableOpacity>
                 ))}
              </View>
              {subFormErrors.status ? <Text style={styles.errorText}>{subFormErrors.status}</Text> : null}
            </ScrollView>

            <View style={styles.modalFooter}>
              <Button title="Cancel" variant="outline" onPress={() => setSubModalVisible(false)} style={{marginRight: 8, flex: 1}} />
              <Button title="Save Subscription" onPress={handleSaveSubscription} style={{flex: 1}} loading={savingSub} disabled={savingSub || Object.keys(subFormErrors).length > 0} />
            </View>
          </View>
        </View>
      </Modal>
      {toast.visible && (
        <View style={[styles.toast, toast.type === 'error' ? styles.toastError : styles.toastSuccess]}>
          <Text style={styles.toastText}>{toast.message}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: tokens.spacing.md,
  },
  userName: {
    fontWeight: 'bold',
    color: tokens.colors.text,
  },
  userSub: {
    fontSize: 12,
    color: tokens.colors.textSecondary,
  },
  planName: {
    fontWeight: '500',
    color: tokens.colors.primary,
  },
  planType: {
    fontSize: 10,
    color: tokens.colors.textSecondary,
    textTransform: 'capitalize',
  },
  usageText: {
    fontSize: 12,
    color: tokens.colors.text,
    marginBottom: 4,
  },
  progressBar: {
    height: 4,
    backgroundColor: tokens.colors.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: tokens.colors.primary,
  },
  dateText: {
    fontSize: 13,
    color: tokens.colors.text,
  },
  expiredLabel: {
    fontSize: 10,
    color: tokens.colors.error,
    fontWeight: 'bold',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    padding: 4,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterChip: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  filterChipActive: {
    backgroundColor: tokens.colors.primary,
    borderColor: tokens.colors.primary,
  },
  filterText: {
    fontSize: 12,
    color: tokens.colors.textSecondary,
  },
  filterTextActive: {
    color: '#fff',
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: tokens.colors.card,
    borderRadius: tokens.radius.lg,
    width: '100%',
    maxWidth: 400,
    padding: tokens.spacing.lg,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: tokens.colors.text,
    marginBottom: 8,
  },
  modalSub: {
    fontSize: 14,
    color: tokens.colors.textSecondary,
    marginBottom: 16,
  },
  modalFooter: {
    flexDirection: 'row',
    marginTop: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: tokens.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.border,
  },
  modalBody: {
    padding: tokens.spacing.md,
  },
  label: {
    fontSize: tokens.typography.sizes.sm,
    color: '#222222',
    marginBottom: 8,
    marginTop: 8,
    fontWeight: '500',
  },
  typeRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  typeChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    backgroundColor: tokens.colors.bg,
  },
  typeChipActive: {
    borderColor: tokens.colors.primary,
    backgroundColor: tokens.colors.primary + '10',
  },
  typeText: {
    fontSize: 14,
    color: '#222222',
  },
  typeTextActive: {
    color: tokens.colors.primary,
    fontWeight: 'bold',
  },
  dropdownList: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderRadius: 8,
    maxHeight: 200,
    zIndex: 1000,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  dropdownItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.border + '40',
  },
  dropdownItemText: {
    fontSize: 14,
    color: tokens.colors.text,
  },
  dropdownEmpty: {
    padding: 12,
    color: tokens.colors.textSecondary,
    fontSize: 12,
  },
  errorText: {
    color: tokens.colors.error,
    fontSize: 12,
    marginTop: -8,
    marginBottom: 8,
  },
  toast: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    padding: 12,
    borderRadius: 8,
    elevation: 5,
  },
  toastSuccess: {
    backgroundColor: tokens.colors.success || '#2e7d32',
  },
  toastError: {
    backgroundColor: tokens.colors.error,
  },
  toastText: {
    color: '#fff',
    fontWeight: '600',
    textAlign: 'center',
  },
});
