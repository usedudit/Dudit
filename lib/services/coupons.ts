import { getSupabaseServerClient } from "@/lib/supabase/request-client"

export type CouponValidationInput = {
  partnerId: string
  code: string
  customerId?: string | null
  subtotal: number
  shippingCost?: number
  items?: Array<{ productId?: string | null; serviceId?: string | null }>
}

export type CouponValidationResult = {
  valid: boolean
  couponId?: string
  discountAmount: number
  errorMessage?: string
}

export async function validateCoupon(input: CouponValidationInput): Promise<CouponValidationResult> {
  const supabase = await getSupabaseServerClient()
  const code = String(input.code || "").trim()
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

  const now = Date.now()
  if (coupon.starts_at && now < new Date(coupon.starts_at).getTime()) {
    return { valid: false, discountAmount: 0, errorMessage: "Cupom ainda não está disponível." }
  }
  if (coupon.ends_at && now > new Date(coupon.ends_at).getTime()) {
    return { valid: false, discountAmount: 0, errorMessage: "Cupom expirado." }
  }

  const { count: usageCount } = await supabase
    .from("coupon_usages")
    .select("id", { count: "exact", head: true })
    .eq("coupon_id", coupon.id)

  if (coupon.usage_limit !== null && Number(usageCount || 0) >= Number(coupon.usage_limit || 0)) {
    return { valid: false, discountAmount: 0, errorMessage: "Limite de uso do cupom atingido." }
  }

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

  const subtotal = Math.max(0, Number(input.subtotal || 0))
  const shippingCost = Math.max(0, Number(input.shippingCost || 0))
  if (subtotal < Number(coupon.min_cart_value || 0)) {
    return { valid: false, discountAmount: 0, errorMessage: "Valor mínimo do carrinho não atingido." }
  }

  if (coupon.apply_scope !== "all") {
    const items = input.items || []
    if (coupon.apply_scope === "products") {
      const productIds = Array.from(new Set(items.map((item) => item.productId).filter(Boolean))) as string[]
      if (productIds.length === 0) return { valid: false, discountAmount: 0, errorMessage: "Cupom válido apenas para produtos específicos." }
      const { data: links } = await supabase
        .from("coupon_products")
        .select("product_id")
        .eq("coupon_id", coupon.id)
        .in("product_id", productIds)
      if (!links || links.length === 0) return { valid: false, discountAmount: 0, errorMessage: "Nenhum produto do carrinho é elegível para este cupom." }
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
      if (!hasEligibleProduct) return { valid: false, discountAmount: 0, errorMessage: "Nenhum item do carrinho pertence às categorias elegíveis." }
    }

    if (coupon.apply_scope === "services") {
      const serviceIds = Array.from(new Set(items.map((item) => item.serviceId).filter(Boolean))) as string[]
      if (serviceIds.length === 0) return { valid: false, discountAmount: 0, errorMessage: "Cupom válido apenas para serviços." }
      const { data: links } = await supabase
        .from("coupon_services")
        .select("service_id")
        .eq("coupon_id", coupon.id)
        .in("service_id", serviceIds)
      if (!links || links.length === 0) return { valid: false, discountAmount: 0, errorMessage: "Nenhum serviço é elegível para este cupom." }
    }
  }

  let discountAmount = 0
  if (coupon.discount_type === "percentage") {
    discountAmount = subtotal * (Number(coupon.discount_value || 0) / 100)
  } else if (coupon.discount_type === "fixed") {
    discountAmount = Number(coupon.discount_value || 0)
  } else if (coupon.discount_type === "free_shipping") {
    discountAmount = shippingCost
  }

  if (coupon.max_discount_value !== null) {
    discountAmount = Math.min(discountAmount, Number(coupon.max_discount_value || 0))
  }
  discountAmount = Math.max(0, Math.min(discountAmount, subtotal + shippingCost))

  return { valid: true, couponId: coupon.id, discountAmount }
}
