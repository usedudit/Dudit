import { hasBusinessCapability } from "@/lib/auth/authorization"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { AccessDenied } from "@/components/erp/access-denied"

export const dynamic = "force-dynamic"

export default async function ServicesLayout({ children }: { children: React.ReactNode }) {
    const context = await getCurrentPartnerContext()
    
    if (!context) {
        return <AccessDenied />
    }
    const hasAccess = await hasBusinessCapability(context.partnerId, "services")

    if (!hasAccess) {
        return <AccessDenied />
    }

    return <>{children}</>
}
