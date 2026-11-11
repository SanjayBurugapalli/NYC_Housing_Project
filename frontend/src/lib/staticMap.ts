// A Mapbox Static Images basemap plus the math to draw on top of it. The
// homepage's map recreations put HTML/SVG (pins, labels) over a static
// light-v11 image, so they stay sharp at any size; these helpers project
// [lng, lat] into the image's own pixel space, the same Web Mercator / 512px
// tile convention Mapbox GL and the Static Images API use.

type LngLat = [number, number];

const TILE = 512;
const STYLE = "mapbox/light-v11";
const EARTH_CIRCUMFERENCE_M = 40075016.686;

export interface MapFrame {
  center: LngLat;
  zoom: number;
  /** Logical (CSS) pixel size of the image; the URL asks for @2x. */
  width: number;
  height: number;
}

// Position in the world square at zoom 0, as a 0–1 fraction.
const worldX = (lng: number) => (lng + 180) / 360;
const worldY = (lat: number) => {
  const s = Math.sin((lat * Math.PI) / 180);
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
};
const lngOf = (x: number) => x * 360 - 180;
const latOf = (y: number) => (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;

// The Static Images API takes a rounded center and zoom; overlays must use the same.
function frameAt(cx: number, cy: number, zoom: number, width: number, height: number): MapFrame {
  return {
    center: [Number(lngOf(cx).toFixed(5)), Number(latOf(cy).toFixed(5))],
    zoom: Number(zoom.toFixed(2)),
    width,
    height,
  };
}

/** The frame centered on `center` at which a `radiusM` circle is `radiusPx` across its radius. */
export function frameForRadius(center: LngLat, radiusM: number, radiusPx: number, width: number, height: number): MapFrame {
  const metersPerPxAtZ0 = (EARTH_CIRCUMFERENCE_M * Math.cos((center[1] * Math.PI) / 180)) / TILE;
  const zoom = Math.log2((radiusPx * metersPerPxAtZ0) / radiusM);
  return frameAt(worldX(center[0]), worldY(center[1]), zoom, width, height);
}

/** Where a point lands in the image, in logical pixels from its top-left. */
export function toPixel(frame: MapFrame, [lng, lat]: LngLat): [number, number] {
  const size = TILE * 2 ** frame.zoom;
  return [
    (worldX(lng) - worldX(frame.center[0])) * size + frame.width / 2,
    (worldY(lat) - worldY(frame.center[1])) * size + frame.height / 2,
  ];
}

/** How many logical pixels `meters` spans at the frame's center. */
export function metersToPixels(frame: MapFrame, meters: number): number {
  const metersPerPx = (EARTH_CIRCUMFERENCE_M * Math.cos((frame.center[1] * Math.PI) / 180)) / (TILE * 2 ** frame.zoom);
  return meters / metersPerPx;
}

/** Retina basemap for the frame. The Mapbox logo and attribution stay on (required). */
export function staticMapUrl(frame: MapFrame, token: string): string {
  const [lng, lat] = frame.center;
  return (
    `https://api.mapbox.com/styles/v1/${STYLE}/static/${lng},${lat},${frame.zoom},0/` +
    `${frame.width}x${frame.height}@2x?access_token=${encodeURIComponent(token)}`
  );
}
