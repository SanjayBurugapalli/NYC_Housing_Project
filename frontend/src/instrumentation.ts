// Next.js calls register() once at server boot. We dispatch to the appropriate
// Sentry config based on the runtime so the edge bundle stays lean.
// https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  } else if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

// Forwards uncaught request errors to Sentry. Required for App Router handlers.
export { captureRequestError as onRequestError } from "@sentry/nextjs";
