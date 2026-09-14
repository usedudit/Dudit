import type { SupabaseClient } from "@supabase/supabase-js"
import type { PricingItem } from "@/lib/services/pricing-engine"
import type {
  CheckoutFulfillmentLine,
  CheckoutFulfillmentPayload,
  LineFulfillmentMode,
  ServiceBookingMetadata,
} from "@/lib/types/marketplace-cart"
import {
  isFulfillmentModeAllowed,
  mergePlanItemFulfillmentModes,
  pickDefaultFulfillmentMode,
  productCatalogCapabilities,
  serviceCatalogCapabilities,
  type CatalogCapabilities,
  type FulfillmentMode,
} from "@/lib/commerce/capabilities"
import { hasMinimumPlan } from "@/lib/subscription/plan-tier"
import { getPartnerPlan } from "@/lib/services/subscription.service"

export type ResolvedCartLine = {
  cartItemId: string
  itemType: "product" | "service_booking" | "subscription"
  partnerId: string
  storeId?: string | null
  quantity: number
  unitPrice: number
  lineName: string
  productId?: string | null
  variantId?: string | null
  serviceId?: string | null
  recurringPlanId?: string | null
  categoryId?: string | null
  bookingMetadata?: ServiceBookingMetadata | null
  payDepositOnly: boolean
  depositAmount: number | null
  fullPrice: number | null
  pricingItem: PricingItem
  orderItemRow: Record<string, unknown>
  fulfillmentLine: CheckoutFulfillmentLine
  requiresStock: boolean
  stockProductId?: string | null
  stockVariantId?: string | null
  fulfillmentMode: LineFulfillmentMode | null
  lineRequiresDelivery: boolean
  capabilities: CatalogCapabilities
  imageUrl: string | null
  baseName: string
  variantName: string | null
  selectedAddons?: Array<{
    groupId: string
    groupName: string
    optionId: string
    optionName: string
    price: number
  }> | null
  unit?: string | null
}

export type ResolveCartResult =
  | {
    success: true
    lines: ResolvedCartLine[]
    partnerId: string
    hasProducts: boolean
    hasDeliveryLines: boolean
  }
  | { success: false; error: string }

function resolveLineFulfillmentMode(
  allowed: FulfillmentMode[],
  selected: string | null | undefined,
  fallback: FulfillmentMode,
): FulfillmentMode {
  if (selected && isFulfillmentModeAllowed(allowed, selected as FulfillmentMode)) {
    return selected as FulfillmentMode
  }
  if (isFulfillmentModeAllowed(allowed, fallback)) return fallback
  return pickDefaultFulfillmentMode(allowed)
}

function planTotalFromItems(items: Array<{ unit_price: number | null; quantity: number }>): number {
  return items.reduce((sum, row) => sum + Number(row.unit_price || 0) * Number(row.quantity || 1), 0)
}

