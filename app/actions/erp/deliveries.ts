"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requirePartnerRouteAccess, requireUser } from "@/lib/auth/authorization"
import { getPartnerPlan } from "@/lib/services/subscription.service"
import { createCommissionExpenseForEntity, reverseCommissionForEntity } from "@/lib/services/commission-ledger.service"
import { logAuditEvent } from "@/lib/services/timeline.service"
import { resolveDeliveryPlanCapability } from "@/lib/delivery/plan"
import {
  calculateDistance,
  estimateDeliveryTime,
  geocodeAddress,
} from "@/lib/services/location.service"
import { revalidatePath, revalidateTag } from "next/cache"
import { DASHBOARD_TAGS } from "@/lib/data/dashboard"
import { sanitizeNotes } from "@/lib/input-validator"
import { getAdminClient } from "@/lib/supabase/admin"
import { requireActivePartnerContext } from "@/lib/services/authorized-customer-access"

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
  platformDriverId?: string | null
  status: DeliveryStatusValue
  startedAt: string
  notes?: string
}

const DEFAULT_PAGE_SIZE = 100
const ACTIVE_DELIVERY_STATUSES = ["preparing", "sent", "pickup_available"] as const

function revalidateDeliveryDashboard(partnerId: string) {
  // @ts-ignore - Next 15 accepts profile as the second argument.
  revalidateTag(DASHBOARD_TAGS.general(partnerId), "max")
  // @ts-ignore
  revalidateTag(DASHBOARD_TAGS.financial(partnerId), "max")
  // @ts-ignore
  revalidateTag(DASHBOARD_TAGS.operations(partnerId), "max")
  revalidatePath("/erp/painel")
  revalidatePath("/erp/inicio")
}

type SmartDeliverySuggestionOrder = {
  id: string
  orderNumber: string | null
  displayId: string
  customerName: string
  address: string
  distanceKm: number | null
}

export type SmartDeliverySuggestionGroup = {
  groupKey: string
  groupLabel: string
  totalDistanceKm: number | null
  estimatedDurationMinutes: number | null
  orders: SmartDeliverySuggestionOrder[]
}

async function getDeliveryActorScope(partnerId: string, specificPermission?: string) {
  const options = specificPermission ? { specificPermission } : undefined
  const access = await requirePartnerRouteAccess(partnerId, "logistics", options)
  if (access.roleId !== "delivery") {
    return { roleId: access.roleId, partnerUserId: null as string | null, userId: access.userId }
  }

  const admin = getAdminClient()
  const { data: partnerUser } = await admin
    .from("partner_users")
    .select("id")
    .eq("partner_id", partnerId)
    .eq("user_id", access.userId)
    .maybeSingle()

  return {
    roleId: access.roleId,
    partnerUserId: partnerUser?.id ? String(partnerUser.id) : null,
    userId: access.userId,
  }
}

async function getPartnerUserNameByIdMap(
  _supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  partnerId: string,
  partnerUserIds: string[],
) {
  const uniqueIds = Array.from(new Set((partnerUserIds || []).filter(Boolean)))
  if (uniqueIds.length === 0) return new Map<string, string>()

  const admin = getAdminClient()
  const { data: partnerUsers } = await admin
    .from("partner_users")
    .select("id, user_id")
    .eq("partner_id", partnerId)
    .in("id", uniqueIds)

  const { data: partnerUsersByUserId } = await admin
    .from("partner_users")
    .select("id, user_id")
    .eq("partner_id", partnerId)
    .in("user_id", uniqueIds)

  const allPartnerUsers = [...(partnerUsers || []), ...(partnerUsersByUserId || [])]
  const userIdByPartnerUserId = new Map<string, string>()
  const allUserIds = new Set<string>(uniqueIds)

  for (const row of allPartnerUsers) {
    if (!row?.id || !row?.user_id) continue
    userIdByPartnerUserId.set(String(row.id), String(row.user_id))
    allUserIds.add(String(row.user_id))
  }

  const nameByUserId = new Map<string, string>()
  if (allUserIds.size > 0) {
    const { data: profiles } = await admin
      .from("user_profiles")
      .select("user_id, full_name")
      .in("user_id", Array.from(allUserIds))

    for (const profile of profiles || []) {
      if (!profile?.user_id) continue
      nameByUserId.set(String(profile.user_id), String(profile.full_name || "Entregador"))
    }
  }

  const nameByPartnerUserId = new Map<string, string>()
  for (const id of uniqueIds) {
    const userId = userIdByPartnerUserId.get(id) || id
    nameByPartnerUserId.set(id, nameByUserId.get(userId) || nameByUserId.get(id) || "Entregador")
  }

  return nameByPartnerUserId
}

function resolveDeliveryLimitByPlanSlug(slug: string) {
  const normalized = String(slug || "").toLowerCase()
  if (normalized === "free") return { blocked: true, maxOrders: 0 as const }
  if (normalized === "crescer") return { blocked: false, maxOrders: 1 as const }
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

function normalizeDeliveryStatus(status: string | null | undefined): DeliveryStatusValue {
  const raw = String(status || "").trim().toLowerCase()
  if (!raw) return "pending"
  // Portuguese inputs (future UI)
  if (raw === "pendente") return "pending"
  if (raw === "em preparação" || raw === "em preparacao") return "preparing"
  if (raw === "saiu para entrega") return "sent"
  if (raw === "concluída" || raw === "concluida") return "delivered"
  if (raw === "cancelada") return "cancelled"
  // Legacy normalization
  if (raw === "not_sent") return "pending"
  return raw as DeliveryStatusValue
}

async function logDeliveryEvent(input: {
  partnerId: string
  actorUserId: string | null
  deliveryId: string
  actionType: string
  changeLines: string[]
  metadata?: Record<string, unknown> | null
}) {
  await logAuditEvent({
    partnerId: input.partnerId,
    actorUserId: input.actorUserId,
    entityType: "delivery",
    entityId: input.deliveryId,
    actionType: input.actionType,
    changeLines: input.changeLines,
    metadata: input.metadata || null,
    source: "manual",
  })
}

async function getOrCreateCachedCoords(params: {
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>
  partnerId: string
  addressText: string
}) {
  const normalized = String(params.addressText || "").trim().replace(/\s{2,}/g, " ")
  if (!normalized) return null

  try {
    const { data: cached } = await params.supabase
      .from("address_coordinates_cache")
      .select("latitude, longitude")
      .eq("partner_id", params.partnerId)
      .eq("address_text", normalized)
      .maybeSingle()

    if (cached?.latitude != null && cached?.longitude != null) {
      return { lat: Number(cached.latitude), lng: Number(cached.longitude) }
    }

    const coords = await geocodeAddress(normalized)
    if (!coords) return null

    await params.supabase
      .from("address_coordinates_cache")
      .upsert(
        {
          partner_id: params.partnerId,
          address_text: normalized,
          latitude: coords.lat,
          longitude: coords.lng,
          provider: "nominatim",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "partner_id,address_text" },
      )

    return coords
  } catch (err) {
    console.warn("[getOrCreateCachedCoords] failed:", err)
    return null
  }
}

async function allocatePartnerDeliveryNumber(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  partnerId: string,
): Promise<number | null> {
  try {
    const { data } = await supabase
      .from("deliveries")
      .select("delivery_number")
      .eq("partner_id", partnerId)
      .not("delivery_number", "is", null)
      .order("delivery_number", { ascending: false })
      .limit(1)

    const max = data?.[0]?.delivery_number == null ? 0 : Number(data[0].delivery_number)
    if (!Number.isFinite(max) || max < 0) return 1
    return max + 1
  } catch (err) {
    console.warn("[allocatePartnerDeliveryNumber] failed:", err)
    return null
  }
}

export async function getOrderDeliverySummaryAction(params: { partnerId: string; orderId: string }) {
  await requireUser()
  const actor = await getDeliveryActorScope(params.partnerId)
  // Delivery role pode ver apenas as próprias entregas; aqui focamos na visão ERP (orders).
  if (actor.roleId === "delivery") {
    return { success: false as const, error: "Sem permissão para visualizar entrega vinculada." }
  }

  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase
    .from("delivery_orders")
    .select(`
      id,
      position,
      delivery_id,
      deliveries(
        id,
        partner_id,
        delivery_number,
        status,
        departure_time,
        completed_at,
        delivery_person_id,
        delivery_orders(id)
      ),
      orders(id, order_number)
    `)
    .eq("order_id", params.orderId)
    .eq("deliveries.partner_id", params.partnerId)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error || !data?.deliveries) {
    return { success: false as const, error: error?.message || "Nenhuma entrega vinculada encontrada." }
  }

  const delivery: any = data.deliveries
  const totalOrders = Array.isArray(delivery.delivery_orders) ? delivery.delivery_orders.length : 1
  const currentStep = Number(data.position || 1)

  let driverName: string | null = null
  if (delivery.delivery_person_id) {
    const { data: partnerUser } = await supabase
      .from("partner_users")
      .select("user_id")
      .eq("id", delivery.delivery_person_id)
      .maybeSingle()
    if (partnerUser?.user_id) {
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("full_name")
        .eq("user_id", partnerUser.user_id)
        .maybeSingle()
      driverName = profile?.full_name || "Entregador"
    }
  }

  const orderItem: any = Array.isArray(data.orders) ? data.orders[0] : data.orders

  return {
    success: true as const,
    data: {
      id: delivery.id as string,
      deliveryNumber: delivery.delivery_number as number | null,
      status: delivery.status as string,
      departureTime: delivery.departure_time as string | null,
      completedAt: delivery.completed_at as string | null,
      driverName,
      orderCount: totalOrders,
      routeStep: currentStep,
      orderLabel: orderItem?.order_number || `#${String(params.orderId).slice(0, 8).toUpperCase()}`,
    },
  }
}

