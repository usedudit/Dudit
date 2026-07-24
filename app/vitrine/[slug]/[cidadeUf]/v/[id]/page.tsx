import { notFound, redirect } from "next/navigation"
import type { Metadata } from 'next'
import { VendorPageClient } from "@/components/marketplace/VendorPage"
import { MarketplaceFooter } from "@/components/marketplace/MarketplaceFooter"
import { getCurrentUser } from "@/lib/auth/authorization"
import { getUserSessionData } from "@/lib/data/user"
import { normalizeBusinessInfo } from "@/lib/business-info"

import {
  getCachedStoreById,
  getCachedStoreProducts as getStoreProducts,
  getCachedStoreServices as getStoreServices,
  getCachedStoreReviews as getStoreReviews,
  getCachedStoreStats as getStoreStats,
} from "@/app/actions/marketplace/stores"
import { getPartnerPlan } from "@/lib/services/subscription.service"
import { listMarketplaceRecurringPlansAction } from "@/app/actions/marketplace/recurring-subscriptions"

export async function generateMetadata({ params }: { params: Promise<{ slug: string; cidadeUf: string; id: string }> }): Promise<Metadata> {
  const { id } = await params
  const store = await getCachedStoreById(id)

  if (!store) {
    return { title: 'Loja não encontrada | Dudit' }
  }

  const sname = store.name || store.partners?.store_name || 'Loja Parceira'
  const sdesc = store.description || store.partners?.store_description || `Conheça a loja ${sname} na Dudit, sua conexão direta e sem taxas.`
  const addr = store.addresses
  const city = addr?.city || store.city || "Brasil"
  const state = addr?.state || store.state || "BR"
  const logo = store.logo_url || store.image_url || store.partners?.store_image_url || 'https://img.dudit.com.br/static/Logo.png'
  const url = `https://dudit.com.br/vitrine/${store.slug || createSlug(sname)}/${createSlug(city)}-${createSlug(state)}/v/${store.id}`

  return {
    title: `${sname} em ${city} - ${state}`,
    description: sdesc,
    alternates: { canonical: url },
    openGraph: {
      title: `${sname} | Dudit`,
      description: sdesc,
      url,
      images: [{ url: logo, width: 800, height: 600, alt: `Capa da loja ${sname}` }],
      type: 'website',
    }
  }
}

import { createSlug } from "@/lib/utils/slugify"

