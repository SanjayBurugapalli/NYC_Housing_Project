"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchRefreshStatus } from "@/lib/api";
import { GRADE_META } from "@/lib/grades";

const REFETCH_MS = 5 * 60 * 1000; // 5 min — data only changes daily anyway

function describe(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return "City data refreshed just now";
  if (hours < 24) {
    const then = new Date(iso);
    return then.getDate() === new Date().getDate() ? `City data refreshed ${hours}h ago` : "City data refreshed last night";
  }
  const days = Math.floor(hours / 24);
  return `City data refreshed ${days} day${days === 1 ? "" : "s"} ago`;
}

export function FreshnessPill() {
  const { data } = useQuery({
    queryKey: ["refresh-status"],
    queryFn: fetchRefreshStatus,
    staleTime: REFETCH_MS,
    refetchInterval: REFETCH_MS,
  });

  if (!data || !data.overall_last_updated) return null;

  return (
    <div
      title={new Date(data.overall_last_updated).toLocaleString()}
      className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border-[1.5px] border-ink bg-white px-3 py-[7px] text-xs font-semibold"
    >
      <span
        aria-hidden="true"
        className="h-2 w-2 rounded-full border-[1.5px] border-ink"
        style={{ background: data.any_stale ? GRADE_META.D.bg : GRADE_META.A.bg }}
      />
      {describe(data.overall_last_updated)}
    </div>
  );
}
