// Driver-initiated availability signal -- lets a driver with no active load
// tell dispatch "I'm available today" and whether their trailer is
// currently empty. Distinct from the normal dispatch-assigns-a-load flow;
// this never writes to `loads` itself, dispatch resolves each request from
// the web dashboard. See supabase/schema.sql's load_requests comment.
function unwrap(label) {
  return ({ data, error }) => {
    if (error) throw new Error(`${label}: ${error.message}`);
    return data;
  };
}

export async function fetchLatestLoadRequest(supabase, driverId) {
  const { data, error } = await supabase
    .from('load_requests')
    .select('*')
    .eq('driver_id', driverId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`load_requests: ${error.message}`);
  return data;
}

export async function submitLoadRequest(supabase, { driverId, wantsLoadToday, hasEmpty }) {
  return supabase
    .from('load_requests')
    .insert({ driver_id: driverId, wants_load_today: wantsLoadToday, has_empty: hasEmpty })
    .select('*')
    .single()
    .then(unwrap('load_requests insert'));
}
