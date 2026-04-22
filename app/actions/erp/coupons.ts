"use server"

import { z } from "zod"
import { requireUser, requirePartnerAccessWithPermission } from "@/lib/auth/authorization"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { revalidateCoupons } from "@/lib/utils/revalidation"
import { validateCoupon, findBestAutomaticCoupon } from "@/lib/services/coupons"

const CouponSchema = z.object({
  partnerId: z.string().uuid(),
  code: z.string().min(1),
  discountType: z.enum(["percentage", "fixed", "free_shipping"]),
  discountValue: z.number().nullable(),
  applyScope: z.enum(["all", "categories", "products", "services"]),
  allowCombination: z.boolean().default(true),
  minCartValue: z.number().min(0).default(0),
  maxDiscountValue: z.number().min(0).nullable(),
  usageLimit: z.number().int().min(0).nullable(),
  usagePerCustomer: z.number().int().min(0).nullable(),
  firstPurchaseOnly: z.boolean().default(false),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  isActive: z.boolean().default(true),
  customerScope: z.enum(["all", "specific"]).default("all"),
  isAutomatic: z.boolean().default(false),
  productIds: z.array(z.string().uuid()).optional().default([]),
  categoryIds: z.array(z.string().uuid()).optional().default([]),
  serviceIds: z.array(z.string().uuid()).optional().default([]),
  customerIds: z.array(z.string().uuid()).optional().default([]),
})

export async function listCouponsAction(partnerId: string, params?: { search?: string; isActive?: string; type?: string; page?: number; limit?: number }) {
  await requireUser()
  await requirePartnerAccessWithPermission(partnerId, "orders", "view")
  const supabase = await getSupabaseServerClient()

  const page = Math.max(1, Number(params?.page || 1))
  const limit = Math.max(1, Math.min(100, Number(params?.limit || 20)))
  const from = (page - 1) * limit
  const to = from + limit - 1

  let query = supabase
    .from("coupons")
    .select("*, coupon_usages(count)", { count: "exact" })
    .eq("partner_id", partnerId)
    .order("created_at", { ascending: false })
    .range(from, to)

  if (params?.search?.trim()) query = query.ilike("code", `%${params.search.trim()}%`)
  if (params?.isActive === "active") query = query.eq("is_active", true)
  if (params?.isActive === "inactive") query = query.eq("is_active", false)
  if (params?.type && ["percentage", "fixed", "free_shipping"].includes(params.type)) query = query.eq("discount_type", params.type)

  const { data, error, count } = await query
  if (error) return { success: false, error: error.message }
  return { success: true, data: data || [], total: Number(count || 0), page, limit }
}

export async function createCouponAction(input: z.infer<typeof CouponSchema>) {
  const parsed = CouponSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message || "Dados inválidos." }
  const data = parsed.data
  await requireUser()
  await requirePartnerAccessWithPermission(data.partnerId, "orders", "create")
  const supabase = await getSupabaseServerClient()

  const { data: inserted, error } = await supabase
    .from("coupons")
    .insert({
      partner_id: data.partnerId,
      code: data.code.trim().toUpperCase(),
      discount_type: data.discountType,
      discount_value: data.discountType === "free_shipping" ? null : data.discountValue,
      apply_scope: data.applyScope,
      allow_combination: data.allowCombination,
      min_cart_value: data.minCartValue,
      max_discount_value: data.maxDiscountValue,
      usage_limit: data.usageLimit,
      usage_per_customer: data.usagePerCustomer,
      first_purchase_only: data.firstPurchaseOnly,
      starts_at: data.startsAt,
      ends_at: data.endsAt,
      is_active: data.isActive,
      customer_scope: data.customerScope,
      is_automatic: data.isAutomatic,
    })
    .select("id")
    .single()

  if (error || !inserted) return { success: false, error: error?.message || "Falha ao criar cupom." }
  const couponId = inserted.id

  if (data.productIds.length > 0) {
    await supabase.from("coupon_products").insert(data.productIds.map((id) => ({ coupon_id: couponId, product_id: id })))
  }
  if (data.categoryIds.length > 0) {
    await supabase.from("coupon_categories").insert(data.categoryIds.map((id) => ({ coupon_id: couponId, category_id: id })))
  }
  if (data.serviceIds.length > 0) {
    await supabase.from("coupon_services").insert(data.serviceIds.map((id) => ({ coupon_id: couponId, service_id: id })))
  }
  if (data.customerScope === "specific" && data.customerIds.length > 0) {
    await supabase.from("coupon_customers").insert(data.customerIds.map((id) => ({ coupon_id: couponId, customer_id: id })))
  }

  await revalidateCoupons(data.partnerId)
  return { success: true, id: couponId }
}

