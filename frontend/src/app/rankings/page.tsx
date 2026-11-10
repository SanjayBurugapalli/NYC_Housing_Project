"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { fetchWorstBuildings, fetchWorstLandlords, type LandlordGroupBy } from "@/lib/api";
import { DEFAULT_WEIGHTS, SCORING_WEIGHTS, type CategoryWeights } from "@/lib/scoringWeights";
import type { Borough, Grade } from "@/types/building";
import { GradeTile } from "@/components/ui/GradeTile";
import { LogoIcon } from "@/components/ui/icons";
import { LandingNav } from "@/components/landing/LandingInputs";

type Tab = "buildings" | "landlords";

const BOROUGHS: { label: string; value: Borough | null }[] = [
  { label: "All NYC", value: null },
  { label: "Manhattan", value: "MANHATTAN" },
  { label: "Bronx", value: "BRONX" },
  { label: "Brooklyn", value: "BROOKLYN" },
  { label: "Queens", value: "QUEENS" },
  { label: "Staten Island", value: "STATEN ISLAND" },
];

function titleCase(borough: Borough): string {
  return borough
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function GradeBadge({ grade, score }: { grade: Grade; score: number }) {
  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <GradeTile grade={grade} size="li" shadow="xs" />
      <span className="text-[11px] font-semibold tabular-nums text-muted">{Math.round(score)}</span>
    </div>
  );
}

