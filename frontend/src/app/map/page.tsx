"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { SearchBar } from "@/components/SearchBar";
import { BuildingCard } from "@/components/BuildingCard";
import { InfoPanel } from "@/components/InfoPanel";
import { SearchResultsPanel } from "@/components/SearchResultsPanel";
import { GradeFilter, GradeToggles } from "@/components/GradeFilter";
import { ComparePanel } from "@/components/ComparePanel";
import { FeedbackModal } from "@/components/FeedbackModal";
import { CompareTray, LocateButton, MapControls, WorkButton, ZoomStepper } from "@/components/map/MapChrome";
import { CommuteOverlay, FoodOverlay } from "@/components/map/Overlays";
import { CompareIcon, LogoIcon, RefreshIcon } from "@/components/ui/icons";
import { useStore } from "@/lib/store";
import { usePresence } from "@/hooks/usePresence";
import { useMediaQuery } from "@/hooks/useBuildingData";
import { useSearchRunner } from "@/hooks/useSearchRunner";

const Map = dynamic(() => import("@/components/Map").then((m) => m.Map), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-white" />,
});

// Starter questions under the search bar. Each is phrased so the rule-based
// parser understands it without a Claude call.
const SUGGESTIONS = [
  "Rent-stabilized, no heat complaints",
  "Graded A in Astoria",
  "Worst buildings in Bushwick",
];

/**
 * Syncs selectedBbl ↔ ?bbl= without a full navigation, and runs a search
 * handed over from the landing page via ?q= once on arrival.
 */
