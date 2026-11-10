"use client";

import { GradeTile } from "@/components/ui/GradeTile";
import { ArrowRightIcon, LogoIcon } from "@/components/ui/icons";
import { RENT_STATUS_LABEL, rentStatus, shortAddress } from "@/lib/grades";

export interface HoveredBuilding {
  bbl: string;
  address: string;
  grade: string;
  healthScore: number;
  units: number | null;
  yearBuilt: number | null;
  buildingClass: string | null;
  lng: number;
  lat: number;
  /** Screen position of the dot, in map-container pixels. */
  x: number;
  y: number;
}

const CARD_W = 304;
const CARD_H = 196;

/** Desktop hover preview for a building dot: grade, basics and a way in. */
export function HoverCard({
  building,
  containerWidth,
  containerHeight,
  onOpen,
  onPointerEnter,
  onPointerLeave,
}: {
  building: HoveredBuilding;
  containerWidth: number;
  containerHeight: number;
  onOpen: () => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}) {
  // Sit up and to the right of the dot; flip left near the right edge and
  // clamp vertically so the card never runs under the top bar or off-screen.
  const flip = building.x + 28 + CARD_W > containerWidth - 16;
  const left = flip ? building.x - 28 - CARD_W : building.x + 28;
  const top = Math.min(Math.max(building.y - CARD_H + 20, 140), containerHeight - CARD_H - 16);

  const facts = [
    building.units ? `${building.units} units` : null,
    building.yearBuilt ? `built ${building.yearBuilt}` : null,
    RENT_STATUS_LABEL[rentStatus(building.buildingClass, building.yearBuilt, building.units)]?.toLowerCase() ?? null,
  ].filter(Boolean);

  return (
    <div
      className="card-float absolute z-20 flex w-[304px] flex-col gap-3 rounded-[18px] p-4 shadow-hard animate-fade-in"
      style={{ left, top }}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <div className="flex items-center gap-3">
        <GradeTile grade={building.grade} size="hover" rotate={-4} shadow="xs" />
        <div className="min-w-0">
          <div className="truncate font-display text-xl font-extrabold leading-tight tracking-[-0.02em]">
            {shortAddress(building.address)}
          </div>
          {facts.length > 0 && <div className="text-[13px] text-muted">{facts.join(" · ")}</div>}
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-[10px] bg-surface px-2.5 py-2 text-[13px] font-semibold">
        <LogoIcon size={18} />
        Building health · {Math.round(building.healthScore)} / 100
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-[44px] items-center justify-between text-left text-sm font-bold text-ink hover:text-ink-2"
      >
        Health, commute and food
        <ArrowRightIcon size={18} />
      </button>
    </div>
  );
}
