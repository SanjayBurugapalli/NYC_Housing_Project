/** @type {import('next').NextConfig} */

const { withSentryConfig } = require("@sentry/nextjs");

const CSP = [
  "default-src 'self'",
  // Next.js runtime + Mapbox GL require inline scripts and eval
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
  // Tailwind and Mapbox GL inject inline styles
  "style-src 'self' 'unsafe-inline' https://api.mapbox.com",
  // Mapbox tiles, sprites, fonts + data: URIs for canvas
  "img-src 'self' data: blob: https://*.mapbox.com",
  // Mapbox GL uses web workers loaded as blobs
  "worker-src blob:",
  // API calls + Mapbox tile/event endpoints + Sentry browser SDK ingest
  [
    "connect-src",
    "'self'",
    "https://api.mapbox.com",
    "https://events.mapbox.com",
    "https://*.mapbox.com",
    "http://localhost:8000",        // local dev backend
    "https://*.railway.app",        // Railway-hosted backend
    "https://*.onrender.com",       // Render-hosted backend
    "https://*.public.blob.vercel-storage.com", // PMTiles building tiles (range requests)
    "https://geosearch.planninglabs.nyc", // NYC GeoSearch: work-address type-ahead
    "https://*.ingest.sentry.io",   // Sentry SaaS ingest (sends errors + perf events)
    "https://*.ingest.us.sentry.io",
  ].join(" "),
  // Disallow embedding in iframes
  "frame-ancestors 'none'",
  // Block mixed-content in production
  "upgrade-insecure-requests",
].join("; ");

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: CSP },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // geolocation=(self): the map's "Go to my location" button.
          { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=()" },
        ],
      },
    ];
  },
};

// Sentry build-time options: upload source maps so stack traces in the dashboard
// point at original TS, not minified JS. Requires SENTRY_AUTH_TOKEN at build.
module.exports = withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Silence the SDK's chatty build output unless we explicitly opt in.
  silent: !process.env.CI,
  // Generate source maps for Sentry upload, then delete them from the
  // public output so the browser bundle stays opaque to end users.
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
  // Disables logger statements at build time to reduce bundle size.
  disableLogger: true,
  // Skip uploading on local dev builds where SENTRY_AUTH_TOKEN is unset.
  dryRun: !process.env.SENTRY_AUTH_TOKEN,
});
