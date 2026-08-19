"use server"

import { getAdminClient } from "@/lib/supabase/admin"
import { cache } from "react"
import { computeItemDisplayPrice } from "@/lib/services/pricing-engine"
import { listActivePromotionsForMarketplaceAction } from "@/app/actions/shared/promotions"
import { getProductUrl, getServiceUrl } from "@/lib/utils/url-generator"
import { getPrimaryProductDisplayImage } from "@/lib/utils/product-display-images"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { filterMarketplaceVisibleProducts, filterMarketplaceVisibleServices } from "@/lib/resolve-marketplace-visibility"

export interface LinkedItemData {
  type: "product" | "service" | "collection"
  id: string
  name: string
  imageUrl: string
  url: string

  displayPrice?: number
  referencePrice?: number | null
  discountPercent?: number
  hasDiscount?: boolean
  badgeVariant?: "blue" | "orange" | null
  rating?: number
  showPrice?: boolean

  itemsCount?: number
}

async function _getLinkedItemData(type: string, id: string, storeId?: string): Promise<LinkedItemData | null> {
  const supabase = getAdminClient()

  if (type === "product") {
    let q = supabase
      .from("products")
      .select(`
        id, name, price, promotional_price, images, rating, show_price_in_store,
        partner_id,
        partners!partner_id(id, addresses(city, state)),
        stores!left(id, name, logo_url, addresses!store_id!left(city, state))
      `)
      .eq("id", id)
    if (storeId) q = q.eq("store_id", storeId)
    const { data: product } = await q.maybeSingle()

    if (!product) return null

    const visibleProductIds = await filterMarketplaceVisibleProducts([product.id])
    if (!visibleProductIds.has(product.id)) return null

    let p: any = product.partners
    if (Array.isArray(p)) p = p[0]

    const store = Array.isArray(product.stores) ? product.stores[0] : product.stores
    const urlPartner = store || p || { id: product.partner_id }

    const partnerId = p?.id || product.partner_id
    const promotions = partnerId ? await listActivePromotionsForMarketplaceAction(partnerId) : []
    const unitPrice = Number(product.price) || 0
    const individualPromo = product.promotional_price ? Number(product.promotional_price) : null
    const pricing = computeItemDisplayPrice(unitPrice, individualPromo, promotions, { productId: product.id })

    const imageUrl = getPrimaryProductDisplayImage(product)

    return {
      type: "product",
      id: product.id,
      name: product.name,
      imageUrl,
      url: getProductUrl(product, urlPartner),
      displayPrice: pricing.bestPrice,
      referencePrice: pricing.referencePrice || null,
      discountPercent: pricing.discountPercent,
      hasDiscount: pricing.hasDiscount,
      badgeVariant: pricing.badgeVariant,
      rating: product.rating || 0,
      showPrice: product.show_price_in_store !== false,
    }
  }

  if (type === "service") {
    let q = supabase
      .from("services")
      .select(`
        id, name, price, promotional_price, images, rating, show_price_in_store,
        partner_id,
        partners!partner_id(id, addresses(city, state)),
        stores!left(id, name, logo_url, addresses!store_id!left(city, state))
      `)
      .eq("id", id)
    if (storeId) q = q.eq("store_id", storeId)
    const { data: service } = await q.maybeSingle()

    if (!service) return null

    const visibleServiceIds = await filterMarketplaceVisibleServices([service.id])
    if (!visibleServiceIds.has(service.id)) return null

    let p: any = service.partners
    if (Array.isArray(p)) p = p[0]

    const store = Array.isArray(service.stores) ? service.stores[0] : service.stores
    const urlPartner = store || p || { id: service.partner_id }

    const partnerId = p?.id || service.partner_id
    const promotions = partnerId ? await listActivePromotionsForMarketplaceAction(partnerId) : []
    const unitPrice = Number(service.price) || 0
    const individualPromo = service.promotional_price ? Number(service.promotional_price) : null
    const pricing = computeItemDisplayPrice(unitPrice, individualPromo, promotions, { serviceId: service.id })

    const rawImages = service.images
    let imageUrl = "https://img.dudit.com.br/static/Placeholder.png"
    if (rawImages && Array.isArray(rawImages) && rawImages.length > 0) {
      imageUrl = getR2ImageUrl(rawImages[0])
    }

    return {
      type: "service",
      id: service.id,
      name: service.name,
      imageUrl,
      url: getServiceUrl(service, urlPartner),
      displayPrice: pricing.bestPrice,
      referencePrice: pricing.referencePrice || null,
      discountPercent: pricing.discountPercent,
      hasDiscount: pricing.hasDiscount,
      badgeVariant: pricing.badgeVariant,
      rating: service.rating || 0,
      showPrice: service.show_price_in_store !== false,
    }
  }

  if (type === "collection") {
    const { data: collection } = await supabase
      .from("collections")
      .select("id, name, cover_url, items_count")
      .eq("id", id)
      .maybeSingle()

    if (!collection) return null

    let imageUrl = "https://img.dudit.com.br/static/Placeholder.png"
    if (collection.cover_url) {
      imageUrl = collection.cover_url.startsWith("http")
        ? collection.cover_url
        : getR2ImageUrl(collection.cover_url)
    }

    return {
      type: "collection",
      id: collection.id,
      name: collection.name,
      imageUrl,
      url: `/colecoes/${collection.id}`,
      itemsCount: collection.items_count || 0,
    }
  }

  return null
}

export const getLinkedItemData = cache(
  (type: string, id: string, storeId?: string) => _getLinkedItemData(type, id, storeId)
)
