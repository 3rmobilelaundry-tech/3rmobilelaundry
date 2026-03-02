import 'react-native-gesture-handler';
import React, { useCallback, useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Platform, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { theme } from './src/constants/theme';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { SyncProvider } from './src/context/SyncContext';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync().catch(() => {});

if (Platform.OS !== 'web') {
  require('react-native-reanimated');
}
import LoginScreen from './src/screens/LoginScreen';
import SignUpScreen from './src/screens/SignUpScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import BookPickupScreen from './src/screens/BookPickupScreen';
import HomeScreen from './src/screens/HomeScreen';
import OrdersScreen from './src/screens/OrdersScreen';
import AlertsScreen from './src/screens/AlertsScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import ProfileEditScreen from './src/screens/ProfileEditScreen';
import CodesScreen from './src/screens/CodesScreen';
import OrderDetailsScreen from './src/screens/OrderDetailsScreen';
import ChatScreen from './src/screens/ChatScreen';
import ChatListScreen from './src/screens/ChatListScreen';
import PlanScreen from './src/screens/PlanScreen';
import PlanPaymentScreen from './src/screens/PlanPaymentScreen';
import BankTransferScreen from './src/screens/BankTransferScreen';
import BankTransferWaitingScreen from './src/screens/BankTransferWaitingScreen';
import ErrorBoundary from './src/components/ErrorBoundary';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

if (typeof window !== 'undefined') {
  // Unregister all service workers to prevent stale cache issues
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function(registrations) {
      for(let registration of registrations) {
        console.log('UserApp: Unregistering Service Worker:', registration);
        registration.unregister();
      }
    });
  }

  window.addEventListener('error', (e) => {
    try {
      fetch('/admin/front-logs', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ source: 'user-web', message: e.message, stack: e.error?.stack, href: window.location.href })
      }).catch(() => {});
    } catch {}
  });
  window.addEventListener('unhandledrejection', (e) => {
    try {
      const msg = e.reason?.message || String(e.reason);
      const stack = e.reason?.stack;
      fetch('/admin/front-logs', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ source: 'user-web', message: msg, stack, href: window.location.href })
      }).catch(() => {});
    } catch {}
  });
}

function MainTabs({ route }) {
  const { user } = route.params || {};
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.colors.secondary,
        tabBarInactiveTintColor: theme.colors.textTertiary,
        tabBarStyle: { height: 60, paddingBottom: 8, backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border },
        tabBarIcon: ({ color, size }) => {
          const map = {
            Home: 'home',
            Orders: 'cube',
            Codes: 'qr-code',
            Alerts: 'notifications',
            Profile: 'person',
          };
          return <Ionicons name={map[route.name]} size={22} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} initialParams={{ user }} />
      <Tab.Screen name="Orders" component={OrdersScreen} initialParams={{ user }} />
      <Tab.Screen name="Codes" component={CodesScreen} initialParams={{ user }} />
      <Tab.Screen name="Alerts" component={AlertsScreen} initialParams={{ user }} />
      <Tab.Screen name="Profile" component={ProfileScreen} initialParams={{ user }} />
    </Tab.Navigator>
  );
}

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="Login">
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="SignUp" component={SignUpScreen} />
    </Stack.Navigator>
  );
}

function AppStack({ user, initialRouteName, initialRouteParams }) {
  return (
    <Stack.Navigator initialRouteName={initialRouteName || 'MainTabs'}>
      <Stack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} initialParams={{ user }} />
      <Stack.Screen name="Dashboard" component={DashboardScreen} />
      <Stack.Screen
        name="BookPickup"
        component={BookPickupScreen}
        options={({ route }) => ({
          title: route?.params?.mode === 'emergency' ? 'Emergency Laundry' : 'Book Pickup'
        })}
      />
      <Stack.Screen name="ProfileEdit" component={ProfileEditScreen} options={{ title: 'Edit Profile' }} />
      <Stack.Screen name="OrderDetails" component={OrderDetailsScreen} options={{ title: 'Order Details' }} />
      <Stack.Screen name="Chat" component={ChatScreen} options={{ title: 'Chat' }} />
      <Stack.Screen name="ChatList" component={ChatListScreen} options={{ title: 'Messages' }} />
      <Stack.Screen name="Plan" component={PlanScreen} options={{ title: 'Subscription Plans' }} initialParams={initialRouteParams} />
      <Stack.Screen name="PlanPayment" component={PlanPaymentScreen} options={{ title: 'Payment Method' }} />
      <Stack.Screen name="BankTransfer" component={BankTransferScreen} options={{ title: 'Bank Transfer' }} />
      <Stack.Screen name="BankTransferWaiting" component={BankTransferWaitingScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}

function AppNav() {
  const { isLoading, userToken, userData } = useAuth();
  const [initialRouteName, setInitialRouteName] = useState(null);
  const [initialRouteParams, setInitialRouteParams] = useState(null);
  const [initialRouteReady, setInitialRouteReady] = useState(false);

  useEffect(() => {
    console.log(`[UserApp] Auth State: isLoading=${isLoading}, hasToken=${!!userToken}`);
  }, [isLoading, userToken]);

  useEffect(() => {
    let active = true;
    const loadRoute = async () => {
      if (!userToken) {
        if (active) {
          setInitialRouteName(null);
          setInitialRouteParams(null);
          setInitialRouteReady(true);
        }
        return;
      }
      setInitialRouteReady(false);
      try {
        const routeName = await AsyncStorage.getItem('postLoginRoute');
        const paramsRaw = await AsyncStorage.getItem('postLoginParams');
        if (!active) return;
        setInitialRouteName(routeName);
        setInitialRouteParams(paramsRaw ? JSON.parse(paramsRaw) : null);
      } catch (e) {
        if (!active) return;
        setInitialRouteName(null);
        setInitialRouteParams(null);
      } finally {
        try {
          await AsyncStorage.removeItem('postLoginRoute');
          await AsyncStorage.removeItem('postLoginParams');
        } catch (e) {}
        if (active) setInitialRouteReady(true);
      }
    };
    loadRoute();
    return () => {
      active = false;
    };
  }, [userToken]);

  const onLayoutRootView = useCallback(async () => {
    if (!isLoading) {
      console.log('[UserApp] App Ready, hiding splash...');
      try {
        await SplashScreen.hideAsync();
        console.log('[UserApp] Splash hidden successfully');
      } catch (e) {
        console.warn('[UserApp] Failed to hide splash:', e);
      }
    }
  }, [isLoading]);

  if (isLoading || !initialRouteReady) {
    console.log('[UserApp] Waiting for auth...');
    return null;
  }

  return (
    <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
      <NavigationContainer>
        <ErrorBoundary resetKey={`${userToken || 'guest'}:${initialRouteName || 'main'}`}>
          {userToken ? (
            <AppStack user={userData} initialRouteName={initialRouteName} initialRouteParams={initialRouteParams} />
          ) : (
            <AuthStack />
          )}
        </ErrorBoundary>
      </NavigationContainer>
    </View>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <SyncProvider>
        <AppNav />
      </SyncProvider>
    </AuthProvider>
  );
}
