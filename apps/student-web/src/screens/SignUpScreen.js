import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  Alert, 
  ScrollView, 
  SafeAreaView, 
  ActivityIndicator, 
  Platform, 
  Image, 
  KeyboardAvoidingView,
  Dimensions,
  AccessibilityInfo,
  findNodeHandle
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { auth, student, normalizeApiError } from '../services/api';
import { useSync } from '../context/SyncContext';
import { useAuth } from '../context/AuthContext';

// --- Design Tokens & Theme ---
const theme = {
  colors: {
    primary: '#4F46E5',
    primaryDark: '#3730A3',
    background: '#F5F7FF',
    surface: '#FFFFFF',
    text: {
      primary: '#111827',
      secondary: '#4B5563',
      placeholder: '#9CA3AF',
      error: '#DC2626',
      success: '#059669',
    },
    border: '#E5E7EB',
    focus: '#4F46E5',
  },
  typography: {
    h1: { fontSize: 24, fontWeight: '700', lineHeight: 32 },
    h2: { fontSize: 20, fontWeight: '600', lineHeight: 28 },
    body: { fontSize: 16, lineHeight: 24 },
    caption: { fontSize: 14, lineHeight: 20 },
    small: { fontSize: 12, lineHeight: 16 },
  },
  spacing: {
    xs: 4,
    s: 8,
    m: 16,
    l: 24,
    xl: 32,
  },
  borderRadius: 18,
};

// --- Utils ---
const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const checkPasswordStrength = (pass) => {
  let score = 0;
  if (pass.length >= 8) score++;
  if (/[A-Z]/.test(pass)) score++;
  if (/[0-9]/.test(pass)) score++;
  if (/[^A-Za-z0-9]/.test(pass)) score++;
  return score; // 0-4
};

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

// --- Components ---

