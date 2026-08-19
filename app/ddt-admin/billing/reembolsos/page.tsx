import { AdminHeader } from "@/components/admin/admin-header"
import { AdminRefundsPage } from "@/components/admin/AdminRefundsPage"

export const dynamic = "force-dynamic"

export default function AdminBillingRefundsPage() {
    return (
        <>
            <AdminHeader pageTitle="Solicitações de Reembolso" />
            <AdminRefundsPage />
        </>
    )
}
