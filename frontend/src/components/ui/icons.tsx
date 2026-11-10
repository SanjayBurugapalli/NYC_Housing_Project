import type { ReactNode, SVGProps } from "react";

// Stroke icons drawn for the redesign (24×24 grid, round caps). Decorative by
// default (aria-hidden) — give the surrounding control an aria-label instead.

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  size?: number;
  strokeWidth?: number;
}

function make(children: ReactNode, defaultStroke = 2.2) {
  return function Icon({ size = 20, strokeWidth = defaultStroke, ...rest }: IconProps) {
    return (
      <svg
        aria-hidden="true"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        {...rest}
      >
        {children}
      </svg>
    );
  };
}

// The brand mark (public/logo-mark.svg) on its own 100×104 grid with a fixed
// stroke. The house takes currentColor so it reads white on the ink nav tiles;
// the check stays grade-A teal.
export function LogoIcon({ size = 20, ...rest }: Omit<IconProps, "strokeWidth">) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="10 2 100 104"
      fill="none"
      strokeWidth={8}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      <path d="M83.2 48.6 L96 60 V100 H24 V60 L49.5 37.3" stroke="currentColor" />
      <path d="M60 28 L72.7 39.3 L87 8.4" stroke="#1FA187" />
    </svg>
  );
}
export const SparkleIcon = make(<><path d="M11 3l1.9 5.1L18 10l-5.1 1.9L11 17l-1.9-5.1L4 10l5.1-1.9z" /><path d="M19 15v4M17 17h4" /></>, 2);
export const SearchIcon = make(<><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>);
export const LinkIcon = make(<><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>);
export const CloseIcon = make(<path d="M6 6l12 12M18 6L6 18" />, 2.4);
export const ArrowRightIcon = make(<><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></>);
export const ArrowDownIcon = make(<><path d="M12 5v14" /><path d="M6 13l6 6 6-6" /></>);
export const ChevronRightIcon = make(<path d="M9 6l6 6-6 6" />);
export const ChevronLeftIcon = make(<path d="M15 6l-6 6 6 6" />, 2.4);
export const ChevronDownIcon = make(<path d="M6 9l6 6 6-6" />, 2.4);
export const TrainIcon = make(<><rect x="6" y="3" width="12" height="14" rx="3" /><path d="M6 11h12M9 21l1.5-4M15 21l-1.5-4M9.5 14h.01M14.5 14h.01" /></>, 2);
export const RestaurantIcon = make(<path d="M7 3v18M4.5 3v5a2.5 2.5 0 0 0 5 0V3M17 3v18M17 3c-3 2.5-3 7.5 0 10" />, 2);
export const StoreIcon = make(<path d="M4 10v10h16V10M3 10l2-6h14l2 6M3 10h18M10 20v-5h4v5" />, 2);
export const BasketIcon = make(<path d="M3 10h18l-2 10H5zM8 10l4-7 4 7" />, 2);
export const BriefcaseIcon = make(<><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 13h18" /></>);
export const WalkIcon = make(<><circle cx="13" cy="4.5" r="1.8" /><path d="M9 21l2.5-6-2-3 1-5 3 1.5 2 3 2.5 1M11.5 15l3 2.5 1 3.5" /></>);
export const PersonIcon = make(<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>, 2);
export const CompareIcon = make(<><rect x="4" y="4" width="7" height="16" rx="1.5" /><rect x="13" y="4" width="7" height="16" rx="1.5" /></>);
export const FlameIcon = make(<path d="M12 3c1 3 4 5 4 9a4 4 0 0 1-8 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 0-8z" />, 2);
export const ClipboardIcon = make(<><rect x="6" y="5" width="12" height="16" rx="2" /><path d="M9 5V3h6v2M9 11h6M9 15h4" /></>, 2);
export const ScaleIcon = make(<path d="M12 4v16M7 20h10M5 8h14M5 8l-2 6h4zM19 8l-2 6h4z" />, 2);
export const BugIcon = make(<><ellipse cx="12" cy="13" rx="4" ry="5" /><path d="M12 8V5M9 5l1.5 2M15 5l-1.5 2M8 11H4M8 15H4M16 11h4M16 15h4" /></>, 2);
export const BuildingIcon = make(<path d="M4 20V8l8-4 8 4v12M9 20v-5h6v5M3 20h18" />, 2);
export const SpeakerIcon = make(<><path d="M4 10v4h3l5 4V6L7 10z" /><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" /></>, 2);
export const PlusIcon = make(<path d="M12 5v14M5 12h14" />, 2.4);
export const MinusIcon = make(<path d="M5 12h14" />, 2.4);
export const LocateIcon = make(<><circle cx="12" cy="12" r="3" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /></>);
export const SlidersIcon = make(<><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></>);
export const CheckIcon = make(<path d="M5 12l5 5 9-10" />, 3);
export const MenuIcon = make(<path d="M4 7h16M4 12h16M4 17h16" />);
export const RefreshIcon = make(<><path d="M20 12a8 8 0 1 1-2.4-5.7" /><path d="M20 4v4h-4" /></>);
export const FlagIcon = make(<><path d="M5 21V4" /><path d="M5 4h11l-2 4 2 4H5" /></>);
export const ChatIcon = make(<path d="M4 5h16v11H9l-5 4z" />);
export const DownloadIcon = make(<><path d="M12 4v11" /><path d="M7 10l5 5 5-5M5 20h14" /></>);

/**
 * Raw inner SVG markup for icons that are rendered into Mapbox HTML markers
 * (outside React). Constant strings only — never interpolate data into these.
 */
export const ICON_SVG = {
  store: '<path d="M4 10v10h16V10M3 10l2-6h14l2 6M3 10h18M10 20v-5h4v5"/>',
  basket: '<path d="M3 10h18l-2 10H5zM8 10l4-7 4 7"/>',
  restaurant: '<path d="M7 3v18M4.5 3v5a2.5 2.5 0 0 0 5 0V3M17 3v18M17 3c-3 2.5-3 7.5 0 10"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 13h18"/>',
} as const;

export function svgMarkup(inner: string, size: number, stroke: string, strokeWidth = 2.2): string {
  return `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}
