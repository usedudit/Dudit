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
  items?: Array<{ productId?: string | null; serviceId?: string | null; recurringPlanId?: string | null }>
  manualDiscount?: { type: "fixed" | "percentage"; value: number } | null
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
// Internal: Core validation logic (used by both validateCoupon and findBestAutomaticCoupon)
// ---------------------------------------------------------------------------

export async function validateCouponRow(
  supabase: any,
  coupon: any,
  input: {
    partnerId: string
    customerId?: string | null
    subtotal: number
    shippingCost?: number
    items?: Array<{ productId?: string | null; serviceId?: string | null; recurringPlanId?: string | null }>
    manualDiscount?: { type: "fixed" | "percentage"; value: number } | null
  }
): Promise<CouponValidationResult> {
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
  if (input.customerId && coupon.usage_per_customer !== null) {
    const { count: customerUsageCount } = await supabase
      .from("coupon_usages")
      .select("id", { count: "exact", head: true })
      .eq("coupon_id", coupon.id)
      .eq("customer_id", input.customerId)

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
      .eq("buyer_id", input.customerId)

    if (Number(ordersCount || 0) > 0) {
      return { valid: false, discountAmount: 0, errorMessage: "Cupom válido apenas para primeira compra." }
    }
  }

  // ── Customer scope check ────────────────────────────────────────────
  if (coupon.customer_scope === "specific") {
    if (!input.customerId) {
      return { valid: false, discountAmount: 0, errorMessage: "Este cupom é exclusivo para clientes específicos." }
    }
    const { data: assignment } = await supabase
      .from("coupon_customers")
      .select("id")
      .eq("coupon_id", coupon.id)
      .eq("customer_id", input.customerId)
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
    const productDetails = new Map<string, { category_id: string | null; isPromo: boolean }>()
    const productPrices = new Map<string, number>()
    if (productIds.length > 0) {
      const { data: products } = await supabase
        .from("products")
        .select("id, category_id, price, promotional_price")
        .in("id", productIds)
      for (const p of products || []) {
        const isPromo = p.promotional_price !== null && p.promotional_price > 0 && p.promotional_price < p.price
        productDetails.set(p.id, { category_id: p.category_id || null, isPromo })
        const bestP = isPromo ? p.promotional_price : p.price
        productPrices.set(p.id, Number(bestP) || 0)
      }
    }

    const serviceDetails = new Map<string, { isPromo: boolean }>()
    const servicePrices = new Map<string, number>()
    if (serviceIds.length > 0) {
      const { data: services } = await supabase
        .from("services")
        .select("id, price, promotional_price")
        .in("id", serviceIds)
      for (const s of services || []) {
        const isPromo = s.promotional_price !== null && s.promotional_price > 0 && s.promotional_price < s.price
        serviceDetails.set(s.id, { isPromo })
        const bestS = isPromo ? s.promotional_price : s.price
        servicePrices.set(s.id, Number(bestS) || 0)
      }
    }

    const { data: allActivePromos } = await supabase
      .from("promotions")
      .select(`
        id,
        allow_coupon_combination,
        apply_scope
      `)
      .eq("partner_id", input.partnerId)
      .eq("is_active", true)
      .not("campaign_id", "is", null)

    const promoIds = allActivePromos ? allActivePromos.map((p: any) => p.id) : []
    const [promoProductsRes, promoServicesRes, promoCategoriesRes] = await Promise.all([
      productIds.length > 0 && promoIds.length > 0
        ? supabase.from("promotion_products").select("promotion_id, product_id").in("promotion_id", promoIds).in("product_id", productIds)
        : Promise.resolve({ data: [] }),
      serviceIds.length > 0 && promoIds.length > 0
        ? supabase.from("promotion_services").select("promotion_id, service_id").in("promotion_id", promoIds).in("service_id", serviceIds)
        : Promise.resolve({ data: [] }),
      productIds.length > 0 && promoIds.length > 0
        ? supabase.from("products").select("category_id").in("id", productIds).then(async ({ data: products }: any) => {
            const catIds = Array.from(new Set((products || []).map((p: any) => p.category_id).filter(Boolean)))
            if (catIds.length === 0) return { data: [] }
            return supabase.from("promotion_categories").select("promotion_id, category_id").in("promotion_id", promoIds).in("category_id", catIds)
          })
        : Promise.resolve({ data: [] })
    ])

    const promoProductsData = promoProductsRes.data || []
    const promoServicesData = promoServicesRes.data || []
    const promoCategoriesData = promoCategoriesRes.data || []

    const doesPromoApplyToItem = (promo: any, item: any): boolean => {
      if (promo.apply_scope === "all" || promo.apply_scope === "entire_cart") {
        return true
      }
      if ((promo.apply_scope === "specific_products" || promo.apply_scope === "products") && item.productId) {
        return promoProductsData.some((pp: any) => pp.promotion_id === promo.id && pp.product_id === item.productId)
      }
      if ((promo.apply_scope === "specific_services" || promo.apply_scope === "services") && item.serviceId) {
        return promoServicesData.some((ps: any) => ps.promotion_id === promo.id && ps.service_id === item.serviceId)
      }
      if ((promo.apply_scope === "specific_categories" || promo.apply_scope === "category") && item.productId) {
        const catId = productDetails.get(item.productId)?.category_id
        return Boolean(catId && promoCategoriesData.some((pc: any) => pc.promotion_id === promo.id && pc.category_id === catId))
      }
      return false
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

      // Check combination
      const isManualPromo = item.productId
        ? (productDetails.get(item.productId)?.isPromo ?? false)
        : item.serviceId
        ? (serviceDetails.get(item.serviceId)?.isPromo ?? false)
        : false

      let isCampaignActive = false
      let isNonCombinableCampaignActive = false

      if (allActivePromos) {
        for (const promo of allActivePromos) {
          if (doesPromoApplyToItem(promo, item)) {
            isCampaignActive = true
            if (promo.allow_coupon_combination === false) {
              isNonCombinableCampaignActive = true
            }
          }
        }
      }

      let itemEligible = true
      if (coupon.allow_combination === false) {
        if (isManualPromo || isCampaignActive) {
          itemEligible = false
        }
      } else {
        if (isNonCombinableCampaignActive) {
          itemEligible = false
        }
      }

      const itemPrice = item.productId
        ? (productPrices.get(item.productId) ?? 0)
        : item.serviceId
        ? (servicePrices.get(item.serviceId) ?? 0)
        : 0

      if (itemEligible) {
        eligibleCount++
        eligibleSubtotal += itemPrice
      } else {
        partialApplicabilityWarning = true
      }
    }

    if (eligibleCount === 0) {
      return { valid: false, discountAmount: 0, errorMessage: "Nenhum item da sacola é elegível para este cupom." }
    }
  }

  // Calculate estimated discount amount based on eligible subtotal
  const finalSubtotal = items.length > 0 ? eligibleSubtotal : subtotal

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

// ---------------------------------------------------------------------------
// Public: Find the best automatic coupon for a given context
// ---------------------------------------------------------------------------

export type AutoCouponInput = {
  partnerId: string
  customerId?: string | null
  subtotal: number
  shippingCost?: number
  items?: Array<{ productId?: string | null; serviceId?: string | null; recurringPlanId?: string | null }>
}

export async function findBestAutomaticCoupon(input: AutoCouponInput, supabaseOverride?: any): Promise<CouponValidationResult> {
  const supabase = supabaseOverride || await getSupabaseServerClient()

  // Fetch all active automatic coupons for this partner
  const { data: autoCoupons, error } = await supabase
    .from("coupons")
    .select("*")
    .eq("partner_id", input.partnerId)
    .eq("is_active", true)
    .eq("is_automatic", true)
    .order("discount_value", { ascending: false })
    .limit(20)

  if (error || !autoCoupons || autoCoupons.length === 0) {
    return { valid: false, discountAmount: 0 }
  }

  // Validate each and pick the one with the highest discount
  let bestResult: CouponValidationResult = { valid: false, discountAmount: 0 }

  const results = await Promise.all(
    autoCoupons.map(async (coupon: any) => {
      const result = await validateCouponRow(supabase, coupon, input)
      return { coupon, result }
    })
  )

  for (const { result } of results) {
    if (result.valid && result.discountAmount > bestResult.discountAmount) {
      bestResult = result
    }
  }

  return bestResult
}
