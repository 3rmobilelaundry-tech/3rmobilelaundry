import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Linking, Animated, Image, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../constants/theme';
import { student, normalizeApiError } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSync } from '../context/SyncContext';
import PageLayout from '../components/PageLayout';

export default function ProfileScreen({ navigation, route }) {
  const { user: initialUser } = route.params || {};
  const insets = useSafeAreaInsets();
  const { logout } = useAuth();
  const { lastEvent } = useSync();

  const [user, setUser] = useState(initialUser);
  const [loading, setLoading] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [fade] = useState(new Animated.Value(0));
  const [avatarCacheKey, setAvatarCacheKey] = useState('');
  const [avatarLoadError, setAvatarLoadError] = useState(false);
  const buildAvatarUri = useCallback((uri, cacheKey) => {
    if (!uri) return '';
    if (!cacheKey) return uri;
    const joiner = uri.includes('?') ? '&' : '?';
    return `${uri}${joiner}v=${cacheKey}`;
  }, []);
  const avatarCacheSeed = useMemo(() => (
    avatarCacheKey || user?.avatar_updated_at || user?.updated_at || ''
  ), [avatarCacheKey, user?.avatar_updated_at, user?.updated_at]);
  const avatarUri = useMemo(() => buildAvatarUri(user?.avatar_url, avatarCacheSeed), [buildAvatarUri, user?.avatar_url, avatarCacheSeed]);

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 280, useNativeDriver: true }).start();
  }, []);
  useEffect(() => {
    setAvatarLoadError(false);
  }, [avatarUri]);

  const fetchProfile = async (isRefresh = false) => {
    if (!user?.user_id) return;
    try {
      if (isRefresh) setRefreshing(true);
      const res = await student.getProfile(user.user_id);
      setUser(res.data);
      AsyncStorage.setItem('userData', JSON.stringify(res.data));
      setError('');
    } catch (err) {
      const normalized = normalizeApiError(err);
      console.error('Failed to refresh profile', normalized);
      if (normalized.status === 401 || normalized.status === 403 || normalized.status === 404) {
        await logout();
        if (Platform.OS === 'web') {
          window.location.reload();
        }
        return;
      }
      if (isRefresh) setError('Failed to update profile');
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      const hydrate = async () => {
        const storedUser = await AsyncStorage.getItem('userData');
        const parsedUser = storedUser ? JSON.parse(storedUser) : null;
        if (parsedUser?.user_id && isActive) {
          setUser(parsedUser);
        }
        const userId = parsedUser?.user_id || user?.user_id;
        if (userId) {
          const cacheKey = await AsyncStorage.getItem(`avatar_cache_buster_${userId}`);
          if (isActive) setAvatarCacheKey(cacheKey || '');
        }
      };
      hydrate();
      fetchProfile();
      return () => {
        isActive = false;
      };
    }, [user?.user_id])
  );

  // Real-time Sync
  useEffect(() => {
    if (lastEvent && (lastEvent.type === 'user_updated' || lastEvent.type === 'poll_refresh')) {
        console.log('ProfileScreen: Sync event, refreshing...');
        fetchProfile();
    }
  }, [lastEvent]);

  const onRefresh = () => {
    fetchProfile(true);
  };

  const handleLogout = async () => {
    if (logoutLoading) return; // Prevent double-taps

    const performLogout = async () => {
      setLogoutLoading(true);
      try {
        console.log('Initiating logout...');
        await logout();
        console.log('Logout successful');
        if (Platform.OS === 'web') {
          window.location.reload();
        }
      } catch (e) {
        console.error('Logout error', e);
        Alert.alert('Error', 'Failed to logout properly');
        setLogoutLoading(false);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to logout?')) {
        performLogout();
      }
    } else {
      Alert.alert('Logout', 'Are you sure you want to logout?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: performLogout
        }
      ]);
    }
  };

  if (!user) {
    return (
      <View style={[styles.mainContainer, { justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <PageLayout 
      user={user} 
      refreshing={refreshing} 
      onRefresh={onRefresh}
      noPadding
    >
      <Animated.View style={[styles.content, { opacity: fade }]}>
        <View style={styles.header}>
            <Text style={styles.headerTitle}>Profile</Text>
        </View>

        <View style={styles.card} accessibilityRole="summary">
          <View style={styles.avatar}>
            {avatarUri && !avatarLoadError ? (
              <Image source={{ uri: avatarUri }} style={styles.avatarImage} resizeMode="cover" onError={() => setAvatarLoadError(true)} />
            ) : (
              <View style={[styles.avatarImage, { backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center' }]}>
                <Ionicons name="person" size={40} color={theme.colors.textSecondary} />
              </View>
            )}
            {refreshing && avatarUri ? (
              <View style={styles.avatarOverlay}>
                <ActivityIndicator color="#fff" size="small" />
              </View>
            ) : null}
            <TouchableOpacity 
              style={styles.editIcon}
              onPress={() => navigation.navigate('ProfileEdit', { user })}
              accessibilityRole="button"
              accessibilityLabel="Edit Profile"
            >
              <Ionicons name="pencil" size={16} color="white" />
            </TouchableOpacity>
          </View>
          <Text style={styles.name}>{user.full_name}</Text>
          <Text style={styles.phone}>{user.phone_number}</Text>
          <View style={styles.statRow}>
             {/* Stats would go here */}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('Orders')}>
            <View style={[styles.iconBox, { backgroundColor: theme.colors.primary + '15' }]}>
              <Ionicons name="receipt" size={20} color={theme.colors.primary} />
            </View>
            <Text style={styles.menuText}>My Orders</Text>
            <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('ChatList', { user })}>
            <View style={[styles.iconBox, { backgroundColor: theme.colors.primary + '15' }]}>
              <Ionicons name="chatbubbles" size={20} color={theme.colors.primary} />
            </View>
            <Text style={styles.menuText}>Messages</Text>
            <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('Plan')}>
            <View style={[styles.iconBox, { backgroundColor: theme.colors.secondary + '15' }]}>
               <Ionicons name="card" size={20} color={theme.colors.secondary} />
            </View>
            <Text style={styles.menuText}>Subscription Plan</Text>
            <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('Codes')}>
            <View style={[styles.iconBox, { backgroundColor: '#10B98115' }]}>
               <Ionicons name="qr-code" size={20} color="#10B981" />
            </View>
             <Text style={styles.menuText}>My Codes</Text>
             <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Support</Text>
          <TouchableOpacity style={styles.menuItem} onPress={() => Linking.openURL('https://wa.me/2348155529957')}>
            <View style={[styles.iconBox, { backgroundColor: '#25D36615' }]}>
              <Ionicons name="logo-whatsapp" size={20} color="#25D366" />
            </View>
            <Text style={styles.menuText}>Help Center</Text>
            <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity 
          style={[styles.logoutButton, logoutLoading && { opacity: 0.7 }]} 
          onPress={handleLogout}
          disabled={logoutLoading}
        >
          {logoutLoading ? (
            <ActivityIndicator size="small" color="#EF4444" />
          ) : (
            <Text style={styles.logoutText}>LOGOUT</Text>
          )}
        </TouchableOpacity>
        
        <Text style={styles.version}>Version 1.0.0</Text>
      </Animated.View>
    </PageLayout>
  );
}

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  header: {
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: 20,
    marginBottom: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  avatar: {
    position: 'relative',
    marginBottom: 16,
  },
  avatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.colors.background,
  },
  avatarOverlay: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(15,23,42,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editIcon: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: theme.colors.primary,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.colors.surface,
  },
  name: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  phone: {
    fontSize: 14,
    color: theme.colors.textTertiary,
  },
  statRow: {
    flexDirection: 'row',
    marginTop: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginBottom: 12,
    marginLeft: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    padding: 16,
    borderRadius: theme.borderRadius.md,
    marginBottom: 12,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  menuText: {
    flex: 1,
    fontSize: 16,
    color: theme.colors.textPrimary,
    fontWeight: '500',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: theme.borderRadius.md,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FEE2E2',
    marginBottom: 30,
  },
  logoutText: {
    color: '#EF4444',
    fontSize: 16,
    fontWeight: '600',
  },
  version: {
    textAlign: 'center',
    color: theme.colors.textTertiary,
    fontSize: 12,
    marginBottom: 20,
  },
});
