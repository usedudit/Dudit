"use server"

import { z } from "zod"
import { requireUser, requirePartnerAccessWithPermission } from "@/lib/auth/authorization"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { getAdminClient } from "@/lib/supabase/admin"
import { PromotionType, DiscountType, ApplyScope, PricingPromotion } from "@/lib/types/promotion"
import { calculateOrderPricing } from "@/lib/services/pricing-engine"
import { validateCoupon } from "@/lib/services/coupons"
import { revalidatePath } from "next/cache"

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const CampaignSchema = z.object({
  partnerId: z.string().uuid(),
  name: z.string().min(1, "O nome da campanha é obrigatório."),
  description: z.string().nullable().optional(),
  customerScope: z.enum(["all", "specific"]).default("all"),
  startsAt: z.string().nullable().optional(),
  endsAt: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
  customerIds: z.array(z.string().uuid()).optional().default([]),
})

const PromotionSchema = z.object({
  partnerId: z.string().uuid(),
  campaignId: z.string().uuid(),
  name: z.string().min(1, "O nome da promoção é obrigatório."),
  description: z.string().nullable().optional(),
  promotionType: z.enum(["gift", "buy_x_pay_y", "discount", "free_shipping"]),
  discountType: z.enum(["percentage", "fixed"]).nullable().optional(),
  discountValue: z.number().min(0.01).nullable().optional(),
  maxDiscountAmount: z.number().min(0).nullable().optional(),
  minSpendAmount: z.number().min(0).nullable().optional(),
  giftProductId: z.string().uuid().nullable().optional(),
  buyQuantity: z.number().int().min(1).nullable().optional(),
  payQuantity: z.number().int().min(1).nullable().optional(),
  priority: z.number().int().default(0),
  applyScope: z.enum(["specific_products", "category", "entire_cart", "specific_services"]),
  allowCouponCombination: z.boolean().default(false),
  usageLimit: z.number().int().min(0).nullable().optional(),
  usageLimitPerCustomer: z.number().int().min(0).nullable().optional(),
  isActive: z.boolean().default(true),
  productIds: z.array(z.string().uuid()).optional().default([]),
  categoryIds: z.array(z.string().uuid()).optional().default([]),
  serviceIds: z.array(z.string().uuid()).optional().default([]),
})

// Helper to revalidate promotions routes
async function revalidatePromotions(partnerId: string) {
  revalidatePath("/erp/promotions")
  revalidatePath(`/erp/promotions/${partnerId}`)
}

// ---------------------------------------------------------------------------
// Campaign Actions
// ---------------------------------------------------------------------------

export async function listCampaignsAction(
  partnerId: string,
  params?: { search?: string; isActive?: string; page?: number; limit?: number }
) {
  await requireUser()
  await requirePartnerAccessWithPermission(partnerId, "coupons", "view")
  const supabase = await getSupabaseServerClient()

  const page = Math.max(1, Number(params?.page || 1))
  const limit = Math.max(1, Math.min(100, Number(params?.limit || 20)))
  const from = (page - 1) * limit
  const to = from + limit - 1

  let query = supabase
    .from("campaigns")
    .select("*, promotions(*), campaign_customers(customer_id)", { count: "exact" })
    .eq("partner_id", partnerId)
    .order("created_at", { ascending: false })
    .range(from, to)

  if (params?.search?.trim()) {
    query = query.ilike("name", `%${params.search.trim()}%`)
  }
  if (params?.isActive === "active") {
    query = query.eq("is_active", true)
  }
  if (params?.isActive === "inactive") {
    query = query.eq("is_active", false)
  }

  const { data, error, count } = await query
  if (error) return { success: false, error: error.message }
  return { success: true, data: data || [], total: Number(count || 0), page, limit }
}

