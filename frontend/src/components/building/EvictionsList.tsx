import type { EvictionRecord } from "@/types/building";

export function EvictionsList({ evictions }: { evictions: EvictionRecord[] }) {
  return (
    <div>
      <h4 className="mb-2 font-semibold text-red-400">
        Evictions ({evictions.length})
      </h4>
      <div className="space-y-2">
        {evictions.map((e) => (
          <div
            key={e.id}
            className="rounded border border-red-900/50 bg-red-950/20 p-2 text-sm"
          >
            <div className="flex items-center justify-between">
              <span className="text-red-300">
                {e.eviction_type || "Eviction"}
                {e.apartment_no ? ` · Apt ${e.apartment_no}` : ""}
              </span>
              <span className="text-gray-500">{e.executed_date}</span>
            </div>
            {e.respondent && (
              <p className="mt-1 text-gray-400 text-xs">Respondent: {e.respondent}</p>
            )}
            {e.marshal_name && (
              <p className="text-gray-500 text-xs">Marshal: {e.marshal_name}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
