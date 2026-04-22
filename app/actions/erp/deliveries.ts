"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requirePartnerAccess, requireUser } from "@/lib/auth/authorization"
import { getPartnerPlan } from "@/lib/services/subscription.service"

export type ERPDeliveryListCursor = { createdAt: string; id: string }

export type DeliveryStatusValue =
  | "pending"
  | "not_sent"
  | "preparing"
  | "sent"
  | "delivered"
  | "pickup_available"
  | "delivery_failed"
  | "cancelled"

type CreateDeliveryPayload = {
  partnerId: string
  orderIds: string[]
  deliveryPersonId?: string | null
  status: DeliveryStatusValue
  startedAt: string
  notes?: string
}

type Coordinate = { lat: number; lon: number }

const DEFAULT_PAGE_SIZE = 100
const ACTIVE_DELIVERY_STATUSES = ["pending", "not_sent", "preparing", "sent", "pickup_available"] as const

async function getPartnerUserNameByIdMap(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  partnerId: string,
  partnerUserIds: string[],
) {
  const uniqueIds = Array.from(new Set((partnerUserIds || []).filter(Boolean)))
  if (uniqueIds.length === 0) return new Map<string, string>()

  const { data: partnerUsers } = await supabase
    .from("partner_users")
    .select("id, user_id")
    .eq("partner_id", partnerId)
    .in("id", uniqueIds)

  const userIdByPartnerUserId = new Map<string, string>()
  const userIds = new Set<string>()
  for (const row of partnerUsers || []) {
    if (!row?.id || !row?.user_id) continue
    userIdByPartnerUserId.set(String(row.id), String(row.user_id))
    userIds.add(String(row.user_id))
  }

  const nameByUserId = new Map<string, string>()
  if (userIds.size > 0) {
    const { data: profiles } = await supabase
      .from("user_profiles")
      .select("user_id, full_name")
      .in("user_id", Array.from(userIds))

    for (const profile of profiles || []) {
      if (!profile?.user_id) continue
      nameByUserId.set(String(profile.user_id), String(profile.full_name || "Entregador"))
    }
  }

  const nameByPartnerUserId = new Map<string, string>()
  for (const [partnerUserId, userId] of userIdByPartnerUserId.entries()) {
    nameByPartnerUserId.set(partnerUserId, nameByUserId.get(userId) || "Entregador")
  }

  return nameByPartnerUserId
}

function resolveDeliveryLimitByPlanSlug(slug: string) {
  const normalized = String(slug || "").toLowerCase()
  if (normalized === "free") return { blocked: true, maxOrders: 0 as const }
  if (normalized === "vendedor") return { blocked: false, maxOrders: 1 as const }
  return { blocked: false, maxOrders: Number.MAX_SAFE_INTEGER }
}

async function enforceDeliveryPlanAccess(partnerId: string, orderCount: number) {
  const plan = await getPartnerPlan(partnerId)
  const rule = resolveDeliveryLimitByPlanSlug(plan.slug)

  if (rule.blocked) {
    return {
      allowed: false as const,
      error: "Seu plano atual não possui acesso ao módulo de entregas.",
      maxOrders: rule.maxOrders,
      planSlug: plan.slug,
    }
  }

  if (orderCount > rule.maxOrders) {
    return {
      allowed: false as const,
      error: "Seu plano permite apenas 1 pedido por entrega. Faça upgrade para entregas com múltiplos pedidos.",
      maxOrders: rule.maxOrders,
      planSlug: plan.slug,
    }
  }

  return { allowed: true as const, maxOrders: rule.maxOrders, planSlug: plan.slug }
}

async function enforcePlanOnExistingDelivery(partnerId: string, deliveryId: string, fallbackOrderCount = 1) {
  const supabase = await getSupabaseServerClient()
  const { data: links } = await supabase
    .from("delivery_orders")
    .select("id")
    .eq("delivery_id", deliveryId)

  const currentOrderCount = (links || []).length || fallbackOrderCount
  return enforceDeliveryPlanAccess(partnerId, currentOrderCount)
}

function buildKeysetFilter(cursor: ERPDeliveryListCursor): string {
  const q = (s: string) => `"${String(s).replace(/"/g, '""')}"`
  return `created_at.lt.${q(cursor.createdAt)},and(created_at.eq.${q(cursor.createdAt)},id.lt.${q(cursor.id)})`
}

