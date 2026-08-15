// Writes to public.delivery_records / the `pod-photos` storage bucket --
// see supabase/schema.sql. Mirrors lib/checklists.js's shape, including the
// race-safe fetchOrCreate pattern (unique(load_id, driver_id) backs it),
// but delivery gets its own table entirely rather than extending
// `checklists` -- by delivery time the pickup checklist is already
// 'locked' (seal placed) and RLS permanently blocks writing to a locked
// row. See schema.sql's comment on delivery_records for the full reasoning.
//   step 1 "confirm arrival"   -> arrived_at
//   step 2 "confirm unload"    -> unloaded_at
//   step 3 "upload POD"        -> pod_storage_path (plain photo, no OCR --
//                                 unlike BOL, nothing calls for extracted
//                                 fields off a POD)
//   step 4 "confirm departure" -> departed_at, status: 'locked', locked_at,
//                                 plus loads.status: 'delivered' (final
//                                 step -- once locked, RLS blocks further
//                                 updates, same as a sealed checklist)
function unwrap(label) {
  return ({ data, error }) => {
    if (error) throw new Error(`${label}: ${error.message}`);
    return data;
  };
}

export async function fetchOrCreateDeliveryRecord(supabase, loadId, driverId) {
  const { data: existing, error: fetchError } = await supabase
    .from('delivery_records')
    .select('*')
    .eq('load_id', loadId)
    .eq('driver_id', driverId)
    .maybeSingle();

  if (fetchError) throw new Error(`delivery_records: ${fetchError.message}`);
  if (existing) return existing;

  const { data: created, error: insertError } = await supabase
    .from('delivery_records')
    .insert({ load_id: loadId, driver_id: driverId })
    .select('*')
    .single();

  if (!insertError) return created;

  // Unique-violation race -- same class as fetchOrCreateChecklist, see its
  // comment in lib/checklists.js.
  if (insertError.code === '23505') {
    return supabase
      .from('delivery_records')
      .select('*')
      .eq('load_id', loadId)
      .eq('driver_id', driverId)
      .single()
      .then(unwrap('delivery_records'));
  }

  throw new Error(`delivery_records insert: ${insertError.message}`);
}

export async function markArrived(supabase, deliveryId) {
  return updateDeliveryRecord(supabase, deliveryId, { arrived_at: new Date().toISOString() });
}

export async function markUnloaded(supabase, deliveryId) {
  return updateDeliveryRecord(supabase, deliveryId, { unloaded_at: new Date().toISOString() });
}

async function updateDeliveryRecord(supabase, deliveryId, patch) {
  return supabase
    .from('delivery_records')
    .update(patch)
    .eq('id', deliveryId)
    .select('*')
    .single()
    .then(unwrap('delivery_records update'));
}

// `uri` is a local file:// URI from expo-image-picker -- same
// fetch().arrayBuffer() upload path as uploadBolPhoto/uploadLoadSecuredPhoto
// in lib/checklists.js. No OCR call and no checklist_photos row here --
// the photo path is stored directly on delivery_records instead.
export async function uploadPodPhoto(supabase, { deliveryId, uri, mimeType }) {
  const arraybuffer = await fetch(uri).then((res) => res.arrayBuffer());
  const contentType = mimeType || 'image/jpeg';
  const extension = contentType.split('/')[1] || 'jpg';
  const storagePath = `${deliveryId}/pod-${Date.now()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from('pod-photos')
    .upload(storagePath, arraybuffer, { contentType });
  if (uploadError) throw new Error(`pod-photos upload: ${uploadError.message}`);

  return updateDeliveryRecord(supabase, deliveryId, { pod_storage_path: storagePath });
}

// Terminal step -- sets departed_at + status='locked' + locked_at together
// in one atomic update (same pattern as lib/checklists.js's sealChecklist),
// then flips loads.status separately (driver-owned data, loads_write RLS
// already permits it unconditionally).
export async function completeDelivery(supabase, { deliveryId, loadId }) {
  const now = new Date().toISOString();
  const record = await updateDeliveryRecord(supabase, deliveryId, {
    departed_at: now,
    status: 'locked',
    locked_at: now,
  });

  const { error: loadError } = await supabase.from('loads').update({ status: 'delivered' }).eq('id', loadId);
  if (loadError) throw new Error(`loads update: ${loadError.message}`);

  return record;
}
