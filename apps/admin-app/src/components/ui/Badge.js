import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getTokens } from '../../theme/tokens';

const tokens = getTokens();

export default function Badge({ children, variant = 'info', style }) {
  const getColors = () => {
    switch (variant) {
      case 'success': return { bg: '#D1FAE5', text: '#065F46' };
      case 'warning': return { bg: '#FEF3C7', text: '#92400E' };
      case 'danger': return { bg: '#FEE2E2', text: '#B91C1C' };
      case 'info': return { bg: '#DBEAFE', text: '#1E40AF' };
      case 'neutral': return { bg: '#F3F4F6', text: '#374151' };
      default: return { bg: '#DBEAFE', text: '#1E40AF' };
    }
  };

  const colors = getColors();

  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }, style]}>
      <Text style={[styles.text, { color: colors.text }]}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: 2,
    borderRadius: tokens.radius.full,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: tokens.typography.sizes.xs,
    fontWeight: tokens.typography.weights.medium,
    textTransform: 'uppercase',
  },
});
