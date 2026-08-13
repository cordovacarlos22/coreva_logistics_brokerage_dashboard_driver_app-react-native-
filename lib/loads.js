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

// `checklists(...)` embeds via the existing checklists.load_id FK -- RLS on
// checklists (driver_id = auth.uid() or staff) already scopes this to at
// most the signed-in driver's own row, so no extra filter is needed here.
// `checklist.arrived_at` being set is what distinguishes "needs activating"
// (Activate Shipment tab) from "in progress" (Current Load tab) -- see
// useActiveLoad.js.
const LOAD_SELECT =
  '*, trailer:trailers(trailer_number, type), truck:trucks(unit_number), consignee:consignees(id, name), checklists(id, arrived_at, status)';

// "Active" = assigned to this driver and not yet at a terminal status.
// Excludes 'pending' (no driver assigned yet) and 'delivered'/'dropped'
// (done -- those show up in History instead).
const ACTIVE_STATUSES = ['assigned', 'picked_up', 'in_transit'];

function withChecklist(load) {
  if (!load) return null;
  const { checklists, ...rest } = load;
  return { ...rest, checklist: checklists?.[0] ?? null };
}

export async function fetchActiveLoad(supabase) {
  const { data, error } = await supabase
    .from('loads')
    .select(LOAD_SELECT)
    .in('status', ACTIVE_STATUSES)
    .order('pickup_appointment_at', { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`loads: ${error.message}`);
  return withChecklist(data);
}

export async function fetchLoadById(supabase, loadId) {
  const load = await supabase
    .from('loads')
    .select(LOAD_SELECT)
    .eq('id', loadId)
    .single()
    .then(unwrap('loads'));
  return withChecklist(load);
}

// Driver-initiated load creation ("Scan New Shipment") -- for the real case
// Carlos flagged: dispatch has no info to create the load record ahead of
// time, since the driver's BOL photo is the only source of it. loads_write
// RLS already permits driver_id = auth.uid() on insert, so this is a plain
// client-side write, same as everything else driver-owned in this app.
export async function createDraftLoad(supabase, { driverId, loadNumber, originAddress, destinationAddress }) {
  const { data, error } = await supabase
    .from('loads')
    .insert({
      load_number: loadNumber,
      driver_id: driverId,
      customer_company: 'International Paper',
      origin_address: originAddress,
      destination_address: destinationAddress,
      status: 'assigned',
    })
    .select(LOAD_SELECT)
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error(`Shipment #${loadNumber} already exists -- check with dispatch.`);
    }
    throw new Error(`loads insert: ${error.message}`);
  }
  return withChecklist(data);
}
