// Mirrors apps/web/src/lib/chat.js's load_messages functions, scoped to
// just the 'driver' channel -- a driver only ever has one thread (their own
// direct line to the customer), unlike the web dashboard which also shows
// the staff-facing 'dispatch' channel. See schema.sql's load_messages
// comment: channel='driver' is customer <-> driver, direct, not routed
// through dispatch.
function unwrap(label) {
  return ({ data, error }) => {
    if (error) throw new Error(`${label}: ${error.message}`);
    return data;
  };
}

export async function fetchLoadMessages(supabase, loadId) {
  return supabase
    .from('load_messages')
    .select('*, sender:profiles(full_name)')
    .eq('load_id', loadId)
    .eq('channel', 'driver')
    .order('created_at', { ascending: true })
    .then(unwrap('load_messages'));
}

export async function sendLoadMessage(supabase, { loadId, senderId, body }) {
  const { error } = await supabase
    .from('load_messages')
    .insert({ load_id: loadId, channel: 'driver', sender_id: senderId, body });
  if (error) throw new Error(`load_messages insert: ${error.message}`);
}

// Realtime payloads don't include the joined sender name, so just refetch
// the full list on every insert rather than merging partial rows -- same
// tradeoff the web dashboard's chat already makes, message volume here is
// low enough that this is simpler and more robust than cache patching.
export function subscribeToLoadMessages(supabase, loadId, onInsert) {
  if (!supabase) return () => {};

  const channel = supabase
    .channel(`load_messages-${loadId}-${Math.random().toString(36).slice(2)}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'load_messages', filter: `load_id=eq.${loadId}` },
      onInsert
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}

// Same idea as subscribeToLoadMessages, but not scoped to one load -- used
// for the Chat tab's badge, which needs to know about a new message
// regardless of which load it's for. No explicit channel filter needed:
// load_messages_select RLS already limits what a driver's session can see
// to `channel = 'driver' and driver_id = auth.uid()`, so this only ever
// delivers events for messages the signed-in driver could see anyway.
export function subscribeToDriverChannelInserts(supabase, onInsert) {
  if (!supabase) return () => {};

  const channel = supabase
    .channel(`load_messages-driver-badge-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'load_messages' }, onInsert)
    .subscribe();

  return () => supabase.removeChannel(channel);
}
