"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { useSearchRunner } from "@/hooks/useSearchRunner";
import { distanceMeters, formatMiles } from "@/lib/geo";
import { titleCase } from "@/lib/grades";
import type { BuildingSummary, SearchFilters } from "@/types/building";
import { GradeTile } from "@/components/ui/GradeTile";
import { SearchBar } from "@/components/SearchBar";
import { CheckIcon, ChevronDownIcon, CloseIcon, DownloadIcon, LogoIcon, PlusIcon } from "@/components/ui/icons";

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
  a.download = "beforeyourent_search.csv";
  a.click();
  URL.revokeObjectURL(url);
}

const GRADE_ORDER: Record<string, number> = { A: 0, B: 1, C: 2, D: 3, F: 4 };

type SortKey = "best" | "worst";

function sortResults(results: BuildingSummary[], sort: SortKey): BuildingSummary[] {
  const dir = sort === "best" ? 1 : -1;
  return [...results].sort(
    (a, b) =>
      dir * ((GRADE_ORDER[a.grade ?? "F"] ?? 4) - (GRADE_ORDER[b.grade ?? "F"] ?? 4)) ||
      dir * ((b.health_score ?? 0) - (a.health_score ?? 0))
  );
}

// Quick filters offered under "Add a filter" (keys match validate_filters).
const ADDABLE: { label: string; filters: SearchFilters }[] = [
  { label: "Rent stabilized", filters: { rent_stabilized: true } },
  { label: "Grade B or better", filters: { min_score: 90 } },
  { label: "10+ units", filters: { min_units: 10 } },
  { label: "Built before 1940", filters: { max_year_built: 1939 } },
];

const PAGE = 20;

