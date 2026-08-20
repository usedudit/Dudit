import { redirect } from "next/navigation"
import type { Metadata } from 'next'
import { ProductDetailsPageClient } from "@/components/marketplace/ProductDetailsPage"
import { safeJsonLdStringify } from "@/lib/utils/safe-json-ld"
import {
  getMarketplaceProduct,
  getProductVariants,
  getProductReviews,
} from "@/app/actions/marketplace/products"
import { createSlug } from "@/lib/utils/slugify"
import { getProductUrl, formatCityStateSlug } from "@/lib/utils/url-generator"
import { formatCurrency } from "@/lib/utils";
import { getCurrentUser } from "@/lib/auth/authorization"
import { getUserSessionData } from "@/lib/data/user"

import MarketplaceFooter from "@/components/marketplace/MarketplaceFooter"

export const dynamic = 'force-dynamic'
export const dynamicParams = true

export async function generateMetadata({ params }: { params: Promise<{ slug: string; cidadeUf: string; id: string }> }): Promise<Metadata> {
  const { id } = await params
  const product = await getMarketplaceProduct(id)

  if (!product) {
    return { title: 'Produto não encontrado' }
  }

  const p = Array.isArray(product.partners) ? product.partners[0] : product.partners
  const address = p?.addresses?.[0] || p?.address || p || {}
  const city = address?.city || "Brasil"

  // Formatação de preço para o Meta Tag
  const priceFormatted = formatCurrency(product.promotional_price || product.price);

  const productUrl = `https://dudit.com.br${getProductUrl(product)}`

  // Título mais "chamativo" com o preço
  const title = `${product.name} - ${priceFormatted} em ${city}`
  const ogTitle = `${product.name} - ${priceFormatted} ${city}`

  // Descrição com gatilho de "Conexão Direta" e Localização
  const description = `Oferta em ${city}: ${product.name} por apenas ${priceFormatted}. Compre direto do vendedor pela Dudit e economize!`

  return {
    title: title,
    description: description,
    alternates: { canonical: productUrl },
    openGraph: {
      title: ogTitle,
      description: description,
      url: productUrl,
      siteName: 'Dudit',
      images: [
        {
          url: product.image_url || 'https://img.dudit.com.br/static/Logo.png',
          width: 1200, // Tamanho ideal para redes sociais
          height: 630,
          alt: `Comprar ${product.name} em ${city}`,
        },
      ],
      locale: 'pt_BR',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image', // FOTO GRANDE NO TWITTER/X
      title: ogTitle,
      description: description,
      images: [product.image_url || 'https://img.dudit.com.br/static/Logo.png'],
    },
  }
}
export default async function ProductDetailsPage({
  params,
}: {
  params: Promise<{ slug: string; cidadeUf: string; id: string }>
}) {
  const { id, slug: currentSlug, cidadeUf: currentCidadeUf } = await params

  // Parallelize ALL independent data fetching
  const [user, product] = await Promise.all([
    getCurrentUser(),
    getMarketplaceProduct(id),
  ])

  // Parallelize session data fetch (independent of product)
  const sessionData = user ? await getUserSessionData(user.id) : null

  const userProfile = sessionData?.profile ? {
    full_name: sessionData.profile.full_name,
    address: sessionData.profile.city ? `${sessionData.profile.city} - ${sessionData.profile.state}` : null
  } : null
  const cartCount = sessionData?.cartCount || 0

  if (!product) {
    redirect("/")
  }

  // --- MÁGICA DE SEO (Canonical Redirect) ---
  const correctUrl = getProductUrl(product)
  const currentPath = `/produto/${currentSlug}/${currentCidadeUf}/p/${id}`

  // Bugfix: Evita downgrade de slug informativo para 'vitrine' genérico (ou 'brasil')
  // Se a URL atual já tem uma cidade e o sistema quer mandar para o genérico, ignoramos o redirect.
  const isCurrentlyDetailed = currentCidadeUf !== 'vitrine' && currentCidadeUf !== 'brasil'
  const isNewOneGeneric = correctUrl.includes('/vitrine/p/') || correctUrl.includes('/brasil/p/')

  if (currentPath !== correctUrl && !(isCurrentlyDetailed && isNewOneGeneric)) {
    redirect(correctUrl)
  }
  // ------------------------------------------


  // 2. Fetch variants + reviews in parallel (Deduplicated but fresh)
  const [variants, reviews] = await Promise.all([
    getProductVariants(product.id),
    getProductReviews(product.id)
  ])


  // Lógica de Preço Mínimo para Variante
  const minPrice = variants && variants.length > 0
    ? Math.min(...variants.map((v: any) => v.price))
    : product.price;

  // Aggregate de Reviews para Schema
  const reviewCount = reviews?.length || 0;
  const avgRating = reviewCount > 0
    ? (reviews.reduce((acc: number, cur: any) => acc + cur.rating, 0) / reviewCount).toFixed(1)
    : 5.0; // rating neutro padrão

  // BreadcrumbList Schema
  const p = Array.isArray(product.partners) ? product.partners[0] : product.partners
  const address = p?.addresses?.[0] || p?.address || p || {}
  const city = address?.city || "Brasil"
  const productUrl = `https://dudit.com.br${getProductUrl(product)}`

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://dudit.com.br' },
      { '@type': 'ListItem', position: 2, name: city, item: `https://dudit.com.br/explorar/${currentCidadeUf}` },
      { '@type': 'ListItem', position: 3, name: product.name, item: productUrl },
    ],
  }

  // Schema Orgânico Focado para Produtos
  const schemaJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description || `Produto ${product.name} na Dudit.`,
    image: product.image_url || 'https://img.dudit.com.br/static/Logo.png',
    sku: product.id,
    brand: {
      '@type': 'Brand',
      name: product.partner_id ? 'Loja Parceira Dudit' : 'Dudit'
    },
    offers: {
      '@type': 'Offer',
      url: `https://dudit.com.br${getProductUrl(product)}`,
      priceCurrency: 'BRL',
      price: minPrice,
      availability: 'https://schema.org/InStock',
      seller: {
        '@type': 'Organization',
        name: product.partner_id ? 'Dudit Associado' : 'Dudit'
      }
    },
    aggregateRating: reviewCount > 0 ? {
      '@type': 'AggregateRating',
      ratingValue: avgRating,
      reviewCount: reviewCount
    } : undefined
  };

  return (
    <div className="bg-white dark:bg-dark-background min-h-screen font-sans text-brand-dark dark:text-dark-heading flex flex-col pt-[60px]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(schemaJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(breadcrumbLd) }}
      />

      <ProductDetailsPageClient
        product={product}
        variants={variants || []}
        reviews={reviews || []}
        currentUserId={user?.id || null}
        userProfile={userProfile}
        cartCount={cartCount}
      />

      <MarketplaceFooter />
    </div>
  )
}
