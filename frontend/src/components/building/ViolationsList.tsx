"use client";

import { useState } from "react";
import type { ViolationRecord } from "@/types/building";

const VIOLATIONS_PAGE = 20;

export function ViolationsList({ violations }: { violations: ViolationRecord[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const visible = showAll ? violations : violations.slice(0, VIOLATIONS_PAGE);
  const hasMore = violations.length > VIOLATIONS_PAGE;

  return (
    <div>
      <h4 className="mb-2 font-semibold">
        Recent Violations ({violations.length})
      </h4>
      <div className="space-y-2">
        {visible.map((v) => {
          const isExpanded = expandedId === v.id;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => setExpandedId(isExpanded ? null : v.id)}
              className="w-full rounded border border-gray-700 p-2 text-sm text-left hover:border-gray-500 transition-colors"
            >
              <div className="flex items-center justify-between">
                <span
                  className={
                    v.severity === "C"
                      ? "text-red-400"
                      : v.severity === "B"
                        ? "text-yellow-400"
                        : "text-gray-400"
                  }
                >
                  {v.severity ? `Class ${v.severity}` : v.source}
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
                    {v.source && (
                      <><span className="text-gray-500">Source</span><span>{v.source}</span></>
                    )}
                    {v.type && (
                      <><span className="text-gray-500">Type</span><span>{v.type}</span></>
                    )}
                    {v.status && (
                      <><span className="text-gray-500">Status</span><span>{v.status}</span></>
                    )}
                    {v.order_number && (
                      <><span className="text-gray-500">Order #</span><span>{v.order_number}</span></>
                    )}
                    {v.approved_date && (
                      <><span className="text-gray-500">Approved</span><span>{v.approved_date}</span></>
                    )}
                    {v.status_date && (
                      <><span className="text-gray-500">Status Date</span><span>{v.status_date}</span></>
                    )}
                    {v.certify_by_date && (
                      <><span className="text-gray-500">Certify By</span><span>{v.certify_by_date}</span></>
                    )}
                    {v.correct_by_date && (
                      <><span className="text-gray-500">Correct By</span><span className="text-yellow-400">{v.correct_by_date}</span></>
                    )}
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>
      {hasMore && !showAll && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-2 w-full rounded border border-gray-600 py-1.5 text-xs text-gray-400 hover:border-gray-400 hover:text-gray-200 transition-colors"
        >
          Show all {violations.length} violations
        </button>
      )}
    </div>
  );
}
