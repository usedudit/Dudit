"use server"

/**
 * Report / Denúncia server actions.
 *
 * USER-FACING:
 *   - createReport()
 *
 * ADMIN-FACING:
 *   - getReports()                  cursor-based (status / target_type / search)
 *   - getReportsStats()             aggregated counters
 *   - getTargetReportSummary()      per-target aggregates
 *   - resolveReport()  -> validate (RPC, atomic, idempotent +5 risk)
 *   - dismissReport()  -> dismiss  (RPC, atomic)
 *   - markReportSpam() -> spam     (RPC, atomic)
 *   - revertReportValidation()     (RPC, atomic, -5 risk via ledger)
 *
 * Anti-abuse:
 *   - unique (reporter_user_id, target_type, target_id) (DB)
 *   - DB triggers: sanitize_text(), self-report blocker
 *   - app-side: CSRF, requireRateLimit (USER_PLUS_IP, fail-closed),
 *     reason-code allow-list, length caps, fingerprint/IP/UA hashing.
 *
 * Risk ledger:
 *   - partner_risk_events guarantees 1 active risk event per report,
 *     so retries / double-clicks never inflate risk_score.
 *   - revert_report_validation marks the event reverted and decrements.
 */

import { createHash } from "crypto"
import { headers } from "next/headers"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requireAdminScope } from "@/lib/auth/admin-authorization"
import { getAdminClient } from "@/lib/supabase/admin"
import { requireUser } from "@/lib/auth/authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { adminAuditLog } from "@/lib/admin/audit"
import { AdminActionType } from "@/lib/admin/types"
import { getTrustedClientIP } from "@/lib/security/client-ip"
import type { CursorPaginatedResult } from "@/lib/admin/types"
import { sanitizeString, sanitizeUUID } from "@/lib/security/input-sanitizer"
import {
    isValidReasonCode,
    getReasonLabel,
    getReasonSeverity,
    type ReportReasonCode,
} from "@/lib/admin/report-reasons"
import {
    requireCSRF,
    extractCSRFTokenFromObject,
} from "@/lib/security/csrf-action-wrapper"
import { sendMarketplaceReport, sendContentReported } from "@/lib/services/discord-marketplace-webhook.service"

// ─── Types ──────────────────────────────────────────────────────────────────

export type ReportTargetType = "product" | "partner" | "review" | "service" | "return_request"
export type ReportStatus = "pending" | "validated" | "dismissed" | "spam"

export interface Report {
    id: string
    reporter_user_id: string
    reporter_name: string
    reporter_email: string
    target_type: ReportTargetType
    target_id: string
    target_name: string
    reason: string
    reason_code: string | null
    reason_label: string
    severity: "low" | "normal" | "high"
    description: string | null
    status: ReportStatus
    resolved_by: string | null
    resolved_at: string | null
    resolution_reason: string | null
    created_at: string
}

export interface ReportsStats {
    pending: number
    validated: number
    dismissed: number
    spam: number
    total: number
}

export interface TargetReportSummary {
    pending: number
    validated: number
    dismissed: number
    spam: number
    total: number
    distinct_reporters: number
}

export interface ReportListFilters {
    status?: ReportStatus | "all"
    targetType?: ReportTargetType | "all"
    search?: string
}

// ─── Internal helpers ──────────────────────────────────────────────────────

const MAX_PAGE_SIZE = 50
const DEFAULT_PAGE_SIZE = 30
const MAX_REASON_LEN = 200
const MAX_DESC_LEN = 2000
const MAX_RESOLUTION_LEN = 1000

function sha256(input: string): string {
    return createHash("sha256").update(input).digest("hex")
}

async function getRequestHeadersSafe(): Promise<{ ip: string; ua: string }> {
    try {
        const h = await headers()
        const ip = getTrustedClientIP(h)
        const ua = h.get("user-agent") || "unknown"
        return { ip, ua }
    } catch {
        return { ip: "unknown", ua: "unknown" }
    }
}

function buildFingerprint(input: {
    userId: string
    targetType: string
    targetId: string
    reasonCode: string | null
    description: string | null
    ip: string
    ua: string
}): string {
    const ipPrefix = input.ip.split(".").slice(0, 2).join(".") || input.ip.slice(0, 8)
    const normalized = (input.description || "").trim().toLowerCase().slice(0, 120)
    const composite = [
        input.userId,
        input.targetType,
        input.targetId,
        input.reasonCode || "",
        normalized,
        ipPrefix,
        input.ua.slice(0, 64),
    ].join("|")
    return sha256(composite)
}

function sanitizeIlike(input: string): string {
    return input.replace(/[%_\\]/g, c => `\\${c}`)
}

function escapeOrLiteral(input: string): string {
    // Used inside an "or()" filter expression. Reject characters that could break it.
    return input.replace(/[(),]/g, " ").trim()
}

function attachReasonInfo<T extends { reason_code: string | null; reason: string }>(r: T): T & {
    reason_label: string
    severity: "low" | "normal" | "high"
} {
    const code = r.reason_code
    return {
        ...r,
        reason_label: code ? getReasonLabel(code) : r.reason,
        severity: getReasonSeverity(code),
    }
}

