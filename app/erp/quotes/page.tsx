import { ERPPageHeader } from "@/components/erp/page-header-state"
import QuotesPage from "@/components/erp/quotes/QuotesPage"
import { getPartnerQuotesCached } from "@/lib/data/quotes"
import { checkPartnerPermission } from "@/lib/auth/authorization"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { AccessDenied } from "@/components/erp/access-denied"
import { FadeIn } from "@/components/animations/FadeIn"

export const dynamic = "force-dynamic"

export default async function QuotesPageServer({ searchParams }: { searchParams: { page?: string } }) {
    // Layout already guarantees auth + valid context
    const context = await getCurrentPartnerContext()
    if (!context) return <AccessDenied />

    const partnerId = context.partnerId
    const page = Number(searchParams?.page) || 1
    const limit = 50
    const offset = (page - 1) * limit

    // Parallelize permission check and data fetch
    const [{ allowed }, { data: quotes, total }] = await Promise.all([
        checkPartnerPermission(partnerId, "quotes", "view"),
        getPartnerQuotesCached(partnerId, limit, offset),
    ])

    if (!allowed) return <AccessDenied />

    return (
        <>
            <ERPPageHeader title="Orçamentos" />
            <FadeIn className="p-4">
                <QuotesPage
                    quotes={quotes || []}
                    totalQuotes={total}
                    currentPage={page}
                    limit={limit}
                    partnerId={partnerId}
                />
            </FadeIn>
        </>
    )
}
