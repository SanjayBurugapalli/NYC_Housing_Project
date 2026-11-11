// Homepage data, fetched on the server from this site's own API so nothing
// about the example building is hardcoded: its grade, score and record counts
// come from the same endpoint the map's building card uses. Revalidated hourly;
// if the API can't be reached the page renders without any numbers.

import type { BuildingDetail, ScoreBreakdown } from "@/types/building";
import type { RefreshStatus } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/** 602 Manhattan Ave, Greenpoint: the homepage's example. A building, not a listing. */
export const HERO_BBL = "3026800046";
export const HERO_FALLBACK = { address: "602 Manhattan Ave", place: "Greenpoint, Brooklyn" };

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(6000) });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

export const getHeroBuilding = () => getJson<BuildingDetail>(`/api/buildings/${HERO_BBL}`);
export const getRefreshStatus = () => getJson<RefreshStatus>("/api/refresh-status");

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

// Record dates are calendar dates (no time), so read them in UTC.
const monthYear = (date: string) =>
  new Date(date).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

type CountKey = keyof Pick<
  ScoreBreakdown,
  "pest_rodent_count" | "heat_hot_water_count" | "structural_safety_count" | "hpd_severity_count" | "litigation_count" | "noise_count"
>;

/** The six sub-scores in weight order, named as the grade section names them. */
export const RECORD_CATEGORIES: { key: CountKey; name: string; short: string; one: string; many: string }[] = [
  { key: "pest_rodent_count", name: "Pests", short: "pests", one: "pest or rodent issue", many: "pest or rodent issues" },
  { key: "heat_hot_water_count", name: "Heat", short: "heat", one: "heat or hot-water complaint", many: "heat or hot-water complaints" },
  { key: "structural_safety_count", name: "Structural", short: "structural safety", one: "structural or safety issue", many: "structural or safety issues" },
  { key: "hpd_severity_count", name: "Housing code", short: "housing code", one: "housing-code violation", many: "housing-code violations" },
  { key: "litigation_count", name: "Lawsuits", short: "lawsuits", one: "lawsuit", many: "lawsuits" },
  { key: "noise_count", name: "Noise", short: "noise", one: "noise complaint", many: "noise complaints" },
];

function listOf(items: string[], conj = "or"): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} ${conj} ${items.at(-1)}`;
}

/** "one failed rat inspection, in January 2026" when the pest count is all failed inspections. */
function pestPhrase(d: BuildingDetail): string {
  const n = d.score_breakdown.pest_rodent_count;
  const failed = (d.rodent_inspections ?? []).filter((r) => /fail/i.test(r.result ?? ""));
  if (failed.length === n) {
    const what = failed.every((r) => /\brat\b/i.test(r.result ?? "")) ? "rat" : "rodent";
    const latest = failed.map((r) => r.date).filter((x): x is string => !!x).sort().at(-1);
    const when = latest ? `, ${n === 1 ? "in" : "the latest in"} ${monthYear(latest)}` : "";
    return `${n === 1 ? "one" : n} failed ${what} inspection${n === 1 ? "" : "s"}${when}`;
  }
  return `${n} ${n === 1 ? "pest or rodent issue" : "pest or rodent issues"}`;
}

/**
 * The building's five-year record in a sentence, from its own counts:
 * "nothing on heat, …, lawsuits or noise, and one failed rat inspection, in January 2026".
 */
export function recordSummary(d: BuildingDetail): string {
  const b = d.score_breakdown;
  const clean = RECORD_CATEGORIES.filter((c) => b[c.key] === 0).map((c) => c.short);
  const issues = RECORD_CATEGORIES.filter((c) => b[c.key] > 0).map((c) =>
    c.key === "pest_rodent_count" ? pestPhrase(d) : `${b[c.key]} ${b[c.key] === 1 ? c.one : c.many}`
  );
  if (issues.length === 0) return `nothing on ${listOf(clean)}`;
  if (clean.length === 0) return listOf(issues, "and");
  return `nothing on ${listOf(clean)}, and ${listOf(issues, "and")}`;
}
