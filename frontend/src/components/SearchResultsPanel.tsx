"use client";

import { useStore } from "@/lib/store";
import type { BuildingSummary } from "@/types/building";

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

interface SearchResultsPanelProps {
  clarification?: string | null;
}

export function SearchResultsPanel({ clarification }: SearchResultsPanelProps) {
  const searchResults = useStore((s) => s.searchResults);
  const gradeFilter = useStore((s) => s.gradeFilter);
  const selectBuilding = useStore((s) => s.selectBuilding);
  const clearSearch = useStore((s) => s.clearSearch);
  const mapRef = useStore((s) => s.mapRef);

  const visibleResults = gradeFilter.length > 0
    ? searchResults.filter((b) => gradeFilter.includes(b.grade ?? ""))
    : searchResults;

  const handleSelect = (building: BuildingSummary) => {
    selectBuilding(building.bbl);
    // Fly to building location
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
          <p className="text-xs text-gray-400">{visibleResults.length} building{visibleResults.length !== 1 ? "s" : ""}{gradeFilter.length > 0 ? ` (filtered)` : ""}</p>
        </div>
        <button
          onClick={clearSearch}
          className="rounded p-1 text-gray-400 hover:bg-gray-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Clear search results"
          title="Clear results"
        >
          ✕
        </button>
      </div>

      {/* Clarification banner */}
      {clarification && (
        <div className="border-b border-blue-900/50 bg-blue-900/30 px-4 py-2 text-xs text-blue-300">
          {clarification}
        </div>
      )}

      {/* Results list */}
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
              <div className={`shrink-0 rounded border px-2 py-0.5 text-sm font-bold ${gradeBg(b.grade)} ${gradeColor(b.grade)}`}>
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
    </div>
  );
}
