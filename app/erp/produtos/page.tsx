import { ERPPageHeader } from "@/components/erp/page-header-state"
import ProductsPage from "@/components/erp/product/ProductsPage"
import { getERPProductsPageAction } from "@/app/actions/erp/products"
import { FadeIn } from "@/components/animations/FadeIn"
import { AccessDenied } from "@/components/erp/access-denied"
import { getErpRequestContext } from "@/lib/auth/erp-context"

export const dynamic = "force-dynamic"

export default async function ProductsPageServer() {
    const context = await getErpRequestContext()
    if (!context) return <AccessDenied />
    const partnerId = context.partnerId
    const activeStoreId = context.activeStoreId || null

    const page = await getERPProductsPageAction(partnerId, { cursor: null, limit: 100, storeId: activeStoreId || undefined, filters: { includeArchived: true } })
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
                    suppliers={[]}
                />
            </FadeIn>
        </>
    )
}

