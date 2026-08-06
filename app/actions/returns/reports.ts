"use server"

import { createHash } from "crypto"
import { headers } from "next/headers"
import { z } from "zod"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { createAdminClient } from "@/lib/supabase/server"
import { requireUser } from "@/lib/auth/authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { errorResponse, successResponse } from "@/lib/utils/action-helpers"
import { canReportReturnToDudit, DUDIT_REPORT_LEGAL_NOTICE } from "@/lib/returns/policy"
import {
  requireCSRF,
  extractCSRFTokenFromObject,
} from "@/lib/security/csrf-action-wrapper"

const reportSchema = z.object({
  returnRequestId: z.string().uuid(),
  reasonCode: z.enum([
    "return_sla_violation",
    "return_denied_unfairly",
    "seller_abuse",
    "return_abuse",
    "scam_or_fraud",
    "other",
  ]),
  description: z.string().trim().max(2000).optional().nullable(),
  legalAcknowledged: z.literal(true),
  idempotencyKey: z.string().trim().max(160).optional().nullable(),
  csrf_token: z.string().optional(),
})

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex")
}

async function getRequestHeadersSafe(): Promise<{ ip: string; ua: string }> {
  try {
    const h = await headers()
    const fwd = h.get("x-forwarded-for")
    const ip = fwd ? fwd.split(",")[0].trim() : h.get("x-real-ip") || "unknown"
    const ua = h.get("user-agent") || "unknown"
    return { ip, ua }
  } catch {
    return { ip: "unknown", ua: "unknown" }
  }
}

export async function reportReturnToDuditAction(input: z.infer<typeof reportSchema>) {
  try {
    await requireRateLimit(RateLimitCategory.REPORT_CREATE)

    const csrfToken = extractCSRFTokenFromObject(input as Record<string, unknown>)
    const csrfValidation = await requireCSRF(csrfToken)
    if (!csrfValidation.valid) {
      return errorResponse(csrfValidation.error || "Token CSRF inválido")
    }

    const parsed = reportSchema.parse(input)
    const user = await requireUser()
    const admin = createAdminClient()

    const { data: request, error: fetchError } = await admin
      .from("return_requests")
      .select("id, status, sla_status, customer_user_id, customer_id, reported_to_dudit_at, dudit_report_id")
      .eq("id", parsed.returnRequestId)
      .is("deleted_at", null)
      .maybeSingle()

    if (fetchError || !request) {
      return errorResponse("Solicitação não encontrada")
    }

    const isCustomer =
      request.customer_user_id === user.id || request.customer_id === user.id

    if (!isCustomer) {
      return errorResponse("Apenas o cliente pode reportar esta solicitação")
    }

    if (request.dudit_report_id || request.reported_to_dudit_at) {
      return successResponse({ reportId: request.dudit_report_id, alreadyReported: true })
    }

    const canReport =
      canReportReturnToDudit({
        status: request.status,
        slaStatus: request.sla_status,
        reportedToDuditAt: request.reported_to_dudit_at,
      }) || ["seller_abuse", "return_abuse"].includes(parsed.reasonCode)

    if (!canReport) {
      return errorResponse(
        "Reporte disponível apenas quando o prazo de resposta expirou, a solicitação foi recusada ou para denúncia de abuso"
      )
    }

    const { ip, ua } = await getRequestHeadersSafe()
    const ipHash = sha256(ip)
    const uaHash = sha256(ua)
    const fingerprint = sha256(
      [user.id, parsed.returnRequestId, parsed.reasonCode, ip.slice(0, 8), ua.slice(0, 64)].join("|")
    )

    const { data: result, error: rpcError } = await admin.rpc("report_return_to_dudit", {
      p_return_request_id: parsed.returnRequestId,
      p_reporter_user_id: user.id,
      p_reason_code: parsed.reasonCode,
      p_description: parsed.description || null,
      p_legal_ack: true,
      p_idempotency_key: parsed.idempotencyKey || `report:${parsed.returnRequestId}:${user.id}`,
      p_ip_hash: ipHash,
      p_ua_hash: uaHash,
      p_fingerprint: fingerprint,
    })

    if (rpcError) {
      if (rpcError.message.includes("report_not_allowed")) {
        return errorResponse("Reporte não permitido neste momento")
      }
      if (rpcError.message.includes("legal_ack_required")) {
        return errorResponse(DUDIT_REPORT_LEGAL_NOTICE)
      }
      throw rpcError
    }

    return successResponse({
      reportId: result?.report_id,
      created: result?.created === true,
      idempotent: result?.idempotent === true,
    })
  } catch (e: unknown) {
    console.error("[REPORT_RETURN] Unexpected error:", e)
    return errorResponse("Erro ao enviar reporte")
  }
}

