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
import { getPartnerDeliveryConfigAction } from "@/app/actions/shared/delivery"
import { computeItemDisplayPrice, calculateOrderPricing } from "@/lib/services/pricing-engine"
import { cachedResolveCheckoutCartLines, cachedListActivePromotionsInBatch } from "@/lib/cache/checkout-cache"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { getCachedAddresses } from "@/app/actions/shared/addresses"
import { toCanonicalPaymentType } from "@/lib/payments/payment-method"

export type MarketplaceCheckoutDepositConfig = {
  available: boolean
  percent: number
  previewAmount: number
  manualOnly: boolean
  manualEnabled: boolean
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
      partner: {
        id: string
        slug: string | null
        address: Record<string, unknown> | null
        storeName: string | null
        store_name: string | null
        mpConnected: boolean
        phone: string | null
        pixKey: string | null
        pixKeyType: string | null
        pickupPaymentPolicy: string
      }
      delivery: {
        planEnabled: boolean
        partnerEnabled: boolean
        pickupEnabled: boolean
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
}): Promise<MarketplaceCheckoutContextResult> {
  const user = await requireUser()
  if (!user) return { success: false, error: "Não autenticado" }

  if (!input.cartItemIds?.length) {
    return { success: false, error: "Nenhum item no checkout." }
  }

  const admin = getAdminClient()
  const resolved = await cachedResolveCheckoutCartLines(admin, user.id, input.cartItemIds)
  if (!resolved.success) return { success: false, error: resolved.error }

  const lineContexts = buildCheckoutLineContextsFromResolved(resolved.lines)
  const requirements = aggregateCheckoutRequirements(lineContexts)
  const displayLines = mapDisplayLinesFromResolved(resolved.lines)

  let productsSubtotal = 0
  let servicesSubtotal = 0
  let subscriptionsSubtotal = 0
  let depositPreviewBase = 0

  for (const line of resolved.lines) {
    const total = line.unitPrice * line.quantity
    if (line.itemType === "product") productsSubtotal += total
    else if (line.itemType === "service_booking") {
      servicesSubtotal += total
      depositPreviewBase += line.fullPrice ?? line.unitPrice * line.quantity
    } else subscriptionsSubtotal += total
  }

  const [{ data: partnerRow }, plan, deliveryConfig, pixMethodResult, promosMap, storefrontPaymentMethodsResult, userAddresses, bumpProductsResult] = await Promise.all([
    admin
      .from("partners")
      .select(
        "id, slug, store_name, service_deposit_enabled, service_deposit_percentage, service_deposit_manual_enabled, service_deposit_mp_enabled, mp_user_id, mp_accepted_payment_methods, phone, pickup_payment_policy, addresses(id, street, number, neighborhood, city, state, zip_code)",
      )
      .eq("id", resolved.partnerId)
      .maybeSingle(),
    getPartnerPlan(resolved.partnerId),
    getPartnerDeliveryConfigAction(resolved.partnerId),
    admin
      .from("payment_methods")
      .select("pix_key, pix_key_type")
      .eq("partner_id", resolved.partnerId)
      .eq("type", "pix")
      .eq("is_active", true)
      .maybeSingle(),
      cachedListActivePromotionsInBatch([resolved.partnerId], user.id),
    admin
      .from("payment_methods")
      .select(
        "id, type, payment_type, is_active, discount_percent, fee_percent, fee_fixed, max_installments, supports_installments, priority, card_brand"
      )
      .eq("partner_id", resolved.partnerId)
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .order("priority", { ascending: false })
      .order("discount_percent", { ascending: false }),
    getCachedAddresses(user.id, "user"),
    admin
      .from("products")
      .select("id, name, price, promotional_price, images, stock_available, availability_value, availability_unit")
      .eq("partner_id", resolved.partnerId)
      .eq("is_active", true)
      .eq("moderation_status", "approved")
      .eq("show_in_marketplace", true)
      .gt("stock_available", 0)
      .order("created_at", { ascending: false })
      .limit(5),
  ])

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
    const promoPrice = (resolvedLine.pricingItem as any).promotionalPrice
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
      admin
        .from("products")
        .select("id, name, price, images")
        .in("id", giftIds),
      admin
        .from("services")
        .select("id, name, price, images")
        .in("id", giftIds),
    ])

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
  const serviceDepositManualEnabled = Boolean(partnerRow?.service_deposit_manual_enabled)
  const serviceDepositMpEnabled = Boolean(partnerRow?.service_deposit_mp_enabled)
  const mpConnected = Boolean(input.mpConnected ?? partnerRow?.mp_user_id)

  const depositAvailable =
    requirements.hasServiceLines &&
    depositAllowed &&
    depositEnabled &&
    depositPreviewBase > 0 &&
    (serviceDepositManualEnabled || (serviceDepositMpEnabled && mpConnected))

  const previewAmount =
    depositAvailable ? Math.round(depositPreviewBase * (depositPercent / 100) * 100) / 100 : 0

  const addresses = partnerRow?.addresses
  const partnerAddress = Array.isArray(addresses) ? addresses[0] : addresses

  const rawMethods = (storefrontPaymentMethodsResult as any)?.data || []
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
    deposit: {
      available: depositAvailable,
      percent: depositPercent,
      previewAmount,
      manualOnly: depositAvailable && (!mpConnected || !serviceDepositMpEnabled),
      manualEnabled: serviceDepositManualEnabled,
      mpEnabled: serviceDepositMpEnabled,
    },
    partner: {
      id: resolved.partnerId,
      slug: partnerRow?.slug || null,
      address: (partnerAddress as Record<string, unknown>) || null,
      storeName: partnerRow?.store_name || null,
      store_name: partnerRow?.store_name || null,
      mpConnected,
      phone: partnerRow?.phone || null,
      pixKey: pixMethodResult?.data?.pix_key || null,
      pixKeyType: pixMethodResult?.data?.pix_key_type || null,
      pickupPaymentPolicy: (partnerRow as any)?.pickup_payment_policy || "require_online_payment",
    },
    delivery: {
      planEnabled: deliveryConfig.success ? deliveryConfig.capability.deliveryEnabled : false,
      partnerEnabled: deliveryConfig.success
        ? Boolean(deliveryConfig.settings.isDeliveryEnabled)
        : false,
      pickupEnabled: deliveryConfig.success
        ? Boolean(deliveryConfig.settings.isPickupEnabled ?? true)
        : true,
    },
    deliverySettings: deliveryConfig.success ? (deliveryConfig.settings as Record<string, unknown>) : null,
    storefrontPaymentMethods,
    userAddresses: (userAddresses || []) as Record<string, unknown>[],
    partnerBumpProducts: ((bumpProductsResult as any)?.data || []) as Record<string, unknown>[],
    mpAcceptedPaymentMethods: mpAcceptedPaymentMethods as any,
  }
}
