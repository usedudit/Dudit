"use server"

import { revalidatePath } from "next/cache"
import { createHash } from "node:crypto"

import { requireDeliveryDriver } from "@/lib/auth/delivery-driver"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import type { DeliveryBucket } from "@/lib/delivery/types"
import { toCanonicalPaymentType } from "@/lib/payments/payment-method"
import { decryptCPF } from "@/lib/crypto"
import { getMaskedDeliveryLocation } from "@/lib/utils/address"

function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

function normalizeError(error: any, fallback: string) {
  const message = String(error?.message || error?.hint || error?.details || "")
  if (message.includes("delivery_driver_in_cooldown")) return "Você está em pausa temporária após recusas consecutivas. Aguarde alguns minutos para aceitar novas entregas."
  if (message.includes("delivery_driver_busy")) return "Você já atingiu seu limite de entregas simultâneas em andamento. Conclua uma para aceitar novas."
  if (message.includes("delivery_driver_different_partner_busy")) return "Você já possui entregas em andamento em outro estabelecimento. Conclua-as para aceitar entregas de outra loja."
  if (message.includes("delivery_offer_expired")) return "Esta oferta de entrega expirou (tempo limite de 15 minutos)."
  if (message.includes("delivery_assignment_already_accepted")) return "Esta entrega acabou de ser aceita por outro entregador."
  if (message.includes("delivery_already_assigned_to_team_driver")) return "Esta entrega já foi atribuída a um entregador da equipe da loja."
  if (message.includes("delivery_reassigned_to_team_driver")) return "Esta entrega foi reatribuída pelo estabelecimento a um entregador da equipe."
  if (message.includes("delivery_already_finished_or_cancelled")) return "Esta entrega já foi finalizada ou cancelada pelo estabelecimento."
  if (message.includes("order_already_dispatched_or_cancelled")) return "O pedido já saiu para entrega ou foi cancelado pelo estabelecimento."
  if (message.includes("delivery_assignment_cancelled")) return "Esta oferta de entrega foi cancelada pelo estabelecimento."
  if (message.includes("delivery_assignment_not_available")) return "Esta entrega não está mais disponível."
  if (message.includes("delivery_assignment_not_found")) return "Entrega não encontrada."
  if (message.includes("delivery_assignment_invalid_transition")) return "Essa transição de status não é permitida."
  if (message.includes("delivery_failure_reason_required")) return "Informe o motivo da falha."
  if (message.includes("delivery_assignment_not_owned")) return "Entrega não encontrada ou sem permissão."
  if (message.includes("delivery_driver_not_active")) return "Seu cadastro de entregador está inativo."
  if (message.includes("delivery_payment_confirmation_not_applicable")) return "A confirmação operacional só está disponível para pagamentos em dinheiro."
  if (message.includes("delivery_invitation_invalid")) return "Convite inválido, expirado ou não corresponde a esta conta."
  console.error("[normalizeError] Erro não mapeado:", message || fallback)
  return message ? `Erro: ${message.slice(0, 200)}` : fallback
}

export async function getDeliveryDashboardAction() {
  await requireDeliveryDriver()
  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase.rpc("get_my_delivery_dashboard")
  if (error) return { success: false as const, error: normalizeError(error, "Não foi possível carregar o painel.") }
  return { success: true as const, data }
}

export async function listMyDeliveryAssignmentsAction(params?: {
  bucket?: DeliveryBucket
  limit?: number
  beforeAssignedAt?: string | null
  beforeId?: string | null
}) {
  await requireDeliveryDriver()
  const supabase = await getSupabaseServerClient()
  const limit = Math.min(Math.max(Number(params?.limit || 20), 1), 50)
  const { data, error } = await supabase.rpc("get_my_delivery_assignments", {
    p_bucket: params?.bucket || "all",
    p_limit: limit + 1,
    p_before_assigned_at: params?.beforeAssignedAt || null,
    p_before_id: params?.beforeId || null,
  })

  if (error) {
    return { success: false as const, error: normalizeError(error, "Não foi possível carregar as entregas.") }
  }

  const rawRows = Array.isArray(data) ? data : []
  const hasMore = rawRows.length > limit
  const rows = hasMore ? rawRows.slice(0, limit) : rawRows

  const items = rows.map((row: any) => ({
    ...row,
    id: row.id || row.assignment_id,
    assignment_id: row.assignment_id || row.id,
    order_count: Number(row.order_count || 1),
    delivery_fee: Number(row.delivery_fee || 0),
    total_amount: Number(row.total_amount || 0),
    items: Array.isArray(row.items) ? row.items : [],
  }))

  const last = items[items.length - 1]
  const nextCursor = hasMore && last?.assigned_at && last?.id
    ? { assignedAt: String(last.assigned_at), id: String(last.id) }
    : null

  return {
    success: true as const,
    items,
    hasMore,
    nextCursor,
  }
}

export async function getMyDeliveryAssignmentAction(assignmentId: string) {
  await requireDeliveryDriver()
  if (!assignmentId) return { success: false as const, error: "ID inválido." }
  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase.rpc("get_my_delivery_assignment", {
    p_assignment_id: assignmentId,
  })

  if (error) return { success: false as const, error: normalizeError(error, "Não foi possível carregar a entrega.") }
  if (!data) return { success: false as const, error: "Entrega não encontrada." }

  // Garante que todas as paradas/pedidos vinculados ao delivery_id sejam hidratados corretamente
  if (data?.delivery_id && (!Array.isArray(data.orders) || data.orders.length <= 1)) {
    const { data: delOrders } = await supabase
      .from("delivery_orders")
      .select(`
        order_id,
        position,
        orders (
          id,
          order_number,
          customer_name,
          delivery_address,
          total_amount,
          delivery_fee,
          payment_method,
          situation,
          delivery_status,
          delivery_type,
          notes,
          created_at,
          buyer_id,
          order_items (
            id,
            product_name,
            quantity,
            product_price,
            subtotal,
            products (id, sku, unit, images),
            product_variants (id, sku, variant_options)
          )
        )
      `)
      .eq("delivery_id", data.delivery_id)
      .order("position", { ascending: true })

    if (delOrders && delOrders.length > 1) {
      const buyerIds = delOrders.map((d: any) => d.orders?.buyer_id).filter(Boolean)
      const { data: customerRows } = buyerIds.length > 0
        ? await supabase.from("customers").select("id, name, phone, email").in("id", buyerIds)
        : { data: [] }
      const custMap = new Map((customerRows || []).map((c: any) => [c.id, c]))

      data.orders = delOrders.map((d: any) => {
        const ord = d.orders || {}
        const cust = ord.buyer_id ? custMap.get(ord.buyer_id) : null
        const rawItems = ord.order_items || []
        return {
          order_id: ord.id || d.order_id,
          order_number: ord.order_number || `#${String(ord.id || d.order_id).slice(0, 8)}`,
          position: d.position || 1,
          customer_name: ord.customer_name || cust?.name || "Cliente",
          customer_phone: cust?.phone || "",
          customer_email: cust?.email || "",
          delivery_address: ord.delivery_address || "",
          total_amount: Number(ord.total_amount || 0),
          delivery_fee: Number(ord.delivery_fee || 0),
          payment_method: ord.payment_method || "",
          payment_status: ord.situation || "pending",
          situation: ord.situation || "pending",
          delivery_status: ord.delivery_status || (data.status === "delivered" ? "delivered" : data.status === "out_for_delivery" ? "sent" : "preparing"),
          delivery_type: ord.delivery_type || "delivery",
          notes: ord.notes || "",
          created_at: ord.created_at || null,
          requires_delivery_otp: true,
          items: rawItems.map((item: any) => ({
            id: item.id,
            name: item.product_name,
            product_name: item.product_name,
            quantity: item.quantity,
            unit_price: item.product_price,
            price: item.product_price,
            subtotal: item.subtotal || Number(item.quantity || 1) * Number(item.product_price || 0),
            sku: item.product_variants?.sku || item.products?.sku || "N/A",
            images: item.products?.images || null,
            unit: item.products?.unit || "un",
            product_variants: item.product_variants,
            products: item.products,
          })),
        }
      })
      data.order_count = data.orders.length
    }
  }

  if (data) {
    data.requires_delivery_otp = true
  }

  return { success: true as const, data }
}

