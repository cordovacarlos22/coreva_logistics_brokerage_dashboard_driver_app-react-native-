// Writes to public.checklists / public.checklist_photos / public.loads --
// see supabase/schema.sql for column shapes and supabase/README.md for the
// `load-photos`/`bol-photos` storage buckets. This is Carlos's full Pickup
// flow (see the Pickup screen), digitized as:
//   confirm arrival        -> checklists.arrived_at
//   sign for shipment      -> checklists.signed_at
//   photograph the BOL     -> checklist_photos (type: bol), plus loads.bol_*
//                             via the /api/ocr/bol backend route (lib/api.js)
//   turn in plant copy     -> checklists.plant_copy_turned_in_at
//   secure the load        -> checklists.single_stack_confirmed
//   photo of strapped load -> checklist_photos (type: load_secured) --
//                             the AI compliance check on this step is
//                             temporarily off, see uploadLoadSecuredPhoto
//   seal the trailer       -> checklists.seal_number/sealed_at/locked_at,
//                             status: 'locked' (final write RLS allows on
//                             this row -- see markDeparted below)
//   confirm departure      -> loads.picked_up_at + loads.status
import { apiPost } from './api.js';

function unwrap(label) {
  return ({ data, error }) => {
    if (error) throw new Error(`${label}: ${error.message}`);
    return data;
  };
}

export async function fetchOrCreateChecklist(supabase, loadId, driverId) {
  const { data: existing, error: fetchError } = await supabase
    .from('checklists')
    .select('*')
    .eq('load_id', loadId)
    .eq('driver_id', driverId)
    .maybeSingle();

  if (fetchError) throw new Error(`checklists: ${fetchError.message}`);
  if (existing) return existing;

  const { data: created, error: insertError } = await supabase
    .from('checklists')
    .insert({ load_id: loadId, driver_id: driverId })
    .select('*')
    .single();

  if (!insertError) return created;

  // Unique-violation race: something else (a double-tap, a duplicate
  // focus-effect fire) inserted the row for this load+driver in the gap
  // between the select above and this insert. Whoever won, read it back
  // rather than erroring -- this is what schema.sql's `unique (load_id,
  // driver_id)` constraint on checklists exists to make safe.
  if (insertError.code === '23505') {
    return supabase
      .from('checklists')
      .select('*')
      .eq('load_id', loadId)
      .eq('driver_id', driverId)
      .single()
      .then(unwrap('checklists'));
  }

  throw new Error(`checklists insert: ${insertError.message}`);
}

export async function markArrived(supabase, checklistId) {
  return updateChecklist(supabase, checklistId, { arrived_at: new Date().toISOString() });
}

// Departure happens after the checklist is already sealed/locked, so it
// can't live on `checklists` -- the checklists_update RLS policy blocks a
// driver from writing to a locked row at all (see schema.sql). Written to
// `loads` instead (picked_up_at + status), which loads_write RLS already
// permits unconditionally for driver_id = auth.uid(). Also drops the load
// off Activate Shipment and reflects everywhere else that reads status
// (Loads Overview, Live Map).
export async function markDeparted(supabase, loadId) {
  const { data, error } = await supabase
    .from('loads')
    .update({ status: 'picked_up', picked_up_at: new Date().toISOString() })
    .eq('id', loadId)
    .select('*')
    .single();
  if (error) throw new Error(`loads update: ${error.message}`);
  return data;
}

export async function markSigned(supabase, checklistId) {
  return updateChecklist(supabase, checklistId, { signed_at: new Date().toISOString() });
}

export async function markPlantCopyTurnedIn(supabase, checklistId) {
  return updateChecklist(supabase, checklistId, {
    plant_copy_turned_in_at: new Date().toISOString(),
  });
}

export async function markSecured(supabase, checklistId) {
  return updateChecklist(supabase, checklistId, { single_stack_confirmed: true });
}

// "Never break an existing seal; secure every load, even single-stacked, no
// exceptions" (CLAUDE.md) -- this is the terminal step. It sets seal_number
// + sealed_at + locked_at + status together in one update, since after
// status flips to 'locked' the checklists_update RLS policy's `using`
// clause (status = 'in_progress') stops matching the row for this driver.
export async function sealChecklist(supabase, checklistId, sealNumber) {
  const now = new Date().toISOString();
  return updateChecklist(supabase, checklistId, {
    seal_number: sealNumber,
    sealed_at: now,
    locked_at: now,
    status: 'locked',
  });
}

async function updateChecklist(supabase, checklistId, patch) {
  return supabase
    .from('checklists')
    .update(patch)
    .eq('id', checklistId)
    .select('*')
    .single()
    .then(unwrap('checklists update'));
}

// `uri` is a local file:// URI from expo-image-picker. RN's fetch() can
// read local file URIs directly; arrayBuffer() (rather than .blob()) is the
// reliable path for handing image bytes to supabase-js's storage upload
// under Hermes.
//
// Plain client-side upload + insert, same as before the AI compliance
// check existed -- that check (backend's /api/vision/load-secured route)
// is temporarily off (kept ready to re-enable, not deleted) while the
// reference-photo feature that broke it gets debugged separately. `loadId`
// stays an accepted (now-unused) param so callers don't need to change.
// eslint-disable-next-line no-unused-vars
export async function uploadLoadSecuredPhoto(supabase, { loadId, checklistId, uri, mimeType }) {
  const arraybuffer = await fetch(uri).then((res) => res.arrayBuffer());
  const contentType = mimeType || 'image/jpeg';
  const extension = contentType.split('/')[1] || 'jpg';
  const storagePath = `${checklistId}/load-secured-${Date.now()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from('load-photos')
    .upload(storagePath, arraybuffer, { contentType });
  if (uploadError) throw new Error(`load-photos upload: ${uploadError.message}`);

  return supabase
    .from('checklist_photos')
    .insert({ checklist_id: checklistId, type: 'load_secured', storage_path: storagePath })
    .select('*')
    .single()
    .then(unwrap('checklist_photos insert'));
}

export async function fetchLoadSecuredPhoto(supabase, checklistId) {
  return fetchChecklistPhoto(supabase, checklistId, 'load_secured');
}

export async function fetchBolPhoto(supabase, checklistId) {
  return fetchChecklistPhoto(supabase, checklistId, 'bol');
}

async function fetchChecklistPhoto(supabase, checklistId, type) {
  const { data, error } = await supabase
    .from('checklist_photos')
    .select('*')
    .eq('checklist_id', checklistId)
    .eq('type', type)
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`checklist_photos: ${error.message}`);
  return data;
}

// Uploads to `bol-photos` (not `load-photos` -- this is the BOL paperwork
// photo, not the strapped-load compliance photo) then calls the backend's
// /api/ocr/bol route, which downloads it from Storage, runs Amazon
// Textract, writes the extracted fields onto the load, and inserts the
// checklist_photos row itself (so the row's ocr_raw is populated
// server-side, not left for the client to fill in separately).
export async function uploadBolPhoto(supabase, { loadId, checklistId, uri, mimeType }) {
  const arraybuffer = await fetch(uri).then((res) => res.arrayBuffer());
  const contentType = mimeType || 'image/jpeg';
  const extension = contentType.split('/')[1] || 'jpg';
  const storagePath = `${checklistId}/bol-${Date.now()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from('bol-photos')
    .upload(storagePath, arraybuffer, { contentType });
  if (uploadError) throw new Error(`bol-photos upload: ${uploadError.message}`);

  return apiPost('/api/ocr/bol', { loadId, checklistId, storagePath });
}
