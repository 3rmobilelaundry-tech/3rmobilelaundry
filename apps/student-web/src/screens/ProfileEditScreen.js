import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TextInput, 
  TouchableOpacity, 
  ActivityIndicator, 
  Alert, 
  Image, 
  Platform,
  ScrollView,
  KeyboardAvoidingView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { theme } from '../constants/theme';
import { student, normalizeApiError } from '../services/api';
import { useSync } from '../context/SyncContext';

const fallbackRegistrationFields = [
  { field_id: 'default-full-name', label: 'Full Name', type: 'full_name', required: true, active: true, order: 1 },
  { field_id: 'default-email', label: 'Email Address', type: 'email', required: true, active: true, order: 2 },
  { field_id: 'default-phone', label: 'Phone Number', type: 'phone_number', required: true, active: true, order: 3 },
  { field_id: 'default-school', label: 'School', type: 'school', required: true, active: true, order: 4 },
  { field_id: 'default-student-id', label: 'Student ID', type: 'student_id', required: true, active: true, order: 5 },
  { field_id: 'default-hostel', label: 'Hostel Address', type: 'hostel_address', required: true, active: true, order: 6 }
];

const mergeRegistrationFields = (fields = []) => {
  const active = fields.filter((field) => field && field.active !== false);
  const map = new Map(active.map((field) => [field.type, field]));
  const merged = [...active];
  fallbackRegistrationFields.forEach((fallback) => {
    if (!map.has(fallback.type)) {
      merged.push(fallback);
    }
  });
  const sorted = merged.slice().sort((a, b) => {
    const orderA = Number.isFinite(Number(a.order)) ? Number(a.order) : 0;
    const orderB = Number.isFinite(Number(b.order)) ? Number(b.order) : 0;
    if (orderA !== orderB) return orderA - orderB;
    return Number(a.field_id || 0) - Number(b.field_id || 0);
  });
  return sorted.length ? sorted : fallbackRegistrationFields;
};

