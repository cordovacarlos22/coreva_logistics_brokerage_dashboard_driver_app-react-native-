import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { supabase } from '../lib/supabaseClient.js';
import { fetchActiveLoad } from '../lib/loads.js';
import { startTracking, stopTracking } from '../lib/gpsTracking.js';

const ACTIVE_STATUSES = ['assigned', 'picked_up', 'in_transit'];
const RESYNC_INTERVAL_MS = 5 * 60 * 1000;

// Keeps background GPS tracking in sync with the driver's active load. This
// is a session-level concern, not any one screen's, so it runs from
// RootNavigator for the life of the authenticated session rather than
// living in a tab -- Activate Shipment and Delivery already call
// startTracking/stopTracking directly at the exact moment that matters
// (activation, confirmed departure); this is the resync backstop that
// catches everything else (app force-quit and reopened mid-load, a load
// reassigned by dispatch) by re-checking on a timer and whenever the app
// returns to the foreground.
export function useGpsTracking(enabled) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) {
      stopTracking().catch(() => {});
      return undefined;
    }

    const interval = setInterval(() => setTick((n) => n + 1), RESYNC_INTERVAL_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setTick((n) => n + 1);
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !supabase) return;
    fetchActiveLoad(supabase)
      .then((load) => {
        const shouldTrack = load && ACTIVE_STATUSES.includes(load.status) && !!load.checklist?.arrived_at;
        return shouldTrack ? startTracking(load.id) : stopTracking();
      })
      .catch(() => {});
  }, [enabled, tick]);
}