function formatAddress(orderLike: any) {
  if (orderLike.delivery_address && String(orderLike.delivery_address).trim()) {
    return String(orderLike.delivery_address).trim()
  }

  const addr = orderLike.customers?.addresses?.find((a: any) => a?.is_default) || orderLike.customers?.addresses?.[0]
  if (!addr) return ""
  return [
    [addr.street, addr.number].filter(Boolean).join(", "),
    addr.complement ? `(${addr.complement})` : "",
    [addr.neighborhood, addr.city, addr.state].filter(Boolean).join(", "),
    addr.zip_code || addr.zipCode || "",
  ]
    .filter(Boolean)
    .join(" ")
    .trim()
}

async function geocodeAddress(address: string): Promise<Coordinate | null> {
  const query = encodeURIComponent(address)
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${query}`
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "DuditERP/1.0 (delivery-mvp)" },
      next: { revalidate: 3600 },
    })
    if (!res.ok) return null
    const data = await res.json()
    const first = Array.isArray(data) ? data[0] : null
    if (!first?.lat || !first?.lon) return null
    return { lat: Number(first.lat), lon: Number(first.lon) }
  } catch {
    return null
  }
}

async function resolveRouteEstimate(origin: Coordinate, destination: Coordinate) {
  const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${origin.lon},${origin.lat};${destination.lon},${destination.lat}?overview=false`
  const res = await fetch(osrmUrl, { next: { revalidate: 60 } })
  if (!res.ok) throw new Error("Falha ao calcular rota no OSRM.")
  const payload = await res.json()
  const route = payload?.routes?.[0]
  if (!route) throw new Error("Rota não encontrada para este endereço.")
  return {
    distanceKm: Number(route.distance || 0) / 1000,
    durationMinutes: Math.round(Number(route.duration || 0) / 60),
  }
}

export async function fetchDeliveryOrderBucketAction(partnerId: string) {
  await requireUser()
  await requirePartnerAccess(partnerId)
  const planCheck = await enforceDeliveryPlanAccess(partnerId, 1)
  if (!planCheck.allowed) return []
  const supabase = await getSupabaseServerClient()

  const { data: activeDeliveryOrders } = await supabase
    .from("delivery_orders")
    .select("order_id, deliveries!inner(partner_id,status)")
    .eq("deliveries.partner_id", partnerId)
    .in("deliveries.status", [...ACTIVE_DELIVERY_STATUSES])

  const activeOrderIds = new Set((activeDeliveryOrders || []).map((row: any) => row.order_id))

  const { data, error } = await supabase
    .from("orders")
    .select(`
      id,
      order_number,
      total_amount,
      shipping_cost,
      customer_name,
      buyer_id,
      delivery_address,
      situation,
      delivery_status,
      created_at,
      order_items(id, product_name, product_price, quantity, subtotal, product_id, products(sku, images))
    `)
    .eq("partner_id", partnerId)
    .order("created_at", { ascending: false })
    .limit(500)

  if (error) {
    console.error("[fetchDeliveryOrderBucketAction]", error)
    return []
  }

  return (data || [])
    .filter((order: any) => !activeOrderIds.has(order.id))
    .map((order: any) => ({
      id: order.id,
      displayId: order.order_number || `#${String(order.id).slice(0, 8).toUpperCase()}`,
      orderNumber: order.order_number || null,
      status: order.situation || "pending",
      deliveryStatus: order.delivery_status || "not_sent",
      totalAmount: Number(order.total_amount || 0),
      shippingFee: Number(order.shipping_cost || 0),
      orderDate: order.created_at || null,
      customer: {
        id: order.buyer_id || null,
        name: order.customer_name || "Cliente balcão",
        email: null,
        phone: null,
      },
      address: formatAddress(order) || "",
      items: order.order_items || [],
    }))
}