function RankNumber({ n }: { n: number }) {
  return (
    <div className="flex w-7 shrink-0 items-center justify-center text-sm font-bold tabular-nums text-muted">
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
    <ul className="divide-y-[1.5px] divide-line overflow-hidden rounded-[20px] border-2 border-ink bg-white">
      {data.buildings.map((b, i) => (
        <li key={b.bbl}>
          <Link
            href={`/map?bbl=${b.bbl}`}
            className="flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-surface"
          >
            <RankNumber n={i + 1} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-ink">
                {b.address || `BBL ${b.bbl}`}
              </p>
              <p className="mt-0.5 truncate text-[13px] text-muted">
                {b.borough ? titleCase(b.borough) : "—"}
                {b.neighborhood ? ` · ${b.neighborhood}` : ""}
                {b.residential_units ? ` · ${b.residential_units} units` : ""}
              </p>
              {b.owner_name && (
                <p className="mt-0.5 truncate text-[12px] text-muted">Owner: {b.owner_name}</p>
              )}
            </div>
            <div className="hidden shrink-0 text-right sm:block">
              <div className="text-sm font-semibold tabular-nums text-grade-f">
                {b.total_violations.toLocaleString()}
              </div>
              <div className="text-[11px] text-muted">violations</div>
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
    <ul className="divide-y-[1.5px] divide-line overflow-hidden rounded-[20px] border-2 border-ink bg-white">
      {data.landlords.map((l, i) => {
        const inner = (
          <>
            <RankNumber n={i + 1} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-ink">{l.owner_name}</p>
              <p className="mt-0.5 truncate text-[13px] text-muted">
                {l.building_count.toLocaleString()} building{l.building_count !== 1 ? "s" : ""}
                {l.total_units ? ` · ${l.total_units.toLocaleString()} units` : ""}
                {l.boroughs.length > 0 ? ` · ${l.boroughs.map(titleCase).join(", ")}` : ""}
              </p>
              <p className="mt-0.5 truncate text-[12px] text-muted">
                {l.total_violations.toLocaleString()} violations · {l.total_complaints.toLocaleString()} complaints
              </p>
            </div>
            <GradeBadge grade={l.grade} score={l.avg_score} />
          </>
        );
        const className =
          "flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-surface";
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
    <div className="overflow-hidden rounded-[20px] border-2 border-ink bg-white">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-b-[1.5px] border-line px-4 py-3.5 last:border-0">
          <div className="h-4 w-4 animate-pulse rounded bg-block" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-2/3 animate-pulse rounded bg-block" />
            <div className="h-2.5 w-1/2 animate-pulse rounded bg-block" />
          </div>
          <div className="h-11 w-12 animate-pulse rounded-lg bg-block" />
        </div>
      ))}
    </div>
  );
}

function ErrorState() {
  return (
    <div className="rounded-[20px] border-2 border-ink bg-white px-6 py-16 text-center">
      <p className="text-sm font-medium text-ink-2">Couldn&apos;t load rankings.</p>
      <p className="mt-1 text-xs text-muted">The data service may be temporarily unavailable. Try again shortly.</p>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-[20px] border-2 border-ink bg-white px-6 py-16 text-center">
      <p className="text-sm font-medium text-ink-2">No {label} to show for this filter.</p>
      <p className="mt-1 text-xs text-muted">Try a different borough.</p>
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
    <div className="mb-6 rounded-[20px] border-2 border-ink bg-white">
      <div className="flex items-center justify-between px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 text-sm font-medium text-ink transition-colors hover:text-ink-2"
          aria-expanded={open}
        >
          <span>Prioritize what matters to you</span>
          <span className={`text-xs text-muted transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
        </button>
        {enabled && (
          <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] font-bold text-white">
            Custom ranking on
          </span>
        )}
      </div>

      {open && (
        <div className="space-y-3 border-t-[1.5px] border-line px-4 py-4">
          <label className="flex items-center gap-2 text-xs text-ink-2">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => onToggle(e.target.checked)}
              className="rounded accent-[#12141A]"
            />
            Re-rank by my weights
          </label>

          <div className={enabled ? "space-y-2" : "space-y-2 pointer-events-none opacity-40"}>
            {SCORING_WEIGHTS.map(({ key, label, color }) => {
              const pct = Math.round(weights[key] * 100);
              return (
                <div key={key} className="space-y-0.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted">{label}</span>
                    <span className="font-medium text-ink-2 tabular-nums">{pct}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={50}
                    value={pct}
                    onChange={(e) => onSetWeight(key, parseInt(e.target.value, 10) / 100)}
                    style={{ accentColor: color }}
                    className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-line"
                    aria-label={`${label} weight`}
                  />
                </div>
              );
            })}

            <div className="flex items-center justify-between border-t-[1.5px] border-line pt-2 text-xs">
              <button type="button" onClick={onReset} className="text-muted hover:text-ink-2">
                Reset to defaults
              </button>
              <span className="text-muted">Weights are normalized automatically.</span>
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
      className="min-h-screen bg-surface text-ink"
      style={{ fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", overflowX: "clip" }}
    >
      {/* Nav */}
      <header className="border-b-2 border-ink bg-surface">
        <div className="mx-auto flex max-w-[1232px] flex-wrap items-center gap-x-3 gap-y-3 px-4 py-3 sm:gap-x-7 sm:px-6 sm:py-3.5">
          <Link href="/" className="flex min-h-[44px] items-center gap-2 text-ink no-underline sm:gap-2.5">
            <span className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-ink text-white sm:h-[38px] sm:w-[38px] sm:rounded-[11px]">
              <LogoIcon size={20} />
            </span>
            <span className="font-display text-[19px] font-extrabold tracking-[-0.02em] sm:text-[21px]">BeforeYouRent</span>
          </Link>
          <LandingNav />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-12">
        {/* Header */}
        <div className="mb-8">
          <div className="mb-3 text-[13px] font-bold uppercase tracking-[0.08em] text-muted">Accountability</div>
          <h1 className="m-0 font-display text-[clamp(36px,5vw,56px)] font-extrabold leading-[1.02] tracking-[-0.03em]">
            The worst landlords &amp; buildings in NYC
          </h1>
          <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-muted">
            Ranked by health score — the lowest-scoring buildings and the owners with the worst
            average record across their portfolio. Built entirely from public NYC data.
          </p>
        </div>

        {/* Controls */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Tabs */}
          <div className="inline-flex gap-1 rounded-2xl border-2 border-ink bg-white p-1">
            <button
              type="button"
              onClick={() => setTab("buildings")}
              className={`h-11 rounded-[10px] px-4 text-sm font-semibold transition-colors ${
                tab === "buildings" ? "bg-ink font-bold text-white" : "text-ink hover:bg-surface"
              }`}
            >
              Buildings
            </button>
            <button
              type="button"
              onClick={() => setTab("landlords")}
              className={`h-11 rounded-[10px] px-4 text-sm font-semibold transition-colors ${
                tab === "landlords" ? "bg-ink font-bold text-white" : "text-ink hover:bg-surface"
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
                  className={`inline-flex min-h-[44px] items-center rounded-full border-[1.5px] px-3.5 text-[13px] font-semibold transition-colors ${
                    active
                      ? "border-ink bg-ink text-white"
                      : "border-ink bg-white text-ink hover:bg-surface"
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
            <span className="text-muted">Group by</span>
            <div className="inline-flex gap-1 rounded-2xl border-2 border-ink bg-white p-1">
              {([
                { label: "Owner", value: "owner" as const },
                { label: "Managing agent", value: "manager" as const },
              ]).map(({ label, value }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setGroupBy(value)}
                  className={`h-10 rounded-[10px] px-3 font-semibold transition-colors ${
                    groupBy === value ? "bg-ink font-bold text-white" : "text-ink hover:bg-surface"
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

        <p className="mt-6 text-[12px] leading-relaxed text-muted">
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