const FormInput = ({ 
  label, 
  error, 
  touched, 
  id, 
  onBlur, 
  onChangeText, 
  value, 
  secureTextEntry, 
  ...props 
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef(null);

  return (
    <View style={styles.inputGroup}>
      <Text style={styles.label} nativeID={`${id}-label`}>{label}</Text>
      <TextInput
        ref={inputRef}
        style={[
          styles.input,
          isFocused && styles.inputFocused,
          error && touched && styles.inputError
        ]}
        placeholderTextColor={theme.colors.text.placeholder}
        onFocus={() => setIsFocused(true)}
        onBlur={() => {
          setIsFocused(false);
          onBlur && onBlur();
        }}
        onChangeText={onChangeText}
        value={value}
        secureTextEntry={secureTextEntry}
        accessibilityLabel={label}
        accessibilityHint={error || ''}
        accessibilityRole="none"
        accessibilityState={{ error: !!error }}
        {...props}
      />
      {error && touched && (
        <View style={styles.errorContainer} accessibilityLiveRegion="polite">
          <Ionicons name="alert-circle" size={16} color={theme.colors.text.error} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
    </View>
  );
};

const PasswordStrength = ({ password }) => {
  const score = checkPasswordStrength(password);
  const labels = ['Very Weak', 'Weak', 'Medium', 'Strong', 'Very Strong'];
  const colors = ['#DC2626', '#DC2626', '#F59E0B', '#059669', '#059669'];
  const width = `${(score / 4) * 100}%`;

  if (!password) return null;

  return (
    <View style={styles.passwordStrength} accessibilityLabel={`Password strength: ${labels[score]}`}>
      <View style={styles.strengthBarBg}>
        <View style={[styles.strengthBarFill, { width, backgroundColor: colors[score] }]} />
      </View>
      <Text style={[styles.strengthText, { color: colors[score] }]}>
        {labels[score]}
      </Text>
    </View>
  );
};

const SchoolDropdown = ({ label, value, onSelect, error, touched, schools, loading, loadError }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  
  const filtered = schools.filter(s => s.toLowerCase().includes(search.toLowerCase()));

  return (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity 
        style={[
          styles.dropdownBtn,
          isOpen && styles.inputFocused,
          error && touched && styles.inputError
        ]}
        onPress={() => setIsOpen(!isOpen)}
        accessibilityRole="combobox"
        accessibilityExpanded={isOpen}
        accessibilityLabel="Select School"
      >
        <Text style={[styles.inputText, !value && { color: theme.colors.text.placeholder }]}>
          {value || 'Select your institution'}
        </Text>
        <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={20} color={theme.colors.text.secondary} />
      </TouchableOpacity>
      
      {error && touched && (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={16} color={theme.colors.text.error} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
      {loadError ? (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={16} color={theme.colors.text.error} />
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

export default function SignUpScreen({ navigation }) {
  const { lastEvent } = useSync();
  const { login } = useAuth();
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone_number: '',
    school: '',
    student_id: '',
    hostel_address: '',
    password: '',
    confirm_password: '',
    middle_name: '',
    bio: '',
  });
  
  const [showOptional, setShowOptional] = useState(false);
  const [touched, setTouched] = useState({});
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [loading, setLoading] = useState(false);
  const [registrationFields, setRegistrationFields] = useState([]);
  const [schools, setSchools] = useState([]);
  const [configLoading, setConfigLoading] = useState(false);
  const [configError, setConfigError] = useState('');
  const [profileFields, setProfileFields] = useState({});
  
  // Avatar state
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);

  const orderedFields = useMemo(() => {
    return mergeRegistrationFields(registrationFields || []);
  }, [registrationFields]);

  const customFields = useMemo(() => {
    const builtIns = ['full_name', 'email', 'phone_number', 'school', 'student_id', 'hostel_address'];
    return orderedFields.filter((field) => !builtIns.includes(field.type));
  }, [orderedFields]);

  const requiredFieldKeys = useMemo(() => {
    return orderedFields
      .filter((field) => field.required)
      .map((field) => (field.field_id ? `field_${field.field_id}` : field.type));
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

  // Real-time validation
  useEffect(() => {
    const newErrors = {};
    setSubmitError('');
    if (touched.full_name && requiredFieldKeys.includes('full_name') && !formData.full_name.trim()) newErrors.full_name = 'Full name is required';
    if (touched.email) {
      const emailValue = formData.email.trim();
      if (requiredFieldKeys.includes('email') && !emailValue) {
        newErrors.email = 'Email is required';
      } else if (emailValue && !validateEmail(emailValue)) {
        newErrors.email = 'Invalid email address';
      }
    }
    if (touched.phone_number) {
      const phoneValue = formData.phone_number.trim();
      if ((requiredFieldKeys.includes('phone_number') && !phoneValue) || (phoneValue && phoneValue.length < 10)) {
        newErrors.phone_number = 'Valid phone number required';
      }
    }
    if (touched.school && requiredFieldKeys.includes('school') && !formData.school) newErrors.school = 'Please select your school';
    if (touched.student_id && requiredFieldKeys.includes('student_id') && !formData.student_id) newErrors.student_id = 'Student ID is required';
    if (touched.hostel_address && requiredFieldKeys.includes('hostel_address') && !formData.hostel_address) newErrors.hostel_address = 'Address is required';
    if (touched.password && checkPasswordStrength(formData.password) < 2) newErrors.password = 'Password is too weak';
    if (touched.confirm_password && formData.password !== formData.confirm_password) newErrors.confirm_password = 'Passwords do not match';

    customFields.forEach((field) => {
      const key = field.field_id ? `field_${field.field_id}` : field.type;
      if (touched[key] && requiredFieldKeys.includes(key) && !profileFields[key]) {
        newErrors[key] = `${field.label || 'Field'} is required`;
      }
    });
    
    setErrors(newErrors);
  }, [formData, touched, requiredFieldKeys, customFields, profileFields]);

  const handleChange = (name, value) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleBlur = (name) => {
    setTouched(prev => ({ ...prev, [name]: true }));
  };

  const handleProfileChange = (key, value) => {
    setProfileFields(prev => ({ ...prev, [key]: value }));
  };

  const handleProfileBlur = (key) => {
    setTouched(prev => ({ ...prev, [key]: true }));
  };

  const pickImage = async () => {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Sorry, we need camera roll permissions to make this work!');
        return;
      }
    }

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled) {
      const asset = result.assets[0];
      setAvatarPreview(asset.uri);
      
      const localUri = asset.uri;
      const filename = localUri.split('/').pop();
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : 'image/jpeg';
      
      setSelectedFile({ uri: localUri, name: filename, type });
    }
  };

  const validateSubmission = () => {
    const newErrors = {};
    if (requiredFieldKeys.includes('full_name') && !formData.full_name.trim()) {
      newErrors.full_name = 'Full name is required';
    }
    if (requiredFieldKeys.includes('email')) {
      if (!formData.email.trim()) {
        newErrors.email = 'Email is required';
      } else if (!validateEmail(formData.email)) {
        newErrors.email = 'Please enter a valid email';
      }
    }
    if (requiredFieldKeys.includes('phone_number')) {
      if (!formData.phone_number.trim()) {
        newErrors.phone_number = 'Phone number is required';
      } else if (formData.phone_number.trim().length < 10) {
        newErrors.phone_number = 'Phone number must be at least 10 digits';
      }
    }
    if (requiredFieldKeys.includes('school') && !formData.school) {
      newErrors.school = 'School is required';
    }
    if (requiredFieldKeys.includes('student_id') && !formData.student_id) {
      newErrors.student_id = 'Student ID is required';
    }
    if (requiredFieldKeys.includes('hostel_address') && !formData.hostel_address) {
      newErrors.hostel_address = 'Hostel address is required';
    }
    const passwordStrength = checkPasswordStrength(formData.password);
    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (passwordStrength < 2) {
      newErrors.password = 'Password is too weak';
    }
    if (!formData.confirm_password) {
      newErrors.confirm_password = 'Confirm password is required';
    }
    if (formData.password && formData.confirm_password && formData.password !== formData.confirm_password) {
      newErrors.confirm_password = 'Passwords do not match';
    }
    customFields.forEach((field) => {
      const key = field.field_id ? `field_${field.field_id}` : field.type;
      if (requiredFieldKeys.includes(key) && !profileFields[key]) {
        newErrors[key] = `${field.label || 'Field'} is required`;
      }
    });
    return newErrors;
  };

  const handleSubmit = async () => {
    const customKeys = customFields.map((field) => (field.field_id ? `field_${field.field_id}` : field.type));
    const allTouched = Object.keys(formData).reduce((acc, key) => ({ ...acc, [key]: true }), {});
    customKeys.forEach((key) => {
      allTouched[key] = true;
    });
    setTouched(allTouched);
    setSubmitError('');

    if (requiredFieldKeys.includes('school') && configError) {
      Alert.alert('Error', 'Failed to load schools. Please try again.');
      return;
    }

    const validationErrors = validateSubmission();
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      Alert.alert('Validation Error', 'Please correct the errors in the form.');
      return;
    }

    setLoading(true);
    try {
      const { confirm_password, ...data } = formData;
      const payload = { ...data, role: 'student' };
      const profilePayload = {};
      customFields.forEach((field) => {
        const key = field.field_id ? `field_${field.field_id}` : field.type;
        if (profileFields[key] !== undefined && profileFields[key] !== '') {
          profilePayload[key] = profileFields[key];
        }
      });
      if (Object.keys(profilePayload).length) {
        payload.profile_fields = profilePayload;
      }
      const response = await auth.register(payload);
      const { token, user, verification_required } = response.data;
      
      if (verification_required) {
          navigation.navigate('VerifyEmail', { email: user.email });
          return;
      }

      let authenticated = false;
      let authError = null;

      if (token) {
        try {
          await AsyncStorage.setItem('postLoginRoute', 'MainTabs');
          await login(token, user);
          authenticated = true;
        } catch (e) {
          authError = e;
        }
      } else {
        try {
          const loginResponse = await auth.login(formData.phone_number, formData.password);
          const { token: loginToken, user: loginUser } = loginResponse.data || {};
          if (loginToken) {
            await AsyncStorage.setItem('postLoginRoute', 'MainTabs');
            await login(loginToken, loginUser);
            authenticated = true;
          }
        } catch (e) {
          authError = e;
        }
      }

      if (!authenticated) {
        const normalized = normalizeApiError(authError || new Error('auto_auth_failed'));
        Alert.alert('Login Required', normalized?.message || 'Please log in to continue.');
        navigation.replace('Login', { mode: 'form', email: user?.email || formData.email });
        return;
      }

      // Upload Avatar if selected
      if (selectedFile) {
        const photoData = new FormData();
        photoData.append('user_id', user.user_id);
        photoData.append('profile_photo', {
          uri: selectedFile.uri,
          name: selectedFile.name,
          type: selectedFile.type
        });
        
        try {
          // We use updateProfile which handles the /student/profile PUT endpoint
          // But wait, the backend endpoint for profile update is PUT /student/profile
          // Does it support creating the profile picture? Yes.
          await student.updateProfile(photoData);
        } catch (uploadErr) {
          console.error('Avatar upload failed:', uploadErr);
          // Don't block registration success, just warn
          Alert.alert('Notice', 'Account created but profile photo failed to upload.');
        }
      }

      // Navigation is handled by AuthContext state change (switches to AppStack)
    } catch (error) {
      const msg = error.response?.data?.error || 'Registration failed. Please try again.';
      setSubmitError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.bgLayer} />
      <View style={styles.bgAccentOne} />
      <View style={styles.bgAccentTwo} />
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.formCard}>
            <View style={styles.header} accessibilityRole="header">
              <Image 
                source={require('../../assets/icon.png')} 
                style={styles.logo} 
                accessibilityLabel="3R Laundry Logo"
              />
              <Text style={styles.title}>Create Account</Text>
              <Text style={styles.subtitle}>Join 3R Laundry service today</Text>
            </View>

            <View style={styles.form} accessibilityRole="form">
            {configLoading ? (
              <View style={styles.configRow}>
                <ActivityIndicator color={theme.colors.primary} />
                <Text style={styles.configText}>Loading registration setup...</Text>
              </View>
            ) : null}
            {configError ? (
              <View style={styles.submitErrorContainer} accessibilityRole="alert">
                <Ionicons name="alert-circle" size={20} color={theme.colors.text.error} />
                <Text style={styles.submitErrorText}>{configError}</Text>
              </View>
            ) : null}
            {orderedFields.map((field) => {
              const key = field.field_id ? `field_${field.field_id}` : field.type;
              if (field.type === 'full_name') {
                return (
                  <FormInput
                    key={key}
                    id={key}
                    label={field.label || 'Full Name'}
                    value={formData.full_name}
                    onChangeText={t => handleChange('full_name', t)}
                    onBlur={() => handleBlur('full_name')}
                    error={errors.full_name}
                    touched={touched.full_name}
                    autoCapitalize="words"
                    textContentType="name"
                  />
                );
              }
              if (field.type === 'email') {
                return (
                  <FormInput
                    key={key}
                    id={key}
                    label={field.label || 'Email Address'}
                    value={formData.email}
                    onChangeText={t => handleChange('email', t)}
                    onBlur={() => handleBlur('email')}
                    error={errors.email}
                    touched={touched.email}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    textContentType="emailAddress"
                  />
                );
              }
              if (field.type === 'phone_number') {
                return (
                  <FormInput
                    key={key}
                    id={key}
                    label={field.label || 'Phone Number'}
                    value={formData.phone_number}
                    onChangeText={t => handleChange('phone_number', t)}
                    onBlur={() => handleBlur('phone_number')}
                    error={errors.phone_number}
                    touched={touched.phone_number}
                    keyboardType="phone-pad"
                    textContentType="telephoneNumber"
                  />
                );
              }
              if (field.type === 'school') {
                return (
                  <SchoolDropdown 
                    key={key}
                    label={field.label || 'School'}
                    value={formData.school}
                    onSelect={s => handleChange('school', s)}
                    error={errors.school}
                    touched={touched.school}
                    schools={schools}
                    loading={configLoading}
                    loadError={configError}
                  />
                );
              }
              if (field.type === 'student_id') {
                return (
                  <FormInput
                    key={key}
                    id={key}
                    label={field.label || 'Student ID'}
                    value={formData.student_id}
                    onChangeText={t => handleChange('student_id', t)}
                    onBlur={() => handleBlur('student_id')}
                    error={errors.student_id}
                    touched={touched.student_id}
                  />
                );
              }
              if (field.type === 'hostel_address') {
                return (
                  <FormInput
                    key={key}
                    id={key}
                    label={field.label || 'Hostel Address'}
                    value={formData.hostel_address}
                    onChangeText={t => handleChange('hostel_address', t)}
                    onBlur={() => handleBlur('hostel_address')}
                    error={errors.hostel_address}
                    touched={touched.hostel_address}
                    multiline
                    numberOfLines={3}
                    style={[styles.input, styles.textArea]}
                  />
                );
              }
              if (field.type === 'multiline') {
                return (
                  <FormInput
                    key={key}
                    id={key}
                    label={field.label || 'Details'}
                    value={profileFields[key] || ''}
                    onChangeText={t => handleProfileChange(key, t)}
                    onBlur={() => handleProfileBlur(key)}
                    error={errors[key]}
                    touched={touched[key]}
                    multiline
                    numberOfLines={3}
                    style={[styles.input, styles.textArea]}
                  />
                );
              }
              if (field.type === 'number') {
                return (
                  <FormInput
                    key={key}
                    id={key}
                    label={field.label || 'Number'}
                    value={profileFields[key] || ''}
                    onChangeText={t => handleProfileChange(key, t)}
                    onBlur={() => handleProfileBlur(key)}
                    error={errors[key]}
                    touched={touched[key]}
                    keyboardType="numeric"
                  />
                );
              }
              return (
                <FormInput
                  key={key}
                  id={key}
                  label={field.label || 'Field'}
                  value={profileFields[key] || ''}
                  onChangeText={t => handleProfileChange(key, t)}
                  onBlur={() => handleProfileBlur(key)}
                  error={errors[key]}
                  touched={touched[key]}
                />
              );
            })}

            <TouchableOpacity 
              style={styles.optionalToggle} 
              onPress={() => setShowOptional(!showOptional)}
              accessibilityRole="button"
              accessibilityLabel={showOptional ? "Hide optional details" : "Show optional details"}
            >
              <Text style={styles.optionalToggleText}>
                {showOptional ? 'Hide Additional Details' : 'Add Additional Details (Optional)'}
              </Text>
              <Ionicons name={showOptional ? "chevron-up" : "chevron-down"} size={20} color={theme.colors.primary} />
            </TouchableOpacity>

            {showOptional && (
              <View style={styles.optionalContainer}>
                <FormInput
                  label="Middle Name"
                  value={formData.middle_name}
                  onChangeText={t => handleChange('middle_name', t)}
                  onBlur={() => handleBlur('middle_name')}
                  autoCapitalize="words"
                  textContentType="middleName"
                />
                
                <FormInput
                  label="Bio"
                  value={formData.bio}
                  onChangeText={t => handleChange('bio', t)}
                  onBlur={() => handleBlur('bio')}
                  multiline
                  numberOfLines={3}
                  style={[styles.input, styles.textArea]}
                />
                
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Profile Photo</Text>
                  <TouchableOpacity 
                    style={styles.uploadBtn}
                    onPress={pickImage}
                    accessibilityRole="button"
                    accessibilityLabel="Upload Profile Photo"
                  >
                    {avatarPreview ? (
                      <Image source={{ uri: avatarPreview }} style={styles.previewImage} />
                    ) : (
                      <>
                        <Ionicons name="camera" size={24} color={theme.colors.primary} />
                        <Text style={styles.uploadBtnText}>Upload Photo</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  {avatarPreview && (
                    <TouchableOpacity onPress={() => { setAvatarPreview(null); setSelectedFile(null); }} style={styles.removePhotoBtn}>
                      <Text style={styles.removePhotoText}>Remove Photo</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}

            <FormInput
              label="Password"
              value={formData.password}
              onChangeText={t => handleChange('password', t)}
              onBlur={() => handleBlur('password')}
              error={errors.password}
              touched={touched.password}
              secureTextEntry
              textContentType="newPassword"
            />
            <PasswordStrength password={formData.password} />

            <FormInput
              label="Confirm Password"
              value={formData.confirm_password}
              onChangeText={t => handleChange('confirm_password', t)}
              onBlur={() => handleBlur('confirm_password')}
              error={errors.confirm_password}
              touched={touched.confirm_password}
              secureTextEntry
              textContentType="newPassword"
            />

            {submitError ? (
              <View style={styles.submitErrorContainer} accessibilityRole="alert">
                <Ionicons name="alert-circle" size={20} color={theme.colors.text.error} />
                <Text style={styles.submitErrorText}>{submitError}</Text>
              </View>
            ) : null}

            <TouchableOpacity 
              style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel={loading ? "Creating account..." : "Sign Up"}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitBtnText}>Create Account</Text>
              )}
            </TouchableOpacity>

            <View style={styles.loginLinkContainer}>
              <Text style={styles.loginLinkText}>Already have an account? </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Login')} accessibilityRole="link">
                <Text style={styles.loginLink}>Log in</Text>
              </TouchableOpacity>
            </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  bgLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: theme.colors.background },
  bgAccentOne: { position: 'absolute', width: 320, height: 320, borderRadius: 160, backgroundColor: '#E0E7FF', top: -80, right: -120, opacity: 0.9 },
  bgAccentTwo: { position: 'absolute', width: 280, height: 280, borderRadius: 140, backgroundColor: '#EDE9FE', bottom: -120, left: -80, opacity: 0.85 },
  container: { padding: theme.spacing.l, paddingBottom: 40, maxWidth: 680, alignSelf: 'center', width: '100%', flexGrow: 1, justifyContent: 'center' },
  formCard: { backgroundColor: theme.colors.surface, borderRadius: 24, padding: theme.spacing.l, shadowColor: '#111827', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.12, shadowRadius: 20, elevation: 4 },
  header: {
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
    marginTop: theme.spacing.m,
  },
  logo: {
    width: 80,
    height: 80,
    resizeMode: 'contain',
    marginBottom: theme.spacing.m,
  },
  title: {
    ...theme.typography.h1,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing.xs,
  },
  subtitle: {
    ...theme.typography.body,
    color: theme.colors.text.secondary,
  },
  form: {
    width: '100%',
  },
  inputGroup: {
    marginBottom: theme.spacing.m,
  },
  label: {
    ...theme.typography.caption,
    fontWeight: '600',
    color: theme.colors.text.primary,
    marginBottom: theme.spacing.xs,
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 16,
    paddingHorizontal: theme.spacing.m,
    paddingVertical: 12,
    ...theme.typography.body,
    color: theme.colors.text.primary,
  },
  inputText: {
    ...theme.typography.body,
    color: theme.colors.text.primary,
  },
  inputFocused: { borderColor: theme.colors.focus, borderWidth: 2 },
  inputError: {
    borderColor: theme.colors.text.error,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing.xs,
  },
  errorText: {
    ...theme.typography.small,
    color: theme.colors.text.error,
    marginLeft: 4,
  },
  configRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.m,
  },
  configText: {
    ...theme.typography.body,
    color: theme.colors.text.secondary,
    marginLeft: theme.spacing.s,
  },
  dropdownBtn: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 16,
    paddingHorizontal: theme.spacing.m,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dropdownList: {
    marginTop: theme.spacing.xs,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 16,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    zIndex: 10,
  },
  searchBox: {
    padding: theme.spacing.m,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    ...theme.typography.body,
  },
  dropdownItem: {
    padding: theme.spacing.m,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dropdownItemText: {
    ...theme.typography.body,
    color: theme.colors.text.primary,
  },
  passwordStrength: {
    marginBottom: theme.spacing.m,
  },
  strengthBarBg: {
    height: 4,
    backgroundColor: theme.colors.border,
    borderRadius: 2,
    marginBottom: 4,
    overflow: 'hidden',
  },
  strengthBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  strengthText: {
    ...theme.typography.small,
    textAlign: 'right',
  },
  submitBtn: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 16,
    borderRadius: 20,
    alignItems: 'center',
    marginTop: theme.spacing.m,
    marginBottom: theme.spacing.l,
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 4,
  },
  submitBtnDisabled: {
    backgroundColor: theme.colors.text.placeholder,
    shadowOpacity: 0,
  },
  submitBtnText: {
    ...theme.typography.h2,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  loginLinkContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingBottom: theme.spacing.l,
  },
  loginLinkText: {
    ...theme.typography.body,
    color: theme.colors.text.secondary,
  },
  loginLink: {
    ...theme.typography.body,
    color: theme.colors.primary,
    fontWeight: '600',
  },
  optionalToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.m,
    marginBottom: theme.spacing.m,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  optionalToggleText: {
    ...theme.typography.body,
    color: theme.colors.primary,
    fontWeight: '600',
  },
  optionalContainer: {
    marginBottom: theme.spacing.m,
  },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.m,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 16,
    backgroundColor: '#F9FAFB',
    borderStyle: 'dashed',
    height: 100,
    overflow: 'hidden',
  },
  uploadBtnText: {
    ...theme.typography.body,
    color: theme.colors.primary,
    marginLeft: theme.spacing.s,
    fontWeight: '600',
  },
  previewImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  removePhotoBtn: {
    alignSelf: 'center',
    marginTop: 8,
  },
  removePhotoText: {
    color: theme.colors.text.error,
    fontSize: 12,
  },
  submitErrorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    padding: theme.spacing.s,
    borderRadius: 14,
    marginBottom: theme.spacing.m,
    borderWidth: 1,
    borderColor: theme.colors.text.error,
  },
  submitErrorText: {
    color: theme.colors.text.error,
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
});
