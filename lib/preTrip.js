// Writes to public.pre_trip_inspections -- see supabase/schema.sql. Same
// one-row-per-driver-per-load shape and race-safe create pattern as
// lib/checklists.js's fetchOrCreateChecklist (unique(load_id, driver_id)
// backs both).
export const INSPECTION_ITEMS = [
  'Lights & Signals',
  'Tires & Wheels',
  'Brakes',
  'Mirrors & Horn',
  'Coupling System',
  'Trailer Doors & Body',
  'Fluid Levels',
  'Emergency Equipment',
];

function unwrap(label) {
  return ({ data, error }) => {
    if (error) throw new Error(`${label}: ${error.message}`);
    return data;
  };
}

function defaultItems() {
  return INSPECTION_ITEMS.map((label) => ({ label, result: null, notes: '' }));
}

export async function fetchOrCreateInspection(supabase, { loadId, driverId, truckId }) {
  const { data: existing, error: fetchError } = await supabase
    .from('pre_trip_inspections')
    .select('*')
    .eq('load_id', loadId)
    .eq('driver_id', driverId)
    .maybeSingle();

  if (fetchError) throw new Error(`pre_trip_inspections: ${fetchError.message}`);
  if (existing) return existing;

  const { data: created, error: insertError } = await supabase
    .from('pre_trip_inspections')
    .insert({ load_id: loadId, driver_id: driverId, truck_id: truckId, items: defaultItems() })
    .select('*')
    .single();

  if (!insertError) return created;

  if (insertError.code === '23505') {
    return supabase
      .from('pre_trip_inspections')
      .select('*')
      .eq('load_id', loadId)
      .eq('driver_id', driverId)
      .single()
      .then(unwrap('pre_trip_inspections'));
  }

  throw new Error(`pre_trip_inspections insert: ${insertError.message}`);
}

export async function updateInspectionItems(supabase, inspectionId, items) {
  return supabase
    .from('pre_trip_inspections')
    .update({ items })
    .eq('id', inspectionId)
    .select('*')
    .single()
    .then(unwrap('pre_trip_inspections update'));
}

export async function submitInspection(supabase, inspectionId, items) {
  const overallResult = items.some((item) => item.result === 'fail') ? 'fail' : 'pass';
  return supabase
    .from('pre_trip_inspections')
    .update({ items, overall_result: overallResult, completed_at: new Date().toISOString() })
    .eq('id', inspectionId)
    .select('*')
    .single()
    .then(unwrap('pre_trip_inspections update'));
}
