import '../global.css';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts,
  Inter_400Regular,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { AuthProvider, useAuth } from '../contexts/AuthContext.js';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_600SemiBold, Inter_700Bold });

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  const { session, profile, loading } = useAuth();

  // Auth state resolves asynchronously (session restore + profile fetch) --
  // keep the splash screen up rather than flashing the login screen first.
  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);

  if (loading) return null;

  const isDriver = !!session && profile?.role === 'driver';
  const wrongRole = !!session && !!profile && profile.role !== 'driver';
  const noProfile = !!session && !profile && !wrongRole;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={isDriver}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="checklist/[loadId]" />
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
