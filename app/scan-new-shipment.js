import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { MaterialIcons } from '@expo/vector-icons';
import { supabase } from '../lib/supabaseClient.js';
import { createDraftLoad, addLoadStops } from '../lib/loads.js';
import { fetchConsignees } from '../lib/consignees.js';
import { getCurrentAddress } from '../lib/location.js';
import { fetchOrCreateChecklist, markArrived } from '../lib/checklists.js';
import { uploadOrQueue } from '../lib/uploadQueue.js';
import { useAuth } from '../contexts/AuthContext.js';
import ScreenHeader from '../components/ScreenHeader.js';
import Button from '../components/Button.js';

const OTHER_CONSIGNEE = '__other__';

// The entry point for the case Carlos flagged (2026-08-13): dispatch has no
// way to pre-create a load, since the driver's BOL photo is the only source
// of the load's actual details. A driver starts here with no load assigned
// yet at all -- this creates the load record themselves (loads_write RLS
// already permits driver_id = auth.uid() on insert), marks it arrived (the
// act of scanning at the shipping office IS arrival), captures the BOL
// photo, then hands off into the normal Pickup flow for everything else.
//
// Pickup and destination are no longer plain free text (Carlos's
// follow-up feedback): pickup auto-fills from the device's current
// location -- the driver is standing at the shipping office when they
// scan, so that *is* the pickup address -- and destination picks from
// International Paper's existing consignees (address included), falling
// back to manual entry only for a genuinely new one.
export default function ScanNewShipment() {
  const { user } = useAuth();
  const router = useRouter();

  const [loadNumber, setLoadNumber] = useState('');
  const [origin, setOrigin] = useState('');
  const [locatingOrigin, setLocatingOrigin] = useState(true);
  const [consignees, setConsignees] = useState([]);
  const [selectedConsigneeId, setSelectedConsigneeId] = useState(null);
  const [destination, setDestination] = useState('');
  const [stops, setStops] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    getCurrentAddress()
      .then((address) => {
        if (address) setOrigin(address);
      })
      .finally(() => setLocatingOrigin(false));

    if (supabase) {
      fetchConsignees(supabase, 'International Paper')
        .then(setConsignees)
        .catch((err) => setError(err.message));
    }
  }, []);

  function handleSelectConsignee(consignee) {
    setSelectedConsigneeId(consignee.id);
    setDestination(consignee.address ?? '');
  }

  function handleSelectOther() {
    setSelectedConsigneeId(OTHER_CONSIGNEE);
    setDestination('');
  }

  function addStop() {
    setStops((prev) => [...prev, { address: '', stopType: 'delivery' }]);
  }

  function updateStop(index, patch) {
    setStops((prev) => prev.map((stop, i) => (i === index ? { ...stop, ...patch } : stop)));
  }

  function removeStop(index) {
    setStops((prev) => prev.filter((_, i) => i !== index));
  }

  const canSubmit =
    loadNumber.trim() && origin.trim() && destination.trim() && stops.every((s) => s.address.trim());

  async function handleStart() {
    setBusy(true);
    setError(null);
    try {
      const load = await createDraftLoad(supabase, {
        driverId: user.id,
        loadNumber: loadNumber.trim(),
        originAddress: origin.trim(),
        destinationAddress: destination.trim(),
        consigneeId: selectedConsigneeId === OTHER_CONSIGNEE ? null : selectedConsigneeId,
      });

      if (stops.length > 0) {
        await addLoadStops(
          supabase,
          load.id,
          stops.map((s) => ({ address: s.address.trim(), stopType: s.stopType }))
        );
      }

      const checklist = await fetchOrCreateChecklist(supabase, load.id, user.id);
      await markArrived(supabase, checklist.id);

      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (permission.granted) {
        const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
        if (!result.canceled && result.assets?.[0]) {
          const asset = result.assets[0];
          try {
            await uploadOrQueue('bol', supabase, {
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
          <View className="flex-row items-center justify-between">
            <Text className="font-medium text-label-lg text-on-surface">Pickup (Origin)</Text>
            <Pressable
              onPress={() => {
                setLocatingOrigin(true);
                getCurrentAddress()
                  .then((address) => {
                    if (address) setOrigin(address);
                  })
                  .finally(() => setLocatingOrigin(false));
              }}
              hitSlop={8}
              className="flex-row items-center gap-1"
            >
              <MaterialIcons name="my-location" size={16} color="#00193c" />
              <Text className="text-label-lg font-medium text-primary">
                {locatingOrigin ? 'Locating…' : 'Use My Location'}
              </Text>
            </Pressable>
          </View>
          <TextInput
            value={origin}
            onChangeText={setOrigin}
            placeholder={locatingOrigin ? 'Finding your location…' : 'Address'}
            className="h-[56px] rounded border-2 border-outline-variant bg-surface px-4 text-body-md text-on-surface"
          />
        </View>

        <View className="gap-2">
          <Text className="font-medium text-label-lg text-on-surface">Delivery (Destination)</Text>
          <View className="flex-row flex-wrap gap-2">
            {consignees.map((consignee) => (
              <Pressable
                key={consignee.id}
                onPress={() => handleSelectConsignee(consignee)}
                className={`rounded px-3 py-2 ${
                  selectedConsigneeId === consignee.id
                    ? 'bg-secondary-container'
                    : 'border border-outline-variant'
                }`}
              >
                <Text
                  className={`font-medium text-label-lg ${
                    selectedConsigneeId === consignee.id ? 'text-on-secondary-container' : 'text-on-surface'
                  }`}
                >
                  {consignee.name}
                </Text>
              </Pressable>
            ))}
            <Pressable
              onPress={handleSelectOther}
              className={`rounded px-3 py-2 ${
                selectedConsigneeId === OTHER_CONSIGNEE ? 'bg-secondary-container' : 'border border-outline-variant'
              }`}
            >
              <Text
                className={`font-medium text-label-lg ${
                  selectedConsigneeId === OTHER_CONSIGNEE ? 'text-on-secondary-container' : 'text-on-surface'
                }`}
              >
                Other
              </Text>
            </Pressable>
          </View>
          <TextInput
            value={destination}
            onChangeText={setDestination}
            placeholder="Address"
            editable={!!selectedConsigneeId}
            className={`h-[56px] rounded border-2 border-outline-variant px-4 text-body-md text-on-surface ${
              selectedConsigneeId ? 'bg-surface' : 'bg-surface-container-low'
            }`}
          />
          {!selectedConsigneeId && (
            <Text className="text-label-lg text-on-surface-variant">
              Pick a destination above (or Other) to enter an address.
            </Text>
          )}
        </View>

        <View className="gap-2">
          <View className="flex-row items-center justify-between">
            <Text className="font-medium text-label-lg text-on-surface">Extra Stops</Text>
            <Pressable onPress={addStop} hitSlop={8} className="flex-row items-center gap-1">
              <MaterialIcons name="add-circle-outline" size={18} color="#00193c" />
              <Text className="text-label-lg font-medium text-primary">Add Stop</Text>
            </Pressable>
          </View>
          {stops.length === 0 && (
            <Text className="text-label-lg text-on-surface-variant">
              Only add these if this load has more than one pickup or delivery.
            </Text>
          )}
          {stops.map((stop, index) => (
            <View key={index} className="gap-2 rounded border border-outline-variant bg-surface-container-lowest p-stack-sm">
              <View className="flex-row items-center justify-between">
                <View className="flex-row gap-2">
                  {['pickup', 'delivery'].map((type) => (
                    <Pressable
                      key={type}
                      onPress={() => updateStop(index, { stopType: type })}
                      className={`rounded px-3 py-1.5 capitalize ${
                        stop.stopType === type ? 'bg-tertiary-container' : 'border border-outline-variant'
                      }`}
                    >
                      <Text
                        className={`text-label-lg font-medium capitalize ${
                          stop.stopType === type ? 'text-on-tertiary' : 'text-on-surface-variant'
                        }`}
                      >
                        {type}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Pressable onPress={() => removeStop(index)} hitSlop={8}>
                  <MaterialIcons name="close" size={20} color="#747781" />
                </Pressable>
              </View>
              <TextInput
                value={stop.address}
                onChangeText={(text) => updateStop(index, { address: text })}
                placeholder="Address"
                className="h-[48px] rounded border-2 border-outline-variant bg-surface px-4 text-body-md text-on-surface"
              />
            </View>
          ))}
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