// ─── Create Report (user-facing) ────────────────────────────────────────────

export async function createReport(data: {
    targetType: ReportTargetType
    targetId: string
    reasonCode: ReportReasonCode | string
    description?: string
    csrf_token?: string
}): Promise<{ success: boolean; error?: string }> {
    // 1. Rate limit FIRST (fail-closed for REPORT_CREATE).
    await requireRateLimit(RateLimitCategory.REPORT_CREATE)

    // 2. CSRF (defense-in-depth on top of Next.js Action verification).
    const csrfToken = extractCSRFTokenFromObject(data as Record<string, unknown>)
    const csrfValidation = await requireCSRF(csrfToken)
    if (!csrfValidation.valid) {
        return { success: false, error: csrfValidation.error || "Token CSRF inválido" }
    }

    const user = await requireUser()
    const supabase = await getSupabaseServerClient()

    // 3. Strict input validation + sanitization.
    if (!isValidReasonCode(data.reasonCode)) {
        return { success: false, error: "Motivo inválido" }
    }
    const targetId = sanitizeUUID(data.targetId)
    if (!targetId) {
        return { success: false, error: "Identificador inválido" }
    }
    if (!["product", "partner", "review", "service", "return_request"].includes(data.targetType)) {
        return { success: false, error: "Tipo de alvo inválido" }
    }

    const description = sanitizeString(data.description, MAX_DESC_LEN)
    const reasonLabel = getReasonLabel(data.reasonCode)
    const reasonStored = sanitizeString(reasonLabel, MAX_REASON_LEN)

    if (!reasonStored || reasonStored.length < 3) {
        return { success: false, error: "Motivo inválido" }
    }

    const targetTable: Record<ReportTargetType, string> = {
        product: "products",
        service: "services",
        partner: "partners",
        review: "reviews",
        return_request: "return_requests",
    }
    const tableName = targetTable[data.targetType]

    // We use adminClient to verify existence to bypass RLS false-negatives (user just needs to know if it exists)
    const adminClient = getAdminClient()
    let finalTargetId = targetId
    let targetFound = false

    if (data.targetType === "partner") {
        // A partner report might receive a partner_id (from 'partners' table) or a store_id (from 'stores' table)
        const { data: partnerRow } = await adminClient
            .from("partners")
            .select("id, user_id")
            .eq("id", targetId)
            .maybeSingle()

        if (partnerRow?.id) {
            finalTargetId = partnerRow.id
            targetFound = true
            if (partnerRow.user_id === user.id) {
                return { success: false, error: "Você não pode denunciar o próprio negócio" }
            }
        } else {
            // Check if targetId is a store ID
            const { data: storeRow } = await adminClient
                .from("stores")
                .select("id, partner_id, partners(id, user_id)")
                .eq("id", targetId)
                .maybeSingle()

            if (storeRow?.partner_id) {
                finalTargetId = storeRow.partner_id
                targetFound = true
                const storeOwnerUserId = (storeRow.partners as any)?.user_id
                if (storeOwnerUserId === user.id) {
                    return { success: false, error: "Você não pode denunciar o próprio negócio" }
                }
            } else if (storeRow?.id) {
                finalTargetId = storeRow.id
                targetFound = true
            }
        }
    } else {
        const { data: target, error: targetError } = await adminClient
            .from(tableName)
            .select("id")
            .eq("id", targetId)
            .maybeSingle()

        if (target?.id && !targetError) {
            targetFound = true
        }
    }

    if (!targetFound) {
        console.warn(`[ADMIN_REPORTS] Target not found for report: targetType='${data.targetType}', targetId='${targetId}'`)
        return { success: false, error: "Item não encontrado" }
    }

    // 5. Build anti-abuse fingerprints (hashed - never store raw IP/UA).
    const { ip, ua } = await getRequestHeadersSafe()
    const ipHash = sha256(ip)
    const uaHash = sha256(ua)
    const fingerprint = buildFingerprint({
        userId: user.id,
        targetType: data.targetType,
        targetId: finalTargetId,
        reasonCode: data.reasonCode,
        description,
        ip,
        ua,
    })

    // 6. Insert. DB enforces:
    //    - unique (reporter_user_id, target_type, target_id)
    //    - self-report blocker trigger
    //    - sanitize_text trigger
    const { error: insertError } = await supabase.from("reports").insert({
        reporter_user_id: user.id,
        target_type: data.targetType,
        target_id: finalTargetId,
        reason: reasonStored,
        reason_code: data.reasonCode,
        description: description || null,
        reporter_ip_hash: ipHash,
        reporter_ua_hash: uaHash,
        fingerprint,
        metadata: {
            source: "web",
            ...(targetId !== finalTargetId ? { original_target_id: targetId } : {}),
        },
    })

    if (insertError) {
        if (insertError.code === "23505") {
            return { success: false, error: "Você já reportou este item" }
        }
        // Self-report trigger uses errcode 42501.
        if (insertError.code === "42501" || insertError.message?.includes("self_report_forbidden")) {
            return { success: false, error: "Você não pode denunciar o próprio negócio ou item" }
        }
        console.error("[REPORTS] insert error:", insertError.message, insertError)
        return { success: false, error: "Não foi possível registrar a denúncia" }
    }

    // Discord webhook: notificar denúncia criada (fail-open, não bloqueia fluxo)
    try {
        let entityName = ""
        if (data.targetType === "product") {
            const { data: p } = await adminClient.from("products").select("name").eq("id", finalTargetId).maybeSingle()
            entityName = p?.name || ""
        } else if (data.targetType === "service") {
            const { data: s } = await adminClient.from("services").select("name").eq("id", finalTargetId).maybeSingle()
            entityName = s?.name || ""
        } else if (data.targetType === "partner") {
            const { data: st } = await adminClient.from("stores").select("name").eq("partner_id", finalTargetId).order("is_headquarters", { ascending: false }).limit(1).maybeSingle()
            entityName = st?.name || ""
        } else if (data.targetType === "review") {
            const { data: r } = await adminClient.from("reviews").select("comment").eq("id", finalTargetId).maybeSingle()
            entityName = r?.comment ? r.comment.slice(0, 80) : ""
        }

        sendContentReported({
            entityType: data.targetType as "product" | "service",
            entityId: finalTargetId,
            entityName,
            reasonCode: data.reasonCode,
            reasonLabel,
            reporterUserId: user.id,
            reporterEmail: user.email,
        }).catch(err => console.warn("[REPORTS] Discord webhook failed (non-blocking):", err))
    } catch {
        // Non-critical: don't fail the report creation
    }

    return { success: true }
}

