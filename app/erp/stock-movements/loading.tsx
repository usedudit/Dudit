import { Skeleton } from "@/components/ui/skeleton"
import { Card } from "@/components/ui/card"

export default function StockMovementsLoading() {
  return (
    <>
      {/* Header Skeleton */}
      <div className="border-b px-6 py-4">
        <Skeleton className="h-8 w-48" />
      </div>

      <div className="p-4 sm:p-6 lg:p-8">
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-10 w-40" />
          </div>

          <div className="flex gap-4">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-32" />
          </div>

          <Card>
            <div className="p-6 space-y-4">
              {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                <div key={i} className="flex items-center gap-4 border-b pb-4 last:border-0">
                  <Skeleton className="h-10 w-10 rounded" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-6 w-16 rounded-full" />
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}
