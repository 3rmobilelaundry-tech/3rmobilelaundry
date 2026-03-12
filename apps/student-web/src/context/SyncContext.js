import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { Platform } from 'react-native';
import { API_URL, student, logFrontError } from '../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { io } from 'socket.io-client';

const SyncContext = createContext();
const PICKUP_QUEUE_KEY = 'pickup_queue';

export const SyncProvider = ({ children }) => {
  const { userToken, userData, login } = useAuth();
  const [lastEvent, setLastEvent] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const emergencyVersionRef = useRef(0);
  const socketRef = useRef(null);
  const pickupQueueRef = useRef([]);
  const pickupQueueLoadedRef = useRef(false);
  const pickupProcessingRef = useRef(false);

  const isNetworkError = (error) => {
    const status = error?.response?.status;
    if (status) return false;
    const code = String(error?.code || '');
    const message = String(error?.message || '').toLowerCase();
    return code === 'ERR_NETWORK' || code === 'ECONNABORTED' || message.includes('network') || message.includes('timeout') || message.includes('failed to fetch');
  };

  const loadPickupQueue = useCallback(async () => {
    if (pickupQueueLoadedRef.current) return pickupQueueRef.current;
    try {
      const raw = await AsyncStorage.getItem(PICKUP_QUEUE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      pickupQueueRef.current = Array.isArray(parsed) ? parsed : [];
    } catch {
      pickupQueueRef.current = [];
    } finally {
      pickupQueueLoadedRef.current = true;
    }
    return pickupQueueRef.current;
  }, []);

  const persistPickupQueue = useCallback(async (nextQueue) => {
    pickupQueueRef.current = nextQueue;
    await AsyncStorage.setItem(PICKUP_QUEUE_KEY, JSON.stringify(nextQueue));
  }, []);

  const enqueuePickupAction = useCallback(async (action) => {
    const item = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      created_at: new Date().toISOString(),
      ...action
    };
    const existing = await loadPickupQueue();
    const nextQueue = [...existing, item];
    await persistPickupQueue(nextQueue);
    setLastEvent({ type: 'pickup_queued', payload: item });
    return item;
  }, [loadPickupQueue, persistPickupQueue]);

  const processPickupQueue = useCallback(async () => {
    if (pickupProcessingRef.current) return;
    pickupProcessingRef.current = true;
    try {
      const items = await loadPickupQueue();
      if (!items.length) return;
      const remaining = [];
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        try {
          let response;
          if (item.type === 'book') {
            response = await student.bookPickup(item.payload);
          } else if (item.type === 'emergency') {
            response = await student.bookEmergency(item.payload);
          } else if (item.type === 'cancel') {
            response = await student.cancelOrder(item.payload.order_id, { version: item.payload.version });
          }
          const order = response?.data?.order || response?.data;
          if (order?.order_id) {
            const eventType = item.type === 'cancel' ? 'order_updated' : 'order_created';
            setLastEvent({ type: eventType, payload: order });
          }
        } catch (error) {
          if (isNetworkError(error)) {
            remaining.push(item, ...items.slice(i + 1));
            break;
          }
          const errMsg = error?.response?.data?.error || error.message;
          setLastEvent({ type: 'pickup_sync_failed', payload: { item, error: errMsg } });
        }
      }
      await persistPickupQueue(remaining);
      if (remaining.length) {
        setLastEvent({ type: 'pickup_sync_deferred', payload: { remaining: remaining.length } });
      }
    } finally {
      pickupProcessingRef.current = false;
    }
  }, [loadPickupQueue, persistPickupQueue]);

  useEffect(() => {
    if (!userToken) return;

    let eventSource;
    let retryTimeout;
    let pollInterval;

    const connect = () => {
      // Check if EventSource is available (Web or Polyfill)
      if (typeof EventSource !== 'undefined') {
        console.log('SyncContext: Connecting to SSE...');
        const url = `${API_URL}/student/events?token=${userToken}`;
        eventSource = new EventSource(url);

        eventSource.onopen = () => {
          console.log('SyncContext: Connected');
          setConnectionStatus('connected');
        };

        eventSource.onerror = (e) => {
          // Check if it's a connection error or just a stream end
          console.log('SyncContext: Error event', e, 'readyState:', eventSource.readyState);
          if (e.eventPhase === EventSource.CLOSED) {
             console.log('SyncContext: Connection closed');
          } else {
             console.error('SyncContext: Error', e);
          }
          if (Platform.OS === 'web') {
            try {
              logFrontError({
                source: 'student-sse',
                message: 'SSE connection error',
                stack: e?.message || '',
                href: typeof window !== 'undefined' ? window.location.href : '',
                context: { readyState: eventSource.readyState, eventPhase: e?.eventPhase }
              });
            } catch {}
          }
          setConnectionStatus('error');
          eventSource.close();
          retryTimeout = setTimeout(connect, 5000);
        };
        
        // Listeners
        eventSource.addEventListener('user_updated', (e) => {
          try {
            const user = JSON.parse(e.data);
            console.log('SyncContext: user_updated', user);
            setLastEvent({ type: 'user_updated', payload: user });
            
            if (userData && user.user_id === userData.user_id) {
               login(userToken, user); 
            }
          } catch (err) { console.error(err); }
        });
        
        eventSource.addEventListener('order_created', (e) => {
          try {
              const order = JSON.parse(e.data);
              if (userData && order.user_id === userData.user_id) {
                  console.log('SyncContext: My order created', order);
                  setLastEvent({ type: 'order_created', payload: order });
              }
          } catch (err) { console.error(err); }
        });

        eventSource.addEventListener('order_updated', (e) => {
          try {
              const order = JSON.parse(e.data);
              if (userData && order.user_id === userData.user_id) {
                  console.log('SyncContext: My order updated', order);
                  setLastEvent({ type: 'order_updated', payload: order });
              }
          } catch (err) { console.error(err); }
        });

        eventSource.addEventListener('payment_updated', (e) => {
          try {
            const payment = JSON.parse(e.data);
            if (userData && payment.user_id === userData.user_id) {
              console.log('SyncContext: Payment updated', payment);
              setLastEvent({ type: 'payment_updated', payload: payment });
            }
          } catch (err) { console.error(err); }
        });

        eventSource.addEventListener('registration_fields_updated', (e) => {
          try {
            const payload = JSON.parse(e.data);
            setLastEvent({ type: 'registration_fields_updated', payload });
          } catch (err) { console.error(err); }
        });

        eventSource.addEventListener('schools_updated', (e) => {
          try {
            const payload = JSON.parse(e.data);
            setLastEvent({ type: 'schools_updated', payload });
          } catch (err) { console.error(err); }
        });
        eventSource.addEventListener('settings_updated', (e) => {
          try {
            const payload = JSON.parse(e.data);
            setLastEvent({ type: 'settings_updated', payload });
          } catch (err) { console.error(err); }
        });

        eventSource.addEventListener('notification', (e) => {
          try {
            const notification = JSON.parse(e.data);
            if (userData && notification.user_id === userData.user_id) {
              console.log('SyncContext: Notification received', notification);
              setLastEvent({ type: 'notification', payload: notification });
            }
          } catch (err) { console.error(err); }
        });
      } else {
        // Fallback: Polling for Native if EventSource missing
        console.log('SyncContext: EventSource not found, using Polling fallback');
        setConnectionStatus('polling');
        
        // Simple polling mechanism: Trigger a refresh event every 15 seconds
        pollInterval = setInterval(() => {
            if (userToken) {
                console.log('SyncContext: Polling refresh trigger');
                setLastEvent({ type: 'poll_refresh', payload: { timestamp: Date.now() } });
            }
        }, 15000);
      }
    };

    connect();

    return () => {
      if (eventSource) eventSource.close();
      if (retryTimeout) clearTimeout(retryTimeout);
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [userToken, userData]);

  useEffect(() => {
    if (!userToken) return;
    let active = true;
    const init = async () => {
      await loadPickupQueue();
      if (active) {
        await processPickupQueue();
      }
    };
    init();
    return () => {
      active = false;
    };
  }, [userToken, loadPickupQueue, processPickupQueue]);

  useEffect(() => {
    if (!userToken) return;
    const socket = io(API_URL, {
      auth: { token: userToken },
      transports: ['websocket', 'polling']
    });
    socketRef.current = socket;
    socket.on('connect', () => {
      socket.emit('pickup_register');
      processPickupQueue();
    });
    socket.on('pickup_event', (payload) => {
      const order = payload?.order;
      if (userData && order?.user_id === userData.user_id) {
        setLastEvent({ type: 'pickup_event', payload });
      }
    });
    return () => {
      socket.disconnect();
    };
  }, [userToken, userData, processPickupQueue]);

  useEffect(() => {
    if (!userToken) return;
    let interval;
    let isActive = true;
    const cacheKey = 'emergency_config_cache';
    const backupKey = 'emergency_config_backup';

    const normalizeEmergency = (incoming) => {
      if (!incoming || typeof incoming !== 'object') return null;
      const pricingMode = ['per_item', 'flat', 'hybrid'].includes(incoming.pricing_mode)
        ? incoming.pricing_mode
        : 'per_item';
      const pricePerItem = Number(incoming.price_per_item);
      const baseFee = Number(incoming.base_fee);
      const estimatedMinutes = Number(incoming.estimated_completion_minutes);
      return {
        enabled: false,
        available: true,
        pricing_mode: 'per_item',
        price_per_item: 0,
        base_fee: 0,
        delivery_window_text: 'Delivered within 2–8 hours (same day)',
        description: 'Same-day delivery within 2–8 hours',
        estimated_completion_text: '2–8 hours',
        estimated_completion_minutes: 360,
        instructions: '',
        restrictions: '',
        updated_at: null,
        version: 0,
        ...incoming,
        pricing_mode: pricingMode,
        price_per_item: Number.isFinite(pricePerItem) ? pricePerItem : 0,
        base_fee: Number.isFinite(baseFee) ? baseFee : 0,
        estimated_completion_minutes: Number.isFinite(estimatedMinutes) ? estimatedMinutes : 360
      };
    };

    const loadCachedVersion = async () => {
      try {
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          emergencyVersionRef.current = Number(parsed?.settings_version || parsed?.emergency?.version || 0);
        }
      } catch (e) {
        if (Platform.OS === 'web') {
          try {
            logFrontError({
              source: 'emergency-sync',
              message: 'Failed to read cached emergency config',
              stack: e?.message || '',
              href: typeof window !== 'undefined' ? window.location.href : ''
            });
          } catch {}
        }
      }
    };

    const pollEmergencyConfig = async () => {
      try {
        const res = await student.getConfig();
        if (!isActive) return;
        const incomingVersion = Number(res.data?.settings_version || res.data?.emergency?.version || 0);
        const incomingEmergency = normalizeEmergency(res.data?.emergency);
        if (!incomingEmergency) return;
        if (incomingVersion > emergencyVersionRef.current) {
          emergencyVersionRef.current = incomingVersion;
          const payload = {
            emergency: incomingEmergency,
            settings_version: incomingVersion,
            synced_at: new Date().toISOString()
          };
          const previous = await AsyncStorage.getItem(cacheKey);
          if (previous) {
            await AsyncStorage.setItem(backupKey, previous);
          }
          try {
            await AsyncStorage.setItem(cacheKey, JSON.stringify(payload));
            setLastEvent({ type: 'settings_updated', payload });
          } catch (writeError) {
            if (previous) {
              await AsyncStorage.setItem(cacheKey, previous);
            }
            if (Platform.OS === 'web') {
              try {
                logFrontError({
                  source: 'emergency-sync',
                  message: 'Failed to persist emergency config',
                  stack: writeError?.message || '',
                  href: typeof window !== 'undefined' ? window.location.href : ''
                });
              } catch {}
            }
          }
        }
      } catch (e) {
        console.error('SyncContext: Emergency config polling error', e);
        if (Platform.OS === 'web') {
          try {
            logFrontError({
              source: 'emergency-sync',
              message: 'Emergency config polling failed',
              stack: e?.message || '',
              href: typeof window !== 'undefined' ? window.location.href : ''
            });
          } catch {}
        }
      }
    };

    loadCachedVersion().then(pollEmergencyConfig);
    interval = setInterval(pollEmergencyConfig, 60000);

    return () => {
      isActive = false;
      if (interval) clearInterval(interval);
    };
  }, [userToken]);

  useEffect(() => {
    if (!userToken || !userData?.user_id) return;
    let interval;
    let isActive = true;

    const poll = async () => {
      try {
        const paramsBase = { user_id: userData.user_id };
        if (lastSyncAt) paramsBase.since = lastSyncAt;
        const [ordersRes, paymentsRes, subsRes, profileRes] = await Promise.all([
          student.syncPull({ ...paramsBase, entity_type: 'order' }),
          student.syncPull({ ...paramsBase, entity_type: 'payment' }),
          student.syncPull({ ...paramsBase, entity_type: 'subscription' }),
          student.syncPull({ ...paramsBase, entity_type: 'profile' })
        ]);
        if (!isActive) return;
        const payload = {
          orders: ordersRes.data?.items || [],
          payments: paymentsRes.data?.items || [],
          subscriptions: subsRes.data?.items || [],
          profile: profileRes.data?.items || []
        };
        const hasUpdates = payload.orders.length || payload.payments.length || payload.subscriptions.length || payload.profile.length;
        if (hasUpdates) {
          setLastEvent({ type: 'batch_sync', payload });
          const candidateTimes = [
            ordersRes.data?.server_time,
            paymentsRes.data?.server_time,
            subsRes.data?.server_time,
            profileRes.data?.server_time
          ].filter(Boolean);
          if (candidateTimes.length > 0) {
            setLastSyncAt(candidateTimes.sort().pop());
          }
        } else if (!lastSyncAt) {
          setLastSyncAt(new Date().toISOString());
        }
      } catch (e) {
        console.error('SyncContext: Batch sync error', e);
      }
    };

    interval = setInterval(poll, 60000);
    poll();

    return () => {
      isActive = false;
      if (interval) clearInterval(interval);
    };
  }, [userToken, userData, lastSyncAt]);

  return (
    <SyncContext.Provider value={{ lastEvent, connectionStatus, lastSyncAt, enqueuePickupAction }}>
      {children}
    </SyncContext.Provider>
  );
};

export const useSync = () => useContext(SyncContext);
