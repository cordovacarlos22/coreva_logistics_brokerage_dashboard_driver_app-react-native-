import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { MaterialIcons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabaseClient.js';
import { fetchLoadById } from '../../lib/loads.js';
import {
  fetchOrCreateChecklist,
  fetchLoadSecuredPhoto,
  fetchBolPhoto,
  markSigned,
  markPlantCopyTurnedIn,
  markSecured,
  sealChecklist,
  markDeparted,
} from '../../lib/checklists.js';
import { uploadOrQueue, drainQueue, watchForConnectivity, getQueueCount } from '../../lib/uploadQueue.js';
import { fetchOrCreateInspection, submitInspection } from '../../lib/preTrip.js';
import { useAuth } from '../../contexts/AuthContext.js';
import ScreenHeader from '../../components/ScreenHeader.js';
import Button from '../../components/Button.js';
import Field from '../../components/Field.js';
import StepCard from '../../components/StepCard.js';

// Digitizes Carlos's full Pickup flow: arrival, the real Hub Group
// paperwork checklist (sign, BOL photo w/ OCR, plant copy, secure, photo,
// seal), pre-trip vehicle inspection, and departure.
//
// Two deliberate reorders from the original wireframe, both per Carlos:
// - Upload BOL happens right after Sign, not right before Departure. The
//   checklist row locks forever once sealed (RLS), so anything writing to
//   checklist_photos -- BOL included -- has to happen before that point.
// - Pre-Trip Inspection happens after the checklist (right before
//   departure) rather than right after arrival -- also just makes more
//   physical sense: you inspect the assembled, loaded rig right before
//   pulling out, not before the trailer's even hooked up.
export default function PickupFlow() {
  const { loadId } = useLocalSearchParams();
  const { user, profile } = useAuth();
  const router = useRouter();

  const [load, setLoad] = useState(null);
  const [checklist, setChecklist] = useState(null);
  const [inspection, setInspection] = useState(null);
  const [inspectionItems, setInspectionItems] = useState([]);
  const [photo, setPhoto] = useState(null);
  const [bolPhoto, setBolPhoto] = useState(null);
  const [bolResult, setBolResult] = useState(null);
  const [localPhotoUri, setLocalPhotoUri] = useState(null);
  const [localBolPhotoUri, setLocalBolPhotoUri] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyStep, setBusyStep] = useState(null);
  const [sealInput, setSealInput] = useState('');
  const [queuedCount, setQueuedCount] = useState(0);

  const load_ = useCallback(async () => {
    if (!supabase || !user) return;
    setLoading(true);
    setError(null);
    try {
      const loadRow = await fetchLoadById(supabase, loadId);
      const checklistRow = await fetchOrCreateChecklist(supabase, loadId, user.id);
      const inspectionRow = await fetchOrCreateInspection(supabase, {
        loadId,
        driverId: user.id,
        truckId: loadRow.truck_id,
      });
      setLoad(loadRow);
      setChecklist(checklistRow);
      setInspection(inspectionRow);
      setInspectionItems(inspectionRow.items);
      setPhoto(await fetchLoadSecuredPhoto(supabase, checklistRow.id));
      setBolPhoto(await fetchBolPhoto(supabase, checklistRow.id));
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

  // Retries queued uploads (BOL / load-secured photos that failed on a bad
  // connection) as soon as connectivity returns, and once on mount in case
  // something was already queued from an earlier session.
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
      setChecklist(await action());
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyStep(null);
    }
  }

  async function handleSubmitInspection() {
    setBusyStep('inspection');
    setError(null);
    try {
      setInspection(await submitInspection(supabase, inspection.id, inspectionItems));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyStep(null);
    }
  }

  function setItemResult(index, result) {
    setInspectionItems((items) => items.map((item, i) => (i === index ? { ...item, result } : item)));
  }

  async function handleTakePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError('Camera permission is required to photograph the strapped load.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setLocalPhotoUri(asset.uri);
    setBusyStep('photo');
    setError(null);
    try {
      const response = await uploadOrQueue('load_secured', supabase, {
        loadId: load.id,
        checklistId: checklist.id,
        uri: asset.uri,
        mimeType: asset.mimeType,
      });
      if (response.queued) {
        setQueuedCount((count) => count + 1);
      } else {
        setPhoto(response);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyStep(null);
    }
  }

  async function handleTakeBolPhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError('Camera permission is required to photograph the BOL.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setLocalBolPhotoUri(asset.uri);
    setBusyStep('bol');
    setError(null);
    try {
      const response = await uploadOrQueue('bol', supabase, {
        loadId: load.id,
        checklistId: checklist.id,
        uri: asset.uri,
        mimeType: asset.mimeType,
      });
      if (response.queued) {
        setQueuedCount((count) => count + 1);
      } else {
        setBolPhoto(response.photo);
        setBolResult(response);
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
      const updatedLoad = await markDeparted(supabase, load.id);
      setLoad((prev) => ({ ...prev, status: updatedLoad.status, picked_up_at: updatedLoad.picked_up_at }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyStep(null);
    }
  }

  if (loading && !checklist) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
        <ScreenHeader title="Pickup" showBack />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#00193c" />
        </View>
      </SafeAreaView>
    );
  }

  if (!checklist || !load || !inspection) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
        <ScreenHeader title="Pickup" showBack />
        <View className="flex-1 items-center justify-center px-margin-mobile">
          <Text className="text-center text-body-md text-error">{error ?? 'Not found.'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const arrivalDone = !!checklist.arrived_at;
  const inspectionDone = !!inspection.completed_at;
  const signDone = !!checklist.signed_at;
  const bolDone = !!bolPhoto;
  const plantCopyDone = !!checklist.plant_copy_turned_in_at;
  const securedDone = checklist.single_stack_confirmed;
  const photoDone = !!photo;
  const sealDone = checklist.status === 'locked';
  const departureDone = !!load.picked_up_at;
  // Once locked, RLS blocks every further checklist write -- no
  // checklist-scoped step (sign/plant-copy/secure/photo/seal, plus BOL,
  // which also writes checklist_photos) can ever become "active" again. A
  // step that's still incomplete on an already-locked checklist just has no
  // record, not a future action. Departure lives on `loads`, unaffected.
  const isLocked = sealDone;
  const inspectionComplete = inspectionItems.every((item) => item.result != null);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScreenHeader title="Pickup" showBack />
      <ScrollView
        className="flex-1 px-margin-mobile"
        contentContainerClassName="gap-stack-md pb-stack-lg pt-stack-md"
      >
        <View className="rounded-lg border border-outline-variant bg-surface-container-lowest p-stack-md">
          <Field label="Shipment / Load #" value={load.load_number} />
          <Field label="Driver" value={profile?.full_name} />
          <Field label="Date" value={new Date(checklist.created_at).toLocaleDateString()} last />
        </View>

        {sealDone && (
          <View className="flex-row items-center gap-2 rounded bg-tertiary-container p-stack-md">
            <MaterialIcons name="lock" size={22} color="#ffffff" />
            <Text className="font-medium text-body-md text-on-tertiary">
              Checklist locked -- seal #{checklist.seal_number} placed{' '}
              {new Date(checklist.sealed_at).toLocaleString()}
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
          description="Confirms you've arrived at the shipping office."
          done={arrivalDone}
          active={false}
          doneAt={checklist.arrived_at}
        />

        <StepCard
          number={2}
          title="Sign for the Shipment"
          description="Sign Plant copy and time stamp."
          done={signDone}
          active={arrivalDone && !signDone && !isLocked}
          locked={isLocked}
          doneAt={checklist.signed_at}
        >
          <Button
            label="Sign & Time-Stamp"
            onPress={() => runStep('sign', () => markSigned(supabase, checklist.id))}
            loading={busyStep === 'sign'}
          />
        </StepCard>

        <StepCard
          number={3}
          title="Photograph the BOL"
          description="Take a picture of the Bill of Lading. Amazon Textract reads the trailer #, MFO, PO #, weight, and commodity automatically."
          done={bolDone}
          active={signDone && !bolDone && !isLocked}
          locked={isLocked}
        >
          {localBolPhotoUri && (
            <Image source={{ uri: localBolPhotoUri }} className="mb-stack-sm h-32 w-full rounded" />
          )}
          <Button
            label="Take Photo"
            icon="photo-camera"
            onPress={handleTakeBolPhoto}
            loading={busyStep === 'bol'}
          />
          {bolResult && <BolResultCard result={bolResult} />}
        </StepCard>

        <StepCard
          number={4}
          title="Turn in Signed Plant Copy"
          description="Turn in the signed and stamped PLANT COPY before departing."
          done={plantCopyDone}
          active={bolDone && !plantCopyDone && !isLocked}
          locked={isLocked}
          doneAt={checklist.plant_copy_turned_in_at}
        >
          <Button
            label="Confirm Plant Copy Turned In"
            onPress={() => runStep('plant-copy', () => markPlantCopyTurnedIn(supabase, checklist.id))}
            loading={busyStep === 'plant-copy'}
          />
        </StepCard>

        <StepCard
          number={5}
          title="Secure the Load"
          description="Secure EVERY load using strap and/or load bar (even if single-stacked). No exceptions."
          done={securedDone}
          active={plantCopyDone && !securedDone && !isLocked}
          locked={isLocked}
        >
          <Button
            label="Confirm Secured"
            onPress={() => runStep('secure', () => markSecured(supabase, checklist.id))}
            loading={busyStep === 'secure'}
          />
        </StepCard>

        <StepCard
          number={6}
          title="Photograph the Strapped Load"
          description="Take a picture of the strapped load. Dispatch forwards it to Steve Diaz (steve.diaz@ipaper.com)."
          done={photoDone}
          active={securedDone && !photoDone && !isLocked}
          locked={isLocked}
        >
          {localPhotoUri && (
            <Image source={{ uri: localPhotoUri }} className="mb-stack-sm h-32 w-full rounded" />
          )}
          <Button
            label={photoDone ? 'Retake Photo' : 'Take Photo'}
            icon="photo-camera"
            onPress={handleTakePhoto}
            loading={busyStep === 'photo'}
          />
        </StepCard>

        <StepCard
          number={7}
          title="Seal the Trailer"
          description="Never break an existing seal. Put a strap or load bar on BEFORE putting the seal on the trailer."
          done={sealDone}
          active={photoDone && !sealDone}
          doneAt={checklist.sealed_at}
        >
          {load.bol_seal_number && (
            <Text className="mb-stack-sm text-label-lg text-on-surface-variant">
              IP expects seal #{load.bol_seal_number}
              {sealInput.trim() && sealInput.trim().toUpperCase() !== load.bol_seal_number.toUpperCase() && (
                <Text className="font-medium text-error"> -- doesn&apos;t match what you entered</Text>
              )}
            </Text>
          )}
          <TextInput
            value={sealInput}
            onChangeText={setSealInput}
            placeholder="Enter seal number"
            autoCapitalize="characters"
            className="mb-stack-sm h-[56px] rounded border-2 border-outline-variant bg-surface px-4 text-body-md text-on-surface"
          />
          <Button
            label="Seal & Lock Checklist"
            icon="lock"
            disabled={!sealInput.trim()}
            loading={busyStep === 'seal'}
            onPress={() => runStep('seal', () => sealChecklist(supabase, checklist.id, sealInput.trim()))}
          />
        </StepCard>

        <StepCard
          number={8}
          title="Pre-Trip Inspection"
          description="Check the truck and trailer before pulling out."
          done={inspectionDone}
          active={sealDone && !inspectionDone}
          doneAt={inspection.completed_at}
        >
          {inspectionItems.map((item, index) => (
            <InspectionRow
              key={item.label}
              item={item}
              onSetResult={(result) => setItemResult(index, result)}
            />
          ))}
          <Button
            label="Submit Inspection"
            icon="build"
            disabled={!inspectionComplete}
            loading={busyStep === 'inspection'}
            onPress={handleSubmitInspection}
            className="mt-stack-sm"
          />
        </StepCard>

        <StepCard
          number={9}
          title="Confirm Departure"
          description="Confirm you're leaving the pickup with the load secured and sealed."
          done={departureDone}
          active={inspectionDone && !departureDone}
          doneAt={load.picked_up_at}
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

function InspectionRow({ item, onSetResult }) {
  return (
    <View className="flex-row items-center justify-between border-b border-surface-container-low py-2">
      <Text className="flex-1 text-body-md text-on-surface">{item.label}</Text>
      <View className="flex-row gap-2">
        <Pressable
          onPress={() => onSetResult('pass')}
          className={`rounded px-3 py-2 ${item.result === 'pass' ? 'bg-tertiary-container' : 'border border-outline-variant'}`}
        >
          <Text
            className={`font-medium text-label-lg ${item.result === 'pass' ? 'text-on-tertiary' : 'text-on-surface-variant'}`}
          >
            Pass
          </Text>
        </Pressable>
        <Pressable
          onPress={() => onSetResult('fail')}
          className={`rounded px-3 py-2 ${item.result === 'fail' ? 'bg-error' : 'border border-outline-variant'}`}
        >
          <Text
            className={`font-medium text-label-lg ${item.result === 'fail' ? 'text-on-error' : 'text-on-surface-variant'}`}
          >
            Fail
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function BolResultCard({ result }) {
  const found = Object.keys(result.fields).length > 0;
  return (
    <View className="mt-stack-sm rounded border border-outline-variant bg-surface p-stack-sm">
      <Text className="font-medium text-label-lg text-on-surface-variant">
        {result.verificationStatus === 'ai_verified'
          ? 'All expected fields found -- verified automatically.'
          : 'Some fields weren’t found -- dispatch will review and confirm.'}
      </Text>
      {found ? (
        Object.entries(result.fields).map(([key, value]) => (
          <Text key={key} className="mt-1 text-body-md text-on-surface">
            {key}: <Text className="font-medium">{String(value)}</Text>
          </Text>
        ))
      ) : (
        <Text className="mt-1 text-body-md text-on-surface">
          No fields extracted -- retake the photo or enter details on the dashboard.
        </Text>
      )}
    </View>
  );
}

