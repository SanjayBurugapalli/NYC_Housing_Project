/** @type {import('next').NextConfig} */

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
  // API calls + Mapbox tile/event endpoints
  [
    "connect-src",
    "'self'",
    "https://api.mapbox.com",
    "https://events.mapbox.com",
    "https://*.mapbox.com",
    "http://localhost:8000",   // local dev backend
    "https://*.railway.app",   // Railway-hosted backend
    "https://*.onrender.com",  // Render-hosted backend
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
          { key: "Permissions-Policy", value: "geolocation=(), camera=(), microphone=()" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
