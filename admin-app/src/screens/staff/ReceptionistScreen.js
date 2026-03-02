import React, { useState, useEffect } from 'react';
import { View, Text } from 'react-native';
import MainLayout from '../../components/layout/MainLayout';
import ReceptionistDashboard from './ReceptionistDashboard';
import OrdersScreen from '../admin/OrdersScreen';
import PaymentsScreen from '../admin/PaymentsScreen';
import CodeEntryScreen from './CodeEntryScreen';
import NotificationsScreen from '../admin/NotificationsScreen';
import { auth, setAuthToken, clearAuthSession, loadAuthSession, staff } from '../../services/api';

export default function ReceptionistScreen({ route, navigation }) {
  const { user } = route.params || {};
  const [activeTab, setActiveTab] = useState('Dashboard');
  const [sessionUser, setSessionUser] = useState(user || null);
  const [notificationBadge, setNotificationBadge] = useState(0);

  const receptionistMenuItems = [
    { id: 'Dashboard', label: 'Dashboard', icon: 'home-outline' },
    { id: 'Orders', label: 'Orders', icon: 'cart-outline' },
    { id: 'Payments', label: 'Payments', icon: 'card-outline' },
    { id: 'Codes', label: 'Codes', icon: 'code-slash-outline' },
    { id: 'Notifications', label: 'Notifications', icon: 'notifications-outline', badgeCount: notificationBadge },
  ];

  useEffect(() => {
    if (user) {
      setSessionUser(user);
    }
  }, [user]);

  useEffect(() => {
    let active = true;
    if (user) return () => {
      active = false;
    };
    const restoreSession = async () => {
      try {
        const { user: storedUser } = await loadAuthSession();
        if (!active) return;
        if (storedUser) {
          setSessionUser(storedUser);
        }
      } catch {}
    };
    restoreSession();
    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    let active = true;
    const refreshBadge = async () => {
      if (!sessionUser?.user_id) return;
      try {
        const res = await staff.listNotifications();
        if (!active) return;
        const count = res.data.filter((item) => {
          if (item.read_status === true) return false;
          if (item.type === 'broadcast') return true;
          if (!item.user_id) return true;
          return String(item.user_id) === String(sessionUser.user_id);
        }).length;
        setNotificationBadge(count);
      } catch {}
    };
    refreshBadge();
    return () => {
      active = false;
    };
  }, [sessionUser?.user_id, activeTab]);

  const handleLogout = async () => {
    try {
      await auth.logout();
      await clearAuthSession();
    } finally {
      setAuthToken(null);
      navigation.replace('Login');
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'Dashboard': 
        return <ReceptionistDashboard navigation={navigation} />;
      case 'Orders': 
        // Pass currentUser so OrdersScreen can apply restrictions
        return <OrdersScreen currentUser={sessionUser} />;
      case 'Payments': 
        return <PaymentsScreen currentUser={sessionUser} readOnly={false} />;
      case 'Codes': 
        return <CodeEntryScreen />;
      case 'Notifications':
        return <NotificationsScreen mode="staff" currentUser={sessionUser} titleOverride="Receptionist Notifications" />;
      default: 
        return <ReceptionistDashboard navigation={navigation} />;
    }
  };

  return (
    <MainLayout 
      activeTab={activeTab} 
      onTabChange={setActiveTab} 
      title={activeTab}
      menuItems={receptionistMenuItems}
      onLogout={handleLogout}
    >
      {renderContent()}
    </MainLayout>
  );
}
