"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import type { BuildingSummary } from "@/types/building";

function exportCsv(results: BuildingSummary[]) {
  const headers = ["BBL", "Address", "Borough", "Grade", "Score", "Units", "Year Built", "Latitude", "Longitude"];
  const rows = results.map((b) => [
    b.bbl,
    `"${(b.address ?? "").replace(/"/g, '""')}"`,
    b.borough ?? "",
    b.grade ?? "",
    b.health_score ?? "",
    b.residential_units ?? "",
    b.year_built ?? "",
    b.latitude ?? "",
    b.longitude ?? "",
  ]);
  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "nyc_building_search.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function gradeColor(grade: string): string {
  if (grade === "A") return "text-score-excellent";
  if (grade === "B") return "text-score-good";
  if (grade === "C") return "text-score-fair";
  if (grade === "D") return "text-score-poor";
  return "text-score-critical";
}

function gradeBg(grade: string): string {
  if (grade === "A") return "border-green-700 bg-green-950/40";
  if (grade === "B") return "border-lime-700 bg-lime-950/40";
  if (grade === "C") return "border-yellow-700 bg-yellow-950/40";
  if (grade === "D") return "border-orange-700 bg-orange-950/40";
  return "border-red-700 bg-red-950/40";
}

const GRADE_ORDER: Record<string, number> = { A: 0, B: 1, C: 2, D: 3, F: 4 };

type SortKey = "score_desc" | "score_asc" | "grade_asc" | "grade_desc";

function sortResults(results: BuildingSummary[], sort: SortKey): BuildingSummary[] {
  return [...results].sort((a, b) => {
    if (sort === "score_desc") return (b.health_score ?? 0) - (a.health_score ?? 0);
    if (sort === "score_asc")  return (a.health_score ?? 0) - (b.health_score ?? 0);
    if (sort === "grade_asc")  return (GRADE_ORDER[a.grade ?? "F"] ?? 4) - (GRADE_ORDER[b.grade ?? "F"] ?? 4);
    if (sort === "grade_desc") return (GRADE_ORDER[b.grade ?? "F"] ?? 4) - (GRADE_ORDER[a.grade ?? "F"] ?? 4);
    return 0;
  });
}

interface SearchResultsPanelProps {
  clarification?: string | null;
}

export function SearchResultsPanel({ clarification }: SearchResultsPanelProps) {
  const searchResults = useStore((s) => s.searchResults);
  const gradeFilter = useStore((s) => s.gradeFilter);
  const isSearching = useStore((s) => s.isSearching);
  const selectBuilding = useStore((s) => s.selectBuilding);
  const clearSearch = useStore((s) => s.clearSearch);
  const mapRef = useStore((s) => s.mapRef);

  const [sortKey, setSortKey] = useState<SortKey>("score_desc");

  const filtered = gradeFilter.length > 0
    ? searchResults.filter((b) => gradeFilter.includes(b.grade ?? ""))
    : searchResults;

  const visibleResults = sortResults(filtered, sortKey);

  const handleSelect = (building: BuildingSummary) => {
    selectBuilding(building.bbl);
    if (mapRef && building.latitude != null && building.longitude != null) {
      mapRef.flyTo({
        center: [building.longitude, building.latitude],
        zoom: Math.max(mapRef.getZoom(), 15),
        duration: 800,
      });
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-gray-800/95 backdrop-blur-sm shadow-xl border-l border-gray-700">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-700 bg-gray-800 px-4 py-3">
        <div>
          <h2 className="text-lg font-semibold">Search Results</h2>
          <p className="text-xs text-gray-400">
            {isSearching
              ? "Searching…"
              : `${visibleResults.length} building${visibleResults.length !== 1 ? "s" : ""}${gradeFilter.length > 0 ? " (filtered)" : ""}`}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {/* Sort dropdown */}
          {searchResults.length > 1 && !isSearching && (
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="rounded border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-gray-300 focus:border-blue-500 focus:outline-none"
              aria-label="Sort results"
            >
              <option value="score_desc">Score: High → Low</option>
              <option value="score_asc">Score: Low → High</option>
              <option value="grade_asc">Grade: A → F</option>
              <option value="grade_desc">Grade: F → A</option>
            </select>
          )}
          {searchResults.length > 0 && !isSearching && (
            <button
              onClick={() => exportCsv(searchResults)}
              className="rounded px-2 py-1 text-xs text-gray-400 hover:bg-gray-700 hover:text-white focus:outline-none"
              aria-label="Export results as CSV"
              title="Download CSV"
            >
              CSV
            </button>
          )}
          <button
            onClick={clearSearch}
            className="rounded p-1 text-gray-400 hover:bg-gray-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Clear search results"
            title="Clear results"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Clarification banner */}
      {clarification && !isSearching && (
        <div className="border-b border-blue-900/50 bg-blue-900/30 px-4 py-2 text-xs text-blue-300">
          {clarification}
        </div>
      )}

      {/* Loading skeleton */}
      {isSearching && (
        <div className="flex-1 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="border-b border-gray-700 px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-3/4 animate-pulse rounded bg-gray-700" />
                  <div className="h-2.5 w-1/2 animate-pulse rounded bg-gray-700/70" />
                </div>
                <div className="h-7 w-8 animate-pulse rounded bg-gray-700" />
              </div>
              <div className="mt-2 h-1.5 w-full animate-pulse rounded-full bg-gray-700/50" />
            </div>
          ))}
        </div>
      )}

      {/* Results list */}
      {!isSearching && (
        <div className="flex-1 overflow-y-auto">
          {visibleResults.map((b) => (
            <button
              key={b.bbl}
              type="button"
              onClick={() => handleSelect(b)}
              className="w-full border-b border-gray-700 px-4 py-3 text-left hover:bg-gray-700/50 transition-colors focus:outline-none focus:bg-gray-700/50"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-sm text-white">{b.address}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {b.borough}
                    {b.residential_units ? ` · ${b.residential_units} units` : ""}
                    {b.year_built ? ` · Built ${b.year_built}` : ""}
                  </p>
                </div>
                <div className={`shrink-0 rounded border px-2 py-0.5 text-sm font-bold ${gradeBg(b.grade ?? "F")} ${gradeColor(b.grade ?? "F")}`}>
                  {b.grade}
                </div>
              </div>
              {b.health_score != null && (
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-700">
                  <div
                    className={`h-full rounded-full ${
                      b.grade === "A" ? "bg-score-excellent" :
                      b.grade === "B" ? "bg-score-good" :
                      b.grade === "C" ? "bg-score-fair" :
                      b.grade === "D" ? "bg-score-poor" : "bg-score-critical"
                    }`}
                    style={{ width: `${b.health_score}%` }}
                  />
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
