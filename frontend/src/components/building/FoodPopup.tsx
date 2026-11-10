"use client";

import { PRICE_META, titleCase } from "@/lib/grades";
import type { FoodPlace } from "@/types/building";
import { CloseIcon } from "@/components/ui/icons";
import { FOOD_KINDS, FoodDisc } from "@/components/building/shared";

/** What opens when a food place is clicked (map pin or "Closest" row). */
export function FoodPopup({ place, onClose }: { place: FoodPlace; onClose: () => void }) {
  const kind = FOOD_KINDS.find((k) => k.key === place.category);
  const address = place.address ? titleCase(place.address) : null;

  return (
    <div className="flex w-[240px] flex-col gap-2 p-3.5 text-ink">
      <div className="flex items-start gap-2.5">
        <FoodDisc place={place} size={34} />
        <div className="min-w-0 flex-1">
          <div className="font-display text-[17px] font-extrabold leading-tight tracking-[-0.01em]">{place.name}</div>
          <div className="text-xs text-muted">
            {place.subtype || kind?.one}
            {place.price_tier ? ` · ${PRICE_META[place.price_tier].symbol} (est.)` : ""}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${place.name}`}
          className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-surface"
        >
          <CloseIcon size={16} />
        </button>
      </div>
      {address && <div className="text-[13px]">{address}</div>}
    </div>
  );
}
