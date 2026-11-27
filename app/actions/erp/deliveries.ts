"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requirePartnerRouteAccess, requireUser } from "@/lib/auth/authorization"
import { getPartnerPlan } from "@/lib/services/subscription.service"
import { createCommissionExpenseForEntity, reverseCommissionForEntity } from "@/lib/services/commission-ledger.service"
import { logAuditEvent } from "@/lib/services/timeline.service"
import { resolveDeliveryPlanCapability } from "@/lib/delivery/plan"
import { resolveEffectiveDeliveryStatus } from "@/lib/delivery/status-resolver"
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
import { revalidateOrderHistory } from "@/lib/utils/revalidation"
import { getCachedErpPage } from "@/lib/data/erp-page-cache"
import { TAGS } from "@/lib/utils/revalidation-tags"
import { createNotification } from "@/lib/services/notification.service"
import { checkPermission } from "@/lib/permissions/access"

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
  startedAt?: string
  notes?: string
}

const DEFAULT_PAGE_SIZE = 100
const ACTIVE_DELIVERY_STATUSES = ["preparing", "sent", "pickup_available"] as const

export type ERPDeliveryListStatusGroup = "active" | "closed"

// Statuses shown on the "Canceladas / Falhas" tab. Everything else (including
// legacy statuses) stays on the "Delivery" tab.
const ERP_DELIVERY_CLOSED_TAB_STATUSES = ["cancelled", "delivery_failed"] as const

function revalidateDeliveryDashboard(partnerId: string, deliveryId?: string) {
  // @ts-ignore - Next 15 accepts profile as the second argument.
  revalidateTag(DASHBOARD_TAGS.general(partnerId), "max")
  // @ts-ignore
  revalidateTag(DASHBOARD_TAGS.financial(partnerId), "max")
  // @ts-ignore
  revalidateTag(DASHBOARD_TAGS.operations(partnerId), "max")
  // @ts-ignore
  revalidateTag(TAGS.deliveries(partnerId), "max")
  // @ts-ignore
  revalidateTag(TAGS.orders(partnerId), "max")
  if (deliveryId) {
    // @ts-ignore
    revalidateTag(`delivery-${deliveryId}`, "max")
  }
  revalidatePath("/erp/painel")
  revalidatePath("/erp/inicio")
  revalidatePath("/erp/entregas")
  revalidatePath("/erp/pedidos")
  revalidatePath("/erp/logistica")
  revalidatePath("/pedidos")
}

const DUDIT_NETWORK_EXPIRATION_MS = 15 * 60 * 1000

/**
 * Finaliza a baixa de estoque (caso o pedido ainda não tenha `inventory_deducted = true`)
 * e sincroniza status (`enviado` / `entregue`) + estoque físico/reservado com ERPs conectados (Tiny / Bling).
 * Executado de forma não-bloqueante sempre que entregas via Delivery mudam para `sent` ou `delivered`.
 */
async function syncDeliveredOrdersToErps(params: {
  partnerId: string
  orderIds: string[]
  nextStatus: DeliveryStatusValue
  actorUserId?: string | null
}): Promise<void> {
  if (params.nextStatus !== "sent" && params.nextStatus !== "delivered") return
  const uniqueOrderIds = Array.from(new Set((params.orderIds || []).filter(Boolean)))
  if (uniqueOrderIds.length === 0) return

  const admin = getAdminClient()
  const { data: orders } = await admin
    .from("orders")
    .select("id, order_number, store_id, notes, created_by, inventory_deducted, order_items(product_id, variant_id, quantity)")
    .eq("partner_id", params.partnerId)
    .in("id", uniqueOrderIds)

  if (!orders || orders.length === 0) return

  const {
    exportOrderToConnectedErps,
    updateOrderStatusOnConnectedErps,
    syncItemsStockToConnectedErps,
  } = await import("@/lib/services/integrations/erp-sync")
  const { reserveOrderInventory, finalizeOrderInventory } = await import("@/lib/stock/reservations")

  const erpSit = params.nextStatus === "delivered" ? "entregue" : "enviado"

  for (const order of orders as any[]) {
    try {
      const orderItems = (order.order_items || []).filter((it: any) => it?.product_id)

      // 1. Se o pedido ainda não teve baixa física de estoque na Dudit, finaliza o estoque agora
      if (!order.inventory_deducted && orderItems.length > 0) {
        const shortfallItems: Array<{ product_id: string; variant_id: string | null; quantity: number }> = []
        for (const it of orderItems) {
          const qty = Math.max(0, Number(it.quantity || 0))
          if (qty <= 0) continue
          if (it.variant_id) {
            const { data: vRow } = await admin
              .from("product_variants")
              .select("stock_reserved")
              .eq("id", it.variant_id)
              .maybeSingle()
            const reserved = Math.max(0, Number(vRow?.stock_reserved || 0))
            if (reserved < qty) {
              shortfallItems.push({ product_id: it.product_id, variant_id: it.variant_id, quantity: qty - reserved })
            }
          } else {
            const { data: pRow } = await admin
              .from("products")
              .select("stock_reserved")
              .eq("id", it.product_id)
              .maybeSingle()
            const reserved = Math.max(0, Number(pRow?.stock_reserved || 0))
            if (reserved < qty) {
              shortfallItems.push({ product_id: it.product_id, variant_id: null, quantity: qty - reserved })
            }
          }
        }

        if (shortfallItems.length > 0) {
          await reserveOrderInventory({
            client: admin,
            partnerId: params.partnerId,
            orderId: order.id,
            items: shortfallItems,
            storeId: order.store_id || null,
          })
        }

        const finalizeRes = await finalizeOrderInventory({
          client: admin,
          partnerId: params.partnerId,
          orderId: order.id,
          createdBy: params.actorUserId || order.created_by || "",
          reason: "Venda de Produtos",
          notes: order.notes || undefined,
          items: orderItems,
          storeId: order.store_id || null,
        })

        if (!("error" in finalizeRes)) {
          await admin
            .from("orders")
            .update({ inventory_deducted: true })
            .eq("id", order.id)
            .eq("partner_id", params.partnerId)
        }
      }

      // 2. Snapshot do estoque físico antes de chamar os ERPs (evita race condition com webhooks)
      const stockSnapshots: Array<{ productId: string; variantId?: string | null; newStock: number }> = []
      for (const it of orderItems) {
        if (it.variant_id) {
          const { data: vRow } = await admin
            .from("product_variants")
            .select("stock_quantity")
            .eq("id", it.variant_id)
            .maybeSingle()
          stockSnapshots.push({
            productId: it.product_id,
            variantId: it.variant_id,
            newStock: Math.max(0, Number(vRow?.stock_quantity || 0)),
          })
        } else {
          const { data: pRow } = await admin
            .from("products")
            .select("stock_quantity")
            .eq("id", it.product_id)
            .maybeSingle()
          stockSnapshots.push({
            productId: it.product_id,
            variantId: null,
            newStock: Math.max(0, Number(pRow?.stock_quantity || 0)),
          })
        }
      }

      // 3. Exporta o pedido (se pendente), atualiza situação para enviado/entregue (lançando estoque no Tiny)
      //    e sincroniza estoque físico nos provedores restantes sem duplicar
      const exportRes = await exportOrderToConnectedErps(order.id)
      const statusRes = !exportRes.exportedProviders.length
        ? await updateOrderStatusOnConnectedErps({ orderId: order.id, situacao: erpSit })
        : { stockHandledProviders: [] as string[] }

      const alreadyHandled = Array.from(
        new Set([...exportRes.syncedStockProviders, ...statusRes.stockHandledProviders])
      )

      if (stockSnapshots.length > 0) {
        await syncItemsStockToConnectedErps({
          partnerId: params.partnerId,
          items: stockSnapshots,
          reason: `Baixa entrega pedido #${order.order_number || order.id}`,
          excludeProviders: alreadyHandled,
        })
      }
    } catch (err) {
      console.error(`[deliveries] Erro ao sincronizar pedido ${order.id} com ERP:`, err)
    }
  }
}

export async function expireOldDuditNetworkRequests(adminClient: any, partnerId?: string) {
  try {
    const cutoffIso = new Date(Date.now() - DUDIT_NETWORK_EXPIRATION_MS).toISOString()
    let query = adminClient
      .from("delivery_assignments")
      .select("id, delivery_id, order_id, assigned_at")
      .in("status", ["available", "requested"])
      .is("driver_id", null)
      .lt("assigned_at", cutoffIso)

    if (partnerId) {
      query = query.eq("partner_id", partnerId)
    }

    const { data: expiredAssignments, error } = await query
    if (error || !expiredAssignments || expiredAssignments.length === 0) return

    const expiredIds = expiredAssignments.map((a: any) => a.id)
    const expiredDeliveryIds = Array.from(new Set(expiredAssignments.map((a: any) => a.delivery_id).filter(Boolean)))

    const nowIso = new Date().toISOString()

    // 1. Mark assignments as cancelled
    await adminClient
      .from("delivery_assignments")
      .update({
        status: "cancelled",
        cancelled_at: nowIso,
        failure_reason: "Tempo limite para aceite na Rede Dudit expirado (15 min)",
        updated_at: nowIso,
      })
      .in("id", expiredIds)

    // 2. Revert deliveries to entrega própria (delivery_person_id: null if it was dudit_network or platform)
    if (expiredDeliveryIds.length > 0) {
      await adminClient
        .from("deliveries")
        .update({
          delivery_person_id: null,
          updated_at: nowIso,
        })
        .in("id", expiredDeliveryIds)
        .or("delivery_person_id.is.null,delivery_person_id.eq.dudit_network,delivery_person_id.eq.platform:dudit_network")
    }
  } catch (err) {
    console.warn("[expireOldDuditNetworkRequests] Error cancelling expired requests:", err)
  }
}

function getDeliveryStatusHumanLabel(status: string): string {
  switch (status) {
    case "pending":
    case "not_sent":
      return "Pendente"
    case "preparing":
      return "Em preparo"
    case "sent":
      return "Saiu para entrega (Em rota)"
    case "delivered":
      return "Entregue"
    case "pickup_available":
      return "Pronto para retirada"
    case "delivery_failed":
      return "Falha na entrega"
    case "cancelled":
      return "Cancelada"
    default:
      return status
  }
}

async function logOrderDeliveryEvent(input: {
  partnerId: string
  actorUserId: string | null
  orderId: string
  actionType: string
  changeLines: string[]
  metadata?: Record<string, unknown> | null
}) {
  try {
    await logAuditEvent({
      partnerId: input.partnerId,
      actorUserId: input.actorUserId,
      entityType: "order",
      entityId: input.orderId,
      actionType: input.actionType,
      changeLines: input.changeLines,
      metadata: input.metadata || null,
      source: "manual",
    })
    await revalidateOrderHistory(input.orderId)
  } catch (err) {
    console.warn("[logOrderDeliveryEvent] error:", err)
  }
}

function resolveDeliveryLimitByPlanSlug(slug: string) {
  const normalized = String(slug || "").toLowerCase()
  if (normalized === "free" || normalized === "crescer") return { blocked: true, maxOrders: 0 as const }
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
  if (raw === "pendente") return "pending"
  if (raw === "em preparação" || raw === "em preparacao") return "preparing"
  if (raw === "saiu para entrega") return "sent"
  if (raw === "concluída" || raw === "concluida") return "delivered"
  if (raw === "cancelada") return "cancelled"
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
  let effectiveRoleId = String(access.roleId || "").toLowerCase()

  // Also respect store-level role override (e.g. store_members.role = 'DELIVERY')
  if (effectiveRoleId !== "delivery" && effectiveRoleId !== "owner") {
    try {
      const { getActiveStoreId } = await import("@/lib/auth/partner-context")
      const activeStoreId = await getActiveStoreId()
      if (activeStoreId) {
        const { resolveEffectivePermissions } = await import("@/lib/store-members")
        const storeEff = await resolveEffectivePermissions(partnerId, activeStoreId)
        if (storeEff && String(storeEff.role || "").toLowerCase() === "delivery") {
          effectiveRoleId = "delivery"
        }
      }
    } catch {
      // Non-fatal fallback to partner-level roleId
    }
  }

  if (effectiveRoleId !== "delivery") {
    return { roleId: effectiveRoleId, partnerUserId: null as string | null, userId: access.userId }
  }

  const admin = getAdminClient()
  const { data: partnerUser } = await admin
    .from("partner_users")
    .select("id")
    .eq("partner_id", partnerId)
    .eq("user_id", access.userId)
    .maybeSingle()

  return {
    roleId: effectiveRoleId,
    partnerUserId: partnerUser?.id ? String(partnerUser.id) : null,
    userId: access.userId,
  }
}