export async function listAvailableDeliveryOffersAction(params?: { limit?: number }) {
  await requireDeliveryDriver()
  const supabase = await getSupabaseServerClient()
  const limit = Math.min(Math.max(Number(params?.limit || 50), 1), 100)

  let rows: any[] = []

  const { data, error } = await supabase.rpc("get_available_delivery_offers", {
    p_limit: limit,
  })

  if (error || !data) {
    if (error) console.warn("[listAvailableDeliveryOffersAction] RPC get_available_delivery_offers failed, using fallback:", error)
    // Fallback: direct query if RPC is not available yet
    const { data: assignments, error: queryError } = await supabase
      .from("delivery_assignments")
      .select(`
        id,
        order_id,
        delivery_id,
        partner_id,
        status,
        assigned_at,
        delivery_fee,
        notes,
        orders!inner(
          id,
          order_number,
          delivery_address,
          total_amount,
          payment_method,
          situation,
          delivery_status,
          delivery_type,
          created_at,
          customer_name,
          order_items(id, product_name, quantity, product_price, subtotal)
        ),
        partners(
          id,
          business_info
        )
      `)
      .in("status", ["available", "requested"])
      .order("assigned_at", { ascending: false })
      .limit(limit)

    if (queryError) {
      return { success: false as const, error: normalizeError(queryError, "Não foi possível buscar ofertas disponíveis.") }
    }

    rows = (assignments || []).map((row: any) => {
      const order = row.orders || {}
      const partner = row.partners || {}
      const partnerName = partner.business_info?.nome_fantasia || partner.business_info?.razao_social || "Loja"
      const itemsList = order.order_items || []

      return {
        id: row.id,
        assignment_id: row.id,
        order_id: row.order_id,
        delivery_id: row.delivery_id,
        partner_id: row.partner_id,
        status: row.status,
        assigned_at: row.assigned_at,
        delivery_fee: Number(row.delivery_fee || 0),
        order_number: order.order_number || `#${String(order.id || "").slice(0, 8)}`,
        order_count: 1,
        partner_name: partnerName,
        store_name: partnerName,
        store_phone: partner.business_info?.telefone || partner.business_info?.whatsapp || "",
        store_logo_url: "",
        store_address: "",
        customer_name: order.customer_name || "Cliente",
        customer_phone: "",
        delivery_address: order.delivery_address || "",
        total_amount: Number(order.total_amount || 0),
        payment_method: order.payment_method || "",
        payment_status: order.situation || "pending",
        situation: order.situation || "pending",
        delivery_status: order.delivery_status || "preparing",
        delivery_type: order.delivery_type || "delivery",
        created_at: order.created_at || null,
        notes: row.notes || "",
        items: itemsList.map((item: any) => ({
          name: item.product_name,
          quantity: item.quantity,
          unit_price: item.product_price,
          subtotal: item.subtotal,
        })),
        orders: [
          {
            order_id: row.order_id,
            order_number: order.order_number || `#${String(order.id || "").slice(0, 8)}`,
            customer_name: order.customer_name || "Cliente",
            delivery_address: order.delivery_address || "",
            total_amount: Number(order.total_amount || 0),
            delivery_fee: Number(row.delivery_fee || 0),
            payment_method: order.payment_method || "",
            payment_status: order.situation || "pending",
            situation: order.situation || "pending",
            delivery_status: order.delivery_status || "preparing",
            delivery_type: order.delivery_type || "delivery",
            created_at: order.created_at || null,
            items: itemsList.map((item: any) => ({
              name: item.product_name,
              quantity: item.quantity,
              unit_price: item.product_price,
              subtotal: item.subtotal,
            })),
          },
        ],
      }
    })
  } else {
    rows = Array.isArray(data) ? data : []
  }

  // Deduplicate and group by delivery_id (or assignment id)
  const groupedMap = new Map<string, any>()

  for (const row of rows) {
    const key = String(row.delivery_id || row.assignment_id || row.id)
    if (!groupedMap.has(key)) {
      const ordersArr = Array.isArray(row.orders) && row.orders.length > 0
        ? [...row.orders]
        : [{
          order_id: row.order_id,
          order_number: row.order_number,
          customer_name: row.customer_name,
          customer_phone: row.customer_phone,
          delivery_address: row.delivery_address,
          total_amount: Number(row.total_amount || 0),
          delivery_fee: Number(row.delivery_fee || 0),
          payment_method: row.payment_method,
          payment_status: row.payment_status || row.situation || "pending",
          situation: row.situation || row.payment_status || "pending",
          delivery_status: row.delivery_status || "preparing",
          delivery_type: row.delivery_type || "delivery",
          created_at: row.created_at || null,
          items: Array.isArray(row.items) ? row.items : [],
        }]

      groupedMap.set(key, {
        ...row,
        id: row.id || row.assignment_id,
        assignment_id: row.assignment_id || row.id,
        offer_id: row.offer_id || null,
        offer_tier: row.offer_tier != null ? Number(row.offer_tier) : null,
        offer_mode: (row.offer_mode as "board" | "directed") || "board",
        offer_expires_at: row.offer_expires_at || null,
        dispatch_tier: row.dispatch_tier != null ? Number(row.dispatch_tier) : 0,
        order_count: Number(row.order_count || ordersArr.length || 1),
        delivery_fee: Number(row.delivery_fee || 0),
        bonus_amount: Number(row.bonus_amount || 0),
        total_amount: Number(row.total_amount || 0),
        pickup_km: row.pickup_km != null ? Number(row.pickup_km) : (row.pickup_distance_km != null ? Number(row.pickup_distance_km) : null),
        pickup_distance_km: row.pickup_distance_km != null ? Number(row.pickup_distance_km) : null,
        distance_km: row.distance_km != null ? Number(row.distance_km) : (row.pickup_distance_km != null ? Number(row.pickup_distance_km) : null),
        pickup_minutes: row.pickup_minutes != null ? Number(row.pickup_minutes) : null,
        delivery_km: row.delivery_km != null ? Number(row.delivery_km) : (row.delivery_distance_km != null ? Number(row.delivery_distance_km) : null),
        delivery_distance_km: row.delivery_distance_km != null ? Number(row.delivery_distance_km) : null,
        delivery_minutes: row.delivery_minutes != null ? Number(row.delivery_minutes) : null,
        eta_total_minutes: row.eta_total_minutes != null ? Number(row.eta_total_minutes) : null,
        vehicle_compatible: row.vehicle_compatible !== undefined ? Boolean(row.vehicle_compatible) : true,
        position_quality: (row.position_quality as "live" | "address" | "unknown") || "unknown",
        route_km: row.route_km != null ? Number(row.route_km) : null,
        rs_per_km: row.rs_per_km != null ? Number(row.rs_per_km) : null,
        dimensions_unknown: Boolean(row.dimensions_unknown),
        package_weight_kg: row.package_weight_kg != null ? Number(row.package_weight_kg) : null,
        package_volume_l: row.package_volume_l != null ? Number(row.package_volume_l) : null,
        items: Array.isArray(row.items) ? [...row.items] : [],
        orders: ordersArr,
      })
    } else {
      const existing = groupedMap.get(key)
      existing.delivery_fee = Number(existing.delivery_fee || 0) + Number(row.delivery_fee || 0)
      existing.total_amount = Number(existing.total_amount || 0) + Number(row.total_amount || 0)
      if (Array.isArray(row.items)) {
        existing.items.push(...row.items)
      }
      if (Array.isArray(row.orders)) {
        existing.orders.push(...row.orders)
      } else {
        existing.orders.push({
          order_id: row.order_id,
          order_number: row.order_number,
          customer_name: row.customer_name,
          customer_phone: row.customer_phone,
          delivery_address: row.delivery_address,
          total_amount: Number(row.total_amount || 0),
          delivery_fee: Number(row.delivery_fee || 0),
          payment_method: row.payment_method,
          payment_status: row.payment_status || row.situation || "pending",
          situation: row.situation || row.payment_status || "pending",
          delivery_status: row.delivery_status || "preparing",
          delivery_type: row.delivery_type || "delivery",
          created_at: row.created_at || null,
          items: Array.isArray(row.items) ? row.items : [],
        })
      }
      existing.order_count = existing.orders.length
    }
  }

  const items = Array.from(groupedMap.values()).map((offer) => {
    const rawDeliveryAddress = offer.delivery_address
    const maskedDeliveryAddress = getMaskedDeliveryLocation(rawDeliveryAddress)
    const isMulti = (offer.orders?.length || 0) > 1

    const sanitizedOrders = (offer.orders || []).map((ord: any, idx: number) => ({
      ...ord,
      customer_name: isMulti ? `Destinatário (Parada ${idx + 1})` : "Destinatário",
      customer_phone: "",
      customer_email: "",
      delivery_address: getMaskedDeliveryLocation(ord.delivery_address),
    }))

    return {
      ...offer,
      customer_name: isMulti ? `${offer.order_count || sanitizedOrders.length} destinatários` : "Destinatário",
      customer_phone: "",
      customer_email: "",
      delivery_address: maskedDeliveryAddress,
      orders: sanitizedOrders,
    }
  })

  return { success: true as const, items }
}

