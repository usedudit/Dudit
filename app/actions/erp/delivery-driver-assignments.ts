"use server"

import { revalidatePath } from "next/cache"
import { requirePartnerRouteAccess, requireUser } from "@/lib/auth/authorization"
import { getAdminClient } from "@/lib/supabase/admin"
import { logAuditEvent } from "@/lib/services/timeline.service"
import { getCachedErpPage } from "@/lib/data/erp-page-cache"
import { TAGS } from "@/lib/utils/revalidation-tags"

export async function fetchAvailablePlatformDeliveryDriversAction(partnerId: string, deliveryId?: string) {
  await requireUser()
  await requirePartnerRouteAccess(partnerId, "logistics", { specificPermission: "can_assign_driver" })

  return getCachedErpPage(
    ["erp-available-platform-drivers", partnerId, deliveryId || "all"],
    [TAGS.partner(partnerId)],
    async () => {
      const admin = getAdminClient()
      const [{ data: drivers }, { data: links }] = await Promise.all([
        admin.from("delivery_drivers").select("user_id, city, neighborhood, vehicle_type, availability_status").eq("is_active", true).eq("availability_status", "available").order("created_at", { ascending: true }),
        admin.from("delivery_driver_partners").select("driver_id").eq("partner_id", partnerId).eq("is_active", true),
      ])
      const driverIds = (drivers || []).map((driver: any) => String(driver.user_id)).filter(Boolean)
      if (driverIds.length === 0) return []
      let occupiedQuery = admin.from("delivery_assignments").select("driver_id").in("driver_id", driverIds).in("status", ["assigned", "accepted", "picked_up", "out_for_delivery"])
      if (deliveryId) occupiedQuery = occupiedQuery.neq("delivery_id", deliveryId)
      const [{ data: occupied }, { data: allLinked }] = await Promise.all([
        occupiedQuery,
        admin.from("delivery_driver_partners").select("driver_id").in("driver_id", driverIds),
      ])
      const linkedIds = new Set((links || []).map((row: any) => String(row.driver_id)))
      const occupiedIds = new Set((occupied || []).map((row: any) => String(row.driver_id)))
      const restrictedIds = new Set((allLinked || []).map((row: any) => String(row.driver_id)))
      const eligible = (drivers || []).filter((driver: any) => !occupiedIds.has(String(driver.user_id)) && (!restrictedIds.has(String(driver.user_id)) || linkedIds.has(String(driver.user_id))))
      const profiles = eligible.length ? (await admin.from("user_profiles").select("user_id, full_name").in("user_id", eligible.map((row: any) => row.user_id))).data || [] : []
      const nameById = new Map((profiles as any[]).map((row) => [String(row.user_id), String(row.full_name || "Entregador")]))
      return eligible.map((driver: any) => ({ id: String(driver.user_id), userId: String(driver.user_id), fullName: nameById.get(String(driver.user_id)) || "Entregador", vehicleType: driver.vehicle_type }))
    },
    15,
  )
}

