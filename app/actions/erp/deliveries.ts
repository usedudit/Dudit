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

const DEFAULT_PAGE_SIZE = 100
const ACTIVE_DELIVERY_STATUSES = ["pending", "not_sent", "preparing", "sent", "pickup_available"] as const

function revalidateDeliveryDashboard(partnerId: string) {
  // @ts-ignore - Next 15 accepts profile as the second argument.
  revalidateTag(DASHBOARD_TAGS.general(partnerId), "max")
  // @ts-ignore
  revalidateTag(DASHBOARD_TAGS.financial(partnerId), "max")
  // @ts-ignore
  revalidateTag(DASHBOARD_TAGS.operations(partnerId), "max")
  revalidatePath("/erp/dashboard")
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
    return { roleId: access.roleId, partnerUserId: null as string | null }
  }

  const supabase = await getSupabaseServerClient()
  const { data: partnerUser } = await supabase
    .from("partner_users")
    .select("id")
    .eq("partner_id", partnerId)
    .eq("user_id", access.userId)
    .maybeSingle()

  return { roleId: access.roleId, partnerUserId: partnerUser?.id ? String(partnerUser.id) : null }
}

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
      orderLabel: data.orders?.order_number || `#${String(params.orderId).slice(0, 8).toUpperCase()}`,
    },
  }
}

