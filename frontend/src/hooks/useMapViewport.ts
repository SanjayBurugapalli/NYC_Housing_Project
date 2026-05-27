"use client";

import { useQuery } from "@tanstack/react-query";
import { useStore } from "@/lib/store";
import { fetchBuildings } from "@/lib/api";

export function useMapViewport() {
  const viewport = useStore((s) => s.viewport);
  const zoom = useStore((s) => s.zoom);
  const includeSmallHomes = useStore((s) => s.includeSmallHomes);

  const query = useQuery({
    queryKey: ["buildings", viewport, zoom, includeSmallHomes],
    queryFn: () => fetchBuildings(viewport, zoom, includeSmallHomes),
    enabled: zoom >= 13, // Only fetch individual buildings at high zoom
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  return {
    buildings: query.data?.buildings ?? [],
    total: query.data?.total ?? 0,
    isLoading: query.isLoading,
    error: query.error,
  };
}