export async function assignPlatformDriverToDeliveryAction(input: {
  partnerId: string
  deliveryId: string
  orderIds: string[]
  driverId: string
  notes?: string
}) {
  const user = await requireUser()
  await requirePartnerRouteAccess(input.partnerId, "logistics", { specificPermission: "can_assign_driver" })
  const orderIds = Array.from(new Set(input.orderIds || [])).filter(Boolean)
  if (!input.deliveryId || !input.driverId || orderIds.length === 0) return { success: false as const, error: "Dados da atribuição inválidos." }
  const admin = getAdminClient()

  if (!orderIds.includes(input.deliveryId)) {
    const { data: delivery } = await admin
      .from("deliveries")
      .select("id")
      .eq("id", input.deliveryId)
      .eq("partner_id", input.partnerId)
      .maybeSingle()
    if (!delivery) return { success: false as const, error: "Entrega não encontrada para este parceiro." }
  }

  if (input.driverId === "dudit_network" || input.driverId === "platform:dudit_network") {
    const { data: orders } = await admin.from("orders").select("id, partner_id, delivery_fee").in("id", orderIds).eq("partner_id", input.partnerId)
    if (!orders || orders.length === 0) return { success: false as const, error: "Pedidos não encontrados." }

    await admin
      .from("delivery_assignments")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .in("order_id", orderIds)
      .in("status", ["available", "requested", "assigned"])

    const rows = orders.map((order: any) => ({
      order_id: order.id,
      delivery_id: input.deliveryId,
      partner_id: input.partnerId,
      driver_id: null,
      assigned_by: user.id,
      status: "available",
      delivery_fee: Number(order.delivery_fee || 0),
      notes: String(input.notes || "").trim().slice(0, 500) || null,
      assigned_at: new Date().toISOString(),
    }))

    const { data: inserted, error } = await admin.from("delivery_assignments").insert(rows).select("id")
    if (error) return { success: false as const, error: "Não foi possível solicitar entrega Dudit: " + error.message }

    await logAuditEvent({
      partnerId: input.partnerId,
      actorUserId: user.id,
      entityType: "delivery_assignment",
      entityId: inserted?.[0]?.id || input.deliveryId,
      actionType: "dudit_delivery_requested",
      changeLines: ["Entrega solicitada para a rede de entregadores Dudit"],
      metadata: { deliveryId: input.deliveryId, orderCount: rows.length },
      source: "erp",
    })

    revalidatePath("/erp/entregas")
    revalidatePath("/erp/logistica")
    revalidatePath("/erp/pedidos")
    revalidatePath("/entregadores")
    revalidatePath("/entregadores/entregas-disponiveis")
    return { success: true as const, count: rows.length }
  }
  const [{ data: driver }, { data: orders }, { data: existing }, { data: driverPartners }, { data: activeDriverAssignments }] = await Promise.all([
    admin.from("delivery_drivers").select("user_id, is_active, availability_status").eq("user_id", input.driverId).maybeSingle(),
    admin.from("orders").select("id, partner_id, delivery_fee").in("id", orderIds).eq("partner_id", input.partnerId),
    admin.from("delivery_assignments").select("order_id").in("order_id", orderIds).in("status", ["assigned", "accepted", "picked_up", "out_for_delivery"]),
    admin.from("delivery_driver_partners").select("partner_id").eq("driver_id", input.driverId).eq("is_active", true),
    admin.from("delivery_assignments").select("id").eq("driver_id", input.driverId).in("status", ["assigned", "accepted", "picked_up", "out_for_delivery"]).limit(1),
  ])
  if (!driver?.is_active || driver.availability_status !== "available" || !orders || orders.length !== orderIds.length) return { success: false as const, error: "Entregador ou pedidos inválidos." }
  if ((activeDriverAssignments || []).length > 0) return { success: false as const, error: "Este entregador já está ocupado." }
  const linkedPartners = (driverPartners || []).map((row: any) => String(row.partner_id))
  if (linkedPartners.length > 0 && !linkedPartners.includes(input.partnerId)) {
    return { success: false as const, error: "Este entregador não está disponível para este parceiro." }
  }
  const existingIds = new Set((existing || []).map((row: any) => String(row.order_id)))
  const rows = orders.filter((order: any) => !existingIds.has(String(order.id))).map((order: any) => ({
    order_id: order.id,
    delivery_id: input.deliveryId,
    partner_id: input.partnerId,
    driver_id: input.driverId,
    assigned_by: user.id,
    status: "assigned",
    delivery_fee: Number(order.delivery_fee || 0),
    notes: String(input.notes || "").trim().slice(0, 500) || null,
  }))
  if (rows.length === 0) return { success: false as const, error: "Os pedidos já possuem entregas ativas." }
  const { data: inserted, error } = await admin.from("delivery_assignments").insert(rows).select("id")
  if (error) return { success: false as const, error: "Não foi possível atribuir o entregador." }
  await logAuditEvent({
    partnerId: input.partnerId,
    actorUserId: user.id,
    entityType: "delivery_assignment",
    entityId: inserted?.[0]?.id || input.deliveryId,
    actionType: "delivery_assignment_created",
    changeLines: ["Entregador atribuído à entrega"],
    metadata: { deliveryId: input.deliveryId, driverId: input.driverId, orderCount: rows.length },
    source: "erp",
  })
  revalidatePath("/erp/entregas")
  revalidatePath("/erp/logistica")
  revalidatePath("/entregadores")
  return { success: true as const, count: rows.length }
}

