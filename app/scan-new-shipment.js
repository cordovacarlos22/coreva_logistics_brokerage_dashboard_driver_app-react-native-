import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabaseClient.js';
import { createDraftLoad } from '../lib/loads.js';
import { fetchOrCreateChecklist, markArrived, uploadBolPhoto } from '../lib/checklists.js';
import { useAuth } from '../contexts/AuthContext.js';
import ScreenHeader from '../components/ScreenHeader.js';
import Button from '../components/Button.js';

// The entry point for the case Carlos flagged (2026-08-13): dispatch has no
// way to pre-create a load, since the driver's BOL photo is the only source
// of the load's actual details. A driver starts here with no load assigned
// yet at all -- this creates the load record themselves (loads_write RLS
// already permits driver_id = auth.uid() on insert), marks it arrived (the
// act of scanning at the shipping office IS arrival), captures the BOL
// photo, then hands off into the normal Pickup flow for everything else.
export default function ScanNewShipment() {
  const { user } = useAuth();
  const router = useRouter();

  const [loadNumber, setLoadNumber] = useState('');
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const canSubmit = loadNumber.trim() && origin.trim() && destination.trim();

  async function handleStart() {
    setBusy(true);
    setError(null);
    try {
      const load = await createDraftLoad(supabase, {
        driverId: user.id,
        loadNumber: loadNumber.trim(),
        originAddress: origin.trim(),
        destinationAddress: destination.trim(),
      });
      const checklist = await fetchOrCreateChecklist(supabase, load.id, user.id);
      await markArrived(supabase, checklist.id);

      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (permission.granted) {
        const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
        if (!result.canceled && result.assets?.[0]) {
          const asset = result.assets[0];
          try {
            await uploadBolPhoto(supabase, {
              loadId: load.id,
              checklistId: checklist.id,
              uri: asset.uri,
              mimeType: asset.mimeType,
            });
          } catch {
            // Load + checklist already exist -- let the driver retake the
            // BOL photo from the Pickup screen rather than losing progress.
          }
        }
      }

      router.replace(`/checklist/${load.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScreenHeader title="Scan New Shipment" showBack />
      <ScrollView
        className="flex-1 px-margin-mobile"
        contentContainerClassName="gap-stack-md pb-stack-lg pt-stack-md"
      >
        <Text className="text-body-md text-on-surface-variant">
          Starting a shipment dispatch hasn&apos;t created yet? Fill in what&apos;s on the paperwork,
          then photograph the BOL -- Amazon Textract fills in the rest.
        </Text>

        <View className="gap-2">
          <Text className="font-medium text-label-lg text-on-surface">Shipment / Load #</Text>
          <TextInput
            value={loadNumber}
            onChangeText={setLoadNumber}
            placeholder="e.g. IP-9001-A"
            autoCapitalize="characters"
            className="h-[56px] rounded border-2 border-outline-variant bg-surface px-4 text-body-md text-on-surface"
          />
        </View>

        <View className="gap-2">
          <Text className="font-medium text-label-lg text-on-surface">Pickup (Origin)</Text>
          <TextInput
            value={origin}
            onChangeText={setOrigin}
            placeholder="City, State"
            className="h-[56px] rounded border-2 border-outline-variant bg-surface px-4 text-body-md text-on-surface"
          />
        </View>

        <View className="gap-2">
          <Text className="font-medium text-label-lg text-on-surface">Delivery (Destination)</Text>
          <TextInput
            value={destination}
            onChangeText={setDestination}
            placeholder="City, State"
            className="h-[56px] rounded border-2 border-outline-variant bg-surface px-4 text-body-md text-on-surface"
          />
        </View>

        {error && (
          <Text className="rounded border border-error bg-error-container p-stack-md text-body-md text-error">
            {error}
          </Text>
        )}

        {busy ? (
          <View className="items-center gap-stack-sm py-stack-md">
            <ActivityIndicator color="#00193c" />
            <Text className="text-body-md text-on-surface-variant">Creating shipment…</Text>
          </View>
        ) : (
          <Button
            label="Continue to Photograph BOL"
            icon="photo-camera"
            disabled={!canSubmit}
            onPress={handleStart}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
