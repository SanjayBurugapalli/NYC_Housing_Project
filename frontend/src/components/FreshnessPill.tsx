"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchRefreshStatus } from "@/lib/api";

const REFETCH_MS = 5 * 60 * 1000; // 5 min — data only changes daily anyway

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "just now";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
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
      className="rounded-full bg-gray-800/80 px-2.5 py-1 text-xs text-gray-300 backdrop-blur-sm shadow-md"
    >
      Data updated {formatRelative(data.overall_last_updated)}
    </div>
  );
}