export async function createCampaignAction(input: z.infer<typeof CampaignSchema>) {
  const parsed = CampaignSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || "Dados inválidos." }
  }
  const data = parsed.data
  await requireUser()
  await requirePartnerAccessWithPermission(data.partnerId, "coupons", "create")
  const supabase = await getSupabaseServerClient()

  const { data: campaign, error } = await supabase
    .from("campaigns")
    .insert({
      partner_id: data.partnerId,
      name: data.name,
      description: data.description || null,
      customer_scope: data.customerScope,
      starts_at: data.startsAt || null,
      ends_at: data.endsAt || null,
      is_active: data.isActive,
    })
    .select("id")
    .single()

  if (error || !campaign) {
    return { success: false, error: error?.message || "Erro ao criar campanha." }
  }

  if (data.customerScope === "specific" && data.customerIds.length > 0) {
    const records = data.customerIds.map((cid) => ({
      campaign_id: campaign.id,
      customer_id: cid,
    }))
    const { error: custError } = await supabase.from("campaign_customers").insert(records)
    if (custError) {
      console.error("Error creating campaign customers:", custError)
    }
  }

  await revalidatePromotions(data.partnerId)
  return { success: true, id: campaign.id }
}

export async function updateCampaignAction(campaignId: string, input: z.infer<typeof CampaignSchema>) {
  const parsed = CampaignSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || "Dados inválidos." }
  }
  const data = parsed.data
  await requireUser()
  await requirePartnerAccessWithPermission(data.partnerId, "coupons", "edit")
  const supabase = await getSupabaseServerClient()

  const { error: updateError } = await supabase
    .from("campaigns")
    .update({
      name: data.name,
      description: data.description || null,
      customer_scope: data.customerScope,
      starts_at: data.startsAt || null,
      ends_at: data.endsAt || null,
      is_active: data.isActive,
    })
    .eq("id", campaignId)
    .eq("partner_id", data.partnerId)

  if (updateError) {
    return { success: false, error: updateError.message }
  }

  // Delete previous custom customers
  await supabase.from("campaign_customers").delete().eq("campaign_id", campaignId)

  // Insert new ones if specific
  if (data.customerScope === "specific" && data.customerIds.length > 0) {
    const records = data.customerIds.map((cid) => ({
      campaign_id: campaignId,
      customer_id: cid,
    }))
    const { error: custError } = await supabase.from("campaign_customers").insert(records)
    if (custError) {
      console.error("Error updating campaign customers:", custError)
    }
  }

  await revalidatePromotions(data.partnerId)
  return { success: true, id: campaignId }
}

export async function deleteCampaignAction(partnerId: string, campaignId: string) {
  await requireUser()
  await requirePartnerAccessWithPermission(partnerId, "coupons", "delete")
  const supabase = await getSupabaseServerClient()

  const { error } = await supabase
    .from("campaigns")
    .delete()
    .eq("id", campaignId)
    .eq("partner_id", partnerId)

  if (error) return { success: false, error: error.message }

  await revalidatePromotions(partnerId)
  return { success: true }
}

// ---------------------------------------------------------------------------
// Promotion Actions
// ---------------------------------------------------------------------------

export async function listPromotionsAction(partnerId: string, campaignId?: string) {
  await requireUser()
  await requirePartnerAccessWithPermission(partnerId, "coupons", "view")
  const supabase = await getSupabaseServerClient()

  let query = supabase
    .from("promotions")
    .select(`
      *,
      promotion_products(product_id),
      promotion_categories(category_id),
      promotion_services(service_id)
    `)
    .eq("partner_id", partnerId)

  if (campaignId) {
    query = query.eq("campaign_id", campaignId)
  }

  const { data, error } = await query
  if (error) return { success: false, error: error.message }
  return { success: true, data: data || [] }
}

