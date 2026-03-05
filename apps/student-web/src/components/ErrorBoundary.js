import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { logFrontError } from '../services/api';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    if (typeof console !== 'undefined') {
      console.error('ComponentError', { message: error?.message }, errorInfo);
    }
    try {
      logFrontError({
        source: 'user-web',
        message: error?.message || 'UI crash',
        stack: error?.stack,
        context: { componentStack: errorInfo?.componentStack }
      }).catch(() => {});
    } catch {}
    this.setState({ error, errorInfo });
  }
  componentDidUpdate(prevProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null, errorInfo: null });
    }
  }
  resetError = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (typeof this.props.onReset === 'function') {
      this.props.onReset();
    }
  }
  render() {
    if (this.state.hasError) {
      const fallback = this.props.fallback;
      if (typeof fallback === 'function') {
        return fallback({ error: this.state.error, resetError: this.resetError });
      }
      if (fallback) return fallback;
      const view = (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <Text style={{ fontWeight: 'bold', fontSize: 18, marginBottom: 8 }}>Something went wrong</Text>
          <Text style={{ color: '#6B7280', marginBottom: 16 }}>Try again to continue</Text>
          <TouchableOpacity onPress={this.resetError}>
            <Text style={{ color: '#2563EB', fontWeight: 'bold' }}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
      return view;
    }
    return this.props.children;
  }
}
