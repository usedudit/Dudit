import { ERPPageHeader } from "@/components/erp/page-header-state"
import { FadeIn } from "@/components/animations/FadeIn"
import { requireAdmin } from "@/lib/auth/admin-authorization"

export default async function AdminBillingPaymentsPage() {
    await requireAdmin("moderator")

    return (
        <>
            <ERPPageHeader title="Pagamentos" backHref="/ddt-admin/billing" />
            <FadeIn className="p-4">
                <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border overflow-hidden p-8">
                    <p className="text-brand-inactive-text">Módulo de pagamentos em construção.</p>
                </div>
            </FadeIn>
        </>
    )
}