export async function createPromotionAction(input: z.infer<typeof PromotionSchema>) {
  const parsed = PromotionSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || "Dados inválidos." }
  }
  const data = parsed.data
  await requireUser()
  await requirePartnerAccessWithPermission(data.partnerId, "coupons", "create")
  const supabase = await getSupabaseServerClient()

  // Validate logical constraints
  if (data.promotionType === "buy_x_pay_y") {
    if (!data.buyQuantity || !data.payQuantity || data.buyQuantity <= data.payQuantity) {
      return { success: false, error: "Para Leve X Pague Y, a quantidade de compra deve ser maior que a quantidade paga." }
    }
  } else if (data.promotionType === "gift") {
    if (!data.giftProductId) {
      return { success: false, error: "Para campanhas de brinde, selecione o produto que será o brinde." }
    }
  } else if (data.promotionType === "discount") {
    if (!data.discountType || data.discountValue === undefined || data.discountValue === null) {
      return { success: false, error: "Para descontos, informe o tipo e o valor do desconto." }
    }
  }

  const { data: inserted, error } = await supabase
    .from("promotions")
    .insert({
      campaign_id: data.campaignId,
      partner_id: data.partnerId,
      name: data.name,
      description: data.description || null,
      promotion_type: data.promotionType,
      discount_type: data.promotionType === "discount" ? data.discountType : null,
      discount_value: data.promotionType === "discount" ? data.discountValue : null,
      max_discount_amount: data.maxDiscountAmount ?? null,
      min_spend_amount: data.minSpendAmount ?? null,
      gift_product_id: data.promotionType === "gift" ? data.giftProductId : null,
      buy_quantity: data.promotionType === "buy_x_pay_y" ? data.buyQuantity : null,
      pay_quantity: data.promotionType === "buy_x_pay_y" ? data.payQuantity : null,
      priority: data.priority,
      apply_scope: data.applyScope,
      allow_coupon_combination: data.allowCouponCombination,
      usage_limit: data.usageLimit ?? null,
      usage_limit_per_customer: data.usageLimitPerCustomer ?? null,
      is_active: data.isActive,
    })
    .select("id")
    .single()

  if (error || !inserted) {
    return { success: false, error: error?.message || "Erro ao criar promoção." }
  }

  const promoId = inserted.id

  if (data.applyScope === "specific_products" && data.productIds.length > 0) {
    const records = data.productIds.map((pid) => ({ promotion_id: promoId, product_id: pid }))
    await supabase.from("promotion_products").insert(records)
  }

  if (data.applyScope === "category" && data.categoryIds.length > 0) {
    const records = data.categoryIds.map((cid) => ({ promotion_id: promoId, category_id: cid }))
    await supabase.from("promotion_categories").insert(records)
  }

  if (data.applyScope === "specific_services" && data.serviceIds.length > 0) {
    const records = data.serviceIds.map((sid) => ({ promotion_id: promoId, service_id: sid }))
    await supabase.from("promotion_services").insert(records)
  }

  await revalidatePromotions(data.partnerId)
  return { success: true, id: promoId }
}