function ResultRow({ b }: { b: BuildingSummary }) {
  const selectBuilding = useStore((s) => s.selectBuilding);
  const setSelectedLocation = useStore((s) => s.setSelectedLocation);
  const workplace = useStore((s) => s.workplace);
  const compareBbls = useStore((s) => s.compareBbls);
  const addToCompare = useStore((s) => s.addToCompare);
  const removeFromCompare = useStore((s) => s.removeFromCompare);
  const inCompare = compareBbls.includes(b.bbl);
  const full = !inCompare && compareBbls.length >= 2;
  const address = titleCase(b.address);

  // Straight-line distance to work (the routed time lives on the building card —
  // timing every result would hammer the free transit router).
  const toWork =
    workplace && b.latitude != null && b.longitude != null
      ? `${formatMiles(distanceMeters([b.longitude, b.latitude], [workplace.longitude, workplace.latitude]))} to work`
      : titleCase(b.nta_name || b.neighborhood);

  return (
    <li className="flex items-center gap-3 border-t-[1.5px] border-line py-3">
      <GradeTile grade={b.grade} size="md" shadow="xs" />
      <button
        type="button"
        onClick={() => {
          selectBuilding(b.bbl);
          if (b.latitude != null && b.longitude != null) setSelectedLocation({ lng: b.longitude, lat: b.latitude, grade: b.grade });
        }}
        className="min-w-0 flex-1 text-left"
      >
        <span className="block truncate text-base font-bold">{address}</span>
        <span className="block text-[13px] text-muted">
          {[b.residential_units ? `${b.residential_units} units` : null, b.year_built ? `built ${b.year_built}` : null].filter(Boolean).join(" · ") || titleCase(b.borough)}
        </span>
        <span className="block text-[13px] font-medium">
          Health {Math.round(b.health_score ?? 0)}
          {toWork ? ` · ${toWork}` : ""}
        </span>
      </button>
      <button
        type="button"
        aria-pressed={inCompare}
        aria-label={inCompare ? `Remove ${address} from comparison` : `Add ${address} to comparison`}
        disabled={full}
        onClick={() => (inCompare ? removeFromCompare(b.bbl) : addToCompare(b.bbl))}
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-ink disabled:opacity-40 ${
          inCompare ? "bg-ink text-white" : "bg-white text-ink hover:bg-surface"
        }`}
      >
        {inCompare ? <CheckIcon size={18} strokeWidth={2.8} /> : <PlusIcon size={18} />}
      </button>
    </li>
  );
}

export function SearchResultsPanel({ mobile = false }: { mobile?: boolean }) {
  const searchResults = useStore((s) => s.searchResults);
  const searchQuery = useStore((s) => s.searchQuery);
  const searchFilters = useStore((s) => s.searchFilters);
  const filterChips = useStore((s) => s.filterChips);
  const clarification = useStore((s) => s.searchClarification);
  const gradeFilter = useStore((s) => s.gradeFilter);
  const isSearching = useStore((s) => s.isSearching);
  const clearSearch = useStore((s) => s.clearSearch);
  const run = useSearchRunner();

  const [sortKey, setSortKey] = useState<SortKey>("best");
  const [shown, setShown] = useState(PAGE);
  const [addOpen, setAddOpen] = useState(false);
  const addRef = useRef<HTMLDivElement>(null);

  useEffect(() => setShown(PAGE), [searchResults]);

  useEffect(() => {
    if (!addOpen) return;
    const onDown = (e: MouseEvent) => {
      if (addRef.current && !addRef.current.contains(e.target as Node)) setAddOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [addOpen]);

  const filtered = gradeFilter.length > 0 ? searchResults.filter((b) => gradeFilter.includes(b.grade ?? "")) : searchResults;
  const visible = sortResults(filtered, sortKey);
  const page = visible.slice(0, shown);

  const removeChip = (key: string) => {
    if (!searchFilters || !(key in searchFilters)) {
      clearSearch();
      return;
    }
    const next = { ...searchFilters };
    delete next[key];
    if (Object.keys(next).length === 0) clearSearch();
    else run(searchQuery, { filters: next });
  };

  const addFilter = (extra: SearchFilters) => {
    setAddOpen(false);
    run(searchQuery, { filters: { ...(searchFilters ?? {}), ...extra } });
  };

  return (
    <aside
      aria-label="Search results"
      className={`flex h-full flex-col overflow-hidden bg-white ${mobile ? "rounded-t-[24px] border-t-2 border-ink" : "border-r-2 border-ink"}`}
    >
      <div className={`relative flex shrink-0 flex-col gap-3.5 border-b-2 border-ink bg-surface px-[18px] ${mobile ? "pb-4 pt-3" : "pb-[18px] pt-4"}`}>
        {mobile ? (
          <div className="flex items-center justify-between">
            <span aria-hidden="true" className="mx-auto h-[5px] w-11 rounded-full bg-ink" />
            <button type="button" onClick={clearSearch} aria-label="Close search results" className="absolute right-3 top-2 flex h-11 w-11 items-center justify-center rounded-xl">
              <CloseIcon size={18} />
            </button>
          </div>
        ) : (
          <div className="flex gap-2.5">
            <Link href="/" aria-label="BeforeYouRent home" className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[15px] bg-ink text-white">
              <LogoIcon size={24} />
            </Link>
            <SearchBar variant="panel" />
          </div>
        )}

        {filterChips.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="text-[13px] font-bold">Here&apos;s how I read that</div>
            <div className="flex flex-wrap gap-1.5">
              {filterChips.map((chip) => (
                <button
                  key={`${chip.key}-${chip.label}`}
                  type="button"
                  onClick={() => removeChip(chip.key)}
                  aria-label={`Remove filter: ${chip.label}`}
                  disabled={isSearching}
                  className="inline-flex h-11 items-center gap-1.5 rounded-full border-[1.5px] border-ink bg-white pl-3 pr-2.5 text-[13px] font-semibold hover:bg-surface disabled:opacity-60"
                >
                  {chip.label}
                  <CloseIcon size={14} strokeWidth={2.6} />
                </button>
              ))}
              {searchFilters && (
                <div ref={addRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setAddOpen((v) => !v)}
                    aria-expanded={addOpen}
                    disabled={isSearching}
                    className="inline-flex h-11 items-center gap-1.5 rounded-full border-[1.5px] border-dashed border-ink px-3 text-[13px] font-semibold hover:bg-white disabled:opacity-60"
                  >
                    <PlusIcon size={14} strokeWidth={2.6} />
                    Add a filter
                  </button>
                  {addOpen && (
                    <div className="card-float absolute left-0 top-full z-20 mt-1.5 w-56 rounded-2xl p-1 shadow-hard-sm">
                      {ADDABLE.filter((a) => Object.keys(a.filters).some((k) => !(k in searchFilters))).map((a) => (
                        <button
                          key={a.label}
                          type="button"
                          onClick={() => addFilter(a.filters)}
                          className="block w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium hover:bg-surface"
                        >
                          {a.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        {clarification && !isSearching && filterChips.length === 0 && (
          <p className="m-0 text-[13px] text-ink-2">{clarification}</p>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 px-[18px] pb-2.5 pt-3.5">
        <div className="font-display text-[22px] font-extrabold tracking-[-0.02em]" aria-live="polite">
          {isSearching ? "Searching…" : `${visible.length} building${visible.length === 1 ? "" : "s"}`}
        </div>
        {visible.length > 1 && !isSearching && (
          <label className="relative inline-flex h-11 items-center rounded-xl border-[1.5px] border-ink bg-white">
            <span className="sr-only">Sort results</span>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="h-full appearance-none rounded-xl border-0 bg-transparent py-0 pl-3 pr-8 text-[13px] font-semibold text-ink focus:ring-0"
            >
              <option value="best">Best grade first</option>
              <option value="worst">Worst grade first</option>
            </select>
            <ChevronDownIcon size={14} className="pointer-events-none absolute right-3" />
          </label>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isSearching ? (
          <ul className="m-0 list-none px-[18px] py-0">
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className="flex items-center gap-3 border-t-[1.5px] border-line py-3">
                <span className="h-[50px] w-11 animate-pulse rounded-[10px] bg-block" />
                <span className="flex flex-1 flex-col gap-2">
                  <span className="h-4 w-3/4 animate-pulse rounded bg-block" />
                  <span className="h-3 w-1/2 animate-pulse rounded bg-block" />
                </span>
              </li>
            ))}
          </ul>
        ) : visible.length === 0 ? (
          <div className="flex flex-col gap-2 px-[18px] py-8">
            <p className="m-0 font-bold">
              {searchResults.length > 0 ? "Every match is hidden by the grade filter." : "No buildings matched."}
            </p>
            <p className="m-0 text-sm text-muted">
              {searchResults.length > 0
                ? `Show all grades to see the ${searchResults.length} matches.`
                : clarification || "Try a different neighborhood, or remove a filter."}
            </p>
          </div>
        ) : (
          <>
            <ul className="m-0 flex list-none flex-col px-[18px] py-0">
              {page.map((b) => (
                <ResultRow key={b.bbl} b={b} />
              ))}
            </ul>
            <div className="flex items-center justify-between gap-3 border-t-[1.5px] border-line px-[18px] pb-[18px] pt-3">
              <span className="text-[13px] text-muted">
                Showing {page.length} of {visible.length}
              </span>
              <div className="flex gap-2">
                <button type="button" onClick={() => exportCsv(visible)} className="btn-outline" aria-label="Download results as CSV">
                  <DownloadIcon size={16} />
                  CSV
                </button>
                {page.length < visible.length && (
                  <button type="button" onClick={() => setShown((n) => n + PAGE)} className="btn-outline border-2 text-sm">
                    Show more
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
