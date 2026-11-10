"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import mapboxgl, { type ExpressionSpecification } from "mapbox-gl";
// Imported from the prebuilt dist (the package's `main` is raw TS which Next
// won't transpile from node_modules). mapbox-gl has no MapLibre-style
// addProtocol, so PMTiles is wired in as a custom mapbox-gl *source type*.
import { PmTilesSource } from "mapbox-pmtiles/dist/mapbox-pmtiles.js";
import { useStore } from "@/lib/store";
import { fetchNeighborhoodPolygons } from "@/lib/api";
import { GRADES, GRADE_META, INK, rentStatus } from "@/lib/grades";
import { HoverCard, type HoveredBuilding } from "@/components/map/HoverCard";
import { FOOTPRINTS_MINZOOM, FOOTPRINTS_URL, USE_FOOTPRINTS } from "@/lib/tiles";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Static vector-tile path (env-gated). When NEXT_PUBLIC_TILES_URL is set the
// high-zoom `buildings` layer streams from a hosted PMTiles archive instead of
// fetching GeoJSON from /api/buildings. When unset, the original API-GeoJSON
// path runs unchanged. The URL is a pmtiles protocol URL pointing at the file
// produced by `OUTPUT_FORMAT=pmtiles ./tiles/generate.sh`, e.g.
//   pmtiles://https://cdn.example.com/buildings.pmtiles
// The CSP `connect-src` in next.config.js must include the archive host. If the
// archive is unreachable (bad URL, 404, outage), the map falls back to the API
// GeoJSON source at runtime (see fallbackToApi) so it never goes blank.
const TILES_URL = process.env.NEXT_PUBLIC_TILES_URL || "";
const USE_VECTOR_TILES = TILES_URL.length > 0;
// PmTilesSource builds its own `pmtiles://<url>/{z}/{x}/{y}` template and calls
// `new PMTiles(url)`, so it needs the bare archive URL — strip the protocol
// prefix the env var carries (e.g. pmtiles://https://cdn/...→ https://cdn/...).
const TILES_ARCHIVE_URL = TILES_URL.replace(/^pmtiles:\/\//, "");
// The source-layer name baked into the tileset by tiles/generate.sh.
const TILES_SOURCE_LAYER = "buildings";
// Building outlines (see lib/tiles.ts); layer name from data/publish_footprints.py.
const FOOTPRINTS_ARCHIVE_URL = FOOTPRINTS_URL.replace(/^pmtiles:\/\//, "");
const FOOTPRINTS_SOURCE_LAYER = "footprints";
const FOOTPRINT_LAYERS = ["footprints-fill", "footprints-outline"];

// Register the custom PMTiles vector source type with mapbox-gl exactly once, at
// module load, and only when a PMTiles source is in use. Guarded against SSR
// (mapbox-gl is browser-only) and made idempotent so HMR re-evaluation is safe.
if ((USE_VECTOR_TILES || USE_FOOTPRINTS) && typeof window !== "undefined") {
  if (!mapboxgl.Style.getSourceType(PmTilesSource.SOURCE_TYPE)) {
    mapboxgl.Style.setSourceType(
      PmTilesSource.SOURCE_TYPE,
      // PmTilesSource extends mapbox-gl's internal VectorTileSource at runtime,
      // but our ambient type is intentionally opaque; cast to the registrar's
      // expected source-class type.
      PmTilesSource as unknown as Parameters<typeof mapboxgl.Style.setSourceType>[1]
    );
  }
}

type MapFilters = {
  minUnits: number | null;
  maxUnits: number | null;
  minYear: number | null;
  maxYear: number | null;
};

type LayerToggles = {
  includeSmallHomes: boolean;
  rentStabilizedOnly: boolean;
  borough: string | null;
};

// Buildings carry "BROOKLYN", neighborhood polygons "Brooklyn" — compare upper-cased.
const boroughFilterExpr = (borough: string) =>
  ["==", ["upcase", ["coalesce", ["get", "borough"], ""]], borough.toUpperCase()] as unknown as mapboxgl.FilterSpecification;

// Building classes that rentStatus() maps to condo/co-op rather than
// "likely stabilized" — mirrored here for the vector-tile filter expression.
const NON_RENTAL_CLASSES = ["C6", "D5", "C0", "D0", "D4"];

const BUILDING_CLASS_EXPR = ["upcase", ["coalesce", ["get", "building_class"], ""]];
const CLASS_LETTER_EXPR = ["slice", BUILDING_CLASS_EXPR, 0, 1];

// Build a Mapbox filter expression for the vector path that mirrors the
// client-side array filtering applied in applyGradeFilter() on the API path:
//   - grade ∈ selected grades (when any are selected)
//   - residential_units (missing → treated as 0, matching `?? 0`)
//   - year_built (missing/null features are excluded when a year bound is set)
//   - "3+ units only" drops 1–2 family homes (PLUTO class A/B), like search
//   - "Rent stabilized" keeps only rentStatus() === "likely_stabilized"
//   - the borough chip keeps one borough
// Returns null when no filter is active (shows all features).
function buildVectorFilter(
  grades: string[],
  mf: MapFilters,
  toggles: LayerToggles
): mapboxgl.FilterSpecification | null {
  const clauses: unknown[] = ["all"];
  if (grades.length > 0) {
    clauses.push(["in", ["get", "grade"], ["literal", grades]]);
  }
  if (mf.minUnits != null) {
    clauses.push([">=", ["coalesce", ["get", "residential_units"], 0], mf.minUnits]);
  }
  if (mf.maxUnits != null) {
    clauses.push(["<=", ["coalesce", ["get", "residential_units"], 0], mf.maxUnits]);
  }
  if (mf.minYear != null) {
    clauses.push(["all", ["has", "year_built"], [">=", ["get", "year_built"], mf.minYear]]);
  }
  if (mf.maxYear != null) {
    clauses.push(["all", ["has", "year_built"], ["<=", ["get", "year_built"], mf.maxYear]]);
  }
  if (!toggles.includeSmallHomes) {
    clauses.push(["!", ["in", CLASS_LETTER_EXPR, ["literal", ["A", "B"]]]]);
  }
  if (toggles.rentStabilizedOnly) {
    clauses.push([
      "all",
      ["in", CLASS_LETTER_EXPR, ["literal", ["C", "D"]]],
      ["!", ["in", BUILDING_CLASS_EXPR, ["literal", NON_RENTAL_CLASSES]]],
      [">=", ["coalesce", ["get", "residential_units"], 0], 6],
      [">", ["coalesce", ["get", "year_built"], 0], 0],
      ["<=", ["coalesce", ["get", "year_built"], 0], 1974],
    ]);
  }
  if (toggles.borough) {
    clauses.push(boroughFilterExpr(toggles.borough));
  }
  return clauses.length === 1
    ? null
    : (clauses as unknown as mapboxgl.FilterSpecification);
}

// Mapbox "match" expression that colors a feature by its `grade` property,
// derived from GRADE_META so the dot layers stay in sync with the single
// source. Falls back to a neutral grey for ungraded features.
const GRADE_COLOR_EXPRESSION = [
  "match",
  ["get", "grade"],
  ...GRADES.flatMap((g) => [g, GRADE_META[g].bg]),
  "#9AA1AE",
] as unknown as ExpressionSpecification;

// Letter color on a grade fill: white on F, ink elsewhere (matches GradeTile).
const GRADE_TEXT_EXPRESSION = [
  "match", ["get", "grade"], "F", "#FFFFFF", INK,
] as unknown as ExpressionSpecification;

// Zoom bands where one layer hands over to the next. Inside a band the
// outgoing layer fades out while the incoming one fades in; outside it only
// one of them is drawn (and only it catches clicks and hovers).
//   neighborhoods → dots: starts at z13, where building data starts loading
//   dots → outlines: ends at z16, the zoom stepper's "Footprints" level
const NEIGHBORHOODS_TO_DOTS: [number, number] = [13, 13.6];
const DOTS_TO_OUTLINES: [number, number] = [15.6, 16];

type Band = [number, number];
const fadeIn = (full: number, [from, to]: Band) =>
  ["interpolate", ["linear"], ["zoom"], from, 0, to, full] as unknown as ExpressionSpecification;
const fadeOut = (full: number, [from, to]: Band) =>
  ["interpolate", ["linear"], ["zoom"], from, full, to, 0] as unknown as ExpressionSpecification;

/** Dots fade in over the neighborhoods, and (with outlines) out under the outlines. */
function dotsOpacity(full: number, outlines: boolean): ExpressionSpecification {
  if (!outlines) return fadeIn(full, NEIGHBORHOODS_TO_DOTS);
  const [inFrom, inTo] = NEIGHBORHOODS_TO_DOTS;
  const [outFrom, outTo] = DOTS_TO_OUTLINES;
  return ["interpolate", ["linear"], ["zoom"], inFrom, 0, inTo, full, outFrom, full, outTo, 0] as unknown as ExpressionSpecification;
}

// The high-zoom building-dots layer. Identical for both the vector (PMTiles,
// which needs `source-layer`) and the API-GeoJSON paths, so it's defined once
// and reused by the initial render and by the runtime fallback swap — that way
// the two can't drift apart.
function buildingsDotsLayer(vector: boolean, outlines = USE_FOOTPRINTS): mapboxgl.LayerSpecification {
  return {
    id: "buildings-dots",
    type: "circle",
    source: "buildings",
    ...(vector ? { "source-layer": TILES_SOURCE_LAYER } : {}),
    minzoom: NEIGHBORHOODS_TO_DOTS[0],
    // With outlines, the dots stop rendering once faded out — but one tile level
    // late. Vector tiles are picked by rounding the zoom (z15.5 already loads z16
    // tiles) and Mapbox leaves a layer out of any tile at or above its maxzoom,
    // so a maxzoom of 16 would blank the dots from z15.5, before the outlines
    // fade in. The pointer handlers ignore them past the fade (dotsFaded).
    ...(outlines ? { maxzoom: DOTS_TO_OUTLINES[1] + 1 } : {}),
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 13, 3, 16, 6.5, 18, 10],
      "circle-color": GRADE_COLOR_EXPRESSION,
      "circle-opacity": dotsOpacity(0.92, outlines),
      "circle-stroke-opacity": dotsOpacity(1, outlines),
      "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 13, 0.6, 16, 1.5],
      "circle-stroke-color": INK,
    },
  } as mapboxgl.LayerSpecification;
}

