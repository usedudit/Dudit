"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { getAdminClient } from "@/lib/supabase/admin"
import { requireUser } from "@/lib/auth/authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { revalidateCart } from "@/lib/utils/revalidation"
import type { ServiceBookingMetadata } from "@/lib/types/marketplace-cart"
import { addToCartAction } from "@/app/actions/marketplace/cart"

async function assertCanBuyFromPartner(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  userId: string,
  partnerId: string,
) {
  const admin = getAdminClient()
  const { data: partner } = await admin.from("partners").select("user_id").eq("id", partnerId).single()
  if (partner?.user_id === userId) {
    return { error: "Você não pode comprar da sua própria loja." }
  }
  const { data: team } = await supabase
    .from("partner_users")
    .select("id")
    .eq("partner_id", partnerId)
    .eq("user_id", userId)
    .maybeSingle()
  if (team) {
    return { error: "Você não pode comprar de uma loja da qual faz parte da equipe." }
  }
  return { success: true }
}

export async function addServiceBookingToCartAction(
  input: {
    serviceId: string
    partnerId: string
    booking: ServiceBookingMetadata
    payDepositOnly?: boolean
    csrf_token?: string
    storeId?: string
  },
) {
  await requireRateLimit(RateLimitCategory.CART)
  const { requireCSRF } = await import("@/lib/security/csrf-action-wrapper")
  const csrfValidation = await requireCSRF(input.csrf_token)
  if (!csrfValidation.valid) return { error: csrfValidation.error }

  const supabase = await getSupabaseServerClient()
  const user = await requireUser()
  const guard = await assertCanBuyFromPartner(supabase, user.id, input.partnerId)
  if (guard.error) return { error: guard.error }

  const admin = getAdminClient()
  let serviceQuery = admin
    .from("services")
    .select("id, is_active, partner_id")
    .eq("id", input.serviceId)
    .eq("partner_id", input.partnerId)
  if (input.storeId) serviceQuery = serviceQuery.eq("store_id", input.storeId)
  const { data: service } = await serviceQuery.maybeSingle()

  if (!service?.is_active) return { error: "Serviço indisponível." }

  const { data, error } = await supabase
    .from("cart_items")
    .insert({
      user_id: user.id,
      partner_id: input.partnerId,
      store_id: input.storeId || null,
      item_type: "service_booking",
      service_id: input.serviceId,
      product_id: null,
      quantity: 1,
      selected: true,
      booking_metadata: input.booking,
      pay_deposit_only: Boolean(input.payDepositOnly),
    })
    .select("id")
    .single()

  if (error) return { error: error.message }
  await revalidateCart(user.id)
  return { success: true, cartItemId: data.id }
}

/** Buy-now: adds product to cart and returns cart line id for unified checkout. */
export async function prepareProductBuyNowCheckoutAction(input: {
  productId: string
  partnerId: string
  quantity?: number
  variantId?: string
  csrf_token?: string
  storeId?: string
}) {
  const addResult = await addToCartAction(
    input.productId,
    input.quantity ?? 1,
    input.csrf_token,
    input.variantId,
    input.storeId,
  )
  if (addResult.error) return { error: addResult.error }

  const supabase = await getSupabaseServerClient()
  const user = await requireUser()

  let query = supabase
    .from("cart_items")
    .select("id")
    .eq("user_id", user.id)
    .eq("partner_id", input.partnerId)
    .eq("item_type", "product")
    .eq("product_id", input.productId)
    .order("updated_at", { ascending: false })
    .limit(1)

  if (input.variantId) {
    query = query.eq("variant_id", input.variantId)
  } else {
    query = query.is("variant_id", null)
  }

  const { data: row } = await query.maybeSingle()
  if (!row?.id) return { error: "Item não encontrado na sacola." }

  await supabase.from("cart_items").update({ selected: true }).eq("id", row.id)
  await revalidateCart(user.id)

  return { success: true, cartItemId: row.id as string }
}

/** Book Now flow: stores selection in cart and returns checkout path (no appointment created). */
export async function prepareServiceBookingCheckoutAction(
  input: {
    serviceId: string
    partnerId: string
    booking: ServiceBookingMetadata
    payDepositOnly?: boolean
    csrf_token?: string
    storeId?: string
  },
) {
  const result = await addServiceBookingToCartAction(input)
  if (result.error) return result
  return { success: true, cartItemId: result.cartItemId, redirectTo: "/checkout" }
}

