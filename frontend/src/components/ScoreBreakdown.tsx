"use client";

import type { ScoreBreakdown as ScoreBreakdownType } from "@/types/building";

const CATEGORIES = [
  { countKey: "heat_hot_water_count", label: "Heat & Hot Water", countLabel: "complaints" },
  { countKey: "pest_rodent_count", label: "Pest & Rodent", countLabel: "reports" },
  { countKey: "structural_safety_count", label: "Structural Safety", countLabel: "violations" },
  { countKey: "hpd_severity_count", label: "HPD Violations", countLabel: "violations" },
  { countKey: "noise_count", label: "Noise", countLabel: "complaints" },
  { countKey: "litigation_count", label: "Litigation", countLabel: "cases" },
] as const;

function barColor(count: number): string {
  if (count === 0) return "bg-score-excellent";
  if (count <= 3) return "bg-score-good";
  if (count <= 10) return "bg-score-fair";
  if (count <= 25) return "bg-score-poor";
  return "bg-score-critical";
}

export function ScoreBreakdown({
  breakdown,
}: {
  breakdown: ScoreBreakdownType;
}) {
  return (
    <div>
      <h4 className="mb-3 font-semibold">Issue Breakdown</h4>
      <div className="space-y-2">
        {CATEGORIES.map(({ countKey, label, countLabel }) => {
          const count =
            (breakdown[countKey as keyof ScoreBreakdownType] as number) ?? 0;
          return (
            <div key={countKey}>
              <div className="flex justify-between text-sm">
                <span className="text-gray-300">{label}</span>
                <span className="font-medium">
                  {count} {countLabel}
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-700">
                <div
                  className={`h-full rounded-full ${barColor(count)}`}
                  style={{ width: "100%" }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
