"use client";

import dynamic from "next/dynamic";
import { SearchBar } from "@/components/SearchBar";
import { BuildingPanel } from "@/components/BuildingPanel";
import { Legend } from "@/components/Legend";
import { useStore } from "@/lib/store";

const Map = dynamic(() => import("@/components/Map").then((m) => m.Map), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-gray-900" />,
});

export default function Home() {
  const selectedBuilding = useStore((s) => s.selectedBbl);

  return (
    <main className="relative h-screen w-screen">
      <Map />
      <div className="absolute top-4 left-4 right-4 z-10 flex justify-center pointer-events-none">
        <div className="pointer-events-auto w-full max-w-xl">
          <SearchBar />
        </div>
      </div>
      <Legend />
      {selectedBuilding && (
        <div className="absolute top-0 right-0 z-10 h-full w-96">
          <BuildingPanel bbl={selectedBuilding} />
        </div>
      )}
    </main>
  );
}
