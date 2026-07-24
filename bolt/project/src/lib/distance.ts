export interface Coordinates {
  latitude: number;
  longitude: number;
}

// Approximate building centres. Most points come from OpenStreetMap; FD I and
// LTC are estimated from the official institute building plan.
const BUILDING_COORDINATES: Record<string, Coordinates> = {
  'FD I': { latitude: 28.36382, longitude: 75.58935 },
  'FD II': { latitude: 28.3639767, longitude: 75.5880798 },
  'FD III': { latitude: 28.3636528, longitude: 75.5859022 },
  LTC: { latitude: 28.36385, longitude: 75.5907 },
  NAB: { latitude: 28.3620457, longitude: 75.5875265 },
  IPC: { latitude: 28.3620457, longitude: 75.5875265 },
  'New Workshop': { latitude: 28.3650753, longitude: 75.5877529 },
};

export function getBuildingCoordinates(building: string): Coordinates | undefined {
  return BUILDING_COORDINATES[building.trim()];
}

function toRadians(value: number): number {
  return value * Math.PI / 180;
}

export function getDistanceInMeters(from: Coordinates, to: Coordinates): number {
  const earthRadius = 6_371_000;
  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const fromLatitude = toRadians(from.latitude);
  const toLatitude = toRadians(to.latitude);

  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;

  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatApproximateDistance(meters: number): string {
  if (meters < 1000) return `~${Math.max(10, Math.round(meters / 10) * 10)} m`;
  return `~${(meters / 1000).toFixed(1)} km`;
}

export function formatWalkingDistance(meters: number): string {
  if (meters < 1000) return `${Math.max(1, Math.round(meters))} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}
