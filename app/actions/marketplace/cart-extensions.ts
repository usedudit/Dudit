"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { getAdminClient } from "@/lib/supabase/admin"
import { requireUser } from "@/lib/auth/authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { revalidateCart } from "@/lib/utils/revalidation"
import type { ServiceBookingMetadata } from "@/lib/types/marketplace-cart"
import { addToCartAction } from "@/app/actions/marketplace/cart"
import {
  resolveMarketplaceCapabilities,
  resolveRecurringPlanSaleBlock,
} from "@/lib/marketplace-capabilities"

export async function assertCanBuyFromStore(
  userId: string,
  partnerId: string,
  storeId?: string | null,
): Promise<{ success?: boolean; error?: string }> {
  const admin = getAdminClient()

  const { data: partner } = await admin
    .from("partners")
    .select("user_id")
    .eq("id", partnerId)
    .maybeSingle()

  if (partner?.user_id === userId) {
    return { error: "Você não pode comprar da sua própria loja." }
  }

  const { data: teamMember } = await admin
    .from("partner_users")
    .select("id, role_id")
    .eq("partner_id", partnerId)
    .eq("user_id", userId)
    .maybeSingle()

  if (!teamMember) {
    return { success: true }
  }

  const roleUpper = String(teamMember.role_id || "").toUpperCase()
  if (roleUpper === "OWNER" || roleUpper === "ADMIN") {
    return { error: "Você não pode comprar de uma loja da qual faz parte da equipe." }
  }

  if (!storeId) {
    return { error: "Você não pode comprar de uma loja da qual faz parte da equipe." }
  }

  const { data: storeAccess } = await admin
    .from("store_members")
    .select("id")
    .eq("partner_user_id", teamMember.id)
    .eq("store_id", storeId)
    .maybeSingle()

  if (storeAccess) {
    return { error: "Você não pode comprar de uma loja da qual faz parte da equipe." }
  }

  const { data: allMemberStores } = await admin
    .from("store_members")
    .select("id")
    .eq("partner_user_id", teamMember.id)
    .limit(1)

  if (allMemberStores && allMemberStores.length > 0) {
    return { success: true }
  }

  return { error: "Você não pode comprar de uma loja da qual faz parte da equipe." }
}

