"use client";

import { useEffect, useRef, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import { useStore } from "@/lib/store";
import { fetchNeighborhoods, fetchSubNeighborhoods } from "@/lib/api";
import { NEIGHBORHOOD_SPLITS } from "@/lib/neighborhoodSplits";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Grade color mapping
const GRADE_COLORS: Record<string, string> = {
  A: "#22c55e",
  B: "#84cc16",
  C: "#eab308",
  D: "#f97316",
  F: "#ef4444",
};

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

  const loadNeighborhoods = useCallback(async (m: mapboxgl.Map) => {
    try {
      const [neighborhoodData, subData] = await Promise.all([
        fetchNeighborhoods(),
        fetchSubNeighborhoods(),
      ]);

      const valid = neighborhoodData.neighborhoods.filter(
        (n) => n.centroid && n.centroid.length === 2
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
            detailFeatures.push({
              type: "Feature",
              geometry: { type: "Point", coordinates: [sub.lng, sub.lat] },
              properties: {
                name: sub.name,
                borough: n.borough,
                avg_score: computed?.avg_score ?? n.avg_score,
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
      // Debounce: wait 250ms after the last moveend before fetching
      if (moveDebounceRef.current) clearTimeout(moveDebounceRef.current);
      moveDebounceRef.current = setTimeout(() => fetchAndRenderBuildings(m), 250);
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
      m.addSource("buildings", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      m.addLayer({
        id: "buildings-dots",
        type: "circle",
        source: "buildings",
        minzoom: 13,
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            13, 3,
            16, 6,
          ],
          "circle-color": [
            "match",
            ["get", "grade"],
            "A", "#22c55e",
            "B", "#84cc16",
            "C", "#eab308",
            "D", "#f97316",
            "F", "#ef4444",
            "#6b7280",
          ],
          "circle-opacity": 0.8,
          "circle-stroke-width": 1,
          "circle-stroke-color": "#1f2937",
        },
      });

      // --- Selected building highlight ring ---
      m.addSource("selected-building", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
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
          "circle-color": [
            "match",
            ["get", "grade"],
            "A", "#22c55e",
            "B", "#84cc16",
            "C", "#eab308",
            "D", "#f97316",
            "F", "#ef4444",
            "#6b7280",
          ],
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

      // Fetch buildings for initial viewport
      fetchAndRenderBuildings(m);
    });

    return () => {
      setMapRef(null);
      m.remove();
      map.current = null;
    };
  }, [setViewport, selectBuilding, fetchAndRenderBuildings, setMapRef, loadNeighborhoods]);

  // Re-filter buildings on map when grade filter or map filters change
  useEffect(() => {
    const m = map.current;
    if (!m || !m.isStyleLoaded()) return;
    if (rawBuildingsRef.current.length > 0) {
      applyGradeFilter(m, rawBuildingsRef.current, gradeFilter, mapFilters);
    }
  }, [gradeFilter, mapFilters, applyGradeFilter]);

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

    // Look up coordinates from visible buildings or search results
    let coords: [number, number] | null = null;
    const inRaw = rawBuildingsRef.current.find((f) => f.properties.bbl === selectedBbl);
    if (inRaw) {
      coords = inRaw.geometry.coordinates as [number, number];
    } else {
      const inSearch = searchResults.find((b) => b.bbl === selectedBbl);
      if (inSearch && inSearch.longitude != null && inSearch.latitude != null) {
        coords = [inSearch.longitude, inSearch.latitude];
      }
    }

    source.setData({
      type: "FeatureCollection",
      features: coords
        ? [{ type: "Feature", geometry: { type: "Point", coordinates: coords }, properties: {} }]
        : [],
    });
  }, [selectedBbl, searchResults]);

  // Update search results on map when they change
  useEffect(() => {
    const m = map.current;
    if (!m || !m.isStyleLoaded()) return;

    const source = m.getSource("search-results") as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;

    if (searchResults.length === 0) {
      source.setData({ type: "FeatureCollection", features: [] });
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

    // Fly to search results bounds
    if (features.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      features.forEach((f) => {
        bounds.extend(f.geometry.coordinates as [number, number]);
      });
      m.fitBounds(bounds, {
        padding: { top: 80, bottom: 40, left: 40, right: 420 },
        maxZoom: 16,
        duration: 1500,
      });
    }
  }, [searchResults, gradeFilter]);

  return <div ref={mapContainer} className="absolute inset-0 z-0" />;
}
