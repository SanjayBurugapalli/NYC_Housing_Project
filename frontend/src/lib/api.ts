import type {
  BuildingDetail,
  BuildingSummary,
  CommuteResult,
  FoodResult,
  ResolveListingResult,
  SearchFilters,
  SearchResult,
  ViewportBounds,
  Workplace,
  WorstBuilding,
  WorstLandlord,
} from "@/types/building";
import type { CategoryWeights } from "@/lib/scoringWeights";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const DEFAULT_TIMEOUT_MS = 10_000;

/** Non-2xx API response. `detail` carries FastAPI's user-facing message when present. */
export class ApiError extends Error {
  constructor(public status: number, public detail: string | null) {
    super(detail ?? `API error: ${status}`);
  }
}

async function fetchApi<T>(path: string, options?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...fetchOptions } = options ?? {};

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${API_URL}${path}`, {
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      ...fetchOptions,
    });
    if (!res.ok) {
      let detail: string | null = null;
      try {
        const body = await res.json();
        if (typeof body?.detail === "string") detail = body.detail;
      } catch {
        // non-JSON error body
      }
      throw new ApiError(res.status, detail);
    }
    return res.json();
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Request timed out. Please try again.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchBuildings(
  bounds: ViewportBounds,
  zoom: number,
  includeSmallHomes: boolean = false
): Promise<{ buildings: BuildingSummary[]; total: number }> {
  const bbox = `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`;
  const small = includeSmallHomes ? "&include_small_homes=true" : "";
  return fetchApi(`/api/buildings?bbox=${bbox}&zoom=${zoom}${small}`);
}

export async function fetchBuildingDetail(
  bbl: string
): Promise<BuildingDetail> {
  return fetchApi(`/api/buildings/${bbl}`);
}

export interface NeighborhoodPolygonProperties {
  nta_code: string;
  name: string;
  borough: string;
  avg_score: number;
  building_count: number;
}

export type NeighborhoodPolygonCollection = GeoJSON.FeatureCollection<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  NeighborhoodPolygonProperties
>;

/** NTA neighborhood outline polygons with aggregated health scores (GeoJSON). */
export async function fetchNeighborhoodPolygons(): Promise<NeighborhoodPolygonCollection> {
  return fetchApi("/api/neighborhoods/polygons");
}

export interface DatasetRefreshStatus {
  dataset: string;
  last_completed_at: string | null;
  last_status: "success" | "fail" | "running" | null;
  rows_changed: number | null;
  duration_seconds: number | null;
}

export interface RefreshStatus {
  datasets: DatasetRefreshStatus[];
  overall_last_updated: string | null;
  any_stale: boolean;
}

export async function fetchRefreshStatus(): Promise<RefreshStatus> {
  return fetchApi("/api/refresh-status");
}

export interface SearchOptions {
  includeSmallHomes?: boolean;
  /** Borough chip from the map filters (applies to plain-English searches). */
  borough?: string | null;
  /** Structured filters to run instead of parsing the query (chip removal). */
  filters?: SearchFilters | null;
  /** Restrict to a map area ("Search this area"). */
  bbox?: ViewportBounds | null;
}

export async function searchBuildings(query: string, opts: SearchOptions = {}): Promise<SearchResult> {
  return fetchApi("/api/search", {
    method: "POST",
    timeoutMs: 15_000,
    body: JSON.stringify({
      query,
      include_small_homes: opts.includeSmallHomes ?? false,
      borough: opts.borough ?? null,
      filters: opts.filters ?? null,
      bbox: opts.bbox ? [opts.bbox.west, opts.bbox.south, opts.bbox.east, opts.bbox.north] : null,
    }),
  });
}

/** Snap a StreetEasy/Zillow listing link to a building (parses the URL; never fetches it). */
export async function resolveListing(url: string): Promise<ResolveListingResult> {
  return fetchApi("/api/resolve-listing", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}

/** Fastest transit + walking trip, next weekday at 8:30 AM. Throws ApiError(404) when no route exists. */
export async function fetchCommute(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number }
): Promise<CommuteResult> {
  const params = new URLSearchParams({
    from_lat: from.latitude.toFixed(5),
    from_lng: from.longitude.toFixed(5),
    to_lat: to.latitude.toFixed(5),
    to_lng: to.longitude.toFixed(5),
  });
  return fetchApi(`/api/commute?${params.toString()}`, { timeoutMs: 15_000 });
}

/** Delis, groceries and restaurants within `radiusM` of a building (400 m ≈ a 5-minute walk). */
export async function fetchFood(bbl: string, radiusM = 400): Promise<FoodResult> {
  return fetchApi(`/api/buildings/${bbl}/food?radius_m=${radiusM}`);
}

// NYC Planning Labs GeoSearch (open data, no key, CORS-enabled). Called straight
// from the browser for type-ahead on the work-address field; CSP connect-src
// in next.config.js allows the host.
const GEOSEARCH_URL = "https://geosearch.planninglabs.nyc/v2/autocomplete";

export async function autocompleteAddress(text: string, signal?: AbortSignal): Promise<Workplace[]> {
  const res = await fetch(`${GEOSEARCH_URL}?text=${encodeURIComponent(text)}`, { signal });
  if (!res.ok) return [];
  const body = await res.json();
  const features: unknown[] = Array.isArray(body?.features) ? body.features : [];
  return features.slice(0, 6).flatMap((f) => {
    const feat = f as { properties?: { label?: string }; geometry?: { coordinates?: [number, number] } };
    const coords = feat.geometry?.coordinates;
    const label = feat.properties?.label;
    if (!coords || !label) return [];
    return [{ label: label.replace(/, USA$/, ""), longitude: coords[0], latitude: coords[1] }];
  });
}

// Maps the frontend weight keys to the rankings API's w_* query params.
const RANKING_WEIGHT_PARAMS: Record<keyof CategoryWeights, string> = {
  heat_hot_water: "w_heat",
  pest_rodent: "w_pest",
  structural_safety: "w_structural",
  hpd_severity: "w_hpd",
  noise: "w_noise",
  litigation: "w_litigation",
};

/** Append custom scoring weights (fractions) to a rankings query, if provided. */
function appendWeights(params: URLSearchParams, weights?: CategoryWeights | null): void {
  if (!weights) return;
  for (const key of Object.keys(RANKING_WEIGHT_PARAMS) as (keyof CategoryWeights)[]) {
    params.set(RANKING_WEIGHT_PARAMS[key], String(weights[key]));
  }
}

/** `query` finds buildings by address in the full ranking instead of listing the worst. */
export async function fetchWorstBuildings(
  borough?: string | null,
  limit = 50,
  weights?: CategoryWeights | null,
  query?: string | null
): Promise<{ buildings: WorstBuilding[]; total: number; borough: string | null; query: string | null; ranked_total: number | null }> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (borough) params.set("borough", borough);
  if (query) params.set("q", query);
  appendWeights(params, weights);
  return fetchApi(`/api/rankings/buildings?${params.toString()}`);
}

export type LandlordGroupBy = "owner" | "manager";

/** `query` finds landlords by name in the full ranking instead of listing the worst. */
export async function fetchWorstLandlords(
  borough?: string | null,
  groupBy: LandlordGroupBy = "owner",
  limit = 50,
  weights?: CategoryWeights | null,
  query?: string | null
): Promise<{
  landlords: WorstLandlord[];
  total: number;
  borough: string | null;
  group_by: LandlordGroupBy;
  query: string | null;
  ranked_total: number | null;
}> {
  const params = new URLSearchParams({ limit: String(limit), group_by: groupBy });
  if (borough) params.set("borough", borough);
  if (query) params.set("q", query);
  appendWeights(params, weights);
  return fetchApi(`/api/rankings/landlords?${params.toString()}`);
}

export async function searchByOwner(name: string): Promise<SearchResult> {
  return fetchApi(`/api/search/by-owner?name=${encodeURIComponent(name)}`);
}

export async function searchByManager(name: string): Promise<SearchResult> {
  return fetchApi(`/api/search/by-manager?name=${encodeURIComponent(name)}`);
}

export function trackEvent(
  type: "search" | "building_view" | "compare",
  data?: Record<string, unknown>
): void {
  fetch(`${API_URL}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event_type: type, data }),
    keepalive: true,
  }).catch(() => {});
}

export interface FeedbackPayload {
  message: string;
  rating?: number | null;
  email?: string | null;
  page_context?: string;
}

export async function submitFeedback(
  payload: FeedbackPayload
): Promise<{ success: boolean }> {
  return fetchApi<{ success: boolean }>("/api/feedback", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
