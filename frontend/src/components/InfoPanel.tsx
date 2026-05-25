"use client";

import { useState } from "react";

type Tab = "about" | "scoring" | "glossary";

export function InfoPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("about");

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-gray-800/95 backdrop-blur-sm shadow-xl border-l border-gray-700">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-gray-700 bg-gray-800">
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="text-lg font-semibold">BeforeYouRent</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Close info panel"
            title="Close (Esc)"
          >
            ✕
          </button>
        </div>
        {/* Tabs */}
        <div className="flex border-b border-gray-700">
          {([
            ["about", "About"],
            ["scoring", "Scoring"],
            ["glossary", "Glossary"],
          ] as [Tab, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                tab === key
                  ? "border-b-2 border-blue-500 text-white"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 text-sm leading-relaxed text-gray-300">
        {tab === "about" && <AboutTab />}
        {tab === "scoring" && <ScoringTab />}
        {tab === "glossary" && <GlossaryTab />}
      </div>
    </div>
  );
}

function AboutTab() {
  return (
    <div className="space-y-4">
      <p>
        <span className="font-semibold text-white">BeforeYouRent</span> is an
        interactive tool that analyzes New York City residential buildings using
        publicly available data and assigns each building a composite health score
        and letter grade from <span className="text-score-excellent font-semibold">A</span> (healthiest) to{" "}
        <span className="text-score-critical font-semibold">F</span> (most issues).
      </p>

      <div>
        <h3 className="mb-2 font-semibold text-white">What It Shows</h3>
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
        <h3 className="mb-2 font-semibold text-white">Data Sources</h3>
        <p>
          All data comes from{" "}
          <span className="text-blue-400">NYC Open Data</span> via the Socrata
          API, including:
        </p>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li><span className="text-gray-200">PLUTO</span> &mdash; building characteristics (units, year built, class)</li>
          <li><span className="text-gray-200">311 Complaints</span> &mdash; tenant-reported issues</li>
          <li><span className="text-gray-200">HPD Violations</span> &mdash; housing code violations (Class A/B/C)</li>
          <li><span className="text-gray-200">DOB Violations</span> &mdash; building code violations</li>
          <li><span className="text-gray-200">Housing Litigations</span> &mdash; lawsuits against building owners</li>
          <li><span className="text-gray-200">Rodent Inspections</span> &mdash; DOHMH rat inspections</li>
        </ul>
      </div>

      <div>
        <h3 className="mb-2 font-semibold text-white">How To Use</h3>
        <ul className="list-disc space-y-1 pl-5">
          <li><span className="text-gray-200">Zoom out</span> to see neighborhood-level averages</li>
          <li><span className="text-gray-200">Zoom in</span> to see individual buildings color-coded by grade</li>
          <li><span className="text-gray-200">Click a building</span> to see its full detail and score breakdown</li>
          <li><span className="text-gray-200">Search</span> using natural language (e.g. &quot;buildings with rat problems in Brooklyn&quot;)</li>
        </ul>
      </div>
    </div>
  );
}

function ScoringTab() {
  const categories = [
    { name: "Heat & Hot Water", weight: "20%", desc: "311 complaints and HPD complaints related to heat and hot water outages." },
    { name: "Pest & Rodent", weight: "22%", desc: "311 pest complaints combined with DOHMH rodent inspection results showing active infestations." },
    { name: "Structural Safety", weight: "20%", desc: "DOB violations and complaints related to building structure, excluding administrative filing violations." },
    { name: "HPD Violation Severity", weight: "20%", desc: "HPD violations weighted by severity: Class C (immediately hazardous) = 5x, Class B (hazardous) = 3x, Class A (non-hazardous) = 1x." },
    { name: "Noise", weight: "5%", desc: "311 noise complaints attributed to the building." },
    { name: "Litigation", weight: "13%", desc: "Housing litigations filed against the building owner or manager." },
  ];

  return (
    <div className="space-y-4">
      <p>
        Each building receives a composite health score from{" "}
        <span className="text-white font-semibold">0</span> (worst) to{" "}
        <span className="text-white font-semibold">100</span> (best), converted to a
        letter grade:
      </p>

      <div className="rounded bg-gray-700/50 p-3">
        <div className="grid grid-cols-5 gap-2 text-center text-xs font-medium">
          <div><span className="text-score-excellent text-lg font-bold">A</span><br/>97&ndash;100</div>
          <div><span className="text-score-good text-lg font-bold">B</span><br/>90&ndash;96</div>
          <div><span className="text-score-fair text-lg font-bold">C</span><br/>75&ndash;89</div>
          <div><span className="text-score-poor text-lg font-bold">D</span><br/>55&ndash;74</div>
          <div><span className="text-score-critical text-lg font-bold">F</span><br/>0&ndash;54</div>
        </div>
      </div>

      <div>
        <h3 className="mb-2 font-semibold text-white">Category Weights</h3>
        <div className="space-y-3">
          {categories.map((cat) => (
            <div key={cat.name} className="rounded border border-gray-700 p-2">
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-200">{cat.name}</span>
                <span className="rounded bg-blue-600/30 px-2 py-0.5 text-xs font-semibold text-blue-300">{cat.weight}</span>
              </div>
              <p className="mt-1 text-xs text-gray-400">{cat.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2 font-semibold text-white">How Scores Are Calculated</h3>
        <ul className="list-disc space-y-1 pl-5 text-gray-400">
          <li><span className="text-gray-300">Per-unit normalization:</span> complaint and violation counts are divided by the number of residential units, so larger buildings aren&apos;t penalized for naturally receiving more reports.</li>
          <li><span className="text-gray-300">5-year window:</span> only data from the last 5 years is considered. Recent issues (0&ndash;6 months) count 2x, 6&ndash;12 months 1.5x, 1&ndash;2 years 0.5x, 2&ndash;5 years 0.25x.</li>
          <li><span className="text-gray-300">Exponential decay scoring:</span> each sub-score uses the formula <code className="rounded bg-gray-700 px-1 text-xs">100 &times; e^(-rate &times; issues_per_unit)</code>, so buildings with zero issues score 100 and scores decrease smoothly as issues accumulate.</li>
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
    { term: "Community District", def: "NYC is divided into 59 community districts, each with a local board. Neighborhoods on this map correspond to community districts." },
    { term: "Health Score", def: "A composite score from 0 to 100 calculated from weighted sub-scores across 6 categories of building issues. Higher is healthier." },
    { term: "Litigation", def: "A legal case filed by HPD against a building owner for failing to maintain safe and livable conditions. Includes tenant harassment cases." },
  ];

  return (
    <div className="space-y-2">
      {terms.map(({ term, def }) => (
        <div key={term} className="rounded border border-gray-700 p-2">
          <span className="font-semibold text-white">{term}</span>
          <p className="mt-0.5 text-xs text-gray-400">{def}</p>
        </div>
      ))}
    </div>
  );
}
