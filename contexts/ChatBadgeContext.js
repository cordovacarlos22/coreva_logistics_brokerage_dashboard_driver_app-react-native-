import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as Notifications from 'expo-notifications';
import { supabase } from '../lib/supabaseClient.js';
import { subscribeToDriverChannelInserts } from '../lib/chat.js';
import { useAuth } from './AuthContext.js';

const ChatBadgeContext = createContext({ count: 0, clear: () => {} });

// In-app equivalent of the web dashboard's NotificationBell, for the one
// notification surface push can't cover yet -- Expo Go dropped remote push
// support (see lib/pushNotifications.js), so this is what actually lets a
// driver see "a message arrived" without the EAS/dev-client build. Purely
// session-scoped, same as the web bell -- no new schema.
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

  useEffect(() => {
    if (!isDriver) return undefined;
    const unsubscribe = subscribeToDriverChannelInserts(supabase, async (payload) => {
      if (payload.new.sender_id === user?.id) return;
      setCount((n) => n + 1);

      const { data } = await supabase
        .from('load_messages')
        .select('body, sender:profiles(full_name)')
        .eq('id', payload.new.id)
        .single();

      await Notifications.scheduleNotificationAsync({
        content: {
          title: data?.sender?.full_name ? `New message from ${data.sender.full_name}` : 'New message',
          body: data?.body ?? payload.new.body,
          data: { loadId: payload.new.load_id },
        },
        trigger: null,
      }).catch(() => {});
    });
    return unsubscribe;
  }, [isDriver, user]);

  const clear = useCallback(() => setCount(0), []);

  return <ChatBadgeContext.Provider value={{ count, clear }}>{children}</ChatBadgeContext.Provider>;
}

export function useChatBadge() {
  return useContext(ChatBadgeContext);
}
