import type {
  BuildingDetail,
  BuildingSummary,
  NeighborhoodAggregate,
  SearchResult,
  ViewportBounds,
  WorstBuilding,
  WorstLandlord,
} from "@/types/building";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const DEFAULT_TIMEOUT_MS = 10_000;

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
      throw new Error(`API error: ${res.status} ${res.statusText}`);
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

export async function fetchNeighborhoods(): Promise<{
  neighborhoods: NeighborhoodAggregate[];
}> {
  return fetchApi("/api/neighborhoods");
}

export interface SubNeighborhoodScore {
  name: string;
  avg_score: number;
  building_count: number;
  centroid: [number, number];
}

export async function fetchSubNeighborhoods(): Promise<{
  sub_neighborhoods: SubNeighborhoodScore[];
}> {
  return fetchApi("/api/neighborhoods/detail");
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

export interface SearchFilters {
  includeSmallHomes?: boolean;
  borough?: string | null;
  minUnits?: number | null;
}

export async function searchBuildings(query: string, filters: SearchFilters = {}): Promise<SearchResult> {
  return fetchApi("/api/search", {
    method: "POST",
    body: JSON.stringify({
      query,
      include_small_homes: filters.includeSmallHomes ?? false,
      borough: filters.borough ?? null,
      min_units: filters.minUnits ?? null,
    }),
  });
}

export async function fetchWorstBuildings(
  borough?: string | null,
  limit = 50
): Promise<{ buildings: WorstBuilding[]; total: number; borough: string | null }> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (borough) params.set("borough", borough);
  return fetchApi(`/api/rankings/buildings?${params.toString()}`);
}

export type LandlordGroupBy = "owner" | "manager";

export async function fetchWorstLandlords(
  borough?: string | null,
  groupBy: LandlordGroupBy = "owner",
  limit = 50
): Promise<{ landlords: WorstLandlord[]; total: number; borough: string | null; group_by: LandlordGroupBy }> {
  const params = new URLSearchParams({ limit: String(limit), group_by: groupBy });
  if (borough) params.set("borough", borough);
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
