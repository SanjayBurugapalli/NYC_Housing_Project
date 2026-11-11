"use client";

import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { useBuilding, useMediaQuery } from "@/hooks/useBuildingData";
import { trackEvent } from "@/lib/api";
import { CloseIcon } from "@/components/ui/icons";
import { SummaryFace, MobileSheet } from "@/components/building/SummaryFace";
import { DeepFace } from "@/components/building/DeepFace";
import { CommuteFace } from "@/components/building/CommuteFace";
import { FoodFace } from "@/components/building/FoodFace";

function CardSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading building">
      <div className="h-9 w-2/3 animate-pulse rounded-lg bg-block" />
      <div className="h-4 w-1/3 animate-pulse rounded bg-block" />
      <div className="h-40 animate-pulse rounded-[22px] bg-block" />
      <div className="grid grid-cols-2 gap-3.5">
        <div className="h-36 animate-pulse rounded-[20px] bg-block" />
        <div className="h-36 animate-pulse rounded-[20px] bg-block" />
      </div>
    </div>
  );
}

/**
 * The floating building card. One component, four faces (see CardView):
 * summary + deep float centered over a faded map and behave like a dialog;
 * commute + food dock at the bottom so the map stays live behind them, and
 * can be minimized to a one-line bar to show more of it.
 * On phones the summary starts as a compact bottom sheet.
 */
