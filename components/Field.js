import { Text, View } from 'react-native';

// Shared by the Pickup and Delivery flow screens' header info cards, and
// Activate Shipment / Current Load. `value` gets flex-1 rather than sizing
// to content -- a long address needs to wrap onto a second line instead of
// overflowing past the edge of the screen.
export default function Field({ label, value, last = false }) {
  return (
    <View className={`flex-row items-start gap-3 py-2 ${last ? '' : 'border-b border-surface-container-low'}`}>
      <Text className="text-body-md text-on-surface-variant">{label}</Text>
      <Text className="flex-1 text-right font-medium text-body-md text-on-surface">{value || '—'}</Text>
    </View>
  );
}
