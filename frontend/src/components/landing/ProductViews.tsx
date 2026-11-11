"use client";

// Full-resolution recreations of the app's views for the homepage, built from
// the app's own components and real API data instead of screenshots, so they
// stay sharp at any size. The maps are a Mapbox Static Images basemap with the
// route, pins and labels drawn on top in HTML/SVG; every overlay is sized in
// container units, so a map scales as one picture while its text stays text.
// Rendered on the server (props are plain data); nothing here is interactive.

import type { CSSProperties, ReactNode } from "react";
import { GRADE_META, INK, PRICE_META, PRICE_UNKNOWN, shortAddress, titleCase, toGrade } from "@/lib/grades";
import { pointOnCircle } from "@/lib/geo";
import { fitFrame, frameForRadius, metersToPixels, staticMapUrl, toPixel, type MapFrame } from "@/lib/staticMap";
import type { BuildingDetail, CommuteResult, FoodPlace, FoodResult, OwnerPortfolio } from "@/types/building";
import { GradeTile } from "@/components/ui/GradeTile";
import { BriefcaseIcon, PersonIcon, WalkIcon } from "@/components/ui/icons";
import { FOOD_KINDS, RouteBullet, legSpokenName, mergeWalks, tidyTransitName } from "@/components/building/shared";
import { LegBar, legText } from "@/components/building/CommuteFace";
import { SubScoreRow, subScores, trails } from "@/components/building/DeepFace";
import { prepareRoute } from "@/components/map/routeAnimation";
import { LABEL_SIDES, stationLabelBox, type LabelSide } from "@/components/map/markers";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

type LngLat = [number, number];
interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The fields a map or card needs. The owner's name is never passed to the page. */
export type PublicBuilding = Pick<BuildingDetail, "address" | "grade" | "health_score" | "latitude" | "longitude">;

// --- Map canvas: a static basemap plus overlays in its logical pixel space ---

// Server (Node) and browser math can differ in the last digits; round everything
// both compute so the hydrated attributes match.
const fixed = (n: number, digits: number) => Number(n.toFixed(digits));

/** Logical px → container units for a map `width` wide, so overlays scale with the image. */
const unitFor = (width: number) => (px: number) => `${fixed((px / width) * 100, 3)}cqw`;
const pct = (v: number, total: number) => `${fixed((v / total) * 100, 3)}%`;

// Rough text widths for laying labels out before render (Inter bold ~0.6em a glyph).
const textWidth = (text: string, px: number) => Math.ceil(text.length * px * 0.6);

const GAP = 3;
const overlaps = (a: Box, b: Box) =>
  a.x0 < b.x1 + GAP && b.x0 < a.x1 + GAP && a.y0 < b.y1 + GAP && b.y0 < a.y1 + GAP;
const inFrame = (f: MapFrame, b: Box, margin = 4) =>
  b.x0 >= margin && b.y0 >= margin && b.x1 <= f.width - margin && b.y1 <= f.height - margin;

function MapCanvas({ frame, label, children }: { frame: MapFrame; label: string; children: ReactNode }) {
  return (
    <div
      role="img"
      aria-label={label}
      className="relative w-full overflow-hidden bg-[#F2F3F0]"
      style={{ aspectRatio: `${frame.width} / ${frame.height}`, containerType: "inline-size" }}
    >
      {TOKEN && (
        // A plain <img>: the token is URL-restricted, so the browser (with its Referer) has to fetch it.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={staticMapUrl(frame, TOKEN)} alt="" draggable={false} className="absolute inset-0 h-full w-full select-none" />
      )}
      {children}
    </div>
  );
}

/** A pill caption ("322 East 19 St", "23 min"), as the map's markers draw them. */
function Pill({ text, u, size, dark = false, display = false, style }: {
  text: string;
  u: (px: number) => string;
  size: number;
  dark?: boolean;
  display?: boolean;
  style?: CSSProperties;
}) {
  return (
    <span
      className={`absolute whitespace-nowrap rounded-full ${display ? "font-display font-extrabold" : "font-sans font-bold"}`}
      style={{
        fontSize: u(size),
        lineHeight: 1.35,
        padding: `${u(display ? 5 : 3)} ${u(display ? 16 : 10)}`,
        border: `${u(display ? 2.5 : 2)} solid ${INK}`,
        background: dark ? INK : "#FFFFFF",
        color: dark ? "#FFFFFF" : INK,
        ...style,
      }}
    >
      {text}
    </span>
  );
}

