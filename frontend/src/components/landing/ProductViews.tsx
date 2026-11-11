"use client";

// Full-resolution recreations of the app's views for the homepage, built from
// the app's own components and real API data instead of screenshots, so they
// stay sharp at any size. The food map is a Mapbox Static Images basemap with
// the pins and labels drawn on top in HTML/SVG; every overlay is sized in
// container units, so the map scales as one picture while its text stays text.
// Rendered on the server (props are plain data). The only live control is the
// building card's address, which links to the building on the map.

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { GRADE_META, INK, PRICE_META, PRICE_UNKNOWN, RENT_STATUS_LABEL, shortAddress, titleCase, toGrade } from "@/lib/grades";
import { pointOnCircle } from "@/lib/geo";
import { frameForRadius, metersToPixels, staticMapUrl, toPixel, type MapFrame } from "@/lib/staticMap";
import type { BuildingDetail, CommuteResult, FoodPlace, FoodResult, OwnerPortfolio } from "@/types/building";
import { GradeTile } from "@/components/ui/GradeTile";
import {
  ArrowRightIcon,
  BriefcaseIcon,
  ChevronRightIcon,
  CompareIcon,
  LinkIcon,
  PersonIcon,
  RestaurantIcon,
  TrainIcon,
  WalkIcon,
} from "@/components/ui/icons";
import { FOOD_KINDS, GradeBar, RouteBullet, legSpokenName, mergeWalks, placeLine } from "@/components/building/shared";
import { CardIconBox, FactChips } from "@/components/building/SummaryFace";
import { LegBar, legText } from "@/components/building/CommuteFace";
import { SubScoreRow, subScores, trails } from "@/components/building/DeepFace";

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

/** A pill caption ("6 min walk"), as the map's markers draw them. */
function Pill({ text, u, size, style }: { text: string; u: (px: number) => string; size: number; style?: CSSProperties }) {
  return (
    <span
      className="absolute whitespace-nowrap rounded-full bg-white font-sans font-bold text-ink"
      style={{ fontSize: u(size), lineHeight: 1.35, padding: `${u(3)} ${u(10)}`, border: `${u(2)} solid ${INK}`, ...style }}
    >
      {text}
    </span>
  );
}

/** The grade tile with its hard shadow, centered on the building (as the map's building marker). */
function BuildingTile({ frame, at, grade }: { frame: MapFrame; at: [number, number]; grade: string }) {
  const u = unitFor(frame.width);
  const g = toGrade(grade, "F");
  const [x, y] = at;
  return (
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
  );
}

// --- Food nearby, drawn on the map ---

// Names a deli pick shouldn't have (reads as a grocery), and kitchens that aren't restaurants.
const NOT_DELI = /grocery|market/i;
const NOT_RESTAURANT = /dorm|school|college|universit|cafeteria|hospital|kitchen$/i;

// A named pin is drawn open (bigger, ringed); its callout's tail ends just above the ring.
const NAMED_PIN = 30;
const RING = 5;
const CALLOUT_LIFT = NAMED_PIN / 2 + RING + 5;
const CALLOUT_HEIGHT = 12 * 1.35 + 10 + 4; // the pill plus the tail below it

function FoodPin({ frame, place, at, size, open = false }: {
  frame: MapFrame;
  place: FoodPlace;
  at: [number, number];
  size: number;
  open?: boolean;
}) {
  const u = unitFor(frame.width);
  const price = place.price_tier ? PRICE_META[place.price_tier] : PRICE_UNKNOWN;
  const Icon = (FOOD_KINDS.find((k) => k.key === place.category) ?? FOOD_KINDS[2]).Icon;
  return (
    <span
      className="absolute flex items-center justify-center rounded-full"
      style={{
        left: pct(at[0], frame.width),
        top: pct(at[1], frame.height),
        transform: "translate(-50%, -50%)",
        width: u(size),
        height: u(size),
        border: `${u(2)} solid ${INK}`,
        background: price.bg,
        color: price.fg,
        // The map's open-pin ring (.byr-food[data-active] in globals.css).
        boxShadow: open ? `0 0 0 ${u(3)} #FFFFFF, 0 0 0 ${u(RING)} ${INK}` : undefined,
        zIndex: open ? 4 : undefined,
      }}
    >
      <Icon style={{ width: u(size * 0.54), height: u(size * 0.54) }} strokeWidth={2.2} />
    </span>
  );
}

