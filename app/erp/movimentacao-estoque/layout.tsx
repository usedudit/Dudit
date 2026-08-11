import { hasBusinessCapability, requireMinimumPlan } from "@/lib/auth/authorization"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { AccessDenied } from "@/components/erp/access-denied"

export const dynamic = "force-dynamic"

export default async function StockMovementsLayout({ children }: { children: React.ReactNode }) {
    const context = await getCurrentPartnerContext()
    
    if (!context) {
        return <AccessDenied />
    }
    if (context.businessInfo?.mode === "quick") return <AccessDenied />
    const hasAccess = await hasBusinessCapability(context.partnerId, "products")

    if (!hasAccess) {
        return <AccessDenied />
    }

    try {
        await requireMinimumPlan(context.partnerId, "crescer")
    } catch {
        return <AccessDenied />
    }

    return <>{children}</>
}
