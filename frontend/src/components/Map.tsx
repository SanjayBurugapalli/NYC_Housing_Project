"use client";

import { useEffect, useRef, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import { useStore } from "@/lib/store";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function Map() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const setViewport = useStore((s) => s.setViewport);
  const selectBuilding = useStore((s) => s.selectBuilding);

  const fetchAndRenderBuildings = useCallback(async (m: mapboxgl.Map) => {
    const zoom = m.getZoom();
    if (zoom < 13) {
      // Clear buildings at low zoom
      const source = m.getSource("buildings") as mapboxgl.GeoJSONSource | undefined;
      if (source) {
        source.setData({ type: "FeatureCollection", features: [] });
      }
      return;
    }

    const bounds = m.getBounds();
    const bbox = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;

    // Cancel previous request
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
    } catch (e: any) {
      if (e.name !== "AbortError") console.error("Failed to fetch buildings:", e);
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

    m.addControl(new mapboxgl.NavigationControl(), "bottom-right");

    m.on("moveend", () => {
      const bounds = m.getBounds();
      setViewport(
        {
          west: bounds.getWest(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          north: bounds.getNorth(),
        },
        m.getZoom()
      );
      fetchAndRenderBuildings(m);
    });

    m.on("load", () => {
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

      m.on("click", "buildings-dots", (e) => {
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

      // Fetch buildings for initial viewport
      fetchAndRenderBuildings(m);
    });

    return () => {
      m.remove();
      map.current = null;
    };
  }, [setViewport, selectBuilding, fetchAndRenderBuildings]);

  return <div ref={mapContainer} className="h-full w-full" />;
}
