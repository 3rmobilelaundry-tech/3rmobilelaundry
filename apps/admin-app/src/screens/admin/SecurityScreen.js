import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { staff } from '../../services/api';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { getTokens } from '../../theme/tokens';

const tokens = getTokens();

export default function SecurityScreen() {
  const [loading, setLoading] = useState(true);
  const [flaggedUsers, setFlaggedUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [logFilter, setLogFilter] = useState('security'); // 'security', 'login_failed', 'code_misuse', 'all'
  const [refreshing, setRefreshing] = useState(false);
  const [resetLogs, setResetLogs] = useState([]);
  const [resetEmail, setResetEmail] = useState('');
  const [forcingReset, setForcingReset] = useState(false);

  const fetchData = async () => {
    try {
      const [usersRes, logsRes, resetsRes] = await Promise.all([
        staff.getFlaggedUsers(),
        staff.getSecurityLogs(logFilter, 50),
        staff.passwordResetLogs()
      ]);
      setFlaggedUsers(usersRes.data);
      setLogs(logsRes.data);
      setResetLogs(resetsRes.data || []);
    } catch (error) {
      console.error(error);
      // Fail silently or show toast, Alert is too intrusive on mount
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [logFilter]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleUnflag = async (userId) => {
    try {
        await staff.unflagUser(userId);
        Alert.alert('Success', 'User unflagged');
        fetchData();
    } catch (error) {
        Alert.alert('Error', 'Failed to unflag user');
    }
  };

  const handleForceReset = async () => {
    if (!resetEmail.trim()) {
      Alert.alert('Error', 'Enter a user email');
      return;
    }
    setForcingReset(true);
    try {
      await staff.forcePasswordReset({ email: resetEmail.trim() });
      Alert.alert('Success', 'Reset code sent');
      setResetEmail('');
      fetchData();
    } catch (error) {
      Alert.alert('Error', error?.response?.data?.error || 'Failed to force reset');
    } finally {
      setForcingReset(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString();
  };

  if (loading && !refreshing) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
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
        <Text style={styles.title}>Security Command Center</Text>
        <Text style={styles.subtitle}>Monitor threats, manage access, and review logs.</Text>
      </View>

      {/* ALERTS SECTION */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Security Alerts</Text>
        {flaggedUsers.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Ionicons name="shield-checkmark" size={48} color={tokens.colors.success} />
            <Text style={styles.emptyText}>No active security threats detected.</Text>
          </Card>
        ) : (
          flaggedUsers.map(user => (
            <Card key={user.user_id} style={styles.alertCard}>
              <View style={styles.alertHeader}>
                <Ionicons name="warning" size={24} color={tokens.colors.error} />
                <Text style={styles.alertTitle}>Flagged Account</Text>
              </View>
              <View style={styles.alertContent}>
                <Text style={styles.alertText}><Text style={styles.bold}>User:</Text> {user.full_name} ({user.phone_number})</Text>
                <Text style={styles.alertText}><Text style={styles.bold}>Reason:</Text> {user.flag_reason}</Text>
                <Text style={styles.alertText}><Text style={styles.bold}>Failed Attempts:</Text> {user.failed_login_attempts}</Text>
                <Text style={styles.alertText}><Text style={styles.bold}>Last Failure:</Text> {formatDate(user.last_failed_login)}</Text>
              </View>
              <Button 
                title="Unflag User" 
                variant="outline" 
                size="sm" 
                onPress={() => handleUnflag(user.user_id)}
                style={styles.actionButton}
              />
            </Card>
          ))
        )}
      </View>

      {/* LOGS SECTION */}
      <View style={styles.section}>
        <View style={styles.logsHeader}>
          <Text style={styles.sectionTitle}>Activity Logs</Text>
          <View style={styles.filterContainer}>
            {['security', 'login_failed', 'code_misuse', 'all'].map(filter => (
              <TouchableOpacity 
                key={filter} 
                style={[styles.filterChip, logFilter === filter && styles.activeFilter]}
                onPress={() => setLogFilter(filter)}
              >
                <Text style={[styles.filterText, logFilter === filter && styles.activeFilterText]}>
                  {filter.replace('_', ' ').toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {logs.length === 0 ? (
          <Text style={styles.noLogs}>No logs found for this filter.</Text>
        ) : (
          logs.map(log => (
            <View key={log.log_id} style={styles.logItem}>
              <View style={styles.logIcon}>
                <Ionicons 
                  name={log.action === 'login_failed' ? 'log-in' : log.action === 'code_misuse' ? 'keypad' : 'information-circle'} 
                  size={20} 
                  color={tokens.colors.textSecondary} 
                />
              </View>
              <View style={styles.logContent}>
                <View style={styles.logRow}>
                  <Text style={styles.logAction}>{log.action.toUpperCase().replace('_', ' ')}</Text>
                  <Text style={styles.logTime}>{formatDate(log.created_at)}</Text>
                </View>
                <Text style={styles.logDetails}>{log.details}</Text>
                {log.User && (
                  <Text style={styles.logUser}>User: {log.User.full_name} ({log.User.phone_number})</Text>
                )}
              </View>
            </View>
          ))
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Password Reset Logs</Text>
        <Card style={styles.resetCard}>
          <Input
            placeholder="Enter user email to force reset"
            value={resetEmail}
            onChangeText={setResetEmail}
            style={{ marginBottom: 12 }}
          />
          <Button
            title="Force Password Reset"
            variant="danger"
            loading={forcingReset}
            onPress={handleForceReset}
          />
        </Card>
        {resetLogs.length === 0 ? (
          <Text style={styles.noLogs}>No password reset activity.</Text>
        ) : (
          resetLogs.map((log) => (
            <View key={log.log_id} style={styles.logItem}>
              <View style={styles.logIcon}>
                <Ionicons name="key" size={20} color={tokens.colors.textSecondary} />
              </View>
              <View style={styles.logContent}>
                <View style={styles.logRow}>
                  <Text style={styles.logAction}>{log.status.toUpperCase()}</Text>
                  <Text style={styles.logTime}>{formatDate(log.created_at)}</Text>
                </View>
                <Text style={styles.logDetails}>{log.email || 'Unknown email'}</Text>
                {log.details ? <Text style={styles.logUser}>{log.details}</Text> : null}
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: tokens.colors.background,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: tokens.colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: tokens.colors.textSecondary,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: tokens.colors.text,
    marginBottom: 16,
  },
  emptyCard: {
    alignItems: 'center',
    padding: 32,
    borderStyle: 'dashed',
    borderWidth: 2,
    borderColor: tokens.colors.border,
    backgroundColor: 'transparent',
  },
  emptyText: {
    marginTop: 16,
    color: tokens.colors.textSecondary,
    fontSize: 16,
  },
  alertCard: {
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: tokens.colors.error,
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  alertTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: tokens.colors.error,
    marginLeft: 8,
  },
  alertContent: {
    marginBottom: 16,
  },
  alertText: {
    fontSize: 14,
    color: tokens.colors.text,
    marginBottom: 4,
  },
  bold: {
    fontWeight: 'bold',
  },
  actionButton: {
    alignSelf: 'flex-start',
  },
  logsHeader: {
    marginBottom: 16,
  },
  filterContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  activeFilter: {
    backgroundColor: tokens.colors.primary,
    borderColor: tokens.colors.primary,
  },
  filterText: {
    fontSize: 12,
    color: tokens.colors.textSecondary,
    fontWeight: '500',
  },
  activeFilterText: {
    color: '#fff',
  },
  logItem: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: tokens.colors.surface,
    marginBottom: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  logIcon: {
    marginRight: 16,
    marginTop: 2,
  },
  logContent: {
    flex: 1,
  },
  logRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  logAction: {
    fontSize: 14,
    fontWeight: 'bold',
    color: tokens.colors.text,
  },
  logTime: {
    fontSize: 12,
    color: tokens.colors.textSecondary,
  },
  logDetails: {
    fontSize: 14,
    color: tokens.colors.textSecondary,
    marginBottom: 4,
  },
  logUser: {
    fontSize: 12,
    color: tokens.colors.primary,
    fontStyle: 'italic',
  },
  resetCard: {
    marginBottom: 16,
  },
  noLogs: {
    textAlign: 'center',
    color: tokens.colors.textSecondary,
    fontStyle: 'italic',
    marginTop: 20,
  }
});