function UrlSync() {
  const params = useSearchParams();
  const router = useRouter();
  const selectedBuilding = useStore((s) => s.selectedBbl);
  const selectBuilding = useStore((s) => s.selectBuilding);
  const run = useSearchRunner();

  useEffect(() => {
    const bbl = params.get("bbl");
    if (bbl && /^\d{10}$/.test(bbl)) {
      selectBuilding(bbl);
      return;
    }
    const q = params.get("q");
    if (q) run(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount only

  useEffect(() => {
    const current = new URLSearchParams(window.location.search);
    current.delete("q");
    if (selectedBuilding) {
      if (current.get("bbl") === selectedBuilding && !window.location.search.includes("q=")) return;
      current.set("bbl", selectedBuilding);
    } else {
      if (!current.has("bbl") && !window.location.search.includes("q=")) return;
      current.delete("bbl");
    }
    const qs = current.toString();
    router.replace(qs ? `/map?${qs}` : "/map", { scroll: false });
  }, [selectedBuilding, router]);

  return null;
}

function LogoTile({ size = 56 }: { size?: number }) {
  return (
    <Link
      href="/"
      aria-label="BeforeYouRent home"
      className="flex shrink-0 items-center justify-center rounded-2xl bg-ink text-white hover:bg-ink-2"
      style={{ width: size, height: size }}
    >
      <LogoIcon size={size > 52 ? 26 : 24} />
    </Link>
  );
}

const TOP_BTN = "inline-flex h-12 items-center gap-2 rounded-[14px] border-2 border-ink bg-white px-4 text-sm font-bold text-ink hover:bg-surface";

export default function MapPage() {
  const selectedBbl = useStore((s) => s.selectedBbl);
  const cardView = useStore((s) => s.cardView);
  const searchResults = useStore((s) => s.searchResults);
  const isSearching = useStore((s) => s.isSearching);
  const searchClarification = useStore((s) => s.searchClarification);
  const searchQuery = useStore((s) => s.searchQuery);
  const searchFilters = useStore((s) => s.searchFilters);
  const viewport = useStore((s) => s.viewport);
  const compareBbls = useStore((s) => s.compareBbls);
  const setCompareOpen = useStore((s) => s.setCompareOpen);
  const mapRef = useStore((s) => s.mapRef);
  const run = useSearchRunner();
  const isMobile = useMediaQuery("(max-width: 767px)");

  const [showInfo, setShowInfo] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [mobileFilters, setMobileFilters] = useState(false);

  // Remember the last bbl shown so the card keeps rendering content during its
  // exit animation (after selectedBbl is cleared to null).
  const lastBblRef = useRef<string | null>(null);
  if (selectedBbl) lastBblRef.current = selectedBbl;

  // Keep the results panel open for the zero-result case so the clarification
  // is visible — otherwise it'd flash open during search then close immediately.
  const showResults = isSearching || searchResults.length > 0 || !!searchClarification;
  const card = usePresence(!!selectedBbl);
  const results = usePresence(showResults);
  const info = usePresence(showInfo);

  const docked = !!selectedBbl && (cardView === "commute" || cardView === "food");
  // Summary/deep float over a faded map like a dialog; only the top bar stays.
  const dialog = !!selectedBbl && !docked;
  const resultsDesktop = showResults && !isMobile;

  // Saved work address + recent buildings live in localStorage, which the
  // server render can't see — load them once the page is on the client.
  useEffect(() => {
    useStore.getState().hydratePersisted();
  }, []);

  useEffect(() => {
    if (selectedBbl) setShowInfo(false);
  }, [selectedBbl]);

  useEffect(() => {
    if (!showInfo) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setShowInfo(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showInfo]);

  const locate = () => {
    if (!mapRef || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => mapRef.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 15.5, duration: 1200 }),
      () => {},
      { timeout: 8000, maximumAge: 300_000 }
    );
  };

  const rightButtons = (
    <div className="pointer-events-auto ml-auto flex flex-wrap gap-2">
      <WorkButton className={`${TOP_BTN} px-3.5`} />
      <button
        type="button"
        onClick={() => setCompareOpen(true)}
        title="Compare two buildings side by side"
        className={`${TOP_BTN} px-3.5`}
      >
        <CompareIcon size={18} />
        Compare
        <span className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-ink px-1.5 text-xs text-white">
          {compareBbls.length}
        </span>
      </button>
      <button
        type="button"
        onClick={() => setShowInfo((v) => !v)}
        aria-label="How scores work"
        aria-expanded={showInfo}
        className="h-12 w-12 rounded-[14px] border-2 border-ink bg-white font-display text-xl font-extrabold text-ink hover:bg-surface"
      >
        ?
      </button>
    </div>
  );

  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-white text-ink">
      <Suspense fallback={null}><UrlSync /></Suspense>
      <Map />
      <CommuteOverlay />
      <FoodOverlay />

      {/* Results list: docked left on desktop, bottom sheet on phones */}
      {results.shouldRender && !isMobile && (
        <div className={`absolute inset-y-0 left-0 z-20 w-[430px] max-w-full ${results.entering ? "animate-slide-in-left" : "animate-slide-out-left"}`}>
          <SearchResultsPanel />
        </div>
      )}
      {results.shouldRender && isMobile && (
        <div className={`absolute inset-x-0 bottom-0 z-20 h-[55dvh] ${results.entering ? "animate-slide-in-bottom" : "animate-slide-out-bottom"}`}>
          <SearchResultsPanel mobile />
        </div>
      )}

      {/* Top bar */}
      {!isMobile ? (
        <div className={`pointer-events-none absolute left-4 right-4 top-4 flex flex-wrap items-start gap-3 ${dialog ? "z-[35]" : "z-10"}`}>
          {!resultsDesktop ? (
            <div className="pointer-events-auto flex min-w-0 flex-[0_1_640px] flex-col gap-2.5">
              <div className="flex gap-2.5">
                <LogoTile />
                <SearchBar variant="map" />
              </div>
              {!selectedBbl && !searchQuery && (
                <div className="flex w-max max-w-[calc(100vw-420px)] flex-wrap items-center gap-2 pl-[66px]">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} type="button" onClick={() => run(s)} className="chip">
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            searchFilters && (
              <button
                type="button"
                disabled={isSearching}
                onClick={() => run(searchQuery, { filters: searchFilters, bbox: viewport })}
                className={`${TOP_BTN} pointer-events-auto ml-[430px] shadow-hard-sm disabled:opacity-60`}
              >
                <RefreshIcon size={18} />
                Search this area
              </button>
            )
          )}
          {rightButtons}
        </div>
      ) : (
        <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-col gap-2.5">
          <div className="pointer-events-auto flex gap-2">
            <LogoTile size={52} />
            <SearchBar variant="mobile" onToggleFilters={() => setMobileFilters((v) => !v)} filtersOpen={mobileFilters} />
          </div>
          {!selectedBbl && (
            <div className="card-float pointer-events-auto rounded-[15px] p-1.5">
              <GradeToggles compact />
            </div>
          )}
          {mobileFilters && !selectedBbl && <GradeFilter hideGrades className="pointer-events-auto" />}
        </div>
      )}

      {/* Filters (desktop, bottom-left) */}
      {!isMobile && !resultsDesktop && !selectedBbl && (
        <div className="absolute bottom-4 left-4 z-10 w-[min(332px,calc(100%-32px))]">
          <GradeFilter />
        </div>
      )}

      {/* Detail-level stepper, or the compare tray once something's queued */}
      {!isMobile && !selectedBbl && (
        <div
          className="absolute bottom-4 z-10 hidden -translate-x-1/2 min-[900px]:flex"
          style={{ left: resultsDesktop ? "calc(430px + (100% - 430px) / 2)" : "50%" }}
        >
          {compareBbls.length > 0 ? <CompareTray /> : <ZoomStepper />}
        </div>
      )}
      {isMobile && compareBbls.length > 0 && !selectedBbl && !showResults && (
        <div className="absolute inset-x-3 bottom-3 z-10 flex justify-center">
          <CompareTray />
        </div>
      )}

      {/* Map controls */}
      {!isMobile ? (
        <div className={`absolute bottom-4 right-4 z-10 ${dialog ? "hidden" : docked ? "hidden 2xl:block" : ""}`}>
          <MapControls />
        </div>
      ) : (
        !selectedBbl && !showResults && <LocateButton onClick={locate} className="absolute right-3 top-[45%] z-10" />
      )}

      {/* Building card (all faces) */}
      {card.shouldRender && lastBblRef.current && (
        <BuildingCard bbl={lastBblRef.current} entering={card.entering} />
      )}

      {/* About & scoring */}
      {info.shouldRender && (
        <div
          className={`absolute z-30 ${isMobile ? "inset-3 top-[72px]" : "bottom-4 right-4 top-20 w-[420px] max-w-[calc(100%-32px)]"} ${
            info.entering ? "animate-card-in" : "animate-card-out"
          }`}
        >
          <InfoPanel
            onClose={() => setShowInfo(false)}
            onFeedback={() => {
              setShowInfo(false);
              setShowFeedback(true);
            }}
          />
        </div>
      )}

      <ComparePanel />

      {showFeedback && <FeedbackModal onClose={() => setShowFeedback(false)} />}
    </main>
  );
}