// Remove the outline layers (archive unreachable) and give the dots back their
// full zoom range. Idempotent.
function dropFootprints(m: mapboxgl.Map) {
  try {
    for (const id of [...FOOTPRINT_LAYERS, "footprints-selected"]) if (m.getLayer(id)) m.removeLayer(id);
    if (m.getSource("footprints")) m.removeSource("footprints");
    if (m.getLayer("buildings-dots")) {
      m.setLayerZoomRange("buildings-dots", NEIGHBORHOODS_TO_DOTS[0], 24);
      m.setPaintProperty("buildings-dots", "circle-opacity", dotsOpacity(0.92, false));
      m.setPaintProperty("buildings-dots", "circle-stroke-opacity", dotsOpacity(1, false));
    }
    console.warn("[map] Building outlines unavailable — showing dots at every zoom.");
  } catch {
    // style already torn down
  }
}

// Street-level building outlines, filled in the grade color and edged in ink.
// Inserted beneath the dots; the two cross-fade across DOTS_TO_OUTLINES, and
// the outlines aren't drawn (or clickable) before that band starts. The tiles
// themselves exist from FOOTPRINTS_MINZOOM, so they're loaded by then.
function addFootprintLayers(m: mapboxgl.Map) {
  m.addSource("footprints", {
    type: PmTilesSource.SOURCE_TYPE,
    url: FOOTPRINTS_ARCHIVE_URL,
    minzoom: FOOTPRINTS_MINZOOM,
  } as unknown as mapboxgl.SourceSpecification);
  m.addLayer(
    {
      id: "footprints-fill",
      type: "fill",
      source: "footprints",
      "source-layer": FOOTPRINTS_SOURCE_LAYER,
      minzoom: DOTS_TO_OUTLINES[0],
      paint: {
        "fill-color": GRADE_COLOR_EXPRESSION,
        "fill-opacity": fadeIn(0.88, DOTS_TO_OUTLINES),
      },
    } as mapboxgl.LayerSpecification,
    "buildings-dots"
  );
  m.addLayer(
    {
      id: "footprints-outline",
      type: "line",
      source: "footprints",
      "source-layer": FOOTPRINTS_SOURCE_LAYER,
      minzoom: DOTS_TO_OUTLINES[0],
      paint: {
        "line-color": INK,
        "line-width": ["interpolate", ["linear"], ["zoom"], DOTS_TO_OUTLINES[0], 0.5, 17, 1.2],
        "line-opacity": fadeIn(0.85, DOTS_TO_OUTLINES),
      },
    } as mapboxgl.LayerSpecification,
    "buildings-dots"
  );
  // The open building gets a heavy ink outline (filter set by the highlight effect).
  m.addLayer(
    {
      id: "footprints-selected",
      type: "line",
      source: "footprints",
      "source-layer": FOOTPRINTS_SOURCE_LAYER,
      minzoom: DOTS_TO_OUTLINES[0],
      filter: ["==", ["get", "bbl"], ""],
      paint: { "line-color": INK, "line-width": 3.5, "line-opacity": fadeIn(1, DOTS_TO_OUTLINES) },
    } as mapboxgl.LayerSpecification,
    "buildings-dots"
  );
}

