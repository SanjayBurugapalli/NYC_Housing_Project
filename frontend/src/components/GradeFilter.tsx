"use client";

import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { GRADES, GRADE_META } from "@/lib/grades";
import { BOROUGH_BOUNDS, BOROUGH_OPTIONS } from "@/lib/boroughs";
import { CheckIcon, ChevronDownIcon, SlidersIcon } from "@/components/ui/icons";
import { MapFiltersPanel } from "@/components/MapFiltersPanel";

/** Five letter toggles. All shown by default; tapping a letter hides it. */
function GradeToggles() {
  const gradeFilter = useStore((s) => s.gradeFilter);
  const toggleGrade = useStore((s) => s.toggleGrade);
  return (
    <div role="group" aria-label="Show grades" className="flex justify-between gap-2">
      {GRADES.map((g) => {
        const shown = gradeFilter.length === 0 || gradeFilter.includes(g);
        const meta = GRADE_META[g];
        return (
          <button
            key={g}
            type="button"
            aria-pressed={shown}
            aria-label={`Grade ${g}, ${shown ? "shown" : "hidden"}`}
            onClick={() => toggleGrade(g)}
            className="relative h-14 w-[50px] rounded-[11px] border-2 border-ink p-0 font-display text-[32px] font-extrabold leading-none transition-opacity"
            style={
              shown
                ? { background: meta.bg, color: meta.fg }
                : { background: "#FFFFFF", color: "#5A6172", borderStyle: "dashed" }
            }
          >
            {g}
          </button>
        );
      })}
    </div>
  );
}

const CHIP = "inline-flex h-11 items-center gap-1.5 rounded-full border-[1.5px] border-ink px-3 text-[13px] font-semibold";
const ON = "bg-ink text-white";
const OFF = "bg-white text-ink hover:bg-surface";

