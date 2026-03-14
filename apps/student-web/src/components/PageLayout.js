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
      <View style={styles.headerWrapper}>
        <MainHeader user={user} title={title} showBack={showBack} />
      </View>
      
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
                style={{ flex: 1 }}
                contentContainerStyle={[
                    styles.scrollContent, 
                    noPadding && { paddingHorizontal: 0 },
                    // Ensure content doesn't hide under fixed header or bottom nav
                    { paddingTop: 100 + (noPadding ? 0 : 16), paddingBottom: 100 }
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
            <View style={{ flex: 1, paddingTop: 100, paddingBottom: 100 }}>
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
    // Ensure the container itself doesn't scroll
    ...Platform.select({
        web: {
            overflow: 'visible',
            height: 'auto',
            minHeight: '100vh',
        },
        default: {
            overflow: 'hidden',
        }
    })
  },
  headerWrapper: {
    position: Platform.OS === 'web' ? 'fixed' : 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 999,
    elevation: 5,
  },
  contentContainer: {
    flex: 1,
    // On web, we want to ensure the scrollbar is for this container
    ...Platform.select({
        web: {
            overflow: 'visible',
            height: 'auto',
            minHeight: '100%',
            display: 'flex',
            flexDirection: 'column'
        },
        default: {
            overflow: 'hidden',
        }
    })
  },
  scrollContent: {
    paddingHorizontal: 20,
    // PaddingTop and Bottom are handled inline to ensure safety
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100, // Push loading indicator down
  },
});