/** A place's name on a pill whose tail points down at its pin. */
function Callout({ frame, text, at: [x, y] }: { frame: MapFrame; text: string; at: [number, number] }) {
  const u = unitFor(frame.width);
  return (
    <span
      className="absolute flex flex-col items-center"
      style={{ left: pct(x, frame.width), bottom: pct(frame.height - (y - CALLOUT_LIFT), frame.height), transform: "translateX(-50%)", zIndex: 5 }}
    >
      <span
        className="whitespace-nowrap rounded-full bg-white font-sans font-bold text-ink"
        style={{ fontSize: u(12), lineHeight: 1.35, padding: `${u(3)} ${u(10)}`, border: `${u(2)} solid ${INK}` }}
      >
        {text}
      </span>
      <span
        aria-hidden="true"
        className="bg-white"
        style={{ width: u(10), height: u(10), marginTop: u(-6), borderRight: `${u(2)} solid ${INK}`, borderBottom: `${u(2)} solid ${INK}`, transform: "rotate(45deg)" }}
      />
    </span>
  );
}

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
  const walk = toPixel(frame, pointOnCircle(center, food.radius_m, 135));
  const walkText = `${food.walk_minutes} min walk`;
  const walkWidth = textWidth(walkText, 12) + 24;

  // One name per kind, nearest first, where its callout clears the building
  // tile, the walk pill and the other names.
  const taken: Box[] = [
    { x0: home[0] - 25, y0: home[1] - 29, x1: home[0] + 29, y1: home[1] + 29 },
    { x0: walk[0] - walkWidth / 2, y0: walk[1] - 13, x1: walk[0] + walkWidth / 2, y1: walk[1] + 13 },
  ];
  const named: typeof pins = [];
  for (const kind of ["grocery", "deli", "restaurant"] as FoodPlace["category"][]) {
    for (const pin of pins) {
      const { place, at: [x, y] } = pin;
      if (place.category !== kind) continue;
      if (kind === "deli" && NOT_DELI.test(place.name)) continue;
      if (kind === "restaurant" && NOT_RESTAURANT.test(place.name)) continue;
      if (Math.hypot(x - home[0], y - home[1]) < 80) continue;
      const w = textWidth(place.name, 12) + 24;
      const reach = NAMED_PIN / 2 + RING;
      const label = { x0: x - w / 2, y0: y - CALLOUT_LIFT - CALLOUT_HEIGHT, x1: x + w / 2, y1: y - CALLOUT_LIFT + 2 };
      const disc = { x0: x - reach, y0: y - reach, x1: x + reach, y1: y + reach };
      if (!inFrame(frame, label) || taken.some((t) => overlaps(t, label) || overlaps(t, disc))) continue;
      taken.push(label, disc);
      named.push(pin);
      break;
    }
  }
  const namedIds = new Set(named.map((n) => n.place.id));

  return (
    <MapCanvas
      frame={frame}
      label={`Map of places to eat within a ${food.walk_minutes}-minute walk of ${shortAddress(building.address)}, shaded by estimated price`}
    >
      <svg viewBox={`0 0 ${frame.width} ${frame.height}`} className="absolute inset-0 h-full w-full" aria-hidden="true">
        <circle cx={fixed(home[0], 1)} cy={fixed(home[1], 1)} r={fixed(radius, 1)} fill="rgba(18,20,26,0.04)" stroke={INK} strokeWidth={2} strokeDasharray="6 8" />
      </svg>

      {[...pins].reverse().map(({ place, at }) =>
        namedIds.has(place.id) ? null : <FoodPin key={place.id} frame={frame} place={place} at={at} size={24} />
      )}

      {named.map(({ place, at }) => (
        <span key={place.id}>
          <FoodPin frame={frame} place={place} at={at} size={NAMED_PIN} open />
          <Callout frame={frame} text={place.name} at={at} />
        </span>
      ))}

      <BuildingTile frame={frame} at={home} grade={building.grade} />
      <Pill text={walkText} u={u} size={12} style={{ left: pct(walk[0], frame.width), top: pct(walk[1], frame.height), transform: "translate(-50%, -50%)", zIndex: 3 }} />
    </MapCanvas>
  );
}

// --- The building card ---

interface CardProps {
  /** The example building, owner fields already stripped. */
  building: BuildingDetail;
  commute: CommuteResult | null;
  food: FoodResult | null;
  workLabel: string;
  /** The building on the map. */
  href: string;
}

