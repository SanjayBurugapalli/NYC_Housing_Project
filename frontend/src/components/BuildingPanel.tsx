"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchBuildingDetail, searchByOwner, searchByManager, trackEvent } from "@/lib/api";
import type { ViolationRecord, ComplaintRecord, FDNYViolationRecord, EvictionRecord } from "@/types/building";
import { useStore } from "@/lib/store";
import { ScoreBreakdown } from "@/components/ScoreBreakdown";
import { getBuildingClassLabel } from "@/lib/buildingClasses";

// StreetEasy uses full street-suffix names in building URLs (e.g. "avenue" not "ave").
// PLUTO data may store abbreviated forms, so expand the trailing suffix to match.
const STREET_SUFFIX_EXPANSIONS: Record<string, string> = {
  ave: "avenue", blvd: "boulevard", st: "street", dr: "drive",
  rd: "road", ln: "lane", ct: "court", pl: "place", ter: "terrace",
  pkwy: "parkway", pky: "parkway", hwy: "highway", cir: "circle",
};

function addressToSlug(address: string, queensStyle: boolean): string {
  const spaceIdx = address.indexOf(" ");
  const houseNum = spaceIdx >= 0 ? address.slice(0, spaceIdx) : address;
  const streetPart = spaceIdx >= 0 ? address.slice(spaceIdx + 1) : "";

  const houseSlug = queensStyle
    ? houseNum.toLowerCase().replace(/-/g, "_").replace(/[^a-z0-9_]/g, "")
    : houseNum.toLowerCase().replace(/[^a-z0-9-]/g, "");

  let street = streetPart
    .toLowerCase()
    .replace(/(\d+)(?:st|nd|rd|th)\b/g, "$1"); // strip ordinal suffixes

  // Expand abbreviated suffix (last word only, to avoid "ST" → "STREET" in "ST NICHOLAS")
  const words = street.trim().split(/\s+/);
  if (words.length > 0) {
    const last = words[words.length - 1];
    if (STREET_SUFFIX_EXPANSIONS[last]) {
      words[words.length - 1] = STREET_SUFFIX_EXPANSIONS[last];
    }
    street = words.join(" ");
  }

  const streetSlug = street
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, "-");

  return streetPart ? `${houseSlug}-${streetSlug}` : houseSlug;
}

function buildStreetEasyUrl(address: string, borough: string, subNeighborhood?: string | null): string {
  const boroughMap: Record<string, string> = {
    MANHATTAN: "new_york",
    BROOKLYN: "brooklyn",
    BRONX: "bronx",
    "STATEN ISLAND": "staten_island",
  };

  const isQueens = borough.toUpperCase() === "QUEENS";

  if (isQueens) {
    if (!subNeighborhood) {
      const query = encodeURIComponent(`${address}, Queens, NY`);
      return `https://streeteasy.com/search?query=${query}`;
    }
    const neighborhoodSlug = subNeighborhood
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/_+$/g, "");
    const addressSlug = addressToSlug(address, true);
    return `https://streeteasy.com/building/${addressSlug}-${neighborhoodSlug}`;
  }

  const area = boroughMap[borough.toUpperCase()];
  if (area) {
    const addressSlug = addressToSlug(address, false);
    return `https://streeteasy.com/building/${addressSlug}-${area}`;
  }

  const query = encodeURIComponent(`${address}, ${borough}, NY`);
  return `https://streeteasy.com/search?query=${query}`;
}

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

function SkeletonRow() {
  return <div className="h-4 rounded bg-gray-700/60 animate-pulse" />;
}