import { revalidateOrderHistory } from "@/lib/utils/revalidation"

/**
 * Ensures that an accepted delivery assignment has a corresponding record in `deliveries` and `delivery_orders`.
 * If the merchant requested a Dudit driver without saving the delivery in ERP first, this creates the
 * missing delivery and link records so it displays in ERP logistics and status sync works correctly.
 */
async function ensureDeliveryRecordForAssignment(admin: any, assignmentId: string, driverUserId: string) {
  try {
    const { data: da } = await admin
      .from("delivery_assignments")
      .select("id, partner_id, order_id, delivery_id, delivery_fee, notes")
      .eq("id", assignmentId)
      .maybeSingle()

    if (!da || !da.order_id || !da.partner_id) return null
    if (da.delivery_id) return da.delivery_id

    // Check if order is already linked to an existing delivery
    const { data: existingDo } = await admin
      .from("delivery_orders")
      .select("delivery_id")
      .eq("order_id", da.order_id)
      .maybeSingle()

    let finalDeliveryId = existingDo?.delivery_id || null

    if (!finalDeliveryId) {
      // Allocate next delivery number for the partner
      const { data: maxDel } = await admin
        .from("deliveries")
        .select("delivery_number")
        .eq("partner_id", da.partner_id)
        .not("delivery_number", "is", null)
        .order("delivery_number", { ascending: false })
        .limit(1)
        .maybeSingle()

      const nextDeliveryNumber = (Number(maxDel?.delivery_number || 0) || 0) + 1

      // Lookup partner_user for the driver if exists (FK to partner_users.id)
      const { data: pu } = await admin
        .from("partner_users")
        .select("id")
        .eq("user_id", driverUserId)
        .eq("partner_id", da.partner_id)
        .maybeSingle()

      const deliveryPersonId = pu?.id || null

      const { data: createdDel, error: insErr } = await admin
        .from("deliveries")
        .insert({
          partner_id: da.partner_id,
          delivery_person_id: deliveryPersonId,
          status: "pending",
          delivery_number: nextDeliveryNumber,
          created_at: new Date().toISOString(),
          notes: da.notes || null,
        })
        .select("id")
        .single()

      if (insErr || !createdDel) {
        console.error("[ensureDeliveryRecordForAssignment] Erro ao criar delivery:", insErr)
        return null
      }

      finalDeliveryId = createdDel.id

      await admin.from("delivery_orders").insert({
        delivery_id: finalDeliveryId,
        order_id: da.order_id,
        position: 1,
        status: "pending",
      })
    }

    if (finalDeliveryId) {
      await admin
        .from("delivery_assignments")
        .update({ delivery_id: finalDeliveryId })
        .eq("id", assignmentId)
    }

    return finalDeliveryId
  } catch (err) {
    console.error("[ensureDeliveryRecordForAssignment] Falha inesperada:", err)
    return null
  }
}

