import { hasBusinessCapability } from "@/lib/auth/authorization"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { AccessDenied } from "@/components/erp/access-denied"

export default async function SuppliersLayout({ children }: { children: React.ReactNode }) {
    const context = (await getCurrentPartnerContext())!
    const hasAccess = await hasBusinessCapability(context.partnerId, "products")

    if (!hasAccess) {
        return <AccessDenied />
    }

    return <>{children}</>
}
