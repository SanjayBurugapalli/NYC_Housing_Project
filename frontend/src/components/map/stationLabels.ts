// Keeps the commute's station names from piling up. Seen whole, a route's
// stops cluster (a bus-to-subway transfer, the last stop next to work), and on
// a phone everything is closer still.

import type mapboxgl from "mapbox-gl";
import { LABEL_SIDES, isMarkerShown, setStationLabelSide, stationLabel, stationLabelBox, type LabelSide } from "@/components/map/markers";

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// Breathing room between two boxes before they count as touching.
const GAP = 2;
const overlaps = (a: Box, b: Box) =>
  a.x0 < b.x1 + GAP && b.x0 < a.x1 + GAP && a.y0 < b.y1 + GAP && b.y0 < a.y1 + GAP;

// A name pill's size never changes, so it's measured once.
const sizes = new WeakMap<HTMLElement, { w: number; h: number }>();

/**
 * Everything a station name must stay clear of: the route's end markers and
 * trip-time pill (tagged data-label-obstacle; the pill only once shown) and
 * the docked building card. A marker counts by its parts — the grade tile and
 * its caption separately — since its own box is as wide as the caption and
 * would wall off the empty space beside the tile.
 */
export function labelObstacles(m: mapboxgl.Map): HTMLElement[] {
  const parts = [...m.getContainer().querySelectorAll<HTMLElement>("[data-label-obstacle]")]
    .filter(isMarkerShown)
    .flatMap((marker) => [...marker.children] as HTMLElement[]);
  const card = document.querySelector<HTMLElement>("[data-docked-card]");
  return card ? [...parts, card] : parts;
}

/**
 * In priority order, put each shown station's name on the first side of its
 * dot (right, left, below, above) that stays on the map and clears every
 * obstacle, every shown dot and every name placed before it; hide it when no
 * side does. Each side is
 * tried arithmetically (dot position + cached name size) instead of moving the
 * name and re-measuring it, so this is cheap enough to run on every frame of a
 * camera move.
 */
export function layoutStationLabels(m: mapboxgl.Map, stations: mapboxgl.Marker[], obstacles: HTMLElement[]) {
  // Reads first, so the writes at the end don't force a layout per label.
  const origin = m.getContainer().getBoundingClientRect();
  const placed: Box[] = obstacles.map((o) => {
    const r = o.getBoundingClientRect();
    return { x0: r.left - origin.left, y0: r.top - origin.top, x1: r.right - origin.left, y1: r.bottom - origin.top };
  });
  const items = stations
    .map((s) => s.getElement())
    .filter(isMarkerShown)
    .map((el) => {
      const dot = el.getBoundingClientRect();
      const cx = (dot.left + dot.right) / 2 - origin.left;
      const cy = (dot.top + dot.bottom) / 2 - origin.top;
      placed.push({ x0: dot.left - origin.left, y0: dot.top - origin.top, x1: dot.right - origin.left, y1: dot.bottom - origin.top });
      const label = stationLabel(el);
      let size = label ? sizes.get(label) : undefined;
      if (label && !size) {
        size = { w: label.offsetWidth, h: label.offsetHeight };
        sizes.set(label, size);
      }
      return { el, cx, cy, size };
    });

  // A name hanging off the map edge is as unreadable as one under another.
  const inView = (b: Box) => b.x0 >= 0 && b.y0 >= 0 && b.x1 <= origin.width && b.y1 <= origin.height;
  const sides = items.map(({ cx, cy, size }): LabelSide | null => {
    if (!size) return null;
    for (const side of LABEL_SIDES) {
      const box = stationLabelBox(side, cx, cy, size.w, size.h);
      if (inView(box) && !placed.some((b) => overlaps(b, box))) {
        placed.push(box);
        return side;
      }
    }
    return null;
  });

  items.forEach(({ el, size }, i) => {
    if (size) setStationLabelSide(el, sides[i]);
  });
}
