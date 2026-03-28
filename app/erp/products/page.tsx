import { Suspense } from "react"
import { ERPHeader } from "@/components/erp/erp-header"
import ProductsPage from "@/components/erp/product/products-page-content"
import { getERPProductsPageData } from "@/app/actions/erp/products"
import { FadeIn } from "@/components/animations/FadeIn"
import { getCurrentUser } from "@/lib/auth/authorization"
import { AccessDenied } from "@/components/erp/access-denied"

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
                <Suspense fallback={<div className='p-4'>Carregando produtos...</div>}>
                    <ProductsPage
                        products={data.products}
                        totalCount={data.totalCount}
                        partnerId={partnerId}
                        suppliers={[]}
                    />
                </Suspense>
            </FadeIn>
        </>
    )
}

