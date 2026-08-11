import { ERPPageHeader } from "@/components/erp/page-header-state"
import QuotesPage from "@/components/erp/quotes/QuotesPage"
import { checkPermission } from "@/lib/permissions/access"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { AccessDenied } from "@/components/erp/access-denied"
import { FadeIn } from "@/components/animations/FadeIn"
import { getERPQuotesPageAction } from "@/app/actions/erp/quotes"

export const dynamic = "force-dynamic"

export default async function QuotesPageServer() {
    // Layout already guarantees auth + valid context
    const context = await getCurrentPartnerContext()
    if (!context) return <AccessDenied />

    const partnerId = context.partnerId
    const activeStoreId = context.activeStoreId || null

    // Parallelize permission check and data fetch
    const [{ allowed }, page] = await Promise.all([
        checkPermission(partnerId, "quotes", "view"),
        getERPQuotesPageAction(partnerId, { cursor: null, limit: 100, storeId: activeStoreId }),
    ])

    if (!allowed) return <AccessDenied />
    if (!page.success) {
        throw new Error(page.error || "Erro ao carregar orçamentos.")
    }

    return (
        <>
            <ERPPageHeader title="Orçamentos" />
            <FadeIn className="p-4">
                <QuotesPage
                    quotes={page.items || []}
                    initialNextCursor={page.nextCursor}
                    initialHasMore={page.hasMore}
                    partnerId={partnerId}
                    storeId={activeStoreId}
                />
            </FadeIn>
        </>
    )
}