/** The grade tile with its hard shadow, centered on the building (as the map's building marker). */
function BuildingTile({ frame, at, grade, caption }: { frame: MapFrame; at: [number, number]; grade: string; caption?: string }) {
  const u = unitFor(frame.width);
  const g = toGrade(grade, "F");
  const [x, y] = at;
  return (
    <>
      <span
        className="absolute flex items-center justify-center font-display font-extrabold"
        style={{
          left: pct(x, frame.width),
          top: pct(y, frame.height),
          transform: "translate(-50%, -50%)",
          width: u(38),
          height: u(46),
          borderRadius: u(9),
          border: `${u(2.5)} solid ${INK}`,
          background: GRADE_META[g].bg,
          color: GRADE_META[g].fg,
          boxShadow: `${u(4)} ${u(4)} 0 ${INK}`,
          fontSize: u(30),
          lineHeight: 1,
          zIndex: 3,
        }}
      >
        {g}
      </span>
      {caption && (
        <Pill text={caption} u={u} size={13} dark style={{ left: pct(x, frame.width), top: pct(y + 31, frame.height), transform: "translateX(-50%)", zIndex: 3 }} />
      )}
    </>
  );
}

// --- The commute, drawn on the map ---

interface Station {
  at: [number, number];
  name: string | null;
  color: string;
}

/** Place each station's name on the first clear side of its dot (as stationLabels.ts does on the map). */
function placeLabels(frame: MapFrame, stations: Station[], obstacles: Box[], size: number): (LabelSide | null)[] {
  const placed = [...obstacles, ...stations.map(({ at: [x, y] }) => ({ x0: x - 8, y0: y - 8, x1: x + 8, y1: y + 8 }))];
  // First boarding and final exit first; transfers fill in around them.
  const order = stations.length > 2 ? [0, stations.length - 1, ...stations.slice(1, -1).map((_, i) => i + 1)] : stations.map((_, i) => i);
  const sides: (LabelSide | null)[] = stations.map(() => null);
  for (const i of order) {
    const { at: [x, y], name } = stations[i];
    if (!name) continue;
    const w = textWidth(name, size) + 24;
    const h = size * 1.35 + 10;
    for (const side of LABEL_SIDES) {
      const box = stationLabelBox(side, x, y, w, h);
      if (inFrame(frame, box) && !placed.some((b) => overlaps(b, box))) {
        placed.push(box);
        sides[i] = side;
        break;
      }
    }
  }
  return sides;
}

function labelStyle(side: LabelSide, [x, y]: [number, number], frame: MapFrame): CSSProperties {
  const reach = 8 + 6; // half the dot + the gap, as stationLabelBox
  switch (side) {
    case "right":
      return { left: pct(x + reach, frame.width), top: pct(y, frame.height), transform: "translateY(-50%)" };
    case "left":
      return { right: pct(frame.width - (x - reach), frame.width), top: pct(y, frame.height), transform: "translateY(-50%)" };
    case "below":
      return { left: pct(x, frame.width), top: pct(y + reach, frame.height), transform: "translateX(-50%)" };
    case "above":
      return { left: pct(x, frame.width), bottom: pct(frame.height - (y - reach), frame.height), transform: "translateX(-50%)" };
  }
}

