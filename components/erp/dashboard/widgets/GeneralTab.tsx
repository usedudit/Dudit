import { Suspense } from "react"
import { Dashboard } from "../Dashboard"
import { ReportsSkeleton } from "@/components/erp/reports/ReportsSkeleton"
import type { Period, CompareMode } from "@/lib/period-types"

export function GeneralTab({ partnerId, sells, period, compare, compareFrom, compareTo }: { partnerId: string; sells: string[]; period?: Period; compare?: CompareMode; compareFrom?: string; compareTo?: string }) {
    return (
        <Suspense fallback={<ReportsSkeleton />}>
            <Dashboard partnerId={partnerId} sells={sells} period={period} compare={compare} compareFrom={compareFrom} compareTo={compareTo} />
        </Suspense>
    )
}
