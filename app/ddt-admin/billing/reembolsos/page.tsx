import { AdminHeader } from "@/components/admin/admin-header"
import RefundsList from "@/components/admin/refunds/RefundsList"
import { adminListRefundRequestsAction } from "@/app/actions/billing/refunds"

export const dynamic = "force-dynamic"

export default async function AdminBillingRefundsPage() {
    const result = await adminListRefundRequestsAction({ status: "all", limit: 100 })

    const initialData = result.success ? (result.data || []) : []
    const initialStats = result.stats || { total: 0, pending: 0, approved: 0, rejected: 0 }
    const initialTotalCount = result.totalCount || 0

    return (
        <>
            <AdminHeader pageTitle="Solicitações de Reembolso" />
            <RefundsList
                initialData={initialData}
                initialStats={initialStats}
                initialTotalCount={initialTotalCount}
            />
        </>
    )
}
