"use client";

import type { RefObject } from "react";
import { useStore } from "@/lib/store";
import { useCommute, useFood } from "@/hooks/useBuildingData";
import { ApiError } from "@/lib/api";
import {
  GRADE_META,
  RENT_STATUS_LABEL,
  buildingTypeLabel,
  isPlaceholderOwner,
  shortAddress,
  titleCase,
  toGrade,
} from "@/lib/grades";
import type { BuildingDetail } from "@/types/building";
import { GradeTile } from "@/components/ui/GradeTile";
import {
  ArrowRightIcon,
  ChevronRightIcon,
  CloseIcon,
  CompareIcon,
  PersonIcon,
  RestaurantIcon,
  TrainIcon,
} from "@/components/ui/icons";
import { buildStreetEasyUrl } from "@/components/building/streetEasy";
import { WorkplaceInput } from "@/components/building/WorkplaceInput";
import {
  CopyLinkButton,
  FOOD_KINDS,
  GradeBar,
  RouteBullet,
  mergeWalks,
  placeLine,
  useEntitySearch,
} from "@/components/building/shared";

const ISSUE_URL = "https://github.com/SanjayBurugapalli/NYC_Housing_Project/issues/new";

/** "24 units", "Built 1931", "Walk-up", rent status — the facts row. */
export function FactChips({ data }: { data: BuildingDetail }) {
  const rent = RENT_STATUS_LABEL[data.rent_status];
  const type = buildingTypeLabel(data.building_class);
  return (
    <div className="flex flex-wrap gap-1.5">
      {data.residential_units > 0 && <span className="fact">{data.residential_units} units</span>}
      {data.year_built ? <span className="fact">Built {data.year_built}</span> : null}
      {type && type !== rent && <span className="fact">{type}</span>}
      {rent && (
        <span className={`fact ${data.rent_status === "likely_stabilized" ? "bg-ink text-white" : ""}`}>{rent}</span>
      )}
    </div>
  );
}

export function CardIconBox({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] border-2 border-ink">
      {children}
    </span>
  );
}

function CommuteTeaser({ data }: { data: BuildingDetail }) {
  const workplace = useStore((s) => s.workplace);
  const setWorkplace = useStore((s) => s.setWorkplace);
  const setCardView = useStore((s) => s.setCardView);
  const from = data.latitude != null && data.longitude != null ? { latitude: data.latitude, longitude: data.longitude } : null;
  const { data: commute, isLoading, error } = useCommute(from, workplace);
  const transit = commute ? mergeWalks(commute.legs).filter((l) => l.mode !== "WALK") : [];

  return (
    <section aria-labelledby="commute-h" className="flex flex-col gap-3 rounded-[20px] border-2 border-ink p-4">
      <div className="flex items-center gap-2.5">
        <CardIconBox><TrainIcon size={20} /></CardIconBox>
        <div>
          <h3 id="commute-h" className="m-0 font-display text-[19px] font-extrabold leading-tight tracking-[-0.02em]">Commute</h3>
          <div className="text-xs text-muted">Transit and walking, door to door</div>
        </div>
      </div>

      {!workplace ? (
        <>
          <label htmlFor="work-addr" className="text-[13px] font-bold">Where do you work?</label>
          <div className="-mt-1.5">
            <WorkplaceInput
              id="work-addr"
              onSelect={(w) => {
                setWorkplace(w);
                setCardView("commute");
              }}
            />
          </div>
          <div className="text-xs text-muted">Saved once, shown on every building.</div>
        </>
      ) : (
        <>
          <div aria-live="polite">
            <div className="font-display font-extrabold leading-none tracking-[-0.03em]">
              {isLoading ? (
                <span className="text-[28px] text-muted">Timing…</span>
              ) : commute ? (
                <>
                  <span className="text-[40px]">{commute.duration_min}</span>
                  <span className="text-lg"> min</span>
                </>
              ) : (
                <span className="text-[22px]">No route</span>
              )}
            </div>
            <div className="mt-1 truncate text-xs text-muted">
              to {workplace.label.split(",")[0]}
              {transit.length > 0 && " · "}
              {transit.map((l, i) => (
                <span key={i} className="ml-1 inline-block align-middle"><RouteBullet leg={l} size={18} /></span>
              ))}
            </div>
            {error && (
              <p className="mt-1 text-xs font-semibold text-muted">
                {error instanceof ApiError && error.detail ? error.detail : "Couldn't time this trip right now."}
              </p>
            )}
          </div>
          <button type="button" onClick={() => setCardView("commute")} className="btn-outline mt-auto h-[46px] w-full border-2 text-sm">
            See the route
          </button>
        </>
      )}
    </section>
  );
}

