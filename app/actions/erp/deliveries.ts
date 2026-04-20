"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requirePartnerAccess, requireUser } from "@/lib/auth/authorization"

export type ERPDeliveryListCursor = { createdAt: string; id: string }

export type DeliveryStatusValue =
  | "not_sent"
  | "preparing"
  | "sent"
  | "delivered"
  | "pickup_available"
  | "delivery_failed"
  | "cancelled"

type CreateDeliveryPayload = {
  partnerId: string
  orderId: string
  deliveryPersonId?: string | null
  status: DeliveryStatusValue
  startedAt: string
  notes?: string
}

type Coordinate = { lat: number; lon: number }

const DEFAULT_PAGE_SIZE = 100

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
  const supabase = await getSupabaseServerClient()

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
      order_date,
      created_at,
      order_items(id, product_name, quantity, sku),
      customers:buyer_id(id,name,email,phone,addresses(*))
    `)
    .eq("partner_id", partnerId)
    .order("created_at", { ascending: false })
    .limit(500)

  if (error) {
    console.error("[fetchDeliveryOrderBucketAction]", error)
    return []
  }

  return (data || []).map((order: any) => {
    const customer = order.customers || null
    return {
      id: order.id,
      displayId: order.order_number || `#${String(order.id).slice(0, 8).toUpperCase()}`,
      orderNumber: order.order_number || null,
      status: order.situation || "pending",
      deliveryStatus: order.delivery_status || "not_sent",
      totalAmount: Number(order.total_amount || 0),
      shippingFee: Number(order.shipping_cost || 0),
      orderDate: order.order_date || order.created_at || null,
      customer: {
        id: customer?.id || order.buyer_id || null,
        name: customer?.name || order.customer_name || "Cliente balcão",
        email: customer?.email || null,
        phone: customer?.phone || null,
      },
      address: formatAddress(order) || "",
      items: order.order_items || [],
    }
  })
}

export async function fetchDeliveryPeopleBucketAction(partnerId: string) {
  await requireUser()
  await requirePartnerAccess(partnerId)
  const supabase = await getSupabaseServerClient()

  const { data, error } = await supabase
    .from("partner_users")
    .select("id, role, user_id, user_profiles:user_id(full_name)")
    .eq("partner_id", partnerId)
    .eq("role", "DELIVERY")
    .order("created_at", { ascending: true })

  if (error) {
    console.error("[fetchDeliveryPeopleBucketAction]", error)
    return []
  }

  return (data || []).map((member: any) => ({
    id: member.id,
    userId: member.user_id,
    fullName: member.user_profiles?.full_name || "Entregador",
  }))
}

export async function createERPDeliveryAction(payload: CreateDeliveryPayload) {
  await requireUser()
  await requirePartnerAccess(payload.partnerId)
  const supabase = await getSupabaseServerClient()

  if (!payload.orderId) return { success: false as const, error: "Selecione um pedido válido." }
  if (!payload.startedAt) return { success: false as const, error: "Informe data e hora de saída." }

  const { data: existingOrder, error: orderError } = await supabase
    .from("orders")
    .select("id, partner_id, shipping_cost, delivery_address, buyer_id, customers:buyer_id(addresses(*))")
    .eq("id", payload.orderId)
    .eq("partner_id", payload.partnerId)
    .single()

  if (orderError || !existingOrder?.id) {
    return { success: false as const, error: "Pedido não encontrado para esta loja." }
  }

  const { data: existingDelivery } = await supabase
    .from("deliveries")
    .select("id")
    .eq("partner_id", payload.partnerId)
    .eq("order_id", payload.orderId)
    .limit(1)
    .maybeSingle()

  if (existingDelivery?.id) {
    return { success: false as const, error: "Este pedido já possui uma entrega vinculada." }
  }

  const deliveryAddress = formatAddress(existingOrder)
  if (!deliveryAddress) {
    return { success: false as const, error: "Pedido sem endereço de entrega válido." }
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
    order_id: payload.orderId,
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

  return { success: true as const, deliveryId: created.id }
}

export async function getERPDeliveriesPageAction(
  partnerId: string,
  options?: { cursor?: ERPDeliveryListCursor | null; limit?: number }
): Promise<
  | { success: true; items: any[]; nextCursor: ERPDeliveryListCursor | null; hasMore: boolean }
  | { success: false; error: string }
> {
  try {
    await requireUser()
    await requirePartnerAccess(partnerId)
    const supabase = await getSupabaseServerClient()

    const cursor = options?.cursor ?? null
    const limit = Math.max(1, Math.min(250, Math.floor(Number(options?.limit || DEFAULT_PAGE_SIZE))))
    const fetchLimit = limit + 1

    let q = supabase
      .from("deliveries")
      .select(`
        id,
        partner_id,
        order_id,
        delivery_person_id,
        status,
        distance_km,
        estimated_duration_minutes,
        started_at,
        delivered_at,
        created_at,
        notes,
        orders(id, order_number, customer_name, total_amount, shipping_cost),
        partner_users:delivery_person_id(id, user_profiles:user_id(full_name))
      `)
      .eq("partner_id", partnerId)

    if (cursor) q = q.or(buildKeysetFilter(cursor))

    const { data, error } = await q
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(fetchLimit)

    if (error) throw error
    const rows = data || []
    const hasMore = rows.length > limit
    const items = hasMore ? rows.slice(0, limit) : rows
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
  const supabase = await getSupabaseServerClient()

  const { data, error } = await supabase
    .from("deliveries")
    .select(`
      *,
      orders(
        id,
        order_number,
        customer_name,
        total_amount,
        shipping_cost,
        delivery_address,
        buyer_id,
        customers:buyer_id(id,name,email,phone,addresses(*))
      ),
      partner_users:delivery_person_id(id, user_profiles:user_id(full_name))
    `)
    .eq("id", deliveryId)
    .eq("partner_id", partnerId)
    .single()

  if (error) return { success: false as const, error: error.message }
  return { success: true as const, data }
}