export async function resolveCheckoutCartLines(
  supabase: SupabaseClient,
  userId: string,
  cartItemIds: string[],
): Promise<ResolveCartResult> {
  if (!cartItemIds.length) {
    return { success: false, error: "Nenhum item selecionado." }
  }

  const { data: rows, error } = await supabase
    .from("cart_items")
    .select(`
      id, user_id, partner_id, item_type, product_id, variant_id, service_id,
      recurring_plan_id, quantity, booking_metadata, pay_deposit_only, fulfillment_mode,
      products(id, name, price, promotional_price, is_active, stock_available, category_id, product_type, fulfillment_modes, images, cost_price, allow_sell_without_stock, unit),
      product_variants(id, variant_name, price_adjustment, stock_available, is_active),
      services(id, name, price, promotional_price, is_active, fulfillment_modes, payment_requirement, buffer_minutes, images, category_id, cost_price),
      recurring_plans(
        id, name, status, show_in_marketplace,
        recurring_plan_items(
          unit_price, quantity, item_type, product_id, service_id,
          products(fulfillment_modes, product_type),
          services(fulfillment_modes)
        )
      )
    `)
    .eq("user_id", userId)
    .in("id", cartItemIds)

  if (error || !rows?.length) {
    return { success: false, error: "Itens da sacola não encontrados." }
  }

  if (rows.length !== cartItemIds.length) {
    return { success: false, error: "Alguns itens da sacola não foram encontrados." }
  }

  const partnerIds = [...new Set(rows.map((r: any) => r.partner_id))]
  if (partnerIds.length > 1) {
    return { success: false, error: "Finalize um parceiro por vez no checkout." }
  }

  const partnerId = partnerIds[0] as string
  const lines: ResolvedCartLine[] = []
  let hasProducts = false
  let hasDeliveryLines = false

  const { canStoreAcceptOrders, INACTIVE_SHOWCASE_ERROR } = await import("@/lib/commerce/store-showcase")
  const rowStoreIds = [...new Set(rows.map((r: any) => r.store_id).filter(Boolean))] as string[]
  if (rowStoreIds.length > 0) {
    for (const sId of rowStoreIds) {
      const acceptance = await canStoreAcceptOrders(supabase, { storeId: sId, partnerId })
      if (!acceptance.allowed) {
        return { success: false, error: acceptance.message || INACTIVE_SHOWCASE_ERROR }
      }
    }
  } else {
    const acceptance = await canStoreAcceptOrders(supabase, { partnerId })
    if (!acceptance.allowed) {
      return { success: false, error: acceptance.message || INACTIVE_SHOWCASE_ERROR }
    }
  }

  const { data: partner } = await supabase
    .from("partners")
    .select("service_deposit_enabled, service_deposit_percentage")
    .eq("id", partnerId)
    .maybeSingle()

  const plan = await getPartnerPlan(partnerId)
  const depositAllowed = hasMinimumPlan(plan?.slug || "free", "crescer")

  for (const row of rows as any[]) {
    const itemType = row.item_type || "product"
    const qty = Math.max(1, Number(row.quantity || 1))

    if (itemType === "product") {
      hasProducts = true
      const product = row.products
      if (!product?.is_active) {
        return { success: false, error: `Produto indisponível.` }
      }

      let unitPrice: number
      let lineName = product.name
      let variantId: string | null = row.variant_id || null

      if (variantId && row.product_variants) {
        const variant = row.product_variants
        if (!variant.is_active) return { success: false, error: "Variante indisponível." }
        if (!product.allow_sell_without_stock && (variant.stock_available ?? 0) < qty) {
          return { success: false, error: `Estoque insuficiente: ${variant.variant_name}` }
        }
        unitPrice = Number(variant.price_adjustment || product.price)
        lineName = `${product.name} - ${variant.variant_name}`
      } else {
        if (!product.allow_sell_without_stock && (product.stock_available ?? 0) < qty) {
          return { success: false, error: `Estoque insuficiente: ${product.name}` }
        }
        const base = Number(product.price)
        const promo = product.promotional_price ? Number(product.promotional_price) : 0
        unitPrice = promo > 0 && promo < base ? promo : base
      }

      const selectedAddons: Array<{
        groupId: string
        groupName: string
        optionId: string
        optionName: string
        price: number
      }> | null = Array.isArray(row.booking_metadata?.selectedAddons)
        ? row.booking_metadata.selectedAddons
        : null

      const addonsUnitPrice = (selectedAddons || []).reduce(
        (sum: number, a: any) => sum + (Number(a.price) || 0),
        0,
      )
      const baseUnitPrice = unitPrice
      unitPrice = baseUnitPrice + addonsUnitPrice

      const caps = productCatalogCapabilities(product)
      const fulfillmentMode = resolveLineFulfillmentMode(
        caps.fulfillmentModes,
        row.fulfillment_mode,
        row.fulfillment_mode === "delivery" ? "delivery" : "pickup",
      ) as LineFulfillmentMode
      if (fulfillmentMode === "delivery") hasDeliveryLines = true

      const subtotal = unitPrice * qty
      const fulfillmentLine: CheckoutFulfillmentLine = {
        cartItemId: row.id,
        itemType: "product",
        productId: row.product_id,
        variantId,
        quantity: qty,
        unitPrice,
        lineName,
        fulfillmentMode,
        selectedAddons,
      }

      lines.push({
        cartItemId: row.id,
        itemType: "product",
        partnerId,
        quantity: qty,
        unitPrice,
        lineName,
        productId: row.product_id,
        variantId,
        categoryId: product.category_id,
        payDepositOnly: false,
        depositAmount: null,
        fullPrice: null,
        pricingItem: {
          productId: row.product_id,
          unitPrice,
          quantity: qty,
          promotionalPrice: variantId ? null : (product.promotional_price ? Number(product.promotional_price) + addonsUnitPrice : null),
          basePrice: (variantId ? baseUnitPrice : Number(product.price) || 0) + addonsUnitPrice,
          categoryId: product.category_id,
        },
        orderItemRow: {
          product_id: row.product_id,
          variant_id: variantId,
          product_name: lineName,
          product_price: unitPrice,
          quantity: qty,
          subtotal,
          line_type: "product",
          fulfillment_mode: fulfillmentMode,
          service_id: null,
          recurring_plan_id: null,
          unit_cost: Number(product.cost_price || 0),
        },
        fulfillmentLine,
        requiresStock: true,
        stockProductId: row.product_id,
        stockVariantId: variantId,
        fulfillmentMode,
        lineRequiresDelivery: fulfillmentMode === "delivery",
        capabilities: caps,
        imageUrl: product.images?.[0] || null,
        baseName: product.name,
        variantName: (variantId && row.product_variants) ? row.product_variants.variant_name : null,
        storeId: row.store_id || null,
        selectedAddons,
        unit: (product as any)?.unit || null,
      })
      continue
    }

    if (itemType === "service_booking") {
      const service = row.services
      const meta = row.booking_metadata as ServiceBookingMetadata | null
      if (!service?.is_active || !meta) {
        return { success: false, error: "Agendamento inválido na sacola." }
      }

      const caps = serviceCatalogCapabilities(service)
      const fulfillmentMode = resolveLineFulfillmentMode(
        caps.fulfillmentModes,
        row.fulfillment_mode,
        "on_site",
      ) as LineFulfillmentMode
      if (fulfillmentMode === "customer_location") hasDeliveryLines = true

      const basePrice = Number(service.price || 0)
      const promoPrice = service.promotional_price != null && Number(service.promotional_price) >= 0 && Number(service.promotional_price) < basePrice
        ? Number(service.promotional_price)
        : null

      const fullPrice = Number(meta.price || service.price || 0)
      let unitPrice = fullPrice
      let payDepositOnly = Boolean(row.pay_deposit_only)

      if (caps.paymentRequirement === "deposit_only") {
        payDepositOnly = true
      }

      let depositAmount: number | null = null
      if (depositAllowed && partner?.service_deposit_enabled && caps.paymentRequirement !== "full_payment") {
        const pct = Number(partner.service_deposit_percentage || 50) / 100
        depositAmount = Math.round(fullPrice * qty * pct * 100) / 100
      }

      if (payDepositOnly && depositAmount) {
        if (!depositAllowed || !partner?.service_deposit_enabled) {
          return { success: false, error: "Entrada não disponível para esta loja." }
        }
        unitPrice = Math.round(fullPrice * (Number(partner.service_deposit_percentage || 50) / 100) * 100) / 100
      }

      const subtotal = unitPrice * qty
      const lineName = service.name
      const fulfillmentLine: CheckoutFulfillmentLine = {
        cartItemId: row.id,
        itemType: "service_booking",
        serviceId: row.service_id,
        quantity: qty,
        unitPrice,
        lineName,
        fulfillmentMode,
        bookingMetadata: meta,
        payDepositOnly,
        depositAmount,
        fullPrice,
      }

      lines.push({
        cartItemId: row.id,
        itemType: "service_booking",
        partnerId,
        quantity: qty,
        unitPrice,
        lineName,
        serviceId: row.service_id,
        bookingMetadata: meta,
        payDepositOnly,
        depositAmount,
        fullPrice,
        pricingItem: {
          serviceId: row.service_id,
          unitPrice,
          quantity: qty,
          promotionalPrice: promoPrice,
          basePrice,
          categoryId: service.category_id || null,
        },
        orderItemRow: {
          product_id: null,
          variant_id: null,
          product_name: lineName,
          product_price: unitPrice,
          quantity: qty,
          subtotal,
          service_id: row.service_id,
          line_type: "service_booking",
          fulfillment_mode: fulfillmentMode,
          recurring_plan_id: null,
          unit_cost: Number(service.cost_price || 0),
        },
        fulfillmentLine,
        requiresStock: false,
        fulfillmentMode,
        lineRequiresDelivery: fulfillmentMode === "customer_location",
        capabilities: caps,
        imageUrl: service.images?.[0] || null,
        baseName: service.name,
        variantName: null,
        storeId: row.store_id || null,
      })
      continue
    }

    if (itemType === "subscription") {
      const planRow = row.recurring_plans
      if (!planRow || planRow.status !== "active" || !planRow.show_in_marketplace) {
        return { success: false, error: "Plano de assinatura indisponível." }
      }

      const planItems = planRow.recurring_plan_items || []

      // Calculate subscription unit cost from plan items
      let subscriptionUnitCost = 0
      const productModeLists: FulfillmentMode[][] = []
      const serviceModeLists: FulfillmentMode[][] = []
      for (const pi of planItems as any[]) {
        if (pi.item_type === "product" && pi.products) {
          subscriptionUnitCost += Number(pi.products.cost_price || 0) * Number(pi.quantity || 1)
          productModeLists.push(
            productCatalogCapabilities(pi.products).fulfillmentModes,
          )
        }
        if (pi.item_type === "service" && pi.services) {
          subscriptionUnitCost += Number(pi.services.cost_price || 0) * Number(pi.quantity || 1)
          serviceModeLists.push(
            serviceCatalogCapabilities(pi.services).fulfillmentModes,
          )
        }
      }

      const mergedModes = mergePlanItemFulfillmentModes(productModeLists, serviceModeLists)
      const caps: CatalogCapabilities = {
        fulfillmentModes: mergedModes,
        paymentRequirement: "full_payment",
        schedulingEnabled: false,
      }

      const fulfillmentMode = resolveLineFulfillmentMode(
        mergedModes,
        row.fulfillment_mode,
        mergedModes.includes("delivery") ? "delivery" : pickDefaultFulfillmentMode(mergedModes),
      ) as LineFulfillmentMode
      if (fulfillmentMode === "delivery" || fulfillmentMode === "customer_location") {
        hasDeliveryLines = true
      }

      const unitPrice = planTotalFromItems(planItems)
      const subtotal = unitPrice * qty
      const lineName = planRow.name || "Assinatura"

      const fulfillmentLine: CheckoutFulfillmentLine = {
        cartItemId: row.id,
        itemType: "subscription",
        recurringPlanId: row.recurring_plan_id,
        quantity: qty,
        unitPrice,
        lineName,
        fulfillmentMode,
      }

      lines.push({
        cartItemId: row.id,
        itemType: "subscription",
        partnerId,
        quantity: qty,
        unitPrice,
        lineName,
        recurringPlanId: row.recurring_plan_id,
        payDepositOnly: false,
        depositAmount: null,
        fullPrice: unitPrice,
        pricingItem: {
          serviceId: null,
          productId: null,
          recurringPlanId: row.recurring_plan_id,
          unitPrice,
          quantity: qty,
        },
        orderItemRow: {
          product_id: null,
          variant_id: null,
          product_name: lineName,
          product_price: unitPrice,
          quantity: qty,
          subtotal,
          recurring_plan_id: row.recurring_plan_id,
          line_type: "subscription",
          fulfillment_mode: fulfillmentMode,
          service_id: null,
          unit_cost: subscriptionUnitCost,
        },
        fulfillmentLine,
        requiresStock: false,
        fulfillmentMode,
        lineRequiresDelivery: fulfillmentMode === "delivery",
        capabilities: caps,
        imageUrl: null,
        baseName: planRow.name || "Assinatura",
        variantName: null,
        storeId: row.store_id || null,
      })
    }
  }

  return { success: true, lines, partnerId, hasProducts, hasDeliveryLines }
}

