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

  // ── Allow combination check ──────────────────────────────────────────
  // A. Check manual discount (only blocks if coupon itself blocks combination)
  if (coupon.allow_combination === false && input.manualDiscount && input.manualDiscount.value > 0) {
    return { valid: false, discountAmount: 0, errorMessage: "Este cupom não pode ser combinado com descontos manuais." }
  }

  const items = input.items || []
  const productIds = Array.from(new Set(items.map((item) => item.productId).filter(Boolean))) as string[]
  const serviceIds = Array.from(new Set(items.map((item) => item.serviceId).filter(Boolean))) as string[]

  if (productIds.length > 0 || serviceIds.length > 0) {
    // B. Check promotional_price on products (only blocks if coupon itself blocks combination)
    if (coupon.allow_combination === false && productIds.length > 0) {
      const { data: products } = await supabase
        .from("products")
        .select("id, price, promotional_price")
        .in("id", productIds)

      const hasPromo = (products || []).some(
        (p: any) => p.promotional_price !== null && p.promotional_price > 0 && p.promotional_price < p.price
      )
      if (hasPromo) {
        return { valid: false, discountAmount: 0, errorMessage: "Este cupom não pode ser combinado com produtos em promoção." }
      }
    }

    // C. Check promotional_price on services (only blocks if coupon itself blocks combination)
    if (coupon.allow_combination === false && serviceIds.length > 0) {
      const { data: services } = await supabase
        .from("services")
        .select("id, price, promotional_price")
        .in("id", serviceIds)

      const hasPromo = (services || []).some(
        (s: any) => s.promotional_price !== null && s.promotional_price > 0 && s.promotional_price < s.price
      )
      if (hasPromo) {
        return { valid: false, discountAmount: 0, errorMessage: "Este cupom não pode ser combinado com serviços em promoção." }
      }
    }

    // D. Check active campaign promotions compatibility
    let productCategoryIds: string[] = []
    if (productIds.length > 0) {
      const { data: products } = await supabase
        .from("products")
        .select("category_id")
        .in("id", productIds)
      productCategoryIds = Array.from(new Set((products || []).map((p: any) => p.category_id).filter(Boolean)))
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

    if (allActivePromos && allActivePromos.length > 0) {
      const promoIds = allActivePromos.map((p: any) => p.id)

      const [promoProductsRes, promoServicesRes, promoCategoriesRes] = await Promise.all([
        productIds.length > 0
          ? supabase.from("promotion_products").select("promotion_id, product_id").in("promotion_id", promoIds).in("product_id", productIds)
          : Promise.resolve({ data: [] }),
        serviceIds.length > 0
          ? supabase.from("promotion_services").select("promotion_id, service_id").in("promotion_id", promoIds).in("service_id", serviceIds)
          : Promise.resolve({ data: [] }),
        productCategoryIds.length > 0
          ? supabase.from("promotion_categories").select("promotion_id, category_id").in("promotion_id", promoIds).in("category_id", productCategoryIds)
          : Promise.resolve({ data: [] })
      ])

      const promoProducts = promoProductsRes.data || []
      const promoServices = promoServicesRes.data || []
      const promoCategories = promoCategoriesRes.data || []

      const applicablePromotions = allActivePromos.filter((p: any) => {
        if (p.apply_scope === "all" || p.apply_scope === "entire_cart") {
          return items.length > 0
        }
        if (p.apply_scope === "specific_products" || p.apply_scope === "products") {
          return promoProducts.some((pp: any) => pp.promotion_id === p.id)
        }
        if (p.apply_scope === "specific_services" || p.apply_scope === "services") {
          return promoServices.some((ps: any) => ps.promotion_id === p.id)
        }
        if (p.apply_scope === "specific_categories" || p.apply_scope === "category") {
          return promoCategories.some((pc: any) => pc.promotion_id === p.id)
        }
        return false
      })

      if (applicablePromotions.length > 0) {
        if (coupon.allow_combination === false) {
          return { valid: false, discountAmount: 0, errorMessage: "Este cupom não pode ser combinado com campanhas ativas." }
        }

        const hasBlockedCampaign = applicablePromotions.some((p: any) => p.allow_coupon_combination === false)
        if (hasBlockedCampaign) {
          return { valid: false, discountAmount: 0, errorMessage: "Este cupom não pode ser combinado com a campanha ativa." }
        }
      }
    }
  }
  let partialApplicabilityWarning = false

  // Apply scope (products, categories, services, subscriptions)
  if (coupon.apply_scope !== "all") {
    if (coupon.apply_scope === "products") {
      const productIds = Array.from(new Set(items.map((item) => item.productId).filter(Boolean))) as string[]
      if (productIds.length === 0) return { valid: false, discountAmount: 0, errorMessage: "Cupom válido apenas para produtos específicos." }
      const { data: links } = await supabase
        .from("coupon_products")
        .select("product_id")
        .eq("coupon_id", coupon.id)
        .in("product_id", productIds)
      if (!links || links.length === 0) {
        return {
          valid: true,
          discountAmount: 0,
          partialApplicabilityWarning: items.length > 0,
          couponId: undefined,
          pricingCoupon: null,
        }
      }
    }

    if (coupon.apply_scope === "categories") {
      const productIds = Array.from(new Set(items.map((item) => item.productId).filter(Boolean))) as string[]
      if (productIds.length === 0) return { valid: false, discountAmount: 0, errorMessage: "Cupom válido apenas para categorias específicas." }
      const [{ data: productRows }, { data: categoryRows }] = await Promise.all([
        supabase.from("products").select("id, category_id").in("id", productIds),
        supabase.from("coupon_categories").select("category_id").eq("coupon_id", coupon.id),
      ])
      const allowed = new Set((categoryRows || []).map((row: any) => row.category_id))
      const hasEligibleProduct = (productRows || []).some((row: any) => row.category_id && allowed.has(row.category_id))
      if (!hasEligibleProduct) {
        return {
          valid: true,
          discountAmount: 0,
          partialApplicabilityWarning: items.length > 0,
          couponId: undefined,
          pricingCoupon: null,
        }
      }
    }

    if (coupon.apply_scope === "services") {
      const serviceIds = Array.from(new Set(items.map((item) => item.serviceId).filter(Boolean))) as string[]
      if (serviceIds.length === 0) return { valid: false, discountAmount: 0, errorMessage: "Cupom válido apenas para serviços." }
      const { data: links } = await supabase
        .from("coupon_services")
        .select("service_id")
        .eq("coupon_id", coupon.id)
        .in("service_id", serviceIds)
      if (!links || links.length === 0) {
        return {
          valid: true,
          discountAmount: 0,
          partialApplicabilityWarning: items.length > 0,
          couponId: undefined,
          pricingCoupon: null,
        }
      }
    }

    if (coupon.apply_scope === "subscriptions") {
      const planIds = Array.from(new Set(items.map((item) => item.recurringPlanId).filter(Boolean))) as string[]
      if (planIds.length === 0) return { valid: false, discountAmount: 0, errorMessage: "Cupom válido apenas para assinaturas." }
      const { data: links } = await supabase
        .from("coupon_subscriptions")
        .select("recurring_plan_id")
        .eq("coupon_id", coupon.id)
        .in("recurring_plan_id", planIds)
      if (!links || links.length === 0) {
        return {
          valid: true,
          discountAmount: 0,
          partialApplicabilityWarning: items.length > 0,
          couponId: undefined,
          pricingCoupon: null,
        }
      }
    }
  }

  if (coupon.apply_scope !== "all" && items.length > 0) {
    const hasIneligible = items.some((item) => {
      if (coupon.apply_scope === "products") return !item.productId
      if (coupon.apply_scope === "services") return !item.serviceId
      if (coupon.apply_scope === "subscriptions") return !item.recurringPlanId
      if (coupon.apply_scope === "categories") return !item.productId
      return false
    })
    partialApplicabilityWarning = hasIneligible
  }

  // Calculate discount amount (scoped coupons apply only when at least one eligible line exists)
  let discountAmount = 0
  if (coupon.discount_type === "percentage") {
    discountAmount = safeMoney(subtotal * (Number(coupon.discount_value || 0) / 100))
  } else if (coupon.discount_type === "fixed") {
    discountAmount = safeMoney(Number(coupon.discount_value || 0))
  } else if (coupon.discount_type === "free_shipping") {
    discountAmount = safeMoney(shippingCost)
  }

  if (coupon.max_discount_value !== null) {
    discountAmount = Math.min(discountAmount, safeMoney(Number(coupon.max_discount_value || 0)))
  }
  discountAmount = safeMoney(Math.min(discountAmount, safeMoney(subtotal + shippingCost)))

  // Build PricingCoupon for the unified engine
  const isFreeShipping = coupon.discount_type === "free_shipping" || Boolean(coupon.free_shipping)
  const pricingCoupon: PricingCoupon = {
    id: coupon.id,
    discountType: coupon.discount_type || "fixed",
    discountValue: Number(coupon.discount_value || 0),
    maxDiscountValue: coupon.max_discount_value != null ? Number(coupon.max_discount_value) : null,
    freeShipping: isFreeShipping,
    allowCombination: Boolean(coupon.allow_combination),
  }

  return {
    valid: true,
    couponId: coupon.id,
    couponCode: coupon.code,
    discountAmount,
    pricingCoupon,
    freeShipping: isFreeShipping,
    partialApplicabilityWarning,
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
