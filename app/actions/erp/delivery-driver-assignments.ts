"use server"

import { revalidatePath } from "next/cache"
import { requirePartnerRouteAccess, requireUser } from "@/lib/auth/authorization"
import { getAdminClient } from "@/lib/supabase/admin"
import { logAuditEvent } from "@/lib/services/timeline.service"

export async function fetchAvailablePlatformDeliveryDriversAction(partnerId: string, deliveryId?: string) {
  await requireUser()
  await requirePartnerRouteAccess(partnerId, "logistics", { specificPermission: "can_assign_driver" })
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
  revalidatePath("/erp/logistica")
  revalidatePath("/entregadores")
  return { success: true as const, count: rows.length }
}

export async function syncPlatformDriverForOrderAction(input: {
  partnerId: string
  orderId: string
  driverId?: string | null
  notes?: string
}) {
  await requirePartnerRouteAccess(input.partnerId, "logistics", { specificPermission: "can_assign_driver" })
  const admin = getAdminClient()
  const { data: link } = await admin
    .from("delivery_orders")
    .select("delivery_id, deliveries!inner(id, partner_id, status)")
    .eq("order_id", input.orderId)
    .eq("deliveries.partner_id", input.partnerId)
    .in("deliveries.status", ["pending", "not_sent", "preparing"])
    .limit(1)
    .maybeSingle()

  if (!link?.delivery_id) return { success: true as const }

  await admin
    .from("delivery_assignments")
    .update({ status: "cancelled" })
    .eq("delivery_id", link.delivery_id)
    .eq("order_id", input.orderId)
    .in("status", ["assigned", "accepted", "picked_up", "out_for_delivery"])

  if (!input.driverId) return { success: true as const }
  return assignPlatformDriverToDeliveryAction({
    partnerId: input.partnerId,
    deliveryId: String(link.delivery_id),
    orderIds: [input.orderId],
    driverId: input.driverId,
    notes: input.notes,
  })
}
