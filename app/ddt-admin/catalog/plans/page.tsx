import { AdminHeader } from "@/components/admin/admin-header"
import PlansList from "@/components/admin/catalog/PlansList"

export const dynamic = "force-dynamic"

export default async function AdminPlansPage() {
    return (
        <>
            <AdminHeader pageTitle="Planos Recorrentes" />
            <PlansList initialItems={[]} initialNextCursor={null} initialHasMore={false} />
        </>
    )
}