export async function updatePromotionAction(promotionId: string, input: z.infer<typeof PromotionSchema>) {
  const parsed = PromotionSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || "Dados inválidos." }
  }
  const data = parsed.data
  await requireUser()
  await requirePartnerAccessWithPermission(data.partnerId, "coupons", "edit")
  const supabase = await getSupabaseServerClient()

  // Validate logical constraints
  if (data.promotionType === "buy_x_pay_y") {
    if (!data.buyQuantity || !data.payQuantity || data.buyQuantity <= data.payQuantity) {
      return { success: false, error: "Para Leve X Pague Y, a quantidade de compra deve ser maior que a quantidade paga." }
    }
  } else if (data.promotionType === "gift") {
    if (!data.giftProductId) {
      return { success: false, error: "Para campanhas de brinde, selecione o produto que será o brinde." }
    }
  } else if (data.promotionType === "discount") {
    if (!data.discountType || data.discountValue === undefined || data.discountValue === null) {
      return { success: false, error: "Para descontos, informe o tipo e o valor do desconto." }
    }
  }

  const { error: updateError } = await supabase
    .from("promotions")
    .update({
      campaign_id: data.campaignId,
      name: data.name,
      description: data.description || null,
      promotion_type: data.promotionType,
      discount_type: data.promotionType === "discount" ? data.discountType : null,
      discount_value: data.promotionType === "discount" ? data.discountValue : null,
      max_discount_amount: data.maxDiscountAmount ?? null,
      min_spend_amount: data.minSpendAmount ?? null,
      gift_product_id: data.promotionType === "gift" ? data.giftProductId : null,
      buy_quantity: data.promotionType === "buy_x_pay_y" ? data.buyQuantity : null,
      pay_quantity: data.promotionType === "buy_x_pay_y" ? data.payQuantity : null,
      priority: data.priority,
      apply_scope: data.applyScope,
      allow_coupon_combination: data.allowCouponCombination,
      usage_limit: data.usageLimit ?? null,
      usage_limit_per_customer: data.usageLimitPerCustomer ?? null,
      is_active: data.isActive,
    })
    .eq("id", promotionId)
    .eq("partner_id", data.partnerId)

  if (updateError) {
    return { success: false, error: updateError.message }
  }

  // Clear scopes
  await supabase.from("promotion_products").delete().eq("promotion_id", promotionId)
  await supabase.from("promotion_categories").delete().eq("promotion_id", promotionId)
  await supabase.from("promotion_services").delete().eq("promotion_id", promotionId)

  // Insert scopes
  if (data.applyScope === "specific_products" && data.productIds.length > 0) {
    const records = data.productIds.map((pid) => ({ promotion_id: promotionId, product_id: pid }))
    await supabase.from("promotion_products").insert(records)
  }

  if (data.applyScope === "category" && data.categoryIds.length > 0) {
    const records = data.categoryIds.map((cid) => ({ promotion_id: promotionId, category_id: cid }))
    await supabase.from("promotion_categories").insert(records)
  }

  if (data.applyScope === "specific_services" && data.serviceIds.length > 0) {
    const records = data.serviceIds.map((sid) => ({ promotion_id: promotionId, service_id: sid }))
    await supabase.from("promotion_services").insert(records)
  }

  await revalidatePromotions(data.partnerId)
  return { success: true, id: promotionId }
}

export async function deletePromotionAction(partnerId: string, promotionId: string) {
  await requireUser()
  await requirePartnerAccessWithPermission(partnerId, "coupons", "delete")
  const supabase = await getSupabaseServerClient()

  const { error } = await supabase
    .from("promotions")
    .delete()
    .eq("id", promotionId)
    .eq("partner_id", partnerId)

  if (error) return { success: false, error: error.message }

  await revalidatePromotions(partnerId)
  return { success: true }
}

export async function togglePromotionStatusAction(partnerId: string, promotionId: string, isActive: boolean) {
  await requireUser()
  await requirePartnerAccessWithPermission(partnerId, "coupons", "edit")
  const supabase = await getSupabaseServerClient()

  const { error } = await supabase
    .from("promotions")
    .update({ is_active: isActive })
    .eq("id", promotionId)
    .eq("partner_id", partnerId)

  if (error) return { success: false, error: error.message }

  await revalidatePromotions(partnerId)
  return { success: true }
}

// ---------------------------------------------------------------------------
// Simulation Action (ERP Tool)
// ---------------------------------------------------------------------------

