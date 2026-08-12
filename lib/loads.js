// Same `unwrap` + query-shape conventions as
// apps/web/src/lib/loadDetail.js -- RLS (loads_select: driver_id =
// auth.uid()) already scopes every query here to the signed-in driver's own
// loads, so no extra client-side filtering by driver is needed.
function unwrap(label) {
  return ({ data, error }) => {
    if (error) throw new Error(`${label}: ${error.message}`);
    return data;
  };
}

const LOAD_SELECT =
  '*, trailer:trailers(trailer_number, type), truck:trucks(unit_number), consignee:consignees(id, name)';

// "Active" = assigned to this driver and not yet at a terminal status.
// Excludes 'pending' (no driver assigned yet) and 'delivered'/'dropped'
// (done -- those show up in History instead).
const ACTIVE_STATUSES = ['assigned', 'picked_up', 'in_transit'];

export async function fetchActiveLoad(supabase) {
  const { data, error } = await supabase
    .from('loads')
    .select(LOAD_SELECT)
    .in('status', ACTIVE_STATUSES)
    .order('pickup_appointment_at', { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`loads: ${error.message}`);
  return data;
}

export async function fetchLoadById(supabase, loadId) {
  return supabase.from('loads').select(LOAD_SELECT).eq('id', loadId).single().then(unwrap('loads'));
}