export async function getDeliveryRoutePointsAction(params: { partnerId: string; deliveryId: string }) {
  await requireUser()
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
        order_id,
        orders(id, order_number, customer_name, delivery_address, distance_km, created_at)
      )
    `)
    .eq("id", params.deliveryId)
    .eq("partner_id", params.partnerId)
    .single()

  if (error || !delivery?.id) {
    return { success: false as const, error: error?.message || "Entrega não encontrada." }
  }

  const { data: partner } = await supabase
    .from("partners")
    .select("latitude, longitude")
    .eq("id", params.partnerId)
    .maybeSingle()
  const origin = partner?.latitude && partner?.longitude
    ? { lat: Number(partner.latitude), lng: Number(partner.longitude) }
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

export async function getERPDeliveryAnalyticsAction(params: { partnerId: string; days?: number }) {
  await requireUser()
  await requirePartnerRouteAccess(params.partnerId, "logistics", { specificPermission: "can_view_delivery_details" })
  const actor = await getDeliveryActorScope(params.partnerId)
  if (actor.roleId === "delivery") {
    return { success: false as const, error: "Sem permissão para visualizar métricas." }
  }

  const days = Math.max(7, Math.min(90, Math.floor(Number(params.days || 30))))
  const fromIso = new Date(Date.now() - days * 86400000).toISOString()

  const supabase = await getSupabaseServerClient()

  const { data: deliveries, error } = await supabase
    .from("deliveries")
    .select("id, status, created_at, departure_time, completed_at, estimated_duration_minutes, distance_km, delivery_person_id")
    .eq("partner_id", params.partnerId)
    .gte("created_at", fromIso)
    .order("created_at", { ascending: false })
    .limit(2000)

  if (error) return { success: false as const, error: error.message }
  const rows = deliveries || []
  const deliveryIds = rows.map((d: any) => d.id).filter(Boolean)

  const { data: links } = await supabase
    .from("delivery_orders")
    .select("delivery_id")
    .in("delivery_id", deliveryIds.length ? deliveryIds : ["00000000-0000-0000-0000-000000000000"])

  const orderCountByDeliveryId = new Map<string, number>()
  for (const l of links || []) {
    const id = String((l as any).delivery_id || "")
    if (!id) continue
    orderCountByDeliveryId.set(id, (orderCountByDeliveryId.get(id) || 0) + 1)
  }

  const doneStatuses = new Set(["delivered", "completed"])
  const activeStatuses = new Set(["pending", "preparing", "sent", "not_sent", "pickup_available"])

  const completed = rows.filter((d: any) => doneStatuses.has(String(d.status || "").toLowerCase()))
  const active = rows.filter((d: any) => activeStatuses.has(String(d.status || "").toLowerCase()))

  const avgMinutes = (() => {
    const durations = completed
      .map((d: any) => {
        const start = d.departure_time || d.created_at
        const end = d.completed_at
        if (!start || !end) return null
        const ms = new Date(end).getTime() - new Date(start).getTime()
        if (!Number.isFinite(ms) || ms <= 0) return null
        return Math.round(ms / 60000)
      })
      .filter((v: any) => v != null) as number[]
    if (durations.length === 0) return 0
    return Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
  })()

  const totalDistanceKm = rows.reduce((sum: number, d: any) => sum + Number(d.distance_km || 0), 0)
  const avgOrdersPerDelivery = (() => {
    const counts = rows.map((d: any) => orderCountByDeliveryId.get(String(d.id)) || 0).filter((n: number) => n > 0)
    if (counts.length === 0) return 0
    return Math.round((counts.reduce((a: number, b: number) => a + b, 0) / counts.length) * 10) / 10
  })()

  const completionRate = rows.length ? Math.round((completed.length / rows.length) * 100) : 0

  // deliveries per day (created)
  const dayKey = (iso: string) => String(iso || "").slice(0, 10)
  const dayMap = new Map<string, { total: number; completed: number }>()
  for (const d of rows) {
    const k = dayKey(d.created_at)
    const entry = dayMap.get(k) || { total: 0, completed: 0 }
    entry.total += 1
    if (doneStatuses.has(String(d.status || "").toLowerCase())) entry.completed += 1
    dayMap.set(k, entry)
  }
  const daysSorted = Array.from(dayMap.keys()).sort()
  const deliveriesPerDay = daysSorted.map((k) => ({ label: k.slice(5), value: dayMap.get(k)!.total }))
  const completionTrend = daysSorted.map((k) => ({ label: k.slice(5), value: dayMap.get(k)!.completed, secondary: dayMap.get(k)!.total }))

  // driver ranking
  const driverAgg = new Map<string, { count: number; minutes: number[] }>()
  for (const d of completed) {
    const pid = String(d.delivery_person_id || "")
    if (!pid) continue
    const start = d.departure_time || d.created_at
    const end = d.completed_at
    const mins = start && end ? Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000) : null
    const entry = driverAgg.get(pid) || { count: 0, minutes: [] }
    entry.count += 1
    if (mins && mins > 0 && Number.isFinite(mins)) entry.minutes.push(mins)
    driverAgg.set(pid, entry)
  }

  const driverIds = Array.from(driverAgg.keys())
  const driverNameById = await getPartnerUserNameByIdMap(supabase, params.partnerId, driverIds)

  const driverRanking = driverIds
    .map((id) => {
      const agg = driverAgg.get(id)!
      const avg = agg.minutes.length ? Math.round(agg.minutes.reduce((a, b) => a + b, 0) / agg.minutes.length) : 0
      return { id, name: driverNameById.get(id) || "Entregador", deliveries: agg.count, avgMinutes: avg }
    })
    .sort((a, b) => b.deliveries - a.deliveries)
    .slice(0, 10)

  return {
    success: true as const,
    data: {
      metrics: {
        avgDeliveryMinutes: avgMinutes,
        totalDeliveries: rows.length,
        completedDeliveries: completed.length,
        activeDeliveries: active.length,
        totalEstimatedDistanceKm: Math.round(totalDistanceKm * 10) / 10,
        avgOrdersPerDelivery,
        completionRate,
      },
      deliveriesPerDay,
      completionTrend,
      driverRanking,
    },
  }
}

export async function getERPDeliveryDriversAction(partnerId: string) {
  await requireUser()
  await requirePartnerRouteAccess(partnerId, "logistics", { specificPermission: "can_assign_driver" })
  const actor = await getDeliveryActorScope(partnerId)
  if (actor.roleId === "delivery") {
    return { success: false as const, error: "Sem permissão para gerenciar entregadores." }
  }

  const supabase = await getSupabaseServerClient()
  const { data: drivers, error } = await supabase
    .from("partner_users")
    .select("id, user_id, role_id, phone, notes, is_active, created_at")
    .eq("partner_id", partnerId)
    .eq("role_id", "delivery")
    .order("created_at", { ascending: true })

  if (error) return { success: false as const, error: error.message }

  const driverIds = (drivers || []).map((d: any) => String(d.id)).filter(Boolean)
  const nameById = await getPartnerUserNameByIdMap(supabase, partnerId, driverIds)

  // Fetch deliveries for stats (single query, avoids N+1)
  const { data: deliveries } = await supabase
    .from("deliveries")
    .select("id, delivery_person_id, status, departure_time, completed_at, created_at")
    .eq("partner_id", partnerId)
    .in("delivery_person_id", driverIds.length ? driverIds : ["00000000-0000-0000-0000-000000000000"])
    .order("created_at", { ascending: false })
    .limit(2500)

  const byDriver = new Map<string, any[]>()
  for (const del of deliveries || []) {
    const did = String((del as any).delivery_person_id || "")
    if (!did) continue
    const list = byDriver.get(did) || []
    list.push(del)
    byDriver.set(did, list)
  }

  const activeStatuses = new Set(["pending", "preparing", "sent", "not_sent", "pickup_available"])
  const doneStatuses = new Set(["delivered", "completed"])

  const items = (drivers || []).map((d: any) => {
    const list = byDriver.get(String(d.id)) || []
    const current = list.filter((x: any) => activeStatuses.has(String(x.status || "").toLowerCase())).length
    const completed = list.filter((x: any) => doneStatuses.has(String(x.status || "").toLowerCase())).length
    const avg = (() => {
      const mins = list
        .filter((x: any) => doneStatuses.has(String(x.status || "").toLowerCase()) && x.completed_at)
        .map((x: any) => {
          const start = x.departure_time || x.created_at
          const end = x.completed_at
          const m = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000)
          return Number.isFinite(m) && m > 0 ? m : null
        })
        .filter((v: any) => v != null) as number[]
      if (mins.length === 0) return 0
      return Math.round(mins.reduce((a, b) => a + b, 0) / mins.length)
    })()

    return {
      id: String(d.id),
      name: nameById.get(String(d.id)) || "Entregador",
      active: Boolean(d.is_active ?? true),
      phone: d.phone || "",
      notes: d.notes || "",
      currentDeliveries: current,
      completedDeliveries: completed,
      avgDeliveryMinutes: avg,
    }
  })

  return { success: true as const, items }
}

export async function updateERPDeliveryDriverAction(input: {
  partnerId: string
  driverPartnerUserId: string
  phone?: string
  notes?: string
  active?: boolean
}) {
  const user = await requireUser()
  await requirePartnerRouteAccess(input.partnerId, "logistics", { specificPermission: "can_assign_driver" })
  const actor = await getDeliveryActorScope(input.partnerId)
  if (actor.roleId === "delivery") {
    return { success: false as const, error: "Sem permissão para editar entregadores." }
  }

  const supabase = await getSupabaseServerClient()
  const patch: Record<string, unknown> = {}
  if (input.phone !== undefined) patch.phone = String(input.phone || "").trim() || null
  if (input.notes !== undefined) patch.notes = String(input.notes || "").trim() || null
  if (input.active !== undefined) patch.is_active = Boolean(input.active)

  const { error } = await supabase
    .from("partner_users")
    .update(patch)
    .eq("id", input.driverPartnerUserId)
    .eq("partner_id", input.partnerId)
    .eq("role_id", "delivery")

  if (error) return { success: false as const, error: error.message }

  await logAuditEvent({
    partnerId: input.partnerId,
    actorUserId: user?.id || null,
    entityType: "delivery_driver",
    entityId: input.driverPartnerUserId,
    actionType: "updated",
    changeLines: ["Entregador atualizado"],
    metadata: { phone: input.phone, active: input.active },
    source: "manual",
  })

  return { success: true as const }
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

function extractZipPrefix(address: string): string | null {
  const raw = String(address || "")
  const m = raw.match(/\b(\d{5})-?\d{3}\b/)
  if (!m?.[1]) return null
  return m[1]
}

function normalizeAddressGroupKey(address: string): { key: string; label: string } {
  const cleaned = String(address || "").trim()
  const zipPrefix = extractZipPrefix(cleaned)
  if (zipPrefix) return { key: `zip:${zipPrefix}`, label: `CEP ${zipPrefix}` }

  // Very lightweight fallback: last "City - ST" pattern
  const cityState = cleaned.match(/,\s*([^,]+)\s*-\s*([A-Z]{2})\s*$/i)
  if (cityState?.[1] && cityState?.[2]) {
    const city = String(cityState[1]).trim().toLowerCase()
    const st = String(cityState[2]).trim().toUpperCase()
    return { key: `city:${city}:${st}`, label: `${cityState[1].trim()} - ${st}` }
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
  if (preset != null && !Number.isNaN(Number(preset))) {
    return Number(Number(preset).toFixed(2))
  }

  const address = formatAddress(params.order)
  if (!address || !params.originCoords) return null
  const dest = await getOrCreateCachedCoords({ supabase: params.supabase, partnerId: params.partnerId, addressText: address })
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

  // origin coords: partners table has persisted latitude/longitude (used elsewhere)
  const { data: partner } = await supabase
    .from("partners")
    .select("latitude, longitude")
    .eq("id", input.partnerId)
    .maybeSingle()
  const originCoords = partner?.latitude && partner?.longitude
    ? { lat: Number(partner.latitude), lng: Number(partner.longitude) }
    : null

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

  // Estimate distances in parallel (cached geocoding)
  const enriched = await Promise.all(
    eligible.map(async (order: any) => {
      const distanceKm = await estimateOrderDistanceKm({ supabase, partnerId: input.partnerId, order, originCoords })
      const address = formatAddress(order)
      const group = normalizeAddressGroupKey(address)
      return {
        id: String(order.id),
        orderNumber: order.order_number ? String(order.order_number) : null,
        displayId: order.order_number || `#${String(order.id).slice(0, 8).toUpperCase()}`,
        customerName: String(order.customer_name || "Cliente"),
        address,
        createdAt: String(order.created_at || ""),
        distanceKm,
        groupKey: group.key,
        groupLabel: group.label,
      }
    }),
  )

  // Sort by group, then by createdAt desc, then by distance asc (if any)
  enriched.sort((a, b) => {
    if (a.groupKey !== b.groupKey) return a.groupKey.localeCompare(b.groupKey)
    const aT = a.createdAt ? new Date(a.createdAt).getTime() : 0
    const bT = b.createdAt ? new Date(b.createdAt).getTime() : 0
    if (aT !== bT) return bT - aT
    const aD = a.distanceKm == null ? Number.POSITIVE_INFINITY : a.distanceKm
    const bD = b.distanceKm == null ? Number.POSITIVE_INFINITY : b.distanceKm
    return aD - bD
  })

  const groupsByKey = new Map<string, { label: string; orders: SmartDeliverySuggestionOrder[] }>()
  for (const o of enriched) {
    const existing = groupsByKey.get(o.groupKey) || { label: o.groupLabel, orders: [] as SmartDeliverySuggestionOrder[] }
    existing.orders.push({
      id: o.id,
      orderNumber: o.orderNumber,
      displayId: o.displayId,
      customerName: o.customerName,
      address: o.address,
      distanceKm: o.distanceKm,
    })
    groupsByKey.set(o.groupKey, existing)
  }

  const suggestions: SmartDeliverySuggestionGroup[] = []
  for (const [groupKey, group] of groupsByKey.entries()) {
    // chunk orders to respect maxOrdersPerDelivery
    for (let i = 0; i < group.orders.length; i += maxOrdersPerDelivery) {
      const chunk = group.orders.slice(i, i + maxOrdersPerDelivery)
      const totalDistance = chunk.some((o) => o.distanceKm == null)
        ? null
        : Number(chunk.reduce((sum, o) => sum + Number(o.distanceKm || 0), 0).toFixed(2))
      const estimatedDurationMinutes = totalDistance == null ? null : estimateDeliveryTime(totalDistance)

      suggestions.push({
        groupKey,
        groupLabel: group.label,
        totalDistanceKm: totalDistance,
        estimatedDurationMinutes,
        orders: chunk,
      })
    }
  }

  // Sort suggestion blocks by most "dense" first: more orders, smaller distance.
  suggestions.sort((a, b) => {
    if (b.orders.length !== a.orders.length) return b.orders.length - a.orders.length
    const aD = a.totalDistanceKm == null ? Number.POSITIVE_INFINITY : a.totalDistanceKm
    const bD = b.totalDistanceKm == null ? Number.POSITIVE_INFINITY : b.totalDistanceKm
    return aD - bD
  })

  return {
    success: true as const,
    maxOrdersPerDelivery,
    generatedAt: new Date().toISOString(),
    items: suggestions.slice(0, 30), // keep UI light
  }
}

