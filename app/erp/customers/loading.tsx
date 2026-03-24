import { Skeleton } from "@/components/ui/skeleton"
import { Card } from "@/components/ui/card"

export default function CustomersLoading() {
  return (
    <>
      {/* Header Skeleton */}
      <div className="border-b px-6 py-4">
        <Skeleton className="h-8 w-48" />
      </div>

      <div className="p-4 sm:p-6 lg:p-8">
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <Skeleton className="h-9 w-48" />
            <Skeleton className="h-10 w-40" />
          </div>

          <Skeleton className="h-10 w-full max-w-sm" />

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i} className="p-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-12 w-12 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-3/4" />
                  </div>
                  <Skeleton className="h-9 w-full" />
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
