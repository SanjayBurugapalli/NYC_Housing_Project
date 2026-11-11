"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import mapboxgl from "mapbox-gl";
import { FoodPopup } from "@/components/building/FoodPopup";
import { tidyTransitName } from "@/components/building/shared";
import { useStore } from "@/lib/store";
import { useBuilding, useCommute, useFood } from "@/hooks/useBuildingData";
import { arcBetween, boundsOf, circleRing, pointOnCircle } from "@/lib/geo";
import { INK, shortAddress } from "@/lib/grades";
import { buildingMarker, foodMarker, labelMarker, setMarkerShown, stationMarker, workMarker } from "@/components/map/markers";
import { labelObstacles, layoutStationLabels } from "@/components/map/stationLabels";
import { easeInOut, legSlice, prepareRoute, type PreparedLeg } from "@/components/map/routeAnimation";

// Neighborhood score polygons compete with the commute line when the map
// zooms out to frame a long trip, so the commute face hides them.
const NEIGHBORHOOD_LAYERS = ["neighborhoods-fill", "neighborhoods-outline", "neighborhoods-labels"];

function setNeighborhoodsVisible(m: mapboxgl.Map, visible: boolean) {
  try {
    for (const id of NEIGHBORHOOD_LAYERS) {
      if (m.getLayer(id)) m.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
    }
  } catch {
    // style already removed
  }
}

// Map-forward card faces (commute, food) draw on the map itself. Each overlay
// owns its sources/layers/markers and removes them when its face closes.

const VEIL_SOURCE = "byr-veil";
// A white wash over the base map + building dots so the overlay reads first,
// like the faded backgrounds in the design.
const VEIL_POLYGON: GeoJSON.Feature<GeoJSON.Polygon> = {
  type: "Feature",
  properties: {},
  geometry: {
    type: "Polygon",
    coordinates: [[[-75.5, 39.8], [-72.5, 39.8], [-72.5, 41.6], [-75.5, 41.6], [-75.5, 39.8]]],
  },
};

function addVeil(m: mapboxgl.Map, layerId: string, opacity: number) {
  if (!m.getSource(VEIL_SOURCE)) m.addSource(VEIL_SOURCE, { type: "geojson", data: VEIL_POLYGON });
  if (!m.getLayer(layerId)) {
    m.addLayer({
      id: layerId,
      type: "fill",
      source: VEIL_SOURCE,
      paint: { "fill-color": "#FFFFFF", "fill-opacity": opacity },
    });
  }
}

function removeLayers(m: mapboxgl.Map, layers: string[], sources: string[]) {
  // The map may already be torn down (route change) — removal is best effort.
  try {
    for (const id of layers) if (m.getLayer(id)) m.removeLayer(id);
    for (const id of sources) {
      if (id === VEIL_SOURCE && (m.getLayer("byr-commute-veil") || m.getLayer("byr-food-veil"))) continue;
      if (m.getSource(id)) m.removeSource(id);
    }
  } catch {
    // style already removed
  }
}

/**
 * Padding that keeps fitted features above the docked card. The card's height
 * varies (a trip with transfers wraps into more rows), so measure it rather
 * than guess; fall back to a typical height if it isn't mounted yet.
 */
function cardPadding() {
  const mobile = window.innerWidth < 768;
  const card = document.querySelector<HTMLElement>("[data-docked-card]");
  const cardTop = card
    ? card.getBoundingClientRect().top
    : window.innerHeight - (mobile ? window.innerHeight * 0.58 : 360);
  const bottom = Math.max(60, Math.round(window.innerHeight - cardTop + 40));
  // Sides leave room for the end markers' address captions, centered on their points.
  return mobile ? { top: 90, bottom, left: 72, right: 72 } : { top: 110, bottom, left: 90, right: 90 };
}

/**
 * Re-frame the map when the docked card is minimized or expanded: cardPadding
 * reads the card's height, and this runs after the card has re-rendered. Each
 * overlay keeps `refit` pointed at how to frame what it's showing right now.
 */
function useRefitOnMinimize(refit: { current: (() => void) | null }) {
  const minimized = useStore((s) => s.cardMinimized);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    refit.current?.();
  }, [minimized, refit]);
}

