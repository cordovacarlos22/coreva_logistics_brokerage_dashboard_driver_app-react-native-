import { Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext.js';
import Button from '../components/Button.js';

// Mirrors ProtectedRoute.jsx's "No profile found" case -- the auth.users
// account exists (they signed in) but no matching public.profiles row does.
// Profiles are staff-provisioned (see supabase/README.md), so this is
// always a dispatch/admin setup gap, not something the driver can fix.
export default function NoProfile() {
  const { profileError, signOut } = useAuth();

  return (
    <SafeAreaView className="flex-1 items-center justify-center bg-background px-margin-mobile">
      <MaterialIcons name="error-outline" size={48} color="#ba1a1a" />
      <Text className="mt-stack-md text-center font-bold text-headline-md text-primary">
        No driver profile found
      </Text>
      <Text className="mt-stack-sm text-center text-body-md text-on-surface-variant">
        Your account isn&apos;t set up as a driver yet. Contact dispatch to finish setting up your
        access.
      </Text>
      {profileError && (
        <Text className="mt-stack-sm text-center text-label-lg text-on-surface-variant">
          {profileError}
        </Text>
      )}
      <Button label="Sign Out" variant="ghost" onPress={signOut} className="mt-stack-lg w-full" />
    </SafeAreaView>
  );
}
