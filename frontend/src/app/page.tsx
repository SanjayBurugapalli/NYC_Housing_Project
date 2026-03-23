"use client";

import dynamic from "next/dynamic";
import { SearchBar } from "@/components/SearchBar";
import { BuildingPanel } from "@/components/BuildingPanel";
import { Legend } from "@/components/Legend";
import { useStore } from "@/lib/store";

const Map = dynamic(() => import("@/components/Map").then((m) => m.Map), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-gray-900" />,
});

export default function Home() {
  const selectedBuilding = useStore((s) => s.selectedBbl);
  const buildingCount = useStore((s) => s.buildingCount);
  const zoom = useStore((s) => s.zoom);
  const searchResults = useStore((s) => s.searchResults);

  return (
    <main className="relative h-screen w-screen">
      <Map />

      {/* Search bar */}
      <div className="absolute top-4 left-4 right-4 z-10 flex justify-center pointer-events-none">
        <div className="pointer-events-auto w-full max-w-xl">
          <SearchBar />
        </div>
      </div>

      {/* Building count / search results indicator */}
      <div className="absolute top-20 left-1/2 z-10 -translate-x-1/2">
        {searchResults.length > 0 ? (
          <div className="rounded-full bg-blue-600/90 px-3 py-1 text-xs text-white backdrop-blur-sm">
            {searchResults.length} search result{searchResults.length !== 1 ? "s" : ""}
          </div>
        ) : zoom >= 13 && buildingCount > 0 ? (
          <div className="rounded-full bg-gray-800/80 px-3 py-1 text-xs text-gray-300 backdrop-blur-sm">
            {buildingCount.toLocaleString()} buildings in view
          </div>
        ) : null}
      </div>

      <Legend />

      {/* Building detail panel — responsive */}
      {selectedBuilding && (
        <>
          {/* Mobile: full-width bottom sheet */}
          <div className="absolute bottom-0 left-0 right-0 z-20 h-[70vh] md:hidden">
            <BuildingPanel bbl={selectedBuilding} />
          </div>
          {/* Desktop: right sidebar */}
          <div className="absolute top-0 right-0 z-10 hidden h-full w-96 md:block">
            <BuildingPanel bbl={selectedBuilding} />
          </div>
        </>
      )}
    </main>
  );
}
