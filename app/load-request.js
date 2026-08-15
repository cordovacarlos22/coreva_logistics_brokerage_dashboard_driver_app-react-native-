import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabaseClient.js';
import { useAuth } from '../contexts/AuthContext.js';
import { fetchLatestLoadRequest, submitLoadRequest } from '../lib/loadRequests.js';
import ScreenHeader from '../components/ScreenHeader.js';
import Button from '../components/Button.js';

// Reference: a photo Carlos shared (2026-08-14) of his old employer's ELD
// tablet, whose "Load Request" screen asked exactly these two yes/no
// questions. Reachable from Activate Shipment's empty state -- that's the
// moment a driver has no load and would want to signal availability.
export default function LoadRequest() {
  const { user } = useAuth();
  const router = useRouter();
  const [wantsLoadToday, setWantsLoadToday] = useState(null);
  const [hasEmpty, setHasEmpty] = useState(null);
  const [lastRequest, setLastRequest] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user) return;
    fetchLatestLoadRequest(supabase, user.id)
      .then(setLastRequest)
      .catch((err) => setError(err.message));
  }, [user]);

  const canSubmit = wantsLoadToday !== null && hasEmpty !== null;

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await submitLoadRequest(supabase, { driverId: user.id, wantsLoadToday, hasEmpty });
      router.back();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScreenHeader title="Request a Load" showBack />
      <ScrollView
        className="flex-1 px-margin-mobile"
        contentContainerClassName="gap-stack-md pb-stack-lg pt-stack-md"
      >
        <Text className="text-body-md text-on-surface-variant">
          Let dispatch know you&apos;re available for a load today.
        </Text>

        {lastRequest && (
          <Text className="text-body-md text-outline">
            Last requested {new Date(lastRequest.created_at).toLocaleString()}
          </Text>
        )}

        {error && (
          <Text className="rounded border border-error bg-error-container p-stack-md text-body-md text-error">
            {error}
          </Text>
        )}

        <YesNoField label="Load for today?" value={wantsLoadToday} onChange={setWantsLoadToday} />
        <YesNoField label="Do you have an empty?" value={hasEmpty} onChange={setHasEmpty} />

        <Button label="Submit" onPress={handleSubmit} loading={submitting} disabled={!canSubmit} />
      </ScrollView>
    </SafeAreaView>
  );
}

function YesNoField({ label, value, onChange }) {
  return (
    <View className="rounded-lg border border-outline-variant bg-surface-container-lowest p-stack-md">
      <Text className="mb-stack-sm font-medium text-body-lg text-on-surface">{label}</Text>
      <View className="flex-row gap-stack-sm">
        <Button
          label="Yes"
          variant={value === true ? 'primary' : 'outline'}
          onPress={() => onChange(true)}
          className="flex-1"
        />
        <Button
          label="No"
          variant={value === false ? 'primary' : 'outline'}
          onPress={() => onChange(false)}
          className="flex-1"
        />
      </View>
    </View>
  );
}
