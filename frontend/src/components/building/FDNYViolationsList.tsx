"use client";

import { useState } from "react";
import type { FDNYViolationRecord } from "@/types/building";

export function FDNYViolationsList({ violations }: { violations: FDNYViolationRecord[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div>
      <h4 className="mb-2 font-semibold">
        FDNY Violations ({violations.length})
      </h4>
      <div className="space-y-2">
        {violations.map((v) => {
          const isExpanded = expandedId === v.id;
          const isOpen = v.status?.toUpperCase() === "OPEN";
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => setExpandedId(isExpanded ? null : v.id)}
              className="w-full rounded border border-gray-700 p-2 text-sm text-left hover:border-gray-500 transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className={isOpen ? "text-red-400" : "text-gray-400"}>
                  {v.violation_type || "FDNY Violation"}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">{v.date}</span>
                  <span className="text-gray-500 text-xs">{isExpanded ? "▲" : "▼"}</span>
                </div>
              </div>
              {v.description && (
                <p className={`mt-1 text-gray-300 ${isExpanded ? "" : "line-clamp-1"}`}>
                  {v.description}
                </p>
              )}
              {isExpanded && (
                <div className="mt-2 space-y-1 border-t border-gray-700 pt-2 text-xs text-gray-400">
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                    {v.violation_number && (
                      <><span className="text-gray-500">Violation #</span><span>{v.violation_number}</span></>
                    )}
                    {v.status && (
                      <><span className="text-gray-500">Status</span>
                      <span className={isOpen ? "text-red-400" : "text-gray-400"}>{v.status}</span></>
                    )}
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
