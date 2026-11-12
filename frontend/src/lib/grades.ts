// Grade + price presentation shared by the map, the building card and the
// landing page. Thresholds mirror score_to_grade() in
// backend/app/services/building_service.py and the tile export in
// tiles/generate.sh — keep all three in sync.

export type Grade = "A" | "B" | "C" | "D" | "F";

export const GRADES: readonly Grade[] = ["A", "B", "C", "D", "F"];

export const INK = "#12141A";

export interface GradeMeta {
  /** Fill color of the grade tile / map dot. */
  bg: string;
  /** Text color that passes contrast on `bg` (white only on F). */
  fg: string;
  range: string;
  /** Bold lead-in on the building card ("Significant issues."). */
  headline: string;
  /** The rest of the sentence after the headline. */
  detail: string;
  /** Lower-case phrase for compact rows ("64 out of 100 · significant issues"). */
  short: string;
}

export const GRADE_META: Record<Grade, GradeMeta> = {
  A: { bg: "#1FA187", fg: INK, range: "97–100", headline: "Clean record.", detail: "Sign with confidence.", short: "clean record" },
  B: { bg: "#8FD3B6", fg: INK, range: "90–96", headline: "Minor issues.", detail: "No pattern of neglect.", short: "minor issues" },
  C: { bg: "#F4D03F", fg: INK, range: "75–89", headline: "Moderate issues.", detail: "Worth a closer look.", short: "moderate issues" },
  D: { bg: "#F28C28", fg: INK, range: "55–74", headline: "Significant issues.", detail: "Ask hard questions before you sign.", short: "significant issues" },
  F: { bg: "#C62F2F", fg: "#FFFFFF", range: "0–54", headline: "Critical issues.", detail: "Proceed with care.", short: "critical issues" },
};

/** Segment widths (percent of 0–100) for the score bar: F 0–55, D 55–75, C 75–90, B 90–97, A 97–100. */
export const GRADE_BAR_SEGMENTS: { grade: Grade; pct: number }[] = [
  { grade: "F", pct: 55 },
  { grade: "D", pct: 20 },
  { grade: "C", pct: 15 },
  { grade: "B", pct: 7 },
  { grade: "A", pct: 3 },
];

export function scoreToGrade(score: number): Grade {
  if (score >= 97) return "A";
  if (score >= 90) return "B";
  if (score >= 75) return "C";
  if (score >= 55) return "D";
  return "F";
}

/** Narrow an arbitrary string from the API/tiles to a Grade. */
export function toGrade(value: unknown, fallback: Grade = "A"): Grade {
  return typeof value === "string" && (GRADES as readonly string[]).includes(value)
    ? (value as Grade)
    : fallback;
}

// --- Rent status (mirrors _compute_rent_status in building_service.py) ---

export type RentStatus = "likely_stabilized" | "condo" | "coop" | "not_regulated" | "unknown";

/**
 * PLUTO's cooperative classes: walk-up (C6, C8 loft conversion, CC) and
 * elevator (D4, D0 loft conversion, DC). Condos are the R classes. Not co-ops:
 * C0 is a three-family walk-up, D5 a converted elevator rental. Mirrors
 * COOP_CLASSES in backend/app/services/building_service.py.
 */
export const COOP_CLASS_CODES = ["C6", "C8", "CC", "D0", "D4", "DC"];
const COOP_CLASSES = new Set(COOP_CLASS_CODES);

export function rentStatus(
  buildingClass: string | null | undefined,
  yearBuilt: number | null | undefined,
  units: number | null | undefined
): RentStatus {
  const bc = (buildingClass ?? "").toUpperCase().trim();
  if (!bc) return "unknown";
  if (bc.startsWith("R")) return "condo";
  if (COOP_CLASSES.has(bc)) return "coop";
  const first = bc[0];
  if (first === "A" || first === "B") return "not_regulated";
  if (first === "C" || first === "D") {
    return (units ?? 0) >= 6 && yearBuilt && yearBuilt <= 1974 ? "likely_stabilized" : "not_regulated";
  }
  return "unknown";
}

export const RENT_STATUS_LABEL: Record<RentStatus, string | null> = {
  likely_stabilized: "Rent stabilized",
  condo: "Condo",
  coop: "Co-op",
  not_regulated: null,
  unknown: null,
};

/** Short building-type chip from the PLUTO building class ("Walk-up", "Elevator", …). */
export function buildingTypeLabel(buildingClass: string | null | undefined): string | null {
  const first = (buildingClass ?? "").toUpperCase().trim()[0];
  switch (first) {
    case "A": return "1-family home";
    case "B": return "2-family home";
    case "C": return "Walk-up";
    case "D": return "Elevator";
    case "R": return "Condo";
    case "S": return "Mixed use";
    default: return null;
  }
}

// --- Food price tiers (estimates; see backend food heuristics) ---

export type PriceTier = 1 | 2 | 3;

export const PRICE_META: Record<PriceTier, { bg: string; fg: string; symbol: string; label: string }> = {
  1: { bg: "#DCD6FF", fg: INK, symbol: "$", label: "cheap" },
  2: { bg: "#8C7BFF", fg: INK, symbol: "$$", label: "mid" },
  3: { bg: "#3D2DB3", fg: "#FFFFFF", symbol: "$$$", label: "pricey" },
};

/** Neutral fill for places with no price estimate. */
export const PRICE_UNKNOWN = { bg: "#FFFFFF", fg: INK };

const STREET_ABBREV: [RegExp, string][] = [
  [/\bAvenue\b/g, "Ave"],
  [/\bStreet\b/g, "St"],
  [/\bBoulevard\b/g, "Blvd"],
  [/\bPlace\b/g, "Pl"],
  [/\bParkway\b/g, "Pkwy"],
  [/\bRoad\b/g, "Rd"],
  [/\bDrive\b/g, "Dr"],
  [/\bTerrace\b/g, "Ter"],
];

/** "1488 BUSHWICK AVENUE" → "1488 Bushwick Ave" for chips, pins and tight rows. */
export function shortAddress(s: string | null | undefined): string {
  return STREET_ABBREV.reduce((acc, [re, abbr]) => acc.replace(re, abbr), titleCase(s));
}

/** HPD/PLUTO stand-ins for "no owner on file" — not a real landlord to link to. */
export function isPlaceholderOwner(name: string | null | undefined): boolean {
  return !name || /^(unavailable owner|name not on file|nan|n\/a|unknown|none)$/i.test(name.trim());
}

// Words that stay upper-case when title-casing PLUTO/HPD names.
const KEEP_UPPER = new Set(["LLC", "LLP", "LP", "INC", "HDFC", "NYC", "NYCHA", "USA", "II", "III", "IV", "JV"]);

export function titleCase(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\b[A-Za-z]+\b/g, (w) => (KEEP_UPPER.has(w.toUpperCase()) ? w.toUpperCase() : w));
}