export async function requestDuditDeliveryAction(input: {
  partnerId: string
  orderId?: string
  orderIds?: string[]
  deliveryId?: string | null
  notes?: string
}) {
  const user = await requireUser()
  await requirePartnerRouteAccess(input.partnerId, "logistics", { specificPermission: "can_assign_driver" })
  const orderIds = Array.from(new Set(input.orderIds || (input.orderId ? [input.orderId] : []))).filter(Boolean)
  if (orderIds.length === 0) return { success: false as const, error: "Nenhum pedido informado." }

  const admin = getAdminClient()

  const { data: orders } = await admin
    .from("orders")
    .select("id, partner_id, delivery_fee, delivery_status, store_id")
    .in("id", orderIds)
    .eq("partner_id", input.partnerId)

  if (!orders || orders.length === 0) {
    return { success: false as const, error: "Pedidos não encontrados." }
  }

  if (input.deliveryId && !orderIds.includes(input.deliveryId)) {
    const { data: delivery } = await admin
      .from("deliveries")
      .select("id")
      .eq("id", input.deliveryId)
      .eq("partner_id", input.partnerId)
      .maybeSingle()
    if (!delivery) return { success: false as const, error: "Entrega não encontrada para este parceiro." }
  }

  // Cancel any existing active assignment for these orders before creating the new request
  await admin
    .from("delivery_assignments")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .in("order_id", orderIds)
    .in("status", ["available", "requested", "assigned"])

  const rows = orders.map((order: any) => ({
    order_id: order.id,
    delivery_id: input.deliveryId || null,
    partner_id: input.partnerId,
    driver_id: null,
    assigned_by: user.id,
    status: "available",
    delivery_fee: Number(order.delivery_fee || 0),
    notes: String(input.notes || "").trim().slice(0, 500) || null,
    assigned_at: new Date().toISOString(),
  }))

  const { data: inserted, error } = await admin
    .from("delivery_assignments")
    .insert(rows)
    .select("id")

  if (error || !inserted || inserted.length === 0) {
    return { success: false as const, error: "Não foi possível solicitar a entrega Dudit: " + (error?.message || "") }
  }

  // Set order delivery_status to preparing if not already
  await admin
    .from("orders")
    .update({ delivery_status: "preparing" })
    .in("id", orderIds)
    .eq("partner_id", input.partnerId)
    .not("delivery_status", "in", '("preparing","sent","delivered")')

  await logAuditEvent({
    partnerId: input.partnerId,
    actorUserId: user.id,
    entityType: "delivery_assignment",
    entityId: inserted[0].id,
    actionType: "dudit_delivery_requested",
    changeLines: ["Entrega solicitada para a rede de entregadores Dudit"],
    metadata: { orderIds, deliveryId: input.deliveryId },
    source: "erp",
  })

  revalidatePath("/erp/entregas")
  revalidatePath("/erp/logistica")
  revalidatePath("/erp/pedidos")
  revalidatePath("/entregadores")
  revalidatePath("/entregadores/entregas-disponiveis")

  return { success: true as const, assignmentId: inserted[0].id, count: inserted.length }
}