/** Short place name for the work caption: "Union Square, Manhattan" → "Union Square". */
function shortPlace(label: string): string {
  return label.split(",")[0].trim();
}

// The drawn route: walking legs dotted in ink, rides solid in the line's color
// on a white casing (so a yellow N/Q/R/W still reads on the pale map).
const ROUTE_LAYERS = ["byr-route-ride-casing", "byr-route-ride", "byr-route-walk"];
const ROUTE_SOURCES = ["byr-route-ride", "byr-route-walk"];
// Pacing of the route film: a camera move per act, then the act draws.
const CAMERA_MS = 900;
const WALK_DRAW_MS = 1600;
const RIDE_DRAW_MS = 2600;

type LineFC = GeoJSON.FeatureCollection<GeoJSON.LineString, { color: string }>;

export function CommuteOverlay() {
  const mapRef = useStore((s) => s.mapRef);
  const selectedBbl = useStore((s) => s.selectedBbl);
  const cardView = useStore((s) => s.cardView);
  const workplace = useStore((s) => s.workplace);
  const replayKey = useStore((s) => s.routeReplayKey);
  const { data: building } = useBuilding(selectedBbl);
  const from =
    building?.latitude != null && building?.longitude != null
      ? { latitude: building.latitude, longitude: building.longitude }
      : null;
  const { data: commute, isError } = useCommute(from, workplace);

  const active = cardView === "commute" && !!mapRef && !!from && !!workplace;
  const refit = useRef<(() => void) | null>(null);
  useRefitOnMinimize(refit);

  // Frame: veil, the two end markers and a first camera move. Independent of
  // the route so the map responds the moment the face opens.
  useEffect(() => {
    if (!active || !mapRef || !from || !workplace || !building) return;
    const m = mapRef;
    const a: [number, number] = [from.longitude, from.latitude];
    const b: [number, number] = [workplace.longitude, workplace.latitude];

    setNeighborhoodsVisible(m, false);
    addVeil(m, "byr-commute-veil", 0.5);
    const markers = [
      new mapboxgl.Marker({ element: buildingMarker(building.grade, shortAddress(building.address)), anchor: "top", offset: [0, -23] })
        .setLngLat(a)
        .addTo(m),
      new mapboxgl.Marker({ element: workMarker(`Work · ${shortPlace(workplace.label)}`), anchor: "top", offset: [0, -23] })
        .setLngLat(b)
        .addTo(m),
    ];
    // Station names keep clear of both ends (stationLabels.ts).
    markers.forEach((mk) => mk.getElement().setAttribute("data-label-obstacle", ""));
    m.fitBounds(boundsOf([a, b]), { padding: cardPadding(), maxZoom: 15.5, duration: 900 });

    return () => {
      markers.forEach((mk) => mk.remove());
      removeLayers(m, ["byr-commute-veil"], [VEIL_SOURCE]);
      setNeighborhoodsVisible(m, true);
    };
    // Coordinates (not object identity) decide when to redraw.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, mapRef, from?.latitude, from?.longitude, workplace?.latitude, workplace?.longitude, building?.grade]);

  // Route: a dotted as-the-crow-flies arc while the trip loads (or if there's
  // no route), then the real trip drawn leg by leg — walk to the station, the
  // ride, the walk to work — with stations appearing as the line reaches them.
  useEffect(() => {
    if (!active || !mapRef || !from || !workplace) return;
    const m = mapRef;
    const a: [number, number] = [from.longitude, from.latitude];
    const b: [number, number] = [workplace.longitude, workplace.latitude];
    const route = commute ? prepareRoute(commute.legs, a, b) : null;
    const pillText = commute ? `${commute.duration_min} min` : isError ? "No route" : "…";

    if (!route) {
      const { line, mid } = arcBetween(a, b);
      m.addSource("byr-commute-arc", {
        type: "geojson",
        data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: line } },
      });
      // Zero-length dashes + round caps = a dotted line (gap is in line widths).
      m.addLayer({
        id: "byr-commute-arc",
        type: "line",
        source: "byr-commute-arc",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": INK, "line-width": 6, "line-dasharray": [0, 2.5] },
      });
      const pill = new mapboxgl.Marker({ element: labelMarker(pillText, true) }).setLngLat(mid).addTo(m);
      refit.current = () => m.fitBounds(boundsOf([a, b]), { padding: cardPadding(), maxZoom: 15.5, duration: 600 });
      return () => {
        refit.current = null;
        pill.remove();
        removeLayers(m, ["byr-commute-arc"], ["byr-commute-arc"]);
      };
    }

    const empty: LineFC = { type: "FeatureCollection", features: [] };
    m.addSource("byr-route-ride", { type: "geojson", data: empty });
    m.addSource("byr-route-walk", { type: "geojson", data: empty });
    m.addLayer({
      id: "byr-route-ride-casing",
      type: "line",
      source: "byr-route-ride",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#FFFFFF", "line-width": 11 },
    });
    m.addLayer({
      id: "byr-route-ride",
      type: "line",
      source: "byr-route-ride",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": ["get", "color"], "line-width": 6 },
    });
    m.addLayer({
      id: "byr-route-walk",
      type: "line",
      source: "byr-route-walk",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": INK, "line-width": 5, "line-dasharray": [0, 2] },
    });

    // How much of each leg is drawn (0–1). Everything below renders from this.
    const drawn = new Map<PreparedLeg, number>(route.legs.map((l) => [l, 0]));

    // Stations: one per boarding and per alighting, except that a transfer at
    // the same named station (get off the A, get on the C) shows once. A
    // boarding station appears as its ride starts; an exit once it's done.
    const stations: { leg: PreparedLeg; at: "board" | "exit"; marker: mapboxgl.Marker }[] = [];
    const rides = route.legs.filter((l) => !l.walk);
    const addStation = (leg: PreparedLeg, at: "board" | "exit") => {
      const point = at === "board" ? leg.points[0] : leg.points[leg.points.length - 1];
      const name = tidyTransitName(at === "board" ? leg.leg.from_name : leg.leg.to_name);
      const marker = new mapboxgl.Marker({ element: stationMarker(name, leg.color ?? INK) })
        .setLngLat(point)
        .addTo(m);
      stations.push({ leg, at, marker });
    };
    rides.forEach((ride, i) => {
      const prev = rides[i - 1];
      if (!prev || prev.leg.to_name !== ride.leg.from_name) addStation(ride, "board");
      addStation(ride, "exit");
    });

    const pillEl = labelMarker(pillText, true);
    const pillInner = pillEl.firstElementChild as HTMLElement;
    pillInner.style.transition = "opacity 250ms ease-out";
    setMarkerShown(pillEl, false);
    pillEl.setAttribute("data-label-obstacle", "");
    const pill = new mapboxgl.Marker({ element: pillEl }).setLngLat(route.labelAt).addTo(m);

    // Station names make room for each other. Where you first board and where
    // you finally get off are placed first; transfers fill in around them.
    const byPriority = (stations.length > 2 ? [stations[0], stations[stations.length - 1], ...stations.slice(1, -1)] : stations)
      .map((s) => s.marker);
    let layoutFrame = 0;
    const layoutLabels = () => {
      cancelAnimationFrame(layoutFrame);
      layoutFrame = 0;
      layoutStationLabels(m, byPriority, labelObstacles(m));
    };
    const scheduleLayout = () => {
      if (!layoutFrame) layoutFrame = requestAnimationFrame(layoutLabels);
    };
    m.on("move", scheduleLayout);
    m.on("resize", scheduleLayout);
    let shownKey = "";

    const render = () => {
      const ride: LineFC = { type: "FeatureCollection", features: [] };
      const walk: LineFC = { type: "FeatureCollection", features: [] };
      for (const leg of route.legs) {
        const coords = legSlice(leg, drawn.get(leg) ?? 0);
        if (coords.length < 2) continue;
        (leg.walk ? walk : ride).features.push({
          type: "Feature",
          properties: { color: leg.color ?? INK },
          geometry: { type: "LineString", coordinates: coords },
        });
      }
      (m.getSource("byr-route-ride") as mapboxgl.GeoJSONSource | undefined)?.setData(ride);
      (m.getSource("byr-route-walk") as mapboxgl.GeoJSONSource | undefined)?.setData(walk);
      let key = "";
      for (const s of stations) {
        const f = drawn.get(s.leg) ?? 0;
        const shown = s.at === "board" ? f > 0 : f >= 1;
        setMarkerShown(s.marker.getElement(), shown);
        key += shown ? "1" : "0";
      }
      // A station just appeared (or a replay hid them): place names before it fades in.
      if (key !== shownKey) {
        shownKey = key;
        layoutLabels();
      }
    };

    const wholeTrip = boundsOf([a, b, ...route.all]);
    let finished = false;
    // Mid-film, the next act's camera move measures the card itself.
    refit.current = () => {
      if (finished) m.fitBounds(wholeTrip, { padding: cardPadding(), maxZoom: 15.5, duration: 600 });
    };
    const finish = (moveCamera: boolean) => {
      if (finished) return;
      finished = true;
      route.legs.forEach((l) => drawn.set(l, 1));
      render();
      setMarkerShown(pillEl, true);
      layoutLabels(); // the trip-time pill is an obstacle now
      if (moveCamera) m.fitBounds(wholeTrip, { padding: cardPadding(), maxZoom: 15.5, duration: 1100 });
    };

    // The film: for each act, move the camera to it, then draw its legs. Walks
    // play zoomed in to street level so the route to the station is readable;
    // rides pull back far enough to show the whole line.
    let cancelled = false;
    let frame = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const wait = (ms: number) => new Promise<void>((resolve) => timers.push(setTimeout(resolve, ms)));
    const drawLegs = (legs: PreparedLeg[], ms: number) =>
      new Promise<void>((resolve) => {
        const total = legs.reduce((sum, l) => sum + l.length, 0);
        const t0 = performance.now();
        const tick = (now: number) => {
          if (cancelled || finished) return resolve();
          const t = Math.min(1, (now - t0) / ms);
          let d = easeInOut(t) * total;
          for (const leg of legs) {
            drawn.set(leg, Math.max(0, Math.min(1, d / leg.length)));
            d -= leg.length;
          }
          render();
          if (t < 1) frame = requestAnimationFrame(tick);
          else resolve();
        };
        frame = requestAnimationFrame(tick);
      });

    const play = async () => {
      for (const act of route.acts) {
        if (cancelled || finished) return;
        const walk = act.kind === "walk";
        m.fitBounds(boundsOf(act.points), { padding: cardPadding(), maxZoom: walk ? 16.5 : 14.5, duration: CAMERA_MS });
        await wait(CAMERA_MS);
        if (cancelled || finished) return;
        await drawLegs(act.legs, walk ? WALK_DRAW_MS : RIDE_DRAW_MS);
      }
      if (!cancelled) finish(true);
    };

    // Grabbing the map skips to the finished route (and leaves the camera be).
    const onUserMove = (e: { originalEvent?: unknown }) => {
      if (e.originalEvent) finish(false);
    };
    m.on("movestart", onUserMove);

    // People who've asked their OS for less motion get the finished route.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) finish(true);
    else play();

    return () => {
      refit.current = null;
      cancelled = true;
      timers.forEach(clearTimeout);
      cancelAnimationFrame(frame);
      cancelAnimationFrame(layoutFrame);
      m.off("movestart", onUserMove);
      m.off("move", scheduleLayout);
      m.off("resize", scheduleLayout);
      stations.forEach((s) => s.marker.remove());
      pill.remove();
      removeLayers(m, ROUTE_LAYERS, ROUTE_SOURCES);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, mapRef, commute, isError, replayKey, from?.latitude, from?.longitude, workplace?.latitude, workplace?.longitude]);

  return null;
}

export function FoodOverlay() {
  const mapRef = useStore((s) => s.mapRef);
  const selectedBbl = useStore((s) => s.selectedBbl);
  const cardView = useStore((s) => s.cardView);
  const foodCategories = useStore((s) => s.foodCategories);
  const activeFoodId = useStore((s) => s.activeFoodId);
  const setActiveFoodId = useStore((s) => s.setActiveFoodId);
  const { data: building } = useBuilding(selectedBbl);
  const { data: food } = useFood(selectedBbl);

  const active = cardView === "food" && !!mapRef && building?.latitude != null && building?.longitude != null;
  const center: [number, number] | null =
    building?.latitude != null && building?.longitude != null ? [building.longitude, building.latitude] : null;
  const radius = food?.radius_m ?? 400;
  const refit = useRef<(() => void) | null>(null);
  useRefitOnMinimize(refit);

  // Walk circle, building tile and framing.
  useEffect(() => {
    if (!active || !mapRef || !center || !building) return;
    const m = mapRef;
    const ring = circleRing(center, radius);

    addVeil(m, "byr-food-veil", 0.55);
    m.addSource("byr-food-circle", {
      type: "geojson",
      data: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } },
    });
    m.addLayer({
      id: "byr-food-circle-fill",
      type: "fill",
      source: "byr-food-circle",
      paint: { "fill-color": "#12141A", "fill-opacity": 0.03 },
    });
    m.addLayer({
      id: "byr-food-circle-line",
      type: "line",
      source: "byr-food-circle",
      paint: { "line-color": "#12141A", "line-width": 2, "line-dasharray": [3, 4.5] },
    });

    const walkLabel = new mapboxgl.Marker({ element: labelMarker(`${food?.walk_minutes ?? 5} min walk`) })
      .setLngLat(pointOnCircle(center, radius, 135))
      .addTo(m);
    const tile = new mapboxgl.Marker({ element: buildingMarker(building.grade) }).setLngLat(center).addTo(m);

    m.fitBounds(boundsOf(ring), { padding: cardPadding(), maxZoom: 17, duration: 900 });
    refit.current = () => m.fitBounds(boundsOf(ring), { padding: cardPadding(), maxZoom: 17, duration: 600 });

    return () => {
      refit.current = null;
      walkLabel.remove();
      tile.remove();
      removeLayers(m, ["byr-food-circle-line", "byr-food-circle-fill", "byr-food-veil"], ["byr-food-circle", VEIL_SOURCE]);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, mapRef, center?.[0], center?.[1], radius, building?.grade, food?.walk_minutes]);

  // POI pins for the kinds currently switched on. Capped so a dense Midtown
  // block doesn't put hundreds of DOM markers on the map.
  const pinEls = useRef<Map<string, HTMLElement>>(new Map());
  useEffect(() => {
    if (!active || !mapRef || !food) return;
    const m = mapRef;
    const els = pinEls.current;
    const pins = food.places
      .filter((p) => foodCategories[p.category])
      .slice(0, 150)
      .map((p) => {
        const element = foodMarker(p, () => setActiveFoodId(p.id));
        if (p.id === useStore.getState().activeFoodId) element.setAttribute("data-active", "");
        els.set(p.id, element);
        return new mapboxgl.Marker({ element }).setLngLat([p.longitude, p.latitude]).addTo(m);
      });
    return () => {
      pins.forEach((pin) => pin.remove());
      els.clear();
    };
  }, [active, mapRef, food, foodCategories, setActiveFoodId]);

  // The open place: highlight its pin and anchor a popup to it. The popup body
  // is React (FoodPopup) portaled into the DOM node Mapbox positions.
  const activePlace = active && food ? food.places.find((p) => p.id === activeFoodId) ?? null : null;
  const [popupNode, setPopupNode] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!activePlace || !mapRef) return;
    const m = mapRef;
    pinEls.current.get(activePlace.id)?.setAttribute("data-active", "");
    const node = document.createElement("div");
    const popup = new mapboxgl.Popup({ offset: 22, closeButton: false, maxWidth: "300px", className: "byr-popup", focusAfterOpen: false })
      .setLngLat([activePlace.longitude, activePlace.latitude])
      .setDOMContent(node)
      .addTo(m);
    // Closed by a map click (Mapbox's closeOnClick) → clear the selection too.
    popup.on("close", () => {
      if (useStore.getState().activeFoodId === activePlace.id) setActiveFoodId(null);
    });
    setPopupNode(node);
    return () => {
      pinEls.current.get(activePlace.id)?.removeAttribute("data-active");
      setPopupNode(null);
      popup.remove();
    };
  }, [activePlace, mapRef, setActiveFoodId]);

  // Leaving the food face closes any open place.
  useEffect(() => {
    if (!active && activeFoodId) setActiveFoodId(null);
  }, [active, activeFoodId, setActiveFoodId]);

  if (!popupNode || !activePlace) return null;
  return createPortal(<FoodPopup place={activePlace} onClose={() => setActiveFoodId(null)} />, popupNode);
}
