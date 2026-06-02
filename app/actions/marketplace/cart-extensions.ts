"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { getAdminClient } from "@/lib/supabase/admin"
import { requireUser } from "@/lib/auth/authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { revalidateCart } from "@/lib/utils/revalidation"
import type { ServiceBookingMetadata } from "@/lib/types/marketplace-cart"

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
  return { ok: true as const }
}

export async function addServiceBookingToCartAction(
  input: {
    serviceId: string
    partnerId: string
    booking: ServiceBookingMetadata
    payDepositOnly?: boolean
    csrf_token?: string
  },
) {
  await requireRateLimit(RateLimitCategory.CART)
  const { requireCSRF } = await import("@/lib/security/csrf-action-wrapper")
  const csrfValidation = await requireCSRF(input.csrf_token)
  if (!csrfValidation.valid) return { error: csrfValidation.error }

  const supabase = await getSupabaseServerClient()
  const user = await requireUser()
  const guard = await assertCanBuyFromPartner(supabase, user.id, input.partnerId)
  if ("error" in guard) return guard

  const admin = getAdminClient()
  const { data: service } = await admin
    .from("services")
    .select("id, is_active, partner_id")
    .eq("id", input.serviceId)
    .eq("partner_id", input.partnerId)
    .maybeSingle()

  if (!service?.is_active) return { error: "Serviço indisponível." }

  const { data, error } = await supabase
    .from("cart_items")
    .insert({
      user_id: user.id,
      partner_id: input.partnerId,
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

/** Book Now flow: stores selection in cart and returns checkout path (no appointment created). */
export async function prepareServiceBookingCheckoutAction(
  input: {
    serviceId: string
    partnerId: string
    booking: ServiceBookingMetadata
    payDepositOnly?: boolean
    csrf_token?: string
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
  if ("error" in guard) return guard

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
  input: { serviceId: string; partnerId: string; quantity?: number; csrf_token?: string },
) {
  await requireRateLimit(RateLimitCategory.CART)
  const { requireCSRF } = await import("@/lib/security/csrf-action-wrapper")
  const csrfValidation = await requireCSRF(input.csrf_token)
  if (!csrfValidation.valid) return { error: csrfValidation.error }

  const supabase = await getSupabaseServerClient()
  const user = await requireUser()
  const guard = await assertCanBuyFromPartner(supabase, user.id, input.partnerId)
  if ("error" in guard) return guard

  const admin = getAdminClient()
  const { data: service } = await admin
    .from("services")
    .select("id, name, price, is_active, scheduling_enabled")
    .eq("id", input.serviceId)
    .eq("partner_id", input.partnerId)
    .maybeSingle()

  if (!service?.is_active) return { error: "Serviço indisponível." }
  if (service.scheduling_enabled !== false) {
    return { error: "Este serviço requer agendamento. Selecione data e horário." }
  }

  const booking: ServiceBookingMetadata = {
    staffId: "",
    staffName: "—",
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
