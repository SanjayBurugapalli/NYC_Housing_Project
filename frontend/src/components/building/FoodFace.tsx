"use client";

import type { RefObject } from "react";
import { useStore } from "@/lib/store";
import { useFood } from "@/hooks/useBuildingData";
import { PRICE_META, type PriceTier } from "@/lib/grades";
import type { BuildingDetail } from "@/types/building";
import { CloseIcon } from "@/components/ui/icons";
import { BuildingChip } from "@/components/building/CommuteFace";
import { FOOD_KINDS, FoodDisc } from "@/components/building/shared";

const CLOSEST = 4;

export function FoodFace({
  data,
  closeRef,
}: {
  data: BuildingDetail;
  closeRef: RefObject<HTMLButtonElement | null>;
}) {
  const setCardView = useStore((s) => s.setCardView);
  const foodCategories = useStore((s) => s.foodCategories);
  const toggleFoodCategory = useStore((s) => s.toggleFoodCategory);
  const activeFoodId = useStore((s) => s.activeFoodId);
  const setActiveFoodId = useStore((s) => s.setActiveFoodId);
  const { data: food, isLoading, error } = useFood(data.bbl);

  const total = food ? food.counts.deli + food.counts.grocery + food.counts.restaurant : 0;
  const closest = food ? food.places.filter((p) => foodCategories[p.category]).slice(0, CLOSEST) : [];
  const minutes = food?.walk_minutes ?? 5;

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5">
        <BuildingChip data={data} />
        <h2 id="building-card-title" className="m-0 flex-[1_1_260px] font-display text-2xl font-extrabold leading-tight tracking-[-0.02em]">
          {isLoading
            ? "Finding places to eat…"
            : food
              ? `${total} place${total === 1 ? "" : "s"} to eat within a ${minutes}-minute walk`
              : "Food nearby"}
        </h2>
        <button ref={closeRef} type="button" onClick={() => setCardView("summary")} aria-label="Close food nearby" className="icon-btn">
          <CloseIcon size={20} />
        </button>
      </div>

      {error ? (
        <p className="m-0 border-t-[1.5px] border-line pt-3.5 text-sm font-semibold text-ink-2" role="alert">
          Food data isn&apos;t available for this building yet.
        </p>
      ) : (
        <div className="flex flex-wrap gap-x-9 gap-y-4 border-t-[1.5px] border-line pt-3.5">
          <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-3.5">
            <div className="flex flex-col gap-2">
              <div className="eyebrow">Icon shows the kind</div>
              <div role="group" aria-label="Kinds of food" className="flex flex-wrap gap-2">
                {FOOD_KINDS.map(({ key, label, Icon }) => {
                  const on = foodCategories[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleFoodCategory(key)}
                      className={`inline-flex h-[46px] items-center gap-2 rounded-[13px] border-2 border-ink pl-2.5 pr-3 text-[13px] font-bold ${
                        on ? "bg-ink text-white" : "bg-white text-ink hover:bg-surface"
                      }`}
                    >
                      <Icon size={20} />
                      {label} · {food ? food.counts[key] : "…"}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <div className="eyebrow">
                Color shows the price <span className="font-semibold normal-case tracking-normal">(estimated)</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-[18px] gap-y-2 text-[13px] font-semibold">
                {([1, 2, 3] as PriceTier[]).map((t) => (
                  <span key={t} className="inline-flex items-center gap-2">
                    <span className="h-6 w-6 rounded-full border-2 border-ink" style={{ background: PRICE_META[t].bg }} />
                    {PRICE_META[t].symbol} · {PRICE_META[t].label}
                  </span>
                ))}
              </div>
              {food?.price_note && <p className="m-0 text-xs text-muted">{food.price_note}</p>}
            </div>
          </div>

          <div className="flex min-w-0 flex-[1_1_340px] flex-col">
            <div className="eyebrow pb-1.5">Closest</div>
            {isLoading &&
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 border-t-[1.5px] border-line py-2">
                  <span className="h-9 w-9 animate-pulse rounded-full bg-block" />
                  <span className="h-4 flex-1 animate-pulse rounded bg-block" />
                </div>
              ))}
            {food && closest.length === 0 && (
              <p className="m-0 border-y-[1.5px] border-line py-3 text-sm text-muted">
                {total === 0 ? "Nothing within a short walk." : "Turn a kind back on to see what's closest."}
              </p>
            )}
            {closest.map((p, i) => {
              const kind = FOOD_KINDS.find((k) => k.key === p.category);
              return (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => setActiveFoodId(activeFoodId === p.id ? null : p.id)}
                  aria-pressed={activeFoodId === p.id}
                  className={`flex w-full items-center gap-3 border-t-[1.5px] border-line py-2 text-left hover:bg-surface ${
                    i === closest.length - 1 ? "border-b-[1.5px]" : ""
                  } ${activeFoodId === p.id ? "bg-surface" : ""}`}
                >
                  <FoodDisc place={p} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold">{p.name}</div>
                    <div className="truncate text-xs text-muted">
                      {p.subtype || kind?.one} · {p.walk_min} min walk
                    </div>
                  </div>
                  <span className="font-display text-base font-extrabold">
                    {p.price_tier ? PRICE_META[p.price_tier].symbol : <span className="text-xs font-semibold text-muted">—</span>}
                  </span>
                </button>
              );
            })}
            {closest.length > 0 && (
              <p className="m-0 pt-2 text-xs text-muted">Hover a pin to see its name; click it (or a row) for details.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
