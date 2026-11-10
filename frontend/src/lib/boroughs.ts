import type { Borough } from "@/types/building";

export const BOROUGH_OPTIONS: { value: Borough; label: string }[] = [
  { value: "MANHATTAN", label: "Manhattan" },
  { value: "BROOKLYN", label: "Brooklyn" },
  { value: "QUEENS", label: "Queens" },
  { value: "BRONX", label: "Bronx" },
  { value: "STATEN ISLAND", label: "Staten Island" },
];

/** Rough [[west, south], [east, north]] bounds, for framing a borough on selection. */
export const BOROUGH_BOUNDS: Record<Borough, [[number, number], [number, number]]> = {
  MANHATTAN: [[-74.0479, 40.6829], [-73.9067, 40.882]],
  BROOKLYN: [[-74.042, 40.5707], [-73.8334, 40.7395]],
  QUEENS: [[-73.9626, 40.5413], [-73.7004, 40.8007]],
  BRONX: [[-73.9339, 40.7855], [-73.7654, 40.9153]],
  "STATEN ISLAND": [[-74.2557, 40.496], [-74.0522, 40.649]],
};
