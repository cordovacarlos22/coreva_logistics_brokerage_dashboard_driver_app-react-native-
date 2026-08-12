import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useActiveLoad } from '../../hooks/useActiveLoad.js';
import ScreenHeader from '../../components/ScreenHeader.js';
import Button from '../../components/Button.js';

const STATUS_LABELS = {
  assigned: 'Assigned',
  picked_up: 'Picked Up',
  in_transit: 'In Transit',
};

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString() : '—';
}

// Built from stitch_coreva_logistics_driver_hub/load_details/code.html.
// Fields shown are limited to what public.loads actually tracks -- no
// weight/commodity/earnings fields exist in the schema, so (unlike the
// Stitch mockup) those aren't shown rather than being invented.
export default function LoadDetails() {
  const { load, loading, error, refetch } = useActiveLoad();
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScreenHeader title="Load Details" />
      <ScrollView
        className="flex-1 px-margin-mobile"
        contentContainerClassName="gap-gutter pb-stack-lg pt-stack-md"
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} />}
      >
        {loading && !load && (
          <View className="items-center py-stack-lg">
            <ActivityIndicator color="#00193c" />
          </View>
        )}

        {error && (
          <Text className="rounded border border-error bg-error-container p-stack-md text-body-md text-error">
            Couldn&apos;t load your load: {error}
          </Text>
        )}

        {!loading && !error && !load && (
          <View className="items-center gap-stack-sm rounded-lg border border-outline-variant bg-surface-container-lowest p-stack-lg">
            <MaterialIcons name="local-shipping" size={40} color="#747781" />
            <Text className="text-center font-bold text-headline-md text-on-surface">
              No active load
            </Text>
          </View>
        )}

        {load && (
          <>
            <View className="flex-row items-center justify-between border-b border-outline-variant pb-stack-sm">
              <View>
                <Text className="font-bold text-headline-md text-on-surface">
                  Load #{load.load_number}
                </Text>
                <Text className="mt-1 text-body-md text-on-surface-variant">
                  {load.customer_company}
                </Text>
              </View>
              <View className="rounded bg-tertiary-container px-3 py-1">
                <Text className="font-medium text-label-lg uppercase text-on-tertiary">
                  {STATUS_LABELS[load.status] ?? load.status}
                </Text>
              </View>
            </View>

            <Section title="Route">
              <Field label="Pickup" value={load.origin_address} />
              <Field label="Pickup Appointment" value={formatDateTime(load.pickup_appointment_at)} />
              <Field label="Delivery" value={load.destination_address} />
              <Field
                label="Delivery Appointment"
                value={formatDateTime(load.delivery_appointment_at)}
                last
              />
            </Section>

            <Section title="Equipment & Paperwork">
              <Field label="Trailer #" value={load.trailer?.trailer_number} />
              <Field label="Truck #" value={load.truck?.unit_number} />
              <Field label="Consignee" value={load.consignee?.name} />
              <Field label="MFO" value={load.bol_mfo} />
              <Field label="PO Number" value={load.bol_po_number} />
              <Field label="Seal Number" value={load.bol_seal_number} last />
            </Section>

            <Button
              label="Open Departure Checklist"
              icon="check-circle"
              onPress={() => router.push(`/checklist/${load.id}`)}
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }) {
  return (
    <View className="rounded-lg border border-outline-variant bg-surface-container-lowest p-stack-md">
      <Text className="mb-stack-sm border-b border-outline-variant pb-2 font-bold text-headline-md text-on-surface">
        {title}
      </Text>
      {children}
    </View>
  );
}

function Field({ label, value, last = false }) {
  return (
    <View
      className={`flex-row items-center justify-between py-3 ${
        last ? '' : 'border-b border-surface-container-low'
      }`}
    >
      <Text className="text-body-md text-on-surface-variant">{label}</Text>
      <Text className="font-medium text-body-md text-on-surface">{value || '—'}</Text>
    </View>
  );
}
