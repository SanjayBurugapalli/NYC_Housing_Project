import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { DEFAULT_WEIGHTS } from "@/lib/scoringWeights";
import { GRADE_BAR_SEGMENTS, GRADE_META, shortAddress, titleCase, toGrade } from "@/lib/grades";
import {
  GRADE_DATASETS,
  HERO_BBL,
  HERO_FALLBACK,
  RECORD_CATEGORIES,
  datasetUrl,
  formatDay,
  getHeroBuilding,
  getRefreshStatus,
  gradeDataUpdated,
  recordSummary,
  refreshedAt,
} from "@/lib/landing";
import type { BuildingDetail } from "@/types/building";
import { GradeTile } from "@/components/ui/GradeTile";
import { ArrowRightIcon, ChevronDownIcon, LogoIcon } from "@/components/ui/icons";
import { HeroSearch, LandingNav } from "@/components/landing/LandingInputs";

const REPO_URL = "https://github.com/SanjayBurugapalli/NYC_Housing_Project";
const BUILT_BY = "Sanjay Burugapalli";

// What feeds the grade, in weight order. Percentages come from DEFAULT_WEIGHTS
// (kept in sync with data/scoring/compute.py WEIGHTS).
const WEIGHT_ROWS = [
  { key: "pest_rodent", label: "Pests", source: "311, rodent inspections" },
  { key: "heat_hot_water", label: "Heat", source: "311, HPD complaints" },
  { key: "structural_safety", label: "Structural", source: "DOB complaints and violations" },
  { key: "hpd_severity", label: "Housing code", source: "HPD Class A, B, C violations" },
  { key: "litigation", label: "Lawsuits", source: "HPD litigation" },
  { key: "noise", label: "Noise", source: "311 complaints" },
] as const;

const LIMITS = [
  { title: "Complaints follow callers", body: "311 reflects who reports, not necessarily where conditions are worst." },
  { title: "City data lags", body: "New violations can take two to six weeks to show up." },
  { title: "New owners, old record", body: "A recent sale or renovation is not reflected yet." },
  { title: "Spot something wrong?", body: "Every building has a “flag a data issue” link. We read them." },
];

const MAP_CREDIT = (
  <>
    Map ©{" "}
    <a href="https://www.mapbox.com/about/maps/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">Mapbox</a>{" "}
    ©{" "}
    <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">OpenStreetMap</a>
  </>
);

function Eyebrow({ children, light = false }: { children: ReactNode; light?: boolean }) {
  return (
    <div className={`text-[13px] font-bold uppercase tracking-[0.08em] ${light ? "text-[#B9C0CC]" : "text-muted"}`}>{children}</div>
  );
}

function SectionHead({ eyebrow, title, blurb }: { eyebrow: string; title: string; blurb: string }) {
  return (
    <div className="flex flex-wrap items-end gap-x-12 gap-y-4">
      <div className="flex flex-[1_1_420px] flex-col gap-3">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 className="m-0 font-display text-[clamp(34px,4.2vw,54px)] font-extrabold leading-[1.02] tracking-[-0.03em]">{title}</h2>
      </div>
      <p className="m-0 max-w-[420px] flex-[1_1_320px] text-[17px] text-ink-2">{blurb}</p>
    </div>
  );
}

/** Underline in the five grade colors, for the hero headline. */
function gradeStripe(height: number) {
  return {
    background: `linear-gradient(90deg, ${GRADE_META.A.bg} 0 20%, ${GRADE_META.B.bg} 20% 40%, ${GRADE_META.C.bg} 40% 60%, ${GRADE_META.D.bg} 60% 80%, ${GRADE_META.F.bg} 80% 100%) left bottom / 100% ${height}px no-repeat`,
    paddingBottom: height - 4,
    WebkitBoxDecorationBreak: "clone",
    boxDecorationBreak: "clone",
  } as const;
}

