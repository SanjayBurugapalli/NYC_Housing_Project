// Grade-colored building outlines for street-level zooms: a PMTiles archive
// built by data/publish_footprints.py. Optional — when unset, the map keeps
// showing dots at every zoom. A pmtiles protocol URL, e.g.
//   pmtiles://https://<blob-host>/footprints.pmtiles
// Kept out of Map.tsx so server-rendered UI (the zoom stepper) can read it
// without importing mapbox-gl.
export const FOOTPRINTS_URL = process.env.NEXT_PUBLIC_FOOTPRINTS_URL || "";
export const USE_FOOTPRINTS = FOOTPRINTS_URL.length > 0;

/**
 * Lowest zoom the outline tiles exist at (data/publish_footprints.py builds
 * z15–16). They're loaded from here but only drawn from the dots→outlines
 * cross-fade in Map.tsx (z15.6–16).
 */
export const FOOTPRINTS_MINZOOM = 15;