function FoodTeaser({ data }: { data: BuildingDetail }) {
  const setCardView = useStore((s) => s.setCardView);
  const { data: food, isLoading, error } = useFood(data.bbl);
  return (
    <section aria-labelledby="food-h" className="flex flex-col gap-3 rounded-[20px] border-2 border-ink p-4">
      <div className="flex items-center gap-2.5">
        <CardIconBox><RestaurantIcon size={20} /></CardIconBox>
        <div>
          <h3 id="food-h" className="m-0 font-display text-[19px] font-extrabold leading-tight tracking-[-0.02em]">Food nearby</h3>
          <div className="text-xs text-muted">Within a {food?.walk_minutes ?? 5}-minute walk</div>
        </div>
      </div>
      <div className="flex flex-col gap-1 text-[13px] font-semibold">
        {FOOD_KINDS.map((k) => (
          <div key={k.key} className="flex justify-between">
            <span>{k.label}</span>
            <span aria-live="polite">{isLoading ? "…" : food ? food.counts[k.key] : "—"}</span>
          </div>
        ))}
      </div>
      {error && <p className="m-0 text-xs text-muted">Food data isn&apos;t available for this building yet.</p>}
      <button
        type="button"
        onClick={() => setCardView("food")}
        disabled={!food}
        className="btn-outline mt-auto h-[46px] w-full border-2 text-sm disabled:opacity-50"
      >
        Show food on the map
      </button>
    </section>
  );
}

function OwnerStrip({ data }: { data: BuildingDetail }) {
  const { run, pending } = useEntitySearch();
  const owner = isPlaceholderOwner(data.owner_name) ? null : data.owner_name;
  const manager = isPlaceholderOwner(data.managing_agent) ? null : data.managing_agent;
  const name = owner ?? manager;
  if (!name) return null;
  const isOwner = !!owner;
  const p = data.owner_portfolio;
  const portfolio = isOwner && p
    ? p.building_count > 1
      ? `Owns ${p.building_count} buildings · average grade ${toGrade(p.grade, "F")}`
      : "This is the only building they own in our data"
    : isOwner ? "Owner on record" : "Managing agent on record";
  // Nothing more to see when this is their only building: the button greys out.
  const solo = isOwner && !!p && p.building_count <= 1;
  return (
    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5 rounded-2xl bg-ink px-3.5 py-3 text-white">
      <PersonIcon size={20} />
      <div className="min-w-0 flex-[1_1_220px] text-[13px]">
        <strong className="text-sm">{titleCase(name)}</strong>
        <br />
        <span className="text-line">{portfolio}</span>
      </div>
      <button
        type="button"
        disabled={pending || solo}
        onClick={() => run(isOwner ? "owner" : "manager", name)}
        className={`inline-flex h-11 items-center rounded-[11px] px-3.5 text-[13px] font-bold ${
          solo ? "cursor-not-allowed bg-white/20 text-white/60" : "bg-white text-ink hover:bg-surface disabled:opacity-60"
        }`}
      >
        {pending ? "Searching…" : "See their buildings"}
      </button>
    </div>
  );
}

export function CompareToggle({ bbl, className = "" }: { bbl: string; className?: string }) {
  const compareBbls = useStore((s) => s.compareBbls);
  const addToCompare = useStore((s) => s.addToCompare);
  const removeFromCompare = useStore((s) => s.removeFromCompare);
  const inCompare = compareBbls.includes(bbl);
  const full = !inCompare && compareBbls.length >= 2;
  return (
    <button
      type="button"
      aria-pressed={inCompare}
      disabled={full}
      title={full ? "You're already comparing two buildings" : undefined}
      onClick={() => (inCompare ? removeFromCompare(bbl) : addToCompare(bbl))}
      className={`btn-outline ${inCompare ? "!bg-ink !text-white" : ""} disabled:opacity-50 ${className}`}
    >
      <CompareIcon size={16} />
      {inCompare ? "In comparison" : compareBbls.length === 1 ? "Compare with the other" : "Compare with another"}
    </button>
  );
}