/**
 * A real product screenshot (public/screens, captured from the map). Most are
 * crops of cards that carry their own ink border, so the frame only trims the
 * corners; `framed` adds a border for full-bleed map shots.
 */
function Shot({
  src,
  width,
  height,
  alt,
  radius,
  framed = false,
}: {
  src: string;
  width: number;
  height: number;
  alt: string;
  radius: number;
  framed?: boolean;
}) {
  return (
    <div className={`overflow-hidden bg-white ${framed ? "border-2 border-ink" : ""}`} style={{ borderRadius: radius }}>
      <Image src={src} width={width} height={height} alt={alt} sizes="(min-width: 1024px) 680px, 100vw" className="block h-auto w-full" />
    </div>
  );
}

function FeatureText({ title, light = false, children }: { title: string; light?: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="m-0 font-display text-[26px] font-extrabold tracking-[-0.02em]">{title}</h3>
      <p className={`m-0 max-w-[520px] text-base ${light ? "text-line" : "text-ink-2"}`}>{children}</p>
    </div>
  );
}

/** The example building's numbers, straight from its API record. Never a listing: no rent, no unit count. */
function HeroCard({ hero }: { hero: BuildingDetail | null }) {
  const name = hero ? shortAddress(hero.address) : HERO_FALLBACK.address;
  const place = hero ? [titleCase(hero.nta_name || hero.neighborhood), titleCase(hero.borough)].filter(Boolean).join(", ") : HERO_FALLBACK.place;
  return (
    <div className="relative z-10 mx-3 -mt-10 flex flex-col gap-3 rounded-[18px] border-2 border-ink bg-white p-4 shadow-hard-md sm:mx-6 lg:absolute lg:-bottom-16 lg:-left-6 lg:mx-0 lg:mt-0 lg:w-[300px]">
      <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">A real building, not a listing</div>
      <div className="flex items-center gap-3">
        {hero && <GradeTile grade={toGrade(hero.grade, "F")} size="li" />}
        <div className="min-w-0">
          <div className="font-display text-xl font-extrabold leading-tight tracking-[-0.02em]">{name}</div>
          <div className="text-[13px] text-muted">{place}</div>
        </div>
      </div>
      {hero && (
        <>
          <div className="flex items-baseline justify-between border-t-[1.5px] border-line pt-2.5 text-sm">
            <span className="font-semibold">Building health</span>
            <span className="font-display text-lg font-extrabold">{Math.round(hero.health_score)} / 100</span>
          </div>
          <div>
            <div className="pb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">On record, last five years</div>
            <dl className="m-0 grid grid-cols-2 gap-x-5 gap-y-0.5 text-[13px]">
              {RECORD_CATEGORIES.map((c) => (
                <div key={c.key} className="flex justify-between gap-2">
                  <dt className="text-ink-2">{c.name}</dt>
                  <dd className="m-0 font-bold">{hero.score_breakdown[c.key]}</dd>
                </div>
              ))}
            </dl>
          </div>
        </>
      )}
      <Link href={`/map?bbl=${HERO_BBL}`} className="inline-flex min-h-[44px] items-center gap-1.5 self-start text-sm font-bold text-ink underline underline-offset-2">
        See it on the map
        <ArrowRightIcon size={16} />
      </Link>
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
      <p className="m-0 max-w-[640px] text-[15px] text-ink-2">
        Drawn to scale: an A covers only 97–100, so it takes a near-spotless record. F covers everything under 55.
      </p>
    </div>
  );
}