export async function getDeliveryRoutePointsAction(params: { partnerId: string; deliveryId: string }) {
  const user = await requireUser()
  const actor = await getDeliveryActorScope(params.partnerId)
  await requirePartnerRouteAccess(params.partnerId, "logistics", { specificPermission: "can_view_delivery_details" })
  const supabase = await getSupabaseServerClient()

  const { data: delivery, error } = await supabase
    .from("deliveries")
    .select(`
      id,
      partner_id,
      delivery_person_id,
      delivery_number,
      status,
      delivery_orders(
        position,
        status,
        order_id,
        orders(id, order_number, customer_name, delivery_address, distance_km, created_at, total_amount, delivery_status, situation, payment_method)
      )
    `)
    .eq("id", params.deliveryId)
    .eq("partner_id", params.partnerId)
    .single()

  if (error || !delivery?.id) {
    return { success: false as const, error: error?.message || "Entrega não encontrada." }
  }

  if (actor.roleId === "delivery") {
    const isAssigned = (actor.partnerUserId && String(delivery.delivery_person_id || "") === actor.partnerUserId) ||
                       (user.id && String(delivery.delivery_person_id || "") === user.id)
    if (!isAssigned) {
      return { success: false as const, error: "Sem permissão para visualizar esta entrega." }
    }
  }

  const { data: store } = await supabase
    .from("stores")
    .select("id, name, addresses!store_id(street, number, complement, neighborhood, city, state, postal_code, latitude, longitude)")
    .eq("partner_id", params.partnerId)
    .order("is_headquarters", { ascending: false })
    .limit(1)
    .maybeSingle()
  const addr = Array.isArray(store?.addresses) ? store.addresses[0] : null
  const origin = addr?.latitude && addr?.longitude
    ? {
        lat: Number(addr.latitude),
        lng: Number(addr.longitude),
        name: store?.name || "Loja",
        address: [
          [addr.street, addr.number].filter(Boolean).join(", "),
          addr.neighborhood,
          [addr.city, addr.state].filter(Boolean).join(" - "),
        ].filter(Boolean).join(", ") || "Endereço da Loja",
      }
    : null

  const links = Array.isArray((delivery as any).delivery_orders) ? (delivery as any).delivery_orders : []
  const sorted = [...links].sort((a: any, b: any) => Number(a.position || 9999) - Number(b.position || 9999))

  const points = await Promise.all(
    sorted.map(async (link: any) => {
      const order = link?.orders || {}
      const address = formatAddress(order)
      if (!address) return null
      const coords = await getOrCreateCachedCoords({ supabase, partnerId: params.partnerId, addressText: address })
      if (!coords) return null

      const distanceKm = order?.distance_km != null ? Number(order.distance_km) : (origin ? Number(calculateDistance(origin, coords).toFixed(2)) : null)

      return {
        orderId: String(link.order_id),
        orderNumber: order.order_number ? String(order.order_number) : null,
        displayId: order.order_number || `#${String(link.order_id).slice(0, 8).toUpperCase()}`,
        customerName: String(order.customer_name || "Cliente"),
        address,
        position: Number(link.position || 1),
        latitude: coords.lat,
        longitude: coords.lng,
        distanceKm,
        totalAmount: order?.total_amount != null ? Number(order.total_amount) : null,
        deliveryStatus: link?.status || order?.delivery_status || null,
        situation: order?.situation || null,
        paymentMethod: order?.payment_method || null,
      }
    }),
  )

  const cleaned = points.filter(Boolean) as any[]
  if (cleaned.length === 0) {
    return { success: false as const, error: "Nenhum ponto de rota disponível para exibir no mapa." }
  }

  return {
    success: true as const,
    data: {
      deliveryId: params.deliveryId,
      deliveryNumber: (delivery as any).delivery_number ?? null,
      points: cleaned,
      origin,
    },
  }
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

function extractZipInfo(address: string): { fullZip: string | null; prefixZip: string | null } {
  const raw = String(address || "")
  const m = raw.match(/\b(\d{5})-?(\d{3})\b/)
  if (m?.[1] && m?.[2]) {
    const full = `${m[1]}-${m[2]}`
    return { fullZip: full, prefixZip: m[1] }
  }
  const mPrefix = raw.match(/\b(\d{5})\b/)
  if (mPrefix?.[1]) {
    return { fullZip: null, prefixZip: mPrefix[1] }
  }
  return { fullZip: null, prefixZip: null }
}

function normalizeAddressGroupKey(address: string): { key: string; label: string } {
  const cleaned = String(address || "").trim()
  const { prefixZip } = extractZipInfo(cleaned)

  const cityStateMatch = cleaned.match(/,\s*([^,]+)\s*-\s*([A-Z]{2})/i)
  const city = cityStateMatch?.[1] ? cityStateMatch[1].trim() : ""
  const state = cityStateMatch?.[2] ? cityStateMatch[2].trim().toUpperCase() : ""
  const locationLabel = city ? (state ? `${city} - ${state}` : city) : ""

  if (prefixZip) {
    const label = locationLabel ? `${locationLabel} (Região CEP ${prefixZip})` : `Região CEP ${prefixZip}`
    return { key: `region:${prefixZip}`, label }
  }

  // Fallback: bairro / cidade
  const neighborhoodMatch = cleaned.match(/,\s*([^,]+),\s*([^,]+)\s*-\s*([A-Z]{2})/i)
  if (neighborhoodMatch?.[1]) {
    const neighborhood = neighborhoodMatch[1].trim()
    const cityStr = neighborhoodMatch[2].trim()
    return {
      key: `bairro:${neighborhood.toLowerCase()}:${cityStr.toLowerCase()}`,
      label: `${neighborhood} (${cityStr})`,
    }
  }

  if (city && state) {
    return {
      key: `city:${city.toLowerCase()}:${state.toLowerCase()}`,
      label: `Região ${city} - ${state}`,
    }
  }

  return { key: "other", label: "Outros endereços" }
}

async function estimateOrderDistanceKm(params: {
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>
  partnerId: string
  order: any
  originCoords: { lat: number; lng: number } | null
}): Promise<number | null> {
  const preset = params.order?.distance_km
  if (preset != null && !Number.isNaN(Number(preset)) && Number(preset) > 0) {
    return Number(Number(preset).toFixed(2))
  }

  const address = formatAddress(params.order)
  if (!address || !params.originCoords) return null
  const dest = await geocodeAddress(address)
  if (!dest) return null
  return Number(calculateDistance(params.originCoords, dest).toFixed(2))
}

export async function getSmartDeliverySuggestionsAction(input: {
  partnerId: string
  maxOrdersPerDelivery?: number
}) {
  await requireUser()
  await requirePartnerRouteAccess(input.partnerId, "logistics", { specificPermission: "can_create_deliveries" })
  const actor = await getDeliveryActorScope(input.partnerId)
  if (actor.roleId === "delivery") {
    return { success: false as const, error: "Sem permissão para gerar sugestões." }
  }

  const plan = await getPartnerPlan(input.partnerId)
  const capability = resolveDeliveryPlanCapability(plan.slug)
  if (!capability.advancedEnabled) {
    return { success: false as const, error: "Sugestões automáticas disponíveis apenas no plano Escalar." }
  }

  const maxOrdersPerDelivery = Math.max(2, Math.min(20, Math.floor(Number(input.maxOrdersPerDelivery || 5))))
  const supabase = await getSupabaseServerClient()

  // Exclude orders already attached to active deliveries
  const { data: activeDeliveryOrders } = await supabase
    .from("delivery_orders")
    .select("order_id, deliveries!inner(partner_id,status)")
    .eq("deliveries.partner_id", input.partnerId)
    .in("deliveries.status", [...ACTIVE_DELIVERY_STATUSES])

  const activeOrderIds = new Set((activeDeliveryOrders || []).map((row: any) => String(row.order_id)))

  const { data: orders, error } = await supabase
    .from("orders")
    .select(`
      id,
      order_number,
      customer_name,
      delivery_address,
      situation,
      delivery_status,
      created_at,
      distance_km,
      delivery_type,
      order_items(id, product_name, product_price, quantity, subtotal, product_id, products(sku, images, product_type))
    `)
    .eq("partner_id", input.partnerId)
    .order("created_at", { ascending: false })
    .limit(600)

  if (error) return { success: false as const, error: error.message }

  // Resolve store origin coordinates
  const { data: defaultStore } = await supabase
    .from("stores")
    .select("id")
    .eq("partner_id", input.partnerId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()

  let storeAddress: any = null
  if (defaultStore?.id) {
    const { data } = await supabase
      .from("addresses")
      .select("city, state, zip_code, street, number, latitude, longitude")
      .eq("store_id", defaultStore.id)
      .maybeSingle()
    storeAddress = data
  }

  if (!storeAddress) {
    const { data } = await supabase
      .from("addresses")
      .select("city, state, zip_code, street, number, latitude, longitude")
      .eq("partner_id", input.partnerId)
      .eq("is_default", true)
      .maybeSingle()
    storeAddress = data
  }

  let originCoords: { lat: number; lng: number } | null = null
  if (storeAddress?.latitude && storeAddress?.longitude) {
    originCoords = { lat: Number(storeAddress.latitude), lng: Number(storeAddress.longitude) }
  } else if (storeAddress) {
    const originAddressStr = [
      [storeAddress.street, storeAddress.number].filter(Boolean).join(", "),
      [storeAddress.city, storeAddress.state].filter(Boolean).join(", "),
      storeAddress.zip_code || "",
    ].filter(Boolean).join(" ")
    if (originAddressStr) {
      originCoords = await geocodeAddress(originAddressStr)
    }
  }

  const eligible = (orders || [])
    .filter((o: any) => {
      if (!o?.id) return false
      if (activeOrderIds.has(String(o.id))) return false
      const situation = String(o.situation || "").toLowerCase()
      if (situation === "cancelled" || situation === "refunded") return false
      if (!formatAddress(o)) return false

      // Apenas pendente / nao enviado / em preparação
      const dStatus = String(o.delivery_status || "").toLowerCase()
      if (dStatus !== "pending" && dStatus !== "preparing" && dStatus !== "not_sent") return false

      // Pedidos que só tem serviços vc nem mostra
      const items = o.order_items || []
      if (items.length === 0) return false
      const allServices = items.every((item: any) => {
        const pType = String(item.products?.product_type || "").toLowerCase()
        return pType === "serviço" || pType === "servico" || pType === "service"
      })
      if (allServices) return false

      // Pedidos de tipo retirada vc nem mostra
      if (o.delivery_type === "pickup") return false

      return true
    })

  // Enriquecer pedidos com coordenadas e distância da loja
  const enriched = await Promise.all(
    eligible.map(async (order: any) => {
      const address = formatAddress(order)
      const coords = address ? await getOrCreateCachedCoords({ supabase, partnerId: input.partnerId, addressText: address }) : null
      const distanceKm = coords && originCoords
        ? Number(calculateDistance(originCoords, coords).toFixed(2))
        : (order?.distance_km != null ? Number(order.distance_km) : null)
      const group = normalizeAddressGroupKey(address)

      return {
        id: String(order.id),
        orderNumber: order.order_number ? String(order.order_number) : null,
        displayId: order.order_number || `#${String(order.id).slice(0, 8).toUpperCase()}`,
        customerName: String(order.customer_name || "Cliente"),
        address,
        createdAt: String(order.created_at || ""),
        coords,
        distanceKm,
        groupKey: group.key,
        groupLabel: group.label,
      }
    }),
  )

  // 1. Ordenação FIFO: pedidos mais antigos primeiro (para que o pedido mais antigo seja a 'semente' do lote)
  const unassigned = [...enriched]
  unassigned.sort((a, b) => {
    const aT = a.createdAt ? new Date(a.createdAt).getTime() : 0
    const bT = b.createdAt ? new Date(b.createdAt).getTime() : 0
    return aT - bT
  })

  const suggestions: SmartDeliverySuggestionGroup[] = []
  const usedOrderIds = new Set<string>()

  for (const seed of unassigned) {
    if (usedOrderIds.has(seed.id)) continue

    // 2. Agrupamento por Raio de Proximidade (até 4.5 km do pedido semente ou mesma região CEP/Bairro)
    const candidates: typeof unassigned = []
    candidates.push(seed)
    usedOrderIds.add(seed.id)

    for (const candidate of unassigned) {
      if (usedOrderIds.has(candidate.id)) continue
      if (candidates.length >= maxOrdersPerDelivery) break

      let isClose = false
      if (seed.coords && candidate.coords) {
        const dist = calculateDistance(seed.coords, candidate.coords)
        if (dist <= 4.5) {
          isClose = true
        }
      } else if (seed.groupKey === candidate.groupKey && seed.groupKey !== "other") {
        isClose = true
      }

      if (isClose) {
        candidates.push(candidate)
        usedOrderIds.add(candidate.id)
      }
    }

    // 3. Sequenciamento de Rota por Vizinho Mais Próximo (Nearest-Neighbor Sequencing) partindo da Loja/Semente
    let currentLoc = originCoords || seed.coords
    const sequencedCluster: typeof candidates = []
    const remaining = [...candidates]

    while (remaining.length > 0) {
      if (!currentLoc) {
        sequencedCluster.push(...remaining)
        break
      }
      let bestIdx = 0
      let minDist = Number.POSITIVE_INFINITY

      for (let i = 0; i < remaining.length; i++) {
        const item = remaining[i]
        const d = item.coords ? calculateDistance(currentLoc, item.coords) : (item.distanceKm ?? 999)
        if (d < minDist) {
          minDist = d
          bestIdx = i
        }
      }

      const nextStop = remaining.splice(bestIdx, 1)[0]
      sequencedCluster.push(nextStop)
      if (nextStop.coords) {
        currentLoc = nextStop.coords
      }
    }

    // Calcular distância sequencial total da rota e tempo estimado
    let totalRouteDist = 0
    let lastPoint = originCoords
    let hasAllDist = true

    for (const item of sequencedCluster) {
      if (lastPoint && item.coords) {
        totalRouteDist += calculateDistance(lastPoint, item.coords)
        lastPoint = item.coords
      } else if (item.distanceKm != null) {
        totalRouteDist += item.distanceKm
      } else {
        hasAllDist = false
      }
    }

    const finalTotalDistanceKm = hasAllDist ? Number(totalRouteDist.toFixed(2)) : null
    const estimatedDurationMinutes = finalTotalDistanceKm == null ? null : estimateDeliveryTime(finalTotalDistanceKm)

    const mainLabel = seed.groupLabel.includes("(") ? seed.groupLabel : `${seed.groupLabel}`
    const groupLabel = sequencedCluster.length > 1
      ? `${mainLabel} • Rota com ${sequencedCluster.length} pedidos`
      : mainLabel

    suggestions.push({
      groupKey: seed.groupKey,
      groupLabel,
      totalDistanceKm: finalTotalDistanceKm,
      estimatedDurationMinutes,
      orders: sequencedCluster.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        displayId: o.displayId,
        customerName: o.customerName,
        address: o.address,
        distanceKm: o.distanceKm,
      })),
    })
  }

  // Ordenar blocos de sugestões por densidade (quantidade de pedidos) e urgência
  suggestions.sort((a, b) => b.orders.length - a.orders.length)

  return {
    success: true as const,
    maxOrdersPerDelivery,
    generatedAt: new Date().toISOString(),
    items: suggestions.slice(0, 30),
  }
}

