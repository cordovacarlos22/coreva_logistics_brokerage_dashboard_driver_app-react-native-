// Writes to public.checklists / public.checklist_photos -- see
// supabase/schema.sql (checklists table) for the column shapes and
// supabase/README.md for the `load-photos` storage bucket. This is the
// real Hub Group departure-checklist workflow (see the checklist screen),
// digitized onto the one-row-per-driver-per-load `checklists` table:
//   step 1 "sign for shipment"        -> signed_at
//   step 2 "turn in plant copy"       -> plant_copy_turned_in_at
//   step 3 "secure the load"          -> single_stack_confirmed
//   step 4 "photo of strapped load"   -> checklist_photos (type: load_secured)
//   step 5 "seal the trailer"         -> seal_number, sealed_at, locked_at,
//                                        status: 'locked' (final step -- once
//                                        sealed, RLS blocks further updates)
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
export async function uploadLoadSecuredPhoto(supabase, { checklistId, uri, mimeType }) {
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
  const { data, error } = await supabase
    .from('checklist_photos')
    .select('*')
    .eq('checklist_id', checklistId)
    .eq('type', 'load_secured')
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`checklist_photos: ${error.message}`);
  return data;
}
