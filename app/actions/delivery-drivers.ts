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
  const message = String(error?.message || "")
  if (message.includes("delivery_assignment_invalid_transition")) return "Essa transição de status não é permitida."
  if (message.includes("delivery_failure_reason_required")) return "Informe o motivo da falha."
  if (message.includes("delivery_assignment_not_owned")) return "Entrega não encontrada ou sem permissão."
  if (message.includes("delivery_driver_not_active")) return "Seu cadastro de entregador está inativo."
  if (message.includes("delivery_payment_confirmation_not_applicable")) return "A confirmação operacional só está disponível para pagamentos em dinheiro."
  if (message.includes("delivery_invitation_invalid")) return "Convite inválido, expirado ou não corresponde a esta conta."
  return fallback
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

  if (error) return { success: false as const, error: normalizeError(error, "Não foi possível carregar suas entregas.") }
  const rows = Array.isArray(data) ? data : []
  const hasMore = rows.length > limit
  const items = (hasMore ? rows.slice(0, limit) : rows).map((row: any) => ({
    ...row,
    delivery_fee: Number(row.delivery_fee || 0),
    total_amount: Number(row.total_amount || 0),
    items: Array.isArray(row.items) ? row.items : [],
  }))
  const last = items[items.length - 1]
  return {
    success: true as const,
    items,
    hasMore,
    nextCursor: hasMore && last ? { assignedAt: last.assigned_at, id: last.assignment_id } : null,
  }
}

export async function getMyDeliveryAssignmentAction(assignmentId: string) {
  await requireDeliveryDriver()
  if (!assignmentId) return { success: false as const, error: "Entrega inválida." }
  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase.rpc("get_my_delivery_assignment", { p_assignment_id: assignmentId })
  if (error || !data) return { success: false as const, error: normalizeError(error, "Entrega não encontrada.") }
  return {
    success: true as const,
    data: {
      ...data,
      delivery_fee: Number(data.delivery_fee || 0),
      total_amount: Number(data.total_amount || 0),
      items: Array.isArray(data.items) ? data.items : [],
    },
  }
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
  revalidatePath("/entregadores")
  revalidatePath(`/entregadores/entregas/${params.assignmentId}`)
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
  revalidatePath(`/entregadores/entregas/${assignmentId}`)
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
