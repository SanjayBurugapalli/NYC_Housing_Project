// Ambient types for `mapbox-pmtiles`, which ships an ESM bundle (dist) with no
// bundled .d.ts. We import the prebuilt dist directly so Next/webpack doesn't
// have to transpile the package's raw-TS `main`. Only the surface we use is
// declared here: the PmTilesSource class and its static SOURCE_TYPE, which is
// passed to mapboxgl.Style.setSourceType() and used as a source `type`.
declare module "mapbox-pmtiles/dist/mapbox-pmtiles.js" {
  // The runtime class extends mapbox-gl's internal VectorTileSource; we only
  // ever reference it as an opaque source class plus the static type tag.
  export class PmTilesSource {
    static SOURCE_TYPE: string;
    static getMetadata(url: string): Promise<unknown>;
    static getHeader(url: string): Promise<unknown>;
  }
  export const SOURCE_TYPE: string;
  export default PmTilesSource;
}