export async function updateCouponAction(couponId: string, input: z.infer<typeof CouponSchema>) {
  const parsed = CouponSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message || "Dados inválidos." }
  const data = parsed.data
  await requireUser()
  await requirePartnerAccessWithPermission(data.partnerId, "orders", "edit")
  const supabase = await getSupabaseServerClient()

  const { data: current } = await supabase
    .from("coupons")
    .select("id")
    .eq("id", couponId)
    .eq("partner_id", data.partnerId)
    .maybeSingle()
  if (!current?.id) return { success: false, error: "Cupom não encontrado." }

  const { error } = await supabase
    .from("coupons")
    .update({
      code: data.code.trim().toUpperCase(),
      discount_type: data.discountType,
      discount_value: data.discountType === "free_shipping" ? null : data.discountValue,
      apply_scope: data.applyScope,
      allow_combination: data.allowCombination,
      min_cart_value: data.minCartValue,
      max_discount_value: data.maxDiscountValue,
      usage_limit: data.usageLimit,
      usage_per_customer: data.usagePerCustomer,
      first_purchase_only: data.firstPurchaseOnly,
      starts_at: data.startsAt,
      ends_at: data.endsAt,
      is_active: data.isActive,
      customer_scope: data.customerScope,
      is_automatic: data.isAutomatic,
    })
    .eq("id", couponId)
    .eq("partner_id", data.partnerId)
  if (error) return { success: false, error: error.message }

  await Promise.all([
    supabase.from("coupon_products").delete().eq("coupon_id", couponId),
    supabase.from("coupon_categories").delete().eq("coupon_id", couponId),
    supabase.from("coupon_services").delete().eq("coupon_id", couponId),
    supabase.from("coupon_customers").delete().eq("coupon_id", couponId),
  ])
  if (data.productIds.length > 0) {
    await supabase.from("coupon_products").insert(data.productIds.map((id) => ({ coupon_id: couponId, product_id: id })))
  }
  if (data.categoryIds.length > 0) {
    await supabase.from("coupon_categories").insert(data.categoryIds.map((id) => ({ coupon_id: couponId, category_id: id })))
  }
  if (data.serviceIds.length > 0) {
    await supabase.from("coupon_services").insert(data.serviceIds.map((id) => ({ coupon_id: couponId, service_id: id })))
  }
  if (data.customerScope === "specific" && data.customerIds.length > 0) {
    await supabase.from("coupon_customers").insert(data.customerIds.map((id) => ({ coupon_id: couponId, customer_id: id })))
  }

  await revalidateCoupons(data.partnerId)
  return { success: true }
}

export async function toggleCouponStatusAction(partnerId: string, couponId: string, isActive: boolean) {
  await requireUser()
  await requirePartnerAccessWithPermission(partnerId, "orders", "edit")
  const supabase = await getSupabaseServerClient()
  const { error } = await supabase
    .from("coupons")
    .update({ is_active: isActive })
    .eq("id", couponId)
    .eq("partner_id", partnerId)
  if (error) return { success: false, error: error.message }
  await revalidateCoupons(partnerId)
  return { success: true }
}

export async function deleteCouponAction(partnerId: string, couponId: string) {
  await requireUser()
  await requirePartnerAccessWithPermission(partnerId, "orders", "delete")
  const supabase = await getSupabaseServerClient()
  const { error } = await supabase.from("coupons").delete().eq("id", couponId).eq("partner_id", partnerId)
  if (error) return { success: false, error: error.message }
  await revalidateCoupons(partnerId)
  return { success: true }
}

