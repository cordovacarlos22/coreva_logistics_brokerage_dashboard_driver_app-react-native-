import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useActiveLoad } from '../../hooks/useActiveLoad.js';
import ScreenHeader from '../../components/ScreenHeader.js';
import Button from '../../components/Button.js';

// Thin hand-off tab, same pattern Current Load already uses for "Continue
// Pickup"/"Continue Delivery" -- reuses the existing full-screen
// app/chat/[loadId].js flow entirely rather than duplicating its UI here,
// so this screen only ever needs to answer "which load, if any."
//
// Deliberately button-driven, not an effect that auto-navigates on mount --
// useActiveLoad() refetches on every focus (a new `load` object reference
// each time), so an effect keyed on `load` would re-fire and re-navigate
// every time this tab regains focus, including right after backing out of
// chat -- making the back button effectively unusable.
//
// Dispatch is a pinned, always-present entry above the load-scoped
// section -- unlike the customer thread, dispatch messaging doesn't
// depend on having an active load at all (see app/dispatch-chat.js).
export default function ChatTab() {
  const { load, loading } = useActiveLoad();
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScreenHeader title="Chat" />
      <View className="gap-stack-md px-margin-mobile pt-stack-md">
        <View className="items-center gap-stack-sm rounded border border-outline-variant bg-surface-container-lowest p-stack-lg">
          <MaterialIcons name="support-agent" size={40} color="#747781" />
          <Text className="text-center font-bold text-headline-md text-on-surface">Dispatch</Text>
          <Text className="text-center text-body-md text-on-surface-variant">
            Message dispatch any time, whether or not you have an active load.
          </Text>
          <Button
            label="Open Chat"
            icon="chat"
            onPress={() => router.push('/dispatch-chat')}
            className="mt-stack-sm w-full"
          />
        </View>
      </View>

      <View className="flex-1 items-center justify-center gap-stack-sm px-margin-mobile">
        {loading && !load && <ActivityIndicator color="#00193c" />}

        {!loading && !load && (
          <>
            <MaterialIcons name="chat" size={40} color="#747781" />
            <Text className="text-center font-bold text-headline-md text-on-surface">
              No active load to message about
            </Text>
            <Text className="text-center text-body-md text-on-surface-variant">
              Once you have an active load, you can message the customer here.
            </Text>
          </>
        )}

        {load && (
          <>
            <MaterialIcons name="chat" size={40} color="#747781" />
            <Text className="text-center font-bold text-headline-md text-on-surface">
              Load #{load.load_number}
            </Text>
            <Text className="text-center text-body-md text-on-surface-variant">
              {load.customer_company}
            </Text>
            <Button
              label="Open Chat"
              icon="chat"
              onPress={() => router.push(`/chat/${load.id}`)}
              className="mt-stack-sm w-full"
            />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
