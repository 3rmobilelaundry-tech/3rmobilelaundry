import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image } from 'react-native';
import { getTokens } from '../../theme/tokens';
import { Ionicons } from '@expo/vector-icons';

const tokens = getTokens();

const MENU_ITEMS = [
  { id: 'Overview', label: 'Overview', icon: 'grid-outline' },
  { id: 'Chat', label: 'Chat', icon: 'chatbubbles-outline' },
  { id: 'Users', label: 'Users', icon: 'people-outline' },
  { id: 'Staff', label: 'Staff', icon: 'briefcase-outline' },
  {
    id: 'Data',
    label: 'Data',
    icon: 'server-outline',
    children: [
      { id: 'Plans', label: 'Plans', icon: 'pricetag-outline' },
      { id: 'Subscriptions', label: 'Subscriptions', icon: 'repeat-outline' },
      { id: 'Orders', label: 'Orders', icon: 'cart-outline' },
      { id: 'Payments', label: 'Payments', icon: 'card-outline' },
      { id: 'Notifications', label: 'Notifications', icon: 'notifications-outline' },
    ]
  },
  { id: 'Carousel', label: 'Carousel', icon: 'images-outline' },
  { id: 'Codes', label: 'Code', icon: 'code-slash-outline' },
  { id: 'Analysis', label: 'Analysis', icon: 'bar-chart-outline' },
  { id: 'Integrations', label: 'Integrations', icon: 'git-network-outline' },
  { id: 'Security', label: 'Security', icon: 'shield-checkmark-outline' },
  { id: 'Logs', label: 'Logs', icon: 'document-text-outline' },
  { id: 'Settings', label: 'Settings', icon: 'settings-outline' },
];

export default function Sidebar({ activeTab, onTabChange, isCollapsed, menuItems = MENU_ITEMS, onLogout }) {
  const [expandedItems, setExpandedItems] = useState(['Data']);

  useEffect(() => {
    // Auto-expand parent if child is active
    menuItems.forEach(item => {
      if (item.children && item.children.some(child => child.id === activeTab)) {
        setExpandedItems(prev => prev.includes(item.id) ? prev : [...prev, item.id]);
      }
    });
  }, [activeTab, menuItems]);

  const toggleExpand = (id) => {
    setExpandedItems(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const renderMenuItem = (item, level = 0) => {
    const isParent = !!item.children;
    const isExpanded = expandedItems.includes(item.id);
    const isActive = activeTab === item.id;
    const hasActiveChild = isParent && item.children.some(child => child.id === activeTab);
    const badgeCount = Number(item.badgeCount || 0);
    
    // For collapsed mode, we only show top-level icons or handle it differently.
    // Simplification: if collapsed, only show top level items, clicking parent expands it?
    // Better: If collapsed, maybe don't support nested structure well or just show icons.
    // Let's assume basic behavior: show icon. If parent, clicking it might expand or do nothing in collapsed mode.
    // Current requirement is sidebar menu structure. I will stick to standard logic.

    return (
      <React.Fragment key={item.id}>
        <TouchableOpacity
          style={[
            styles.menuItem, 
            isActive && styles.menuItemActive,
            level > 0 && styles.menuItemChild,
            hasActiveChild && !isExpanded && styles.menuItemActiveParent // Optional visual cue
          ]}
          onPress={() => {
            if (isParent) {
              toggleExpand(item.id);
            } else {
              onTabChange(item.id);
            }
          }}
        >
          <View style={[styles.iconContainer, level > 0 && { marginLeft: 12 }]}>
             <Ionicons
              name={item.icon}
              size={22}
              color={(isActive || hasActiveChild) ? tokens.colors.primary : tokens.colors.sidebarText}
              style={styles.icon}
            />
          </View>
         
          {!isCollapsed && (
            <>
              <Text style={[styles.menuText, (isActive || hasActiveChild) && styles.menuTextActive, { flex: 1 }]}>
                {item.label}
              </Text>
              {badgeCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{badgeCount > 99 ? '99+' : String(badgeCount)}</Text>
                </View>
              )}
              {isParent && (
                <Ionicons 
                  name={isExpanded ? 'chevron-down-outline' : 'chevron-forward-outline'} 
                  size={16} 
                  color={tokens.colors.textMuted} 
                />
              )}
            </>
          )}
        </TouchableOpacity>
        
        {!isCollapsed && isParent && isExpanded && (
          <View style={styles.childrenContainer}>
            {item.children.map(child => renderMenuItem(child, level + 1))}
          </View>
        )}
      </React.Fragment>
    );
  };

  return (
    <View style={[styles.container, isCollapsed && styles.collapsed]}>
      <View style={styles.logoContainer}>
        <View style={styles.logoIcon}>
            <Image 
              source={require('../../../assets/logo.png')} 
              style={styles.logoImage}
              resizeMode="contain"
            />
        </View>
        {!isCollapsed && <Text style={styles.logoText}>3R Admin</Text>}
      </View>

      <ScrollView style={styles.menuContainer} showsVerticalScrollIndicator={false}>
        {menuItems.map(item => renderMenuItem(item))}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.menuItem} onPress={onLogout}>
            <Ionicons name="log-out-outline" size={22} color={tokens.colors.danger} style={styles.icon} />
            {!isCollapsed && <Text style={[styles.menuText, { color: tokens.colors.danger }]}>Logout</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 260,
    backgroundColor: tokens.colors.sidebar,
    height: '100%',
    paddingVertical: tokens.spacing.xl,
    borderRightWidth: 1,
    borderRightColor: tokens.colors.sidebarActive,
  },
  collapsed: {
    width: 80,
    alignItems: 'center',
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: tokens.spacing.xl,
    marginBottom: tokens.spacing.xxl,
    justifyContent: 'center',
  },
  logoIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    overflow: 'hidden',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  logoText: {
    fontSize: tokens.typography.sizes.xl,
    fontWeight: tokens.typography.weights.bold,
    color: tokens.colors.sidebarText,
  },
  menuContainer: {
    flex: 1,
    paddingHorizontal: tokens.spacing.md,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.md,
    borderRadius: tokens.radius.md,
    marginBottom: tokens.spacing.xs,
  },
  menuItemActive: {
    backgroundColor: tokens.colors.sidebarActive,
  },
  menuItemChild: {
    paddingVertical: tokens.spacing.sm,
  },
  menuItemActiveParent: {
     backgroundColor: 'rgba(79, 70, 229, 0.05)', // Subtle highlight for parent of active child
  },
  childrenContainer: {
    marginBottom: tokens.spacing.xs,
  },
  iconContainer: {
    width: 24,
    alignItems: 'center',
    marginRight: 12,
  },
  icon: {
    // marginRight: 12, // Removed as it's now handled by iconContainer margin
  },
  menuText: {
    fontSize: tokens.typography.sizes.base,
    color: tokens.colors.textMuted,
    fontWeight: tokens.typography.weights.medium,
  },
  menuTextActive: {
    color: tokens.colors.sidebarText,
    fontWeight: tokens.typography.weights.semibold,
  },
  badge: {
    minWidth: 22,
    paddingHorizontal: 6,
    height: 20,
    borderRadius: 10,
    backgroundColor: tokens.colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  badgeText: {
    color: 'white',
    fontSize: tokens.typography.sizes.xs,
    fontWeight: tokens.typography.weights.semibold,
  },
  footer: {
    paddingHorizontal: tokens.spacing.md,
    marginTop: 'auto',
  }
});
