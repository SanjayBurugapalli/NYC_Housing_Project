"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiError, fetchBuildingDetail, fetchCommute, fetchFood } from "@/lib/api";
import type { Workplace } from "@/types/building";

/** Building detail, shared cache key with the compare columns. */
export function useBuilding(bbl: string | null) {
  return useQuery({
    queryKey: ["building", bbl],
    queryFn: () => fetchBuildingDetail(bbl!),
    enabled: !!bbl,
    retry: 1,
  });
}

/**
 * Fastest door-to-door transit + walking trip from a building to the saved workplace.
 * Cached for the session per (building, workplace) pair — the backend fixes the
 * departure to the next weekday at 8:30 AM, so the answer doesn't drift.
 */
export function useCommute(
  from: { latitude: number; longitude: number } | null | undefined,
  workplace: Workplace | null
) {
  return useQuery({
    queryKey: ["commute", from?.latitude, from?.longitude, workplace?.latitude, workplace?.longitude],
    queryFn: () => fetchCommute(from!, workplace!),
    enabled: !!from && !!workplace,
    staleTime: 6 * 60 * 60 * 1000,
    gcTime: 6 * 60 * 60 * 1000,
    // A 404 means "no transit route" — retrying won't change that.
    retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 1,
  });
}

/** Food places within a 5-minute walk (400 m) of a building. */
export function useFood(bbl: string | null, enabled = true) {
  return useQuery({
    queryKey: ["food", bbl],
    queryFn: () => fetchFood(bbl!),
    enabled: !!bbl && enabled,
    staleTime: 60 * 60 * 1000,
    retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 1,
  });
}

/** Tracks a CSS media query (false during SSR and the first client render). */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [query]);
  return matches;
}
