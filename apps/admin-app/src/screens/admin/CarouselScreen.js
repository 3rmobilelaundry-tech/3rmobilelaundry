import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity, Alert, Image, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Card from '../../components/ui/Card';
import Table from '../../components/ui/Table';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Input from '../../components/ui/Input';
import { getTokens } from '../../theme/tokens';
import api, { staff, normalizeApiError } from '../../services/api';

const tokens = getTokens();

export default function CarouselScreen() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    link: '',
    status: 'active',
    order_index: '0',
    image: null,
    image_preview: null
  });

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    try {
      setLoading(true);
      const res = await staff.listCarouselItems();
      setItems(res.data);
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to load carousel items');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setIsEditing(false);
    setErrors({});
    setFormData({
      title: '',
      description: '',
      link: '',
      status: 'active',
      order_index: String(items.length), // Auto-increment sort of
      image: null,
      image_preview: null
    });
    setModalVisible(true);
  };

  const handleEdit = (item) => {
    setIsEditing(true);
    setErrors({});
    setFormData({
      id: item.id,
      title: item.title || '',
      description: item.description || '',
      link: item.link || '',
      status: item.status || 'active',
      order_index: String(item.order_index || 0),
      image: null,
      image_preview: item.image_url ? `${api.defaults.baseURL}${item.image_url}` : null
    });
    setModalVisible(true);
  };

  const handleImagePick = async () => {
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
          setFormData(prev => ({
            ...prev,
            image: file,
            image_preview: URL.createObjectURL(file)
          }));
        }
      };
      input.click();
    } else {
      Alert.alert('Not supported', 'Image picking not implemented for native yet');
    }
  };

  const validateForm = () => {
    const nextErrors = {};
    const title = String(formData.title || '').trim();
    const description = String(formData.description || '').trim();
    const link = String(formData.link || '').trim();
    const status = String(formData.status || '').trim();
    const orderRaw = String(formData.order_index || '').trim();
    const orderIndex = orderRaw === '' ? 0 : Number(orderRaw);

    if (!isEditing && !formData.image) {
      nextErrors.image = 'Image is required for new items';
    }

    if (!Number.isInteger(orderIndex) || orderIndex < 0) {
      nextErrors.order_index = 'Order index must be a non-negative whole number';
    }

    if (link && !/^https?:\/\/\S+$/i.test(link)) {
      nextErrors.link = 'Enter a valid URL starting with http:// or https://';
    }

    if (status && !['active', 'inactive'].includes(status)) {
      nextErrors.status = 'Status must be active or inactive';
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      const firstMessage = Object.values(nextErrors)[0];
      Alert.alert('Validation Error', firstMessage);
      return null;
    }

    return { title, description, link, status: status || 'active', orderIndex };
  };

  const handleSave = async () => {
    if (saving) return;
    const validated = validateForm();
    if (!validated) return;
    setSaving(true);

    const data = new FormData();
    data.append('title', validated.title);
    data.append('description', validated.description);
    data.append('link', validated.link);
    data.append('status', validated.status);
    data.append('order_index', String(validated.orderIndex));
    
    if (formData.image) {
      data.append('image', formData.image);
    }

    try {
      if (isEditing) {
        await staff.updateCarouselItem(formData.id, data);
        Alert.alert('Success', 'Item updated');
      } else {
        await staff.createCarouselItem(data);
        Alert.alert('Success', 'Item created');
      }
      setModalVisible(false);
      fetchItems();
    } catch (error) {
      const normalized = error?.normalized || normalizeApiError?.(error);
      console.error(error);
      Alert.alert('Error', normalized?.message || error.response?.data?.error || error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item) => {
    if (confirm('Are you sure you want to delete this item?')) {
      try {
        await staff.deleteCarouselItem(item.id);
        fetchItems();
      } catch (error) {
        Alert.alert('Error', error.message);
      }
    }
  };

  const toggleStatus = async (item) => {
    try {
      const newStatus = item.status === 'active' ? 'inactive' : 'active';
      // Use FormData even for simple updates if endpoint expects it, 
      // but usually JSON is fine if we handled it. 
      // However, our backend expects multipart for PUT too because of upload.single().
      // We must send FormData or modify backend to handle JSON if no file.
      // Backend: upload.single('image') middleware is used.
      // If we send JSON, multer might complain or just skip file.
      // Let's send FormData to be safe.
      const data = new FormData();
      data.append('status', newStatus);
      await staff.updateCarouselItem(item.id, data);
      fetchItems();
    } catch (error) {
      Alert.alert('Error', error.message);
    }
  };

  const columns = [
    { title: 'Order', key: 'order_index', width: 60 },
    { title: 'Image', key: 'image', width: 80, render: (item) => (
      <Image 
        source={{ uri: `${api.defaults.baseURL}${item.image_url}` }} 
        style={{ width: 60, height: 40, borderRadius: 4, backgroundColor: '#eee' }} 
        resizeMode="cover"
      />
    )},
    { title: 'Title', key: 'title', flex: 1, render: (item) => (
      <View>
        <Text style={{fontWeight: 'bold'}}>{item.title || '(No Title)'}</Text>
        <Text style={{fontSize: 12, color: '#666'}} numberOfLines={1}>{item.description}</Text>
      </View>
    )},
    { title: 'Link', key: 'link', width: 100, render: (item) => (
       <Text numberOfLines={1} style={{color: tokens.colors.primary}}>{item.link}</Text>
    )},
    { title: 'Status', key: 'status', width: 80, render: (item) => (
        <TouchableOpacity onPress={() => toggleStatus(item)}>
          <Badge variant={item.status === 'active' ? 'success' : 'secondary'}>{item.status || 'active'}</Badge>
        </TouchableOpacity>
      )
    },
    { title: 'Actions', key: 'actions', width: 100, render: (item) => (
        <View style={{flexDirection: 'row'}}>
          <Button title="Edit" size="sm" variant="ghost" onPress={() => handleEdit(item)} />
          <Button title="Del" size="sm" variant="ghost" color="danger" onPress={() => handleDelete(item)} />
        </View>
      )
    }
  ];

  return (
    <View style={styles.container}>
      <Card title="Carousel Management" 
        action={<Button title="Add Slide" icon="add" onPress={handleAdd} />}
      >
        <Table columns={columns} data={items} />
      </Card>

      <Modal visible={modalVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{isEditing ? 'Edit Slide' : 'New Slide'}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={tokens.colors.text} />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalBody}>
              
              <Text style={styles.label}>Image (Required)</Text>
              <TouchableOpacity style={styles.imagePicker} onPress={handleImagePick}>
                {formData.image_preview ? (
                  <Image source={{ uri: formData.image_preview }} style={styles.previewImage} resizeMode="cover" />
                ) : (
                  <View style={styles.placeholder}>
                    <Ionicons name="image-outline" size={32} color="#ccc" />
                    <Text style={{color: '#999', marginTop: 8}}>Click to upload image</Text>
                  </View>
                )}
              </TouchableOpacity>

              <Input 
                label="Title (Optional)" 
                value={formData.title} 
                onChangeText={t => setFormData({...formData, title: t})} 
                placeholder="e.g. Welcome Back!" 
              />
              
              <Input 
                label="Description (Optional)" 
                value={formData.description} 
                onChangeText={t => setFormData({...formData, description: t})} 
                placeholder="Short subtitle" 
                multiline
              />

              <Input 
                label="External Link (Optional)" 
                value={formData.link} 
                onChangeText={t => setFormData({...formData, link: t})} 
                placeholder="https://..." 
                error={errors.link}
              />

              <View style={styles.row}>
                 <View style={{flex: 1, marginRight: 8}}>
                    <Input 
                        label="Order Index" 
                        value={formData.order_index} 
                        onChangeText={t => setFormData({...formData, order_index: t})} 
                        keyboardType="numeric"
                        placeholder="0"
                        error={errors.order_index}
                    />
                 </View>
                 <View style={{flex: 1, justifyContent: 'center'}}>
                    <Text style={styles.label}>Status</Text>
                    <TouchableOpacity 
                        style={[styles.statusToggle, formData.status === 'active' ? styles.active : styles.inactive]}
                        onPress={() => setFormData({...formData, status: formData.status === 'active' ? 'inactive' : 'active'})}
                    >
                        <Text style={{color: 'white', fontWeight: 'bold'}}>
                            {formData.status === 'active' ? 'Active' : 'Inactive'}
                        </Text>
                    </TouchableOpacity>
                 </View>
              </View>

            </ScrollView>

            <View style={styles.modalFooter}>
              <Button title="Cancel" variant="outline" onPress={() => setModalVisible(false)} style={{marginRight: 8}} disabled={saving} />
              <Button title="Save Slide" onPress={handleSave} loading={saving} />
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
    padding: tokens.spacing.lg,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    maxWidth: 500,
    backgroundColor: 'white',
    borderRadius: tokens.radius.lg,
    maxHeight: '90%',
    display: 'flex',
    flexDirection: 'column',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: tokens.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.border,
  },
  modalTitle: {
    fontSize: tokens.typography.sizes.lg,
    fontWeight: tokens.typography.weights.bold,
  },
  modalBody: {
    padding: tokens.spacing.lg,
  },
  modalFooter: {
    padding: tokens.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: tokens.colors.border,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  label: {
    fontSize: tokens.typography.sizes.sm,
    fontWeight: tokens.typography.weights.medium,
    marginBottom: tokens.spacing.xs,
    color: tokens.colors.text,
  },
  imagePicker: {
    width: '100%',
    height: 150,
    backgroundColor: '#f9f9f9',
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderStyle: 'dashed',
    overflow: 'hidden',
    marginBottom: tokens.spacing.md,
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  row: {
    flexDirection: 'row',
    marginBottom: tokens.spacing.md,
  },
  statusToggle: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    marginTop: 4,
  },
  active: {
    backgroundColor: tokens.colors.success,
  },
  inactive: {
    backgroundColor: tokens.colors.textMuted,
  },
});