export function BuildingCard({ bbl, entering }: { bbl: string; entering: boolean }) {
  const view = useStore((s) => s.cardView);
  const setCardView = useStore((s) => s.setCardView);
  const selectBuilding = useStore((s) => s.selectBuilding);
  const setSelectedLocation = useStore((s) => s.setSelectedLocation);
  const pushRecentBbl = useStore((s) => s.pushRecentBbl);
  const mapRef = useStore((s) => s.mapRef);
  const { data, isLoading, error, refetch } = useBuilding(bbl);
  const isMobile = useMediaQuery("(max-width: 767px)");
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const minimized = useStore((s) => s.cardMinimized);
  const setMinimized = useStore((s) => s.setCardMinimized);
  const closeRef = useRef<HTMLButtonElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const toggled = useRef(false);
  const flownFor = useRef<string | null>(null);

  const close = () => selectBuilding(null);

  useEffect(() => setMobileExpanded(false), [bbl]);

  // Publish the building's location (map highlight for deep links) and bring
  // it to the middle of the map once per building.
  useEffect(() => {
    if (!data || data.latitude == null || data.longitude == null) return;
    setSelectedLocation({ lng: data.longitude, lat: data.latitude, grade: data.grade });
    if (mapRef && flownFor.current !== bbl) {
      flownFor.current = bbl;
      mapRef.easeTo({ center: [data.longitude, data.latitude], zoom: Math.max(mapRef.getZoom(), 15.5), duration: 800 });
    }
  }, [data, bbl, mapRef, setSelectedLocation]);

  useEffect(() => {
    if (!data) return;
    trackEvent("building_view", { bbl, address: data.address, grade: data.grade });
    pushRecentBbl(bbl);
  }, [bbl, data, pushRecentBbl]);

  // Focus the face's close control whenever the face changes. preventScroll:
  // the card mounts mid-animation and the browser would otherwise scroll to it.
  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
  }, [view, bbl, !!data, mobileExpanded]);

  // Minimizing swaps the face for its one-line bar (and back); keep focus on
  // the toggle that was pressed rather than dropping it to the page.
  const toggleMinimized = () => {
    toggled.current = true;
    setMinimized(!minimized);
  };
  useEffect(() => {
    if (!toggled.current) return;
    toggled.current = false;
    toggleRef.current?.focus({ preventScroll: true });
  }, [minimized]);

  // Esc steps back one level: a docked or deep face → summary → closed.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const { activeFoodId, setActiveFoodId } = useStore.getState();
      if (activeFoodId) setActiveFoodId(null);
      else if (view !== "summary") setCardView("summary");
      else if (isMobile && mobileExpanded) setMobileExpanded(false);
      else selectBuilding(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, isMobile, mobileExpanded, setCardView, selectBuilding]);

  // Closing resets the store to the summary face straight away, but the card
  // stays mounted for its exit animation — keep showing the face that was open
  // so it animates out as itself instead of flashing back to the summary.
  const lastView = useRef(view);
  if (entering) lastView.current = view;
  const face = entering ? view : lastView.current;

  const docked = face === "commute" || face === "food";
  const sheet = isMobile && face === "summary" && !mobileExpanded;
  const anim = entering ? "animate-card-in" : "animate-card-out";

  const body = error ? (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <p className="m-0 text-sm font-semibold">We couldn&apos;t load this building.</p>
        <button ref={closeRef} type="button" onClick={close} aria-label="Close" className="icon-btn">
          <CloseIcon size={20} />
        </button>
      </div>
      <button type="button" onClick={() => refetch()} className="btn-ink self-start">Try again</button>
    </div>
  ) : isLoading || !data ? (
    <CardSkeleton />
  ) : face === "deep" ? (
    <DeepFace data={data} onClose={close} closeRef={closeRef} />
  ) : face === "commute" ? (
    <CommuteFace data={data} closeRef={closeRef} minimized={minimized} onToggleMinimized={toggleMinimized} toggleRef={toggleRef} />
  ) : face === "food" ? (
    <FoodFace data={data} closeRef={closeRef} minimized={minimized} onToggleMinimized={toggleMinimized} toggleRef={toggleRef} />
  ) : sheet ? (
    <MobileSheet data={data} onClose={close} onExpand={() => setMobileExpanded(true)} closeRef={closeRef} />
  ) : (
    <SummaryFace data={data} onClose={close} closeRef={closeRef} />
  );

  if (sheet) {
    return (
      <section
        role="dialog"
        aria-labelledby="building-card-title"
        className={`fixed inset-x-0 bottom-0 z-40 max-h-[80dvh] overflow-y-auto rounded-t-[24px] border-t-2 border-ink bg-white px-4 pb-5 pt-2.5 ${
          entering ? "animate-slide-in-bottom" : "animate-slide-out-bottom"
        }`}
      >
        {body}
      </section>
    );
  }

  if (docked) {
    return (
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-3 sm:px-4 sm:pb-7">
        <section
          role="region"
          data-docked-card
          aria-label={face === "commute" ? "Commute" : "Food nearby"}
          className={`card-float pointer-events-auto max-h-[62dvh] w-full overflow-y-auto rounded-[26px] px-4 py-4 shadow-hard-lg sm:px-[22px] sm:py-[18px] ${
            face === "commute" ? "max-w-[880px]" : "max-w-[920px]"
          } ${anim}`}
        >
          {body}
        </section>
      </div>
    );
  }

  // Centered dialog faces (summary / deep) over a faded, click-to-close backdrop.
  return (
    <>
      <div
        aria-hidden="true"
        onClick={close}
        className={`fixed inset-0 z-30 bg-white/50 ${entering ? "animate-fade-in" : "animate-fade-out"}`}
      />
      <div
        className={`pointer-events-none fixed inset-0 z-40 flex justify-center px-3 sm:px-4 ${
          face === "deep" ? "items-center py-3 sm:py-6" : "items-center pb-3 pt-[84px] sm:pb-6"
        }`}
      >
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="building-card-title"
          className={`card-float pointer-events-auto max-h-full w-full overflow-y-auto rounded-[28px] px-5 py-5 shadow-hard-xl sm:px-[26px] sm:py-[22px] ${
            face === "deep" ? "max-w-[960px]" : "max-w-[600px]"
          } ${anim}`}
        >
          {body}
        </section>
      </div>
    </>
  );
}
