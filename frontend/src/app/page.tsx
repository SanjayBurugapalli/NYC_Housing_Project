import Link from "next/link";
import type { ReactNode } from "react";
import { DEFAULT_WEIGHTS } from "@/lib/scoringWeights";
import { GRADE_BAR_SEGMENTS, GRADE_META } from "@/lib/grades";
import {
  GRADE_DATASETS,
  HERO_BBL,
  datasetUrl,
  formatDay,
  HERO_WORKPLACE,
  getHeroBuilding,
  getHeroCommute,
  getHeroFood,
  getRefreshStatus,
  gradeDataUpdated,
  refreshedAt,
} from "@/lib/landing";
import { ArrowRightIcon, ChevronDownIcon, LogoIcon } from "@/components/ui/icons";
import { HeroSearch, LandingNav } from "@/components/landing/LandingInputs";
import {
  BuildingCardView,
  BuildingSheetView,
  CommuteCardView,
  FoodMapView,
  GradeBreakdownView,
  OwnerStripView,
} from "@/components/landing/ProductViews";

const REPO_URL = "https://github.com/SanjayBurugapalli/NYC_Housing_Project";
// Each checked against the live search: the parser reads every filter in the
// wording below, and every result meets it. Re-check after rewording one.
const TRY_ASKING = [
  "Rent-stabilized buildings in Bushwick",
  "Harlem buildings with no heat complaints",
  "Pre-war buildings in Park Slope",
  "New construction in Long Island City",
];

// What feeds the grade, in weight order. Percentages come from DEFAULT_WEIGHTS
// (kept in sync with data/scoring/compute.py WEIGHTS).
const WEIGHT_ROWS = [
  { key: "pest_rodent", label: "Pests", source: "311, rodent inspections" },
  { key: "heat_hot_water", label: "Heat", source: "311 complaints" },
  { key: "structural_safety", label: "Structural", source: "DOB violations" },
  { key: "hpd_severity", label: "Housing code", source: "HPD Class A, B, C violations" },
  { key: "litigation", label: "Lawsuits", source: "HPD litigation" },
  { key: "noise", label: "Noise", source: "311 complaints" },
] as const;

const LIMITS = [
  { title: "Complaints follow callers", body: "311 reflects who reports, not necessarily where conditions are worst." },
  { title: "City data lags", body: "New violations can take two to six weeks to show up." },
  { title: "New owners, old record", body: "A recent sale or renovation is not reflected yet." },
  { title: "Spot something wrong?", body: "Every building has a “flag a data issue” link." },
];

function Eyebrow({ children, light = false }: { children: ReactNode; light?: boolean }) {
  return (
    <div className={`text-[13px] font-bold uppercase tracking-[0.08em] ${light ? "text-[#B9C0CC]" : "text-muted"}`}>{children}</div>
  );
}

function SectionHead({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="flex flex-col gap-3">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="m-0 max-w-[900px] font-display text-[clamp(34px,4.2vw,54px)] font-extrabold leading-[1.02] tracking-[-0.03em]">{title}</h2>
    </div>
  );
}

/**
 * Underline in the five grade colors, for the hero headline. Sized in em so it
 * scales with the headline: with the h1's 1.16 line height, a stripe that wraps
 * onto the next line sits clear of both its own descenders and the tall
 * letters ("it") below it.
 */
function gradeStripe() {
  return {
    background: `linear-gradient(90deg, ${GRADE_META.A.bg} 0 20%, ${GRADE_META.B.bg} 20% 40%, ${GRADE_META.C.bg} 40% 60%, ${GRADE_META.D.bg} 60% 80%, ${GRADE_META.F.bg} 80% 100%) left bottom / 100% 0.14em no-repeat`,
    paddingBottom: "0.08em",
    WebkitBoxDecorationBreak: "clone",
    boxDecorationBreak: "clone",
  } as const;
}

function FeatureText({ title, light = false, children }: { title: string; light?: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="m-0 font-display text-[26px] font-extrabold tracking-[-0.02em]">{title}</h3>
      <p className={`m-0 max-w-[520px] text-base ${light ? "text-line" : "text-ink-2"}`}>{children}</p>
    </div>
  );
}

/**
 * One A–F strip, each band as wide as its share of the 0–100 score. The bands
 * are uneven in the scoring code (A is 97–100, F is 0–54), so drawing them
 * equal would misstate the scale.
 */
