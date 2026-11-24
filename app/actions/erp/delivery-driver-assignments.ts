"use server"

import { revalidatePath } from "next/cache"
import { requirePartnerRouteAccess, requireUser } from "@/lib/auth/authorization"
import { getAdminClient } from "@/lib/supabase/admin"
import { logAuditEvent } from "@/lib/services/timeline.service"
import { getCachedErpPage } from "@/lib/data/erp-page-cache"
import { TAGS } from "@/lib/utils/revalidation-tags"

interface OrderPackageDimensionsSummary {
  dimensionsUnknown: boolean
  totalWeightKg: number | null
  totalVolumeL: number | null
  missingProducts: Array<{ productId: string | null; productName: string }>
  perOrder: Map<string, { weightKg: number | null; volumeL: number | null; dimensionsUnknown: boolean }>
}

async function computeOrdersPackageDimensions(admin: any, orderIds: string[]): Promise<OrderPackageDimensionsSummary> {
  const perOrder = new Map<string, { weightKg: number | null; volumeL: number | null; dimensionsUnknown: boolean }>()
  const missingMap = new Map<string, { productId: string | null; productName: string }>()

  if (orderIds.length === 0) {
    return { dimensionsUnknown: false, totalWeightKg: null, totalVolumeL: null, missingProducts: [], perOrder }
  }

  const { data: items } = await admin
    .from("order_items")
    .select("order_id, product_id, product_name, quantity")
    .in("order_id", orderIds)

  const rows = Array.isArray(items) ? items : []
  const productIds = Array.from(new Set(rows.map((r: any) => r.product_id).filter(Boolean)))

  const logisticsByProduct = new Map<string, { weight_gross?: number; weight_net?: number; width?: number; height?: number; length?: number }>()
  if (productIds.length > 0) {
    const { data: logisticsRows } = await admin
      .from("product_logistics")
      .select("product_id, weight_gross, weight_net, width, height, length")
      .in("product_id", productIds)

    for (const row of logisticsRows || []) {
      if (row?.product_id) {
        logisticsByProduct.set(String(row.product_id), row)
      }
    }
  }

  let grandWeight = 0
  let grandVolume = 0

  for (const orderId of orderIds) {
    const orderItems = rows.filter((r: any) => String(r.order_id) === String(orderId))
    if (orderItems.length === 0) {
      perOrder.set(orderId, { weightKg: null, volumeL: null, dimensionsUnknown: true })
      continue
    }

    let orderWeight = 0
    let orderVolume = 0
    let orderHasMissing = false

    for (const item of orderItems) {
      const qty = Math.max(Number(item.quantity || 1), 1)
      const pl = item.product_id ? logisticsByProduct.get(String(item.product_id)) : undefined
      const gross = Number(pl?.weight_gross || 0)
      const net = Number(pl?.weight_net || 0)
      const unitWeight = gross > 0 ? gross : (net > 0 ? net : 0)

      const w = Number(pl?.width || 0)
      const h = Number(pl?.height || 0)
      const l = Number(pl?.length || 0)
      const unitVolumeL = w > 0 && h > 0 && l > 0 ? (w * h * l) / 1000 : 0

      if (unitWeight <= 0 && unitVolumeL <= 0) {
        orderHasMissing = true
        const key = String(item.product_id || item.product_name || "unknown")
        if (!missingMap.has(key)) {
          missingMap.set(key, {
            productId: item.product_id ? String(item.product_id) : null,
            productName: String(item.product_name || "Produto sem nome"),
          })
        }
      }

      orderWeight += unitWeight * qty
      orderVolume += unitVolumeL * qty
    }

    grandWeight += orderWeight
    grandVolume += orderVolume

    const roundedWeight = orderWeight > 0 ? Math.round(orderWeight * 1000) / 1000 : null
    const roundedVolume = orderVolume > 0 ? Math.round(orderVolume * 1000) / 1000 : null
    const unknown = orderHasMissing || (roundedWeight === null && roundedVolume === null)
    perOrder.set(orderId, { weightKg: roundedWeight, volumeL: roundedVolume, dimensionsUnknown: unknown })
  }

  const totalWeightKg = grandWeight > 0 ? Math.round(grandWeight * 1000) / 1000 : null
  const totalVolumeL = grandVolume > 0 ? Math.round(grandVolume * 1000) / 1000 : null
  const missingProducts = Array.from(missingMap.values())
  const dimensionsUnknown = missingProducts.length > 0 || (totalWeightKg === null && totalVolumeL === null)

  return {
    dimensionsUnknown,
    totalWeightKg,
    totalVolumeL,
    missingProducts,
    perOrder,
  }
}

