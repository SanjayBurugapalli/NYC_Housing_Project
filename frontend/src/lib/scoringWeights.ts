// Single source of truth (frontend side) for the composite health-score
// category weights and their landing-page presentation.
//
// The authoritative scoring weights live in data/scoring/compute.py (WEIGHTS).
// Keep DEFAULT_WEIGHTS in sync with that table — both the slider defaults and
// the landing-page breakdown derive from this one object, so they can no
// longer drift from each other.

export interface CategoryWeights {
  heat_hot_water: number;
  pest_rodent: number;
  structural_safety: number;
  hpd_severity: number;
  noise: number;
  litigation: number;
}

export interface WeightDisplay {
  key: keyof CategoryWeights;
  label: string;
  /** Percentage points, derived from DEFAULT_WEIGHTS; the six sum to 100. */
  pct: number;
  color: string;
}

// Canonical numeric weights (fractions of 1). This is the value the slider
// defaults to and the value the landing-page bars are computed from.
export const DEFAULT_WEIGHTS: CategoryWeights = {
  heat_hot_water: 0.20,
  pest_rodent: 0.22,
  structural_safety: 0.20,
  hpd_severity: 0.20,
  noise: 0.05,
  litigation: 0.13,
};

// Label + color + display order for the landing-page "Category weights" chart.
const WEIGHT_META: { key: keyof CategoryWeights; label: string; color: string }[] = [
  { key: "pest_rodent", label: "Pest & Rodent", color: "#eab308" },
  { key: "heat_hot_water", label: "Heat & Hot Water", color: "#f97316" },
  { key: "hpd_severity", label: "HPD Violations", color: "#ef4444" },
  { key: "structural_safety", label: "Structural Safety (DOB)", color: "#84cc16" },
  { key: "litigation", label: "Litigation", color: "#22c55e" },
  { key: "noise", label: "Noise", color: "#3b82f6" },
];

export const SCORING_WEIGHTS: readonly WeightDisplay[] = WEIGHT_META.map((m) => ({
  ...m,
  pct: Math.round(DEFAULT_WEIGHTS[m.key] * 100),
}));
