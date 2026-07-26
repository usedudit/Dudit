import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { getCachedStoreBySlug } from "@/app/actions/marketplace/stores"
import { buildStoreCitySlug } from "@/app/actions/marketplace/stores-utils"
import { listStoreProducts } from "@/lib/store-products"
import { listStoreServices } from "@/lib/store-services"
import { MarketplaceFooter } from "@/components/marketplace/MarketplaceFooter"

export const revalidate = 60

type Props = {
    params: Promise<{ cidadeUf: string; slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { cidadeUf, slug } = await params
    const store = await getCachedStoreBySlug(slug)
    if (!store || !isStoreInCity(store, cidadeUf)) return { title: "Cardápio não encontrado | Dudit" }

    const storeName = store.name || "Loja"
    return {
        title: `Cardápio - ${storeName} | Dudit`,
        description: `Veja o cardápio completo de ${storeName} com produtos e serviços.`,
        alternates: {
            canonical: `https://dudit.com.br/${cidadeUf.toLowerCase()}/${slug.toLowerCase()}/cardapio`,
        },
        openGraph: {
            title: `Cardápio - ${storeName} | Dudit`,
            description: `Cardápio digital de ${storeName} com produtos e serviços.`,
            url: `https://dudit.com.br/${cidadeUf}/${slug}/cardapio`,
            type: "website",
        },
    }
}

function isStoreInCity(store: any, cidadeUf: string): boolean {
    const storeCitySlug = buildStoreCitySlug(store)
    if (!storeCitySlug) return true
    return storeCitySlug === cidadeUf.toLowerCase()
}

export default async function StoreMenuPage({ params }: Props) {
    const { cidadeUf, slug } = await params
    const store = await getCachedStoreBySlug(slug)
    if (!store || !isStoreInCity(store, cidadeUf)) return notFound()

    const [products, services] = await Promise.all([
        listStoreProducts(store.partner_id, store.id, { isActive: true, includeVariants: true }),
        listStoreServices(store.partner_id, store.id, { isActive: true }),
    ])

    const filteredProducts = (products || []).filter((p: any) => p.store_is_active !== false)
    const filteredServices = (services || []).filter((s: any) => s.store_is_active !== false)

    const storeName = store.name || "Loja"

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-4xl mx-auto px-4 py-8">
                <h1 className="text-2xl font-bold mb-2">{storeName}</h1>
                <p className="text-gray-500 mb-8">Cardápio digital</p>

                {filteredProducts.length > 0 && (
                    <section className="mb-10">
                        <h2 className="text-xl font-semibold mb-4">Produtos</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {filteredProducts.map((product: any) => (
                                <div key={product.id} className="bg-white rounded-lg p-4 shadow-sm border">
                                    <h3 className="font-medium">{product.name}</h3>
                                    <p className="text-lg font-bold text-green-600">
                                        R$ {Number(product.resolved_price || product.price).toFixed(2)}
                                    </p>
                                    {product.description && (
                                        <p className="text-sm text-gray-500 mt-1">{product.description}</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {filteredServices.length > 0 && (
                    <section className="mb-10">
                        <h2 className="text-xl font-semibold mb-4">Serviços</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {filteredServices.map((service: any) => (
                                <div key={service.id} className="bg-white rounded-lg p-4 shadow-sm border">
                                    <h3 className="font-medium">{service.name}</h3>
                                    <p className="text-lg font-bold text-green-600">
                                        R$ {Number(service.resolved_price || service.price).toFixed(2)}
                                    </p>
                                    {service.description && (
                                        <p className="text-sm text-gray-500 mt-1">{service.description}</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {filteredProducts.length === 0 && filteredServices.length === 0 && (
                    <p className="text-center text-gray-400 py-12">Nenhum produto ou serviço disponível no momento.</p>
                )}
            </div>
            <MarketplaceFooter />
        </div>
    )
}
