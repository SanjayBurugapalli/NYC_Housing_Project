"use client";

import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { GradeTile } from "@/components/ui/GradeTile";
import { BriefcaseIcon, CompareIcon, LocateIcon, MinusIcon, PlusIcon } from "@/components/ui/icons";
import { FreshnessPill } from "@/components/FreshnessPill";
import { WorkplaceInput } from "@/components/building/WorkplaceInput";
import { useBuilding } from "@/hooks/useBuildingData";
import { shortAddress } from "@/lib/grades";
import { USE_FOOTPRINTS } from "@/lib/tiles";

// Zoom levels the detail stepper jumps to. Neighborhood averages show below
// z13; individual buildings (the dots' minzoom) from z13; past z16 each
// building's real outline, filled in its grade color (when the outline tiles
// are configured — otherwise the dots carry on and the level is just "Street").
const LEVELS = [
  { label: "Neighborhoods", zoom: 11.5, test: (z: number) => z < 13 },
  { label: "Buildings", zoom: 14.5, test: (z: number) => z >= 13 && z < 16 },
  { label: USE_FOOTPRINTS ? "Footprints" : "Street", zoom: 16.5, test: (z: number) => z >= 16 },
];

/** "Neighborhoods · Buildings · Street" — the map's three detail levels. */
export function ZoomStepper({ className = "" }: { className?: string }) {
  const mapRef = useStore((s) => s.mapRef);
  const zoom = useStore((s) => s.zoom);
  return (
    <div className={`flex flex-col items-center gap-2.5 ${className}`}>
      <div className="whitespace-nowrap rounded-xl bg-ink px-3.5 py-2 text-[13px] font-medium text-white">
        {USE_FOOTPRINTS ? "Zoom in for footprints" : "Zoom in for buildings"}, out for neighborhood averages
      </div>
      <div role="group" aria-label="Map detail level" className="card-float flex gap-1 rounded-2xl p-1 shadow-hard-sm">
        {LEVELS.map((l) => {
          const active = l.test(zoom);
          return (
            <button
              key={l.label}
              type="button"
              aria-pressed={active}
              onClick={() => mapRef?.easeTo({ zoom: l.zoom, duration: 700 })}
              className={`h-11 rounded-[10px] px-4 text-sm ${active ? "bg-ink font-bold text-white" : "font-semibold text-ink hover:bg-surface"}`}
            >
              {l.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Close a popover on outside click or Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

/** Top-bar "Work" button: set, change or clear the commute destination. */
export function WorkButton({ className = "" }: { className?: string }) {
  const workplace = useStore((s) => s.workplace);
  const setWorkplace = useStore((s) => s.setWorkplace);
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const place = workplace?.label.split(",")[0];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        title={workplace ? `Commuting to ${workplace.label}` : "Set where you commute to"}
        className={className}
      >
        <BriefcaseIcon size={18} />
        <span className="max-w-[150px] truncate">{place ?? "Set work"}</span>
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Work address"
          className="card-float absolute right-0 top-full z-40 mt-2 flex w-[min(360px,calc(100vw-32px))] flex-col gap-2.5 rounded-[18px] p-4 shadow-hard-sm"
        >
          <label htmlFor="work-top" className="text-sm font-bold">Where do you commute to?</label>
          <WorkplaceInput
            id="work-top"
            autoFocus
            defaultValue={workplace?.label ?? ""}
            onSelect={(w) => {
              setWorkplace(w);
              setOpen(false);
            }}
          />
          <p className="m-0 text-xs text-muted">Every building card times the fastest trip by transit and on foot. Saved on this device.</p>
          {workplace && (
            <button
              type="button"
              onClick={() => {
                setWorkplace(null);
                setOpen(false);
              }}
              className="self-start text-[13px] font-semibold underline underline-offset-2"
            >
              Remove work address
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Zoom ± and "go to my location". */
export function MapControls({ showFreshness = true }: { showFreshness?: boolean }) {
  const mapRef = useStore((s) => s.mapRef);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);

  const locate = () => {
    if (!mapRef || !navigator.geolocation) return;
    setLocating(true);
    setLocError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        mapRef.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 15.5, duration: 1200 });
      },
      () => {
        setLocating(false);
        setLocError("Location is off for this site.");
        setTimeout(() => setLocError(null), 4000);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 }
    );
  };

  return (
    <div className="flex flex-col items-end gap-2.5">
      <div className="flex flex-col overflow-hidden rounded-[14px] border-2 border-ink bg-white">
        <button type="button" aria-label="Zoom in" onClick={() => mapRef?.zoomIn()} className="flex h-[46px] w-[46px] items-center justify-center border-b-2 border-ink hover:bg-surface">
          <PlusIcon size={20} />
        </button>
        <button type="button" aria-label="Zoom out" onClick={() => mapRef?.zoomOut()} className="flex h-[46px] w-[46px] items-center justify-center hover:bg-surface">
          <MinusIcon size={20} />
        </button>
      </div>
      <LocateButton onClick={locate} busy={locating} />
      {locError && <div role="status" className="rounded-full border-[1.5px] border-ink bg-white px-3 py-1.5 text-xs font-semibold">{locError}</div>}
      {showFreshness && <FreshnessPill />}
    </div>
  );
}

export function LocateButton({ onClick, busy, className = "" }: { onClick: () => void; busy?: boolean; className?: string }) {
  return (
    <button
      type="button"
      aria-label="Go to my location"
      onClick={onClick}
      disabled={busy}
      className={`flex h-[50px] w-[50px] items-center justify-center rounded-[14px] border-2 border-ink bg-white hover:bg-surface disabled:opacity-60 ${className}`}
    >
      <LocateIcon size={20} className={busy ? "animate-pulse" : ""} />
    </button>
  );
}

function TrayChip({ bbl }: { bbl: string }) {
  const { data } = useBuilding(bbl);
  return (
    <div className="flex items-center gap-2 rounded-xl border-[1.5px] border-ink py-[5px] pl-[5px] pr-2.5">
      <GradeTile grade={data?.grade ?? "A"} size="tray" label={data ? `Grade ${data.grade}` : "Loading"} className={data ? "" : "opacity-40"} />
      <span className="max-w-[160px] truncate text-[13px] font-semibold">{data ? shortAddress(data.address) : "Loading…"}</span>
    </div>
  );
}

/** "Comparing A vs B · Compare side by side" tray. */
export function CompareTray() {
  const compareBbls = useStore((s) => s.compareBbls);
  const setCompareOpen = useStore((s) => s.setCompareOpen);
  const clearCompare = useStore((s) => s.clearCompare);
  if (compareBbls.length === 0) return null;
  return (
    <div className="card-float flex flex-wrap items-center gap-x-3.5 gap-y-2.5 rounded-[18px] py-2.5 pl-4 pr-2.5 shadow-hard">
      <span className="text-[13px] font-bold">Comparing</span>
      <TrayChip bbl={compareBbls[0]} />
      <span className="font-display text-[15px] font-extrabold">vs</span>
      {compareBbls[1] ? (
        <TrayChip bbl={compareBbls[1]} />
      ) : (
        <button
          type="button"
          onClick={() => setCompareOpen(true)}
          className="rounded-xl border-[1.5px] border-dashed border-ink px-3 py-2 text-[13px] font-semibold hover:bg-surface"
        >
          + Pick another building
        </button>
      )}
      <button type="button" onClick={() => setCompareOpen(true)} className="btn-ink h-[46px]">
        <CompareIcon size={18} />
        Compare side by side
      </button>
      <button type="button" onClick={clearCompare} className="text-[13px] font-semibold underline underline-offset-2">
        Clear
      </button>
    </div>
  );
}
