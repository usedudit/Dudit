import { ERPPageHeader } from "@/components/erp/page-header-state"
import ProductsPage from "@/components/erp/product/ProductsPage"
import { getERPProductsPageData } from "@/app/actions/erp/products"
import { FadeIn } from "@/components/animations/FadeIn"
import { getCurrentUser } from "@/lib/auth/authorization"
import { AccessDenied } from "@/components/erp/access-denied"

export const dynamic = "force-dynamic"

export default async function ProductsPageServer() {
    const user = await getCurrentUser()
    if (!user) return <AccessDenied />

    const data = await getERPProductsPageData()
    if (!data || !data.products) return <AccessDenied />
    const partnerId = data.partnerId

    return (
        <>
            <ERPPageHeader title="Produtos" />
            <FadeIn className="p-4">
                <ProductsPage
                    products={data.products}
                    partnerId={partnerId}
                    suppliers={[]}
                />
            </FadeIn>
        </>
    )
}

