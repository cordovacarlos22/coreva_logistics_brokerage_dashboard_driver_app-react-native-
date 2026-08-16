// Mirrors lib/chat.js's load_messages functions, for the load-independent
// dispatch thread (driver_messages) -- see schema.sql's driver_messages
// comment: one shared thread per driver, all staff see and can post in it.
function unwrap(label) {
  return ({ data, error }) => {
    if (error) throw new Error(`${label}: ${error.message}`);
    return data;
  };
}

export async function fetchDriverMessages(supabase, driverId) {
  return supabase
    .from('driver_messages')
    .select('*, sender:profiles(full_name)')
    .eq('driver_id', driverId)
    .order('created_at', { ascending: true })
    .then(unwrap('driver_messages'));
}

export async function sendDriverMessage(supabase, { driverId, senderId, body }) {
  const { error } = await supabase
    .from('driver_messages')
    .insert({ driver_id: driverId, sender_id: senderId, body });
  if (error) throw new Error(`driver_messages insert: ${error.message}`);
}

export function subscribeToDriverMessages(supabase, driverId, onInsert) {
  if (!supabase) return () => {};

  const channel = supabase
    .channel(`driver_messages-${driverId}-${Math.random().toString(36).slice(2)}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'driver_messages', filter: `driver_id=eq.${driverId}` },
      onInsert
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}
