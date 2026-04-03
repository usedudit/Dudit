import { Suspense } from "react"
import { ERPPageHeader } from "@/components/erp/page-header-state"
import QuotesPage from "@/components/erp/quotes/QuotesPage"
import { getPartnerQuotesCached } from "@/lib/data/quotes"
import { checkPartnerPermission, getCurrentUser } from "@/lib/auth/authorization"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { AccessDenied } from "@/components/erp/access-denied"
import { FadeIn } from "@/components/animations/FadeIn"
import QuotesLoading from "./loading"

export const dynamic = "force-dynamic"

export default async function QuotesPageServer({ searchParams }: { searchParams: { page?: string } }) {
    const user = await getCurrentUser()
    if (!user) return <AccessDenied />

    // Layout already guarantees auth + valid context
    const context = await getCurrentPartnerContext()
    if (!context) return <AccessDenied />

    const partnerId = context.partnerId

    const { allowed } = await checkPartnerPermission(partnerId, "quotes", "view")
    if (!allowed) return <AccessDenied />

    const page = Number(searchParams?.page) || 1
    const limit = 50
    const offset = (page - 1) * limit

    const { data: quotes, total } = await getPartnerQuotesCached(partnerId, limit, offset)

    return (
        <>
            <ERPPageHeader title="Orçamentos" />
            <FadeIn className="p-4">
                <Suspense fallback={<QuotesLoading />}>
                    <QuotesPage
                        quotes={quotes || []}
                        totalQuotes={total}
                        currentPage={page}
                        limit={limit}
                        partnerId={partnerId}
                    />
                </Suspense>
            </FadeIn>
        </>
    )
}