// ─── Get Reports (admin) ────────────────────────────────────────────────────

export interface CursorIn {
    created_at: string
    id: string
}

function encodeCursor(c: CursorIn): string {
    return Buffer.from(JSON.stringify(c)).toString("base64url")
}

function decodeCursor(c: string | null | undefined): CursorIn | null {
    if (!c) return null
    try {
        const obj = JSON.parse(Buffer.from(c, "base64url").toString("utf8"))
        if (obj && typeof obj.created_at === "string" && typeof obj.id === "string") {
            return obj as CursorIn
        }
    } catch {
        return null
    }
    return null
}

export async function getReports(
    cursor?: string | null,
    limit: number = DEFAULT_PAGE_SIZE,
    filters?: ReportListFilters
): Promise<CursorPaginatedResult<Report>> {
    await requireAdminScope("moderation")
    await requireRateLimit(RateLimitCategory.ADMIN_READ)

    const adminClient = getAdminClient()
    const pageSize = Math.min(Math.max(1, Math.floor(limit || DEFAULT_PAGE_SIZE)), 200)

    let query = adminClient
        .from("reports")
        .select(`
            id, reporter_user_id, target_type, target_id,
            reason, reason_code, description,
            status, resolved_by, resolved_at, resolution_reason, created_at
        `)

    // Status filter (server-side).
    const statusFilter = filters?.status
    if (statusFilter && statusFilter !== "all") {
        query = query.eq("status", statusFilter)
    }

    // Target type filter.
    if (filters?.targetType && filters.targetType !== "all") {
        if (filters.targetType === "partner") {
            query = query.or("target_type.eq.partner,target_type.eq.store")
        } else {
            query = query.eq("target_type", filters.targetType)
        }
    }

    // Search across reason / description (server-side).
    const search = filters?.search ? escapeOrLiteral(filters.search.trim()) : ""
    if (search.length > 0 && search.length <= 100) {
        const sanitized = sanitizeIlike(search)
        query = query.or(
            `reason.ilike.%${sanitized}%,description.ilike.%${sanitized}%,reason_code.ilike.%${sanitized}%`
        )
    }

    // Keyset cursor: created_at DESC, id DESC.
    const c = decodeCursor(cursor)
    if (c) {
        // (created_at, id) < (cursor.created_at, cursor.id)
        query = query.or(
            `created_at.lt.${c.created_at},and(created_at.eq.${c.created_at},id.lt.${c.id})`
        )
    }

    query = query
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(pageSize + 1)

    const { data: reports, error } = await query

    if (error) {
        console.error("[ADMIN_REPORTS] Failed to fetch reports:", error.message)
        return { data: [], nextCursor: null, prevCursor: cursor || null, hasMore: false }
    }

    const items = (reports || []).slice(0, pageSize)
    const hasMore = (reports?.length || 0) > pageSize

    // Resolve target names in batch (no N+1) per target type.
    const productIds = items.filter((r: any) => r.target_type === "product").map((r: any) => r.target_id)
    const serviceIds = items.filter((r: any) => r.target_type === "service").map((r: any) => r.target_id)
    const partnerIds = items.filter((r: any) => r.target_type === "partner" || r.target_type === "store").map((r: any) => r.target_id)
    const reviewIds = items.filter((r: any) => r.target_type === "review").map((r: any) => r.target_id)
    const returnRequestIds = items.filter((r: any) => r.target_type === "return_request").map((r: any) => r.target_id)

    const targetNames = new Map<string, string>()

    const fetches: any[] = []
    if (productIds.length > 0) {
        fetches.push(
            adminClient
                .from("products")
                .select("id, name")
                .in("id", productIds)
                .then(({ data }: any) => {
                    ;(data || []).forEach((p: any) => {
                        targetNames.set(`product:${p.id}`, p.name)
                    })
                })
        )
    }
    if (serviceIds.length > 0) {
        fetches.push(
            adminClient
                .from("services")
                .select("id, name")
                .in("id", serviceIds)
                .then(({ data }: any) => {
                    ;(data || []).forEach((s: any) => {
                        targetNames.set(`service:${s.id}`, s.name)
                    })
                })
        )
    }
    if (partnerIds.length > 0) {
        const idListStr = partnerIds.join(",")
        fetches.push(
            adminClient
                .from("stores")
                .select("id, partner_id, name")
                .or(`partner_id.in.(${idListStr}),id.in.(${idListStr})`)
                .then(({ data }: any) => {
                    ;(data || []).forEach((s: any) => {
                        if (s.partner_id) {
                            targetNames.set(`partner:${s.partner_id}`, s.name)
                            targetNames.set(`store:${s.partner_id}`, s.name)
                        }
                        if (s.id) {
                            targetNames.set(`partner:${s.id}`, s.name)
                            targetNames.set(`store:${s.id}`, s.name)
                        }
                    })
                })
        )
        fetches.push(
            adminClient
                .from("partners")
                .select("id, name")
                .in("id", partnerIds)
                .then(({ data }: any) => {
                    ;(data || []).forEach((p: any) => {
                        if (!targetNames.has(`partner:${p.id}`)) {
                            targetNames.set(`partner:${p.id}`, p.name)
                        }
                    })
                })
        )
    }
    if (reviewIds.length > 0) {
        fetches.push(
            adminClient
                .from("reviews")
                .select("id, comment, partner_id")
                .in("id", reviewIds)
                .then(({ data }: any) => {
                    ;(data || []).forEach((rv: any) => {
                        const snippet = rv.comment ? `Avaliação: "${rv.comment.slice(0, 50)}"` : `Avaliação #${rv.id.slice(0, 8)}`
                        targetNames.set(`review:${rv.id}`, snippet)
                    })
                })
        )
    }
    if (returnRequestIds.length > 0) {
        fetches.push(
            adminClient
                .from("return_requests")
                .select("id, order_id, reason")
                .in("id", returnRequestIds)
                .then(({ data }: any) => {
                    ;(data || []).forEach((rr: any) => {
                        targetNames.set(`return_request:${rr.id}`, `Devolução #${rr.id.slice(0, 8)}${rr.reason ? ` - ${rr.reason}` : ""}`)
                    })
                })
        )
    }
    await Promise.all(fetches)

    // Batch-fetch reporter names from user_profiles (no FK between reports ↔ user_profiles).
    const reporterIds = [...new Set(items.map((r: any) => r.reporter_user_id as string).filter(Boolean))]
    const reporterNames = new Map<string, string>()
    if (reporterIds.length > 0) {
        const { data: reporters } = await adminClient
            .from("user_profiles")
            .select("user_id, full_name")
            .in("user_id", reporterIds)
        ;(reporters || []).forEach((p: any) => {
            if (p.full_name) reporterNames.set(p.user_id, p.full_name)
        })
    }

    const mapped: Report[] = items.map((r: any) => {
        const reporterName = reporterNames.get(r.reporter_user_id)
        const tname = targetNames.get(`${r.target_type}:${r.target_id}`) || targetNames.get(`partner:${r.target_id}`) || targetNames.get(`store:${r.target_id}`)
        return attachReasonInfo({
            id: r.id,
            reporter_user_id: r.reporter_user_id,
            reporter_name: reporterName || "Usuário",
            reporter_email: "N/A",
            target_type: r.target_type,
            target_id: r.target_id,
            target_name: tname || (
                r.target_type === "product" ? `Produto #${r.target_id.slice(0, 8)}` :
                r.target_type === "service" ? `Serviço #${r.target_id.slice(0, 8)}` :
                r.target_type === "partner" || r.target_type === "store" ? `Loja #${r.target_id.slice(0, 8)}` :
                r.target_type === "review" ? `Avaliação #${r.target_id.slice(0, 8)}` :
                r.target_type === "return_request" ? `Devolução #${r.target_id.slice(0, 8)}` :
                r.target_id
            ),
            reason: r.reason,
            reason_code: r.reason_code,
            description: r.description,
            status: r.status,
            resolved_by: r.resolved_by,
            resolved_at: r.resolved_at,
            resolution_reason: r.resolution_reason,
            created_at: r.created_at,
        } as any)
    })

    const last = items[items.length - 1] as any
    const nextCursor =
        hasMore && last
            ? encodeCursor({ created_at: last.created_at, id: last.id })
            : null

    return {
        data: mapped,
        nextCursor,
        prevCursor: cursor || null,
        hasMore,
    }
}

