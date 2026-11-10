"use client";

import { useCallback } from "react";
import { useStore } from "@/lib/store";
import { resolveListing, searchBuildings, trackEvent } from "@/lib/api";
import type { BuildingSummary, SearchFilters, ViewportBounds } from "@/types/building";

const HISTORY_KEY = "nyc_search_history";
const HISTORY_MAX = 8;

export function loadHistory(): string[] {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(HISTORY_KEY) : null;
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return [];
}

function saveHistory(query: string) {
  try {
    const deduped = [query, ...loadHistory().filter((h) => h !== query)].slice(0, HISTORY_MAX);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(deduped));
  } catch {
    // ignore
  }
}

/** True for anything that should go to the listing-link resolver instead of search. */
export function looksLikeListingUrl(q: string): boolean {
  const s = q.trim();
  return /^https?:\/\//i.test(s) || /^(www\.)?(streeteasy|zillow)\.com\//i.test(s);
}

/**
 * One entry point for every search on the map: a pasted StreetEasy/Zillow
 * link (snaps to the building), an address, or a plain-English question.
 * `filters` re-runs a search with structured filters (removing a chip) and
 * `bbox` limits it to the visible map ("Search this area").
 */
export function useSearchRunner() {
  const includeSmallHomes = useStore((s) => s.includeSmallHomes);
  const boroughFilter = useStore((s) => s.boroughFilter);
  const setSearchQuery = useStore((s) => s.setSearchQuery);
  const setSearchResults = useStore((s) => s.setSearchResults);
  const setIsSearching = useStore((s) => s.setIsSearching);
  const setSearchError = useStore((s) => s.setSearchError);
  const setSearchClarification = useStore((s) => s.setSearchClarification);
  const setSearchInterpretation = useStore((s) => s.setSearchInterpretation);
  const clearSearch = useStore((s) => s.clearSearch);
  const selectBuilding = useStore((s) => s.selectBuilding);
  const setSelectedLocation = useStore((s) => s.setSelectedLocation);

  const open = useCallback(
    (b: BuildingSummary) => {
      selectBuilding(b.bbl);
      if (b.latitude != null && b.longitude != null) {
        setSelectedLocation({ lng: b.longitude, lat: b.latitude, grade: b.grade });
      }
    },
    [selectBuilding, setSelectedLocation]
  );

  return useCallback(
    async (query: string, opts: { filters?: SearchFilters | null; bbox?: ViewportBounds | null } = {}) => {
      const q = query.trim();
      if (!q) return;
      setSearchQuery(q);
      setIsSearching(true);
      setSearchError(null);

      if (looksLikeListingUrl(q)) {
        try {
          const r = await resolveListing(q);
          if (r.status === "found" && r.building) {
            clearSearch();
            open(r.building);
          } else {
            setSearchError(r.message ?? "We couldn't read that link. Try typing the address instead.");
          }
        } catch {
          setSearchError("We couldn't read that link. Try typing the address instead.");
        } finally {
          setIsSearching(false);
        }
        return;
      }

      try {
        const result = await searchBuildings(q, {
          includeSmallHomes,
          borough: boroughFilter,
          filters: opts.filters,
          bbox: opts.bbox,
        });
        if (!opts.filters && !opts.bbox) saveHistory(q);
        trackEvent("search", { query: q, result_count: result.results.length });
        setSearchInterpretation(result.filters ?? null, result.filter_chips ?? []);
        setSearchResults(result.results);
        if (result.results.length === 0) {
          setSearchClarification(
            result.clarification || 'No buildings found. Try "rent-stabilized in Bushwick" or a street address.'
          );
        } else {
          setSearchClarification(result.clarification || null);
          // A single match (usually an address) goes straight to its card.
          if (result.results.length === 1 && !opts.filters && !opts.bbox) open(result.results[0]);
        }
      } catch {
        setSearchResults([]);
        setSearchError("Search failed. Please try again.");
      } finally {
        setIsSearching(false);
      }
    },
    [includeSmallHomes, boroughFilter, setSearchQuery, setIsSearching, setSearchError, clearSearch, open, setSearchInterpretation, setSearchResults, setSearchClarification]
  );
}
