import { notFound, redirect } from "next/navigation"
import type { Metadata } from 'next'
import { ProductDetailsPageClient } from "@/components/marketplace/ProductDetailsPage"
import { safeJsonLdStringify } from "@/lib/utils/safe-json-ld"
import {
  getMarketplaceProduct,
  getProductVariants,
  getProductReviews,
  getProductSoldCount,
} from "@/app/actions/marketplace/products"
import { getProductUrl } from "@/lib/utils/url-generator"
import { formatCurrency } from "@/lib/utils";
import { getCurrentUser } from "@/lib/auth/authorization"
import { getUserSessionData } from "@/lib/data/user"
import { resolveMarketplaceCapabilities } from "@/lib/marketplace-capabilities"
import { getSponsoredAdsForSlot } from "@/app/actions/marketplace/ads"
import { buildProductSeo } from "@/lib/seo/catalog-seo"

import MarketplaceFooter from "@/components/marketplace/MarketplaceFooter"

export const dynamic = 'force-dynamic'
export const dynamicParams = true

export async function generateMetadata({ params }: { params: Promise<{ slug: string; cidadeUf: string; id: string }> }): Promise<Metadata> {
  const { id } = await params
  const product = await getMarketplaceProduct(id)

  if (!product) {
    return {
      title: 'Produto não encontrado',
      robots: { index: false, follow: true },
    }
  }

  const p = Array.isArray(product.partners) ? product.partners[0] : product.partners
  const storeObj = Array.isArray(product.stores) ? product.stores[0] : product.stores
  const address = p?.addresses?.[0] || storeObj?.addresses?.[0] || p?.address || storeObj?.address || p || {}
  const city = address?.city || product.store_city || storeObj?.city || "Brasil"

  const productUrl = `https://dudit.com.br${getProductUrl(product)}`

  const { metadata } = buildProductSeo({
    product,
    city,
    productUrl,
  })

  return metadata
}
export default async function ProductDetailsPage({
  params,
}: {
  params: Promise<{ slug: string; cidadeUf: string; id: string }>
}) {
  const { id, slug: currentSlug, cidadeUf: currentCidadeUf } = await params

  // Parallelize product + user session data fetch
  const [user, product] = await Promise.all([
    getCurrentUser(),
    getMarketplaceProduct(id),
  ])

  if (!product) {
    notFound()
  }

  const sessionData = user ? await getUserSessionData(user.id) : null
  const storeId = product.store_id || null

  const userProfile = sessionData?.profile ? {
    full_name: sessionData.profile.full_name,
    address: sessionData.profile.city ? `${sessionData.profile.city} - ${sessionData.profile.state}` : null,
    latitude: sessionData.profile.latitude,
    longitude: sessionData.profile.longitude,
    city: sessionData.profile.city,
    state: sessionData.profile.state,
    avatar_url: sessionData.profile.avatar_url || null,
  } : null
  const cartCount = sessionData?.cartCount || 0

  // --- MÁGICA DE SEO (Canonical Redirect) ---
  const correctUrl = getProductUrl(product)
  const currentPath = `/${currentCidadeUf}/${currentSlug}/p/${id}`

  // Bugfix: Evita downgrade de slug informativo para 'vitrine' genérico (ou 'brasil')
  // Se a URL atual já tem uma cidade e o sistema quer mandar para o genérico, ignoramos o redirect.
  const isCurrentlyDetailed = currentCidadeUf !== 'vitrine' && currentCidadeUf !== 'brasil'
  const isNewOneGeneric = correctUrl.includes('/vitrine/p/') || correctUrl.includes('/brasil/p/')

  if (currentPath !== correctUrl && !(isCurrentlyDetailed && isNewOneGeneric)) {
    redirect(correctUrl)
  }
  // ------------------------------------------


  // 2. Fetch variants + reviews + sold count in parallel (Deduplicated but fresh)
  const [variants, reviews, detailAds, soldCount, capabilities] = await Promise.all([
    getProductVariants(product.id),
    getProductReviews(product.id, storeId),
    getSponsoredAdsForSlot("detail", {

      lat: userProfile?.latitude ?? null,
      lng: userProfile?.longitude ?? null,
      citySlug: currentCidadeUf,
      city: userProfile?.city ?? null,
      state: userProfile?.state ?? currentCidadeUf.split("-").pop()?.toUpperCase() ?? null,
    }),
    getProductSoldCount(product.id),
    product.partner_id
      ? resolveMarketplaceCapabilities(product.partner_id, { storeId: product.store_id || null })
      : Promise.resolve(null),
  ])
  const detailAd = detailAds[0] ?? null

  // Lógica de Preço Mínimo para Variante
  const minPrice = variants && variants.length > 0
    ? Math.min(...variants.map((v: any) => v.price))
    : product.price;

  const p = Array.isArray(product.partners) ? product.partners[0] : product.partners
  const storeObj = Array.isArray(product.stores) ? product.stores[0] : product.stores
  const address = p?.addresses?.[0] || storeObj?.addresses?.[0] || p?.address || storeObj?.address || p || {}
  const city = address?.city || product.store_city || storeObj?.city || "Brasil"

  const { schemaJsonLd } = buildProductSeo({
    product,
    city,
    productUrl: `https://dudit.com.br${correctUrl}`,
    minPrice,
    reviews: reviews || [],
  })

  return (
    <div className="bg-white min-h-screen font-sans text-brand-dark flex flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(schemaJsonLd) }}
      />

      <ProductDetailsPageClient
        product={product}
        variants={variants || []}
        reviews={reviews || []}
        currentUserId={user?.id || null}
        userProfile={userProfile}
        cartCount={cartCount}
        sponsoredAd={detailAd}
        soldCount={soldCount}
        checkoutOpen={capabilities ? capabilities.checkoutOpen : true}
        ordersLimitReached={capabilities?.ordersLimitReached ?? false}
        whatsappPhone={capabilities?.whatsappPhone ?? null}
        orderFlow={capabilities?.baseOrderFlow ?? "dudit"}
      />

      <MarketplaceFooter />
    </div>
  )
}
