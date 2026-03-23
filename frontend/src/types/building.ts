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
  date: string;
  status: string;
  source: "311" | "HPD" | "DOB";
  description: string;
}

export interface ViolationRecord {
  id: string;
  type: string;
  severity: ViolationSeverity;
  date: string;
  status: string;
  source: "HPD" | "DOB";
  description: string;
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

export interface BuildingDetail extends BuildingSummary {
  owner_name: string | null;
  score_breakdown: ScoreBreakdown;
  complaints: ComplaintRecord[];
  violations: ViolationRecord[];
  litigations: LitigationRecord[];
  rodent_inspections: RodentInspectionRecord[];
  litigation_count: number;
  rodent_inspection_count: number;
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
