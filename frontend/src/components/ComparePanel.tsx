"use client";

import { useEffect, useState, type FormEvent } from "react";
import { resolveListing, searchBuildings, trackEvent } from "@/lib/api";
import { useStore } from "@/lib/store";
import { useBuilding, useCommute, useFood } from "@/hooks/useBuildingData";
import { looksLikeListingUrl } from "@/hooks/useSearchRunner";
import { GRADE_META, scoreToGrade, shortAddress, titleCase, toGrade } from "@/lib/grades";
import type { BuildingSummary, ScoreBreakdown } from "@/types/building";
import { GradeTile } from "@/components/ui/GradeTile";
import { CloseIcon, CompareIcon, SearchIcon } from "@/components/ui/icons";
import { placeLine } from "@/components/building/shared";

const SCORE_ROWS: { key: keyof ScoreBreakdown; label: string }[] = [
  { key: "heat_hot_water", label: "Heat & hot water" },
  { key: "pest_rodent", label: "Pests & rodents" },
  { key: "structural_safety", label: "Structural & safety" },
  { key: "hpd_severity", label: "Housing code" },
  { key: "litigation", label: "Lawsuits" },
  { key: "noise", label: "Noise" },
];

function Column({ bbl, onRemove }: { bbl: string; onRemove: () => void }) {
  const selectBuilding = useStore((s) => s.selectBuilding);
  const setCompareOpen = useStore((s) => s.setCompareOpen);
  const workplace = useStore((s) => s.workplace);
  const { data, isLoading } = useBuilding(bbl);
  const from = data?.latitude != null && data?.longitude != null ? { latitude: data.latitude, longitude: data.longitude } : null;
  const { data: commute, isLoading: commuteLoading } = useCommute(from, workplace);
  const { data: food } = useFood(bbl);

  if (isLoading || !data) {
    return (
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-5" aria-busy="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-4 animate-pulse rounded bg-block" />
        ))}
      </div>
    );
  }

  const grade = toGrade(data.grade, "F");
  const foodTotal = food ? food.counts.deli + food.counts.grocery + food.counts.restaurant : null;
  const sb = data.score_breakdown;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4 p-5">
      <div className="flex items-center gap-3">
        <GradeTile grade={grade} size="hover" rotate={-4} shadow="xs" />
        <div className="min-w-0">
          <div className="truncate font-display text-xl font-extrabold leading-tight tracking-[-0.02em]">{titleCase(data.address)}</div>
          <div className="text-[13px] text-muted">{placeLine(data, " · ")}</div>
        </div>
      </div>

      <dl className="m-0 grid grid-cols-3 gap-2">
        {[
          ["Health", `${Math.round(data.health_score)}`, GRADE_META[grade].short],
          ["Commute", workplace ? (commuteLoading ? "…" : commute ? `${commute.duration_min} min` : "—") : "—", workplace ? "door to door" : "add work address"],
          ["Food", foodTotal != null ? `${foodTotal}` : "…", `within ${food?.walk_minutes ?? 5} min`],
        ].map(([label, value, note]) => (
          <div key={label} className="rounded-2xl border-2 border-ink bg-surface px-3 py-2.5">
            <dt className="eyebrow">{label}</dt>
            <dd className="m-0 font-display text-[26px] font-extrabold leading-tight">{value}</dd>
            <dd className="m-0 truncate text-xs text-muted">{note}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-col gap-2">
        {SCORE_ROWS.map(({ key, label }) => {
          const score = sb ? (sb[key] as number) : null;
          const g = score != null ? scoreToGrade(score) : "F";
          return (
            <div key={key}>
              <div className="mb-1 flex justify-between text-xs font-semibold">
                <span>{label}</span>
                <span className="tabular-nums">{score != null ? Math.round(score) : "—"}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full border-[1.5px] border-ink">
                <div className="h-full" style={{ width: score != null ? `${score}%` : "0%", background: GRADE_META[g].bg }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-auto flex gap-2 pt-1">
        <button
          type="button"
          onClick={() => {
            setCompareOpen(false);
            selectBuilding(bbl);
          }}
          className="btn-ink"
        >
          Open the card
        </button>
        <button type="button" onClick={onRemove} className="btn-outline">
          Remove
        </button>
      </div>
    </div>
  );
}

function PickRow({ b, onPick }: { b: Pick<BuildingSummary, "bbl" | "address" | "grade" | "nta_name" | "neighborhood" | "borough">; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="flex w-full items-center gap-3 border-t-[1.5px] border-line py-2.5 text-left hover:bg-surface"
    >
      <GradeTile grade={b.grade} size="tray" label="" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold">{shortAddress(b.address)}</span>
        <span className="block truncate text-xs text-muted">{placeLine(b, " · ")}</span>
      </span>
      <span className="text-xs font-bold underline underline-offset-2">Add</span>
    </button>
  );
}

function RecentPick({ bbl, onPick }: { bbl: string; onPick: () => void }) {
  const { data } = useBuilding(bbl);
  if (!data) return null;
  return <PickRow b={data} onPick={onPick} />;
}

/** Empty compare slot: find a building by address, listing link or recent view. */
function SlotPicker({ exclude, slot }: { exclude: string[]; slot: number }) {
  const addToCompare = useStore((s) => s.addToCompare);
  const recentBbls = useStore((s) => s.recentBbls);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<BuildingSummary[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const recent = recentBbls.filter((b) => !exclude.includes(b)).slice(0, 4);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const value = q.trim();
    if (!value) return;
    setBusy(true);
    setMessage(null);
    try {
      if (looksLikeListingUrl(value)) {
        const r = await resolveListing(value);
        if (r.status === "found" && r.building) addToCompare(r.building.bbl);
        else setMessage(r.message ?? "We couldn't read that link.");
        setResults(null);
      } else {
        const r = await searchBuildings(value, { includeSmallHomes: true });
        const found = r.results.filter((b) => !exclude.includes(b.bbl)).slice(0, 6);
        setResults(found);
        if (found.length === 0) setMessage(r.clarification || "No buildings matched. Try a street address.");
      }
    } catch {
      setMessage("Search failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3 p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-[60px] w-[52px] shrink-0 items-center justify-center rounded-[11px] border-2 border-dashed border-ink font-display text-2xl font-extrabold text-muted">
          {slot + 1}
        </span>
        <div>
          <div className="font-display text-xl font-extrabold tracking-[-0.02em]">Pick a building</div>
          <div className="text-[13px] text-muted">An address, a listing link, or one you looked at</div>
        </div>
      </div>
      <form onSubmit={submit} role="search" className="flex gap-1.5">
        <label htmlFor={`compare-q-${slot}`} className="sr-only">Find a building to compare</label>
        <input
          id={`compare-q-${slot}`}
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="An address or a StreetEasy link"
          autoComplete="off"
          className="h-[46px] min-w-0 flex-1 rounded-xl border-2 border-ink bg-white px-3 text-sm font-medium text-ink focus:border-ink focus:ring-0"
        />
        <button type="submit" disabled={busy} className="btn-ink h-[46px] px-3.5" aria-label="Search">
          {busy ? "…" : <SearchIcon size={18} />}
        </button>
      </form>
      {message && <p role="status" className="m-0 text-[13px] font-semibold text-ink-2">{message}</p>}
      {results && results.length > 0 && (
        <div className="flex flex-col border-b-[1.5px] border-line">
          {results.map((b) => (
            <PickRow key={b.bbl} b={b} onPick={() => addToCompare(b.bbl)} />
          ))}
        </div>
      )}
      {!results && recent.length > 0 && (
        <div className="flex flex-col">
          <div className="eyebrow pb-1.5">Recently viewed</div>
          <div className="flex flex-col border-b-[1.5px] border-line">
            {recent.map((bbl) => (
              <RecentPick key={bbl} bbl={bbl} onPick={() => addToCompare(bbl)} />
            ))}
          </div>
        </div>
      )}
      <p className="m-0 mt-auto text-xs text-muted">
        You can also open any building on the map and tap &ldquo;Compare with another&rdquo;.
      </p>
    </div>
  );
}

/** Side-by-side comparison dialog. Empty slots let you pick buildings right here. */
export function ComparePanel() {
  const compareBbls = useStore((s) => s.compareBbls);
  const compareOpen = useStore((s) => s.compareOpen);
  const setCompareOpen = useStore((s) => s.setCompareOpen);
  const removeFromCompare = useStore((s) => s.removeFromCompare);

  useEffect(() => {
    if (compareOpen && compareBbls.length === 2) trackEvent("compare", { bbls: compareBbls });
  }, [compareOpen, compareBbls]);

  useEffect(() => {
    if (!compareOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setCompareOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [compareOpen, setCompareOpen]);

  if (!compareOpen) return null;
  const slots = [compareBbls[0] ?? null, compareBbls[1] ?? null];

  return (
    <>
      <div aria-hidden="true" onClick={() => setCompareOpen(false)} className="fixed inset-0 z-40 bg-white/50 animate-fade-in" />
      <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="compare-title"
          className="card-float pointer-events-auto flex max-h-full w-full max-w-[980px] flex-col overflow-hidden rounded-[28px] shadow-hard-xl animate-card-in"
        >
          <div className="flex items-center gap-3 border-b-2 border-ink bg-surface px-5 py-3.5">
            <CompareIcon size={20} />
            <h2 id="compare-title" className="m-0 flex-1 font-display text-[22px] font-extrabold tracking-[-0.02em]">
              {compareBbls.length === 2 ? "Side by side" : "Pick two buildings to compare"}
            </h2>
            <button type="button" autoFocus onClick={() => setCompareOpen(false)} aria-label="Close comparison" className="icon-btn">
              <CloseIcon size={20} />
            </button>
          </div>
          <div className="flex min-h-0 flex-col divide-y-2 divide-line overflow-y-auto md:flex-row md:divide-x-2 md:divide-y-0">
            {slots.map((bbl, i) =>
              bbl ? (
                <Column key={bbl} bbl={bbl} onRemove={() => removeFromCompare(bbl)} />
              ) : (
                <SlotPicker key={`pick-${i}`} slot={i} exclude={compareBbls} />
              )
            )}
          </div>
        </section>
      </div>
    </>
  );
}
