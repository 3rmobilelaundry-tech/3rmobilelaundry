import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { staff } from '../services/api';

export default function ScanCodeScreen({ route, navigation }) {
  const { action, orderId, version } = route.params;
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleVerify = async () => {
    if (code.length !== 6) {
      Alert.alert('Error', 'Code must be 6 characters');
      return;
    }

    setLoading(true);
    try {
      const response = await staff.verifyCode({ 
        code_value: code,
        expected_order_id: orderId,
        version: version 
      }); 
      
      const { order } = response.data;
      
      Alert.alert(
        'Success',
        `Code Verified! Order #${order.order_id} updated to ${order.status}.`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (error) {
      if (error.response?.status === 409) {
          Alert.alert('Update Conflict', 'This order has been updated by someone else. Please refresh.', [
              { text: 'OK', onPress: () => navigation.goBack() }
          ]);
      } else {
          Alert.alert('Verification Failed', error.response?.data?.error || 'Invalid Code');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{action === 'pickup' ? 'Verify Pickup Code' : 'Verify Release Code'}</Text>
      <Text style={styles.subtitle}>Ask student for the code</Text>
      
      <TextInput
        style={styles.input}
        placeholder="Enter 6-digit Code"
        value={code}
        onChangeText={setCode}
        maxLength={6}
        autoCapitalize="characters"
      />
      
      {loading ? (
        <ActivityIndicator size="large" color="#0000ff" />
      ) : (
        <Button title="Verify Code" onPress={handleVerify} />
      )}

      <View style={{marginTop: 20}}>
        <Button title="Scan QR Code (Camera)" onPress={() => Alert.alert('Camera', 'Opens Camera Scanner')} color="green" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: 20,
    color: '#666',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 15,
    fontSize: 20,
    textAlign: 'center',
    marginBottom: 20,
    borderRadius: 5,
    letterSpacing: 5,
  },
});
