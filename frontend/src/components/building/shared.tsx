"use client";

import { useState } from "react";
import { searchByManager, searchByOwner } from "@/lib/api";
import { useStore } from "@/lib/store";
import { GRADE_BAR_SEGMENTS, GRADE_META, INK, PRICE_META, PRICE_UNKNOWN, titleCase } from "@/lib/grades";
import type { BuildingDetail, CommuteLeg, FoodPlace } from "@/types/building";
import { BasketIcon, CheckIcon, LinkIcon, RestaurantIcon, StoreIcon } from "@/components/ui/icons";

/** "Bushwick, Brooklyn" from the NTA/neighborhood + borough. */
export function placeLine(b: Pick<BuildingDetail, "nta_name" | "neighborhood" | "borough">, sep = ", "): string {
  return [titleCase(b.nta_name || b.neighborhood), titleCase(b.borough)].filter(Boolean).join(sep);
}

/** Horizontal score bar split at the grade cut-offs, with a marker at the score. */
export function GradeBar({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, score));
  return (
    <div className="relative h-4" role="img" aria-label={`Score ${Math.round(pct)} on a 0 to 100 scale`}>
      <div className="flex h-4 overflow-hidden rounded-full border-2 border-ink">
        {GRADE_BAR_SEGMENTS.map(({ grade, pct: w }, i) => (
          <span
            key={grade}
            style={{
              flex: i === GRADE_BAR_SEGMENTS.length - 1 ? "1 1 auto" : `0 0 ${w}%`,
              background: GRADE_META[grade].bg,
              borderRight: i === GRADE_BAR_SEGMENTS.length - 1 ? undefined : `1.5px solid ${INK}`,
            }}
          />
        ))}
      </div>
      <span
        className="absolute -top-[5px] h-[26px] w-2 -translate-x-1/2 rounded border-2 border-ink bg-white"
        style={{ left: `${pct}%` }}
      />
    </div>
  );
}

