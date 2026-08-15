import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { uploadBolPhoto, uploadLoadSecuredPhoto } from './checklists.js';
import { uploadPodPhoto } from './delivery.js';

// A driver at a plant dock can be on one bar of signal -- if a photo
// upload drops mid-flight, that shouldn't mean retaking the photo and
// losing the OCR result. This persists failed uploads locally and retries
// them automatically once connectivity comes back, instead of the driver
// having to notice and retry by hand.
//
// Known limitation: queued items reference the photo's local cache URI
// (from expo-image-picker), not a copy in permanent storage. For the
// realistic retry window (seconds to a few minutes while waiting for
// signal) this is fine; if the OS reclaims the cache before a retry fires,
// that one item quietly drops and the driver would need to retake it.
// Worth revisiting (copy into expo-file-system's document directory) if
// that turns out to happen in practice.
const STORAGE_KEY = 'upload-queue';

const UPLOAD_FNS = { bol: uploadBolPhoto, load_secured: uploadLoadSecuredPhoto, pod: uploadPodPhoto };

// Only queue failures that look like connectivity problems -- retrying a
// 403 (wrong driver) or 503 (OCR not configured) forever wouldn't help,
// it'd just fail the same way every time.
function looksLikeNetworkFailure(err) {
  return /network request failed|failed to fetch|timeout|timed out/i.test(err?.message ?? '');
}

async function getQueue() {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
}

async function setQueue(queue) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

export async function getQueueCount() {
  return (await getQueue()).length;
}

// kind: 'bol' | 'load_secured' | 'pod'. args match the corresponding
// upload function's shape (uploadBolPhoto / uploadLoadSecuredPhoto /
// uploadPodPhoto).
export async function enqueueUpload(kind, args) {
  const queue = await getQueue();
  queue.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, kind, args, createdAt: new Date().toISOString() });
  await setQueue(queue);
}

// Attempts an upload; on a network-looking failure it's queued for retry
// instead of surfacing an error the driver can't do anything about.
// Returns { queued: true } if queued, or the upload function's own result.
export async function uploadOrQueue(kind, supabase, args) {
  try {
    return await UPLOAD_FNS[kind](supabase, args);
  } catch (err) {
    if (!looksLikeNetworkFailure(err)) throw err;
    await enqueueUpload(kind, args);
    return { queued: true };
  }
}

// Retries every queued upload; items that still fail (still no signal)
// stay queued for the next trigger. Returns the items that succeeded, so
// callers can refresh whatever state depends on them.
export async function drainQueue(supabase) {
  const queue = await getQueue();
  if (queue.length === 0) return [];

  const remaining = [];
  const succeeded = [];
  for (const item of queue) {
    try {
      const result = await UPLOAD_FNS[item.kind](supabase, item.args);
      succeeded.push({ ...item, result });
    } catch {
      remaining.push(item);
    }
  }
  await setQueue(remaining);
  return succeeded;
}

// Drains the queue automatically whenever the device regains connectivity.
// Call once near app startup; returns an unsubscribe function.
export function watchForConnectivity(supabase, onDrained) {
  let wasConnected = null;
  return NetInfo.addEventListener((state) => {
    const isConnected = Boolean(state.isConnected && state.isInternetReachable !== false);
    if (isConnected && wasConnected === false) {
      drainQueue(supabase).then((succeeded) => {
        if (succeeded.length > 0) onDrained?.(succeeded);
      });
    }
    wasConnected = isConnected;
  });
}