/** Legacy order-level delivery fields: derived from product/subscription lines that use delivery or order-level deliveryType. */
export function deriveOrderDeliveryFields(
  lines: ResolvedCartLine[],
  deliveryAddress: string,
  requestedDeliveryType?: "delivery" | "pickup",
): { deliveryType: "delivery" | "pickup"; deliveryAddress: string } {
  const hasProducts = lines.some((l) => l.itemType === "product")
  const anyDelivery = lines.some((l) => l.lineRequiresDelivery) || (hasProducts && requestedDeliveryType === "delivery") || requestedDeliveryType === "delivery"
  return {
    deliveryType: anyDelivery ? "delivery" : "pickup",
    deliveryAddress: anyDelivery ? deliveryAddress : "",
  }
}

export function buildFulfillmentPayload(
  buyerId: string,
  partnerId: string,
  lines: ResolvedCartLine[],
  deliveryAddress: string,
  requestedDeliveryType?: "delivery" | "pickup",
): CheckoutFulfillmentPayload {
  const { deliveryType, deliveryAddress: address } = deriveOrderDeliveryFields(lines, deliveryAddress, requestedDeliveryType)

  return {
    version: 1,
    buyerId,
    partnerId,
    lines: lines
      .filter((l) => l.itemType !== "product")
      .map((l) => l.fulfillmentLine),
    deliveryType,
    deliveryAddress: address,
  }
}
