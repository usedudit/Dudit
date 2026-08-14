import type { Metadata } from "next"
import { getCachedStoreProducts, getCachedStoreServices, getCachedStoreReviews, getCachedStoreStats } from "@/app/actions/marketplace/stores"
import { normalizeBusinessInfo } from "@/lib/business-info"
import { MarketplaceFooter } from "@/components/marketplace/MarketplaceFooter"
import { VendorPageClient } from "@/components/marketplace/VendorPage"

export async function StorePage({ storeData }: { storeData: any }) {
    const partner = storeData.partners
    const storeId = storeData.id
    const partnerId = storeData.partner_id

    const [products, services, reviews, stats] = await Promise.all([
        getCachedStoreProducts(storeId, partnerId),
        getCachedStoreServices(storeId, partnerId),
        getCachedStoreReviews(storeId),
        getCachedStoreStats(storeId),
    ])

    const filteredProducts = (products || []).filter((p: any) => p.store_is_active !== false)
    const filteredServices = (services || []).filter((s: any) => s.store_is_active !== false)

    normalizeBusinessInfo(partner?.business_info)

    const productCategories = Array.from(new Set(filteredProducts.map((p: any) => p.category).filter(Boolean))) as string[]
    const serviceCategories = Array.from(new Set(filteredServices.map((s: any) => s.category).filter(Boolean))) as string[]

    const address = storeData.addresses?.[0]

    const yearsOnPlatform = partner?.created_at
        ? new Date().getFullYear() - new Date(partner.created_at).getFullYear() || 1
        : 1

    const partnerData = {
        id: storeData.id,
        storeName: storeData.name || "Loja",
        storeDescription: storeData.description || "",
        storeImageUrl: storeData.logo_url || null,
        profile_image_url: null,
        city: address?.city || storeData.city || "",
        state: address?.state || storeData.state || "",
        street: address?.street || "",
        number: address?.number || "",
        neighborhood: address?.neighborhood || "",
        zipCode: address?.zip_code || "",
        rating: Number(storeData.rating ?? 0),
        createdAt: storeData.created_at || partner?.created_at,
        offeringType: (() => { const sells = (storeData.business_info as any)?.sells || ['products']; return sells.includes('products') && sells.includes('services') ? 'both' : sells.includes('services') ? 'services' : 'products' })(),
        openingHours: storeData.opening_hours || null,
        phone: storeData.phone || storeData.whatsapp_phone || "",
        lat: address?.latitude || null,
        lng: address?.longitude || null,
        businessInfo: storeData.business_info || null,
        paymentMethods: storeData.payment_methods?.length ? storeData.payment_methods : [],
        banner_url: storeData.banner_url || null,
        gallery: storeData.gallery || [],
        planSlug: "free",
        isShowcaseActive: storeData.is_showcase_active ?? true,
    }

    const storeStats = {
        salesCount: Number(storeData.vendas_totais ?? 0),
        reviewsCount: stats?.reviewsCount || 0,
        yearsOnPlatform,
        itemsCount: (filteredProducts?.length || 0) + (filteredServices?.length || 0),
    }

    const ratingDistribution = [5, 4, 3, 2, 1].map(star => ({
        star,
        count: reviews?.filter((r: any) => Math.round(r.rating) === star).length || 0,
    }))

    return (
        <div className="min-h-screen bg-white w-full max-w-[100vw] overflow-x-hidden flex flex-col">
            <main className="lg:pt-[120px] flex-grow">
                <VendorPageClient
                    partner={partnerData}
                    products={filteredProducts}
                    services={filteredServices}
                    reviews={reviews || []}
                    stats={storeStats}
                    ratingDistribution={ratingDistribution}
                    productCategories={productCategories}
                    serviceCategories={serviceCategories}
                />
            </main>
            <MarketplaceFooter />
        </div>
    )
}

export async function generateStoreMetadata(store: any, cidadeUf?: string): Promise<Metadata> {
    const partner = store.partners
    const storeName = store.name || "Loja"
    const storeDescription = store.description || partner?.store_description || ""
    const city = store.city || store.addresses?.[0]?.city || ""
    const state = store.state || store.addresses?.[0]?.state || ""
    const baseUrl = `https://dudit.com.br`
    const path = cidadeUf ? `/${cidadeUf}/${store.slug}` : `/${store.slug}`

    return {
        title: `${storeName} | Dudit`,
        description: storeDescription || `Conheça ${storeName} na Dudit. Veja produtos, serviços e avaliações.`,
        alternates: {
            canonical: `${baseUrl}${path}`,
        },
        openGraph: {
            title: `${storeName}${city ? ` - ${city}` : ""} | Dudit`,
            description: storeDescription || `Conheça ${storeName} na Dudit.`,
            url: `${baseUrl}${path}`,
            type: "website",
            ...(store.logo_url || partner?.store_image_url
                ? { images: [{ url: store.logo_url || partner?.store_image_url }] }
                : {}),
        },
    }
}
