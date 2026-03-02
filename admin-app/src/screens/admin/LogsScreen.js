import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TextInput, TouchableOpacity, ActivityIndicator, Modal, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { staff } from '../../services/api';
import Card from '../../components/ui/Card';
import { getTokens } from '../../theme/tokens';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

const tokens = getTokens();

export default function LogsScreen() {
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  
  // Filters
  const [entityType, setEntityType] = useState('all');
  const [userId, setUserId] = useState('');
  const [dateRange, setDateRange] = useState('7d'); // 'today', '7d', '30d', 'all'

  // Modals & Actions
  const [selectedLog, setSelectedLog] = useState(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  
  const [downloadModalVisible, setDownloadModalVisible] = useState(false);
  const [downloadStart, setDownloadStart] = useState(new Date().toISOString().split('T')[0]);
  const [downloadEnd, setDownloadEnd] = useState(new Date().toISOString().split('T')[0]);
  const [downloadFormat, setDownloadFormat] = useState('xlsx');
  const [isDownloading, setIsDownloading] = useState(false);

  const fetchData = async () => {
    try {
      const params = { limit: 100 };
      
      if (entityType !== 'all') params.entity_type = entityType;
      if (userId) params.user_id = userId;
      
      const now = new Date();
      if (dateRange === 'today') {
        params.startDate = new Date(now.setHours(0,0,0,0)).toISOString();
      } else if (dateRange === '7d') {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        params.startDate = d.toISOString();
      } else if (dateRange === '30d') {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        params.startDate = d.toISOString();
      }
      
      const res = await staff.auditLogs(params);
      setLogs(res.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [entityType, dateRange]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString();
  };

  const getIconForType = (type) => {
    switch (type) {
      case 'user': return 'person';
      case 'order': return 'cart';
      case 'payment': return 'card';
      case 'code': return 'keypad';
      case 'security': return 'shield';
      default: return 'document-text';
    }
  };

  const getColorForType = (type) => {
    switch (type) {
      case 'user': return tokens.colors.primary;
      case 'order': return tokens.colors.secondary;
      case 'payment': return tokens.colors.success;
      case 'code': return tokens.colors.warning;
      case 'security': return tokens.colors.error;
      default: return tokens.colors.textSecondary;
    }
  };

  // --- ACTIONS ---

  const handleLogPress = (log) => {
    setSelectedLog(log);
    setDetailModalVisible(true);
  };

  const handleShareLog = () => {
    if (!selectedLog) return;
    const content = `LOG DETAILS
ID: ${selectedLog.log_id}
Date: ${formatDate(selectedLog.created_at)}
Action: ${selectedLog.action}
Type: ${selectedLog.entity_type}
Actor: ${selectedLog.User ? `${selectedLog.User.full_name} (${selectedLog.User.role})` : `User #${selectedLog.actor_user_id}`}
Details: ${selectedLog.details}`;

    if (Platform.OS === 'web') {
        navigator.clipboard.writeText(content);
        alert('Log details copied to clipboard!');
    } else {
        // Fallback for native if Clipboard is imported, but for now assuming web mainly or Alert
        Alert.alert('Copied', 'Log details copied to clipboard');
    }
  };

  const handleDownload = async () => {
    if (!downloadStart || !downloadEnd) {
        alert('Please select both start and end dates');
        return;
    }
    
    setIsDownloading(true);
    try {
        // Fetch all logs in range
        const res = await staff.auditLogs({
            startDate: downloadStart,
            endDate: downloadEnd,
            limit: 5000 // High limit for export
        });
        
        const data = res.data.map(log => ({
            ID: log.log_id,
            Date: new Date(log.created_at).toLocaleString(),
            Action: log.action,
            Type: log.entity_type,
            Actor: log.User ? `${log.User.full_name} (${log.User.role})` : log.actor_user_id,
            Details: log.details
        }));

        if (data.length === 0) {
            alert('No logs found in this date range.');
            setIsDownloading(false);
            return;
        }

        if (downloadFormat === 'xlsx') {
            const ws = XLSX.utils.json_to_sheet(data);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Logs");
            XLSX.writeFile(wb, `system_logs_${downloadStart}_${downloadEnd}.xlsx`);
        } else {
            const doc = new jsPDF();
            doc.setFontSize(16);
            doc.text(`System Logs Report`, 14, 20);
            doc.setFontSize(10);
            doc.text(`Period: ${downloadStart} to ${downloadEnd}`, 14, 28);
            
            doc.autoTable({
                head: [['ID', 'Date', 'Action', 'Type', 'Actor', 'Details']],
                body: data.map(item => [item.ID, item.Date, item.Action, item.Type, item.Actor, item.Details]),
                startY: 35,
                styles: { fontSize: 8 },
                headStyles: { fillColor: [66, 66, 66] }
            });
            doc.save(`system_logs_${downloadStart}_${downloadEnd}.pdf`);
        }
        
        setDownloadModalVisible(false);
    } catch (error) {
        console.error(error);
        alert('Failed to download logs.');
    } finally {
        setIsDownloading(false);
    }
  };

  const FilterPill = ({ label, value, current, onSelect }) => (
    <TouchableOpacity 
      style={[styles.pill, current === value && styles.pillActive]} 
      onPress={() => onSelect(value)}
    >
      <Text style={[styles.pillText, current === value && styles.pillTextActive]}>{label}</Text>
    </TouchableOpacity>
  );

  if (loading && !refreshing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={tokens.colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <View style={styles.headerRow}>
            <View>
                <Text style={styles.title}>System Audit Logs</Text>
                <Text style={styles.subtitle}>Permanent, tamper-proof record of all system events.</Text>
            </View>
            <TouchableOpacity 
                style={styles.downloadButton} 
                onPress={() => setDownloadModalVisible(true)}
            >
                <Ionicons name="download-outline" size={20} color="white" />
                <Text style={styles.downloadButtonText}>Download Logs</Text>
            </TouchableOpacity>
        </View>
      </View>

      {/* FILTERS */}
      <View style={styles.filterSection}>
        <Text style={styles.filterLabel}>Log Type:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillContainer}>
          <FilterPill label="All" value="all" current={entityType} onSelect={setEntityType} />
          <FilterPill label="Users" value="user" current={entityType} onSelect={setEntityType} />
          <FilterPill label="Orders" value="order" current={entityType} onSelect={setEntityType} />
          <FilterPill label="Payments" value="payment" current={entityType} onSelect={setEntityType} />
          <FilterPill label="Codes" value="code" current={entityType} onSelect={setEntityType} />
        </ScrollView>

        <Text style={styles.filterLabel}>Time Range:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillContainer}>
          <FilterPill label="Today" value="today" current={dateRange} onSelect={setDateRange} />
          <FilterPill label="Last 7 Days" value="7d" current={dateRange} onSelect={setDateRange} />
          <FilterPill label="Last 30 Days" value="30d" current={dateRange} onSelect={setDateRange} />
          <FilterPill label="All Time" value="all" current={dateRange} onSelect={setDateRange} />
        </ScrollView>

        <View style={styles.searchRow}>
           <TextInput 
             style={styles.input}
             placeholder="Search by User ID..."
             value={userId}
             onChangeText={setUserId}
             keyboardType="numeric"
           />
           <TouchableOpacity style={styles.searchButton} onPress={fetchData}>
             <Ionicons name="search" size={20} color="white" />
           </TouchableOpacity>
        </View>
      </View>

      {/* LOG LIST */}
      <View style={styles.listSection}>
        {logs.length === 0 ? (
          <View style={styles.emptyState}>
             <Ionicons name="file-tray-outline" size={48} color={tokens.colors.textSecondary} />
             <Text style={styles.emptyText}>No logs found matching criteria.</Text>
          </View>
        ) : (
          logs.map(log => (
            <TouchableOpacity key={log.log_id} onPress={() => handleLogPress(log)}>
                <Card style={styles.logCard}>
                  <View style={styles.logHeader}>
                    <View style={[styles.iconBox, { backgroundColor: getColorForType(log.entity_type) + '20' }]}>
                      <Ionicons name={getIconForType(log.entity_type)} size={20} color={getColorForType(log.entity_type)} />
                    </View>
                    <View style={styles.logMeta}>
                       <Text style={styles.actionText}>{log.action.replace(/_/g, ' ')}</Text>
                       <Text style={styles.dateText}>{formatDate(log.created_at)}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={tokens.colors.textSecondary} />
                  </View>
                  <View style={styles.logDetails}>
                     <Text style={styles.detailText} numberOfLines={1}><Text style={styles.bold}>Actor:</Text> {log.User ? `${log.User.full_name}` : `User #${log.actor_user_id}`}</Text>
                     <Text style={styles.detailText} numberOfLines={2}><Text style={styles.bold}>Details:</Text> {log.details}</Text>
                  </View>
                </Card>
            </TouchableOpacity>
          ))
        )}
      </View>

      {/* DETAIL MODAL */}
      <Modal
        visible={detailModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setDetailModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Log Details</Text>
                    <TouchableOpacity onPress={() => setDetailModalVisible(false)}>
                        <Ionicons name="close" size={24} color={tokens.colors.text} />
                    </TouchableOpacity>
                </View>
                
                {selectedLog && (
                    <ScrollView style={styles.modalBody}>
                        <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>Log ID:</Text>
                            <Text style={styles.detailValue}>{selectedLog.log_id}</Text>
                        </View>
                        <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>Timestamp:</Text>
                            <Text style={styles.detailValue}>{formatDate(selectedLog.created_at)}</Text>
                        </View>
                        <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>Action:</Text>
                            <Text style={styles.detailValue}>{selectedLog.action}</Text>
                        </View>
                        <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>Entity Type:</Text>
                            <Text style={styles.detailValue}>{selectedLog.entity_type}</Text>
                        </View>
                        <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>Actor:</Text>
                            <Text style={styles.detailValue}>
                                {selectedLog.User 
                                    ? `${selectedLog.User.full_name}\nRole: ${selectedLog.User.role}\nPhone: ${selectedLog.User.phone_number}` 
                                    : `User ID: ${selectedLog.actor_user_id}`
                                }
                            </Text>
                        </View>
                        <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>Entity ID:</Text>
                            <Text style={styles.detailValue}>{selectedLog.entity_id}</Text>
                        </View>
                        <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
                            <Text style={styles.detailLabel}>Details:</Text>
                            <Text style={styles.detailValue}>{selectedLog.details}</Text>
                        </View>
                    </ScrollView>
                )}

                <View style={styles.modalFooter}>
                    <TouchableOpacity style={styles.shareButton} onPress={handleShareLog}>
                        <Ionicons name="share-outline" size={20} color="white" />
                        <Text style={styles.shareButtonText}>Share / Copy</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
      </Modal>

      {/* DOWNLOAD MODAL */}
      <Modal
        visible={downloadModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setDownloadModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Download Logs</Text>
                    <TouchableOpacity onPress={() => setDownloadModalVisible(false)}>
                        <Ionicons name="close" size={24} color={tokens.colors.text} />
                    </TouchableOpacity>
                </View>
                
                <View style={styles.modalBody}>
                    <Text style={styles.inputLabel}>Start Date (YYYY-MM-DD)</Text>
                    <TextInput 
                        style={styles.modalInput}
                        value={downloadStart}
                        onChangeText={setDownloadStart}
                        placeholder="YYYY-MM-DD"
                    />

                    <Text style={styles.inputLabel}>End Date (YYYY-MM-DD)</Text>
                    <TextInput 
                        style={styles.modalInput}
                        value={downloadEnd}
                        onChangeText={setDownloadEnd}
                        placeholder="YYYY-MM-DD"
                    />

                    <Text style={styles.inputLabel}>Format</Text>
                    <View style={styles.formatRow}>
                        <TouchableOpacity 
                            style={[styles.formatOption, downloadFormat === 'xlsx' && styles.formatOptionActive]}
                            onPress={() => setDownloadFormat('xlsx')}
                        >
                            <Ionicons name="grid-outline" size={20} color={downloadFormat === 'xlsx' ? 'white' : tokens.colors.text} />
                            <Text style={[styles.formatText, downloadFormat === 'xlsx' && styles.formatTextActive]}>Excel (.xlsx)</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                            style={[styles.formatOption, downloadFormat === 'pdf' && styles.formatOptionActive]}
                            onPress={() => setDownloadFormat('pdf')}
                        >
                            <Ionicons name="document-text-outline" size={20} color={downloadFormat === 'pdf' ? 'white' : tokens.colors.text} />
                            <Text style={[styles.formatText, downloadFormat === 'pdf' && styles.formatTextActive]}>PDF (.pdf)</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                <View style={styles.modalFooter}>
                    <TouchableOpacity 
                        style={[styles.downloadActionButton, isDownloading && { opacity: 0.7 }]} 
                        onPress={handleDownload}
                        disabled={isDownloading}
                    >
                        {isDownloading ? (
                            <ActivityIndicator color="white" size="small" />
                        ) : (
                            <>
                                <Ionicons name="cloud-download-outline" size={20} color="white" />
                                <Text style={styles.downloadButtonText}>Download</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>
            </View>
        </View>
      </Modal>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f5f5f5',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    marginBottom: 20,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tokens.colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  downloadButtonText: {
    color: 'white',
    marginLeft: 8,
    fontWeight: '600',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: tokens.colors.text,
  },
  subtitle: {
    fontSize: 14,
    color: tokens.colors.textSecondary,
    marginTop: 4,
  },
  filterSection: {
    marginBottom: 20,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: tokens.colors.text,
    marginBottom: 8,
    marginTop: 12,
  },
  pillContainer: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'white',
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  pillActive: {
    backgroundColor: tokens.colors.primary,
    borderColor: tokens.colors.primary,
  },
  pillText: {
    color: tokens.colors.text,
    fontSize: 14,
  },
  pillTextActive: {
    color: 'white',
    fontWeight: '600',
  },
  searchRow: {
    flexDirection: 'row',
    marginTop: 12,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginRight: 10,
  },
  searchButton: {
    backgroundColor: tokens.colors.primary,
    padding: 12,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listSection: {
    paddingBottom: 40,
  },
  logCard: {
    marginBottom: 12,
    padding: 12,
  },
  logHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    paddingBottom: 8,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  logMeta: {
    flex: 1,
  },
  actionText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: tokens.colors.text,
  },
  dateText: {
    fontSize: 12,
    color: tokens.colors.textSecondary,
    marginTop: 2,
  },
  logDetails: {
    paddingLeft: 4,
  },
  detailText: {
    fontSize: 14,
    color: tokens.colors.text,
    marginBottom: 4,
  },
  bold: {
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    marginTop: 16,
    color: tokens.colors.textSecondary,
    fontSize: 16,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 12,
    width: '100%',
    maxWidth: 500,
    maxHeight: '80%',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: tokens.colors.text,
  },
  modalBody: {
    padding: 16,
  },
  detailRow: {
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  detailLabel: {
    fontSize: 12,
    color: tokens.colors.textSecondary,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailValue: {
    fontSize: 16,
    color: tokens.colors.text,
  },
  modalFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tokens.colors.secondary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  shareButtonText: {
    color: 'white',
    marginLeft: 8,
    fontWeight: '600',
  },
  downloadActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tokens.colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: tokens.colors.text,
    marginBottom: 8,
    marginTop: 12,
  },
  modalInput: {
    backgroundColor: '#f9f9f9',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  formatRow: {
    flexDirection: 'row',
    marginTop: 8,
    marginBottom: 20,
  },
  formatOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginRight: 10,
  },
  formatOptionActive: {
    backgroundColor: tokens.colors.primary,
    borderColor: tokens.colors.primary,
  },
  formatText: {
    marginLeft: 8,
    color: tokens.colors.text,
  },
  formatTextActive: {
    color: 'white',
    fontWeight: '600',
  },
});