export async function fetchDeliveryOrderBucketAction(partnerId: string, excludeDeliveryId?: string) {
  await requireUser()
  await requireActivePartnerContext(partnerId)
  const actor = await getDeliveryActorScope(partnerId)
  if (actor.roleId === "delivery") return []
  const planCheck = await enforceDeliveryPlanAccess(partnerId, 1)
  if (!planCheck.allowed) return []
  const supabase = await getSupabaseServerClient()

  let activeOrdersQuery = supabase
    .from("delivery_orders")
    .select("order_id, deliveries!inner(id,partner_id,status)")
    .eq("deliveries.partner_id", partnerId)
    .in("deliveries.status", [...ACTIVE_DELIVERY_STATUSES])

  if (excludeDeliveryId) {
    activeOrdersQuery = activeOrdersQuery.neq("deliveries.id", excludeDeliveryId)
  }

  const ordersQuery = supabase
    .from("orders")
    .select(`
      id,
      order_number,
      total_amount,
      delivery_fee,
      distance_km,
      delivery_breakdown,
      customer_name,
      buyer_id,
      delivery_address,
      situation,
      delivery_status,
      created_at,
      order_source,
      delivery_type,
      order_items(id, product_name, product_price, quantity, subtotal, product_id, products(sku, images, product_type))
    `)
    .eq("partner_id", partnerId)
    .order("created_at", { ascending: false })
    .limit(500)

  const [{ data: activeDeliveryOrders }, { data, error }] = await Promise.all([
    activeOrdersQuery,
    ordersQuery,
  ])

  const activeOrderIds = new Set((activeDeliveryOrders || []).map((row: any) => row.order_id))

  if (error) {
    console.error("[fetchDeliveryOrderBucketAction]", error)
    return []
  }

  const buyerIds = Array.from(new Set((data || [])
    .map((order: any) => order.buyer_id)
    .filter(Boolean)))

  let customerMap = new Map<string, any>()
  if (buyerIds.length > 0) {
    const [{ data: customerRows }, { data: addressRows }] = await Promise.all([
      getAdminClient()
        .from("customers")
        .select("id, name, email, phone, image_url")
        .eq("partner_id", partnerId)
        .in("id", buyerIds),
      supabase
        .from("addresses")
        .select("customer_id, street, number, complement, neighborhood, city, state, zip_code")
        .in("customer_id", buyerIds)
        .eq("address_type", "primary"),
    ])

    const addressMap = new Map<string, any>()
    for (const addr of addressRows || []) {
      addressMap.set(String(addr.customer_id), addr)
    }

    for (const row of customerRows || []) {
      const addr = addressMap.get(String(row.id))
      customerMap.set(String(row.id), { ...row, ...addr })
    }
  }

  return (data || [])
    .filter((order: any) => {
      const situation = String(order.situation || "").toLowerCase()
      if (situation === "cancelled" || situation === "refunded") return false

      // Apenas pendente / nao enviado / em preparação
      const dStatus = String(order.delivery_status || "").toLowerCase()
      if (dStatus !== "pending" && dStatus !== "preparing" && dStatus !== "not_sent") return false

      // Pedidos de tipo retirada vc nem mostra
      if (order.delivery_type === "pickup") return false

      // Pedidos que só tem serviços vc nem mostra
      const items = order.order_items || []
      if (items.length === 0) return false
      const allServices = items.every((item: any) => {
        const pType = String(item.products?.product_type || "").toLowerCase()
        return pType === "serviço" || pType === "servico" || pType === "service"
      })
      if (allServices) return false

      return true
    })
    .map((order: any) => ({
      id: order.id,
      displayId: order.order_number || `#${String(order.id).slice(0, 8).toUpperCase()}`,
      orderNumber: order.order_number || null,
      status: order.situation || "pending",
      deliveryStatus: order.delivery_status || "not_sent",
      totalAmount: Number(order.total_amount || 0),
      shippingFee: Number(order.delivery_fee || 0),
      deliveryFee: Number(order.delivery_fee || 0),
      distanceKm: order.distance_km == null ? null : Number(order.distance_km),
      deliveryBreakdown: order.delivery_breakdown || null,
      orderDate: order.created_at || null,
      customer: (() => {
        const cust = order.buyer_id ? customerMap.get(String(order.buyer_id)) : null
        return {
          id: order.buyer_id || null,
          name: order.customer_name || cust?.name || "Consumidor final",
          email: cust?.email || null,
          phone: cust?.phone || null,
          image_url: cust?.image_url || null,
        }
      })(),
      customerAddress: (() => {
        const cust = order.buyer_id ? customerMap.get(String(order.buyer_id)) : null
        if (!cust) return null
        if (!cust.street && !cust.city) return null
        return {
          street: cust.street || "",
          number: cust.number || "",
          complement: cust.complement || "",
          neighborhood: cust.neighborhood || "",
          city: cust.city || "",
          state: cust.state || "",
          zipCode: cust.zip_code || "",
        }
      })(),
      address: formatAddress(order) || "",
      orderSource: order.order_source || "Manual",
      items: order.order_items || [],
      alreadyInActiveDelivery: activeOrderIds.has(order.id),
    }))
}

