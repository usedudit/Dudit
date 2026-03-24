import { AdminHeader } from "@/components/admin/admin-header"
import ReportsList from "@/components/admin/ReportsList"
import { getReports } from "@/app/actions/admin/reports"

export default async function ReportsPage() {
    const initialData = await getReports(null, 20)

    return (
        <>
            <AdminHeader pageTitle="Denúncias" />
            <ReportsList initialData={initialData} />
        </>
    )
}