export function RouteMapView({
  building,
  commute,
  work,
  keepClear,
}: {
  building: PublicBuilding;
  commute: CommuteResult | null;
  work: { label: string; latitude: number; longitude: number };
  /** A corner (from x, y as fractions, to the bottom right) that something will cover: the route is framed beside it and no label goes in it. */
  keepClear?: { x: number; y: number };
}) {
  const from: LngLat = [building.longitude ?? 0, building.latitude ?? 0];
  const to: LngLat = [work.longitude, work.latitude];
  const route = commute ? prepareRoute(commute.legs, from, to) : null;
  const [W, H] = [760, 590];
  const right = keepClear ? Math.round((1 - keepClear.x) * W) + 20 : 70;
  const frame = fitFrame(route ? [from, to, ...route.all] : [from, to], W, H, { top: 52, right, bottom: 82, left: 60 }, 15);
  const u = unitFor(frame.width);
  const px = (p: LngLat) => toPixel(frame, p);
  const home = px(from);
  const office = px(to);
  const address = shortAddress(building.address);
  const workCaption = `Work · ${work.label}`;

  // Stations: one per boarding and exit, a same-name transfer once (as the map overlay).
  const stations: Station[] = [];
  const rides = route ? route.legs.filter((l) => !l.walk) : [];
  rides.forEach((ride, i) => {
    const color = ride.color ?? INK;
    if (!rides[i - 1] || rides[i - 1].leg.to_name !== ride.leg.from_name) {
      stations.push({ at: px(ride.points[0]), name: tidyTransitName(ride.leg.from_name), color });
    }
    stations.push({ at: px(ride.points[ride.points.length - 1]), name: tidyTransitName(ride.leg.to_name), color });
  });

  const minutes = commute ? `${commute.duration_min} min` : null;
  const pill = route && minutes ? px(route.labelAt) : null;
  const captionBox = ([x, y]: [number, number], text: string, size: number): Box => {
    const w = textWidth(text, size) + 24;
    return { x0: x - w / 2, y0: y + 31, x1: x + w / 2, y1: y + 31 + size * 1.35 + 10 };
  };
  const obstacles: Box[] = [
    { x0: home[0] - 23, y0: home[1] - 27, x1: home[0] + 27, y1: home[1] + 27 },
    captionBox(home, address, 13),
    { x0: office[0] - 25, y0: office[1] - 25, x1: office[0] + 25, y1: office[1] + 25 },
    captionBox(office, workCaption, 12),
  ];
  if (pill && minutes) {
    const w = textWidth(minutes, 18) + 36;
    obstacles.push({ x0: pill[0] - w / 2, y0: pill[1] - 18, x1: pill[0] + w / 2, y1: pill[1] + 18 });
  }
  if (keepClear) obstacles.push({ x0: keepClear.x * W, y0: keepClear.y * H, x1: W, y1: H });
  const sides = placeLabels(frame, stations, obstacles, 12);

  return (
    <MapCanvas
      frame={frame}
      label={`Map of the weekday commute from ${address} to the ${work.label}${minutes ? `: ${minutes}` : ""}`}
    >
      {route && (
        <svg viewBox={`0 0 ${frame.width} ${frame.height}`} className="absolute inset-0 h-full w-full" aria-hidden="true">
          {route.legs.map((leg, i) => {
            const points = leg.points.map((p) => px(p).map((n) => n.toFixed(1)).join(",")).join(" ");
            return leg.walk ? (
              <polyline key={i} points={points} fill="none" stroke={INK} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="0 9" />
            ) : (
              <g key={i}>
                <polyline points={points} fill="none" stroke="#FFFFFF" strokeWidth={11} strokeLinecap="round" strokeLinejoin="round" />
                <polyline points={points} fill="none" stroke={leg.color ?? INK} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
              </g>
            );
          })}
        </svg>
      )}

      {stations.map((s, i) => (
        <span key={i}>
          <span
            className="absolute rounded-full bg-white"
            style={{
              left: pct(s.at[0], frame.width),
              top: pct(s.at[1], frame.height),
              transform: "translate(-50%, -50%)",
              width: u(16),
              height: u(16),
              border: `${u(4)} solid ${s.color}`,
              boxShadow: `0 0 0 ${u(1.5)} ${INK}`,
              zIndex: 2,
            }}
          />
          {s.name && sides[i] && <Pill text={s.name} u={u} size={12} style={{ ...labelStyle(sides[i]!, s.at, frame), zIndex: 2 }} />}
        </span>
      ))}

      {/* Work: an ink disc with a briefcase, captioned below */}
      <span
        className="absolute flex items-center justify-center rounded-full bg-ink text-white"
        style={{
          left: pct(office[0], frame.width),
          top: pct(office[1], frame.height),
          transform: "translate(-50%, -50%)",
          width: u(46),
          height: u(46),
          border: `${u(3)} solid #FFFFFF`,
          boxShadow: `0 0 0 ${u(2)} ${INK}`,
          zIndex: 3,
        }}
      >
        <BriefcaseIcon style={{ width: u(22), height: u(22) }} />
      </span>
      <Pill text={workCaption} u={u} size={12} style={{ left: pct(office[0], frame.width), top: pct(office[1] + 31, frame.height), transform: "translateX(-50%)", zIndex: 3 }} />

      <BuildingTile frame={frame} at={home} grade={building.grade} caption={address} />

      {pill && minutes && (
        <Pill text={minutes} u={u} size={18} display style={{ left: pct(pill[0], frame.width), top: pct(pill[1], frame.height), transform: "translate(-50%, -50%)", zIndex: 4 }} />
      )}
    </MapCanvas>
  );
}

// --- Food nearby, drawn on the map ---

// Names a deli pick shouldn't have (reads as a grocery), and kitchens that aren't restaurants.
const NOT_DELI = /grocery|market/i;
const NOT_RESTAURANT = /dorm|school|college|universit|cafeteria|hospital|kitchen$/i;

