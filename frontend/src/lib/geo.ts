// Small geometry helpers for map overlays (no turf dependency — city-scale
// distances are fine with an equirectangular approximation).

const EARTH_RADIUS_M = 6_371_000;

/** Straight-line distance in meters. */
export function distanceMeters(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** "2.1 mi" — straight-line distance label. */
export function formatMiles(meters: number): string {
  const miles = meters / 1609.344;
  return miles < 0.1 ? "<0.1 mi" : `${miles.toFixed(1)} mi`;
}

/** Closed ring approximating a circle of `radiusM` around `center` ([lng, lat]). */
export function circleRing(center: [number, number], radiusM: number, steps = 72): [number, number][] {
  const [lng, lat] = center;
  const dLat = (radiusM / EARTH_RADIUS_M) * (180 / Math.PI);
  const dLng = dLat / Math.cos((lat * Math.PI) / 180);
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI;
    ring.push([lng + dLng * Math.cos(t), lat + dLat * Math.sin(t)]);
  }
  return ring;
}

/** Point on the circle at `bearingDeg` (0 = north, 90 = east). */
export function pointOnCircle(center: [number, number], radiusM: number, bearingDeg: number): [number, number] {
  const [lng, lat] = center;
  const t = (bearingDeg * Math.PI) / 180;
  const dLat = (radiusM / EARTH_RADIUS_M) * (180 / Math.PI);
  const dLng = dLat / Math.cos((lat * Math.PI) / 180);
  return [lng + dLng * Math.sin(t), lat + dLat * Math.cos(t)];
}

/**
 * A gentle arc between two points (quadratic Bézier bowed to one side), for
 * the as-the-crow-flies commute line. Returns the points and the midpoint.
 */
export function arcBetween(
  a: [number, number],
  b: [number, number],
  steps = 64
): { line: [number, number][]; mid: [number, number] } {
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  // Perpendicular offset proportional to length, in degree space corrected
  // for longitude compression so the bow looks the same in every direction.
  const k = Math.cos((my * Math.PI) / 180);
  const dx = (b[0] - a[0]) * k;
  const dy = b[1] - a[1];
  const bow = 0.18;
  const cx = mx + (-dy * bow) / k;
  const cy = my + dx * bow;
  const line: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    line.push([u * u * a[0] + 2 * u * t * cx + t * t * b[0], u * u * a[1] + 2 * u * t * cy + t * t * b[1]]);
  }
  return { line, mid: line[Math.floor(steps / 2)] };
}

export function boundsOf(points: [number, number][]): [[number, number], [number, number]] {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [x, y] of points) {
    if (x < w) w = x;
    if (x > e) e = x;
    if (y < s) s = y;
    if (y > n) n = y;
  }
  return [[w, s], [e, n]];
}
