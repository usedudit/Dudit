"use server"

import { getAdminClient } from "@/lib/supabase/admin"
import { requireUser } from "@/lib/auth/authorization"
import { aggregateCheckoutRequirements } from "@/lib/commerce/checkout-requirements"
import {
  buildCheckoutLineContextsFromResolved,
  mapDisplayLinesFromResolved,
  type MarketplaceCheckoutDisplayLine,
} from "@/lib/commerce/marketplace-checkout-lines"
import type { CheckoutRequirements } from "@/lib/commerce/checkout-requirements"
import { getPartnerPlan } from "@/lib/services/subscription.service"
import { hasMinimumPlan } from "@/lib/subscription/plan-tier"
import { getPartnerDeliveryConfigAction, resolveStoreFulfillmentCapabilities } from "@/app/actions/shared/delivery"
import { computeItemDisplayPrice, calculateOrderPricing } from "@/lib/services/pricing-engine"
import { filterMarketplaceVisibleProducts, filterMarketplaceVisibleServices } from "@/lib/resolve-marketplace-visibility"
import { cachedResolveCheckoutCartLines, cachedListActivePromotionsInBatch } from "@/lib/cache/checkout-cache"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { getCachedAddresses } from "@/app/actions/shared/addresses"
import { toCanonicalPaymentType } from "@/lib/payments/payment-method"
import { withMpPartnerFields } from "@/lib/services/payments/mercadopago-integration"
import {
  resolveMarketplaceCapabilities,
  type MarketplaceCapabilities,
} from "@/lib/marketplace-capabilities"

export type MarketplaceCheckoutDepositConfig = {
  available: boolean
  percent: number
  previewAmount: number
  mpEnabled: boolean
}

export type MarketplaceCheckoutContextResult =
  | {
      success: true
      requirements: CheckoutRequirements
      lines: MarketplaceCheckoutDisplayLine[]
      productsSubtotal: number
      servicesSubtotal: number
      subscriptionsSubtotal: number
      deposit: MarketplaceCheckoutDepositConfig
      capabilities: MarketplaceCapabilities
      store?: {
        id: string
        short_id?: string | null
        name: string
        slug: string | null
        logo_url: string | null
        address: Record<string, unknown> | null
        openingHours: any
      } | null
      partner: {
        id: string
        short_id?: string | null
        slug: string | null
        address: Record<string, unknown> | null
        name?: string | null
        storeName: string | null
        store_name?: string | null
        mpConnected: boolean
        phone: string | null
        pixKey: string | null
        pixKeyType: string | null
        pickupPaymentPolicy: string
        orderFlow: string
        planSlug: string
      }
      delivery: {
        planEnabled: boolean
        partnerEnabled: boolean
        pickupEnabled: boolean
        shippingEnabled: boolean
      }
      deliverySettings: Record<string, unknown> | null
      storefrontPaymentMethods: Array<{
        id: string
        type: string
        discountPercent: number
        feePercent: number
        feeFixed: number
        maxInstallments: number
        supportsInstallments: boolean
        cardBrand: string | null
      }>
      userAddresses: Record<string, unknown>[]
      partnerBumpProducts: Record<string, unknown>[]
      mpAcceptedPaymentMethods: {
        credit_card: boolean
        debit_card: boolean
        pix: boolean
        boleto: boolean
        mercado_pago_wallet: boolean
      }
    }
  | { success: false; error: string }

