import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, Alert, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { staff } from '../../services/api';
import { getTokens } from '../../theme/tokens';

const tokens = getTokens();

const IntegrationSection = ({ 
  title, 
  icon, 
  iconColor, 
  enabled, 
  onToggle, 
  children, 
  onTest, 
  testing 
}) => (
  <Card style={styles.sectionCard}>
    <View style={styles.sectionHeader}>
      <View style={styles.headerLeft}>
        <View style={[styles.iconContainer, { backgroundColor: iconColor + '20' }]}>
          <Ionicons name={icon} size={24} color={iconColor} />
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <Switch
        value={enabled}
        onValueChange={onToggle}
        trackColor={{ false: tokens.colors.border, true: tokens.colors.primary }}
        thumbColor={Platform.OS === 'ios' ? '#fff' : (enabled ? tokens.colors.primary : '#f4f3f4')}
      />
    </View>
    
    {enabled && (
      <View style={styles.sectionContent}>
        {children}
        <Button 
          title="Test Connection" 
          variant="outline" 
          size="sm" 
          onPress={onTest} 
          loading={testing}
          style={styles.testButton}
          icon="pulse"
        />
      </View>
    )}
  </Card>
);

export default function IntegrationsScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(null); // 'paystack' | 'whatsapp' | 'email' | null
  
  const [config, setConfig] = useState({
    paystack: { enabled: false, public_key: '', secret_key: '' },
    whatsapp: { enabled: false, api_key: '', phone_number_id: '' },
    email: { enabled: false, smtp_host: '', smtp_port: '587', smtp_user: '', smtp_pass: '' }
  });

  useEffect(() => {
    loadIntegrations();
  }, []);

  const loadIntegrations = async () => {
    try {
      const response = await staff.getIntegrations();
      if (response.data) {
        // Merge with defaults to ensure all fields exist
        setConfig(prev => ({
          paystack: { ...prev.paystack, ...response.data.paystack },
          whatsapp: { ...prev.whatsapp, ...response.data.whatsapp },
          email: { ...prev.email, ...response.data.email }
        }));
      }
    } catch (error) {
      console.error('Failed to load integrations:', error);
      Alert.alert('Error', 'Failed to load integration settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await staff.updateIntegrations(config);
      if (Platform.OS === 'web') {
        window.alert('Integration settings saved successfully');
      } else {
        Alert.alert('Success', 'Integration settings saved successfully');
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
      if (Platform.OS === 'web') {
        window.alert('Failed to save settings');
      } else {
        Alert.alert('Error', 'Failed to save settings');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (type) => {
    setTesting(type);
    try {
      const response = await staff.testIntegration(type, config[type]);
      const msg = response.data.message || 'Connection successful!';
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('Test Result', msg);
      }
    } catch (error) {
      console.error(`Test ${type} failed:`, error);
      const errMsg = error.response?.data?.error || 'Connection failed';
      if (Platform.OS === 'web') {
        window.alert(`Test Failed: ${errMsg}`);
      } else {
        Alert.alert('Test Failed', errMsg);
      }
    } finally {
      setTesting(null);
    }
  };

  const updateConfig = (section, key, value) => {
    setConfig(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: value
      }
    }));
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={tokens.colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Integrations</Text>
        <Button 
          title="Save Changes" 
          onPress={handleSave} 
          loading={saving}
          icon="save-outline"
        />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Paystack Integration */}
        <IntegrationSection
          title="Paystack Payment Gateway"
          icon="card"
          iconColor="#0BA4DB" // Paystack Blue-ish
          enabled={config.paystack.enabled}
          onToggle={(val) => updateConfig('paystack', 'enabled', val)}
          onTest={() => handleTest('paystack')}
          testing={testing === 'paystack'}
        >
          <Input
            label="Public Key"
            value={config.paystack.public_key}
            onChangeText={(text) => updateConfig('paystack', 'public_key', text)}
            placeholder="pk_test_..."
          />
          <Input
            label="Secret Key"
            value={config.paystack.secret_key}
            onChangeText={(text) => updateConfig('paystack', 'secret_key', text)}
            placeholder="sk_test_..."
            secureTextEntry
          />
        </IntegrationSection>

        {/* WhatsApp Integration */}
        <IntegrationSection
          title="WhatsApp Business API"
          icon="logo-whatsapp"
          iconColor="#25D366" // WhatsApp Green
          enabled={config.whatsapp.enabled}
          onToggle={(val) => updateConfig('whatsapp', 'enabled', val)}
          onTest={() => handleTest('whatsapp')}
          testing={testing === 'whatsapp'}
        >
          <Input
            label="API Key / Access Token"
            value={config.whatsapp.api_key}
            onChangeText={(text) => updateConfig('whatsapp', 'api_key', text)}
            placeholder="EAAG..."
            secureTextEntry
          />
          <Input
            label="Phone Number ID"
            value={config.whatsapp.phone_number_id}
            onChangeText={(text) => updateConfig('whatsapp', 'phone_number_id', text)}
            placeholder="100..."
          />
        </IntegrationSection>

        {/* Email Service */}
        <IntegrationSection
          title="Email Service (SMTP)"
          icon="mail"
          iconColor="#EA4335" // Gmail Red-ish
          enabled={config.email.enabled}
          onToggle={(val) => updateConfig('email', 'enabled', val)}
          onTest={() => handleTest('email')}
          testing={testing === 'email'}
        >
          <Input
            label="SMTP Host"
            value={config.email.smtp_host}
            onChangeText={(text) => updateConfig('email', 'smtp_host', text)}
            placeholder="smtp.gmail.com"
          />
          <Input
            label="SMTP Port"
            value={String(config.email.smtp_port)}
            onChangeText={(text) => updateConfig('email', 'smtp_port', text)}
            placeholder="587"
            keyboardType="numeric"
          />
          <Input
            label="Username"
            value={config.email.smtp_user}
            onChangeText={(text) => updateConfig('email', 'smtp_user', text)}
            placeholder="user@example.com"
          />
          <Input
            label="Password"
            value={config.email.smtp_pass}
            onChangeText={(text) => updateConfig('email', 'smtp_pass', text)}
            placeholder="Application Password"
            secureTextEntry
          />
        </IntegrationSection>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: tokens.spacing.lg,
    backgroundColor: tokens.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.border,
  },
  title: {
    fontSize: tokens.typography.sizes.xl,
    fontWeight: tokens.typography.weights.bold,
    color: tokens.colors.text,
  },
  scrollContent: {
    padding: tokens.spacing.lg,
  },
  sectionCard: {
    marginBottom: tokens.spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: tokens.spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    padding: tokens.spacing.sm,
    borderRadius: tokens.radius.full,
    marginRight: tokens.spacing.md,
  },
  sectionTitle: {
    fontSize: tokens.typography.sizes.lg,
    fontWeight: tokens.typography.weights.semibold,
    color: tokens.colors.text,
  },
  sectionContent: {
    marginTop: tokens.spacing.sm,
  },
  testButton: {
    marginTop: tokens.spacing.sm,
    alignSelf: 'flex-start',
  },
});
