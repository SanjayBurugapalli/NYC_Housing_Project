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

export interface BuildingDetail extends BuildingSummary {
  owner_name: string | null;
  managing_agent: string | null;
  sub_neighborhood: string | null;
  score_breakdown: ScoreBreakdown;
  complaints: ComplaintRecord[];
  violations: ViolationRecord[];
  litigations: LitigationRecord[];
  rodent_inspections: RodentInspectionRecord[];
  fdny_violations: FDNYViolationRecord[];
  evictions: EvictionRecord[];
  litigation_count: number;
  rodent_inspection_count: number;
  eviction_count: number;
  rent_status: "likely_stabilized" | "condo" | "coop" | "not_regulated" | "unknown";
}

export interface NeighborhoodAggregate {
  name: string;
  borough: Borough;
  avg_score: number;
  building_count: number;
  centroid: [number, number];
}

export interface SearchResult {
  results: BuildingSummary[];
  total: number;
  query: string;
  clarification?: string;
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
}