// The card's buttons and links are drawn, not wired: the address link covers the whole card.
const drawnLink = "inline-flex min-h-[44px] items-center text-[13px] font-semibold text-ink underline underline-offset-2";

/** The address, linking to the building on the map; its ::after stretches the link over the card. */
function CardLink({ href, className, children }: { href: string; className: string; children: ReactNode }) {
  return (
    <Link href={href} className={`block text-ink no-underline decoration-[3px] underline-offset-4 after:absolute after:inset-0 after:z-10 hover:underline ${className}`}>
      {children}
    </Link>
  );
}

/** Commute or Food nearby, as the card's teaser boxes. */
function Teaser({ Icon, title, sub, action, children }: {
  Icon: typeof TrainIcon;
  title: string;
  sub: string;
  action: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[20px] border-2 border-ink p-4">
      <div className="flex items-center gap-2.5">
        <CardIconBox><Icon size={20} /></CardIconBox>
        <div>
          <div className="font-display text-[19px] font-extrabold leading-tight tracking-[-0.02em]">{title}</div>
          <div className="text-xs text-muted">{sub}</div>
        </div>
      </div>
      {children}
      <span aria-hidden="true" className="btn-outline mt-auto h-[46px] w-full border-2 text-sm">{action}</span>
    </div>
  );
}

/** The map's building card (SummaryFace), with the example's commute and food filled in. */
export function BuildingCardView({ building, commute, food, workLabel, href }: CardProps) {
  const g = toGrade(building.grade, "F");
  const meta = GRADE_META[g];
  const transit = commute ? mergeWalks(commute.legs).filter((l) => l.mode !== "WALK") : [];
  return (
    <div className="card-float relative flex flex-col gap-[18px] rounded-[28px] px-5 py-5 shadow-hard-xl sm:px-[26px] sm:py-[22px]">
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div>
            <CardLink href={href} className="font-display text-[30px] font-extrabold leading-[1.05] tracking-[-0.03em] sm:text-[34px]">
              {titleCase(building.address)}
            </CardLink>
            <div className="text-sm text-muted">{placeLine(building)}</div>
          </div>
          <FactChips data={building} />
        </div>
        <span aria-hidden="true" className="icon-btn">
          <LinkIcon size={18} />
        </span>
      </div>

      <div className="flex flex-col gap-4 rounded-[22px] border-2 border-ink bg-surface px-5 py-[18px]">
        <div className="flex items-center gap-5 sm:gap-[22px]">
          <GradeTile grade={g} size="xl" rotate={-4} shadow="md" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="eyebrow">Building health</div>
            <div className="font-display font-extrabold leading-none tracking-[-0.03em]">
              <span className="text-[56px]">{Math.round(building.health_score)}</span>
              <span className="text-xl text-muted"> / 100</span>
            </div>
            <p className="m-0 text-sm text-ink-2">
              <strong className="text-ink">{meta.headline}</strong> {meta.detail}
            </p>
          </div>
        </div>
        <GradeBar score={building.health_score} />
        <span aria-hidden="true" className="flex min-h-[48px] items-center justify-between gap-3 rounded-[13px] border-[1.5px] border-ink bg-white px-3.5 text-sm font-bold">
          <span>
            What&apos;s behind this grade <span className="font-medium text-muted">complaints, violations, lawsuits</span>
          </span>
          <ChevronRightIcon size={18} className="shrink-0" />
        </span>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3.5">
        <Teaser Icon={TrainIcon} title="Commute" sub="Transit and walking, door to door" action="See the route">
          <div>
            <div className="font-display font-extrabold leading-none tracking-[-0.03em]">
              {commute ? (
                <>
                  <span className="text-[40px]">{commute.duration_min}</span>
                  <span className="text-lg"> min</span>
                </>
              ) : (
                <span className="text-[22px]">No route</span>
              )}
            </div>
            <div className="mt-1 truncate text-xs text-muted">
              to {workLabel}
              {transit.length > 0 && " · "}
              {transit.map((l, i) => (
                <span key={i} className="ml-1 inline-block align-middle"><RouteBullet leg={l} size={18} /></span>
              ))}
            </div>
          </div>
        </Teaser>
        <Teaser Icon={RestaurantIcon} title="Food nearby" sub={`Within a ${food?.walk_minutes ?? 5}-minute walk`} action="Show food on the map">
          <div className="flex flex-col gap-1 text-[13px] font-semibold">
            {FOOD_KINDS.map((k) => (
              <div key={k.key} className="flex justify-between">
                <span>{k.label}</span>
                <span>{food ? food.counts[k.key] : "—"}</span>
              </div>
            ))}
          </div>
        </Teaser>
      </div>

      <OwnerStripView portfolio={building.owner_portfolio ?? null} />

      <div aria-hidden="true" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <span className="btn-outline">
          <CompareIcon size={16} />
          Compare with another
        </span>
        <span className="flex flex-wrap gap-x-4">
          <span className={drawnLink}>Listings on StreetEasy</span>
          <span className={drawnLink}>Flag a data issue</span>
        </span>
      </div>
    </div>
  );
}

