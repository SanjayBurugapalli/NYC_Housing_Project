import Link from "next/link";

const SOURCES = [
  {
    name: "PLUTO",
    desc: "Department of City Planning's tax-lot extract — building class, year built, unit count, and lot geometry for every parcel in the city.",
    tag: "Baseline",
  },
  {
    name: "311 Complaints",
    desc: "Tenant-reported issues: heat outages, hot water, pests, noise, plumbing. The unfiltered signal of what's actually happening inside the walls.",
    tag: "Complaints",
  },
  {
    name: "HPD Violations",
    desc: "Housing Preservation & Development code violations, classified A (minor), B (hazardous), or C (immediately hazardous).",
    tag: "Violations",
  },
  {
    name: "DOB Violations",
    desc: "Department of Buildings violations covering structural safety, permits, elevators, boilers, and construction-code compliance.",
    tag: "Violations",
  },
  {
    name: "Housing Litigations",
    desc: "Active and historical lawsuits against a building's owner — strong signal of systemic habitability disputes.",
    tag: "Legal",
  },
  {
    name: "Rodent Inspections",
    desc: "Department of Health & Mental Hygiene inspection results — passed, failed, bait applied, or compliance-in-progress.",
    tag: "Inspections",
  },
];

const GRADES = [
  { grade: "A", range: "97–100", color: "#22c55e", meaning: "No issues. Clean record across complaints, violations, and inspections." },
  { grade: "B", range: "90–96", color: "#84cc16", meaning: "Minor issues. Small number of non-hazardous items, no pattern of neglect." },
  { grade: "C", range: "75–89", color: "#eab308", meaning: "Moderate issues. Notable complaint or violation history worth reviewing." },
  { grade: "D", range: "55–74", color: "#f97316", meaning: "Significant issues. Recurring hazardous violations or active litigation." },
  { grade: "F", range: "0–54", color: "#ef4444", meaning: "Critical issues. Class C violations, systemic neglect, or pattern of harm." },
];

const WEIGHTS = [
  { label: "HPD Violations", pct: 30, color: "#ef4444" },
  { label: "Heat & Hot Water", pct: 20, color: "#f97316" },
  { label: "Pest & Rodent", pct: 15, color: "#eab308" },
  { label: "Structural Safety (DOB)", pct: 15, color: "#84cc16" },
  { label: "Litigation", pct: 12, color: "#22c55e" },
  { label: "Noise", pct: 8, color: "#3b82f6" },
];

