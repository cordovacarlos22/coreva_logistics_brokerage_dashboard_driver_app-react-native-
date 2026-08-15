import { useState } from 'react';
import { ActivityIndicator, Linking, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useActiveLoad } from '../../hooks/useActiveLoad.js';
import { useAuth } from '../../contexts/AuthContext.js';
import { supabase } from '../../lib/supabaseClient.js';
import { fetchOrCreateChecklist, markArrived } from '../../lib/checklists.js';
import ScreenHeader from '../../components/ScreenHeader.js';
import Button from '../../components/Button.js';

const dispatchPhone = process.env.EXPO_PUBLIC_DISPATCH_PHONE;

// Built from Carlos's "activate shipment" wireframe (2026-08-12): a review
// step before the driver commits to a load, not an OCR-gated claim.
// Tapping Activate is what step 1 of the Pickup flow ("confirm arrival")
// actually does -- see lib/checklists.js's markArrived.
export default function ActivateShipment() {
  const { profile } = useAuth();
  const { load, loading, error, refetch } = useActiveLoad();
  const router = useRouter();
  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState(null);

  const needsActivation = load && !load.checklist?.arrived_at;

  async function handleActivate() {
    setActivating(true);
    setActivateError(null);
    try {
      const checklist = await fetchOrCreateChecklist(supabase, load.id, load.driver_id);
      await markArrived(supabase, checklist.id);
      await refetch();
      router.push('/load');
    } catch (err) {
      setActivateError(err.message);
    } finally {
      setActivating(false);
    }
  }

  function handleCallDispatch() {
    if (dispatchPhone) Linking.openURL(`tel:${dispatchPhone}`);
  }

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
            Couldn&apos;t load your shipment: {error}
          </Text>
        )}

        {!loading && !error && !load && (
          <View className="items-center gap-stack-sm rounded-lg border border-outline-variant bg-surface-container-lowest p-stack-lg">
            <MaterialIcons name="assignment-turned-in" size={40} color="#747781" />
            <Text className="text-center font-bold text-headline-md text-on-surface">
              No shipment to activate
            </Text>
            <Text className="text-center text-body-md text-on-surface-variant">
              Check back once dispatch assigns you one -- or, if you&apos;re at the shipping office
              with a load dispatch hasn&apos;t entered yet, scan the BOL yourself to start it.
            </Text>
            <Button
              label="Scan New Shipment"
              icon="photo-camera"
              onPress={() => router.push('/scan-new-shipment')}
              className="mt-stack-sm w-full"
            />
            <Button
              label="Request a Load"
              variant="outline"
              icon="campaign"
              onPress={() => router.push('/load-request')}
              className="w-full"
            />
          </View>
        )}

        {load && !needsActivation && (
          <View className="items-center gap-stack-sm rounded-lg border border-outline-variant bg-surface-container-lowest p-stack-lg">
            <MaterialIcons name="check-circle" size={40} color="#58a756" />
            <Text className="text-center font-bold text-headline-md text-on-surface">
              Load #{load.load_number} already activated
            </Text>
            <Button label="Go to Current Load" onPress={() => router.push('/load')} />
          </View>
        )}

        {needsActivation && (
          <>
            <View className="rounded-lg border border-outline-variant bg-surface-container-lowest p-stack-md">
              <Text className="font-medium text-label-lg uppercase text-on-tertiary-container">
                You have a load to activate
              </Text>
              <Text className="mt-1 font-bold text-headline-lg-mobile text-on-surface">
                Load #{load.load_number}
              </Text>
              <Text className="mt-1 text-body-md text-on-surface-variant">
                {load.customer_company}
              </Text>
            </View>

            <View className="rounded-lg border border-outline-variant bg-surface-container-lowest p-stack-md">
              <Text className="mb-stack-sm border-b border-outline-variant pb-2 font-bold text-headline-md text-on-surface">
                Review before activating
              </Text>
              <Field label="Pickup" value={load.origin_address} />
              <Field label="Delivery" value={load.destination_address} />
              <Field label="Trailer #" value={load.trailer?.trailer_number} />
              <Field label="Truck #" value={load.truck?.unit_number} last />
            </View>

            {activateError && (
              <Text className="rounded border border-error bg-error-container p-stack-md text-body-md text-error">
                {activateError}
              </Text>
            )}

            <Text className="text-body-md text-on-surface-variant">
              If anything above doesn&apos;t match the physical load, call dispatch before
              activating.
            </Text>

            <Button
              label="Call Dispatch"
              variant="outline"
              icon="call"
              onPress={handleCallDispatch}
              disabled={!dispatchPhone}
            />
            <Button
              label="Activate Shipment"
              icon="assignment-turned-in"
              onPress={handleActivate}
              loading={activating}
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
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
