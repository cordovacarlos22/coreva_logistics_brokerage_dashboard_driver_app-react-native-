import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { MaterialIcons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabaseClient.js';
import { fetchLoadById } from '../../lib/loads.js';
import {
  fetchOrCreateChecklist,
  fetchLoadSecuredPhoto,
  markSigned,
  markPlantCopyTurnedIn,
  markSecured,
  sealChecklist,
  uploadLoadSecuredPhoto,
} from '../../lib/checklists.js';
import { useAuth } from '../../contexts/AuthContext.js';
import ScreenHeader from '../../components/ScreenHeader.js';
import Button from '../../components/Button.js';

// Digitizes the real Hub Group departure checklist Carlos hands in at the
// plant desk (see the checklist.jpeg reference) -- same 5 steps, same
// order, same wording, plus the Shipment #/Driver/Date header fields from
// the paper form. See lib/checklists.js for how each step maps onto the
// `checklists` table.
export default function ShipmentChecklist() {
  const { loadId } = useLocalSearchParams();
  const { user, profile } = useAuth();

  const [load, setLoad] = useState(null);
  const [checklist, setChecklist] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [localPhotoUri, setLocalPhotoUri] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyStep, setBusyStep] = useState(null);
  const [sealInput, setSealInput] = useState('');

  const load_ = useCallback(async () => {
    if (!supabase || !user) return;
    setLoading(true);
    setError(null);
    try {
      const [loadRow, checklistRow] = await Promise.all([
        fetchLoadById(supabase, loadId),
        fetchOrCreateChecklist(supabase, loadId, user.id),
      ]);
      setLoad(loadRow);
      setChecklist(checklistRow);
      setPhoto(await fetchLoadSecuredPhoto(supabase, checklistRow.id));
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
      setPhoto(
        await uploadLoadSecuredPhoto(supabase, {
          checklistId: checklist.id,
          uri: asset.uri,
          mimeType: asset.mimeType,
        })
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyStep(null);
    }
  }

  if (loading && !checklist) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
        <ScreenHeader title="Departure Checklist" showBack />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#00193c" />
        </View>
      </SafeAreaView>
    );
  }

  if (!checklist || !load) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
        <ScreenHeader title="Departure Checklist" showBack />
        <View className="flex-1 items-center justify-center px-margin-mobile">
          <Text className="text-center text-body-md text-error">{error ?? 'Not found.'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const step1Done = !!checklist.signed_at;
  const step2Done = !!checklist.plant_copy_turned_in_at;
  const step3Done = checklist.single_stack_confirmed;
  const step4Done = !!photo;
  const step5Done = checklist.status === 'locked';

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScreenHeader title="Departure Checklist" showBack />
      <ScrollView
        className="flex-1 px-margin-mobile"
        contentContainerClassName="gap-stack-md pb-stack-lg pt-stack-md"
      >
        <View className="rounded-lg border border-outline-variant bg-surface-container-lowest p-stack-md">
          <Field label="Shipment / Load #" value={load.load_number} />
          <Field label="Driver" value={profile?.full_name} />
          <Field label="Date" value={new Date(checklist.created_at).toLocaleDateString()} last />
        </View>

        {step5Done && (
          <View className="flex-row items-center gap-2 rounded bg-tertiary-container p-stack-md">
            <MaterialIcons name="lock" size={22} color="#ffffff" />
            <Text className="font-medium text-body-md text-on-tertiary">
              Checklist locked -- seal #{checklist.seal_number} placed{' '}
              {new Date(checklist.sealed_at).toLocaleString()}
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
          title="Sign for the Shipment"
          description="Sign Plant copy and time stamp."
          done={step1Done}
          active={!step1Done}
          doneAt={checklist.signed_at}
        >
          <Button
            label="Sign & Time-Stamp"
            onPress={() => runStep('sign', () => markSigned(supabase, checklist.id))}
            loading={busyStep === 'sign'}
          />
        </StepCard>

        <StepCard
          number={2}
          title="Turn in Signed Plant Copy"
          description="Turn in the signed and stamped PLANT COPY before departing."
          done={step2Done}
          active={step1Done && !step2Done}
          doneAt={checklist.plant_copy_turned_in_at}
        >
          <Button
            label="Confirm Plant Copy Turned In"
            onPress={() => runStep('plant-copy', () => markPlantCopyTurnedIn(supabase, checklist.id))}
            loading={busyStep === 'plant-copy'}
          />
        </StepCard>

        <StepCard
          number={3}
          title="Secure the Load"
          description="Secure EVERY load using strap and/or load bar (even if single-stacked). No exceptions."
          done={step3Done}
          active={step2Done && !step3Done}
        >
          <Button
            label="Confirm Secured"
            onPress={() => runStep('secure', () => markSecured(supabase, checklist.id))}
            loading={busyStep === 'secure'}
          />
        </StepCard>

        <StepCard
          number={4}
          title="Photograph the Strapped Load"
          description="Take a picture of the strapped load. Dispatch forwards it to Steve Diaz (steve.diaz@ipaper.com)."
          done={step4Done}
          active={step3Done && !step4Done}
        >
          {localPhotoUri && (
            <Image source={{ uri: localPhotoUri }} className="mb-stack-sm h-32 w-full rounded" />
          )}
          <Button
            label={step4Done ? 'Retake Photo' : 'Take Photo'}
            icon="photo-camera"
            onPress={handleTakePhoto}
            loading={busyStep === 'photo'}
          />
        </StepCard>

        <StepCard
          number={5}
          title="Seal the Trailer"
          description="Never break an existing seal. Put a strap or load bar on BEFORE putting the seal on the trailer."
          done={step5Done}
          active={step4Done && !step5Done}
          doneAt={checklist.sealed_at}
        >
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
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, value, last = false }) {
  return (
    <View className={`flex-row items-center justify-between py-2 ${last ? '' : 'border-b border-surface-container-low'}`}>
      <Text className="text-body-md text-on-surface-variant">{label}</Text>
      <Text className="font-medium text-body-md text-on-surface">{value || '—'}</Text>
    </View>
  );
}

function StepCard({ number, title, description, done, active, doneAt, children }) {
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
          <MaterialIcons name="lock" size={26} color="#747781" />
        </View>
        <View className="flex-1">
          <Text className="text-body-lg text-on-surface">{title}</Text>
          <Text className="mt-1 text-body-md text-outline">Complete the previous step to unlock</Text>
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
        <View className="mt-stack-md">{children}</View>
      </View>
    </View>
  );
}