// ─── Stats / Aggregates (admin) ────────────────────────────────────────────

export async function getReportsStats(): Promise<ReportsStats> {
    await requireAdminScope("moderation")
    await requireRateLimit(RateLimitCategory.ADMIN_READ)

    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase.rpc("get_admin_reports_stats")

    if (error || !data) {
        console.error("[ADMIN_REPORTS] stats error:", error?.message)
        return { pending: 0, validated: 0, dismissed: 0, spam: 0, total: 0 }
    }

    const d = data as Record<string, unknown>
    return {
        pending: Number(d.pending || 0),
        validated: Number(d.validated || 0),
        dismissed: Number(d.dismissed || 0),
        spam: Number(d.spam || 0),
        total: Number(d.total || 0),
    }
}

export async function getTargetReportSummary(input: {
    targetType: ReportTargetType
    targetId: string
}): Promise<TargetReportSummary | null> {
    await requireAdminScope("moderation")
    await requireRateLimit(RateLimitCategory.ADMIN_READ)

    const targetId = sanitizeUUID(input.targetId)
    if (!targetId) return null

    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase.rpc("get_target_report_summary", {
        p_target_type: input.targetType,
        p_target_id: targetId,
    })

    if (error || !data) return null
    const d = data as Record<string, unknown>
    return {
        pending: Number(d.pending || 0),
        validated: Number(d.validated || 0),
        dismissed: Number(d.dismissed || 0),
        spam: Number(d.spam || 0),
        total: Number(d.total || 0),
        distinct_reporters: Number(d.distinct_reporters || 0),
    }
}