export async function validateCouponAction(input: {
  partnerId: string
  code: string
  customerId?: string | null
  subtotal: number
  shippingCost?: number
  items?: Array<{ productId?: string | null; serviceId?: string | null }>
}) {
  await requireUser()
  await requirePartnerAccessWithPermission(input.partnerId, "orders", "view")
  return validateCoupon(input)
}

export async function findAutomaticCouponAction(input: {
  partnerId: string
  customerId?: string | null
  subtotal: number
  shippingCost?: number
  items?: Array<{ productId?: string | null; serviceId?: string | null }>
}) {
  await requireUser()
  await requirePartnerAccessWithPermission(input.partnerId, "orders", "view")
  return findBestAutomaticCoupon(input)
}

export async function getCouponCustomersAction(partnerId: string, couponId: string) {
  await requireUser()
  await requirePartnerAccessWithPermission(partnerId, "orders", "view")
  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase
    .from("coupon_customers")
    .select("customer_id")
    .eq("coupon_id", couponId)
  if (error) return { success: false, error: error.message }
  return { success: true, data: (data || []).map((r: any) => r.customer_id) }
}

// ---------------------------------------------------------------------------
// MARKETPLACE-SAFE: Validate coupon for marketplace checkout (no partner access needed)
// ---------------------------------------------------------------------------
export async function validateMarketplaceCouponAction(input: {
  partnerId: string
  code: string
  customerId?: string | null
  subtotal: number
  shippingCost?: number
  items?: Array<{ productId?: string | null; serviceId?: string | null }>
}) {
  // Only require authenticated user — marketplace buyers are NOT partner members
  await requireUser()
  // Use admin client to bypass RLS (coupons table only allows partner_users to read)
  const { getAdminClient } = await import("@/lib/supabase/admin")
  const admin = getAdminClient()
  return validateCoupon(input, admin)
}

// ---------------------------------------------------------------------------
// DATA-FETCHING: For CouponsPage scope pickers
// ---------------------------------------------------------------------------

export async function getCouponScopeDataAction(partnerId: string) {
  await requireUser()
  await requirePartnerAccessWithPermission(partnerId, "orders", "view")
  const supabase = await getSupabaseServerClient()

  const [{ data: products }, { data: services }, { data: categories }, { data: customers }] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, category, price")
      .eq("partner_id", partnerId)
      .eq("is_active", true)
      .order("name")
      .limit(200),
    supabase
      .from("services")
      .select("id, name, price")
      .eq("partner_id", partnerId)
      .eq("is_active", true)
      .order("name")
      .limit(200),
    supabase
      .from("products")
      .select("category")
      .eq("partner_id", partnerId)
      .eq("is_active", true)
      .not("category", "is", null),
    supabase
      .from("customers")
      .select("id, name, email, phone")
      .eq("partner_id", partnerId)
      .order("name")
      .limit(300),
  ])

  // Deduplicate categories from products
  const uniqueCategories = Array.from(
    new Set((categories || []).map((r: any) => r.category).filter(Boolean))
  ).sort()

  return {
    success: true,
    products: (products || []).map((p: any) => ({ id: p.id, name: p.name, category: p.category, price: p.price })),
    services: (services || []).map((s: any) => ({ id: s.id, name: s.name, price: s.price })),
    categories: uniqueCategories,
    customers: (customers || []).map((c: any) => ({ id: c.id, name: c.name, email: c.email, phone: c.phone })),
  }
}

export async function getCouponLinkedItemsAction(partnerId: string, couponId: string) {
  await requireUser()
  await requirePartnerAccessWithPermission(partnerId, "orders", "view")
  const supabase = await getSupabaseServerClient()

  const [{ data: products }, { data: categories }, { data: services }] = await Promise.all([
    supabase.from("coupon_products").select("product_id").eq("coupon_id", couponId),
    supabase.from("coupon_categories").select("category_id").eq("coupon_id", couponId),
    supabase.from("coupon_services").select("service_id").eq("coupon_id", couponId),
  ])

  return {
    success: true,
    productIds: (products || []).map((r: any) => r.product_id),
    categoryIds: (categories || []).map((r: any) => r.category_id),
    serviceIds: (services || []).map((r: any) => r.service_id),
  }
}
