import { AdminHeader } from "@/components/admin/admin-header"
import AuditLogList from "@/components/admin/audit/AuditLogList"
import { getAuditLogs, getAuditLogStats } from "@/app/actions/admin/audit-logs"

export const dynamic = "force-dynamic"

export default async function AuditLogsPage() {
    const [initialData, initialStats] = await Promise.all([
        getAuditLogs(null, 10),
        getAuditLogStats(),
    ])

    return (
        <>
            <AdminHeader pageTitle="Logs de Auditoria" />
            <AuditLogList initialData={initialData} initialStats={initialStats} />
        </>
    )
}

