import '../global.css';
import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import {
  useFonts,
  Inter_400Regular,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { supabase } from '../lib/supabaseClient.js';
import { AuthProvider, useAuth } from '../contexts/AuthContext.js';
import { ChatBadgeProvider } from '../contexts/ChatBadgeContext.js';
import { useGpsTracking } from '../hooks/useGpsTracking.js';
import { registerPushToken } from '../lib/pushNotifications.js';

SplashScreen.preventAutoHideAsync();

// Without this, a notification that arrives while the app is already open
// (foreground) is silently swallowed on some platforms instead of showing.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_600SemiBold, Inter_700Bold });

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ChatBadgeProvider>
          <StatusBar style="dark" />
          <RootNavigator />
        </ChatBadgeProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  const { session, user, profile, loading } = useAuth();
  const router = useRouter();

  // Auth state resolves asynchronously (session restore + profile fetch) --
  // keep the splash screen up rather than flashing the login screen first.
  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);

  const isDriver = !loading && !!session && profile?.role === 'driver';
  useGpsTracking(isDriver);

  useEffect(() => {
    if (isDriver && user) registerPushToken(supabase, user.id).catch(() => {});
  }, [isDriver, user]);

  // Tapping a push notification for a new chat message should land the
  // driver directly on that thread -- the backend sets `loadId` (a
  // per-load customer thread) or `dispatchMessage` (the load-independent
  // dispatch thread) in the notification's data payload when it sends
  // (see coreva_logistics_brokerage_dashboard_back_end's notifications
  // module -- two separate webhook routes, two separate payload shapes).
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.dispatchMessage) router.push('/dispatch-chat');
      else if (data?.loadId) router.push(`/chat/${data.loadId}`);
    });
    return () => subscription.remove();
  }, [router]);

  if (loading) return null;

  const wrongRole = !!session && !!profile && profile.role !== 'driver';
  const noProfile = !!session && !profile && !wrongRole;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={isDriver}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="checklist/[loadId]" />
        <Stack.Screen name="delivery/[loadId]" />
        <Stack.Screen name="chat/[loadId]" />
        <Stack.Screen name="dispatch-chat" />
        <Stack.Screen name="load-request" />
        <Stack.Screen name="scan-new-shipment" />
      </Stack.Protected>

      <Stack.Protected guard={!session}>
        <Stack.Screen name="login" />
      </Stack.Protected>

      <Stack.Protected guard={wrongRole}>
        <Stack.Screen name="wrong-role" />
      </Stack.Protected>

      <Stack.Protected guard={noProfile}>
        <Stack.Screen name="no-profile" />
      </Stack.Protected>
    </Stack>
  );
}
