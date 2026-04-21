"use client";

import { useState, useEffect, Suspense } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { SearchBar } from "@/components/SearchBar";
import { BuildingPanel } from "@/components/BuildingPanel";
import { InfoPanel } from "@/components/InfoPanel";
import { SearchResultsPanel } from "@/components/SearchResultsPanel";
import { GradeFilter } from "@/components/GradeFilter";
import { MapFiltersPanel } from "@/components/MapFiltersPanel";
import { ComparePanel } from "@/components/ComparePanel";
import { useStore } from "@/lib/store";

const Map = dynamic(() => import("@/components/Map").then((m) => m.Map), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-gray-900" />,
});

/** Syncs selectedBbl ↔ ?bbl= URL param without causing a full navigation. */
function BblUrlSync() {
  const params = useSearchParams();
  const router = useRouter();
  const selectedBuilding = useStore((s) => s.selectedBbl);
  const selectBuilding = useStore((s) => s.selectBuilding);

  // On mount: if ?bbl= is present, open that building
  useEffect(() => {
    const bbl = params.get("bbl");
    if (bbl && /^\d{10}$/.test(bbl)) selectBuilding(bbl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount only

  // When selectedBuilding changes: keep URL in sync
  useEffect(() => {
    const current = new URLSearchParams(window.location.search);
    if (selectedBuilding) {
      if (current.get("bbl") === selectedBuilding) return;
      current.set("bbl", selectedBuilding);
    } else {
      if (!current.has("bbl")) return;
      current.delete("bbl");
    }
    router.replace(`/map?${current.toString()}`, { scroll: false });
  }, [selectedBuilding, router]);

  return null;
}

export default function MapPage() {
  const selectedBuilding = useStore((s) => s.selectedBbl);
  const buildingCount = useStore((s) => s.buildingCount);
  const zoom = useStore((s) => s.zoom);
  const searchResults = useStore((s) => s.searchResults);
  const isSearching = useStore((s) => s.isSearching);
  const searchClarification = useStore((s) => s.searchClarification);
  const [showInfo, setShowInfo] = useState(false);
  const [lastOpened, setLastOpened] = useState<"building" | "info">("building");

  useEffect(() => {
    if (selectedBuilding) setLastOpened("building");
  }, [selectedBuilding]);

  const showBuildingPanel = !!selectedBuilding && (!showInfo || lastOpened === "building");
  const showInfoPanel = showInfo && (!selectedBuilding || lastOpened === "info");
  const showSearchResults = (isSearching || searchResults.length > 0) && !selectedBuilding && !showInfo;

  return (
    <main className="relative h-screen w-screen overflow-hidden">
      <Suspense fallback={null}><BblUrlSync /></Suspense>
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

      {/* Grade filter + map filters */}
      <div className="absolute bottom-14 left-2 z-20 pointer-events-auto w-44">
        <GradeFilter />
        <MapFiltersPanel />
      </div>

      {/* Home link + Info button — hidden when any right panel is open */}
      <div className={`absolute bottom-6 right-4 z-20 flex items-center gap-2 transition-opacity duration-150 ${showBuildingPanel || showInfoPanel || showSearchResults ? "pointer-events-none opacity-0" : "opacity-100"}`}>
        <Link
          href="/"
          className="flex items-center gap-1.5 rounded-lg border border-gray-600 bg-gray-800/95 px-3 py-2 text-sm font-semibold text-gray-400 backdrop-blur-sm hover:bg-gray-700 hover:text-white transition-colors shadow-lg"
          aria-label="Back to home"
        >
          ← Home
        </Link>
        <button
          onClick={() => { setShowInfo(true); setLastOpened("info"); }}
          className="flex items-center gap-1.5 rounded-lg border border-gray-600 bg-gray-800/95 px-3 py-2 text-sm font-semibold text-blue-400 backdrop-blur-sm hover:bg-gray-700 hover:text-white transition-colors shadow-lg"
          aria-label="About this project"
        >
          <span className="text-base leading-none">?</span>
          <span>About &amp; Guide</span>
        </button>
      </div>

      {/* Info panel */}
      {showInfoPanel && (
        <>
          <div className="absolute bottom-0 left-0 right-0 z-20 h-[70vh] md:hidden">
            <InfoPanel onClose={() => setShowInfo(false)} />
          </div>
          <div className="absolute top-0 right-0 z-10 hidden h-full w-96 md:block">
            <InfoPanel onClose={() => setShowInfo(false)} />
          </div>
        </>
      )}

      {/* Search results panel */}
      {showSearchResults && (
        <>
          <div className="absolute bottom-0 left-0 right-0 z-20 h-[50vh] md:hidden">
            <SearchResultsPanel clarification={searchClarification} />
          </div>
          <div className="absolute top-0 right-0 z-10 hidden h-full w-96 md:block">
            <SearchResultsPanel clarification={searchClarification} />
          </div>
        </>
      )}

      {/* Compare panel */}
      <ComparePanel />

      {/* Building detail panel */}
      {showBuildingPanel && (
        <>
          <div className="absolute bottom-0 left-0 right-0 z-20 h-[70vh] md:hidden">
            <BuildingPanel bbl={selectedBuilding} />
          </div>
          <div className="absolute top-0 right-0 z-10 hidden h-full w-96 md:block">
            <BuildingPanel bbl={selectedBuilding} />
          </div>
        </>
      )}
    </main>
  );
}
