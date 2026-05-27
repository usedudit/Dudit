import { ERPPageHeader } from "@/components/erp/page-header-state"
import ServicesPage from "@/components/erp/servicos/ServicesPage"
import { getERPServicesPageAction } from "@/app/actions/erp/servicos"
import { FadeIn } from "@/components/animations/FadeIn"
import { AccessDenied } from "@/components/erp/access-denied"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { getPartnerProfile } from "@/app/actions/marketplace/partners"

export const dynamic = "force-dynamic"

export default async function ServicesPageServer() {
    const context = await getCurrentPartnerContext()
    if (!context) return <AccessDenied />
    const partnerId = context.partnerId

    const [page, partner] = await Promise.all([
        getERPServicesPageAction(partnerId, { cursor: null, limit: 100 }),
        getPartnerProfile(partnerId)
    ])
    if (!page.success) {
        throw new Error(page.error || "Erro ao carregar serviços.")
    }

    return (
        <>
            <ERPPageHeader title="Catálogo de Serviços" />
            <FadeIn className="p-4">
                <ServicesPage
                    services={page.items}
                    initialNextCursor={page.nextCursor}
                    initialHasMore={page.hasMore}
                    partnerId={partnerId}
                    partner={partner}
                />
            </FadeIn>
        </>
    )
}
