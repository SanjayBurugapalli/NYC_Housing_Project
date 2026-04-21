import type {
  BuildingDetail,
  BuildingSummary,
  NeighborhoodAggregate,
  SearchResult,
  ViewportBounds,
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
  zoom: number
): Promise<{ buildings: BuildingSummary[]; total: number }> {
  const bbox = `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`;
  return fetchApi(`/api/buildings?bbox=${bbox}&zoom=${zoom}`);
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

export async function searchByOwner(name: string): Promise<SearchResult> {
  return fetchApi(`/api/search/by-owner?name=${encodeURIComponent(name)}`);
}

export async function searchByManager(name: string): Promise<SearchResult> {
  return fetchApi(`/api/search/by-manager?name=${encodeURIComponent(name)}`);
}
