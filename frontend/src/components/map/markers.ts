// DOM factories for Mapbox HTML markers. Built with createElement/textContent
// (never innerHTML with data) — the only innerHTML is constant icon markup.

import { GRADE_META, INK, PRICE_META, PRICE_UNKNOWN, toGrade } from "@/lib/grades";
import { ICON_SVG, svgMarkup } from "@/components/ui/icons";
import type { FoodPlace } from "@/types/building";

function el(tag: string, style: Partial<CSSStyleDeclaration>, className = ""): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  Object.assign(node.style, style);
  return node;
}

function pill(text: string, variant: "light" | "dark", fontClass = "font-sans"): HTMLElement {
  const node = el(
    "div",
    {
      padding: "4px 12px",
      borderRadius: "999px",
      border: `2px solid ${INK}`,
      background: variant === "dark" ? INK : "#FFFFFF",
      color: variant === "dark" ? "#FFFFFF" : INK,
      fontSize: "12px",
      fontWeight: "700",
      whiteSpace: "nowrap",
      lineHeight: "1.4",
    },
    fontClass
  );
  node.textContent = text;
  return node;
}

/** Grade tile with a hard ink shadow, optionally captioned with the address. */
export function buildingMarker(grade: string, caption?: string): HTMLElement {
  const g = toGrade(grade, "F");
  // Above food pins and the walk label, which are added after it.
  const root = el("div", { display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", zIndex: "3" }, "byr-marker");
  const tile = el(
    "div",
    {
      width: "38px",
      height: "46px",
      borderRadius: "9px",
      border: `2.5px solid ${INK}`,
      background: GRADE_META[g].bg,
      color: GRADE_META[g].fg,
      boxShadow: `4px 4px 0 ${INK}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: "30px",
      fontWeight: "800",
      lineHeight: "1",
    },
    "font-display"
  );
  tile.textContent = g;
  tile.setAttribute("role", "img");
  tile.setAttribute("aria-label", `Grade ${g}`);
  root.appendChild(tile);
  if (caption) root.appendChild(pill(caption, "dark"));
  return root;
}

/** Ink disc with a briefcase, captioned "Work · <place>". */
export function workMarker(caption: string): HTMLElement {
  const root = el("div", { display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }, "byr-marker");
  const disc = el("div", {
    width: "46px",
    height: "46px",
    borderRadius: "50%",
    background: INK,
    border: "3px solid #FFFFFF",
    boxShadow: `0 0 0 2px ${INK}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  });
  disc.innerHTML = svgMarkup(ICON_SVG.briefcase, 22, "#FFFFFF");
  root.appendChild(disc);
  root.appendChild(pill(caption, "light"));
  return root;
}

/** Plain caption pill ("26 min", "5 min walk"). */
export function labelMarker(text: string, display = false): HTMLElement {
  const root = el("div", {}, "byr-marker");
  const node = pill(text, "light", display ? "font-display" : "font-sans");
  if (display) {
    node.style.fontSize = "17px";
    node.style.fontWeight = "800";
    node.style.padding = "5px 16px";
    node.style.border = `2.5px solid ${INK}`;
  }
  root.appendChild(node);
  return root;
}

/**
 * Show or hide a marker built by stationMarker/labelMarker. Mapbox owns the
 * marker element's own `opacity` (it resets it on every render to fade
 * occluded markers), so visibility lives on the inner element instead.
 */
export function setMarkerShown(marker: HTMLElement, shown: boolean) {
  const inner = marker.firstElementChild as HTMLElement | null;
  if (inner) inner.style.opacity = shown ? "1" : "0";
}

/**
 * A stop on the drawn route (station, bus stop, pier): a white dot ringed in the line's color,
 * with the station name beside it. Starts hidden; the route animation reveals
 * it (setMarkerShown) when the line reaches the station.
 */
export function stationMarker(name: string | null, color: string | null): HTMLElement {
  const outer = el("div", { zIndex: "2" }, "byr-marker");
  const root = el("div", {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    opacity: "0",
    transition: "opacity 220ms ease-out",
  });
  outer.appendChild(root);
  const dot = el("span", {
    width: "16px",
    height: "16px",
    borderRadius: "50%",
    background: "#FFFFFF",
    border: `4px solid ${color ?? INK}`,
    boxShadow: `0 0 0 1.5px ${INK}`,
    flex: "0 0 auto",
  });
  root.appendChild(dot);
  if (name) {
    const label = pill(name, "light");
    label.style.fontSize = "11px";
    label.style.padding = "2px 8px";
    root.appendChild(label);
  }
  return outer;
}

const FOOD_ICON: Record<FoodPlace["category"], string> = {
  deli: ICON_SVG.store,
  grocery: ICON_SVG.basket,
  restaurant: ICON_SVG.restaurant,
};

const FOOD_KIND: Record<FoodPlace["category"], string> = {
  deli: "Deli or corner store",
  grocery: "Grocery",
  restaurant: "Restaurant",
};

/**
 * Category icon on a disc colored by (estimated) price tier. The disc is a real
 * button (click/tap opens the place's popup); its name shows on hover/focus via
 * the .byr-food-label CSS in globals.css, and stays up while the place is open.
 */
export function foodMarker(place: FoodPlace, onOpen: () => void): HTMLElement {
  const price = place.price_tier ? PRICE_META[place.price_tier] : PRICE_UNKNOWN;
  const root = el("div", {}, "byr-marker byr-food");
  const disc = el("button", {
    width: "34px",
    height: "34px",
    padding: "0",
    borderRadius: "50%",
    border: `2px solid ${INK}`,
    background: price.bg,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  }, "byr-food-disc");
  disc.setAttribute("type", "button");
  disc.setAttribute("data-interactive", "");
  const priceText = place.price_tier ? `, ${PRICE_META[place.price_tier].symbol}` : "";
  disc.setAttribute("aria-label", `${place.name}, ${FOOD_KIND[place.category]}${priceText}, ${place.walk_min} minute walk`);
  disc.innerHTML = svgMarkup(FOOD_ICON[place.category], 18, price.fg, 2.1);
  disc.addEventListener("click", (e) => {
    // Keep the map's own click (which closes popups) from firing too.
    e.stopPropagation();
    onOpen();
  });
  const label = el("span", {}, "byr-food-label font-sans");
  label.setAttribute("aria-hidden", "true");
  label.textContent = place.name;
  root.appendChild(disc);
  root.appendChild(label);
  return root;
}
