"use client";

import { useState } from "react";
import type { ScoreBreakdown as ScoreBreakdownType } from "@/types/building";
import { useStore, DEFAULT_WEIGHTS, type CategoryWeights } from "@/lib/store";

const CATEGORIES: {
  key: keyof CategoryWeights;
  scoreKey: keyof ScoreBreakdownType;
  countKey: keyof ScoreBreakdownType;
  label: string;
  countLabel: string;
}[] = [
  { key: "heat_hot_water", scoreKey: "heat_hot_water", countKey: "heat_hot_water_count", label: "Heat & Hot Water", countLabel: "complaints" },
  { key: "pest_rodent", scoreKey: "pest_rodent", countKey: "pest_rodent_count", label: "Pest & Rodent", countLabel: "reports" },
  { key: "structural_safety", scoreKey: "structural_safety", countKey: "structural_safety_count", label: "Structural Safety", countLabel: "violations" },
  { key: "hpd_severity", scoreKey: "hpd_severity", countKey: "hpd_severity_count", label: "HPD Violations", countLabel: "violations" },
  { key: "noise", scoreKey: "noise", countKey: "noise_count", label: "Noise", countLabel: "complaints" },
  { key: "litigation", scoreKey: "litigation", countKey: "litigation_count", label: "Litigation", countLabel: "cases" },
];

function scoreBarColor(score: number): string {
  if (score >= 97) return "bg-score-excellent";
  if (score >= 90) return "bg-score-good";
  if (score >= 75) return "bg-score-fair";
  if (score >= 55) return "bg-score-poor";
  return "bg-score-critical";
}

function computeCustomScore(breakdown: ScoreBreakdownType, weights: CategoryWeights): number {
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  if (totalWeight === 0) return 0;
  let score = 0;
  for (const cat of CATEGORIES) {
    const subScore = (breakdown[cat.scoreKey] as number) ?? 100;
    score += subScore * (weights[cat.key] / totalWeight);
  }
  return Math.round(score * 100) / 100;
}

function customGrade(score: number): string {
  if (score >= 97) return "A";
  if (score >= 90) return "B";
  if (score >= 75) return "C";
  if (score >= 55) return "D";
  return "F";
}

export function ScoreBreakdown({
  breakdown,
}: {
  breakdown: ScoreBreakdownType;
}) {
  const [showWeights, setShowWeights] = useState(false);
  const {
    customWeights,
    useCustomWeights,
    setCustomWeight,
    setUseCustomWeights,
    resetWeights,
  } = useStore();

  const weights = useCustomWeights ? customWeights : DEFAULT_WEIGHTS;
  const customScore = useCustomWeights ? computeCustomScore(breakdown, customWeights) : null;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h4 className="font-semibold">Issue Breakdown</h4>
        <button
          type="button"
          onClick={() => setShowWeights(!showWeights)}
          className="text-xs text-blue-400 hover:text-blue-300"
        >
          {showWeights ? "Hide weights" : "Customize weights"}
        </button>
      </div>

      {showWeights && (
        <div className="mb-4 rounded border border-gray-700 bg-gray-900/50 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs text-gray-300">
              <input
                type="checkbox"
                checked={useCustomWeights}
                onChange={(e) => setUseCustomWeights(e.target.checked)}
                className="rounded"
              />
              Use custom weights
            </label>
            {useCustomWeights && (
              <button
                type="button"
                onClick={resetWeights}
                className="text-xs text-gray-400 hover:text-white"
              >
                Reset
              </button>
            )}
          </div>

          {useCustomWeights && (
            <>
              {CATEGORIES.map(({ key, label }) => {
                const pct = Math.round(customWeights[key] * 100);
                return (
                  <div key={key} className="space-y-0.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-400">{label}</span>
                      <span className="text-gray-300 font-medium">{pct}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="50"
                      value={pct}
                      onChange={(e) => setCustomWeight(key, parseInt(e.target.value) / 100)}
                      className="w-full h-1.5 appearance-none rounded-full bg-gray-700 accent-blue-500 cursor-pointer"
                    />
                  </div>
                );
              })}

              <div className="flex justify-between text-xs border-t border-gray-700 pt-2">
                <span className="text-gray-400">Total</span>
                <span className={`font-medium ${
                  Math.abs(Object.values(customWeights).reduce((a, b) => a + b, 0) - 1) < 0.02
                    ? "text-green-400"
                    : "text-yellow-400"
                }`}>
                  {Math.round(Object.values(customWeights).reduce((a, b) => a + b, 0) * 100)}%
                </span>
              </div>

              {customScore !== null && (
                <div className="text-xs text-gray-300 border-t border-gray-700 pt-2">
                  Custom score: <span className="font-semibold text-white">{customScore}</span>
                  {" "}({customGrade(customScore)})
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div className="space-y-2">
        {CATEGORIES.map(({ key, scoreKey, countKey, label, countLabel }) => {
          const count =
            (breakdown[countKey as keyof ScoreBreakdownType] as number) ?? 0;
          const subScore =
            (breakdown[scoreKey as keyof ScoreBreakdownType] as number) ?? 100;
          const weight = weights[key];
          const isLitigation = key === "litigation";
          return (
            <div key={countKey}>
              <div className="flex justify-between text-sm">
                <span className="text-gray-300 flex items-center gap-1">
                  {label}
                  {useCustomWeights && (
                    <span className="ml-1 text-xs text-gray-500">
                      {Math.round(weight * 100)}%
                    </span>
                  )}
                  {isLitigation && (
                    <span
                      className="cursor-help text-gray-500 text-xs"
                      title="The score bar reflects the stored all-time litigation history. The case count shown here covers only the last 5 years displayed in the panel below."
                    >
                      (?)
                    </span>
                  )}
                </span>
                <span className="font-medium">
                  {count} {countLabel}
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-700">
                <div
                  className={`h-full rounded-full transition-all ${scoreBarColor(subScore)}`}
                  style={{ width: `${subScore}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
