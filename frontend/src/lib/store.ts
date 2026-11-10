import { create } from "zustand";
import type {
  Borough,
  BuildingSummary,
  FilterChip,
  FoodCategory,
  SearchFilters,
  ViewportBounds,
  Workplace,
} from "@/types/building";
import type mapboxgl from "mapbox-gl";
import { DEFAULT_WEIGHTS, type CategoryWeights } from "@/lib/scoringWeights";
import { GRADES } from "@/lib/grades";

// Re-exported so existing `@/lib/store` importers keep working; the canonical
// definition now lives in scoringWeights.ts.
export { DEFAULT_WEIGHTS };
export type { CategoryWeights };

/**
 * Which face of the floating building card is showing:
 *   summary — the centered snapshot (grade, commute, food, owner)
 *   deep    — "What's behind this grade" (sub-scores + paper trail)
 *   commute — map-forward commute card docked at the bottom
 *   food    — map-forward food card docked at the bottom
 */
export type CardView = "summary" | "deep" | "commute" | "food";

/** Sentinel that matches no grade, so hiding all five letters empties the map. */
const NO_GRADES = "__none__";

interface AppState {
  // Map viewport
  viewport: ViewportBounds;
  zoom: number;
  setViewport: (viewport: ViewportBounds, zoom: number) => void;

  // Map reference (for flyTo from search). Set once the style has loaded, so a
  // non-null mapRef is always safe to add sources/layers to.
  mapRef: mapboxgl.Map | null;
  setMapRef: (map: mapboxgl.Map | null) => void;

  // Building count visible on map
  buildingCount: number;
  setBuildingCount: (count: number) => void;

  // Selected building + which card face is open
  selectedBbl: string | null;
  selectBuilding: (bbl: string | null) => void;
  cardView: CardView;
  setCardView: (view: CardView) => void;
  /** Coordinates + grade of the selected building once known (drives the map highlight). */
  selectedLocation: { lng: number; lat: number; grade: string } | null;
  setSelectedLocation: (loc: { lng: number; lat: number; grade: string } | null) => void;

  // Search
  searchQuery: string;
  searchResults: BuildingSummary[];
  isSearching: boolean;
  searchError: string | null;
  searchClarification: string | null;
  /** Validated filters behind the current results ("Here's how I read that"). */
  searchFilters: SearchFilters | null;
  filterChips: FilterChip[];
  setSearchQuery: (query: string) => void;
  setSearchResults: (results: BuildingSummary[]) => void;
  setIsSearching: (isSearching: boolean) => void;
  setSearchError: (error: string | null) => void;
  setSearchClarification: (clarification: string | null) => void;
  setSearchInterpretation: (filters: SearchFilters | null, chips: FilterChip[]) => void;
  clearSearch: () => void;

  // Grade filter: the grades shown on the map (empty = all shown). The UI
  // reads as "tap to hide a letter", so toggleGrade hides/shows one grade.
  gradeFilter: string[];
  toggleGrade: (grade: string) => void;
  clearGradeFilter: () => void;

  // Map filters (applied to viewport buildings layer)
  mapFilters: { minUnits: number | null; maxUnits: number | null; minYear: number | null; maxYear: number | null };
  setMapFilter: (key: "minUnits" | "maxUnits" | "minYear" | "maxYear", value: number | null) => void;
  clearMapFilters: () => void;

  // Include 1-2 family homes — shared by search and the map layer. The map
  // UI presents the inverse as the "3+ units only" chip.
  includeSmallHomes: boolean;
  setIncludeSmallHomes: (include: boolean) => void;

  // "Rent stabilized" map chip (likely-stabilized buildings only)
  rentStabilizedOnly: boolean;
  setRentStabilizedOnly: (only: boolean) => void;

  // Borough chip: limits the map layers and plain-English searches (null = all NYC)
  boroughFilter: Borough | null;
  setBoroughFilter: (borough: Borough | null) => void;

  // Buildings opened recently (newest first) — quick picks in the compare picker
  recentBbls: string[];
  pushRecentBbl: (bbl: string) => void;

  // Building comparison (max 2)
  compareBbls: string[];
  addToCompare: (bbl: string) => void;
  removeFromCompare: (bbl: string) => void;
  clearCompare: () => void;
  compareOpen: boolean;
  setCompareOpen: (open: boolean) => void;

  // Commute: the saved work address (persisted)
  workplace: Workplace | null;
  setWorkplace: (workplace: Workplace | null) => void;
  /** Bumped by "Replay route" to redraw the commute animation. */
  routeReplayKey: number;
  replayRoute: () => void;

  /** Load the saved work address + recent buildings (call once, after mount). */
  hydratePersisted: () => void;

  // Food nearby: which kinds are shown on the map, and the place opened on it
  foodCategories: Record<FoodCategory, boolean>;
  toggleFoodCategory: (category: FoodCategory) => void;
  activeFoodId: string | null;
  setActiveFoodId: (id: string | null) => void;

  // Custom scoring weights (rankings page)
  customWeights: CategoryWeights;
  useCustomWeights: boolean;
  setCustomWeight: (key: keyof CategoryWeights, value: number) => void;
  setUseCustomWeights: (use: boolean) => void;
  resetWeights: () => void;
}

