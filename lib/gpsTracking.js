import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabaseClient.js';

// CLAUDE.md: "Location is only tracked while a driver is clocked into an
// active load" -- via the `record_gps_ping` RPC (SECURITY DEFINER; a
// driver has no direct write access to trucks/trailers, see
// schema.sql's comment on it), which writes both a gps_pings history row
// and the load's truck/trailer current_lat/lng the web Live Map reads.
const TASK_NAME = 'coreva-gps-tracking';
// TaskManager relaunches this module in a headless JS context when the OS
// delivers a background location update -- there's no React tree to read
// "which load is active" from, so that has to be persisted (AsyncStorage)
// by startTracking/stopTracking and re-read here on every batch.
const ACTIVE_LOAD_KEY = 'gps-tracking-load-id';

async function sendPing(loadId, coords) {
  if (!supabase) return;
  const { error } = await supabase.rpc('record_gps_ping', {
    p_load_id: loadId,
    p_lat: coords.latitude,
    p_lng: coords.longitude,
  });
  if (error) console.warn('[gpsTracking] record_gps_ping failed:', error.message);
}

// Must be defined at module scope, not inside a component -- see
// TaskManager's docs: the task needs to be registered before the location
// service can call it, including on a cold background launch. This is the
// real production path, but Expo Go can't run it on a real device at all
// (Android: never; iOS: only in the Simulator) -- it silently never
// delivers updates there, which is what startTracking's foreground watch
// below exists to work around for testing.
TaskManager.defineTask(TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.warn('[gpsTracking] location task error:', error.message);
    return;
  }

  const loadId = await AsyncStorage.getItem(ACTIVE_LOAD_KEY);
  if (!loadId) return;

  const locations = data?.locations ?? [];
  const latest = locations[locations.length - 1];
  if (!latest) return;

  await sendPing(loadId, latest.coords);
});

// Expo Go can't run the background task above on a real device, so this
// foreground watch is the only thing that actually delivers pings there --
// it stops the moment the app is backgrounded, unlike the real thing. Kept
// even after a dev client exists: it's a reasonable no-cost supplement
// while the app happens to be open, layered on top of the background task
// rather than replacing it.
let foregroundWatchSubscription = null;

// Denied permissions fail silently rather than surfacing an error to the
// caller -- GPS visibility is a dispatch/customer convenience, not a gate
// on the driver's actual workflow, so activating or delivering a load
// should never block on it. A driver-facing "location sharing is off"
// indicator is a real gap this doesn't cover yet.
export async function startTracking(loadId) {
  const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
  if (foregroundStatus !== 'granted') {
    console.warn('[gpsTracking] foreground permission not granted:', foregroundStatus);
    return;
  }

  await AsyncStorage.setItem(ACTIVE_LOAD_KEY, loadId);

  foregroundWatchSubscription?.remove();
  foregroundWatchSubscription = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.Balanced, timeInterval: 30000, distanceInterval: 25 },
    (location) => {
      sendPing(loadId, location.coords).catch(() => {});
    }
  );

  // Background is a separate, stricter permission -- request it, but don't
  // let a denial undo the foreground watch that's already running above.
  const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
  if (backgroundStatus !== 'granted') {
    console.warn('[gpsTracking] background permission not granted:', backgroundStatus);
    return;
  }

  // Whether re-calling startLocationUpdatesAsync on an already-registered
  // task name updates its options in place isn't documented, so don't rely
  // on it -- stop and re-register instead, guaranteeing the options below
  // are actually the ones in effect rather than whatever was registered
  // the first time this ever ran on the device.
  if (await Location.hasStartedLocationUpdatesAsync(TASK_NAME)) {
    await Location.stopLocationUpdatesAsync(TASK_NAME);
  }

  try {
    await Location.startLocationUpdatesAsync(TASK_NAME, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 30000,
      // 25m rather than a highway-appropriate distance -- at 150m, GPS
      // drift alone rarely triggers an update while the phone is
      // stationary on a desk, which made this untestable indoors.
      distanceInterval: 25,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'Coreva Logistics',
        notificationBody: "Sharing your location while you're on an active load.",
      },
    });
  } catch (err) {
    console.warn('[gpsTracking] startLocationUpdatesAsync failed:', err.message);
  }
}

export async function stopTracking() {
  await AsyncStorage.removeItem(ACTIVE_LOAD_KEY);

  foregroundWatchSubscription?.remove();
  foregroundWatchSubscription = null;

  if (await Location.hasStartedLocationUpdatesAsync(TASK_NAME)) {
    await Location.stopLocationUpdatesAsync(TASK_NAME);
  }
}
