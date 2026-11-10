import Link from "next/link";
import type { ReactNode } from "react";
import { DEFAULT_WEIGHTS } from "@/lib/scoringWeights";
import { GRADES, GRADE_META, type Grade } from "@/lib/grades";
import { GradeTile } from "@/components/ui/GradeTile";
import {
  BasketIcon,
  BriefcaseIcon,
  ChevronDownIcon,
  LogoIcon,
  PersonIcon,
  RestaurantIcon,
  StoreIcon,
  TrainIcon,
} from "@/components/ui/icons";
import { CityArt } from "@/components/landing/CityArt";
import { CtaSearch, HeroSearch, LandingNav } from "@/components/landing/LandingInputs";

const REPO_URL = "https://github.com/SanjayBurugapalli/NYC_Housing_Project";

// Grade cards: copy per letter, tilt per card (the placards are hung by hand).
const GRADE_CARDS: { grade: Grade; text: string; tilt: number }[] = [
  { grade: "A", text: "Clean record. Sign with confidence.", tilt: -4 },
  { grade: "B", text: "Minor issues, no pattern of neglect.", tilt: 3 },
  { grade: "C", text: "Moderate issues. Worth a closer look.", tilt: -2 },
  { grade: "D", text: "Significant, recurring issues. Ask hard questions.", tilt: 4 },
  { grade: "F", text: "Critical issues. Proceed with care.", tilt: -3 },
];

// What feeds the grade, in weight order. Percentages come from DEFAULT_WEIGHTS
// (kept in sync with data/scoring/compute.py WEIGHTS).
const WEIGHT_ROWS = [
  { key: "pest_rodent", label: "Pests & rodents", source: "311, rodent inspections" },
  { key: "heat_hot_water", label: "Heat & hot water", source: "311, HPD complaints" },
  { key: "structural_safety", label: "Structural & safety", source: "DOB violations" },
  { key: "hpd_severity", label: "Housing code violations", source: "HPD Class A, B, C" },
  { key: "litigation", label: "Lawsuits against the owner", source: "HPD litigation" },
  { key: "noise", label: "Noise", source: "311 complaints" },
] as const;

const LIMITS = [
  { title: "Complaints follow callers", body: "311 reflects who reports, not necessarily where conditions are worst." },
  { title: "City data lags", body: "New violations can take two to six weeks to show up." },
  { title: "New owners, old record", body: "A recent sale or renovation is not reflected yet." },
  { title: "Spot something wrong?", body: "Every building has a “flag a data issue” link. We read them." },
];

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

