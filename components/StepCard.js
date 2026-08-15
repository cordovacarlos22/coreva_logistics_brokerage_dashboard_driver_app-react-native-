import { Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

// Shared by the Pickup and Delivery flow screens -- a step is either done
// (green check, timestamp), locked (grayed out, either "complete the
// previous step" or, for a step with no record on an already-locked
// parent row, "no record on file"), or active (orange border, its action
// content rendered as children).
export default function StepCard({ number, title, description, done, active, locked = false, doneAt, children }) {
  if (done) {
    return (
      <View className="min-h-[80px] flex-row items-center gap-gutter rounded-lg border border-outline-variant bg-surface-container-lowest p-gutter">
        <View className="h-touch-target-min w-touch-target-min items-center justify-center rounded-full bg-tertiary-fixed/20">
          <MaterialIcons name="check-circle" size={30} color="#58a756" />
        </View>
        <View className="flex-1">
          <Text className="font-medium text-body-lg text-on-surface">{title}</Text>
          <Text className="mt-1 text-body-md text-on-surface-variant">
            {doneAt ? `Completed ${new Date(doneAt).toLocaleTimeString()}` : 'Completed'}
          </Text>
        </View>
      </View>
    );
  }

  if (!active) {
    return (
      <View className="min-h-[80px] flex-row items-center gap-gutter rounded-lg border border-outline-variant/50 bg-surface-container-lowest p-gutter opacity-60">
        <View className="h-touch-target-min w-touch-target-min items-center justify-center rounded-full bg-surface-container-high">
          <MaterialIcons name={locked ? 'history' : 'lock'} size={26} color="#747781" />
        </View>
        <View className="flex-1">
          <Text className="text-body-lg text-on-surface">{title}</Text>
          <Text className="mt-1 text-body-md text-outline">
            {locked ? 'No record on file' : 'Complete the previous step to unlock'}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View className="relative overflow-hidden rounded-lg border-2 border-secondary-container bg-surface-container-lowest p-gutter">
      <View className="absolute bottom-0 left-0 top-0 w-1.5 bg-secondary-container" />
      <View className="pl-2">
        <Text className="font-bold text-headline-md text-on-surface">
          {number}. {title}
        </Text>
        <Text className="mt-2 text-body-md text-on-surface-variant">{description}</Text>
        {children && <View className="mt-stack-md">{children}</View>}
      </View>
    </View>
  );
}
