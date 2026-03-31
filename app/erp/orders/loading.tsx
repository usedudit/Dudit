import { Skeleton } from "@/components/ui/skeleton"
import { Card } from "@/components/ui/card"

export default function OrdersLoading() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="space-y-6">
        {/* Title and Button Skeleton (Desktop) */}
        <div className="hidden md:flex justify-between items-center">
          <div className="space-y-2">
            <Skeleton className="h-9 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
          <div className="flex gap-3">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-40" />
          </div>
        </div>

        {/* Search and Filters Skeleton */}
        <div className="flex flex-col sm:flex-row gap-4">
          <Skeleton className="h-[42px] flex-1 max-w-sm rounded-full" />
          <Skeleton className="h-[42px] w-32 rounded-full" />
          <div className="flex-1" />
          <Skeleton className="h-[42px] w-20 rounded-full" />
        </div>

        {/* Table/Grid Skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <Card key={i} className="p-4 space-y-4">
              <div className="flex gap-3">
                <Skeleton className="h-12 w-12 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
              <div className="space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
              <div className="pt-2 border-t flex justify-between">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-16" />
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
