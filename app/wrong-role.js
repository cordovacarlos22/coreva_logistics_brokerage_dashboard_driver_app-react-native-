import { Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext.js';
import Button from '../components/Button.js';

// Inverse of apps/web/src/components/ProtectedRoute.jsx's driver block --
// that screen tells drivers to use this app instead; this one tells
// everyone else to use the web dashboard instead.
export default function WrongRole() {
  const { profile, signOut } = useAuth();

  return (
    <SafeAreaView className="flex-1 items-center justify-center bg-background px-margin-mobile">
      <MaterialIcons name="desktop-windows" size={48} color="#00193c" />
      <Text className="mt-stack-md text-center font-bold text-headline-md text-primary">
        This app is for drivers
      </Text>
      <Text className="mt-stack-sm text-center text-body-md text-on-surface-variant">
        Your account role ({profile?.role ?? 'unknown'}) uses the Coreva Logistics web dashboard,
        not this driver app. Ask dispatch if you think this is wrong.
      </Text>
      <Button label="Sign Out" variant="ghost" onPress={signOut} className="mt-stack-lg w-full" />
    </SafeAreaView>
  );
}
