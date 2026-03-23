"use client";

import { useState, type FormEvent } from "react";
import { useStore } from "@/lib/store";
import { searchBuildings } from "@/lib/api";

export function SearchBar() {
  const [input, setInput] = useState("");
  const { setSearchQuery, setSearchResults, setIsSearching, clearSearch } =
    useStore();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const query = input.trim();
    if (!query) return;

    setSearchQuery(query);
    setIsSearching(true);

    try {
      const result = await searchBuildings(query);
      setSearchResults(result.results);
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleClear = () => {
    setInput("");
    clearSearch();
  };

  return (
    <form onSubmit={handleSubmit} className="relative">
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Search buildings... (e.g., 'buildings with rat problems in Brooklyn')"
        className="w-full rounded-lg border border-gray-600 bg-gray-800/90 px-4 py-3 pr-20 text-white placeholder-gray-400 backdrop-blur-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      <div className="absolute right-2 top-1/2 flex -translate-y-1/2 gap-1">
        {input && (
          <button
            type="button"
            onClick={handleClear}
            className="rounded px-2 py-1 text-sm text-gray-400 hover:text-white"
          >
            Clear
          </button>
        )}
        <button
          type="submit"
          className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700"
        >
          Search
        </button>
      </div>
    </form>
  );
}
