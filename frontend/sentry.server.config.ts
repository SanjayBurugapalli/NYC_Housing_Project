// Runs in the Node.js server (route handlers, server actions, SSR).
// Loaded via instrumentation.ts when NEXT_RUNTIME === "nodejs".

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.VERCEL_ENV ?? "production",
  release: process.env.VERCEL_GIT_COMMIT_SHA,
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),
  // Server-side rarely needs PII; keep off unless we explicitly want headers/IPs.
  sendDefaultPii: false,
});
