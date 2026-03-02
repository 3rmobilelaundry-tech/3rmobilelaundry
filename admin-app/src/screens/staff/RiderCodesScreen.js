import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, Alert, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { staff } from '../../services/api';
import Button from '../../components/ui/Button';
import { getTokens } from '../../theme/tokens';
import { Ionicons } from '@expo/vector-icons';
import { useSync } from '../../context/SyncContext';

const tokens = getTokens();

export default function RiderCodesScreen({ navigation }) {
  const { lastEvent } = useSync();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeCodes, setActiveCodes] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [result, setResult] = useState(null); // { success: true, order: ..., type: ... }

  const fetchActiveCodes = async () => {
    try {
      const response = await staff.listCodes({ status: 'active' });
      // Filter strictly for active codes just in case
      const codes = response.data.filter(c => c.status === 'active');
      setActiveCodes(codes);
    } catch (error) {
      console.error('Error fetching codes:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchActiveCodes();
    setRefreshing(false);
  };

  useEffect(() => {
    fetchActiveCodes();
  }, []);

  // Real-time Sync
  useEffect(() => {
    if (lastEvent && (lastEvent.type.includes('code') || lastEvent.type === 'order_updated' || lastEvent.type === 'pickup_event')) {
        console.log('RiderCodesScreen: Sync event received', lastEvent.type);
        fetchActiveCodes();
    }
  }, [lastEvent]);

  const handleVerify = async () => {
    if (!code.trim()) {
      Alert.alert('Error', 'Please enter a code');
      return;
    }

    setLoading(true);
    setResult(null);
    try {
      const response = await staff.verifyCode({ code_value: code.trim() });
      setResult(response.data);
      setCode(''); // Clear input on success
      fetchActiveCodes(); // Refresh list immediately
    } catch (error) {
      console.error('Code verification failed:', error);
      Alert.alert('Error', error.response?.data?.error || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const onCodePress = (selectedCode) => {
      setCode(selectedCode);
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.header}>
          <Ionicons name="scan-circle-outline" size={80} color={tokens.colors.primary} />
          <Text style={styles.title}>Process Code</Text>
          <Text style={styles.subtitle}>Enter Pickup or Delivery Code</Text>
        </View>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Enter 6-digit code"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            maxLength={6}
          />
          
          <Button 
            title={loading ? "Verifying..." : "Verify Code"} 
            onPress={handleVerify}
            disabled={loading || code.length < 6}
            style={styles.button}
            variant="primary"
          />
        </View>

        {result && (
          <View style={[styles.resultCard, { borderColor: result.type === 'pickup' ? tokens.colors.primary : tokens.colors.success }]}>
            <View style={styles.resultHeader}>
                <Ionicons 
                    name={result.type === 'pickup' ? "cube" : "checkmark-done-circle"} 
                    size={32} 
                    color={result.type === 'pickup' ? tokens.colors.primary : tokens.colors.success} 
                />
                <Text style={styles.resultTitle}>
                    {result.type === 'pickup' ? 'PICKUP SUCCESS' : 'DELIVERY SUCCESS'}
                </Text>
            </View>
            <Text style={styles.resultText}>Order #{result.order.order_id}</Text>
            <Text style={styles.resultText}>Status: {result.order.status.replace('_', ' ').toUpperCase()}</Text>
          </View>
        )}

        {/* Active Codes Section - Styled to match theme */}
        <View style={styles.listSection}>
          <Text style={styles.sectionTitle}>Active Codes ({activeCodes.length})</Text>
          <View style={styles.codeList}>
              {activeCodes.length === 0 ? (
                  <Text style={styles.emptyText}>No active codes found.</Text>
              ) : (
                  activeCodes.map((item) => (
                      <TouchableOpacity key={item.code_id} onPress={() => onCodePress(item.code_value)}>
                          <View style={styles.codeRow}>
                              <View style={styles.codeIcon}>
                                  <Ionicons 
                                    name={item.type === 'pickup' ? "cube-outline" : "bicycle-outline"} 
                                    size={20} 
                                    color={item.type === 'pickup' ? tokens.colors.primary : tokens.colors.success} 
                                  />
                              </View>
                              <View style={styles.codeInfo}>
                                  <Text style={styles.codeValue}>{item.code_value}</Text>
                                  <Text style={styles.codeType}>
                                      {item.type === 'pickup' ? 'PICKUP' : 'DELIVERY'} • Order #{item.order_id}
                                  </Text>
                              </View>
                              <Ionicons name="chevron-forward" size={20} color={tokens.colors.textSecondary} />
                          </View>
                      </TouchableOpacity>
                  ))
              )}
          </View>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.colors.background,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 40,
    maxWidth: 600,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
    marginTop: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: tokens.colors.text,
    marginTop: 16,
  },
  subtitle: {
    fontSize: 16,
    color: tokens.colors.textSecondary,
    marginTop: 8,
  },
  form: {
    width: '100%',
    marginBottom: 32,
  },
  input: {
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderRadius: 12,
    padding: 16,
    fontSize: 24,
    textAlign: 'center',
    marginBottom: 24,
    letterSpacing: 8,
    fontWeight: 'bold',
  },
  button: {
    height: 56,
  },
  resultCard: {
    padding: 20,
    backgroundColor: tokens.colors.surface,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    marginBottom: 32,
  },
  resultHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 10,
      gap: 10
  },
  resultTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      color: tokens.colors.text
  },
  resultText: {
    fontSize: 16,
    color: tokens.colors.text,
    marginBottom: 4,
  },
  listSection: {
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: tokens.colors.text,
    marginBottom: 16,
  },
  codeList: {
    backgroundColor: tokens.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    overflow: 'hidden',
  },
  codeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: tokens.colors.border,
  },
  codeIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: tokens.colors.background,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
  },
  codeInfo: {
      flex: 1,
  },
  codeValue: {
      fontSize: 16,
      fontWeight: '600',
      color: tokens.colors.text,
  },
  codeType: {
      fontSize: 12,
      color: tokens.colors.textSecondary,
      marginTop: 2,
  },
  emptyText: {
      textAlign: 'center',
      color: tokens.colors.textSecondary,
      padding: 24,
      fontStyle: 'italic',
  }
});
