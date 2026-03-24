import { AdminHeader } from "@/components/admin/admin-header"
import AuditLogList from "@/components/admin/AuditLogList"
import { getAuditLogs } from "@/app/actions/admin/audit-logs"

export default async function AuditLogsPage() {
    const initialData = await getAuditLogs(null, 20)

    return (
        <>
            <AdminHeader pageTitle="Audit Logs" />
            <AuditLogList initialData={initialData} />
        </>
    )
}