async function isDeliveryAssignedToDriver(params: {
  deliveryId: string
  deliveryPersonId: string | null | undefined
  actor: { roleId: string; partnerUserId: string | null; userId: string }
}): Promise<boolean> {
  if (String(params.actor.roleId || "").toLowerCase() !== "delivery") return true

  const pUserId = params.actor.partnerUserId
  const uId = params.actor.userId
  const personId = String(params.deliveryPersonId || "").trim()

  if (pUserId && personId === pUserId) return true
  if (uId && personId === uId) return true

  // If the delivery is explicitly assigned to ANOTHER store driver, never allow access
  if (
    personId &&
    personId !== "dudit_network" &&
    personId !== "platform:dudit_network"
  ) {
    return false
  }

  const admin = getAdminClient()
  const { data: assignment } = await admin
    .from("delivery_assignments")
    .select("id")
    .eq("delivery_id", params.deliveryId)
    .eq("driver_id", uId)
    .in("status", ["assigned", "accepted", "picked_up", "out_for_delivery", "delivered"])
    .limit(1)
    .maybeSingle()

  return !!assignment?.id
}

async function getPartnerUserNameByIdMap(
  _supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  partnerId: string,
  partnerUserIds: string[],
) {
  const uniqueIds = Array.from(new Set((partnerUserIds || []).filter(Boolean)))
  if (uniqueIds.length === 0) return new Map<string, string>()

  const admin = getAdminClient()
  const [{ data: partnerUsers }, { data: partnerUsersByUserId }] = await Promise.all([
    admin
      .from("partner_users")
      .select("id, user_id")
      .eq("partner_id", partnerId)
      .in("id", uniqueIds),
    admin
      .from("partner_users")
      .select("id, user_id")
      .eq("partner_id", partnerId)
      .in("user_id", uniqueIds),
  ])

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
    nameByPartnerUserId.set(id, nameByUserId.get(userId) || nameByPartnerUserId.get(id) || "Entregador")
  }

  return nameByPartnerUserId
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
      await params.supabase
        .from("address_coordinates_cache")
        .update({ last_accessed_at: new Date().toISOString() })
        .eq("partner_id", params.partnerId)
        .eq("address_text", normalized)

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
          last_accessed_at: new Date().toISOString(),
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
        distance_km,
        estimated_duration_minutes,
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

  const distanceKm = delivery.distance_km != null ? Number(delivery.distance_km) : null
  let estimatedHours: number | null = null
  if (delivery.estimated_duration_minutes != null) {
    const mins = Number(delivery.estimated_duration_minutes)
    if (!Number.isNaN(mins)) {
      estimatedHours = Math.round((mins / 60) * 2) / 2
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
      orderLabel: orderItem?.order_number || `#${String(params.orderId).slice(0, 8).toUpperCase()}`,
      distanceKm,
      estimatedHours,
    },
  }
}

