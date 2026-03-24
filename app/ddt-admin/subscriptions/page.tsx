import { AdminHeader } from "@/components/admin/admin-header"
import SubscriptionList from "@/components/admin/SubscriptionList"

export default function SubscriptionsPage() {
    return (
        <>
            <AdminHeader pageTitle="Gerenciar Assinaturas" />
            <SubscriptionList />
        </>
    )
}