export async function getMarketplaceCheckoutContextAction(input: {
  partnerId: string
  cartItemIds: string[]
  mpConnected?: boolean
  storeId?: string
}): Promise<MarketplaceCheckoutContextResult> {
  const user = await requireUser()
  if (!user) return { success: false, error: "Não autenticado" }

  if (!input.cartItemIds?.length) {
    return { success: false, error: "Nenhum item no checkout." }
  }

  const admin = getAdminClient()
  const storeCaps = await resolveStoreFulfillmentCapabilities(input.partnerId, input.storeId || null)
  const resolved = await cachedResolveCheckoutCartLines(
    admin,
    user.id,
    input.cartItemIds,
    storeCaps,
  )
  if (!resolved.success) return { success: false, error: resolved.error }

  const lineContexts = buildCheckoutLineContextsFromResolved(resolved.lines)
  const requirements = aggregateCheckoutRequirements(lineContexts)
  const displayLines = mapDisplayLinesFromResolved(resolved.lines)

  let productsSubtotal = 0
  let servicesSubtotal = 0
  let subscriptionsSubtotal = 0

  for (const line of resolved.lines) {
    const total = line.unitPrice * line.quantity
    if (line.itemType === "product") productsSubtotal += total
    else if (line.itemType === "service_booking") {
      servicesSubtotal += total
    } else subscriptionsSubtotal += total
  }

  // Preserva o subtotal ORIGINAL de serviços (sem descontos de campanha/promoção)
  // para usar no cálculo do depósito, alinhado com o que o resolver do carrinho usa
  const originalServicesSubtotal = servicesSubtotal

  const targetStoreId = input.storeId || resolved.lines.find((l: any) => l.storeId)?.storeId || null

  const [{ data: partnerRow }, { data: storeRowData }, plan, deliveryConfig, promosMap, storefrontPaymentMethodsResult, userAddressesResult, bumpProductsResult, userCartProductsResult, marketplaceCapabilities] = await Promise.all([
    admin
      .from("partners")
      .select(
        "id, is_showcase_active, service_deposit_enabled, service_deposit_percentage, order_flow, business_info, partner_integrations(provider_slug, status, account_id, connected_at, config, metadata), addresses(id, street, number, neighborhood, city, state, zip_code)",
      )
      .eq("id", resolved.partnerId)
      .maybeSingle(),
    targetStoreId
      ? admin
          .from("stores")
          .select("id, is_showcase_active, accept_orders_when_closed, timezone, short_id, name, slug, logo_url, phone, pickup_payment_policy, opening_hours, addresses!store_id!left(id, zip_code, street, number, complement, neighborhood, city, state, is_default)")
          .eq("id", targetStoreId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    getPartnerPlan(resolved.partnerId),
    getPartnerDeliveryConfigAction(resolved.partnerId, targetStoreId),
    cachedListActivePromotionsInBatch([resolved.partnerId], user.id),
    (async () => {
      if (targetStoreId) {
        const { data: storeMethods } = await admin
          .from("payment_methods")
          .select(
            "id, type, payment_type, is_active, discount_percent, fee_percent, fee_fixed, max_installments, supports_installments, priority, card_brand, pix_key, pix_key_type, store_id"
          )
          .eq("partner_id", resolved.partnerId)
          .eq("store_id", targetStoreId)
          .eq("is_active", true)
          .order("is_default", { ascending: false })
          .order("priority", { ascending: false })
          .order("discount_percent", { ascending: false })

        if (storeMethods && storeMethods.length > 0) {
          return { data: storeMethods }
        }
      }

      return admin
        .from("payment_methods")
        .select(
          "id, type, payment_type, is_active, discount_percent, fee_percent, fee_fixed, max_installments, supports_installments, priority, card_brand, store_id"
        )
        .eq("partner_id", resolved.partnerId)
        .eq("is_active", true)
        .order("is_default", { ascending: false })
        .order("priority", { ascending: false })
        .order("discount_percent", { ascending: false })
    })(),
    admin
      .from("addresses")
      .select("id, zip_code, street, number, complement, neighborhood, city, state, is_default, latitude, longitude")
      .eq("user_id", user.id)
      .order("is_default", { ascending: false }),
    (() => {
      let q = admin
        .from("products")
        .select("id, short_id, name, price, promotional_price, images, stock_available, availability_value, availability_unit")
        .eq("partner_id", resolved.partnerId)
        .eq("is_active", true)
        .neq("moderation_status", "rejected")
        .eq("show_in_marketplace", true)
        .gt("stock_available", 0)
        .order("created_at", { ascending: false })
        .limit(5)
      if (input.storeId) q = q.eq("store_id", input.storeId)
      return q
    })(),
    // Produtos que já estão na sacola do usuário: não devem aparecer como
    // sugestão de order bump, senão clicar neles somaria a quantidade da sacola.
    admin
      .from("cart_items")
      .select("product_id")
      .eq("user_id", user.id)
      .eq("item_type", "product")
      .not("product_id", "is", null),
    resolveMarketplaceCapabilities(resolved.partnerId, { storeId: targetStoreId || null }),
  ])

  // mp_* status fields are sourced from partner_integrations.
  if (partnerRow) Object.assign(partnerRow, withMpPartnerFields(partnerRow))

  const { canStoreAcceptOrders, INACTIVE_SHOWCASE_ERROR } = await import("@/lib/commerce/store-showcase")
  const orderAcceptance = await canStoreAcceptOrders(admin, { storeId: targetStoreId || undefined, partnerId: resolved.partnerId })
  if (!orderAcceptance.allowed) {
    return { success: false, error: orderAcceptance.message || INACTIVE_SHOWCASE_ERROR }
  }

  const partnerPromotions = promosMap?.[resolved.partnerId] || []

  const resolvedLinesMap = new Map<string, any>()
  for (const l of resolved.lines || []) {
    if (l.cartItemId) {
      resolvedLinesMap.set(l.cartItemId, l)
    }
  }

  // Apply campaign pricing to display lines and fix image URLs
  for (const line of displayLines) {
    if (line.imageUrl) {
      line.imageUrl = getR2ImageUrl(line.imageUrl)
    }
    if (line.lineKind !== "product" && line.lineKind !== "service_booking") continue
    // Find the original resolved line for base price / promo data using Map lookup
    const resolvedLine = resolvedLinesMap.get(line.lineId)
    if (!resolvedLine) continue
    const basePrice = Number((resolvedLine.pricingItem as any).basePrice || line.unitPrice)
    const promoPrice = resolvedLine.variantId ? null : (resolvedLine.pricingItem as any).promotionalPrice
    const hasPromo = promoPrice != null && Number(promoPrice) > 0 && Number(promoPrice) < basePrice

    const pricing = computeItemDisplayPrice(
      basePrice,
      hasPromo ? Number(promoPrice) : null,
      partnerPromotions,
      {
        productId: resolvedLine.productId,
        categoryId: resolvedLine.categoryId,
        serviceId: resolvedLine.serviceId,
      }
    )

    line.unitPrice = pricing.bestPrice
    line.lineTotal = pricing.bestPrice * line.quantity
    line.discountSource = pricing.discountSource
    line.bestPrice = pricing.bestPrice
  }

  // Recalculate subtotals with campaign pricing
  productsSubtotal = displayLines
    .filter(l => l.lineKind === "product")
    .reduce((sum, l) => sum + l.lineTotal, 0)

  servicesSubtotal = displayLines
    .filter(l => l.lineKind === "service_booking")
    .reduce((sum, l) => sum + l.lineTotal, 0)

  // Calculate order pricing with promotions to check for earned gifts
  const pricingItems = resolved.lines.map((line) => line.pricingItem)
  const pricingResult = calculateOrderPricing({
    items: pricingItems,
    shippingCost: 0,
    promotions: partnerPromotions,
  })

  const giftIds = pricingResult.appliedGiftProductIds || []
  if (giftIds.length > 0) {
    const [productsRes, servicesRes] = await Promise.all([
      (() => {
        let q = admin.from("products").select("id, name, price, images").in("id", giftIds)
        if (input.storeId) q = q.eq("store_id", input.storeId)
        return q
      })(),
      (() => {
        let q = admin.from("services").select("id, name, price, images").in("id", giftIds)
        if (input.storeId) q = q.eq("store_id", input.storeId)
        return q
      })(),
    ])

    if (productsRes.data && productsRes.data.length > 0) {
      const visibleProductIds = await filterMarketplaceVisibleProducts(productsRes.data.map((p: any) => p.id))
      productsRes.data = productsRes.data.filter((p: any) => visibleProductIds.has(p.id))
    }
    if (servicesRes.data && servicesRes.data.length > 0) {
      const visibleServiceIds = await filterMarketplaceVisibleServices(servicesRes.data.map((s: any) => s.id))
      servicesRes.data = servicesRes.data.filter((s: any) => visibleServiceIds.has(s.id))
    }

    const giftProducts = productsRes.data || []
    const giftServices = servicesRes.data || []

    for (const giftId of giftIds) {
      const prod = giftProducts.find((p: any) => p.id === giftId)
      if (prod) {
        displayLines.push({
          lineId: `gift-${prod.id}`,
          lineKind: "product",
          displayName: `[BRINDE] ${prod.name}`,
          quantity: 1,
          unitPrice: 0,
          lineTotal: 0,
          fulfillmentMode: null,
          paymentRequirement: "none",
          imageUrl: prod.images && Array.isArray(prod.images) && prod.images[0] ? getR2ImageUrl(prod.images[0]) : null,
          baseName: prod.name,
          variantName: null,
          isGift: true,
          originalPrice: Number(prod.price || 0),
        })
      } else {
        const serv = giftServices.find((s: any) => s.id === giftId)
        if (serv) {
          displayLines.push({
            lineId: `gift-${serv.id}`,
            lineKind: "service_booking",
            displayName: `[BRINDE] ${serv.name}`,
            quantity: 1,
            unitPrice: 0,
            lineTotal: 0,
            fulfillmentMode: null,
            paymentRequirement: "none",
            imageUrl: serv.images && Array.isArray(serv.images) && serv.images[0] ? getR2ImageUrl(serv.images[0]) : null,
            baseName: serv.name,
            variantName: null,
            isGift: true,
            originalPrice: Number(serv.price || 0),
          })
        }
      }
    }
  }

  const depositAllowed = hasMinimumPlan(plan?.slug || "free", "crescer")
  const depositPercent = Number(partnerRow?.service_deposit_percentage || 50)
  const depositEnabled = Boolean(partnerRow?.service_deposit_enabled)
  const serviceDepositMpEnabled = Boolean(partnerRow?.service_deposit_enabled && partnerRow?.mp_user_id)
  const mpConnected = Boolean(input.mpConnected ?? partnerRow?.mp_user_id)

  const depositAvailable =
    requirements.hasServiceLines &&
    depositAllowed &&
    depositEnabled &&
    servicesSubtotal > 0 &&
    serviceDepositMpEnabled &&
    mpConnected

  const previewAmount =
    depositAvailable ? Math.round(originalServicesSubtotal * (depositPercent / 100) * 100) / 100 : 0

  const addresses = partnerRow?.addresses
  const partnerAddress = Array.isArray(addresses) ? addresses[0] : addresses
  const storeAddress = (storeRowData as any)?.addresses?.[0] || null
  const effectiveAddress = storeAddress || partnerAddress
  const effectiveStoreName = (storeRowData as any)?.name || null

  const rawMethods = (storefrontPaymentMethodsResult as any)?.data || []
  const pixMethod = rawMethods.find((m: any) => m.type === "pix") || null
  const bestByType = new Map<string, any>()
  const typeOrder = ["pix", "credit_card", "debit_card", "cash", "other"]
  for (const m of rawMethods) {
    const canonicalType = toCanonicalPaymentType(m.type || m.payment_type)
    if (bestByType.has(canonicalType)) continue
    bestByType.set(canonicalType, {
      id: String(m.id),
      type: canonicalType,
      discountPercent: Math.max(0, Number(m.discount_percent || 0)),
      feePercent: Math.max(0, Number(m.fee_percent || 0)),
      feeFixed: Math.max(0, Number(m.fee_fixed || 0)),
      maxInstallments: Math.max(1, Number(m.max_installments || 1)),
      supportsInstallments: Boolean(m.supports_installments ?? ((m.max_installments || 1) > 1)),
      cardBrand: m.card_brand || null,
    })
  }
  const storefrontPaymentMethods = typeOrder.filter((t) => bestByType.has(t)).map((t) => bestByType.get(t)!)

  const mpAcct = (partnerRow as any)?.mp_accepted_payment_methods
  const mpAcceptedPaymentMethods = {
    credit_card: true,
    debit_card: true,
    pix: true,
    boleto: true,
    mercado_pago_wallet: true,
    ...(mpAcct || {}),
  }

  return {
    success: true,
    requirements,
    lines: displayLines,
    productsSubtotal,
    servicesSubtotal,
    subscriptionsSubtotal,
    capabilities: marketplaceCapabilities,
    deposit: {
      available: depositAvailable,
      percent: depositPercent,
      previewAmount,
      mpEnabled: serviceDepositMpEnabled,
    },
    store: storeRowData ? {
      id: (storeRowData as any).id,
      short_id: (storeRowData as any).short_id || null,
      name: (storeRowData as any).name,
      slug: (storeRowData as any).slug || null,
      logo_url: (storeRowData as any).logo_url || null,
      address: (storeAddress as Record<string, unknown>) || null,
      openingHours: (storeRowData as any).opening_hours || null,
    } : null,
    partner: {
      id: resolved.partnerId,
      short_id: (storeRowData as any)?.short_id || null,
      slug: (storeRowData as any)?.slug || null,
      address: (effectiveAddress as Record<string, unknown>) || null,
      name: effectiveStoreName,
      storeName: effectiveStoreName,
      store_name: effectiveStoreName,
      mpConnected,
      phone: (storeRowData as any)?.phone || marketplaceCapabilities.whatsappPhone || partnerRow?.phone || null,
      pixKey: pixMethod?.pix_key || null,
      pixKeyType: pixMethod?.pix_key_type || null,
      pickupPaymentPolicy: (partnerRow as any)?.pickup_payment_policy || "require_online_payment",
      orderFlow: marketplaceCapabilities.checkoutViaDudit
        ? marketplaceCapabilities.baseOrderFlow
        : "whatsapp",
      planSlug: plan?.slug || "free",
    },
    delivery: {
      planEnabled: deliveryConfig.success ? deliveryConfig.capability.deliveryEnabled : false,
      partnerEnabled: deliveryConfig.success
        ? Boolean(deliveryConfig.settings.isDeliveryEnabled)
        : false,
      pickupEnabled: deliveryConfig.success
        ? Boolean(deliveryConfig.settings.isPickupEnabled ?? true)
        : true,
      shippingEnabled: storeCaps.shipping,
    },
    deliverySettings: deliveryConfig.success ? (deliveryConfig.settings as Record<string, unknown>) : null,
    storefrontPaymentMethods,
    userAddresses: ((userAddressesResult as any)?.data || []) as Record<string, unknown>[],
    partnerBumpProducts: (() => {
      const cartProductIds = new Set(
        ((userCartProductsResult as any)?.data || [])
          .map((row: any) => row.product_id)
          .filter(Boolean)
      )
      return (((bumpProductsResult as any)?.data || []) as Record<string, unknown>[])
        .filter((p: any) => !cartProductIds.has(p.id))
    })(),
    mpAcceptedPaymentMethods: mpAcceptedPaymentMethods as any,
  }
}
