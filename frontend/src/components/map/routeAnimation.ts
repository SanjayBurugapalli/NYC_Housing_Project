// Geometry for drawing a commute as a short film: walk to the station, the
// ride, the walk to work. Legs are measured once; the overlay then reveals
// each leg by fraction while the camera follows act by act.

import { distanceMeters } from "@/lib/geo";
import type { CommuteLeg } from "@/types/building";

type LngLat = [number, number];

// A walk between two rides shorter than this is an in-station transfer; it
// plays as part of the ride act rather than getting its own zoomed-in scene.
const TRANSFER_MAX_M = 400;

export interface PreparedLeg {
  leg: CommuteLeg;
  walk: boolean;
  /** Line color: MTA route color for transit, null for walking (drawn in ink). */
  color: string | null;
  points: LngLat[];
  /** Cumulative meters at each point. */
  cum: number[];
  length: number;
}

/** A scene of the film: one walk, or a run of rides (with their transfers). */
export interface Act {
  kind: "walk" | "ride";
  legs: PreparedLeg[];
  points: LngLat[];
}

export interface PreparedRoute {
  legs: PreparedLeg[];
  acts: Act[];
  /** Every point of the route, for framing the finished trip. */
  all: LngLat[];
  /** Where the duration label goes: middle of the longest ride (or of the trip). */
  labelAt: LngLat;
}

function measure(points: LngLat[]): number[] {
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + distanceMeters(points[i - 1], points[i]));
  return cum;
}

function pointAt(points: LngLat[], cum: number[], d: number): LngLat {
  if (d <= 0) return points[0];
  const total = cum[cum.length - 1];
  if (d >= total) return points[points.length - 1];
  let i = 1;
  while (cum[i] < d) i++;
  const t = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
  const [a, b] = [points[i - 1], points[i]];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/**
 * Measure the legs and group them into acts. The first and last walks are
 * stitched to the building and the workplace (the router snaps to the nearest
 * street, which can sit a few meters away); legs with no geometry are dropped.
 */
export function prepareRoute(legs: CommuteLeg[], from: LngLat, to: LngLat): PreparedRoute | null {
  const prepared: PreparedLeg[] = [];
  legs.forEach((leg, i) => {
    const walk = leg.mode === "WALK";
    let points = [...leg.geometry] as LngLat[];
    if (walk && i === 0) points = [from, ...points];
    if (walk && i === legs.length - 1) points = [...points, to];
    if (points.length < 2) return;
    const cum = measure(points);
    const length = cum[cum.length - 1];
    if (length < 1) return;
    prepared.push({ leg, walk, color: walk ? null : leg.route_color, points, cum, length });
  });
  if (prepared.length === 0) return null;

  const acts: Act[] = [];
  prepared.forEach((p, i) => {
    const prev = acts[acts.length - 1];
    const isTransfer =
      p.walk && p.length < TRANSFER_MAX_M && i > 0 && i < prepared.length - 1 && !prepared[i + 1].walk;
    const kind: Act["kind"] = p.walk && !isTransfer ? "walk" : "ride";
    if (prev && prev.kind === kind && kind === "ride") {
      prev.legs.push(p);
      prev.points.push(...p.points);
    } else {
      acts.push({ kind, legs: [p], points: [...p.points] });
    }
  });

  const rides = prepared.filter((p) => !p.walk);
  const longest = (rides.length ? rides : prepared).reduce((a, b) => (b.length > a.length ? b : a));
  return {
    legs: prepared,
    acts,
    all: prepared.flatMap((p) => p.points),
    labelAt: pointAt(longest.points, longest.cum, longest.length / 2),
  };
}

/** The first `f` (0–1) of a leg, by distance. */
export function legSlice(leg: PreparedLeg, f: number): LngLat[] {
  if (f <= 0) return [];
  if (f >= 1) return leg.points;
  const d = f * leg.length;
  const out = leg.points.filter((_, i) => leg.cum[i] < d);
  out.push(pointAt(leg.points, leg.cum, d));
  return out.length >= 2 ? out : [];
}

/** Smooth start and stop within a scene. */
export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}