// ─── Resolve Report (validate, +5 risk, atomic via RPC) ────────────────────

export async function resolveReport(
    reportId: string,
    reason: string
): Promise<{ success: boolean; error?: string }> {
    const admin = await requireAdminScope("moderation")
    await requireRateLimit(RateLimitCategory.ADMIN_ACTION)

    const id = sanitizeUUID(reportId)
    if (!id) return { success: false, error: "ID inválido" }

    const cleanReason = sanitizeString(reason, MAX_RESOLUTION_LEN)
    if (!cleanReason || cleanReason.length < 5) {
        return { success: false, error: "O motivo deve ter pelo menos 5 caracteres" }
    }

    const supabase = await getSupabaseServerClient()

    const { data: reportData } = await supabase
        .from("reports")
        .select("reporter_user_id, target_type, target_id, reason")
        .eq("id", id)
        .maybeSingle()

    const { data, error } = await supabase.rpc("validate_report", {
        p_report_id: id,
        p_reason: cleanReason,
        p_points: 5,
    })

    if (error) {
        console.error("[ADMIN_REPORTS] validate_report error:", error.message)
        return { success: false, error: "Não foi possível validar a denúncia" }
    }
    const r = (data || {}) as Record<string, unknown>
    if (!r.updated) {
        return { success: false, error: "Denúncia já foi processada" }
    }

    await adminAuditLog({
        adminUserId: admin.userId,
        actionType: AdminActionType.REPORT_VALIDATE,
        targetType: (r.target_type as any) || "system",
        targetId: (r.target_id as string) || id,
        metadata: {
            reportId: id,
            reason: cleanReason,
            partnerId: r.partner_id,
            pointsApplied: r.points_applied,
            riskScore: r.risk_score,
        },
    })

    // Send notifications
    try {
        const { createNotification, createNotificationsForUsers, getPartnerTeamUserIds } = await import("@/lib/services/notification.service")
        const partnerId = r.partner_id as string | undefined
        const targetTypeLabel: Record<string, string> = {
            product: "produto", service: "serviço", partner: "loja",
            store: "loja", review: "avaliação", return_request: "devolução",
        }
        const itemLabel = targetTypeLabel[reportData?.target_type || (r.target_type as string)] || "item"
        const reportSnippet = reportData?.reason ? `"${reportData.reason.slice(0, 80)}"` : ""

        // Notify reporter
        if (reportData?.reporter_user_id) {
            await createNotification({
                userId: reportData.reporter_user_id,
                type: "admin_announcement",
                title: "Sua denúncia foi validada",
                message: `Sua denúncia sobre o ${itemLabel} ${reportSnippet} foi analisada e validada pela equipe de moderação.`,
                entityType: "announcement",
                entityId: null,
                data: {
                    audience: "customer",
                    report_id: id,
                    target_type: reportData.target_type,
                    target_id: reportData.target_id,
                    url: "/",
                },
                idempotencyKey: `report_validated_reporter:${id}:${reportData.reporter_user_id}`,
                origin: "system",
            })
        }

        // Notify owner/partner team
        if (partnerId) {
            const teamUserIds = await getPartnerTeamUserIds(partnerId)
            if (teamUserIds.length > 0) {
                await createNotificationsForUsers(teamUserIds, (uid) => ({
                    userId: uid,
                    type: "admin_announcement",
                    title: "Denúncia validada contra sua loja",
                    message: `Uma denúncia sobre um ${itemLabel} da sua loja foi validada. Um aumento de ${r.points_applied || 5} pontos foi aplicado ao score de risco.`,
                    entityType: "announcement",
                    entityId: null,
                    data: {
                        audience: "seller",
                        report_id: id,
                        target_type: reportData?.target_type,
                        target_id: reportData?.target_id,
                        partner_id: partnerId,
                        points_applied: r.points_applied,
                        risk_score: r.risk_score,
                        url: "/erp/configuracoes",
                    },
                    idempotencyKey: `report_validated_owner:${id}:${uid}`,
                    origin: "system",
                }))
            }
        }
    } catch (notifErr) {
        console.error("[ADMIN_REPORTS] Failed to send validate notifications:", notifErr)
    }

    return { success: true }
}

