"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { resolveListing } from "@/lib/api";
import { looksLikeListingUrl } from "@/hooks/useSearchRunner";
import { titleCase } from "@/lib/grades";
import { CheckIcon, LinkIcon, MenuIcon, SearchIcon, ArrowRightIcon } from "@/components/ui/icons";

type Status = { kind: "idle" } | { kind: "busy" } | { kind: "found"; text: string } | { kind: "error"; text: string };

/**
 * Resolve a listing link (or hand an address/question to the map). On a match
 * it shows "Found it: …" for a beat, then opens the map on that building.
 */
function useTakeMeThere(onNoAddress?: () => void) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function go(raw: string) {
    const value = raw.trim();
    if (!value) return;
    if (!looksLikeListingUrl(value)) {
      router.push(`/map?q=${encodeURIComponent(value)}`);
      return;
    }
    setStatus({ kind: "busy" });
    try {
      const r = await resolveListing(value);
      if (r.status === "found" && r.building) {
        const where = titleCase(r.building.nta_name || r.building.neighborhood || r.building.borough);
        setStatus({ kind: "found", text: `Found it: ${titleCase(r.building.address)}${where ? `, ${where}` : ""}` });
        setTimeout(() => router.push(`/map?bbl=${r.building!.bbl}`), 650);
      } else {
        setStatus({ kind: "error", text: r.message ?? "We couldn't read that link. Type the address instead." });
        if (r.status === "no_address") onNoAddress?.();
      }
    } catch {
      setStatus({ kind: "error", text: "We couldn't read that link right now. Type the address instead." });
    }
  }

  return { status, go };
}

function StatusLine({ status }: { status: Status }) {
  if (status.kind === "idle") return null;
  if (status.kind === "busy") {
    return <div className="flex items-center gap-2 text-[13px] font-semibold text-muted" role="status">Reading the link…</div>;
  }
  if (status.kind === "found") {
    return (
      <div className="flex items-center gap-2 text-[13px] font-semibold" role="status">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[1.5px] border-ink bg-grade-a">
          <CheckIcon size={11} strokeWidth={3.5} />
        </span>
        {status.text}
      </div>
    );
  }
  return <div className="text-[13px] font-semibold text-grade-f" role="alert">{status.text}</div>;
}

/** Hero box: paste a listing, or search an address / ask a question. */
export function HeroSearch() {
  const [link, setLink] = useState("");
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { status, go } = useTakeMeThere(() => searchRef.current?.focus());

  const submitLink = (e: FormEvent) => {
    e.preventDefault();
    go(link);
  };
  const submitSearch = (e: FormEvent) => {
    e.preventDefault();
    if (query.trim()) router.push(`/map?q=${encodeURIComponent(query.trim())}`);
  };

  return (
    <div className="flex max-w-[620px] flex-col gap-3 rounded-[22px] border-2 border-ink bg-white p-3.5 shadow-hard-md">
      <form onSubmit={submitLink} className="flex flex-col gap-2">
        <label htmlFor="hero-link" className="flex items-center gap-2 text-sm font-bold">
          <LinkIcon size={18} />
          Paste a StreetEasy or Zillow link
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id="hero-link"
            type="text"
            inputMode="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="streeteasy.com/building/…"
            className="h-[50px] min-w-0 flex-[1_1_260px] rounded-[13px] border-2 border-ink bg-surface px-3.5 text-[15px] font-medium text-ink focus:border-ink focus:ring-0"
            autoComplete="off"
          />
          <button type="submit" disabled={status.kind === "busy"} className="btn-ink h-[50px] rounded-[13px] px-5 text-base">
            Take me there
          </button>
        </div>
        <div aria-live="polite"><StatusLine status={status} /></div>
      </form>
      <div aria-hidden="true" className="flex items-center gap-3 text-xs font-bold uppercase tracking-[0.08em] text-muted">
        <span className="flex-1 border-t-[1.5px] border-line" />
        or
        <span className="flex-1 border-t-[1.5px] border-line" />
      </div>
      <form onSubmit={submitSearch} role="search" className="flex flex-wrap items-center gap-2">
        <label htmlFor="hero-q" className="flex items-center pl-1.5">
          <SearchIcon size={20} />
          <span className="sr-only">Search buildings</span>
        </label>
        <input
          ref={searchRef}
          id="hero-q"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search an address, a landlord, or just ask…"
          className="h-12 min-w-0 flex-[1_1_240px] border-0 bg-transparent px-1.5 text-base font-medium text-ink focus:ring-0"
          autoComplete="off"
        />
        <button type="submit" className="btn-outline h-12 rounded-[13px] border-2 px-5 text-[15px]">
          Search
        </button>
      </form>
    </div>
  );
}

/** Closing call to action: one field for a link or an address. */
export function CtaSearch() {
  const [value, setValue] = useState("");
  const { status, go } = useTakeMeThere();
  return (
    <div className="flex w-full max-w-[640px] flex-col items-stretch gap-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go(value);
        }}
        className="flex flex-wrap items-center gap-2 rounded-[18px] border-2 border-ink bg-white p-2 text-left shadow-hard-md"
      >
        <label htmlFor="cta-q" className="flex items-center pl-2.5">
          <LinkIcon size={20} />
          <span className="sr-only">Listing link or address</span>
        </label>
        <input
          id="cta-q"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="A StreetEasy or Zillow link, or an address"
          className="h-12 min-w-0 flex-[1_1_240px] border-0 bg-transparent px-1.5 text-[17px] font-medium text-ink focus:ring-0"
          autoComplete="off"
        />
        <button type="submit" disabled={status.kind === "busy"} className="btn-ink h-12 px-[22px] text-base">
          Take me there
        </button>
      </form>
      <div aria-live="polite" className="flex justify-center"><StatusLine status={status} /></div>
    </div>
  );
}

// Section links are absolute ("/#…") so they also work from /rankings and /privacy.
const NAV = [
  { href: "/#features", label: "What you get" },
  { href: "/#grade", label: "The health grade" },
  { href: "/#limits", label: "Limitations" },
  { href: "/rankings", label: "Worst landlords & buildings" },
];

/** Header nav: inline links on desktop, a menu button on phones. */
export function LandingNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  return (
    <>
      <nav aria-label="Main" className="ml-auto hidden flex-wrap items-center gap-x-1.5 gap-y-1 md:flex">
        {NAV.map((n) => {
          const current = n.href === pathname;
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={current ? "page" : undefined}
              className={`px-3 py-3 text-[15px] font-semibold text-ink hover:text-ink-2 ${
                current ? "underline decoration-2 underline-offset-[6px]" : "no-underline"
              }`}
            >
              {n.label}
            </Link>
          );
        })}
        <Link href="/map" className="btn-ink ml-2 h-[46px] rounded-[13px] px-[18px] text-[15px]">
          Open the map
          <ArrowRightIcon size={18} />
        </Link>
      </nav>
      <div className="ml-auto flex items-center gap-2 md:hidden">
        <Link href="/map" className="btn-ink h-11 rounded-xl px-3.5 text-sm">Open map</Link>
        <button
          type="button"
          aria-label="Menu"
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen((v) => !v)}
          className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-ink bg-white"
        >
          <MenuIcon size={20} />
        </button>
      </div>
      {open && (
        <nav id="mobile-nav" aria-label="Main" className="flex w-full flex-col border-t-[1.5px] border-line pt-2 md:hidden">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={n.href === pathname ? "page" : undefined}
              onClick={() => setOpen(false)}
              className="py-3 text-base font-semibold text-ink no-underline"
            >
              {n.label}
            </Link>
          ))}
        </nav>
      )}
    </>
  );
}
