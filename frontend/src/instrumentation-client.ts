// Runs in the browser before any user code. Replaces the older
// sentry.client.config.ts pattern in @sentry/nextjs v8+.

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "production",
  release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
  tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),
  // Session replay is generous on the free tier (50 replays/mo). Off by default;
  // flip these on later if you want to see what a user did before an error.
  replaysOnErrorSampleRate: 0,
  replaysSessionSampleRate: 0,
  // Strip PII (cookies, headers, IPs). Browser errors rarely need it for triage.
  sendDefaultPii: false,
});