// ─── Dismiss Report (no risk change, atomic via RPC) ───────────────────────

export async function dismissReport(
    reportId: string,
    reason: string
): Promise<{ success: boolean; error?: string }> {
    const admin = await requireAdminScope("moderation")
    await requireRateLimit(RateLimitCategory.ADMIN_ACTION)

    const id = sanitizeUUID(reportId)
    if (!id) return { success: false, error: "ID inválido" }

    const cleanReason = sanitizeString(reason, MAX_RESOLUTION_LEN)
    if (!cleanReason || cleanReason.length < 5) {
        return { success: false, error: "O motivo deve ter pelo menos 5 caracteres" }
    }

    const supabase = await getSupabaseServerClient()

    const { data: reportData } = await supabase
        .from("reports")
        .select("reporter_user_id, target_type, target_id, reason")
        .eq("id", id)
        .maybeSingle()

    const { data, error } = await supabase.rpc("dismiss_report", {
        p_report_id: id,
        p_reason: cleanReason,
    })

    if (error) {
        console.error("[ADMIN_REPORTS] dismiss_report error:", error.message)
        return { success: false, error: "Não foi possível descartar a denúncia" }
    }
    const r = (data || {}) as Record<string, unknown>
    if (!r.updated) {
        return { success: false, error: "Denúncia já foi processada" }
    }

    await adminAuditLog({
        adminUserId: admin.userId,
        actionType: AdminActionType.REPORT_DISMISS,
        targetType: (r.target_type as any) || "system",
        targetId: (r.target_id as string) || id,
        metadata: { reportId: id, reason: cleanReason },
    })

    // Send notifications
    try {
        const { createNotification } = await import("@/lib/services/notification.service")
        const targetTypeLabel: Record<string, string> = {
            product: "produto", service: "serviço", partner: "loja",
            store: "loja", review: "avaliação", return_request: "devolução",
        }
        const itemLabel = targetTypeLabel[reportData?.target_type || (r.target_type as string)] || "item"
        const reportSnippet = reportData?.reason ? `"${reportData.reason.slice(0, 80)}"` : ""

        // Notify reporter
        if (reportData?.reporter_user_id) {
            await createNotification({
                userId: reportData.reporter_user_id,
                type: "admin_announcement",
                title: "Sua denúncia foi descartada",
                message: `Sua denúncia sobre o ${itemLabel} ${reportSnippet} foi analisada e descartada pela equipe de moderação.`,
                entityType: "announcement",
                entityId: null,
                data: {
                    audience: "customer",
                    report_id: id,
                    target_type: reportData.target_type,
                    target_id: reportData.target_id,
                    url: "/",
                },
                idempotencyKey: `report_dismissed_reporter:${id}:${reportData.reporter_user_id}`,
                origin: "system",
            })
        }
    } catch (notifErr) {
        console.error("[ADMIN_REPORTS] Failed to send dismiss notifications:", notifErr)
    }

    return { success: true }
}

// ─── Mark Report as Spam (atomic via RPC) ──────────────────────────────────

export async function markReportSpam(
    reportId: string,
    reason: string
): Promise<{ success: boolean; error?: string }> {
    const admin = await requireAdminScope("moderation")
    await requireRateLimit(RateLimitCategory.ADMIN_ACTION)

    const id = sanitizeUUID(reportId)
    if (!id) return { success: false, error: "ID inválido" }

    const cleanReason = sanitizeString(reason, MAX_RESOLUTION_LEN)
    if (!cleanReason || cleanReason.length < 5) {
        return { success: false, error: "O motivo deve ter pelo menos 5 caracteres" }
    }

    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase.rpc("mark_report_spam", {
        p_report_id: id,
        p_reason: cleanReason,
    })

    if (error) {
        console.error("[ADMIN_REPORTS] mark_report_spam error:", error.message)
        return { success: false, error: "Não foi possível marcar como spam" }
    }
    const r = (data || {}) as Record<string, unknown>
    if (!r.updated) {
        return { success: false, error: "Denúncia já foi processada" }
    }

    await adminAuditLog({
        adminUserId: admin.userId,
        actionType: AdminActionType.REPORT_SPAM,
        targetType: (r.target_type as any) || "system",
        targetId: (r.target_id as string) || id,
        metadata: { reportId: id, reason: cleanReason },
    })

    return { success: true }
}