export async function fetchDeliveryPeopleBucketAction(partnerId: string) {
  await requireUser()
  const actor = await getDeliveryActorScope(partnerId)
  if (actor.roleId === "delivery") return []
  const supabase = await getSupabaseServerClient()

  const { data, error } = await supabase
    .from("partner_users")
    .select("id, role_id, user_id")
    .eq("partner_id", partnerId)
    .eq("role_id", "delivery")
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

export async function getERPDeliveryPlanAccessAction(partnerId: string) {
  await requireUser()
  const actor = await getDeliveryActorScope(partnerId)
  if (actor.roleId === "delivery") {
    return { success: false as const, error: "Sem permissão para configurar entregas." }
  }

  const plan = await getPartnerPlan(partnerId)
  const rule = resolveDeliveryLimitByPlanSlug(plan.slug)
  if (rule.blocked) {
    return {
      success: true as const,
      allowed: false,
      planSlug: plan.slug,
      maxOrders: rule.maxOrders,
      message: "Seu plano atual não possui acesso ao módulo de entregas.",
    }
  }

  return {
    success: true as const,
    allowed: true,
    planSlug: plan.slug,
    maxOrders: rule.maxOrders,
    message: rule.maxOrders === 1
      ? "Seu plano permite apenas 1 pedido por entrega. Faça upgrade para múltiplos pedidos."
      : null,
  }
}

export async function createERPDeliveryAction(payload: CreateDeliveryPayload) {
  const user = await requireUser()
  const actor = await getDeliveryActorScope(payload.partnerId, "can_create_deliveries")
  if (actor.roleId === "delivery") {
    return { success: false as const, error: "Sem permissão para criar entregas." }
  }
  const supabase = await getSupabaseServerClient()

  const orderIds = Array.from(new Set(payload.orderIds || [])).filter(Boolean)
  if (orderIds.length === 0) return { success: false as const, error: "Selecione ao menos um pedido válido." }
  if (!payload.startedAt) return { success: false as const, error: "Informe data e hora de saída." }
  const planCheck = await enforceDeliveryPlanAccess(payload.partnerId, orderIds.length)
  if (!planCheck.allowed) return { success: false as const, error: planCheck.error }

  const { data: selectedOrders, error: orderError } = await supabase
    .from("orders")
    .select("id, partner_id, delivery_fee, total_amount, delivery_address, buyer_id")
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

  // Geocoding & route estimation are best-effort - never block delivery creation
  let distanceKm: number | null = null
  let estimatedDurationMinutes: number | null = null

  if (deliveryAddress) {
    try {
      const { data: defaultStore } = await supabase
        .from("stores")
        .select("id")
        .eq("partner_id", payload.partnerId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle()

      let storeAddress = null
      if (defaultStore?.id) {
        const { data } = await supabase
          .from("addresses")
          .select("city, state, zip_code, street, number")
          .eq("store_id", defaultStore.id)
          .maybeSingle()
        storeAddress = data
      }

      if (!storeAddress) {
        const { data } = await supabase
          .from("addresses")
          .select("city, state, zip_code, street, number")
          .eq("partner_id", payload.partnerId)
          .eq("is_default", true)
          .maybeSingle()
        storeAddress = data
      }

      const originAddress = [
        [storeAddress?.street, storeAddress?.number].filter(Boolean).join(", "),
        [storeAddress?.city, storeAddress?.state].filter(Boolean).join(", "),
        storeAddress?.zip_code || "",
      ]
        .filter(Boolean)
        .join(" ")

      const [originCoords, destinationCoords] = await Promise.all([
        geocodeAddress(originAddress),
        geocodeAddress(deliveryAddress),
      ])

      if (originCoords && destinationCoords) {
        distanceKm = Number(calculateDistance(originCoords, destinationCoords).toFixed(2))
        estimatedDurationMinutes = estimateDeliveryTime(distanceKm)
      }
    } catch (err) {
      console.warn("[createERPDeliveryAction] geocoding/route failed, proceeding without estimates:", err)
    }
  }

  const status = normalizeDeliveryStatus(payload.status)

  // Check if any of the orderIds already have previous pending/not_sent deliveries
  const { data: previousPendingLinks } = await supabase
    .from("delivery_orders")
    .select("id, delivery_id, order_id, deliveries!inner(id, status, partner_id, delivery_number)")
    .in("order_id", orderIds)
    .eq("deliveries.partner_id", payload.partnerId)
    .in("deliveries.status", ["pending", "not_sent"])

  const prevDeliveryIds = Array.from(
    new Set((previousPendingLinks || []).map((l: any) => String(l.delivery_id)).filter(Boolean))
  )

  let finalDeliveryId: string
  let deliveryNumber: number | null = null

  if (prevDeliveryIds.length > 0) {
    // Reuse primary pending delivery to avoid duplication and update it in-place
    finalDeliveryId = prevDeliveryIds[0]

    const primaryPrev = (previousPendingLinks || []).find((l: any) => String(l.delivery_id) === finalDeliveryId)
    deliveryNumber = (primaryPrev as any)?.deliveries?.delivery_number ?? null

    const updatePayload: Record<string, unknown> = {
      delivery_person_id: payload.deliveryPersonId || null,
      status,
      distance_km: distanceKm,
      estimated_duration_minutes: estimatedDurationMinutes,
      started_at: payload.startedAt,
      departure_time: payload.startedAt,
      delivered_at: status === "delivered" ? payload.startedAt : null,
      completed_at: status === "delivered" ? payload.startedAt : null,
      notes: sanitizeNotes(payload.notes),
    }

    const { error: updateError } = await supabase
      .from("deliveries")
      .update(updatePayload)
      .eq("id", finalDeliveryId)
      .eq("partner_id", payload.partnerId)

    if (updateError) {
      return { success: false as const, error: updateError.message }
    }

    // Delete previous links for this delivery
    await supabase.from("delivery_orders").delete().eq("delivery_id", finalDeliveryId)

    // For any additional pending deliveries that were merged into this one:
    for (let i = 1; i < prevDeliveryIds.length; i++) {
      const otherId = prevDeliveryIds[i]
      await supabase.from("delivery_orders").delete().eq("delivery_id", otherId)
      await supabase.from("deliveries").delete().eq("id", otherId).eq("partner_id", payload.partnerId)
    }
  } else {
    // Allocate new delivery number and insert fresh delivery
    deliveryNumber = await allocatePartnerDeliveryNumber(supabase, payload.partnerId)

    const insertPayload: Record<string, unknown> = {
      partner_id: payload.partnerId,
      delivery_person_id: payload.deliveryPersonId || null,
      status,
      distance_km: distanceKm,
      estimated_duration_minutes: estimatedDurationMinutes,
      started_at: payload.startedAt,
      departure_time: payload.startedAt,
      delivered_at: status === "delivered" ? payload.startedAt : null,
      completed_at: status === "delivered" ? payload.startedAt : null,
      created_at: new Date().toISOString(),
      notes: sanitizeNotes(payload.notes),
      delivery_number: deliveryNumber,
      created_by: user?.id || null,
    }

    const { data: created, error: createError } = await supabase
      .from("deliveries")
      .insert(insertPayload)
      .select("id")
      .single()

    if (createError) {
      return { success: false as const, error: createError.message }
    }

    finalDeliveryId = created.id
  }

  // A reatribuição encerra o vínculo operacional anterior sem apagar o histórico.
  await getAdminClient()
    .from("delivery_assignments")
    .update({ status: "cancelled" })
    .eq("delivery_id", finalDeliveryId)
    .in("status", ["assigned", "accepted", "picked_up", "out_for_delivery"])

  // Insert ordered delivery links
  const linkRows = orderIds.map((orderId, idx) => ({
    delivery_id: finalDeliveryId,
    order_id: orderId,
    position: idx + 1,
    status: status === "delivered" ? "delivered" : "pending",
    delivered_at: status === "delivered" ? payload.startedAt : null,
  }))

  const { error: linkError } = await supabase.from("delivery_orders").insert(linkRows)
  if (linkError) {
    if (prevDeliveryIds.length === 0) {
      await supabase.from("deliveries").delete().eq("id", finalDeliveryId).eq("partner_id", payload.partnerId)
    }
    return { success: false as const, error: linkError.message }
  }

  // Order-level timestamps & delivery_status (best-effort; do not block)
  try {
    const orderPatch: Record<string, unknown> = {
      delivery_status: status,
    }
    if (status === "sent") {
      orderPatch.delivery_departure_at = payload.startedAt
    }
    if (status === "delivered") {
      orderPatch.delivery_departure_at = payload.startedAt
      orderPatch.delivery_arrived_at = payload.startedAt
      orderPatch.delivery_completed_at = payload.startedAt
    }
    await supabase.from("orders").update(orderPatch).in("id", orderIds).eq("partner_id", payload.partnerId)
  } catch (err) {
    console.warn("[createERPDeliveryAction] order timestamps patch failed:", err)
  }

  await logDeliveryEvent({
    partnerId: payload.partnerId,
    actorUserId: user?.id || null,
    deliveryId: finalDeliveryId,
    actionType: prevDeliveryIds.length > 0 ? "delivery_updated" : "delivery_created",
    changeLines: [prevDeliveryIds.length > 0 ? "Entrega atualizada" : "Entrega criada"],
    metadata: {
      deliveryNumber,
      orderCount: orderIds.length,
      driverId: payload.deliveryPersonId || null,
      status,
    },
  })

  if (status === "delivered" && payload.deliveryPersonId) {
    const { data: deliveryOrders } = await supabase
      .from("delivery_orders")
      .select("orders(delivery_fee, store_id)")
      .eq("delivery_id", finalDeliveryId)

    const deliveryFeeTotal = (deliveryOrders || []).reduce((sum: number, row: any) => {
      return sum + Number(row?.orders?.delivery_fee || 0)
    }, 0)
    const deliveryStoreId = (deliveryOrders?.[0] as any)?.orders?.store_id ?? null

    await createCommissionExpenseForEntity({
      supabase,
      partnerId: payload.partnerId,
      storeId: deliveryStoreId,
      partnerUserId: String(payload.deliveryPersonId),
      role: "delivery",
      deliveryFee: deliveryFeeTotal,
      entityType: "delivery",
      entityId: finalDeliveryId,
      createdByUserId: user.id,
    })
  }

  revalidateDeliveryDashboard(payload.partnerId)
  return { success: true as const, deliveryId: finalDeliveryId }
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
    planGate?: { requiredPlanSlug: "crescer" | "escalar"; message: string }
  }
  | { success: false; error: string }
> {
  try {
    const user = await requireUser()
    const actor = await getDeliveryActorScope(partnerId)
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
          planGate: { requiredPlanSlug: "crescer", message: planCheck.error },
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
          orders(id, order_number, customer_name, total_amount, delivery_fee, delivery_address, buyer_id, order_source)
        )
      `)
      .eq("partner_id", partnerId)

    if (actor.roleId === "delivery") {
      const pUserId = actor.partnerUserId
      const uId = user.id
      const filters: string[] = []
      if (pUserId) filters.push(`delivery_person_id.eq.${pUserId}`)
      if (uId) filters.push(`delivery_person_id.eq.${uId}`)
      if (filters.length > 0) {
        q = q.or(filters.join(","))
      } else {
        return {
          success: true,
          items: [],
          nextCursor: null,
          hasMore: false,
        }
      }
    }

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
  const user = await requireUser()
  await requireActivePartnerContext(partnerId)
  const actor = await getDeliveryActorScope(partnerId)
  await requirePartnerRouteAccess(partnerId, "logistics", { specificPermission: "can_view_delivery_details" })
  const planCheck = await enforceDeliveryPlanAccess(partnerId, 1)
  if (!planCheck.allowed) return { success: false as const, error: planCheck.error }
  const supabase = await getSupabaseServerClient()

  const { data, error } = await supabase
    .from("deliveries")
    .select(`
      id,
      partner_id,
      delivery_person_id,
      status,
      distance_km,
      estimated_duration_minutes,
      started_at,
      departure_time,
      delivered_at,
      completed_at,
      created_at,
      notes,
      delivery_number,
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

              delivery_fee,
              delivery_address,
              buyer_id,
              order_source,
              situation,
              delivery_status,
              delivery_type,
              payment_method,
              payment_breakdown,
              paid_amount,
              discount_amount,

              payment_method_discount_amount,
              payment_method_extra_amount,
              additional_costs,
              discount_value,
              notes,
              order_items(id, product_name, product_price, quantity, subtotal, product_id, products(sku, images, product_type))
            )
      )
    `)
    .eq("id", deliveryId)
    .eq("partner_id", partnerId)
    .single()

  if (actor.roleId === "delivery") {
    const isAssigned = (actor.partnerUserId && String(data?.delivery_person_id || "") === actor.partnerUserId) ||
                       (user.id && String(data?.delivery_person_id || "") === user.id)
    if (!isAssigned) {
      return { success: false as const, error: "Sem permissão para visualizar esta entrega." }
    }
  }

  if (error) return { success: false as const, error: error.message }

  const [{ data: platformAssignment }, deliveryPersonNameById] = await Promise.all([
    getAdminClient()
      .from("delivery_assignments")
      .select("driver_id")
      .eq("delivery_id", deliveryId)
      .in("status", ["assigned", "accepted", "picked_up", "out_for_delivery"])
      .order("assigned_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    getPartnerUserNameByIdMap(
      supabase,
      partnerId,
      data?.delivery_person_id ? [String(data.delivery_person_id)] : [],
    ),
  ])

  const buyerIds = Array.from(new Set((data?.delivery_orders || [])
    .map((doItem: any) => doItem?.orders?.buyer_id)
    .filter(Boolean)))

  let customerMap = new Map<string, any>()
  if (buyerIds.length > 0) {
    const [{ data: customerRows }, { data: addressRows }] = await Promise.all([
      getAdminClient()
        .from("customers")
        .select("id, name, email, phone, image_url")
        .eq("partner_id", partnerId)
        .in("id", buyerIds),
      supabase
        .from("addresses")
        .select("customer_id, street, number, complement, neighborhood, city, state, zip_code")
        .in("customer_id", buyerIds)
        .eq("address_type", "primary"),
    ])

    const addressMap = new Map<string, any>()
    for (const addr of addressRows || []) {
      addressMap.set(String(addr.customer_id), addr)
    }

    for (const row of customerRows || []) {
      const addr = addressMap.get(String(row.id))
      customerMap.set(String(row.id), { ...row, ...addr })
    }
  }

  const hydrated = {
    ...data,
    platform_driver_id: platformAssignment?.driver_id ? String(platformAssignment.driver_id) : null,
    delivery_orders: (data?.delivery_orders || []).map((doItem: any) => {
      const order = doItem.orders
      if (!order) return doItem
      const subtotalValue = Number((order.order_items || []).reduce((acc: number, item: any) => {
        return acc + Number(item?.subtotal ?? (Number(item?.quantity || 0) * Number(item?.product_price || 0)))
      }, 0))
      const cust = order.buyer_id ? customerMap.get(String(order.buyer_id)) : null
      return {
        ...doItem,
        orders: {
          ...order,
          subtotal_value: subtotalValue,
          coupon_discount_amount: Number(order.discount_amount || 0),
          customer: cust ? {
            id: cust.id,
            name: cust.name,
            email: cust.email || null,
            phone: cust.phone || null,
            image_url: cust.image_url || null,
          } : null,
          customerAddress: cust?.street || cust?.city ? {
            street: cust.street || "",
            number: cust.number || "",
            complement: cust.complement || "",
            neighborhood: cust.neighborhood || "",
            city: cust.city || "",
            state: cust.state || "",
            zipCode: cust.zip_code || "",
          } : null,
        }
      }
    }),
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
  changeReason?: string
}) {
  const user = await requireUser()
  const actor = await getDeliveryActorScope(params.partnerId)
  await requirePartnerRouteAccess(params.partnerId, "logistics", { specificPermission: "can_update_delivery_status" })
  const planCheck = await enforcePlanOnExistingDelivery(params.partnerId, params.deliveryId)
  if (!planCheck.allowed) return { success: false as const, error: planCheck.error }
  const supabase = await getSupabaseServerClient()

  const { data: currentDelivery } = await supabase
    .from("deliveries")
    .select("id, delivery_person_id, status, departure_time, started_at, delivered_at, completed_at")
    .eq("id", params.deliveryId)
    .eq("partner_id", params.partnerId)
    .maybeSingle()
  if (!currentDelivery?.id) return { success: false as const, error: "Entrega não encontrada." }
  if (actor.roleId === "delivery") {
    const isAssigned = (actor.partnerUserId && String(currentDelivery.delivery_person_id || "") === actor.partnerUserId) ||
                       (user.id && String(currentDelivery.delivery_person_id || "") === user.id)
    if (!isAssigned) {
      return { success: false as const, error: "Sem permissão para alterar esta entrega." }
    }
  }

  const nextStatus = normalizeDeliveryStatus(params.status)
  const allowed = new Set<DeliveryStatusValue>(["pending", "preparing", "sent", "delivered", "cancelled"])
  if (!allowed.has(nextStatus)) {
    return { success: false as const, error: "Status de entrega inválido." }
  }

  const nowIso = new Date().toISOString()
  const patch: Record<string, unknown> = { status: nextStatus }
  if (nextStatus === "sent") {
    patch.departure_time = currentDelivery.departure_time || currentDelivery.started_at || nowIso
    patch.started_at = currentDelivery.started_at || nowIso
  }
  if (nextStatus === "delivered") {
    patch.departure_time = currentDelivery.departure_time || currentDelivery.started_at || nowIso
    patch.started_at = currentDelivery.started_at || nowIso
    patch.delivered_at = nowIso
    patch.completed_at = nowIso
  }

  const { error } = await supabase
    .from("deliveries")
    .update(patch)
    .eq("id", params.deliveryId)
    .eq("partner_id", params.partnerId)

  if (error) return { success: false as const, error: error.message }

  const childPatch: Record<string, unknown> = {
    status: nextStatus,
  }
  if (nextStatus === "delivered") {
    childPatch.delivered_at = nowIso
  }
  await supabase.from("delivery_orders").update(childPatch).eq("delivery_id", params.deliveryId)

  // Keep order delivery_status and timestamps in sync (best-effort)
  try {
    const { data: links } = await supabase
      .from("delivery_orders")
      .select("order_id")
      .eq("delivery_id", params.deliveryId)
    const orderIds = (links || []).map((l: any) => l?.order_id).filter(Boolean)
    if (orderIds.length > 0) {
      const orderPatch: Record<string, unknown> = {
        delivery_status: nextStatus,
      }
      if (nextStatus === "sent") {
        orderPatch.delivery_departure_at = nowIso
      }
      if (nextStatus === "delivered") {
        orderPatch.delivery_departure_at = nowIso
        orderPatch.delivery_arrived_at = nowIso
        orderPatch.delivery_completed_at = nowIso
      }
      await supabase.from("orders").update(orderPatch).in("id", orderIds).eq("partner_id", params.partnerId)
    }
  } catch (err) {
    console.warn("[updateERPDeliveryStatusAction] order patch failed:", err)
  }

  await logDeliveryEvent({
    partnerId: params.partnerId,
    actorUserId: user?.id || null,
    deliveryId: params.deliveryId,
    actionType: "delivery_status_changed",
    changeLines: [
      nextStatus === "sent"
        ? "Entrega iniciada"
        : nextStatus === "delivered"
          ? "Entrega concluída"
          : nextStatus === "cancelled"
            ? "Entrega cancelada"
            : "Status da entrega alterado",
      ...(params.changeReason ? [`Motivo: ${params.changeReason}`] : []),
    ],
    metadata: { oldStatus: String(currentDelivery.status || ""), newStatus: nextStatus },
  })

  import("@/lib/services/whatsapp-automation.service")
    .then(({ onDeliveryStatusChanged }) =>
      onDeliveryStatusChanged(
        { partner_id: params.partnerId, id: params.deliveryId, delivery_id: params.deliveryId },
        nextStatus,
      ),
    )
    .catch(console.error)

  if (params.status === "delivered" && currentDelivery.delivery_person_id) {
    const { data: deliveryOrders } = await supabase
      .from("delivery_orders")
      .select("orders(delivery_fee, store_id)")
      .eq("delivery_id", params.deliveryId)

    const deliveryFeeTotal = (deliveryOrders || []).reduce((sum: number, row: any) => {
      return sum + Number(row?.orders?.delivery_fee || 0)
    }, 0)
    const deliveryStoreId = (deliveryOrders?.[0] as any)?.orders?.store_id ?? null

    await createCommissionExpenseForEntity({
      supabase,
      partnerId: params.partnerId,
      storeId: deliveryStoreId,
      partnerUserId: String(currentDelivery.delivery_person_id),
      role: "delivery",
      deliveryFee: deliveryFeeTotal,
      entityType: "delivery",
      entityId: params.deliveryId,
      createdByUserId: user.id,
    })
  }

  if (params.status === "cancelled" && currentDelivery.delivery_person_id) {
    const { data: cancelledOrderRows } = await supabase
      .from("delivery_orders")
      .select("orders(store_id)")
      .eq("delivery_id", params.deliveryId)
      .limit(1)
    const cancelledStoreId = (cancelledOrderRows?.[0] as any)?.orders?.store_id ?? null

    await reverseCommissionForEntity({
      supabase,
      partnerId: params.partnerId,
      storeId: cancelledStoreId,
      entityType: "delivery",
      entityId: params.deliveryId,
      partnerUserId: String(currentDelivery.delivery_person_id),
      createdByUserId: user.id,
    })
  }

  revalidateDeliveryDashboard(params.partnerId)
  return { success: true as const }
}

export async function updateERPDeliveryAction(payload: {
  partnerId: string
  deliveryId: string
  orderIds: string[]
  deliveryPersonId?: string | null
  platformDriverId?: string | null
  status?: DeliveryStatusValue
  startedAt?: string
  notes?: string
}) {
  const user = await requireUser()
  const actor = await getDeliveryActorScope(payload.partnerId, "can_assign_driver")
  if (actor.roleId === "delivery") {
    return { success: false as const, error: "Sem permissão para editar entregas." }
  }
  const supabase = await getSupabaseServerClient()

  const orderIds = Array.from(new Set(payload.orderIds || [])).filter(Boolean)
  if (orderIds.length === 0) return { success: false as const, error: "Selecione ao menos um pedido." }
  const planCheck = await enforceDeliveryPlanAccess(payload.partnerId, orderIds.length)
  if (!planCheck.allowed) return { success: false as const, error: planCheck.error }

  const { data: delivery } = await supabase
    .from("deliveries")
    .select("id, status, delivery_person_id, started_at, notes, delivery_number")
    .eq("id", payload.deliveryId)
    .eq("partner_id", payload.partnerId)
    .single()

  if (!delivery?.id) return { success: false as const, error: "Entrega não encontrada." }

  const currentStatusNormalized = normalizeDeliveryStatus(delivery.status)
  if (!["pending", "not_sent", "preparing"].includes(currentStatusNormalized)) {
    return { success: false as const, error: "Apenas entregas não enviadas ou em preparação podem ser editadas." }
  }

  const { data: orders } = await supabase
    .from("orders")
    .select("id, delivery_address")
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

  const { data: previousLinks } = await supabase
    .from("delivery_orders")
    .select("order_id, orders(order_number)")
    .eq("delivery_id", payload.deliveryId)

  const firstOrder = orders[0]
  const deliveryAddress = formatAddress(firstOrder)
  let distanceKm: number | null = null
  let estimatedDurationMinutes: number | null = null

  if (deliveryAddress) {
    try {
      const { data: defaultStore } = await supabase
        .from("stores")
        .select("id")
        .eq("partner_id", payload.partnerId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle()

      let storeAddress = null
      if (defaultStore?.id) {
        const { data } = await supabase
          .from("addresses")
          .select("city, state, zip_code, street, number")
          .eq("store_id", defaultStore.id)
          .maybeSingle()
        storeAddress = data
      }

      if (!storeAddress) {
        const { data } = await supabase
          .from("addresses")
          .select("city, state, zip_code, street, number")
          .eq("partner_id", payload.partnerId)
          .eq("is_default", true)
          .maybeSingle()
        storeAddress = data
      }

      const originAddress = [
        [storeAddress?.street, storeAddress?.number].filter(Boolean).join(", "),
        [storeAddress?.city, storeAddress?.state].filter(Boolean).join(", "),
        storeAddress?.zip_code || "",
      ]
        .filter(Boolean)
        .join(" ")

      const [originCoords, destinationCoords] = await Promise.all([
        geocodeAddress(originAddress),
        geocodeAddress(deliveryAddress),
      ])

      if (originCoords && destinationCoords) {
        distanceKm = Number(calculateDistance(originCoords, destinationCoords).toFixed(2))
        estimatedDurationMinutes = estimateDeliveryTime(distanceKm)
      }
    } catch (err) {
      console.warn("[updateERPDeliveryAction] geocoding failed:", err)
    }
  }

  const nextStatus = payload.status ? normalizeDeliveryStatus(payload.status) : currentStatusNormalized
  const nowIso = new Date().toISOString()
  const startedAt = payload.startedAt || delivery.started_at || nowIso

  const deliveryPatch: Record<string, unknown> = {
    delivery_person_id: payload.deliveryPersonId !== undefined ? (payload.deliveryPersonId || null) : delivery.delivery_person_id,
    notes: payload.notes !== undefined ? sanitizeNotes(payload.notes) : delivery.notes,
    status: nextStatus,
  }

  if (payload.startedAt) {
    deliveryPatch.started_at = payload.startedAt
    deliveryPatch.departure_time = payload.startedAt
  }

  if (nextStatus === "delivered") {
    deliveryPatch.delivered_at = payload.startedAt || nowIso
    deliveryPatch.completed_at = payload.startedAt || nowIso
  }

  if (distanceKm != null) deliveryPatch.distance_km = distanceKm
  if (estimatedDurationMinutes != null) deliveryPatch.estimated_duration_minutes = estimatedDurationMinutes

  const { error: updateError } = await supabase
    .from("deliveries")
    .update(deliveryPatch)
    .eq("id", payload.deliveryId)
    .eq("partner_id", payload.partnerId)

  if (updateError) return { success: false as const, error: updateError.message }

  // Mantém histórico das atribuições Dudit e libera uma nova atribuição na edição.
  await getAdminClient()
    .from("delivery_assignments")
    .update({ status: "cancelled" })
    .eq("delivery_id", payload.deliveryId)
    .in("status", ["assigned", "accepted", "picked_up", "out_for_delivery"])

  const { error: deleteLinksError } = await supabase.from("delivery_orders").delete().eq("delivery_id", payload.deliveryId)
  if (deleteLinksError) return { success: false as const, error: deleteLinksError.message }

  const nextLinks = orderIds.map((orderId, index) => ({
    delivery_id: payload.deliveryId,
    order_id: orderId,
    position: index + 1,
    status: nextStatus === "delivered" ? "delivered" : "pending",
    delivered_at: nextStatus === "delivered" ? (payload.startedAt || nowIso) : null,
  }))
  const { error: insertLinksError } = await supabase.from("delivery_orders").insert(nextLinks)
  if (insertLinksError) return { success: false as const, error: insertLinksError.message }

  // Sync order-level delivery status & timestamps
  try {
    const orderPatch: Record<string, unknown> = {
      delivery_status: nextStatus,
    }
    if (nextStatus === "sent") {
      orderPatch.delivery_departure_at = startedAt
    }
    if (nextStatus === "delivered") {
      orderPatch.delivery_departure_at = startedAt
      orderPatch.delivery_arrived_at = startedAt
      orderPatch.delivery_completed_at = startedAt
    }
    await supabase.from("orders").update(orderPatch).in("id", orderIds).eq("partner_id", payload.partnerId)
  } catch (err) {
    console.warn("[updateERPDeliveryAction] order timestamps patch failed:", err)
  }

  // Build detailed log lines for history/audit
  const previousIds = new Set<string>((previousLinks || []).map((row: any) => String(row.order_id)))
  const nextIds = new Set<string>(orderIds.map(String))

  const added = orderIds.filter((id) => !previousIds.has(String(id)))
  const removed = Array.from(previousIds).filter((id) => !nextIds.has(id))

  const orderLabelById = new Map<string, string>()
  for (const row of previousLinks || []) {
    const id = String(row.order_id)
    const orderItem: any = Array.isArray(row.orders) ? row.orders[0] : row.orders
    const number = orderItem?.order_number || null
    orderLabelById.set(id, number || `#${id.slice(0, 8).toUpperCase()}`)
  }

  const changeLines: string[] = []
  for (const id of added) {
    const label = orderLabelById.get(String(id)) || `#${String(id).slice(0, 8).toUpperCase()}`
    changeLines.push(`Pedido ${label} adicionado à entrega`)
  }
  for (const id of removed) {
    const label = orderLabelById.get(String(id)) || `#${String(id).slice(0, 8).toUpperCase()}`
    changeLines.push(`Pedido ${label} removido da entrega`)
  }
  if (payload.deliveryPersonId !== undefined && payload.deliveryPersonId !== delivery.delivery_person_id) {
    changeLines.push(payload.deliveryPersonId ? "Entregador atribuído à entrega" : "Entregador removido da entrega")
  }
  if (payload.startedAt && payload.startedAt !== delivery.started_at) {
    changeLines.push("Data/horário de saída atualizado")
  }
  if (payload.status && nextStatus !== currentStatusNormalized) {
    changeLines.push(`Status alterado para ${nextStatus}`)
  }
  if (payload.notes != null) {
    changeLines.push("Observações da entrega atualizadas")
  }

  await logDeliveryEvent({
    partnerId: payload.partnerId,
    actorUserId: user?.id || null,
    deliveryId: payload.deliveryId,
    actionType: "delivery_updated",
    changeLines: changeLines.length > 0 ? changeLines : ["Entrega atualizada"],
    metadata: {
      orderCount: orderIds.length,
      driverId: payload.deliveryPersonId || null,
      status: nextStatus,
    },
  })

  if (nextStatus === "delivered" && payload.deliveryPersonId) {
    const { data: deliveryOrders } = await supabase
      .from("delivery_orders")
      .select("orders(delivery_fee, store_id)")
      .eq("delivery_id", payload.deliveryId)

    const deliveryFeeTotal = (deliveryOrders || []).reduce((sum: number, row: any) => {
      return sum + Number(row?.orders?.delivery_fee || 0)
    }, 0)
    const deliveryStoreId = (deliveryOrders?.[0] as any)?.orders?.store_id ?? null

    await createCommissionExpenseForEntity({
      supabase,
      partnerId: payload.partnerId,
      storeId: deliveryStoreId,
      partnerUserId: String(payload.deliveryPersonId),
      role: "delivery",
      deliveryFee: deliveryFeeTotal,
      entityType: "delivery",
      entityId: payload.deliveryId,
      createdByUserId: user.id,
    })
  }

  revalidateDeliveryDashboard(payload.partnerId)
  return { success: true as const, deliveryId: payload.deliveryId }
}

