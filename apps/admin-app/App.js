import 'react-native-gesture-handler';
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import * as SplashScreen from 'expo-splash-screen';
import WelcomeScreen from './src/screens/WelcomeScreen';
import LoginScreen from './src/screens/LoginScreen';
import SignupScreen from './src/screens/SignupScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import ScanCodeScreen from './src/screens/ScanCodeScreen';
import HeadAdminScreen from './src/screens/HeadAdminScreen';
import ReceptionistScreen from './src/screens/staff/ReceptionistScreen';
import WasherScreen from './src/screens/staff/WasherScreen';
import RiderScreen from './src/screens/staff/RiderScreen';
import ChatScreen from './src/screens/ChatScreen';
import ErrorBoundary from './src/components/ErrorBoundary';
import { SyncProvider } from './src/context/SyncContext';
import { Platform } from 'react-native';
import { getToken } from './src/services/api';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync().catch(() => {});

if (Platform.OS !== 'web') {
  require('react-native-reanimated');
}

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  // Unregister all service workers to prevent stale cache issues
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function(registrations) {
      for(let registration of registrations) {
        console.log('AdminApp: Unregistering Service Worker:', registration);
        registration.unregister();
      }
    });
  }

  if (typeof window.addEventListener === 'function') {
    const sendFrontLog = (payload) => {
      const token = getToken();
      if (!token) return;
      try {
        fetch('/admin/front-logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload)
        }).catch(() => {});
      } catch {}
    };
    window.addEventListener('error', (e) => {
      sendFrontLog({ source: 'admin-web', message: e.message, stack: e.error?.stack, href: window.location.href });
    });
    window.addEventListener('unhandledrejection', (e) => {
      const msg = e.reason?.message || String(e.reason);
      const stack = e.reason?.stack;
      sendFrontLog({ source: 'admin-web', message: msg, stack, href: window.location.href });
    });
  }
}

const Stack = createStackNavigator();

export default function App() {
  const [appIsReady, setAppIsReady] = React.useState(false);

  React.useEffect(() => {
    async function prepare() {
      try {
        console.log('[AdminApp] Prepare: Starting boot sequence...');
        // Artificial delay for splash screen to be visible
        await new Promise(resolve => setTimeout(resolve, 500));
        console.log('[AdminApp] Prepare: Delay complete');
      } catch (e) {
        console.warn('[AdminApp] Prepare Error:', e);
      } finally {
        console.log('[AdminApp] Prepare: Setting appIsReady=true');
        setAppIsReady(true);
      }
    }
    prepare();
  }, []);

  const onLayoutRootView = React.useCallback(async () => {
    if (appIsReady) {
      console.log('[AdminApp] Root Layout: Hiding splash...');
      try {
        await SplashScreen.hideAsync();
        console.log('[AdminApp] Splash hidden successfully');
      } catch (e) {
        console.warn('[AdminApp] Failed to hide splash:', e);
      }
    }
  }, [appIsReady]);

  if (!appIsReady) {
    return null;
  }

  return (
    <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
      <NavigationContainer>
        <ErrorBoundary
          fallback={
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
              <Text style={{ fontWeight: 'bold', fontSize: 18, marginBottom: 8 }}>Something went wrong</Text>
              <Text style={{ color: '#6B7280', marginBottom: 16 }}>Reload the page or try again later</Text>
              <TouchableOpacity onPress={() => { if (typeof window !== 'undefined') window.location.reload(); }}>
                <Text style={{ color: '#2563EB', fontWeight: 'bold' }}>Reload</Text>
              </TouchableOpacity>
            </View>
          }
        >
          <SyncProvider>
            <Stack.Navigator initialRouteName="Welcome">
              <Stack.Screen name="Welcome" component={WelcomeScreen} options={{ headerShown: false }} />
              <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
              <Stack.Screen name="Signup" component={SignupScreen} options={{ headerShown: false }} />
              <Stack.Screen name="Dashboard" component={DashboardScreen} />
              <Stack.Screen name="HeadAdmin" component={HeadAdminScreen} options={{ title: 'Admin App' }} />
              <Stack.Screen name="ReceptionistScreen" component={ReceptionistScreen} options={{ headerShown: false }} />
              <Stack.Screen name="WasherScreen" component={WasherScreen} options={{ headerShown: false }} />
              <Stack.Screen name="RiderScreen" component={RiderScreen} options={{ headerShown: false }} />
              <Stack.Screen name="ScanCode" component={ScanCodeScreen} />
              <Stack.Screen name="Chat" component={ChatScreen} options={{ title: 'Chat' }} />
            </Stack.Navigator>
          </SyncProvider>
        </ErrorBoundary>
      </NavigationContainer>
    </View>
  );
}
