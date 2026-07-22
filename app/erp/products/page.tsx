import { ERPPageHeader } from "@/components/erp/page-header-state"
import ProductsPage from "@/components/erp/product/ProductsPage"
import { getERPProductsPageAction } from "@/app/actions/erp/products"
import { FadeIn } from "@/components/animations/FadeIn"
import { AccessDenied } from "@/components/erp/access-denied"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { getPartnerProfile } from "@/app/actions/marketplace/partners"

export const dynamic = "force-dynamic"

export default async function ProductsPageServer() {
    const context = await getCurrentPartnerContext()
    if (!context) return <AccessDenied />
    const partnerId = context.partnerId
    const activeStoreId = context.activeStoreId || null

    const [page, partner] = await Promise.all([
        getERPProductsPageAction(partnerId, { cursor: null, limit: 100, storeId: activeStoreId || undefined }),
        getPartnerProfile(partnerId)
    ])
    if (!page.success) {
        throw new Error(page.error || "Erro ao carregar produtos.")
    }

    return (
        <>
            <ERPPageHeader title="Produtos" />
            <FadeIn className="p-4">
                <ProductsPage
                    products={page.items}
                    initialNextCursor={page.nextCursor}
                    initialHasMore={page.hasMore}
                    partnerId={partnerId}
                    partner={partner}
                    suppliers={[]}
                />
            </FadeIn>
        </>
    )
}