export async function checkOrderDimensionsForDeliveryAction(input: {
  partnerId: string
  orderIds?: string[]
  draftItems?: Array<{ productId?: string | null; productName?: string; quantity?: number }>
}) {
  await requireUser()
  await requirePartnerRouteAccess(input.partnerId, "logistics")
  const admin = getAdminClient()

  const draftItems = Array.isArray(input.draftItems) ? input.draftItems : []
  if (draftItems.length > 0) {
    const productIds = Array.from(new Set(draftItems.map((r) => r.productId).filter(Boolean) as string[]))
    const logisticsByProduct = new Map<string, { weight_gross?: number; weight_net?: number; width?: number; height?: number; length?: number }>()

    if (productIds.length > 0) {
      const { data: logisticsRows } = await admin
        .from("product_logistics")
        .select("product_id, weight_gross, weight_net, width, height, length")
        .in("product_id", productIds)

      for (const row of logisticsRows || []) {
        if (row?.product_id) {
          logisticsByProduct.set(String(row.product_id), row)
        }
      }
    }

    const missingMap = new Map<string, { productId: string | null; productName: string }>()
    let totalWeight = 0
    let totalVolume = 0

    for (const item of draftItems) {
      const qty = Math.max(Number(item.quantity || 1), 1)
      const pl = item.productId ? logisticsByProduct.get(String(item.productId)) : undefined
      const gross = Number(pl?.weight_gross || 0)
      const net = Number(pl?.weight_net || 0)
      const unitWeight = gross > 0 ? gross : (net > 0 ? net : 0)

      const w = Number(pl?.width || 0)
      const h = Number(pl?.height || 0)
      const l = Number(pl?.length || 0)
      const unitVolumeL = w > 0 && h > 0 && l > 0 ? (w * h * l) / 1000 : 0

      if (unitWeight <= 0 && unitVolumeL <= 0) {
        const key = String(item.productId || item.productName || "unknown")
        if (!missingMap.has(key)) {
          missingMap.set(key, {
            productId: item.productId ? String(item.productId) : null,
            productName: String(item.productName || "Produto sem nome"),
          })
        }
      }

      totalWeight += unitWeight * qty
      totalVolume += unitVolumeL * qty
    }

    const totalWeightKg = totalWeight > 0 ? Math.round(totalWeight * 1000) / 1000 : null
    const totalVolumeL = totalVolume > 0 ? Math.round(totalVolume * 1000) / 1000 : null
    const missingProducts = Array.from(missingMap.values())
    const dimensionsUnknown = missingProducts.length > 0 || (totalWeightKg === null && totalVolumeL === null)

    return {
      success: true as const,
      dimensionsUnknown,
      totalWeightKg,
      totalVolumeL,
      missingProducts,
    }
  }

  const orderIds = Array.from(new Set(input.orderIds || [])).filter(Boolean)
  if (orderIds.length === 0) {
    return {
      success: true as const,
      dimensionsUnknown: false,
      totalWeightKg: null as number | null,
      totalVolumeL: null as number | null,
      missingProducts: [] as Array<{ productId: string | null; productName: string }>,
    }
  }

  const { data: validOrders } = await admin
    .from("orders")
    .select("id")
    .in("id", orderIds)
    .eq("partner_id", input.partnerId)

  const validOrderIds = (validOrders || []).map((o: any) => String(o.id))
  const summary = await computeOrdersPackageDimensions(admin, validOrderIds)

  return {
    success: true as const,
    dimensionsUnknown: summary.dimensionsUnknown,
    totalWeightKg: summary.totalWeightKg,
    totalVolumeL: summary.totalVolumeL,
    missingProducts: summary.missingProducts,
  }
}

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

    const dims = await computeOrdersPackageDimensions(admin, orders.map((o: any) => String(o.id)))

    await admin
      .from("delivery_assignments")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .in("order_id", orderIds)
      .in("status", ["available", "requested", "assigned"])

    const rows = orders.map((order: any) => {
      const orderDims = dims.perOrder.get(String(order.id))
      return {
        order_id: order.id,
        delivery_id: input.deliveryId,
        partner_id: input.partnerId,
        driver_id: null,
        assigned_by: user.id,
        status: "available",
        delivery_fee: Number(order.delivery_fee || 0),
        notes: String(input.notes || "").trim().slice(0, 500) || null,
        assigned_at: new Date().toISOString(),
        dimensions_unknown: orderDims ? orderDims.dimensionsUnknown : dims.dimensionsUnknown,
      }
    })

    const { data: inserted, error } = await admin.from("delivery_assignments").insert(rows).select("id")
    if (error) return { success: false as const, error: "Não foi possível solicitar entrega Dudit: " + error.message }

    await Promise.all(
      orders.map((order: any) => {
        const orderDims = dims.perOrder.get(String(order.id))
        if (!orderDims || (orderDims.weightKg === null && orderDims.volumeL === null)) return Promise.resolve()
        return admin
          .from("orders")
          .update({
            package_weight_kg: orderDims.weightKg,
            package_volume_l: orderDims.volumeL,
          })
          .eq("id", order.id)
          .eq("partner_id", input.partnerId)
      })
    )

    await logAuditEvent({
      partnerId: input.partnerId,
      actorUserId: user.id,
      entityType: "delivery_assignment",
      entityId: inserted?.[0]?.id || input.deliveryId,
      actionType: "dudit_delivery_requested",
      changeLines: ["Entrega solicitada para a rede de entregadores Dudit"],
      metadata: {
        deliveryId: input.deliveryId,
        orderCount: rows.length,
        dimensionsUnknown: dims.dimensionsUnknown,
        missingDimensionsCount: dims.missingProducts.length,
        totalWeightKg: dims.totalWeightKg,
        totalVolumeL: dims.totalVolumeL,
      },
      source: "erp",
    })

    try { await admin.rpc("dispatch_tick") } catch { }

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
  acknowledgeUnknownDimensions?: boolean
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

  const dims = await computeOrdersPackageDimensions(admin, orders.map((o: any) => String(o.id)))

  // Cancel any existing active assignment for these orders before creating the new request
  await admin
    .from("delivery_assignments")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .in("order_id", orderIds)
    .in("status", ["available", "requested", "assigned"])

  const rows = orders.map((order: any) => {
    const orderDims = dims.perOrder.get(String(order.id))
    return {
      order_id: order.id,
      delivery_id: input.deliveryId || null,
      partner_id: input.partnerId,
      driver_id: null,
      assigned_by: user.id,
      status: "available",
      delivery_fee: Number(order.delivery_fee || 0),
      notes: String(input.notes || "").trim().slice(0, 500) || null,
      assigned_at: new Date().toISOString(),
      dimensions_unknown: orderDims ? orderDims.dimensionsUnknown : dims.dimensionsUnknown,
    }
  })

  const { data: inserted, error } = await admin
    .from("delivery_assignments")
    .insert(rows)
    .select("id")

  if (error || !inserted || inserted.length === 0) {
    return { success: false as const, error: "Não foi possível solicitar a entrega Dudit: " + (error?.message || "") }
  }

  // Persistir peso/volume agregados nos pedidos quando conhecidos
  await Promise.all(
    orders.map((order: any) => {
      const orderDims = dims.perOrder.get(String(order.id))
      if (!orderDims || (orderDims.weightKg === null && orderDims.volumeL === null)) return Promise.resolve()
      return admin
        .from("orders")
        .update({
          package_weight_kg: orderDims.weightKg,
          package_volume_l: orderDims.volumeL,
        })
        .eq("id", order.id)
        .eq("partner_id", input.partnerId)
    })
  )

  // Set order delivery_status to preparing if not already
  await admin
    .from("orders")
    .update({ delivery_status: "preparing" })
    .in("id", orderIds)
    .eq("partner_id", input.partnerId)
    .not("delivery_status", "in", '("preparing","sent","delivered")')

  const changeLines = ["Entrega solicitada para a rede de entregadores Dudit"]
  if (dims.dimensionsUnknown && input.acknowledgeUnknownDimensions) {
    changeLines.push(
      `Parceiro confirmou envio com ${dims.missingProducts.length || "itens"} produto(s) sem peso/dimensão informados`
    )
  }

  await logAuditEvent({
    partnerId: input.partnerId,
    actorUserId: user.id,
    entityType: "delivery_assignment",
    entityId: inserted[0].id,
    actionType: "dudit_delivery_requested",
    changeLines,
    metadata: {
      orderIds,
      deliveryId: input.deliveryId,
      dimensionsUnknown: dims.dimensionsUnknown,
      acknowledgedUnknownDimensions: Boolean(input.acknowledgeUnknownDimensions),
      missingDimensionsCount: dims.missingProducts.length,
      totalWeightKg: dims.totalWeightKg,
      totalVolumeL: dims.totalVolumeL,
    },
    source: "erp",
  })

  try { await admin.rpc("dispatch_tick") } catch { }

  revalidatePath("/erp/entregas")
  revalidatePath("/erp/logistica")
  revalidatePath("/erp/pedidos")
  revalidatePath("/entregadores")
  revalidatePath("/entregadores/entregas-disponiveis")

  return {
    success: true as const,
    assignmentId: inserted[0].id,
    count: inserted.length,
    dimensionsUnknown: dims.dimensionsUnknown,
  }
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
    .select("id, status, delivery_id")
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

  if (assignment.delivery_id) {
    await admin
      .from("deliveries")
      .update({
        delivery_person_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", assignment.delivery_id)
      .or("delivery_person_id.is.null,delivery_person_id.eq.dudit_network,delivery_person_id.eq.platform:dudit_network")
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
      delivery_id,
      status,
      assigned_at,
      accepted_at,
      picked_up_at,
      out_for_delivery_at,
      completed_at,
      delivery_fee,
      bonus_amount,
      bonus_reason,
      dispatch_tier,
      dispatch_started_at,
      dispatch_exhausted_at,
      dispatch_exhausted_reason,
      notes,
      driver_id,
      dimensions_unknown
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

  // Avança tiers sob demanda enquanto houver solicitação aberta (sem depender de pg_cron ocioso)
  if (!assignment.driver_id && assignment.status === "available" && !assignment.dispatch_exhausted_at) {
    try {
      await admin.rpc("dispatch_tick")
      const { data: refreshed } = await admin
        .from("delivery_assignments")
        .select("dispatch_tier, dispatch_exhausted_at, dispatch_exhausted_reason")
        .eq("id", assignment.id)
        .maybeSingle()
      if (refreshed) {
        assignment.dispatch_tier = refreshed.dispatch_tier
        assignment.dispatch_exhausted_at = refreshed.dispatch_exhausted_at
        assignment.dispatch_exhausted_reason = refreshed.dispatch_exhausted_reason
      }
    } catch { }
  }

  let suggestedFee: number | null = null
  let economicCapKm: number | null = null
  if (assignment.dispatch_exhausted_at) {
    const { data: lastEvent } = await admin
      .from("delivery_dispatch_events")
      .select("suggested_fee, economic_cap_km")
      .eq("assignment_id", assignment.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (lastEvent?.suggested_fee != null) suggestedFee = Number(lastEvent.suggested_fee)
    if (lastEvent?.economic_cap_km != null) economicCapKm = Number(lastEvent.economic_cap_km)
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
      bonusAmount: Number(assignment.bonus_amount || 0),
      bonusReason: assignment.bonus_reason || "",
      dispatchTier: Number(assignment.dispatch_tier || 0),
      dispatchStartedAt: assignment.dispatch_started_at || null,
      dispatchExhaustedAt: assignment.dispatch_exhausted_at || null,
      dispatchExhaustedReason: assignment.dispatch_exhausted_reason || null,
      suggestedFee,
      economicCapKm,
      notes: assignment.notes || "",
      dimensionsUnknown: Boolean(assignment.dimensions_unknown),
      driver: driverInfo,
    },
  }
}

export async function authorizeDeliveryBonusAction(input: {
  partnerId: string
  assignmentId: string
  amount: number
  reason?: string
}) {
  const user = await requireUser()
  await requirePartnerRouteAccess(input.partnerId, "logistics", { specificPermission: "can_assign_driver" })

  const amount = Number(input.amount)
  if (!Number.isFinite(amount) || amount <= 0 || amount > 500) {
    return { success: false as const, error: "Informe um valor de bônus válido (entre R$ 0,01 e R$ 500,00)." }
  }

  const admin = getAdminClient()
  const { data: existing } = await admin
    .from("delivery_assignments")
    .select("id, order_id, partner_id")
    .eq("id", input.assignmentId)
    .eq("partner_id", input.partnerId)
    .maybeSingle()

  if (!existing) {
    return { success: false as const, error: "Solicitação de entrega não encontrada para este parceiro." }
  }

  const { data, error } = await admin.rpc("authorize_delivery_bonus", {
    p_assignment_id: input.assignmentId,
    p_amount: amount,
    p_reason: input.reason?.trim() || null,
    p_actor_user_id: user.id,
  })

  if (error) {
    return { success: false as const, error: "Não foi possível autorizar o bônus: " + error.message }
  }

  try { await admin.rpc("dispatch_tick") } catch { }

  await logAuditEvent({
    partnerId: input.partnerId,
    actorUserId: user.id,
    entityType: "delivery_assignment",
    entityId: input.assignmentId,
    actionType: "delivery_bonus_authorized",
    changeLines: [`Bônus de R$ ${amount.toFixed(2).replace(".", ",")} autorizado para entrega Dudit`],
    metadata: {
      assignmentId: input.assignmentId,
      orderId: existing.order_id,
      bonusAmount: amount,
      reason: input.reason?.trim() || null,
    },
    source: "erp",
  })

  revalidatePath("/erp/entregas")
  revalidatePath("/erp/logistica")
  revalidatePath("/erp/pedidos")
  revalidatePath("/entregadores")
  revalidatePath("/entregadores/entregas-disponiveis")

  return { success: true as const, data }
}

export async function reassignDuditDeliveryDriverAction(input: {
  partnerId: string
  assignmentId: string
  reason?: string
}) {
  const user = await requireUser()
  await requirePartnerRouteAccess(input.partnerId, "logistics", { specificPermission: "can_assign_driver" })
  const admin = getAdminClient()

  const { data: current } = await admin
    .from("delivery_assignments")
    .select("id, order_id, delivery_id, partner_id, driver_id, status, accepted_at, delivery_fee, bonus_amount, notes, dimensions_unknown")
    .eq("id", input.assignmentId)
    .eq("partner_id", input.partnerId)
    .maybeSingle()

  if (!current) {
    return { success: false as const, error: "Atribuição de entrega não encontrada." }
  }

  if (current.status !== "accepted") {
    return {
      success: false as const,
      error: "Só é possível reatribuir enquanto o entregador ainda não retirou o pedido na loja.",
    }
  }

  const nowIso = new Date().toISOString()
  const acceptedMs = current.accepted_at ? new Date(current.accepted_at).getTime() : 0
  const isNoShow = acceptedMs > 0 && Date.now() - acceptedMs >= 15 * 60 * 1000
  const cleanReason = String(input.reason || "").trim().slice(0, 300) || (isNoShow ? "Entregador não compareceu para retirada (>15 min)" : "Reatribuído pelo estabelecimento")

  // 1. Cancelar atribuição atual (e todas do mesmo delivery_id se agrupado)
  const cancelQuery = current.delivery_id
    ? admin.from("delivery_assignments").update({
        status: "cancelled",
        cancelled_at: nowIso,
        failure_reason: cleanReason,
        updated_at: nowIso,
      }).eq("delivery_id", current.delivery_id).eq("status", "accepted")
    : admin.from("delivery_assignments").update({
        status: "cancelled",
        cancelled_at: nowIso,
        failure_reason: cleanReason,
        updated_at: nowIso,
      }).eq("id", current.id)

  const { error: cancelErr } = await cancelQuery
  if (cancelErr) {
    return { success: false as const, error: "Não foi possível liberar a atribuição atual." }
  }

  // 2. Se passou de 15 min sem retirada (no-show), aplicar cooldown de 15 min no entregador anterior
  if (isNoShow && current.driver_id) {
    const cooldownUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString()
    await admin
      .from("delivery_drivers")
      .update({ cooldown_until: cooldownUntil, updated_at: nowIso })
      .eq("user_id", current.driver_id)
  }

  // 3. Limpar delivery_person_id na tabela deliveries se aplicável
  if (current.delivery_id) {
    await admin
      .from("deliveries")
      .update({ delivery_person_id: null, status: "pending", updated_at: nowIso })
      .eq("id", current.delivery_id)
  }

  // 4. Criar nova solicitação aberta para a rede Dudit
  const { data: created, error: createErr } = await admin
    .from("delivery_assignments")
    .insert({
      order_id: current.order_id,
      delivery_id: current.delivery_id || null,
      partner_id: current.partner_id,
      driver_id: null,
      assigned_by: user.id,
      status: "available",
      delivery_fee: Number(current.delivery_fee || 0),
      bonus_amount: Number(current.bonus_amount || 0),
      notes: current.notes || null,
      dimensions_unknown: Boolean(current.dimensions_unknown),
      assigned_at: nowIso,
    })
    .select("id")
    .single()

  if (createErr || !created) {
    return { success: false as const, error: "Não foi possível reenviar a solicitação para a rede." }
  }

  // 5. Evitar que o mesmo entregador que atrasou pegue imediatamente se foi no-show
  try { await admin.rpc("dispatch_tick") } catch { }

  await logAuditEvent({
    partnerId: input.partnerId,
    actorUserId: user.id,
    entityType: "delivery_assignment",
    entityId: created.id,
    actionType: "dudit_delivery_reassigned",
    changeLines: [`Entregador reatribuído pelo estabelecimento. Motivo: ${cleanReason}`],
    metadata: {
      previousAssignmentId: current.id,
      previousDriverId: current.driver_id,
      newAssignmentId: created.id,
      isNoShow,
      reason: cleanReason,
    },
    source: "erp",
  })

  revalidatePath("/erp/entregas")
  revalidatePath("/erp/logistica")
  revalidatePath("/erp/pedidos")
  revalidatePath("/entregadores")
  revalidatePath("/entregadores/entregas-disponiveis")

  return { success: true as const, newAssignmentId: created.id }
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
