import React, { useEffect, useState } from 'react';
import { View, StyleSheet, useWindowDimensions, ScrollView } from 'react-native';
import Sidebar from './Sidebar';
import Header from './Header';
import { getTokens } from '../../theme/tokens';
import { onAuthExpired } from '../../services/api';

const tokens = getTokens();

export default function MainLayout({ children, activeTab, onTabChange, title, menuItems, onLogout }) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= tokens.breakpoints.desktop;
  const [isSidebarOpen, setIsSidebarOpen] = useState(isDesktop);

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);
  
  useEffect(() => {
    if (!onLogout) return;
    const unsubscribe = onAuthExpired(() => {
      onLogout();
    });
    return unsubscribe;
  }, [onLogout]);

  return (
    <View style={styles.container}>
      {/* Sidebar - Desktop (Fixed) or Mobile (Overlay) */}
      {(isDesktop || isSidebarOpen) && (
        <View style={[styles.sidebarWrapper, !isDesktop && styles.sidebarOverlay]}>
           <Sidebar activeTab={activeTab} onTabChange={(tab) => {
             onTabChange(tab);
             if (!isDesktop) setIsSidebarOpen(false);
           }} menuItems={menuItems} onLogout={onLogout} />
        </View>
      )}

      {/* Main Content Area */}
      <View style={styles.main}>
        <Header title={title || activeTab} onMenuPress={toggleSidebar} />
        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          {children}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: tokens.colors.bg,
    height: '100%',
  },
  sidebarWrapper: {
    zIndex: 20,
    height: '100%',
  },
  sidebarOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  main: {
    flex: 1,
    height: '100%',
    flexDirection: 'column',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: tokens.spacing.lg,
    paddingBottom: tokens.spacing.xxl,
  },
});
