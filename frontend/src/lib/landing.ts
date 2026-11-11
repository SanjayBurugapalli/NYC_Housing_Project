// Homepage data, fetched on the server from this site's own API so nothing
// about the example building is hardcoded: its grade, score and record counts
// come from the same endpoint the map's building card uses. Revalidated hourly;
// if the API can't be reached the page renders without any numbers.

import type { BuildingDetail, CommuteResult, FoodResult, ScoreBreakdown } from "@/types/building";
import type { RefreshStatus } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/** 322 East 19 St, Gramercy: the homepage's example. A building, not a listing. */
export const HERO_BBL = "1009240054";
export const HERO_FALLBACK = { address: "322 East 19 St", place: "Gramercy, Manhattan" };

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(6000) });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** The commute example's destination: the Grace Building, 1114 Avenue of the Americas (NYC GeoSearch). */
export const HERO_WORKPLACE = { label: "Grace Building", latitude: 40.7547, longitude: -73.98268 };

export const getHeroBuilding = () => getJson<BuildingDetail>(`/api/buildings/${HERO_BBL}`);
export const getRefreshStatus = () => getJson<RefreshStatus>("/api/refresh-status");
export const getHeroFood = () => getJson<FoodResult>(`/api/buildings/${HERO_BBL}/food?radius_m=400`);

/** The example's weekday commute, from the building's own coordinates. */
export function getHeroCommute(building: BuildingDetail | null) {
  if (building?.latitude == null || building.longitude == null) return Promise.resolve(null);
  const q = new URLSearchParams({
    from_lat: String(building.latitude),
    from_lng: String(building.longitude),
    to_lat: String(HERO_WORKPLACE.latitude),
    to_lng: String(HERO_WORKPLACE.longitude),
  });
  return getJson<CommuteResult>(`/api/commute?${q}`);
}

/**
 * The seven city datasets data/scoring/compute.py reads, keyed as
 * data/refresh.py logs them. DOB complaints feed the structural sub-score
 * alongside DOB violations; keep the homepage's "Seven city datasets" in step.
 */
export const GRADE_DATASETS = [
  { key: "311_complaints", name: "311 service requests", id: "erm2-nwe9" },
  { key: "hpd_complaints", name: "HPD complaints", id: "uwyv-629c" },
  { key: "hpd_violations", name: "HPD violations", id: "wvxf-dwi5" },
  { key: "dob_complaints", name: "DOB complaints", id: "eabe-havv" },
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

type CountKey = keyof Pick<
  ScoreBreakdown,
  "pest_rodent_count" | "heat_hot_water_count" | "structural_safety_count" | "hpd_severity_count" | "litigation_count" | "noise_count"
>;

/** The six sub-scores in weight order, named as the grade section names them. */
export const RECORD_CATEGORIES: { key: CountKey; name: string }[] = [
  { key: "pest_rodent_count", name: "Pests" },
  { key: "heat_hot_water_count", name: "Heat" },
  { key: "structural_safety_count", name: "Structural" },
  { key: "hpd_severity_count", name: "Housing code" },
  { key: "litigation_count", name: "Lawsuits" },
  { key: "noise_count", name: "Noise" },
];
