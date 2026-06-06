"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchBuildingDetail, searchByOwner, searchByManager, trackEvent } from "@/lib/api";
import type { BuildingDetail } from "@/types/building";
import { useStore } from "@/lib/store";
import { ScoreBreakdown } from "@/components/ScoreBreakdown";
import { getBuildingClassLabel } from "@/lib/buildingClasses";
import { buildStreetEasyUrl } from "@/components/building/streetEasy";
import { PanelSkeleton } from "@/components/building/PanelSkeleton";
import { FDNYViolationsList } from "@/components/building/FDNYViolationsList";
import { EvictionsList } from "@/components/building/EvictionsList";
import { ViolationsList } from "@/components/building/ViolationsList";
import { ComplaintsList } from "@/components/building/ComplaintsList";

// Display label + text color for each rent-regulation status (exhaustive over
// the BuildingDetail["rent_status"] union).
const RENT_STATUS_DISPLAY: Record<
  BuildingDetail["rent_status"],
  { label: string; className: string }
> = {
  likely_stabilized: { label: "Rent Stabilized", className: "text-teal-400" },
  condo: { label: "Condo", className: "text-blue-400" },
  coop: { label: "Co-op", className: "text-purple-400" },
  not_regulated: { label: "Not Regulated", className: "text-gray-300" },
  unknown: { label: "—", className: "text-gray-500" },
};

