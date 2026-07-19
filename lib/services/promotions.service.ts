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
  campaign_id: string
  partner_id: string
  name: string
  description: string | null
  promotion_type: "gift" | "buy_x_pay_y" | "discount"
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

export type StoreAssociation = {
  store_id: string
}

/**
 * Resolves promotions válidas para uma store específica.
 * Regra: se promotion_stores vazia → vale para TODAS as stores.
 * Se preenchida → vale apenas para as stores listadas.
 * Único ponto de resolução — toda consulta passa por aqui.
 */
export async function getPromotionsForStore(
  partnerId: string,
  storeId: string | null,
): Promise<PromotionRow[]> {
  const admin = getAdminClient()

  const { data: promotions } = await admin
    .from("promotions")
    .select("*")
    .eq("partner_id", partnerId)
    .eq("is_active", true)
    .order("priority", { ascending: false })

  if (!promotions) return []

  if (!storeId) return promotions as PromotionRow[]

  const rows = promotions as PromotionRow[]
  const ids = rows.map((r) => r.id)

  if (ids.length === 0) return []

  const { data: stores } = await admin
    .from("promotion_stores")
    .select("promotion_id")
    .in("promotion_id", ids)
    .eq("store_id", storeId)

  const storeSet = new Set((stores || []).map((s: { promotion_id: string }) => s.promotion_id))

  return rows.filter((r) => !storeSet.size || storeSet.has(r.id))
}

/**
 * Resolves cupons válidos para uma store específica.
 * Regra: se coupon_stores vazia → vale para TODAS as stores.
 * Se preenchida → vale apenas para as stores listadas.
 * Único ponto de resolução — toda consulta passa por aqui.
 */
export async function getCouponsForStore(
  partnerId: string,
  storeId: string | null,
): Promise<CouponRow[]> {
  const admin = getAdminClient()

  const { data: coupons } = await admin
    .from("coupons")
    .select("*")
    .eq("partner_id", partnerId)
    .eq("is_active", true)

  if (!coupons) return []

  if (!storeId) return coupons as CouponRow[]

  const rows = coupons as CouponRow[]
  const ids = rows.map((r) => r.id)

  if (ids.length === 0) return []

  const { data: stores } = await admin
    .from("coupon_stores")
    .select("coupon_id")
    .in("coupon_id", ids)
    .eq("store_id", storeId)

  const storeSet = new Set((stores || []).map((s: { coupon_id: string }) => s.coupon_id))

  return rows.filter((r) => !storeSet.size || storeSet.has(r.id))
}

/**
 * Verifica se uma promoção específica é válida para uma store.
 */
export async function isPromotionValidForStore(
  promotionId: string,
  storeId: string,
): Promise<boolean> {
  const admin = getAdminClient()

  const { count } = await admin
    .from("promotion_stores")
    .select("*", { count: "exact", head: true })
    .eq("promotion_id", promotionId)

  if (count === 0) return true

  const { data } = await admin
    .from("promotion_stores")
    .select("promotion_id")
    .eq("promotion_id", promotionId)
    .eq("store_id", storeId)
    .maybeSingle()

  return data !== null
}

/**
 * Verifica se um cupom específico é válido para uma store.
 */
export async function isCouponValidForStore(
  couponId: string,
  storeId: string,
): Promise<boolean> {
  const admin = getAdminClient()

  const { count } = await admin
    .from("coupon_stores")
    .select("*", { count: "exact", head: true })
    .eq("coupon_id", couponId)

  if (count === 0) return true

  const { data } = await admin
    .from("coupon_stores")
    .select("coupon_id")
    .eq("coupon_id", couponId)
    .eq("store_id", storeId)
    .maybeSingle()

  return data !== null
}

/**
 * Substitui todas as associações de lojas de uma promoção em batch.
 * storeIds vazio = remove todas (promoção vale para todas as lojas).
 */
export async function setPromotionStores(
  promotionId: string,
  storeIds: string[],
): Promise<void> {
  const admin = getAdminClient()

  await admin.from("promotion_stores").delete().eq("promotion_id", promotionId)

  if (storeIds.length === 0) return

  const rows = storeIds.map((store_id) => ({ promotion_id: promotionId, store_id }))
  const { error } = await admin.from("promotion_stores").insert(rows)
  if (error) throw new Error(`Erro ao salvar lojas da promoção: ${error.message}`)
}

/**
 * Substitui todas as associações de lojas de um cupom em batch.
 * storeIds vazio = remove todas (cupom vale para todas as lojas).
 */
export async function setCouponStores(
  couponId: string,
  storeIds: string[],
): Promise<void> {
  const admin = getAdminClient()

  await admin.from("coupon_stores").delete().eq("coupon_id", couponId)

  if (storeIds.length === 0) return

  const rows = storeIds.map((store_id) => ({ coupon_id: couponId, store_id }))
  const { error } = await admin.from("coupon_stores").insert(rows)
  if (error) throw new Error(`Erro ao salvar lojas do cupom: ${error.message}`)
}

/**
 * Busca as stores associadas a uma promoção.
 */
export async function getPromotionStoreIds(promotionId: string): Promise<string[]> {
  const admin = getAdminClient()
  const { data } = await admin
    .from("promotion_stores")
    .select("store_id")
    .eq("promotion_id", promotionId)
  return (data || []).map((r: { store_id: string }) => r.store_id)
}

/**
 * Busca as stores associadas a um cupom.
 */
export async function getCouponStoreIds(couponId: string): Promise<string[]> {
  const admin = getAdminClient()
  const { data } = await admin
    .from("coupon_stores")
    .select("store_id")
    .eq("coupon_id", couponId)
  return (data || []).map((r: { store_id: string }) => r.store_id)
}
