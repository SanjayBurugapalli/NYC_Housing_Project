"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { fetchWorstBuildings, fetchWorstLandlords, type LandlordGroupBy } from "@/lib/api";
import { DEFAULT_WEIGHTS, SCORING_WEIGHTS, type CategoryWeights } from "@/lib/scoringWeights";
import type { Borough, Grade } from "@/types/building";

type Tab = "buildings" | "landlords";

const BOROUGHS: { label: string; value: Borough | null }[] = [
  { label: "All NYC", value: null },
  { label: "Manhattan", value: "MANHATTAN" },
  { label: "Bronx", value: "BRONX" },
  { label: "Brooklyn", value: "BROOKLYN" },
  { label: "Queens", value: "QUEENS" },
  { label: "Staten Island", value: "STATEN ISLAND" },
];

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

function titleCase(borough: Borough): string {
  return borough
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function GradeBadge({ grade, score }: { grade: Grade; score: number }) {
  return (
    <div
      className={`flex shrink-0 flex-col items-center justify-center rounded-lg border px-3 py-1.5 ${gradeBg(grade)}`}
    >
      <span className={`text-2xl font-bold leading-none ${gradeColor(grade)}`}>{grade}</span>
      <span className="mt-0.5 text-[11px] tabular-nums text-gray-400">{Math.round(score)}</span>
    </div>
  );
}

function RankNumber({ n }: { n: number }) {
  return (
    <div className="flex w-7 shrink-0 items-center justify-center text-sm font-bold tabular-nums text-gray-500">
      {n}
    </div>
  );
}

function BuildingsList({ borough, weights }: { borough: Borough | null; weights: CategoryWeights | null }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["worst-buildings", borough, weights],
    queryFn: () => fetchWorstBuildings(borough, 50, weights),
  });

  if (isLoading) return <ListSkeleton />;
  if (isError) return <ErrorState />;
  if (!data || data.buildings.length === 0) return <EmptyState label="buildings" />;

  return (
    <ul className="divide-y divide-gray-800 overflow-hidden rounded-xl border border-gray-800 bg-gray-900/40">
      {data.buildings.map((b, i) => (
        <li key={b.bbl}>
          <Link
            href={`/map?bbl=${b.bbl}`}
            className="flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-gray-800/60"
          >
            <RankNumber n={i + 1} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-white">
                {b.address || `BBL ${b.bbl}`}
              </p>
              <p className="mt-0.5 truncate text-[13px] text-gray-400">
                {b.borough ? titleCase(b.borough) : "—"}
                {b.neighborhood ? ` · ${b.neighborhood}` : ""}
                {b.residential_units ? ` · ${b.residential_units} units` : ""}
              </p>
              {b.owner_name && (
                <p className="mt-0.5 truncate text-[12px] text-gray-500">Owner: {b.owner_name}</p>
              )}
            </div>
            <div className="hidden shrink-0 text-right sm:block">
              <div className="text-sm font-semibold tabular-nums text-score-critical">
                {b.total_violations.toLocaleString()}
              </div>
              <div className="text-[11px] text-gray-500">violations</div>
            </div>
            <GradeBadge grade={b.grade} score={b.health_score} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function LandlordsList({
  borough,
  groupBy,
  weights,
}: {
  borough: Borough | null;
  groupBy: LandlordGroupBy;
  weights: CategoryWeights | null;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["worst-landlords", borough, groupBy, weights],
    queryFn: () => fetchWorstLandlords(borough, groupBy, 50, weights),
  });

  if (isLoading) return <ListSkeleton />;
  if (isError) return <ErrorState />;
  if (!data || data.landlords.length === 0)
    return <EmptyState label={groupBy === "manager" ? "managing agents" : "landlords"} />;

  return (
    <ul className="divide-y divide-gray-800 overflow-hidden rounded-xl border border-gray-800 bg-gray-900/40">
      {data.landlords.map((l, i) => {
        const inner = (
          <>
            <RankNumber n={i + 1} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-white">{l.owner_name}</p>
              <p className="mt-0.5 truncate text-[13px] text-gray-400">
                {l.building_count.toLocaleString()} building{l.building_count !== 1 ? "s" : ""}
                {l.total_units ? ` · ${l.total_units.toLocaleString()} units` : ""}
                {l.boroughs.length > 0 ? ` · ${l.boroughs.map(titleCase).join(", ")}` : ""}
              </p>
              <p className="mt-0.5 truncate text-[12px] text-gray-500">
                {l.total_violations.toLocaleString()} violations · {l.total_complaints.toLocaleString()} complaints
              </p>
            </div>
            <GradeBadge grade={l.grade} score={l.avg_score} />
          </>
        );
        const className =
          "flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-gray-800/60";
        return (
          <li key={`${l.owner_name}-${i}`}>
            {l.worst_bbl ? (
              <Link href={`/map?bbl=${l.worst_bbl}`} className={className}>
                {inner}
              </Link>
            ) : (
              <div className={className}>{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ListSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900/40">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-gray-800 px-4 py-3.5 last:border-0">
          <div className="h-4 w-4 animate-pulse rounded bg-gray-800" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-2/3 animate-pulse rounded bg-gray-800" />
            <div className="h-2.5 w-1/2 animate-pulse rounded bg-gray-800/70" />
          </div>
          <div className="h-11 w-12 animate-pulse rounded-lg bg-gray-800" />
        </div>
      ))}
    </div>
  );
}

function ErrorState() {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/40 px-6 py-16 text-center">
      <p className="text-sm font-medium text-gray-300">Couldn&apos;t load rankings.</p>
      <p className="mt-1 text-xs text-gray-500">The data service may be temporarily unavailable. Try again shortly.</p>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/40 px-6 py-16 text-center">
      <p className="text-sm font-medium text-gray-300">No {label} to show for this filter.</p>
      <p className="mt-1 text-xs text-gray-500">Try a different borough.</p>
    </div>
  );
}

/** Collapsible sliders that let a visitor re-rank by their own category weights.
    Weights are stored as fractions (matching DEFAULT_WEIGHTS) and normalized
    server-side, so they don't need to sum to 100%. */
function WeightControls({
  weights,
  enabled,
  onSetWeight,
  onToggle,
  onReset,
}: {
  weights: CategoryWeights;
  enabled: boolean;
  onSetWeight: (key: keyof CategoryWeights, value: number) => void;
  onToggle: (value: boolean) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-6 rounded-xl border border-gray-800 bg-gray-900/40">
      <div className="flex items-center justify-between px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 text-sm font-medium text-gray-200 transition-colors hover:text-white"
          aria-expanded={open}
        >
          <span>Prioritize what matters to you</span>
          <span className={`text-xs text-gray-500 transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
        </button>
        {enabled && (
          <span className="rounded-full bg-blue-600/20 px-2 py-0.5 text-[11px] font-medium text-blue-300">
            Custom ranking on
          </span>
        )}
      </div>

      {open && (
        <div className="space-y-3 border-t border-gray-800 px-4 py-4">
          <label className="flex items-center gap-2 text-xs text-gray-300">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => onToggle(e.target.checked)}
              className="rounded accent-blue-500"
            />
            Re-rank by my weights
          </label>

          <div className={enabled ? "space-y-2" : "space-y-2 pointer-events-none opacity-40"}>
            {SCORING_WEIGHTS.map(({ key, label, color }) => {
              const pct = Math.round(weights[key] * 100);
              return (
                <div key={key} className="space-y-0.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">{label}</span>
                    <span className="font-medium text-gray-300 tabular-nums">{pct}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={50}
                    value={pct}
                    onChange={(e) => onSetWeight(key, parseInt(e.target.value, 10) / 100)}
                    style={{ accentColor: color }}
                    className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-gray-700"
                    aria-label={`${label} weight`}
                  />
                </div>
              );
            })}

            <div className="flex items-center justify-between border-t border-gray-800 pt-2 text-xs">
              <button type="button" onClick={onReset} className="text-gray-400 hover:text-white">
                Reset to defaults
              </button>
              <span className="text-gray-500">Weights are normalized automatically.</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function RankingsPage() {
  const [tab, setTab] = useState<Tab>("buildings");
  const [borough, setBorough] = useState<Borough | null>(null);
  const [groupBy, setGroupBy] = useState<LandlordGroupBy>("owner");
  const [customWeights, setCustomWeights] = useState<CategoryWeights>({ ...DEFAULT_WEIGHTS });
  const [useCustomWeights, setUseCustomWeights] = useState(false);

  // null = use the default composite ranking; an object = re-rank server-side.
  const weights = useCustomWeights ? customWeights : null;

  return (
    <div
      className="min-h-screen bg-gray-900 text-white"
      style={{ fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", overflowX: "clip" }}
    >
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-gray-700/50 bg-gray-900/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2.5 text-white no-underline">
            <img src="/logo-mark.svg" alt="" className="h-8 w-8" aria-hidden="true" />
            <span className="text-[15px] font-semibold tracking-tight">BeforeYouRent</span>
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/" className="hidden text-sm font-medium text-gray-300 transition-colors hover:text-white sm:block">
              Home
            </Link>
            <Link
              href="/map"
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              Open map
            </Link>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-5xl px-6 py-12">
        {/* Header */}
        <div className="mb-8">
          <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-red-400">Accountability</div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl" style={{ letterSpacing: "-0.02em" }}>
            The worst landlords &amp; buildings in NYC
          </h1>
          <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-gray-400">
            Ranked by health score — the lowest-scoring buildings and the owners with the worst
            average record across their portfolio. Built entirely from public NYC data.
          </p>
        </div>

        {/* Controls */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Tabs */}
          <div className="inline-flex rounded-lg border border-gray-700 bg-gray-800/60 p-1">
            <button
              type="button"
              onClick={() => setTab("buildings")}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                tab === "buildings" ? "bg-blue-600 text-white" : "text-gray-300 hover:text-white"
              }`}
            >
              Buildings
            </button>
            <button
              type="button"
              onClick={() => setTab("landlords")}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                tab === "landlords" ? "bg-blue-600 text-white" : "text-gray-300 hover:text-white"
              }`}
            >
              Landlords
            </button>
          </div>

          {/* Borough filter */}
          <div className="flex flex-wrap gap-1.5">
            {BOROUGHS.map(({ label, value }) => {
              const active = borough === value;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => setBorough(value)}
                  className={`rounded-full border px-3 py-1 text-[13px] font-medium transition-colors ${
                    active
                      ? "border-blue-500 bg-blue-600/20 text-blue-300"
                      : "border-gray-700 bg-gray-800/60 text-gray-400 hover:border-gray-600 hover:text-gray-200"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Landlords-only: group by owner vs managing agent */}
        {tab === "landlords" && (
          <div className="mb-4 flex items-center gap-2 text-[13px]">
            <span className="text-gray-500">Group by</span>
            <div className="inline-flex rounded-lg border border-gray-700 bg-gray-800/60 p-0.5">
              {([
                { label: "Owner", value: "owner" as const },
                { label: "Managing agent", value: "manager" as const },
              ]).map(({ label, value }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setGroupBy(value)}
                  className={`rounded-md px-3 py-1 font-medium transition-colors ${
                    groupBy === value ? "bg-gray-700 text-white" : "text-gray-400 hover:text-gray-200"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Custom scoring weights */}
        <WeightControls
          weights={customWeights}
          enabled={useCustomWeights}
          onSetWeight={(key, value) =>
            setCustomWeights((w) => ({ ...w, [key]: value }))
          }
          onToggle={setUseCustomWeights}
          onReset={() => setCustomWeights({ ...DEFAULT_WEIGHTS })}
        />

        {/* List */}
        {tab === "buildings" ? (
          <BuildingsList borough={borough} weights={weights} />
        ) : (
          <LandlordsList borough={borough} groupBy={groupBy} weights={weights} />
        )}

        <p className="mt-6 text-[12px] leading-relaxed text-gray-500">
          {tab === "buildings"
            ? "Lowest composite health scores first. 1–2 family homes are excluded. Click a building to view its full record on the map."
            : groupBy === "manager"
              ? "Managing agents ranked by average health score across portfolios of 3+ buildings. Agent names come from HPD registration data; legal-entity suffixes (LLC, Corp, …) are normalized so spelling variants group together. Click a row to view that portfolio's worst building."
              : "Owners ranked by average health score across portfolios of 3+ buildings. Owner names come from PLUTO; legal-entity suffixes (LLC, Corp, …) are normalized so spelling variants like “ABC Realty LLC” and “ABC Realty Corp” group together. Click a landlord to view their worst building."}
        </p>
      </main>
    </div>
  );
}
