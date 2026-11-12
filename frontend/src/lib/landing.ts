// Homepage data, fetched on the server from this site's own API so nothing
// about the example building is hardcoded: its grade, score and record counts
// come from the same endpoint the map's building card uses. Revalidated hourly;
// a request that can't be served throws instead of rendering a page without
// its data (see getJson).

import type { BuildingDetail, CommuteResult, FoodResult } from "@/types/building";
import type { RefreshStatus } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/** 322 East 19 St, Gramercy: the homepage's example. A building, not a listing. */
export const HERO_BBL = "1009240054";

// Waits before each retry: enough to ride out a brief outage, such as the
// backend redeploying from the same push as the frontend.
const RETRY_DELAYS_MS = [2000, 8000];

/**
 * GET from the API, retried; if it still fails, throw. Next keeps serving the
 * last good page when an hourly revalidation throws, and a build that throws
 * fails, leaving the current deploy live. Returning nothing instead would cache
 * a homepage with no building on it for the next hour.
 */
async function getJson<T>(path: string): Promise<T> {
  let failure: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt - 1]));
    try {
      const res = await fetch(`${API_URL}${path}`, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(6000) });
      if (res.ok) return (await res.json()) as T;
      failure = `HTTP ${res.status}`;
    } catch (e) {
      failure = e;
    }
  }
  throw new Error(`Homepage data request failed after ${RETRY_DELAYS_MS.length + 1} tries: ${path}`, { cause: failure });
}

/** The commute example's destination: the Grace Building, 1114 Avenue of the Americas (NYC GeoSearch). */
export const HERO_WORKPLACE = { label: "Grace Building", latitude: 40.7547, longitude: -73.98268 };

export const getHeroBuilding = () => getJson<BuildingDetail>(`/api/buildings/${HERO_BBL}`);
export const getRefreshStatus = () => getJson<RefreshStatus>("/api/refresh-status");
export const getHeroFood = () => getJson<FoodResult>(`/api/buildings/${HERO_BBL}/food?radius_m=400`);

/** The example's weekday commute, from the building's own coordinates. */
export function getHeroCommute(building: BuildingDetail): Promise<CommuteResult | null> {
  if (building.latitude == null || building.longitude == null) return Promise.resolve(null);
  const q = new URLSearchParams({
    from_lat: String(building.latitude),
    from_lng: String(building.longitude),
    to_lat: String(HERO_WORKPLACE.latitude),
    to_lng: String(HERO_WORKPLACE.longitude),
  });
  return getJson<CommuteResult>(`/api/commute?${q}`);
}

/**
 * The five city datasets the grade is built from, keyed as data/refresh.py
 * logs them. HPD and DOB complaints have pullers but were never loaded, so
 * they're left out of the refresh and of this list; keep the homepage's
 * "Five city datasets" in step.
 */
export const GRADE_DATASETS = [
  { key: "311_complaints", name: "311 service requests", id: "erm2-nwe9" },
  { key: "hpd_violations", name: "HPD violations", id: "wvxf-dwi5" },
  { key: "dob_violations", name: "DOB violations", id: "3h2n-5cm9" },
  { key: "litigations", name: "HPD housing litigation", id: "59kj-x8nc" },
  { key: "rodent", name: "Rodent inspections", id: "p937-wjvj" },
] as const;

export const datasetUrl = (id: string) => `https://data.cityofnewyork.us/d/${id}`;

/** When the nightly refresh last pulled a dataset, or null if it never logged one. */
export function refreshedAt(status: RefreshStatus | null, key: string): string | null {
  const row = status?.datasets.find((d) => d.dataset === key && d.last_status === "success");
  return row?.last_completed_at ?? null;
}

/**
 * Newest refresh among the datasets behind the grade. Deliberately not the
 * API's overall_last_updated, which also counts the food datasets and would
 * overstate how fresh the grades are.
 */
export function gradeDataUpdated(status: RefreshStatus | null): string | null {
  const dates = GRADE_DATASETS.map((d) => refreshedAt(status, d.key)).filter((d): d is string => !!d);
  return dates.sort().at(-1) ?? null;
}

export const formatDay = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });
