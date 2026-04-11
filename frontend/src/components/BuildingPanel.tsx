"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchBuildingDetail } from "@/lib/api";
import type { ViolationRecord, ComplaintRecord } from "@/types/building";
import { useStore } from "@/lib/store";
import { ScoreBreakdown } from "@/components/ScoreBreakdown";
import { getBuildingClassLabel } from "@/lib/buildingClasses";

function buildStreetEasyUrl(address: string, borough: string): string {
  // StreetEasy building URLs use specific area names:
  //   Manhattan → "new_york", Staten Island → "staten_island",
  //   Brooklyn/Bronx → lowercase as-is.
  //   Queens uses neighborhood names we can't predict, so fall back to search.
  const boroughMap: Record<string, string> = {
    MANHATTAN: "new_york",
    BROOKLYN: "brooklyn",
    BRONX: "bronx",
    "STATEN ISLAND": "staten_island",
  };

  const area = boroughMap[borough.toUpperCase()];
  if (area) {
    const slug = `${address}-${area}`
      .toLowerCase()
      // Strip ordinal suffixes (19th→19, 1st→1, 2nd→2, 3rd→3)
      .replace(/(\d+)(?:st|nd|rd|th)\b/g, "$1")
      .replace(/[^a-z0-9_\s-]/g, "")
      .replace(/\s+/g, "-");
    return `https://streeteasy.com/building/${slug}`;
  }

  // Queens: StreetEasy uses neighborhood names, so link to search
  const query = encodeURIComponent(`${address}, ${borough}, NY`);
  return `https://streeteasy.com/search?query=${query}`;
}

function gradeColor(grade: string): string {
  if (grade === "A") return "text-score-excellent";
  if (grade === "B") return "text-score-good";
  if (grade === "C") return "text-score-fair";
  if (grade === "D") return "text-score-poor";
  return "text-score-critical";
}

