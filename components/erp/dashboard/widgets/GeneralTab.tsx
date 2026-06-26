import { Suspense } from "react"
import { Dashboard } from "../Dashboard"
import type { Period, CompareMode } from "@/lib/period-types"

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-[140px] animate-pulse rounded-[24px] border border-brand-border bg-brand-gray/40 dark:border-dark-border dark:bg-dark-border/20" />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="h-72 animate-pulse rounded-[24px] border border-brand-border bg-brand-gray/40 dark:border-dark-border dark:bg-dark-border/20 xl:col-span-2" />
        <div className="h-72 animate-pulse rounded-[24px] border border-brand-border bg-brand-gray/40 dark:border-dark-border dark:bg-dark-border/20" />
      </div>
    </div>
  )
}

export function GeneralTab({ partnerId, sells, period, compare, compareFrom, compareTo }: { partnerId: string; sells: string[]; period?: Period; compare?: CompareMode; compareFrom?: string; compareTo?: string }) {
    return (
        <Suspense fallback={<DashboardSkeleton />}>
            <Dashboard partnerId={partnerId} sells={sells} period={period} compare={compare} compareFrom={compareFrom} compareTo={compareTo} />
        </Suspense>
    )
}
