"use client";

import type { RefObject } from "react";
import { useStore } from "@/lib/store";
import { useCommute } from "@/hooks/useBuildingData";
import { ApiError } from "@/lib/api";
import { shortAddress } from "@/lib/grades";
import type { BuildingDetail, CommuteLeg } from "@/types/building";
import { GradeTile } from "@/components/ui/GradeTile";
import { BriefcaseIcon, CheckIcon, ChevronLeftIcon, CloseIcon, RefreshIcon, RestaurantIcon, WalkIcon } from "@/components/ui/icons";
import { WorkplaceInput } from "@/components/building/WorkplaceInput";
import { RouteBullet, legSpokenName, mergeWalks, tidyTransitName } from "@/components/building/shared";

/** The building chip that leads every docked face (tap → back to the summary). */
export function BuildingChip({ data }: { data: BuildingDetail }) {
  const setCardView = useStore((s) => s.setCardView);
  return (
    <button
      type="button"
      onClick={() => setCardView("summary")}
      className="inline-flex min-h-[48px] items-center gap-2 rounded-[13px] border-[1.5px] border-ink bg-white py-1 pl-1.5 pr-3 text-sm font-bold hover:bg-surface"
    >
      <GradeTile grade={data.grade} size="sm" label="" />
      {shortAddress(data.address)}
    </button>
  );
}

function legText(leg: CommuteLeg, index: number, count: number): string {
  if (leg.mode === "WALK") {
    if (index === 0 && leg.to_name) return `Walk ${leg.duration_min} min to ${tidyTransitName(leg.to_name)}`;
    if (index === count - 1 && leg.from_name) return `Walk ${leg.duration_min} min from ${tidyTransitName(leg.from_name)}`;
    return `Walk ${leg.duration_min} min`;
  }
  const stops = leg.num_stops ? ` · ${leg.num_stops} stop${leg.num_stops === 1 ? "" : "s"}` : "";
  return `${leg.duration_min} min${stops}`;
}

function LegBar({ legs }: { legs: CommuteLeg[] }) {
  return (
    <div aria-hidden="true" className="flex items-center gap-1">
      {legs.map((leg, i) =>
        leg.mode === "WALK" ? (
          <span key={i} className="border-t-[5px] border-dotted border-ink" style={{ flex: `${Math.max(leg.duration_min, 1)} 1 0` }} />
        ) : (
          <span
            key={i}
            className="h-3 rounded-full bg-ink"
            style={{ flex: `${Math.max(leg.duration_min, 1)} 1 0` }}
          />
        )
      )}
    </div>
  );
}

export function CommuteFace({
  data,
  closeRef,
}: {
  data: BuildingDetail;
  closeRef: RefObject<HTMLButtonElement | null>;
}) {
  const workplace = useStore((s) => s.workplace);
  const setWorkplace = useStore((s) => s.setWorkplace);
  const setCardView = useStore((s) => s.setCardView);
  const replayRoute = useStore((s) => s.replayRoute);
  const from = data.latitude != null && data.longitude != null ? { latitude: data.latitude, longitude: data.longitude } : null;
  const { data: commute, isLoading, error } = useCommute(from, workplace);
  const legs = commute ? mergeWalks(commute.legs) : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
        <BuildingChip data={data} />
        <span aria-hidden="true" className="hidden min-w-[24px] flex-[1_1_30px] border-t-4 border-dotted border-ink sm:block" />
        <div className="flex h-12 min-w-0 flex-[3_1_300px] items-center gap-2 rounded-[13px] border-2 border-ink pl-3 pr-1.5">
          <label htmlFor="work-inline" className="flex shrink-0 items-center gap-2 text-[13px] font-bold">
            <BriefcaseIcon size={18} />
            Work
          </label>
          <WorkplaceInput
            id="work-inline"
            variant="inline"
            defaultValue={workplace?.label ?? ""}
            placeholder="Office address or a station"
            autoFocus={!workplace}
            onSelect={setWorkplace}
          />
          {workplace && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-surface px-2 py-1 text-xs font-semibold">
              <CheckIcon size={12} />
              Saved
            </span>
          )}
        </div>
        <button
          ref={closeRef}
          type="button"
          onClick={() => setCardView("summary")}
          aria-label="Close commute"
          className="icon-btn"
        >
          <CloseIcon size={20} />
        </button>
      </div>

      {!workplace ? (
        <p className="m-0 text-sm text-ink-2">Add your work address to see the fastest door-to-door trip by transit and on foot. It&apos;s saved for every building you look at.</p>
      ) : isLoading ? (
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3" aria-live="polite">
          <div className="font-display text-[40px] font-extrabold leading-none text-muted">Timing your trip…</div>
          <div className="h-3 flex-[1_1_300px] animate-pulse rounded-full bg-block" />
        </div>
      ) : error || !commute ? (
        <p className="m-0 text-sm font-semibold text-ink-2" role="alert">
          {error instanceof ApiError && error.detail ? error.detail : "We couldn't time this trip right now. Try again in a minute."}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
          <div className="shrink-0">
            <div className="font-display font-extrabold leading-none tracking-[-0.03em]">
              <span className="text-[64px]">{commute.duration_min}</span>
              <span className="text-2xl"> min</span>
            </div>
            <div className="text-[13px] text-muted">
              Door to door · weekday, leaving{" "}
              {new Date(commute.depart_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })}
            </div>
          </div>
          <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-2.5">
            <LegBar legs={legs} />
            <ol className="m-0 flex list-none flex-wrap items-center gap-2 p-0" aria-label="Trip steps">
              {legs.map((leg, i) =>
                leg.mode === "WALK" ? (
                  <li key={i} className="inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-ink px-3 py-[7px] text-[13px] font-semibold">
                    <WalkIcon size={16} />
                    {legText(leg, i, legs.length)}
                  </li>
                ) : (
                  <li
                    key={i}
                    className="inline-flex items-center gap-2 rounded-full border-[1.5px] border-ink bg-ink py-[5px] pl-[5px] pr-3 text-[13px] font-semibold text-white"
                  >
                    <RouteBullet leg={leg} />
                    <span className="sr-only">{legSpokenName(leg)}, </span>
                    {legText(leg, i, legs.length)}
                    {leg.headsign && <span className="hidden font-medium text-line md:inline">toward {tidyTransitName(leg.headsign)}</span>}
                  </li>
                )
              )}
            </ol>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t-[1.5px] border-line pt-3.5">
        <button type="button" onClick={() => setCardView("summary")} className="btn-outline">
          <ChevronLeftIcon size={16} />
          Back to the building card
        </button>
        <button type="button" onClick={() => setCardView("food")} className="btn-outline">
          <RestaurantIcon size={16} />
          Food nearby
        </button>
        {commute && (
          <button type="button" onClick={replayRoute} className="btn-outline">
            <RefreshIcon size={16} />
            Replay route
          </button>
        )}
        <span className="ml-auto text-xs text-muted">
          Fastest trip by subway, bus, rail or ferry ·{" "}
          <a
            href={commute?.attribution.url ?? "https://transitous.org/sources"}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-ink underline underline-offset-2"
          >
            {commute?.attribution.text ?? "Transit routing by Transitous"}
          </a>
        </span>
      </div>
    </div>
  );
}