export async function acceptDeliveryOfferAction(assignmentId: string) {
  const { user } = await requireDeliveryDriver()
  if (!assignmentId) return { success: false as const, error: "Oferta inválida." }
  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase.rpc("accept_delivery_offer", {
    p_assignment_id: assignmentId,
  })

  if (error) {
    return { success: false as const, error: normalizeError(error, "Não foi possível aceitar a entrega.") }
  }

  const orderId = (data as any)?.order_id
  if (orderId) {
    try {
      const { getAdminClient } = await import("@/lib/supabase/admin")
      const admin = getAdminClient()

      await ensureDeliveryRecordForAssignment(admin, assignmentId, user.id)

      const { data: driverProfile } = await admin
        .from("user_profiles")
        .select("full_name")
        .eq("user_id", user.id)
        .maybeSingle()
      const driverName = driverProfile?.full_name?.trim() || "Entregador"

      const { data: da } = await admin
        .from("delivery_assignments")
        .select("partner_id, order_id, delivery_id")
        .eq("id", assignmentId)
        .maybeSingle()

      if (da) {
        await admin.from("audit_logs").insert({
          table_name: "orders",
          action: "DELIVERY_OFFER_ACCEPTED",
          user_id: user.id,
          actor_user_id: user.id,
          partner_id: da.partner_id,
          entity_type: "order",
          entity_id: da.order_id,
          action_type: "delivery_status_changed",
          change_lines: ["Aceitou a entrega do pedido."],
          metadata: {
            assignment_id: assignmentId,
            delivery_id: da.delivery_id,
            is_driver: true,
            driver_id: user.id,
            driver_name: driverName,
            driver_status: "accepted",
          },
          source: "delivery_driver_app",
        })
      }
    } catch { }

    await revalidateOrderHistory(orderId)
  }

  revalidatePath("/entregadores")
  revalidatePath("/entregadores/entregas-disponiveis")
  revalidatePath("/entregadores/entregas")
  revalidatePath("/erp/entregas")
  revalidatePath("/erp/logistica")
  revalidatePath("/erp/pedidos")

  return { success: true as const, data }
}

export async function declineDeliveryOfferAction(assignmentId: string, offerId?: string | null) {
  await requireDeliveryDriver()
  if (!assignmentId) return { success: false as const, error: "Oferta inválida." }
  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase.rpc("decline_delivery_offer", {
    p_assignment_id: assignmentId,
    p_offer_id: offerId || null,
  })

  if (error) {
    return { success: false as const, error: normalizeError(error, "Não foi possível recusar a oferta.") }
  }

  revalidatePath("/entregadores")
  revalidatePath("/entregadores/entregas-disponiveis")

  return {
    success: true as const,
    data: data as {
      success: boolean
      offer_id: string
      reject_streak: number
      cooldown_until: string | null
      cooldown_applied: boolean
    },
  }
}

