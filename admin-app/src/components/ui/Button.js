import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { getTokens } from '../../theme/tokens';
import { Ionicons } from '@expo/vector-icons';

const tokens = getTokens();

export default function Button({ 
  title, 
  onPress, 
  variant = 'primary', // primary, secondary, outline, ghost, danger
  size = 'md', // sm, md, lg
  loading = false,
  disabled = false,
  icon,
  style,
  textStyle,
  ...props
}) {
  const getBackgroundColor = () => {
    if (disabled) return tokens.colors.surfaceAlt;
    switch (variant) {
      case 'primary': return tokens.colors.primary;
      case 'secondary': return tokens.colors.secondary;
      case 'danger': return tokens.colors.danger;
      case 'outline': return 'transparent';
      case 'ghost': return 'transparent';
      default: return tokens.colors.primary;
    }
  };

  const getTextColor = () => {
    if (disabled) return tokens.colors.textMuted;
    switch (variant) {
      case 'primary': return tokens.colors.textInverted;
      case 'secondary': return tokens.colors.textInverted;
      case 'danger': return tokens.colors.textInverted;
      case 'outline': return tokens.colors.primary;
      case 'ghost': return tokens.colors.textSecondary;
      default: return tokens.colors.textInverted;
    }
  };

  const getBorderColor = () => {
    if (disabled) return tokens.colors.border;
    if (variant === 'outline') return tokens.colors.primary;
    return 'transparent';
  };

  const getPadding = () => {
    switch (size) {
      case 'sm': return { paddingVertical: tokens.spacing.xs, paddingHorizontal: tokens.spacing.sm };
      case 'lg': return { paddingVertical: tokens.spacing.md, paddingHorizontal: tokens.spacing.xl };
      default: return { paddingVertical: tokens.spacing.sm, paddingHorizontal: tokens.spacing.lg };
    }
  };

  const getFontSize = () => {
    switch (size) {
      case 'sm': return tokens.typography.sizes.sm;
      case 'lg': return tokens.typography.sizes.lg;
      default: return tokens.typography.sizes.base;
    }
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.button,
        {
          backgroundColor: getBackgroundColor(),
          borderColor: getBorderColor(),
          ...getPadding(),
        },
        style
      ]}
      {...props}
    >
      {loading ? (
        <ActivityIndicator size="small" color={getTextColor()} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={getFontSize()} color={getTextColor()} style={{ marginRight: 8 }} />}
          <Text style={[
            styles.text,
            {
              color: getTextColor(),
              fontSize: getFontSize(),
            },
            textStyle
          ]}>
            {title}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: tokens.radius.md,
    borderWidth: 1,
  },
  text: {
    fontWeight: tokens.typography.weights.medium,
  },
});
