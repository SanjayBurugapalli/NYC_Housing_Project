"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useStore } from "@/lib/store";
import { loadHistory, useSearchRunner } from "@/hooks/useSearchRunner";
import { CloseIcon, SearchIcon, SparkleIcon } from "@/components/ui/icons";

/**
 * The map's one search box: addresses, plain-English questions and pasted
 * StreetEasy/Zillow links all go through useSearchRunner.
 *
 * variant "map"   — 56px floating bar with the sparkle and a Search button
 * variant "panel" — 52px bar heading the results panel, with a clear button
 * variant "mobile"— compact bar; the keyboard's search key submits
 */
export function SearchBar({ variant = "map" }: { variant?: "map" | "panel" | "mobile" }) {
  const searchQuery = useStore((s) => s.searchQuery);
  const isSearching = useStore((s) => s.isSearching);
  const searchError = useStore((s) => s.searchError);
  const setSearchError = useStore((s) => s.setSearchError);
  const clearSearch = useStore((s) => s.clearSearch);
  const run = useSearchRunner();
  const [input, setInput] = useState(searchQuery);
  const [history, setHistory] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Mirror searches started elsewhere (suggestion chips, ?q=, owner links).
  useEffect(() => setInput(searchQuery), [searchQuery]);

  useEffect(() => {
    if (!searchError) return;
    const timer = setTimeout(() => setSearchError(null), 8000);
    return () => clearTimeout(timer);
  }, [searchError, setSearchError]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setShowHistory(false);
    run(input);
  };

  const clear = () => {
    setInput("");
    clearSearch();
    inputRef.current?.focus();
  };

  const tall = variant === "map" ? "h-14 rounded-2xl" : "h-[52px] rounded-[15px]";
  const recent = history.filter((h) => !input.trim() || h.toLowerCase().includes(input.toLowerCase())).slice(0, 6);

  return (
    <div className="relative min-w-0 flex-1">
      <form
        onSubmit={submit}
        role="search"
        className={`flex min-w-0 items-center gap-2.5 border-2 border-ink bg-white pl-3.5 pr-1.5 shadow-hard-sm ${tall}`}
      >
        <label htmlFor={`q-${variant}`} className="flex items-center">
          {variant === "map" ? <SparkleIcon size={22} /> : <SearchIcon size={variant === "panel" ? 20 : 20} />}
          <span className="sr-only">Search buildings</span>
        </label>
        <input
          ref={inputRef}
          id={`q-${variant}`}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => {
            setHistory(loadHistory());
            setShowHistory(true);
          }}
          onBlur={() => setTimeout(() => setShowHistory(false), 120)}
          placeholder="Address, a neighborhood, or a listing link"
          className="h-11 min-w-0 flex-1 text-ellipsis border-0 bg-transparent p-0 text-base font-medium text-ink focus:ring-0"
          autoComplete="off"
          enterKeyHint="search"
        />
        {variant !== "map" && input && !isSearching && (
          <button type="button" onClick={clear} aria-label="Clear search" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[11px] hover:bg-surface">
            <CloseIcon size={18} />
          </button>
        )}
        {variant === "map" && (
          <>
            {input && !isSearching && (
              <button type="button" onClick={clear} aria-label="Clear search" className="flex h-11 w-9 shrink-0 items-center justify-center rounded-[11px] hover:bg-surface">
                <CloseIcon size={18} />
              </button>
            )}
            <button type="submit" disabled={isSearching} className="btn-ink h-11 rounded-[11px] text-[15px]">
              {isSearching && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />}
              {isSearching ? "Searching" : "Search"}
            </button>
          </>
        )}
      </form>

      {/* Loading bar */}
      <div className="relative mx-3 h-0.5 overflow-hidden rounded-full">
        <div className={`absolute inset-0 transition-opacity duration-300 ${isSearching ? "opacity-100" : "opacity-0"}`}>
          <div className="h-full w-full animate-loading-bar bg-gradient-to-r from-transparent via-ink to-transparent" />
        </div>
      </div>

      {showHistory && recent.length > 0 && !isSearching && (
        <div role="listbox" aria-label="Recent searches" className="card-float absolute left-0 right-0 top-full z-50 mt-1 rounded-2xl p-1 shadow-hard-sm">
          <p className="eyebrow px-3 pb-1 pt-2">Recent searches</p>
          {recent.map((item) => (
            <button
              key={item}
              type="button"
              role="option"
              aria-selected={false}
              onMouseDown={(e) => {
                e.preventDefault();
                setShowHistory(false);
                run(item);
              }}
              className="block w-full truncate rounded-xl px-3 py-2.5 text-left text-sm font-medium hover:bg-surface"
            >
              {item}
            </button>
          ))}
        </div>
      )}

      {searchError && (
        <div role="alert" className="card-float absolute left-0 right-0 top-full z-40 mt-2 rounded-2xl border-grade-f px-4 py-3 text-sm font-semibold shadow-hard-sm">
          {searchError}
        </div>
      )}
    </div>
  );
}
