import { notFound, redirect } from "next/navigation"
import type { Metadata } from 'next'
import { VendorPageClient } from "@/components/marketplace/VendorPage"
import { MarketplaceFooter } from "@/components/marketplace/MarketplaceFooter"
import { getStoreUrl } from "@/lib/utils/url-generator"
import { getCurrentUser } from "@/lib/auth/authorization"
import { safeJsonLdStringify } from "@/lib/utils/safe-json-ld"
import { getUserSessionData } from "@/lib/data/user"
import { normalizeBusinessInfo } from "@/lib/business-info"
import {
  getCachedStoreById,
  getCachedStoreProducts,
  getCachedStoreServices,
  getCachedStoreReviews,
  getCachedStoreStats,
} from "@/app/actions/marketplace/stores"
import { getPartnerPlan } from "@/lib/services/subscription.service"
import { listMarketplaceRecurringPlansAction } from "@/app/actions/marketplace/recurring-subscriptions"

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ slug: string; cidadeUf: string; id: string }> }): Promise<Metadata> {
  const { id } = await params
  const store = await getCachedStoreById(id)

  if (!store) {
    return {
      title: 'Negócio não encontrado'
    }
  }

  const storeName = store.name || 'Negócio Parceiro'
  const storeDescription = store.description || `Conheça ${storeName} na Dudit.`
  const canonicalUrl = `https://dudit.com.br${getStoreUrl(store)}`

  return {
    title: `${storeName}`,
    description: storeDescription,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: `${storeName}`,
      description: storeDescription,
      url: canonicalUrl,
      images: [
        {
          url: store.logo_url || 'https://img.dudit.com.br/static/Logo.png',
          width: 800,
          height: 600,
          alt: `Capa de ${storeName}`,
        },
      ],
      type: 'website',
    }
  }
}