export default async function VendorPage({ params }: { params: Promise<{ slug: string; cidadeUf: string; id: string }> }) {
  const { id: storeId, slug: currentSlug, cidadeUf: currentCidadeUf } = await params

  const store = await getCachedStoreById(storeId)

  if (!store) {
    return notFound()
  }

  const partnerId = store.partner_id
  const p = store.partners

  const [user, products, services, reviews, statsBase, plan, plansRes] = await Promise.all([
    getCurrentUser(),
    getStoreProducts(storeId, partnerId),
    getStoreServices(storeId, partnerId),
    getStoreReviews(storeId),
    getStoreStats(storeId),
    getPartnerPlan(partnerId),
    listMarketplaceRecurringPlansAction(partnerId),
  ])
  const sessionData = user ? await getUserSessionData(user.id) : null

  const userProfile = sessionData?.profile ? { full_name: sessionData.profile.full_name, address: sessionData.profile.city ? `${sessionData.profile.city} - ${sessionData.profile.state}` : null } : null
  const cartCount = sessionData?.cartCount || 0

  const plans = plansRes.success ? (plansRes.data || []) : []
  const normalizedPlans = plans.map((item: any) => {
    let computedPrice = 0
    let firstImage: string | null = null
    if (item.items && Array.isArray(item.items)) {
      for (const planItem of item.items) {
        const qty = Number(planItem.quantity || 1)
        let itemPrice = Number(planItem.unit_price || 0)
        if (itemPrice <= 0) {
          if (planItem.item_type === 'product' && planItem.products) itemPrice = Number(planItem.products.price || 0)
          else if (planItem.item_type === 'service' && planItem.services) itemPrice = Number(planItem.services.price || 0)
        }
        computedPrice += qty * itemPrice
        if (!firstImage && planItem.item_type === 'product' && planItem.products?.images) {
          const imgs = planItem.products.images
          if (Array.isArray(imgs) && imgs.length > 0) firstImage = imgs[0]
        }
      }
    }
    const logo = store.logo_url || store.image_url || p?.store_image_url || "https://img.dudit.com.br/static/Placeholder.png"
    const image = firstImage || logo
    return { id: item.id, name: item.name, description: item.description, price: computedPrice, images: [image], itemType: 'plano', partners: p, frequency_type: item.frequency_type, frequency_interval: item.frequency_interval, created_at: item.created_at }
  })

  normalizeBusinessInfo(store.business_info || p?.business_info)

  const productCategories = Array.from(new Set(products?.map((p: any) => p.category).filter(Boolean))) as string[]
  const serviceCategories = Array.from(new Set(services?.map((s: any) => s.category).filter(Boolean))) as string[]

  const storeSlug = store.slug || createSlug(store.name || p?.store_name || "")
  const addr = store.addresses
  const storeCity = addr?.city || store.city || "Brasil"
  const storeState = addr?.state || store.state || "BR"
  const cidadeUfSlug = `${createSlug(storeCity)}-${createSlug(storeState)}`
  const correctUrl = `/vitrine/${storeSlug}/${cidadeUfSlug}/v/${storeId}`
  const currentPath = `/vitrine/${currentSlug}/${currentCidadeUf}/v/${storeId}`

  const isCurrentlyDetailed = currentCidadeUf !== 'vitrine' && currentCidadeUf !== 'brasil'
  const isNewOneGeneric = correctUrl.includes('/vitrine/v/') || correctUrl.includes('/brasil/v/')
  if (currentPath !== correctUrl && !(isCurrentlyDetailed && isNewOneGeneric)) {
    redirect(correctUrl)
  }

  const createdDate = new Date(store.created_at || p?.created_at)
  const yearsOnPlatform = new Date().getFullYear() - createdDate.getFullYear() || 1

  const stats = {
    salesCount: Number(store.vendas_totais ?? p?.vendas_totais ?? statsBase?.salesCount ?? 0),
    reviewsCount: statsBase?.reviewsCount || 0,
    yearsOnPlatform,
    itemsCount: (products?.length || 0) + (services?.length || 0),
  }

  const ratingDistribution = [5, 4, 3, 2, 1].map(star => ({
    star,
    count: reviews?.filter((r: any) => Math.round(r.rating) === star).length || 0
  }))

  const canonicalUrl = `https://dudit.com.br${correctUrl}`

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://dudit.com.br' },
      { '@type': 'ListItem', position: 2, name: `${storeCity} - ${storeState}`, item: `https://dudit.com.br/explorar/${cidadeUfSlug}` },
      { '@type': 'ListItem', position: 3, name: store.name || p?.store_name || "", item: canonicalUrl },
    ],
  }

  const sname = store.name || p?.store_name || ""
  const sdesc = store.description || p?.store_description || ""
  const logo = store.logo_url || store.image_url || p?.store_image_url || 'https://img.dudit.com.br/static/Logo.png'
  const banner = store.banner_url || p?.banner_url || ""
  const storeRating = Number(store.rating ?? p?.rating ?? 0)

  const schemaJsonLd = {
    '@context': 'https://schema.org',
    '@type': ['Store', 'LocalBusiness', 'Organization'],
    name: sname,
    image: logo,
    description: sdesc,
    address: {
      '@type': 'PostalAddress',
      streetAddress: addr?.street || '',
      addressLocality: storeCity,
      addressRegion: storeState,
      postalCode: addr?.zip_code || '',
      addressCountry: 'BR',
    },
    telephone: store.phone || store.whatsapp_phone || p?.phone || '',
    aggregateRating: storeRating > 0 ? {
      '@type': 'AggregateRating',
      ratingValue: storeRating.toFixed(1),
      reviewCount: statsBase?.reviewsCount || 1,
    } : undefined,
    makesOffer: [
      ...(products || []).slice(0, 3).map((p: any) => ({
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
      ...(services || []).slice(0, 3).map((s: any) => ({
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
    ]
  };

  const partnerData = {
    id: store.id,
    storeName: store.name || p?.store_name || "",
    storeDescription: store.description || p?.store_description || "",
    storeImageUrl: logo,
    profile_image_url: null,
    city: storeCity,
    state: storeState,
    street: addr?.street || "",
    number: addr?.number || "",
    neighborhood: addr?.neighborhood || "",
    zipCode: addr?.zip_code || "",
    rating: storeRating,
    createdAt: store.created_at || p?.created_at,
    offeringType: (() => { const sells = (store.business_info as any)?.sells || (p?.business_info as any)?.sells || ['products']; return sells.includes('products') && sells.includes('services') ? 'both' : sells.includes('services') ? 'services' : 'products' })(),
    openingHours: store.opening_hours || p?.opening_hours || null,
    phone: store.phone || store.whatsapp_phone || p?.phone || null,
    lat: store.latitude || null,
    lng: store.longitude || null,
    businessInfo: store.business_info || p?.business_info || null,
    paymentMethods: store.payment_methods?.length ? store.payment_methods : (p?.payment_methods || []),
    banner_url: banner,
    gallery: store.gallery || [],
    planSlug: plan?.slug || 'free',
    isShowcaseActive: store.is_showcase_active ?? p?.is_showcase_active ?? true,
  }

  return (
    <div className="min-h-screen bg-white w-full max-w-[100vw] overflow-x-hidden flex flex-col">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaJsonLd) }} />
      <main className="lg:pt-[120px] flex-grow">
        <VendorPageClient
          partner={partnerData}
          products={products || []}
          services={services || []}
          plans={normalizedPlans}
          reviews={reviews || []}
          stats={stats}
          ratingDistribution={ratingDistribution}
          productCategories={productCategories}
          serviceCategories={serviceCategories}
          coupons={[]}
          userProfile={userProfile}
          cartCount={cartCount}
        />
      </main>
      <MarketplaceFooter />
    </div>
  )
}