// Nudge Mapbox's light style toward the redesign's paper palette: white land,
// soft-blue water, block-grey footprints. Every layer is optional across style
// revisions, so each change is guarded.
function tuneBaseStyle(m: mapboxgl.Map) {
  const paint = (layer: string, prop: string, value: unknown) => {
    if (m.getLayer(layer)) {
      try {
        m.setPaintProperty(layer, prop as never, value as never);
      } catch {
        // property not applicable to this layer type in this style revision
      }
    }
  };
  paint("land", "background-color", "#FFFFFF");
  paint("water", "fill-color", "#CFE0F0");
  paint("building", "fill-color", "#E4E8ED");
  paint("building", "fill-outline-color", "#D5DAE2");
}

function canHover(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

export function Map() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const moveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Whether the vector (PMTiles) path is still live. Starts at the build-time
  // intent and flips to false (one-way) if fallbackToApi runs because the
  // archive is unreachable. `vectorErrored` records that a `buildings` source
  // error was seen so maybeFallbackToApi can tell a fatal failure from a
  // sporadic single-tile error.
  const vectorActiveRef = useRef(USE_VECTOR_TILES);
  const vectorErroredRef = useRef(false);
  const setViewport = useStore((s) => s.setViewport);
  const selectBuilding = useStore((s) => s.selectBuilding);
  const setSelectedLocation = useStore((s) => s.setSelectedLocation);
  const setMapRef = useStore((s) => s.setMapRef);
  const setBuildingCount = useStore((s) => s.setBuildingCount);
  const searchResults = useStore((s) => s.searchResults);
  const gradeFilter = useStore((s) => s.gradeFilter);
  const mapFilters = useStore((s) => s.mapFilters);
  const includeSmallHomes = useStore((s) => s.includeSmallHomes);
  const rentStabilizedOnly = useStore((s) => s.rentStabilizedOnly);
  const boroughFilter = useStore((s) => s.boroughFilter);
  const selectedBbl = useStore((s) => s.selectedBbl);
  const selectedLocation = useStore((s) => s.selectedLocation);
  // Flips true once the style + our sources exist (Map publishes mapRef on load),
  // so the effects below re-run for state that arrived before the map was ready.
  const mapReady = useStore((s) => s.mapRef !== null);

  // Desktop hover preview. The card stays up while the pointer is over it, so
  // hiding is delayed a beat to let the pointer travel from dot to card.
  const [hovered, setHovered] = useState<HoveredBuilding | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelHide = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = null;
  }, []);
  const scheduleHide = useCallback(() => {
    cancelHide();
    hideTimerRef.current = setTimeout(() => setHovered(null), 220);
  }, [cancelHide]);

  // Cache of last-fetched raw building features (before grade filtering)
  const rawBuildingsRef = useRef<any[]>([]);
  // Refs so callbacks don't need filter state as deps (avoids map teardown on filter change)
  const gradeFilterRef = useRef(gradeFilter);
  useEffect(() => { gradeFilterRef.current = gradeFilter; }, [gradeFilter]);
  const mapFiltersRef = useRef(mapFilters);
  useEffect(() => { mapFiltersRef.current = mapFilters; }, [mapFilters]);
  const togglesRef = useRef<LayerToggles>({ includeSmallHomes, rentStabilizedOnly, borough: boroughFilter });
  useEffect(() => {
    togglesRef.current = { includeSmallHomes, rentStabilizedOnly, borough: boroughFilter };
  }, [includeSmallHomes, rentStabilizedOnly, boroughFilter]);

  const applyGradeFilter = useCallback((
    m: mapboxgl.Map,
    features: any[],
    filter: string[],
    mf?: MapFilters,
    toggles?: LayerToggles
  ) => {
    const source = m.getSource("buildings") as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;
    const activeFilters = mf ?? mapFiltersRef.current;
    const activeToggles = toggles ?? togglesRef.current;
    let visible = filter.length > 0
      ? features.filter((f) => filter.includes(f.properties.grade))
      : features;
    if (activeFilters.minUnits != null)
      visible = visible.filter((f) => (f.properties.residential_units ?? 0) >= activeFilters.minUnits!);
    if (activeFilters.maxUnits != null)
      visible = visible.filter((f) => (f.properties.residential_units ?? 0) <= activeFilters.maxUnits!);
    if (activeFilters.minYear != null)
      visible = visible.filter((f) => f.properties.year_built != null && f.properties.year_built >= activeFilters.minYear!);
    if (activeFilters.maxYear != null)
      visible = visible.filter((f) => f.properties.year_built != null && f.properties.year_built <= activeFilters.maxYear!);
    if (!activeToggles.includeSmallHomes)
      visible = visible.filter((f) => !/^[AB]/i.test(f.properties.building_class ?? ""));
    if (activeToggles.rentStabilizedOnly)
      visible = visible.filter(
        (f) => rentStatus(f.properties.building_class, f.properties.year_built, f.properties.residential_units) === "likely_stabilized"
      );
    if (activeToggles.borough)
      visible = visible.filter((f) => String(f.properties.borough ?? "").toUpperCase() === activeToggles.borough);
    source.setData({ type: "FeatureCollection", features: visible });
    setBuildingCount(features.length);
  }, [setBuildingCount]);

  const fetchAndRenderBuildings = useCallback(async (m: mapboxgl.Map) => {
    const zoom = m.getZoom();
    if (zoom < 13) {
      const source = m.getSource("buildings") as mapboxgl.GeoJSONSource | undefined;
      if (source) source.setData({ type: "FeatureCollection", features: [] });
      rawBuildingsRef.current = [];
      setBuildingCount(0);
      return;
    }

    const bounds = m.getBounds();
    if (!bounds) return;
    const bbox = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;

    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    try {
      const small = togglesRef.current.includeSmallHomes ? "&include_small_homes=true" : "";
      const res = await fetch(
        `${API_URL}/api/buildings?bbox=${bbox}&zoom=${Math.round(zoom)}${small}`,
        { signal: abortRef.current.signal }
      );
      if (!res.ok) return;
      const data = await res.json();

      const source = m.getSource("buildings") as mapboxgl.GeoJSONSource | undefined;
      if (!source) return;

      const features = (data.buildings || [])
        .filter((b: any) => b.latitude != null && b.longitude != null)
        .map((b: any) => ({
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [b.longitude, b.latitude] },
          properties: {
            bbl: b.bbl,
            health_score: b.health_score ?? 0,
            grade: b.grade ?? "A",
            address: b.address ?? "",
            borough: b.borough ?? "",
            residential_units: b.residential_units ?? 0,
            year_built: b.year_built ?? null,
            building_class: b.building_class ?? null,
          },
        }));

      rawBuildingsRef.current = features;
      applyGradeFilter(m, features, gradeFilterRef.current);
    } catch (e: any) {
      if (e.name !== "AbortError") console.error("Failed to fetch buildings:", e);
    }
  }, [setBuildingCount, applyGradeFilter]); // filters read via refs

  // Vector path only: tiles stream in automatically, so the building count comes
  // from the features currently rendered in the viewport rather than the length
  // of a fetched array. Dedupe by bbl because a feature straddling a tile
  // boundary is returned once per tile by queryRenderedFeatures.
  const updateVectorBuildingCount = useCallback((m: mapboxgl.Map) => {
    if (m.getZoom() < 13 || !m.getLayer("buildings-dots")) {
      setBuildingCount(0);
      return;
    }
    const feats = m.queryRenderedFeatures({ layers: ["buildings-dots"] });
    const bbls = new Set<string>();
    for (const f of feats) {
      const bbl = f.properties?.bbl;
      if (bbl != null) bbls.add(String(bbl));
    }
    setBuildingCount(bbls.size);
  }, [setBuildingCount]);

  // Swap the high-zoom `buildings` layer from the PMTiles source back to the
  // API-GeoJSON source so the map still shows dots if the archive is broken.
  // One-way and idempotent: once we fall back we stay on the API path for the
  // session. mapbox-gl can't change a source's type in place, so the source +
  // layer are removed and re-added.
  const fallbackToApi = useCallback((m: mapboxgl.Map) => {
    if (!vectorActiveRef.current) return;
    vectorActiveRef.current = false;
    console.warn(
      "[map] PMTiles archive unreachable — falling back to the /api/buildings source."
    );
    // A search may have hidden the dots layer; preserve that on re-add.
    const hidden =
      !!m.getLayer("buildings-dots") &&
      m.getLayoutProperty("buildings-dots", "visibility") === "none";
    if (m.getLayer("buildings-dots")) m.removeLayer("buildings-dots");
    if (m.getSource("buildings")) m.removeSource("buildings");
    m.addSource("buildings", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
    // Re-insert beneath the selected/search layers to keep the original z-order.
    m.addLayer(buildingsDotsLayer(false), "selected-building-dot");
    if (hidden) m.setLayoutProperty("buildings-dots", "visibility", "none");
    fetchAndRenderBuildings(m);
  }, [fetchAndRenderBuildings]);

  // Decide whether a `buildings` source error is fatal (blank map) or transient.
  // Only fall back once we're zoomed into building range and nothing rendered —
  // a sporadic single-tile error with dots still on screen is ignored.
  const maybeFallbackToApi = useCallback((m: mapboxgl.Map) => {
    if (!vectorActiveRef.current || !vectorErroredRef.current) return;
    if (m.getZoom() < 13 || !m.getLayer("buildings-dots")) return;
    if (m.queryRenderedFeatures({ layers: ["buildings-dots"] }).length > 0) return;
    fallbackToApi(m);
  }, [fallbackToApi]);

  const loadNeighborhoods = useCallback(async (m: mapboxgl.Map) => {
    try {
      // NTA boundary polygons with aggregated scores — drawn as filled,
      // outlined neighborhood shapes (replaces the old centroid bubbles).
      const polygons = await fetchNeighborhoodPolygons();
      const source = m.getSource("neighborhoods") as mapboxgl.GeoJSONSource | undefined;
      if (source) source.setData(polygons);
    } catch (e) {
      console.error("Failed to load neighborhoods:", e);
    }
  }, []);

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: [-73.98, 40.75],
      zoom: 11,
      minZoom: 9,
      maxZoom: 18,
      maxBounds: [
        [-74.5, 40.35],
        [-73.3, 41.1],
      ],
      attributionControl: false,
    });

    const m = map.current;
    m.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");

    if (USE_VECTOR_TILES || USE_FOOTPRINTS) {
      // Catch a broken/unreachable PMTiles archive (bad URL, 404, outage). The
      // source emits an `error` (header load or per-tile); flag it and let
      // maybeFallbackToApi decide. Registered before the source is added in the
      // `load` handler so an immediate header-load error isn't missed.
      m.on("error", (e) => {
        const sourceId = (e as { sourceId?: string }).sourceId;
        if (USE_VECTOR_TILES && sourceId === "buildings") {
          vectorErroredRef.current = true;
          maybeFallbackToApi(m);
          return;
        }
        // Outlines unavailable: drop them and let the dots cover every zoom
        // again, so street level never goes blank.
        if (sourceId === "footprints") {
          dropFootprints(m);
          return;
        }
        // Adding any `error` listener suppresses mapbox-gl's built-in console
        // logging, so re-log everything we don't handle to keep parity.
        console.error((e as { error?: unknown }).error ?? e);
      });
    }

    m.on("movestart", () => setHovered(null));

    m.on("moveend", () => {
      const bounds = m.getBounds();
      if (!bounds) return;
      setViewport(
        {
          west: bounds.getWest(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          north: bounds.getNorth(),
        },
        m.getZoom()
      );
      // Debounce: wait 250ms after the last moveend before fetching/recounting.
      // Vector path streams tiles automatically, so there's nothing to fetch —
      // we only recount the rendered features for the new viewport.
      if (moveDebounceRef.current) clearTimeout(moveDebounceRef.current);
      moveDebounceRef.current = setTimeout(() => {
        if (vectorActiveRef.current) {
          updateVectorBuildingCount(m);
          // Re-evaluate after a zoom-in: a header-load failure recorded at low
          // zoom can only be confirmed fatal once we're in building range.
          maybeFallbackToApi(m);
        } else {
          fetchAndRenderBuildings(m);
        }
      }, 250);
    });

    m.on("load", () => {
      tuneBaseStyle(m);

      // --- Neighborhood outlines (low/medium zoom) ---
      // Precise NTA boundary polygons, filled + outlined and colored by average
      // health score. Shown at zoom ≤ 13; individual building dots take over
      // above that.
      m.addSource("neighborhoods", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      // Neighborhood fill ramps through the grade colors at the grade cut-offs.
      const scoreColor = [
        "interpolate", ["linear"], ["get", "avg_score"],
        55, GRADE_META.F.bg,
        75, GRADE_META.D.bg,
        90, GRADE_META.C.bg,
        95, GRADE_META.B.bg,
        100, GRADE_META.A.bg,
      ] as mapboxgl.Expression;

      // Neighborhoods fade out across NEIGHBORHOODS_TO_DOTS as the dots fade in,
      // and stop drawing once gone.
      m.addLayer({
        id: "neighborhoods-fill",
        type: "fill",
        source: "neighborhoods",
        maxzoom: NEIGHBORHOODS_TO_DOTS[1],
        paint: {
          "fill-color": scoreColor,
          "fill-opacity": fadeOut(0.42, NEIGHBORHOODS_TO_DOTS),
        },
      });

      m.addLayer({
        id: "neighborhoods-outline",
        type: "line",
        source: "neighborhoods",
        maxzoom: NEIGHBORHOODS_TO_DOTS[1],
        paint: {
          "line-color": INK,
          "line-width": 0.8,
          "line-opacity": fadeOut(0.45, NEIGHBORHOODS_TO_DOTS),
        },
      });

      m.addLayer({
        id: "neighborhoods-labels",
        type: "symbol",
        source: "neighborhoods",
        maxzoom: NEIGHBORHOODS_TO_DOTS[1],
        layout: {
          // Symbol-on-polygon: Mapbox places one label at each polygon's
          // visual center.
          "text-field": [
            "concat",
            ["upcase", ["get", "name"]],
            "\n",
            ["to-string", ["round", ["get", "avg_score"]]],
          ],
          "text-size": 11,
          "text-letter-spacing": 0.12,
          "text-font": ["DIN Pro Bold", "Arial Unicode MS Bold"],
          "text-allow-overlap": false,
        },
        paint: {
          "text-color": INK,
          "text-halo-color": "#FFFFFF",
          "text-halo-width": 2,
          // Labels clear out in the first half of the band, before the dots
          // underneath are at full strength, so the two never read as clutter.
          "text-opacity": fadeOut(1, [NEIGHBORHOODS_TO_DOTS[0], (NEIGHBORHOODS_TO_DOTS[0] + NEIGHBORHOODS_TO_DOTS[1]) / 2]),
        },
      });

      loadNeighborhoods(m);

      // --- Buildings layer (high zoom) ---
      // Vector path: stream individual buildings from a hosted PMTiles archive.
      // API path (default): an empty GeoJSON source that fetchAndRenderBuildings
      // fills per viewport. The buildings-dots layer below is identical for both
      // except the vector source requires a `source-layer`.
      if (USE_VECTOR_TILES) {
        // Custom mapbox-pmtiles source type (registered above). Its options
        // aren't part of mapbox-gl's built-in SourceSpecification union, so the
        // spec object is cast. PmTilesSource reads min/max zoom from the
        // archive header; minzoom here keeps the dots high-zoom-only like the
        // API path. source-layer "buildings" is set on the layer below.
        m.addSource("buildings", {
          type: PmTilesSource.SOURCE_TYPE,
          url: TILES_ARCHIVE_URL,
          minzoom: 13,
        } as unknown as mapboxgl.SourceSpecification);
      } else {
        m.addSource("buildings", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
      }

      m.addLayer(buildingsDotsLayer(USE_VECTOR_TILES));

      if (USE_FOOTPRINTS) {
        addFootprintLayers(m);
        const outlineFilter = buildVectorFilter(gradeFilterRef.current, mapFiltersRef.current, togglesRef.current);
        if (outlineFilter) for (const id of FOOTPRINT_LAYERS) m.setFilter(id, outlineFilter);
      }

      if (USE_VECTOR_TILES) {
        // Apply the current grade/units/year filter via a Mapbox expression
        // (vector-tile features can't be mutated like a GeoJSON array can).
        const initialFilter = buildVectorFilter(gradeFilterRef.current, mapFiltersRef.current, togglesRef.current);
        if (initialFilter) m.setFilter("buildings-dots", initialFilter);
        // Recount as tiles stream in for the current viewport. Skipped once we've
        // fallen back to the API path (that path drives the count itself).
        m.on("sourcedata", (e) => {
          if (e.sourceId === "buildings" && e.isSourceLoaded && vectorActiveRef.current) {
            updateVectorBuildingCount(m);
            // A failed source still reaches isSourceLoaded with no features —
            // backstop the error listener in case its event was missed.
            maybeFallbackToApi(m);
          }
        });
      }

      // --- Selected building highlight (filled dot + ink halo ring) ---
      // The dot layer ensures the selected building is always visible even
      // when the underlying buildings-dots layer omits it (e.g. backend
      // prioritises lower-scoring buildings and drops higher-scoring ones,
      // or buildings-dots is hidden because a search is active).
      m.addSource("selected-building", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      m.addLayer({
        id: "selected-building-dot",
        type: "circle",
        source: "selected-building",
        paint: {
          "circle-radius": [
            "interpolate", ["linear"], ["zoom"],
            10, 5,
            14, 8,
            16, 11,
          ],
          "circle-color": GRADE_COLOR_EXPRESSION,
          "circle-opacity": 1,
          "circle-stroke-width": 2,
          "circle-stroke-color": INK,
        },
      });

      m.addLayer({
        id: "selected-building-ring",
        type: "circle",
        source: "selected-building",
        paint: {
          "circle-radius": [
            "interpolate", ["linear"], ["zoom"],
            10, 10,
            14, 15,
            16, 19,
          ],
          "circle-color": "rgba(0,0,0,0)",
          "circle-opacity": 1,
          "circle-stroke-width": 2.5,
          "circle-stroke-color": INK,
          "circle-stroke-opacity": 0.9,
        },
      });

      // --- Search results: lettered grade pins ---
      m.addSource("search-results", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      m.addLayer({
        id: "search-results-dots",
        type: "circle",
        source: "search-results",
        paint: {
          "circle-radius": [
            "interpolate", ["linear"], ["zoom"],
            10, 9,
            14, 13,
            16, 15,
          ],
          "circle-color": GRADE_COLOR_EXPRESSION,
          "circle-opacity": 1,
          "circle-stroke-width": 2.5,
          "circle-stroke-color": INK,
        },
      });

      m.addLayer({
        id: "search-results-letters",
        type: "symbol",
        source: "search-results",
        layout: {
          "text-field": ["get", "grade"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 10, 10, 14, 14, 16, 16],
          "text-font": ["DIN Pro Bold", "Arial Unicode MS Bold"],
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: {
          "text-color": GRADE_TEXT_EXPRESSION,
        },
      });

      m.addLayer({
        id: "search-results-labels",
        type: "symbol",
        source: "search-results",
        // Street level only — at neighborhood scale the pins speak for themselves.
        minzoom: 16,
        layout: {
          "text-field": ["get", "address"],
          "text-size": 11,
          "text-offset": [0, 1.9],
          "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"],
          "text-allow-overlap": false,
        },
        paint: {
          "text-color": INK,
          "text-halo-color": "#FFFFFF",
          "text-halo-width": 1.5,
        },
      });

      // Click handlers. Dots locate the building by their point; an outline
      // (a polygon) by where it was clicked — the detail load refines it.
      const openFromFeature = (feature: mapboxgl.GeoJSONFeature | undefined, at?: mapboxgl.LngLat) => {
        const bbl = feature?.properties?.bbl;
        if (!bbl) return;
        const geom = feature.geometry;
        selectBuilding(String(bbl));
        const grade = String(feature.properties?.grade ?? "");
        if (geom.type === "Point") {
          const [lng, lat] = geom.coordinates as [number, number];
          setSelectedLocation({ lng, lat, grade });
        } else if (at) {
          setSelectedLocation({ lng: at.lng, lat: at.lat, grade });
        }
        cancelHide();
        setHovered(null);
      };

      // Past the cross-fade the dots are transparent but still drawn for one more
      // tile level (see buildingsDotsLayer) — they mustn't catch the pointer there.
      const dotsFaded = () => !!m.getLayer("footprints-fill") && m.getZoom() >= DOTS_TO_OUTLINES[1];
      const isFadedDots = (layerId: string) => layerId === "buildings-dots" && dotsFaded();

      m.on("click", "buildings-dots", (e) => {
        if (!dotsFaded()) openFromFeature(e.features?.[0]);
      });
      m.on("click", "search-results-dots", (e) => openFromFeature(e.features?.[0]));
      if (USE_FOOTPRINTS) m.on("click", "footprints-fill", (e) => openFromFeature(e.features?.[0], e.lngLat));

      // Pointer cursor on hover for every clickable layer.
      for (const layerId of ["buildings-dots", "search-results-dots", ...(USE_FOOTPRINTS ? ["footprints-fill"] : [])]) {
        m.on("mouseenter", layerId, () => {
          if (!isFadedDots(layerId)) m.getCanvas().style.cursor = "pointer";
        });
        m.on("mouseleave", layerId, () => {
          if (!isFadedDots(layerId)) m.getCanvas().style.cursor = "";
        });
      }

      // Hover preview (desktop, nothing selected). Anchored at the dot, or at
      // the pointer for an outline.
      const hoverFrom = (e: mapboxgl.MapMouseEvent & { features?: mapboxgl.GeoJSONFeature[] }) => {
        if (!canHover() || useStore.getState().selectedBbl) return;
        const f = e.features?.[0];
        const bbl = f?.properties?.bbl;
        if (!f || !bbl) return;
        cancelHide();
        const [lng, lat] =
          f.geometry.type === "Point" ? (f.geometry.coordinates as [number, number]) : [e.lngLat.lng, e.lngLat.lat];
        setHovered((prev) => {
          if (prev?.bbl === String(bbl)) return prev;
          const p = m.project([lng, lat]);
          const props = f.properties ?? {};
          return {
            bbl: String(bbl),
            address: String(props.address ?? ""),
            grade: String(props.grade ?? ""),
            healthScore: Number(props.health_score ?? 0),
            units: props.residential_units != null ? Number(props.residential_units) : null,
            yearBuilt: props.year_built ? Number(props.year_built) : null,
            buildingClass: props.building_class != null ? String(props.building_class) : null,
            lng,
            lat,
            x: p.x,
            y: p.y,
          };
        });
      };
      m.on("mousemove", "buildings-dots", (e) => {
        if (!dotsFaded()) hoverFrom(e);
      });
      m.on("mouseleave", "buildings-dots", () => {
        if (!dotsFaded()) scheduleHide();
      });
      if (USE_FOOTPRINTS) {
        m.on("mousemove", "footprints-fill", hoverFrom);
        m.on("mouseleave", "footprints-fill", () => scheduleHide());
      }

      // Initial viewport: vector tiles stream on their own (count updates via
      // the sourcedata listener above), so only the API path fetches here.
      if (vectorActiveRef.current) {
        updateVectorBuildingCount(m);
      } else {
        fetchAndRenderBuildings(m);
      }

      // Publish the map only once its sources exist, so consumers (overlays,
      // fly-to on deep links) can add layers without racing the style load.
      setMapRef(m);
    });

    return () => {
      setMapRef(null);
      m.remove();
      map.current = null;
    };
  }, [setViewport, selectBuilding, setSelectedLocation, fetchAndRenderBuildings, setMapRef, loadNeighborhoods, updateVectorBuildingCount, maybeFallbackToApi, cancelHide, scheduleHide]);

  // Re-filter buildings on map when grade filter or map filters change.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const toggles = { includeSmallHomes, rentStabilizedOnly, borough: boroughFilter };

    const apply = () => {
      // Neighborhood outlines follow the borough chip too.
      const nbFilter = boroughFilter ? boroughFilterExpr(boroughFilter) : null;
      for (const id of ["neighborhoods-fill", "neighborhoods-outline", "neighborhoods-labels"]) {
        if (m.getLayer(id)) m.setFilter(id, nbFilter);
      }
      // Outlines are always vector tiles, whichever path the dots are on.
      const vectorFilter = buildVectorFilter(gradeFilter, mapFilters, toggles);
      for (const id of FOOTPRINT_LAYERS) {
        if (m.getLayer(id)) m.setFilter(id, vectorFilter);
      }
      if (vectorActiveRef.current) {
        // Vector tiles can't be mutated, so the same grade/units/year filter is
        // expressed as a Mapbox filter on the layer instead of re-running setData.
        if (m.getLayer("buildings-dots")) {
          m.setFilter("buildings-dots", buildVectorFilter(gradeFilter, mapFilters, toggles));
          updateVectorBuildingCount(m);
        }
        return;
      }
      if (rawBuildingsRef.current.length > 0) {
        applyGradeFilter(m, rawBuildingsRef.current, gradeFilter, mapFilters, toggles);
      }
    };

    // isStyleLoaded() reports false while a source is mid-stream (e.g. right
    // after the buildings/neighborhoods source got setData), which happens
    // constantly during normal panning. Previously we bailed in that window, so
    // a filter change made then was silently dropped and only took effect on the
    // next pan — making the units/grade filters look broken. Apply immediately
    // when the style is ready, otherwise defer to the next idle so the change is
    // never lost.
    if (m.isStyleLoaded()) {
      apply();
    } else {
      m.once("idle", apply);
      return () => {
        m.off("idle", apply);
      };
    }
  }, [gradeFilter, mapFilters, includeSmallHomes, rentStabilizedOnly, boroughFilter, mapReady, applyGradeFilter, updateVectorBuildingCount]);

  // Toggling "3+ units only" changes what the API path returns, so refetch.
  useEffect(() => {
    const m = map.current;
    if (m && !vectorActiveRef.current && m.getSource("buildings")) fetchAndRenderBuildings(m);
  }, [includeSmallHomes, fetchAndRenderBuildings]);

  // A selection hides the hover preview.
  useEffect(() => {
    if (selectedBbl) setHovered(null);
  }, [selectedBbl]);

  // Highlight selected building with an ink ring
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const source = m.getSource("selected-building") as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;

    if (m.getLayer("footprints-selected")) {
      m.setFilter("footprints-selected", ["==", ["get", "bbl"], selectedBbl ?? ""]);
    }

    if (!selectedBbl) {
      source.setData({ type: "FeatureCollection", features: [] });
      return;
    }

    // Prefer the location published for this selection (click or detail
    // load — the only source for ?bbl= deep links); otherwise look it up from
    // visible buildings or search results. Grade colors the dot.
    let coords: [number, number] | null = null;
    let grade = "";
    if (selectedLocation) {
      coords = [selectedLocation.lng, selectedLocation.lat];
      grade = selectedLocation.grade;
    }
    const inRaw = !coords && rawBuildingsRef.current.find((f) => f.properties.bbl === selectedBbl);
    if (inRaw) {
      coords = inRaw.geometry.coordinates as [number, number];
      grade = inRaw.properties.grade ?? "";
    }
    // Vector path: rawBuildingsRef is empty (no fetched array), so pull the
    // clicked building straight from the rendered tile features.
    if (!coords && vectorActiveRef.current && m.getLayer("buildings-dots")) {
      const matches = m.queryRenderedFeatures({
        layers: ["buildings-dots"],
        filter: ["==", ["get", "bbl"], selectedBbl] as unknown as mapboxgl.FilterSpecification,
      });
      const feat = matches[0];
      if (feat && feat.geometry.type === "Point") {
        coords = feat.geometry.coordinates as [number, number];
        grade = (feat.properties?.grade as string) ?? "";
      }
    }
    if (!coords) {
      const inSearch = searchResults.find((b) => b.bbl === selectedBbl);
      if (inSearch && inSearch.longitude != null && inSearch.latitude != null) {
        coords = [inSearch.longitude, inSearch.latitude];
        grade = inSearch.grade ?? "";
      }
    }

    source.setData({
      type: "FeatureCollection",
      features: coords
        ? [{ type: "Feature", geometry: { type: "Point", coordinates: coords }, properties: { grade } }]
        : [],
    });
  }, [selectedBbl, selectedLocation, searchResults, mapReady]);

  // Update search results on map when they change
  useEffect(() => {
    const m = map.current;
    if (!m) return;

    const source = m.getSource("search-results") as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;

    const setBuildingsVisibility = (visible: boolean) => {
      for (const id of ["buildings-dots", ...FOOTPRINT_LAYERS]) {
        if (m.getLayer(id)) m.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
      }
    };

    if (searchResults.length === 0) {
      source.setData({ type: "FeatureCollection", features: [] });
      // Restore the normal viewport buildings layer when the search is cleared.
      setBuildingsVisibility(true);
      return;
    }

    const features = searchResults
      .filter((b) => b.latitude != null && b.longitude != null)
      .filter((b) => gradeFilter.length === 0 || gradeFilter.includes(b.grade ?? ""))
      .map((b) => ({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [b.longitude, b.latitude],
        },
        properties: {
          bbl: b.bbl,
          health_score: b.health_score ?? 0,
          grade: b.grade ?? "A",
          address: b.address ?? "",
          borough: b.borough ?? "",
        },
      }));

    source.setData({ type: "FeatureCollection", features });
    // Suppress the generic viewport-buildings layer so only the matched dots
    // are visible while search results are on screen.
    setBuildingsVisibility(false);

    // Fly to search results bounds
    if (features.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      features.forEach((f) => {
        bounds.extend(f.geometry.coordinates as [number, number]);
      });
      // Padding mirrors the layout: the results list docks on the left on
      // desktop and is a bottom sheet on mobile — otherwise the pins get
      // squeezed under the panel.
      const isMobile = window.innerWidth < 768;
      const padding = isMobile
        ? { top: 150, bottom: Math.round(window.innerHeight * 0.55), left: 30, right: 30 }
        : { top: 100, bottom: 60, left: 480, right: 70 };
      m.fitBounds(bounds, {
        padding,
        maxZoom: 15,
        duration: 1500,
      });
    }
  }, [searchResults, gradeFilter, mapReady]);

  const container = mapContainer.current;

  return (
    <>
      <div ref={mapContainer} className="absolute inset-0 z-0" />
      {hovered && !selectedBbl && container && (
        <HoverCard
          building={hovered}
          containerWidth={container.clientWidth}
          containerHeight={container.clientHeight}
          onOpen={() => {
            selectBuilding(hovered.bbl);
            setSelectedLocation({ lng: hovered.lng, lat: hovered.lat, grade: hovered.grade });
            setHovered(null);
          }}
          onPointerEnter={cancelHide}
          onPointerLeave={scheduleHide}
        />
      )}
    </>
  );
}
