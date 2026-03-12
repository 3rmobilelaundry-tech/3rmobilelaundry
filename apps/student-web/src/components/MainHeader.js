import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { theme } from '../constants/theme';

const getGreeting = () => {
  const hours = new Date().getHours();
  if (hours < 12) return 'Good Morning';
  if (hours < 18) return 'Good Afternoon';
  return 'Good Evening';
};

export default function MainHeader({ user, title, showBack }) {
  const navigation = useNavigation();
  const greeting = useMemo(() => getGreeting(), []);
  const [avatarCacheKey, setAvatarCacheKey] = useState('');
  const [avatarLoadError, setAvatarLoadError] = useState(false);

  useEffect(() => {
    if (user?.user_id) {
        AsyncStorage.getItem(`avatar_cache_buster_${user.user_id}`).then(val => {
            if (val) setAvatarCacheKey(val);
        });
    }
  }, [user?.user_id]);

  const avatarUri = useMemo(() => {
    if (!user?.avatar_url) return null;
    if (avatarCacheKey) {
        return `${user.avatar_url}${user.avatar_url.includes('?') ? '&' : '?'}v=${avatarCacheKey}`;
    }
    return user.avatar_url;
  }, [user?.avatar_url, avatarCacheKey]);

  return (
    <View style={styles.headerContainer}>
      <View style={styles.headerContent}>
        {showBack ? (
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                <Ionicons name="arrow-back" size={24} color={theme.colors.text.primary} />
            </TouchableOpacity>
        ) : null}
        
        <View style={styles.headerInfo}>
            {title ? (
                <Text style={styles.pageTitle}>{title}</Text>
            ) : (
                <>
                    <View style={styles.greetingRow}>
                        <Ionicons name="sunny-outline" size={14} color={theme.colors.text.secondary} />
                        <Text style={styles.greeting}>{greeting}</Text>
                    </View>
                    <Text style={styles.userName} numberOfLines={1}>
                        {user?.full_name?.split(' ')[0] || 'User'}!
                    </Text>
                    <Text style={styles.institution} numberOfLines={1}>
                        {user?.school || 'Student'}
                    </Text>
                </>
            )}
        </View>

        <TouchableOpacity 
            onPress={() => navigation.navigate('Profile', { user })} 
            style={styles.profileBtn}
            activeOpacity={0.8}
        >
            <View style={styles.profileBadge}>
                {avatarUri && !avatarLoadError ? (
                    <Image
                        source={{ uri: avatarUri }}
                        style={styles.profileAvatar}
                        resizeMode="cover"
                        onError={() => setAvatarLoadError(true)}
                    />
                ) : (
                    <Ionicons name="person-outline" size={20} color={theme.colors.primary} />
                )}
            </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    backgroundColor: theme.colors.surface,
    paddingTop: Platform.OS === 'ios' ? 48 : 16, // Safe area
    paddingBottom: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
    zIndex: 100,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 50,
  },
  headerInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  backBtn: {
    marginRight: 12,
    padding: 4,
  },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  greeting: {
    fontSize: 12,
    color: theme.colors.text.secondary,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  userName: {
    fontSize: 20,
    color: theme.colors.text.primary,
    fontWeight: '800',
    lineHeight: 24,
  },
  pageTitle: {
    fontSize: 20,
    color: theme.colors.text.primary,
    fontWeight: '800',
  },
  institution: {
    fontSize: 12,
    color: theme.colors.primary,
    fontWeight: '600',
  },
  profileBtn: {
    padding: 4,
  },
  profileBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    overflow: 'hidden',
  },
  profileAvatar: {
    width: 40,
    height: 40,
  },
});
