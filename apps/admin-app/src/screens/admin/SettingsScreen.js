import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Switch, Image, Platform, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Picker } from '@react-native-picker/picker';
import { staff, normalizeApiError } from '../../services/api';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { getTokens } from '../../theme/tokens';

const tokens = getTokens();
const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const registrationFieldTypes = [
  { label: 'Full Name', value: 'full_name' },
  { label: 'Email', value: 'email' },
  { label: 'Phone Number', value: 'phone_number' },
  { label: 'School', value: 'school' },
  { label: 'Student ID', value: 'student_id' },
  { label: 'Hostel Address', value: 'hostel_address' },
  { label: 'Short Text', value: 'text' },
  { label: 'Long Text', value: 'multiline' },
  { label: 'Number', value: 'number' }
];

export default function SettingsScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const normalizeEmailSettings = (raw = {}) => {
    const defaults = {
      enabled: true,
      login: {
        enabled: true,
        subject: 'New login to {{app_name}}',
        text: 'Hi {{user_name}},\n\nA successful login to {{app_name}} was detected.\nTime: {{login_time}}\nIP: {{ip_address}}\nDevice: {{user_agent}}\n\nIf this was not you, please reset your password.',
        html: '<h2>Login alert</h2><p>Hi {{user_name}},</p><p>A successful login to {{app_name}} was detected.</p><ul><li>Time: {{login_time}}</li><li>IP: {{ip_address}}</li><li>Device: {{user_agent}}</li></ul><p>If this was not you, please reset your password.</p>'
      },
      payment: {
        enabled: true,
        subject: 'Payment update: {{payment_event}}',
        text: 'Hi {{user_name}},\n\nPayment update: {{payment_event}}\nPlan: {{plan_name}}\nAmount: {{amount}}\nStatus: {{status}}\nReference: {{reference}}\nTime: {{event_time}}\n',
        html: '<h2>Payment update</h2><p>Hi {{user_name}},</p><p>{{payment_event}}</p><ul><li>Plan: {{plan_name}}</li><li>Amount: {{amount}}</li><li>Status: {{status}}</li><li>Reference: {{reference}}</li><li>Time: {{event_time}}</li></ul>'
      },
      order_status: {
        enabled: true,
        subject: 'Order {{order_id}}: {{status}}',
        text: 'Hi {{user_name}},\n\nYour order {{order_id}} status is now {{status}}.\n{{status_explanation}}\nNext step: {{next_step}}\n',
        html: '<h2>Order status update</h2><p>Hi {{user_name}},</p><p>Your order <strong>{{order_id}}</strong> status is now <strong>{{status}}</strong>.</p><p>{{status_explanation}}</p><p>Next step: {{next_step}}</p>'
      }
    };
    return {
      enabled: raw.enabled !== undefined ? raw.enabled : defaults.enabled,
      login: { ...defaults.login, ...(raw.login || {}) },
      payment: { ...defaults.payment, ...(raw.payment || {}) },
      order_status: { ...defaults.order_status, ...(raw.order_status || {}) }
    };
  };
  const [settings, setSettings] = useState({
    branding: { app_name: '', logo_url: '', favicon_url: '', description: '', app_color: '', accent_color: '' },
    operations: { pickup_windows: [], extra_item_price: 500, processing_timeline_text: '' },
    emergency: {
      enabled: false,
      available: true,
      pricing_mode: 'per_item',
      price_per_item: 400,
      base_fee: 0,
      delivery_window_text: 'Delivered within 2–8 hours (same day)',
      description: 'Same-day delivery within 2–8 hours',
      estimated_completion_text: '2–8 hours',
      estimated_completion_minutes: 360,
      instructions: '',
      restrictions: '',
      updated_at: null,
      version: 0
    },
    rules: { code_expiry_hours: 168, school_rules: {} },
    notifications: { templates: {}, email: normalizeEmailSettings({}) },
    payments: { paystack: { enabled: false, public_key: '' }, bank_accounts: [] },
    version: 0
  });
  const [activeTab, setActiveTab] = useState('branding');
  const [pickupDayError, setPickupDayError] = useState('');
  const [registrationFields, setRegistrationFields] = useState([]);
  const [schools, setSchools] = useState([]);
  const [registrationLoading, setRegistrationLoading] = useState(false);
  const [registrationSaving, setRegistrationSaving] = useState(false);
  const [syncingEmergency, setSyncingEmergency] = useState(false);
  const [emergencySyncNotice, setEmergencySyncNotice] = useState(null);

  useEffect(() => {
    fetchSettings();
    fetchRegistrationSetup();
  }, []);

  const normalizePickupTimeFrame = (frame = {}) => {
    const base = {
      day: 'Monday',
      blocks: {
        morning: { start: '08:00', end: '12:00' },
        afternoon: { start: '13:00', end: '16:00' },
        evening: { start: '17:00', end: '20:00' }
      }
    };
    const merged = {
      ...base,
      ...frame,
      blocks: {
        ...base.blocks,
        ...(frame.blocks || {})
      }
    };
    const rawDays = Array.isArray(merged.pickup_days)
      ? merged.pickup_days
      : (Array.isArray(merged.days) ? merged.days : (merged.day ? [merged.day] : []));
    const cleaned = rawDays.filter(day => weekdays.includes(day));
    const uniqueDays = Array.from(new Set(cleaned)).slice(0, 3);
    const primaryDay = uniqueDays[0] || merged.day || 'Monday';
    const days = uniqueDays.length ? uniqueDays : [primaryDay];
    return { ...merged, day: primaryDay, days, pickup_days: days };
  };

  const fetchSettings = async () => {
    try {
      const res = await staff.getSettings();
      const incomingOperations = res.data.operations || {};
      const pickupTimeFrame = normalizePickupTimeFrame(incomingOperations.pickup_time_frame);
      // Ensure defaults if missing from API
      setSettings({
        branding: res.data.branding || {},
        operations: {
          pickup_windows: [],
          extra_item_price: 500,
          processing_timeline_text: '',
          ...incomingOperations,
          pickup_time_frame: pickupTimeFrame
        },
        emergency: {
          enabled: false,
          available: true,
          pricing_mode: 'per_item',
          price_per_item: 400,
          base_fee: 0,
          delivery_window_text: 'Delivered within 2–8 hours (same day)',
          description: 'Same-day delivery within 2–8 hours',
          estimated_completion_text: '2–8 hours',
          estimated_completion_minutes: 360,
          instructions: '',
          restrictions: '',
          updated_at: null,
          version: 0,
          ...(res.data.emergency || {})
        },
        rules: res.data.rules || { code_expiry_hours: 168, school_rules: {} },
        notifications: {
          templates: {},
          ...(res.data.notifications || {}),
          email: normalizeEmailSettings(res.data.notifications?.email || {})
        },
        integrations: res.data.integrations || {},
        payments: {
          paystack: { enabled: false, public_key: '' },
          bank_accounts: [],
          ...(res.data.payments || {})
        },
        version: res.data.version ?? 0
      });
      setPickupDayError('');
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const fetchRegistrationSetup = async () => {
    setRegistrationLoading(true);
    try {
      const [fieldsRes, schoolsRes] = await Promise.all([
        staff.listRegistrationFields(),
        staff.listSchools()
      ]);
      setRegistrationFields(Array.isArray(fieldsRes.data) ? fieldsRes.data : []);
      setSchools(Array.isArray(schoolsRes.data) ? schoolsRes.data : []);
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to load registration setup');
    } finally {
      setRegistrationLoading(false);
    }
  };

  const validatePickupDays = () => {
    const frame = settings.operations?.pickup_time_frame || {};
    const rawDays = Array.isArray(frame.pickup_days)
      ? frame.pickup_days
      : (Array.isArray(frame.days) ? frame.days : (frame.day ? [frame.day] : []));
    const cleaned = rawDays.filter(day => weekdays.includes(day));
    const unique = Array.from(new Set(cleaned));
    const dayTwo = rawDays[1];
    const dayThree = rawDays[2];
    if (cleaned.length === 0) {
      setPickupDayError('Select at least one pickup day.');
      return false;
    }
    if (dayThree && !dayTwo) {
      setPickupDayError('Select Pickup Day 2 before Pickup Day 3.');
      return false;
    }
    if (unique.length !== cleaned.length) {
      setPickupDayError('Pickup days must be different.');
      return false;
    }
    if (unique.length > 3) {
      setPickupDayError('Select up to three pickup days.');
      return false;
    }
    setPickupDayError('');
    return true;
  };

  const validateBankAccounts = () => {
    const accounts = Array.isArray(settings.payments?.bank_accounts) ? settings.payments.bank_accounts : [];
    const trimmed = accounts.map((account) => ({
      bank_name: String(account.bank_name || '').trim(),
      account_name: String(account.account_name || '').trim(),
      account_number: String(account.account_number || '').trim(),
      routing_number: String(account.routing_number || '').trim(),
      active: !!account.active
    }));
    if (!trimmed.length) return true;
    for (let i = 0; i < trimmed.length; i += 1) {
      const item = trimmed[i];
      const label = `Account ${i + 1}`;
      if (!item.bank_name) {
        setActiveTab('bank accounts');
        Alert.alert('Validation Error', `${label}: Bank name is required.`);
        return false;
      }
      if (!item.account_name) {
        setActiveTab('bank accounts');
        Alert.alert('Validation Error', `${label}: Account holder name is required.`);
        return false;
      }
      if (!/^\d{6,20}$/.test(item.account_number)) {
        setActiveTab('bank accounts');
        Alert.alert('Validation Error', `${label}: Account number must be 6-20 digits.`);
        return false;
      }
      if (!/^\d{4,20}$/.test(item.routing_number)) {
        setActiveTab('bank accounts');
        Alert.alert('Validation Error', `${label}: Routing number must be 4-20 digits.`);
        return false;
      }
    }
    return true;
  };

  const parsePositiveNumber = (value, fallback = 0) => {
    const normalized = String(value ?? '').replace(/[^0-9.]/g, '');
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(0, parsed);
  };

  const handleSave = async () => {
    if (!validatePickupDays()) return;
    if (!validateBankAccounts()) return;
    setSaving(true);
    const normalizedPickupTimeFrame = normalizePickupTimeFrame(settings.operations?.pickup_time_frame || {});
    const payload = {
      ...settings,
      operations: {
        ...settings.operations,
        pickup_time_frame: normalizedPickupTimeFrame
      }
    };
    try {
      const res = await staff.updateSettings(payload);
      if (res?.data?.version !== undefined) {
        setSettings(prev => ({
          ...prev,
          version: res.data.version,
          operations: {
            ...prev.operations,
            pickup_time_frame: normalizedPickupTimeFrame
          },
          emergency: {
            ...prev.emergency,
            version: res.data.emergency?.version ?? prev.emergency?.version
          }
        }));
      }
      try {
        await staff.syncEmergencySettings();
        Alert.alert('Success', 'Settings updated and synced successfully');
      } catch (syncError) {
        const normalizedSync = syncError?.normalized || normalizeApiError?.(syncError);
        Alert.alert('Partial Success', normalizedSync?.message || 'Settings updated, but emergency sync failed');
      }
    } catch (error) {
      const normalized = error?.normalized || normalizeApiError?.(error);
      const status = error?.response?.status;
      if (status === 409) {
        Alert.alert('Conflict', 'Settings were updated by someone else. Reloading latest settings.');
        fetchSettings();
        return;
      }
      Alert.alert('Error', normalized?.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const pickImage = async (type) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });

    if (!result.canceled) {
      const asset = result.assets[0];
      
      // Upload immediately
      const formData = new FormData();
      
      // Platform specific file handling
      let fileToUpload;
      if (Platform.OS === 'web') {
        const response = await fetch(asset.uri);
        const blob = await response.blob();
        fileToUpload = new File([blob], 'upload.png', { type: 'image/png' });
      } else {
        fileToUpload = {
          uri: asset.uri,
          name: 'upload.png',
          type: 'image/png'
        };
      }

      try {
        const res = await staff.uploadSettingsFile(type, fileToUpload);
        // Update local state with new URL
        setSettings(prev => ({
          ...prev,
          branding: {
            ...prev.branding,
            [type === 'logo' ? 'logo_url' : 'favicon_url']: res.data.url
          }
        }));
      } catch (e) {
        Alert.alert('Upload Failed', e.message);
      }
    }
  };

  const handleEmergencySync = async () => {
    if (syncingEmergency) return;
    setSyncingEmergency(true);
    setEmergencySyncNotice(null);
    const startedAt = new Date();
    try {
      const payload = { emergency: settings.emergency };
      if (settings.version !== undefined) payload.version = settings.version;
      const res = await staff.updateSettings(payload);
      if (res?.data?.version !== undefined) {
        setSettings(prev => ({
          ...prev,
          version: res.data.version,
          emergency: {
            ...prev.emergency,
            ...(res.data.emergency || {}),
            version: res.data.emergency?.version ?? prev.emergency?.version
          }
        }));
      }
      await staff.syncEmergencySettings();
      const message = `Emergency settings synced at ${startedAt.toLocaleTimeString()}`;
      setEmergencySyncNotice({ type: 'success', message });
      if (Platform.OS === 'web') {
        window.alert('Emergency settings synced to user app');
      } else {
        Alert.alert('Success', 'Emergency settings synced to user app');
      }
    } catch (error) {
      const normalized = error?.normalized || normalizeApiError?.(error);
      const status = error?.response?.status;
      if (status === 409) {
        fetchSettings();
        const conflictMessage = 'Settings were updated by someone else. Reloaded latest settings.';
        setEmergencySyncNotice({ type: 'error', message: conflictMessage });
        if (Platform.OS === 'web') {
          window.alert(conflictMessage);
        } else {
          Alert.alert('Conflict', conflictMessage);
        }
        return;
      }
      const message = normalized?.message || 'Failed to sync emergency settings';
      setEmergencySyncNotice({ type: 'error', message });
      if (Platform.OS === 'web') {
        window.alert(message);
      } else {
        Alert.alert('Error', message);
      }
      if (typeof console !== 'undefined') {
        console.error('Emergency sync failed', { status, code: normalized?.code });
      }
      try {
        await staff.logFrontError({
          source: 'admin-web',
          message,
          href: typeof window !== 'undefined' ? window.location.href : undefined,
          context: {
            action: 'emergency_sync',
            status,
            code: normalized?.code,
            settings_version: settings.version,
            emergency_version: settings.emergency?.version
          }
        });
      } catch {}
    } finally {
      setSyncingEmergency(false);
    }
  };

  const updateField = (section, field, value) => {
    setSettings(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value
      }
    }));
  };

  const updateNestedField = (section, sub, field, value) => {
     setSettings(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [sub]: {
           ...prev[section][sub],
           [field]: value
        }
      }
    }));
  };

  const updateEmailRoot = (field, value) => {
    setSettings(prev => ({
      ...prev,
      notifications: {
        ...prev.notifications,
        email: {
          ...(prev.notifications?.email || {}),
          [field]: value
        }
      }
    }));
  };

  const updateEmailSection = (section, field, value) => {
    setSettings(prev => ({
      ...prev,
      notifications: {
        ...prev.notifications,
        email: {
          ...(prev.notifications?.email || {}),
          [section]: {
            ...(prev.notifications?.email?.[section] || {}),
            [field]: value
          }
        }
      }
    }));
  };

  const renderTemplate = (template, variables) => {
    if (!template) return '';
    return String(template).replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => {
      const value = variables[key];
      if (value === undefined || value === null) return '';
      return String(value);
    });
  };

  const getPreviewVars = (type) => {
    const now = new Date().toISOString();
    const appName = settings.branding?.app_name || '3R Laundry';
    const base = {
      app_name: appName,
      user_name: 'Alex Doe'
    };
    if (type === 'login') {
      return {
        ...base,
        login_time: now,
        ip_address: '102.89.0.1',
        user_agent: 'iPhone 14 Pro'
      };
    }
    if (type === 'payment') {
      return {
        ...base,
        payment_event: 'Payment successful',
        plan_name: 'Monthly Plan',
        amount: '1500',
        status: 'paid',
        reference: 'PAY-123',
        event_time: now
      };
    }
    if (type === 'order_status') {
      return {
        ...base,
        order_id: 'ORD-1001',
        status: 'Ready',
        status_explanation: 'Your laundry is ready for delivery.',
        next_step: 'A rider will deliver your items shortly.'
      };
    }
    if (type === 'order_ready') {
      return {
        ...base,
        code: '123456'
      };
    }
    return base;
  };

  const showTemplatePreview = (title, template, type) => {
    const rendered = renderTemplate(template, getPreviewVars(type));
    Alert.alert(title, rendered || 'No preview available');
  };

  const showEmailPreview = (label, section, type) => {
    const vars = getPreviewVars(type);
    const subject = renderTemplate(section?.subject, vars);
    const text = renderTemplate(section?.text, vars);
    const html = renderTemplate(section?.html, vars);
    const message = `Subject: ${subject}\n\nText:\n${text}\n\nHTML:\n${html}`;
    Alert.alert(`${label} Preview`, message || 'No preview available');
  };

  const addRegistrationField = () => {
    setRegistrationFields(prev => ([
      ...prev,
      {
        field_id: `new-${Date.now()}`,
        label: '',
        type: 'text',
        required: false,
        active: true,
        order: prev.length + 1,
        is_new: true
      }
    ]));
  };

  const updateRegistrationField = (index, key, value) => {
    setRegistrationFields(prev => {
      const next = [...prev];
      const current = next[index] || {};
      next[index] = { ...current, [key]: value };
      return next;
    });
  };

  const saveRegistrationField = async (field, index) => {
    if (!field?.label || !field?.type) {
      Alert.alert('Validation Error', 'Field label and type are required.');
      return;
    }
    setRegistrationSaving(true);
    try {
      const payload = {
        label: field.label,
        type: field.type,
        required: !!field.required,
        active: field.active === undefined ? true : !!field.active,
        order: Number.isFinite(Number(field.order)) ? Number(field.order) : 0
      };
      if (field.is_new) {
        const res = await staff.createRegistrationField(payload);
        setRegistrationFields(prev => {
          const next = [...prev];
          next[index] = res.data;
          return next;
        });
      } else {
        const res = await staff.updateRegistrationField(field.field_id, payload);
        setRegistrationFields(prev => {
          const next = [...prev];
          next[index] = res.data;
          return next;
        });
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to save field');
    } finally {
      setRegistrationSaving(false);
    }
  };

  const removeRegistrationField = async (field, index) => {
    if (field.is_new) {
      setRegistrationFields(prev => prev.filter((_, i) => i !== index));
      return;
    }
    setRegistrationSaving(true);
    try {
      await staff.deleteRegistrationField(field.field_id);
      setRegistrationFields(prev => prev.filter((_, i) => i !== index));
    } catch (error) {
      Alert.alert('Error', 'Failed to delete field');
    } finally {
      setRegistrationSaving(false);
    }
  };

  const addSchool = () => {
    setSchools(prev => ([
      ...prev,
      {
        school_id: `new-${Date.now()}`,
        school_name: '',
        active: true,
        is_new: true
      }
    ]));
  };

  const updateSchool = (index, key, value) => {
    setSchools(prev => {
      const next = [...prev];
      const current = next[index] || {};
      next[index] = { ...current, [key]: value };
      return next;
    });
  };

  const saveSchool = async (school, index) => {
    if (!school?.school_name) {
      Alert.alert('Validation Error', 'School name is required.');
      return;
    }
    setRegistrationSaving(true);
    try {
      const payload = {
        school_name: school.school_name,
        active: school.active === undefined ? true : !!school.active
      };
      if (school.is_new) {
        const res = await staff.createSchool(payload);
        setSchools(prev => {
          const next = [...prev];
          next[index] = res.data;
          return next;
        });
      } else {
        const res = await staff.updateSchool(school.school_id, payload);
        setSchools(prev => {
          const next = [...prev];
          next[index] = res.data;
          return next;
        });
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to save school');
    } finally {
      setRegistrationSaving(false);
    }
  };

  const removeSchool = async (school, index) => {
    if (school.is_new) {
      setSchools(prev => prev.filter((_, i) => i !== index));
      return;
    }
    setRegistrationSaving(true);
    try {
      await staff.deleteSchool(school.school_id);
      setSchools(prev => prev.filter((_, i) => i !== index));
    } catch (error) {
      Alert.alert('Error', 'Failed to delete school');
    } finally {
      setRegistrationSaving(false);
    }
  };

  const updateBankAccount = (index, field, value) => {
    setSettings(prev => {
      const accounts = Array.isArray(prev.payments?.bank_accounts) ? [...prev.payments.bank_accounts] : [];
      const current = accounts[index] || {};
      accounts[index] = { ...current, [field]: value };
      return {
        ...prev,
        payments: {
          ...prev.payments,
          bank_accounts: accounts
        }
      };
    });
  };

  const setActiveBankAccount = (index, active) => {
    setSettings(prev => {
      const accounts = Array.isArray(prev.payments?.bank_accounts) ? [...prev.payments.bank_accounts] : [];
      const nextAccounts = accounts.map((acc, i) => ({
        ...acc,
        active: active ? i === index : (i === index ? false : acc.active)
      }));
      return {
        ...prev,
        payments: {
          ...prev.payments,
          bank_accounts: nextAccounts
        }
      };
    });
  };

  const addBankAccount = () => {
    setSettings(prev => {
      const accounts = Array.isArray(prev.payments?.bank_accounts) ? [...prev.payments.bank_accounts] : [];
      accounts.push({
        id: Date.now().toString(),
        bank_name: '',
        account_name: '',
        account_number: '',
        routing_number: '',
        active: accounts.length === 0
      });
      return {
        ...prev,
        payments: {
          ...prev.payments,
          bank_accounts: accounts
        }
      };
    });
  };

  const removeBankAccount = (index) => {
    setSettings(prev => {
      const accounts = Array.isArray(prev.payments?.bank_accounts) ? [...prev.payments.bank_accounts] : [];
      accounts.splice(index, 1);
      const hasActive = accounts.some(a => a.active);
      if (!hasActive && accounts.length > 0) {
        accounts[0] = { ...accounts[0], active: true };
      }
      return {
        ...prev,
        payments: {
          ...prev.payments,
          bank_accounts: accounts
        }
      };
    });
  };

  const setPickupDay = (index, value) => {
    setSettings(prev => {
      const frame = prev.operations.pickup_time_frame || {};
      const rawDays = Array.isArray(frame.pickup_days)
        ? frame.pickup_days
        : (Array.isArray(frame.days) ? frame.days : (frame.day ? [frame.day] : []));
      const currentDays = rawDays.slice(0, 3);
      let dayOne = currentDays[0] || frame.day || 'Monday';
      let dayTwo = currentDays[1] || '';
      let dayThree = currentDays[2] || '';

      if (index === 0) {
        dayOne = value;
        if (dayTwo === dayOne) {
          dayTwo = '';
          setPickupDayError('Pickup days must be different.');
        }
        if (dayThree === dayOne) {
          dayThree = '';
        }
        setPickupDayError('');
      } else {
        if (index === 1) {
          dayTwo = value;
          if (dayTwo && dayTwo === dayOne) {
            setPickupDayError('Pickup days must be different.');
            return prev;
          }
          if (dayThree && dayThree === dayTwo) {
            dayThree = '';
          }
          setPickupDayError('');
        } else {
          if (!dayTwo) {
            setPickupDayError('Select Pickup Day 2 before Pickup Day 3.');
            return prev;
          }
          dayThree = value;
          if (dayThree && (dayThree === dayOne || dayThree === dayTwo)) {
            setPickupDayError('Pickup days must be different.');
            return prev;
          }
          setPickupDayError('');
        }
      }

      const nextDays = [dayOne, dayTwo, dayThree].filter(Boolean).slice(0, 3);

      return {
        ...prev,
        operations: {
          ...prev.operations,
          pickup_time_frame: {
            ...frame,
            day: dayOne,
            days: nextDays,
            pickup_days: nextDays
          }
        }
      };
    });
  };

  // UI Components for Sections
  const renderBranding = () => (
    <View>
      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Visual Identity</Text>
        
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>App Name</Text>
          <TextInput 
            style={styles.input} 
            value={settings.branding.app_name}
            onChangeText={v => updateField('branding', 'app_name', v)}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Description</Text>
          <TextInput 
            style={[styles.input, styles.textArea]} 
            multiline 
            value={settings.branding.description}
            onChangeText={v => updateField('branding', 'description', v)}
          />
        </View>

        <View style={styles.row}>
           <View style={styles.col}>
              <Text style={styles.label}>App Logo</Text>
              <TouchableOpacity onPress={() => pickImage('logo')} style={styles.uploadBox}>
                 {settings.branding.logo_url ? (
                   <Image source={{ uri: 'http://localhost:5000' + settings.branding.logo_url }} style={styles.previewImage} />
                 ) : (
                   <Ionicons name="cloud-upload-outline" size={32} color={tokens.colors.textSecondary} />
                 )}
              </TouchableOpacity>
           </View>
           <View style={styles.col}>
              <Text style={styles.label}>Favicon</Text>
              <TouchableOpacity onPress={() => pickImage('favicon')} style={styles.uploadBox}>
                 {settings.branding.favicon_url ? (
                   <Image source={{ uri: 'http://localhost:5000' + settings.branding.favicon_url }} style={styles.previewImage} />
                 ) : (
                   <Ionicons name="cloud-upload-outline" size={32} color={tokens.colors.textSecondary} />
                 )}
              </TouchableOpacity>
           </View>
        </View>

        <View style={styles.fieldGroup}>
           <Text style={styles.label}>Primary Color (Hex)</Text>
           <View style={styles.colorRow}>
              <View style={[styles.colorPreview, { backgroundColor: settings.branding.app_color }]} />
              <TextInput 
                style={[styles.input, { flex: 1 }]} 
                value={settings.branding.app_color}
                onChangeText={v => updateField('branding', 'app_color', v)}
              />
           </View>
        </View>
      </Card>
    </View>
  );

  const renderOperations = () => (
    <View>
      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Pickup Time Frame (Global)</Text>
        <Text style={styles.sectionDesc}>Set the global pickup day and time blocks for all apps.</Text>
        
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Pickup Day 1</Text>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={(settings.operations.pickup_time_frame?.days && settings.operations.pickup_time_frame.days[0]) || settings.operations.pickup_time_frame?.day || 'Monday'}
              onValueChange={(itemValue) => setPickupDay(0, itemValue)}
              style={styles.picker}
            >
              {weekdays.map(day => (
                <Picker.Item key={day} label={day} value={day} />
              ))}
            </Picker>
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Pickup Day 2</Text>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={(settings.operations.pickup_time_frame?.days && settings.operations.pickup_time_frame.days[1]) || ''}
              onValueChange={(itemValue) => setPickupDay(1, itemValue)}
              style={styles.picker}
            >
              <Picker.Item label="Select day" value="" />
              {weekdays.filter(day => day !== ((settings.operations.pickup_time_frame?.days && settings.operations.pickup_time_frame.days[0]) || settings.operations.pickup_time_frame?.day)).map(day => (
                <Picker.Item key={day} label={day} value={day} />
              ))}
            </Picker>
          </View>
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Pickup Day 3</Text>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={(settings.operations.pickup_time_frame?.days && settings.operations.pickup_time_frame.days[2]) || ''}
              onValueChange={(itemValue) => setPickupDay(2, itemValue)}
              style={styles.picker}
            >
              <Picker.Item label="Select day" value="" />
              {weekdays.filter(day => {
                const dayOne = (settings.operations.pickup_time_frame?.days && settings.operations.pickup_time_frame.days[0]) || settings.operations.pickup_time_frame?.day;
                const dayTwo = settings.operations.pickup_time_frame?.days && settings.operations.pickup_time_frame.days[1];
                return day !== dayOne && day !== dayTwo;
              }).map(day => (
                <Picker.Item key={day} label={day} value={day} />
              ))}
            </Picker>
          </View>
        </View>
        {pickupDayError ? <Text style={styles.errorText}>{pickupDayError}</Text> : null}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Laundry Processing Timeline</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            multiline
            placeholder="e.g., Laundry is ready within 24–48 hours after pickup."
            value={settings.operations.processing_timeline_text || ''}
            onChangeText={v => updateField('operations', 'processing_timeline_text', v)}
          />
          <Text style={styles.hint}>Shown to users during booking.</Text>
        </View>

        {['morning', 'afternoon', 'evening'].map(block => {
            const blockData = settings.operations.pickup_time_frame?.blocks?.[block] || { start: '00:00', end: '00:00' };
            
            // Generate time options (30 min intervals)
            const timeOptions = [];
            for (let i = 0; i < 24; i++) {
                for (let j = 0; j < 60; j += 30) {
                    const h = i.toString().padStart(2, '0');
                    const m = j.toString().padStart(2, '0');
                    timeOptions.push(`${h}:${m}`);
                }
            }

            return (
              <View key={block} style={styles.blockRow}>
                <Text style={styles.blockLabel}>{block.charAt(0).toUpperCase() + block.slice(1)}</Text>
                <View style={styles.timeInputs}>
                  <View style={[styles.pickerContainer, { flex: 1 }]}>
                    <Picker
                        selectedValue={blockData.start}
                        onValueChange={(v) => {
                            const newBlocks = { ...settings.operations.pickup_time_frame.blocks };
                            newBlocks[block] = { ...newBlocks[block], start: v };
                            updateNestedField('operations', 'pickup_time_frame', 'blocks', newBlocks);
                        }}
                        style={styles.picker}
                    >
                        {timeOptions.map(t => <Picker.Item key={`start-${t}`} label={t} value={t} />)}
                    </Picker>
                  </View>
                  <Text style={styles.toText}>to</Text>
                  <View style={[styles.pickerContainer, { flex: 1 }]}>
                    <Picker
                        selectedValue={blockData.end}
                        onValueChange={(v) => {
                            const newBlocks = { ...settings.operations.pickup_time_frame.blocks };
                            newBlocks[block] = { ...newBlocks[block], end: v };
                            updateNestedField('operations', 'pickup_time_frame', 'blocks', newBlocks);
                        }}
                        style={styles.picker}
                    >
                        {timeOptions.map(t => <Picker.Item key={`end-${t}`} label={t} value={t} />)}
                    </Picker>
                  </View>
                </View>
              </View>
            );
        })}

        <Button 
            title="Save Pickup Time Frame" 
            onPress={handleSave} 
            style={{ marginTop: 16 }}
        />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Pricing & Fees</Text>
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Extra Item Price (₦)</Text>
          <TextInput 
            style={styles.input} 
            keyboardType="numeric"
            value={String(settings.operations.extra_item_price)}
            onChangeText={v => updateField('operations', 'extra_item_price', parsePositiveNumber(v, settings.operations.extra_item_price))}
          />
        </View>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Emergency Laundry</Text>
        <View style={styles.toggleRow}>
          <Text style={styles.label}>Enable Emergency Laundry</Text>
          <Switch
            value={!!settings.emergency?.enabled}
            onValueChange={(v) => updateField('emergency', 'enabled', v)}
          />
        </View>
        <View style={styles.toggleRow}>
          <Text style={styles.label}>Available Now</Text>
          <Switch
            value={settings.emergency?.available !== false}
            onValueChange={(v) => updateField('emergency', 'available', v)}
          />
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Pricing Mode</Text>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={settings.emergency?.pricing_mode || 'per_item'}
              onValueChange={(v) => updateField('emergency', 'pricing_mode', v)}
              style={styles.picker}
            >
              <Picker.Item label="Per Item" value="per_item" />
              <Picker.Item label="Flat Fee" value="flat" />
              <Picker.Item label="Base + Per Item" value="hybrid" />
            </Picker>
          </View>
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Price Per Item (₦)</Text>
          <TextInput 
            style={styles.input} 
            keyboardType="numeric"
            value={String(settings.emergency?.price_per_item ?? 0)}
            onChangeText={v => updateField('emergency', 'price_per_item', parsePositiveNumber(v, settings.emergency?.price_per_item ?? 0))}
          />
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Base Fee (₦)</Text>
          <TextInput 
            style={styles.input} 
            keyboardType="numeric"
            value={String(settings.emergency?.base_fee ?? 0)}
            onChangeText={v => updateField('emergency', 'base_fee', parsePositiveNumber(v, settings.emergency?.base_fee ?? 0))}
          />
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Delivery Window Text</Text>
          <TextInput 
            style={styles.input} 
            value={settings.emergency?.delivery_window_text || ''}
            onChangeText={v => updateField('emergency', 'delivery_window_text', v)}
          />
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Description</Text>
          <TextInput 
            style={[styles.input, styles.textArea]} 
            multiline
            value={settings.emergency?.description || ''}
            onChangeText={v => updateField('emergency', 'description', v)}
          />
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Estimated Completion Text</Text>
          <TextInput 
            style={styles.input} 
            value={settings.emergency?.estimated_completion_text || ''}
            onChangeText={v => updateField('emergency', 'estimated_completion_text', v)}
          />
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Estimated Completion Minutes</Text>
          <TextInput 
            style={styles.input} 
            keyboardType="numeric"
            value={String(settings.emergency?.estimated_completion_minutes ?? 0)}
            onChangeText={v => updateField('emergency', 'estimated_completion_minutes', parsePositiveNumber(v, settings.emergency?.estimated_completion_minutes ?? 0))}
          />
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Special Instructions</Text>
          <TextInput 
            style={[styles.input, styles.textArea]} 
            multiline
            value={settings.emergency?.instructions || ''}
            onChangeText={v => updateField('emergency', 'instructions', v)}
          />
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Restrictions</Text>
          <TextInput 
            style={[styles.input, styles.textArea]} 
            multiline
            value={settings.emergency?.restrictions || ''}
            onChangeText={v => updateField('emergency', 'restrictions', v)}
          />
        </View>
        <Button
          title={syncingEmergency ? 'Syncing...' : 'Sync Emergency Settings'}
          onPress={handleEmergencySync}
          disabled={syncingEmergency}
          loading={syncingEmergency}
          style={{ marginTop: 12 }}
        />
        {emergencySyncNotice ? (
          <Text style={[styles.syncNotice, emergencySyncNotice.type === 'error' && styles.syncNoticeError]}>
            {emergencySyncNotice.message}
          </Text>
        ) : null}
      </Card>

      <Card style={styles.card}>
        <View style={styles.cardHeader}>
           <Text style={styles.cardTitle}>Pickup Windows</Text>
           <TouchableOpacity onPress={() => {
              const wins = [...settings.operations.pickup_windows, { day: 'Mon', start: '09:00', end: '11:00' }];
              updateField('operations', 'pickup_windows', wins);
           }}>
             <Ionicons name="add-circle" size={24} color={tokens.colors.primary} />
           </TouchableOpacity>
        </View>
        
        {settings.operations.pickup_windows.map((win, idx) => (
          <View key={idx} style={styles.windowRow}>
             <TextInput 
               style={[styles.input, { width: 60, marginRight: 8 }]} 
               value={win.day} 
               onChangeText={v => {
                 const wins = [...settings.operations.pickup_windows];
                 wins[idx].day = v;
                 updateField('operations', 'pickup_windows', wins);
               }}
             />
             <TextInput 
               style={[styles.input, { width: 80, marginRight: 8 }]} 
               value={win.start} 
               onChangeText={v => {
                 const wins = [...settings.operations.pickup_windows];
                 wins[idx].start = v;
                 updateField('operations', 'pickup_windows', wins);
               }}
             />
             <Text style={{ marginRight: 8 }}>to</Text>
             <TextInput 
               style={[styles.input, { width: 80, marginRight: 8 }]} 
               value={win.end} 
               onChangeText={v => {
                 const wins = [...settings.operations.pickup_windows];
                 wins[idx].end = v;
                 updateField('operations', 'pickup_windows', wins);
               }}
             />
             <TouchableOpacity onPress={() => {
                const wins = settings.operations.pickup_windows.filter((_, i) => i !== idx);
                updateField('operations', 'pickup_windows', wins);
             }}>
               <Ionicons name="trash-outline" size={20} color={tokens.colors.error} />
             </TouchableOpacity>
          </View>
        ))}
      </Card>
    </View>
  );

  const renderRules = () => (
    <View>
       <Card style={styles.card}>
         <Text style={styles.cardTitle}>System Rules</Text>
         <View style={styles.fieldGroup}>
            <Text style={styles.label}>Code Expiry Duration (Hours)</Text>
            <TextInput 
              style={styles.input} 
              keyboardType="numeric"
              value={String(settings.rules.code_expiry_hours)}
              onChangeText={v => updateField('rules', 'code_expiry_hours', Number(v))}
            />
            <Text style={styles.hint}>Default: 168 hours (7 days)</Text>
         </View>
       </Card>

       <Card style={styles.card}>
          <View style={styles.cardHeader}>
             <Text style={styles.cardTitle}>School Rules</Text>
             <TouchableOpacity onPress={() => {
                const rules = { ...settings.rules.school_rules, 'New School': { enabled: true } };
                updateField('rules', 'school_rules', rules);
             }}>
               <Ionicons name="add-circle" size={24} color={tokens.colors.primary} />
             </TouchableOpacity>
          </View>
          {Object.entries(settings.rules.school_rules || {}).map(([school, rule], idx) => (
             <View key={idx} style={styles.windowRow}>
                <TextInput 
                   style={[styles.input, { flex: 1, marginRight: 8 }]} 
                   value={school}
                   onChangeText={(newName) => {
                      const newRules = { ...settings.rules.school_rules };
                      const val = newRules[school];
                      delete newRules[school];
                      newRules[newName] = val;
                      updateField('rules', 'school_rules', newRules);
                   }}
                />
                <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 8 }}>
                   <Text style={{ marginRight: 4 }}>Active</Text>
                   <Switch 
                     value={rule.enabled} 
                     onValueChange={(v) => {
                        const newRules = { ...settings.rules.school_rules };
                        newRules[school] = { ...rule, enabled: v };
                        updateField('rules', 'school_rules', newRules);
                     }}
                   />
                </View>
                <TouchableOpacity onPress={() => {
                   const newRules = { ...settings.rules.school_rules };
                   delete newRules[school];
                   updateField('rules', 'school_rules', newRules);
                }}>
                  <Ionicons name="trash-outline" size={20} color={tokens.colors.error} />
                </TouchableOpacity>
             </View>
          ))}
          {Object.keys(settings.rules.school_rules || {}).length === 0 && (
            <Text style={{ color: tokens.colors.textSecondary, fontStyle: 'italic' }}>No school-specific rules defined.</Text>
          )}
       </Card>
    </View>
  );

  const renderRegistrationSetup = () => (
    <View>
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Registration Fields</Text>
          <TouchableOpacity onPress={addRegistrationField} disabled={registrationSaving}>
            <Ionicons name="add-circle" size={24} color={tokens.colors.primary} />
          </TouchableOpacity>
        </View>
        <Text style={styles.sectionDesc}>Add and arrange fields for the user registration form.</Text>
        {registrationLoading ? (
          <ActivityIndicator size="small" color={tokens.colors.primary} />
        ) : (
          registrationFields.map((field, index) => (
            <View key={field.field_id || index} style={styles.subCard}>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Field Label</Text>
                <TextInput
                  style={styles.input}
                  value={field.label || ''}
                  onChangeText={(v) => updateRegistrationField(index, 'label', v)}
                />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Field Type</Text>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={field.type || 'text'}
                    onValueChange={(v) => updateRegistrationField(index, 'type', v)}
                    style={styles.picker}
                  >
                    {registrationFieldTypes.map((type) => (
                      <Picker.Item key={type.value} label={type.label} value={type.value} />
                    ))}
                  </Picker>
                </View>
              </View>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Display Order</Text>
                <TextInput
                  style={styles.input}
                  value={String(field.order ?? '')}
                  onChangeText={(v) => updateRegistrationField(index, 'order', v)}
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.toggleRow}>
                <Text style={styles.label}>Required</Text>
                <Switch
                  value={!!field.required}
                  onValueChange={(v) => updateRegistrationField(index, 'required', v)}
                />
              </View>
              <View style={styles.toggleRow}>
                <Text style={styles.label}>Active</Text>
                <Switch
                  value={field.active === undefined ? true : !!field.active}
                  onValueChange={(v) => updateRegistrationField(index, 'active', v)}
                />
              </View>
              <View style={styles.actionRow}>
                <Button
                  title={registrationSaving ? 'Saving...' : 'Save Field'}
                  onPress={() => saveRegistrationField(field, index)}
                  disabled={registrationSaving}
                  style={styles.actionButton}
                />
                <Button
                  title="Remove"
                  onPress={() => removeRegistrationField(field, index)}
                  disabled={registrationSaving}
                  style={styles.secondaryButton}
                />
              </View>
            </View>
          ))
        )}
        {!registrationLoading && registrationFields.length === 0 && (
          <Text style={styles.hint}>No registration fields yet. Tap + to add one.</Text>
        )}
      </Card>

      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Schools</Text>
          <TouchableOpacity onPress={addSchool} disabled={registrationSaving}>
            <Ionicons name="add-circle" size={24} color={tokens.colors.primary} />
          </TouchableOpacity>
        </View>
        <Text style={styles.sectionDesc}>Manage the school list available to users.</Text>
        {registrationLoading ? (
          <ActivityIndicator size="small" color={tokens.colors.primary} />
        ) : (
          schools.map((school, index) => (
            <View key={school.school_id || index} style={styles.subCard}>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>School Name</Text>
                <TextInput
                  style={styles.input}
                  value={school.school_name || ''}
                  onChangeText={(v) => updateSchool(index, 'school_name', v)}
                />
              </View>
              <View style={styles.toggleRow}>
                <Text style={styles.label}>Active</Text>
                <Switch
                  value={school.active === undefined ? true : !!school.active}
                  onValueChange={(v) => updateSchool(index, 'active', v)}
                />
              </View>
              <View style={styles.actionRow}>
                <Button
                  title={registrationSaving ? 'Saving...' : 'Save School'}
                  onPress={() => saveSchool(school, index)}
                  disabled={registrationSaving}
                  style={styles.actionButton}
                />
                <Button
                  title="Remove"
                  onPress={() => removeSchool(school, index)}
                  disabled={registrationSaving}
                  style={styles.secondaryButton}
                />
              </View>
            </View>
          ))
        )}
        {!registrationLoading && schools.length === 0 && (
          <Text style={styles.hint}>No schools yet. Tap + to add one.</Text>
        )}
      </Card>
    </View>
  );

  const renderBankAccounts = () => {
    const accounts = Array.isArray(settings.payments?.bank_accounts) ? settings.payments.bank_accounts : [];
    return (
      <View>
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Bank Account Management</Text>
            <Button title="Add Account" onPress={addBankAccount} />
          </View>
          {accounts.length === 0 && (
            <Text style={styles.sectionDesc}>No bank accounts added yet.</Text>
          )}
          {accounts.map((account, index) => (
            <View key={account.id || `${account.account_number || 'account'}-${index}`} style={{ marginBottom: 16 }}>
              <View style={styles.row}>
                <Text style={styles.label}>Account {index + 1}</Text>
                <TouchableOpacity onPress={() => removeBankAccount(index)}>
                  <Text style={{ color: tokens.colors.error }}>Remove</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Bank Name</Text>
                <TextInput
                  style={styles.input}
                  value={account.bank_name || ''}
                  onChangeText={(v) => updateBankAccount(index, 'bank_name', v)}
                />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Account Name</Text>
                <TextInput
                  style={styles.input}
                  value={account.account_name || ''}
                  onChangeText={(v) => updateBankAccount(index, 'account_name', v)}
                />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Account Number</Text>
                <TextInput
                  style={styles.input}
                  value={account.account_number || ''}
                  onChangeText={(v) => updateBankAccount(index, 'account_number', v)}
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Routing Number</Text>
                <TextInput
                  style={styles.input}
                  value={account.routing_number || ''}
                  onChangeText={(v) => updateBankAccount(index, 'routing_number', v)}
                  keyboardType="numeric"
                />
              </View>
              <View style={[styles.row, { alignItems: 'center' }]}>
                <Text style={styles.label}>Active</Text>
                <Switch
                  value={!!account.active}
                  onValueChange={(val) => setActiveBankAccount(index, val)}
                />
              </View>
            </View>
          ))}
        </Card>
      </View>
    );
  };

  const renderNotifications = () => (
    <View>
       <Card style={styles.card}>
         <Text style={styles.cardTitle}>Notification Templates</Text>
         <View style={styles.fieldGroup}>
            <View style={[styles.row, { alignItems: 'center' }]}>
              <Text style={styles.label}>Order Ready Message</Text>
              <TouchableOpacity onPress={() => showTemplatePreview('Order Ready Preview', settings.notifications?.templates?.order_ready || '', 'order_ready')}>
                <Text style={styles.previewLink}>Preview</Text>
              </TouchableOpacity>
            </View>
            <TextInput 
              style={[styles.input, styles.textArea]} 
              multiline
              value={settings.notifications?.templates?.order_ready || ''}
              onChangeText={v => updateNestedField('notifications', 'templates', 'order_ready', v)}
            />
            <Text style={styles.hint}>Use {'{{code}}'} for dynamic code insertion.</Text>
         </View>
         <View style={styles.fieldGroup}>
            <View style={[styles.row, { alignItems: 'center' }]}>
              <Text style={styles.label}>Order Delivered Message</Text>
              <TouchableOpacity onPress={() => showTemplatePreview('Order Delivered Preview', settings.notifications?.templates?.order_delivered || '', 'order_status')}>
                <Text style={styles.previewLink}>Preview</Text>
              </TouchableOpacity>
            </View>
            <TextInput 
              style={[styles.input, styles.textArea]} 
              multiline
              value={settings.notifications?.templates?.order_delivered || ''}
              onChangeText={v => updateNestedField('notifications', 'templates', 'order_delivered', v)}
            />
         </View>
       </Card>
       <Card style={styles.card}>
         <View style={styles.toggleRow}>
           <Text style={styles.cardTitle}>Email Notifications</Text>
           <Switch
             value={!!settings.notifications?.email?.enabled}
             onValueChange={(v) => updateEmailRoot('enabled', v)}
           />
         </View>
        <Text style={styles.sectionDesc}>{'Variables: {{app_name}}, {{user_name}}, {{login_time}}, {{ip_address}}, {{user_agent}}, {{payment_event}}, {{plan_name}}, {{amount}}, {{status}}, {{reference}}, {{event_time}}, {{order_id}}, {{status_explanation}}, {{next_step}}'}</Text>
         <View style={styles.subCard}>
           <View style={styles.toggleRow}>
             <Text style={styles.label}>Login Email</Text>
             <Switch
               value={!!settings.notifications?.email?.login?.enabled}
               onValueChange={(v) => updateEmailSection('login', 'enabled', v)}
             />
           </View>
           <View style={styles.fieldGroup}>
             <Text style={styles.label}>Subject</Text>
             <TextInput
               style={styles.input}
               value={settings.notifications?.email?.login?.subject || ''}
               onChangeText={(v) => updateEmailSection('login', 'subject', v)}
             />
           </View>
           <View style={styles.fieldGroup}>
             <Text style={styles.label}>Text Body</Text>
             <TextInput
               style={[styles.input, styles.textArea]}
               multiline
               value={settings.notifications?.email?.login?.text || ''}
               onChangeText={(v) => updateEmailSection('login', 'text', v)}
             />
           </View>
           <View style={styles.fieldGroup}>
             <Text style={styles.label}>HTML Body</Text>
             <TextInput
               style={[styles.input, styles.textArea]}
               multiline
               value={settings.notifications?.email?.login?.html || ''}
               onChangeText={(v) => updateEmailSection('login', 'html', v)}
             />
           </View>
           <TouchableOpacity onPress={() => showEmailPreview('Login Email', settings.notifications?.email?.login, 'login')}>
             <Text style={styles.previewLink}>Preview Login Email</Text>
           </TouchableOpacity>
         </View>
         <View style={styles.subCard}>
           <View style={styles.toggleRow}>
             <Text style={styles.label}>Payment Email</Text>
             <Switch
               value={!!settings.notifications?.email?.payment?.enabled}
               onValueChange={(v) => updateEmailSection('payment', 'enabled', v)}
             />
           </View>
           <View style={styles.fieldGroup}>
             <Text style={styles.label}>Subject</Text>
             <TextInput
               style={styles.input}
               value={settings.notifications?.email?.payment?.subject || ''}
               onChangeText={(v) => updateEmailSection('payment', 'subject', v)}
             />
           </View>
           <View style={styles.fieldGroup}>
             <Text style={styles.label}>Text Body</Text>
             <TextInput
               style={[styles.input, styles.textArea]}
               multiline
               value={settings.notifications?.email?.payment?.text || ''}
               onChangeText={(v) => updateEmailSection('payment', 'text', v)}
             />
           </View>
           <View style={styles.fieldGroup}>
             <Text style={styles.label}>HTML Body</Text>
             <TextInput
               style={[styles.input, styles.textArea]}
               multiline
               value={settings.notifications?.email?.payment?.html || ''}
               onChangeText={(v) => updateEmailSection('payment', 'html', v)}
             />
           </View>
           <TouchableOpacity onPress={() => showEmailPreview('Payment Email', settings.notifications?.email?.payment, 'payment')}>
             <Text style={styles.previewLink}>Preview Payment Email</Text>
           </TouchableOpacity>
         </View>
         <View style={styles.subCard}>
           <View style={styles.toggleRow}>
             <Text style={styles.label}>Order Status Email</Text>
             <Switch
               value={!!settings.notifications?.email?.order_status?.enabled}
               onValueChange={(v) => updateEmailSection('order_status', 'enabled', v)}
             />
           </View>
           <View style={styles.fieldGroup}>
             <Text style={styles.label}>Subject</Text>
             <TextInput
               style={styles.input}
               value={settings.notifications?.email?.order_status?.subject || ''}
               onChangeText={(v) => updateEmailSection('order_status', 'subject', v)}
             />
           </View>
           <View style={styles.fieldGroup}>
             <Text style={styles.label}>Text Body</Text>
             <TextInput
               style={[styles.input, styles.textArea]}
               multiline
               value={settings.notifications?.email?.order_status?.text || ''}
               onChangeText={(v) => updateEmailSection('order_status', 'text', v)}
             />
           </View>
           <View style={styles.fieldGroup}>
             <Text style={styles.label}>HTML Body</Text>
             <TextInput
               style={[styles.input, styles.textArea]}
               multiline
               value={settings.notifications?.email?.order_status?.html || ''}
               onChangeText={(v) => updateEmailSection('order_status', 'html', v)}
             />
           </View>
           <TouchableOpacity onPress={() => showEmailPreview('Order Status Email', settings.notifications?.email?.order_status, 'order_status')}>
             <Text style={styles.previewLink}>Preview Order Status Email</Text>
           </TouchableOpacity>
         </View>
       </Card>
    </View>
  );

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={tokens.colors.primary} /></View>;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
         <Text style={styles.title}>Global Settings</Text>
         <Text style={styles.subtitle}>Manage system-wide configurations and branding.</Text>
      </View>

      <View style={styles.tabBar}>
         {['Branding', 'Operations', 'Rules', 'Registration Setup', 'Bank Accounts', 'Notifications'].map(tab => (
           <TouchableOpacity 
             key={tab} 
             style={[styles.tab, activeTab === tab.toLowerCase() && styles.activeTab]}
             onPress={() => setActiveTab(tab.toLowerCase())}
           >
             <Text style={[styles.tabText, activeTab === tab.toLowerCase() && styles.activeTabText]}>{tab}</Text>
           </TouchableOpacity>
         ))}
      </View>

      <ScrollView style={styles.content}>
         {activeTab === 'branding' && renderBranding()}
         {activeTab === 'operations' && renderOperations()}
         {activeTab === 'rules' && renderRules()}
         {activeTab === 'registration setup' && renderRegistrationSetup()}
         {activeTab === 'bank accounts' && renderBankAccounts()}
         {activeTab === 'notifications' && renderNotifications()}
         <View style={{ height: 100 }} /> 
      </ScrollView>

      <View style={styles.fabContainer}>
         <Button title={saving ? "Saving..." : "Save Changes"} onPress={handleSave} disabled={saving} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { padding: 16, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#e0e0e0' },
  title: { fontSize: 24, fontWeight: 'bold', color: tokens.colors.text },
  subtitle: { fontSize: 14, color: tokens.colors.textSecondary, marginTop: 4 },
  tabBar: { flexDirection: 'row', backgroundColor: 'white', paddingHorizontal: 16 },
  tab: { marginRight: 24, paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  activeTab: { borderBottomColor: tokens.colors.primary },
  tabText: { fontSize: 16, color: tokens.colors.textSecondary, fontWeight: '500' },
  activeTabText: { color: tokens.colors.primary },
  content: { flex: 1, padding: 16 },
  card: { padding: 16, marginBottom: 16 },
  cardTitle: { fontSize: 18, fontWeight: '600', marginBottom: 16, color: tokens.colors.text },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  fieldGroup: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '500', color: tokens.colors.text, marginBottom: 8 },
  input: { backgroundColor: '#f9f9f9', borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, padding: 10, fontSize: 14 },
  textArea: { height: 80, textAlignVertical: 'top' },
  hint: { fontSize: 12, color: tokens.colors.textSecondary, marginTop: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  previewLink: { color: tokens.colors.primary, fontWeight: '600' },
  col: { flex: 1, marginRight: 16 },
  uploadBox: { height: 100, backgroundColor: '#f9f9f9', borderWidth: 1, borderColor: '#e0e0e0', borderStyle: 'dashed', borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  previewImage: { width: '100%', height: '100%', resizeMode: 'contain' },
  colorRow: { flexDirection: 'row', alignItems: 'center' },
  colorPreview: { width: 40, height: 40, borderRadius: 8, marginRight: 12, borderWidth: 1, borderColor: '#e0e0e0' },
  windowRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  fabContainer: { position: 'absolute', bottom: 20, right: 20, left: 20 },
  sectionDesc: { fontSize: 14, color: tokens.colors.textSecondary, marginBottom: 16 },
  pickerContainer: { borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, backgroundColor: '#f9f9f9' },
  picker: { height: 50, width: '100%' },
  blockRow: { marginBottom: 16 },
  blockLabel: { fontSize: 16, fontWeight: '500', marginBottom: 8, color: tokens.colors.text },
  timeInputs: { flexDirection: 'row', alignItems: 'center' },
  timeInput: { flex: 1, backgroundColor: '#f9f9f9', borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, padding: 10, fontSize: 14, textAlign: 'center' },
  toText: { marginHorizontal: 10, color: tokens.colors.textSecondary },
  errorText: { color: tokens.colors.error, fontSize: 12, marginTop: -8, marginBottom: 12 },
  syncNotice: { marginTop: 8, fontSize: 12, color: tokens.colors.textSecondary },
  syncNoticeError: { color: tokens.colors.error },
  subCard: { borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 12, padding: 12, marginBottom: 12, backgroundColor: '#fff' },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  actionRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  actionButton: { flex: 1 },
  secondaryButton: { flex: 1, backgroundColor: '#e5e7eb' }
});
