import { create } from "zustand";
import type { BuildingSummary, ViewportBounds } from "@/types/building";
import type mapboxgl from "mapbox-gl";

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
  setSearchQuery: (query: string) => void;
  setSearchResults: (results: BuildingSummary[]) => void;
  setIsSearching: (isSearching: boolean) => void;
  setSearchError: (error: string | null) => void;
  clearSearch: () => void;
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
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSearchResults: (results) => set({ searchResults: results }),
  setIsSearching: (isSearching) => set({ isSearching }),
  setSearchError: (error) => set({ searchError: error }),
  clearSearch: () =>
    set({ searchQuery: "", searchResults: [], isSearching: false, searchError: null }),
}));
