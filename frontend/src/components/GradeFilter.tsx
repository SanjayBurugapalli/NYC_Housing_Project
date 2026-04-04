"use client";

import { useStore } from "@/lib/store";

const GRADES = [
  { grade: "A", label: "A — No Issues",           color: "#22c55e", active: "bg-green-500",  ring: "ring-green-400" },
  { grade: "B", label: "B — Minor Issues",         color: "#84cc16", active: "bg-lime-500",   ring: "ring-lime-400" },
  { grade: "C", label: "C — Moderate Issues",      color: "#eab308", active: "bg-yellow-500", ring: "ring-yellow-400" },
  { grade: "D", label: "D — Significant Issues",   color: "#f97316", active: "bg-orange-500", ring: "ring-orange-400" },
  { grade: "F", label: "F — Critical Issues",      color: "#ef4444", active: "bg-red-500",    ring: "ring-red-400" },
] as const;

export function GradeFilter() {
  const gradeFilter = useStore((s) => s.gradeFilter);
  const toggleGrade = useStore((s) => s.toggleGrade);
  const clearGradeFilter = useStore((s) => s.clearGradeFilter);

  const isFiltering = gradeFilter.length > 0;

  return (
    <div className="rounded-lg bg-gray-800/90 p-3 backdrop-blur-sm shadow-lg">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold uppercase text-gray-400">Building Grade</h4>
        {isFiltering && (
          <button
            onClick={clearGradeFilter}
            className="text-xs text-blue-400 hover:text-white transition-colors ml-3"
          >
            Show all
          </button>
        )}
      </div>
      <div className="space-y-1">
        {GRADES.map(({ grade, label, color, active, ring }) => {
          const selected = gradeFilter.includes(grade);
          const dimmed = isFiltering && !selected;
          return (
            <button
              key={grade}
              onClick={() => toggleGrade(grade)}
              className={`flex w-full items-center gap-2 text-xs rounded px-1 py-0.5 transition-opacity text-left
                ${dimmed ? "opacity-35" : "opacity-100"}
                hover:opacity-100 ${selected ? `ring-1 ${ring} bg-gray-700/40` : ""}
              `}
              aria-pressed={selected}
              title={selected ? `Remove grade ${grade} filter` : `Filter to grade ${grade}`}
            >
              <div
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span className="text-gray-300">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
