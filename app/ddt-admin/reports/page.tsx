import { AdminHeader } from "@/components/admin/admin-header"
import ReportsList from "@/components/admin/reports/ReportsList"
import { getReports, getReportsStats } from "@/app/actions/admin/reports"

export const dynamic = "force-dynamic"

export default async function ReportsPage() {
    const [initialData, initialStats] = await Promise.all([
        getReports(null, 100, { status: "all", targetType: "all" }),
        getReportsStats(),
    ])

    return (
        <>
            <AdminHeader pageTitle="Denúncias" />
            <ReportsList 
                initialData={initialData.data} 
                initialNextCursor={initialData.nextCursor}
                initialHasMore={initialData.hasMore}
                initialStats={initialStats} 
            />
        </>
    )
}