/** Copy the shareable /map?bbl= link; flips to a check for two seconds. */
export function CopyLinkButton({ bbl, className = "icon-btn" }: { bbl: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={copied ? "Link copied" : "Copy link to this building"}
      title="Copy link to this building"
      className={className}
      onClick={() => {
        navigator.clipboard.writeText(`${window.location.origin}/map?bbl=${bbl}`).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
    >
      {copied ? <CheckIcon size={18} /> : <LinkIcon size={18} />}
    </button>
  );
}

/** Run an owner/manager portfolio search and hand the results to the results panel. */
export function useEntitySearch() {
  const setSearchResults = useStore((s) => s.setSearchResults);
  const setSearchClarification = useStore((s) => s.setSearchClarification);
  const setSearchInterpretation = useStore((s) => s.setSearchInterpretation);
  const setSearchQuery = useStore((s) => s.setSearchQuery);
  const selectBuilding = useStore((s) => s.selectBuilding);
  const [pending, setPending] = useState(false);

  async function run(type: "owner" | "manager", name: string) {
    setPending(true);
    try {
      const result = type === "owner" ? await searchByOwner(name) : await searchByManager(name);
      setSearchQuery(name);
      setSearchResults(result.results);
      setSearchClarification(result.clarification ?? null);
      setSearchInterpretation(null, [{ key: type, label: type === "owner" ? `Owner: ${name}` : `Manager: ${name}` }]);
      selectBuilding(null);
    } catch {
      // leave the card open; the button re-enables
    } finally {
      setPending(false);
    }
  }

  return { run, pending };
}

// --- Commute legs ---

/** Merge back-to-back walking legs (transfers inside a station come back split). */
export function mergeWalks(legs: CommuteLeg[]): CommuteLeg[] {
  const out: CommuteLeg[] = [];
  for (const leg of legs) {
    const prev = out[out.length - 1];
    if (prev && prev.mode === "WALK" && leg.mode === "WALK") {
      out[out.length - 1] = { ...prev, duration_min: prev.duration_min + leg.duration_min, to_name: leg.to_name };
    } else {
      out.push(leg);
    }
  }
  return out.filter((l) => l.mode !== "WALK" || l.duration_min > 0);
}

// Spoken/fallback names per mode, and a default color for feeds that don't
// publish one (MTA bus blue for buses and rail, NYC Ferry teal).
const MODE_NAME: Record<string, string> = { SUBWAY: "train", BUS: "bus", RAIL: "train", FERRY: "ferry", OTHER: "transit" };
const MODE_FALLBACK_LABEL: Record<string, string> = { BUS: "Bus", RAIL: "Rail", FERRY: "Ferry", OTHER: "Transit" };
const MODE_DEFAULT_COLOR: Record<string, string> = { BUS: "#0039A6", RAIL: "#0039A6", FERRY: "#00839C" };

/**
 * MTA bus stops and headsigns arrive in capitals ("BROADWAY/GRANITE ST",
 * "DOWNTOWN WORTH ST via CHURCH ST"). Title-case anything that's mostly
 * capitals; subway names ("14 St-Union Sq") are already mixed case and pass
 * through unchanged.
 */
export function tidyTransitName(name: string | null): string | null {
  if (!name) return name;
  const letters = name.replace(/[^A-Za-z]/g, "");
  const upper = letters.replace(/[^A-Z]/g, "").length;
  if (letters.length === 0 || upper / letters.length < 0.8) return name;
  return titleCase(name).replace(/\bVia\b/g, "via");
}

/** "L train", "Q75 bus", "SIR train", "ferry" — for screen readers. */
export function legSpokenName(leg: CommuteLeg): string {
  const name = MODE_NAME[leg.mode] ?? "transit";
  return leg.route_short_name ? `${leg.route_short_name} ${name}` : name;
}

/**
 * A subway line is a round bullet in its color ("L", "4", "A"); a bus, rail
 * line or ferry is a rounded tag with its route name ("Q75", "SIM2", "SIR"),
 * so it never reads as a subway letter.
 */
export function RouteBullet({ leg, size = 26 }: { leg: CommuteLeg; size?: number }) {
  const subway = leg.mode === "SUBWAY";
  const name = leg.route_short_name && leg.route_short_name.length <= 8 ? leg.route_short_name : null;
  const label = subway ? name ?? "S" : name ?? MODE_FALLBACK_LABEL[leg.mode] ?? "Transit";
  const background = leg.route_color ?? (subway ? "#FFFFFF" : MODE_DEFAULT_COLOR[leg.mode] ?? INK);
  const color = leg.route_text_color ?? (subway && !leg.route_color ? INK : "#FFFFFF");
  const wide = !subway || label.length > 2;
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center font-extrabold ${subway ? "rounded-full" : "rounded-md"}`}
      style={{
        minWidth: size,
        height: size,
        padding: wide ? "0 6px" : undefined,
        fontSize: wide ? Math.round(size * 0.44) : Math.round(size * 0.54),
        background,
        color,
        boxShadow: "0 0 0 1.5px #FFFFFF",
      }}
    >
      {label}
    </span>
  );
}

// --- Food ---

export const FOOD_KINDS: { key: FoodPlace["category"]; label: string; one: string; Icon: typeof StoreIcon }[] = [
  { key: "deli", label: "Delis & corner stores", one: "Corner store", Icon: StoreIcon },
  { key: "grocery", label: "Groceries", one: "Grocery", Icon: BasketIcon },
  { key: "restaurant", label: "Restaurants", one: "Restaurant", Icon: RestaurantIcon },
];

/** Category icon on a disc tinted by price tier (matches the map pins). */
export function FoodDisc({ place, size = 36 }: { place: Pick<FoodPlace, "category" | "price_tier">; size?: number }) {
  const kind = FOOD_KINDS.find((k) => k.key === place.category) ?? FOOD_KINDS[2];
  const price = place.price_tier ? PRICE_META[place.price_tier] : PRICE_UNKNOWN;
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-full border-2 border-ink"
      style={{ width: size, height: size, background: price.bg, color: price.fg }}
    >
      <kind.Icon size={Math.round(size * 0.5)} strokeWidth={2.2} />
    </span>
  );
}