const SchoolDropdown = ({ label, value, onSelect, schools, loading, loadError }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const filtered = schools.filter(s => s.toLowerCase().includes(search.toLowerCase()));

  return (
    <View style={styles.formGroup}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity 
        style={[
          styles.dropdownBtn,
          isOpen && styles.inputFocused,
        ]}
        onPress={() => setIsOpen(!isOpen)}
        accessibilityRole="combobox"
        accessibilityExpanded={isOpen}
        accessibilityLabel={`Select ${label}`}
      >
        <Text style={[styles.inputText, !value && { color: theme.colors.textPlaceholder }]}>
          {value || 'Select your institution'}
        </Text>
        <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={20} color={theme.colors.textSecondary} />
      </TouchableOpacity>
      {loadError ? (
        <View style={styles.errorRow}>
          <Ionicons name="alert-circle" size={16} color={theme.colors.error} />
          <Text style={styles.errorText}>{loadError}</Text>
        </View>
      ) : null}
      {isOpen && (
        <View style={styles.dropdownList}>
          <TextInput
            style={styles.searchBox}
            placeholder="Search school..."
            value={search}
            onChangeText={setSearch}
            autoFocus
            placeholderTextColor={theme.colors.textPlaceholder}
          />
          {loading ? (
            <View style={styles.dropdownItem}>
              <ActivityIndicator color={theme.colors.primary} />
              <Text style={[styles.dropdownItemText, { marginLeft: 8 }]}>Loading schools...</Text>
            </View>
          ) : loadError ? (
            <View style={styles.dropdownItem}>
              <Text style={styles.dropdownItemText}>Schools unavailable</Text>
            </View>
          ) : (
            <>
              {filtered.map(school => (
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
                  {value === school && <Ionicons name="checkmark" size={20} color={theme.colors.primary} />}
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

export default function ProfileEditScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const { user } = route.params || {};
  const { lastEvent } = useSync();

  if (!user) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>Error: User not found</Text>
      </View>
    );
  }

  const [fullName, setFullName] = useState(user.full_name || '');
  const [phone, setPhone] = useState(user.phone_number || '');
  const [studentId, setStudentId] = useState(user.student_id || '');
  const [school, setSchool] = useState(user.school || '');
  const [hostel, setHostel] = useState(user.hostel_address || '');
  const [email, setEmail] = useState(user.email || '');
  const [navLock, setNavLock] = useState(false);
  const [saving, setSaving] = useState(false);
  const [registrationFields, setRegistrationFields] = useState([]);
  const [schools, setSchools] = useState([]);
  const [configLoading, setConfigLoading] = useState(false);
  const [configError, setConfigError] = useState('');
  const [phoneVerified, setPhoneVerified] = useState(!!user.phone_verified);
  const [phoneOtp, setPhoneOtp] = useState('');
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [phoneOtpLoading, setPhoneOtpLoading] = useState(false);
  const [phoneVerifyLoading, setPhoneVerifyLoading] = useState(false);
  const [profileFields, setProfileFields] = useState(() => {
    if (!user?.profile_fields) return {};
    if (typeof user.profile_fields === 'object' && !Array.isArray(user.profile_fields)) {
      return user.profile_fields;
    }
    if (typeof user.profile_fields === 'string') {
      try {
        const parsed = JSON.parse(user.profile_fields);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
      } catch (e) {}
    }
    return {};
  });

  // Avatar state
  const [avatarPreview, setAvatarPreview] = useState(user.avatar_url || '');
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef(null);
  const buildAvatarUri = useCallback((uri, cacheKey) => {
    if (!uri) return '';
    if (!cacheKey) return uri;
    const joiner = uri.includes('?') ? '&' : '?';
    return `${uri}${joiner}v=${cacheKey}`;
  }, []);

  const orderedFields = useMemo(() => {
    return mergeRegistrationFields(registrationFields || []);
  }, [registrationFields]);

  const customFields = useMemo(() => {
    const builtIns = ['full_name', 'email', 'phone_number', 'school', 'student_id', 'hostel_address'];
    return orderedFields.filter((field) => !builtIns.includes(field.type));
  }, [orderedFields]);

  const fetchConfig = async () => {
    setConfigLoading(true);
    try {
      const res = await student.getRegistrationConfig();
      setRegistrationFields(Array.isArray(res.data?.fields) ? res.data.fields : []);
      const nextSchools = Array.isArray(res.data?.schools)
        ? res.data.schools.map((item) => item.school_name).filter(Boolean)
        : [];
      setSchools(nextSchools);
      setConfigError('');
    } catch (error) {
      setRegistrationFields([]);
      setSchools([]);
      setConfigError('Failed to load registration setup.');
    } finally {
      setConfigLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  useEffect(() => {
    if (!lastEvent) return;
    if (lastEvent.type === 'registration_fields_updated' || lastEvent.type === 'schools_updated') {
      fetchConfig();
    }
  }, [lastEvent]);

  const triggerFilePicker = async () => {
    if (Platform.OS === 'web') {
      if (fileInputRef.current) {
        fileInputRef.current.value = ''; // Reset to allow re-selecting same file
        fileInputRef.current.click();
      }
    } else {
      // Mobile implementation
      try {
        const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
        
        if (permissionResult.granted === false) {
          Alert.alert('Permission Required', 'Permission to access camera roll is required!');
          return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        });

        if (!result.canceled) {
          const asset = result.assets[0];
          const localUri = asset.uri;
          
          if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) {
            Alert.alert('File Too Large', 'Maximum size is 5MB.');
            return;
          }
          setAvatarPreview(asset.uri);
          
          // Create a file-like object for FormData
          const filename = localUri.split('/').pop();
          const match = /\.(\w+)$/.exec(filename);
          const type = match ? `image/${match[1]}` : 'image/jpeg';
          
          // Store properly for mobile upload
          setSelectedFile({ uri: localUri, name: filename, type });
          setUploadProgress(0);
        }
      } catch (e) {
        console.error('Picker error:', e);
        Alert.alert('Error', 'Failed to open image picker.');
      }
    }
  };

  const onFileSelected = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const validTypes = ['image/jpeg', 'image/png', 'image/gif'];
    if (!validTypes.includes(file.type)) {
      Alert.alert('Invalid File', 'Please select a JPG, PNG, or GIF image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      Alert.alert('File Too Large', 'Maximum size is 5MB.');
      return;
    }
    const localUrl = URL.createObjectURL(file);
    setAvatarPreview(localUrl);
    setSelectedFile(file);
    setUploadProgress(0);
  };

  const handleSave = async () => {
    if (navLock || saving) return;
    
    // Basic validation
    const phoneClean = String(phone).replace(/[^0-9]/g, '');
    if (phoneClean.length < 10) {
      Alert.alert('Invalid Phone', 'Please enter a valid phone number.');
      return;
    }
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }

    try {
      setSaving(true);
      setUploadProgress(0);
      
      const formData = new FormData();
      formData.append('user_id', String(user.user_id));
      if (fullName) formData.append('full_name', fullName);
      if (phoneClean) formData.append('phone_number', phoneClean);
      if (studentId) formData.append('student_id', studentId);
      if (school) formData.append('school', school);
      if (hostel) formData.append('hostel_address', hostel);
      if (email) formData.append('email', email);

      const profilePayload = {};
      customFields.forEach((field) => {
        const key = field.field_id ? `field_${field.field_id}` : field.type;
        if (profileFields[key] !== undefined && profileFields[key] !== '') {
          profilePayload[key] = profileFields[key];
        }
      });
      if (Object.keys(profilePayload).length) {
        formData.append('profile_fields', JSON.stringify(profilePayload));
      }
      
      if (selectedFile) {
        if (Platform.OS === 'web') {
          formData.append('avatar', selectedFile);
        } else {
          // Mobile specific FormData handling
          const filename = selectedFile.uri.split('/').pop();
          const match = /\.(\w+)$/.exec(filename);
          const type = match ? `image/${match[1]}` : 'image/jpeg';
          
          formData.append('avatar', {
            uri: selectedFile.uri,
            name: filename,
            type
          });
        }
      }

      const res = await student.updateProfile(formData, (progressEvent) => {
        if (progressEvent.total) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(percent);
        }
      });
      let updated = res.data;

      if (selectedFile) {
        // If the server returns the updated user with avatar_url, use it
        // Otherwise try to fetch fresh profile
        if (!updated?.avatar_url) {
           try {
             const profileRes = await student.getProfile(user.user_id);
             if (profileRes?.data) updated = profileRes.data;
           } catch {}
        }
        
        // Force a cache bust on the new avatar
        if (updated?.avatar_url) {
          const cacheKey = String(Date.now());
          await AsyncStorage.setItem(`avatar_cache_buster_${user.user_id}`, cacheKey);
          setAvatarPreview(buildAvatarUri(updated.avatar_url, cacheKey));
        } else {
           console.warn('Avatar update may have failed: No avatar_url in response');
        }
      }
      
      // Update local storage
      await AsyncStorage.setItem('userData', JSON.stringify(updated));

      Alert.alert('Profile Saved', 'Your changes have been saved.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      console.error(e);
      const normalized = normalizeApiError(e);
      const message = e?.message === 'avatar_update_failed'
        ? 'We could not verify your new photo. Please try again.'
        : (normalized?.message || e?.response?.data?.error || 'Unable to save profile.');
      Alert.alert('Save Failed', message);
    } finally {
      setSaving(false);
      setNavLock(false);
      setUploadProgress(0);
    }
  };

  const handleRequestPhoneVerification = async () => {
    if (phoneVerified) return;
    if (phone && user.phone_number && phone !== user.phone_number) {
      Alert.alert('Save Required', 'Save your new phone number before requesting verification.');
      return;
    }
    setPhoneOtpLoading(true);
    try {
      await student.requestPhoneVerification(user.user_id);
      setPhoneOtpSent(true);
      Alert.alert('Verification Sent', 'A verification code has been sent to your phone.');
    } catch (e) {
      Alert.alert('Request Failed', e?.response?.data?.error || 'Unable to send verification code.');
    } finally {
      setPhoneOtpLoading(false);
    }
  };

  const handleVerifyPhone = async () => {
    if (!phoneOtp) {
      Alert.alert('Verification Code', 'Please enter the verification code.');
      return;
    }
    setPhoneVerifyLoading(true);
    try {
      const res = await student.verifyPhoneVerification(user.user_id, phoneOtp);
      const updated = res.data?.user;
      if (updated) {
        await AsyncStorage.setItem('userData', JSON.stringify(updated));
        setPhoneVerified(!!updated.phone_verified);
      }
      setPhoneOtp('');
      setPhoneOtpSent(false);
      Alert.alert('Phone Verified', 'Your phone number has been verified.');
    } catch (e) {
      Alert.alert('Verification Failed', e?.response?.data?.error || 'Unable to verify phone number.');
    } finally {
      setPhoneVerifyLoading(false);
    }
  };

  const renderField = (field) => {
    const label = field.label || field.type;
    const key = field.field_id ? `field_${field.field_id}` : field.type;

    if (field.type === 'full_name') {
      return (
        <View key={key} style={styles.formGroup}>
          <Text style={styles.label}>{label}</Text>
          <TextInput 
            style={styles.input} 
            value={fullName} 
            onChangeText={setFullName} 
            placeholder="Enter full name" 
            placeholderTextColor={theme.colors.textPlaceholder}
          />
        </View>
      );
    }

    if (field.type === 'email') {
      return (
        <View key={key} style={styles.formGroup}>
          <Text style={styles.label}>{label}</Text>
          <TextInput 
            style={styles.input} 
            value={email} 
            onChangeText={setEmail} 
            placeholder="e.g., student@example.com" 
            keyboardType="email-address"
            autoCapitalize="none"
            placeholderTextColor={theme.colors.textPlaceholder}
          />
        </View>
      );
    }

    if (field.type === 'phone_number') {
      return (
        <View key={key} style={styles.formGroup}>
          <Text style={styles.label}>{label}</Text>
          <TextInput 
            style={styles.input} 
            value={phone} 
            onChangeText={setPhone} 
            placeholder="08012345678" 
            keyboardType="phone-pad" 
            placeholderTextColor={theme.colors.textPlaceholder}
          />
          <View style={styles.phoneMetaRow}>
            <View style={[styles.phoneStatus, phoneVerified ? styles.phoneStatusVerified : styles.phoneStatusPending]}>
              <Text style={styles.phoneStatusText}>{phoneVerified ? 'Verified' : 'Not Verified'}</Text>
            </View>
          </View>
          {!phoneVerified && (
            <View style={styles.phoneVerifyCard}>
              <TouchableOpacity style={styles.phoneActionBtn} onPress={handleRequestPhoneVerification} disabled={phoneOtpLoading} accessibilityRole="button">
                {phoneOtpLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.phoneActionText}>{phoneOtpSent ? 'Resend Code' : 'Send Code'}</Text>
                )}
              </TouchableOpacity>
              {phoneOtpSent && (
                <>
                  <TextInput
                    style={[styles.input, styles.phoneOtpInput]}
                    value={phoneOtp}
                    onChangeText={setPhoneOtp}
                    placeholder="Enter code"
                    keyboardType="number-pad"
                    placeholderTextColor={theme.colors.textPlaceholder}
                  />
                  <TouchableOpacity style={styles.phoneVerifyBtn} onPress={handleVerifyPhone} disabled={phoneVerifyLoading} accessibilityRole="button">
                    {phoneVerifyLoading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.phoneVerifyText}>Verify Phone</Text>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}
        </View>
      );
    }

    if (field.type === 'student_id') {
      return (
        <View key={key} style={styles.formGroup}>
          <Text style={styles.label}>{label}</Text>
          <TextInput 
            style={styles.input} 
            value={studentId} 
            onChangeText={setStudentId} 
            placeholder="e.g., 190401001"
            placeholderTextColor={theme.colors.textPlaceholder}
          />
        </View>
      );
    }

    if (field.type === 'school') {
      return (
        <SchoolDropdown
          key={key}
          label={label}
          value={school}
          onSelect={setSchool}
          schools={schools}
          loading={configLoading}
          loadError={configError}
        />
      );
    }

    if (field.type === 'hostel_address') {
      return (
        <View key={key} style={styles.formGroup}>
          <Text style={styles.label}>{label}</Text>
          <TextInput 
            style={[styles.input, { height: 90, textAlignVertical: 'top' }]} 
            value={hostel} 
            onChangeText={setHostel} 
            placeholder="e.g., Moremi Hall, Room 204, UNILAG" 
            multiline 
            numberOfLines={3}
            placeholderTextColor={theme.colors.textPlaceholder}
          />
        </View>
      );
    }

    return (
      <View key={key} style={styles.formGroup}>
        <Text style={styles.label}>{label}</Text>
        <TextInput 
          style={styles.input} 
          value={profileFields[key] || ''} 
          onChangeText={(value) => setProfileFields((prev) => ({ ...prev, [key]: value }))}
          placeholder={label}
          placeholderTextColor={theme.colors.textPlaceholder}
        />
      </View>
    );
  };

  return (
    <KeyboardAvoidingView 
      style={{ flex: 1 }} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView 
        style={styles.container} 
        contentContainerStyle={styles.scrollContent}
        alwaysBounceVertical={true}
        showsVerticalScrollIndicator={true}
      >
        <Text style={[styles.header, { marginTop: Math.max(insets.top, 20) + 10 }]} accessibilityRole="header">Complete Your Profile</Text>
        <Text style={styles.sub}>Update your details and profile photo</Text>

        {/* Avatar Upload UI */}
        <View style={styles.avatarContainer}>
          <TouchableOpacity style={styles.avatarWrapper} onPress={triggerFilePicker}>
            {avatarPreview ? (
              <Image source={{ uri: avatarPreview }} style={styles.avatarImage} resizeMode="cover" />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Ionicons name="person" size={40} color="#fff" />
              </View>
            )}
            {saving && selectedFile ? (
              <View style={styles.avatarOverlay}>
                <ActivityIndicator color="#fff" />
              </View>
            ) : null}
            <View style={styles.cameraBadge}>
              <Ionicons name="camera" size={14} color="#fff" />
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={triggerFilePicker}>
              <Text style={styles.changePhotoText}>Change Photo</Text>
          </TouchableOpacity>
        </View>
        
        {Platform.OS === 'web' && (
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif"
            style={{ display: 'none' }}
            onChange={onFileSelected}
          />
        )}

        {/* Upload Progress Bar */}
        {uploadProgress > 0 && uploadProgress < 100 && (
          <View style={styles.progressWrap} accessibilityRole="progressbar" accessibilityValue={{ now: uploadProgress, min: 0, max: 100 }}>
            <View style={[styles.progressBar, { width: `${uploadProgress}%` }]} />
            <Text style={styles.progressText}>{uploadProgress}%</Text>
          </View>
        )}
        {configLoading ? (
          <View style={styles.configRow}>
            <ActivityIndicator color={theme.colors.primary} />
            <Text style={styles.configText}>Loading profile fields...</Text>
          </View>
        ) : null}
        {orderedFields.map(renderField)}

        <TouchableOpacity style={styles.btn} onPress={handleSave} disabled={saving}>
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>Save Profile</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background, padding: theme.spacing.md },
  scrollContent: { flexGrow: 1, paddingBottom: 100 },
  header: { ...theme.typography.h2, marginTop: theme.spacing.sm },
  sub: { ...theme.typography.caption, marginBottom: theme.spacing.lg, color: theme.colors.textSecondary },
  
  avatarContainer: { alignItems: 'center', marginBottom: theme.spacing.xl },
  avatarWrapper: { 
    width: 100, 
    height: 100, 
    borderRadius: 50, 
    backgroundColor: theme.colors.textTertiary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
    position: 'relative',
    overflow: 'visible',
    ...theme.shadows.sm
  },
  avatarImage: { width: 100, height: 100, borderRadius: 50 },
  avatarPlaceholder: { width: 100, height: 100, borderRadius: 50, backgroundColor: theme.colors.primaryLight, justifyContent: 'center', alignItems: 'center' },
  avatarOverlay: { position: 'absolute', width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(15,23,42,0.35)', justifyContent: 'center', alignItems: 'center' },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: theme.colors.primary,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.colors.background
  },
  changePhotoText: { color: theme.colors.primary, fontWeight: '600', marginTop: 4 },

  progressWrap: { marginBottom: theme.spacing.md, backgroundColor: theme.colors.primaryLight, borderRadius: theme.borderRadius.md, overflow: 'hidden', alignItems: 'center', height: 16, justifyContent: 'center', position: 'relative' },
  progressBar: { height: '100%', backgroundColor: theme.colors.primary, position: 'absolute', left: 0, top: 0 },
  progressText: { fontSize: 10, color: theme.colors.text, fontWeight: 'bold', zIndex: 1 },

  formGroup: { marginBottom: theme.spacing.md },
  label: { color: theme.colors.textSecondary, marginBottom: 6, fontWeight: '500', fontSize: 14 },
  input: { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.lg, borderWidth: 1, borderColor: theme.colors.border, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: theme.colors.text },
  inputText: { fontSize: 16, color: theme.colors.text },
  inputFocused: { borderColor: theme.colors.primary, borderWidth: 2 },
  errorRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  errorText: { color: theme.colors.error, marginLeft: 4, fontSize: 12 },
  dropdownBtn: { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.lg, borderWidth: 1, borderColor: theme.colors.border, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dropdownList: { marginTop: 8, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.borderRadius.lg, elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4, zIndex: 10 },
  searchBox: { padding: theme.spacing.md, borderBottomWidth: 1, borderBottomColor: theme.colors.border, fontSize: 16, color: theme.colors.text },
  dropdownItem: { padding: theme.spacing.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dropdownItemText: { fontSize: 16, color: theme.colors.text },
  configRow: { flexDirection: 'row', alignItems: 'center', marginBottom: theme.spacing.md },
  configText: { fontSize: 14, color: theme.colors.textSecondary, marginLeft: theme.spacing.sm },
  phoneMetaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  phoneStatus: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, alignSelf: 'flex-start' },
  phoneStatusVerified: { backgroundColor: theme.colors.success },
  phoneStatusPending: { backgroundColor: theme.colors.warning },
  phoneStatusText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  phoneVerifyCard: { marginTop: theme.spacing.sm, backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.lg, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing.md },
  phoneActionBtn: { backgroundColor: theme.colors.primary, borderRadius: theme.borderRadius.md, paddingVertical: 10, alignItems: 'center' },
  phoneActionText: { color: '#fff', fontWeight: '600' },
  phoneOtpInput: { marginTop: theme.spacing.sm },
  phoneVerifyBtn: { marginTop: theme.spacing.sm, backgroundColor: theme.colors.secondary, borderRadius: theme.borderRadius.md, paddingVertical: 10, alignItems: 'center' },
  phoneVerifyText: { color: '#fff', fontWeight: '600' },
  
  btn: { backgroundColor: theme.colors.primary, borderRadius: theme.borderRadius.lg, paddingVertical: 16, alignItems: 'center', marginTop: theme.spacing.lg, marginBottom: theme.spacing.xl, ...theme.shadows.sm },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});