function FeatureCard({ art, title, children }: { art: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-[22px] rounded-[22px] border-2 border-ink bg-surface p-[26px]">
      <div className="flex h-[150px] flex-col justify-center">{art}</div>
      <div className="flex flex-col gap-1.5">
        <h3 className="m-0 font-display text-[26px] font-extrabold tracking-[-0.02em]">{title}</h3>
        <p className="m-0 text-base text-ink-2">{children}</p>
      </div>
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

function FoodPin({ bg, fg, label, children }: { bg: string; fg: string; label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="flex h-[54px] w-[54px] items-center justify-center rounded-full border-2 border-ink" style={{ background: bg, color: fg }}>
        {children}
      </span>
      <span className="text-[13px] font-semibold">{label}</span>
    </div>
  );
}

export default function LandingPage() {
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

      {/* HERO */}
      <section className="mx-auto flex max-w-[1232px] flex-wrap items-center gap-x-16 gap-y-14 px-4 pb-24 pt-12 sm:px-6 sm:pt-16">
        <div className="flex min-w-0 flex-[1_1_520px] flex-col gap-6">
          <div className="inline-flex items-center gap-2.5 self-start rounded-full border-2 border-ink bg-white py-[7px] pl-2.5 pr-3.5 text-[13px] font-semibold">
            <span aria-hidden="true" className="inline-flex overflow-hidden rounded-full border-[1.5px] border-ink">
              {GRADES.map((g) => (
                <span key={g} className="h-3 w-[9px]" style={{ background: GRADE_META[g].bg }} />
              ))}
            </span>
            For NYC apartment hunters · free, no login
          </div>
          <h1 className="m-0 font-display text-[clamp(46px,6.2vw,84px)] font-extrabold leading-[0.98] tracking-[-0.035em]">
            Know your building <span style={gradeStripe(12)}>before you sign.</span>
          </h1>
          <p className="m-0 max-w-[540px] text-[19px] leading-[1.55] text-ink-2">
            Paste a listing or type an address. One page tells you how healthy the building is, how long your commute
            really takes and what there is to eat around the corner.
          </p>
          <HeroSearch />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-muted">Try asking:</span>
            {["Rent-stabilized in Bushwick", "Graded A in Astoria"].map((q) => (
              <Link key={q} href={`/map?q=${encodeURIComponent(q)}`} className="chip no-underline">
                {q}
              </Link>
            ))}
          </div>
        </div>

        <div className="relative min-w-0 max-w-[580px] flex-[1_1_440px] pb-[120px]">
          <div className="h-[430px] overflow-hidden rounded-[26px] border-2 border-ink bg-white shadow-hard-lg">
            <CityArt />
          </div>
          <div className="absolute bottom-0 left-0 flex w-[min(350px,94%)] -rotate-[2.5deg] flex-col gap-3 rounded-[20px] border-2 border-ink bg-white p-[18px] shadow-hard-md">
            <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">Sample building</div>
            <div className="flex items-center gap-3.5">
              <GradeTile grade="C" size="sample" shadow="xs" />
              <div className="min-w-0">
                <div className="font-display text-[21px] font-extrabold leading-tight tracking-[-0.02em]">418 Larkmoor St</div>
                <div className="text-[13px] text-muted">Bushwick · 24 units · built 1931</div>
              </div>
            </div>
            <div className="flex flex-col text-sm">
              {[
                [<LogoIcon key="i" size={18} />, "Building health", "82 / 100"],
                [<TrainIcon key="i" size={18} strokeWidth={2.2} />, "Commute to work", "26 min"],
                [<RestaurantIcon key="i" size={18} strokeWidth={2.2} />, "Food within 5 min", "13 spots"],
              ].map(([icon, label, value], i) => (
                <div key={i} className={`flex items-center gap-2.5 border-t-[1.5px] border-line ${i === 2 ? "pt-2" : "py-2"}`}>
                  {icon}
                  <span className="flex-1">{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="scroll-mt-4 border-y-2 border-ink bg-white">
        <div className="mx-auto flex max-w-[1232px] flex-col gap-12 px-4 pb-24 pt-[88px] sm:px-6">
          <SectionHead
            eyebrow="What you get"
            title="Everything the listing leaves out."
            blurb="Listings show you the kitchen. We show you the building, the trip to work and the block."
          />
          <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-6">
            <FeatureCard
              title="Building health, in one letter"
              art={
                <div className="flex items-center gap-5">
                  <GradeTile grade="B" size="xl" rotate={-4} shadow="md" label="Sample grade B" />
                  <div className="flex flex-col gap-2">
                    <div className="font-display font-extrabold leading-none tracking-[-0.03em]">
                      <span className="text-[44px]">93</span>
                      <span className="text-lg text-muted"> / 100</span>
                    </div>
                    <span className="self-start rounded-full border-[1.5px] border-ink bg-white px-3 py-1.5 text-[13px] font-semibold">
                      What&apos;s behind this grade ›
                    </span>
                  </div>
                </div>
              }
            >
              We read years of complaints, violations, lawsuits and inspections so you don&apos;t have to. You get one grade.
              The paper trail is a tap away if you want it.
            </FeatureCard>

            <FeatureCard
              title="Time the commute"
              art={
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-2.5">
                    <GradeTile grade="B" size="li" label="" />
                    <span aria-hidden="true" className="flex-1 border-t-[5px] border-dotted border-ink" />
                    <span className="whitespace-nowrap rounded-full border-2 border-ink bg-white px-3.5 py-1.5 font-display text-[17px] font-extrabold">26 min</span>
                    <span aria-hidden="true" className="flex-1 border-t-[5px] border-dotted border-ink" />
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-ink text-white">
                      <BriefcaseIcon size={20} />
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[13px] font-semibold">
                    <span className="rounded-full border-[1.5px] border-ink bg-white px-3 py-1.5">Walk 5</span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-ink bg-ink py-1 pl-1 pr-3 text-white">
                      <span className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full bg-[#A7A9AC] text-xs font-extrabold text-white">L</span>
                      17 min
                    </span>
                    <span className="rounded-full border-[1.5px] border-ink bg-white px-3 py-1.5">Walk 4</span>
                  </div>
                </div>
              }
            >
              Tell us where you work, once. Every building then shows the real door-to-door trip by subway, bus and on foot.
            </FeatureCard>

            <FeatureCard
              title="Scout the food"
              art={
                <div className="flex flex-col gap-3.5">
                  <div className="flex gap-[22px]">
                    <FoodPin bg="#DCD6FF" fg="#12141A" label="Delis"><StoreIcon size={26} /></FoodPin>
                    <FoodPin bg="#8C7BFF" fg="#12141A" label="Groceries"><BasketIcon size={26} /></FoodPin>
                    <FoodPin bg="#3D2DB3" fg="#FFFFFF" label="Restaurants"><RestaurantIcon size={26} /></FoodPin>
                  </div>
                  <div className="text-[13px] font-semibold text-muted">Lighter is cheaper, darker is pricier</div>
                </div>
              }
            >
              Delis, groceries and restaurants within a short walk, each with its own icon and colored by estimated price.
            </FeatureCard>

            <FeatureCard
              title="Meet the landlord"
              art={
                <div className="flex flex-col gap-3.5">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-ink bg-white">
                      <PersonIcon size={22} />
                    </span>
                    <div>
                      <div className="font-bold">Greywether Holdings LLC</div>
                      <div className="text-[13px] text-muted">Sample owner · 6 buildings</div>
                    </div>
                  </div>
                  <div className="flex gap-2" aria-label="Their six buildings: D, F, D, C, D, F" role="img">
                    {(["D", "F", "D", "C", "D", "F"] as Grade[]).map((g, i) => (
                      <GradeTile key={i} grade={g} size="li" label="" />
                    ))}
                  </div>
                </div>
              }
            >
              One bad building can be bad luck. Six is a pattern. See everything an owner holds, or browse the{" "}
              <Link href="/rankings" className="font-semibold text-ink underline underline-offset-2">worst landlords &amp; buildings rankings</Link>.
            </FeatureCard>

            <FeatureCard
              title="Ask like a New Yorker"
              art={
                <div className="flex flex-col gap-3">
                  <div className="max-w-full self-start rounded-[18px_18px_18px_4px] border-2 border-ink bg-ink px-4 py-3 text-[15px] font-medium text-white">
                    “Rent-stabilized in Bushwick, no heat complaints”
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {["Bushwick", "Rent stabilized", "No heat complaints"].map((c) => (
                      <span key={c} className="rounded-full border-[1.5px] border-ink bg-white px-3 py-1.5 text-[13px] font-semibold">{c}</span>
                    ))}
                  </div>
                </div>
              }
            >
              Type what you want in plain English. We show the filters we understood, so you can fix them instead of guessing.
            </FeatureCard>

            <FeatureCard
              title="Compare two addresses"
              art={
                <div className="flex items-center gap-4">
                  {[
                    { g: "A" as Grade, addr: "77 Halvard St", c: "34 min to work", f: "9 food spots" },
                    { g: "C" as Grade, addr: "418 Larkmoor St", c: "26 min to work", f: "13 food spots" },
                  ].map((b, i) => (
                    <div key={b.addr} className="contents">
                      {i === 1 && <span className="font-display text-lg font-extrabold">vs</span>}
                      <div className="flex min-w-0 flex-1 flex-col gap-1.5 rounded-2xl border-2 border-ink bg-white p-3.5">
                        <div className="flex items-center gap-2.5">
                          <GradeTile grade={b.g} size="chip" label={`Grade ${b.g}`} />
                          <span className="text-[13px] font-bold leading-tight">{b.addr}</span>
                        </div>
                        <span className="text-[13px] font-semibold">{b.c}</span>
                        <span className="text-[13px] font-semibold">{b.f}</span>
                      </div>
                    </div>
                  ))}
                </div>
              }
            >
              Torn between two apartments? Put them side by side: health, commute and food.
            </FeatureCard>
          </div>
        </div>
      </section>

      {/* GRADE */}
      <section id="grade" className="mx-auto flex max-w-[1232px] scroll-mt-4 flex-col gap-11 px-4 py-24 sm:px-6">
        <SectionHead
          eyebrow="The health grade"
          title="Restaurants post a grade in the window. Now buildings do too."
          blurb="A score from 0 to 100, turned into one letter you can read from across the street."
        />
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-5">
          {GRADE_CARDS.map(({ grade, text, tilt }) => (
            <div key={grade} className="flex flex-col gap-3.5 rounded-[20px] border-2 border-ink bg-white p-[22px]">
              <GradeTile grade={grade} size="grade" rotate={tilt} shadow="sm" />
              <div className="font-display text-[22px] font-extrabold tracking-[-0.02em]">{GRADE_META[grade].range}</div>
              <p className="m-0 text-[15px] text-ink-2">{text}</p>
            </div>
          ))}
        </div>

        <details className="group rounded-[20px] border-2 border-ink bg-white">
          <summary className="flex min-h-[64px] cursor-pointer items-center justify-between gap-4 px-[22px] text-[17px] font-bold">
            <span>
              Curious how the grade is built?{" "}
              <span className="font-medium text-muted">Six city datasets, weighted and scored.</span>
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

      {/* LIMITS */}
      <section id="limits" className="scroll-mt-4 bg-ink text-white">
        <div className="mx-auto flex max-w-[1232px] flex-wrap gap-x-[72px] gap-y-10 px-4 pb-24 pt-[88px] sm:px-6">
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
      </section>

      {/* CTA */}
      <section className="mx-auto flex max-w-[1232px] flex-col items-center gap-[30px] px-4 pb-28 pt-[104px] text-center sm:px-6">
        <div className="flex gap-2.5" aria-hidden="true">
          {GRADES.map((g, i) => (
            <GradeTile key={g} grade={g} size="md" rotate={[-6, 4, -3, 5, -5][i]} shadow="xs" label="" />
          ))}
        </div>
        <h2 className="m-0 max-w-[820px] font-display text-[clamp(40px,5.4vw,72px)] font-extrabold leading-none tracking-[-0.035em]">
          Found a place you like? Paste it in.
        </h2>
        <CtaSearch />
        <Link href="/map" className="inline-flex min-h-[44px] items-center text-base font-semibold text-ink underline underline-offset-2">
          or just open the map
        </Link>
      </section>

      {/* FOOTER */}
      <footer className="bg-ink text-white">
        <div className="mx-auto flex max-w-[1232px] flex-wrap items-center gap-x-10 gap-y-5 px-4 pb-12 pt-10 sm:px-6">
          <div className="flex flex-[1_1_320px] flex-col gap-1.5">
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
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-2 gap-y-1">
            {[
              ["#grade", "Scoring"],
              ["#limits", "Limitations"],
              ["/rankings", "Worst landlords & buildings"],
              ["/privacy", "Privacy"],
              [REPO_URL, "Source code"],
            ].map(([href, label]) => (
              <Link
                key={href}
                href={href}
                {...(href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className="px-2.5 py-3 text-sm font-semibold text-white"
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}
