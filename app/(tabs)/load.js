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

const VERIFICATION_LABELS = {
  pending: 'BOL Pending Verification',
  ai_verified: 'BOL Verified (AI)',
  dispatch_verified: 'BOL Verified (Dispatch)',
};

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString() : '—';
}

function formatMiles(value) {
  return value != null ? `${value} mi` : '—';
}

function formatWeight(value) {
  return value != null ? `${value.toLocaleString()} lb` : '—';
}

// Built from stitch_coreva_logistics_driver_hub/load_details/code.html,
// reworked toward the denser Uber Freight / J.B. Hunt 360 layout Carlos
// referenced (2026-08-12): equipment requirements + cargo + load-spec cards
// instead of one flat field list. Deliberately no rate/pay figure --
// drivers don't see that in this app (his call), unlike the Uber Freight
// reference. Only shows once the load has been activated (arrived_at set)
// -- otherwise it's still an Activate Shipment concern, not a Current Load
// one.
export default function LoadDetails() {
  const { load, loading, error, refetch } = useActiveLoad();
  const router = useRouter();
  const activated = !!load?.checklist?.arrived_at;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScreenHeader title="Current Load" />
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

        {load && !activated && (
          <View className="items-center gap-stack-sm rounded-lg border border-outline-variant bg-surface-container-lowest p-stack-lg">
            <MaterialIcons name="assignment-turned-in" size={40} color="#747781" />
            <Text className="text-center font-bold text-headline-md text-on-surface">
              Load #{load.load_number} isn&apos;t activated yet
            </Text>
            <Button label="Go to Activate Shipment" onPress={() => router.push('/')} />
          </View>
        )}

        {load && activated && (
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

            {load.equipment_requirements?.length > 0 && (
              <Section title="Trailer Requirements" icon="rv-hookup">
                {load.equipment_requirements.map((requirement) => (
                  <View key={requirement} className="flex-row items-center gap-2 py-1.5">
                    <MaterialIcons name="check" size={18} color="#58a756" />
                    <Text className="text-body-md text-on-surface">{requirement}</Text>
                  </View>
                ))}
              </Section>
            )}

            <Section title="Cargo">
              <Field label="Commodity" value={load.commodity} />
              <Field label="Unit Count" value={load.unit_count} />
              <Field label="Packaging Type" value={load.packaging_type} last />
            </Section>

            <Section title="Load Specs">
              <Field label="Total Distance" value={formatMiles(load.total_distance_miles)} />
              <Field label="Deadhead" value={formatMiles(load.deadhead_miles)} />
              <Field label="Weight" value={formatWeight(load.weight_lbs)} last />
            </Section>

            <Section title="Equipment & Paperwork">
              <Field label="Trailer #" value={load.trailer?.trailer_number} />
              <Field label="Truck #" value={load.truck?.unit_number} />
              <Field label="Consignee" value={load.consignee?.name} />
              <Field label="MFO" value={load.bol_mfo} />
              <Field label="PO Number" value={load.bol_po_number} />
              <Field label="Seal Number" value={load.bol_seal_number} />
              <Field
                label="Verification"
                value={VERIFICATION_LABELS[load.bol_verification_status] ?? load.bol_verification_status}
                last
              />
            </Section>

            {load.status === 'assigned' ? (
              <Button
                label="Continue Pickup"
                icon="check-circle"
                onPress={() => router.push(`/checklist/${load.id}`)}
              />
            ) : (
              <Button
                label="Continue Delivery"
                icon="local-shipping"
                onPress={() => router.push(`/delivery/${load.id}`)}
              />
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, icon, children }) {
  return (
    <View className="rounded-lg border border-outline-variant bg-surface-container-lowest p-stack-md">
      <View className="mb-stack-sm flex-row items-center gap-2 border-b border-outline-variant pb-2">
        {icon && <MaterialIcons name={icon} size={20} color="#00193c" />}
        <Text className="font-bold text-headline-md text-on-surface">{title}</Text>
      </View>
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
      <Text className="font-medium text-body-md text-on-surface">{value ?? '—'}</Text>
    </View>
  );
}