export function FoodMapView({ building, food }: { building: PublicBuilding; food: FoodResult }) {
  const center: LngLat = [food.center.longitude, food.center.latitude];
  const frame = frameForRadius(center, food.radius_m, 430 / 2 - 26, 760, 430);
  const u = unitFor(frame.width);
  const home = toPixel(frame, center);
  const radius = metersToPixels(frame, food.radius_m);
  const pins = food.places
    .filter((p) => p.distance_m <= food.radius_m)
    .slice(0, 110)
    .map((p) => ({ place: p, at: toPixel(frame, [p.longitude, p.latitude]) }));

  // One name per kind, nearest first: clear of the building tile and of each other.
  const named: typeof pins = [];
  for (const kind of ["grocery", "deli", "restaurant"] as FoodPlace["category"][]) {
    const pick = pins.find(
      ({ place, at }) =>
        place.category === kind &&
        !(kind === "deli" && NOT_DELI.test(place.name)) &&
        !(kind === "restaurant" && NOT_RESTAURANT.test(place.name)) &&
        Math.hypot(at[0] - home[0], at[1] - home[1]) > 80 &&
        at[1] > 40 &&
        named.every((n) => Math.hypot(n.at[0] - at[0], n.at[1] - at[1]) > 95)
    );
    if (pick) named.push(pick);
  }
  const walk = toPixel(frame, pointOnCircle(center, food.radius_m, 135));
  const kindOf = (p: FoodPlace) => FOOD_KINDS.find((k) => k.key === p.category) ?? FOOD_KINDS[2];

  return (
    <MapCanvas
      frame={frame}
      label={`Map of places to eat within a ${food.walk_minutes}-minute walk of ${shortAddress(building.address)}, shaded by estimated price`}
    >
      <svg viewBox={`0 0 ${frame.width} ${frame.height}`} className="absolute inset-0 h-full w-full" aria-hidden="true">
        <circle cx={fixed(home[0], 1)} cy={fixed(home[1], 1)} r={fixed(radius, 1)} fill="rgba(18,20,26,0.04)" stroke={INK} strokeWidth={2} strokeDasharray="6 8" />
      </svg>

      {[...pins].reverse().map(({ place, at }) => {
        const price = place.price_tier ? PRICE_META[place.price_tier] : PRICE_UNKNOWN;
        const Icon = kindOf(place).Icon;
        return (
          <span
            key={place.id}
            className="absolute flex items-center justify-center rounded-full"
            style={{
              left: pct(at[0], frame.width),
              top: pct(at[1], frame.height),
              transform: "translate(-50%, -50%)",
              width: u(24),
              height: u(24),
              border: `${u(2)} solid ${INK}`,
              background: price.bg,
              color: price.fg,
            }}
          >
            <Icon style={{ width: u(13), height: u(13) }} strokeWidth={2.2} />
          </span>
        );
      })}

      {named.map(({ place, at }) => (
        <Pill
          key={place.id}
          text={place.name}
          u={u}
          size={12}
          style={{ left: pct(at[0], frame.width), bottom: pct(frame.height - (at[1] - 17), frame.height), transform: "translateX(-50%)", zIndex: 4 }}
        />
      ))}

      <BuildingTile frame={frame} at={home} grade={building.grade} />
      <Pill
        text={`${food.walk_minutes} min walk`}
        u={u}
        size={12}
        style={{ left: pct(walk[0], frame.width), top: pct(walk[1], frame.height), transform: "translate(-50%, -50%)", zIndex: 3 }}
      />
    </MapCanvas>
  );
}

// --- Cards ---

