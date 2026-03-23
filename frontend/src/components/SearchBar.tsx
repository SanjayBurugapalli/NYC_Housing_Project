"use client";

import { useState, useRef, useEffect, type FormEvent } from "react";
import { useStore } from "@/lib/store";
import { searchBuildings } from "@/lib/api";

export function SearchBar() {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const {
    setSearchQuery,
    setSearchResults,
    setIsSearching,
    setSearchError,
    isSearching,
    searchError,
    clearSearch,
  } = useStore();

  // Clear error after 5 seconds
  useEffect(() => {
    if (!searchError) return;
    const timer = setTimeout(() => setSearchError(null), 5000);
    return () => clearTimeout(timer);
  }, [searchError, setSearchError]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const query = input.trim();
    if (!query) return;

    setSearchQuery(query);
    setIsSearching(true);
    setSearchError(null);

    try {
      const result = await searchBuildings(query);
      setSearchResults(result.results);
      if (result.results.length === 0) {
        setSearchError("No buildings found matching your search.");
      }
    } catch {
      setSearchResults([]);
      setSearchError("Search failed. Please try again.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleClear = () => {
    setInput("");
    clearSearch();
    inputRef.current?.focus();
  };

  return (
    <div className="relative">
      <form onSubmit={handleSubmit} className="relative">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Search buildings... (e.g., 'buildings with rat problems in Brooklyn')"
          className="w-full rounded-lg border border-gray-600 bg-gray-800/90 px-4 py-3 pr-28 text-white placeholder-gray-400 backdrop-blur-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          aria-label="Search buildings"
          disabled={isSearching}
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

      {/* Error / no results toast */}
      {searchError && (
        <div className="absolute top-full mt-2 w-full rounded-lg border border-red-800 bg-red-900/90 px-4 py-2 text-sm text-red-200 backdrop-blur-sm">
          {searchError}
        </div>
      )}
    </div>
  );
}