function GradeScale() {
  let start = 0;
  const bands = GRADE_BAR_SEGMENTS.map(({ grade, pct }) => {
    const band = { grade, pct, start };
    start += pct;
    return band;
  });
  return (
    <div className="flex flex-col gap-5">
      <div>
        <div
          role="img"
          aria-label={`The 0 to 100 score, drawn to scale: ${bands.map((b) => `${b.grade} ${GRADE_META[b.grade].range}`).join(", ")}`}
          className="flex h-16 overflow-hidden rounded-[16px] border-2 border-ink"
        >
          {bands.map((b, i) => (
            <div
              key={b.grade}
              className={`flex items-center justify-center font-display text-2xl font-extrabold ${i < bands.length - 1 ? "border-r-2 border-ink" : ""}`}
              style={{ flex: `${b.pct} 0 0%`, background: GRADE_META[b.grade].bg, color: GRADE_META[b.grade].fg }}
            >
              <span className={b.pct < 5 ? "hidden sm:inline" : ""}>{b.grade}</span>
            </div>
          ))}
        </div>
        <div aria-hidden="true" className="relative mt-1.5 h-4 text-xs font-semibold text-muted">
          {bands.map((b, i) => (
            <span
              key={b.grade}
              className={`absolute ${i === 0 ? "" : "-translate-x-1/2"} ${b.pct < 5 ? "hidden sm:inline" : ""}`}
              style={{ left: `${b.start}%` }}
            >
              {b.start}
            </span>
          ))}
          <span className="absolute right-0">100</span>
        </div>
      </div>
      {/* A key, not another set of grade tiles: the strip above is the one place the letters show. */}
      <dl className="m-0 grid gap-x-6 gap-y-4 sm:grid-cols-5">
        {bands.map((b) => (
          <div key={b.grade} className="border-t-[5px] pt-2" style={{ borderColor: GRADE_META[b.grade].bg }}>
            <dt className="font-display text-lg font-extrabold">
              {b.grade} <span className="text-muted">·</span> {GRADE_META[b.grade].range}
            </dt>
            <dd className="m-0 text-[15px] text-ink-2">
              <span className="font-semibold text-ink">{GRADE_META[b.grade].headline}</span> {GRADE_META[b.grade].detail}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default async function LandingPage() {
  // These throw if the API can't be reached, so the page never renders without its building (see getJson).
  const [record, refresh, food] = await Promise.all([getHeroBuilding(), getRefreshStatus(), getHeroFood()]);
  // Everything but the owner, who may be a private person: the page never needs the name.
  const hero = { ...record, owner_name: null, managing_agent: null };
  const commute = await getHeroCommute(hero);
  const updated = gradeDataUpdated(refresh);
  const updatedText = updated ? formatDay(updated) : null;
  const card = { building: hero, commute, food, workLabel: HERO_WORKPLACE.label, href: `/map?bbl=${HERO_BBL}` };

  return (
    <div className="min-h-screen bg-surface text-base leading-normal text-ink" style={{ overflowX: "clip" }}>
      {/* NAV */}
      <header className="border-b-2 border-ink bg-surface">
        <div className="mx-auto flex max-w-[1232px] flex-wrap items-center gap-x-3 gap-y-3 px-4 py-3 sm:gap-x-7 sm:px-6 sm:py-3.5">
          <Link href="/" className="flex min-h-[44px] items-center gap-2 text-ink no-underline sm:gap-2.5">
            <span className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-ink text-white sm:h-[38px] sm:w-[38px] sm:rounded-[11px]">
              <LogoIcon size={20} />
            </span>
            <span className="font-display text-[19px] font-extrabold tracking-[-0.02em] sm:text-[21px]">BeforeYouRent</span>
          </Link>
          <LandingNav />
        </div>
      </header>

      {/* HERO: copy on the left, the example's building card on the right */}
      <section className="mx-auto grid max-w-[1232px] gap-x-12 gap-y-8 px-4 pb-12 pt-8 sm:px-6 sm:pt-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:pb-16">
        <div className="flex min-w-0 flex-col gap-6">
          {/* Sized so "apartment before" fits the column on one line (it measures
              about 8.3em); balanced, and "rent it." never splits, so "it." can't
              end up alone on the last line. */}
          <h1 className="m-0 text-balance font-display text-[clamp(42px,4.3vw,56px)] font-extrabold leading-[1.16] tracking-[-0.035em]">
            Know your apartment <span style={gradeStripe()}>before you rent</span>{" "}it.
          </h1>
          {/* Everything the search takes (useSearchRunner + the search parser), the options in ink. */}
          <p className="m-0 max-w-[520px] text-pretty text-[18px] leading-[1.55] text-ink-2 [&_strong]:font-semibold [&_strong]:text-ink">
            Paste a <strong>StreetEasy or Zillow link</strong>, look up an <strong>address</strong>, <strong>neighborhood</strong> or{" "}
            <strong>landlord</strong>, or just <strong>ask in plain English</strong>, and see each apartment&apos;s city record before
            signing your lease.
          </p>
          <HeroSearch />
          <div className="flex flex-col gap-2.5">
            <span id="try-asking" className="text-sm font-semibold text-muted">Try asking</span>
            <ul aria-labelledby="try-asking" className="m-0 flex list-none flex-wrap gap-2 p-0">
              {TRY_ASKING.map((q) => (
                <li key={q}>
                  <Link href={`/map?q=${encodeURIComponent(q)}`} className="chip no-underline hover:bg-surface">
                    {q}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* The map's own card for the example; on phones, the bottom sheet the app opens there. */}
        <div className="min-w-0">
          <div className="md:hidden">
            <BuildingSheetView {...card} />
          </div>
          <div className="hidden max-w-[600px] md:block lg:ml-auto">
            <BuildingCardView {...card} />
          </div>
        </div>
      </section>

      {/* FEATURES: four, at different sizes */}
      <section id="features" className="scroll-mt-4 border-y-2 border-ink bg-white">
        <div className="mx-auto flex max-w-[1232px] flex-col gap-8 px-4 py-14 sm:px-6 sm:py-16">
          <SectionHead eyebrow="What you get" title="Everything the listing leaves out." />
          {/* Columns balanced so the health card and the two cards beside it come out the same height. */}
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
            <article className="flex flex-col gap-6 rounded-[22px] border-2 border-ink bg-surface p-5 sm:p-7 lg:row-span-2">
              <FeatureText title="Building health, in one letter">
                We read years of complaints, violations, lawsuits and inspections so you don&apos;t have to. Catch any red
                flags before you move in. The paper trail is a click away if you want it.
              </FeatureText>
              <div className="mt-auto">
                <GradeBreakdownView building={hero} />
              </div>
            </article>

            <article className="flex flex-col gap-5 rounded-[22px] border-2 border-ink bg-white p-5 sm:p-7">
              {commute && <CommuteCardView building={hero} commute={commute} workLabel={HERO_WORKPLACE.label} />}
              <FeatureText title="Time the commute">
                Tell us where you work, once. Every building then shows the real door-to-door trip by subway, bus and on foot.
              </FeatureText>
            </article>

            <article className="flex flex-col justify-between gap-6 rounded-[22px] bg-ink p-5 text-white sm:p-7">
              <FeatureText title="Meet the landlord" light>
                One bad building can be bad luck. Six is a pattern. See everything an owner holds, or browse the{" "}
                <Link href="/rankings" className="font-semibold text-white underline underline-offset-2">worst landlords &amp; buildings rankings</Link>.
              </FeatureText>
              {/* The owner on record is a private individual, so the view leaves the name out. */}
              <div className="rounded-[18px] bg-white p-2">
                <OwnerStripView portfolio={hero.owner_portfolio ?? null} />
              </div>
            </article>

            <article className="grid gap-6 rounded-[22px] border-2 border-ink bg-surface p-5 sm:p-7 lg:col-span-2 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:items-center">
              <FeatureText title="Scout the food">
                Delis, groceries and restaurants within a short walk, each with its own icon and colored by estimated price.
              </FeatureText>
              <div className="overflow-hidden rounded-[14px] border-2 border-ink">
                <FoodMapView building={hero} food={food} />
              </div>
            </article>
          </div>
        </div>
      </section>

      {/* GRADE */}
      <section id="grade" className="mx-auto flex max-w-[1232px] scroll-mt-4 flex-col gap-8 px-4 py-14 sm:px-6 sm:py-16">
        <SectionHead eyebrow="The health grade" title="Restaurants post a grade in the window. Now buildings do too." />
        <GradeScale />

        <details className="group rounded-[20px] border-2 border-ink bg-white">
          <summary className="flex min-h-[64px] cursor-pointer items-center justify-between gap-4 px-[22px] text-[17px] font-bold">
            <span>
              Curious how the grade is built?{" "}
              <span className="font-medium text-muted">Five city datasets, weighted and scored.</span>
            </span>
            <ChevronDownIcon size={22} className="shrink-0 transition-transform group-open:rotate-180" />
          </summary>
          <div className="flex flex-wrap gap-x-12 gap-y-6 px-[22px] pb-6 pt-1.5">
            <div className="flex min-w-0 flex-[1_1_380px] flex-col">
              <div className="pb-2"><Eyebrow>What counts, and how much</Eyebrow></div>
              {WEIGHT_ROWS.map((r) => (
                <div key={r.key} className="flex items-center gap-3 border-t-[1.5px] border-line py-[9px]">
                  <span className="flex-1 font-semibold">
                    {r.label} <span className="font-normal text-muted">{r.source}</span>
                  </span>
                  <span className="font-display text-[19px] font-extrabold">{Math.round(DEFAULT_WEIGHTS[r.key] * 100)}%</span>
                </div>
              ))}
            </div>
            <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-3.5">
              <Eyebrow>The fine print</Eyebrow>
              <div>
                <div className="font-bold">Fair to big buildings</div>
                <div className="text-[15px] text-ink-2">Counts are scaled by the number of apartments, so a 200-unit building isn&apos;t punished for its size.</div>
              </div>
              <div>
                <div className="font-bold">Recent problems count more</div>
                <div className="text-[15px] text-ink-2">Only the last five years are used, and the last six months weigh double.</div>
              </div>
              <div>
                <div className="font-bold">Everyone starts at 100</div>
                <div className="text-[15px] text-ink-2">The score falls smoothly as issues per apartment pile up.</div>
              </div>
            </div>
          </div>
        </details>
      </section>

      {/* LIMITS: right after the grade, with the datasets behind it */}
      <section id="limits" className="scroll-mt-4 bg-ink text-white">
        <div className="mx-auto flex max-w-[1232px] flex-col gap-10 px-4 py-14 sm:px-6 sm:py-16">
          <div className="flex flex-wrap gap-x-[72px] gap-y-10">
            <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-3.5">
              <Eyebrow light>Limitations</Eyebrow>
              <h2 className="m-0 font-display text-[clamp(34px,4.2vw,54px)] font-extrabold leading-[1.02] tracking-[-0.03em]">A signal, not a verdict.</h2>
              <p className="m-0 text-[17px] text-line">
                The grade is a starting point for questions, not legal or housing advice. Visit, ask the neighbors, read the lease.
              </p>
            </div>
            <ul className="m-0 grid min-w-0 flex-[1.4_1_460px] list-none grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4 p-0">
              {LIMITS.map((l) => (
                <li key={l.title} className="flex flex-col gap-1.5 rounded-[18px] border-2 border-white p-5">
                  <span className="text-[17px] font-bold">{l.title}</span>
                  <span className="text-[15px] text-line">{l.body}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-4 border-t-[1.5px] border-white/25 pt-8">
            <Eyebrow light>The city data behind the grade</Eyebrow>
            <ul className="m-0 grid list-none gap-x-10 gap-y-4 p-0 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {GRADE_DATASETS.map((d) => {
                const at = refreshedAt(refresh, d.key);
                return (
                  <li key={d.key} className="flex flex-col gap-0.5">
                    <a href={datasetUrl(d.id)} target="_blank" rel="noopener noreferrer" className="font-semibold text-white underline underline-offset-2">
                      {d.name}
                    </a>
                    <span className="text-sm text-[#B9C0CC]">{at ? `Last pulled ${formatDay(at)}` : "Pull date not logged yet"}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto flex max-w-[1232px] flex-col items-start gap-5 px-4 py-14 sm:px-6 sm:py-16">
        <h2 className="m-0 max-w-[900px] font-display text-[clamp(38px,5vw,68px)] font-extrabold leading-none tracking-[-0.035em]">
          Found a place you like?{" "}
          <a href="#search" className="text-ink underline decoration-[5px] underline-offset-[10px]">Paste it in.</a>
        </h2>
        <Link href="/map" className="inline-flex min-h-[44px] items-center gap-2 text-lg font-semibold text-ink underline underline-offset-2">
          or just open the map
          <ArrowRightIcon size={18} />
        </Link>
      </section>

      {/* FOOTER */}
      <footer className="bg-ink text-white">
        <div className="mx-auto flex max-w-[1232px] flex-wrap items-end justify-between gap-x-10 gap-y-5 px-4 pb-12 pt-10 sm:px-6">
          <div className="flex flex-col gap-1.5">
            <span className="font-display text-xl font-extrabold tracking-[-0.02em]">BeforeYouRent</span>
            <span className="text-sm text-[#B9C0CC]">
              Built on{" "}
              <a href="https://opendata.cityofnewyork.us/" target="_blank" rel="noopener noreferrer" className="text-white underline underline-offset-2">
                NYC Open Data
              </a>
              . Transit routing by{" "}
              <a href="https://transitous.org/sources" target="_blank" rel="noopener noreferrer" className="text-white underline underline-offset-2">
                Transitous
              </a>
              . Maps ©{" "}
              <a href="https://www.mapbox.com/about/maps/" target="_blank" rel="noopener noreferrer" className="text-white underline underline-offset-2">
                Mapbox
              </a>{" "}
              ©{" "}
              <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="text-white underline underline-offset-2">
                OpenStreetMap
              </a>
              . Not legal or housing advice.
            </span>
            {updatedText && <span className="text-sm text-[#B9C0CC]">Data updated {updatedText}.</span>}
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-2 gap-y-1">
            <Link href="/privacy" className="px-2.5 py-3 text-sm font-semibold text-white">Privacy</Link>
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="px-2.5 py-3 text-sm font-semibold text-white">
              Source code
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
