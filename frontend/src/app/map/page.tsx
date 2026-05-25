"use client";

import { useState, useEffect, useRef, Suspense } from "react";
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
import { FeedbackModal } from "@/components/FeedbackModal";
import { useStore } from "@/lib/store";

const Map = dynamic(() => import("@/components/Map").then((m) => m.Map), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-gray-900" />,
});

// Must match the keyframe duration in tailwind.config.ts (slide-out-* = 220ms)
const SLIDE_EXIT_MS = 220;

/**
 * Keeps a panel mounted long enough to play its exit animation when `open` flips
 * to false. Returns `shouldRender` (true while open OR animating out) and
 * `entering` (one-shot true on the first render after open becomes true) so the
 * caller can choose the enter vs exit animation class.
 */
function useSlidePanel(open: boolean): { shouldRender: boolean; entering: boolean } {
  const [shouldRender, setShouldRender] = useState(open);
  const [entering, setEntering] = useState(open);
  const wasOpen = useRef(open);

  useEffect(() => {
    if (open && !wasOpen.current) {
      // Closed → open: render immediately and mark as entering
      setShouldRender(true);
      setEntering(true);
    } else if (!open && wasOpen.current) {
      // Open → closed: keep mounted for the exit animation
      setEntering(false);
      const t = setTimeout(() => setShouldRender(false), SLIDE_EXIT_MS);
      wasOpen.current = open;
      return () => clearTimeout(t);
    }
    wasOpen.current = open;
  }, [open]);

  return { shouldRender, entering };
}

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
  const [showFeedback, setShowFeedback] = useState(false);
  const [lastOpened, setLastOpened] = useState<"building" | "info">("building");

  // Remember the last bbl shown so the BuildingPanel keeps rendering content
  // during its exit slide-out (after selectedBuilding is cleared to null).
  const lastBblRef = useRef<string | null>(null);
  if (selectedBuilding) lastBblRef.current = selectedBuilding;

  useEffect(() => {
    if (selectedBuilding) setLastOpened("building");
  }, [selectedBuilding]);

  const showBuildingPanel = !!selectedBuilding && (!showInfo || lastOpened === "building");
  const showInfoPanel = showInfo && (!selectedBuilding || lastOpened === "info");
  // Search results now overlay above the building view when both are active.
  const showSearchResults = isSearching || searchResults.length > 0;

  const buildingSlide = useSlidePanel(showBuildingPanel);
  const infoSlide = useSlidePanel(showInfoPanel);
  const searchSlide = useSlidePanel(showSearchResults);

  // Hide the corner controls when any panel is rendered (including during exit).
  const anyPanelRendered = buildingSlide.shouldRender || infoSlide.shouldRender || searchSlide.shouldRender;

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

      {/* Feedback button — always visible */}
      <div className="absolute bottom-16 right-4 z-20">
        <button
          onClick={() => setShowFeedback(true)}
          className="flex items-center gap-1.5 rounded-lg border border-gray-600 bg-gray-800/95 px-3 py-2 text-sm font-semibold text-gray-300 backdrop-blur-sm hover:bg-gray-700 hover:text-white transition-colors shadow-lg"
          aria-label="Submit feedback"
        >
          💬 Feedback
        </button>
      </div>

      {/* Home link + Info button — hidden when any right panel is open */}
      <div className={`absolute bottom-6 right-4 z-20 flex items-center gap-2 transition-opacity duration-150 ${anyPanelRendered ? "pointer-events-none opacity-0" : "opacity-100"}`}>
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

      {/*
        Right-side panel stacking (desktop):
          z-10  building detail  (lowest — sits behind search results)
          z-20  info panel
          z-30  search results   (overlays everything when search is active)
        Mobile bottom sheets keep the same relative ordering.
      */}

      {/* Building detail panel */}
      {buildingSlide.shouldRender && lastBblRef.current && (
        <>
          <div className={`absolute bottom-0 left-0 right-0 z-10 h-[70vh] md:hidden ${buildingSlide.entering ? "animate-slide-in-bottom" : "animate-slide-out-bottom"}`}>
            <BuildingPanel bbl={lastBblRef.current} />
          </div>
          <div className={`absolute top-0 right-0 z-10 hidden h-full w-96 md:block ${buildingSlide.entering ? "animate-slide-in-right" : "animate-slide-out-right"}`}>
            <BuildingPanel bbl={lastBblRef.current} />
          </div>
        </>
      )}

      {/* Info panel */}
      {infoSlide.shouldRender && (
        <>
          <div className={`absolute bottom-0 left-0 right-0 z-20 h-[70vh] md:hidden ${infoSlide.entering ? "animate-slide-in-bottom" : "animate-slide-out-bottom"}`}>
            <InfoPanel onClose={() => setShowInfo(false)} />
          </div>
          <div className={`absolute top-0 right-0 z-20 hidden h-full w-96 md:block ${infoSlide.entering ? "animate-slide-in-right" : "animate-slide-out-right"}`}>
            <InfoPanel onClose={() => setShowInfo(false)} />
          </div>
        </>
      )}

      {/* Search results panel — overlays building/info when active */}
      {searchSlide.shouldRender && (
        <>
          <div className={`absolute bottom-0 left-0 right-0 z-30 h-[50vh] md:hidden ${searchSlide.entering ? "animate-slide-in-bottom" : "animate-slide-out-bottom"}`}>
            <SearchResultsPanel clarification={searchClarification} />
          </div>
          <div className={`absolute top-0 right-0 z-30 hidden h-full w-96 md:block ${searchSlide.entering ? "animate-slide-in-right" : "animate-slide-out-right"}`}>
            <SearchResultsPanel clarification={searchClarification} />
          </div>
        </>
      )}

      {/* Compare panel */}
      <ComparePanel />

      {/* Feedback modal */}
      {showFeedback && (
        <FeedbackModal onClose={() => setShowFeedback(false)} />
      )}
    </main>
  );
}