export function BuildingPanel({ bbl }: { bbl: string }) {
  const selectBuilding = useStore((s) => s.selectBuilding);
  const hasSearchResults = useStore((s) => s.searchResults.length > 0);
  const mapRef = useStore((s) => s.mapRef);

  // Escape key to close panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") selectBuilding(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectBuilding]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["building", bbl],
    queryFn: () => fetchBuildingDetail(bbl),
  });

  return (
    <div
      className="flex h-full flex-col overflow-y-auto bg-gray-800/95 backdrop-blur-sm shadow-xl border-l border-gray-700"
      role="dialog"
      aria-label="Building detail panel"
    >
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-700 bg-gray-800 px-4 py-3">
        <h2 className="text-lg font-semibold">Building Detail</h2>
        <div className="flex items-center gap-1">
          {hasSearchResults && (
            <button
              onClick={() => selectBuilding(null)}
              className="rounded px-2 py-1 text-xs text-blue-400 hover:bg-gray-700 hover:text-blue-300 focus:outline-none"
              aria-label="Back to search results"
            >
              ← Results
            </button>
          )}
          {data?.latitude != null && data?.longitude != null && (
            <button
              onClick={() => mapRef?.flyTo({ center: [data.longitude!, data.latitude!], zoom: Math.max(mapRef.getZoom(), 16), duration: 800 })}
              className="rounded p-1 text-gray-400 hover:bg-gray-700 hover:text-white focus:outline-none"
              aria-label="Center map on building"
              title="Center on map"
            >
              ◎
            </button>
          )}
          <button
            onClick={() => selectBuilding(null)}
            className="rounded p-1 text-gray-400 hover:bg-gray-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Close building detail panel"
            title="Close (Esc)"
          >
            ✕
          </button>
        </div>
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
              {/* StreetEasy link */}
              <a
                href={buildStreetEasyUrl(data.address, data.borough)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 rounded bg-gray-700 px-2.5 py-1 text-xs font-medium text-blue-400 hover:bg-gray-600 hover:text-blue-300 transition-colors"
              >
                View on StreetEasy ↗
              </a>
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
              <div className="rounded bg-gray-700/50 p-2 col-span-2">
                <p className="text-gray-400">Class</p>
                <p className="font-medium text-xs leading-snug">{getBuildingClassLabel(data.building_class)}</p>
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
              <ViolationsList violations={data.violations} />
            )}

            {/* Recent Complaints */}
            {data.complaints && data.complaints.length > 0 && (
              <ComplaintsList complaints={data.complaints} />
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

/* ------------------------------------------------------------------ */
/*  Expandable Violations List                                        */
/* ------------------------------------------------------------------ */

function ViolationsList({ violations }: { violations: ViolationRecord[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div>
      <h4 className="mb-2 font-semibold">
        Recent Violations ({violations.length})
      </h4>
      <div className="space-y-2">
        {violations.slice(0, 20).map((v) => {
          const isExpanded = expandedId === v.id;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => setExpandedId(isExpanded ? null : v.id)}
              className="w-full rounded border border-gray-700 p-2 text-sm text-left hover:border-gray-500 transition-colors"
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
                  {v.severity ? `Class ${v.severity}` : v.source}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">{v.date}</span>
                  <span className="text-gray-500 text-xs">{isExpanded ? "▲" : "▼"}</span>
                </div>
              </div>
              {v.description && (
                <p className={`mt-1 text-gray-300 ${isExpanded ? "" : "line-clamp-1"}`}>
                  {v.description}
                </p>
              )}

              {isExpanded && (
                <div className="mt-2 space-y-1 border-t border-gray-700 pt-2 text-xs text-gray-400">
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                    {v.source && (
                      <><span className="text-gray-500">Source</span><span>{v.source}</span></>
                    )}
                    {v.type && (
                      <><span className="text-gray-500">Type</span><span>{v.type}</span></>
                    )}
                    {v.status && (
                      <><span className="text-gray-500">Status</span><span>{v.status}</span></>
                    )}
                    {v.order_number && (
                      <><span className="text-gray-500">Order #</span><span>{v.order_number}</span></>
                    )}
                    {v.approved_date && (
                      <><span className="text-gray-500">Approved</span><span>{v.approved_date}</span></>
                    )}
                    {v.status_date && (
                      <><span className="text-gray-500">Status Date</span><span>{v.status_date}</span></>
                    )}
                    {v.certify_by_date && (
                      <><span className="text-gray-500">Certify By</span><span>{v.certify_by_date}</span></>
                    )}
                    {v.correct_by_date && (
                      <><span className="text-gray-500">Correct By</span><span className="text-yellow-400">{v.correct_by_date}</span></>
                    )}
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Expandable Complaints List                                        */
/* ------------------------------------------------------------------ */

function ComplaintsList({ complaints }: { complaints: ComplaintRecord[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div>
      <h4 className="mb-2 font-semibold">
        Recent Complaints ({complaints.length})
      </h4>
      <div className="space-y-2">
        {complaints.slice(0, 20).map((c) => {
          const isExpanded = expandedId === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setExpandedId(isExpanded ? null : c.id)}
              className="w-full rounded border border-gray-700 p-2 text-sm text-left hover:border-gray-500 transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="text-blue-400">{c.type}</span>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">{c.date}</span>
                  <span className="text-gray-500 text-xs">{isExpanded ? "▲" : "▼"}</span>
                </div>
              </div>
              {c.description && (
                <p className={`mt-1 text-gray-300 ${isExpanded ? "" : "line-clamp-1"}`}>
                  {c.description}
                </p>
              )}

              {isExpanded && (
                <div className="mt-2 space-y-1 border-t border-gray-700 pt-2 text-xs text-gray-400">
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                    {c.source && (
                      <><span className="text-gray-500">Source</span><span>{c.source}</span></>
                    )}
                    {c.descriptor && (
                      <><span className="text-gray-500">Descriptor</span><span>{c.descriptor}</span></>
                    )}
                    {c.category && (
                      <><span className="text-gray-500">Category</span><span className="capitalize">{c.category}</span></>
                    )}
                    {c.status && (
                      <><span className="text-gray-500">Status</span>
                      <span className={c.status === "Closed" ? "text-gray-500" : "text-yellow-400"}>
                        {c.status}
                      </span></>
                    )}
                    {c.closed_date && (
                      <><span className="text-gray-500">Closed</span><span>{c.closed_date}</span></>
                    )}
                    {c.resolution_days != null && (
                      <><span className="text-gray-500">Resolution</span><span>{c.resolution_days} days</span></>
                    )}
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