// ─── Revert Validation (validated -> dismissed, -5 risk) ───────────────────

export async function revertReportValidation(
    reportId: string,
    reason: string
): Promise<{ success: boolean; error?: string }> {
    const admin = await requireAdminScope("moderation", "admin") // higher bar for reversals
    await requireRateLimit(RateLimitCategory.ADMIN_ACTION)

    const id = sanitizeUUID(reportId)
    if (!id) return { success: false, error: "ID inválido" }

    const cleanReason = sanitizeString(reason, MAX_RESOLUTION_LEN)
    if (!cleanReason || cleanReason.length < 5) {
        return { success: false, error: "O motivo deve ter pelo menos 5 caracteres" }
    }

    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase.rpc("revert_report_validation", {
        p_report_id: id,
        p_reason: cleanReason,
    })

    if (error) {
        console.error("[ADMIN_REPORTS] revert_report_validation error:", error.message)
        return { success: false, error: "Não foi possível reverter a denúncia" }
    }
    const r = (data || {}) as Record<string, unknown>
    if (!r.updated) {
        return { success: false, error: "Esta denúncia não está validada" }
    }

    await adminAuditLog({
        adminUserId: admin.userId,
        actionType: AdminActionType.REPORT_REVERT,
        targetType: (r.target_type as any) || "system",
        targetId: (r.target_id as string) || id,
        metadata: {
            reportId: id,
            reason: cleanReason,
            partnerId: r.partner_id,
            pointsReverted: r.points_reverted,
            riskScore: r.risk_score,
        },
    })

    return { success: true }
}

// ─── Marketplace Moderation Actions ─────────────────────────────────────────

export async function removeProductFromMarketplace(
    productId: string,
    reason: string
): Promise<{ success: boolean; error?: string }> {
    const admin = await requireAdminScope("moderation")
    await requireRateLimit(RateLimitCategory.ADMIN_ACTION)

    const id = sanitizeUUID(productId)
    if (!id) return { success: false, error: "ID de produto inválido" }

    const cleanReason = sanitizeString(reason, MAX_RESOLUTION_LEN)
    if (!cleanReason || cleanReason.length < 5) {
        return { success: false, error: "O motivo deve ter pelo menos 5 caracteres" }
    }

    const adminClient = getAdminClient()

    // Validate product exists
    const { data: product, error: productError } = await adminClient
        .from("products")
        .select("id, partner_id, name")
        .eq("id", id)
        .single()

    if (productError || !product) {
        return { success: false, error: "Produto não encontrado" }
    }

    // Update product status
    const { error: updateError } = await adminClient
        .from("products")
        .update({
            show_in_marketplace: false,
            moderation_status: "removed",
            moderation_reviewed_by: admin.userId,
            moderation_reviewed_at: new Date().toISOString(),
            moderation_reason: cleanReason,
            deleted_reason: cleanReason,
            deleted_by: admin.userId,
            deleted_at: new Date().toISOString()
        })
        .eq("id", id)

    if (updateError) {
        console.error("[ADMIN_REPORTS] Failed to remove product from marketplace:", updateError.message)
        return { success: false, error: "Falha ao remover produto do marketplace" }
    }

    await adminAuditLog({
        adminUserId: admin.userId,
        actionType: AdminActionType.REPORT_VALIDATE, // Or a custom one for product removal
        targetType: "product",
        targetId: id,
        metadata: {
            action: "removed_from_marketplace",
            reason: cleanReason,
            partnerId: product.partner_id,
            productName: product.name
        },
    })

    return { success: true }
}

