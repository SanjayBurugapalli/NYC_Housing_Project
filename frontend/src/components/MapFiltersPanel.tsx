"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";

export function MapFiltersPanel() {
  const { mapFilters, setMapFilter, clearMapFilters } = useStore();
  const [open, setOpen] = useState(false);

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

  return (
    <div className="mt-2 rounded-lg bg-gray-800/90 p-3 backdrop-blur-sm shadow-lg">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between"
      >
        <h4 className="text-xs font-semibold uppercase text-gray-400">More Filters</h4>
        <div className="flex items-center gap-1.5">
          {activeCount > 0 && (
            <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
              {activeCount}
            </span>
          )}
          <span className="text-xs text-gray-500">{open ? "▲" : "▼"}</span>
        </div>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {/* Units */}
          <div>
            <p className="mb-1.5 text-xs text-gray-400">Residential Units</p>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={0}
                placeholder="Min"
                value={mapFilters.minUnits ?? ""}
                onChange={(e) => handleNumber("minUnits", e.target.value)}
                className="w-16 rounded border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-gray-200 focus:border-blue-500 focus:outline-none"
              />
              <span className="text-xs text-gray-500">–</span>
              <input
                type="number"
                min={0}
                placeholder="Max"
                value={mapFilters.maxUnits ?? ""}
                onChange={(e) => handleNumber("maxUnits", e.target.value)}
                className="w-16 rounded border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-gray-200 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Year built */}
          <div>
            <p className="mb-1.5 text-xs text-gray-400">Year Built</p>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={1800}
                max={2025}
                placeholder="From"
                value={mapFilters.minYear ?? ""}
                onChange={(e) => handleNumber("minYear", e.target.value)}
                className="w-16 rounded border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-gray-200 focus:border-blue-500 focus:outline-none"
              />
              <span className="text-xs text-gray-500">–</span>
              <input
                type="number"
                min={1800}
                max={2025}
                placeholder="To"
                value={mapFilters.maxYear ?? ""}
                onChange={(e) => handleNumber("maxYear", e.target.value)}
                className="w-16 rounded border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-gray-200 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {activeCount > 0 && (
            <button
              onClick={clearMapFilters}
              className="text-xs text-blue-400 hover:text-white transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
