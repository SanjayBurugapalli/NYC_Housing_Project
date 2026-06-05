"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Home, MessageSquare, HelpCircle, SlidersHorizontal } from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";
import { SearchBar } from "@/components/SearchBar";
import { BuildingPanel } from "@/components/BuildingPanel";
import { InfoPanel } from "@/components/InfoPanel";
import { SearchResultsPanel } from "@/components/SearchResultsPanel";
import { GradeFilter } from "@/components/GradeFilter";
import { MapFiltersPanel } from "@/components/MapFiltersPanel";
import { ComparePanel } from "@/components/ComparePanel";
import { FeedbackModal } from "@/components/FeedbackModal";
import { FreshnessPill } from "@/components/FreshnessPill";
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
 * `entering` (true while open, false while exit-animating) so the caller can
 * choose the enter vs exit animation class. Mounts synchronously during render
 * on the closed→open transition so the panel's first paint includes the
 * slide-in animation class — otherwise the panel can flash into place before
 * the animation has a chance to run.
 */
function useSlidePanel(open: boolean): { shouldRender: boolean; entering: boolean } {
  const [mounted, setMounted] = useState(open);

  if (open && !mounted) {
    setMounted(true);
  }

  useEffect(() => {
    if (!open && mounted) {
      const t = setTimeout(() => setMounted(false), SLIDE_EXIT_MS);
      return () => clearTimeout(t);
    }
  }, [open, mounted]);

  return { shouldRender: mounted, entering: open };
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
  const gradeFilter = useStore((s) => s.gradeFilter);
  const mapFilters = useStore((s) => s.mapFilters);
  const [showInfo, setShowInfo] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [lastOpened, setLastOpened] = useState<"building" | "info">("building");
  // Which of {building detail, search results} the user opened most recently —
  // decides which slides on top when both are visible (see buildingOverSearch).
  const [topPanel, setTopPanel] = useState<"building" | "search">("building");

  const activeFilterCount =
    gradeFilter.length +
    [mapFilters.minUnits, mapFilters.maxUnits, mapFilters.minYear, mapFilters.maxYear].filter(
      (v) => v != null
    ).length;

  // Remember the last bbl shown so the BuildingPanel keeps rendering content
  // during its exit slide-out (after selectedBuilding is cleared to null).
  const lastBblRef = useRef<string | null>(null);
  if (selectedBuilding) lastBblRef.current = selectedBuilding;

  useEffect(() => {
    if (selectedBuilding) setLastOpened("building");
  }, [selectedBuilding]);

  // Selecting a building (including clicking a search result) brings the
  // building panel forward; kicking off a search brings the results forward,
  // even over an already-open building panel.
  useEffect(() => {
    if (selectedBuilding) setTopPanel("building");
  }, [selectedBuilding]);
  useEffect(() => {
    if (isSearching) setTopPanel("search");
  }, [isSearching]);

  const showBuildingPanel = !!selectedBuilding && (!showInfo || lastOpened === "building");
  const showInfoPanel = showInfo && (!selectedBuilding || lastOpened === "info");
  // Keep the results panel open for the zero-result case so the clarification
  // is visible — otherwise it'd flash open during search then close immediately.
  const showSearchResults = isSearching || searchResults.length > 0 || !!searchClarification;
  const buildingSlide = useSlidePanel(showBuildingPanel);
  const infoSlide = useSlidePanel(showInfoPanel);
  const searchSlide = useSlidePanel(showSearchResults);

  // When both the building detail and the search results are visible, the more
  // recently opened one slides on top: clicking a result raises the building
  // panel (so you see what you clicked), while running a new search raises the
  // results above an already-open building panel. Keyed on shouldRender so the
  // close-animation slides out in the same relative order.
  const buildingOverSearch =
    buildingSlide.shouldRender && searchSlide.shouldRender && topPanel === "building";

  // Hide the corner controls when any panel is rendered (including during exit).
  const anyPanelRendered = buildingSlide.shouldRender || infoSlide.shouldRender || searchSlide.shouldRender;

  return (
    <main className="relative h-dvh w-screen overflow-hidden">
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

      {/* Data freshness pill — display only. Anchored to the top-left corner. */}
      <div className="absolute top-4 left-4 z-10">
        <FreshnessPill />
      </div>

      {/* Grade filter + map filters.
          Desktop: always-open stack. Mobile: collapsed behind a compact pill
          that grows the panel upward so it never runs off the bottom edge.
          Hidden on mobile when any side panel is open so it doesn't sit on
          top of the building/info/search bottom sheets. Desktop stays visible
          since the panels there only cover the right edge. */}
      <div className={`absolute bottom-1 left-28 md:bottom-14 md:left-4 z-20 flex w-44 max-w-[calc(100vw-1rem)] flex-col gap-2 pointer-events-auto transition-opacity duration-150 ${anyPanelRendered ? "pointer-events-none opacity-0 md:pointer-events-auto md:opacity-100" : "opacity-100"}`}>
        <div className={`${showMobileFilters ? "block" : "hidden"} md:block`}>
          <GradeFilter />
          <MapFiltersPanel />
        </div>
        <button
          type="button"
          onClick={() => setShowMobileFilters((v) => !v)}
          className="flex items-center gap-1.5 self-start rounded-lg border border-gray-600 bg-gray-800/95 px-3 py-2 text-sm font-semibold text-gray-200 backdrop-blur-sm shadow-lg active:bg-gray-700 md:hidden"
          aria-expanded={showMobileFilters}
          aria-label="Toggle filters"
        >
          <SlidersHorizontal className="h-4 w-4" />
          <span>Filters</span>
          {activeFilterCount > 0 && (
            <span className="rounded-full bg-blue-600 px-1.5 text-[10px] font-bold leading-4 text-white">
              {activeFilterCount}
            </span>
          )}
          <span className={`text-xs text-gray-400 transition-transform ${showMobileFilters ? "rotate-180" : ""}`}>▾</span>
        </button>
      </div>

      {/* Desktop feedback button — always visible */}
      <div className="absolute bottom-16 right-4 z-20 hidden md:block">
        <button
          onClick={() => setShowFeedback(true)}
          className="flex items-center gap-1.5 rounded-lg border border-gray-600 bg-gray-800/95 px-3 py-2 text-sm font-semibold text-gray-300 backdrop-blur-sm hover:bg-gray-700 hover:text-white transition-colors shadow-lg"
          aria-label="Submit feedback"
        >
          💬 Feedback
        </button>
      </div>

      {/* Desktop home + about — hidden when any right panel is open */}
      <div className={`absolute bottom-6 right-4 z-20 hidden items-center gap-2 transition-opacity duration-150 md:flex ${anyPanelRendered ? "pointer-events-none opacity-0" : "opacity-100"}`}>
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

      {/* Mobile nav — compact icon buttons, hidden when any panel is open
          (the bottom sheet covers this corner). aria-label avoids "Submit
          feedback" so the external-widget z-index rule in globals.css can't
          demote this cluster. */}
      <div className={`absolute bottom-1 right-10 z-20 flex items-center gap-2 transition-opacity duration-150 md:hidden ${anyPanelRendered ? "pointer-events-none opacity-0" : "opacity-100"}`}>
        <Link
          href="/"
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-600 bg-gray-800/95 text-gray-300 backdrop-blur-sm shadow-lg active:bg-gray-700"
          aria-label="Back to home"
        >
          <Home className="h-5 w-5" />
        </Link>
        <button
          onClick={() => setShowFeedback(true)}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-600 bg-gray-800/95 text-gray-300 backdrop-blur-sm shadow-lg active:bg-gray-700"
          aria-label="Send feedback"
        >
          <MessageSquare className="h-5 w-5" />
        </button>
        <button
          onClick={() => { setShowInfo(true); setLastOpened("info"); }}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-600 bg-gray-800/95 text-blue-400 backdrop-blur-sm shadow-lg active:bg-gray-700"
          aria-label="About this project"
        >
          <HelpCircle className="h-5 w-5" />
        </button>
      </div>

      {/*
        Right-side panel stacking (desktop):
          z-20  info panel
          z-30  search results
          building detail  — z-10 normally, z-40 when a result was clicked so
                            it slides on top of the still-open results panel
        Mobile bottom sheets keep the same relative ordering.
      */}

      {/* Building detail panel */}
      {buildingSlide.shouldRender && lastBblRef.current && (
        <>
          <div className={`absolute bottom-0 left-0 right-0 h-[70dvh] md:hidden ${buildingOverSearch ? "z-40" : "z-10"} ${buildingSlide.entering ? "animate-slide-in-bottom" : "animate-slide-out-bottom"}`}>
            <BuildingPanel bbl={lastBblRef.current} />
          </div>
          <div className={`absolute top-0 right-0 hidden h-full w-96 md:block ${buildingOverSearch ? "z-40" : "z-10"} ${buildingSlide.entering ? "animate-slide-in-right" : "animate-slide-out-right"}`}>
            <BuildingPanel bbl={lastBblRef.current} />
          </div>
        </>
      )}

      {/* Info panel */}
      {infoSlide.shouldRender && (
        <>
          <div className={`absolute bottom-0 left-0 right-0 z-20 h-[70dvh] md:hidden ${infoSlide.entering ? "animate-slide-in-bottom" : "animate-slide-out-bottom"}`}>
            <InfoPanel onClose={() => setShowInfo(false)} />
          </div>
          <div className={`absolute top-0 right-0 z-20 hidden h-full w-96 md:block ${infoSlide.entering ? "animate-slide-in-right" : "animate-slide-out-right"}`}>
            <InfoPanel onClose={() => setShowInfo(false)} />
          </div>
        </>
      )}

      {/* Search results panel */}
      {searchSlide.shouldRender && (
        <>
          <div className={`absolute bottom-0 left-0 right-0 z-30 h-[50dvh] md:hidden ${searchSlide.entering ? "animate-slide-in-bottom" : "animate-slide-out-bottom"}`}>
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
