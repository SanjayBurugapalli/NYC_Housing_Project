// Loading placeholder for the building detail panel.
export function PanelSkeleton() {
  return (
    <div className="space-y-6 p-4">
      {/* Address block */}
      <div className="space-y-2">
        <div className="h-3 w-24 rounded bg-gray-700/60 animate-pulse" />
        <div className="h-6 w-3/4 rounded bg-gray-700/60 animate-pulse" />
        <div className="h-3 w-1/2 rounded bg-gray-700/60 animate-pulse" />
        <div className="mt-3 h-12 w-16 rounded bg-gray-700/60 animate-pulse" />
      </div>
      {/* Info grid */}
      <div className="grid grid-cols-2 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded bg-gray-700/50 p-2 space-y-1">
            <div className="h-3 w-12 rounded bg-gray-600/60 animate-pulse" />
            <div className="h-4 w-16 rounded bg-gray-600/60 animate-pulse" />
          </div>
        ))}
      </div>
      {/* Score bars */}
      <div className="space-y-3">
        <div className="h-4 w-32 rounded bg-gray-700/60 animate-pulse" />
        {[...Array(5)].map((_, i) => (
          <div key={i} className="space-y-1">
            <div className="flex justify-between">
              <div className="h-3 w-28 rounded bg-gray-700/60 animate-pulse" />
              <div className="h-3 w-12 rounded bg-gray-700/60 animate-pulse" />
            </div>
            <div className="h-2 rounded-full bg-gray-700 overflow-hidden">
              <div className="h-full rounded-full bg-gray-600/60 animate-pulse" style={{ width: `${40 + i * 12}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
