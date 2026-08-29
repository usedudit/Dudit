"use server"

import { revalidatePath } from "next/cache"
import { createHash } from "node:crypto"

import { requireDeliveryDriver } from "@/lib/auth/delivery-driver"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import type { DeliveryBucket } from "@/lib/delivery/types"

function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

function normalizeError(error: any, fallback: string) {
  const message = String(error?.message || error?.hint || error?.details || "")
  if (message.includes("delivery_driver_busy")) return "Você já possui 2 entregas em andamento. Conclua uma para aceitar novas."
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
          customer_name,
          order_items(id, product_name, quantity, product_price, subtotal)
        ),
        partners(
          id,
          business_info
        )
      `)
      .in("status", ["available", "requested"])
      .gte("assigned_at", new Date(Date.now() - 15 * 60 * 1000).toISOString())
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
        payment_status: order.situation || "Pendente",
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
            payment_status: order.situation || "Pendente",
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
            payment_status: row.payment_status,
            items: Array.isArray(row.items) ? row.items : [],
          }]

      groupedMap.set(key, {
        ...row,
        id: row.id || row.assignment_id,
        assignment_id: row.assignment_id || row.id,
        order_count: Number(row.order_count || ordersArr.length || 1),
        delivery_fee: Number(row.delivery_fee || 0),
        total_amount: Number(row.total_amount || 0),
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
          payment_status: row.payment_status,
          items: Array.isArray(row.items) ? row.items : [],
        })
      }
      existing.order_count = existing.orders.length
    }
  }

  const items = Array.from(groupedMap.values())
  return { success: true as const, items }
}

import { revalidateOrderHistory } from "@/lib/utils/revalidation"

export async function acceptDeliveryOfferAction(assignmentId: string) {
  await requireDeliveryDriver()
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
    await revalidateOrderHistory(orderId)
  }

  revalidatePath("/entregadores")
  revalidatePath("/entregadores/entregas-disponiveis")
  revalidatePath("/entregadores/entregas")
  revalidatePath("/erp/logistica")
  revalidatePath("/erp/pedidos")

  return { success: true as const, data }
}

export async function transitionMyDeliveryAssignmentAction(params: {
  assignmentId: string
  status: "accepted" | "picked_up" | "out_for_delivery" | "delivered" | "failed"
  failureReason?: string
}) {
  await requireDeliveryDriver()
  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase.rpc("transition_delivery_assignment", {
    p_assignment_id: params.assignmentId,
    p_next_status: params.status,
    p_failure_reason: params.failureReason?.trim() || null,
  })
  if (error) return { success: false as const, error: normalizeError(error, "Não foi possível atualizar a entrega.") }

  const orderId = (data as any)?.order_id
  if (orderId) {
    await revalidateOrderHistory(orderId)
  }

  revalidatePath("/entregadores")
  revalidatePath("/entregadores/entregas-disponiveis")
  revalidatePath(`/entregadores/entregas/${params.assignmentId}`)
  revalidatePath("/erp/pedidos")
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

export async function confirmDeliveryPaymentReceivedAction(assignmentId: string, note?: string) {
  await requireDeliveryDriver()
  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase.rpc("confirm_delivery_payment_received", {
    p_assignment_id: assignmentId,
    p_note: note?.trim() || null,
  })
  if (error) return { success: false as const, error: normalizeError(error, "Não foi possível registrar a confirmação.") }

  const orderId = (data as any)?.order_id
  if (orderId) {
    await revalidateOrderHistory(orderId)
  }

  revalidatePath(`/entregadores/entregas/${assignmentId}`)
  revalidatePath("/erp/pedidos")
  revalidatePath("/erp/logistica")
  return { success: true as const, data }
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
}) {
  const { user } = await requireDeliveryDriver()
  const { getAdminClient } = await import("@/lib/supabase/admin")

  // Verify the assignment belongs to this driver
  const { data: assignment } = await getAdminClient()
    .from("delivery_assignments")
    .select("id, delivery_id, driver_id, partner_id, status")
    .eq("id", params.assignmentId)
    .eq("driver_id", user.id)
    .maybeSingle()

  if (!assignment) return { success: false as const, error: "Entrega não encontrada ou sem permissão." }
  if (!["picked_up", "out_for_delivery"].includes(assignment.status)) {
    return { success: false as const, error: "A entrega precisa estar em retirada ou em rota para marcar pedidos individualmente." }
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
      // All orders delivered — mark the whole delivery + assignment as delivered
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
  } catch {}

  await revalidateOrderHistory(params.orderId)
  revalidatePath("/entregadores")
  revalidatePath(`/entregadores/entregas/${params.assignmentId}`)
  revalidatePath("/erp/pedidos")
  revalidatePath("/erp/logistica")

  return { success: true as const }
}