export async function updateERPSingleOrderDeliveryStatusAction(params: {
  partnerId: string
  deliveryId: string
  orderId: string
  status: DeliveryStatusValue
  changeReason?: string
}) {
  const user = await requireUser()
  const actor = await getDeliveryActorScope(params.partnerId)
  await requirePartnerRouteAccess(params.partnerId, "logistics", { specificPermission: "can_update_delivery_status" })
  const supabase = await getSupabaseServerClient()

  const { data: currentDelivery } = await supabase
    .from("deliveries")
    .select("id, delivery_person_id, status")
    .eq("id", params.deliveryId)
    .eq("partner_id", params.partnerId)
    .maybeSingle()

  if (!currentDelivery?.id) return { success: false as const, error: "Entrega não encontrada." }
  if (actor.roleId === "delivery") {
    const isAssigned = (actor.partnerUserId && String(currentDelivery.delivery_person_id || "") === actor.partnerUserId) ||
                       (user.id && String(currentDelivery.delivery_person_id || "") === user.id)
    if (!isAssigned) {
      return { success: false as const, error: "Sem permissão para alterar esta entrega." }
    }
  }

  const nextStatus = normalizeDeliveryStatus(params.status)
  const allowed = new Set<DeliveryStatusValue>(["pending", "preparing", "sent", "delivered", "cancelled", "delivery_failed"])
  if (!allowed.has(nextStatus)) {
    return { success: false as const, error: "Status de entrega inválido." }
  }

  const nowIso = new Date().toISOString()
  const childPatch: Record<string, unknown> = {
    status: nextStatus === "cancelled" ? "cancelled" : nextStatus,
  }
  if (nextStatus === "delivered") {
    childPatch.delivered_at = nowIso
  } else {
    childPatch.delivered_at = null
  }

  const { error: linkError } = await supabase
    .from("delivery_orders")
    .update(childPatch)
    .eq("delivery_id", params.deliveryId)
    .eq("order_id", params.orderId)

  if (linkError) return { success: false as const, error: linkError.message }

  // Sync order-level delivery status (best-effort)
  try {
    const orderPatch: Record<string, unknown> = {
      delivery_status: nextStatus,
    }
    if (nextStatus === "sent") {
      orderPatch.delivery_departure_at = nowIso
    }
    if (nextStatus === "delivered") {
      orderPatch.delivery_departure_at = nowIso
      orderPatch.delivery_arrived_at = nowIso
      orderPatch.delivery_completed_at = nowIso
    }
    await supabase.from("orders").update(orderPatch).eq("id", params.orderId).eq("partner_id", params.partnerId)
  } catch (err) {
    console.warn("[updateERPSingleOrderDeliveryStatusAction] order patch failed:", err)
  }

  const orderLabel = `#${String(params.orderId).slice(0, 8).toUpperCase()}`
  let changeMsg = nextStatus === "delivered"
    ? `Pedido ${orderLabel} entregue`
    : nextStatus === "delivery_failed"
      ? `Falha na entrega do pedido ${orderLabel}`
      : `Status de entrega do pedido ${orderLabel} alterado para ${nextStatus}`

  if (params.changeReason?.trim()) {
    changeMsg += ` (Motivo da alteração: ${params.changeReason.trim()})`
  }

  // Log on delivery audit
  await logDeliveryEvent({
    partnerId: params.partnerId,
    actorUserId: user?.id || null,
    deliveryId: params.deliveryId,
    actionType: "order_delivery_status_changed",
    changeLines: [changeMsg],
    metadata: { orderId: params.orderId, newStatus: nextStatus },
  })

  // Log on order timeline
  try {
    await logAuditEvent({
      partnerId: params.partnerId,
      actorUserId: user?.id || null,
      entityType: "order",
      entityId: params.orderId,
      actionType: "delivery_status_changed",
      changeLines: [changeMsg],
      metadata: { deliveryId: params.deliveryId, status: nextStatus },
      source: "manual",
    })
  } catch (err) {
    console.warn("[updateERPSingleOrderDeliveryStatusAction] order logAuditEvent failed:", err)
  }

  // Check if all delivery_orders are now completed
  const { data: allLinks } = await supabase
    .from("delivery_orders")
    .select("status")
    .eq("delivery_id", params.deliveryId)

  const statuses = (allLinks || []).map((l: any) => l.status)
  const allFinished = statuses.every((s: string) => ["delivered", "delivery_failed", "cancelled"].includes(s))
  const anyDelivered = statuses.some((s: string) => s === "delivered")
  let resultingDeliveryStatus = String(currentDelivery.status || "pending")

  if (allFinished) {
    const finalDeliveryStatus = anyDelivered ? "delivered" : "delivery_failed"
    resultingDeliveryStatus = finalDeliveryStatus
    const deliveryPatch: Record<string, unknown> = { status: finalDeliveryStatus }
    if (finalDeliveryStatus === "delivered") {
      deliveryPatch.departure_time = nowIso
      deliveryPatch.started_at = nowIso
      deliveryPatch.delivered_at = nowIso
      deliveryPatch.completed_at = nowIso
    }

    await supabase
      .from("deliveries")
      .update(deliveryPatch)
      .eq("id", params.deliveryId)

    if (finalDeliveryStatus === "delivered" && currentDelivery.delivery_person_id) {
      const { data: deliveryOrders } = await supabase
        .from("delivery_orders")
        .select("orders(delivery_fee, store_id)")
        .eq("delivery_id", params.deliveryId)

      const deliveryFeeTotal = (deliveryOrders || []).reduce((sum: number, row: any) => {
        return sum + Number(row?.orders?.delivery_fee || 0)
      }, 0)
      const deliveryStoreId = (deliveryOrders?.[0] as any)?.orders?.store_id ?? null

      await createCommissionExpenseForEntity({
        supabase,
        partnerId: params.partnerId,
        storeId: deliveryStoreId,
        partnerUserId: String(currentDelivery.delivery_person_id),
        role: "delivery",
        deliveryFee: deliveryFeeTotal,
        entityType: "delivery",
        entityId: params.deliveryId,
        createdByUserId: user.id,
      })
    }
  }

  revalidateDeliveryDashboard(params.partnerId)
  return { success: true as const, deliveryStatus: resultingDeliveryStatus }
}
