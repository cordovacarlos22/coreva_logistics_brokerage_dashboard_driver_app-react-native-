import { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useActiveLoad } from '../../hooks/useActiveLoad.js';
import ScreenHeader from '../../components/ScreenHeader.js';

// Thin hand-off tab, same pattern Current Load already uses for "Continue
// Pickup"/"Continue Delivery" -- reuses the existing full-screen
// app/chat/[loadId].js flow entirely rather than duplicating its UI here,
// so this screen only ever needs to answer "which load, if any."
export default function ChatTab() {
  const { load, loading } = useActiveLoad();
  const router = useRouter();

  useEffect(() => {
    if (load) router.replace(`/chat/${load.id}`);
  }, [load, router]);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScreenHeader title="Chat" />
      <View className="flex-1 items-center justify-center gap-stack-sm px-margin-mobile">
        {loading && !load ? (
          <ActivityIndicator color="#00193c" />
        ) : (
          !load && (
            <>
              <MaterialIcons name="chat" size={40} color="#747781" />
              <Text className="text-center font-bold text-headline-md text-on-surface">
                No active load to message about
              </Text>
              <Text className="text-center text-body-md text-on-surface-variant">
                Once you have an active load, you can message the customer here.
              </Text>
            </>
          )
        )}
      </View>
    </SafeAreaView>
  );
}
