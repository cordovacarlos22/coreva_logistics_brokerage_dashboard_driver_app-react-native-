import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { supabase } from '../lib/supabaseClient.js';
import { subscribeToDriverChannelInserts, fetchLoadMessages } from '../lib/chat.js';
import { subscribeToDriverMessages, fetchDriverMessages } from '../lib/driverMessages.js';
import { fetchActiveLoad } from '../lib/loads.js';
import { useAuth } from './AuthContext.js';

const ChatBadgeContext = createContext({ count: 0, clear: () => {} });

// Sentinel "loadId" for the dispatch thread's last-viewed timestamp -- it's
// not scoped to any load, but lastViewedKey is just a template string, so
// this needs no schema/storage change of its own.
const DISPATCH_KEY = 'dispatch';

function lastViewedKey(key) {
  return `chat-last-viewed-${key}`;
}

// In-app equivalent of the web dashboard's NotificationBell, for the one
// notification surface push can't cover yet -- Expo Go dropped remote push
// support (see lib/pushNotifications.js), so this is what actually lets a
// driver see "a message arrived" without the EAS/dev-client build.
//
// Tracks two sources -- the active load's customer thread (load_messages)
// and the load-independent dispatch thread (driver_messages) -- as
// separate counts so opening one thread doesn't wrongly zero out unread
// messages in the other, while still exposing a single combined `count`
// for the Chat tab's badge (one number covering "anything unread in this
// tab", not a per-source breakdown).
//
// Also fires a *local* notification (scheduleNotificationAsync with
// trigger: null) alongside the tab badge -- unlike remote push, local
// notifications were never restricted in Expo Go, so this is what actually
// gives a real pop-up banner today. `_layout.js`'s
// addNotificationResponseReceivedListener already deep-links on tap
// (data.loadId or data.dispatchMessage), so tapping this works the same as
// tapping a real push would.
export function ChatBadgeProvider({ children }) {
  const { session, profile, user } = useAuth();
  const isDriver = !!session && profile?.role === 'driver';
  const [loadCount, setLoadCount] = useState(0);
  const [dispatchCount, setDispatchCount] = useState(0);
  const [activeLoadId, setActiveLoadId] = useState(null);

  // Seeds the load-thread badge from AsyncStorage + what's actually in
  // load_messages, not just an in-memory session count -- otherwise
  // closing and reopening the app (which resets all in-memory state)
  // would silently drop the badge back to 0 even for a message the driver
  // never saw.
  useEffect(() => {
    if (!isDriver || !user) return undefined;
    let cancelled = false;
    (async () => {
      const load = await fetchActiveLoad(supabase).catch(() => null);
      if (cancelled || !load) return;
      setActiveLoadId(load.id);

      const [lastViewedAt, messages] = await Promise.all([
        AsyncStorage.getItem(lastViewedKey(load.id)),
        fetchLoadMessages(supabase, load.id).catch(() => []),
      ]);
      if (cancelled) return;

      const unread = messages.filter(
        (m) => m.sender_id !== user.id && (!lastViewedAt || m.created_at > lastViewedAt)
      ).length;
      setLoadCount(unread);
    })();
    return () => {
      cancelled = true;
    };
  }, [isDriver, user]);

  // Same seeding, for the dispatch thread.
  useEffect(() => {
    if (!isDriver || !user) return undefined;
    let cancelled = false;
    (async () => {
      const [lastViewedAt, messages] = await Promise.all([
        AsyncStorage.getItem(lastViewedKey(DISPATCH_KEY)),
        fetchDriverMessages(supabase, user.id).catch(() => []),
      ]);
      if (cancelled) return;

      const unread = messages.filter(
        (m) => m.sender_id !== user.id && (!lastViewedAt || m.created_at > lastViewedAt)
      ).length;
      setDispatchCount(unread);
    })();
    return () => {
      cancelled = true;
    };
  }, [isDriver, user]);

  useEffect(() => {
    if (!isDriver) return undefined;
    const unsubscribe = subscribeToDriverChannelInserts(supabase, async (payload) => {
      if (payload.new.sender_id === user?.id) return;
      setLoadCount((n) => n + 1);

      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') {
        console.warn('[ChatBadge] notification permission not granted, status:', status);
        return;
      }

      const { data } = await supabase
        .from('load_messages')
        .select('body, sender:profiles(full_name)')
        .eq('id', payload.new.id)
        .single();

      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: data?.sender?.full_name ? `New message from ${data.sender.full_name}` : 'New message',
            body: data?.body ?? payload.new.body,
            data: { loadId: payload.new.load_id },
          },
          trigger: null,
        });
      } catch (err) {
        console.warn('[ChatBadge] scheduleNotificationAsync failed:', err.message);
      }
    });
    return unsubscribe;
  }, [isDriver, user]);

  useEffect(() => {
    if (!isDriver || !user) return undefined;
    const unsubscribe = subscribeToDriverMessages(supabase, user.id, async (payload) => {
      if (payload.new.sender_id === user.id) return;
      setDispatchCount((n) => n + 1);

      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') {
        console.warn('[ChatBadge] notification permission not granted, status:', status);
        return;
      }

      const { data } = await supabase
        .from('driver_messages')
        .select('body, sender:profiles(full_name)')
        .eq('id', payload.new.id)
        .single();

      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: data?.sender?.full_name
              ? `New message from ${data.sender.full_name}`
              : 'New message from Dispatch',
            body: data?.body ?? payload.new.body,
            data: { dispatchMessage: true },
          },
          trigger: null,
        });
      } catch (err) {
        console.warn('[ChatBadge] scheduleNotificationAsync failed (dispatch):', err.message);
      }
    });
    return unsubscribe;
  }, [isDriver, user]);

  // `key` is a loadId or DISPATCH_KEY -- only the count for that specific
  // thread gets zeroed, not the combined total, so unread messages in the
  // *other* thread don't silently disappear from the badge just because
  // the driver opened this one.
  const clear = useCallback(
    (key) => {
      const resolvedKey = key ?? activeLoadId;
      if (!resolvedKey) return;
      if (resolvedKey === DISPATCH_KEY) setDispatchCount(0);
      else setLoadCount(0);
      AsyncStorage.setItem(lastViewedKey(resolvedKey), new Date().toISOString());
    },
    [activeLoadId]
  );

  return (
    <ChatBadgeContext.Provider value={{ count: loadCount + dispatchCount, clear }}>
      {children}
    </ChatBadgeContext.Provider>
  );
}

export function useChatBadge() {
  return useContext(ChatBadgeContext);
}
