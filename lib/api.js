import { supabase } from './supabaseClient.js';

// First time this app calls the Express backend (Phase 1 only ever talked
// to Supabase directly). Unlike apps/web/src/lib/api.js, this attaches the
// driver's Supabase session token, since the new /api/ocr/bol route is
// behind requireAuth.
const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;

export async function apiPost(path, body) {
  if (!apiBaseUrl) throw new Error('EXPO_PUBLIC_API_BASE_URL is not configured');
  if (!supabase) throw new Error('Supabase is not configured');

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in');

  const res = await fetch(`${apiBaseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
