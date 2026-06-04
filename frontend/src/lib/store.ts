import { create } from "zustand";
import type { BuildingSummary, ViewportBounds } from "@/types/building";
import type mapboxgl from "mapbox-gl";
import { DEFAULT_WEIGHTS, type CategoryWeights } from "@/lib/scoringWeights";

// Re-exported so existing `@/lib/store` importers keep working; the canonical
// definition now lives in scoringWeights.ts.
export { DEFAULT_WEIGHTS };
export type { CategoryWeights };

interface AppState {
  // Map viewport
  viewport: ViewportBounds;
  zoom: number;
  setViewport: (viewport: ViewportBounds, zoom: number) => void;

  // Map reference (for flyTo from search)
  mapRef: mapboxgl.Map | null;
  setMapRef: (map: mapboxgl.Map | null) => void;

  // Building count visible on map
  buildingCount: number;
  setBuildingCount: (count: number) => void;

  // Selected building
  selectedBbl: string | null;
  selectBuilding: (bbl: string | null) => void;

  // Search
  searchQuery: string;
  searchResults: BuildingSummary[];
  isSearching: boolean;
  searchError: string | null;
  searchClarification: string | null;
  setSearchQuery: (query: string) => void;
  setSearchResults: (results: BuildingSummary[]) => void;
  setIsSearching: (isSearching: boolean) => void;
  setSearchError: (error: string | null) => void;
  setSearchClarification: (clarification: string | null) => void;
  clearSearch: () => void;

  // Grade filter (empty = show all)
  gradeFilter: string[];
  toggleGrade: (grade: string) => void;
  clearGradeFilter: () => void;

  // Map filters (applied to viewport buildings layer)
  mapFilters: { minUnits: number | null; maxUnits: number | null; minYear: number | null; maxYear: number | null };
  setMapFilter: (key: "minUnits" | "maxUnits" | "minYear" | "maxYear", value: number | null) => void;
  clearMapFilters: () => void;

  // Include 1-2 family homes — shared by SearchBar and viewport map layer
  includeSmallHomes: boolean;
  setIncludeSmallHomes: (include: boolean) => void;

  // Building comparison (max 2)
  compareBbls: string[];
  addToCompare: (bbl: string) => void;
  removeFromCompare: (bbl: string) => void;
  clearCompare: () => void;

  // Custom scoring weights
  customWeights: CategoryWeights;
  useCustomWeights: boolean;
  setCustomWeight: (key: keyof CategoryWeights, value: number) => void;
  setUseCustomWeights: (use: boolean) => void;
  resetWeights: () => void;
}

const VIEWPORT_STORAGE_KEY = "nyc_map_viewport";

function loadViewport(): { viewport: ViewportBounds; zoom: number } {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(VIEWPORT_STORAGE_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.viewport && typeof parsed.zoom === "number") return parsed;
    }
  } catch {
    // ignore parse errors
  }
  return { viewport: { west: -74.26, south: 40.49, east: -73.7, north: 40.92 }, zoom: 11 };
}

export const useStore = create<AppState>((set) => ({
  // Map viewport — restored from localStorage or default NYC center
  ...loadViewport(),
  setViewport: (viewport, zoom) => {
    try {
      localStorage.setItem(VIEWPORT_STORAGE_KEY, JSON.stringify({ viewport, zoom }));
    } catch {
      // ignore quota errors
    }
    set({ viewport, zoom });
  },

  // Map reference
  mapRef: null,
  setMapRef: (mapRef) => set({ mapRef }),

  // Building count
  buildingCount: 0,
  setBuildingCount: (buildingCount) => set({ buildingCount }),

  // Selected building
  selectedBbl: null,
  selectBuilding: (bbl) => set({ selectedBbl: bbl }),

  // Search
  searchQuery: "",
  searchResults: [],
  isSearching: false,
  searchError: null,
  searchClarification: null,
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSearchResults: (results) => set({ searchResults: results }),
  setIsSearching: (isSearching) => set({ isSearching }),
  setSearchError: (error) => set({ searchError: error }),
  setSearchClarification: (clarification) => set({ searchClarification: clarification }),
  clearSearch: () =>
    set({ searchQuery: "", searchResults: [], isSearching: false, searchError: null, searchClarification: null }),

  // Grade filter
  gradeFilter: [],
  toggleGrade: (grade) =>
    set((state) => ({
      gradeFilter: state.gradeFilter.includes(grade)
        ? state.gradeFilter.filter((g) => g !== grade)
        : [...state.gradeFilter, grade],
    })),
  clearGradeFilter: () => set({ gradeFilter: [] }),

  // Map filters
  mapFilters: { minUnits: null, maxUnits: null, minYear: null, maxYear: null },
  setMapFilter: (key, value) =>
    set((state) => ({ mapFilters: { ...state.mapFilters, [key]: value } })),
  clearMapFilters: () =>
    set({ mapFilters: { minUnits: null, maxUnits: null, minYear: null, maxYear: null } }),

  // Include 1-2 family homes
  includeSmallHomes: false,
  setIncludeSmallHomes: (includeSmallHomes) => set({ includeSmallHomes }),

  // Building comparison
  compareBbls: [],
  addToCompare: (bbl) =>
    set((state) => ({
      compareBbls: state.compareBbls.includes(bbl) || state.compareBbls.length >= 2
        ? state.compareBbls
        : [...state.compareBbls, bbl],
    })),
  removeFromCompare: (bbl) =>
    set((state) => ({ compareBbls: state.compareBbls.filter((b) => b !== bbl) })),
  clearCompare: () => set({ compareBbls: [] }),

  // Custom scoring weights
  customWeights: { ...DEFAULT_WEIGHTS },
  useCustomWeights: false,
  setCustomWeight: (key, value) =>
    set((state) => ({
      customWeights: { ...state.customWeights, [key]: value },
    })),
  setUseCustomWeights: (use) => set({ useCustomWeights: use }),
  resetWeights: () => set({ customWeights: { ...DEFAULT_WEIGHTS }, useCustomWeights: false }),
}));
