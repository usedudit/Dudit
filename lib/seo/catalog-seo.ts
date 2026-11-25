import type { Metadata } from "next"
import { getProductDisplayImages, PLACEHOLDER } from "@/lib/utils/product-display-images"
import { formatCurrency } from "@/lib/utils"

export interface NormalizedSpec {
  name: string
  value: string
}

/**
 * Normaliza especificações técnicas de produtos ou serviços.
 * Suporta array de objetos ({ name/label, value }), objetos chave-valor ou string JSON.
 */
export function normalizeCatalogSpecs(specs: any): NormalizedSpec[] {
  if (!specs) return []

  let raw = specs
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw)
    } catch {
      return []
    }
  }

  if (Array.isArray(raw)) {
    return raw
      .map((item: any) => {
        const name = String(item?.name || item?.label || "").trim()
        const value = String(item?.value ?? "").trim()
        return { name, value }
      })
      .filter((item) => item.name.length > 0 && item.value.length > 0)
  }

  if (typeof raw === "object" && raw !== null) {
    if (Array.isArray(raw.attributes)) {
      return normalizeCatalogSpecs(raw.attributes)
    }

    const ignoredKeys = new Set([
      "attributes",
      "addon_groups",
      "condition",
      "condicao",
      "accepts_offers",
      "accepts_trades",
      "brand",
      "model",
      "warranty",
    ])

    return Object.entries(raw)
      .filter(([key, val]) => !ignoredKeys.has(key) && val !== null && val !== undefined && typeof val !== "object")
      .map(([key, val]) => ({
        name: key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
        value: String(val).trim(),
      }))
      .filter((item) => item.name.length > 0 && item.value.length > 0)
  }

  return []
}

/**
 * Normaliza tags de produtos ou serviços (array, string separada por vírgula ou JSON).
 */
export function normalizeCatalogTags(tags: any): string[] {
  if (!tags) return []

  let raw = tags
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw)
    } catch {
      return raw
        .split(",")
        .map((t: string) => t.trim().toLowerCase())
        .filter(Boolean)
    }
  }

  if (Array.isArray(raw)) {
    return raw
      .map((t: any) => String(t || "").trim().toLowerCase())
      .filter((t) => t.length > 0)
  }

  return []
}

/**
 * Monta as meta tags e dados estruturados para páginas de produto com foco em SEO e GEO (Generative Engine Optimization).
 */
