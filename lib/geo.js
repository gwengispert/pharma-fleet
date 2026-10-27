// Small geometry helpers shared by the server-side drive simulation and the
// client-side vehicle animation, so both walk a path identically.

export function haversineMeters(a, b) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Compass bearing (0-360, 0 = north, clockwise) from point a to point b —
// used to point the vehicle marker in its direction of travel. Google Maps
// only rotates the actual map camera for vector maps (which need a Map ID
// configured in Cloud Console); plain raster maps ignore `heading`, so
// rotating the marker icon itself is what actually works here.
export function bearingDegrees(a, b) {
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function pathLengthMeters(path) {
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) total += haversineMeters(path[i], path[i + 1]);
  return total;
}

// Walks `path` and returns the {lat,lng,heading} at `fraction` (0-1) of its
// total length — used to animate the simulated vehicle marker, including
// which way it should be pointing.
export function positionAlongPath(path, fraction) {
  if (!path.length) return null;
  if (path.length === 1) return { ...path[0], heading: 0 };

  const segmentLengths = [];
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const len = haversineMeters(path[i], path[i + 1]);
    segmentLengths.push(len);
    total += len;
  }
  if (total === 0) return { ...path[0], heading: 0 };

  let target = total * Math.min(Math.max(fraction, 0), 1);
  for (let i = 0; i < segmentLengths.length; i++) {
    if (target <= segmentLengths[i]) {
      const t = segmentLengths[i] === 0 ? 0 : target / segmentLengths[i];
      const a = path[i];
      const b = path[i + 1];
      return {
        lat: a.lat + (b.lat - a.lat) * t,
        lng: a.lng + (b.lng - a.lng) * t,
        heading: bearingDegrees(a, b),
      };
    }
    target -= segmentLengths[i];
  }
  const last = path[path.length - 1];
  const prev = path[path.length - 2];
  return { ...last, heading: bearingDegrees(prev, last) };
}