export async function cancelDuditDeliveryRequestAction(input: {
  partnerId: string
  orderId: string
}) {
  const user = await requireUser()
  await requirePartnerRouteAccess(input.partnerId, "logistics", { specificPermission: "can_assign_driver" })
  const admin = getAdminClient()

  const { data: assignment } = await admin
    .from("delivery_assignments")
    .select("id, status")
    .eq("order_id", input.orderId)
    .eq("partner_id", input.partnerId)
    .in("status", ["available", "requested", "assigned", "accepted"])
    .order("assigned_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!assignment) {
    return { success: false as const, error: "Nenhuma solicitação ativa encontrada para cancelar." }
  }

  const { error } = await admin
    .from("delivery_assignments")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", assignment.id)

  if (error) {
    return { success: false as const, error: "Não foi possível cancelar a solicitação." }
  }

  await logAuditEvent({
    partnerId: input.partnerId,
    actorUserId: user.id,
    entityType: "delivery_assignment",
    entityId: assignment.id,
    actionType: "dudit_delivery_cancelled",
    changeLines: ["Solicitação de entregador Dudit cancelada"],
    metadata: { orderId: input.orderId },
    source: "erp",
  })

  revalidatePath("/erp/entregas")
  revalidatePath("/erp/logistica")
  revalidatePath("/erp/pedidos")
  revalidatePath("/entregadores")
  revalidatePath("/entregadores/entregas-disponiveis")

  return { success: true as const }
}

export async function getDuditDeliveryRequestStatusAction(input: {
  partnerId: string
  orderId: string
}) {
  await requireUser()
  await requirePartnerRouteAccess(input.partnerId, "logistics")
  const admin = getAdminClient()

  const { data: assignment } = await admin
    .from("delivery_assignments")
    .select(`
      id,
      status,
      assigned_at,
      accepted_at,
      picked_up_at,
      out_for_delivery_at,
      completed_at,
      delivery_fee,
      notes,
      driver_id
    `)
    .eq("order_id", input.orderId)
    .eq("partner_id", input.partnerId)
    .in("status", ["available", "requested", "assigned", "accepted", "picked_up", "out_for_delivery", "delivered"])
    .order("assigned_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!assignment) {
    return { success: true as const, activeRequest: null }
  }

  let driverInfo: { name: string; phone?: string; vehicleType?: string } | null = null
  if (assignment.driver_id) {
    const [{ data: profile }, { data: driver }] = await Promise.all([
      admin.from("user_profiles").select("full_name, phone").eq("user_id", assignment.driver_id).maybeSingle(),
      admin.from("delivery_drivers").select("vehicle_type").eq("user_id", assignment.driver_id).maybeSingle(),
    ])
    driverInfo = {
      name: profile?.full_name || "Entregador Dudit",
      phone: profile?.phone || undefined,
      vehicleType: driver?.vehicle_type || undefined,
    }
  }

  return {
    success: true as const,
    activeRequest: {
      id: assignment.id,
      status: assignment.status,
      assignedAt: assignment.assigned_at,
      acceptedAt: assignment.accepted_at,
      pickedUpAt: assignment.picked_up_at,
      outForDeliveryAt: assignment.out_for_delivery_at,
      completedAt: assignment.completed_at,
      deliveryFee: Number(assignment.delivery_fee || 0),
      notes: assignment.notes || "",
      driver: driverInfo,
    },
  }
}

export async function syncPlatformDriverForOrderAction(input: {
  partnerId: string
  orderId: string
  driverId: string | null
  deliveryId?: string | null
  notes?: string
}) {
  if (!input.driverId) {
    return { success: true as const }
  }
  if (input.driverId === "dudit_network") {
    return requestDuditDeliveryAction({
      partnerId: input.partnerId,
      orderId: input.orderId,
      deliveryId: input.deliveryId,
      notes: input.notes,
    })
  }
  return assignPlatformDriverToDeliveryAction({
    partnerId: input.partnerId,
    deliveryId: input.deliveryId || input.orderId,
    orderIds: [input.orderId],
    driverId: input.driverId,
    notes: input.notes,
  })
}
