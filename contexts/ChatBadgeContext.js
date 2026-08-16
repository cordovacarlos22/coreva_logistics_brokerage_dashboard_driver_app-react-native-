import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { supabase } from '../lib/supabaseClient.js';
import { subscribeToDriverChannelInserts, fetchLoadMessages } from '../lib/chat.js';
import { fetchActiveLoad } from '../lib/loads.js';
import { useAuth } from './AuthContext.js';

const ChatBadgeContext = createContext({ count: 0, clear: () => {} });

function lastViewedKey(loadId) {
  return `chat-last-viewed-${loadId}`;
}

// In-app equivalent of the web dashboard's NotificationBell, for the one
// notification surface push can't cover yet -- Expo Go dropped remote push
// support (see lib/pushNotifications.js), so this is what actually lets a
// driver see "a message arrived" without the EAS/dev-client build.
//
// Also fires a *local* notification (scheduleNotificationAsync with
// trigger: null) alongside the tab badge -- unlike remote push, local
// notifications were never restricted in Expo Go, so this is what actually
// gives a real pop-up banner today. `_layout.js`'s
// addNotificationResponseReceivedListener already deep-links `data.loadId`
// on tap, so tapping this works the same as tapping a real push would.
export function ChatBadgeProvider({ children }) {
  const { session, profile, user } = useAuth();
  const isDriver = !!session && profile?.role === 'driver';
  const [count, setCount] = useState(0);
  const [activeLoadId, setActiveLoadId] = useState(null);

  // Seeds the badge from AsyncStorage + what's actually in load_messages,
  // not just an in-memory session count -- otherwise closing and
  // reopening the app (which resets all in-memory state) would silently
  // drop the badge back to 0 even for a message the driver never saw.
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
      setCount(unread);
    })();
    return () => {
      cancelled = true;
    };
  }, [isDriver, user]);

  useEffect(() => {
    if (!isDriver) return undefined;
    const unsubscribe = subscribeToDriverChannelInserts(supabase, async (payload) => {
      if (payload.new.sender_id === user?.id) return;
      setCount((n) => n + 1);

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

  const clear = useCallback(
    (loadId) => {
      setCount(0);
      const key = loadId ?? activeLoadId;
      if (key) AsyncStorage.setItem(lastViewedKey(key), new Date().toISOString());
    },
    [activeLoadId]
  );

  return <ChatBadgeContext.Provider value={{ count, clear }}>{children}</ChatBadgeContext.Provider>;
}

export function useChatBadge() {
  return useContext(ChatBadgeContext);
}
