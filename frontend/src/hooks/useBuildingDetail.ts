"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchBuildingDetail } from "@/lib/api";

export function useBuildingDetail(bbl: string | null) {
  return useQuery({
    queryKey: ["building-detail", bbl],
    queryFn: () => fetchBuildingDetail(bbl!),
    enabled: !!bbl,
    staleTime: 60_000,
  });
}
