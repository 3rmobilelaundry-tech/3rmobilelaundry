import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { getTokens } from '../../theme/tokens';

const tokens = getTokens();

export default function Input({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  error,
  style,
  multiline,
  numberOfLines,
  ...props
}) {
  return (
    <View style={[styles.container, style]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        style={[
          styles.input,
          error && styles.inputError,
          multiline && styles.multilineInput
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={tokens.colors.textMuted}
        secureTextEntry={secureTextEntry}
        multiline={multiline}
        numberOfLines={numberOfLines}
        {...props}
      />
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: tokens.spacing.md,
  },
  label: {
    fontSize: tokens.typography.sizes.sm,
    fontWeight: tokens.typography.weights.medium,
    color: tokens.colors.textSecondary,
    marginBottom: tokens.spacing.xs,
  },
  input: {
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.sm,
    fontSize: tokens.typography.sizes.base,
    color: tokens.colors.text,
  },
  inputError: {
    borderColor: tokens.colors.danger,
  },
  multilineInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  errorText: {
    fontSize: tokens.typography.sizes.xs,
    color: tokens.colors.danger,
    marginTop: tokens.spacing.xs,
  },
});
