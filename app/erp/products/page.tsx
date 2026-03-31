import { Suspense } from "react"
import { ERPHeader } from "@/components/erp/erp-header"
import ProductsPage from "@/components/erp/product/ProductsPage"
import { getERPProductsPageData } from "@/app/actions/erp/products"
import { FadeIn } from "@/components/animations/FadeIn"
import { getCurrentUser } from "@/lib/auth/authorization"
import { AccessDenied } from "@/components/erp/access-denied"
import ProductsLoading from "./loading"

export const dynamic = "force-dynamic"

export default async function ProductsPageServer() {
    const user = await getCurrentUser()
    if (!user) return <AccessDenied />

    const data = await getERPProductsPageData()
    if (!data) return <AccessDenied />

    const partnerId = data.partnerId

    const userProfile = {
        fullName: user.email?.split("@")[0] || "Usuário",
        email: user.email || "",
        initials: (user.email?.[0] || "U").toUpperCase(),
        avatarColor: "bg-brand-primary"
    }

    return (
        <>
            <ERPHeader
                pageTitle="Produtos"
                userProfile={userProfile}
            />
            <FadeIn className="p-4">
                <Suspense fallback={<ProductsLoading />}>
                    <ProductsPage
                        products={data.products}
                        partnerId={partnerId}
                        suppliers={[]}
                    />
                </Suspense>
            </FadeIn>
        </>
    )
}

