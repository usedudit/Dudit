export default function SkeletonLoader() {
  return (
    <div className="animate-in fade-in-0 duration-200 ease-out">
      <div className="space-y-6 p-6">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-8 w-48 bg-gray-200 dark:bg-dark-border rounded animate-pulse" />
            <div className="h-4 w-64 bg-gray-200 dark:bg-dark-border rounded animate-pulse" />
          </div>
          <div className="h-10 w-32 bg-gray-200 dark:bg-dark-border rounded animate-pulse" />
        </div>

        {/* Filters skeleton */}
        <div className="flex gap-3">
          <div className="h-10 w-64 bg-gray-200 dark:bg-dark-border rounded animate-pulse" />
          <div className="h-10 w-32 bg-gray-200 dark:bg-dark-border rounded animate-pulse" />
          <div className="h-10 w-32 bg-gray-200 dark:bg-dark-border rounded animate-pulse" />
        </div>

        {/* Table skeleton */}
        <div className="space-y-3 bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-border p-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 py-3" style={{ animationDelay: `${i * 50}ms` }}>
              <div className="h-9 w-9 bg-gray-200 dark:bg-dark-border rounded-full animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 bg-gray-200 dark:bg-dark-border rounded animate-pulse" />
                <div className="h-3 w-1/2 bg-gray-200 dark:bg-dark-border rounded animate-pulse" />
              </div>
              <div className="h-4 w-20 bg-gray-200 dark:bg-dark-border rounded animate-pulse" />
              <div className="h-4 w-16 bg-gray-200 dark:bg-dark-border rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
