export type Borough = "MANHATTAN" | "BRONX" | "BROOKLYN" | "QUEENS" | "STATEN ISLAND";

export type BuildingClass = "RENTAL" | "COOP" | "CONDO" | "OTHER";

export type ViolationSeverity = "A" | "B" | "C";

export type Grade = "A" | "B" | "C" | "D" | "F";

export interface BuildingSummary {
  bbl: string;
  bin: string;
  address: string;
  borough: Borough;
  neighborhood: string;
  nta_name?: string | null;
  health_score: number;
  grade: Grade;
  latitude: number;
  longitude: number;
  residential_units: number;
  year_built: number;
  building_class: BuildingClass;
}

export interface ScoreBreakdown {
  heat_hot_water: number;
  heat_hot_water_count: number;
  pest_rodent: number;
  pest_rodent_count: number;
  structural_safety: number;
  structural_safety_count: number;
  hpd_severity: number;
  hpd_severity_count: number;
  noise: number;
  noise_count: number;
  litigation: number;
  litigation_count: number;
  composite: number;
}

export interface ComplaintRecord {
  id: string;
  type: string;
  descriptor: string | null;
  date: string;
  closed_date: string | null;
  status: string;
  source: "311" | "HPD" | "DOB";
  description: string;
  category: string | null;
  resolution_days: number | null;
}

export interface ViolationRecord {
  id: string;
  type: string;
  severity: ViolationSeverity;
  date: string;
  status: string;
  source: "HPD" | "DOB";
  description: string;
  order_number: string | null;
  status_date: string | null;
  approved_date: string | null;
  certify_by_date: string | null;
  correct_by_date: string | null;
}

export interface LitigationRecord {
  id: string;
  case_type: string | null;
  status: string | null;
  date: string | null;
  judgment: string | null;
  respondent: string | null;
}

export interface RodentInspectionRecord {
  id: string;
  type: string | null;
  result: string | null;
  date: string | null;
  address: string | null;
}

export interface FDNYViolationRecord {
  id: string;
  violation_number: string | null;
  violation_type: string | null;
  description: string | null;
  status: string | null;
  date: string | null;
  address: string | null;
}

export interface EvictionRecord {
  id: string;
  address: string | null;
  apartment_no: string | null;
  respondent: string | null;
  executed_date: string | null;
  marshal_name: string | null;
  eviction_type: string | null;
}

export interface OwnerPortfolio {
  building_count: number;
  avg_score: number;
  grade: Grade;
}

export interface BuildingDetail extends BuildingSummary {
  owner_name: string | null;
  managing_agent: string | null;
  owner_portfolio?: OwnerPortfolio | null;
  sub_neighborhood: string | null;
  score_breakdown: ScoreBreakdown;
  complaints: ComplaintRecord[];
  violations: ViolationRecord[];
  litigations: LitigationRecord[];
  rodent_inspections: RodentInspectionRecord[];
  fdny_violations: FDNYViolationRecord[];
  evictions: EvictionRecord[];
  /** How many of each record there are; each list above holds at most the newest 50. */
  record_totals?: Record<
    "complaints" | "violations" | "litigations" | "rodent_inspections" | "fdny_violations" | "evictions",
    number
  >;
  litigation_count: number;
  rodent_inspection_count: number;
  eviction_count: number;
  rent_status: "likely_stabilized" | "condo" | "coop" | "not_regulated" | "unknown";
}

/** One "Here's how I read that" chip: a parsed filter the user can remove. */
export interface FilterChip {
  key: string;
  label: string;
}

export type SearchFilters = Record<string, unknown>;

export interface SearchResult {
  results: BuildingSummary[];
  total: number;
  query: string;
  clarification?: string;
  /** Validated filters the backend actually ran (resend minus a key to drop a chip). */
  filters?: SearchFilters | null;
  filter_chips?: FilterChip[];
}

// --- Listing link → building (POST /api/resolve-listing) ---

export interface ResolveListingResult {
  status: "found" | "no_address" | "not_found" | "invalid";
  source: "streeteasy" | "zillow" | null;
  parsed_address: string | null;
  building: BuildingSummary | null;
  message: string | null;
}

// --- Commute (GET /api/commute, routed by Transitous) ---

export type TransitMode = "WALK" | "SUBWAY" | "BUS" | "RAIL" | "FERRY" | "OTHER";

export interface CommuteLeg {
  mode: TransitMode;
  duration_min: number;
  from_name: string | null;
  to_name: string | null;
  route_short_name: string | null;
  route_color: string | null;
  route_text_color: string | null;
  headsign: string | null;
  num_stops: number | null;
  /** [lng, lat] pairs. */
  geometry: [number, number][];
}

export interface CommuteResult {
  duration_min: number;
  depart_at: string;
  arrive_at: string;
  assumption: string;
  legs: CommuteLeg[];
  attribution: { text: string; url: string };
}

/** The user's saved work address (persisted in localStorage). */
export interface Workplace {
  label: string;
  latitude: number;
  longitude: number;
}

// --- Food nearby (GET /api/buildings/{bbl}/food) ---

export type FoodCategory = "deli" | "grocery" | "restaurant";

export interface FoodPlace {
  id: string;
  name: string;
  category: FoodCategory;
  subtype: string | null;
  price_tier: 1 | 2 | 3 | null;
  latitude: number;
  longitude: number;
  distance_m: number;
  walk_min: number;
  address: string | null;
}

export interface FoodResult {
  radius_m: number;
  walk_minutes: number;
  center: { latitude: number; longitude: number };
  counts: Record<FoodCategory, number>;
  places: FoodPlace[];
  price_note: string;
}

export interface ViewportBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface WorstBuilding extends BuildingSummary {
  owner_name: string | null;
  managing_agent: string | null;
  total_violations: number;
  total_complaints: number;
  /** 1 = worst, in the ranking as filtered. */
  rank: number;
}

export interface WorstLandlord {
  owner_name: string;
  building_count: number;
  avg_score: number;
  grade: Grade;
  total_violations: number;
  total_complaints: number;
  total_units: number;
  boroughs: Borough[];
  worst_bbl: string | null;
  /** 1 = worst, among the ranked portfolios. */
  rank: number;
}
