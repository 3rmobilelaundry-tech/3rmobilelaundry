import React from 'react';
import { View, ScrollView, RefreshControl, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import MainHeader from './MainHeader';
import { theme } from '../constants/theme';

export default function PageLayout({ 
  children, 
  user, 
  loading, 
  refreshing, 
  onRefresh, 
  title, 
  showBack,
  noPadding,
  background,
  scrollable = true
}) {
  return (
    <View style={styles.container}>
      {/* Fixed Header */}
      <MainHeader user={user} title={title} showBack={showBack} />
      
      {/* Fixed Background */}
      {background}

      {/* Scrollable Content */}
      <View style={styles.contentContainer}>
        {loading ? (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
        ) : scrollable ? (
            <ScrollView 
                contentContainerStyle={[
                    styles.scrollContent, 
                    noPadding && { paddingHorizontal: 0, paddingTop: 0 }
                ]}
                refreshControl={
                    onRefresh ? (
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />
                    ) : undefined
                }
                showsVerticalScrollIndicator={Platform.OS === 'web'}
            >
                {children}
            </ScrollView>
        ) : (
            <View style={{ flex: 1 }}>
                {children}
            </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  contentContainer: {
    flex: 1,
    // On web, we want to ensure the scrollbar is for this container
    ...Platform.select({
        web: {
            overflowY: 'auto',
            height: '100%',
        },
        default: {
            overflow: 'hidden',
        }
    })
  },
  scrollContent: {
    paddingBottom: 40, // Space at bottom
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
