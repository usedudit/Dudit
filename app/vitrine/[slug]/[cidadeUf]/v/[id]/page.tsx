import { notFound, redirect } from "next/navigation"
import type { Metadata } from 'next'
import { VendorPageClient } from "@/components/marketplace/VendorPage"
import { MarketplaceFooter } from "@/components/marketplace/MarketplaceFooter"
import { getPartnerUrl } from "@/lib/utils/url-generator"
import { getCurrentUser } from "@/lib/auth/authorization"
import { getUserSessionData } from "@/lib/data/user"
import { normalizeBusinessInfo } from "@/lib/business-info"

import {
  getPartnerProfile,
  getPartnerProducts,
  getPartnerServices,
  getPartnerReviews,
  getPartnerStats,
  getPartnerPublicCoupons,
} from "@/app/actions/marketplace/partners"
import { getPartnerPlan } from "@/lib/services/subscription.service"
import { listMarketplaceRecurringPlansAction } from "@/app/actions/marketplace/recurring-subscriptions"

export async function generateMetadata({ params }: { params: Promise<{ slug: string; cidadeUf: string; id: string }> }): Promise<Metadata> {
  const { id } = await params
  const partner = await getPartnerProfile(id)

  if (!partner) {
    return {
      title: 'Loja não encontrada | Dudit'
    }
  }

  const address = partner.addresses?.[0] || partner.address || partner || {}
  const city = address?.city || "Brasil"
  const state = address?.state || "BR"

  const storeName = partner.store_name || 'Loja Parceira'
  const storeDescription = partner.store_description || `Conheça a loja ${storeName} na Dudit, sua conexão direta e sem taxas.`
  const url = `https://dudit.com.br${getPartnerUrl(partner)}`

  return {
    title: `${storeName} em ${city} - ${state}`,
    description: storeDescription,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title: `${storeName} | Dudit`,
      description: storeDescription,
      url: url,
      images: [
        {
          url: partner.store_image_url || 'https://img.dudit.com.br/static/Logo.png',
          width: 800,
          height: 600,
          alt: `Capa da loja ${storeName}`,
        },
      ],
      type: 'website',
    }
  }
}

