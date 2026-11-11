"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { resolveListing } from "@/lib/api";
import { looksLikeListingUrl } from "@/hooks/useSearchRunner";
import { titleCase } from "@/lib/grades";
import { CheckIcon, LinkIcon, MenuIcon, ArrowRightIcon } from "@/components/ui/icons";

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

/**
 * The page's one search: paste a StreetEasy or Zillow link. (An address typed
 * here still works — useTakeMeThere hands anything that isn't a link to the
 * map's search.) id="search" is the bottom call to action's anchor.
 */
export function HeroSearch() {
  const [link, setLink] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { status, go } = useTakeMeThere(() => inputRef.current?.focus());

  const submit = (e: FormEvent) => {
    e.preventDefault();
    go(link);
  };

  return (
    <form id="search" onSubmit={submit} className="flex max-w-[600px] scroll-mt-6 flex-col gap-2">
      <label htmlFor="hero-link" className="flex items-center gap-2 text-sm font-bold">
        <LinkIcon size={18} />
        Paste a StreetEasy or Zillow link
      </label>
      <div className="flex flex-wrap gap-2 rounded-[16px] border-2 border-ink bg-white p-1.5 shadow-hard-sm">
        <input
          ref={inputRef}
          id="hero-link"
          type="text"
          inputMode="url"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="streeteasy.com/building/…"
          className="h-12 min-w-0 flex-[1_1_220px] border-0 bg-transparent px-2.5 text-base font-medium text-ink focus:ring-0"
          autoComplete="off"
        />
        <button type="submit" disabled={status.kind === "busy"} className="btn-ink h-12 w-full rounded-[11px] px-5 text-base sm:w-auto sm:flex-[0_0_auto]">
          Take me there
        </button>
      </div>
      <div aria-live="polite"><StatusLine status={status} /></div>
    </form>
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