export async function simulatePromotionsAction(
  partnerId: string,
  mockCart: {
    items: Array<{ productId: string; categoryId?: string | null; quantity: number; unitPrice: number }>
    couponCode?: string | null
    shippingCost?: number
  }
) {
  try {
    await requireUser()
    await requirePartnerAccessWithPermission(partnerId, "coupons", "view")
    const supabase = await getSupabaseServerClient()

    // 1. Fetch active promotions for this partner
    const promotionsData = await listActivePromotionsForMarketplaceAction(partnerId)

    // 2. Validate coupon if provided
    let pricingCoupon = null
    if (mockCart.couponCode?.trim()) {
      const validationResult = await validateCoupon({
        partnerId,
        code: mockCart.couponCode,
        subtotal: mockCart.items.reduce((acc, item) => acc + item.quantity * item.unitPrice, 0),
        shippingCost: mockCart.shippingCost || 0,
        items: mockCart.items.map((i) => ({ productId: i.productId })),
      }, supabase)

      if (validationResult.valid) {
        pricingCoupon = validationResult.pricingCoupon
      }
    }

    // 3. Run pricing calculation
    const result = calculateOrderPricing({
      items: mockCart.items.map((i) => ({
        productId: i.productId,
        categoryId: i.categoryId || null,
        unitPrice: i.unitPrice,
        quantity: i.quantity,
      })),
      shippingCost: mockCart.shippingCost || 0,
      coupon: pricingCoupon,
      promotions: promotionsData,
    })

    return { success: true, result }
  } catch (err: any) {
    console.error("[simulatePromotionsAction] Error:", err)
    return { success: false, error: err.message || "Erro ao simular promoções." }
  }
}

// ---------------------------------------------------------------------------
// Marketplace Active Promotions Fetch (Bypassing ERP user permissions)
// ---------------------------------------------------------------------------

export async function listActivePromotionsForMarketplaceAction(partnerId: string, customerId?: string | null) {
  // Use admin client to query promotions securely, filtering by partnerId
  const supabase = getAdminClient()
  const now = new Date().toISOString()

  // Fetch campaigns that are active and current
  let campaignsQuery = supabase
    .from("campaigns")
    .select("id, customer_scope")
    .eq("partner_id", partnerId)
    .eq("is_active", true)
    .or(`starts_at.is.null,starts_at.lte.${now}`)
    .or(`ends_at.is.null,ends_at.gte.${now}`)

  const { data: campaigns, error: campError } = await campaignsQuery
  if (campError || !campaigns || campaigns.length === 0) {
    return []
  }

  // Handle specific customer filtration
  const activeCampaignIds: string[] = []
  const campaignIdsToCheckAudience: string[] = []

  for (const c of campaigns) {
    if (c.customer_scope === "all") {
      activeCampaignIds.push(c.id)
    } else if (c.customer_scope === "specific") {
      campaignIdsToCheckAudience.push(c.id)
    }
  }

  if (campaignIdsToCheckAudience.length > 0 && customerId) {
    const { data: assignments } = await supabase
      .from("campaign_customers")
      .select("campaign_id")
      .eq("customer_id", customerId)
      .in("campaign_id", campaignIdsToCheckAudience)

    if (assignments && assignments.length > 0) {
      for (const a of assignments) {
        activeCampaignIds.push(a.campaign_id)
      }
    }
  }

  if (activeCampaignIds.length === 0) {
    return []
  }

  // Fetch promotions linked to active campaigns
  const { data: promotions, error: promoError } = await supabase
    .from("promotions")
    .select(`
      *,
      promotion_products(product_id),
      promotion_categories(category_id),
      promotion_services(service_id),
      promotion_subscriptions(recurring_plan_id)
    `)
    .eq("partner_id", partnerId)
    .eq("is_active", true)
    .in("campaign_id", activeCampaignIds)

  if (promoError || !promotions) {
    return []
  }

  // Filter out promotions that have hit their overall usage limit
  const activePromos: PricingPromotion[] = []

  for (const promo of promotions) {
    const limit = promo.usage_limit
    const currentCount = promo.usage_count || 0

    if (limit !== null && currentCount >= limit) {
      continue
    }

    // Check per-customer limit if customerId is provided
    if (customerId && promo.usage_limit_per_customer !== null) {
      const { count: customerUsageCount } = await supabase
        .from("promotion_usages")
        .select("id", { count: "exact", head: true })
        .eq("promotion_id", promo.id)
        .eq("customer_id", customerId)

      if (Number(customerUsageCount || 0) >= Number(promo.usage_limit_per_customer)) {
        continue
      }
    }

    // Convert from snake_case database schema to PricingPromotion camelCase camelCase interface
    activePromos.push({
      id: promo.id,
      campaignId: promo.campaign_id,
      partnerId: promo.partner_id,
      name: promo.name,
      promotionType: promo.promotion_type as PromotionType,
      discountType: promo.discount_type as DiscountType | null,
      discountValue: promo.discount_value ? Number(promo.discount_value) : null,
      maxDiscountAmount: promo.max_discount_amount ? Number(promo.max_discount_amount) : null,
      minSpendAmount: promo.min_spend_amount ? Number(promo.min_spend_amount) : null,
      giftProductId: promo.gift_product_id,
      buyQuantity: promo.buy_quantity,
      payQuantity: promo.pay_quantity,
      priority: promo.priority,
      applyScope: promo.apply_scope as ApplyScope,
      allowCouponCombination: promo.allow_coupon_combination,
      applicableProductIds: (promo.promotion_products || []).map((p: any) => p.product_id),
      applicableCategoryIds: (promo.promotion_categories || []).map((c: any) => c.category_id),
      applicableServiceIds: (promo.promotion_services || []).map((s: any) => s.service_id),
      applicableSubscriptionIds: (promo.promotion_subscriptions || []).map((s: any) => s.recurring_plan_id),
    })
  }

  return activePromos
}

