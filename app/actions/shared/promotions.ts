"use server"

import { z } from "zod"
import { requireUser, requireMinimumPlan } from "@/lib/auth/authorization"
import { requirePermission } from "@/lib/permissions/access"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { getAdminClient } from "@/lib/supabase/admin"
import { PromotionType, DiscountType, ApplyScope, PricingPromotion } from "@/lib/types/promotion"
import { calculateOrderPricing } from "@/lib/services/pricing-engine"
import { validateCoupon } from "@/lib/services/coupons"
import { setPromotionStores, getPromotionStoreIds } from "@/lib/services/promotions.service"
import { revalidatePath } from "next/cache"
import { sanitizeInput } from "@/lib/input-validator"
import { resolveMarketplaceCapabilities } from "@/lib/marketplace-capabilities"

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const CampaignSchema = z.object({
  partnerId: z.string().uuid(),
  name: z.string().min(1, "O nome da campanha é obrigatório.").max(150, "O nome da campanha deve ter no máximo 150 caracteres."),
  description: z.string().nullable().optional(),
  customerScope: z.enum(["all", "specific"]).default("all"),
  startsAt: z.string().nullable().optional(),
  endsAt: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
  customerIds: z.array(z.string().uuid()).optional().default([]),
  storeId: z.string().uuid().nullable().optional(),
})

const PromotionSchema = z.object({
  partnerId: z.string().uuid(),
  campaignId: z.string().uuid(),
  name: z.string().min(1, "O nome da promoção é obrigatório.").max(150, "O nome da promoção deve ter no máximo 150 caracteres."),
  description: z.string().nullable().optional(),
   promotionType: z.enum(["gift", "buy_x_pay_y", "discount", "free_shipping"]),
  discountType: z.enum(["percentage", "fixed"]).nullable().optional(),
  discountValue: z.number().min(0.01).nullable().optional(),
  maxDiscountAmount: z.number().min(0).nullable().optional(),
  minSpendAmount: z.number().min(0).nullable().optional(),
  giftProductId: z.string().uuid().nullable().optional(),
  giftServiceId: z.string().uuid().nullable().optional(),
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
  storeIds: z.array(z.string().uuid()).optional().default([]),
})

// Helper to revalidate promotions routes
async function revalidatePromotions(partnerId: string) {
  revalidatePath("/erp/promocoes")
  revalidatePath(`/erp/promocoes/${partnerId}`)
}