/** Borough chip: picks one borough for the map + plain-English searches, and frames it. */
function BoroughMenu({ opensDown }: { opensDown: boolean }) {
  const boroughFilter = useStore((s) => s.boroughFilter);
  const setBoroughFilter = useStore((s) => s.setBoroughFilter);
  const mapRef = useStore((s) => s.mapRef);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const label = BOROUGH_OPTIONS.find((b) => b.value === boroughFilter)?.label;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (value: (typeof BOROUGH_OPTIONS)[number]["value"] | null) => {
    setBoroughFilter(value);
    setOpen(false);
    if (value && mapRef) {
      // Leave room for the filter card: bottom-left on desktop, under the search
      // bar on phones (where its height depends on what's expanded).
      const cardBottom = ref.current?.closest(".card-float")?.getBoundingClientRect().bottom ?? 200;
      const padding = window.innerWidth < 768
        ? { top: cardBottom + 24, bottom: 40, left: 30, right: 30 }
        : { top: 120, bottom: 60, left: 380, right: 80 };
      mapRef.fitBounds(BOROUGH_BOUNDS[value], { padding, duration: 1000 });
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`${CHIP} ${boroughFilter ? ON : OFF}`}
      >
        {label ?? "Borough"}
        <ChevronDownIcon size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label="Borough"
          className={`card-float absolute left-0 z-30 w-48 rounded-2xl p-1 shadow-hard-sm ${opensDown ? "top-full mt-2" : "bottom-full mb-2"}`}
        >
          {[{ value: null, label: "All five boroughs" }, ...BOROUGH_OPTIONS].map((b) => {
            const selected = boroughFilter === b.value;
            return (
              <li key={b.label} role="option" aria-selected={selected}>
                <button
                  type="button"
                  onClick={() => choose(b.value)}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm ${
                    selected ? "font-bold" : "font-medium"
                  } hover:bg-surface`}
                >
                  {b.label}
                  {selected && <CheckIcon size={14} />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const COLLAPSED_KEY = "byr_filters_collapsed";

/** Five tiny swatches standing in for the letter toggles when the card is minimized. */
function GradeSwatches() {
  const gradeFilter = useStore((s) => s.gradeFilter);
  return (
    <span className="flex gap-1" aria-hidden="true">
      {GRADES.map((g) => {
        const shown = gradeFilter.length === 0 || gradeFilter.includes(g);
        return (
          <span
            key={g}
            className="flex h-[22px] w-5 items-center justify-center rounded-[5px] border-[1.5px] border-ink font-display text-[11px] font-extrabold leading-none"
            style={
              shown
                ? { background: GRADE_META[g].bg, color: GRADE_META[g].fg }
                : { background: "#FFFFFF", color: "#5A6172", borderStyle: "dashed" }
            }
          >
            {g}
          </span>
        );
      })}
    </span>
  );
}

/**
 * Filter card: grade letters + quick chips + borough + "More filters", and a
 * minimize toggle. Bottom-left on desktop; under the search bar on phones
 * (placement "top"), where it expands downward and its menus open downward.
 */
export function GradeFilter({ className = "", placement = "bottom" }: { className?: string; placement?: "top" | "bottom" }) {
  const atTop = placement === "top";
  const includeSmallHomes = useStore((s) => s.includeSmallHomes);
  const setIncludeSmallHomes = useStore((s) => s.setIncludeSmallHomes);
  const rentStabilizedOnly = useStore((s) => s.rentStabilizedOnly);
  const setRentStabilizedOnly = useStore((s) => s.setRentStabilizedOnly);
  const boroughFilter = useStore((s) => s.boroughFilter);
  const gradeFilter = useStore((s) => s.gradeFilter);
  const mapFilters = useStore((s) => s.mapFilters);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreCount = Object.values(mapFilters).filter((v) => v != null).length;

  // Minimized state is a per-viewer convenience: remembered on this device,
  // read after mount so the server render and first client render agree.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSED_KEY) === "1");
    } catch {
      // storage unavailable — start expanded
    }
  }, []);
  const toggleCollapsed = () =>
    setCollapsed((v) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, v ? "0" : "1");
      } catch {
        // ignore
      }
      return !v;
    });

  // Filters that differ from the defaults, summarized while minimized.
  const activeCount =
    (gradeFilter.length > 0 ? 1 : 0) +
    (rentStabilizedOnly ? 1 : 0) +
    (includeSmallHomes ? 1 : 0) +
    (boroughFilter ? 1 : 0) +
    moreCount;

  // The chevron points the way the card will grow (or shrink).
  const expandIcon = <ChevronDownIcon size={18} className={atTop ? "" : "rotate-180"} />;
  const minimizeIcon = <ChevronDownIcon size={18} className={atTop ? "rotate-180" : ""} />;

  if (collapsed) {
    return (
      <div className={`card-float inline-flex w-max items-center gap-3 whitespace-nowrap rounded-[18px] py-2 pl-4 pr-2 shadow-hard-sm ${className}`}>
        <span className="font-bold">Show grades</span>
        <GradeSwatches />
        {activeCount > 0 && (
          <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] font-bold text-white">
            {activeCount} filter{activeCount === 1 ? "" : "s"} on
          </span>
        )}
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-expanded={false}
          aria-label="Show the filters"
          title="Show the filters"
          className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-surface"
        >
          {expandIcon}
        </button>
      </div>
    );
  }

  return (
    <div className={`card-float flex flex-col gap-3.5 rounded-[18px] p-4 shadow-hard-sm ${className}`}>
      <div className="-mr-2 -mt-2 flex items-center justify-between gap-2">
        <span className="font-bold">Show grades</span>
        <span className="flex items-center gap-1">
          <span className="text-[13px] text-muted">Tap to hide a letter</span>
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={true}
            aria-label="Minimize the filters"
            title="Minimize"
            className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-surface"
          >
            {minimizeIcon}
          </button>
        </span>
      </div>
      <GradeToggles />
      <div className="flex flex-wrap gap-2 border-t-[1.5px] border-line pt-3.5">
        <button
          type="button"
          aria-pressed={rentStabilizedOnly}
          onClick={() => setRentStabilizedOnly(!rentStabilizedOnly)}
          className={`${CHIP} ${rentStabilizedOnly ? ON : OFF}`}
        >
          {rentStabilizedOnly && <CheckIcon size={14} />}
          Rent stabilized
        </button>
        <button
          type="button"
          aria-pressed={!includeSmallHomes}
          onClick={() => setIncludeSmallHomes(!includeSmallHomes)}
          className={`${CHIP} ${!includeSmallHomes ? ON : OFF}`}
        >
          {!includeSmallHomes && <CheckIcon size={14} />}
          3+ units only
        </button>
        <BoroughMenu opensDown={atTop} />
        <button
          type="button"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((v) => !v)}
          className={`${CHIP} ${moreOpen || moreCount > 0 ? ON : OFF}`}
        >
          <SlidersIcon size={16} />
          More filters
          {moreCount > 0 && (
            <span className="rounded-full bg-white px-1.5 text-[11px] font-bold leading-4 text-ink">{moreCount}</span>
          )}
        </button>
      </div>
      {moreOpen && <MapFiltersPanel />}
    </div>
  );
}
