import { create } from "zustand";
import type { BuildingSummary, ViewportBounds } from "@/types/building";

interface AppState {
  // Map viewport
  viewport: ViewportBounds;
  zoom: number;
  setViewport: (viewport: ViewportBounds, zoom: number) => void;

  // Selected building
  selectedBbl: string | null;
  selectBuilding: (bbl: string | null) => void;

  // Search
  searchQuery: string;
  searchResults: BuildingSummary[];
  isSearching: boolean;
  setSearchQuery: (query: string) => void;
  setSearchResults: (results: BuildingSummary[]) => void;
  setIsSearching: (isSearching: boolean) => void;
  clearSearch: () => void;
}

export const useStore = create<AppState>((set) => ({
  // Map viewport — default to NYC center
  viewport: { west: -74.26, south: 40.49, east: -73.7, north: 40.92 },
  zoom: 11,
  setViewport: (viewport, zoom) => set({ viewport, zoom }),

  // Selected building
  selectedBbl: null,
  selectBuilding: (bbl) => set({ selectedBbl: bbl }),

  // Search
  searchQuery: "",
  searchResults: [],
  isSearching: false,
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSearchResults: (results) => set({ searchResults: results }),
  setIsSearching: (isSearching) => set({ isSearching }),
  clearSearch: () =>
    set({ searchQuery: "", searchResults: [], isSearching: false }),
}));