export async function addSubscriptionToCartAction(
  input: { recurringPlanId: string; partnerId: string; csrf_token?: string },
) {
  await requireRateLimit(RateLimitCategory.CART)
  const { requireCSRF } = await import("@/lib/security/csrf-action-wrapper")
  const csrfValidation = await requireCSRF(input.csrf_token)
  if (!csrfValidation.valid) return { error: csrfValidation.error }

  const supabase = await getSupabaseServerClient()
  const user = await requireUser()
  const guard = await assertCanBuyFromPartner(supabase, user.id, input.partnerId)
  if (guard.error) return { error: guard.error }

  const admin = getAdminClient()
  const { data: plan } = await admin
    .from("recurring_plans")
    .select("id, status, show_in_marketplace, partner_id")
    .eq("id", input.recurringPlanId)
    .eq("partner_id", input.partnerId)
    .maybeSingle()

  if (!plan || plan.status !== "active" || !plan.show_in_marketplace) {
    return { error: "Plano indisponível." }
  }

  const { data: existing } = await supabase
    .from("cart_items")
    .select("id")
    .eq("user_id", user.id)
    .eq("item_type", "subscription")
    .eq("recurring_plan_id", input.recurringPlanId)
    .maybeSingle()

  if (existing?.id) {
    await supabase.from("cart_items").update({ selected: true }).eq("id", existing.id)
    await revalidateCart(user.id)
    return { success: true, cartItemId: existing.id }
  }

  const { data, error } = await supabase
    .from("cart_items")
    .insert({
      user_id: user.id,
      partner_id: input.partnerId,
      item_type: "subscription",
      recurring_plan_id: input.recurringPlanId,
      product_id: null,
      quantity: 1,
      selected: true,
    })
    .select("id")
    .single()

  if (error) return { error: error.message }
  await revalidateCart(user.id)
  return { success: true, cartItemId: data.id }
}

export async function addPurchasableServiceToCartAction(
  input: { serviceId: string; partnerId: string; quantity?: number; csrf_token?: string; storeId?: string },
) {
  await requireRateLimit(RateLimitCategory.CART)
  const { requireCSRF } = await import("@/lib/security/csrf-action-wrapper")
  const csrfValidation = await requireCSRF(input.csrf_token)
  if (!csrfValidation.valid) return { error: csrfValidation.error }

  const supabase = await getSupabaseServerClient()
  const user = await requireUser()
  const guard = await assertCanBuyFromPartner(supabase, user.id, input.partnerId)
  if (guard.error) return { error: guard.error }

  const admin = getAdminClient()
  let serviceQuery = admin
    .from("services")
    .select("id, name, price, is_active")
    .eq("id", input.serviceId)
    .eq("partner_id", input.partnerId)
  if (input.storeId) serviceQuery = serviceQuery.eq("store_id", input.storeId)
  const { data: service } = await serviceQuery.maybeSingle()

  if (!service?.is_active) return { error: "Serviço indisponível." }
  return { error: "Este serviço requer agendamento. Selecione data e horário." }

  const booking: ServiceBookingMetadata = {
    staffId: "",
    staffName: "-",
    date: new Date().toISOString().slice(0, 10),
    time: "00:00",
    serviceName: service.name,
    durationMinutes: 0,
    price: Number(service.price || 0),
    instantPurchase: true,
  }

  return addServiceBookingToCartAction({
    serviceId: input.serviceId,
    partnerId: input.partnerId,
    booking,
    csrf_token: input.csrf_token,
  })
}

// ─── Gift Item Details (marketplace-safe fetch) ──────────────────────────

export async function getGiftItemDetailsAction(input: {
  itemId: string
  itemType: "product" | "service"
  storeId?: string
}) {
  const admin = getAdminClient()
  if (input.itemType === "product") {
    let q = admin
      .from("products")
      .select("name, image_url, images")
      .eq("id", input.itemId)
      .eq("is_active", true)
      .eq("show_in_marketplace", true)
    if (input.storeId) q = q.eq("store_id", input.storeId)
    const { data } = await q.single()
    if (!data) return null
    return { name: data.name, image_url: data.image_url || (data.images?.[0]) || null, isProduct: true as const }
  }
  let q = admin
    .from("services")
    .select("name, images")
    .eq("id", input.itemId)
    .eq("is_active", true)
    .eq("show_in_marketplace", true)
  if (input.storeId) q = q.eq("store_id", input.storeId)
  const { data } = await q.single()
  if (!data) return null
  return { name: data.name, image_url: (data.images?.[0]) || null, isProduct: false as const }
}
