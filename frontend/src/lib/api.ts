import type {
  BuildingDetail,
  BuildingSummary,
  NeighborhoodAggregate,
  SearchResult,
  ViewportBounds,
} from "@/types/building";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
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

export async function searchBuildings(query: string, apartmentsOnly = false): Promise<SearchResult> {
  return fetchApi("/api/search", {
    method: "POST",
    body: JSON.stringify({ query, apartments_only: apartmentsOnly }),
  });
}
