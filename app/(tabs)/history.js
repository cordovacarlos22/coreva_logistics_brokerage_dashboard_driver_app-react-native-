import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import ScreenHeader from '../../components/ScreenHeader.js';

// Real content (past loads, mileage, checklist history) is a later phase --
// stubbed rather than showing fake data, per the plan's scope call.
export default function History() {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScreenHeader title="Load History" />
      <View className="flex-1 items-center justify-center gap-stack-sm px-margin-mobile">
        <MaterialIcons name="history" size={40} color="#747781" />
        <Text className="text-center font-bold text-headline-md text-on-surface">Coming soon</Text>
        <Text className="text-center text-body-md text-on-surface-variant">
          Your completed loads will show up here.
        </Text>
      </View>
    </SafeAreaView>
  );
}
