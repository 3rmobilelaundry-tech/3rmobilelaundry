import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import { getTokens } from '../../theme/tokens';
import { Ionicons } from '@expo/vector-icons';

const tokens = getTokens();

export default function Header({ title, onMenuPress }) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= tokens.breakpoints.desktop;

  return (
    <View style={styles.container}>
      <View style={styles.left}>
        {!isDesktop && (
          <TouchableOpacity onPress={onMenuPress} style={styles.menuButton}>
            <Ionicons name="menu" size={24} color={tokens.colors.text} />
          </TouchableOpacity>
        )}
        <Text style={styles.title}>{title}</Text>
      </View>
      
      <View style={styles.right}>
        <TouchableOpacity style={styles.iconButton}>
          <Ionicons name="notifications-outline" size={22} color={tokens.colors.textSecondary} />
          <View style={styles.badge} />
        </TouchableOpacity>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>A</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 64,
    backgroundColor: tokens.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.spacing.lg,
    zIndex: 10,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuButton: {
    marginRight: tokens.spacing.md,
  },
  title: {
    fontSize: tokens.typography.sizes.lg,
    fontWeight: tokens.typography.weights.semibold,
    color: tokens.colors.text,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: {
    marginRight: tokens.spacing.lg,
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: tokens.colors.danger,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: tokens.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: tokens.colors.textInverted,
    fontWeight: 'bold',
  },
});
