import type { Metadata } from "next"
import { getCachedStoreProducts, getCachedStoreServices, getCachedStoreReviews, getCachedStoreStats } from "@/app/actions/marketplace/stores"
import { listActivePromotionsForMarketplaceAction } from "@/app/actions/shared/promotions"
import { normalizeBusinessInfo } from "@/lib/business-info"
import { MarketplaceFooter } from "@/components/marketplace/MarketplaceFooter"
import { VendorPageClient } from "@/components/marketplace/VendorPage"
import { getCurrentUser } from "@/lib/auth/authorization"
import { getUserSessionData } from "@/lib/data/user"
import { getStoreUrl } from "@/lib/utils/url-generator"

export async function StorePage({ storeData }: { storeData: any }) {
    const partner = storeData.partners
    const storeId = storeData.id
    const partnerId = storeData.partner_id

    const user = await getCurrentUser()
    const sessionData = user ? await getUserSessionData(user.id) : null
    const userProfile = sessionData?.profile ? { 
        userId: user?.id,
        user_id: user?.id,
        full_name: sessionData.profile.full_name, 
        address: sessionData.profile.city ? `${sessionData.profile.city} - ${sessionData.profile.state}` : null, 
        avatar_url: sessionData.profile.avatar_url || null, 
        latitude: sessionData.profile.latitude, 
        longitude: sessionData.profile.longitude 
    } : null
    const cartCount = sessionData?.cartCount || 0

    const [products, services, reviews, stats, activePromotions] = await Promise.all([
        getCachedStoreProducts(storeId, partnerId),
        getCachedStoreServices(storeId, partnerId),
        getCachedStoreReviews(storeId),
        getCachedStoreStats(storeId),
        listActivePromotionsForMarketplaceAction(partnerId, null, storeId).catch(() => []),
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
        partner_id: storeData.partner_id,
        partnerId: storeData.partner_id,
        user_id: partner?.user_id || storeData.user_id,
        userId: partner?.user_id || storeData.user_id,
        storeName: storeData.name || "Loja",
        storeDescription: storeData.description || "",
        storeImageUrl: storeData.logo_url || null,
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
        paymentMethods: storeData.partners?.payment_methods?.length ? storeData.partners.payment_methods : storeData.payment_methods?.length ? storeData.payment_methods : [],
        banner_url: storeData.banner_url || null,
        gallery: storeData.gallery || [],
        planSlug: "free",
        isShowcaseActive: storeData.is_showcase_active ?? partner?.is_showcase_active ?? true,
        acceptOrdersWhenClosed: storeData.accept_orders_when_closed ?? partner?.accept_orders_when_closed ?? true,
        timezone: storeData.timezone || "America/Sao_Paulo",
        delivery_settings: (Array.isArray(storeData.delivery_settings) ? storeData.delivery_settings[0] : storeData.delivery_settings) || null,
        mp_user_id: partner?.mp_user_id || null,
        mp_accepted_payment_methods: partner?.mp_accepted_payment_methods || null,
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
        <div className="min-h-screen bg-white dark:bg-dark-surface w-full max-w-[100vw] overflow-x-hidden flex flex-col">
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
                    initialPromotions={activePromotions || []}
                    isShowcaseActive={partnerData.isShowcaseActive}
                    userProfile={userProfile}
                    cartCount={cartCount}
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
    const standardStoreUrl = getStoreUrl(store)
    const canonicalUrl = standardStoreUrl && standardStoreUrl !== "/"
        ? `${baseUrl}${standardStoreUrl}`
        : `${baseUrl}${cidadeUf ? `/${cidadeUf}/${store.slug}` : `/${store.slug}`}`

    return {
        title: `${storeName} | Dudit`,
        description: storeDescription || `Conheça ${storeName} na Dudit. Veja produtos, serviços e avaliações.`,
        alternates: {
            canonical: canonicalUrl,
        },
        openGraph: {
            title: `${storeName}${city ? ` - ${city}` : ""} | Dudit`,
            description: storeDescription || `Conheça ${storeName} na Dudit.`,
            url: canonicalUrl,
            type: "website",
            ...(store.logo_url || partner?.store_image_url
                ? { images: [{ url: store.logo_url || partner?.store_image_url }] }
                : {}),
        },
    }
}
