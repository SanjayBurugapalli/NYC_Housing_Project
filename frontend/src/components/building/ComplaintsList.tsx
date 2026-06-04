"use client";

import { useState } from "react";
import type { ComplaintRecord } from "@/types/building";

const COMPLAINTS_PAGE = 20;

export function ComplaintsList({ complaints }: { complaints: ComplaintRecord[] }) {
  const [showAll, setShowAll] = useState(false);

  const visible = showAll ? complaints : complaints.slice(0, COMPLAINTS_PAGE);
  const hasMore = complaints.length > COMPLAINTS_PAGE;

  return (
    <div>
      <h4 className="mb-2 font-semibold">
        Recent Complaints ({complaints.length})
      </h4>
      <div className="space-y-2">
        {visible.map((c) => (
          <div
            key={c.id}
            className="rounded border border-gray-700 p-2 text-sm"
          >
            <div className="flex items-center justify-between">
              <span className="text-blue-400">{c.type}</span>
              <span className="text-gray-500">{c.date}</span>
            </div>
            {c.description && (
              <p className="mt-1 text-gray-300 line-clamp-2">{c.description}</p>
            )}
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
              {c.source && <span>{c.source}</span>}
              {c.category && <span className="capitalize">{c.category}</span>}
              {c.status && (
                <span className={c.status === "Closed" ? "text-gray-500" : "text-yellow-400"}>
                  {c.status}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      {hasMore && !showAll && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-2 w-full rounded border border-gray-600 py-1.5 text-xs text-gray-400 hover:border-gray-400 hover:text-gray-200 transition-colors"
        >
          Show all {complaints.length} complaints
        </button>
      )}
    </div>
  );
}