export default async function VendorPage({ params }: { params: Promise<{ slug: string; cidadeUf: string; id: string }> }) {
  const { id, slug: currentSlug, cidadeUf: currentCidadeUf } = await params

  // PERFORMANCE: Busca TUDO em paralelo - incluindo auth
  const [user, partner, products, services, reviews, statsBase, coupons, plan, plansRes] = await Promise.all([
    getCurrentUser(),
    getPartnerProfile(id),
    getPartnerProducts(id),
    getPartnerServices(id),
    getPartnerReviews(id),
    getPartnerStats(id),
    getPartnerPublicCoupons(id),
    getPartnerPlan(id),
    listMarketplaceRecurringPlansAction(id),
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

    const image = firstImage || partner?.store_image_url || "https://img.dudit.com.br/static/Placeholder.png"

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
      created_at: item.created_at
    }
  })

  // Se não achou o parceiro no cache/banco, retorna 404
  if (!partner) {
    return notFound()
  }

  // business_info no longer uses channels; keep vitrine accessible by default
  normalizeBusinessInfo(partner.business_info)

  // Extrai categorias únicas
  const productCategories = Array.from(new Set(products?.map((p: any) => p.category).filter(Boolean))) as string[]
  const serviceCategories = Array.from(new Set(services?.map((s: any) => s.category).filter(Boolean))) as string[]

  // --- MÁGICA DE SEO (Canonical Redirect) ---
  const correctUrl = getPartnerUrl(partner)
  const currentPath = `/vitrine/${currentSlug}/${currentCidadeUf}/v/${id}`

  // Bugfix: Evita downgrade de slug informativo para 'vitrine' genérico (ou 'brasil')
  const isCurrentlyDetailed = currentCidadeUf !== 'vitrine' && currentCidadeUf !== 'brasil'
  const isNewOneGeneric = correctUrl.includes('/vitrine/v/') || correctUrl.includes('/brasil/v/')

  if (currentPath !== correctUrl && !(isCurrentlyDetailed && isNewOneGeneric)) {
    redirect(correctUrl)
  }

  // Calcula anos de plataforma
  const createdDate = new Date(partner.created_at)
  const yearsOnPlatform = new Date().getFullYear() - createdDate.getFullYear() || 1

  // Monta objeto de estatísticas completo para o Client Component
  const stats = {
    salesCount: statsBase?.salesCount || 0,
    reviewsCount: statsBase?.reviewsCount || 0,
    yearsOnPlatform: yearsOnPlatform,
    itemsCount: (products?.length || 0) + (services?.length || 0),
  }

  // Calcula distribuição de estrelas (5, 4, 3, 2, 1) baseado nos reviews cacheados
  const ratingDistribution = [5, 4, 3, 2, 1].map(star => ({
    star,
    count: reviews?.filter((r: any) => Math.round(r.rating) === star).length || 0
  }))

  const url = `https://dudit.com.br${getPartnerUrl(partner)}`
  const partnerCity = partner.addresses?.[0]?.city || "Brasil"
  const partnerState = partner.addresses?.[0]?.state || "BR"

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://dudit.com.br' },
      { '@type': 'ListItem', position: 2, name: `${partnerCity} - ${partnerState}`, item: `https://dudit.com.br/explorar/${currentCidadeUf}` },
      { '@type': 'ListItem', position: 3, name: partner.store_name, item: url },
    ],
  }

  const schemaJsonLd = {
    '@context': 'https://schema.org',
    '@type': ['Store', 'LocalBusiness', 'Organization'],
    name: partner.store_name,
    image: partner.store_image_url || 'https://img.dudit.com.br/static/Logo.png',
    description: partner.store_description,
    address: {
      '@type': 'PostalAddress',
      streetAddress: partner.addresses?.[0]?.street || '',
      addressLocality: partner.addresses?.[0]?.city || '',
      addressRegion: partner.addresses?.[0]?.state || '',
      postalCode: partner.addresses?.[0]?.zip_code || '',
      addressCountry: 'BR',
    },
    telephone: partner.phone || '',
    aggregateRating: partner.rating ? {
      '@type': 'AggregateRating',
      ratingValue: Number(partner.rating).toFixed(1),
      reviewCount: statsBase?.reviewsCount || 1,
    } : undefined,
    makesOffer: [
      ...(products || []).slice(0, 3).map((p: any) => ({
        '@type': 'Offer',
        itemOffered: {
          '@type': 'Product',
          name: p.name
        },
        price: p.price,
        priceCurrency: 'BRL'
      })),
      ...(services || []).slice(0, 3).map((s: any) => ({
        '@type': 'Offer',
        itemOffered: {
          '@type': 'Service',
          name: s.name
        },
        price: s.price,
        priceCurrency: 'BRL'
      }))
    ]
  };

  // Mapeia os dados do banco (snake_case) para o formato esperado pelo componente (camelCase)
  // Endereço agora vem da tabela addresses via JOIN
  const partnerData = {
    id: partner.id,
    storeName: partner.store_name,
    storeDescription: partner.store_description,
    storeImageUrl: partner.store_image_url,
    profile_image_url: partner.profile_image_url,
    city: partner.addresses?.[0]?.city || partner.city || "",
    state: partner.addresses?.[0]?.state || partner.state || "",
    street: partner.addresses?.[0]?.street || partner.street || "",
    number: partner.addresses?.[0]?.number || partner.number || "",
    neighborhood: partner.addresses?.[0]?.neighborhood || partner.neighborhood || "",
    zipCode: partner.addresses?.[0]?.zip_code || partner.zip_code || "",
    rating: Number(partner.rating) || 0,
    createdAt: partner.created_at,
    offeringType: partner.offering_type,
    openingHours: partner.opening_hours,
    phone: partner.phone,
    lat: partner.latitude,
    lng: partner.longitude,
    businessInfo: partner.business_info,
    paymentMethods: partner.payment_methods,
    banner_url: partner.banner_url,
    banner_moderation_status: partner.banner_moderation_status || 'approved',
    logo_moderation_status: partner.logo_moderation_status || 'approved',
    gallery: partner.gallery || [],
    planSlug: plan?.slug || 'free',
  }

  return (
    <div className="min-h-screen bg-white w-full max-w-[100vw] overflow-x-hidden flex flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaJsonLd) }}
      />


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
          coupons={coupons || []}
          userProfile={userProfile}
          cartCount={cartCount}
        />
      </main>

      <MarketplaceFooter />
    </div>
  )
}
