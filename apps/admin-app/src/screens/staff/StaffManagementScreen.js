import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, ScrollView, Alert, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Snackbar } from 'react-native-paper';
import Card from '../../components/ui/Card';
import Table from '../../components/ui/Table';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Input from '../../components/ui/Input';
import { staff } from '../../services/api';
import { getTokens } from '../../theme/tokens';
import { useSync } from '../../context/SyncContext';
import logger from '../../services/logger';

const tokens = getTokens();

export default function StaffManagementScreen({ lastUpdate }) {
  const { lastEvent } = useSync();
  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Toasts
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastVariant, setToastVariant] = useState('success'); // success | error

  const showToast = (msg, variant = 'success') => {
    setToastMessage(msg);
    setToastVariant(variant);
    setToastVisible(true);
  };
  const [roleFilter, setRoleFilter] = useState('all'); // receptionist, rider, washer, admin
  
  // Modals
  const [modalVisible, setModalVisible] = useState(false);
  const [activityModalVisible, setActivityModalVisible] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userActivities, setUserActivities] = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);
  
  // Form Data
  const [formData, setFormData] = useState({
    full_name: '',
    phone_number: '',
    email: '',
    role: 'receptionist',
    password: '',
    status: 'active'
  });

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    if (lastEvent && (lastEvent.type === 'user_registered' || lastEvent.type === 'user_updated')) {
        fetchUsers();
    }
  }, [lastEvent]);

  useEffect(() => {
    filterData();
  }, [users, search, roleFilter]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await staff.listUsers();
      const payload = res.data;
      const list = Array.isArray(payload) ? payload : payload.items || [];
      const staffUsers = list.filter(u => ['admin', 'receptionist', 'rider', 'washer'].includes(u.role));
      setUsers(staffUsers);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to fetch staff');
    } finally {
      setLoading(false);
    }
  };

  const filterData = () => {
    let result = users;
    
    // Search
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(u => 
        u.full_name?.toLowerCase().includes(q) || 
        u.email?.toLowerCase().includes(q) ||
        u.phone_number?.includes(q)
      );
    }

    // Role Filter
    if (roleFilter !== 'all') {
      result = result.filter(u => u.role === roleFilter);
    }

    setFilteredUsers(result);
  };

  const handleAddUser = () => {
    setSelectedUser(null);
    setFormData({
      full_name: '',
      phone_number: '',
      email: '',
      role: 'receptionist',
      password: '',
      status: 'active'
    });
    setModalVisible(true);
  };

  const handleEditUser = (user) => {
    setSelectedUser(user);
    setFormData({
      full_name: user.full_name || '',
      phone_number: user.phone_number || '',
      email: user.email || '',
      role: user.role || 'receptionist',
      password: '', // Leave empty to keep existing
      status: user.status || 'active'
    });
    setModalVisible(true);
  };

  const validatePassword = (pwd) => {
    const regex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/;
    return regex.test(pwd);
  };

  const handleSaveUser = async () => {
    logger.log('Save Staff Clicked', formData);

    if (!formData.full_name || !formData.phone_number || !formData.role) {
      showToast('Name, Phone and Role are required', 'error');
      logger.log('Validation Failed', { reason: 'Missing fields', formData });
      return;
    }

    // Password Validation
    if (!selectedUser && !formData.password) {
        showToast('Password is required for new users', 'error');
        return;
    }

    if (formData.password && !validatePassword(formData.password)) {
        showToast('Password must be at least 8 chars with letters and numbers', 'error');
        return;
    }

    setSaving(true);
    try {
      const payload = { ...formData };
      if (!payload.password) delete payload.password; // Don't send empty password on edit

      logger.log('Sending Staff Payload', payload);

      if (selectedUser) {
        await staff.updateUser(selectedUser.user_id, payload);
        showToast('Staff member updated successfully');
      } else {
        await staff.createUser(payload);
        showToast('Staff member added successfully');
      }
      
      logger.log('Staff Save Success');
      setModalVisible(false);
      fetchUsers();
    } catch (e) {
      const errorMsg = e.response?.data?.error || 'Failed to save staff';
      logger.error('Staff Save Error', e);
      showToast(errorMsg, 'error');
      // Keep modal open
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (user) => {
    const newStatus = (user.status === 'suspended') ? 'active' : 'suspended';
    try {
      await staff.updateUser(user.user_id, { status: newStatus });
      fetchUsers(); // Or rely on SSE
      Alert.alert('Success', `User ${newStatus === 'active' ? 'activated' : 'suspended'}`);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to update status');
    }
  };

  const columns = [
    { title: 'Name', key: 'full_name', flex: 1, render: (item) => (
      <View>
        <Text style={{fontWeight: 'bold', color: tokens.colors.text}}>{item.full_name}</Text>
        <Text style={{fontSize: 12, color: tokens.colors.textSecondary}}>{item.phone_number}</Text>
      </View>
    )},
    { title: 'Role', key: 'role', width: 100, render: (item) => {
      let variant = 'neutral';
      if (item.role === 'admin') variant = 'danger';
      if (item.role === 'receptionist') variant = 'primary';
      if (item.role === 'rider') variant = 'warning';
      if (item.role === 'washer') variant = 'success';
      return <Badge variant={variant}>{item.role}</Badge>;
    }},
    { title: 'Status', key: 'status', width: 100, render: (item) => (
      <Badge variant={item.status === 'suspended' ? 'danger' : 'success'}>
        {item.status || 'active'}
      </Badge>
    )},
    { 
      title: 'Actions', 
      key: 'actions', 
      width: 180,
      render: (item) => (
        <View style={{flexDirection: 'row', gap: 8}}>
          <Button title="Edit" size="sm" variant="ghost" onPress={() => handleEditUser(item)} />
          <Button 
            title={item.status === 'suspended' ? 'Activate' : 'Suspend'} 
            size="sm" 
            variant={item.status === 'suspended' ? 'success' : 'danger'} 
            onPress={() => toggleStatus(item)} 
          />
        </View>
      ) 
    },
  ];

  return (
    <View style={styles.container}>
      <Card 
        title="Staff Management" 
        action={<Button title="Add Staff" icon="add" onPress={handleAddUser} />}
      >
        {/* Filters */}
        <View style={styles.filterRow}>
          <Input 
            placeholder="Search staff..." 
            value={search} 
            onChangeText={setSearch} 
            style={{flex: 1, marginBottom: 0}}
          />
          <View style={styles.chips}>
            {['all', 'receptionist', 'rider', 'washer', 'admin'].map(r => (
              <TouchableOpacity 
                key={r} 
                style={[styles.chip, roleFilter === r && styles.activeChip]}
                onPress={() => setRoleFilter(r)}
              >
                <Text style={[styles.chipText, roleFilter === r && styles.activeChipText]}>
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <Table columns={columns} data={filteredUsers} />
      </Card>

      {/* Add/Edit Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{selectedUser ? 'Edit Staff' : 'Add Staff'}</Text>
            
            <Input 
              testID="input-fullname"
              label="Full Name" 
              value={formData.full_name} 
              onChangeText={t => setFormData({...formData, full_name: t})} 
            />
            <Input 
              testID="input-phone"
              label="Phone Number" 
              value={formData.phone_number} 
              onChangeText={t => setFormData({...formData, phone_number: t})} 
              keyboardType="phone-pad"
            />
            <Input 
              testID="input-email"
              label="Email" 
              value={formData.email} 
              onChangeText={t => setFormData({...formData, email: t})} 
              keyboardType="email-address"
            />
            
            <View style={{marginBottom: 16}}>
              <Text style={styles.label}>Role</Text>
              <View style={styles.chips}>
                {['receptionist', 'rider', 'washer', 'admin'].map(r => (
                  <TouchableOpacity 
                    key={r} 
                    testID={`role-${r}`}
                    style={[styles.chip, formData.role === r && styles.activeChip]}
                    onPress={() => setFormData({...formData, role: r})}
                  >
                    <Text style={[styles.chipText, formData.role === r && styles.activeChipText]}>
                      {r.charAt(0).toUpperCase() + r.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <Input 
              testID="input-password"
              label={selectedUser ? "New Password (Optional)" : "Password"}
              value={formData.password} 
              onChangeText={t => setFormData({...formData, password: t})} 
              secureTextEntry
              placeholder={selectedUser ? "Leave empty to keep current" : "Min 8 chars, letters & numbers"}
            />

            <View style={styles.modalActions}>
              <Button title="Cancel" variant="ghost" onPress={() => setModalVisible(false)} disabled={saving} />
              <Button 
                testID="btn-save-staff"
                title={saving ? "Saving..." : "Save Staff"} 
                onPress={handleSaveUser} 
                disabled={saving}
              />
              {saving && <ActivityIndicator size="small" color={tokens.colors.primary} style={{marginLeft: 10}} />}
            </View>
          </View>
        </View>
      </Modal>

      <Snackbar
        visible={toastVisible}
        onDismiss={() => setToastVisible(false)}
        duration={3000}
        style={{ backgroundColor: toastVariant === 'error' ? tokens.colors.danger : tokens.colors.success }}
      >
        {toastMessage}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  filterRow: { flexDirection: 'row', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, backgroundColor: tokens.colors.surfaceAlt, borderWidth: 1, borderColor: tokens.colors.border },
  activeChip: { backgroundColor: tokens.colors.primary, borderColor: tokens.colors.primary },
  chipText: { fontSize: 12, color: tokens.colors.textSecondary },
  activeChipText: { color: tokens.colors.textInverted, fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: tokens.colors.surface, borderRadius: tokens.radius.lg, padding: 24, width: '100%', maxWidth: 500, maxHeight: '90%' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 20, color: tokens.colors.text },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 20 },
  label: { fontSize: 14, fontWeight: '500', color: tokens.colors.textSecondary, marginBottom: 8 },
});