export default async function LandingPage() {
  const [hero, refresh] = await Promise.all([getHeroBuilding(), getRefreshStatus()]);
  const updated = gradeDataUpdated(refresh);
  const updatedText = updated ? formatDay(updated) : null;

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

      {/* HERO: copy on the left, a real screenshot of the map on the right */}
      <section className="mx-auto grid max-w-[1232px] gap-x-12 gap-y-10 px-4 pb-16 pt-10 sm:px-6 sm:pt-14 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:pb-36">
        <div className="flex min-w-0 flex-col gap-6">
          <h1 className="m-0 font-display text-[clamp(42px,4.6vw,66px)] font-extrabold leading-[0.98] tracking-[-0.035em]">
            Know your building <span style={gradeStripe(12)}>before you sign.</span>
          </h1>
          <p className="m-0 max-w-[520px] text-[18px] leading-[1.55] text-ink-2">
            Paste a StreetEasy or Zillow link and see the building&apos;s city record before the lease.
            {hero && (
              <>
                {" "}
                {shortAddress(hero.address)} in {titleCase(hero.nta_name || hero.neighborhood)} grades a{" "}
                <strong className="text-ink">{toGrade(hero.grade, "F")}</strong> ({Math.round(hero.health_score)}/100): in five years,{" "}
                {recordSummary(hero)}.
              </>
            )}
          </p>
          <HeroSearch />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-muted">Try asking:</span>
            <Link href={`/map?q=${encodeURIComponent("Rent-stabilized in Bushwick")}`} className="chip no-underline">
              Rent-stabilized in Bushwick
            </Link>
          </div>
          {/* TODO(Sanjay): say why in your own words. This states the product's purpose, not a personal story. */}
          <p className="m-0 max-w-[520px] border-t-[1.5px] border-line pt-4 text-sm text-muted">
            Built in Greenpoint by {BUILT_BY}, so renters can read a building&apos;s record before signing for it.
            {updatedText && <> Data updated {updatedText}.</>}
          </p>
        </div>

        <figure className="m-0 min-w-0 lg:mt-4">
          <div className="relative">
            <div className="overflow-hidden rounded-[22px] border-2 border-ink bg-white shadow-hard-lg">
              <Image
                src="/screens/hero-602-commute.jpg"
                width={2200}
                height={1656}
                alt="Screenshot of the BeforeYouRent map: 602 Manhattan Ave in Greenpoint as a grade tile, its weekday commute to Union Square drawn as a line, and surrounding buildings as grade-colored dots"
                priority
                sizes="(min-width: 1024px) 680px, 100vw"
                className="block h-auto w-full"
              />
            </div>
            <HeroCard hero={hero} />
          </div>
          <figcaption className="mx-3 mt-3 text-xs text-muted sm:mx-6 lg:mx-0 lg:pl-[290px]">
            Screenshot of the map: the weekday trip from 602 Manhattan Ave to Union Square. {MAP_CREDIT}
          </figcaption>
        </figure>
      </section>

      {/* FEATURES: four, at different sizes */}
      <section id="features" className="scroll-mt-4 border-y-2 border-ink bg-white">
        <div className="mx-auto flex max-w-[1232px] flex-col gap-12 px-4 py-20 sm:px-6 sm:py-24">
          <SectionHead
            eyebrow="What you get"
            title="Everything the listing leaves out."
            blurb="Listings show you the kitchen. We show you the building, the trip to work and the block."
          />
          <div className="grid gap-5 lg:grid-cols-12">
            <article className="flex flex-col gap-6 rounded-[22px] border-2 border-ink bg-surface p-5 sm:p-7 lg:col-span-7 lg:row-span-2">
              <FeatureText title="Building health, in one letter">
                We read years of complaints, violations, lawsuits and inspections so you don&apos;t have to. You get one grade.
                The paper trail is a tap away if you want it.
              </FeatureText>
              <div className="mt-auto">
                <Shot
                  src="/screens/deep.png"
                  width={1920}
                  height={1060}
                  radius={16}
                  alt="Screenshot of the “Behind the grade” view for 602 Manhattan Avenue: six sub-scores, worst first, and the paper trail of complaints, violations, lawsuits and inspections"
                />
              </div>
            </article>

            <article className="flex flex-col gap-5 rounded-[22px] border-2 border-ink bg-white p-5 sm:p-7 lg:col-span-5">
              <Shot
                src="/screens/commute-card.png"
                width={1760}
                height={706}
                radius={14}
                alt="Screenshot of the commute card for 602 Manhattan Ave: the door-to-door trip to Union Square, leg by leg"
              />
              <FeatureText title="Time the commute">
                Tell us where you work, once. Every building then shows the real door-to-door trip by subway, bus and on foot.
              </FeatureText>
            </article>

            <article className="flex flex-col justify-between gap-6 rounded-[22px] bg-ink p-5 text-white sm:p-7 lg:col-span-5">
              <FeatureText title="Meet the landlord" light>
                One bad building can be bad luck. Six is a pattern. See everything an owner holds, or browse the{" "}
                <Link href="/rankings" className="font-semibold text-white underline underline-offset-2">worst landlords &amp; buildings rankings</Link>.
              </FeatureText>
              <div className="rounded-[18px] bg-white p-2">
                <Shot
                  src="/screens/owner.png"
                  width={1088}
                  height={138}
                  radius={12}
                  alt="Screenshot of the owner strip on 602 Manhattan Ave's card, with a button to see every building the owner holds"
                />
              </div>
            </article>

            <article className="grid gap-6 rounded-[22px] border-2 border-ink bg-surface p-5 sm:p-7 lg:col-span-12 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:items-center">
              <FeatureText title="Scout the food">
                Delis, groceries and restaurants within a short walk, each with its own icon and colored by estimated price.
              </FeatureText>
              <figure className="m-0 flex flex-col gap-2">
                <div className="relative aspect-[2/1] overflow-hidden rounded-[14px] border-2 border-ink">
                  <Image
                    src="/screens/food.jpg"
                    alt="Screenshot of the food view around 602 Manhattan Ave: a dashed walk circle with deli, grocery and restaurant pins shaded by estimated price"
                    fill
                    sizes="(min-width: 1024px) 760px, 100vw"
                    className="object-cover object-center"
                  />
                </div>
                <figcaption className="text-xs text-muted">{MAP_CREDIT}</figcaption>
              </figure>
            </article>
          </div>
        </div>
      </section>

      {/* GRADE */}
      <section id="grade" className="mx-auto flex max-w-[1232px] scroll-mt-4 flex-col gap-11 px-4 py-20 sm:px-6 sm:py-24">
        <SectionHead
          eyebrow="The health grade"
          title="Restaurants post a grade in the window. Now buildings do too."
          blurb="A score from 0 to 100, turned into one letter you can read from across the street."
        />
        <GradeScale />

        <details className="group rounded-[20px] border-2 border-ink bg-white">
          <summary className="flex min-h-[64px] cursor-pointer items-center justify-between gap-4 px-[22px] text-[17px] font-bold">
            <span>
              Curious how the grade is built?{" "}
              <span className="font-medium text-muted">Seven city datasets, weighted and scored.</span>
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
        <div className="mx-auto flex max-w-[1232px] flex-col gap-14 px-4 py-20 sm:px-6 sm:py-24">
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
          <div className="flex flex-col gap-4 border-t-[1.5px] border-white/25 pt-10">
            <Eyebrow light>The city data behind the grade</Eyebrow>
            <ul className="m-0 grid list-none gap-x-10 gap-y-4 p-0 sm:grid-cols-2 lg:grid-cols-4">
              {GRADE_DATASETS.map((d) => {
                const at = refreshedAt(refresh, d.key);
                return (
                  <li key={d.key} className="flex flex-col gap-0.5">
                    <a href={datasetUrl(d.id)} target="_blank" rel="noopener noreferrer" className="font-semibold text-white underline underline-offset-2">
                      {d.name}
                    </a>
                    {/* TODO: only 311 and rodent inspections have a logged pull date; the others need a refresh run to log one. */}
                    <span className="text-sm text-[#B9C0CC]">{at ? `Last pulled ${formatDay(at)}` : "Pull date not logged yet"}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto flex max-w-[1232px] flex-col items-start gap-5 px-4 py-24 sm:px-6">
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
