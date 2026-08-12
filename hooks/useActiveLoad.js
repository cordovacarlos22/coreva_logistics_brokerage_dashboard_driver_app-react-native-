import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../lib/supabaseClient.js';
import { fetchActiveLoad } from '../lib/loads.js';

// Shared by the Home tab (Active Load Dashboard) and the Load tab -- both
// show the same "driver's current non-terminal load" query. Refetches on
// focus so completing a load's checklist (which locks it, taking it out of
// the active set once delivered/dropped) is reflected without a manual
// pull-to-refresh.
export function useActiveLoad() {
  const [load, setLoad] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refetch = useCallback(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    fetchActiveLoad(supabase)
      .then(setLoad)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(refetch);

  return { load, loading, error, refetch };
}
