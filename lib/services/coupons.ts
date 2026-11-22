import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import type { PricingCoupon } from "@/lib/services/pricing-engine"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CouponValidationInput = {
  partnerId: string
  code: string
  customerId?: string | null
  subtotal: number
  shippingCost?: number
  items?: Array<{
    productId?: string | null
    serviceId?: string | null
    recurringPlanId?: string | null
    price?: number | null
    quantity?: number | null
  }>
  manualDiscount?: { type: "fixed" | "percentage"; value: number } | null
  /** When true (online storefront / marketplace checkout), rejects coupons not available in the storefront */
  marketplaceOnly?: boolean
}

export type CouponValidationResult = {
  valid: boolean
  couponId?: string
  couponCode?: string
  discountAmount: number
  errorMessage?: string
  /** Full coupon metadata for the pricing engine */
  pricingCoupon?: PricingCoupon | null
  /** Whether the coupon grants free shipping */
  freeShipping?: boolean
  /** Some cart lines are not eligible for this coupon */
  partialApplicabilityWarning?: boolean
  eligibleItemsCount?: number
  totalItemsCount?: number
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100
const safeMoney = (value: number) => {
  const numeric = Number(value || 0)
  if (!Number.isFinite(numeric)) return 0
  return Math.max(0, round2(numeric))
}

// ---------------------------------------------------------------------------
// Internal: Core validation logic
// ---------------------------------------------------------------------------

export async function validateCouponRow(
  supabase: any,
  coupon: any,
  input: {
    partnerId: string
    customerId?: string | null
    subtotal: number
    shippingCost?: number
    items?: Array<{ productId?: string | null; serviceId?: string | null; recurringPlanId?: string | null; price?: number | null; quantity?: number | null }>
    manualDiscount?: { type: "fixed" | "percentage"; value: number } | null
    marketplaceOnly?: boolean
  }
): Promise<CouponValidationResult> {
  if (input.marketplaceOnly && coupon.show_in_marketplace === false) {
    return { valid: false, discountAmount: 0, errorMessage: "Este cupom não está disponível na vitrine online." }
  }

  let resolvedCustomerId = input.customerId
  if (input.customerId && input.partnerId) {
    const { data: customerMapping } = await supabase
      .from("customers")
      .select("id")
      .eq("partner_id", input.partnerId)
      .eq("marketplace_user_id", input.customerId)
      .limit(1)
      .maybeSingle()

    if (customerMapping?.id) {
      resolvedCustomerId = customerMapping.id
    }
  }

  // Date validation
  const now = Date.now()
  if (coupon.starts_at && now < new Date(coupon.starts_at).getTime()) {
    return { valid: false, discountAmount: 0, errorMessage: "Cupom ainda não está disponível." }
  }
  if (coupon.ends_at && now > new Date(coupon.ends_at).getTime()) {
    return { valid: false, discountAmount: 0, errorMessage: "Cupom expirado." }
  }

  // Global usage limit
  const { count: usageCount } = await supabase
    .from("coupon_usages")
    .select("id", { count: "exact", head: true })
    .eq("coupon_id", coupon.id)

  if (coupon.usage_limit !== null && Number(usageCount || 0) >= Number(coupon.usage_limit || 0)) {
    return { valid: false, discountAmount: 0, errorMessage: "Limite de uso do cupom atingido." }
  }

  // Per-customer usage limit
  if (resolvedCustomerId && coupon.usage_per_customer !== null) {
    const { count: customerUsageCount } = await supabase
      .from("coupon_usages")
      .select("id", { count: "exact", head: true })
      .eq("coupon_id", coupon.id)
      .eq("customer_id", resolvedCustomerId)

    if (Number(customerUsageCount || 0) >= Number(coupon.usage_per_customer || 0)) {
      return { valid: false, discountAmount: 0, errorMessage: "Este cliente já atingiu o limite de uso." }
    }
  }

  // First purchase only
  if (coupon.first_purchase_only && input.customerId) {
    const { count: ordersCount } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("partner_id", input.partnerId)
      .or(`buyer_id.eq.${input.customerId},customer_id.eq.${resolvedCustomerId}`)

    if (Number(ordersCount || 0) > 0) {
      return { valid: false, discountAmount: 0, errorMessage: "Cupom válido apenas para primeira compra." }
    }
  }

  // ── Customer scope check ────────────────────────────────────────────
  if (coupon.customer_scope === "specific") {
    if (!resolvedCustomerId) {
      return { valid: false, discountAmount: 0, errorMessage: "Este cupom é exclusivo para clientes específicos." }
    }
    const { data: assignment } = await supabase
      .from("coupon_customers")
      .select("id")
      .eq("coupon_id", coupon.id)
      .eq("customer_id", resolvedCustomerId)
      .limit(1)
      .maybeSingle()

    if (!assignment?.id) {
      return { valid: false, discountAmount: 0, errorMessage: "Este cupom não é válido para este cliente." }
    }
  }

  // Min cart value
  const subtotal = Math.max(0, Number(input.subtotal || 0))
  const shippingCost = Math.max(0, Number(input.shippingCost || 0))
  if (subtotal < Number(coupon.min_cart_value || 0)) {
    return { valid: false, discountAmount: 0, errorMessage: "Valor mínimo da sacola não atingido." }
  }

  // ── Retrieve target scopes from relational tables ───────────────────
  let applicableProductIds: string[] | null = null
  let applicableServiceIds: string[] | null = null
  let applicableCategoryIds: string[] | null = null
  let applicablePlanIds: string[] | null = null

  if (coupon.apply_scope === "products") {
    const { data } = await supabase.from("coupon_products").select("product_id").eq("coupon_id", coupon.id)
    applicableProductIds = (data || []).map((r: any) => r.product_id).filter(Boolean)
  } else if (coupon.apply_scope === "services") {
    const { data } = await supabase.from("coupon_services").select("service_id").eq("coupon_id", coupon.id)
    applicableServiceIds = (data || []).map((r: any) => r.service_id).filter(Boolean)
  } else if (coupon.apply_scope === "categories") {
    const { data } = await supabase.from("coupon_categories").select("category_id").eq("coupon_id", coupon.id)
    applicableCategoryIds = (data || []).map((r: any) => r.category_id).filter(Boolean)
  } else if (coupon.apply_scope === "subscriptions") {
    const { data } = await supabase.from("coupon_subscriptions").select("recurring_plan_id").eq("coupon_id", coupon.id)
    applicablePlanIds = (data || []).map((r: any) => r.recurring_plan_id).filter(Boolean)
  }

  // ── Allow combination and scope check ───────────────────────────────
  const items = input.items || []
  const productIds = Array.from(new Set(items.map((item) => item.productId).filter(Boolean))) as string[]
  const serviceIds = Array.from(new Set(items.map((item) => item.serviceId).filter(Boolean))) as string[]

  let eligibleCount = 0
  let partialApplicabilityWarning = false
  let eligibleSubtotal = 0

  if (items.length > 0) {
    const productDetails = new Map<string, { category_id: string | null }>()
    const productPrices = new Map<string, number>()
    if (productIds.length > 0) {
      const { data: products } = await supabase
        .from("products")
        .select("id, category_id, price, promotional_price")
        .in("id", productIds)
      for (const p of products || []) {
        productDetails.set(p.id, { category_id: p.category_id || null })
        const bestP = p.promotional_price !== null && p.promotional_price > 0 && p.promotional_price < p.price
          ? p.promotional_price
          : p.price
        productPrices.set(p.id, Number(bestP) || 0)
      }
    }

    const servicePrices = new Map<string, number>()
    if (serviceIds.length > 0) {
      const { data: services } = await supabase
        .from("services")
        .select("id, price, promotional_price")
        .in("id", serviceIds)
      for (const s of services || []) {
        const bestS = s.promotional_price !== null && s.promotional_price > 0 && s.promotional_price < s.price
          ? s.promotional_price
          : s.price
        servicePrices.set(s.id, Number(bestS) || 0)
      }
    }

    for (const item of items) {
      let isScopeEligible = true
      if (coupon.apply_scope !== "all") {
        if (coupon.apply_scope === "products") {
          isScopeEligible = Boolean(item.productId && applicableProductIds?.includes(item.productId))
        } else if (coupon.apply_scope === "services") {
          isScopeEligible = Boolean(item.serviceId && applicableServiceIds?.includes(item.serviceId))
        } else if (coupon.apply_scope === "subscriptions") {
          isScopeEligible = Boolean(item.recurringPlanId && applicablePlanIds?.includes(item.recurringPlanId))
        } else if (coupon.apply_scope === "categories" && item.productId) {
          const catId = productDetails.get(item.productId)?.category_id
          isScopeEligible = Boolean(catId && applicableCategoryIds?.includes(catId))
        } else {
          isScopeEligible = false
        }
      }

      if (!isScopeEligible) {
        partialApplicabilityWarning = true
        continue
      }

      eligibleCount++
      const itemQty = Math.max(1, Number((item as any).quantity || 1))
      const itemPrice = (item as any).price != null
        ? Number((item as any).price || 0)
        : item.productId
        ? (productPrices.get(item.productId) ?? 0)
        : item.serviceId
        ? (servicePrices.get(item.serviceId) ?? 0)
        : 0
      eligibleSubtotal += itemPrice * itemQty
    }

    if (eligibleCount === 0) {
      return { valid: false, discountAmount: 0, errorMessage: "Nenhum item da sacola é elegível para este cupom." }
    }

    if (eligibleCount < items.length) {
      partialApplicabilityWarning = true
    }
  }

  // Calculate estimated discount amount based on eligible subtotal
  const finalSubtotal = (coupon.apply_scope === "all" || items.length === 0)
    ? subtotal
    : (eligibleSubtotal > 0 ? eligibleSubtotal : subtotal)

  let discountAmount = 0
  if (coupon.discount_type === "percentage") {
    discountAmount = safeMoney(finalSubtotal * (Number(coupon.discount_value || 0) / 100))
  } else if (coupon.discount_type === "fixed") {
    discountAmount = safeMoney(Number(coupon.discount_value || 0))
  } else if (coupon.discount_type === "free_shipping") {
    discountAmount = safeMoney(shippingCost)
  }

  if (coupon.max_discount_value !== null) {
    discountAmount = Math.min(discountAmount, safeMoney(Number(coupon.max_discount_value || 0)))
  }
  discountAmount = safeMoney(Math.min(discountAmount, safeMoney(finalSubtotal + shippingCost)))

  // Build PricingCoupon for the unified engine
  const isFreeShipping = coupon.discount_type === "free_shipping" || Boolean(coupon.free_shipping)
  const pricingCoupon: PricingCoupon = {
    id: coupon.id,
    discountType: coupon.discount_type || "fixed",
    discountValue: Number(coupon.discount_value || 0),
    maxDiscountValue: coupon.max_discount_value != null ? Number(coupon.max_discount_value) : null,
    freeShipping: isFreeShipping,
    allowCombination: Boolean(coupon.allow_combination),
    applyScope: coupon.apply_scope || "all",
    customerScope: coupon.customer_scope || "all",
    applicableProductIds,
    applicableServiceIds,
    applicableCategoryIds,
    applicablePlanIds,
  }

  return {
    valid: true,
    couponId: coupon.id,
    couponCode: coupon.code,
    discountAmount,
    pricingCoupon,
    freeShipping: isFreeShipping,
    partialApplicabilityWarning,
    eligibleItemsCount: eligibleCount,
    totalItemsCount: items.length,
  }
}

// ---------------------------------------------------------------------------
// Public: Validate a coupon by code
// ---------------------------------------------------------------------------

export async function validateCoupon(
  input: CouponValidationInput,
  supabaseOverride?: any
): Promise<CouponValidationResult> {
  const supabase = supabaseOverride || await getSupabaseServerClient()
  const code = String(input.code || "").trim().toUpperCase().replace(/\s+/g, "")
  if (!code) return { valid: false, discountAmount: 0, errorMessage: "Código do cupom inválido." }

  const { data: coupon, error } = await supabase
    .from("coupons")
    .select("*")
    .eq("partner_id", input.partnerId)
    .ilike("code", code)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle()

  if (error || !coupon) {
    return { valid: false, discountAmount: 0, errorMessage: "Cupom não encontrado ou inativo." }
  }

  return validateCouponRow(supabase, coupon, input)
}

// ---------------------------------------------------------------------------
// Public: Validate a coupon by ID (for internal use when coupon is already known)
// ---------------------------------------------------------------------------

export async function validateCouponById(
  couponId: string,
  input: Omit<CouponValidationInput, "code">
): Promise<CouponValidationResult> {
  const supabase = await getSupabaseServerClient()

  const { data: coupon, error } = await supabase
    .from("coupons")
    .select("*")
    .eq("id", couponId)
    .eq("partner_id", input.partnerId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle()

  if (error || !coupon) {
    return { valid: false, discountAmount: 0, errorMessage: "Cupom não encontrado ou inativo." }
  }

  return validateCouponRow(supabase, coupon, input)
}