function CopyLinkButton({ bbl }: { bbl: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    const url = `${window.location.origin}/map?bbl=${bbl}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button
      onClick={copy}
      className="rounded p-1 text-gray-400 hover:bg-gray-700 hover:text-white focus:outline-none transition-colors"
      aria-label="Copy shareable link"
      title="Copy link to this building"
    >
      {copied ? "✓" : "🔗"}
    </button>
  );
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
  const setSearchResults = useStore((s) => s.setSearchResults);
  const setSearchClarification = useStore((s) => s.setSearchClarification);
  const hasSearchResults = useStore((s) => s.searchResults.length > 0);
  const mapRef = useStore((s) => s.mapRef);
  const compareBbls = useStore((s) => s.compareBbls);
  const addToCompare = useStore((s) => s.addToCompare);
  const removeFromCompare = useStore((s) => s.removeFromCompare);
  const isInCompare = compareBbls.includes(bbl);
  const canCompare = !isInCompare && compareBbls.length < 2;
  const [entitySearching, setEntitySearching] = useState<"owner" | "manager" | null>(null);

  async function handleEntitySearch(type: "owner" | "manager", name: string) {
    setEntitySearching(type);
    try {
      const result = type === "owner" ? await searchByOwner(name) : await searchByManager(name);
      setSearchResults(result.results);
      setSearchClarification(result.clarification ?? null);
      selectBuilding(null);
    } catch {
      // silently fail — building panel stays open
    } finally {
      setEntitySearching(null);
    }
  }
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Move focus to close button when panel opens.
  // preventScroll: true — the panel mounts mid-slide-in (translateX(100%)),
  // so the close button is briefly off-screen right; without this the browser
  // scrolls the document horizontally to reach it, shifting the page left
  // until the animation completes.
  useEffect(() => {
    closeButtonRef.current?.focus({ preventScroll: true });
  }, [bbl]);

  // Escape key to close panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") selectBuilding(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectBuilding]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["building", bbl],
    queryFn: () => fetchBuildingDetail(bbl),
    retry: 1,
  });

  useEffect(() => {
    if (!data) return;
    trackEvent("building_view", { bbl, address: data.address, grade: data.grade });
  }, [bbl, data]);

  return (
    <div
      className="flex h-full flex-col overflow-y-auto bg-gray-800/95 backdrop-blur-sm shadow-xl border-l border-gray-700 pb-20"
      role="dialog"
      aria-modal="true"
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
          {(canCompare || isInCompare) && (
            <button
              onClick={() => isInCompare ? removeFromCompare(bbl) : addToCompare(bbl)}
              className={`rounded px-2 py-1 text-xs focus:outline-none transition-colors ${
                isInCompare
                  ? "bg-blue-900/40 text-blue-300 hover:bg-blue-900/60"
                  : "text-gray-400 hover:bg-gray-700 hover:text-white"
              }`}
              title={isInCompare ? "Remove from comparison" : "Add to comparison"}
            >
              {isInCompare ? "✓ Comparing" : "+ Compare"}
            </button>
          )}
          <CopyLinkButton bbl={bbl} />
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
            ref={closeButtonRef}
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
      <div className="flex-1">
        {isLoading && <PanelSkeleton />}

        {error && (
          <div className="m-4 rounded bg-red-900/50 p-3 text-sm text-red-300 space-y-2">
            <p>Failed to load building data.</p>
            <button
              onClick={() => refetch()}
              className="rounded bg-red-800 px-3 py-1 text-xs font-medium text-red-200 hover:bg-red-700 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {data && (
          <div className="space-y-6 p-4">
            {/* Address & Score */}
            <div>
              <p className="text-sm text-gray-400">BBL: {data.bbl}</p>
              <h3 className="text-xl font-bold">{data.address}</h3>
              <p className="text-sm text-gray-400">
                {data.borough} · {data.nta_name || data.neighborhood}
              </p>
              {data.owner_name && (
                <p className="mt-1 text-sm text-gray-400">
                  Owner:{" "}
                  <button
                    onClick={() => handleEntitySearch("owner", data.owner_name!)}
                    disabled={entitySearching !== null}
                    className="text-gray-200 hover:text-blue-400 hover:underline transition-colors disabled:opacity-50 text-left"
                    title="See all buildings by this owner"
                  >
                    {data.owner_name}
                    {entitySearching === "owner" ? " …" : " ↗"}
                  </button>
                </p>
              )}
              {data.managing_agent && (
                <p className="mt-0.5 text-sm text-gray-400">
                  Managing Agent:{" "}
                  <button
                    onClick={() => handleEntitySearch("manager", data.managing_agent!)}
                    disabled={entitySearching !== null}
                    className="text-gray-200 hover:text-blue-400 hover:underline transition-colors disabled:opacity-50 text-left"
                    title="See all buildings by this manager"
                  >
                    {data.managing_agent}
                    {entitySearching === "manager" ? " …" : " ↗"}
                  </button>
                </p>
              )}
              <div className="mt-3 flex items-baseline gap-3">
                <span className={`text-5xl font-bold ${gradeColor(data.grade)}`}>
                  {data.grade}
                </span>
                <span className="text-sm text-gray-400">Health Grade</span>
              </div>
              {/* StreetEasy link. Queens building URLs are keyed by neighborhood
                  (not borough), so feed nta_name through — without it the Queens
                  branch falls back to a /search?query= URL instead of a direct
                  /building/ link. */}
              <a
                href={buildStreetEasyUrl(data.address, data.borough, data.sub_neighborhood ?? data.nta_name)}
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
                <p className="font-medium">
                  {data.residential_units > 0 ? data.residential_units : "—"}
                </p>
              </div>
              <div className="rounded bg-gray-700/50 p-2">
                <p className="text-gray-400">Year Built</p>
                <p className="font-medium">
                  {data.year_built ? data.year_built : "—"}
                </p>
              </div>
              <div className="rounded bg-gray-700/50 p-2 col-span-2">
                <p className="text-gray-400">Class</p>
                <p className="font-medium text-xs leading-snug">
                  {data.building_class ? getBuildingClassLabel(data.building_class) : "—"}
                </p>
              </div>
              <div className="rounded bg-gray-700/50 p-2">
                <p className="text-gray-400">Litigations</p>
                <p className="font-medium">{data.litigation_count}</p>
              </div>
              <div className="rounded bg-gray-700/50 p-2">
                <p className="text-gray-400">Rent Status</p>
                {(() => {
                  const rs = RENT_STATUS_DISPLAY[data.rent_status] ?? RENT_STATUS_DISPLAY.unknown;
                  return (
                    <p className={`font-medium text-xs leading-snug ${rs.className}`}>{rs.label}</p>
                  );
                })()}
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

            {/* FDNY Violations */}
            {data.fdny_violations && data.fdny_violations.length > 0 && (
              <FDNYViolationsList violations={data.fdny_violations} />
            )}

            {/* Evictions */}
            {data.evictions && data.evictions.length > 0 && (
              <EvictionsList evictions={data.evictions} />
            )}

            {/* Report error */}
            <div className="border-t border-gray-700 pt-3 text-center">
              <a
                href={`https://github.com/SanjayBurugapalli/NYC_Housing_Project/issues/new?title=Data+issue+for+BBL+${bbl}&body=Building+BBL%3A+${bbl}%0A%0ADescribe+the+issue%3A`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                Report incorrect data ↗
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
