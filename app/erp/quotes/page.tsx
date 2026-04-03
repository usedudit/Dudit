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

export default async function QuotesPageServer() {
    const user = await getCurrentUser()
    if (!user) return <AccessDenied />

    // Layout already guarantees auth + valid context
    const context = await getCurrentPartnerContext()
    if (!context) return <AccessDenied />

    const partnerId = context.partnerId

    const { allowed } = await checkPartnerPermission(partnerId, "quotes", "view")
    if (!allowed) return <AccessDenied />

    const quotes = await getPartnerQuotesCached(partnerId)

    return (
        <>
            <ERPPageHeader title="Orçamentos" />
            <FadeIn>
                <Suspense fallback={<QuotesLoading />}>
                    <QuotesPage
                        quotes={quotes || []}
                        partnerId={partnerId}
                    />
                </Suspense>
            </FadeIn>
        </>
    )
}
