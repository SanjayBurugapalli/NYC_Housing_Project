// Decorative hero illustration: rotated city blocks with every building tinted
// by grade, a dotted commute arc to a work pin, and three food pins.

const INK = "#12141A";

function Blocks({ id }: { id: string }) {
  return (
    <defs>
      <pattern id={`${id}-blk`} width="190" height="76" patternUnits="userSpaceOnUse">
        <rect x="8" y="8" width="174" height="60" rx="4" fill="#E4E8ED" />
      </pattern>
      <pattern id={`${id}-p1`} width="190" height="76" patternUnits="userSpaceOnUse">
        {[
          [11, 11, 18, "#1FA187"], [32, 11, 18, "#8FD3B6"], [53, 11, 18, "#1FA187"], [74, 11, 18, "#1FA187"], [95, 11, 18, "#8FD3B6"], [116, 11, 39, "#1FA187"], [158, 11, 18, "#8FD3B6"],
          [11, 39, 18, "#8FD3B6"], [32, 39, 39, "#1FA187"], [74, 39, 18, "#8FD3B6"], [95, 39, 18, "#1FA187"], [116, 39, 18, "#1FA187"], [137, 39, 18, "#8FD3B6"], [158, 39, 18, "#1FA187"],
        ].map(([x, y, w, fill], i) => (
          <rect key={i} x={x} y={y} width={w} height="26" rx="2" fill={fill as string} />
        ))}
      </pattern>
      <pattern id={`${id}-p2`} width="570" height="228" patternUnits="userSpaceOnUse">
        {[
          [32, 11, 18, "#F4D03F"], [32, 39, 39, "#F4D03F"], [95, 115, 18, "#F28C28"], [327, 39, 18, "#F4D03F"], [306, 163, 39, "#F4D03F"],
          [391, 87, 18, "#C62F2F"], [412, 87, 18, "#F28C28"], [538, 191, 18, "#F4D03F"], [74, 163, 18, "#F28C28"], [201, 115, 18, "#F4D03F"],
        ].map(([x, y, w, fill], i) => (
          <rect key={i} x={x} y={y} width={w} height="26" rx="2" fill={fill as string} />
        ))}
      </pattern>
      <pattern id={`${id}-p3`} width="760" height="380" patternUnits="userSpaceOnUse">
        {[
          [53, 239, 18, 26, "#C62F2F"], [264, 87, 18, 26, "#C62F2F"], [475, 343, 18, 26, "#C62F2F"], [602, 39, 39, 26, "#F28C28"], [665, 163, 18, 26, "#F28C28"],
          [158, 87, 18, 26, "#F28C28"], [454, 191, 18, 26, "#C62F2F"], [201, 315, 18, 26, "#F4D03F"], [686, 267, 18, 26, "#F4D03F"], [264, 239, 18, 54, "#F28C28"],
        ].map(([x, y, w, h, fill], i) => (
          <rect key={i} x={x} y={y} width={w} height={h} rx="2" fill={fill as string} />
        ))}
      </pattern>
    </defs>
  );
}

export function CityArt() {
  const id = "hero";
  return (
    <svg
      role="img"
      aria-label="Illustrated map of city blocks with every building colored by its grade, a dotted commute line to work and food spots nearby"
      width="100%"
      height="100%"
      viewBox="0 0 560 430"
      preserveAspectRatio="xMidYMid slice"
      style={{ display: "block" }}
    >
      <Blocks id={id} />
      <rect width="560" height="430" fill="#FFFFFF" />
      <g transform="translate(330 170) rotate(-29) scale(1.25) translate(-674 -418)">
        {["blk", "p1", "p2", "p3"].map((p) => (
          <rect key={p} x="-600" y="-600" width="2600" height="2100" fill={`url(#${id}-${p})`} />
        ))}
        <rect x="665" y="391" width="18" height="54" rx="2" fill="#F4D03F" stroke={INK} strokeWidth="2.5" />
      </g>
      <path d="M330 170 Q 200 60 70 96" fill="none" stroke={INK} strokeWidth="5" strokeLinecap="round" strokeDasharray="0.1 12" />
      <g transform="translate(70 96)">
        <circle r="17" fill={INK} stroke="#FFFFFF" strokeWidth="2.5" />
        <g transform="translate(-9 -9) scale(0.75)" fill="none" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="7" width="18" height="13" rx="2" />
          <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 13h18" />
        </g>
      </g>
      <g fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <g transform="translate(440 110)">
          <circle r="15" fill="#DCD6FF" stroke={INK} strokeWidth="2" />
          <path transform="translate(-8.4 -8.8) scale(0.7)" stroke={INK} d="M4 10v10h16V10M3 10l2-6h14l2 6M3 10h18M10 20v-5h4v5" />
        </g>
        <g transform="translate(470 230)">
          <circle r="15" fill="#3D2DB3" stroke={INK} strokeWidth="2" />
          <path transform="translate(-8.4 -8.4) scale(0.7)" stroke="#FFFFFF" d="M7 3v18M4.5 3v5a2.5 2.5 0 0 0 5 0V3M17 3v18M17 3c-3 2.5-3 7.5 0 10" />
        </g>
        <g transform="translate(250 250)">
          <circle r="15" fill="#8C7BFF" stroke={INK} strokeWidth="2" />
          <path transform="translate(-8.4 -8.4) scale(0.7)" stroke={INK} d="M3 10h18l-2 10H5zM8 10l4-7 4 7" />
        </g>
      </g>
      <g transform="translate(330 164)">
        <rect x="-13" y="-16" width="34" height="40" rx="8" fill={INK} />
        <rect x="-17" y="-20" width="34" height="40" rx="8" fill="#F4D03F" stroke={INK} strokeWidth="2.5" />
        <text y="9" textAnchor="middle" fontFamily="var(--font-bricolage), sans-serif" fontSize="26" fontWeight="800" fill={INK}>
          C
        </text>
      </g>
    </svg>
  );
}
