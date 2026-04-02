import { Suspense } from "react"
import { ERPHeader } from "@/components/erp/erp-header"
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

    const userProfile = {
        fullName: user.email?.split("@")[0] || "Usuário",
        email: user.email || "",
        initials: (user.email?.[0] || "U").toUpperCase(),
        avatarColor: "bg-brand-primary"
    }

    return (
        <>
            <ERPHeader
                pageTitle="Orçamentos"
                userProfile={userProfile}
            />
            <FadeIn className="p-4">
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