export async function fetchDeliveryPeopleBucketAction(partnerId: string) {
  await requireUser()
  await requirePartnerAccess(partnerId)
  const supabase = await getSupabaseServerClient()

  const { data, error } = await supabase
    .from("partner_users")
    .select("id, role, user_id")
    .eq("partner_id", partnerId)
    .eq("role", "DELIVERY")
    .order("created_at", { ascending: true })

  if (error) {
    console.error("[fetchDeliveryPeopleBucketAction]", error)
    return []
  }

  const userIds = Array.from(new Set((data || []).map((member: any) => member.user_id).filter(Boolean)))
  const nameByUserId = new Map<string, string>()
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("user_profiles")
      .select("user_id, full_name")
      .in("user_id", userIds)
    for (const profile of profiles || []) {
      nameByUserId.set(String(profile.user_id), String(profile.full_name || "Entregador"))
    }
  }

  return (data || []).map((member: any) => ({
    id: member.id,
    userId: member.user_id,
    fullName: nameByUserId.get(String(member.user_id)) || "Entregador",
  }))
}

export async function createERPDeliveryAction(payload: CreateDeliveryPayload) {
  await requireUser()
  await requirePartnerAccess(payload.partnerId)
  const supabase = await getSupabaseServerClient()

  const orderIds = Array.from(new Set(payload.orderIds || [])).filter(Boolean)
  if (orderIds.length === 0) return { success: false as const, error: "Selecione ao menos um pedido válido." }
  if (!payload.startedAt) return { success: false as const, error: "Informe data e hora de saída." }
  const planCheck = await enforceDeliveryPlanAccess(payload.partnerId, orderIds.length)
  if (!planCheck.allowed) return { success: false as const, error: planCheck.error }

  const { data: selectedOrders, error: orderError } = await supabase
    .from("orders")
    .select("id, partner_id, shipping_cost, total_amount, delivery_address, buyer_id")
    .in("id", orderIds)
    .eq("partner_id", payload.partnerId)
    .order("created_at", { ascending: false })

  if (orderError || !selectedOrders || selectedOrders.length !== orderIds.length) {
    return { success: false as const, error: "Um ou mais pedidos não foram encontrados para esta loja." }
  }

  const { data: alreadyAssigned } = await supabase
    .from("delivery_orders")
    .select("order_id, deliveries!inner(id,status,partner_id)")
    .in("order_id", orderIds)
    .eq("deliveries.partner_id", payload.partnerId)
    .in("deliveries.status", [...ACTIVE_DELIVERY_STATUSES])

  if ((alreadyAssigned || []).length > 0) {
    return { success: false as const, error: "Existe pedido já vinculado a uma entrega ativa." }
  }

  const firstOrder = selectedOrders[0]
  const deliveryAddress = formatAddress(firstOrder)
  if (!deliveryAddress) {
    return { success: false as const, error: "Pedido sem endereço de entrega válido para roteirização." }
  }

  const { data: defaultStore } = await supabase
    .from("stores")
    .select("id, city, state, zip_code, street, number")
    .eq("partner_id", payload.partnerId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()

  const originAddress = [
    [defaultStore?.street, defaultStore?.number].filter(Boolean).join(", "),
    [defaultStore?.city, defaultStore?.state].filter(Boolean).join(", "),
    defaultStore?.zip_code || "",
  ]
    .filter(Boolean)
    .join(" ")

  const [originCoords, destinationCoords] = await Promise.all([
    geocodeAddress(originAddress),
    geocodeAddress(deliveryAddress),
  ])

  if (!originCoords || !destinationCoords) {
    return { success: false as const, error: "Não foi possível geocodificar os endereços para calcular a rota." }
  }

  let estimate
  try {
    estimate = await resolveRouteEstimate(originCoords, destinationCoords)
  } catch (error: any) {
    return { success: false as const, error: error?.message || "Falha ao calcular distância e duração." }
  }

  const insertPayload: Record<string, unknown> = {
    partner_id: payload.partnerId,
    delivery_person_id: payload.deliveryPersonId || null,
    status: payload.status,
    distance_km: Number(estimate.distanceKm.toFixed(2)),
    estimated_duration_minutes: estimate.durationMinutes,
    started_at: payload.startedAt,
    delivered_at: payload.status === "delivered" ? payload.startedAt : null,
    created_at: new Date().toISOString(),
    notes: payload.notes?.trim() || null,
  }

  const { data: created, error: createError } = await supabase
    .from("deliveries")
    .insert(insertPayload)
    .select("id")
    .single()

  if (createError) {
    return { success: false as const, error: createError.message }
  }

  const linkRows = orderIds.map((orderId, idx) => ({
    delivery_id: created.id,
    order_id: orderId,
    position: idx + 1,
    status: "pending",
  }))

  const { error: linkError } = await supabase.from("delivery_orders").insert(linkRows)
  if (linkError) {
    await supabase.from("deliveries").delete().eq("id", created.id).eq("partner_id", payload.partnerId)
    return { success: false as const, error: linkError.message }
  }

  return { success: true as const, deliveryId: created.id }
}

export async function getERPDeliveriesPageAction(
  partnerId: string,
  options?: { cursor?: ERPDeliveryListCursor | null; limit?: number }
): Promise<
  | {
    success: true
    items: any[]
    nextCursor: ERPDeliveryListCursor | null
    hasMore: boolean
    planGate?: { requiredPlanSlug: "vendedor"; message: string }
  }
  | { success: false; error: string }
> {
  try {
    await requireUser()
    await requirePartnerAccess(partnerId)
    const planCheck = await enforceDeliveryPlanAccess(partnerId, 1)
    if (!planCheck.allowed) {
      const slug = String(planCheck.planSlug || "").toLowerCase()
      // Plano Free: página deve carregar com CTA de upgrade (evita AccessDenied enganoso).
      if (slug === "free") {
        return {
          success: true,
          items: [],
          nextCursor: null,
          hasMore: false,
          planGate: { requiredPlanSlug: "vendedor", message: planCheck.error },
        }
      }
      return { success: false, error: planCheck.error }
    }
    const supabase = await getSupabaseServerClient()

    const cursor = options?.cursor ?? null
    const limit = Math.max(1, Math.min(250, Math.floor(Number(options?.limit || DEFAULT_PAGE_SIZE))))
    const fetchLimit = limit + 1

    let q = supabase
      .from("deliveries")
      .select(`
        id,
        partner_id,
        delivery_person_id,
        status,
        distance_km,
        estimated_duration_minutes,
        started_at,
        delivered_at,
        created_at,
        notes,
        delivery_orders(
          order_id,
          position,
          status,
          delivered_at,
          orders(id, order_number, customer_name, total_amount, shipping_cost, delivery_address, buyer_id)
        )
      `)
      .eq("partner_id", partnerId)

    if (cursor) q = q.or(buildKeysetFilter(cursor))

    const { data, error } = await q
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(fetchLimit)

    if (error) throw error
    const rows = data || []
    const deliveryPersonIds = rows.map((row: any) => String(row.delivery_person_id || "")).filter(Boolean)
    const deliveryPersonNameById = await getPartnerUserNameByIdMap(supabase, partnerId, deliveryPersonIds)
    const hasMore = rows.length > limit
    const items = (hasMore ? rows.slice(0, limit) : rows).map((row: any) => ({
      ...row,
      partner_users: row.delivery_person_id
        ? { id: row.delivery_person_id, user_profiles: { full_name: deliveryPersonNameById.get(String(row.delivery_person_id)) || "Entregador" } }
        : null,
    }))
    const last = items[items.length - 1]
    const nextCursor = hasMore && last?.created_at && last?.id
      ? { createdAt: String(last.created_at), id: String(last.id) }
      : null

    return { success: true, items, nextCursor, hasMore }
  } catch (e: any) {
    return { success: false, error: e?.message || "Erro ao carregar entregas." }
  }
}

export async function getERPDeliveryDetailsAction(deliveryId: string, partnerId: string) {
  await requireUser()
  await requirePartnerAccess(partnerId)
  const planCheck = await enforceDeliveryPlanAccess(partnerId, 1)
  if (!planCheck.allowed) return { success: false as const, error: planCheck.error }
  const supabase = await getSupabaseServerClient()

  const { data, error } = await supabase
    .from("deliveries")
    .select(`
      *,
      delivery_orders(
        id,
        order_id,
        position,
        status,
        delivered_at,
        orders(
          id,
          order_number,
          customer_name,
          total_amount,
          shipping_cost,
          delivery_address,
          buyer_id
        )
      )
    `)
    .eq("id", deliveryId)
    .eq("partner_id", partnerId)
    .single()

  if (error) return { success: false as const, error: error.message }

  const deliveryPersonNameById = await getPartnerUserNameByIdMap(
    supabase,
    partnerId,
    data?.delivery_person_id ? [String(data.delivery_person_id)] : [],
  )

  const hydrated = {
    ...data,
    partner_users: data?.delivery_person_id
      ? { id: data.delivery_person_id, user_profiles: { full_name: deliveryPersonNameById.get(String(data.delivery_person_id)) || "Entregador" } }
      : null,
  }
  return { success: true as const, data: hydrated }
}

export async function updateERPDeliveryStatusAction(params: {
  partnerId: string
  deliveryId: string
  status: DeliveryStatusValue
}) {
  await requireUser()
  await requirePartnerAccess(params.partnerId)
  const planCheck = await enforcePlanOnExistingDelivery(params.partnerId, params.deliveryId)
  if (!planCheck.allowed) return { success: false as const, error: planCheck.error }
  const supabase = await getSupabaseServerClient()

  const allowed = new Set<DeliveryStatusValue>([
    "not_sent",
    "preparing",
    "sent",
    "delivered",
    "pickup_available",
    "delivery_failed",
    "cancelled",
  ])
  if (!allowed.has(params.status)) {
    return { success: false as const, error: "Status de entrega inválido." }
  }

  const patch: Record<string, unknown> = { status: params.status }
  if (params.status === "delivered") {
    patch.delivered_at = new Date().toISOString()
  }

  const { error } = await supabase
    .from("deliveries")
    .update(patch)
    .eq("id", params.deliveryId)
    .eq("partner_id", params.partnerId)

  if (error) return { success: false as const, error: error.message }

  const childPatch: Record<string, unknown> = { status: params.status === "cancelled" ? "cancelled" : params.status === "delivered" ? "delivered" : "pending" }
  if (params.status === "delivered") {
    childPatch.delivered_at = new Date().toISOString()
  }
  await supabase.from("delivery_orders").update(childPatch).eq("delivery_id", params.deliveryId)
  return { success: true as const }
}

export async function updateERPDeliveryAction(payload: {
  partnerId: string
  deliveryId: string
  orderIds: string[]
  deliveryPersonId?: string | null
  notes?: string
}) {
  await requireUser()
  await requirePartnerAccess(payload.partnerId)
  const supabase = await getSupabaseServerClient()

  const orderIds = Array.from(new Set(payload.orderIds || [])).filter(Boolean)
  if (orderIds.length === 0) return { success: false as const, error: "Selecione ao menos um pedido." }
  const planCheck = await enforceDeliveryPlanAccess(payload.partnerId, orderIds.length)
  if (!planCheck.allowed) return { success: false as const, error: planCheck.error }

  const { data: delivery } = await supabase
    .from("deliveries")
    .select("id, status")
    .eq("id", payload.deliveryId)
    .eq("partner_id", payload.partnerId)
    .single()

  if (!delivery?.id) return { success: false as const, error: "Entrega não encontrada." }

  const { data: orders } = await supabase
    .from("orders")
    .select("id")
    .in("id", orderIds)
    .eq("partner_id", payload.partnerId)

  if (!orders || orders.length !== orderIds.length) {
    return { success: false as const, error: "Um ou mais pedidos não pertencem ao mesmo parceiro." }
  }

  const { data: assigned } = await supabase
    .from("delivery_orders")
    .select("order_id, delivery_id, deliveries!inner(partner_id,status)")
    .in("order_id", orderIds)
    .neq("delivery_id", payload.deliveryId)
    .eq("deliveries.partner_id", payload.partnerId)
    .in("deliveries.status", [...ACTIVE_DELIVERY_STATUSES])

  if ((assigned || []).length > 0) {
    return { success: false as const, error: "Existe pedido informado já vinculado a outra entrega ativa." }
  }

  const { error: updateError } = await supabase
    .from("deliveries")
    .update({
      delivery_person_id: payload.deliveryPersonId || null,
      notes: payload.notes?.trim() || null,
    })
    .eq("id", payload.deliveryId)
    .eq("partner_id", payload.partnerId)

  if (updateError) return { success: false as const, error: updateError.message }

  const { error: deleteLinksError } = await supabase.from("delivery_orders").delete().eq("delivery_id", payload.deliveryId)
  if (deleteLinksError) return { success: false as const, error: deleteLinksError.message }

  const nextLinks = orderIds.map((orderId, index) => ({
    delivery_id: payload.deliveryId,
    order_id: orderId,
    position: index + 1,
    status: "pending",
  }))
  const { error: insertLinksError } = await supabase.from("delivery_orders").insert(nextLinks)
  if (insertLinksError) return { success: false as const, error: insertLinksError.message }

  return { success: true as const }
}
