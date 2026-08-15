import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { MaterialIcons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabaseClient.js';
import { fetchLoadById } from '../../lib/loads.js';
import { fetchOrCreateDeliveryRecord, markArrived, markUnloaded, completeDelivery } from '../../lib/delivery.js';
import { uploadOrQueue, drainQueue, watchForConnectivity, getQueueCount } from '../../lib/uploadQueue.js';
import { stopTracking } from '../../lib/gpsTracking.js';
import { useAuth } from '../../contexts/AuthContext.js';
import ScreenHeader from '../../components/ScreenHeader.js';
import Button from '../../components/Button.js';
import Field from '../../components/Field.js';
import StepCard from '../../components/StepCard.js';

// The delivery-side counterpart to the Pickup flow: arrival, unload,
// proof-of-delivery photo, departure. Its own table (delivery_records),
// not an extension of `checklists` -- by the time a load reaches delivery
// the pickup checklist is already locked (seal placed), and RLS
// permanently blocks writing to a locked row. See lib/delivery.js and
// schema.sql's comment on delivery_records for the full reasoning.
//
// Deliberately not doing here, matching Carlos's wireframe: no OCR on the
// POD photo (unlike the BOL step) and no signature capture -- both real,
// both later work.
export default function DeliveryFlow() {
  const { loadId } = useLocalSearchParams();
  const { user, profile } = useAuth();
  const router = useRouter();

  const [load, setLoad] = useState(null);
  const [delivery, setDelivery] = useState(null);
  const [localPodPhotoUri, setLocalPodPhotoUri] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyStep, setBusyStep] = useState(null);
  const [queuedCount, setQueuedCount] = useState(0);

  const load_ = useCallback(async () => {
    if (!supabase || !user) return;
    setLoading(true);
    setError(null);
    try {
      const loadRow = await fetchLoadById(supabase, loadId);
      const deliveryRow = await fetchOrCreateDeliveryRecord(supabase, loadId, user.id);
      setLoad(loadRow);
      setDelivery(deliveryRow);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [loadId, user]);

  useFocusEffect(
    useCallback(() => {
      load_();
    }, [load_])
  );

  useEffect(() => {
    if (!supabase) return undefined;
    drainQueue(supabase).then(() => getQueueCount().then(setQueuedCount)).then(load_);
    const unsubscribe = watchForConnectivity(supabase, () => {
      getQueueCount().then(setQueuedCount);
      load_();
    });
    return unsubscribe;
  }, [load_]);

  async function runStep(stepKey, action) {
    setBusyStep(stepKey);
    setError(null);
    try {
      setDelivery(await action());
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyStep(null);
    }
  }

  async function handleTakePodPhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError('Camera permission is required to photograph the POD.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setLocalPodPhotoUri(asset.uri);
    setBusyStep('pod');
    setError(null);
    try {
      const response = await uploadOrQueue('pod', supabase, { deliveryId: delivery.id, uri: asset.uri, mimeType: asset.mimeType });
      if (response.queued) {
        setQueuedCount((count) => count + 1);
      } else {
        setDelivery(response);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyStep(null);
    }
  }

  async function handleConfirmDeparture() {
    setBusyStep('departure');
    setError(null);
    try {
      setDelivery(await completeDelivery(supabase, { deliveryId: delivery.id, loadId: load.id }));
      stopTracking().catch(() => {});
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyStep(null);
    }
  }

  if (loading && !delivery) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
        <ScreenHeader title="Delivery" showBack />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#00193c" />
        </View>
      </SafeAreaView>
    );
  }

  if (!delivery || !load) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
        <ScreenHeader title="Delivery" showBack />
        <View className="flex-1 items-center justify-center px-margin-mobile">
          <Text className="text-center text-body-md text-error">{error ?? 'Not found.'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const arrivalDone = !!delivery.arrived_at;
  const unloadDone = !!delivery.unloaded_at;
  const podDone = !!delivery.pod_storage_path;
  const departureDone = delivery.status === 'locked';

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScreenHeader title="Delivery" showBack />
      <ScrollView
        className="flex-1 px-margin-mobile"
        contentContainerClassName="gap-stack-md pb-stack-lg pt-stack-md"
      >
        <View className="rounded-lg border border-outline-variant bg-surface-container-lowest p-stack-md">
          <Field label="Shipment / Load #" value={load.load_number} />
          <Field label="Driver" value={profile?.full_name} />
          <Field label="Delivery Address" value={load.destination_address} last />
        </View>

        {departureDone && (
          <View className="flex-row items-center gap-2 rounded bg-tertiary-container p-stack-md">
            <MaterialIcons name="check-circle" size={22} color="#ffffff" />
            <Text className="font-medium text-body-md text-on-tertiary">
              Delivered {new Date(delivery.departed_at).toLocaleString()}
            </Text>
          </View>
        )}

        {queuedCount > 0 && (
          <View className="flex-row items-center gap-2 rounded border border-secondary-container bg-surface-container-lowest p-stack-md">
            <MaterialIcons name="cloud-upload" size={22} color="#904d00" />
            <Text className="flex-1 text-body-md text-on-surface-variant">
              {queuedCount} photo{queuedCount > 1 ? 's' : ''} waiting for signal -- uploads automatically
              once you&apos;re back online.
            </Text>
          </View>
        )}

        {error && (
          <Text className="rounded border border-error bg-error-container p-stack-md text-body-md text-error">
            {error}
          </Text>
        )}

        <StepCard
          number={1}
          title="Confirm Arrival"
          description="Confirms you've arrived at the delivery location."
          done={arrivalDone}
          active={!arrivalDone}
          doneAt={delivery.arrived_at}
        >
          <Button
            label="Confirm Arrival"
            onPress={() => runStep('arrival', () => markArrived(supabase, delivery.id))}
            loading={busyStep === 'arrival'}
          />
        </StepCard>

        <StepCard
          number={2}
          title="Confirm Unload Started"
          description="Confirms unloading has begun at the delivery location."
          done={unloadDone}
          active={arrivalDone && !unloadDone}
          doneAt={delivery.unloaded_at}
        >
          <Button
            label="Confirm Unload Started"
            onPress={() => runStep('unload', () => markUnloaded(supabase, delivery.id))}
            loading={busyStep === 'unload'}
          />
        </StepCard>

        <StepCard
          number={3}
          title="Upload POD"
          description="Take a picture of the signed Proof of Delivery."
          done={podDone}
          active={unloadDone && !podDone}
        >
          {localPodPhotoUri && (
            <Image source={{ uri: localPodPhotoUri }} className="mb-stack-sm h-32 w-full rounded" />
          )}
          <Button
            label="Take Photo"
            icon="photo-camera"
            onPress={handleTakePodPhoto}
            loading={busyStep === 'pod'}
          />
        </StepCard>

        <StepCard
          number={4}
          title="Confirm Departure"
          description="Confirm you're leaving the delivery location."
          done={departureDone}
          active={podDone && !departureDone}
          doneAt={delivery.departed_at}
        >
          <Button
            label="Confirm Departure"
            icon="local-shipping"
            onPress={handleConfirmDeparture}
            loading={busyStep === 'departure'}
          />
        </StepCard>

        {departureDone && (
          <Button label="Back to Current Load" variant="outline" onPress={() => router.push('/load')} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