export async function getPromotionScopeDataAction(partnerId: string) {
  await requireUser()
  await requirePartnerAccessWithPermission(partnerId, "coupons", "view")
  const supabase = await getSupabaseServerClient()

  const [{ data: products }, { data: services }, { data: categories }, { data: customers }] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, category:product_categories!category_id(name), category_id, price, sku, images, is_active")
      .eq("partner_id", partnerId)
      .order("name")
      .limit(200),
    supabase
      .from("services")
      .select("id, name, category:service_categories!category_id(name), category_id, price, sku, images, is_active")
      .eq("partner_id", partnerId)
      .order("name")
      .limit(200),
    supabase
      .from("product_categories")
      .select("id, name, is_active")
      .eq("partner_id", partnerId)
      .is("parent_id", null)
      .order("name"),
    supabase
      .from("customers")
      .select("id, name, email, phone, avatar_url, status")
      .eq("partner_id", partnerId)
      .order("name")
      .limit(300),
  ])

  return {
    success: true,
    products: (products || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      category: p.category?.name || null,
      categoryId: p.category_id,
      price: p.price ? Number(p.price) : 0,
      sku: p.sku,
      image: Array.isArray(p.images) ? p.images[0] || null : null,
      isActive: Boolean(p.is_active),
    })),
    services: (services || []).map((s: any) => ({
      id: s.id,
      name: s.name,
      category: s.category?.name || null,
      categoryId: s.category_id,
      price: s.price ? Number(s.price) : 0,
      sku: s.sku,
      image: Array.isArray(s.images) ? s.images[0] || null : null,
      isActive: Boolean(s.is_active),
    })),
    categories: (categories || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      isActive: Boolean(c.is_active),
    })),
    customers: (customers || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      avatarUrl: c.avatar_url,
      status: c.status,
    })),
  }
}