export function SummaryFace({
  data,
  onClose,
  closeRef,
}: {
  data: BuildingDetail;
  onClose: () => void;
  closeRef: RefObject<HTMLButtonElement | null>;
}) {
  const setCardView = useStore((s) => s.setCardView);
  const grade = toGrade(data.grade, "F");
  const meta = GRADE_META[grade];

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div>
            <h2 id="building-card-title" className="m-0 font-display text-[30px] font-extrabold leading-[1.05] tracking-[-0.03em] sm:text-[34px]">
              {titleCase(data.address)}
            </h2>
            <div className="text-sm text-muted">{placeLine(data)}</div>
          </div>
          <FactChips data={data} />
        </div>
        <div className="flex shrink-0 gap-1.5">
          <CopyLinkButton bbl={data.bbl} />
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close building card" title="Close (Esc)" className="icon-btn">
            <CloseIcon size={20} />
          </button>
        </div>
      </div>

      {/* Building health */}
      <div className="flex flex-col gap-4 rounded-[22px] border-2 border-ink bg-surface px-5 py-[18px]">
        <div className="flex items-center gap-5 sm:gap-[22px]">
          <GradeTile grade={grade} size="xl" rotate={-4} shadow="md" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="eyebrow">Building health</div>
            <div className="font-display font-extrabold leading-none tracking-[-0.03em]">
              <span className="text-[56px]">{Math.round(data.health_score)}</span>
              <span className="text-xl text-muted"> / 100</span>
            </div>
            <p className="m-0 text-sm text-ink-2">
              <strong className="text-ink">{meta.headline}</strong> {meta.detail}
            </p>
          </div>
        </div>
        <GradeBar score={data.health_score} />
        <button
          type="button"
          onClick={() => setCardView("deep")}
          className="flex min-h-[48px] items-center justify-between gap-3 rounded-[13px] border-[1.5px] border-ink bg-white px-3.5 text-left text-sm font-bold hover:bg-surface"
        >
          <span>
            What&apos;s behind this grade{" "}
            <span className="font-medium text-muted">complaints, violations, lawsuits</span>
          </span>
          <ChevronRightIcon size={18} className="shrink-0" />
        </button>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3.5">
        <CommuteTeaser data={data} />
        <FoodTeaser data={data} />
      </div>

      <OwnerStrip data={data} />

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <CompareToggle bbl={data.bbl} />
        <div className="flex flex-wrap gap-x-4">
          <a
            href={buildStreetEasyUrl(data.address, data.borough, data.sub_neighborhood ?? data.nta_name)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center text-[13px] font-semibold text-ink underline underline-offset-2"
          >
            Listings on StreetEasy
          </a>
          <a
            href={`${ISSUE_URL}?title=${encodeURIComponent(`Data issue for BBL ${data.bbl}`)}&body=${encodeURIComponent(`Building BBL: ${data.bbl}\n\nDescribe the issue:`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center text-[13px] font-semibold text-ink underline underline-offset-2"
          >
            Flag a data issue
          </a>
        </div>
      </div>
    </div>
  );
}

/** Compact mobile bottom sheet (the summary in three rows). */
export function MobileSheet({
  data,
  onClose,
  onExpand,
  closeRef,
}: {
  data: BuildingDetail;
  onClose: () => void;
  onExpand: () => void;
  closeRef: RefObject<HTMLButtonElement | null>;
}) {
  const setCardView = useStore((s) => s.setCardView);
  const workplace = useStore((s) => s.workplace);
  const grade = toGrade(data.grade, "F");
  const from = data.latitude != null && data.longitude != null ? { latitude: data.latitude, longitude: data.longitude } : null;
  const { data: commute } = useCommute(from, workplace);
  const { data: food } = useFood(data.bbl);
  const rent = RENT_STATUS_LABEL[data.rent_status];
  const foodTotal = food ? food.counts.deli + food.counts.grocery + food.counts.restaurant : null;
  const owner = isPlaceholderOwner(data.owner_name) ? null : data.owner_name;
  const p = data.owner_portfolio;

  const row = "flex items-center gap-2.5 border-t-[1.5px] border-line py-0.5";
  const rowLink = "inline-flex min-h-[44px] items-center gap-1 text-[13px] font-semibold text-ink underline underline-offset-2";

  return (
    <div className="flex flex-col gap-4">
      <span aria-hidden="true" className="h-[5px] w-11 self-center rounded-full bg-ink" />
      <div className="flex items-center gap-3.5">
        <GradeTile grade={grade} size="lg" rotate={-4} shadow="sm" />
        <div className="min-w-0 flex-1">
          <h2 id="building-card-title" className="m-0 truncate font-display text-2xl font-extrabold leading-tight tracking-[-0.02em]">
            {shortAddress(data.address)}
          </h2>
          <div className="text-[13px] text-muted">
            {[titleCase(data.nta_name || data.neighborhood), data.residential_units ? `${data.residential_units} units` : null, rent?.toLowerCase()]
              .filter(Boolean)
              .join(" · ")}
          </div>
          <div className="text-[13px] font-bold">
            {Math.round(data.health_score)} out of 100 · {GRADE_META[grade].short}
          </div>
        </div>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className="flex h-11 w-11 shrink-0 items-center justify-center self-start rounded-xl">
          <CloseIcon size={20} />
        </button>
      </div>

      <div className="flex flex-col border-b-[1.5px] border-line">
        <div className={row}>
          <span className="flex-1 text-sm font-bold">Building health</span>
          <button type="button" className={rowLink} onClick={() => { onExpand(); setCardView("deep"); }}>
            What&apos;s behind the {grade}
          </button>
        </div>
        <div className={row}>
          <span className="flex-1 text-sm font-bold">Commute</span>
          <button type="button" className={rowLink} onClick={() => setCardView("commute")}>
            {workplace
              ? commute
                ? `${commute.duration_min} min to ${workplace.label.split(",")[0]}`
                : "See the route"
              : "Add your work address"}
          </button>
        </div>
        <div className={row}>
          <span className="flex-1 text-sm font-bold">Food nearby</span>
          <button type="button" className={rowLink} onClick={() => food && setCardView("food")}>
            {foodTotal != null ? `${foodTotal} spots within ${food?.walk_minutes ?? 5} min` : "…"}
          </button>
        </div>
      </div>

      {owner && (
        <div className="flex items-center gap-2.5 text-[13px]">
          <PersonIcon size={18} />
          <span className="min-w-0 flex-1">
            <strong>{titleCase(owner)}</strong>
            {p && p.building_count > 1 ? ` owns ${p.building_count - 1} more, average ${toGrade(p.grade, "F")}` : ""}
          </span>
        </div>
      )}

      <div className="flex gap-2">
        <button type="button" onClick={onExpand} className="btn-ink h-[50px] flex-1 rounded-[14px] text-base">
          Open the full card
          <ArrowRightIcon size={18} />
        </button>
        <CompareToggleIcon bbl={data.bbl} />
        <CopyLinkButton bbl={data.bbl} className="icon-btn h-[50px] w-[50px] rounded-[14px] border-2" />
      </div>
    </div>
  );
}

function CompareToggleIcon({ bbl }: { bbl: string }) {
  const compareBbls = useStore((s) => s.compareBbls);
  const addToCompare = useStore((s) => s.addToCompare);
  const removeFromCompare = useStore((s) => s.removeFromCompare);
  const inCompare = compareBbls.includes(bbl);
  const full = !inCompare && compareBbls.length >= 2;
  return (
    <button
      type="button"
      aria-pressed={inCompare}
      aria-label={inCompare ? "Remove from comparison" : "Add to comparison"}
      disabled={full}
      onClick={() => (inCompare ? removeFromCompare(bbl) : addToCompare(bbl))}
      className={`icon-btn h-[50px] w-[50px] rounded-[14px] border-2 disabled:opacity-50 ${inCompare ? "!bg-ink !text-white" : ""}`}
    >
      <CompareIcon size={20} />
    </button>
  );
}
