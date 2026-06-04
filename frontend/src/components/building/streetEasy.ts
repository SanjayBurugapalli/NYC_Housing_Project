// StreetEasy building-URL construction from a PLUTO-style address.

// StreetEasy uses full street-suffix names in building URLs (e.g. "avenue" not
// "ave"). PLUTO data may store abbreviated forms, so expand the trailing suffix
// to match.
const STREET_SUFFIX_EXPANSIONS: Record<string, string> = {
  ave: "avenue", blvd: "boulevard", st: "street", dr: "drive",
  rd: "road", ln: "lane", ct: "court", pl: "place", ter: "terrace",
  pkwy: "parkway", pky: "parkway", hwy: "highway", cir: "circle",
};

export function addressToSlug(address: string, queensStyle: boolean): string {
  const spaceIdx = address.indexOf(" ");
  const houseNum = spaceIdx >= 0 ? address.slice(0, spaceIdx) : address;
  const streetPart = spaceIdx >= 0 ? address.slice(spaceIdx + 1) : "";

  const houseSlug = queensStyle
    ? houseNum.toLowerCase().replace(/-/g, "_").replace(/[^a-z0-9_]/g, "")
    : houseNum.toLowerCase().replace(/[^a-z0-9-]/g, "");

  let street = streetPart
    .toLowerCase()
    .replace(/(\d+)(?:st|nd|rd|th)\b/g, "$1"); // strip ordinal suffixes

  // Expand abbreviated suffix (last word only, to avoid "ST" → "STREET" in "ST NICHOLAS")
  const words = street.trim().split(/\s+/);
  if (words.length > 0) {
    const last = words[words.length - 1];
    if (STREET_SUFFIX_EXPANSIONS[last]) {
      words[words.length - 1] = STREET_SUFFIX_EXPANSIONS[last];
    }
    street = words.join(" ");
  }

  const streetSlug = street
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, "-");

  return streetPart ? `${houseSlug}-${streetSlug}` : houseSlug;
}

export function buildStreetEasyUrl(address: string, borough: string, subNeighborhood?: string | null): string {
  const boroughMap: Record<string, string> = {
    MANHATTAN: "new_york",
    BROOKLYN: "brooklyn",
    BRONX: "bronx",
    "STATEN ISLAND": "staten_island",
  };

  const isQueens = borough.toUpperCase() === "QUEENS";

  if (isQueens) {
    if (!subNeighborhood) {
      const query = encodeURIComponent(`${address}, Queens, NY`);
      return `https://streeteasy.com/search?query=${query}`;
    }
    const neighborhoodSlug = subNeighborhood
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/_+$/g, "");
    const addressSlug = addressToSlug(address, true);
    return `https://streeteasy.com/building/${addressSlug}-${neighborhoodSlug}`;
  }

  const area = boroughMap[borough.toUpperCase()];
  if (area) {
    const addressSlug = addressToSlug(address, false);
    return `https://streeteasy.com/building/${addressSlug}-${area}`;
  }

  const query = encodeURIComponent(`${address}, ${borough}, NY`);
  return `https://streeteasy.com/search?query=${query}`;
}