async function computeDrivingRouteMetrics(
  origin: { lat: number; lng: number } | null,
  destinations: Array<{ lat: number; lng: number }>,
): Promise<{ distanceKm: number; durationMinutes: number } | null> {
  const waypoints: Array<{ lat: number; lng: number }> = []
  if (origin && Number.isFinite(origin.lat) && Number.isFinite(origin.lng)) {
    waypoints.push(origin)
  }
  for (const pt of destinations) {
    if (pt && Number.isFinite(pt.lat) && Number.isFinite(pt.lng)) {
      waypoints.push(pt)
    }
  }
  if (waypoints.length < 2) return null

  const rawToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN
  const token = rawToken ? rawToken.replace(/['"]/g, "").trim() : ""

  if (token) {
    try {
      const coordsString = waypoints.slice(0, 25).map((p) => `${p.lng},${p.lat}`).join(";")
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordsString}?overview=false&access_token=${token}`
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 1500)
      try {
        const res = await fetch(url, { signal: controller.signal })
        if (res.ok) {
          const data = await res.json()
          const r = data?.routes?.[0]
          if (data?.code === "Ok" && r && typeof r.distance === "number" && typeof r.duration === "number") {
            const extraStopMins = Math.max(0, destinations.length - 1) * 3
            return {
              distanceKm: Number((r.distance / 1000).toFixed(1)),
              durationMinutes: Math.max(1, Math.round(r.duration / 60) + extraStopMins),
            }
          }
        }
      } finally {
        clearTimeout(timer)
      }
    } catch {
      // Fallback to haversine approximation below
    }
  }

  let straightKm = 0
  for (let i = 1; i < waypoints.length; i++) {
    straightKm += calculateDistance(waypoints[i - 1], waypoints[i])
  }
  // Approximate urban road factor (1.3x straight line) and ~25 km/h urban speed
  const roadKm = Number((straightKm * 1.3).toFixed(1))
  const travelMins = Math.max(1, Math.round((roadKm / 25) * 60))
  const extraStopMins = Math.max(0, destinations.length - 1) * 3
  return {
    distanceKm: roadKm,
    durationMinutes: travelMins + extraStopMins,
  }
}

export async function getDeliveryRoutePointsAction(params: { partnerId: string; deliveryId: string }) {
  const user = await requireUser()
  const actor = await getDeliveryActorScope(params.partnerId)
  await requirePartnerRouteAccess(params.partnerId, "logistics", { specificPermission: "can_view_delivery_details" })
  const admin = getAdminClient()

  const { data: delivery, error } = await admin
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
    const isAssigned = await isDeliveryAssignedToDriver({
      deliveryId: params.deliveryId,
      deliveryPersonId: delivery.delivery_person_id,
      actor,
    })
    if (!isAssigned) {
      return { success: false as const, error: "Sem permissão para visualizar esta entrega." }
    }
  }

  const { data: store } = await admin
    .from("stores")
    .select("id, name, addresses!store_id(street, number, complement, neighborhood, city, state, zip_code, latitude, longitude)")
    .eq("partner_id", params.partnerId)
    .order("is_headquarters", { ascending: false })
    .limit(1)
    .maybeSingle()
  const addr = Array.isArray(store?.addresses) ? store.addresses[0] : null
  let origin = addr?.latitude && addr?.longitude
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

  if (!origin && addr) {
    const storeAddress = [
      [addr.street, addr.number].filter(Boolean).join(", "),
      addr.neighborhood,
      [addr.city, addr.state].filter(Boolean).join(" - "),
      addr.zip_code,
    ].filter(Boolean).join(", ")
    if (storeAddress) {
      const storeCoords = await getOrCreateCachedCoords({ supabase: admin, partnerId: params.partnerId, addressText: storeAddress })
      if (storeCoords) {
        origin = {
          lat: storeCoords.lat,
          lng: storeCoords.lng,
          name: store?.name || "Loja",
          address: storeAddress,
        }
      }
    }
  }

  const originCityState = addr?.city && addr?.state ? `${addr.city}, ${addr.state}` : null

  const links = Array.isArray((delivery as any).delivery_orders) ? (delivery as any).delivery_orders : []
  const sorted = [...links].sort((a: any, b: any) => Number(a.position || 9999) - Number(b.position || 9999))

  const points = await Promise.all(
    sorted.map(async (link: any) => {
      const order = link?.orders || {}
      const address = formatAddress(order)
      if (!address) return null

      let addressToGeocode = address
      if (originCityState && !address.toLowerCase().includes(originCityState.toLowerCase())) {
        addressToGeocode = `${address}, ${originCityState}`
      }

      let coords = await getOrCreateCachedCoords({ supabase: admin, partnerId: params.partnerId, addressText: addressToGeocode })
      if (!coords && addressToGeocode !== address) {
        coords = await getOrCreateCachedCoords({ supabase: admin, partnerId: params.partnerId, addressText: address })
      }
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

  // Calculate cumulative multi-stop route distance and duration across all points (Mapbox Directions with fallback)
  const routeMetrics = await computeDrivingRouteMetrics(
    origin ? { lat: origin.lat, lng: origin.lng } : null,
    cleaned.map((pt) => ({ lat: pt.latitude, lng: pt.longitude })),
  )
  const totalDistanceKm = routeMetrics?.distanceKm ?? 0
  const totalEstimatedDurationMinutes = routeMetrics?.durationMinutes ?? 0

  return {
    success: true as const,
    data: {
      deliveryId: params.deliveryId,
      deliveryNumber: (delivery as any).delivery_number ?? null,
      points: cleaned,
      origin,
      totalDistanceKm,
      totalEstimatedDurationMinutes,
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

// Pedidos vinculados a transportadora (SuperFrete) não entram no fluxo de
// entregas próprias: já têm etiqueta/rotas pelo transportador.
function isCarrierBoundOrder(order: any): boolean {
  if (order?.delivery_breakdown?.source === "superfrete") return true
  const shipments = Array.isArray(order?.order_shipments) ? order.order_shipments : []
  return shipments.some((s: any) => s && s.kind !== "return")
}

export async function getSmartDeliverySuggestionsAction(input: {
  partnerId: string
  maxOrdersPerDelivery?: number
}) {
  await requireUser()
  await requirePartnerRouteAccess(input.partnerId, "logistics", { specificPermission: "can_create_deliveries" })
  const actor = await getDeliveryActorScope(input.partnerId)
  const deliveryCreateCheck = await checkPermission(input.partnerId, "delivery", "create")
  if (!deliveryCreateCheck.allowed) {
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
      delivery_breakdown,
      order_shipments(id, kind),
      order_items(
        id,
        product_name,
        product_price,
        quantity,
        subtotal,
        product_id,
        variant_id,
        service_id,
        products(id, name, sku, images, unit, product_type),
        product_variants(id, variant_name, sku, variant_options),
        services(id, name, images)
      )
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
      if (isCarrierBoundOrder(o)) return false
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
  const orderListCheck = await checkPermission(partnerId, "orders", "list")
  if (!orderListCheck.allowed) return []
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
      paid_amount,
      delivery_fee,
      distance_km,
      delivery_breakdown,
      customer_name,
      buyer_id,
      delivery_address,
      situation,
      payment_method,
      payment_breakdown,
      delivery_status,
      created_at,
      order_source,
      delivery_type,
      order_shipments(id, kind),
      order_items(
        id,
        product_name,
        product_price,
        quantity,
        subtotal,
        product_id,
        variant_id,
        service_id,
        products(id, name, sku, images, unit, product_type),
        product_variants(id, variant_name, sku, variant_options),
        services(id, name, images)
      )
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

      // Transportadora: já é tratado pelo fluxo do transportador, não gera
      // entrega própria
      if (isCarrierBoundOrder(order)) return false

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
      paymentStatus: order.situation || "pending",
      paymentMethod: order.payment_method || null,
      payment_method: order.payment_method || null,
      paymentBreakdown: order.payment_breakdown || null,
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
      items: (order.order_items || []).map((item: any) => {
        const sku = item.product_variants?.sku || item.products?.sku || "N/A"
        const images = item.product_variants?.variant_options?.image || item.products?.images || item.services?.images || null
        const unit = item.products?.unit || "un"
        const price = Number(item.product_price || 0)
        const qty = Number(item.quantity || 1)
        const subtotal = Number(item.subtotal || price * qty)
        return {
          ...item,
          sku,
          images,
          unit,
          product_price: price,
          price,
          subtotal,
          products: {
            sku,
            images,
            unit,
            product_type: item.products?.product_type || (item.service_id ? "servico" : "produto"),
          },
        }
      }),
      alreadyInActiveDelivery: activeOrderIds.has(order.id),
    }))
}

export async function fetchDeliveryOrdersByIdsAction(
  partnerId: string,
  orderIds: string[],
  excludeDeliveryId?: string,
) {
  const uniqueIds = Array.from(new Set((orderIds || []).map((id) => String(id).trim()).filter(Boolean)))
  if (uniqueIds.length === 0) return []

  await requireUser()
  await requireActivePartnerContext(partnerId)
  const actor = await getDeliveryActorScope(partnerId)
  if (actor.roleId === "delivery") return []
  const orderListCheck = await checkPermission(partnerId, "orders", "list")
  if (!orderListCheck.allowed) return []
  const planCheck = await enforceDeliveryPlanAccess(partnerId, 1)
  if (!planCheck.allowed) return []

  const supabase = await getSupabaseServerClient()

  let activeOrdersQuery = supabase
    .from("delivery_orders")
    .select("order_id, deliveries!inner(id,partner_id,status)")
    .eq("deliveries.partner_id", partnerId)
    .in("order_id", uniqueIds)
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
      paid_amount,
      delivery_fee,
      distance_km,
      delivery_breakdown,
      customer_name,
      buyer_id,
      delivery_address,
      situation,
      payment_method,
      payment_breakdown,
      delivery_status,
      created_at,
      order_source,
      delivery_type,
      notes,
      order_shipments(id, kind),
      order_items(
        id,
        product_name,
        product_price,
        quantity,
        subtotal,
        product_id,
        variant_id,
        service_id,
        products(id, name, sku, images, unit, product_type),
        product_variants(id, variant_name, sku, variant_options),
        services(id, name, images)
      )
    `)
    .eq("partner_id", partnerId)
    .in("id", uniqueIds)

  const [{ data: activeDeliveryOrders }, { data, error }] = await Promise.all([
    activeOrdersQuery,
    ordersQuery,
  ])

  if (error || !data || data.length === 0) return []

  const activeOrderIds = new Set((activeDeliveryOrders || []).map((row: any) => row.order_id))
  const buyerIds = Array.from(new Set(data.map((order: any) => order.buyer_id).filter(Boolean)))

  const customerMap = new Map<string, any>()
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

  return data.map((order: any) => ({
    id: order.id,
    displayId: order.order_number || `#${String(order.id).slice(0, 8).toUpperCase()}`,
    orderNumber: order.order_number || null,
    status: order.situation || "pending",
    paymentStatus: order.situation || "pending",
    paymentMethod: order.payment_method || null,
    payment_method: order.payment_method || null,
    paymentBreakdown: order.payment_breakdown || null,
    deliveryStatus: order.delivery_status || "not_sent",
    deliveryType: order.delivery_type || "delivery",
    totalAmount: Number(order.total_amount || 0),
    shippingFee: Number(order.delivery_fee || 0),
    deliveryFee: Number(order.delivery_fee || 0),
    distanceKm: order.distance_km == null ? null : Number(order.distance_km),
    deliveryBreakdown: order.delivery_breakdown || null,
    orderDate: order.created_at || null,
    notes: order.notes || null,
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
    items: (order.order_items || []).map((item: any) => {
      const sku = item.product_variants?.sku || item.products?.sku || "N/A"
      const images = item.product_variants?.variant_options?.image || item.products?.images || item.services?.images || null
      const unit = item.products?.unit || "un"
      const price = Number(item.product_price || 0)
      const qty = Number(item.quantity || 1)
      const subtotal = Number(item.subtotal || price * qty)
      return {
        ...item,
        sku,
        images,
        unit,
        product_price: price,
        price,
        subtotal,
        products: {
          sku,
          images,
          unit,
          product_type: item.products?.product_type || (item.service_id ? "servico" : "produto"),
        },
      }
    }),
    alreadyInActiveDelivery: activeOrderIds.has(order.id),
  }))
}

async function geocodeWithTimeout(address: string, timeoutMs = 600): Promise<{ lat: number; lng: number } | null> {
  if (!address || !address.trim()) return null
  return Promise.race([
    geocodeAddress(address),
    new Promise<{ lat: number; lng: number } | null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]).catch(() => null)
}

export async function fetchDeliveryPeopleBucketAction(partnerId: string) {
  await requireUser()
  const actor = await getDeliveryActorScope(partnerId)
  if (actor.roleId === "delivery") return []
  const teamCheck = await checkPermission(partnerId, "settings", "settings_team")
  if (!teamCheck.allowed) return []

  return getCachedErpPage(
    ["erp-delivery-people-bucket", partnerId],
    [TAGS.partner(partnerId)],
    async () => {
      const admin = getAdminClient()

      // 1. Fetch team members with delivery role
      const { data: partnerUsers, error } = await admin
        .from("partner_users")
        .select("id, role_id, role, user_id")
        .eq("partner_id", partnerId)
        .or("role_id.ilike.delivery,role.ilike.delivery,role_id.eq.delivery,role_id.eq.DELIVERY,role.eq.DELIVERY,role.eq.delivery")
        .order("created_at", { ascending: true })

      if (error) {
        console.error("[fetchDeliveryPeopleBucketAction] partner_users error:", error)
      }

      // 2. Fetch linked partner delivery drivers
      const { data: linkedDrivers, error: linkedError } = await admin
        .from("delivery_driver_partners")
        .select("driver_id")
        .eq("partner_id", partnerId)
        .eq("is_active", true)

      if (linkedError) {
        console.error("[fetchDeliveryPeopleBucketAction] linkedDrivers error:", linkedError)
      }

      const teamUserIds = (partnerUsers || []).map((m: any) => m.user_id).filter(Boolean)
      const linkedDriverUserIds = (linkedDrivers || []).map((l: any) => l.driver_id).filter(Boolean)
      const allUserIds = Array.from(new Set([...teamUserIds, ...linkedDriverUserIds]))

      if (allUserIds.length === 0) return []

      const nameByUserId = new Map<string, string>()
      const emailByUserId = new Map<string, string>()

      // Query user_profiles and delivery_drivers in parallel first
      const [{ data: profiles }, { data: driversData }] = await Promise.all([
        admin.from("user_profiles").select("user_id, full_name").in("user_id", allUserIds),
        linkedDriverUserIds.length > 0
          ? admin.from("delivery_drivers").select("user_id, vehicle_type").in("user_id", linkedDriverUserIds)
          : Promise.resolve({ data: [] }),
      ])

      for (const p of profiles || []) {
        if (p?.full_name && typeof p.full_name === "string" && p.full_name.trim()) {
          nameByUserId.set(p.user_id, p.full_name.trim())
        }
      }

      // Only call Auth API for users missing names (to get email as fallback)
      const missingNameUserIds = allUserIds.filter((uid) => !nameByUserId.has(uid))
      if (missingNameUserIds.length > 0) {
        const userResults = await Promise.allSettled(
          missingNameUserIds.map((uid: string) => admin.auth.admin.getUserById(uid))
        )
        for (let i = 0; i < missingNameUserIds.length; i++) {
          const res = userResults[i]
          if (res.status === "fulfilled" && res.value.data?.user) {
            const u = res.value.data.user
            if (u.email) emailByUserId.set(missingNameUserIds[i], u.email)
            const meta = u.user_metadata || {}
            const metaName = meta.full_name || meta.name || meta.display_name
            if (metaName && typeof metaName === "string" && metaName.trim()) {
              nameByUserId.set(missingNameUserIds[i], metaName.trim())
            }
          }
        }
      }

      const vehicleByUserId = new Map<string, string>()
      for (const d of driversData || []) {
        if (d?.user_id && d?.vehicle_type) {
          vehicleByUserId.set(d.user_id, d.vehicle_type)
        }
      }

      const formatEmailAsName = (email?: string): string => {
        if (!email) return "Entregador"
        const username = email.split("@")[0] || ""
        return username
          .replace(/[._-]/g, " ")
          .split(" ")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(" ")
      }

      const teamList = (partnerUsers || []).map((member: any) => {
        const resolvedName = nameByUserId.get(String(member.user_id)) || formatEmailAsName(emailByUserId.get(String(member.user_id)))
        return {
          id: member.id,
          userId: member.user_id,
          fullName: resolvedName,
          source: "legacy" as const,
        }
      })

      const linkedList = (linkedDrivers || []).map((link: any) => {
        const driverUid = String(link.driver_id)
        const resolvedName = nameByUserId.get(driverUid) || formatEmailAsName(emailByUserId.get(driverUid))
        return {
          id: `platform:${driverUid}`,
          userId: driverUid,
          fullName: resolvedName,
          vehicleType: vehicleByUserId.get(driverUid),
          source: "platform" as const,
        }
      })

      return [...teamList, ...linkedList]
    },
    30,
  )
}

export async function getERPDeliveryPlanAccessAction(partnerId: string) {
    await requireUser()
    const actor = await getDeliveryActorScope(partnerId)
    const deliverySettingsCheck = await checkPermission(partnerId, "settings", "settings_delivery")
    if (!deliverySettingsCheck.allowed) {
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
    const deliveryCreateCheck = await checkPermission(payload.partnerId, "delivery", "create")
    if (!deliveryCreateCheck.allowed) {
      return { success: false as const, error: "Sem permissão para criar entregas." }
    }
    const supabase = await getSupabaseServerClient()

    const orderIds = Array.from(new Set(payload.orderIds || [])).filter(Boolean)
    if (orderIds.length === 0) return { success: false as const, error: "Selecione ao menos um pedido válido." }
    const planCheck = await enforceDeliveryPlanAccess(payload.partnerId, orderIds.length)
    if (!planCheck.allowed) return { success: false as const, error: planCheck.error }

    const { data: selectedOrders, error: orderError } = await supabase
      .from("orders")
      .select("id, partner_id, delivery_fee, total_amount, delivery_address, buyer_id, delivery_breakdown, order_shipments(id, kind)")
      .in("id", orderIds)
      .eq("partner_id", payload.partnerId)
      .order("created_at", { ascending: false })

    if (orderError || !selectedOrders || selectedOrders.length !== orderIds.length) {
      return { success: false as const, error: "Um ou mais pedidos não foram encontrados para esta loja." }
    }

    if ((selectedOrders || []).some((ord: any) => isCarrierBoundOrder(ord))) {
      return { success: false as const, error: "Pedidos com transportadora não entram no fluxo de entrega própria." }
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

    const orderAddresses = (selectedOrders || []).map((o: any) => formatAddress(o)).filter(Boolean)

    let distanceKm: number | null = null
    let estimatedDurationMinutes: number | null = null

    if (orderAddresses.length > 0) {
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

        const [originCoords, ...destCoordsList] = await Promise.all([
          geocodeWithTimeout(originAddress),
          ...orderAddresses.map((addr: string) => geocodeWithTimeout(addr)),
        ])

        const validCoords = destCoordsList.filter(Boolean) as { lat: number; lng: number }[]

        if (originCoords && validCoords.length > 0) {
          const metrics = await computeDrivingRouteMetrics(originCoords, validCoords)
          if (metrics) {
            distanceKm = metrics.distanceKm
            estimatedDurationMinutes = metrics.durationMinutes
          }
        }
      } catch (err) {
        console.warn("[createERPDeliveryAction] geocoding/route failed, proceeding without estimates:", err)
      }
    }

    const status = normalizeDeliveryStatus(payload.status)
    const startedAt = payload.startedAt?.trim() ? payload.startedAt : null
    const nowIso = new Date().toISOString()
    const terminalAt = startedAt || nowIso

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
      finalDeliveryId = prevDeliveryIds[0]

      const primaryPrev = (previousPendingLinks || []).find((l: any) => String(l.delivery_id) === finalDeliveryId)
      deliveryNumber = (primaryPrev as any)?.deliveries?.delivery_number ?? null

      const updatePayload: Record<string, unknown> = {
        delivery_person_id: payload.deliveryPersonId || null,
        status,
        distance_km: distanceKm,
        estimated_duration_minutes: estimatedDurationMinutes,
        started_at: startedAt,
        departure_time: startedAt,
        delivered_at: status === "delivered" ? terminalAt : null,
        completed_at: ["delivered", "cancelled", "delivery_failed"].includes(status) ? terminalAt : null,
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

      await getAdminClient().from("delivery_orders").delete().eq("delivery_id", finalDeliveryId)

      if (prevDeliveryIds.length > 1) {
        const otherIds = prevDeliveryIds.slice(1)
        await getAdminClient().from("delivery_orders").delete().in("delivery_id", otherIds)
        await supabase.from("deliveries").delete().in("id", otherIds).eq("partner_id", payload.partnerId)
      }
    } else {
      deliveryNumber = await allocatePartnerDeliveryNumber(supabase, payload.partnerId)

      const insertPayload: Record<string, unknown> = {
        partner_id: payload.partnerId,
        delivery_person_id: payload.deliveryPersonId || null,
        status,
        distance_km: distanceKm,
        estimated_duration_minutes: estimatedDurationMinutes,
        started_at: startedAt,
        departure_time: startedAt,
        delivered_at: status === "delivered" ? terminalAt : null,
        completed_at: ["delivered", "cancelled", "delivery_failed"].includes(status) ? terminalAt : null,
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

    const isPlatformRequest = payload.deliveryPersonId === "platform:dudit_network" || payload.deliveryPersonId === "dudit_network" || payload.platformDriverId === "dudit_network"
    const hasPlatformDriver = isPlatformRequest || !!payload.platformDriverId

    if (isPlatformRequest) {
      await getAdminClient()
        .from("delivery_assignments")
        .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
        .in("order_id", orderIds)
        .in("status", ["available", "requested", "assigned"])

      const assignmentRows = (selectedOrders || []).map((ord: any) => ({
        order_id: ord.id,
        delivery_id: finalDeliveryId,
        partner_id: payload.partnerId,
        driver_id: null,
        assigned_by: user?.id || null,
        status: "available",
        delivery_fee: Number(ord.delivery_fee || 0),
        notes: sanitizeNotes(payload.notes),
        assigned_at: new Date().toISOString(),
      }))

      if (assignmentRows.length > 0) {
        await getAdminClient().from("delivery_assignments").insert(assignmentRows)
      }
    } else if (!hasPlatformDriver) {
      // Se for entrega própria / equipe / outro entregador, CANCELA qualquer solicitação de plataforma pendente
      await getAdminClient()
        .from("delivery_assignments")
        .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
        .or(`delivery_id.eq.${finalDeliveryId},order_id.in.(${orderIds.join(",")})`)
        .in("status", ["available", "requested", "assigned"])
    }

    // Insert ordered delivery links
    const linkRows = orderIds.map((orderId, idx) => ({
      delivery_id: finalDeliveryId,
      order_id: orderId,
      position: idx + 1,
      status,
      delivered_at: status === "delivered" ? terminalAt : null,
    }))

    const { error: linkError } = await getAdminClient().from("delivery_orders").insert(linkRows)
    if (linkError) {
      if (prevDeliveryIds.length === 0) {
        await supabase.from("deliveries").delete().eq("id", finalDeliveryId).eq("partner_id", payload.partnerId)
      }
      return { success: false as const, error: linkError.message }
    }

    // Order-level timestamps & delivery_status (best-effort; do not block)
    try {
      const orderPatch: Record<string, unknown> = {
        delivery_status: status === "pending" ? "not_sent" : status,
      }
      if (status === "sent" && startedAt) {
        orderPatch.delivery_departure_at = startedAt
      }
      if (status === "delivered") {
        orderPatch.delivery_departure_at = startedAt
        orderPatch.delivery_arrived_at = terminalAt
        orderPatch.delivery_completed_at = terminalAt
      }
      await supabase.from("orders").update(orderPatch).in("id", orderIds).eq("partner_id", payload.partnerId)
    } catch (err) {
      console.warn("[createERPDeliveryAction] order timestamps patch failed:", err)
    }

    if (status === "sent" || status === "delivered") {
      void syncDeliveredOrdersToErps({
        partnerId: payload.partnerId,
        orderIds,
        nextStatus: status,
        actorUserId: user?.id || null,
      }).catch(() => {})
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

    revalidateDeliveryDashboard(payload.partnerId, finalDeliveryId)
    return { success: true as const, deliveryId: finalDeliveryId }
  }

  export async function getERPDeliveriesPageAction(
    partnerId: string,
    options?: {
      cursor?: ERPDeliveryListCursor | null
      limit?: number
      statusGroup?: ERPDeliveryListStatusGroup
    }
  ): Promise<
    | {
      success: true
      items: any[]
      nextCursor: ERPDeliveryListCursor | null
      hasMore: boolean
      userRole?: string
      planSlug?: string
      planGate?: { requiredPlanSlug: "crescer" | "escalar"; message: string }
    }
    | { success: false; error: string }
  > {
    try {
      const [user, actor, planCheck] = await Promise.all([
        requireUser(),
        getDeliveryActorScope(partnerId),
        enforceDeliveryPlanAccess(partnerId, 1),
      ])
      const planSlug = String(planCheck.planSlug || "free")
      if (!planCheck.allowed) {
        const slug = planSlug.toLowerCase()
        // Plano Free: página deve carregar com CTA de upgrade (evita AccessDenied enganoso).
        if (slug === "free") {
          return {
            success: true,
            items: [],
            nextCursor: null,
            hasMore: false,
            planGate: { requiredPlanSlug: "crescer", message: planCheck.error },
            userRole: actor.roleId,
            planSlug,
          }
        }
        return { success: false, error: planCheck.error }
      }
      const supabase = await getSupabaseServerClient()
      await expireOldDuditNetworkRequests(getAdminClient(), partnerId)

      const cursor = options?.cursor ?? null
      const limit = Math.max(1, Math.min(250, Math.floor(Number(options?.limit || DEFAULT_PAGE_SIZE))))
      const statusGroup = options?.statusGroup
      const fetchLimit = limit + 1

      if (actor.roleId === "delivery") {
        const result = await fetchDeliveriesUncached(partnerId, user, actor, cursor, limit, supabase, statusGroup)
        return { ...result, userRole: actor.roleId, planSlug }
      }

      const result = await getCachedErpPage(
        [
          "erp-deliveries-page",
          partnerId,
          actor.roleId,
          cursor ? `${cursor.createdAt}:${cursor.id}` : "first",
          String(limit),
          statusGroup || "all",
        ],
        [TAGS.deliveries(partnerId)],
        async () => {
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
            departure_time,
            delivered_at,
            completed_at,
            created_at,
            notes,
            delivery_orders(
              order_id,
              position,
              status,
              delivered_at,
              orders(id, order_number, customer_name, total_amount, delivery_fee, delivery_address, buyer_id, order_source, delivery_status, situation, delivery_breakdown, order_shipments(id, kind))
            )
          `)
            .eq("partner_id", partnerId)

          if (statusGroup === "closed") {
            q = q.in("status", [...ERP_DELIVERY_CLOSED_TAB_STATUSES])
          } else if (statusGroup === "active") {
            q = q.not("status", "in", "(cancelled,delivery_failed)")
          }

          if (cursor) q = q.or(buildKeysetFilter(cursor))

          const { data, error } = await q
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .limit(fetchLimit)

          if (error) throw error
          const rows = (data || []).filter((row: any) => {
            const links = Array.isArray(row.delivery_orders) ? row.delivery_orders : []
            return !links.some((link: any) => isCarrierBoundOrder(link?.orders))
          })

          const deliveryPersonIds = rows.map((row: any) => String(row.delivery_person_id || "")).filter(Boolean)
          const deliveryIds = rows.map((r: any) => r.id).filter(Boolean)
          const platformAssignmentsByDeliveryId = new Map<string, any>()
          const platformDriverUserIds = new Set<string>()

          const [deliveryPersonNameById, assignments] = await Promise.all([
            getPartnerUserNameByIdMap(supabase, partnerId, deliveryPersonIds),
            deliveryIds.length > 0
              ? getAdminClient()
                .from("delivery_assignments")
                .select("id, delivery_id, order_id, driver_id, status, assigned_at, accepted_at, picked_up_at, out_for_delivery_at")
                .in("delivery_id", deliveryIds)
                .in("status", ["available", "requested", "assigned", "accepted", "picked_up", "out_for_delivery", "delivered"])
                .order("assigned_at", { ascending: false })
                .then((res: any) => res.data || [])
              : Promise.resolve([] as any[]),
          ])

          const nowMs = Date.now()
          for (const ass of assignments) {
            if (ass.delivery_id && !platformAssignmentsByDeliveryId.has(ass.delivery_id)) {
              const isPendingExpired = !ass.driver_id && ["available", "requested"].includes(ass.status) && (
                !ass.assigned_at || (nowMs - new Date(ass.assigned_at).getTime() > DUDIT_NETWORK_EXPIRATION_MS)
              )
              if (!isPendingExpired) {
                platformAssignmentsByDeliveryId.set(ass.delivery_id, ass)
                if (ass.driver_id) platformDriverUserIds.add(String(ass.driver_id))
              }
            }
          }

          for (const row of rows) {
            if (row.delivery_person_id && !deliveryPersonNameById.has(String(row.delivery_person_id))) {
              if (row.delivery_person_id !== "dudit_network" && row.delivery_person_id !== "platform:dudit_network") {
                platformDriverUserIds.add(String(row.delivery_person_id))
              }
            }
          }

          let driverProfileMap = new Map<string, any>()
          if (platformDriverUserIds.size > 0) {
            const driverIdsArray = Array.from(platformDriverUserIds)
            const [{ data: profiles }, { data: driverRows }] = await Promise.all([
              getAdminClient().from("user_profiles").select("user_id, full_name, phone").in("user_id", driverIdsArray),
              getAdminClient().from("delivery_drivers").select("user_id, vehicle_type, vehicle_plate, city").in("user_id", driverIdsArray),
            ])

            const driverInfoByUserId = new Map<string, any>()
            for (const dRow of driverRows || []) {
              if (dRow?.user_id) driverInfoByUserId.set(String(dRow.user_id), dRow)
            }

            for (const prof of profiles || []) {
              if (!prof?.user_id) continue
              const dInfo = driverInfoByUserId.get(String(prof.user_id))
              driverProfileMap.set(String(prof.user_id), {
                id: String(prof.user_id),
                fullName: prof.full_name || "Entregador Dudit",
                phone: prof.phone || null,
                avatarUrl: null,
                vehicleType: dInfo?.vehicle_type === "moto" ? "Moto" : dInfo?.vehicle_type === "carro" ? "Carro" : (dInfo?.vehicle_type || null),
                vehiclePlate: dInfo?.vehicle_plate || null,
                city: dInfo?.city || null,
              })
            }
          }

          const hasMore = rows.length > limit
          const items = (hasMore ? rows.slice(0, limit) : rows).map((row: any) => {
            const pAss = platformAssignmentsByDeliveryId.get(row.id)
            let isPlatformDriver = false
            let platformDriver: any = null
            let driverName: string | null = null

            if (pAss) {
              isPlatformDriver = true
              if (pAss.driver_id) {
                const pInfo = driverProfileMap.get(String(pAss.driver_id))
                platformDriver = {
                  id: String(pAss.driver_id),
                  fullName: pInfo?.fullName || "Entregador Dudit",
                  phone: pInfo?.phone || null,
                  avatarUrl: pInfo?.avatarUrl || null,
                  vehicleType: pInfo?.vehicleType || null,
                  vehiclePlate: pInfo?.vehiclePlate || null,
                  city: pInfo?.city || null,
                  status: pAss.status,
                  isPlatformDriver: true,
                  isPendingAcceptance: false,
                }
                driverName = pInfo?.vehicleType ? `${platformDriver.fullName} (${pInfo.vehicleType})` : platformDriver.fullName
              } else {
                platformDriver = {
                  id: "dudit_network",
                  fullName: "Rede de Entregadores Dudit",
                  status: pAss.status,
                  isPlatformDriver: true,
                  isPendingAcceptance: true,
                }
                driverName = "Rede de Entregadores (Aguardando aceite)"
              }
            } else if (row.delivery_person_id && driverProfileMap.has(String(row.delivery_person_id))) {
              const pInfo = driverProfileMap.get(String(row.delivery_person_id))
              isPlatformDriver = true
              platformDriver = {
                id: String(row.delivery_person_id),
                fullName: pInfo?.fullName || "Entregador Dudit",
                phone: pInfo?.phone || null,
                avatarUrl: pInfo?.avatarUrl || null,
                vehicleType: pInfo?.vehicleType || null,
                vehiclePlate: pInfo?.vehiclePlate || null,
                city: pInfo?.city || null,
                status: "accepted",
                isPlatformDriver: true,
                isPendingAcceptance: false,
              }
              driverName = pInfo?.vehicleType ? `${platformDriver.fullName} (${pInfo.vehicleType})` : platformDriver.fullName
            } else if (row.delivery_person_id && row.delivery_person_id !== "dudit_network" && row.delivery_person_id !== "platform:dudit_network") {
              driverName = deliveryPersonNameById.get(String(row.delivery_person_id)) || "Entregador"
            }

            const cleanDeliveryPersonId = (row.delivery_person_id === "dudit_network" || row.delivery_person_id === "platform:dudit_network")
              ? (pAss ? row.delivery_person_id : null)
              : row.delivery_person_id

            return {
              ...row,
              delivery_person_id: cleanDeliveryPersonId,
              is_platform_driver: isPlatformDriver,
              platform_driver: platformDriver,
              delivery_person_name: driverName,
              partner_users: driverName
                ? { id: cleanDeliveryPersonId, user_profiles: { full_name: driverName } }
                : null,
            }
          })
          const last = items[items.length - 1]
          const nextCursor = hasMore && last?.created_at && last?.id
            ? { createdAt: String(last.created_at), id: String(last.id) }
            : null

          return { items, nextCursor, hasMore }
        },
        30,
      )

      return { ...result, success: true as const, userRole: actor.roleId, planSlug }
    } catch (e: any) {
      return { success: false, error: e?.message || "Erro ao carregar entregas." }
    }
  }

  async function fetchDeliveriesUncached(
    partnerId: string,
    user: { id: string },
    actor: { roleId: string; partnerUserId?: string | null },
    cursor: ERPDeliveryListCursor | null,
    limit: number,
    supabase: any,
    statusGroup?: ERPDeliveryListStatusGroup,
  ) {
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
      departure_time,
      delivered_at,
      completed_at,
      created_at,
      notes,
      delivery_orders(
        order_id,
        position,
        status,
        delivered_at,
        orders(id, order_number, customer_name, total_amount, delivery_fee, delivery_address, buyer_id, order_source, delivery_status, situation, delivery_breakdown, order_shipments(id, kind))
      )
    `)
      .eq("partner_id", partnerId)

    if (statusGroup === "closed") {
      q = q.in("status", [...ERP_DELIVERY_CLOSED_TAB_STATUSES])
    } else if (statusGroup === "active") {
      q = q.not("status", "in", "(cancelled,delivery_failed)")
    }

    const pUserId = actor.partnerUserId
    const uId = user.id

    const { data: driverAssignments } = await getAdminClient()
      .from("delivery_assignments")
      .select("delivery_id")
      .eq("partner_id", partnerId)
      .eq("driver_id", uId)
      .in("status", ["assigned", "accepted", "picked_up", "out_for_delivery", "delivered"])
      .not("delivery_id", "is", null)

    const assignedDeliveryIds = Array.from(
      new Set((driverAssignments || []).map((a: any) => String(a.delivery_id)).filter(Boolean))
    )
    const validDeliveryPersonIds = [pUserId, uId].filter(Boolean) as string[]

    if (validDeliveryPersonIds.length === 0 && assignedDeliveryIds.length === 0) {
      return { success: true as const, items: [], nextCursor: null, hasMore: false }
    }

    const orClauses: string[] = []
    if (validDeliveryPersonIds.length > 0) {
      orClauses.push(`delivery_person_id.in.(${validDeliveryPersonIds.join(",")})`)
    }
    if (assignedDeliveryIds.length > 0) {
      orClauses.push(`id.in.(${assignedDeliveryIds.join(",")})`)
    }

    if (cursor) {
      const qVal = (s: string) => `"${String(s).replace(/"/g, '""')}"`
      const k1 = `created_at.lt.${qVal(cursor.createdAt)}`
      const k2 = `and(created_at.eq.${qVal(cursor.createdAt)},id.lt.${qVal(cursor.id)})`
      const combinedClauses: string[] = []
      for (const rc of orClauses) {
        combinedClauses.push(`and(${rc},${k1})`)
        combinedClauses.push(`and(${rc},${k2})`)
      }
      q = q.or(combinedClauses.join(","))
    } else {
      q = q.or(orClauses.join(","))
    }

    const { data, error } = await q
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(fetchLimit)

    if (error) throw error
    let rows = (data || []).filter((row: any) => {
      const links = Array.isArray(row.delivery_orders) ? row.delivery_orders : []
      return !links.some((link: any) => isCarrierBoundOrder(link?.orders))
    })

    rows = rows.filter((row: any) => {
      const personId = String(row.delivery_person_id || "").trim()
      const isPersonMatch = validDeliveryPersonIds.includes(personId)
      if (isPersonMatch) return true
      // If explicitly assigned to another store driver, never match via stale delivery_assignments
      if (personId && personId !== "dudit_network" && personId !== "platform:dudit_network") {
        return false
      }
      return assignedDeliveryIds.includes(String(row.id || ""))
    })

    const deliveryPersonIds = rows.map((row: any) => String(row.delivery_person_id || "")).filter(Boolean)
    const deliveryPersonNameById = await getPartnerUserNameByIdMap(supabase, partnerId, deliveryPersonIds)

    const deliveryIds = rows.map((r: any) => r.id).filter(Boolean)
    let platformAssignmentsByDeliveryId = new Map<string, any>()
    let platformDriverUserIds = new Set<string>()

    if (deliveryIds.length > 0) {
      const { data: assignments } = await getAdminClient()
        .from("delivery_assignments")
        .select("id, delivery_id, order_id, driver_id, status, assigned_at, accepted_at, picked_up_at, out_for_delivery_at")
        .in("delivery_id", deliveryIds)
        .in("status", ["available", "requested", "assigned", "accepted", "picked_up", "out_for_delivery", "delivered"])
        .order("assigned_at", { ascending: false })

      const nowMs = Date.now()
      for (const ass of assignments || []) {
        if (ass.delivery_id && !platformAssignmentsByDeliveryId.has(ass.delivery_id)) {
          const isPendingExpired = !ass.driver_id && ["available", "requested"].includes(ass.status) && (
            !ass.assigned_at || (nowMs - new Date(ass.assigned_at).getTime() > DUDIT_NETWORK_EXPIRATION_MS)
          )
          if (!isPendingExpired) {
            platformAssignmentsByDeliveryId.set(ass.delivery_id, ass)
            if (ass.driver_id) platformDriverUserIds.add(String(ass.driver_id))
          }
        }
      }
    }

    for (const row of rows) {
      if (row.delivery_person_id && !deliveryPersonNameById.has(String(row.delivery_person_id))) {
        if (row.delivery_person_id !== "dudit_network" && row.delivery_person_id !== "platform:dudit_network") {
          platformDriverUserIds.add(String(row.delivery_person_id))
        }
      }
    }

    let driverProfileMap = new Map<string, any>()
    if (platformDriverUserIds.size > 0) {
      const driverIdsArray = Array.from(platformDriverUserIds)
      const [{ data: profiles }, { data: driverRows }] = await Promise.all([
        getAdminClient().from("user_profiles").select("user_id, full_name, phone").in("user_id", driverIdsArray),
        getAdminClient().from("delivery_drivers").select("user_id, vehicle_type, vehicle_plate, city").in("user_id", driverIdsArray),
      ])

      const driverInfoByUserId = new Map<string, any>()
      for (const dRow of driverRows || []) {
        if (dRow?.user_id) driverInfoByUserId.set(String(dRow.user_id), dRow)
      }

      for (const prof of profiles || []) {
        if (!prof?.user_id) continue
        const dInfo = driverInfoByUserId.get(String(prof.user_id))
        driverProfileMap.set(String(prof.user_id), {
          id: String(prof.user_id),
          fullName: prof.full_name || "Entregador Dudit",
          phone: prof.phone || null,
          avatarUrl: null,
          vehicleType: dInfo?.vehicle_type === "moto" ? "Moto" : dInfo?.vehicle_type === "carro" ? "Carro" : (dInfo?.vehicle_type || null),
          vehiclePlate: dInfo?.vehicle_plate || null,
          city: dInfo?.city || null,
        })
      }
    }

    const hasMore = rows.length > limit
    const items = (hasMore ? rows.slice(0, limit) : rows).map((row: any) => {
      const pAss = platformAssignmentsByDeliveryId.get(row.id)
      let isPlatformDriver = false
      let platformDriver: any = null
      let driverName: string | null = null

      if (pAss) {
        isPlatformDriver = true
        if (pAss.driver_id) {
          const pInfo = driverProfileMap.get(String(pAss.driver_id))
          platformDriver = {
            id: String(pAss.driver_id),
            fullName: pInfo?.fullName || "Entregador Dudit",
            phone: pInfo?.phone || null,
            avatarUrl: pInfo?.avatarUrl || null,
            vehicleType: pInfo?.vehicleType || null,
            vehiclePlate: pInfo?.vehiclePlate || null,
            city: pInfo?.city || null,
            status: pAss.status,
            isPlatformDriver: true,
            isPendingAcceptance: false,
          }
          driverName = pInfo?.vehicleType ? `${platformDriver.fullName} (${pInfo.vehicleType})` : platformDriver.fullName
        } else {
          platformDriver = {
            id: "dudit_network",
            fullName: "Rede de Entregadores Dudit",
            status: pAss.status,
            isPlatformDriver: true,
            isPendingAcceptance: true,
          }
          driverName = "Rede de Entregadores (Aguardando aceite)"
        }
      } else if (row.delivery_person_id && driverProfileMap.has(String(row.delivery_person_id))) {
        const pInfo = driverProfileMap.get(String(row.delivery_person_id))
        isPlatformDriver = true
        platformDriver = {
          id: String(row.delivery_person_id),
          fullName: pInfo?.fullName || "Entregador Dudit",
          phone: pInfo?.phone || null,
          avatarUrl: pInfo?.avatarUrl || null,
          vehicleType: pInfo?.vehicleType || null,
          vehiclePlate: pInfo?.vehiclePlate || null,
          city: pInfo?.city || null,
          status: "accepted",
          isPlatformDriver: true,
          isPendingAcceptance: false,
        }
        driverName = pInfo?.vehicleType ? `${platformDriver.fullName} (${pInfo.vehicleType})` : platformDriver.fullName
      } else if (row.delivery_person_id && row.delivery_person_id !== "dudit_network" && row.delivery_person_id !== "platform:dudit_network") {
        driverName = deliveryPersonNameById.get(String(row.delivery_person_id)) || "Entregador"
      }

      const cleanDeliveryPersonId = (row.delivery_person_id === "dudit_network" || row.delivery_person_id === "platform:dudit_network")
        ? (pAss ? row.delivery_person_id : null)
        : row.delivery_person_id

      return {
        ...row,
        delivery_person_id: cleanDeliveryPersonId,
        is_platform_driver: isPlatformDriver,
        platform_driver: platformDriver,
        delivery_person_name: driverName,
        partner_users: driverName
          ? { id: cleanDeliveryPersonId, user_profiles: { full_name: driverName } }
          : null,
      }
    })
    const last = items[items.length - 1]
    const nextCursor = hasMore && last?.created_at && last?.id
      ? { createdAt: String(last.created_at), id: String(last.id) }
      : null

    return { success: true as const, items, nextCursor, hasMore }
  }

  export async function getERPDeliveryDetailsAction(deliveryId: string, partnerId: string) {
    const user = await requireUser()
    await requireActivePartnerContext(partnerId)
    const actor = await getDeliveryActorScope(partnerId)
    await requirePartnerRouteAccess(partnerId, "logistics", { specificPermission: "can_view_delivery_details" })
    const planCheck = await enforceDeliveryPlanAccess(partnerId, 1)
    if (!planCheck.allowed) return { success: false as const, error: planCheck.error }
    await expireOldDuditNetworkRequests(getAdminClient(), partnerId)
    const supabase = await getSupabaseServerClient()

    const { data, error } = await getCachedErpPage(
      ["erp-delivery-detail", partnerId, deliveryId],
      [TAGS.deliveries(partnerId), TAGS.orders(partnerId), TAGS.partner(partnerId), `delivery-${deliveryId}`],
      async () => {
        const admin = getAdminClient()
        return admin
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
              created_at,
              updated_at,

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
              order_items(
                id,
                product_name,
                product_price,
                quantity,
                subtotal,
                product_id,
                variant_id,
                service_id,
                products(id, name, sku, images, unit, product_type),
                product_variants(id, variant_name, sku, variant_options),
                services(id, name, images)
              )
            )
      )
    `)
      .eq("id", deliveryId)
      .eq("partner_id", partnerId)
      .single()
      },
      15,
    )

    if (actor.roleId === "delivery") {
      const isAssigned = await isDeliveryAssignedToDriver({
        deliveryId,
        deliveryPersonId: data?.delivery_person_id,
        actor,
      })
      if (!isAssigned) {
        return { success: false as const, error: "Sem permissão para visualizar esta entrega." }
      }
    }

    if (error) return { success: false as const, error: error.message }

    const deliveryOrderIds = (data?.delivery_orders || []).map((doItem: any) => doItem?.order_id).filter(Boolean)
    const buyerIds = Array.from(new Set((data?.delivery_orders || [])
      .map((doItem: any) => doItem?.orders?.buyer_id)
      .filter(Boolean)))

    let assignmentFilter = `delivery_id.eq.${deliveryId}`
    if (deliveryOrderIds.length > 0) {
      assignmentFilter += `,order_id.in.(${deliveryOrderIds.join(",")})`
    }

    const [
      { data: platformAssignments },
      deliveryPersonNameById,
      customerRes,
      addressRes,
    ] = await Promise.all([
      getAdminClient()
        .from("delivery_assignments")
        .select("id, driver_id, status, assigned_at, accepted_at, picked_up_at, out_for_delivery_at, completed_at")
        .or(assignmentFilter)
        .in("status", ["available", "requested", "assigned", "accepted", "picked_up", "out_for_delivery", "delivered"])
        .order("assigned_at", { ascending: false })
        .limit(10),
      getPartnerUserNameByIdMap(
        supabase,
        partnerId,
        data?.delivery_person_id ? [String(data.delivery_person_id)] : [],
      ),
      buyerIds.length > 0
        ? getAdminClient()
            .from("customers")
            .select("id, name, email, phone, image_url")
            .eq("partner_id", partnerId)
            .in("id", buyerIds)
        : Promise.resolve({ data: [] }),
      buyerIds.length > 0
        ? supabase
            .from("addresses")
            .select("customer_id, street, number, complement, neighborhood, city, state, zip_code")
            .in("customer_id", buyerIds)
            .eq("address_type", "primary")
        : Promise.resolve({ data: [] }),
    ])

    const nowMs = Date.now()
    const activeAssignments = (platformAssignments || []).filter((a: any) => {
      if (a.driver_id) return true
      if (["available", "requested"].includes(a.status)) {
        if (!a.assigned_at) return false
        return nowMs - new Date(a.assigned_at).getTime() <= DUDIT_NETWORK_EXPIRATION_MS
      }
      return true
    })

    const platformAssignment = activeAssignments.find((a: any) => a.driver_id && ["accepted", "picked_up", "out_for_delivery", "delivered"].includes(a.status))
      || activeAssignments.find((a: any) => a.driver_id)
      || activeAssignments[0]
      || null

    if (!platformAssignment && (data?.delivery_person_id === "dudit_network" || data?.delivery_person_id === "platform:dudit_network")) {
      data.delivery_person_id = null
    }

    let platformDriver: any = null
    let resolvedPlatformDriverId: string | null = null

    if (platformAssignment) {
      if (!platformAssignment.driver_id) {
        resolvedPlatformDriverId = "dudit_network"
        platformDriver = {
          id: "dudit_network",
          fullName: "Rede de Entregadores Dudit",
          status: platformAssignment.status,
          isPlatformDriver: true,
          isPendingAcceptance: true,
        }
      } else {
        const driverUserId = String(platformAssignment.driver_id)
        resolvedPlatformDriverId = driverUserId
        const [{ data: profile }, { data: driverRow }, { count: totalDeliveries }] = await Promise.all([
          getAdminClient().from("user_profiles").select("full_name, phone").eq("user_id", driverUserId).maybeSingle(),
          getAdminClient().from("delivery_drivers").select("vehicle_type, vehicle_plate, city").eq("user_id", driverUserId).maybeSingle(),
          getAdminClient().from("delivery_assignments").select("id", { count: "exact", head: true }).eq("driver_id", driverUserId).eq("status", "delivered"),
        ])

        const fullName = profile?.full_name || "Entregador Dudit"
        const vehicleType = driverRow?.vehicle_type === "moto" ? "Moto" : driverRow?.vehicle_type === "carro" ? "Carro" : (driverRow?.vehicle_type || null)

        platformDriver = {
          id: driverUserId,
          fullName,
          phone: profile?.phone || null,
          avatarUrl: null,
          vehicleType,
          vehiclePlate: driverRow?.vehicle_plate || null,
          city: driverRow?.city || null,
          totalDeliveries: totalDeliveries || 0,
          status: platformAssignment.status,
          isPlatformDriver: true,
          isPendingAcceptance: false,
          acceptedAt: platformAssignment.accepted_at,
          pickedUpAt: platformAssignment.picked_up_at,
        }
      }
    }

    const customerRows = customerRes?.data || []
    const addressRows = addressRes?.data || []

    const addressMap = new Map<string, any>()
    for (const addr of addressRows || []) {
      addressMap.set(String(addr.customer_id), addr)
    }

    const customerMap = new Map<string, any>()
    for (const row of customerRows || []) {
      const addr = addressMap.get(String(row.id))
      customerMap.set(String(row.id), { ...row, ...addr })
    }

    const hydrated = {
      ...data,
      delivery_person_id: platformDriver?.isPlatformDriver
        ? `platform:${resolvedPlatformDriverId}`
        : (data?.delivery_person_id || null),
      delivery_person_name: platformDriver?.fullName || deliveryPersonNameById.get(String(data?.delivery_person_id)) || null,
      delivery_person_phone: platformDriver?.phone || null,
      delivery_person_avatar: platformDriver?.avatarUrl || null,
      delivery_person_vehicle: platformDriver?.vehicleType || null,
      platform_driver_id: resolvedPlatformDriverId,
      platform_driver: platformDriver,
      platform_assignment: platformAssignment,
      is_platform_driver: Boolean(platformDriver?.isPlatformDriver),
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
      partner_users: platformDriver?.isPlatformDriver
        ? {
            id: `platform:${resolvedPlatformDriverId}`,
            user_profiles: {
              full_name: platformDriver.fullName,
              avatar_url: platformDriver.avatarUrl,
              phone: platformDriver.phone,
            },
          }
        : (data?.delivery_person_id
          ? { id: data.delivery_person_id, user_profiles: { full_name: deliveryPersonNameById.get(String(data.delivery_person_id)) || "Entregador" } }
          : null),
    }
    return { success: true as const, data: hydrated }
  }

  export async function unassignDuditDriverAction(params: {
    partnerId: string
    deliveryId: string
    reason: string
    notifyDriver?: boolean
  }) {
    const user = await requireUser()
    await requireActivePartnerContext(params.partnerId)
    const actor = await getDeliveryActorScope(params.partnerId)
    if (actor.roleId === "delivery") {
      return { success: false as const, error: "Sem permissão para desatribuir entregador." }
    }
    await requirePartnerRouteAccess(params.partnerId, "logistics", { specificPermission: "can_update_delivery_status" })
    const supabase = await getSupabaseServerClient()
    const admin = getAdminClient()

    const { data: delivery } = await supabase
      .from("deliveries")
      .select("id, delivery_number, delivery_person_id, status")
      .eq("id", params.deliveryId)
      .eq("partner_id", params.partnerId)
      .maybeSingle()

    if (!delivery) {
      return { success: false as const, error: "Entrega não encontrada." }
    }

    const { data: assignment } = await admin
      .from("delivery_assignments")
      .select("id, driver_id, status, delivery_id, order_id")
      .eq("delivery_id", params.deliveryId)
      .in("status", ["available", "requested", "assigned", "accepted", "picked_up", "out_for_delivery"])
      .order("assigned_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    const reasonText = params.reason?.trim() || "Desatribuído pelo estabelecimento"

    if (assignment) {
      await admin
        .from("delivery_assignments")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          failure_reason: reasonText,
          updated_at: new Date().toISOString(),
        })
        .eq("delivery_id", params.deliveryId)
        .in("status", ["available", "requested", "assigned", "accepted", "picked_up", "out_for_delivery"])

      if (assignment.driver_id && params.notifyDriver !== false) {
        const deliveryNumLabel = delivery.delivery_number ? `#${delivery.delivery_number}` : ""
        try {
          await createNotification({
            userId: String(assignment.driver_id),
            type: "order_cancelled",
            title: "Entrega desatribuída pelo estabelecimento",
            message: `A entrega ${deliveryNumLabel} foi desatribuída pelo estabelecimento. Motivo: ${reasonText}`,
            entityType: "order",
            entityId: assignment.order_id || params.deliveryId,
            idempotencyKey: `unassign-${assignment.id}-${Date.now()}`,
            data: {
              partner_id: params.partnerId,
              deliveryId: params.deliveryId,
              reason: reasonText,
              cancelledByPartner: true,
            },
          })
        } catch (notifErr) {
          console.warn("[unassignDuditDriverAction] notification error:", notifErr)
        }
      }
    }

    await supabase
      .from("deliveries")
      .update({
        delivery_person_id: null,
        status: "pending",
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.deliveryId)
      .eq("partner_id", params.partnerId)

    try {
      await logAuditEvent({
        partnerId: params.partnerId,
        actorUserId: user.id,
        entityType: "delivery",
        entityId: params.deliveryId,
        actionType: "delivery_driver_unassigned",
        changeLines: [
          `Entregador Dudit desatribuído da entrega.`,
          `Motivo informado: ${reasonText}`,
        ],
        metadata: {
          deliveryId: params.deliveryId,
          driverId: assignment?.driver_id || null,
          reason: reasonText,
        },
        source: "manual",
      })
    } catch (auditErr) {
      console.warn("[unassignDuditDriverAction] audit error:", auditErr)
    }

    revalidateDeliveryDashboard(params.partnerId)
    revalidatePath("/erp/entregas")
    revalidatePath("/erp/logistica")

    return { success: true as const }
  }

  export async function updateERPDeliveryStatusAction(params: {
    partnerId: string
    deliveryId: string
    status: DeliveryStatusValue
    changeReason?: string
    deliveryOtp?: string
    bypassOtp?: boolean
    bypassReason?: string
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
      const isAssigned = await isDeliveryAssignedToDriver({
        deliveryId: params.deliveryId,
        deliveryPersonId: currentDelivery.delivery_person_id,
        actor,
      })
      if (!isAssigned) {
        return { success: false as const, error: "Você só pode alterar status de entregas atribuídas a você." }
      }
    }

    const nextStatus = normalizeDeliveryStatus(params.status)
    const allowed = new Set<DeliveryStatusValue>(["pending", "not_sent", "preparing", "pickup_available", "sent", "delivered", "cancelled", "delivery_failed"])
    if (!allowed.has(nextStatus)) {
      return { success: false as const, error: "Status de entrega inválido." }
    }
    if (actor.roleId === "delivery" && nextStatus === "cancelled") {
      return { success: false as const, error: "Entregadores não têm permissão para cancelar entregas." }
    }

    // Se estiver marcando como entregue, verificar se exige código de confirmação
    if (nextStatus === "delivered") {
      const { data: dOrders } = await supabase
        .from("delivery_orders")
        .select("order_id")
        .eq("delivery_id", params.deliveryId)

      const orderIds = (dOrders || []).map((o: any) => o.order_id).filter(Boolean)
      if (orderIds.length > 0) {
        const { doesOrderRequireDeliveryOtp, verifyAndConsumeDeliveryOtp, bypassDeliveryOtp } = await import("@/lib/services/delivery-otp.service")
        const otpRequiredOrderIds: string[] = []
        for (const oId of orderIds) {
          const req = await doesOrderRequireDeliveryOtp(oId)
          if (req.requiresOtp) {
            otpRequiredOrderIds.push(oId)
          }
        }

        if (otpRequiredOrderIds.length > 0) {
          const isOwnerOrAdmin = actor.roleId === "owner" || actor.roleId === "admin" || (actor as any).isOwnerOrAdmin
          if (params.bypassOtp) {
            if (!isOwnerOrAdmin) {
              return {
                success: false as const,
                error: "Apenas administradores e proprietários podem bypassar o código de entrega.",
              }
            }
            for (const oId of otpRequiredOrderIds) {
              await bypassDeliveryOtp({
                orderId: oId,
                bypassedByUserId: user.id,
                reason: params.bypassReason || params.changeReason || "Bypass autorizado pelo administrador no ERP",
              })
            }
          } else {
            if (otpRequiredOrderIds.length === 1) {
              if (!params.deliveryOtp) {
                return {
                  success: false as const,
                  error: "Este pedido exige o código de confirmação de entrega de 6 dígitos fornecido pelo cliente.",
                  requiresOtp: true,
                }
              }
              const verifyRes = await verifyAndConsumeDeliveryOtp({
                orderId: otpRequiredOrderIds[0],
                code: params.deliveryOtp,
                confirmedByUserId: user.id,
              })
              if (!verifyRes.success) {
                return {
                  success: false as const,
                  error: verifyRes.error || "Código de confirmação de entrega incorreto.",
                }
              }
            } else if (otpRequiredOrderIds.length > 1) {
              return {
                success: false as const,
                error: "Esta rota contém múltiplos pedidos que exigem código de confirmação. Confirme cada parada individualmente informando o respectivo código ou autorize o bypass administrativo.",
                requiresOtp: true,
              }
            }
          }
        }
      }
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
    }
    if (["delivered", "cancelled", "delivery_failed"].includes(nextStatus)) {
      patch.completed_at = nowIso
    } else {
      patch.completed_at = null
    }

    const admin = getAdminClient()

    const { error } = await admin
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

    const concurrentOps: PromiseLike<any>[] = [
      admin.from("delivery_orders").update(childPatch).eq("delivery_id", params.deliveryId),
    ]

    if (nextStatus === "cancelled" || nextStatus === "delivered" || nextStatus === "sent") {
      concurrentOps.push(
        admin
          .from("delivery_assignments")
          .update({ status: "cancelled", cancelled_at: nowIso })
          .eq("delivery_id", params.deliveryId)
          .in("status", ["available", "requested", "assigned"])
      )
    }

    const { data: links } = await admin
      .from("delivery_orders")
      .select("order_id")
      .eq("delivery_id", params.deliveryId)
    const orderIds = (links || []).map((l: any) => l?.order_id).filter(Boolean)

    if (orderIds.length > 0) {
      const orderPatch: Record<string, unknown> = {
        delivery_status: nextStatus === "pending" ? "not_sent" : nextStatus,
      }
      if (nextStatus === "sent") {
        orderPatch.delivery_departure_at = nowIso
      }
      if (nextStatus === "delivered") {
        orderPatch.delivery_departure_at = nowIso
        orderPatch.delivery_arrived_at = nowIso
        orderPatch.delivery_completed_at = nowIso
      }
      concurrentOps.push(
        admin.from("orders").update(orderPatch).in("id", orderIds).eq("partner_id", params.partnerId)
      )
    }

    await Promise.all(concurrentOps)

    if ((nextStatus === "sent" || nextStatus === "delivered") && orderIds.length > 0) {
      void syncDeliveredOrdersToErps({
        partnerId: params.partnerId,
        orderIds,
        nextStatus,
        actorUserId: user?.id || null,
      }).catch(() => {})
    }

    const logPromises: Promise<any>[] = [
      logDeliveryEvent({
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
      }),
    ]

    for (const oid of orderIds) {
      const orderStatusMsg = nextStatus === "sent"
        ? "Pedido saiu para entrega (Em rota)"
        : nextStatus === "delivered"
          ? "Pedido entregue ao destinatário com sucesso"
          : nextStatus === "cancelled"
            ? "Entrega do pedido cancelada"
            : `Status de entrega alterado para ${getDeliveryStatusHumanLabel(nextStatus)}`
      const orderChangeLines = [orderStatusMsg]
      if (params.changeReason?.trim()) {
        orderChangeLines.push(`Motivo: ${params.changeReason.trim()}`)
      }
      logPromises.push(
        logOrderDeliveryEvent({
          partnerId: params.partnerId,
          actorUserId: user?.id || null,
          orderId: oid,
          actionType: `delivery_${nextStatus}`,
          changeLines: orderChangeLines,
          metadata: { deliveryId: params.deliveryId, status: nextStatus },
        })
      )
    }

    void Promise.allSettled(logPromises).catch(() => {})

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

    revalidateDeliveryDashboard(params.partnerId, params.deliveryId)
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
    const deliveryEditCheck = await checkPermission(payload.partnerId, "delivery", "edit")
    if (!deliveryEditCheck.allowed) {
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

    const orderAddresses = (orders || []).map((o: any) => formatAddress(o)).filter(Boolean)
    let distanceKm: number | null = null
    let estimatedDurationMinutes: number | null = null

    if (orderAddresses.length > 0) {
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

        const [originCoords, ...destCoordsList] = await Promise.all([
          geocodeWithTimeout(originAddress),
          ...orderAddresses.map((addr: string) => geocodeWithTimeout(addr)),
        ])

        const validCoords = destCoordsList.filter(Boolean) as { lat: number; lng: number }[]

        if (originCoords && validCoords.length > 0) {
          const metrics = await computeDrivingRouteMetrics(originCoords, validCoords)
          if (metrics) {
            distanceKm = metrics.distanceKm
            estimatedDurationMinutes = metrics.durationMinutes
          }
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
    }
    if (["delivered", "cancelled", "delivery_failed"].includes(nextStatus)) {
      deliveryPatch.completed_at = payload.startedAt || nowIso
    } else {
      deliveryPatch.completed_at = null
    }

    if (distanceKm != null) deliveryPatch.distance_km = distanceKm
    if (estimatedDurationMinutes != null) deliveryPatch.estimated_duration_minutes = estimatedDurationMinutes

    const { error: updateError } = await supabase
      .from("deliveries")
      .update(deliveryPatch)
      .eq("id", payload.deliveryId)
      .eq("partner_id", payload.partnerId)

    if (updateError) return { success: false as const, error: updateError.message }

    const isExplicitPlatformNetworkRequest = payload.deliveryPersonId === "platform:dudit_network" || payload.platformDriverId === "dudit_network"
    const isExplicitUnassignOrLocal = payload.deliveryPersonId !== undefined && !payload.deliveryPersonId?.startsWith("platform:") && !payload.platformDriverId

    if (isExplicitUnassignOrLocal && payload.deliveryPersonId !== delivery.delivery_person_id) {
      await getAdminClient()
        .from("delivery_assignments")
        .update({ status: "cancelled", cancelled_at: nowIso })
        .eq("delivery_id", payload.deliveryId)
        .in("status", ["available", "requested", "assigned"])
    }

    if (isExplicitPlatformNetworkRequest) {
      const { data: orderRows } = await supabase
        .from("orders")
        .select("id, delivery_fee")
        .in("id", orderIds)
        .eq("partner_id", payload.partnerId)

      await getAdminClient()
        .from("delivery_assignments")
        .update({ status: "cancelled", cancelled_at: nowIso })
        .eq("delivery_id", payload.deliveryId)
        .in("status", ["available", "requested", "assigned"])

      const assignmentRows = (orderRows || []).map((ord: any) => ({
        order_id: ord.id,
        delivery_id: payload.deliveryId,
        partner_id: payload.partnerId,
        driver_id: null,
        assigned_by: user?.id || null,
        status: "available",
        delivery_fee: Number(ord.delivery_fee || 0),
        notes: sanitizeNotes(payload.notes),
        assigned_at: nowIso,
      }))
      if (assignmentRows.length > 0) {
        await getAdminClient().from("delivery_assignments").insert(assignmentRows)
      }
    }

    const { error: deleteLinksError } = await getAdminClient().from("delivery_orders").delete().eq("delivery_id", payload.deliveryId)
    if (deleteLinksError) return { success: false as const, error: deleteLinksError.message }

    const nextLinks = orderIds.map((orderId, index) => ({
      delivery_id: payload.deliveryId,
      order_id: orderId,
      position: index + 1,
      status: nextStatus,
      delivered_at: nextStatus === "delivered" ? (payload.startedAt || nowIso) : null,
    }))
    const { error: insertLinksError } = await getAdminClient().from("delivery_orders").insert(nextLinks)
    if (insertLinksError) return { success: false as const, error: insertLinksError.message }

    // Sync order-level delivery status & timestamps
    try {
      const orderPatch: Record<string, unknown> = {
        delivery_status: nextStatus === "pending" ? "not_sent" : nextStatus,
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

    if ((nextStatus === "sent" || nextStatus === "delivered") && orderIds.length > 0) {
      void syncDeliveredOrdersToErps({
        partnerId: payload.partnerId,
        orderIds,
        nextStatus,
        actorUserId: user?.id || null,
      }).catch(() => {})
    }

    // Build detailed log lines for history/audit
    const previousIds = new Set<string>((previousLinks || []).map((row: any) => String(row.order_id)))
    const currentIds = new Set<string>(orderIds.map(String))

    const orderLabelById = new Map<string, string>()
    for (const row of previousLinks || []) {
      const id = String(row.order_id)
      const orderItem: any = Array.isArray(row.orders) ? row.orders[0] : row.orders
      const number = orderItem?.order_number || null
      orderLabelById.set(id, number || `#${id.slice(0, 8).toUpperCase()}`)
    }

    const added = orderIds.filter((id) => !previousIds.has(String(id)))
    const removed = Array.from(previousIds).filter((id) => !currentIds.has(String(id)))

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

  revalidateDeliveryDashboard(payload.partnerId, payload.deliveryId)
  return { success: true as const, deliveryId: payload.deliveryId }
}

export async function updateERPSingleOrderDeliveryStatusAction(params: {
  partnerId: string
  deliveryId: string
  orderId: string
  status: DeliveryStatusValue
  changeReason?: string
  deliveryOtp?: string
  bypassOtp?: boolean
  bypassReason?: string
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
    const isAssigned = await isDeliveryAssignedToDriver({
      deliveryId: params.deliveryId,
      deliveryPersonId: currentDelivery.delivery_person_id,
      actor,
    })
    if (!isAssigned) {
      return { success: false as const, error: "Você só pode alterar status de entregas atribuídas a você." }
    }
  }

  const nextStatus = normalizeDeliveryStatus(params.status)
  const allowed = new Set<DeliveryStatusValue>(["pending", "not_sent", "preparing", "pickup_available", "sent", "delivered", "cancelled", "delivery_failed"])
  if (!allowed.has(nextStatus)) {
    return { success: false as const, error: "Status de entrega inválido." }
  }
  if (actor.roleId === "delivery" && nextStatus === "cancelled") {
    return { success: false as const, error: "Entregadores não têm permissão para cancelar entregas." }
  }

  // Se estiver marcando pedido como entregue, verificar se exige código de confirmação
  if (nextStatus === "delivered") {
    const { doesOrderRequireDeliveryOtp, verifyAndConsumeDeliveryOtp, bypassDeliveryOtp } = await import("@/lib/services/delivery-otp.service")
    const requirement = await doesOrderRequireDeliveryOtp(params.orderId)
    if (requirement.requiresOtp) {
      const isOwnerOrAdmin = actor.roleId === "owner" || actor.roleId === "admin" || (actor as any).isOwnerOrAdmin
      if (params.bypassOtp) {
        if (!isOwnerOrAdmin) {
          return {
            success: false as const,
            error: "Apenas administradores e proprietários podem bypassar o código de entrega.",
          }
        }
        await bypassDeliveryOtp({
          orderId: params.orderId,
          bypassedByUserId: user.id,
          reason: params.bypassReason || params.changeReason || "Bypass autorizado pelo administrador no ERP",
        })
      } else {
        if (!params.deliveryOtp) {
          return {
            success: false as const,
            error: "Este pedido exige o código de confirmação de entrega de 6 dígitos fornecido pelo cliente.",
            requiresOtp: true,
          }
        }

        const verifyRes = await verifyAndConsumeDeliveryOtp({
          orderId: params.orderId,
          code: params.deliveryOtp,
          confirmedByUserId: user.id,
        })

        if (!verifyRes.success) {
          return {
            success: false as const,
            error: verifyRes.error || "Código de confirmação de entrega incorreto.",
          }
        }
      }
    }
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

  const orderPatch: Record<string, unknown> = {
    delivery_status: nextStatus === "pending" ? "not_sent" : nextStatus,
  }
  if (nextStatus === "sent") {
    orderPatch.delivery_departure_at = nowIso
  }
  if (nextStatus === "delivered") {
    orderPatch.delivery_departure_at = nowIso
    orderPatch.delivery_arrived_at = nowIso
    orderPatch.delivery_completed_at = nowIso
  }

  const admin = getAdminClient()

  const [linkRes, orderRes] = await Promise.all([
    admin
      .from("delivery_orders")
      .update(childPatch)
      .eq("delivery_id", params.deliveryId)
      .eq("order_id", params.orderId),
    admin
      .from("orders")
      .update(orderPatch)
      .eq("id", params.orderId)
      .eq("partner_id", params.partnerId),
  ])

  if (linkRes.error) return { success: false as const, error: linkRes.error.message }
  if (orderRes.error) return { success: false as const, error: orderRes.error.message }

  if (nextStatus === "sent" || nextStatus === "delivered") {
    void syncDeliveredOrdersToErps({
      partnerId: params.partnerId,
      orderIds: [params.orderId],
      nextStatus,
      actorUserId: user?.id || null,
    }).catch(() => {})
  }

  let changeMsg = nextStatus === "delivered"
    ? "Pedido entregue ao destinatário com sucesso"
    : nextStatus === "delivery_failed"
      ? "Tentativa de entrega do pedido falhou"
      : `Status de entrega do pedido alterado para ${getDeliveryStatusHumanLabel(nextStatus)}`

  if (params.changeReason?.trim()) {
    changeMsg += ` (Motivo: ${params.changeReason.trim()})`
  }

  // Non-blocking logs
  void Promise.allSettled([
    logDeliveryEvent({
      partnerId: params.partnerId,
      actorUserId: user?.id || null,
      deliveryId: params.deliveryId,
      actionType: "order_delivery_status_changed",
      changeLines: [changeMsg],
      metadata: { orderId: params.orderId, newStatus: nextStatus },
    }),
    logOrderDeliveryEvent({
      partnerId: params.partnerId,
      actorUserId: user?.id || null,
      orderId: params.orderId,
      actionType: `delivery_${nextStatus}`,
      changeLines: [changeMsg],
      metadata: { deliveryId: params.deliveryId, status: nextStatus },
    }),
  ]).catch(() => {})

  // Derive and sync parent delivery status from all linked orders
  const { data: allLinks } = await admin
    .from("delivery_orders")
    .select("status, orders(delivery_status, situation)")
    .eq("delivery_id", params.deliveryId)

  const resolvedParentStatus = resolveEffectiveDeliveryStatus(currentDelivery.status, (allLinks || []) as any)
  const dbDeliveryStatus = resolvedParentStatus === "partially_delivered"
    ? "sent"
    : (resolvedParentStatus === "not_sent" ? "pending" : resolvedParentStatus)
  let resultingDeliveryStatus = resolvedParentStatus

  const deliveryPatch: Record<string, unknown> = { status: dbDeliveryStatus }
  if (dbDeliveryStatus === "sent") {
    deliveryPatch.departure_time = nowIso
    deliveryPatch.started_at = nowIso
  }
  if (dbDeliveryStatus === "delivered") {
    deliveryPatch.delivered_at = nowIso
    deliveryPatch.completed_at = nowIso
  } else if (["delivery_failed", "cancelled"].includes(dbDeliveryStatus)) {
    deliveryPatch.completed_at = nowIso
  } else {
    deliveryPatch.completed_at = null
  }

  await admin
    .from("deliveries")
    .update(deliveryPatch)
    .eq("id", params.deliveryId)

  if (dbDeliveryStatus === "delivered" && currentDelivery.delivery_person_id) {
    const { data: deliveryOrders } = await admin
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

  revalidateDeliveryDashboard(params.partnerId, params.deliveryId)
  return { success: true as const, deliveryStatus: resultingDeliveryStatus }
}

export type ERPCarrierDeliveryListCursor = { createdAt: string; id: string }

/**
 * Indica se o parceiro tem integração com transportadora configurada.
 * Usado para exibir (ou não) a aba "Transportadora" em Entregas.
 */
export async function getERPCarrierDeliveriesEnabledAction(
  partnerId: string
): Promise<{ success: true; enabled: boolean } | { success: false; error: string }> {
  try {
    await requireUser()
    await requireActivePartnerContext(partnerId)
    const enabled = await getCachedErpPage(
      ["erp-carrier-enabled", partnerId],
      [TAGS.partner(partnerId)],
      async () => {
        const { data } = await getAdminClient()
          .from("partner_integrations")
          .select("id, status, access_token_encrypted")
          .eq("partner_id", partnerId)
          .eq("provider_slug", "superfrete")
          .maybeSingle()
        return Boolean(data?.access_token_encrypted)
      },
      30,
    )
    return { success: true, enabled }
  } catch (e: any) {
    return { success: false, error: e?.message || "Erro ao verificar integração de transportadora." }
  }
}

/**
 * Lista pedidos atendidos por transportadora (SuperFrete) para a aba
 * "Transportadora" da página de Entregas.
 */
export async function getERPCarrierDeliveriesPageAction(
  partnerId: string,
  options?: { cursor?: ERPCarrierDeliveryListCursor | null; limit?: number }
): Promise<
  | {
    success: true
    items: any[]
    nextCursor: ERPCarrierDeliveryListCursor | null
    hasMore: boolean
  }
  | { success: false; error: string }
> {
  try {
    const user = await requireUser()
    if (!user) return { success: false, error: "Não autenticado." }
    await requireActivePartnerContext(partnerId)

    const orderListCheck = await checkPermission(partnerId, "orders", "list")
    if (!orderListCheck.allowed) {
      return { success: false, error: "Sem permissão para listar pedidos." }
    }

    const cursor = options?.cursor ?? null
    const limit = Math.max(1, Math.min(250, Math.floor(Number(options?.limit || DEFAULT_PAGE_SIZE))))

    return getCachedErpPage(
      [
        "erp-carrier-deliveries-page",
        partnerId,
        cursor ? `${cursor.createdAt}:${cursor.id}` : "first",
        String(limit),
      ],
      [TAGS.orders(partnerId)],
      async () => {
        const supabase = getAdminClient()
        const fetchLimit = limit + 1

        let q = supabase
          .from("orders")
          .select(`
            id,
            order_number,
            customer_name,
            buyer_id,
            delivery_address,
            delivery_fee,
            total_amount,
            delivery_status,
            delivery_breakdown,
            situation,
            order_source,
            created_at,
            order_shipments(
              id,
              status,
              carrier,
              provider_slug,
              service_code,
              service_name,
              tracking_number,
              tracking_url,
              label_url,
              external_label_id,
              price,
              kind,
              created_at,
              updated_at,
              paid_at,
              delivered_at,
              cancelled_at
            )
          `)
          .eq("partner_id", partnerId)
          .eq("delivery_type", "delivery")
          .or("delivery_breakdown->>source.eq.superfrete")

        if (cursor) q = q.or(buildKeysetFilter(cursor))

        const { data, error } = await q
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(fetchLimit)

        if (error) throw error

        // O filtro por JSONB no banco já restringe aos pedidos de transportadora;
        // a checagem em JS cobre pedidos antigos com etiqueta e sem breakdown.
        const rows = (data || []).filter((row: any) => {
          const breakdown = row.delivery_breakdown as any
          const isCarrierBreakdown = breakdown?.source === "superfrete"
          const hasShipment = (row.order_shipments || []).some((s: any) => s?.kind !== "return")
          return isCarrierBreakdown || hasShipment
        })

        const hasMore = rows.length > limit
        const items = (hasMore ? rows.slice(0, limit) : rows).map((row: any) => {
          const shipments = (row.order_shipments || [])
            .filter((s: any) => s?.kind !== "return")
            .sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
          const shipment = shipments[0] || null
          const breakdown = (row.delivery_breakdown || {}) as Record<string, any>

          const isCancelled = row.situation === "cancelled" || row.delivery_status === "cancelled"
          const resolvedCarrierStatus = isCancelled ? "cancelled" : (shipment?.status || "awaiting_label")

          return {
            id: row.id,
            orderId: row.id,
            orderNumber: row.order_number || `#${String(row.id).slice(0, 8).toUpperCase()}`,
            customerName: row.customer_name || "Consumidor final",
            customerAddress: row.delivery_address || "",
            totalAmount: Number(row.total_amount || 0),
            deliveryFee: Number(row.delivery_fee || 0),
            orderSource: row.order_source || "Manual",
            situation: row.situation || "pending",
            orderStatus: row.delivery_status || "not_sent",
            carrierStatus: resolvedCarrierStatus,
            carrierName: breakdown.companyName || shipment?.carrier || breakdown.carrier || "Transportadora",
            serviceName: breakdown.serviceName || shipment?.service_name || null,
            serviceCode: shipment?.service_code || null,
            deliveryMinDays: breakdown.deliveryMinDays ?? null,
            deliveryMaxDays: breakdown.deliveryMaxDays ?? null,
            price: shipment?.price != null ? Number(shipment.price) : Number(breakdown.originalFee || 0),
            trackingNumber: shipment?.tracking_number || null,
            trackingUrl: shipment?.tracking_url || null,
            labelUrl: shipment?.label_url || null,
            externalLabelId: shipment?.external_label_id || null,
            hasLabel: Boolean(shipment?.external_label_id),
            createdAt: row.created_at || null,
            createdAtMs: new Date(row.created_at || 0).getTime(),
          }
        })

        const last = items[items.length - 1]
        const nextCursor = hasMore && last?.createdAt
          ? { createdAt: String(last.createdAt), id: String(last.id) }
          : null

        return { success: true as const, items, nextCursor, hasMore }
      },
      30,
    )
  } catch (e: any) {
    return { success: false, error: e?.message || "Erro ao carregar envios da transportadora." }
  }
}
