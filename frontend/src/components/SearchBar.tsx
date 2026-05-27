"use client";

import { useState, useRef, useEffect, type FormEvent } from "react";
import { useStore } from "@/lib/store";
import { searchBuildings, trackEvent } from "@/lib/api";

const HISTORY_KEY = "nyc_search_history";
const HISTORY_MAX = 8;
const SUGGESTIONS = [
  "quiet buildings in Brooklyn",
  "no heat violations in the Bronx",
  "rat-free apartments in Astoria",
  "worst buildings in Harlem",
  "pre-war elevator buildings in Manhattan",
];

const BOROUGHS = ["MANHATTAN", "BROOKLYN", "QUEENS", "BRONX", "STATEN ISLAND"];

function loadHistory(): string[] {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(HISTORY_KEY) : null;
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return [];
}

function saveHistory(query: string, existing: string[]): string[] {
  const deduped = [query, ...existing.filter((h) => h !== query)].slice(0, HISTORY_MAX);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(deduped));
  } catch {
    // ignore
  }
  return deduped;
}

export function SearchBar() {
  const [input, setInput] = useState("");
  const [borough, setBorough] = useState<string>("");
  const [minUnits, setMinUnits] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const {
    setSearchQuery,
    setSearchResults,
    setIsSearching,
    setSearchError,
    setSearchClarification,
    selectBuilding,
    isSearching,
    searchError,
    searchClarification,
    clearSearch,
    includeSmallHomes,
    setIncludeSmallHomes,
  } = useStore();

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  // Clear error after 8 seconds
  useEffect(() => {
    if (!searchError) return;
    const timer = setTimeout(() => setSearchError(null), 8000);
    return () => clearTimeout(timer);
  }, [searchError, setSearchError]);

  const activeFilterCount =
    (includeSmallHomes ? 1 : 0) + (borough ? 1 : 0) + (minUnits ? 1 : 0);

  const runSearch = async (query: string) => {
    if (!query.trim()) return;
    setInput(query);
    setShowDropdown(false);
    setSearchQuery(query);
    setIsSearching(true);
    setSearchError(null);

    try {
      const result = await searchBuildings(query, {
        includeSmallHomes,
        borough: borough || null,
        minUnits: minUnits ? parseInt(minUnits, 10) : null,
      });
      const updated = saveHistory(query, history);
      setHistory(updated);

      trackEvent("search", { query, result_count: result.results.length });

      if (result.results.length === 0) {
        setSearchResults([]);
        setSearchError(null);
        setSearchClarification(
          result.clarification ||
            'No buildings found. Try: "quiet buildings in Brooklyn" or "worst heat in the Bronx".'
        );
      } else if (result.results.length === 1) {
        setSearchResults(result.results);
        setSearchClarification(null);
        selectBuilding(result.results[0].bbl);
      } else {
        setSearchResults(result.results);
        setSearchClarification(result.clarification || null);
      }
    } catch {
      setSearchResults([]);
      setSearchError("Search failed. Please try again.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    runSearch(input.trim());
  };

  const handleClear = () => {
    setInput("");
    clearSearch();
    setShowDropdown(false);
    inputRef.current?.focus();
  };

  const dropdownItems = input.trim()
    ? history.filter((h) => h.toLowerCase().includes(input.toLowerCase()))
    : history.length > 0
    ? history
    : SUGGESTIONS;

  const dropdownLabel = input.trim()
    ? null
    : history.length > 0
    ? "Recent searches"
    : "Try searching for";

  return (
    <div className="relative">
      <form onSubmit={handleSubmit} className="relative">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => setShowDropdown(true)}
          placeholder="Search buildings... (e.g., 'buildings with rat problems in Brooklyn')"
          className="w-full rounded-lg border border-gray-600 bg-gray-800/90 px-4 py-3 pr-28 text-white placeholder-gray-400 backdrop-blur-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          aria-label="Search buildings"
          aria-autocomplete="list"
          aria-expanded={showDropdown && dropdownItems.length > 0}
          disabled={isSearching}
          autoComplete="off"
        />
        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 gap-1">
          {input && !isSearching && (
            <button
              type="button"
              onClick={handleClear}
              className="rounded px-2 py-1 text-sm text-gray-400 hover:text-white"
              aria-label="Clear search"
            >
              Clear
            </button>
          )}
          <button
            type="submit"
            disabled={isSearching}
            className="flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            aria-label="Submit search"
          >
            {isSearching && (
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            )}
            {isSearching ? "Searching" : "Search"}
          </button>
        </div>
      </form>

      {/* Loading bar */}
      <div className="relative h-0.5 overflow-hidden rounded-full">
        <div
          className={`absolute inset-0 transition-opacity duration-300 ${isSearching ? "opacity-100" : "opacity-0"}`}
        >
          <div className="h-full w-full animate-loading-bar bg-gradient-to-r from-transparent via-blue-500 to-transparent" />
        </div>
      </div>

      {/* History / suggestion dropdown */}
      {showDropdown && dropdownItems.length > 0 && !isSearching && (
        <div
          ref={dropdownRef}
          className="absolute top-full mt-1 w-full rounded-lg border border-gray-600 bg-gray-800/95 py-1 shadow-xl backdrop-blur-sm z-50"
          role="listbox"
        >
          {dropdownLabel && (
            <p className="px-3 py-1 text-xs font-medium text-gray-500 uppercase tracking-wide">
              {dropdownLabel}
            </p>
          )}
          {dropdownItems.map((item) => (
            <button
              key={item}
              type="button"
              role="option"
              aria-selected={false}
              onMouseDown={(e) => {
                e.preventDefault();
                runSearch(item);
              }}
              className="w-full px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-700 transition-colors"
            >
              {item}
            </button>
          ))}
        </div>
      )}

      {/* Filter toggle row */}
      <div className="mt-1.5 flex items-center gap-3 px-1">
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs transition-colors ${
            showFilters || activeFilterCount > 0
              ? "bg-blue-900/60 text-blue-300 hover:bg-blue-900"
              : "text-gray-400 hover:text-gray-200"
          }`}
        >
          <span>Filters</span>
          {activeFilterCount > 0 && (
            <span className="rounded-full bg-blue-600 px-1.5 py-0 text-[10px] font-bold text-white leading-4">
              {activeFilterCount}
            </span>
          )}
          <span className={`transition-transform duration-150 ${showFilters ? "rotate-180" : ""}`}>▾</span>
        </button>
      </div>

      {/* Filter dropdown */}
      {showFilters && (
        <div className="mt-1 rounded-lg border border-gray-600 bg-gray-800/95 p-3 shadow-xl backdrop-blur-sm">
          <div className="flex flex-col gap-3">
            {/* Include 1–2 family homes */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeSmallHomes}
                onChange={(e) => setIncludeSmallHomes(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-gray-600 bg-gray-700 accent-blue-500"
              />
              <span className="text-xs text-gray-300 select-none">Include 1–2 family homes</span>
            </label>

            {/* Borough select */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-400">Borough</label>
              <select
                value={borough}
                onChange={(e) => setBorough(e.target.value)}
                className="rounded border border-gray-600 bg-gray-700 px-2 py-1.5 text-xs text-white focus:border-blue-500 focus:outline-none"
              >
                <option value="">Any borough</option>
                {BOROUGHS.map((b) => (
                  <option key={b} value={b}>
                    {b.charAt(0) + b.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
            </div>

            {/* Min units */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-400">Minimum units</label>
              <input
                type="number"
                min={1}
                max={9999}
                placeholder="e.g. 10"
                value={minUnits}
                onChange={(e) => setMinUnits(e.target.value)}
                className="rounded border border-gray-600 bg-gray-700 px-2 py-1.5 text-xs text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
            </div>

            {/* Clear filters */}
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  setIncludeSmallHomes(false);
                  setBorough("");
                  setMinUnits("");
                }}
                className="self-start text-xs text-gray-500 underline hover:text-gray-300"
              >
                Clear all filters
              </button>
            )}
          </div>
        </div>
      )}

      {/* Error toast */}
      {searchError && (
        <div className="absolute top-full mt-2 w-full rounded-lg border border-red-800 bg-red-900/90 px-4 py-2 text-sm text-red-200 backdrop-blur-sm z-40">
          {searchError}
        </div>
      )}

      {/* Clarification — mobile only (desktop shown in results panel) */}
      {searchClarification && !searchError && (
        <div className="absolute top-full mt-2 w-full rounded-lg border border-blue-800 bg-blue-900/80 px-4 py-2 text-sm text-blue-200 backdrop-blur-sm z-40 md:hidden">
          {searchClarification}
        </div>
      )}
    </div>
  );
}
