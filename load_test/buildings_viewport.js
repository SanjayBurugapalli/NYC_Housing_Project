// k6 load test for GET /api/buildings (viewport query) — the hottest, most
// scale-sensitive endpoint and the biggest PostGIS cost.
//
// Goal: confirm the backend sustains map-panning traffic within the project's
// <200ms p95 viewport target (see CLAUDE.md Performance Requirements).
//
// IMPORTANT — rate limit: /api/buildings is limited to 300/min PER IP
// (app/core/rate_limit.py). A single k6 box at 100 RPS will trip that in ~3s
// and you'll be measuring the limiter (429s), not the database. Before a real
// throughput test either:
//   (a) temporarily raise/disable the limit on a staging deploy, or
//   (b) point BASE_URL at a backend with the limiter bypassed for your IP.
// The script treats 429 as a soft failure and reports its rate separately so a
// misconfigured run is obvious rather than silently "passing".
//
// Usage:
//   k6 run load_test/buildings_viewport.js
//   BASE_URL=https://api.example.com TARGET_RPS=100 k6 run load_test/buildings_viewport.js

import http from "k6/http";
import { check } from "k6";
import { Rate, Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:8000";
const TARGET_RPS = parseInt(__ENV.TARGET_RPS || "100", 10);

const rateLimited = new Rate("rate_limited_429");
const viewportLatency = new Trend("viewport_latency_ms", true);

// Representative NYC viewports (dense + sparse, zoomed to individual-building
// range z13–16) so the test exercises both heavy Manhattan tiles and light
// outer-borough ones rather than one cherry-picked easy bbox.
const VIEWPORTS = [
  { bbox: "-74.020,40.700,-73.960,40.730", zoom: 15 }, // Lower Manhattan (dense)
  { bbox: "-73.990,40.745,-73.960,40.765", zoom: 16 }, // Midtown East (dense)
  { bbox: "-73.960,40.800,-73.930,40.820", zoom: 15 }, // Harlem
  { bbox: "-73.950,40.670,-73.910,40.700", zoom: 14 }, // Bed-Stuy / Brooklyn
  { bbox: "-73.900,40.840,-73.860,40.870", zoom: 14 }, // South Bronx
  { bbox: "-73.820,40.710,-73.780,40.740", zoom: 13 }, // Central Queens (sparse)
  { bbox: "-74.140,40.580,-74.100,40.620", zoom: 13 }, // Staten Island (sparse)
];

export const options = {
  scenarios: {
    sustained: {
      executor: "constant-arrival-rate",
      rate: TARGET_RPS,
      timeUnit: "1s",
      duration: "2m",
      preAllocatedVUs: Math.max(50, TARGET_RPS),
      maxVUs: Math.max(200, TARGET_RPS * 3),
    },
  },
  thresholds: {
    // Viewport SLA from CLAUDE.md. http_req_duration excludes 429s via the
    // tag filter so a rate-limited run doesn't mask real DB latency.
    "viewport_latency_ms": ["p(95)<200"],
    "rate_limited_429": ["rate<0.01"], // >1% 429 means the limiter wasn't raised
    "http_req_failed": ["rate<0.01"],
  },
};

export default function () {
  const v = VIEWPORTS[Math.floor(Math.random() * VIEWPORTS.length)];
  const url = `${BASE_URL}/api/buildings?bbox=${v.bbox}&zoom=${v.zoom}`;
  const res = http.get(url, { tags: { name: "buildings_viewport" } });

  const limited = res.status === 429;
  rateLimited.add(limited);
  if (!limited) viewportLatency.add(res.timings.duration);

  check(res, {
    "status 200": (r) => r.status === 200,
    "is JSON": (r) => (r.headers["Content-Type"] || "").includes("application/json"),
  });
}
