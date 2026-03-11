import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity, Alert, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Card from '../../components/ui/Card';
import Table from '../../components/ui/Table';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Input from '../../components/ui/Input';
import { getTokens } from '../../theme/tokens';
import { staff } from '../../services/api';

const tokens = getTokens();

export default function PlansScreen() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    type: 'monthly',
    price: '',
    max_pickups: '',
    clothes_limit: '',
    description: '',
    status: 'active',
    is_popular: false,
    payment_methods: ['cash', 'transfer', 'paystack']
  });

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      setLoading(true);
      const res = await staff.listPlans();
      setPlans(res.data);
    } catch (error) {
      Alert.alert('Error', error.response?.data?.error || error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setIsEditing(false);
    setFormData({
      name: '',
      type: 'monthly',
      price: '',
      max_pickups: '',
      clothes_limit: '15',
      description: '',
      status: 'active',
      is_popular: false,
      payment_methods: ['cash', 'transfer', 'paystack']
    });
    setModalVisible(true);
  };

  const handleEdit = (plan) => {
    setIsEditing(true);
    let methods = ['cash', 'transfer', 'paystack'];
    try {
      if (plan.payment_methods) {
        methods = JSON.parse(plan.payment_methods);
      }
    } catch (e) {}

    setFormData({
      plan_id: plan.plan_id,
      name: plan.name,
      type: plan.type || 'monthly',
      price: String(plan.price),
      max_pickups: String(plan.max_pickups),
      clothes_limit: String(plan.clothes_limit || 15),
      description: plan.description || '',
      status: plan.status || 'active',
      is_popular: plan.is_popular || false,
      payment_methods: methods
    });
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.price || !formData.max_pickups) {
      Alert.alert('Error', 'Please fill required fields');
      return;
    }
    if (!formData.payment_methods.length) {
      Alert.alert('Error', 'Select at least one payment method');
      return;
    }

    const payload = {
      ...formData,
      price: parseFloat(formData.price),
      max_pickups: parseInt(formData.max_pickups),
      clothes_limit: parseInt(formData.clothes_limit),
      duration_days: formData.type === 'weekly' ? 7 : formData.type === 'semester' ? 90 : 30,
      payment_methods: JSON.stringify(formData.payment_methods)
    };

    try {
      if (isEditing) {
        await staff.updatePlan(formData.plan_id, payload);
        Alert.alert('Success', 'Plan updated');
      } else {
        await staff.createPlan(payload);
        Alert.alert('Success', 'Plan created');
      }
      setModalVisible(false);
      fetchPlans();
    } catch (error) {
      Alert.alert('Error', error.response?.data?.error || error.message);
    }
  };

  const toggleStatus = async (plan) => {
    try {
      const newStatus = plan.status === 'active' ? 'inactive' : 'active';
      await staff.updatePlan(plan.plan_id, { status: newStatus });
      fetchPlans();
    } catch (error) {
      Alert.alert('Error', error.message);
    }
  };

  const togglePaymentMethod = (method) => {
    setFormData(prev => {
      const exists = prev.payment_methods.includes(method);
      if (exists) {
        return { ...prev, payment_methods: prev.payment_methods.filter(m => m !== method) };
      } else {
        return { ...prev, payment_methods: [...prev.payment_methods, method] };
      }
    });
  };

  const columns = [
    { title: 'Name', key: 'name', flex: 1, render: (item) => (
      <View>
        <Text style={{fontWeight: 'bold'}}>{item.name}</Text>
        {item.is_popular && <Badge variant="warning" size="sm">Popular</Badge>}
      </View>
    )},
    { title: 'Type', key: 'type', width: 80, render: (item) => <Badge variant="outline">{item.type || 'monthly'}</Badge> },
    { title: 'Price', key: 'price', width: 100, render: (item) => <Text>₦{parseInt(item.price).toLocaleString()}</Text> },
    { title: 'Pickups', key: 'max_pickups', width: 70 },
    { title: 'Limit', key: 'clothes_limit', width: 60, render: (item) => <Text>{item.clothes_limit || '-'}</Text> },
    { title: 'Status', key: 'status', width: 80, render: (item) => (
        <TouchableOpacity onPress={() => toggleStatus(item)}>
          <Badge variant={item.status === 'active' ? 'success' : 'secondary'}>{item.status || 'active'}</Badge>
        </TouchableOpacity>
      )
    },
    { title: 'Actions', key: 'actions', width: 80, render: (item) => (
        <Button title="Edit" size="sm" variant="ghost" onPress={() => handleEdit(item)} />
      )
    }
  ];

  return (
    <View style={styles.container}>
      <Card title="Subscription Plans" 
        action={<Button title="Create Plan" icon="add" onPress={handleAdd} />}
      >
        <Table columns={columns} data={plans} />
      </Card>

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{isEditing ? 'Edit Plan' : 'New Plan'}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={tokens.colors.text} />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalBody}>
              <Input label="Plan Name" value={formData.name} onChangeText={t => setFormData({...formData, name: t})} placeholder="e.g. Gold Plan" testID="input-plan-name" />
              
              <Text style={styles.label}>Plan Type</Text>
              <View style={styles.typeRow}>
                {['weekly', 'monthly', 'semester'].map(type => (
                  <TouchableOpacity 
                    key={type} 
                    style={[styles.typeChip, formData.type === type && styles.typeChipActive]}
                    onPress={() => setFormData({...formData, type})}
                  >
                    <Text style={[styles.typeText, formData.type === type && styles.typeTextActive]}>
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.row}>
                <View style={{flex: 1, marginRight: 8}}>
                  <Input label="Price (₦)" value={formData.price} onChangeText={t => setFormData({...formData, price: t})} keyboardType="numeric" testID="input-plan-price" />
                </View>
                <View style={{flex: 1, marginLeft: 8}}>
                  <Input label="Pickups" value={formData.max_pickups} onChangeText={t => setFormData({...formData, max_pickups: t})} keyboardType="numeric" placeholder="Total pickups" testID="input-plan-pickups" />
                </View>
              </View>

              <View style={styles.row}>
                <View style={{flex: 1, marginRight: 8}}>
                   <Input label="Clothes Limit (per pickup)" value={formData.clothes_limit} onChangeText={t => setFormData({...formData, clothes_limit: t})} keyboardType="numeric" />
                </View>
                <View style={{flex: 1, marginLeft: 8, justifyContent: 'center'}}>
                   <Text style={styles.label}>Active Status</Text>
                   <Switch 
                     value={formData.status === 'active'} 
                     onValueChange={v => setFormData({...formData, status: v ? 'active' : 'inactive'})} 
                     trackColor={{ false: tokens.colors.border, true: tokens.colors.primary }}
                   />
                </View>
                <View style={{flex: 1, marginLeft: 8, justifyContent: 'center'}}>
                   <Text style={styles.label}>Most Popular</Text>
                   <Switch 
                     value={formData.is_popular} 
                     onValueChange={v => setFormData({...formData, is_popular: v})} 
                     trackColor={{ false: tokens.colors.border, true: tokens.colors.primary }}
                   />
                </View>
              </View>

              <Input label="Description" value={formData.description} onChangeText={t => setFormData({...formData, description: t})} multiline numberOfLines={3} />

              <Text style={styles.label}>Allowed Payment Methods</Text>
              <View style={styles.paymentRow}>
                {['cash', 'transfer', 'paystack'].map(method => (
                  <TouchableOpacity 
                    key={method} 
                    style={styles.checkboxRow} 
                    onPress={() => togglePaymentMethod(method)}
                    testID={`payment-method-${method}`}
                  >
                    <Ionicons 
                      name={formData.payment_methods.includes(method) ? "checkbox" : "square-outline"} 
                      size={24} 
                      color={tokens.colors.primary} 
                    />
                    <Text style={styles.checkboxLabel}>{method.charAt(0).toUpperCase() + method.slice(1)}</Text>
                  </TouchableOpacity>
                ))}
              </View>

            </ScrollView>

            <View style={styles.modalFooter}>
              <Button title="Cancel" variant="outline" onPress={() => setModalVisible(false)} style={{marginRight: 8, flex: 1}} />
              <Button title="Save Plan" onPress={handleSave} style={{flex: 1}} testID="btn-save-plan" />
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
    padding: tokens.spacing.md,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    width: '100%',
    maxWidth: 500,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 30,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: tokens.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.border,
  },
  modalTitle: {
    fontSize: tokens.typography.sizes.xl,
    fontWeight: 'bold',
    color: '#111827',
  },
  modalBody: {
    padding: tokens.spacing.md,
  },
  modalFooter: {
    flexDirection: 'row',
    padding: tokens.spacing.md,
    borderTopWidth: 1,
    borderTopColor: tokens.colors.border,
  },
  row: {
    flexDirection: 'row',
    marginBottom: tokens.spacing.sm,
  },
  label: {
    fontSize: tokens.typography.sizes.sm,
    color: '#222222',
    marginBottom: 8,
    marginTop: 8,
    fontWeight: '500',
  },
  typeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  typeChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    backgroundColor: tokens.colors.bg,
  },
  typeChipActive: {
    borderColor: tokens.colors.primary,
    backgroundColor: tokens.colors.primary + '10',
  },
  typeText: {
    fontSize: 14,
    color: '#222222',
  },
  typeTextActive: {
    color: tokens.colors.primary,
    fontWeight: 'bold',
  },
  paymentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 16,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkboxLabel: {
    marginLeft: 8,
    fontSize: 14,
    color: '#222222',
  },
});
