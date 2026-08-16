import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { subscribeToDriverChannelInserts } from '../lib/chat.js';
import { useAuth } from './AuthContext.js';

const ChatBadgeContext = createContext({ count: 0, clear: () => {} });

// In-app equivalent of the web dashboard's NotificationBell, for the one
// notification surface push can't cover yet -- Expo Go dropped remote push
// support (see lib/pushNotifications.js), so this is what actually lets a
// driver see "a message arrived" without the EAS/dev-client build. Purely
// session-scoped, same as the web bell -- no new schema.
export function ChatBadgeProvider({ children }) {
  const { session, profile, user } = useAuth();
  const isDriver = !!session && profile?.role === 'driver';
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isDriver) return undefined;
    const unsubscribe = subscribeToDriverChannelInserts(supabase, (payload) => {
      if (payload.new.sender_id !== user?.id) setCount((n) => n + 1);
    });
    return unsubscribe;
  }, [isDriver, user]);

  const clear = useCallback(() => setCount(0), []);

  return <ChatBadgeContext.Provider value={{ count, clear }}>{children}</ChatBadgeContext.Provider>;
}

export function useChatBadge() {
  return useContext(ChatBadgeContext);
}
