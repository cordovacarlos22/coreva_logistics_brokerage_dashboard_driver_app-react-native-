import * as Notifications from 'expo-notifications';

// Lets a driver know a new message landed in their load's chat without
// having to have the app open -- see schema.sql's comment on
// profiles.expo_push_token. Denied permission fails silently, same
// convention as lib/gpsTracking.js's startTracking: push is a convenience,
// never a gate on the driver's actual workflow.
//
// getExpoPushTokenAsync reads Constants.expoConfig.extra.eas.projectId
// automatically -- until `eas init` has been run once, that's unset and
// this call throws, so token registration silently does nothing on a
// project that hasn't been through EAS setup yet.
export async function registerPushToken(supabase, userId) {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') {
    console.warn('[pushNotifications] permission not granted:', status);
    return;
  }

  let token;
  try {
    ({ data: token } = await Notifications.getExpoPushTokenAsync());
  } catch (err) {
    console.warn('[pushNotifications] getExpoPushTokenAsync failed:', err.message);
    return;
  }

  const { error } = await supabase.from('profiles').update({ expo_push_token: token }).eq('id', userId);
  if (error) console.warn('[pushNotifications] failed to save token:', error.message);
}
