import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Modal, ScrollView, Alert, TouchableOpacity, ActivityIndicator, TextInput, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Card from '../../components/ui/Card';
import Table from '../../components/ui/Table';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Input from '../../components/ui/Input';
import { staff } from '../../services/api';
import { getTokens } from '../../theme/tokens';
import { useSync } from '../../context/SyncContext';

const tokens = getTokens();
const normalizeSchools = (items) => {
  if (!Array.isArray(items)) return [];
  return items
    .filter((school) => school && school.school_name && school.active !== false)
    .map((school) => String(school.school_name).trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
};
const sanitizeText = (value) => {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/[<>]/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim();
};

const SchoolDropdown = ({ value, onSelect, onOpen, loading, schools, error, loadError }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = schools.filter((s) => s.toLowerCase().includes(search.toLowerCase()));

  const toggleOpen = () => {
    const next = !isOpen;
    setIsOpen(next);
    if (next) onOpen();
  };

  return (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>Sign-up School</Text>
      <TouchableOpacity
        style={[
          styles.dropdownBtn,
          isOpen && styles.inputFocused,
          (error || loadError) && styles.inputError
        ]}
        onPress={toggleOpen}
        accessibilityRole="combobox"
        accessibilityExpanded={isOpen}
        accessibilityLabel="Select Sign-up School"
        testID="school-dropdown"
      >
        <Text style={[styles.inputText, !value && { color: tokens.colors.textMuted }]}>
          {value || 'Select your institution'}
        </Text>
        <Ionicons
          name={isOpen ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={tokens.colors.textSecondary}
        />
      </TouchableOpacity>
      {(error || loadError) && (
        <Text style={styles.errorText}>{loadError || error}</Text>
      )}
      {isOpen && (
        <View style={styles.dropdownList}>
          <TextInput
            style={styles.searchBox}
            placeholder="Search school..."
            value={search}
            onChangeText={setSearch}
            autoFocus
            placeholderTextColor={tokens.colors.textMuted}
          />
          {loading ? (
            <View style={styles.dropdownItem}>
              <ActivityIndicator color={tokens.colors.primary} />
              <Text style={[styles.dropdownItemText, { marginLeft: 8 }]}>Loading schools...</Text>
            </View>
          ) : (
            <>
              {filtered.map((school) => (
                <TouchableOpacity
                  key={school}
                  style={styles.dropdownItem}
                  onPress={() => {
                    onSelect(school);
                    setIsOpen(false);
                    setSearch('');
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Select ${school}`}
                >
                  <Text style={styles.dropdownItemText}>{school}</Text>
                  {value === school && (
                    <Ionicons name="checkmark" size={18} color={tokens.colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
              {filtered.length === 0 && (
                <View style={styles.dropdownItem}>
                  <Text style={styles.dropdownItemText}>No schools found</Text>
                </View>
              )}
            </>
          )}
        </View>
      )}
    </View>
  );
};

export default function UsersScreen({ lastUpdate, currentUser }) {
  const { lastEvent } = useSync();
  const isHeadAdmin = currentUser?.role === 'admin';
  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [sortKey, setSortKey] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const cacheRef = useRef({});
  
  // Filters
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [schoolFilter, setSchoolFilter] = useState('');

  // Modals
  const [modalVisible, setModalVisible] = useState(false);
  const [activityModalVisible, setActivityModalVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userActivities, setUserActivities] = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [verificationActionId, setVerificationActionId] = useState(null);
  const [schools, setSchools] = useState([]);
  const [schoolsLoading, setSchoolsLoading] = useState(false);
  const [schoolsError, setSchoolsError] = useState('');
  const [schoolError, setSchoolError] = useState('');
  
  // Form Data
  const [formData, setFormData] = useState({
    full_name: '',
    phone_number: '',
    email: '',
    role: 'student',
    school: '',
    password: 'password123', // Default for new users
    status: 'active'
  });

  useEffect(() => {
    if (!isHeadAdmin) return;
    fetchUsers({ force: true });
  }, [isHeadAdmin]);

  useEffect(() => {
    if (!lastEvent) return;
    if (lastEvent.type === 'user_deleted') {
      fetchUsers({ force: true });
      return;
    }
    if (lastEvent.type === 'schools_updated') {
      loadSchools({ force: true });
      return;
    }
    if (lastEvent.type === 'user_registered' || lastEvent.type === 'user_updated') {
      fetchUsers({ force: true });
    }
  }, [lastEvent]);

  useEffect(() => {
    setPage(1);
  }, [search, roleFilter, statusFilter, schoolFilter, sortKey, sortOrder]);

  useEffect(() => {
    if (!isHeadAdmin) return;
    const delay = search ? 300 : 0;
    const timer = setTimeout(() => {
      fetchUsers({ pageOverride: page });
    }, delay);
    return () => clearTimeout(timer);
  }, [search, roleFilter, statusFilter, schoolFilter, sortKey, sortOrder, page, isHeadAdmin]);

  const fetchUsers = async ({ pageOverride, force = false } = {}) => {
    if (!isHeadAdmin) return;
    setLoading(true);
    const params = {
      page: pageOverride ?? page,
      limit: pageSize,
      sort_by: sortKey,
      sort_order: sortOrder
    };
    if (search.trim()) params.search = search.trim();
    if (roleFilter !== 'all') params.role = roleFilter;
    if (statusFilter !== 'all') params.status = statusFilter;
    if (schoolFilter) params.school = schoolFilter;
    const cacheKey = JSON.stringify(params);
    const cached = cacheRef.current[cacheKey];
    if (!force && cached && Date.now() - cached.fetchedAt < 30000) {
      setUsers(cached.items);
      setFilteredUsers(cached.items);
      setTotalPages(cached.meta.pages || 1);
      setTotalCount(cached.meta.total || cached.items.length);
      setLoading(false);
      return;
    }
    try {
      const res = await staff.listUsers(params);
      const payload = res.data;
      const items = Array.isArray(payload) ? payload : payload.items || [];
      const meta = Array.isArray(payload) ? { total: items.length, pages: 1 } : payload.meta || {};
      setUsers(items);
      setFilteredUsers(items);
      setTotalPages(meta.pages || Math.max(1, Math.ceil((meta.total || items.length) / pageSize)));
      setTotalCount(meta.total || items.length);
      cacheRef.current[cacheKey] = { items, meta, fetchedAt: Date.now() };
    } catch (e) {
      Alert.alert('Error', 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = () => {
    setSelectedUser(null);
    setSchoolError('');
    setFormData({
      full_name: '',
      phone_number: '',
      email: '',
      role: 'student',
      school: '',
      password: 'password123',
      status: 'active'
    });
    loadSchools({ force: true });
    setModalVisible(true);
  };

  const handleEditUser = (user) => {
    setSelectedUser(user);
    setSchoolError('');
    setFormData({
      full_name: user.full_name || '',
      phone_number: user.phone_number || '',
      email: user.email || '',
      role: user.role || 'student',
      school: user.school || '',
      status: user.status || 'active'
    });
    loadSchools({ force: true });
    setModalVisible(true);
  };

  const loadSchools = async ({ force = false } = {}) => {
    if (schoolsLoading) return;
    if (!force && schools.length > 0) return;
    setSchoolsLoading(true);
    setSchoolsError('');
    try {
      const res = await staff.listSchools();
      const nextSchools = normalizeSchools(res.data);
      setSchools(nextSchools);
      if (nextSchools.length === 0) {
        setSchoolsError('No active schools configured.');
      }
    } catch (e) {
      console.error(e);
      setSchoolsError('Failed to load schools. Please try again.');
      setSchools([]);
    } finally {
      setSchoolsLoading(false);
    }
  };

  useEffect(() => {
    if (!formData.school) {
      if (schoolError) setSchoolError('');
      return;
    }
    if (schoolsError) return;
    if (schools.length > 0 && !schools.includes(formData.school)) {
      setSchoolError('Selected school is no longer active');
      return;
    }
    if (schoolError) setSchoolError('');
  }, [formData.school, schools, schoolsError]);

  const handleSaveUser = async () => {
    if (!formData.full_name || !formData.phone_number || !formData.role) {
      Alert.alert('Error', 'Name, Phone and Role are required');
      return;
    }
    if (schoolsError) {
      Alert.alert('Error', schoolsError);
      return;
    }
    if (formData.role === 'student' && !formData.school) {
      setSchoolError('Sign-up School is required');
      Alert.alert('Error', 'Sign-up School is required.');
      return;
    }
    if (formData.school && schools.length > 0 && !schools.includes(formData.school)) {
      setSchoolError('Please select a valid school');
      Alert.alert('Error', 'Selected school is not recognized.');
      return;
    }
    setSchoolError('');

    try {
      if (selectedUser) {
        await staff.updateUser(selectedUser.user_id, formData);
        Alert.alert('Success', 'User updated successfully');
      } else {
        await staff.createUser(formData);
        Alert.alert('Success', 'User created successfully');
      }
      setModalVisible(false);
      fetchUsers({ force: true });
    } catch (e) {
      console.error(e);
      Alert.alert('Error', e.response?.data?.error || 'Failed to save user');
    }
  };

  const toggleStatus = async (user) => {
    const newStatus = (user.status === 'suspended') ? 'active' : 'suspended';
    try {
      await staff.updateUser(user.user_id, { status: newStatus });
      fetchUsers({ force: true });
      Alert.alert('Success', `User ${newStatus === 'active' ? 'activated' : 'suspended'}`);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to update status');
    }
  };

  const viewActivity = async (user) => {
    setSelectedUser(user);
    setActivityModalVisible(true);
    setActivityLoading(true);
    try {
      const res = await staff.auditLogs({ limit: 50, user_id: user.user_id });
      setUserActivities(res.data);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to fetch user activity');
    } finally {
      setActivityLoading(false);
    }
  };

  const openDetails = async (user) => {
    setSelectedUser(user);
    setDetailModalVisible(true);
    try {
      await staff.logUserDetailView(user.user_id);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
      return;
    }
    setSortKey(key);
    setSortOrder('asc');
  };

  const confirmDeleteUser = async (user) => {
    setDeletingId(user.user_id);
    try {
      await staff.deleteUser(user.user_id);
      fetchUsers({ force: true });
      Alert.alert('Deleted', 'User account removed.');
    } catch (e) {
      console.error(e);
      const message = e.response?.data?.error || 'Failed to delete user';
      Alert.alert('Delete Failed', message);
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteUser = (user) => {
    Alert.alert(
      'Delete User',
      `This will permanently remove ${user.full_name} from the system. This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => confirmDeleteUser(user) }
      ]
    );
  };

  const handleVerifyEmail = async (user) => {
    setVerificationActionId(user.user_id);
    try {
      await staff.verifyUserEmail(user.user_id);
      fetchUsers({ force: true });
      Alert.alert('Success', 'Email marked as verified');
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Failed to verify email');
    } finally {
      setVerificationActionId(null);
    }
  };

  const handleRevokeEmail = async (user) => {
    setVerificationActionId(user.user_id);
    try {
      await staff.revokeUserEmail(user.user_id);
      fetchUsers({ force: true });
      Alert.alert('Success', 'Email verification revoked');
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Failed to revoke email');
    } finally {
      setVerificationActionId(null);
    }
  };

  const handleResendEmail = async (user) => {
    setVerificationActionId(user.user_id);
    try {
      await staff.resendUserEmail(user.user_id);
      Alert.alert('Success', 'Verification email resent');
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Failed to resend verification');
    } finally {
      setVerificationActionId(null);
    }
  };

  const handleVerifyPhone = async (user) => {
    setVerificationActionId(user.user_id);
    try {
      await staff.verifyUserPhone(user.user_id);
      fetchUsers({ force: true });
      Alert.alert('Success', 'Phone marked as verified');
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Failed to verify phone');
    } finally {
      setVerificationActionId(null);
    }
  };

  const handleRevokePhone = async (user) => {
    setVerificationActionId(user.user_id);
    try {
      await staff.revokeUserPhone(user.user_id);
      fetchUsers({ force: true });
      Alert.alert('Success', 'Phone verification revoked');
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Failed to revoke phone');
    } finally {
      setVerificationActionId(null);
    }
  };

  const handleOpenLink = async (url) => {
    if (!url) return;
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const columns = [
    {
      title: 'Name',
      key: 'full_name',
      flex: 1.2,
      sortKey: 'full_name',
      render: (item) => (
        <Text style={styles.nameText}>{sanitizeText(item.full_name) || 'Unknown'}</Text>
      )
    },
    {
      title: 'Email',
      key: 'email',
      width: 180,
      sortKey: 'email',
      render: (item) => {
        const email = sanitizeText(item.email);
        if (!email) return <Text style={styles.mutedText}>Not provided</Text>;
        return (
          <TouchableOpacity onPress={() => handleOpenLink(`mailto:${email}`)}>
            <Text style={styles.linkText}>{email}</Text>
          </TouchableOpacity>
        );
      }
    },
    {
      title: 'Phone',
      key: 'phone_number',
      width: 130,
      sortKey: 'phone_number',
      render: (item) => {
        const phone = sanitizeText(item.phone_number);
        if (!phone) return <Text style={styles.mutedText}>Not provided</Text>;
        return (
          <TouchableOpacity onPress={() => handleOpenLink(`tel:${phone}`)}>
            <Text style={styles.linkText}>{phone}</Text>
          </TouchableOpacity>
        );
      }
    },
    {
      title: 'Role',
      key: 'role',
      width: 110,
      sortKey: 'role',
      render: (item) => {
        let variant = 'neutral';
        if (item.role === 'admin') variant = 'danger';
        if (item.role === 'student') variant = 'info';
        if (item.role === 'rider') variant = 'warning';
        if (item.role === 'washer') variant = 'success';
        if (item.role === 'receptionist') variant = 'primary';
        return <Badge variant={variant}>{sanitizeText(item.role) || 'unknown'}</Badge>;
      }
    },
    {
      title: 'Status',
      key: 'status',
      width: 110,
      sortKey: 'status',
      render: (item) => (
        <Badge variant={item.status === 'suspended' ? 'danger' : 'success'}>
          {sanitizeText(item.status) || 'active'}
        </Badge>
      )
    },
    {
      title: 'School',
      key: 'school',
      width: 150,
      sortKey: 'school',
      render: (item) => (
        <Text style={styles.cellText}>{sanitizeText(item.school) || 'Not provided'}</Text>
      )
    },
    {
      title: 'Student ID',
      key: 'student_id',
      width: 120,
      sortKey: 'student_id',
      render: (item) => (
        <Text style={styles.cellText}>{sanitizeText(item.student_id) || 'Not provided'}</Text>
      )
    },
    {
      title: 'Hostel Address',
      key: 'hostel_address',
      width: 170,
      sortKey: 'hostel_address',
      render: (item) => (
        <Text style={styles.cellText}>{sanitizeText(item.hostel_address) || 'Not provided'}</Text>
      )
    },
    {
      title: 'Verification',
      key: 'verification',
      width: 240,
      render: (item) => (
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Badge variant={item.email_verified ? 'success' : 'warning'}>
              {item.email_verified ? 'Email Verified' : 'Email Unverified'}
            </Badge>
          </View>
          {item.email_verified_at ? (
            <Text style={{ fontSize: 11, color: tokens.colors.textSecondary }}>
              {new Date(item.email_verified_at).toLocaleDateString()}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <Button
              title={item.email_verified ? 'Revoke Email' : 'Verify Email'}
              size="sm"
              variant={item.email_verified ? 'danger' : 'success'}
              loading={verificationActionId === item.user_id}
              onPress={() => (item.email_verified ? handleRevokeEmail(item) : handleVerifyEmail(item))}
            />
            {!item.email_verified && item.email ? (
              <Button
                title="Resend"
                size="sm"
                variant="outline"
                loading={verificationActionId === item.user_id}
                onPress={() => handleResendEmail(item)}
              />
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <Badge variant={item.phone_verified ? 'success' : 'warning'}>
              {item.phone_verified ? 'Phone Verified' : 'Phone Unverified'}
            </Badge>
          </View>
          {item.phone_verified_at ? (
            <Text style={{ fontSize: 11, color: tokens.colors.textSecondary }}>
              {new Date(item.phone_verified_at).toLocaleDateString()}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <Button
              title={item.phone_verified ? 'Revoke Phone' : 'Verify Phone'}
              size="sm"
              variant={item.phone_verified ? 'danger' : 'success'}
              loading={verificationActionId === item.user_id}
              onPress={() => (item.phone_verified ? handleRevokePhone(item) : handleVerifyPhone(item))}
            />
          </View>
        </View>
      )
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 320,
      render: (item) => (
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Button title="Edit" size="sm" variant="ghost" onPress={() => handleEditUser(item)} />
          <Button
            title={item.status === 'suspended' ? 'Activate' : 'Suspend'}
            size="sm"
            variant={item.status === 'suspended' ? 'success' : 'danger'}
            onPress={() => toggleStatus(item)}
          />
          <Button title="Logs" size="sm" variant="outline" onPress={() => viewActivity(item)} />
          <Button
            title="Delete"
            size="sm"
            variant="danger"
            loading={deletingId === item.user_id}
            onPress={() => handleDeleteUser(item)}
          />
        </View>
      )
    }
  ];

  const detailEmail = sanitizeText(selectedUser?.email);
  const detailPhone = sanitizeText(selectedUser?.phone_number);
  const detailSchool = sanitizeText(selectedUser?.school);
  const detailStudentId = sanitizeText(selectedUser?.student_id);
  const detailHostel = sanitizeText(selectedUser?.hostel_address);
  const detailRole = sanitizeText(selectedUser?.role);
  const detailStatus = sanitizeText(selectedUser?.status);

  if (!isHeadAdmin) {
    return (
      <View style={styles.container}>
        <Card title="User Management">
          <Text style={styles.mutedText}>Only head admins can access user management.</Text>
        </Card>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Card
        title="User Management"
        action={<Button title="Add User" icon="add" onPress={handleAddUser} />}
      >
        <View style={styles.filterRow}>
          <Input
            placeholder="Search users..."
            value={search}
            onChangeText={setSearch}
            style={{ flex: 1, marginBottom: 0 }}
          />
          <Input
            placeholder="Filter School"
            value={schoolFilter}
            onChangeText={setSchoolFilter}
            style={{ width: 180, marginBottom: 0 }}
          />
        </View>

        <View style={styles.filterRow}>
          <View style={styles.chipGroup}>
            <Text style={styles.filterLabel}>Role</Text>
            <View style={styles.chips}>
              {['all', 'student', 'rider', 'washer', 'receptionist', 'admin'].map((r) => (
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

          <View style={styles.chipGroup}>
            <Text style={styles.filterLabel}>Status</Text>
            <View style={styles.chips}>
              {['all', 'active', 'suspended'].map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.chip, statusFilter === s && styles.activeChip]}
                  onPress={() => setStatusFilter(s)}
                >
                  <Text style={[styles.chipText, statusFilter === s && styles.activeChipText]}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={tokens.colors.primary} />
            <Text style={styles.mutedText}>Loading users...</Text>
          </View>
        ) : null}

        <Table
          columns={columns}
          data={filteredUsers}
          onRowPress={openDetails}
          onSort={handleSort}
          sortKey={sortKey}
          sortOrder={sortOrder}
          emptyText="No users found"
        />

        <View style={styles.paginationRow}>
          <Button
            title="Prev"
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onPress={() => setPage((prev) => Math.max(1, prev - 1))}
          />
          <Text style={styles.paginationText}>
            Page {page} of {totalPages}
          </Text>
          <Button
            title="Next"
            size="sm"
            variant="outline"
            disabled={page >= totalPages}
            onPress={() => setPage((prev) => Math.min(totalPages, prev + 1))}
          />
          <Text style={styles.paginationMeta}>{totalCount} users</Text>
        </View>
      </Card>

      <Modal visible={detailModalVisible} transparent animationType="fade" onRequestClose={() => setDetailModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, styles.detailModalContent]}>
            <Text style={styles.modalTitle}>User Details</Text>
            <ScrollView style={styles.detailScroll} contentContainerStyle={styles.detailContent}>
              <Text style={styles.detailName}>{sanitizeText(selectedUser?.full_name) || 'Unknown'}</Text>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Email</Text>
                {detailEmail ? (
                  <TouchableOpacity onPress={() => handleOpenLink(`mailto:${detailEmail}`)}>
                    <Text style={styles.linkText}>{detailEmail}</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.mutedText}>Not provided</Text>
                )}
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Phone</Text>
                {detailPhone ? (
                  <TouchableOpacity onPress={() => handleOpenLink(`tel:${detailPhone}`)}>
                    <Text style={styles.linkText}>{detailPhone}</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.mutedText}>Not provided</Text>
                )}
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Role</Text>
                <Text style={styles.cellText}>{detailRole || 'Not provided'}</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Status</Text>
                <Text style={styles.cellText}>{detailStatus || 'active'}</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>School</Text>
                <Text style={styles.cellText}>{detailSchool || 'Not provided'}</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Student ID</Text>
                <Text style={styles.cellText}>{detailStudentId || 'Not provided'}</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Hostel Address</Text>
                <Text style={styles.cellText}>{detailHostel || 'Not provided'}</Text>
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <Button title="Back to List" variant="ghost" onPress={() => setDetailModalVisible(false)} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Add/Edit Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{selectedUser ? 'Edit User' : 'Add User'}</Text>
            
            <Input 
              label="Full Name" 
              value={formData.full_name} 
              onChangeText={t => setFormData({...formData, full_name: t})} 
              testID="input-full-name"
            />
            <Input 
              label="Phone Number" 
              value={formData.phone_number} 
              onChangeText={t => setFormData({...formData, phone_number: t})} 
              keyboardType="phone-pad"
              testID="input-phone-number"
            />
            <Input 
              label="Email" 
              value={formData.email} 
              onChangeText={t => setFormData({...formData, email: t})} 
              keyboardType="email-address"
              testID="input-email"
            />
            
            <View style={{marginBottom: 16}}>
              <Text style={styles.label}>Role</Text>
              <View style={styles.chips}>
                {['student', 'rider', 'washer', 'receptionist', 'admin'].map(r => (
                  <TouchableOpacity 
                    key={r} 
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

            {selectedUser && (
              <View style={{marginBottom: 16}}>
                <Text style={styles.label}>Status</Text>
                <View style={styles.chips}>
                  {['active', 'suspended'].map(s => (
                    <TouchableOpacity 
                      key={s} 
                      style={[styles.chip, formData.status === s && styles.activeChip]}
                      onPress={() => setFormData({...formData, status: s})}
                    >
                      <Text style={[styles.chipText, formData.status === s && styles.activeChipText]}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            <SchoolDropdown
              value={formData.school}
              onSelect={(school) => {
                setFormData({ ...formData, school });
                setSchoolError('');
              }}
              onOpen={loadSchools}
              loading={schoolsLoading}
              schools={
                formData.school && !schools.includes(formData.school)
                  ? [formData.school, ...schools]
                  : schools
              }
              error={schoolError}
              loadError={schoolsError}
            />

            {!selectedUser && (
              <Input 
                label="Initial Password" 
                value={formData.password} 
                onChangeText={t => setFormData({...formData, password: t})} 
                secureTextEntry
              />
            )}

            <View style={styles.modalActions}>
              <Button title="Cancel" variant="ghost" onPress={() => setModalVisible(false)} />
              <Button title="Save User" onPress={handleSaveUser} testID="save-user" />
            </View>
          </View>
        </View>
      </Modal>

      {/* Activity Modal */}
      <Modal visible={activityModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Activity Log: {selectedUser?.full_name}</Text>
            
            {activityLoading ? (
              <ActivityIndicator size="large" color={tokens.colors.primary} />
            ) : (
              <ScrollView style={{maxHeight: 400}}>
                {userActivities.length === 0 ? (
                  <Text style={{color: tokens.colors.textMuted, textAlign: 'center', padding: 20}}>
                    No activity recorded
                  </Text>
                ) : (
                  userActivities.map((log, i) => (
                    <View key={i} style={styles.logItem}>
                      <Text style={styles.logAction}>{log.action.toUpperCase()}</Text>
                      <Text style={styles.logDetails}>
                        {log.entity_type} {log.entity_id}
                      </Text>
                      <Text style={styles.logDate}>
                        {new Date(log.created_at).toLocaleString()}
                      </Text>
                    </View>
                  ))
                )}
              </ScrollView>
            )}
            
            <View style={styles.modalActions}>
              <Button title="Close" variant="ghost" onPress={() => setActivityModalVisible(false)} />
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
  },
  filterRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
    flexWrap: 'wrap',
    alignItems: 'center'
  },
  chipGroup: {
    gap: 8,
  },
  filterLabel: {
    fontSize: 12,
    color: tokens.colors.textSecondary,
  },
  chips: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: tokens.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  activeChip: {
    backgroundColor: tokens.colors.primary,
    borderColor: tokens.colors.primary,
  },
  chipText: {
    fontSize: 12,
    color: tokens.colors.textSecondary,
  },
  activeChipText: {
    color: tokens.colors.textInverted,
    fontWeight: 'bold',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  paginationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
    flexWrap: 'wrap',
  },
  paginationText: {
    fontSize: 14,
    color: tokens.colors.text,
  },
  paginationMeta: {
    fontSize: 12,
    color: tokens.colors.textMuted,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: tokens.colors.surface,
    borderRadius: tokens.radius.lg,
    padding: 24,
    width: '100%',
    maxWidth: 500,
    maxHeight: '90%',
  },
  detailModalContent: {
    maxWidth: 560,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    color: tokens.colors.text,
  },
  detailScroll: {
    maxHeight: 420,
  },
  detailContent: {
    gap: 12,
    paddingBottom: 8,
  },
  detailName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: tokens.colors.text,
    marginBottom: 4,
  },
  detailRow: {
    gap: 4,
  },
  detailLabel: {
    fontSize: 12,
    color: tokens.colors.textSecondary,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: tokens.colors.textSecondary,
    marginBottom: 8,
  },
  inputGroup: {
    marginBottom: 16,
  },
  dropdownBtn: {
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  inputFocused: {
    borderColor: tokens.colors.primary,
  },
  inputError: {
    borderColor: tokens.colors.danger,
  },
  inputText: {
    fontSize: tokens.typography.sizes.base,
    color: tokens.colors.text,
  },
  nameText: {
    fontWeight: 'bold',
    color: tokens.colors.text,
  },
  linkText: {
    color: tokens.colors.primary,
    fontSize: 12,
  },
  mutedText: {
    color: tokens.colors.textMuted,
    fontSize: 12,
  },
  cellText: {
    color: tokens.colors.text,
    fontSize: 12,
  },
  dropdownList: {
    marginTop: tokens.spacing.sm,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.colors.surface,
    maxHeight: 220,
    overflow: 'hidden',
    zIndex: 10,
  },
  searchBox: {
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.border,
    padding: tokens.spacing.sm,
    fontSize: tokens.typography.sizes.sm,
    color: tokens.colors.text,
  },
  dropdownItem: {
    paddingVertical: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownItemText: {
    fontSize: tokens.typography.sizes.sm,
    color: tokens.colors.text,
  },
  errorText: {
    fontSize: tokens.typography.sizes.xs,
    color: tokens.colors.danger,
    marginTop: tokens.spacing.xs,
  },
  logItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.border,
  },
  logAction: {
    fontWeight: 'bold',
    color: tokens.colors.primary,
  },
  logDetails: {
    fontSize: 12,
    color: tokens.colors.text,
    marginVertical: 4,
  },
  logDate: {
    fontSize: 10,
    color: tokens.colors.textMuted,
  }
});