export function buildProductSeo({
  product,
  city,
  productUrl,
  minPrice,
  reviews = [],
}: {
  product: any
  city: string
  productUrl: string
  minPrice?: number
  reviews?: any[]
}) {
  const isCityBrasil = !city || city.toLowerCase() === "brasil"
  const locationLabel = isCityBrasil ? "Brasil" : city

  // 1. Imagens reais (usando helper robusto de R2 + moderação + variações)
  const productImages = getProductDisplayImages(product, "large")
  const primaryImage = productImages[0] || PLACEHOLDER

  // 2. Especificações e Tags
  const specs = normalizeCatalogSpecs(product.technical_specs)
  const tags = normalizeCatalogTags(product.tags)

  const brandName = product.brand || product.brand_entity?.name || ""
  const categoryName = product.category?.name || product.marketplace_category?.name || ""
  const conditionLabel = product.condition === "used" ? "Usado" : "Novo"

  const rawFulfillmentModes: string[] = Array.isArray(product.fulfillment_modes)
    ? product.fulfillment_modes
    : []
  const hasExplicitModes = rawFulfillmentModes.length > 0
  const supportsShipping = hasExplicitModes ? rawFulfillmentModes.includes("shipping") : true
  const supportsDelivery = hasExplicitModes ? rawFulfillmentModes.includes("delivery") : true
  const supportsPickup = hasExplicitModes ? rawFulfillmentModes.includes("pickup") : true

  const availableDeliveryMethods: string[] = []
  if (supportsPickup) availableDeliveryMethods.push("http://purl.org/goodrelations/v1#DeliveryModePickUp")
  if (supportsDelivery) availableDeliveryMethods.push("http://purl.org/goodrelations/v1#DeliveryModeOwnFleet")
  if (supportsShipping) availableDeliveryMethods.push("http://purl.org/goodrelations/v1#ParcelService")

  // 3. Montagem de Keywords para SEO & GEO
  const specKeywords = specs.slice(0, 6).map((s) => `${s.name}: ${s.value}`)
  const keywordsSet = new Set<string>([
    product.name,
    ...(brandName ? [brandName] : []),
    ...(categoryName ? [categoryName] : []),
    ...tags,
    ...specKeywords,
    `comprar ${product.name}`,
    `${product.name} em ${locationLabel}`,
    `preço ${product.name}`,
    ...(supportsShipping ? ["envio para todo o Brasil", "frete para seu CEP"] : []),
    ...(supportsPickup ? [`retirada em ${locationLabel}`] : []),
    conditionLabel,
    "dudit",
  ])
  const keywords = Array.from(keywordsSet).filter(Boolean)

  // 4. Meta Description otimizada (incluindo marca, specs e modalidade local/nacional)
  const cleanDesc = product.description
    ? product.description.replace(/<[^>]*>?/gm, "").replace(/\s+/g, " ").trim()
    : ""
  const descSnippet = cleanDesc ? cleanDesc.slice(0, 110) : ""

  const specsHighlights = specs.slice(0, 3).map((s) => `${s.name}: ${s.value}`).join(" | ")
  const brandHighlight = brandName ? `Marca: ${brandName}.` : ""
  const fulfillmentHighlight = supportsShipping && !isCityBrasil
    ? `em ${locationLabel} ou com envio para todo o Brasil`
    : supportsShipping
      ? "com envio para todo o Brasil"
      : `em ${locationLabel}`

  let metaDescription = ""
  if (descSnippet) {
    metaDescription = `${descSnippet}... ${brandHighlight} ${specsHighlights ? `[${specsHighlights}]. ` : ""}Compre ${fulfillmentHighlight} pela Dudit!`
  } else {
    metaDescription = `Oferta ${fulfillmentHighlight}: ${product.name}. ${brandHighlight} ${specsHighlights ? `Especificações: ${specsHighlights}. ` : ""}Compre direto do vendedor pela Dudit com 0% de comissão!`
  }
  metaDescription = metaDescription.replace(/\s+/g, " ").trim().slice(0, 155)

  // 5. Preço formatado
  const activePrice = minPrice ?? product.promotional_price ?? product.price ?? 0
  const priceFormatted = formatCurrency(activePrice)

  const pageTitle = isCityBrasil
    ? `${product.name} - ${priceFormatted} | Dudit`
    : `${product.name} - ${priceFormatted} em ${city} | Dudit`

  // 6. Next.js Metadata
  const metadata: Metadata = {
    title: pageTitle,
    description: metaDescription,
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
    alternates: { canonical: productUrl },
    openGraph: {
      title: pageTitle,
      description: metaDescription,
      url: productUrl,
      siteName: "Dudit",
      images: productImages.map((imgUrl) => ({
        url: imgUrl,
        width: 1200,
        height: 630,
        alt: `${product.name} em ${locationLabel}`,
      })),
      locale: "pt_BR",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: pageTitle,
      description: metaDescription,
      images: [primaryImage],
    },
    other: {
      "product:price:amount": String(activePrice),
      "product:price:currency": "BRL",
      "product:condition": product.condition || "new",
      "product:availability": (product.stock_available ?? product.stock_quantity ?? 1) > 0 ? "in stock" : "out of stock",
      ...(brandName ? { "product:brand": brandName } : {}),
      ...(categoryName ? { "product:category": categoryName } : {}),
    },
  }

  // 7. Schema.org JSON-LD para Google Shopping / Rich Results e GEO
  const reviewCount = reviews.length
  const avgRating = reviewCount > 0
    ? (reviews.reduce((acc: number, cur: any) => acc + (cur.rating || 0), 0) / reviewCount).toFixed(1)
    : undefined

  const storeData = (Array.isArray(product.stores) ? product.stores[0] : product.stores) || {}
  const storeName = storeData.name || (product.partner_id ? "Loja Parceira Dudit" : "Dudit")

  const inStock = (product.stock_available ?? product.stock_quantity ?? 1) > 0

  const schemaJsonLd: Record<string, any> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: cleanDesc || metaDescription,
    image: productImages,
    sku: product.sku || product.short_id || product.id,
    ...(product.gtin ? { gtin: product.gtin } : {}),
    brand: {
      "@type": "Brand",
      name: brandName || storeName,
    },
    ...(categoryName ? { category: categoryName } : {}),
    keywords: keywords.join(", "),
    itemCondition: product.condition === "used"
      ? "https://schema.org/UsedCondition"
      : "https://schema.org/NewCondition",
    ...(specs.length > 0 ? {
      additionalProperty: specs.map((spec) => ({
        "@type": "PropertyValue",
        name: spec.name,
        value: spec.value,
      })),
    } : {}),
    offers: {
      "@type": "Offer",
      url: productUrl,
      priceCurrency: "BRL",
      price: activePrice,
      priceValidUntil: `${new Date().getFullYear() + 1}-12-31`,
      availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: product.condition === "used"
        ? "https://schema.org/UsedCondition"
        : "https://schema.org/NewCondition",
      ...(availableDeliveryMethods.length > 0 ? { availableDeliveryMethod: availableDeliveryMethods } : {}),
      areaServed: supportsShipping
        ? { "@type": "Country", name: "Brasil" }
        : { "@type": "City", name: locationLabel },
      ...(supportsShipping ? {
        shippingDetails: {
          "@type": "OfferShippingDetails",
          shippingDestination: {
            "@type": "DefinedRegion",
            addressCountry: "BR",
          },
        },
      } : {}),
      hasMerchantReturnPolicy: {
        "@type": "MerchantReturnPolicy",
        applicableCountry: "BR",
        returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
        merchantReturnDays: 7,
      },
      seller: {
        "@type": "Organization",
        name: storeName,
      },
    },
    ...(avgRating && reviewCount > 0 ? {
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: avgRating,
        reviewCount,
      },
    } : {}),
  }

  return {
    metadata,
    schemaJsonLd,
    specs,
    tags,
    keywords,
    pageTitle,
    metaDescription,
  }
}

