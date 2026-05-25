"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchBuildingDetail, trackEvent } from "@/lib/api";
import { useStore } from "@/lib/store";
import type { BuildingDetail } from "@/types/building";

const SCORE_ROWS = [
  { key: "heat_hot_water",     label: "Heat / Hot Water",   bar: "bg-orange-500" },
  { key: "pest_rodent",        label: "Pest / Rodent",      bar: "bg-yellow-500" },
  { key: "structural_safety",  label: "Structural / DOB",   bar: "bg-blue-500"   },
  { key: "hpd_severity",       label: "HPD Violations",     bar: "bg-red-500"    },
  { key: "noise",              label: "Noise",              bar: "bg-purple-500" },
  { key: "litigation",         label: "Litigation",         bar: "bg-pink-500"   },
] as const;

function gradeColor(grade: string | undefined) {
  if (grade === "A") return "text-green-400";
  if (grade === "B") return "text-lime-400";
  if (grade === "C") return "text-yellow-400";
  if (grade === "D") return "text-orange-400";
  return "text-red-400";
}

function BuildingColumn({ bbl, onRemove }: { bbl: string; onRemove: () => void }) {
  const selectBuilding = useStore((s) => s.selectBuilding);
  const mapRef = useStore((s) => s.mapRef);

  const { data, isLoading } = useQuery<BuildingDetail>({
    queryKey: ["building", bbl],
    queryFn: () => fetchBuildingDetail(bbl),
  });

  if (isLoading) {
    return (
      <div className="flex-1 p-4 space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-4 rounded bg-gray-700/60 animate-pulse" />
        ))}
      </div>
    );
  }

  const sb = data?.score_breakdown;

  return (
    <div className="flex-1 min-w-0 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-sm truncate">{data?.address}</p>
          <p className="text-xs text-gray-400">{data?.borough} · {data?.nta_name || data?.neighborhood}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {data?.residential_units ? `${data.residential_units} units` : ""}
            {data?.year_built ? ` · Built ${data.year_built}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`text-2xl font-bold ${gradeColor(data?.grade)}`}>{data?.grade}</span>
          <span className="text-xs text-gray-400">{data?.health_score?.toFixed(0)}</span>
        </div>
      </div>

      {/* Score bars */}
      <div className="space-y-2">
        {SCORE_ROWS.map(({ key, label, bar }) => {
          const score = sb ? (sb[key] as number) : null;
          return (
            <div key={key}>
              <div className="flex justify-between text-xs text-gray-400 mb-0.5">
                <span>{label}</span>
                <span className="tabular-nums">{score != null ? score.toFixed(0) : "—"}</span>
              </div>
              <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full ${bar} rounded-full transition-all`}
                  style={{ width: score != null ? `${score}%` : "0%" }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={() => {
            selectBuilding(bbl);
            if (mapRef && data?.longitude != null && data?.latitude != null) {
              mapRef.flyTo({ center: [data.longitude, data.latitude], zoom: Math.max(mapRef.getZoom(), 15), duration: 800 });
            }
          }}
          className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
        >
          Open detail →
        </button>
        <button
          onClick={onRemove}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          Remove
        </button>
      </div>
    </div>
  );
}

export function ComparePanel() {
  const compareBbls = useStore((s) => s.compareBbls);
  const clearCompare = useStore((s) => s.clearCompare);
  const removeFromCompare = useStore((s) => s.removeFromCompare);

  useEffect(() => {
    if (compareBbls.length === 2) {
      trackEvent("compare", { bbls: compareBbls });
    }
  }, [compareBbls]);

  if (compareBbls.length === 0) return null;

  const isFull = compareBbls.length === 2;

  return (
    <div className="absolute bottom-0 left-0 right-0 md:right-96 z-20 border-t border-gray-600 bg-gray-900/97 backdrop-blur-sm shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-700 px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-200">Compare</span>
          <span className="rounded-full bg-blue-700 px-1.5 py-0.5 text-[10px] font-bold text-white">
            {compareBbls.length}/2
          </span>
          {!isFull && (
            <span className="text-xs text-gray-400">— open a building and click "+ Compare" to add a second</span>
          )}
        </div>
        <button
          onClick={clearCompare}
          className="rounded p-1 text-xs text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
          title="Clear comparison"
        >
          ✕
        </button>
      </div>

      {/* Comparison columns */}
      {isFull && (
        <div className="flex divide-x divide-gray-700 overflow-y-auto" style={{ maxHeight: "360px" }}>
          {compareBbls.map((bbl) => (
            <BuildingColumn key={bbl} bbl={bbl} onRemove={() => removeFromCompare(bbl)} />
          ))}
        </div>
      )}
    </div>
  );
}