/** The phone's bottom sheet (MobileSheet): the same card in three rows. */
export function BuildingSheetView({ building, commute, food, workLabel, href }: CardProps) {
  const g = toGrade(building.grade, "F");
  const rent = RENT_STATUS_LABEL[building.rent_status];
  const foodTotal = food ? food.counts.deli + food.counts.grocery + food.counts.restaurant : null;
  const row = "flex items-center gap-2.5 border-t-[1.5px] border-line py-0.5";
  return (
    <div className="card-float relative flex flex-col gap-4 rounded-[24px] px-4 pb-5 pt-2.5 shadow-hard-md">
      <span aria-hidden="true" className="h-[5px] w-11 self-center rounded-full bg-ink" />
      <div className="flex items-center gap-3.5">
        <GradeTile grade={g} size="lg" rotate={-4} shadow="sm" />
        <div className="min-w-0 flex-1">
          <CardLink href={href} className="truncate font-display text-2xl font-extrabold leading-tight tracking-[-0.02em]">
            {shortAddress(building.address)}
          </CardLink>
          <div className="text-[13px] text-muted">
            {[titleCase(building.nta_name || building.neighborhood), building.residential_units ? `${building.residential_units} units` : null, rent?.toLowerCase()]
              .filter(Boolean)
              .join(" · ")}
          </div>
          <div className="text-[13px] font-bold">
            {Math.round(building.health_score)} out of 100 · {GRADE_META[g].short}
          </div>
        </div>
      </div>

      <div className="flex flex-col border-b-[1.5px] border-line">
        <div className={row}>
          <span className="flex-1 text-sm font-bold">Building health</span>
          <span className={drawnLink}>What&apos;s behind the {g}</span>
        </div>
        <div className={row}>
          <span className="flex-1 text-sm font-bold">Commute</span>
          <span className={drawnLink}>{commute ? `${commute.duration_min} min to ${workLabel}` : "See the route"}</span>
        </div>
        <div className={row}>
          <span className="flex-1 text-sm font-bold">Food nearby</span>
          <span className={drawnLink}>{foodTotal != null ? `${foodTotal} spots within ${food?.walk_minutes ?? 5} min` : "—"}</span>
        </div>
      </div>

      <div aria-hidden="true" className="flex gap-2">
        <span className="btn-ink h-[50px] flex-1 rounded-[14px] text-base">
          Open the full card
          <ArrowRightIcon size={18} />
        </span>
        <span className="icon-btn h-[50px] w-[50px] rounded-[14px] border-2">
          <CompareIcon size={20} />
        </span>
        <span className="icon-btn h-[50px] w-[50px] rounded-[14px] border-2">
          <LinkIcon size={18} />
        </span>
      </div>
    </div>
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
  // One building is nothing more to see, so the button greys out (as on the map's card).
  const solo = !portfolio || portfolio.building_count <= 1;
  const holds = solo
    ? "This is the only building they own in our data"
    : `Owns ${portfolio.building_count} buildings · average grade ${toGrade(portfolio.grade, "F")}`;
  return (
    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5 rounded-2xl bg-ink px-3.5 py-3 text-white">
      <PersonIcon size={20} />
      <div className="flex min-w-0 flex-[1_1_180px] flex-col gap-1.5 text-[13px]">
        <span aria-hidden="true" className="block h-3.5 w-40 max-w-full rounded-full bg-white/25" />
        <span className="text-line">{holds}</span>
      </div>
      <span
        aria-hidden="true"
        className={`inline-flex h-10 items-center rounded-[11px] px-3.5 text-[13px] font-bold ${solo ? "bg-white/20 text-white/60" : "bg-white text-ink"}`}
      >
        See their buildings
      </span>
    </div>
  );
}
