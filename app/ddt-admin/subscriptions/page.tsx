import { AdminHeader } from "@/components/admin/admin-header"
import SubscriptionList from "@/components/admin/SubscriptionList"
import { getSubscriptions, getAdminSubscriptionStats } from "@/app/actions/admin/subscriptions"

export const dynamic = "force-dynamic"

export default async function SubscriptionsPage() {
    const [initialData, initialStats] = await Promise.all([
        getSubscriptions(null, 50),
        getAdminSubscriptionStats(),
    ])

    return (
        <>
            <AdminHeader pageTitle="Assinaturas & Gateways" />
            <SubscriptionList initialData={initialData} initialStats={initialStats} />
        </>
    )
}

