import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — BeforeYouRent",
  description: "What BeforeYouRent collects, why, and how to reach us.",
};

const LAST_UPDATED = "June 2, 2026";

export default function PrivacyPage() {
  return (
    <main className="min-h-dvh bg-gray-900 text-gray-200">
      <nav className="sticky top-0 z-50 border-b border-gray-700/50 bg-gray-900/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5 text-white no-underline">
            <img src="/logo-mark.svg" alt="" className="h-8 w-8" aria-hidden="true" />
            <span className="text-[15px] font-semibold tracking-tight">BeforeYouRent</span>
          </Link>
          <Link href="/map" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors">
            Open map
          </Link>
        </div>
      </nav>

      <article className="mx-auto max-w-3xl px-4 py-12 sm:px-8">
        {/* DRAFT — replace this banner once the text has been reviewed (ideally by a lawyer). */}
        <div className="mb-8 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <strong>Draft.</strong> This policy is a starting point and has not been reviewed by
          counsel. Confirm it matches actual data practices before launch.
        </div>

        <h1 className="text-3xl font-semibold tracking-tight text-white">Privacy Policy</h1>
        <p className="mt-2 text-sm text-gray-400">Last updated: {LAST_UPDATED}</p>

        <div className="prose-invert mt-8 space-y-8 text-[15px] leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-white">The short version</h2>
            <p className="mt-3">
              BeforeYouRent is an informational tool that shows public NYC building data. We do not
              sell your data, we do not run third-party advertising trackers, and we collect only
              what we need to keep the site working and to understand how it&apos;s used. We never
              ask you to create an account.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">What we collect</h2>
            <ul className="mt-3 list-disc space-y-3 pl-5">
              <li>
                <strong>Usage analytics.</strong> When you use the site we record anonymous events
                (for example, &ldquo;a search ran&rdquo; or &ldquo;a building was viewed&rdquo;). These events are
                stored with a <em>one-way hash</em> of your IP address and browser user-agent — not
                the raw values — so we can estimate distinct usage and spot abuse without
                identifying you. We also use Vercel Analytics, which collects aggregate,
                privacy-friendly traffic metrics and does not use cookies.
              </li>
              <li>
                <strong>Feedback you send.</strong> If you submit the feedback form, we store your
                message, an optional star rating, the page you sent it from, and — only if you
                choose to provide it — your email address, so we can follow up.
              </li>
              <li>
                <strong>Search queries.</strong> Natural-language searches are processed to return
                results and may be logged in the analytics events above to improve the feature.
                Don&apos;t include personal or sensitive information in a search.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">What we do not collect</h2>
            <p className="mt-3">
              No accounts, no passwords, no payment information, no precise location, and no raw IP
              addresses stored against your activity. The building data shown is public record from
              NYC Open Data and is not about you.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">How we use it</h2>
            <p className="mt-3">
              To operate and improve the site, measure aggregate usage, diagnose errors (via our
              error-monitoring provider), prevent abuse, and respond to feedback. We do not use your
              information for advertising and we do not sell or rent it.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">Service providers</h2>
            <p className="mt-3">
              We rely on a small number of infrastructure providers that process data on our behalf:
              hosting and analytics (Vercel), backend/database hosting (Railway), maps (Mapbox), and
              error monitoring (Sentry). Each receives only what it needs to provide its service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">Retention</h2>
            <p className="mt-3">
              Analytics events and feedback are retained only as long as useful for the purposes
              above and then deleted or further aggregated. You can ask us to delete feedback you
              submitted.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">Your choices</h2>
            <p className="mt-3">
              You can browse without submitting any feedback or email. To request deletion of
              feedback you sent, contact us below. Most browsers also let you block analytics
              requests if you prefer.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">Contact</h2>
            <p className="mt-3">
              Questions or deletion requests:{" "}
              <a
                href="https://github.com/SanjayBurugapalli/NYC_Housing_Project/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300"
              >
                open an issue
              </a>{" "}
              on our GitHub repository.
            </p>
          </section>
        </div>

        <div className="mt-12 border-t border-gray-800 pt-6 text-sm">
          <Link href="/" className="text-gray-400 hover:text-white transition-colors">
            ← Back to home
          </Link>
        </div>
      </article>
    </main>
  );
}
