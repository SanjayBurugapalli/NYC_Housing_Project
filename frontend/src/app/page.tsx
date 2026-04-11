"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { SearchBar } from "@/components/SearchBar";
import { BuildingPanel } from "@/components/BuildingPanel";
import { InfoPanel } from "@/components/InfoPanel";
import { SearchResultsPanel } from "@/components/SearchResultsPanel";
import { GradeFilter } from "@/components/GradeFilter";
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
  const searchClarification = useStore((s) => s.searchClarification);
  const [showInfo, setShowInfo] = useState(false);
  // Which panel was opened most recently — determines priority when both are open
  const [lastOpened, setLastOpened] = useState<"building" | "info">("building");

  // When a building is selected, it takes priority over info
  useEffect(() => {
    if (selectedBuilding) setLastOpened("building");
  }, [selectedBuilding]);

  const showBuildingPanel = !!selectedBuilding && (!showInfo || lastOpened === "building");
  const showInfoPanel = showInfo && (!selectedBuilding || lastOpened === "info");
  const showSearchResults = searchResults.length > 0 && !selectedBuilding && !showInfo;

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

      {/* Grade filter (doubles as legend) */}
      <div className="absolute bottom-6 left-4 z-20 pointer-events-auto">
        <GradeFilter />
      </div>

      {/* Info button */}
      <button
        onClick={() => { setShowInfo(true); setLastOpened("info"); }}
        className="absolute bottom-6 right-4 z-20 flex items-center gap-1.5 rounded-lg border border-gray-600 bg-gray-800/95 px-3 py-2 text-sm font-semibold text-blue-400 backdrop-blur-sm hover:bg-gray-700 hover:text-white transition-colors shadow-lg"
        aria-label="About this project"
      >
        <span className="text-base leading-none">?</span>
        <span>About &amp; Guide</span>
      </button>

      {/* Info panel */}
      {showInfoPanel && (
        <>
          {/* Mobile: full-width bottom sheet */}
          <div className="absolute bottom-0 left-0 right-0 z-20 h-[70vh] md:hidden">
            <InfoPanel onClose={() => setShowInfo(false)} />
          </div>
          {/* Desktop: right sidebar */}
          <div className="absolute top-0 right-0 z-10 hidden h-full w-96 md:block">
            <InfoPanel onClose={() => setShowInfo(false)} />
          </div>
        </>
      )}

      {/* Search results panel — shows when results exist and no building is selected */}
      {showSearchResults && (
        <>
          {/* Mobile: compact list at bottom */}
          <div className="absolute bottom-0 left-0 right-0 z-20 h-[50vh] md:hidden">
            <SearchResultsPanel clarification={searchClarification} />
          </div>
          {/* Desktop: right sidebar */}
          <div className="absolute top-0 right-0 z-10 hidden h-full w-96 md:block">
            <SearchResultsPanel clarification={searchClarification} />
          </div>
        </>
      )}

      {/* Building detail panel — responsive */}
      {showBuildingPanel && (
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