export async function addReturnMessageAction(input: {
  returnRequestId: string
  partnerId: string
  message: string
  senderRole: "customer" | "seller"
  idempotencyKey?: string | null
}) {
  try {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    const user = await requireUser()
    const supabase = await getSupabaseServerClient()
    const admin = createAdminClient()

    const message = String(input.message || "").trim()
    if (message.length < 1 || message.length > 2000) {
      return errorResponse("Mensagem inválida")
    }

    const { data: request } = await admin
      .from("return_requests")
      .select("id, partner_id, customer_user_id, customer_id, status")
      .eq("id", input.returnRequestId)
      .eq("partner_id", input.partnerId)
      .is("deleted_at", null)
      .maybeSingle()

    if (!request) return errorResponse("Solicitação não encontrada")

    if (input.senderRole === "seller") {
      const { requirePermission } = await import("@/lib/permissions/access")
      await requirePermission(input.partnerId, "orders", "edit")
    } else {
      const isCustomer =
        request.customer_user_id === user.id || request.customer_id === user.id
      if (!isCustomer) return errorResponse("Sem permissão")
    }

    const idempotencyKey = input.idempotencyKey || `msg:${input.returnRequestId}:${Date.now()}`
    const { data: inserted, error } = await supabase
      .from("return_messages")
      .insert({
        return_request_id: input.returnRequestId,
        partner_id: input.partnerId,
        sender_user_id: user.id,
        sender_role: input.senderRole,
        message,
        idempotency_key: idempotencyKey,
      })
      .select("id, created_at")
      .maybeSingle()

    if (error) {
      if (error.code === "23505") {
        return successResponse({ idempotent: true })
      }
      throw error
    }

    await admin.from("audit_logs").insert({
      table_name: "return_requests",
      action: "MESSAGE_SENT",
      action_type: "message_sent",
      entity_type: "return_request",
      entity_id: input.returnRequestId,
      partner_id: input.partnerId,
      actor_user_id: user.id,
      user_id: user.id,
      change_lines: [`Nova mensagem (${input.senderRole === "seller" ? "vendedor" : "cliente"})`],
      source: "user",
      metadata: { message_id: inserted?.id, idempotency_key: `${idempotencyKey}:event` }
    })

    return successResponse({ id: inserted?.id, createdAt: inserted?.created_at })
  } catch (e: unknown) {
    return errorResponse(e instanceof Error ? e.message : "Erro ao enviar mensagem")
  }
}

export async function getReturnMessagesAction(
  returnRequestId: string,
  partnerId: string,
  options?: { limit?: number; before?: string | null },
) {
  try {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    const user = await requireUser()
    const admin = createAdminClient()
    const limit = Math.min(Math.max(Number(options?.limit || 50), 1), 100)

    const { data: request } = await admin
      .from("return_requests")
      .select("customer_user_id, customer_id")
      .eq("id", returnRequestId)
      .eq("partner_id", partnerId)
      .maybeSingle()

    if (!request) return errorResponse("Solicitação não encontrada")

    const isCustomer =
      request.customer_user_id === user.id || request.customer_id === user.id

    if (!isCustomer) {
      const { requirePermission } = await import("@/lib/permissions/access")
      await requirePermission(partnerId, "orders", "view")
    }

    let query = admin
      .from("return_messages")
      .select("id, sender_role, sender_user_id, message, created_at")
      .eq("return_request_id", returnRequestId)
      .order("created_at", { ascending: false })
      .limit(limit + 1)

    if (options?.before) {
      query = query.lt("created_at", options.before)
    }

    const { data, error } = await query
    if (error) throw error

    const rows = data || []
    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(0, limit) : rows

    return successResponse({
      items: page.reverse(),
      hasMore,
      nextBefore: hasMore && page[0] ? page[0].created_at : null,
    })
  } catch (e: unknown) {
    return errorResponse(e instanceof Error ? e.message : "Erro ao carregar mensagens")
  }
}
