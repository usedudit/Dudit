import { ReportsSkeleton } from "@/components/erp/reports/ReportsSkeleton"

export default function DashboardLoading() {
    return (
        <div className="p-4">
            <div className="w-full space-y-6 pt-4 px-4 md:px-8">
                <div className="h-8 w-48 animate-pulse rounded-lg bg-brand-gray/40 dark:bg-dark-border/20" />
                <ReportsSkeleton />
            </div>
        </div>
    )
}
