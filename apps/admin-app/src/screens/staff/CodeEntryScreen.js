import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, TouchableOpacity } from 'react-native';
import { staff } from '../../services/api';
import Button from '../../components/ui/Button';
import { getTokens } from '../../theme/tokens';
import { Ionicons } from '@expo/vector-icons';

const tokens = getTokens();

export default function CodeEntryScreen({ navigation }) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // { success: true, order: ..., type: ... }

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
      Alert.alert('Success', 
        response.data.type === 'pickup' 
          ? `Order #${response.data.order.order_id} Picked Up!` 
          : `Order #${response.data.order.order_id} Delivered!`
      );
    } catch (error) {
      console.error('Code verification failed:', error);
      Alert.alert('Error', error.response?.data?.error || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.content}>
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
            autoFocus
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
            <Button 
                title="View Order" 
                variant="outline" 
                size="sm" 
                style={{ marginTop: 10 }}
                onPress={() => navigation.navigate('Orders', { status: 'all' })} 
            />
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.colors.background,
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    maxWidth: 500,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
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
    marginTop: 32,
    padding: 20,
    backgroundColor: tokens.colors.surface,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
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
});