export async function fetchDeliveryOrderBucketAction(partnerId: string) {
  await requireUser()
  const actor = await getDeliveryActorScope(partnerId)
  if (actor.roleId === "delivery") return []
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

  if (error) {
    console.error("[fetchDeliveryOrderBucketAction]", error)
    return []
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
      customer: {
        id: order.buyer_id || null,
        name: order.customer_name || "Consumidor final",
        email: null,
        phone: null,
      },
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
  const deliveryNumber = await allocatePartnerDeliveryNumber(supabase, payload.partnerId)

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
    notes: payload.notes?.trim() || null,
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

  // Order-level timestamps (best-effort; do not block)
  try {
    const orderPatch: Record<string, unknown> = {}
    if (status === "sent") {
      orderPatch.delivery_departure_at = payload.startedAt
    }
    if (status === "delivered") {
      orderPatch.delivery_departure_at = payload.startedAt
      orderPatch.delivery_arrived_at = payload.startedAt
      orderPatch.delivery_completed_at = payload.startedAt
    }
    if (Object.keys(orderPatch).length > 0) {
      await supabase.from("orders").update(orderPatch).in("id", orderIds).eq("partner_id", payload.partnerId)
    }
  } catch (err) {
    console.warn("[createERPDeliveryAction] order timestamps patch failed:", err)
  }

  await logDeliveryEvent({
    partnerId: payload.partnerId,
    actorUserId: user?.id || null,
    deliveryId: created.id,
    actionType: "delivery_created",
    changeLines: ["Entrega criada"],
    metadata: {
      deliveryNumber,
      orderCount: orderIds.length,
      driverId: payload.deliveryPersonId || null,
      status,
    },
  })

  revalidateDeliveryDashboard(payload.partnerId)
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
    planGate?: { requiredPlanSlug: "crescer" | "escalar"; message: string }
  }
  | { success: false; error: string }
> {
  try {
    await requireUser()
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
      if (!actor.partnerUserId) return { success: true, items: [], nextCursor: null, hasMore: false }
      q = q.eq("delivery_person_id", actor.partnerUserId)
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
  await requireUser()
  const actor = await getDeliveryActorScope(partnerId)
  await requirePartnerRouteAccess(partnerId, "logistics", { specificPermission: "can_view_delivery_details" })
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

  if (actor.roleId === "delivery" && actor.partnerUserId && String(data?.delivery_person_id || "") !== actor.partnerUserId) {
    return { success: false as const, error: "Sem permissão para visualizar esta entrega." }
  }

  if (error) return { success: false as const, error: error.message }

  const deliveryPersonNameById = await getPartnerUserNameByIdMap(
    supabase,
    partnerId,
    data?.delivery_person_id ? [String(data.delivery_person_id)] : [],
  )

  const hydrated = {
    ...data,
    delivery_orders: (data?.delivery_orders || []).map((doItem: any) => {
      const order = doItem.orders
      if (!order) return doItem
      const subtotalValue = Number((order.order_items || []).reduce((acc: number, item: any) => {
        return acc + Number(item?.subtotal ?? (Number(item?.quantity || 0) * Number(item?.product_price || 0)))
      }, 0))
      return {
        ...doItem,
        orders: {
          ...order,
          subtotal_value: subtotalValue,
          coupon_discount_amount: Number(order.discount_amount || 0),
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
  if (actor.roleId === "delivery" && actor.partnerUserId && String(currentDelivery.delivery_person_id || "") !== actor.partnerUserId) {
    return { success: false as const, error: "Sem permissão para alterar esta entrega." }
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
    status:
      nextStatus === "cancelled"
        ? "cancelled"
        : nextStatus === "delivered"
          ? "delivered"
          : nextStatus === "sent"
            ? "sent"
            : "pending",
  }
  if (nextStatus === "delivered") {
    childPatch.delivered_at = nowIso
  }
  await supabase.from("delivery_orders").update(childPatch).eq("delivery_id", params.deliveryId)

  // Keep order timestamps in sync (best-effort)
  try {
    const { data: links } = await supabase
      .from("delivery_orders")
      .select("order_id")
      .eq("delivery_id", params.deliveryId)
    const orderIds = (links || []).map((l: any) => l?.order_id).filter(Boolean)
    if (orderIds.length > 0) {
      const orderPatch: Record<string, unknown> = {}
      if (nextStatus === "sent") {
        orderPatch.delivery_departure_at = nowIso
      }
      if (nextStatus === "delivered") {
        orderPatch.delivery_departure_at = nowIso
        orderPatch.delivery_arrived_at = nowIso
        orderPatch.delivery_completed_at = nowIso
      }
      if (Object.keys(orderPatch).length > 0) {
        await supabase.from("orders").update(orderPatch).in("id", orderIds).eq("partner_id", params.partnerId)
      }
    }
  } catch (err) {
    console.warn("[updateERPDeliveryStatusAction] order timestamps patch failed:", err)
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
      .select("orders(delivery_fee)")
      .eq("delivery_id", params.deliveryId)

    const deliveryFeeTotal = (deliveryOrders || []).reduce((sum: number, row: any) => {
      return sum + Number(row?.orders?.delivery_fee || 0)
    }, 0)

    await createCommissionExpenseForEntity({
      supabase,
      partnerId: params.partnerId,
      partnerUserId: String(currentDelivery.delivery_person_id),
      role: "delivery",
      deliveryFee: deliveryFeeTotal,
      entityType: "delivery",
      entityId: params.deliveryId,
      createdByUserId: user.id,
    })
  }

  if (params.status === "cancelled" && currentDelivery.delivery_person_id) {
    await reverseCommissionForEntity({
      supabase,
      partnerId: params.partnerId,
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

  const { data: previousLinks } = await supabase
    .from("delivery_orders")
    .select("order_id, orders(order_number)")
    .eq("delivery_id", payload.deliveryId)

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

  // Build detailed log lines for history/audit
  const previousIds = new Set<string>((previousLinks || []).map((row: any) => String(row.order_id)))
  const nextIds = new Set<string>(orderIds.map(String))

  const added = orderIds.filter((id) => !previousIds.has(String(id)))
  const removed = Array.from(previousIds).filter((id) => !nextIds.has(id))

  const orderLabelById = new Map<string, string>()
  for (const row of previousLinks || []) {
    const id = String(row.order_id)
    const number = row.orders?.order_number || null
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
  if (payload.deliveryPersonId !== undefined) {
    changeLines.push(payload.deliveryPersonId ? "Entregador atribuído à entrega" : "Entregador removido da entrega")
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
    },
  })

  revalidateDeliveryDashboard(payload.partnerId)
  return { success: true as const }
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
  if (actor.roleId === "delivery" && actor.partnerUserId && String(currentDelivery.delivery_person_id || "") !== actor.partnerUserId) {
    return { success: false as const, error: "Sem permissão para alterar esta entrega." }
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

  if (allFinished) {
    const finalDeliveryStatus = anyDelivered ? "delivered" : "delivery_failed"
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
        .select("orders(delivery_fee)")
        .eq("delivery_id", params.deliveryId)

      const deliveryFeeTotal = (deliveryOrders || []).reduce((sum: number, row: any) => {
        return sum + Number(row?.orders?.delivery_fee || 0)
      }, 0)

      await createCommissionExpenseForEntity({
        supabase,
        partnerId: params.partnerId,
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
  return { success: true as const }
}