export async function transitionMyDeliveryAssignmentAction(params: {
  assignmentId: string
  status: "accepted" | "picked_up" | "out_for_delivery" | "delivered" | "failed"
  failureReason?: string
  deliveryOtp?: string
}) {
  const { user } = await requireDeliveryDriver()

  // Se estiver concluindo a entrega, validar código de confirmação se exigido
  if (params.status === "delivered") {
    const { getAdminClient } = await import("@/lib/supabase/admin")
    const admin = getAdminClient()

    const { data: da } = await admin
      .from("delivery_assignments")
      .select("id, order_id, delivery_id")
      .eq("id", params.assignmentId)
      .eq("driver_id", user.id)
      .maybeSingle()

    if (!da) return { success: false as const, error: "Entrega não encontrada ou sem permissão." }

    let targetOrderId = da.order_id
    if (!targetOrderId && da.delivery_id) {
      const { data: doRows } = await admin
        .from("delivery_orders")
        .select("order_id")
        .eq("delivery_id", da.delivery_id)
        .limit(2)

      if (doRows && doRows.length === 1) {
        targetOrderId = doRows[0].order_id
      }
    }

    if (targetOrderId) {
      const { doesOrderRequireDeliveryOtp, verifyAndConsumeDeliveryOtp } = await import("@/lib/services/delivery-otp.service")
      const requirement = await doesOrderRequireDeliveryOtp(targetOrderId, { adminClient: admin })
      if (requirement.requiresOtp) {
        if (!params.deliveryOtp) {
          return {
            success: false as const,
            error: "Este pedido exige o código de confirmação de entrega de 6 dígitos fornecido pelo cliente.",
          }
        }

        const verifyRes = await verifyAndConsumeDeliveryOtp({
          orderId: targetOrderId,
          code: params.deliveryOtp,
          confirmedByUserId: user.id,
          adminClient: admin,
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

  const { getAdminClient } = await import("@/lib/supabase/admin")
  const admin = getAdminClient()
  await ensureDeliveryRecordForAssignment(admin, params.assignmentId, user.id)

  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase.rpc("transition_delivery_assignment", {
    p_assignment_id: params.assignmentId,
    p_next_status: params.status,
    p_failure_reason: params.failureReason?.trim() || null,
  })
  if (error) return { success: false as const, error: normalizeError(error, "Não foi possível atualizar a entrega.") }

  const orderId = (data as any)?.order_id
  if (orderId) {
    try {
      const { getAdminClient } = await import("@/lib/supabase/admin")
      const admin = getAdminClient()
      const { data: driverProfile } = await admin
        .from("user_profiles")
        .select("full_name")
        .eq("user_id", user.id)
        .maybeSingle()
      const driverName = driverProfile?.full_name?.trim() || "Entregador"

      const { data: da } = await admin
        .from("delivery_assignments")
        .select("partner_id, order_id, delivery_id")
        .eq("id", params.assignmentId)
        .maybeSingle()

      if (da) {
        let statusText = "atualizou o status da entrega."
        if (params.status === "picked_up") statusText = "Retirou o pedido no estabelecimento para entrega."
        else if (params.status === "out_for_delivery") statusText = "Saiu para entrega com o pedido."
        else if (params.status === "delivered") statusText = "Entregou o pedido ao cliente."
        else if (params.status === "failed") statusText = `Tentativa de entrega não realizada.${params.failureReason ? ` Motivo: ${params.failureReason.trim()}` : ""}`
        else if (params.status === "accepted") statusText = "Aceitou a entrega do pedido."

        await admin.from("audit_logs").insert({
          table_name: "orders",
          action: `DELIVERY_${params.status.toUpperCase()}`,
          user_id: user.id,
          actor_user_id: user.id,
          partner_id: da.partner_id,
          entity_type: "order",
          entity_id: da.order_id,
          action_type: "delivery_status_changed",
          change_lines: [statusText],
          metadata: {
            assignment_id: params.assignmentId,
            delivery_id: da.delivery_id,
            is_driver: true,
            driver_id: user.id,
            driver_name: driverName,
            driver_status: params.status,
            failure_reason: params.failureReason?.trim() || null,
          },
          source: "delivery_driver_app",
        })
      }
    } catch { }

    await revalidateOrderHistory(orderId)
  }

  revalidatePath("/entregadores")
  revalidatePath("/entregadores/entregas-disponiveis")
  revalidatePath(`/entregadores/entregas/${params.assignmentId}`)
  revalidatePath("/erp/pedidos")
  revalidatePath("/erp/entregas")
  revalidatePath("/erp/logistica")
  return { success: true as const, data }
}

export async function setMyDeliveryAvailabilityAction(status: "available" | "offline") {
  await requireDeliveryDriver()
  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase.rpc("set_my_delivery_availability", { p_status: status })
  if (error) return { success: false as const, error: normalizeError(error, "Não foi possível atualizar sua disponibilidade.") }
  revalidatePath("/entregadores")
  return { success: true as const, data }
}

export async function upsertMyDriverLocationAction(input: {
  lat?: number | null
  lng?: number | null
  accuracy?: number | null
  heading?: number | null
  speed?: number | null
  source?: "gps" | "network" | "address_fallback"
}) {
  await requireDeliveryDriver()
  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase.rpc("upsert_my_driver_location", {
    p_lat: input.lat ?? null,
    p_lng: input.lng ?? null,
    p_accuracy: input.accuracy ?? null,
    p_heading: input.heading ?? null,
    p_speed: input.speed ?? null,
    p_source: input.source || "gps",
  })
  if (error) {
    return {
      success: false as const,
      error: normalizeError(error, "Não foi possível atualizar sua localização."),
    }
  }
  return {
    success: true as const,
    data: data as {
      success: boolean
      position_quality: "live" | "address" | "unknown"
      source: string
      updated_at: string
    },
  }
}

export async function confirmDeliveryPaymentReceivedAction(assignmentId: string, note?: string) {
  const { user } = await requireDeliveryDriver()
  const supabase = await getSupabaseServerClient()

  // O recebimento do pagamento só pode ser processado após a entrega ser confirmada
  const { data: daCheck } = await supabase
    .from("delivery_assignments")
    .select("status")
    .eq("id", assignmentId)
    .maybeSingle()

  if (daCheck && daCheck.status !== "delivered") {
    return { success: false as const, error: "O recebimento do pagamento só pode ser processado após a entrega ser concluída." }
  }

  const { data, error } = await supabase.rpc("confirm_delivery_payment_received", {
    p_assignment_id: assignmentId,
    p_note: note?.trim() || null,
  })
  if (error) return { success: false as const, error: normalizeError(error, "Não foi possível registrar a confirmação.") }

  const orderId = (data as any)?.order_id
  if (orderId) {
    try {
      const { getAdminClient } = await import("@/lib/supabase/admin")
      const admin = getAdminClient()
      const { data: driverProfile } = await admin
        .from("user_profiles")
        .select("full_name")
        .eq("user_id", user.id)
        .maybeSingle()
      const driverName = driverProfile?.full_name?.trim() || "Entregador"

      const { data: da } = await admin
        .from("delivery_assignments")
        .select("partner_id, order_id, amount_to_collect")
        .eq("id", assignmentId)
        .maybeSingle()

      if (da) {
        const { formatCurrency } = await import("@/lib/utils")
        const amount = Number(da.amount_to_collect || 0)
        const lines = [
          amount > 0
            ? `Recebido ${formatCurrency(amount)} via Dinheiro pelo entregador. Pedido totalmente pago.`
            : "Pagamento recebido em dinheiro pelo entregador.",
        ]
        if (note?.trim()) {
          lines.push(`Observação do recebimento: ${note.trim()}`)
        }

        await admin.from("audit_logs").insert({
          table_name: "orders",
          action: "DRIVER_PAYMENT_RECEIVED",
          user_id: user.id,
          actor_user_id: user.id,
          partner_id: da.partner_id,
          entity_type: "order",
          entity_id: da.order_id,
          action_type: "paid",
          change_lines: lines,
          metadata: {
            oldStatus: "Pendente",
            newStatus: "Pago",
            statusScope: "payment",
            is_driver: true,
            driver_id: user.id,
            driver_name: driverName,
            payment_method: "dinheiro",
            amount_received: amount,
            assignment_id: assignmentId,
          },
          source: "delivery_driver_app",
        })
      }
    } catch { }

    await revalidateOrderHistory(orderId)
  }

  revalidatePath(`/entregadores/entregas/${assignmentId}`)
  revalidatePath("/erp/pedidos")
  revalidatePath("/erp/entregas")
  revalidatePath("/erp/logistica")
  return { success: true as const, data }
}

async function resolveDeliveryAssignmentOrStoreDelivery(assignmentIdOrDeliveryId: string, orderId?: string | null) {
  const { requireUser } = await import("@/lib/auth/authorization")
  const user = await requireUser()
  const { getAdminClient } = await import("@/lib/supabase/admin")
  const admin = getAdminClient()

  // 1. Try delivery_assignments (platform driver or store staff checking assignment)
  if (assignmentIdOrDeliveryId) {
    const { data: da } = await admin
      .from("delivery_assignments")
      .select("id, partner_id, order_id, delivery_id, driver_id, payment_confirmed_at")
      .eq("id", assignmentIdOrDeliveryId)
      .maybeSingle()

    if (da) {
      if (da.driver_id === user.id) {
        return { user, assignment: da, partnerId: da.partner_id, isPlatformDriver: true, isStoreUser: false }
      }
      const { data: pu } = await admin
        .from("partner_users")
        .select("id, role")
        .eq("partner_id", da.partner_id)
        .eq("user_id", user.id)
        .maybeSingle()
      if (pu) {
        return { user, assignment: da, partnerId: da.partner_id, isPlatformDriver: false, isStoreUser: true }
      }
    }
  }

  // 2. Try deliveries table (store delivery)
  if (assignmentIdOrDeliveryId) {
    const { data: del } = await admin
      .from("deliveries")
      .select("id, partner_id, delivery_person_id, status")
      .eq("id", assignmentIdOrDeliveryId)
      .maybeSingle()

    if (del) {
      const { data: pu } = await admin
        .from("partner_users")
        .select("id, role")
        .eq("partner_id", del.partner_id)
        .eq("user_id", user.id)
        .maybeSingle()

      if (pu) {
        const syntheticAssignment = {
          id: del.id,
          partner_id: del.partner_id,
          order_id: orderId || null,
          delivery_id: del.id,
          driver_id: user.id,
          payment_confirmed_at: null,
          isStoreDelivery: true,
        }
        return { user, assignment: syntheticAssignment, partnerId: del.partner_id, isPlatformDriver: false, isStoreUser: true }
      }
    }
  }

  // 3. Try by orderId
  if (orderId) {
    const { data: ord } = await admin
      .from("orders")
      .select("id, partner_id")
      .eq("id", orderId)
      .maybeSingle()

    if (ord?.partner_id) {
      const { data: da } = await admin
        .from("delivery_assignments")
        .select("id, partner_id, order_id, delivery_id, driver_id, payment_confirmed_at")
        .eq("order_id", orderId)
        .eq("driver_id", user.id)
        .maybeSingle()
      if (da) {
        return { user, assignment: da, partnerId: da.partner_id, isPlatformDriver: true, isStoreUser: false }
      }

      const { data: pu } = await admin
        .from("partner_users")
        .select("id, role")
        .eq("partner_id", ord.partner_id)
        .eq("user_id", user.id)
        .maybeSingle()
      if (pu) {
        const syntheticAssignment = {
          id: orderId,
          partner_id: ord.partner_id,
          order_id: orderId,
          delivery_id: null,
          driver_id: user.id,
          payment_confirmed_at: null,
          isStoreDelivery: true,
        }
        return { user, assignment: syntheticAssignment, partnerId: ord.partner_id, isPlatformDriver: false, isStoreUser: true }
      }
    }
  }

  return null
}

export async function getDriverPaymentMethodsAction(assignmentId: string, orderId?: string | null) {
  if (!assignmentId && !orderId) return { success: false as const, error: "ID inválido." }

  const authRes = await resolveDeliveryAssignmentOrStoreDelivery(assignmentId, orderId)
  if (!authRes) {
    return { success: false as const, error: "Entrega não encontrada ou sem permissão." }
  }

  const { assignment } = authRes
  const { getAdminClient } = await import("@/lib/supabase/admin")
  const admin = getAdminClient()

  const targetOrderId = orderId || assignment.order_id

  const { data: methods, error: methodsError } = await admin
    .from("payment_methods")
    .select(
      "id, name, type, payment_type, is_active, is_default, is_online_default, " +
      "fee_percent, fee_fixed, fee_bearer, discount_percent, max_installments, " +
      "card_brand, priority, pix_key_encrypted, pix_key_type, store_id"
    )
    .eq("partner_id", assignment.partner_id)
    .eq("is_active", true)
    .order("is_default", { ascending: false })
    .order("priority", { ascending: false })

  if (methodsError) {
    return { success: false as const, error: "Não foi possível carregar métodos de pagamento." }
  }

  const { data: store } = await admin
    .from("stores")
    .select("name, business_info")
    .eq("partner_id", assignment.partner_id)
    .order("is_headquarters", { ascending: false })
    .limit(1)
    .maybeSingle()

  const storeName =
    store?.name ||
    store?.business_info?.nome_fantasia ||
    store?.business_info?.razao_social ||
    "Loja"

  const processed = await Promise.all((methods || []).map(async (m: any) => {
    let pixKey: string | null = null
    const keyType = m.pix_key_type
    const rawKey = m.pix_key_encrypted || m.pix_key

    if (rawKey && keyType !== "cpf") {
      pixKey = rawKey
    } else if (rawKey && keyType === "cpf") {
      try {
        pixKey = await decryptCPF(rawKey)
      } catch {
        pixKey = null
      }
    }

    return {
      id: m.id,
      name: m.name,
      type: m.type || toCanonicalPaymentType(m.payment_type),
      is_active: m.is_active,
      fee_percent: m.fee_percent,
      fee_fixed: m.fee_fixed,
      fee_bearer: m.fee_bearer,
      discount_percent: m.discount_percent,
      max_installments: m.max_installments,
      card_brand: m.card_brand,
      pix_key: pixKey,
      pix_key_type: keyType,
      store_id: m.store_id,
    }
  }))

  const pixMethod = processed.find((m) => m.type === "pix" && m.pix_key)
  const storePixKey = pixMethod?.pix_key || store?.business_info?.pix_key || null
  const storePixKeyType = pixMethod?.pix_key_type || store?.business_info?.pix_key_type || null

  const { data: order } = await admin
    .from("orders")
    .select(
      "id, order_number, total_amount, paid_amount, situation, payment_method, payment_provider, mp_payment_id, payment_breakdown, notes, customer_name, buyer_id, order_items(id, product_name, quantity, product_price, subtotal, products(name, images))"
    )
    .eq("id", targetOrderId)
    .maybeSingle()

  return {
    success: true as const,
    methods: processed,
    storeName,
    storePixKey,
    storePixKeyType,
    assignment,
    order: order || null,
  }
}

export async function driverConfirmPaymentAction(params: {
  assignmentId: string
  orderId?: string | null
  paymentMethod: string
  amountReceived?: number
  installments?: number
  paymentMethodId?: string | null
  note?: string
}) {
  if (!params.assignmentId && !params.orderId) {
    return { success: false as const, error: "ID inválido." }
  }

  const authRes = await resolveDeliveryAssignmentOrStoreDelivery(params.assignmentId, params.orderId)
  if (!authRes) {
    return { success: false as const, error: "Entrega não encontrada ou sem permissão." }
  }

  const { user, assignment } = authRes
  const { getAdminClient } = await import("@/lib/supabase/admin")
  const admin = getAdminClient()
  const supabase = await getSupabaseServerClient()

  const targetOrderId = params.orderId || assignment.order_id

  const { data: order } = await admin
    .from("orders")
    .select("id, order_number, total_amount, paid_amount, paid_at, situation, store_id, buyer_id, customer_name, customer_id, finance_account_id, order_source, payment_breakdown, payment_method")
    .eq("id", targetOrderId)
    .maybeSingle()

  if (!order) {
    return { success: false as const, error: "Pedido não encontrado." }
  }

  const totalAmount = Number(order.total_amount || 0)
  const alreadyPaid = Number(order.paid_amount || 0)
  const remainingBalance = Math.max(0, totalAmount - alreadyPaid)
  const amountReceived = params.amountReceived ?? remainingBalance

  if (amountReceived <= 0.009) {
    return { success: false as const, error: "Informe o valor recebido." }
  }

  if (amountReceived > totalAmount) {
    return {
      success: false as const,
      error: `O valor recebido (R$${amountReceived.toFixed(2)}) não pode ser maior que o total do pedido (R$${totalAmount.toFixed(2)}).`,
    }
  }

  let confirmedData: any = null

  try {
    if ((assignment as any).isStoreDelivery) {
      const alreadyPaid = Number(order.paid_amount || 0)
      const totalNewPaid = Math.min(totalAmount, alreadyPaid + amountReceived)
      const isFull = totalNewPaid >= totalAmount - 0.01
      const newSituation = isFull ? "paid" : "partially_paid"
      const nowIso = new Date().toISOString()

      let breakdown = Array.isArray(order.payment_breakdown) && order.payment_breakdown.length > 0
        ? order.payment_breakdown.map((l: any) => ({ ...l }))
        : []

      if (breakdown.length > 0) {
        const legIndex = breakdown.findIndex(
          (l: any) => !l.amountReceived || Number(l.amountReceived) < Number(l.amount || 0)
        )
        if (legIndex >= 0) {
          breakdown[legIndex].amountReceived = Number(
            (Number(breakdown[legIndex].amountReceived || 0) + amountReceived).toFixed(2)
          )
          breakdown[legIndex].method = params.paymentMethod
        } else {
          breakdown.push({
            method: params.paymentMethod,
            amount: amountReceived,
            effectiveAmount: amountReceived,
            amountReceived: amountReceived,
            paymentMethodId: params.paymentMethodId || null,
            installmentNumber: params.installments || 1,
            adjustmentType: "none",
            adjustmentPercent: 0,
            adjustmentAmount: 0,
          })
        }
      } else {
        breakdown = [
          {
            method: params.paymentMethod,
            amount: totalAmount,
            effectiveAmount: totalNewPaid,
            amountReceived: totalNewPaid,
            paymentMethodId: params.paymentMethodId || null,
            installmentNumber: params.installments || 1,
            adjustmentType: "none",
            adjustmentPercent: 0,
            adjustmentAmount: 0,
          },
        ]
      }

      const { error: updateOrderError } = await admin
        .from("orders")
        .update({
          payment_method: params.paymentMethod,
          paid_amount: totalNewPaid,
          amount_paid: totalNewPaid,
          paid_at: isFull ? (order.paid_at || nowIso) : order.paid_at,
          situation: newSituation,
          payment_breakdown: breakdown,
          updated_at: nowIso,
        })
        .eq("id", targetOrderId)

      if (updateOrderError) {
        return { success: false as const, error: "Não foi possível registrar o recebimento no pedido." }
      }

      confirmedData = {
        confirmed_at: nowIso,
        order_id: targetOrderId,
        amount_received: amountReceived,
        situation: newSituation,
      }
    } else {
      const { data, error: rpcError } = await supabase.rpc("confirm_driver_payment", {
        p_assignment_id: assignment.id,
        p_payment_method: params.paymentMethod,
        p_amount_received: amountReceived,
        p_installments: params.installments || 1,
        p_payment_method_id: params.paymentMethodId || null,
        p_note: params.note || null,
        p_order_id: targetOrderId,
      })

      if (rpcError) {
        return {
          success: false as const,
          error: normalizeError(rpcError, "Não foi possível registrar o recebimento."),
        }
      }
      confirmedData = data
    }

  // 1. Obter nome do entregador para os logs
  const { data: driverProfile } = await admin
    .from("user_profiles")
    .select("full_name")
    .eq("user_id", user.id)
    .maybeSingle()
  const driverName = driverProfile?.full_name?.trim() || "Entregador"

  const newSituation = (confirmedData as any)?.situation || "paid"
  const confirmedAmount = Number((confirmedData as any)?.amount_received || amountReceived)
    const { formatCurrency } = await import("@/lib/utils")
    const { getPaymentStatusLabel } = await import("@/lib/orders/status")
    const { formatPaymentMethodLabel } = await import("@/lib/utils/payment-method-label")

    const methodLabel = formatPaymentMethodLabel(params.paymentMethod, null) || "Método não informado"
    const isFullyPaid = newSituation === "paid"

    const lines: string[] = [
      `Recebido ${formatCurrency(confirmedAmount)} via ${methodLabel} pelo entregador.${isFullyPaid ? " Pedido totalmente pago." : ""}`,
    ]
    if (order.situation !== newSituation) {
      lines.push(`alterou status de pagamento: ${getPaymentStatusLabel(order.situation)} -> ${getPaymentStatusLabel(newSituation)}`)
    }
    if (params.note?.trim()) {
      lines.push(`Observação do recebimento: ${params.note.trim()}`)
    }

    // 2. Registrar no audit_logs (Histórico do Pedido específico)
    try {
      await admin.from("audit_logs").insert({
        table_name: "orders",
        action: "DRIVER_PAYMENT_RECEIVED",
        user_id: user.id,
        actor_user_id: user.id,
        partner_id: assignment.partner_id,
        entity_type: "order",
        entity_id: targetOrderId,
        action_type: "paid",
        change_lines: lines,
        metadata: {
          oldStatus: getPaymentStatusLabel(order.situation),
          newStatus: getPaymentStatusLabel(newSituation),
          statusScope: "payment",
          is_driver: true,
          driver_id: user.id,
          driver_name: driverName,
          payment_method: params.paymentMethod,
          amount_received: confirmedAmount,
          installments: params.installments || 1,
          assignment_id: assignment.id,
          order_id: targetOrderId,
        },
        source: "delivery_driver_app",
        store_id: order.store_id || null,
      })
    } catch (auditErr) {
      console.error("[driverConfirmPaymentAction] Audit log warning:", auditErr)
    }

    // 3. Sincronizar transação financeira e recebível do ERP
    try {
      const { createFinancialTransactionsForReceivedAmount } = await import("@/app/actions/erp/orders")
      const { syncReceivableForOrder } = await import("@/lib/services/transaction.service")

      const { data: updatedOrder } = await admin
        .from("orders")
        .select("payment_breakdown, situation, paid_amount")
        .eq("id", targetOrderId)
        .maybeSingle()

      await createFinancialTransactionsForReceivedAmount(admin, {
        orderId: targetOrderId,
        orderNumber: order.order_number || targetOrderId,
        partnerId: assignment.partner_id,
        storeId: order.store_id || null,
        totalAmount: totalAmount,
        newBreakdown: updatedOrder?.payment_breakdown || [],
        oldBreakdown: order.payment_breakdown || [],
        paymentMethod: params.paymentMethod,
        customerId: order.customer_id || order.buyer_id || null,
        customerName: order.customer_name || null,
        financeAccountId: order.finance_account_id || null,
        orderSource: order.order_source || "manual",
      })

      await syncReceivableForOrder(admin, {
        order_number: order.order_number || targetOrderId,
        partner_id: assignment.partner_id,
        store_id: order.store_id || null,
        total_amount: totalAmount,
        paid_amount: Number(updatedOrder?.paid_amount || (alreadyPaid + confirmedAmount)),
        situation: updatedOrder?.situation || newSituation,
        payment_method: params.paymentMethod,
        customer_id: order.customer_id || order.buyer_id || null,
        customer_name: order.customer_name || null,
        finance_account_id: order.finance_account_id || null,
        order_source: order.order_source || "manual",
      })
    } catch (finErr) {
      console.error("[driverConfirmPaymentAction] Financial sync warning:", finErr)
    }

    await revalidateOrderHistory(targetOrderId)
    revalidatePath("/entregadores")
    revalidatePath("/entregadores/entregas")
    revalidatePath(`/entregadores/entregas/${assignment.id}`)
    revalidatePath("/erp/entregas")
    revalidatePath("/erp/pedidos")
    revalidatePath("/erp/logistica")

    return {
      success: true as const,
      data: {
        confirmedAt: (confirmedData as any)?.confirmed_at,
        orderId: (confirmedData as any)?.order_id,
        situation: (confirmedData as any)?.situation,
        amountReceived: (confirmedData as any)?.amount_received,
        paymentMethod: (confirmedData as any)?.payment_method,
      },
    }
  } catch (err: any) {
    return { success: false as const, error: err?.message || "Erro ao confirmar pagamento." }
  }
}

export async function getDeliveryInvitationMetaAction(token: string) {
  const rawToken = String(token || "").trim()
  if (!/^[a-f0-9]{64}$/i.test(rawToken)) return { valid: false as const }
  const { getAdminClient } = await import("@/lib/supabase/admin")
  const { getCurrentUser } = await import("@/lib/auth/authorization")
  const admin = getAdminClient()
  const { data } = await admin
    .from("delivery_driver_invitations")
    .select("email, expires_at, used_at, revoked_at, locked_at")
    .eq("token_hash", hashInviteToken(rawToken))
    .maybeSingle()
  const valid = !!data && !data.used_at && !data.revoked_at && !data.locked_at && new Date(data.expires_at) > new Date()
  const currentUser = valid ? await getCurrentUser() : null
  const isEmailMatch = valid && currentUser?.email
    ? currentUser.email.trim().toLowerCase() === String(data.email).trim().toLowerCase()
    : null
  return {
    valid: !!valid,
    email: valid ? String(data.email).replace(/^(.{2}).*(@.*)$/, "$1***$2") : undefined,
    isEmailMatch,
  }
}

export async function acceptDeliveryDriverInvitationAction(params: { token: string; fullName?: string; phone?: string }) {
  const rawToken = String(params.token || "").trim()
  if (!/^[a-f0-9]{64}$/i.test(rawToken)) return { success: false as const, error: "Convite inválido." }
  const { getAdminClient } = await import("@/lib/supabase/admin")
  const { data: invitation } = await getAdminClient()
    .from("delivery_driver_invitations")
    .select("full_name, phone")
    .eq("token_hash", hashInviteToken(rawToken))
    .is("used_at", null)
    .is("revoked_at", null)
    .maybeSingle()
  if (!invitation) return { success: false as const, error: "Convite inválido, expirado ou já utilizado." }
  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase.rpc("accept_delivery_driver_invitation", {
    p_token_hash: hashInviteToken(rawToken),
    p_full_name: String(invitation.full_name || "").trim(),
    p_phone: String(invitation.phone || "").trim(),
    p_terms_version: "delivery-driver-mvp-1",
  })
  if (error) return { success: false as const, error: normalizeError(error, "Não foi possível aceitar o convite.") }
  revalidatePath("/entregadores")
  return { success: true as const, data }
}

export async function markSingleOrderDeliveredAction(params: {
  assignmentId: string
  orderId: string
  deliveryOtp?: string
}) {
  const { user } = await requireDeliveryDriver()
  const { getAdminClient } = await import("@/lib/supabase/admin")
  const admin = getAdminClient()

  // Verify the assignment belongs to this driver
  const { data: assignment } = await admin
    .from("delivery_assignments")
    .select("id, delivery_id, driver_id, partner_id, status")
    .eq("id", params.assignmentId)
    .eq("driver_id", user.id)
    .maybeSingle()

  if (!assignment) return { success: false as const, error: "Entrega não encontrada ou sem permissão." }
  if (!["picked_up", "out_for_delivery"].includes(assignment.status)) {
    return { success: false as const, error: "A entrega precisa estar em retirada ou em rota para marcar pedidos individualmente." }
  }

  await ensureDeliveryRecordForAssignment(admin, params.assignmentId, user.id)

  // Validar código OTP se exigido
  const { doesOrderRequireDeliveryOtp, verifyAndConsumeDeliveryOtp } = await import("@/lib/services/delivery-otp.service")
  const requirement = await doesOrderRequireDeliveryOtp(params.orderId, { adminClient: admin })
  if (requirement.requiresOtp) {
    if (!params.deliveryOtp) {
      return {
        success: false as const,
        error: "Este pedido exige o código de confirmação de entrega de 6 dígitos fornecido pelo cliente.",
      }
    }

    const verifyRes = await verifyAndConsumeDeliveryOtp({
      orderId: params.orderId,
      code: params.deliveryOtp,
      confirmedByUserId: user.id,
      adminClient: admin,
    })

    if (!verifyRes.success) {
      return {
        success: false as const,
        error: verifyRes.error || "Código de confirmação de entrega incorreto.",
      }
    }
  }

  const nowIso = new Date().toISOString()

  // Mark this specific order as delivered
  await getAdminClient()
    .from("orders")
    .update({
      delivery_status: "delivered",
      delivery_arrived_at: nowIso,
      delivery_completed_at: nowIso,
    })
    .eq("id", params.orderId)
    .eq("partner_id", assignment.partner_id)

  // Update delivery_orders for this specific order
  if (assignment.delivery_id) {
    await getAdminClient()
      .from("delivery_orders")
      .update({ status: "delivered", delivered_at: nowIso })
      .eq("delivery_id", assignment.delivery_id)
      .eq("order_id", params.orderId)

    // Check if all orders in this delivery are now delivered
    const { data: pendingOrders } = await getAdminClient()
      .from("delivery_orders")
      .select("order_id")
      .eq("delivery_id", assignment.delivery_id)
      .neq("status", "delivered")

    if (!pendingOrders || pendingOrders.length === 0) {
      // All orders delivered - mark the whole delivery + assignment as delivered
      await getAdminClient()
        .from("deliveries")
        .update({ status: "delivered", delivered_at: nowIso, completed_at: nowIso })
        .eq("id", assignment.delivery_id)

      await getAdminClient()
        .from("delivery_assignments")
        .update({ status: "delivered", completed_at: nowIso, updated_at: nowIso })
        .eq("delivery_id", assignment.delivery_id)
        .eq("driver_id", user.id)
    }
  }

  // Audit log
  try {
    await getAdminClient().from("audit_logs").insert({
      table_name: "orders",
      action: "SINGLE_ORDER_DELIVERED",
      user_id: user.id,
      actor_user_id: user.id,
      partner_id: assignment.partner_id,
      entity_type: "order",
      entity_id: params.orderId,
      action_type: "delivery_status_changed",
      change_lines: ["Pedido marcado como entregue individualmente pelo entregador"],
      metadata: { assignment_id: params.assignmentId, delivery_id: assignment.delivery_id },
      source: "delivery_driver_app",
    })
  } catch { }

  await revalidateOrderHistory(params.orderId)
  revalidatePath("/entregadores")
  revalidatePath(`/entregadores/entregas/${params.assignmentId}`)
  revalidatePath("/erp/pedidos")
  revalidatePath("/erp/entregas")
  revalidatePath("/erp/logistica")

  return { success: true as const }
}