function PanelSkeleton() {
  return (
    <div className="space-y-6 p-4">
      {/* Address block */}
      <div className="space-y-2">
        <div className="h-3 w-24 rounded bg-gray-700/60 animate-pulse" />
        <div className="h-6 w-3/4 rounded bg-gray-700/60 animate-pulse" />
        <div className="h-3 w-1/2 rounded bg-gray-700/60 animate-pulse" />
        <div className="mt-3 h-12 w-16 rounded bg-gray-700/60 animate-pulse" />
      </div>
      {/* Info grid */}
      <div className="grid grid-cols-2 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded bg-gray-700/50 p-2 space-y-1">
            <div className="h-3 w-12 rounded bg-gray-600/60 animate-pulse" />
            <div className="h-4 w-16 rounded bg-gray-600/60 animate-pulse" />
          </div>
        ))}
      </div>
      {/* Score bars */}
      <div className="space-y-3">
        <div className="h-4 w-32 rounded bg-gray-700/60 animate-pulse" />
        {[...Array(5)].map((_, i) => (
          <div key={i} className="space-y-1">
            <div className="flex justify-between">
              <div className="h-3 w-28 rounded bg-gray-700/60 animate-pulse" />
              <div className="h-3 w-12 rounded bg-gray-700/60 animate-pulse" />
            </div>
            <div className="h-2 rounded-full bg-gray-700 overflow-hidden">
              <div className="h-full rounded-full bg-gray-600/60 animate-pulse" style={{ width: `${40 + i * 12}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
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

  // Move focus to close button when panel opens
  useEffect(() => {
    closeButtonRef.current?.focus();
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
              {/* StreetEasy link */}
              <a
                href={buildStreetEasyUrl(data.address, data.borough, data.sub_neighborhood)}
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
                {data.rent_status === "likely_stabilized" && (
                  <p className="font-medium text-xs leading-snug text-teal-400">Rent Stabilized</p>
                )}
                {data.rent_status === "condo" && (
                  <p className="font-medium text-xs leading-snug text-blue-400">Condo</p>
                )}
                {data.rent_status === "coop" && (
                  <p className="font-medium text-xs leading-snug text-purple-400">Co-op</p>
                )}
                {data.rent_status === "not_regulated" && (
                  <p className="font-medium text-xs leading-snug text-gray-300">Not Regulated</p>
                )}
                {data.rent_status === "unknown" && (
                  <p className="font-medium text-xs leading-snug text-gray-500">—</p>
                )}
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

/* ------------------------------------------------------------------ */
/*  FDNY Violations List                                               */
/* ------------------------------------------------------------------ */

function FDNYViolationsList({ violations }: { violations: FDNYViolationRecord[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div>
      <h4 className="mb-2 font-semibold">
        FDNY Violations ({violations.length})
      </h4>
      <div className="space-y-2">
        {violations.map((v) => {
          const isExpanded = expandedId === v.id;
          const isOpen = v.status?.toUpperCase() === "OPEN";
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => setExpandedId(isExpanded ? null : v.id)}
              className="w-full rounded border border-gray-700 p-2 text-sm text-left hover:border-gray-500 transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className={isOpen ? "text-red-400" : "text-gray-400"}>
                  {v.violation_type || "FDNY Violation"}
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
                    {v.violation_number && (
                      <><span className="text-gray-500">Violation #</span><span>{v.violation_number}</span></>
                    )}
                    {v.status && (
                      <><span className="text-gray-500">Status</span>
                      <span className={isOpen ? "text-red-400" : "text-gray-400"}>{v.status}</span></>
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
/*  Evictions List                                                      */
/* ------------------------------------------------------------------ */

function EvictionsList({ evictions }: { evictions: EvictionRecord[] }) {
  return (
    <div>
      <h4 className="mb-2 font-semibold text-red-400">
        Evictions ({evictions.length})
      </h4>
      <div className="space-y-2">
        {evictions.map((e) => (
          <div
            key={e.id}
            className="rounded border border-red-900/50 bg-red-950/20 p-2 text-sm"
          >
            <div className="flex items-center justify-between">
              <span className="text-red-300">
                {e.eviction_type || "Eviction"}
                {e.apartment_no ? ` · Apt ${e.apartment_no}` : ""}
              </span>
              <span className="text-gray-500">{e.executed_date}</span>
            </div>
            {e.respondent && (
              <p className="mt-1 text-gray-400 text-xs">Respondent: {e.respondent}</p>
            )}
            {e.marshal_name && (
              <p className="text-gray-500 text-xs">Marshal: {e.marshal_name}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Expandable Violations List                                          */
/* ------------------------------------------------------------------ */

const VIOLATIONS_PAGE = 20;

function ViolationsList({ violations }: { violations: ViolationRecord[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const visible = showAll ? violations : violations.slice(0, VIOLATIONS_PAGE);
  const hasMore = violations.length > VIOLATIONS_PAGE;

  return (
    <div>
      <h4 className="mb-2 font-semibold">
        Recent Violations ({violations.length})
      </h4>
      <div className="space-y-2">
        {visible.map((v) => {
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
      {hasMore && !showAll && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-2 w-full rounded border border-gray-600 py-1.5 text-xs text-gray-400 hover:border-gray-400 hover:text-gray-200 transition-colors"
        >
          Show all {violations.length} violations
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Expandable Complaints List                                          */
/* ------------------------------------------------------------------ */

const COMPLAINTS_PAGE = 20;

function ComplaintsList({ complaints }: { complaints: ComplaintRecord[] }) {
  const [showAll, setShowAll] = useState(false);

  const visible = showAll ? complaints : complaints.slice(0, COMPLAINTS_PAGE);
  const hasMore = complaints.length > COMPLAINTS_PAGE;

  return (
    <div>
      <h4 className="mb-2 font-semibold">
        Recent Complaints ({complaints.length})
      </h4>
      <div className="space-y-2">
        {visible.map((c) => (
          <div
            key={c.id}
            className="rounded border border-gray-700 p-2 text-sm"
          >
            <div className="flex items-center justify-between">
              <span className="text-blue-400">{c.type}</span>
              <span className="text-gray-500">{c.date}</span>
            </div>
            {c.description && (
              <p className="mt-1 text-gray-300 line-clamp-2">{c.description}</p>
            )}
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
              {c.source && <span>{c.source}</span>}
              {c.category && <span className="capitalize">{c.category}</span>}
              {c.status && (
                <span className={c.status === "Closed" ? "text-gray-500" : "text-yellow-400"}>
                  {c.status}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      {hasMore && !showAll && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-2 w-full rounded border border-gray-600 py-1.5 text-xs text-gray-400 hover:border-gray-400 hover:text-gray-200 transition-colors"
        >
          Show all {complaints.length} complaints
        </button>
      )}
    </div>
  );
}
