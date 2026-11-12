"use client";

import { useState } from "react";
import { CloseIcon } from "@/components/ui/icons";

type Tab = "about" | "scoring" | "glossary";

export function InfoPanel({ onClose, onFeedback }: { onClose: () => void; onFeedback?: () => void }) {
  const [tab, setTab] = useState<Tab>("about");

  return (
    <div role="dialog" aria-labelledby="info-title" className="card-float flex h-full flex-col overflow-hidden rounded-[26px] shadow-hard-lg">
      {/* Header */}
      <div className="shrink-0 border-b-2 border-ink bg-surface">
        <div className="flex items-center justify-between px-5 py-3.5">
          <h2 id="info-title" className="m-0 font-display text-[22px] font-extrabold tracking-[-0.02em]">How BeforeYouRent works</h2>
          <button onClick={onClose} className="icon-btn" aria-label="Close" title="Close (Esc)">
            <CloseIcon size={20} />
          </button>
        </div>
        {/* Tabs */}
        <div className="flex">
          {([
            ["about", "About"],
            ["scoring", "Scoring"],
            ["glossary", "Glossary"],
          ] as [Tab, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`min-h-[44px] flex-1 px-3 py-2 text-sm transition-colors ${
                tab === key
                  ? "border-b-[3px] border-ink font-bold text-ink"
                  : "font-semibold text-muted hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-y-auto p-5 text-sm leading-relaxed text-ink-2">
        {tab === "about" && <AboutTab />}
        {tab === "scoring" && <ScoringTab />}
        {tab === "glossary" && <GlossaryTab />}
      </div>
      {onFeedback && (
        <div className="flex shrink-0 items-center justify-between gap-3 border-t-[1.5px] border-line px-5 py-3">
          <span className="text-[13px] text-muted">Spotted something off, or have an idea?</span>
          <button type="button" onClick={onFeedback} className="btn-outline">Send feedback</button>
        </div>
      )}
    </div>
  );
}

function AboutTab() {
  return (
    <div className="space-y-4">
      <p>
        <span className="font-semibold text-ink">BeforeYouRent</span> is an
        apartment-hunting companion for New York City. Paste a listing or search an
        address to see the building&apos;s health, your commute and the food nearby.
        The health grade comes from public records: each building gets a composite health score
        and letter grade from <span className="font-bold">A</span> (healthiest) to{" "}
        <span className="font-bold">F</span> (most issues).
      </p>

      <div>
        <h3 className="mb-2 font-semibold text-ink">What It Shows</h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>Heat & hot water complaint history</li>
          <li>Pest and rodent inspection results</li>
          <li>Structural safety violations (DOB)</li>
          <li>HPD violations by severity class (A/B/C)</li>
          <li>Noise complaints</li>
          <li>Litigation history against landlords</li>
        </ul>
      </div>

      <div>
        <h3 className="mb-2 font-semibold text-ink">Data Sources</h3>
        <p>
          All data comes from{" "}
          <a
            href="https://opendata.cityofnewyork.us/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-ink underline underline-offset-2"
          >
            NYC Open Data
          </a>{" "}
          via the Socrata API, including:
        </p>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li><span className="text-ink">PLUTO</span> &mdash; building characteristics (units, year built, class)</li>
          <li><span className="text-ink">311 Complaints</span> &mdash; tenant-reported issues</li>
          <li><span className="text-ink">HPD Violations</span> &mdash; housing code violations (Class A/B/C)</li>
          <li><span className="text-ink">DOB Violations</span> &mdash; building code violations</li>
          <li><span className="text-ink">Housing Litigations</span> &mdash; lawsuits against building owners</li>
          <li><span className="text-ink">Rodent Inspections</span> &mdash; DOHMH rat inspections</li>
        </ul>
      </div>

      <div>
        <h3 className="mb-2 font-semibold text-ink">How To Use</h3>
        <ul className="list-disc space-y-1 pl-5">
          <li><span className="text-ink">Zoom out</span> to see neighborhood-level averages</li>
          <li><span className="text-ink">Zoom in</span> to see individual buildings color-coded by grade</li>
          <li><span className="text-ink">Click a building</span> for its grade, your commute and food nearby</li>
          <li><span className="text-ink">Paste a StreetEasy or Zillow link</span> into the search box to jump to that building</li>
          <li><span className="text-ink">Search</span> using natural language (e.g. &quot;buildings with rat problems in Brooklyn&quot;)</li>
        </ul>
      </div>

      <div className="rounded-2xl border-2 border-ink bg-[#FFF6D6] p-3 text-xs leading-relaxed text-ink-2">
        <p className="mb-1 font-semibold text-ink">Important caveats</p>
        <ul className="list-disc space-y-1 pl-4">
          <li>311 complaints reflect who reports, not where conditions are worst.</li>
          <li>City datasets lag — new violations may take 2&ndash;6 weeks to appear.</li>
          <li>Recent ownership or renovation changes are not yet reflected.</li>
          <li>This score is a signal, not a verdict. Not legal or housing advice.</li>
        </ul>
      </div>
    </div>
  );
}

function ScoringTab() {
  const categories = [
    { name: "Heat & Hot Water", weight: "20%", desc: "311 complaints about heat and hot water outages." },
    { name: "Pest & Rodent", weight: "22%", desc: "311 pest complaints combined with DOHMH rodent inspection results showing active infestations." },
    { name: "Structural Safety", weight: "20%", desc: "DOB violations related to building structure, excluding administrative filing violations." },
    { name: "HPD Violation Severity", weight: "20%", desc: "HPD violations weighted by severity: Class C (immediately hazardous) = 5x, Class B (hazardous) = 3x, Class A (non-hazardous) = 1x." },
    { name: "Noise", weight: "5%", desc: "311 noise complaints attributed to the building." },
    { name: "Litigation", weight: "13%", desc: "Housing litigations filed against the building owner or manager." },
  ];

  return (
    <div className="space-y-4">
      <p>
        Each building receives a composite health score from{" "}
        <span className="text-ink font-semibold">0</span> (worst) to{" "}
        <span className="text-ink font-semibold">100</span> (best), converted to a
        letter grade:
      </p>

      <div className="rounded bg-surface p-3">
        <div className="grid grid-cols-5 gap-2 text-center text-xs font-medium">
          <div><span className="text-score-excellent text-lg font-bold">A</span><br/>97&ndash;100</div>
          <div><span className="text-score-good text-lg font-bold">B</span><br/>90&ndash;96</div>
          <div><span className="text-score-fair text-lg font-bold">C</span><br/>75&ndash;89</div>
          <div><span className="text-score-poor text-lg font-bold">D</span><br/>55&ndash;74</div>
          <div><span className="text-score-critical text-lg font-bold">F</span><br/>0&ndash;54</div>
        </div>
      </div>

      <div>
        <h3 className="mb-2 font-semibold text-ink">Category Weights</h3>
        <div className="space-y-3">
          {categories.map((cat) => (
            <div key={cat.name} className="rounded border border-line p-2">
              <div className="flex items-center justify-between">
                <span className="font-medium text-ink">{cat.name}</span>
                <span className="rounded bg-surface px-2 py-0.5 text-xs font-semibold text-ink">{cat.weight}</span>
              </div>
              <p className="mt-1 text-xs text-muted">{cat.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2 font-semibold text-ink">How Scores Are Calculated</h3>
        <ul className="list-disc space-y-1 pl-5 text-muted">
          <li><span className="text-ink-2">Per-unit normalization:</span> complaint and violation counts are scaled by the number of apartments (units to the 0.75 power), so larger buildings aren&apos;t penalized just for receiving more reports.</li>
          <li><span className="text-ink-2">5-year window:</span> only data from the last 5 years is considered. Recent issues (0&ndash;6 months) count 2x, 6&ndash;12 months 1.5x, 1&ndash;2 years 1x, 2&ndash;5 years 0.5x.</li>
          <li><span className="text-ink-2">Exponential decay scoring:</span> each sub-score uses the formula <code className="rounded bg-surface px-1 text-xs text-ink">100 &times; e^(-rate &times; issues_per_unit)</code>, so buildings with zero issues score 100 and scores decrease smoothly as issues accumulate.</li>
        </ul>
      </div>
    </div>
  );
}

function GlossaryTab() {
  const terms = [
    { term: "BBL", def: "Borough-Block-Lot. A 10-digit identifier unique to every tax lot in NYC. Format: 1 digit borough + 5 digit block + 4 digit lot. This is the primary key used to link data across all NYC datasets." },
    { term: "BIN", def: "Building Identification Number. A 7-digit code for individual buildings. One BBL (lot) can have multiple BINs if there are multiple structures on the lot." },
    { term: "HPD", def: "NYC Department of Housing Preservation and Development. Enforces the Housing Maintenance Code and issues violations classified as Class A, B, or C." },
    { term: "DOB", def: "NYC Department of Buildings. Oversees building safety, issues permits, and enforces the Building Code." },
    { term: "DOHMH", def: "NYC Department of Health and Mental Hygiene. Conducts rodent inspections and pest control programs." },
    { term: "PLUTO", def: "Primary Land Use Tax Lot Output. A dataset maintained by the Department of City Planning with detailed building and lot characteristics for every property in NYC." },
    { term: "311", def: "NYC's non-emergency services hotline. Residents call 311 to report complaints about heat, noise, pests, and other quality-of-life issues." },
    { term: "Class A Violation", def: "Non-hazardous HPD violation. Minor condition that must be corrected, but does not pose an immediate risk to health or safety." },
    { term: "Class B Violation", def: "Hazardous HPD violation. A condition that is dangerous to the life, health, or safety of occupants. Must be corrected within 30 days." },
    { term: "Class C Violation", def: "Immediately hazardous HPD violation. The most serious class — poses an immediate risk to life or safety and must be corrected within 24 hours (e.g., no heat in winter, lead paint, broken fire escape)." },
    { term: "Building Class", def: "A code describing the building's primary use and construction type, assigned by the Department of Finance (e.g., A = one-family dwellings, C = walk-up apartments, D = elevator apartments)." },
    { term: "Community District", def: "NYC is divided into 59 community districts, each with a local board. Neighborhood outlines on this map use the city&apos;s Neighborhood Tabulation Areas (NTAs) instead." },
    { term: "Health Score", def: "A composite score from 0 to 100 calculated from weighted sub-scores across 6 categories of building issues. Higher is healthier." },
    { term: "Litigation", def: "A legal case filed by HPD against a building owner for failing to maintain safe and livable conditions. Includes tenant harassment cases." },
  ];

  return (
    <div className="space-y-2">
      {terms.map(({ term, def }) => (
        <div key={term} className="rounded border border-line p-2">
          <span className="font-semibold text-ink">{term}</span>
          <p className="mt-0.5 text-xs text-muted">{def}</p>
        </div>
      ))}
    </div>
  );
}

