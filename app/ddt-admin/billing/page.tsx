import { ERPPageHeader } from "@/components/erp/page-header-state"
import { FadeIn } from "@/components/animations/FadeIn"
import { requireAdmin } from "@/lib/auth/admin-authorization"
import { BillingPage } from "@/components/billing/BillingPage"

export default async function AdminBillingPage() {
    await requireAdmin("moderator")

    return (
        <>
            <ERPPageHeader title="Faturamento" />
            <FadeIn className="p-4">
                <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border overflow-hidden">
                    <BillingPage showTitle={false} />
                </div>
            </FadeIn>
        </>
    )
}