const GLOSSARY = [
  { term: "BBL", acronym: "Borough-Block-Lot", def: "The 10-digit identifier unique to every tax lot in NYC. Format: 1 digit borough + 5 digit block + 4 digit lot. It's the key every city dataset joins on." },
  { term: "BIN", acronym: "Building Identification Number", def: "A 7-digit ID unique to each physical building, distinct from the lot it sits on. A single BBL can have multiple BINs." },
  { term: "HPD", acronym: "Housing Preservation & Development", def: "The NYC agency that enforces the Housing Maintenance Code. Issues Class A, B, and C violations based on severity." },
  { term: "DOB", acronym: "Department of Buildings", def: "The NYC agency overseeing construction, permits, elevators, boilers, and structural safety. Its violations are more often owner- or contractor-facing than tenant-facing." },
  { term: "Class A Violation", acronym: null, def: "Non-hazardous. Minor issues like chipped paint in a non-lead-painted unit or a missing hallway light bulb." },
  { term: "Class B Violation", acronym: null, def: "Hazardous. Includes lead paint, defective window guards, roach infestations, and broken smoke detectors. Must be corrected in 30 days." },
  { term: "Class C Violation", acronym: null, def: "Immediately hazardous. Includes no heat, no hot water, no gas, structural collapse risk, and mold over 10 sq ft. Must be corrected within 24 hours." },
  { term: "DOHMH", acronym: "Dept of Health & Mental Hygiene", def: "The NYC agency responsible for rodent inspection, bait treatment, and public-health enforcement at residential properties." },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-900 text-white" style={{ fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" }}>

      {/* ── Nav ── */}
      <nav className="sticky top-0 z-50 border-b border-gray-700/50 bg-gray-900/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-8">
          <Link href="/" className="flex items-center gap-2.5 text-white no-underline">
            <img src="/logo-mark.svg" alt="" className="h-8 w-8" aria-hidden="true" />
            <span className="text-[15px] font-semibold tracking-tight">BeforeYouRent</span>
          </Link>
          <div className="flex items-center gap-7">
            <a href="#about" className="hidden text-sm font-medium text-gray-300 hover:text-white transition-colors sm:block">About</a>
            <a href="#scoring" className="hidden text-sm font-medium text-gray-300 hover:text-white transition-colors sm:block">Scoring</a>
            <a href="#glossary" className="hidden text-sm font-medium text-gray-300 hover:text-white transition-colors sm:block">Glossary</a>
            <Link href="/map" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors">
              Open map
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden px-8 pb-20 pt-24">
        {/* Background glows */}
        <div className="pointer-events-none absolute inset-0 z-0">
          <div className="absolute right-0 top-0 h-[500px] w-[1000px] rounded-full opacity-80" style={{ background: "radial-gradient(ellipse at 80% 20%, rgba(59,130,246,0.08), transparent 60%)" }} />
          <div className="absolute bottom-0 left-0 h-[400px] w-[800px] rounded-full opacity-80" style={{ background: "radial-gradient(ellipse at 15% 80%, rgba(239,68,68,0.06), transparent 60%)" }} />
          {/* Grid */}
          <div className="absolute inset-0 opacity-25" style={{
            backgroundImage: "linear-gradient(rgba(55,65,81,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(55,65,81,0.4) 1px, transparent 1px)",
            backgroundSize: "42px 42px",
            WebkitMaskImage: "radial-gradient(ellipse 800px 500px at 50% 40%, #000 30%, transparent 80%)",
            maskImage: "radial-gradient(ellipse 800px 500px at 50% 40%, #000 30%, transparent 80%)",
          }} />
        </div>

        <div className="relative z-10 mx-auto max-w-6xl text-center">
          {/* Eyebrow */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-gray-600/60 bg-gray-800/80 px-3.5 py-1.5 text-xs font-medium tracking-wide text-gray-400 backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            Built on NYC public data · Updated nightly
          </div>

          {/* Headline */}
          <h1 className="mx-auto mb-0 mt-0 max-w-4xl text-6xl font-bold leading-tight tracking-tight sm:text-7xl" style={{ letterSpacing: "-0.03em" }}>
            Know your building{" "}
            <span style={{
              background: "linear-gradient(90deg, #22c55e 0%, #84cc16 20%, #eab308 50%, #f97316 75%, #ef4444 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}>
              before you sign
            </span>
            .
          </h1>

          <p className="mx-auto mt-6 max-w-lg text-[19px] leading-relaxed text-gray-400">
            BeforeYouRent analyzes complaints, violations, and inspections across every
            NYC residential building — then assigns each one a health score and letter grade
            from A to F. Free. No login.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/map"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3.5 text-[15px] font-medium text-white hover:bg-blue-700 transition-colors"
              style={{ transition: "background 150ms, transform 150ms" }}
            >
              Search the map →
            </Link>
            <a
              href="#scoring"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-600 bg-gray-800/90 px-6 py-3.5 text-[15px] font-medium text-gray-200 hover:border-gray-500 hover:bg-gray-800 transition-colors"
            >
              How scoring works
            </a>
          </div>

        </div>
      </section>

      {/* ── Stats ── */}
      <div className="border-b border-t border-gray-800 py-8">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-8 text-center sm:grid-cols-4">
          {[
            { num: "859,000+", label: "Residential buildings indexed" },
            { num: "6", label: "Public datasets combined" },
            { num: "Nightly", label: "Data refresh cadence" },
            { num: "Free", label: "No login, no paywall" },
          ].map(({ num, label }) => (
            <div key={label}>
              <div className="text-4xl font-bold tracking-tight" style={{ letterSpacing: "-0.02em" }}>{num}</div>
              <div className="mt-2 text-sm text-gray-400">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── About ── */}
      <section id="about" className="px-8 py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto mb-14 max-w-2xl text-center">
            <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-blue-400">What it is</div>
            <h2 className="text-4xl font-bold tracking-tight" style={{ letterSpacing: "-0.02em" }}>Six public datasets. One letter grade.</h2>
            <p className="mt-4 text-[17px] leading-relaxed text-gray-400">
              Every score is built from open NYC records — nothing we wouldn&apos;t want a tenant,
              a journalist, or an inspector to see. Here&apos;s everything that feeds in.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SOURCES.map(({ name, desc, tag }) => (
              <div key={name} className="rounded-xl border border-gray-700 bg-gray-800/60 p-5">
                <h3 className="mb-1.5 text-[15px] font-semibold text-white">{name}</h3>
                <p className="text-[13px] leading-snug text-gray-400">{desc}</p>
                <span className="mt-3 inline-block rounded bg-gray-700/70 px-2 py-0.5 text-[11px] font-medium tracking-wide text-gray-300">
                  {tag}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Scoring ── */}
      <section id="scoring" className="px-8 py-24" style={{ background: "linear-gradient(180deg, transparent, rgba(17,24,39,0.6), transparent)" }}>
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto mb-14 max-w-2xl text-center">
            <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-blue-400">How scoring works</div>
            <h2 className="text-4xl font-bold tracking-tight" style={{ letterSpacing: "-0.02em" }}>From 0 to 100, converted to a letter.</h2>
            <p className="mt-4 text-[17px] leading-relaxed text-gray-400">
              Each building starts at 100 and loses points for every complaint, violation, litigation,
              or failed inspection — weighted by severity and recency.
            </p>
          </div>

          {/* Grade cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
            {GRADES.map(({ grade, range, color, meaning }) => (
              <div
                key={grade}
                className="rounded-xl border border-gray-700 bg-gray-800/60 p-5 transition-transform hover:-translate-y-1"
                style={{ borderTopWidth: 3, borderTopColor: color }}
              >
                <div className="text-5xl font-bold leading-none tracking-tight" style={{ color, letterSpacing: "-0.03em" }}>{grade}</div>
                <div className="mt-2 text-[13px] font-medium text-gray-200">{range}</div>
                <div className="mt-1.5 text-[12px] leading-relaxed text-gray-400">{meaning}</div>
              </div>
            ))}
          </div>

          {/* Weight bars */}
          <div className="mt-12 rounded-xl border border-gray-700 bg-gray-900/60 p-6">
            <h3 className="mb-4 text-base font-semibold text-white">Category weights</h3>
            <div className="space-y-2.5">
              {WEIGHTS.map(({ label, pct, color }) => (
                <div key={label} className="grid items-center gap-3" style={{ gridTemplateColumns: "180px 1fr 40px" }}>
                  <div className="text-[13px] text-gray-300">{label}</div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-gray-700">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                  </div>
                  <div className="text-right text-[13px] font-medium tabular-nums text-gray-400">{pct}%</div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-[12px] leading-relaxed text-gray-500">
              Weights are adjustable — a renter with kids may want to weight Heat and Pest higher.
              Customize them in the building detail panel on the map.
            </p>
          </div>
        </div>
      </section>

      {/* ── Glossary ── */}
      <section id="glossary" className="px-8 py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto mb-14 max-w-2xl text-center">
            <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-blue-400">Glossary</div>
            <h2 className="text-4xl font-bold tracking-tight" style={{ letterSpacing: "-0.02em" }}>The terminology, plainly.</h2>
            <p className="mt-4 text-[17px] leading-relaxed text-gray-400">
              Housing data comes wrapped in acronyms. Here&apos;s what they actually mean.
            </p>
          </div>

          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {GLOSSARY.map(({ term, acronym, def }) => (
              <div key={term} className="rounded-xl border border-gray-700 bg-gray-800/40 px-5 py-4">
                <dt className="mb-1 text-[14px] font-semibold text-white">
                  {term}
                  {acronym && (
                    <span className="ml-1.5 rounded bg-blue-600/15 px-1.5 py-px text-[11px] font-medium text-blue-400 align-[2px]">
                      {acronym}
                    </span>
                  )}
                </dt>
                <dd className="m-0 text-[13px] leading-relaxed text-gray-400">{def}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="px-8 pb-24">
        <div
          className="mx-auto max-w-4xl overflow-hidden rounded-2xl border border-gray-700 p-14 text-center"
          style={{
            background: "radial-gradient(ellipse 600px 300px at 30% 30%, rgba(34,197,94,0.12), transparent 60%), radial-gradient(ellipse 600px 300px at 70% 70%, rgba(239,68,68,0.1), transparent 60%), linear-gradient(180deg, rgba(31,41,55,0.8), rgba(17,24,39,0.8))",
          }}
        >
          <h2 className="text-4xl font-bold tracking-tight" style={{ letterSpacing: "-0.02em" }}>Ready to check a building?</h2>
          <p className="mx-auto mt-4 max-w-lg text-[17px] leading-relaxed text-gray-400">
            Type an address, a neighborhood, or a question in plain English. The map will show you
            every grade from A to F across the city.
          </p>
          <Link
            href="/map"
            className="mt-8 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-7 py-4 text-base font-medium text-white hover:bg-blue-700 transition-colors"
          >
            Open the map →
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-800 px-8 py-10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 text-[13px] text-gray-500">
          <div>© 2026 BeforeYouRent. Built on NYC Open Data.</div>
          <div className="flex gap-5">
            <a href="#about" className="text-gray-400 hover:text-white transition-colors">About</a>
            <a href="#scoring" className="text-gray-400 hover:text-white transition-colors">Scoring</a>
            <a href="#glossary" className="text-gray-400 hover:text-white transition-colors">Glossary</a>
            <Link href="/map" className="text-gray-400 hover:text-white transition-colors">Map</Link>
          </div>
        </div>
      </footer>

    </div>
  );
}