export default async function VendorPage({ params }: { params: Promise<{ slug: string; cidadeUf: string; id: string }> }) {
  const { id, slug: currentSlug, cidadeUf: currentCidadeUf } = await params

  const store = await getCachedStoreById(id)

  if (!store) {
    console.error("[VendorPage] Store not found:", { id, currentSlug, currentCidadeUf })
    return notFound()
  }

  const partner = store.partners
  const storeId = store.id
  const partnerId = store.partner_id

  const canonicalUrl = getStoreUrl(store)
  const currentPath = `/${currentCidadeUf}/${currentSlug}/v/${id}`

  if (currentPath !== canonicalUrl) {
    redirect(canonicalUrl)
  }

  const [user, products, services, reviews, statsBase, plan, plansRes] = await Promise.all([
    getCurrentUser(),
    getCachedStoreProducts(storeId, partnerId),
    getCachedStoreServices(storeId, partnerId),
    getCachedStoreReviews(storeId),
    getCachedStoreStats(storeId),
    getPartnerPlan(partnerId),
    listMarketplaceRecurringPlansAction(partnerId),
  ])
  const sessionData = user ? await getUserSessionData(user.id) : null

  const userProfile = sessionData?.profile ? { full_name: sessionData.profile.full_name, address: sessionData.profile.city ? `${sessionData.profile.city} - ${sessionData.profile.state}` : null, avatar_url: sessionData.profile.avatar_url || null } : null
  const cartCount = sessionData?.cartCount || 0

  const filteredProducts = (products || []).filter((p: any) => p.store_is_active !== false)
  const filteredServices = (services || []).filter((s: any) => s.store_is_active !== false)

  const plans = plansRes.success ? (plansRes.data || []) : []
  const normalizedPlans = plans.map((item: any) => {
    let computedPrice = 0
    let firstImage: string | null = null
    if (item.items && Array.isArray(item.items)) {
      for (const planItem of item.items) {
        const qty = Number(planItem.quantity || 1)
        let itemPrice = Number(planItem.unit_price || 0)
        if (itemPrice <= 0) {
          if (planItem.item_type === 'product' && planItem.products) {
            itemPrice = Number(planItem.products.price || 0)
          } else if (planItem.item_type === 'service' && planItem.services) {
            itemPrice = Number(planItem.services.price || 0)
          }
        }
        computedPrice += qty * itemPrice
        if (!firstImage && planItem.item_type === 'product' && planItem.products?.images) {
          const imgs = planItem.products.images
          if (Array.isArray(imgs) && imgs.length > 0) {
            firstImage = imgs[0]
          }
        }
      }
    }
    const image = firstImage || store.logo_url || "https://img.dudit.com.br/static/Placeholder.png"
    return {
      id: item.id,
      name: item.name,
      description: item.description,
      price: computedPrice,
      images: [image],
      itemType: 'plano',
      partners: partner,
      frequency_type: item.frequency_type,
      frequency_interval: item.frequency_interval,
      created_at: item.created_at,
    }
  })

  normalizeBusinessInfo(store.business_info || partner?.business_info || { sells: ["products"] })

  const productCategories = Array.from(new Set(filteredProducts?.map((p: any) => p.category).filter(Boolean))) as string[]
  const serviceCategories = Array.from(new Set(filteredServices?.map((s: any) => s.category).filter(Boolean))) as string[]

  const createdDate = new Date(store.created_at || partner?.created_at)
  const yearsOnPlatform = new Date().getFullYear() - createdDate.getFullYear() || 1

  const stats = {
    salesCount: Number(store.vendas_totais ?? 0),
    reviewsCount: statsBase?.reviewsCount || 0,
    yearsOnPlatform,
    itemsCount: (filteredProducts?.length || 0) + (filteredServices?.length || 0),
  }

  const ratingDistribution = [5, 4, 3, 2, 1].map(star => ({
    star,
    count: reviews?.filter((r: any) => Math.round(r.rating) === star).length || 0,
  }))

  const address = store.addresses?.[0]
  const storeCity = address?.city || store.city || ""
  const storeState = address?.state || store.state || ""
  const storeRating = Number(store.rating ?? 0)

  const schemaJsonLd = {
    '@context': 'https://schema.org',
    '@type': ['Store', 'LocalBusiness', 'Organization'],
    name: store.name,
    image: store.logo_url || 'https://img.dudit.com.br/static/Logo.png',
    description: store.description || '',
    address: {
      '@type': 'PostalAddress',
      streetAddress: address?.street || '',
      addressLocality: address?.city || '',
      addressRegion: address?.state || '',
      postalCode: address?.zip_code || '',
      addressCountry: 'BR',
    },
    telephone: store.phone || store.whatsapp_phone || '',
    aggregateRating: storeRating > 0 ? {
      '@type': 'AggregateRating',
      ratingValue: storeRating.toFixed(1),
      reviewCount: statsBase?.reviewsCount || 1,
    } : undefined,
    makesOffer: [
      ...(filteredProducts || []).slice(0, 3).map((p: any) => ({
        '@type': 'Offer',
        price: p.price,
        priceCurrency: 'BRL',
        availability: 'https://schema.org/InStock',
        itemOffered: {
          '@type': 'Product',
          name: p.name,
          offers: {
            '@type': 'Offer',
            price: p.price,
            priceCurrency: 'BRL',
            availability: 'https://schema.org/InStock',
          },
        },
      })),
      ...(filteredServices || []).slice(0, 3).map((s: any) => ({
        '@type': 'Offer',
        price: s.price,
        priceCurrency: 'BRL',
        availability: 'https://schema.org/InStock',
        itemOffered: {
          '@type': 'Service',
          name: s.name,
          offers: {
            '@type': 'Offer',
            price: s.price,
            priceCurrency: 'BRL',
            availability: 'https://schema.org/InStock',
          },
        },
      })),
    ],
  }

  const partnerData = {
    id: store.id,
    partner_id: store.partner_id,
    partnerId: store.partner_id,
    user_id: partner?.user_id || store.user_id,
    userId: partner?.user_id || store.user_id,
    short_id: store.short_id,
    slug: store.slug,
    name: store.name || "Loja",
    storeName: store.name || "Loja",
    storeDescription: store.description || "",
    storeImageUrl: store.logo_url || null,
    profile_image_url: null,
    city: address?.city || store.city || "",
    state: address?.state || store.state || "",
    street: address?.street || "",
    number: address?.number || "",
    neighborhood: address?.neighborhood || "",
    zipCode: address?.zip_code || "",
    rating: storeRating,
    createdAt: store.created_at || partner?.created_at,
    offeringType: (() => { const sells = (store.business_info as any)?.sells || ['products']; return sells.includes('products') && sells.includes('services') ? 'both' : sells.includes('services') ? 'services' : 'products' })(),
    openingHours: store.opening_hours || null,
    phone: store.phone || store.whatsapp_phone || "",
    lat: address?.latitude || null,
    lng: address?.longitude || null,
    businessInfo: store.business_info || null,
    paymentMethods: store.payment_methods?.length ? store.payment_methods : [],
    banner_url: store.banner_url || null,
    gallery: store.gallery || [],
    planSlug: plan?.slug || 'free',
    isShowcaseActive: store.is_showcase_active ?? true,
  }

  return (
    <div className="min-h-screen bg-white dark:bg-dark-surface w-full max-w-[100vw] overflow-x-hidden flex flex-col">
      <script type="application/ld+json" dangerouslySetInnerHTML={{
        __html: safeJsonLdStringify({
          '@context': 'https://schema.org', '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://dudit.com.br' },
            { '@type': 'ListItem', position: 2, name: `${storeCity} - ${storeState}`, item: `https://dudit.com.br/explorar/${currentCidadeUf}` },
            { '@type': 'ListItem', position: 3, name: store.name, item: `https://dudit.com.br${canonicalUrl}` },
          ],
        })
      }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(schemaJsonLd) }} />
      <main className="lg:pt-[120px] flex-grow">
        <VendorPageClient
          partner={partnerData}
          products={filteredProducts || []}
          services={filteredServices || []}
          plans={normalizedPlans}
          reviews={reviews || []}
          stats={stats}
          ratingDistribution={ratingDistribution}
          productCategories={productCategories}
          serviceCategories={serviceCategories}
          userProfile={userProfile}
          cartCount={cartCount}
        />
      </main>
      <MarketplaceFooter />
    </div>
  )
}