import "server-only"

import { getAdminClient } from "@/lib/supabase/admin"

export type CampaignRow = {
  id: string
  partner_id: string
  name: string
  description: string | null
  customer_scope: string
  starts_at: string | null
  ends_at: string | null
  is_active: boolean
  store_id: string | null
  created_at: string
}

export type PromotionRow = {
  id: string
  campaign_id: string | null
  partner_id: string
  store_id: string | null
  name: string
  description: string | null
   promotion_type: "gift" | "buy_x_pay_y" | "discount" | "free_shipping"
  discount_type: "percentage" | "fixed" | null
  discount_value: number | null
  max_discount_amount: number | null
  min_spend_amount: number | null
  gift_product_id: string | null
  buy_quantity: number | null
  pay_quantity: number | null
  priority: number
  apply_scope: string
  allow_coupon_combination: boolean
  usage_limit: number | null
  usage_limit_per_customer: number | null
  usage_count: number
  is_active: boolean
  created_at: string
}

export type CouponRow = {
  id: string
  partner_id: string
  store_id: string | null
  code: string
  discount_type: "percentage" | "fixed" | "free_shipping"
  discount_value: number | null
  apply_scope: string
  allow_combination: boolean
  min_cart_value: number
  max_discount_value: number | null
  usage_limit: number | null
  usage_per_customer: number | null
  first_purchase_only: boolean
  starts_at: string | null
  ends_at: string | null
  is_active: boolean
  created_at: string
}

/**
 * Resolves promoções válidas para uma store específica.
 * Regra: se store_id for NULL na promoção → vale para TODAS as stores do parceiro.
 * Se preenchida → vale apenas para a store_id específica.
 */
export async function getPromotionsForStore(
  partnerId: string,
  storeId: string | null,
): Promise<PromotionRow[]> {
  const admin = getAdminClient()

  let query = admin
    .from("promotions")
    .select("*")
    .eq("partner_id", partnerId)
    .eq("is_active", true)
    .order("priority", { ascending: false })

  if (storeId) {
    query = query.or(`store_id.is.null,store_id.eq.${storeId}`)
  }

  const { data: promotions } = await query
  return (promotions || []) as PromotionRow[]
}

/**
 * Resolves cupons válidos para uma store específica.
 * Regra: se store_id for NULL no cupom → vale para TODAS as stores do parceiro.
 * Se preenchida → vale apenas para a store_id específica.
 */
export async function getCouponsForStore(
  partnerId: string,
  storeId: string | null,
): Promise<CouponRow[]> {
  const admin = getAdminClient()

  let query = admin
    .from("coupons")
    .select("*")
    .eq("partner_id", partnerId)
    .eq("is_active", true)

  if (storeId) {
    query = query.or(`store_id.is.null,store_id.eq.${storeId}`)
  }

  const { data: coupons } = await query
  return (coupons || []) as CouponRow[]
}

/**
 * Verifica se uma promoção específica é válida para uma store.
 */
export async function isPromotionValidForStore(
  promotionId: string,
  storeId: string,
): Promise<boolean> {
  const admin = getAdminClient()

  const { data } = await admin
    .from("promotions")
    .select("store_id")
    .eq("id", promotionId)
    .maybeSingle()

  if (!data) return false
  return data.store_id === null || data.store_id === storeId
}

/**
 * Verifica se um cupom específico é válido para uma store.
 */
export async function isCouponValidForStore(
  couponId: string,
  storeId: string,
): Promise<boolean> {
  const admin = getAdminClient()

  const { data } = await admin
    .from("coupons")
    .select("store_id")
    .eq("id", couponId)
    .maybeSingle()

  if (!data) return false
  return data.store_id === null || data.store_id === storeId
}

/**
 * Atualiza a associação de loja de uma promoção.
 */
export async function setPromotionStore(
  promotionId: string,
  storeId: string | null,
): Promise<void> {
  const admin = getAdminClient()
  const { error } = await admin
    .from("promotions")
    .update({ store_id: storeId })
    .eq("id", promotionId)

  if (error) throw new Error(`Erro ao atualizar loja da promoção: ${error.message}`)
}

/**
 * Atualiza a associação de loja de um cupom.
 */
export async function setCouponStore(
  couponId: string,
  storeId: string | null,
): Promise<void> {
  const admin = getAdminClient()
  const { error } = await admin
    .from("coupons")
    .update({ store_id: storeId })
    .eq("id", couponId)

  if (error) throw new Error(`Erro ao atualizar loja do cupom: ${error.message}`)
}

export async function setPromotionStores(
  promotionId: string,
  storeIds: string[],
): Promise<void> {
  const storeId = storeIds.length > 0 ? storeIds[0] : null
  await setPromotionStore(promotionId, storeId)
}

export async function setCouponStores(
  couponId: string,
  storeIds: string[],
): Promise<void> {
  const storeId = storeIds.length > 0 ? storeIds[0] : null
  await setCouponStore(couponId, storeId)
}

export async function getPromotionStoreIds(promotionId: string): Promise<string[]> {
  const admin = getAdminClient()
  const { data } = await admin
    .from("promotions")
    .select("store_id")
    .eq("id", promotionId)
    .maybeSingle()
  return data?.store_id ? [data.store_id] : []
}

export async function getCouponStoreIds(couponId: string): Promise<string[]> {
  const admin = getAdminClient()
  const { data } = await admin
    .from("coupons")
    .select("store_id")
    .eq("id", couponId)
    .maybeSingle()
  return data?.store_id ? [data.store_id] : []
}
