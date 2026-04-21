"use client";

import { useMutation } from "@tanstack/react-query";
import { useStore } from "@/lib/store";
import { searchBuildings } from "@/lib/api";

export function useBuildingSearch() {
  const { setSearchResults, setIsSearching, selectBuilding } = useStore();

  const mutation = useMutation({
    mutationFn: (query: string) => searchBuildings(query),
    onMutate: () => {
      setIsSearching(true);
      selectBuilding(null); // dismiss any open building panel so results panel appears
    },
    onSuccess: (data) => {
      setSearchResults(data.results);
      setIsSearching(false);
    },
    onError: () => {
      setSearchResults([]);
      setIsSearching(false);
    },
  });

  return {
    search: mutation.mutate,
    isSearching: mutation.isPending,
    error: mutation.error,
    clarification: mutation.data?.clarification,
  };
}
