"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchBuildingDetail } from "@/lib/api";
import { useStore } from "@/lib/store";
import { ScoreBreakdown } from "@/components/ScoreBreakdown";

function gradeColor(grade: string): string {
  if (grade === "A") return "text-score-excellent";
  if (grade === "B") return "text-score-good";
  if (grade === "C") return "text-score-fair";
  if (grade === "D") return "text-score-poor";
  return "text-score-critical";
}

export function BuildingPanel({ bbl }: { bbl: string }) {
  const selectBuilding = useStore((s) => s.selectBuilding);

  const { data, isLoading, error } = useQuery({
    queryKey: ["building", bbl],
    queryFn: () => fetchBuildingDetail(bbl),
  });

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-gray-800/95 backdrop-blur-sm shadow-xl border-l border-gray-700">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-700 bg-gray-800 px-4 py-3">
        <h2 className="text-lg font-semibold">Building Detail</h2>
        <button
          onClick={() => selectBuilding(null)}
          className="rounded p-1 text-gray-400 hover:bg-gray-700 hover:text-white"
        >
          ✕
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 p-4">
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          </div>
        )}

        {error && (
          <div className="rounded bg-red-900/50 p-3 text-sm text-red-300">
            Failed to load building data.
          </div>
        )}

        {data && (
          <div className="space-y-6">
            {/* Address & Score */}
            <div>
              <p className="text-sm text-gray-400">BBL: {data.bbl}</p>
              <h3 className="text-xl font-bold">{data.address}</h3>
              <p className="text-sm text-gray-400">
                {data.borough} · {data.neighborhood}
              </p>
              {data.owner_name && (
                <p className="mt-1 text-sm text-gray-400">
                  Owner: <span className="text-gray-200">{data.owner_name}</span>
                </p>
              )}
              <div className="mt-3 flex items-baseline gap-3">
                <span
                  className={`text-5xl font-bold ${gradeColor(data.grade)}`}
                >
                  {data.grade}
                </span>
                <span className="text-sm text-gray-400">Health Grade</span>
              </div>
            </div>

            {/* Building Info */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded bg-gray-700/50 p-2">
                <p className="text-gray-400">Units</p>
                <p className="font-medium">{data.residential_units}</p>
              </div>
              <div className="rounded bg-gray-700/50 p-2">
                <p className="text-gray-400">Year Built</p>
                <p className="font-medium">{data.year_built}</p>
              </div>
              <div className="rounded bg-gray-700/50 p-2">
                <p className="text-gray-400">Class</p>
                <p className="font-medium">{data.building_class}</p>
              </div>
              <div className="rounded bg-gray-700/50 p-2">
                <p className="text-gray-400">Litigations</p>
                <p className="font-medium">{data.litigation_count}</p>
              </div>
            </div>

            {/* Score Breakdown */}
            {data.score_breakdown && (
              <ScoreBreakdown breakdown={data.score_breakdown} />
            )}

            {/* Recent Violations */}
            {data.violations && data.violations.length > 0 && (
              <div>
                <h4 className="mb-2 font-semibold">
                  Recent Violations ({data.violations.length})
                </h4>
                <div className="space-y-2">
                  {data.violations.slice(0, 10).map((v) => (
                    <div
                      key={v.id}
                      className="rounded border border-gray-700 p-2 text-sm"
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={
                            v.severity === "C"
                              ? "text-red-400"
                              : v.severity === "B"
                                ? "text-yellow-400"
                                : "text-gray-400"
                          }
                        >
                          Class {v.severity}
                        </span>
                        <span className="text-gray-500">{v.date}</span>
                      </div>
                      <p className="mt-1 text-gray-300">{v.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Complaints */}
            {data.complaints && data.complaints.length > 0 && (
              <div>
                <h4 className="mb-2 font-semibold">
                  Recent Complaints ({data.complaints.length})
                </h4>
                <div className="space-y-2">
                  {data.complaints.slice(0, 10).map((c) => (
                    <div
                      key={c.id}
                      className="rounded border border-gray-700 p-2 text-sm"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-blue-400">{c.type}</span>
                        <span className="text-gray-500">{c.date}</span>
                      </div>
                      <p className="mt-1 text-gray-300">{c.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Litigations */}
            {data.litigations && data.litigations.length > 0 && (
              <div>
                <h4 className="mb-2 font-semibold">
                  Litigations ({data.litigations.length})
                </h4>
                <div className="space-y-2">
                  {data.litigations.map((l) => (
                    <div
                      key={l.id}
                      className="rounded border border-gray-700 p-2 text-sm"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-purple-400">{l.case_type}</span>
                        <span className="text-gray-500">{l.date}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between">
                        <span className={
                          l.status === "CLOSED" ? "text-gray-500" : "text-yellow-400"
                        }>
                          {l.status}
                        </span>
                        {l.judgment && (
                          <span className="text-gray-400 text-xs">{l.judgment}</span>
                        )}
                      </div>
                      {l.respondent && (
                        <p className="mt-1 text-gray-400 text-xs">
                          Respondent: {l.respondent}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Rodent Inspections */}
            {data.rodent_inspections && data.rodent_inspections.length > 0 && (
              <div>
                <h4 className="mb-2 font-semibold">
                  Rodent Inspections ({data.rodent_inspections.length})
                </h4>
                <div className="space-y-2">
                  {data.rodent_inspections.map((r) => (
                    <div
                      key={r.id}
                      className="rounded border border-gray-700 p-2 text-sm"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-orange-400">{r.type}</span>
                        <span className="text-gray-500">{r.date}</span>
                      </div>
                      <p className={`mt-1 ${
                        r.result?.toLowerCase().includes("active")
                          ? "text-red-400"
                          : "text-gray-300"
                      }`}>
                        {r.result}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
