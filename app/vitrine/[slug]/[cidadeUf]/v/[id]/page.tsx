import { notFound, redirect } from "next/navigation"
import type { Metadata } from 'next'
import { VendorPageClient } from "@/components/marketplace/VendorPage"
import MarketplaceHeader from "@/components/marketplace/MarketplaceHeader"
import { MarketplaceFooter } from "@/components/marketplace/MarketplaceFooter"
import { getPartnerUrl } from "@/lib/utils/url-generator"
import { getCurrentUser } from "@/lib/auth/authorization"
import { getUserSessionData } from "@/lib/data/user"

import {
  getPartnerProfile,
  getPartnerProducts,
  getPartnerServices,
  getPartnerReviews,
  getPartnerStats,
} from "@/app/actions/marketplace/partners"

// Removed force-dynamic — getCurrentUser() calls cookies() which already makes this dynamic

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
  const storeDescription = partner.store_description || `Conheça a loja ${storeName} na Vitrine Digital Dudit, sua conexão direta e sem taxas.`
  const url = `https://dudit.com.br${getPartnerUrl(partner)}`

  return {
    title: `${storeName} | Dudit em ${city} - ${state}`,
    description: storeDescription,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title: `${storeName} | Vitrine Digital Dudit`,
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

  // PERFORMANCE: Busca TUDO em paralelo — incluindo auth
  const [user, partner, products, services, reviews, statsBase] = await Promise.all([
    getCurrentUser(),
    getPartnerProfile(id),
    getPartnerProducts(id),
    getPartnerServices(id),
    getPartnerReviews(id),
    getPartnerStats(id),
  ])
  const sessionData = user ? await getUserSessionData(user.id) : null

  const userProfile = sessionData?.profile ? { full_name: sessionData.profile.full_name, address: sessionData.profile.city ? `${sessionData.profile.city} - ${sessionData.profile.state}` : null } : null
  const cartCount = sessionData?.cartCount || 0

  // Se não achou o parceiro no cache/banco, retorna 404
  if (!partner) {
    return notFound()
  }

  // Proteção: não exibe a vitrine online se o parceiro desativou essa opção
  const sellsOnline = partner.business_info?.channels?.includes("online") ?? true
  if (!sellsOnline) {
    return notFound()
  }

  // Extrai categorias únicas
  const productCategories = Array.from(new Set(products?.map((p: any) => p.category).filter(Boolean))) as string[]
  const serviceCategories = Array.from(new Set(services?.map((s: any) => s.category).filter(Boolean))) as string[]

  // --- MÁGICA DE SEO (Canonical Redirect) ---
  const correctUrl = getPartnerUrl(partner)
  const currentPath = `/vitrine/${currentSlug}/${currentCidadeUf}/v/${id}`
  if (currentPath !== correctUrl) {
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
    telephone: partner.telefone || '',
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
    city: partner.addresses?.[0]?.city || "",
    state: partner.addresses?.[0]?.state || "",
    street: partner.addresses?.[0]?.street || "",
    number: partner.addresses?.[0]?.number || "",
    neighborhood: partner.addresses?.[0]?.neighborhood || "",
    zipCode: partner.addresses?.[0]?.zip_code || "",
    rating: Number(partner.rating) || 5.0,
    createdAt: partner.created_at,
    offeringType: partner.offering_type,
    openingHours: partner.opening_hours,
  }

  return (
    <div className="min-h-screen bg-white w-full max-w-[100vw] overflow-x-hidden flex flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaJsonLd) }}
      />
      <MarketplaceHeader currentView="shop" userProfile={userProfile} cartCount={cartCount} />

      <main className="pt-[120px] flex-grow">
        <VendorPageClient
          partner={partnerData}
          products={products || []}
          services={services || []}
          reviews={reviews || []}
          stats={stats}
          ratingDistribution={ratingDistribution}
          productCategories={productCategories}
          serviceCategories={serviceCategories}
        />
      </main>

      <MarketplaceFooter />
    </div>
  )
}
