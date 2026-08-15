import { Text, View } from 'react-native';

// Shared by the Pickup and Delivery flow screens' header info cards.
export default function Field({ label, value, last = false }) {
  return (
    <View className={`flex-row items-center justify-between py-2 ${last ? '' : 'border-b border-surface-container-low'}`}>
      <Text className="text-body-md text-on-surface-variant">{label}</Text>
      <Text className="font-medium text-body-md text-on-surface">{value || '—'}</Text>
    </View>
  );
}