export async function listActivePromotionsInBatch(partnerIds: string[], customerId?: string | null) {
  if (!partnerIds || partnerIds.length === 0) return {}

  const supabase = getAdminClient()
  const now = new Date().toISOString()

  // 1. Fetch campaigns that are active and current for all partners
  let campaignsQuery = supabase
    .from("campaigns")
    .select("id, partner_id, customer_scope")
    .in("partner_id", partnerIds)
    .eq("is_active", true)
    .or(`starts_at.is.null,starts_at.lte.${now}`)
    .or(`ends_at.is.null,ends_at.gte.${now}`)

  const { data: campaigns, error: campError } = await campaignsQuery
  if (campError || !campaigns || campaigns.length === 0) {
    return {}
  }

  // Handle specific customer filtration
  const activeCampaignIds: string[] = []
  const campaignIdsToCheckAudience: string[] = []

  for (const c of campaigns) {
    if (c.customer_scope === "all") {
      activeCampaignIds.push(c.id)
    } else if (c.customer_scope === "specific") {
      campaignIdsToCheckAudience.push(c.id)
    }
  }

  if (campaignIdsToCheckAudience.length > 0 && customerId) {
    const { data: assignments } = await supabase
      .from("campaign_customers")
      .select("campaign_id")
      .eq("customer_id", customerId)
      .in("campaign_id", campaignIdsToCheckAudience)

    if (assignments && assignments.length > 0) {
      for (const a of assignments) {
        activeCampaignIds.push(a.campaign_id)
      }
    }
  }

  if (activeCampaignIds.length === 0) {
    return {}
  }

  // Fetch promotions linked to active campaigns
  const { data: promotions, error: promoError } = await supabase
    .from("promotions")
    .select(`
      *,
      promotion_products(product_id),
      promotion_categories(category_id),
      promotion_services(service_id),
      promotion_subscriptions(recurring_plan_id)
    `)
    .in("partner_id", partnerIds)
    .eq("is_active", true)
    .in("campaign_id", activeCampaignIds)

  if (promoError || !promotions || promotions.length === 0) {
    return {}
  }

  // Filter out promotions that have hit their overall usage limit
  const candidatePromos = promotions.filter((promo: any) => {
    const limit = promo.usage_limit
    const currentCount = promo.usage_count || 0
    return limit === null || currentCount < limit
  })

  if (candidatePromos.length === 0) {
    return {}
  }

  // Check per-customer limit if customerId is provided
  const promoIdsWithCustomerLimit = candidatePromos
    .filter((p: any) => p.usage_limit_per_customer !== null)
    .map((p: any) => p.id)

  const customerUsagesMap: Record<string, number> = {}

  if (customerId && promoIdsWithCustomerLimit.length > 0) {
    const { data: usages } = await supabase
      .from("promotion_usages")
      .select("promotion_id")
      .eq("customer_id", customerId)
      .in("promotion_id", promoIdsWithCustomerLimit)

    if (usages) {
      for (const usage of usages) {
        customerUsagesMap[usage.promotion_id] = (customerUsagesMap[usage.promotion_id] || 0) + 1
      }
    }
  }

  const result: Record<string, PricingPromotion[]> = {}

  for (const promo of candidatePromos) {
    if (customerId && promo.usage_limit_per_customer !== null) {
      const userUsage = customerUsagesMap[promo.id] || 0
      if (userUsage >= promo.usage_limit_per_customer) {
        continue
      }
    }

    const partnerId = promo.partner_id
    if (!result[partnerId]) {
      result[partnerId] = []
    }

    result[partnerId].push({
      id: promo.id,
      campaignId: promo.campaign_id,
      partnerId: promo.partner_id,
      name: promo.name,
      promotionType: promo.promotion_type as PromotionType,
      discountType: promo.discount_type as DiscountType | null,
      discountValue: promo.discount_value ? Number(promo.discount_value) : null,
      maxDiscountAmount: promo.max_discount_amount ? Number(promo.max_discount_amount) : null,
      minSpendAmount: promo.min_spend_amount ? Number(promo.min_spend_amount) : null,
      giftProductId: promo.gift_product_id,
      buyQuantity: promo.buy_quantity,
      payQuantity: promo.pay_quantity,
      priority: promo.priority,
      applyScope: promo.apply_scope as ApplyScope,
      allowCouponCombination: promo.allow_coupon_combination,
      applicableProductIds: (promo.promotion_products || []).map((p: any) => p.product_id),
      applicableCategoryIds: (promo.promotion_categories || []).map((c: any) => c.category_id),
      applicableServiceIds: (promo.promotion_services || []).map((s: any) => s.service_id),
      applicableSubscriptionIds: (promo.promotion_subscriptions || []).map((s: any) => s.recurring_plan_id),
    })
  }

  return result
}