async function checkPromotionOverlap(
  supabase: any,
  data: z.infer<typeof PromotionSchema>,
  promotionId?: string,
  customCampaignB?: { starts_at: string | null; ends_at: string | null; is_active: boolean }
) {
  if (!data.isActive) return null

  let campaignB: { starts_at: string | null; ends_at: string | null; is_active: boolean }
  if (customCampaignB) {
    campaignB = customCampaignB
  } else {
    const { data: dbCamp, error: campBError } = await supabase
      .from("campaigns")
      .select("starts_at, ends_at, is_active")
      .eq("id", data.campaignId)
      .single()
    if (campBError || !dbCamp) {
      return "Campanha associada não encontrada."
    }
    campaignB = dbCamp
  }

  if (!campaignB.is_active) return null

  let query = supabase
    .from("promotions")
    .select(`
      id,
      name,
      promotion_type,
      apply_scope,
      campaign_id,
      campaigns!inner(is_active, starts_at, ends_at),
      promotion_products(product_id),
      promotion_categories(category_id),
      promotion_services(service_id)
    `)
    .eq("partner_id", data.partnerId)
    .eq("is_active", true)
    .eq("promotion_type", data.promotionType)
    .eq("campaigns.is_active", true)

  if (promotionId) {
    query = query.neq("id", promotionId)
  }

  const { data: activePromos, error: activeError } = await query
  if (activeError || !activePromos) {
    console.error("Error fetching active promotions for overlap check:", activeError)
    return null
  }

  const startB = campaignB.starts_at ? new Date(campaignB.starts_at) : null
  const endB = campaignB.ends_at ? new Date(campaignB.ends_at) : null

  const overlappingPromos = activePromos.filter((promo: any) => {
    const startA = promo.campaigns.starts_at ? new Date(promo.campaigns.starts_at) : null
    const endA = promo.campaigns.ends_at ? new Date(promo.campaigns.ends_at) : null

    const overlapStart = !startA || !endB || startA <= endB
    const overlapEnd = !endA || !startB || endA >= startB

    return overlapStart && overlapEnd
  })

  if (overlappingPromos.length === 0) {
    return null
  }

  const pIdsB = data.productIds || []
  const cIdsB = data.categoryIds || []
  const sIdsB = data.serviceIds || []
  const scopeB = data.applyScope

  const allProductIds = new Set<string>()
  const allServiceIds = new Set<string>()

  pIdsB.forEach((id: string) => allProductIds.add(id))
  sIdsB.forEach((id: string) => allServiceIds.add(id))

  overlappingPromos.forEach((promo: any) => {
    const pIdsA = (promo.promotion_products || []).map((p: any) => p.product_id)
    const sIdsA = (promo.promotion_services || []).map((s: any) => s.service_id)
    pIdsA.forEach((id: string) => allProductIds.add(id))
    sIdsA.forEach((id: string) => allServiceIds.add(id))
  })

  const productToCategoryMap = new Map<string, string>()
  const serviceToCategoryMap = new Map<string, string>()

  if (allProductIds.size > 0) {
    const { data: pData } = await supabase
      .from("products")
      .select("id, category_id")
      .in("id", Array.from(allProductIds))
    if (pData) {
      pData.forEach((p: any) => {
        if (p.category_id) productToCategoryMap.set(p.id, p.category_id)
      })
    }
  }

  if (allServiceIds.size > 0) {
    const { data: sData } = await supabase
      .from("services")
      .select("id, category_id")
      .in("id", Array.from(allServiceIds))
    if (sData) {
      sData.forEach((s: any) => {
        if (s.category_id) serviceToCategoryMap.set(s.id, s.category_id)
      })
    }
  }

  for (const promo of overlappingPromos) {
    const scopeA = promo.apply_scope
    const pIdsA = (promo.promotion_products || []).map((p: any) => p.product_id)
    const cIdsA = (promo.promotion_categories || []).map((c: any) => c.category_id)
    const sIdsA = (promo.promotion_services || []).map((s: any) => s.service_id)

    let hasOverlap = false

    if (scopeB === "entire_cart" || scopeA === "entire_cart") {
      hasOverlap = true
    } else if (scopeB === "category" && scopeA === "category") {
      hasOverlap = cIdsB.some((id: string) => cIdsA.includes(id))
    } else if (scopeB === "specific_products" && scopeA === "specific_products") {
      hasOverlap = pIdsB.some((id: string) => pIdsA.includes(id))
    } else if (scopeB === "specific_services" && scopeA === "specific_services") {
      hasOverlap = sIdsB.some((id: string) => sIdsA.includes(id))
    } else if (scopeB === "category" && scopeA === "specific_products") {
      hasOverlap = pIdsA.some((pid: string) => {
        const catId = productToCategoryMap.get(pid)
        return catId ? cIdsB.includes(catId) : false
      })
    } else if (scopeB === "specific_products" && scopeA === "category") {
      hasOverlap = pIdsB.some((pid: string) => {
        const catId = productToCategoryMap.get(pid)
        return catId ? cIdsA.includes(catId) : false
      })
    } else if (scopeB === "category" && scopeA === "specific_services") {
      hasOverlap = sIdsA.some((sid: string) => {
        const catId = serviceToCategoryMap.get(sid)
        return catId ? cIdsB.includes(catId) : false
      })
    } else if (scopeB === "specific_services" && scopeA === "category") {
      hasOverlap = sIdsB.some((sid: string) => {
        const catId = serviceToCategoryMap.get(sid)
        return catId ? cIdsA.includes(catId) : false
      })
    }

    if (hasOverlap) {
      const typeLabel =
        data.promotionType === "discount" ? "desconto" :
        data.promotionType === "gift" ? "brinde" :
        data.promotionType === "free_shipping" ? "frete grátis" : "Leve X Pague Y"

      return `O item/escopo selecionado já possui uma promoção de ${typeLabel} ativa no mesmo período (Campanha: "${promo.name || "Existente"}").`
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Campaign Actions
// ---------------------------------------------------------------------------

export async function listCampaignsAction(
  partnerId: string,
  params?: { search?: string; isActive?: string; page?: number; limit?: number; storeId?: string | null }
) {
  await requireUser()
  await requirePermission(partnerId, "coupons", "view")
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

  if (params?.storeId !== undefined && params?.storeId !== null) {
    query = query.or(`store_id.is.null,store_id.eq.${params.storeId}`)
  }

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
  await requireMinimumPlan(data.partnerId, "escalar")
  await requirePermission(data.partnerId, "coupons", "create")
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
      store_id: data.storeId || null,
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
  await requireMinimumPlan(data.partnerId, "escalar")
  await requirePermission(data.partnerId, "coupons", "edit")
  const supabase = await getSupabaseServerClient()

  if (data.isActive) {
    const { data: promotions } = await supabase
      .from("promotions")
      .select(`
        *,
        promotion_products(product_id),
        promotion_categories(category_id),
        promotion_services(service_id)
      `)
      .eq("campaign_id", campaignId)
      .eq("is_active", true)

    if (promotions) {
      const customCampaignB = {
        starts_at: data.startsAt || null,
        ends_at: data.endsAt || null,
        is_active: data.isActive,
      }

      for (const promo of promotions) {
        const candidate = {
          partnerId: promo.partner_id,
          campaignId: campaignId,
          name: promo.name,
          description: promo.description,
          promotionType: promo.promotion_type,
          discountType: promo.discount_type,
          discountValue: promo.discount_value,
          maxDiscountAmount: promo.max_discount_amount,
          minSpendAmount: promo.min_spend_amount,
          giftProductId: promo.gift_product_id,
          giftServiceId: promo.gift_service_id,
          buyQuantity: promo.buy_quantity,
          payQuantity: promo.pay_quantity,
          priority: promo.priority,
          applyScope: promo.apply_scope,
          allowCouponCombination: promo.allow_coupon_combination,
          usageLimit: promo.usage_limit,
          usageLimitPerCustomer: promo.usage_limit_per_customer,
          isActive: true,
          productIds: (promo.promotion_products || []).map((p: any) => p.product_id),
          categoryIds: (promo.promotion_categories || []).map((c: any) => c.category_id),
          serviceIds: (promo.promotion_services || []).map((s: any) => s.service_id),
          storeIds: [],
        }

        const overlapError = await checkPromotionOverlap(supabase, candidate, promo.id, customCampaignB)
        if (overlapError) {
          return { success: false, error: overlapError }
        }
      }
    }
  }

  const { error: updateError } = await supabase
    .from("campaigns")
    .update({
      name: data.name,
      description: data.description || null,
      customer_scope: data.customerScope,
      starts_at: data.startsAt || null,
      ends_at: data.endsAt || null,
      is_active: data.isActive,
      store_id: data.storeId || null,
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
  await requireMinimumPlan(partnerId, "escalar")
  await requirePermission(partnerId, "coupons", "delete")
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

export async function toggleCampaignsStatusAction(
  partnerId: string,
  campaignIds: string[],
  isActive: boolean
) {
  await requireUser()
  await requirePermission(partnerId, "coupons", "edit")
  const supabase = await getSupabaseServerClient()

  if (isActive) {
    for (const campaignId of campaignIds) {
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("starts_at, ends_at")
        .eq("id", campaignId)
        .single()

      if (campaign) {
        const customCampaignB = {
          starts_at: campaign.starts_at,
          ends_at: campaign.ends_at,
          is_active: true,
        }

        const { data: promotions } = await supabase
          .from("promotions")
          .select(`
            *,
            promotion_products(product_id),
            promotion_categories(category_id),
            promotion_services(service_id)
          `)
          .eq("campaign_id", campaignId)
          .eq("is_active", true)

        if (promotions) {
          for (const promo of promotions) {
            const candidate = {
              partnerId: promo.partner_id,
              campaignId: campaignId,
              name: promo.name,
              description: promo.description,
              promotionType: promo.promotion_type,
              discountType: promo.discount_type,
              discountValue: promo.discount_value,
              maxDiscountAmount: promo.max_discount_amount,
              minSpendAmount: promo.min_spend_amount,
              giftProductId: promo.gift_product_id,
              giftServiceId: promo.gift_service_id,
              buyQuantity: promo.buy_quantity,
              payQuantity: promo.pay_quantity,
              priority: promo.priority,
              applyScope: promo.apply_scope,
              allowCouponCombination: promo.allow_coupon_combination,
              usageLimit: promo.usage_limit,
              usageLimitPerCustomer: promo.usage_limit_per_customer,
              isActive: true,
              productIds: (promo.promotion_products || []).map((p: any) => p.product_id),
              categoryIds: (promo.promotion_categories || []).map((c: any) => c.category_id),
              serviceIds: (promo.promotion_services || []).map((s: any) => s.service_id),
              storeIds: [],
            }

            const overlapError = await checkPromotionOverlap(supabase, candidate, promo.id, customCampaignB)
            if (overlapError) {
              return { success: false, error: overlapError }
            }
          }
        }
      }
    }
  }

  const { error } = await supabase
    .from("campaigns")
    .update({ is_active: isActive })
    .in("id", campaignIds)
    .eq("partner_id", partnerId)

  if (error) return { success: false, error: error.message }

  await revalidatePromotions(partnerId)
  return { success: true }
}

export async function bulkUpdateCampaignsAction(
  partnerId: string,
  campaignIds: string[],
  fields: {
    startsAt?: string | null
    endsAt?: string | null
    customerScope?: "all" | "specific"
    customerIds?: string[]
    priority?: number
    minSpendAmount?: number | null
    usageLimit?: number | null
    usageLimitPerCustomer?: number | null
  }
) {
  await requireUser()
  await requirePermission(partnerId, "coupons", "edit")
  const supabase = await getSupabaseServerClient()

  // 1. Update Campaign fields if provided
  const campaignUpdates: any = {}
  if (fields.startsAt !== undefined) campaignUpdates.starts_at = fields.startsAt
  if (fields.endsAt !== undefined) campaignUpdates.ends_at = fields.endsAt
  if (fields.customerScope !== undefined) campaignUpdates.customer_scope = fields.customerScope

  if (Object.keys(campaignUpdates).length > 0) {
    const { error: campaignError } = await supabase
      .from("campaigns")
      .update(campaignUpdates)
      .in("id", campaignIds)
      .eq("partner_id", partnerId)

    if (campaignError) return { success: false, error: campaignError.message }
  }

  // 2. Handle customer selections if customerScope is updated
  if (fields.customerScope === "specific" && fields.customerIds !== undefined) {
    // Delete existing assignments for these campaigns
    const { error: deleteError } = await supabase
      .from("campaign_customers")
      .delete()
      .in("campaign_id", campaignIds)

    if (deleteError) return { success: false, error: deleteError.message }

    // Insert new ones
    if (fields.customerIds.length > 0) {
      const records: any[] = []
      for (const campaignId of campaignIds) {
        for (const customerId of fields.customerIds) {
          records.push({ campaign_id: campaignId, customer_id: customerId })
        }
      }
      const { error: insertError } = await supabase
        .from("campaign_customers")
        .insert(records)

      if (insertError) return { success: false, error: insertError.message }
    }
  } else if (fields.customerScope === "all") {
    // Delete custom customer associations
    const { error: deleteError } = await supabase
      .from("campaign_customers")
      .delete()
      .in("campaign_id", campaignIds)

    if (deleteError) return { success: false, error: deleteError.message }
  }

  // 3. Update linked promotions if promotion fields are provided
  const promotionUpdates: any = {}
  if (fields.priority !== undefined) promotionUpdates.priority = fields.priority
  if (fields.minSpendAmount !== undefined) promotionUpdates.min_spend_amount = fields.minSpendAmount
  if (fields.usageLimit !== undefined) promotionUpdates.usage_limit = fields.usageLimit
  if (fields.usageLimitPerCustomer !== undefined) promotionUpdates.usage_limit_per_customer = fields.usageLimitPerCustomer

  if (Object.keys(promotionUpdates).length > 0) {
    const { error: promoError } = await supabase
      .from("promotions")
      .update(promotionUpdates)
      .in("campaign_id", campaignIds)
      .eq("partner_id", partnerId)

    if (promoError) return { success: false, error: promoError.message }
  }

  await revalidatePromotions(partnerId)
  return { success: true }
}

// ---------------------------------------------------------------------------
// Promotion Actions
// ---------------------------------------------------------------------------

export async function listPromotionsAction(partnerId: string, campaignId?: string, storeId?: string | null) {
  await requireUser()
  await requirePermission(partnerId, "coupons", "view")
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

  if (storeId) {
    query = query.or(`store_id.is.null,store_id.eq.${storeId}`)
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
  await requirePermission(data.partnerId, "coupons", "create")
  const supabase = await getSupabaseServerClient()

  const overlapError = await checkPromotionOverlap(supabase, data)
  if (overlapError) {
    return { success: false, error: overlapError }
  }

  // Validate logical constraints
  if (data.promotionType === "buy_x_pay_y") {
    if (!data.buyQuantity || !data.payQuantity || data.buyQuantity <= data.payQuantity) {
      return { success: false, error: "Para Leve X Pague Y, a quantidade de compra deve ser maior que a quantidade paga." }
    }
  } else if (data.promotionType === "gift") {
    if (!data.giftProductId && !data.giftServiceId) {
      return { success: false, error: "Para campanhas de brinde, selecione o produto ou serviço que será o brinde." }
    }
  } else if (data.promotionType === "discount") {
    if (!data.discountType || data.discountValue === undefined || data.discountValue === null) {
      return { success: false, error: "Para descontos, informe o tipo e o valor do desconto." }
    }
    if (data.discountType === "fixed" && (data.minSpendAmount === undefined || data.minSpendAmount === null)) {
      return { success: false, error: "Para desconto de valor fixo (R$), informe o valor mínimo de compra." }
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
      gift_product_id: data.promotionType === "gift" && data.giftProductId ? data.giftProductId : null,
      gift_service_id: data.promotionType === "gift" && data.giftServiceId ? data.giftServiceId : null,
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
    const { data: productCats } = await supabase.from("product_categories").select("id").in("id", data.categoryIds)
    const productCatSet = new Set((productCats || []).map((c: any) => c.id))
    const records = data.categoryIds.map((cid) => ({
      promotion_id: promoId,
      category_id: cid,
      category_type: productCatSet.has(cid) ? "product" : "service",
    }))
    await supabase.from("promotion_categories").insert(records)
  }

  if (data.applyScope === "specific_services" && data.serviceIds.length > 0) {
    const records = data.serviceIds.map((sid) => ({ promotion_id: promoId, service_id: sid }))
    await supabase.from("promotion_services").insert(records)
  }

  if (data.storeIds.length > 0) {
    await setPromotionStores(promoId, data.storeIds)
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
  await requirePermission(data.partnerId, "coupons", "edit")
  const supabase = await getSupabaseServerClient()

  const overlapError = await checkPromotionOverlap(supabase, data, promotionId)
  if (overlapError) {
    return { success: false, error: overlapError }
  }

  // Validate logical constraints
  if (data.promotionType === "buy_x_pay_y") {
    if (!data.buyQuantity || !data.payQuantity || data.buyQuantity <= data.payQuantity) {
      return { success: false, error: "Para Leve X Pague Y, a quantidade de compra deve ser maior que a quantidade paga." }
    }
  } else if (data.promotionType === "gift") {
    if (!data.giftProductId && !data.giftServiceId) {
      return { success: false, error: "Para campanhas de brinde, selecione o produto ou serviço que será o brinde." }
    }
  } else if (data.promotionType === "discount") {
    if (!data.discountType || data.discountValue === undefined || data.discountValue === null) {
      return { success: false, error: "Para descontos, informe o tipo e o valor do desconto." }
    }
    if (data.discountType === "fixed" && (data.minSpendAmount === undefined || data.minSpendAmount === null)) {
      return { success: false, error: "Para desconto de valor fixo (R$), informe o valor mínimo de compra." }
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
      gift_product_id: data.promotionType === "gift" && data.giftProductId ? data.giftProductId : null,
      gift_service_id: data.promotionType === "gift" && data.giftServiceId ? data.giftServiceId : null,
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
    const { data: productCats } = await supabase.from("product_categories").select("id").in("id", data.categoryIds)
    const productCatSet = new Set((productCats || []).map((c: any) => c.id))
    const records = data.categoryIds.map((cid) => ({
      promotion_id: promotionId,
      category_id: cid,
      category_type: productCatSet.has(cid) ? "product" : "service",
    }))
    await supabase.from("promotion_categories").insert(records)
  }

  if (data.applyScope === "specific_services" && data.serviceIds.length > 0) {
    const records = data.serviceIds.map((sid) => ({ promotion_id: promotionId, service_id: sid }))
    await supabase.from("promotion_services").insert(records)
  }

  await setPromotionStores(promotionId, data.storeIds)

  await revalidatePromotions(data.partnerId)
  return { success: true, id: promotionId }
}

export async function deletePromotionAction(partnerId: string, promotionId: string) {
  await requireUser()
  await requirePermission(partnerId, "coupons", "delete")
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

export async function getPromotionStoresAction(partnerId: string, promotionId: string) {
  await requireUser()
  await requirePermission(partnerId, "coupons", "view")
  try {
    const storeIds = await getPromotionStoreIds(promotionId)
    return { success: true, data: storeIds }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Erro ao buscar lojas" }
  }
}

export async function setPromotionStoresAction(partnerId: string, promotionId: string, storeIds: string[]) {
  await requireUser()
  await requirePermission(partnerId, "coupons", "edit")
  try {
    await setPromotionStores(promotionId, storeIds)
    await revalidatePromotions(partnerId)
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Erro ao salvar lojas" }
  }
}

export async function togglePromotionStatusAction(partnerId: string, promotionId: string, isActive: boolean) {
  await requireUser()
  await requirePermission(partnerId, "coupons", "edit")
  const supabase = await getSupabaseServerClient()

  if (isActive) {
    const { data: promo, error: fetchErr } = await supabase
      .from("promotions")
      .select(`
        *,
        promotion_products(product_id),
        promotion_categories(category_id),
        promotion_services(service_id)
      `)
      .eq("id", promotionId)
      .eq("partner_id", partnerId)
      .single()

    if (fetchErr || !promo) {
      return { success: false, error: "Promoção não encontrada." }
    }

    const candidate = {
      partnerId: promo.partner_id,
      campaignId: promo.campaign_id,
      name: promo.name,
      description: promo.description,
      promotionType: promo.promotion_type,
      discountType: promo.discount_type,
      discountValue: promo.discount_value,
      maxDiscountAmount: promo.max_discount_amount,
      minSpendAmount: promo.min_spend_amount,
      giftProductId: promo.gift_product_id,
      giftServiceId: promo.gift_service_id,
      buyQuantity: promo.buy_quantity,
      payQuantity: promo.pay_quantity,
      priority: promo.priority,
      applyScope: promo.apply_scope,
      allowCouponCombination: promo.allow_coupon_combination,
      usageLimit: promo.usage_limit,
      usageLimitPerCustomer: promo.usage_limit_per_customer,
      isActive: true,
      productIds: (promo.promotion_products || []).map((p: any) => p.product_id),
      categoryIds: (promo.promotion_categories || []).map((c: any) => c.category_id),
      serviceIds: (promo.promotion_services || []).map((s: any) => s.service_id),
      storeIds: [],
    }

    const overlapError = await checkPromotionOverlap(supabase, candidate, promotionId)
    if (overlapError) {
      return { success: false, error: overlapError }
    }
  }

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
    await requirePermission(partnerId, "coupons", "view")
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

export async function listActivePromotionsForMarketplaceAction(
  partnerId: string,
  customerId?: string | null,
  storeId?: string | null
) {
  if (!partnerId) return []

  // Use admin client to query promotions securely
  const supabase = getAdminClient()

  let canonicalPartnerId = partnerId
  let canonicalStoreId = storeId || null

  // In some routes/components, a store ID might be passed instead of partnerId.
  // Resolve canonical partnerId and storeId defensively.
  const { data: partnerRow } = await supabase
    .from("partners")
    .select("id")
    .eq("id", partnerId)
    .maybeSingle()

  if (!partnerRow) {
    const { data: storeRow } = await supabase
      .from("stores")
      .select("id, partner_id")
      .eq("id", partnerId)
      .maybeSingle()

    if (storeRow) {
      canonicalPartnerId = storeRow.partner_id
      if (!canonicalStoreId) {
        canonicalStoreId = storeRow.id
      }
    }
  }

  // Campanhas/promoções desativadas no ERP não devem precificar o marketplace.
  const capabilities = await resolveMarketplaceCapabilities(canonicalPartnerId, {
    storeId: canonicalStoreId || undefined,
  })
  if (!capabilities.campaignsEnabled) return []

  const now = new Date().toISOString()

  // Fetch campaigns that are active and current
  let campaignsQuery = supabase
    .from("campaigns")
    .select("id, customer_scope")
    .eq("partner_id", canonicalPartnerId)
    .eq("is_active", true)
    .or(`starts_at.is.null,starts_at.lte.${now}`)
    .or(`ends_at.is.null,ends_at.gte.${now}`)

  if (canonicalStoreId) {
    campaignsQuery = campaignsQuery.or(`store_id.is.null,store_id.eq.${canonicalStoreId}`)
  }

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
      promotion_services(service_id)
    `)
    .eq("partner_id", canonicalPartnerId)
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
      giftServiceId: promo.gift_service_id,
      buyQuantity: promo.buy_quantity,
      payQuantity: promo.pay_quantity,
      priority: promo.priority,
      applyScope: promo.apply_scope as ApplyScope,
      allowCouponCombination: promo.allow_coupon_combination,
      applicableProductIds: (promo.promotion_products || []).map((p: any) => p.product_id),
      applicableCategoryIds: (promo.promotion_categories || []).map((c: any) => c.category_id),
      applicableServiceIds: (promo.promotion_services || []).map((s: any) => s.service_id),
    })
  }

  return await filterRawPromotionsByGiftStock(activePromos, supabase)
}

export async function listActivePromotionsForPartnersAction(partnerIds: string[]): Promise<Map<string, PricingPromotion[]>> {
  const promoMap = new Map<string, PricingPromotion[]>()
  if (!partnerIds || partnerIds.length === 0) return promoMap

  const eligiblePartnerIds: string[] = []
  for (const partnerId of Array.from(new Set(partnerIds))) {
    const capabilities = await resolveMarketplaceCapabilities(partnerId)
    if (capabilities.campaignsEnabled) eligiblePartnerIds.push(partnerId)
  }
  if (eligiblePartnerIds.length === 0) return promoMap

  const supabase = getAdminClient()
  const now = new Date().toISOString()

  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id, partner_id, customer_scope")
    .in("partner_id", eligiblePartnerIds)
    .eq("is_active", true)
    .or(`starts_at.is.null,starts_at.lte.${now}`)
    .or(`ends_at.is.null,ends_at.gte.${now}`)

  if (!campaigns || campaigns.length === 0) {
    return promoMap
  }

  const activeCampaignIds = campaigns.filter((c: any) => c.customer_scope === "all").map((c: any) => c.id)
  if (activeCampaignIds.length === 0) {
    return promoMap
  }

  const { data: promotions } = await supabase
    .from("promotions")
    .select(`
      *,
      promotion_products(product_id),
      promotion_categories(category_id),
      promotion_services(service_id)
    `)
    .in("partner_id", eligiblePartnerIds)
    .eq("is_active", true)
    .in("campaign_id", activeCampaignIds)

  if (!promotions || promotions.length === 0) {
    return promoMap
  }

  for (const promo of promotions) {
    const limit = promo.usage_limit
    const currentCount = promo.usage_count || 0
    if (limit !== null && currentCount >= limit) {
      continue
    }

    const pid = promo.partner_id
    if (!promoMap.has(pid)) {
      promoMap.set(pid, [])
    }

    promoMap.get(pid)!.push({
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
      giftServiceId: promo.gift_service_id,
      buyQuantity: promo.buy_quantity,
      payQuantity: promo.pay_quantity,
      priority: promo.priority || 0,
      applyScope: promo.apply_scope as ApplyScope,
      allowCouponCombination: promo.allow_coupon_combination ?? false,
      applicableProductIds: (promo.promotion_products || []).map((p: any) => p.product_id),
      applicableCategoryIds: (promo.promotion_categories || []).map((c: any) => c.category_id),
      applicableServiceIds: (promo.promotion_services || []).map((s: any) => s.service_id),
    })
  }

  return promoMap
}

export async function getPromotionScopeDataAction(partnerId: string) {
  await requireUser()
  await requirePermission(partnerId, "coupons", "view")
  const supabase = await getSupabaseServerClient()

  const [{ data: products }, { data: services }, { data: categories }, { data: serviceCategories }, { data: customers }, { data: stores }] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, category:product_categories!category_id(name), category_id, price, sku, images, is_active, store_id")
      .eq("partner_id", partnerId)
      .order("name")
      .limit(200),
    supabase
      .from("services")
      .select("id, name, category:service_categories!category_id(name), category_id, price, sku, images, is_active, store_id")
      .eq("partner_id", partnerId)
      .order("name")
      .limit(200),
    supabase
      .from("product_categories")
      .select("id, name, is_active, store_ids")
      .eq("partner_id", partnerId)
      .is("parent_id", null)
      .order("name"),
    supabase
      .from("service_categories")
      .select("id, name, is_active, store_ids")
      .eq("partner_id", partnerId)
      .is("parent_id", null)
      .order("name"),
    supabase
      .from("customers")
      .select("id, name, email, phone, status")
      .eq("partner_id", partnerId)
      .order("name")
      .limit(300),
    supabase
      .from("stores")
      .select("id, name, is_active")
      .eq("partner_id", partnerId)
      .order("name"),
  ])

  const storeMap = new Map<string, string>((stores || []).map((s: any) => [s.id, s.name]))

  const resolveStoreName = (storeId?: string | null, storeIds?: string[] | null) => {
    if (storeIds && storeIds.length > 0) {
      const names = storeIds.map((id) => storeMap.get(id)).filter(Boolean)
      return names.length > 0 ? names.join(", ") : "Toda a Rede"
    }
    if (storeId) {
      return storeMap.get(storeId) || "Toda a Rede"
    }
    return "Toda a Rede"
  }

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
      storeId: p.store_id || null,
      storeIds: p.store_id ? [p.store_id] : [],
      storeName: resolveStoreName(p.store_id),
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
      storeId: s.store_id || null,
      storeIds: s.store_id ? [s.store_id] : [],
      storeName: resolveStoreName(s.store_id),
    })),
    categories: (categories || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      isActive: Boolean(c.is_active),
      storeIds: Array.isArray(c.store_ids) ? c.store_ids : [],
      storeName: resolveStoreName(null, c.store_ids),
    })),
    serviceCategories: (serviceCategories || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      isActive: Boolean(c.is_active),
      storeIds: Array.isArray(c.store_ids) ? c.store_ids : [],
      storeName: resolveStoreName(null, c.store_ids),
    })),
    customers: (customers || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      avatarUrl: null,
      status: c.status,
    })),
    stores: (stores || []).map((s: any) => ({
      id: s.id,
      name: s.name,
      isActive: Boolean(s.is_active),
    })),
  }
}

export async function listActivePromotionsInBatch(partnerIds: string[], customerId?: string | null) {
  if (!partnerIds || partnerIds.length === 0) return {}

  const rawIds = Array.from(new Set(partnerIds.filter(Boolean)))
  if (rawIds.length === 0) return {}

  const supabase = getAdminClient()

  // Check if any passed IDs are actually store IDs and resolve them to partner IDs
  const { data: storeRows } = await supabase
    .from("stores")
    .select("id, partner_id")
    .in("id", rawIds)

  const storeToPartnerMap = new Map<string, string>()
  if (storeRows) {
    for (const s of storeRows) {
      storeToPartnerMap.set(s.id, s.partner_id)
    }
  }

  const canonicalPartnerIds: string[] = []
  for (const id of rawIds) {
    const pId = storeToPartnerMap.get(id) || id
    if (!canonicalPartnerIds.includes(pId)) {
      canonicalPartnerIds.push(pId)
    }
  }

  const eligiblePartnerIds: string[] = []
  for (const partnerId of canonicalPartnerIds) {
    const capabilities = await resolveMarketplaceCapabilities(partnerId)
    if (capabilities.campaignsEnabled) eligiblePartnerIds.push(partnerId)
  }
  if (eligiblePartnerIds.length === 0) return {}

  const now = new Date().toISOString()

  // 1. Fetch campaigns that are active and current for all partners
  let campaignsQuery = supabase
    .from("campaigns")
    .select("id, partner_id, customer_scope")
    .in("partner_id", eligiblePartnerIds)
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
      promotion_services(service_id)
    `)
    .in("partner_id", eligiblePartnerIds)
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
      giftServiceId: promo.gift_service_id,
      buyQuantity: promo.buy_quantity,
      payQuantity: promo.pay_quantity,
      priority: promo.priority,
      applyScope: promo.apply_scope as ApplyScope,
      allowCouponCombination: promo.allow_coupon_combination,
      applicableProductIds: (promo.promotion_products || []).map((p: any) => p.product_id),
      applicableCategoryIds: (promo.promotion_categories || []).map((c: any) => c.category_id),
      applicableServiceIds: (promo.promotion_services || []).map((s: any) => s.service_id),
    })
  }

  for (const partnerId of Object.keys(result)) {
    result[partnerId] = await filterRawPromotionsByGiftStock(result[partnerId], supabase)
  }

  // Also map back to any store IDs that were passed
  for (const [storeId, mappedPartnerId] of storeToPartnerMap.entries()) {
    result[storeId] = result[mappedPartnerId] || []
  }

  return result
}



export async function filterRawPromotionsByGiftStock(
  promotions: PricingPromotion[],
  supabase: any
): Promise<PricingPromotion[]> {
  const giftProductIds = Array.from(
    new Set(
      promotions
        .filter((p) => p.promotionType === PromotionType.GIFT && p.giftProductId)
        .map((p) => p.giftProductId as string)
    )
  )

  if (giftProductIds.length === 0) {
    return promotions
  }

  const { data: productsData, error } = await supabase
    .from("products")
    .select("id, stock_available, is_active")
    .in("id", giftProductIds)

  if (error || !productsData) {
    console.error("Error fetching gift products stock:", error)
    return promotions
  }

  const stockMap = new Map<string, { stockAvailable: number; isActive: boolean }>()
  for (const p of productsData) {
    stockMap.set(p.id, {
      stockAvailable: Number(p.stock_available || 0),
      isActive: Boolean(p.is_active),
    })
  }

  return promotions.map((p) => {
    if (p.promotionType === PromotionType.GIFT && p.giftProductId) {
      const prod = stockMap.get(p.giftProductId)
      if (!prod || !prod.isActive || prod.stockAvailable <= 0) {
        return {
          ...p,
          giftUnavailable: true,
        }
      }
    }
    return p
  })
}

export async function buildGiftOrderItems(
  supabase: any,
  giftIds: string[],
  promotions: PricingPromotion[]
) {
  if (!giftIds || giftIds.length === 0) return []

  const { data: products } = await supabase
    .from("products")
    .select("id, name, price, is_active, stock_available, cost_price")
    .in("id", giftIds)

  const { data: services } = await supabase
    .from("services")
    .select("id, name, price, is_active, cost_price")
    .in("id", giftIds)

  const items: any[] = []

  for (const giftId of giftIds) {
    const promo = promotions.find((p) => p.giftProductId === giftId || p.giftServiceId === giftId)
    if (!promo) continue

    const prod = (products || []).find((p: any) => p.id === giftId)
    if (prod) {
      if (!prod.is_active || (prod.stock_available ?? 0) <= 0) {
        continue
      }
      items.push({
        product_id: prod.id,
        service_id: null,
        variant_id: null,
        product_name: `[BRINDE] ${prod.name}`,
        product_price: 0,
        original_price: Number(prod.price || 0),
        quantity: 1,
        subtotal: 0,
        is_gift: true,
        is_promotional: true,
        promotion_id: promo.id,
        // Brinde não gera receita, mas o custo real entra no CMV/DRE.
        unit_cost: Number(prod.cost_price || 0),
      })
    } else {
      const serv = (services || []).find((s: any) => s.id === giftId)
      if (serv) {
        if (!serv.is_active) continue
        items.push({
          product_id: null,
          service_id: serv.id,
          variant_id: null,
          product_name: `[BRINDE] ${serv.name}`,
          product_price: 0,
          original_price: Number(serv.price || 0),
          quantity: 1,
          subtotal: 0,
          is_gift: true,
          is_promotional: true,
          promotion_id: promo.id,
          // Brinde de serviço: custo real entra no CMV, receita 0.
          unit_cost: Number(serv.cost_price || 0),
        })
      }
    }
  }

  return items
}

export async function getCampaignMetricsAction(partnerId: string, campaignId: string) {
  await requireUser()
  await requirePermission(partnerId, "coupons", "view")
  const supabase = await getSupabaseServerClient()

  // 1. Obter campanha e promoções
  const { data: campaign, error: campError } = await supabase
    .from("campaigns")
    .select("*, promotions(*), campaign_customers(customer_id)")
    .eq("id", campaignId)
    .eq("partner_id", partnerId)
    .single()

  if (campError || !campaign) {
    return { success: false, error: campError?.message || "Campanha não encontrada" }
  }

  const promotions = campaign.promotions || []
  const promoIds = promotions.map((p: any) => p.id)

  const totalUsagesFromPromos = promotions.reduce((acc: number, p: any) => acc + (p.usage_count || 0), 0)
  const usageLimits = promotions
    .map((p: any) => p.usage_limit)
    .filter((lim: any) => lim !== null && lim !== undefined && lim > 0)
  const totalUsageLimit = usageLimits.length > 0 ? usageLimits.reduce((acc: number, lim: number) => acc + lim, 0) : null

  // 2. Buscar promotion_usages
  let usages: any[] = []
  if (promoIds.length > 0) {
    const { data: usagesData } = await supabase
      .from("promotion_usages")
      .select("id, promotion_id, customer_id, order_id, used_at")
      .in("promotion_id", promoIds)
      .order("used_at", { ascending: false })
    usages = usagesData || []
  }

  const orderIds = [...new Set(usages.map((u: any) => u.order_id).filter(Boolean))]

  let orders: any[] = []
  let orderItems: any[] = []

  if (orderIds.length > 0) {
    const { data: ordersData } = await supabase
      .from("orders")
      .select("id, order_number, total_amount, discount_amount, buyer_id, created_at, promotions_applied")
      .in("id", orderIds)
    orders = ordersData || []

    const { data: itemsData } = await supabase
      .from("order_items")
      .select("id, order_id, product_name, product_price, quantity, subtotal, is_promotional, promotion_id")
      .in("order_id", orderIds)
    orderItems = itemsData || []
  }

  const hasRealData = orders.length > 0 || usages.length > 0 || totalUsagesFromPromos > 0

  let totalRevenue = 0
  let totalDiscount = 0
  const totalOrders = orders.length
  const totalUses = Math.max(usages.length, totalUsagesFromPromos)

  const timelineMap: Record<string, { receita: number; desconto: number; pedidos: number }> = {}

  orders.forEach((ord: any) => {
    const rev = Number(ord.total_amount || 0)
    const disc = Number(ord.discount_amount || 0)
    totalRevenue += rev
    totalDiscount += disc

    const dateKey = new Date(ord.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
    if (!timelineMap[dateKey]) {
      timelineMap[dateKey] = { receita: 0, desconto: 0, pedidos: 0 }
    }
    timelineMap[dateKey].receita += rev
    timelineMap[dateKey].desconto += disc
    timelineMap[dateKey].pedidos += 1
  })

  // Se tem usos em promotions mas não havia orders diretamente linkadas
  if (totalRevenue === 0 && totalUsagesFromPromos > 0) {
    const rule = promotions[0]
    const baseTicket = rule?.min_spend_amount ? Number(rule.min_spend_amount) * 1.3 : 120
    let estimatedDiscount = 0
    if (rule?.promotion_type === "discount") {
      estimatedDiscount = rule.discount_type === "percentage"
        ? baseTicket * (Number(rule.discount_value || 10) / 100)
        : Number(rule.discount_value || 15)
    } else {
      estimatedDiscount = 20
    }
    totalRevenue = totalUsagesFromPromos * baseTicket
    totalDiscount = totalUsagesFromPromos * estimatedDiscount
  }

  const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : (totalUses > 0 ? totalRevenue / totalUses : 0)
  const roiMultiplier = totalDiscount > 0 ? Number((totalRevenue / totalDiscount).toFixed(1)) : (totalRevenue > 0 ? 10 : 0)

  // Top products from order items
  const productMap: Record<string, { name: string; quantity: number; totalRevenue: number }> = {}
  orderItems.forEach((item: any) => {
    const name = item.product_name || "Produto"
    if (!productMap[name]) {
      productMap[name] = { name, quantity: 0, totalRevenue: 0 }
    }
    productMap[name].quantity += Number(item.quantity || 1)
    productMap[name].totalRevenue += Number(item.subtotal || item.product_price || 0)
  })

  const topProducts = Object.values(productMap)
    .sort((a, b) => b.totalRevenue - a.totalRevenue)
    .slice(0, 5)

  // Efficiency score calculation (0 to 10)
  let efficiencyScore = 0
  if (hasRealData) {
    let score = 5.0
    if (roiMultiplier >= 5) score += 2.5
    else if (roiMultiplier >= 3) score += 1.5
    else if (roiMultiplier >= 1.5) score += 0.8

    if (totalUses >= 20) score += 2.0
    else if (totalUses >= 5) score += 1.2
    else if (totalUses > 0) score += 0.5

    efficiencyScore = Math.min(10, Math.max(1, Number(score.toFixed(1))))
  }

  const timeline = Object.entries(timelineMap).map(([date, vals]) => ({
    date,
    receita: Math.round(vals.receita),
    desconto: Math.round(vals.desconto),
    pedidos: vals.pedidos,
  }))

  const lastUsedAt = usages[0]?.used_at || null

  return {
    success: true,
    data: {
      hasRealData,
      totalRevenue,
      totalDiscount,
      totalOrders,
      totalUses,
      averageOrderValue,
      roiMultiplier,
      newCustomersPercentage: hasRealData ? 45 : 0,
      returningCustomersPercentage: hasRealData ? 55 : 0,
      usageLimit: totalUsageLimit,
      usageCount: totalUses,
      usagePercentage: totalUsageLimit && totalUsageLimit > 0 ? Math.min(100, Math.round((totalUses / totalUsageLimit) * 100)) : null,
      efficiencyScore,
      lastUsedAt,
      startsAt: campaign.starts_at,
      endsAt: campaign.ends_at,
      isActive: campaign.is_active,
      timeline,
      topProducts,
    }
  }
}
