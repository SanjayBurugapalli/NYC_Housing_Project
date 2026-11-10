"use client";

import { useStore } from "@/lib/store";

/** Units + year-built ranges, shown under "More filters" in the filter card. */
export function MapFiltersPanel() {
  const { mapFilters, setMapFilter, clearMapFilters } = useStore();

  const activeCount = [
    mapFilters.minUnits,
    mapFilters.maxUnits,
    mapFilters.minYear,
    mapFilters.maxYear,
  ].filter((v) => v != null).length;

  function handleNumber(
    key: "minUnits" | "maxUnits" | "minYear" | "maxYear",
    raw: string
  ) {
    const n = parseInt(raw, 10);
    setMapFilter(key, isNaN(n) ? null : n);
  }

  const field =
    "h-11 w-20 rounded-xl border-[1.5px] border-ink bg-white px-2.5 text-sm font-medium text-ink focus:border-ink focus:ring-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

  return (
    <div className="flex flex-col gap-3">
      <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
        <legend className="mb-1.5 text-[13px] font-bold">Apartments in the building</legend>
        <div className="flex items-center gap-2">
          <input aria-label="Minimum units" type="number" min={0} placeholder="Min" value={mapFilters.minUnits ?? ""} onChange={(e) => handleNumber("minUnits", e.target.value)} className={field} />
          <span className="text-muted">–</span>
          <input aria-label="Maximum units" type="number" min={0} placeholder="Max" value={mapFilters.maxUnits ?? ""} onChange={(e) => handleNumber("maxUnits", e.target.value)} className={field} />
        </div>
      </fieldset>
      <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
        <legend className="mb-1.5 text-[13px] font-bold">Year built</legend>
        <div className="flex items-center gap-2">
          <input aria-label="Built from" type="number" min={1800} max={2030} placeholder="From" value={mapFilters.minYear ?? ""} onChange={(e) => handleNumber("minYear", e.target.value)} className={field} />
          <span className="text-muted">–</span>
          <input aria-label="Built to" type="number" min={1800} max={2030} placeholder="To" value={mapFilters.maxYear ?? ""} onChange={(e) => handleNumber("maxYear", e.target.value)} className={field} />
        </div>
      </fieldset>
      {activeCount > 0 && (
        <button type="button" onClick={clearMapFilters} className="self-start text-[13px] font-semibold underline underline-offset-2">
          Clear these filters
        </button>
      )}
    </div>
  );
}
