"use client";

import { useEffect, useRef, useCallback } from "react";
import mapboxgl, { type ExpressionSpecification } from "mapbox-gl";
// Imported from the prebuilt dist (the package's `main` is raw TS which Next
// won't transpile from node_modules). mapbox-gl has no MapLibre-style
// addProtocol, so PMTiles is wired in as a custom mapbox-gl *source type*.
import { PmTilesSource } from "mapbox-pmtiles/dist/mapbox-pmtiles.js";
import { useStore } from "@/lib/store";
import { fetchNeighborhoods, fetchSubNeighborhoods } from "@/lib/api";
import { NEIGHBORHOOD_SPLITS } from "@/lib/neighborhoodSplits";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Static vector-tile path (env-gated). When NEXT_PUBLIC_TILES_URL is set the
// high-zoom `buildings` layer streams from a hosted PMTiles archive instead of
// fetching GeoJSON from /api/buildings. When unset, the original API-GeoJSON
// path runs unchanged. The URL is a pmtiles protocol URL pointing at the file
// produced by `OUTPUT_FORMAT=pmtiles ./tiles/generate.sh`, e.g.
//   pmtiles://https://cdn.example.com/buildings.pmtiles
// NOTE: this vector path is UNVERIFIED pending hosted tiles — it cannot be
// runtime-tested without a reachable PMTiles URL. The CSP `connect-src` in
// next.config.js must also include the CDN host before this works in the browser.
const TILES_URL = process.env.NEXT_PUBLIC_TILES_URL || "";
const USE_VECTOR_TILES = TILES_URL.length > 0;
// PmTilesSource builds its own `pmtiles://<url>/{z}/{x}/{y}` template and calls
// `new PMTiles(url)`, so it needs the bare archive URL — strip the protocol
// prefix the env var carries (e.g. pmtiles://https://cdn/...→ https://cdn/...).
const TILES_ARCHIVE_URL = TILES_URL.replace(/^pmtiles:\/\//, "");
// The source-layer name baked into the tileset by tiles/generate.sh.
const TILES_SOURCE_LAYER = "buildings";

// Register the custom PMTiles vector source type with mapbox-gl exactly once, at
// module load, and only when the vector path is enabled. Guarded against SSR
// (mapbox-gl is browser-only) and made idempotent so HMR re-evaluation is safe.
if (USE_VECTOR_TILES && typeof window !== "undefined") {
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

// Build a Mapbox filter expression for the vector path that mirrors the
// client-side array filtering applied in applyGradeFilter() on the API path:
//   - grade ∈ selected grades (when any are selected)
//   - residential_units (missing → treated as 0, matching `?? 0`)
//   - year_built (missing/null features are excluded when a year bound is set)
// Returns null when no filter is active (shows all features).
function buildVectorFilter(
  grades: string[],
  mf: MapFilters
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
  return clauses.length === 1
    ? null
    : (clauses as unknown as mapboxgl.FilterSpecification);
}

// Grade color mapping
const GRADE_COLORS: Record<string, string> = {
  A: "#22c55e",
  B: "#84cc16",
  C: "#eab308",
  D: "#f97316",
  F: "#ef4444",
};

// Mapbox "match" expression that colors a feature by its `grade` property,
// derived from GRADE_COLORS so the dot layers stay in sync with the single
// source. Falls back to a neutral grey for ungraded features.
const GRADE_COLOR_EXPRESSION = [
  "match",
  ["get", "grade"],
  ...Object.entries(GRADE_COLORS).flatMap(([grade, color]) => [grade, color]),
  "#6b7280",
] as unknown as ExpressionSpecification;

export function Map() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const moveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setViewport = useStore((s) => s.setViewport);
  const selectBuilding = useStore((s) => s.selectBuilding);
  const setMapRef = useStore((s) => s.setMapRef);
  const setBuildingCount = useStore((s) => s.setBuildingCount);
  const searchResults = useStore((s) => s.searchResults);
  const gradeFilter = useStore((s) => s.gradeFilter);
  const mapFilters = useStore((s) => s.mapFilters);
  const selectedBbl = useStore((s) => s.selectedBbl);

  // Cache of last-fetched raw building features (before grade filtering)
  const rawBuildingsRef = useRef<any[]>([]);
  // Refs so callbacks don't need grade/mapFilters as deps (avoids map teardown on filter change)
  const gradeFilterRef = useRef(gradeFilter);
  useEffect(() => { gradeFilterRef.current = gradeFilter; }, [gradeFilter]);
  const mapFiltersRef = useRef(mapFilters);
  useEffect(() => { mapFiltersRef.current = mapFilters; }, [mapFilters]);

  const applyGradeFilter = useCallback((
    m: mapboxgl.Map,
    features: any[],
    filter: string[],
    mf?: typeof mapFilters
  ) => {
    const source = m.getSource("buildings") as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;
    const activeFilters = mf ?? mapFiltersRef.current;
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
      const res = await fetch(
        `${API_URL}/api/buildings?bbox=${bbox}&zoom=${Math.round(zoom)}`,
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
          },
        }));

      rawBuildingsRef.current = features;
      applyGradeFilter(m, features, gradeFilterRef.current);
    } catch (e: any) {
      if (e.name !== "AbortError") console.error("Failed to fetch buildings:", e);
    }
  }, [setBuildingCount, applyGradeFilter]); // gradeFilter removed — use ref instead

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

  const loadNeighborhoods = useCallback(async (m: mapboxgl.Map) => {
    try {
      const [neighborhoodData, subData] = await Promise.all([
        fetchNeighborhoods(),
        fetchSubNeighborhoods(),
      ]);

      // Exclude bubbles with a 0 or 100 score — those almost always indicate
      // a CD with too little data (no buildings/complaints) and produce
      // misleading "perfect" or "worst possible" patches on the heatmap.
      const isMeaningfulScore = (s: number | null | undefined): boolean =>
        s != null && s > 0 && s < 100;

      const valid = neighborhoodData.neighborhoods.filter(
        (n) => n.centroid && n.centroid.length === 2 && isMeaningfulScore(n.avg_score)
      );

      // Build a lookup from sub-neighborhood name → computed score/count
      const subScoreLookup = Object.fromEntries(
        subData.sub_neighborhoods.map((s) => [s.name, s])
      ) as Record<string, (typeof subData.sub_neighborhoods)[0]>;

      // Combined features — one bubble per community district (zoom < 11)
      const combinedFeatures = valid.map((n) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: n.centroid },
        properties: {
          name: n.name,
          borough: n.borough,
          avg_score: n.avg_score,
          building_count: n.building_count,
        },
      }));

      // Detail features — individual sub-neighborhood bubbles (zoom 11–13)
      const detailFeatures: Array<{
        type: "Feature";
        geometry: { type: "Point"; coordinates: [number, number] };
        properties: Record<string, unknown>;
      }> = [];

      for (const n of valid) {
        const splits = NEIGHBORHOOD_SPLITS[n.name];
        if (splits && splits.length > 0) {
          for (const sub of splits) {
            // Use computed score if available, fall back to parent CD score
            const computed = subScoreLookup[sub.name];
            const score = computed?.avg_score ?? n.avg_score;
            if (!isMeaningfulScore(score)) continue;
            detailFeatures.push({
              type: "Feature",
              geometry: { type: "Point", coordinates: [sub.lng, sub.lat] },
              properties: {
                name: sub.name,
                borough: n.borough,
                avg_score: score,
                building_count: computed?.building_count ?? Math.round(n.building_count / splits.length),
              },
            });
          }
        } else {
          // No split — show at detail level with same data
          detailFeatures.push({
            type: "Feature",
            geometry: { type: "Point", coordinates: n.centroid as [number, number] },
            properties: {
              name: n.name,
              borough: n.borough,
              avg_score: n.avg_score,
              building_count: n.building_count,
            },
          });
        }
      }

      const combined = m.getSource("neighborhoods") as mapboxgl.GeoJSONSource | undefined;
      if (combined) combined.setData({ type: "FeatureCollection", features: combinedFeatures });

      const detail = m.getSource("neighborhoods-detail") as mapboxgl.GeoJSONSource | undefined;
      if (detail) detail.setData({ type: "FeatureCollection", features: detailFeatures });
    } catch (e) {
      console.error("Failed to load neighborhoods:", e);
    }
  }, []);

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [-73.98, 40.75],
      zoom: 11,
      minZoom: 9,
      maxZoom: 18,
      maxBounds: [
        [-74.5, 40.35],
        [-73.3, 41.1],
      ],
    });

    const m = map.current;
    setMapRef(m);

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
      moveDebounceRef.current = setTimeout(
        () => (USE_VECTOR_TILES ? updateVectorBuildingCount(m) : fetchAndRenderBuildings(m)),
        250
      );
    });

    m.on("load", () => {
      // --- Neighborhood layer (low zoom) ---
      m.addSource("neighborhoods", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      // Shared score color expression for neighborhood circles
      const scoreColor = [
        "interpolate", ["linear"], ["get", "avg_score"],
        55, "#ef4444",
        75, "#f97316",
        90, "#eab308",
        95, "#84cc16",
        100, "#22c55e",
      ] as mapboxgl.Expression;

      // ── Combined bubbles (zoom 9 – 11) ─────────────────────────────────────
      m.addLayer({
        id: "neighborhoods-circles",
        type: "circle",
        source: "neighborhoods",
        maxzoom: 11,
        paint: {
          "circle-radius": [
            "interpolate", ["linear"], ["get", "building_count"],
            100, 12,  1000, 20,  10000, 35,  50000, 50,
          ],
          "circle-color": scoreColor,
          "circle-opacity": 0.6,
          "circle-stroke-width": 1,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-opacity": 0.3,
        },
      });

      m.addLayer({
        id: "neighborhoods-labels",
        type: "symbol",
        source: "neighborhoods",
        maxzoom: 11,
        layout: {
          "text-field": [
            "concat",
            ["get", "name"],
            "\n",
            ["to-string", ["round", ["get", "avg_score"]]],
          ],
          "text-size": 11,
          "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"],
          "text-allow-overlap": false,
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "#000000",
          "text-halo-width": 1,
        },
      });

      // ── Detail bubbles — split sub-neighborhoods (zoom 11 – 13) ────────────
      m.addSource("neighborhoods-detail", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      m.addLayer({
        id: "neighborhoods-detail-circles",
        type: "circle",
        source: "neighborhoods-detail",
        minzoom: 11,
        maxzoom: 13,
        paint: {
          "circle-radius": [
            "interpolate", ["linear"], ["get", "building_count"],
            50, 9,  500, 14,  5000, 22,  25000, 32,
          ],
          "circle-color": scoreColor,
          "circle-opacity": 0.65,
          "circle-stroke-width": 1,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-opacity": 0.35,
        },
      });

      m.addLayer({
        id: "neighborhoods-detail-labels",
        type: "symbol",
        source: "neighborhoods-detail",
        minzoom: 11,
        maxzoom: 13,
        layout: {
          "text-field": [
            "concat",
            ["get", "name"],
            "\n",
            ["to-string", ["round", ["get", "avg_score"]]],
          ],
          "text-size": 11,
          "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"],
          "text-allow-overlap": false,
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "#000000",
          "text-halo-width": 1,
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

      m.addLayer({
        id: "buildings-dots",
        type: "circle",
        source: "buildings",
        ...(USE_VECTOR_TILES ? { "source-layer": TILES_SOURCE_LAYER } : {}),
        minzoom: 13,
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            13, 3,
            16, 6,
          ],
          "circle-color": GRADE_COLOR_EXPRESSION,
          "circle-opacity": 0.8,
          "circle-stroke-width": 1,
          "circle-stroke-color": "#1f2937",
        },
      });

      if (USE_VECTOR_TILES) {
        // Apply the current grade/units/year filter via a Mapbox expression
        // (vector-tile features can't be mutated like a GeoJSON array can).
        const initialFilter = buildVectorFilter(gradeFilterRef.current, mapFiltersRef.current);
        if (initialFilter) m.setFilter("buildings-dots", initialFilter);
        // Recount as tiles stream in for the current viewport.
        m.on("sourcedata", (e) => {
          if (e.sourceId === "buildings" && e.isSourceLoaded) updateVectorBuildingCount(m);
        });
      }

      // --- Selected building highlight (filled dot + white halo ring) ---
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
            10, 4,
            14, 7,
            16, 9,
          ],
          "circle-color": GRADE_COLOR_EXPRESSION,
          "circle-opacity": 0.95,
          "circle-stroke-width": 1,
          "circle-stroke-color": "#1f2937",
        },
      });

      m.addLayer({
        id: "selected-building-ring",
        type: "circle",
        source: "selected-building",
        paint: {
          "circle-radius": [
            "interpolate", ["linear"], ["zoom"],
            10, 8,
            14, 14,
            16, 18,
          ],
          "circle-color": "rgba(0,0,0,0)",
          "circle-opacity": 1,
          "circle-stroke-width": 2.5,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-opacity": 0.95,
        },
      });

      // --- Search results highlight layer ---
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
            "interpolate",
            ["linear"],
            ["zoom"],
            10, 5,
            14, 8,
            16, 10,
          ],
          "circle-color": GRADE_COLOR_EXPRESSION,
          "circle-opacity": 0.95,
          "circle-stroke-width": 2.5,
          "circle-stroke-color": "#ffffff",
        },
      });

      m.addLayer({
        id: "search-results-labels",
        type: "symbol",
        source: "search-results",
        minzoom: 13,
        layout: {
          "text-field": ["get", "address"],
          "text-size": 10,
          "text-offset": [0, 1.5],
          "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"],
          "text-allow-overlap": false,
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "#000000",
          "text-halo-width": 1,
        },
      });

      // Click handlers
      m.on("click", "buildings-dots", (e) => {
        if (e.features && e.features[0]) {
          const bbl = e.features[0].properties?.bbl;
          if (bbl) selectBuilding(bbl);
        }
      });

      m.on("click", "search-results-dots", (e) => {
        if (e.features && e.features[0]) {
          const bbl = e.features[0].properties?.bbl;
          if (bbl) selectBuilding(bbl);
        }
      });

      m.on("mouseenter", "buildings-dots", () => {
        m.getCanvas().style.cursor = "pointer";
      });

      m.on("mouseleave", "buildings-dots", () => {
        m.getCanvas().style.cursor = "";
      });

      m.on("mouseenter", "search-results-dots", () => {
        m.getCanvas().style.cursor = "pointer";
      });

      m.on("mouseleave", "search-results-dots", () => {
        m.getCanvas().style.cursor = "";
      });

      // Initial viewport: vector tiles stream on their own (count updates via
      // the sourcedata listener above), so only the API path fetches here.
      if (USE_VECTOR_TILES) {
        updateVectorBuildingCount(m);
      } else {
        fetchAndRenderBuildings(m);
      }
    });

    return () => {
      setMapRef(null);
      m.remove();
      map.current = null;
    };
  }, [setViewport, selectBuilding, fetchAndRenderBuildings, setMapRef, loadNeighborhoods, updateVectorBuildingCount]);

  // Re-filter buildings on map when grade filter or map filters change
  useEffect(() => {
    const m = map.current;
    if (!m || !m.isStyleLoaded()) return;
    if (USE_VECTOR_TILES) {
      // Vector tiles can't be mutated, so the same grade/units/year filter is
      // expressed as a Mapbox filter on the layer instead of re-running setData.
      if (m.getLayer("buildings-dots")) {
        m.setFilter("buildings-dots", buildVectorFilter(gradeFilter, mapFilters));
        updateVectorBuildingCount(m);
      }
      return;
    }
    if (rawBuildingsRef.current.length > 0) {
      applyGradeFilter(m, rawBuildingsRef.current, gradeFilter, mapFilters);
    }
  }, [gradeFilter, mapFilters, applyGradeFilter, updateVectorBuildingCount]);

  // Highlight selected building with a white ring
  useEffect(() => {
    const m = map.current;
    if (!m || !m.isStyleLoaded()) return;
    const source = m.getSource("selected-building") as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;

    if (!selectedBbl) {
      source.setData({ type: "FeatureCollection", features: [] });
      return;
    }

    // Look up coordinates + grade from visible buildings or search results.
    // Grade is needed so the selected-building-dot layer can colour the dot.
    let coords: [number, number] | null = null;
    let grade = "";
    const inRaw = rawBuildingsRef.current.find((f) => f.properties.bbl === selectedBbl);
    if (inRaw) {
      coords = inRaw.geometry.coordinates as [number, number];
      grade = inRaw.properties.grade ?? "";
    }
    // Vector path: rawBuildingsRef is empty (no fetched array), so pull the
    // clicked building straight from the rendered tile features. Only on-screen
    // buildings can be found this way, which covers the click case (the dot was
    // just clicked, so it's visible).
    if (!coords && USE_VECTOR_TILES && m.getLayer("buildings-dots")) {
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
  }, [selectedBbl, searchResults]);

  // Update search results on map when they change
  useEffect(() => {
    const m = map.current;
    if (!m || !m.isStyleLoaded()) return;

    const source = m.getSource("search-results") as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;

    const setBuildingsVisibility = (visible: boolean) => {
      if (m.getLayer("buildings-dots")) {
        m.setLayoutProperty("buildings-dots", "visibility", visible ? "visible" : "none");
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
      // Cap zoom well below the buildings-dots minzoom so the map zooms out
      // enough to show as many result dots as possible at once. The result
      // dots have no minzoom, so they remain visible at this wider view.
      // Padding mirrors the panel layout: right-side panel on desktop,
      // bottom sheet on mobile — otherwise the dots get squeezed off-screen
      // on narrow viewports.
      const isMobile = window.innerWidth < 768;
      const padding = isMobile
        ? { top: 80, bottom: Math.round(window.innerHeight * 0.55), left: 30, right: 30 }
        : { top: 80, bottom: 40, left: 40, right: 420 };
      m.fitBounds(bounds, {
        padding,
        maxZoom: 12,
        duration: 1500,
      });
    }
  }, [searchResults, gradeFilter]);

  return <div ref={mapContainer} className="absolute inset-0 z-0" />;
}
