"use client";

const LEGEND_ITEMS = [
  { label: "A — No Issues", color: "#22c55e" },
  { label: "B — Minor Issues", color: "#84cc16" },
  { label: "C — Moderate Issues", color: "#eab308" },
  { label: "D — Significant Issues", color: "#f97316" },
  { label: "F — Critical Issues", color: "#ef4444" },
];

export function Legend() {
  return (
    <div className="absolute bottom-6 left-4 z-10 rounded-lg bg-gray-800/90 p-3 backdrop-blur-sm">
      <h4 className="mb-2 text-xs font-semibold uppercase text-gray-400">
        Building Grade
      </h4>
      <div className="space-y-1">
        {LEGEND_ITEMS.map(({ label, color }) => (
          <div key={label} className="flex items-center gap-2 text-xs">
            <div
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span className="text-gray-300">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