const VIEWPORT_STORAGE_KEY = "nyc_map_viewport";
const WORKPLACE_STORAGE_KEY = "byr_workplace";
const RECENT_STORAGE_KEY = "byr_recent_buildings";
const RECENT_MAX = 6;

function loadRecent(): string[] {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(RECENT_STORAGE_KEY) : null;
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((b) => typeof b === "string" && /^\d{10}$/.test(b)).slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

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

function loadWorkplace(): Workplace | null {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(WORKPLACE_STORAGE_KEY) : null;
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.label === "string" &&
      typeof parsed?.latitude === "number" &&
      typeof parsed?.longitude === "number"
    ) {
      return parsed;
    }
  } catch {
    // ignore parse errors
  }
  return null;
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

  // Selected building — every new selection opens on the summary face
  selectedBbl: null,
  selectBuilding: (bbl) =>
    set((state) => ({
      selectedBbl: bbl,
      cardView: "summary",
      activeFoodId: null,
      selectedLocation: bbl && bbl === state.selectedBbl ? state.selectedLocation : null,
    })),
  cardView: "summary",
  setCardView: (cardView) => set({ cardView }),
  selectedLocation: null,
  setSelectedLocation: (selectedLocation) => set({ selectedLocation }),

  // Search
  searchQuery: "",
  searchResults: [],
  isSearching: false,
  searchError: null,
  searchClarification: null,
  searchFilters: null,
  filterChips: [],
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSearchResults: (results) => set({ searchResults: results }),
  setIsSearching: (isSearching) => set({ isSearching }),
  setSearchError: (error) => set({ searchError: error }),
  setSearchClarification: (clarification) => set({ searchClarification: clarification }),
  setSearchInterpretation: (searchFilters, filterChips) => set({ searchFilters, filterChips }),
  clearSearch: () =>
    set({
      searchQuery: "",
      searchResults: [],
      isSearching: false,
      searchError: null,
      searchClarification: null,
      searchFilters: null,
      filterChips: [],
    }),

  // Grade filter
  gradeFilter: [],
  toggleGrade: (grade) =>
    set((state) => {
      const shown = state.gradeFilter.length === 0
        ? [...GRADES]
        : state.gradeFilter.filter((g) => g !== NO_GRADES);
      const next = shown.includes(grade as (typeof GRADES)[number])
        ? shown.filter((g) => g !== grade)
        : [...shown, grade];
      if (next.length === GRADES.length) return { gradeFilter: [] };
      if (next.length === 0) return { gradeFilter: [NO_GRADES] };
      return { gradeFilter: next };
    }),
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

  rentStabilizedOnly: false,
  setRentStabilizedOnly: (rentStabilizedOnly) => set({ rentStabilizedOnly }),

  boroughFilter: null,
  setBoroughFilter: (boroughFilter) => set({ boroughFilter }),

  recentBbls: [],
  pushRecentBbl: (bbl) =>
    set((state) => {
      if (state.recentBbls[0] === bbl) return {};
      const recentBbls = [bbl, ...state.recentBbls.filter((b) => b !== bbl)].slice(0, RECENT_MAX);
      try {
        localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(recentBbls));
      } catch {
        // private mode — keep the in-memory list
      }
      return { recentBbls };
    }),

  // Building comparison
  compareBbls: [],
  addToCompare: (bbl) =>
    set((state) => ({
      compareBbls: state.compareBbls.includes(bbl) || state.compareBbls.length >= 2
        ? state.compareBbls
        : [...state.compareBbls, bbl],
    })),
  // Removing keeps the compare dialog open — the empty slot turns into a picker.
  removeFromCompare: (bbl) =>
    set((state) => ({ compareBbls: state.compareBbls.filter((b) => b !== bbl) })),
  clearCompare: () => set({ compareBbls: [], compareOpen: false }),
  compareOpen: false,
  setCompareOpen: (compareOpen) => set({ compareOpen }),

  // Commute
  // Starts empty so the server render and the first client render match;
  // hydratePersisted() fills it from localStorage after mount.
  workplace: null,
  setWorkplace: (workplace) => {
    try {
      if (workplace) localStorage.setItem(WORKPLACE_STORAGE_KEY, JSON.stringify(workplace));
      else localStorage.removeItem(WORKPLACE_STORAGE_KEY);
    } catch {
      // ignore quota / privacy-mode errors — the value still lives for the session
    }
    set({ workplace });
  },
  routeReplayKey: 0,
  replayRoute: () => set((state) => ({ routeReplayKey: state.routeReplayKey + 1 })),

  hydratePersisted: () => set({ workplace: loadWorkplace(), recentBbls: loadRecent() }),

  // Food nearby
  foodCategories: { deli: true, grocery: true, restaurant: true },
  toggleFoodCategory: (category) =>
    set((state) => ({
      foodCategories: { ...state.foodCategories, [category]: !state.foodCategories[category] },
    })),
  activeFoodId: null,
  setActiveFoodId: (activeFoodId) => set({ activeFoodId }),

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