export async function getAdminTargetDetails(targetType: string, targetId: string) {
    await requireAdminScope("moderation")
    await requireRateLimit(RateLimitCategory.ADMIN_READ)

    const adminClient = getAdminClient()

    if (targetType === "product") {
        const { data: product } = await adminClient
            .from("products")
            .select("*")
            .eq("id", targetId)
            .maybeSingle()

        if (!product) return null

        let store = null
        if (product.partner_id) {
            const { data: storeData } = await adminClient
                .from("stores")
                .select("id, name, logo_url, risk_score, slug, short_id, addresses(city, state)")
                .eq("partner_id", product.partner_id)
                .order("is_headquarters", { ascending: false })
                .limit(1)
                .maybeSingle()
            store = storeData
        }

        return {
            ...product,
            store,
        }
    }

    if (targetType === "service") {
        const { data: service } = await adminClient
            .from("services")
            .select("*")
            .eq("id", targetId)
            .maybeSingle()

        if (!service) return null

        let store = null
        if (service.partner_id) {
            const { data: storeData } = await adminClient
                .from("stores")
                .select("id, name, logo_url, risk_score, slug, short_id, addresses(city, state)")
                .eq("partner_id", service.partner_id)
                .order("is_headquarters", { ascending: false })
                .limit(1)
                .maybeSingle()
            store = storeData
        }

        return {
            ...service,
            store,
        }
    }

    if (targetType === "partner" || targetType === "store") {
        let store = null
        const { data: storeDirect } = await adminClient
            .from("stores")
            .select("*, partners(*)")
            .eq("id", targetId)
            .maybeSingle()

        if (storeDirect) {
            store = storeDirect
        } else {
            const { data: storeByPartner } = await adminClient
                .from("stores")
                .select("*, partners(*)")
                .eq("partner_id", targetId)
                .order("is_headquarters", { ascending: false })
                .limit(1)
                .maybeSingle()
            store = storeByPartner
        }

        if (!store) {
            const { data: partnerData } = await adminClient
                .from("partners")
                .select("*")
                .eq("id", targetId)
                .maybeSingle()
            if (partnerData) {
                return {
                    id: partnerData.id,
                    name: partnerData.name || "Parceiro",
                    partner_id: partnerData.id,
                    partners: partnerData,
                    store: { name: partnerData.name, id: partnerData.id }
                }
            }
        }

        return store ? { ...store, store } : null
    }

    if (targetType === "review") {
        const { data: review } = await adminClient
            .from("reviews")
            .select("*")
            .eq("id", targetId)
            .maybeSingle()

        if (!review) return null

        let reviewerProfile = null
        if (review.user_id) {
            const { data: p } = await adminClient
                .from("user_profiles")
                .select("full_name")
                .eq("user_id", review.user_id)
                .maybeSingle()
            reviewerProfile = p
        }

        let store = null
        if (review.partner_id) {
            const { data: storeData } = await adminClient
                .from("stores")
                .select("id, name, logo_url, risk_score, short_id, addresses(city, state)")
                .eq("partner_id", review.partner_id)
                .order("is_headquarters", { ascending: false })
                .limit(1)
                .maybeSingle()
            store = storeData
        }

        let product = null
        if (review.product_id) {
            const { data: prodData } = await adminClient
                .from("products")
                .select("id, name")
                .eq("id", review.product_id)
                .maybeSingle()
            product = prodData
        }

        let service = null
        if (review.service_id) {
            const { data: servData } = await adminClient
                .from("services")
                .select("id, name")
                .eq("id", review.service_id)
                .maybeSingle()
            service = servData
        }

        return {
            ...review,
            name: review.comment ? `Avaliação: "${review.comment.slice(0, 50)}"` : `Avaliação #${review.id.slice(0, 8)}`,
            user_profiles: reviewerProfile,
            store,
            product,
            service,
        }
    }

    if (targetType === "return_request") {
        const { data: returnReq } = await adminClient
            .from("return_requests")
            .select("*")
            .eq("id", targetId)
            .maybeSingle()

        if (!returnReq) return null

        let store = null
        if (returnReq.partner_id) {
            const { data: storeData } = await adminClient
                .from("stores")
                .select("id, name, logo_url, risk_score, short_id, addresses(city, state)")
                .eq("partner_id", returnReq.partner_id)
                .order("is_headquarters", { ascending: false })
                .limit(1)
                .maybeSingle()
            store = storeData
        }

        return {
            ...returnReq,
            name: `Devolução #${returnReq.id.slice(0, 8)}${returnReq.reason ? ` - ${returnReq.reason}` : ""}`,
            store,
        }
    }

    if (targetType === "user") {
        const { data } = await adminClient
            .from("user_profiles")
            .select("*")
            .eq("user_id", targetId)
            .maybeSingle()
        return data ? { ...data, name: data.full_name || "Usuário" } : null
    }

    return null
}

export async function getAdminReportDetailAction(reportId: string) {
    await requireAdminScope("moderation")
    await requireRateLimit(RateLimitCategory.ADMIN_READ)

    const admin = getAdminClient()

    const { data: report, error } = await admin
        .from("reports")
        .select("*")
        .eq("id", reportId)
        .maybeSingle()

    if (error || !report) {
        return null
    }

    // Reporter info
    let reporterProfile = null
    let reporterEmail = null
    if (report.reporter_user_id) {
        const { data: p } = await admin
            .from("user_profiles")
            .select("*")
            .eq("user_id", report.reporter_user_id)
            .maybeSingle()
        reporterProfile = p

        try {
            const { data: u } = await admin.auth.admin.getUserById(report.reporter_user_id)
            reporterEmail = u?.user?.email || null
        } catch { }
    }

    // Target details & summary
    const [targetDetails, targetSummary, auditEvents] = await Promise.all([
        getAdminTargetDetails(report.target_type, report.target_id),
        getTargetReportSummary({ targetType: report.target_type as ReportTargetType, targetId: report.target_id }),
        admin
            .from("admin_audit_logs")
            .select("*")
            .or(`target_id.eq.${report.target_id},target_id.eq.${report.id}`)
            .order("created_at", { ascending: false })
            .limit(20)
            .then((res: any) => res.data || []),
    ])

    return {
        report: attachReasonInfo(report as any),
        reporter: {
            profile: reporterProfile,
            email: reporterEmail,
        },
        targetDetails,
        targetSummary,
        auditEvents,
    }
}
