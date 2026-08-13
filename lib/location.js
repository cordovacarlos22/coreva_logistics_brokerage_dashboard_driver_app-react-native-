import * as Location from 'expo-location';

// Used to auto-fill the pickup address on Scan New Shipment -- the driver
// is physically standing at the shipping office when they scan, so their
// current position *is* the pickup location. Returns null (never throws)
// on denied permission or a geocoding miss -- callers fall back to manual
// entry, this is a convenience, not a requirement.
export async function getCurrentAddress() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return null;

  const position = await Location.getCurrentPositionAsync({});
  const [address] = await Location.reverseGeocodeAsync({
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  });
  if (!address) return null;

  if (address.formattedAddress) return address.formattedAddress;

  const streetLine = [address.streetNumber, address.street].filter(Boolean).join(' ');
  const cityLine = [address.city, address.region].filter(Boolean).join(', ');
  return [streetLine, cityLine].filter(Boolean).join(', ') || null;
}