export async function checkCanUserBuyFromStoreAction(partnerId: string, storeId?: string | null) {
  try {
    const { getCurrentUser } = await import("@/lib/auth/authorization")
    const user = await getCurrentUser()
    if (!user) return { canBuy: true, isOwner: false, isTeamMember: false }
    const guard = await assertCanBuyFromStore(user.id, partnerId, storeId)
    if (guard.error) {
      const isOwner = guard.error.includes("sua própria loja")
      return { canBuy: false, isOwner, isTeamMember: !isOwner, reason: guard.error }
    }
    return { canBuy: true, isOwner: false, isTeamMember: false }
  } catch {
    return { canBuy: true, isOwner: false, isTeamMember: false }
  }
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
  const admin = getAdminClient()
  const { data: service, error: serviceError } = await admin
    .from("services")
    .select("id, is_active, status, deleted_at, partner_id, store_id, price")
    .eq("id", input.serviceId)
    .maybeSingle()

  if (serviceError || !service) {
    console.error("[addServiceBookingToCartAction] Service not found:", {
      serviceId: input.serviceId,
      error: serviceError?.message,
    })
    return { error: "Serviço não encontrado." }
  }

  const canonicalPartnerId = service.partner_id
  let effectiveStoreId = input.storeId || service.store_id || null

  if (input.partnerId && input.partnerId !== canonicalPartnerId) {
    const { data: storeMatch } = await admin
      .from("stores")
      .select("id, partner_id")
      .eq("id", input.partnerId)
      .maybeSingle()

    if (storeMatch && storeMatch.partner_id === canonicalPartnerId) {
      if (!effectiveStoreId) effectiveStoreId = storeMatch.id
    } else {
      console.warn("[addServiceBookingToCartAction] Partner mismatch:", {
        servicePartnerId: canonicalPartnerId,
        inputPartnerId: input.partnerId,
      })
      return { error: "Serviço não pertence a este estabelecimento." }
    }
  }

  const guard = await assertCanBuyFromStore(user.id, canonicalPartnerId, effectiveStoreId)
  if (guard.error) return { error: guard.error }

  const { canStoreAcceptOrders, INACTIVE_SHOWCASE_ERROR } = await import("@/lib/commerce/store-showcase")
  const acceptance = await canStoreAcceptOrders(admin, { storeId: effectiveStoreId, partnerId: canonicalPartnerId })
  if (!acceptance.allowed) return { error: acceptance.message || INACTIVE_SHOWCASE_ERROR }

  const capabilities = await resolveMarketplaceCapabilities(canonicalPartnerId, {
    storeId: effectiveStoreId,
  })
  if (!capabilities.appointmentsViaDudit) {
    return {
      error: "Os agendamentos estão desativados nesta loja. Agende diretamente pelo WhatsApp.",
      whatsappFallback: true,
      whatsappPhone: capabilities.whatsappPhone,
    }
  }

  if (
    service.deleted_at ||
    service.status === "archived" ||
    service.status === "inativo" ||
    service.is_active === false
  ) {
    console.warn("[addServiceBookingToCartAction] Service inactive or archived:", {
      id: service.id,
      status: service.status,
      is_active: service.is_active,
      deleted_at: service.deleted_at,
    })
    return { error: "Este serviço está temporariamente indisponível." }
  }

  if (service.store_id && effectiveStoreId && service.store_id !== effectiveStoreId) {
    console.warn("[addServiceBookingToCartAction] Store exclusivity mismatch:", {
      serviceStoreId: service.store_id,
      effectiveStoreId,
    })
    return { error: "Este serviço não está disponível nesta unidade." }
  }

  // Check if identical booking already exists in cart for this user
  const { data: existingItems } = await supabase
    .from("cart_items")
    .select("id, booking_metadata")
    .eq("user_id", user.id)
    .eq("item_type", "service_booking")
    .eq("service_id", input.serviceId)

  const match = (existingItems || []).find((item: any) => {
    try {
      const existingDate = item.booking_metadata?.date
      const existingTime = item.booking_metadata?.time
      const existingStaff = item.booking_metadata?.staffId
      return (
        existingDate === input.booking.date &&
        existingTime === input.booking.time &&
        existingStaff === input.booking.staffId
      )
    } catch {
      return false
    }
  })

  if (match?.id) {
    const { error: updateError } = await supabase
      .from("cart_items")
      .update({
        selected: true,
        store_id: effectiveStoreId,
        booking_metadata: input.booking,
        pay_deposit_only: Boolean(input.payDepositOnly),
        updated_at: new Date().toISOString(),
      })
      .eq("id", match.id)

    if (updateError) {
      console.error("[addServiceBookingToCartAction] Update existing cart item error:", updateError)
      return { error: updateError.message }
    }

    await revalidateCart(user.id)
    return { success: true, cartItemId: match.id }
  }

  const { data, error } = await supabase
    .from("cart_items")
    .insert({
      user_id: user.id,
      partner_id: canonicalPartnerId,
      store_id: effectiveStoreId,
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

  if (error) {
    if (error.code === "23505" || error.message?.includes("cart_items_user_service_booking_key")) {
      const { data: existing } = await supabase
        .from("cart_items")
        .select("id")
        .eq("user_id", user.id)
        .eq("item_type", "service_booking")
        .eq("service_id", input.serviceId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (existing?.id) {
        await supabase
          .from("cart_items")
          .update({
            selected: true,
            store_id: effectiveStoreId,
            booking_metadata: input.booking,
            pay_deposit_only: Boolean(input.payDepositOnly),
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id)

        await revalidateCart(user.id)
        return { success: true, cartItemId: existing.id }
      }
    }

    console.error("[addServiceBookingToCartAction] Insert cart_items error:", error)
    return { error: error.message }
  }

  await revalidateCart(user.id)
  return { success: true, cartItemId: data.id }
}

/** Order bump: adds a suggested product to cart with full server-side validation. */
export async function addBumpProductToCartAction(input: {
  productId: string
  partnerId: string
  storeId?: string
  csrf_token?: string
}) {
  const addResult = await addToCartAction(
    input.productId,
    1,
    input.csrf_token,
    undefined,
    input.storeId,
  )
  if (addResult.error) return { error: addResult.error }

  const supabase = await getSupabaseServerClient()
  const user = await requireUser()

  const { data: row } = await supabase
    .from("cart_items")
    .select("id, product_id, quantity")
    .eq("user_id", user.id)
    .eq("partner_id", input.partnerId)
    .eq("item_type", "product")
    .eq("product_id", input.productId)
    .is("variant_id", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!row?.id) return { error: "Item não encontrado na sacola." }

  await supabase.from("cart_items").update({ selected: true }).eq("id", row.id)
  await revalidateCart(user.id)

  return { success: true, cartItemId: row.id as string, quantity: row.quantity }
}

/** Buy-now: adds product to cart and returns cart line id for unified checkout. */
export async function prepareProductBuyNowCheckoutAction(input: {
  productId: string
  partnerId: string
  quantity?: number
  variantId?: string
  csrf_token?: string
  storeId?: string
  selectedAddons?: Array<{
    groupId: string
    groupName: string
    optionId: string
    optionName: string
    price: number
  }>
}) {
  const addResult = await addToCartAction(
    input.productId,
    input.quantity ?? 1,
    input.csrf_token,
    input.variantId,
    input.storeId,
    input.selectedAddons,
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
  input: {
    recurringPlanId: string
    partnerId: string
    csrf_token?: string
    /** Escolha de recebimento feita na página do plano (delivery/pickup). */
    fulfillmentMode?: "delivery" | "pickup"
  },
) {
  await requireRateLimit(RateLimitCategory.CART)
  const { requireCSRF } = await import("@/lib/security/csrf-action-wrapper")
  const csrfValidation = await requireCSRF(input.csrf_token)
  if (!csrfValidation.valid) return { error: csrfValidation.error }

  const supabase = await getSupabaseServerClient()
  const user = await requireUser()
  const admin = getAdminClient()

  // O plano e' a fonte da verdade: busca por id (ou short_id) e usa o
  // partner_id/ store_id do proprio plano. Assim um id de parceiro errado
  // vindo do cliente nao derruba a compra com "plano indisponivel".
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.recurringPlanId)
  const planFields = "id, short_id, status, show_in_marketplace, partner_id, store_id, fulfillment_modes"
  const { data: plan, error: planError } = isUuid
    ? await admin.from("recurring_plans").select(planFields).eq("id", input.recurringPlanId).maybeSingle()
    : await admin.from("recurring_plans").select(planFields).eq("short_id", input.recurringPlanId).maybeSingle()

  if (planError) {
    console.error("[addSubscriptionToCartAction] Falha ao buscar plano:", planError.message)
  }
  if (!plan) {
    return { error: "Plano não encontrado. Atualize a página e tente novamente." }
  }
  if (plan.status !== "active") {
    return { error: "Este plano não está mais ativo para novas assinaturas." }
  }
  if (!plan.show_in_marketplace) {
    return { error: "Este plano não está disponível para novas assinaturas no momento." }
  }

  const partnerId = String(plan.partner_id)

  const guard = await assertCanBuyFromStore(user.id, partnerId)
  if (guard.error) return { error: guard.error }

  const { canStoreAcceptOrders, INACTIVE_SHOWCASE_ERROR } = await import("@/lib/commerce/store-showcase")
  const acceptance = await canStoreAcceptOrders(admin, { partnerId })
  if (!acceptance.allowed) return { error: acceptance.message || INACTIVE_SHOWCASE_ERROR }

  // Modulo recorrente exclusivo do Escalar: recusa amigavel ao comprador
  const { getRecurringModuleAccess, checkActiveSubscriptionCreateLimit } = await import("@/lib/services/recurring/limits")
  const access = await getRecurringModuleAccess(partnerId)
  if (!access.allowed) {
    return { error: "Este lojista não possui assinaturas recorrentes disponíveis no momento." }
  }
  const subLimit = await checkActiveSubscriptionCreateLimit(partnerId)
  if (!subLimit.allowed) {
    return { error: "Este lojista atingiu o limite de assinaturas ativas no momento." }
  }

  // Recursos desativados no ERP bloqueiam apenas vendas novas. Assinaturas
  // existentes continuam cobrando normalmente (são contratos).
  const capabilities = await resolveMarketplaceCapabilities(partnerId, {
    storeId: plan.store_id || null,
  })
  const { data: planItems } = await admin
    .from("recurring_plan_items")
    .select("item_type")
    .eq("plan_id", plan.id)

  const saleBlock = resolveRecurringPlanSaleBlock(
    capabilities,
    (planItems || []) as Array<{ item_type: string }>,
    input.fulfillmentMode || null,
  )
  if (saleBlock) {
    return {
      error: "Este plano não está disponível para novas assinaturas pela Dudit no momento. Fale pelo WhatsApp.",
      whatsappFallback: true,
      whatsappPhone: capabilities.whatsappPhone,
    }
  }

  // A assinatura não fica na sacola: a linha criada aqui é só o suporte do
  // checkout direto (página do plano → /checkout) e some quando o pedido é
  // criado. Remove resíduos de checkouts abandonados (inclusive de outros
  // planos) para não acumular linhas invisíveis.
  await supabase
    .from("cart_items")
    .delete()
    .eq("user_id", user.id)
    .eq("item_type", "subscription")

  // Modo de recebimento escolhido na página do plano - só persiste se o plano aceitar.
  const planAllowedModes: string[] = Array.isArray(plan.fulfillment_modes)
    ? plan.fulfillment_modes as string[]
    : ["delivery", "pickup"]
  const requestedMode = input.fulfillmentMode === "pickup" || input.fulfillmentMode === "delivery"
    ? input.fulfillmentMode
    : null
  const fulfillmentMode = requestedMode && planAllowedModes.includes(requestedMode) ? requestedMode : null

  const { data, error } = await supabase
    .from("cart_items")
    .insert({
      user_id: user.id,
      partner_id: partnerId,
      store_id: plan.store_id || null,
      item_type: "subscription",
      recurring_plan_id: plan.id,
      product_id: null,
      quantity: 1,
      selected: true,
      fulfillment_mode: fulfillmentMode,
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
  const admin = getAdminClient()
  const { data: service, error: serviceError } = await admin
    .from("services")
    .select("id, name, price, is_active, status, deleted_at, partner_id, store_id")
    .eq("id", input.serviceId)
    .maybeSingle()

  if (serviceError || !service) return { error: "Serviço não encontrado." }

  const canonicalPartnerId = service.partner_id
  let effectiveStoreId = input.storeId || service.store_id || null

  if (input.partnerId && input.partnerId !== canonicalPartnerId) {
    const { data: storeMatch } = await admin
      .from("stores")
      .select("id, partner_id")
      .eq("id", input.partnerId)
      .maybeSingle()

    if (storeMatch && storeMatch.partner_id === canonicalPartnerId) {
      if (!effectiveStoreId) effectiveStoreId = storeMatch.id
    } else {
      return { error: "Serviço não pertence a este estabelecimento." }
    }
  }

  const guard = await assertCanBuyFromStore(user.id, canonicalPartnerId, effectiveStoreId)
  if (guard.error) return { error: guard.error }

  const { canStoreAcceptOrders } = await import("@/lib/commerce/store-showcase")
  const orderAcceptance = await canStoreAcceptOrders(admin, { storeId: effectiveStoreId, partnerId: canonicalPartnerId })
  if (!orderAcceptance.allowed) return { error: orderAcceptance.message }

  if (
    service.deleted_at ||
    service.status === "archived" ||
    service.status === "inativo" ||
    service.is_active === false
  ) {
    return { error: "Este serviço está temporariamente indisponível." }
  }
  if (service.store_id && effectiveStoreId && service.store_id !== effectiveStoreId) {
    return { error: "Este serviço não está disponível nesta unidade." }
  }

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
    partnerId: canonicalPartnerId,
    booking,
    csrf_token: input.csrf_token,
    storeId: effectiveStoreId || undefined,
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
      .select("name, image_url, images, store_id")
      .eq("id", input.itemId)
      .eq("is_active", true)
      .eq("show_in_marketplace", true)
    const { data } = await q.maybeSingle()
    if (!data) return null
    if (data.store_id && input.storeId && data.store_id !== input.storeId) return null
    return { name: data.name, image_url: data.image_url || (data.images?.[0]) || null, isProduct: true as const }
  }
  let q = admin
    .from("services")
    .select("name, images, store_id")
    .eq("id", input.itemId)
    .eq("is_active", true)
    .eq("show_in_marketplace", true)
  const { data } = await q.maybeSingle()
  if (!data) return null
  if (data.store_id && input.storeId && data.store_id !== input.storeId) return null
  return { name: data.name, image_url: (data.images?.[0]) || null, isProduct: false as const }
}
