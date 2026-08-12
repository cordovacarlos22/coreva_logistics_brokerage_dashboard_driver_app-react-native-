import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';

// Mirrors the Stitch reference's TopAppBar (bg-surface, border-b
// outline-variant, touch-target-min height, primary navy title).
export default function ScreenHeader({ title, showBack = false, right = null }) {
  const router = useRouter();

  return (
    <View className="h-touch-target-min flex-row items-center justify-between border-b border-outline-variant bg-surface px-margin-mobile">
      {showBack ? (
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          className="h-touch-target-min w-touch-target-min items-center justify-center"
        >
          <MaterialIcons name="arrow-back" size={24} color="#00193c" />
        </Pressable>
      ) : (
        <View className="w-touch-target-min" />
      )}
      <Text className="flex-1 text-center font-bold text-headline-md text-primary" numberOfLines={1}>
        {title}
      </Text>
      {right ?? <View className="w-touch-target-min" />}
    </View>
  );
}
