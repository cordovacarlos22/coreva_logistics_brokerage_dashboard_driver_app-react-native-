import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useActiveLoad } from '../../hooks/useActiveLoad.js';
import { useAuth } from '../../contexts/AuthContext.js';
import ScreenHeader from '../../components/ScreenHeader.js';
import Button from '../../components/Button.js';

const STATUS_LABELS = {
  assigned: 'Assigned',
  picked_up: 'Picked Up',
  in_transit: 'In Transit',
};

// Built from stitch_coreva_logistics_driver_hub/active_load_dashboard/code.html.
// The reference's route "map visualizer" is a static generated image in the
// mockup, not a real map -- reproduced here as a styled placeholder card
// rather than a real map integration, which is its own later decision.
export default function ActiveLoadDashboard() {
  const { profile } = useAuth();
  const { load, loading, error, refetch } = useActiveLoad();
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScreenHeader title="Coreva Logistics" />
      <ScrollView
        className="flex-1 px-margin-mobile"
        contentContainerClassName="gap-gutter pb-stack-lg pt-stack-md"
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} />}
      >
        <Text className="text-body-md text-on-surface-variant">
          Welcome, {profile?.full_name?.split(' ')[0] ?? 'Driver'}
        </Text>

        {loading && !load && (
          <View className="items-center py-stack-lg">
            <ActivityIndicator color="#00193c" />
          </View>
        )}

        {error && (
          <Text className="rounded border border-error bg-error-container p-stack-md text-body-md text-error">
            Couldn&apos;t load your active load: {error}
          </Text>
        )}

        {!loading && !error && !load && (
          <View className="items-center gap-stack-sm rounded-lg border border-outline-variant bg-surface-container-lowest p-stack-lg">
            <MaterialIcons name="local-shipping" size={40} color="#747781" />
            <Text className="text-center font-bold text-headline-md text-on-surface">
              No active load
            </Text>
            <Text className="text-center text-body-md text-on-surface-variant">
              You don&apos;t have an assigned load right now. Check back once dispatch assigns you
              one.
            </Text>
          </View>
        )}

        {load && (
          <>
            <View className="relative overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest p-stack-md">
              <View className="absolute left-0 top-0 h-1 w-full bg-tertiary-container" />
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-2">
                  <MaterialIcons name="local-shipping" size={22} color="#58a756" />
                  <Text className="font-bold text-headline-md text-on-surface">Active Load</Text>
                </View>
                <View className="rounded bg-tertiary-container px-3 py-1">
                  <Text className="font-medium text-label-lg uppercase text-on-tertiary">
                    {STATUS_LABELS[load.status] ?? load.status}
                  </Text>
                </View>
              </View>
              <View className="mt-2 gap-1">
                <Text className="text-body-md text-on-surface-variant">
                  Load <Text className="font-bold text-on-surface">#{load.load_number}</Text>
                </Text>
                {load.trailer && (
                  <Text className="text-body-md text-on-surface-variant">
                    Trailer <Text className="font-bold text-on-surface">#{load.trailer.trailer_number}</Text>
                  </Text>
                )}
              </View>
            </View>

            <View className="gap-stack-lg rounded-lg border border-outline-variant bg-surface-container-lowest p-stack-md">
              <RouteRow
                label="Pickup"
                place={load.customer_company}
                address={load.origin_address}
                iconColor="#00193c"
              />
              <RouteRow
                label="Delivery"
                place={load.consignee?.name ?? 'Consignee'}
                address={load.destination_address}
                iconColor="#fd8b00"
              />
            </View>

            <Button
              label="Open Departure Checklist"
              icon="check-circle"
              onPress={() => router.push(`/checklist/${load.id}`)}
            />
            <Button label="View Load Details" variant="outline" onPress={() => router.push('/load')} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function RouteRow({ label, place, address, iconColor }) {
  return (
    <View className="flex-row gap-4">
      <MaterialIcons name="location-on" size={22} color={iconColor} />
      <View className="flex-1">
        <Text className="font-medium text-label-lg uppercase text-on-surface-variant">{label}</Text>
        <Text className="mt-1 font-bold text-headline-md text-on-surface">{place ?? '—'}</Text>
        <Text className="mt-1 text-body-md text-on-surface-variant">{address ?? '—'}</Text>
      </View>
    </View>
  );
}