/**
 * Monta as meta tags e dados estruturados para páginas de serviços com foco em SEO e GEO.
 */
export function buildServiceSeo({
  service,
  city,
  serviceUrl,
  reviews = [],
}: {
  service: any
  city: string
  serviceUrl: string
  reviews?: any[]
}) {
  const isCityBrasil = !city || city.toLowerCase() === "brasil"
  const locationLabel = isCityBrasil ? "Brasil" : city

  // 1. Imagens do serviço
  const serviceImages: string[] = []
  if (Array.isArray(service.images)) {
    service.images.forEach((img: any) => {
      if (typeof img === "string" && img.trim().length > 0) serviceImages.push(img.trim())
    })
  }
  if (serviceImages.length === 0) {
    const partner = Array.isArray(service.partners) ? service.partners[0] : service.partners
    if (partner?.store_image_url) serviceImages.push(partner.store_image_url)
    else serviceImages.push(PLACEHOLDER)
  }
  const primaryImage = serviceImages[0]

  // 2. Detalhes técnicos e Tags
  const details = normalizeCatalogSpecs(service.technical_details)
  const tags = normalizeCatalogTags(service.tags)

  // 3. Keywords
  const rawServiceModes: string[] = Array.isArray(service.fulfillment_modes)
    ? service.fulfillment_modes
    : []
  const supportsCustomerLocation = rawServiceModes.includes("customer_location")
  const supportsOnSite = rawServiceModes.includes("on_site")

  const detailKeywords = details.slice(0, 6).map((d) => `${d.name}: ${d.value}`)
  const serviceTypeName = service.service_type || service.name
  const keywordsSet = new Set<string>([
    service.name,
    serviceTypeName,
    ...tags,
    ...detailKeywords,
    `agendar ${service.name}`,
    `serviço de ${service.name}`,
    `${service.name} em ${locationLabel}`,
    ...(supportsCustomerLocation ? ["atendimento a domicílio", `${service.name} a domicílio`] : []),
    ...(supportsOnSite ? ["atendimento no local"] : []),
    "agendamento online",
    "dudit",
  ])
  const keywords = Array.from(keywordsSet).filter(Boolean)

  // 4. Meta Description otimizada
  const cleanDesc = service.description
    ? service.description.replace(/<[^>]*>?/gm, "").replace(/\s+/g, " ").trim()
    : ""
  const descSnippet = cleanDesc ? cleanDesc.slice(0, 110) : ""
  const detailsHighlights = details.slice(0, 3).map((d) => `${d.name}: ${d.value}`).join(" | ")

  let metaDescription = ""
  if (descSnippet) {
    metaDescription = `${descSnippet}... ${detailsHighlights ? `[${detailsHighlights}]. ` : ""}Agende online em ${locationLabel} pela Dudit com confirmação imediata!`
  } else {
    metaDescription = `Agende ${service.name} em ${locationLabel}. ${detailsHighlights ? `Detalhes: ${detailsHighlights}. ` : ""}Reserve horários em tempo real direto pela Dudit!`
  }
  metaDescription = metaDescription.replace(/\s+/g, " ").trim().slice(0, 155)

  const pageTitle = isCityBrasil
    ? `${service.name} - Agendar online | Dudit`
    : `${service.name} - Agendar em ${city} | Dudit`

  // 5. Next.js Metadata
  const metadata: Metadata = {
    title: pageTitle,
    description: metaDescription,
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
    alternates: { canonical: serviceUrl },
    openGraph: {
      title: pageTitle,
      description: metaDescription,
      url: serviceUrl,
      siteName: "Dudit",
      images: serviceImages.map((imgUrl) => ({
        url: imgUrl,
        width: 1200,
        height: 630,
        alt: `Agendar ${service.name} em ${locationLabel}`,
      })),
      locale: "pt_BR",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: pageTitle,
      description: metaDescription,
      images: [primaryImage],
    },
    other: {
      "service:price:amount": String(service.price || 0),
      "service:price:currency": "BRL",
    },
  }

  // 6. Schema.org JSON-LD para Service
  const reviewCount = reviews.length
  const avgRating = reviewCount > 0
    ? (reviews.reduce((acc: number, cur: any) => acc + (cur.rating || 0), 0) / reviewCount).toFixed(1)
    : undefined

  const partner = Array.isArray(service.partners) ? service.partners[0] : service.partners
  const storeName = partner?.store_name || "Profissional Dudit"
  const address = partner?.addresses?.[0]

  const schemaJsonLd: Record<string, any> = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: service.name,
    description: cleanDesc || metaDescription,
    serviceType: serviceTypeName,
    image: serviceImages,
    keywords: keywords.join(", "),
    provider: {
      "@type": "LocalBusiness",
      name: storeName,
      ...(partner?.store_image_url ? { image: partner.store_image_url } : {}),
      ...(address ? {
        address: {
          "@type": "PostalAddress",
          streetAddress: address.street,
          addressLocality: address.city,
          addressRegion: address.state,
          postalCode: address.zip_code,
          addressCountry: "BR",
        },
      } : {}),
      ...(address?.latitude && address?.longitude ? {
        geo: {
          "@type": "GeoCoordinates",
          latitude: address.latitude,
          longitude: address.longitude,
        },
      } : {}),
    },
    ...(details.length > 0 ? {
      additionalProperty: details.map((d) => ({
        "@type": "PropertyValue",
        name: d.name,
        value: d.value,
      })),
    } : {}),
    offers: {
      "@type": "Offer",
      url: serviceUrl,
      priceCurrency: "BRL",
      price: service.price || 0,
      availability: "https://schema.org/InStock",
    },
    ...(!isCityBrasil || (supportsCustomerLocation && address?.latitude && address?.longitude && service.service_max_km) ? {
      areaServed: (supportsCustomerLocation && address?.latitude && address?.longitude && service.service_max_km)
        ? {
            "@type": "GeoCircle",
            geoMidpoint: {
              "@type": "GeoCoordinates",
              latitude: address.latitude,
              longitude: address.longitude,
            },
            geoRadius: Number(service.service_max_km) * 1000,
          }
        : {
            "@type": "City",
            name: city,
          },
    } : {}),
    ...(avgRating && reviewCount > 0 ? {
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: avgRating,
        reviewCount,
      },
    } : {}),
  }

  return {
    metadata,
    schemaJsonLd,
    details,
    tags,
    keywords,
    pageTitle,
    metaDescription,
  }
}
