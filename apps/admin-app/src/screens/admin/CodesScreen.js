import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Alert, Platform } from 'react-native';
import { Text, Button, Card, TextInput, Modal, Portal, Provider, Chip, FAB, IconButton, ActivityIndicator, Divider, Badge } from 'react-native-paper';
import { Picker } from '@react-native-picker/picker';
import { useSync } from '../../context/SyncContext';
import { staff } from '../../services/api';

const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString();
};

export default function CodesScreen() {
  const { lastEvent } = useSync();
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState([]); // For order picker

  // Filters
  const [filterType, setFilterType] = useState(''); // pickup | release
  const [filterStatus, setFilterStatus] = useState(''); // active | used | expired

  // Generate Modal
  const [generateVisible, setGenerateVisible] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState('');
  const [codeType, setCodeType] = useState('pickup');
  const [reason, setReason] = useState('');

  // Audit Modal
  const [auditVisible, setAuditVisible] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // Invalidate Modal
  const [invalidateVisible, setInvalidateVisible] = useState(false);
  const [invalidateId, setInvalidateId] = useState(null);
  const [invalidateReason, setInvalidateReason] = useState('');

  useEffect(() => {
    loadCodes();
    loadOrders();
  }, [filterType, filterStatus]);

  // Real-time Sync
  useEffect(() => {
    if (lastEvent) {
        // Refresh on code related events or order updates (which might trigger code gen)
        if (lastEvent.type === 'order_updated' || lastEvent.type === 'order_created' || lastEvent.type.includes('code') || lastEvent.type === 'pickup_event') {
            console.log('CodesScreen: Sync event received', lastEvent.type);
            loadCodes();
            loadOrders(); // New orders might need codes
        }
    }
  }, [lastEvent]);

  const loadCodes = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterType) params.type = filterType;
      if (filterStatus) params.status = filterStatus;
      
      const res = await staff.listCodes(params);
      setCodes(res.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const loadOrders = async () => {
    try {
      // Only active orders relevant for code generation
      const res = await staff.getOrders({ status: 'pending' }); // Adjust status as needed, maybe 'all' but filtered in UI
      // Ideally we should search orders dynamically, but for now load recent ones
      setOrders(res.data); 
    } catch (error) {
        console.error('Failed to load orders');
    }
  };

  const handleGenerate = async () => {
    if (!selectedOrder) {
      Alert.alert('Error', 'Please select an order');
      return;
    }
    if (!codeType) {
        Alert.alert('Error', 'Please select code type');
        return;
    }

    try {
      await staff.generateCode({
        order_id: selectedOrder,
        type: codeType,
        reason: reason || undefined // Only needed if regenerating, handled by backend logic
      });
      Alert.alert('Success', 'Code generated successfully');
      setGenerateVisible(false);
      // Reset form
      setSelectedOrder('');
      setCodeType('pickup');
      setReason('');
      loadCodes();
    } catch (error) {
      Alert.alert('Error', error.response?.data?.error || error.message);
    }
  };

  const handleInvalidatePrompt = (id) => {
    setInvalidateId(id);
    setInvalidateReason('');
    setInvalidateVisible(true);
  };

  const handleInvalidate = async () => {
      if (!invalidateReason) {
          Alert.alert('Error', 'Reason is required for invalidation');
          return;
      }
      try {
          await staff.invalidateCode(invalidateId, invalidateReason);
          Alert.alert('Success', 'Code invalidated');
          setInvalidateVisible(false);
          loadCodes();
      } catch (error) {
          Alert.alert('Error', error.response?.data?.error || error.message);
      }
  };

  const viewAudit = async (id) => {
    setAuditVisible(true);
    setLoadingAudit(true);
    try {
      const res = await staff.getCodeAudit(id);
      setAuditLogs(res.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingAudit(false);
    }
  };

  const getStatusColor = (status) => {
      switch(status) {
          case 'active': return 'green';
          case 'used': return 'blue';
          case 'expired': return 'red';
          default: return 'grey';
      }
  };

  return (
    <Provider>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text variant="headlineMedium" style={styles.title}>Codes Management</Text>
          <Button mode="contained" onPress={() => setGenerateVisible(true)} icon="plus">Generate Code</Button>
        </View>

        <View style={styles.filters}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <Chip selected={filterType === ''} onPress={() => setFilterType('')} style={styles.chip}>All Types</Chip>
            <Chip selected={filterType === 'pickup'} onPress={() => setFilterType('pickup')} style={styles.chip}>Pickup</Chip>
            <Chip selected={filterType === 'release'} onPress={() => setFilterType('release')} style={styles.chip}>Release</Chip>
            
            <View style={{width: 20}} />
            
            <Chip selected={filterStatus === ''} onPress={() => setFilterStatus('')} style={styles.chip}>All Status</Chip>
            <Chip selected={filterStatus === 'active'} onPress={() => setFilterStatus('active')} style={styles.chip}>Active</Chip>
            <Chip selected={filterStatus === 'used'} onPress={() => setFilterStatus('used')} style={styles.chip}>Used</Chip>
            <Chip selected={filterStatus === 'expired'} onPress={() => setFilterStatus('expired')} style={styles.chip}>Expired</Chip>
          </ScrollView>
        </View>

        {loading ? (
          <ActivityIndicator animating={true} size="large" style={{ marginTop: 20 }} />
        ) : (
          <ScrollView style={styles.list}>
            {codes.map((c) => (
              <Card key={c.code_id} style={styles.card}>
                <Card.Content>
                  <View style={styles.cardHeader}>
                    <View>
                        <Text variant="titleLarge" style={{ fontWeight: 'bold', letterSpacing: 2 }}>{c.code_value}</Text>
                        <Text variant="bodySmall" style={{ color: '#666' }}>{c.type.toUpperCase()}</Text>
                    </View>
                    <Badge style={{ backgroundColor: getStatusColor(c.status), fontSize: 12, paddingHorizontal: 10 }}>{c.status.toUpperCase()}</Badge>
                  </View>
                  
                  <Divider style={{ marginVertical: 10 }} />
                  
                  <View style={styles.detailsRow}>
                      <View style={{ flex: 1 }}>
                        <Text variant="bodyMedium">Order #{c.order_id}</Text>
                        <Text variant="bodySmall" style={{ color: '#666' }}>
                            User: {c.Order?.User?.full_name} ({c.Order?.User?.phone_number})
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text variant="bodySmall">Expires: {formatDate(c.expires_at)}</Text>
                        <Text variant="bodySmall">Attempts: {c.attempt_count}</Text>
                      </View>
                  </View>

                  <View style={styles.cardFooter}>
                    <Button mode="text" compact onPress={() => viewAudit(c.code_id)}>Audit Logs</Button>
                    {c.status === 'active' && (
                        <Button mode="text" compact textColor="red" onPress={() => handleInvalidatePrompt(c.code_id)}>Invalidate</Button>
                    )}
                  </View>
                </Card.Content>
              </Card>
            ))}
            {codes.length === 0 && (
                <Text style={{ textAlign: 'center', marginTop: 20, color: '#666' }}>No codes found.</Text>
            )}
          </ScrollView>
        )}

        {/* Generate Modal */}
        <Portal>
          <Modal visible={generateVisible} onDismiss={() => setGenerateVisible(false)} contentContainerStyle={styles.modal}>
            <Text variant="headlineSmall" style={{ marginBottom: 15 }}>Generate Code</Text>
            
            <Text style={styles.label}>Order</Text>
            <View style={styles.pickerContainer}>
                <Picker
                    selectedValue={selectedOrder}
                    onValueChange={setSelectedOrder}
                    style={styles.picker}
                >
                    <Picker.Item label="Select an order..." value="" />
                    {orders.map(o => (
                        <Picker.Item key={o.order_id} label={`Order #${o.order_id} - ${o.User?.full_name}`} value={o.order_id} />
                    ))}
                </Picker>
            </View>

            <Text style={styles.label}>Code Type</Text>
            <View style={styles.pickerContainer}>
                <Picker
                    selectedValue={codeType}
                    onValueChange={setCodeType}
                    style={styles.picker}
                >
                    <Picker.Item label="Pickup Code" value="pickup" />
                    <Picker.Item label="Release Code" value="release" />
                </Picker>
            </View>

            <TextInput
                label="Reason (if regenerating)"
                value={reason}
                onChangeText={setReason}
                mode="outlined"
                style={styles.input}
                placeholder="Required if active code exists"
            />

            <View style={styles.modalActions}>
              <Button onPress={() => setGenerateVisible(false)} style={{ marginRight: 10 }}>Cancel</Button>
              <Button mode="contained" onPress={handleGenerate}>Generate</Button>
            </View>
          </Modal>
        </Portal>

        {/* Invalidate Modal */}
        <Portal>
            <Modal visible={invalidateVisible} onDismiss={() => setInvalidateVisible(false)} contentContainerStyle={styles.modal}>
                <Text variant="headlineSmall" style={{ marginBottom: 15, color: 'red' }}>Invalidate Code</Text>
                <Text style={{ marginBottom: 15 }}>Are you sure you want to invalidate this code? This will lock the order.</Text>
                
                <TextInput
                    label="Reason"
                    value={invalidateReason}
                    onChangeText={setInvalidateReason}
                    mode="outlined"
                    style={styles.input}
                    multiline
                />

                <View style={styles.modalActions}>
                    <Button onPress={() => setInvalidateVisible(false)} style={{ marginRight: 10 }}>Cancel</Button>
                    <Button mode="contained" buttonColor="red" onPress={handleInvalidate}>Invalidate</Button>
                </View>
            </Modal>
        </Portal>

        {/* Audit Modal */}
        <Portal>
            <Modal visible={auditVisible} onDismiss={() => setAuditVisible(false)} contentContainerStyle={styles.modal}>
                <Text variant="headlineSmall" style={{ marginBottom: 15 }}>Audit Logs</Text>
                {loadingAudit ? (
                    <ActivityIndicator />
                ) : (
                    <ScrollView style={{ maxHeight: 300 }}>
                        {auditLogs.map((log) => (
                            <View key={log.log_id} style={{ marginBottom: 15, borderBottomWidth: 1, borderBottomColor: '#eee', paddingBottom: 10 }}>
                                <Text style={{ fontWeight: 'bold' }}>{log.action}</Text>
                                <Text style={{ fontSize: 12, color: '#666' }}>By: {log.User?.full_name || 'System'} ({log.User?.role})</Text>
                                <Text style={{ fontSize: 12, color: '#666' }}>{formatDate(log.created_at)}</Text>
                                <Text style={{ marginTop: 5 }}>{log.details}</Text>
                            </View>
                        ))}
                        {auditLogs.length === 0 && <Text>No logs found.</Text>}
                    </ScrollView>
                )}
                <Button onPress={() => setAuditVisible(false)} style={{ marginTop: 10 }}>Close</Button>
            </Modal>
        </Portal>

      </View>
    </Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontWeight: 'bold',
  },
  filters: {
    marginBottom: 15,
    height: 40,
  },
  chip: {
    marginRight: 8,
  },
  list: {
    flex: 1,
  },
  card: {
    marginBottom: 10,
    backgroundColor: 'white',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 5,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 5,
  },
  modal: {
    backgroundColor: 'white',
    padding: 20,
    margin: 20,
    borderRadius: 8,
    maxHeight: '90%',
  },
  input: {
    marginBottom: 10,
    backgroundColor: 'white',
  },
  label: {
    marginTop: 10,
    marginBottom: 5,
    fontWeight: '500',
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    marginBottom: 10,
    ...(Platform.OS === 'web' ? { height: 40, justifyContent: 'center' } : {}),
  },
  picker: {
    ...(Platform.OS === 'web' ? { height: 40, border: 'none' } : {}),
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 20,
  },
});
