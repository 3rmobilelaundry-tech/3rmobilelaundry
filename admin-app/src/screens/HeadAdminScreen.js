import React, { useState } from 'react';
import { Alert } from 'react-native';
import MainLayout from '../components/layout/MainLayout';
import OverviewScreen from './admin/OverviewScreen';
import StaffManagementScreen from './staff/StaffManagementScreen';
import OrdersScreen from './admin/OrdersScreen';
import UsersScreen from './admin/UsersScreen';
import CodesScreen from './admin/CodesScreen';
import PlansScreen from './admin/PlansScreen';
import LogsScreen from './admin/LogsScreen';
import SettingsScreen from './admin/SettingsScreen';
import SubscriptionsScreen from './admin/SubscriptionsScreen';
import PaymentsScreen from './admin/PaymentsScreen';
import NotificationsScreen from './admin/NotificationsScreen';
import AnalysisScreen from './admin/AnalysisScreen';
import IntegrationsScreen from './admin/IntegrationsScreen';
import SecurityScreen from './admin/SecurityScreen';
import CarouselScreen from './admin/CarouselScreen';
import ChatListScreen from './admin/ChatListScreen';
import { auth, clearAuthSession, setAuthToken } from '../services/api';

export default function HeadAdminScreen({ route, navigation }) {
  const { user, initialTab } = route.params || {};
  const [activeTab, setActiveTab] = useState(initialTab || 'Overview');

  const handleLogout = async () => {
    try {
      await auth.logout();
      await clearAuthSession();
      setAuthToken(null);
      Alert.alert('Logged Out', 'You have been logged out successfully.');
      navigation.replace('Login');
    } catch (error) {
      const message = error?.message || 'Unable to log out. Please try again.';
      Alert.alert('Logout Failed', message);
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'Overview': return <OverviewScreen />;
      case 'Chat': return <ChatListScreen />;
      case 'Users': return <UsersScreen currentUser={user} />;
      case 'Staff': return <StaffManagementScreen />;
      // Data Group
      case 'Plans': return <PlansScreen />;
      case 'Subscriptions': return <SubscriptionsScreen />;
      case 'Orders': return <OrdersScreen currentUser={user} />;
      case 'Payments': return <PaymentsScreen currentUser={user} />;
      case 'Notifications': return <NotificationsScreen />;
      // Other Top Level
      case 'Carousel': return <CarouselScreen />;
      case 'Codes': return <CodesScreen />;
      case 'Analysis': return <AnalysisScreen />;
      case 'Integrations': return <IntegrationsScreen />;
      case 'Security': return <SecurityScreen />;
      case 'Logs': return <LogsScreen />;
      case 'Settings': return <SettingsScreen />;
      default: return <OverviewScreen />;
    }
  };

  return (
    <MainLayout activeTab={activeTab} onTabChange={setActiveTab} title={activeTab} onLogout={handleLogout}>
      {renderContent()}
    </MainLayout>
  );
}