/** The commute card's trip summary: time, then the legs, as CommuteFace shows them. */
export function CommuteCardView({ building, commute, workLabel }: { building: PublicBuilding; commute: CommuteResult; workLabel: string }) {
  const legs = mergeWalks(commute.legs);
  const leaving = new Date(commute.depart_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
  return (
    <div className="flex flex-col gap-3.5 rounded-[20px] border-2 border-ink bg-white p-4 shadow-hard-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex min-h-[44px] items-center gap-2 rounded-[13px] border-[1.5px] border-ink bg-white py-1 pl-1.5 pr-3 text-sm font-bold">
          <GradeTile grade={building.grade} size="sm" label="" />
          {shortAddress(building.address)}
        </span>
        <span className="flex h-11 min-w-0 flex-[1_1_200px] items-center gap-2 rounded-[13px] border-2 border-ink px-3 text-sm">
          <BriefcaseIcon size={16} />
          <span className="font-bold">Work</span>
          <span className="truncate">{workLabel}</span>
        </span>
      </div>
      <div>
        <div className="font-display font-extrabold leading-none tracking-[-0.03em]">
          <span className="text-[52px]">{commute.duration_min}</span>
          <span className="text-xl"> min</span>
        </div>
        <div className="text-[13px] text-muted">Door to door · weekday, leaving {leaving}</div>
      </div>
      <LegBar legs={legs} />
      <ol className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0" aria-label="Trip steps">
        {legs.map((leg, i) =>
          leg.mode === "WALK" ? (
            <li key={i} className="inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-ink px-2.5 py-[5px] text-xs font-semibold">
              <WalkIcon size={14} />
              {legText(leg, i, legs.length)}
            </li>
          ) : (
            <li key={i} className="inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-ink bg-ink py-[3px] pl-[3px] pr-2.5 text-xs font-semibold text-white">
              <RouteBullet leg={leg} size={22} />
              <span className="sr-only">{legSpokenName(leg)}, </span>
              {legText(leg, i, legs.length)}
            </li>
          )
        )}
      </ol>
    </div>
  );
}

// Record dates are calendar dates: read them in UTC so server and browser agree.
const shortDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "—";

/** "Behind the grade": the six sub-scores, worst first, and the paper trail's counts and latest complaints. */
export function GradeBreakdownView({ building }: { building: BuildingDetail }) {
  const g = toGrade(building.grade, "F");
  const rows = subScores(building);
  const tabs = trails(building);
  const latest = tabs[0]?.rows.slice(0, 3) ?? [];
  return (
    <div className="flex flex-col gap-4 rounded-[20px] border-2 border-ink bg-white p-4 shadow-hard-sm sm:p-5">
      <div className="flex items-center gap-3">
        <GradeTile grade={g} size="md" />
        <div className="min-w-0">
          <div className="font-display text-xl font-extrabold leading-tight tracking-[-0.02em]">
            Behind the {g} at {titleCase(building.address)}
          </div>
          <div className="text-[13px] text-muted">
            Health score {Math.round(building.health_score)} out of 100 · last five years, recent issues count more
          </div>
        </div>
      </div>
      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <div>
          <div className="flex items-baseline justify-between pb-1.5">
            <span className="font-display text-[17px] font-extrabold">Six sub-scores</span>
            <span className="text-xs text-muted">Worst first</span>
          </div>
          {rows.map((s, i) => (
            <SubScoreRow key={s.key} s={s} last={i === rows.length - 1} />
          ))}
        </div>
        <div>
          <div className="pb-2 font-display text-[17px] font-extrabold">The paper trail</div>
          <div className="flex flex-wrap gap-1.5 pb-2.5">
            {tabs.map((t, i) => (
              <span key={t.key} className={`rounded-full border-[1.5px] border-ink px-2.5 py-1 text-xs font-bold ${i === 0 ? "bg-ink text-white" : "bg-white"}`}>
                {t.label} {t.rows.length}
              </span>
            ))}
          </div>
          {/* The latest complaints only where there's room beside the sub-scores. */}
          {latest.map((r) => (
            <div key={r.id} className="hidden gap-3 border-t-[1.5px] border-line py-2 sm:flex">
              <span className="w-[76px] shrink-0 text-xs text-muted">{shortDate(r.date)}</span>
              <span className="min-w-0 flex-1 text-xs">
                <span className="block font-semibold text-ink">{r.title}</span>
                <span className="text-muted">{r.meta}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The owner strip, with the name left out entirely (the owner on record may be a private person). */
export function OwnerStripView({ portfolio }: { portfolio: OwnerPortfolio | null }) {
  const holds =
    portfolio && portfolio.building_count > 1
      ? `Owns ${portfolio.building_count} buildings · average grade ${toGrade(portfolio.grade, "F")}`
      : "This is the only building they own in our data";
  return (
    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5 rounded-2xl bg-ink px-3.5 py-3 text-white">
      <PersonIcon size={20} />
      <div className="flex min-w-0 flex-[1_1_180px] flex-col gap-1.5 text-[13px]">
        <span aria-hidden="true" className="block h-3.5 w-40 max-w-full rounded-full bg-white/25" />
        <span className="text-line">{holds}</span>
      </div>
      <span aria-hidden="true" className="inline-flex h-10 items-center rounded-[11px] bg-white px-3.5 text-[13px] font-bold text-ink">
        See their buildings
      </span>
    </div>
  );
}
