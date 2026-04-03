import { create } from "zustand";
import type { BuildingSummary, ViewportBounds } from "@/types/building";
import type mapboxgl from "mapbox-gl";

export interface CategoryWeights {
  heat_hot_water: number;
  pest_rodent: number;
  structural_safety: number;
  hpd_severity: number;
  noise: number;
  litigation: number;
}

export const DEFAULT_WEIGHTS: CategoryWeights = {
  heat_hot_water: 0.20,
  pest_rodent: 0.22,
  structural_safety: 0.20,
  hpd_severity: 0.20,
  noise: 0.05,
  litigation: 0.13,
};

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

  // Custom scoring weights
  customWeights: CategoryWeights;
  useCustomWeights: boolean;
  setCustomWeight: (key: keyof CategoryWeights, value: number) => void;
  setUseCustomWeights: (use: boolean) => void;
  resetWeights: () => void;
}

export const useStore = create<AppState>((set) => ({
  // Map viewport — default to NYC center
  viewport: { west: -74.26, south: 40.49, east: -73.7, north: 40.92 },
  zoom: 11,
  setViewport: (viewport, zoom) => set({ viewport, zoom }),

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
