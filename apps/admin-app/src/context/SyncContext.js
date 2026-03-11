import React, { createContext, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { API_URL, getToken, isInvalidTokenError, normalizeApiError, onAuthExpired, staff } from '../services/api';
import { io } from 'socket.io-client';

const SyncContext = createContext();

export const useSync = () => useContext(SyncContext);

export const SyncProvider = ({ children }) => {
  const [lastEvent, setLastEvent] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [token, setToken] = useState(getToken());
  const [lastSyncAt, setLastSyncAt] = useState(null);

  // Poll for token changes (since we don't have AuthContext)
  useEffect(() => {
    const interval = setInterval(() => {
        const t = getToken();
        if (t !== token) setToken(t);
    }, 1000);
    return () => clearInterval(interval);
  }, [token]);

  useEffect(() => {
    const unsubscribe = onAuthExpired(() => {
      setToken(null);
      setConnectionStatus('unauthorized');
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || !token) {
        setConnectionStatus('disconnected');
        return;
    }

    let eventSource;
    let retryTimeout;
    let retryDelay = 5000;

    const connect = () => {
      console.log('SyncContext: Connecting to SSE...');
      const eventsUrl = API_URL ? `${API_URL}/admin/events?token=${token}` : `/admin/events?token=${token}`;
      eventSource = new EventSource(eventsUrl);

      eventSource.onopen = () => {
        console.log('SyncContext: Connected');
        setConnectionStatus('connected');
        retryDelay = 5000;
      };

      eventSource.onmessage = (event) => {
        // Heartbeat or generic message
      };

      eventSource.onerror = (e) => {
        const currentToken = getToken();
        if (!currentToken) {
          setConnectionStatus('unauthorized');
          eventSource.close();
          return;
        }
        console.error('SyncContext: Error', e);
        const errorDetails = {
          source: 'admin-web',
          message: 'SyncContext SSE error',
          href: typeof window !== 'undefined' ? window.location.href : undefined,
          context: { eventsUrl }
        };
        try {
          staff.logFrontError(errorDetails).catch(() => {});
        } catch {}
        setConnectionStatus('error');
        eventSource.close();
        retryDelay = Math.min(retryDelay * 2, 60000);
        retryTimeout = setTimeout(connect, retryDelay);
      };

      // Listeners
      eventSource.addEventListener('order_created', (e) => {
        try {
            const order = JSON.parse(e.data);
            console.log('SyncContext: Order Created', order);
            setLastEvent({ type: 'order_created', payload: order });
        } catch (err) { console.error(err); }
      });

      eventSource.addEventListener('order_updated', (e) => {
        try {
            const order = JSON.parse(e.data);
            console.log('SyncContext: Order Updated', order);
            setLastEvent({ type: 'order_updated', payload: order });
        } catch (err) { console.error(err); }
      });
      
      eventSource.addEventListener('user_registered', (e) => {
        try {
            const user = JSON.parse(e.data);
            console.log('SyncContext: User Registered', user);
            setLastEvent({ type: 'user_registered', payload: user });
        } catch (err) { console.error(err); }
      });

      eventSource.addEventListener('user_deleted', (e) => {
        try {
            const payload = JSON.parse(e.data);
            console.log('SyncContext: User Deleted', payload);
            setLastEvent({ type: 'user_deleted', payload });
        } catch (err) { console.error(err); }
      });

      eventSource.addEventListener('subscription_created', (e) => {
        try {
            const sub = JSON.parse(e.data);
            console.log('SyncContext: Subscription Created', sub);
            setLastEvent({ type: 'subscription_created', payload: sub });
        } catch (err) { console.error(err); }
      });

      eventSource.addEventListener('payment_created', (e) => {
        try {
            const payment = JSON.parse(e.data);
            console.log('SyncContext: Payment Created', payment);
            setLastEvent({ type: 'payment_created', payload: payment });
        } catch (err) { console.error(err); }
      });

      eventSource.addEventListener('payment_updated', (e) => {
        try {
            const payment = JSON.parse(e.data);
            console.log('SyncContext: Payment Updated', payment);
            setLastEvent({ type: 'payment_updated', payload: payment });
        } catch (err) { console.error(err); }
      });

      eventSource.addEventListener('schools_updated', (e) => {
        try {
            const payload = JSON.parse(e.data);
            console.log('SyncContext: Schools Updated', payload);
            setLastEvent({ type: 'schools_updated', payload });
        } catch (err) { console.error(err); }
      });

      eventSource.addEventListener('registration_fields_updated', (e) => {
        try {
            const payload = JSON.parse(e.data);
            console.log('SyncContext: Registration Fields Updated', payload);
            setLastEvent({ type: 'registration_fields_updated', payload });
        } catch (err) { console.error(err); }
      });

      eventSource.addEventListener('sync_event', (e) => {
        try {
            const syncEvent = JSON.parse(e.data);
            console.log('SyncContext: Sync Event', syncEvent);
            setLastEvent({ type: 'sync_event', payload: syncEvent });
        } catch (err) { console.error(err); }
      });
    };

    connect();

    return () => {
      if (eventSource) eventSource.close();
      if (retryTimeout) clearTimeout(retryTimeout);
    };
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const socket = io(API_URL, {
      auth: { token },
      transports: ['websocket', 'polling']
    });
    socket.on('connect', () => {
      socket.emit('pickup_register');
    });
    socket.on('pickup_event', (payload) => {
      setLastEvent({ type: 'pickup_event', payload });
    });
    return () => {
      socket.disconnect();
    };
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let interval;
    let isActive = true;

    const poll = async () => {
      try {
        const params = { entity_type: 'sync_event' };
        if (lastSyncAt) params.since = lastSyncAt;
        const response = await staff.syncPull(params);
        const items = response.data?.items || [];
        if (!isActive) return;
        if (items.length > 0) {
          setLastEvent({ type: 'sync_event_batch', payload: items });
          const newest = items[0]?.created_at || items[0]?.updated_at;
          if (newest) setLastSyncAt(new Date(newest).toISOString());
        } else if (!lastSyncAt) {
          setLastSyncAt(new Date().toISOString());
        }
      } catch (e) {
        const normalized = normalizeApiError(e);
        if (isInvalidTokenError(normalized)) {
          setConnectionStatus('unauthorized');
          return;
        }
        console.error('SyncContext: Batch sync error', normalized);
        const errorDetails = {
          source: 'admin-web',
          message: normalized.message,
          href: typeof window !== 'undefined' ? window.location.href : undefined,
          context: {
            endpoint: '/admin/sync/pull',
            status: normalized.status,
            code: normalized.code
          }
        };
        try {
          staff.logFrontError(errorDetails).catch(() => {});
        } catch {}
      }
    };

    interval = setInterval(poll, 60000);
    poll();

    return () => {
      isActive = false;
      if (interval) clearInterval(interval);
    };
  }, [token, lastSyncAt]);

  return (
    <SyncContext.Provider value={{ lastEvent, connectionStatus }}>
      {children}
    </SyncContext.Provider>
  );
};
