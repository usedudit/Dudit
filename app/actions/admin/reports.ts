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
import { requireAdmin } from "@/lib/auth/admin-authorization"
import { requireUser } from "@/lib/auth/authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { adminAuditLog } from "@/lib/admin/audit"
import { AdminActionType } from "@/lib/admin/types"
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

// ─── Types ──────────────────────────────────────────────────────────────────

export type ReportTargetType = "product" | "partner" | "review" | "service"
export type ReportStatus = "pending" | "validated" | "dismissed" | "spam"

export interface Report {
    id: string
    reporter_user_id: string
    reporter_name: string
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
        const fwd = h.get("x-forwarded-for")
        const ip = fwd ? fwd.split(",")[0].trim() : h.get("x-real-ip") || "unknown"
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
    if (!["product", "partner", "review", "service"].includes(data.targetType)) {
        return { success: false, error: "Tipo de alvo inválido" }
    }

    const description = sanitizeString(data.description, MAX_DESC_LEN)
    const reasonLabel = getReasonLabel(data.reasonCode)
    const reasonStored = sanitizeString(reasonLabel, MAX_REASON_LEN)

    if (!reasonStored || reasonStored.length < 3) {
        return { success: false, error: "Motivo inválido" }
    }

    // 4. Verify target exists (uses correct table per type).
    const targetTable: Record<ReportTargetType, string> = {
        product: "products",
        service: "services",
        partner: "partners",
        review: "reviews",
    }
    const tableName = targetTable[data.targetType]
    const { data: target, error: targetError } = await supabase
        .from(tableName)
        .select("id")
        .eq("id", targetId)
        .single()

    if (targetError || !target) {
        return { success: false, error: "Item não encontrado" }
    }

    // 5. Build anti-abuse fingerprints (hashed - never store raw IP/UA).
    const { ip, ua } = await getRequestHeadersSafe()
    const ipHash = sha256(ip)
    const uaHash = sha256(ua)
    const fingerprint = buildFingerprint({
        userId: user.id,
        targetType: data.targetType,
        targetId,
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
        target_id: targetId,
        reason: reasonStored,
        reason_code: data.reasonCode,
        description: description || null,
        reporter_ip_hash: ipHash,
        reporter_ua_hash: uaHash,
        fingerprint,
        metadata: { source: "web" },
    })

    if (insertError) {
        if (insertError.code === "23505") {
            return { success: false, error: "Você já reportou este item" }
        }
        // Self-report trigger uses errcode 42501.
        if (insertError.code === "42501") {
            return { success: false, error: "Você não pode denunciar o próprio item" }
        }
        console.error("[REPORTS] insert error:", insertError.message)
        return { success: false, error: "Não foi possível registrar a denúncia" }
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
    await requireAdmin("moderator")
    await requireRateLimit(RateLimitCategory.ADMIN_READ)

    const supabase = await getSupabaseServerClient()
    const pageSize = Math.min(Math.max(1, Math.floor(limit || DEFAULT_PAGE_SIZE)), MAX_PAGE_SIZE)

    let query = supabase
        .from("reports")
        .select(`
            id, reporter_user_id, target_type, target_id,
            reason, reason_code, description,
            status, resolved_by, resolved_at, resolution_reason, created_at,
            reporter:user_profiles!reports_reporter_user_id_fkey(full_name)
        `)

    // Status filter (server-side).
    const statusFilter = filters?.status
    if (statusFilter && statusFilter !== "all") {
        query = query.eq("status", statusFilter)
    } else if (!statusFilter || statusFilter === undefined) {
        query = query.eq("status", "pending")
    }

    // Target type filter.
    if (filters?.targetType && filters.targetType !== "all") {
        query = query.eq("target_type", filters.targetType)
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
    const partnerIds = items.filter((r: any) => r.target_type === "partner").map((r: any) => r.target_id)
    const reviewIds = items.filter((r: any) => r.target_type === "review").map((r: any) => r.target_id)

    const targetNames = new Map<string, string>()

    const fetches: Promise<unknown>[] = []
    if (productIds.length > 0) {
        fetches.push(
            supabase.from("products").select("id, name").in("id", productIds).then(({ data }: any) => {
                ; (data || []).forEach((p: any) => targetNames.set(`product:${p.id}`, p.name))
            })
        )
    }
    if (serviceIds.length > 0) {
        fetches.push(
            supabase.from("services").select("id, name").in("id", serviceIds).then(({ data }: any) => {
                ; (data || []).forEach((s: any) => targetNames.set(`service:${s.id}`, s.name))
            })
        )
    }
    if (partnerIds.length > 0) {
        fetches.push(
            supabase
                .from("partners")
                .select("id, store_name")
                .in("id", partnerIds)
                .then(({ data }: any) => {
                    ; (data || []).forEach((p: any) => targetNames.set(`partner:${p.id}`, p.store_name))
                })
        )
    }
    if (reviewIds.length > 0) {
        fetches.push(
            supabase
                .from("reviews")
                .select("id, comment, partner_id")
                .in("id", reviewIds)
                .then(({ data }: any) => {
                    ; (data || []).forEach((rv: any) => {
                        const snippet = (rv.comment || "Avaliação").slice(0, 60)
                        targetNames.set(`review:${rv.id}`, snippet)
                    })
                })
        )
    }
    await Promise.all(fetches)

    const mapped: Report[] = items.map((r: any) => {
        const reporterName = Array.isArray(r.reporter)
            ? r.reporter[0]?.full_name
            : r.reporter?.full_name
        const tname = targetNames.get(`${r.target_type}:${r.target_id}`)
        return attachReasonInfo({
            id: r.id,
            reporter_user_id: r.reporter_user_id,
            reporter_name: reporterName || "Desconhecido",
            target_type: r.target_type,
            target_id: r.target_id,
            target_name: tname || r.target_id,
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
    await requireAdmin("moderator")
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
    await requireAdmin("moderator")
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
    const admin = await requireAdmin("moderator")
    await requireRateLimit(RateLimitCategory.ADMIN_ACTION)

    const id = sanitizeUUID(reportId)
    if (!id) return { success: false, error: "ID inválido" }

    const cleanReason = sanitizeString(reason, MAX_RESOLUTION_LEN)
    if (!cleanReason || cleanReason.length < 5) {
        return { success: false, error: "O motivo deve ter pelo menos 5 caracteres" }
    }

    const supabase = await getSupabaseServerClient()
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

    return { success: true }
}

// ─── Dismiss Report (no risk change, atomic via RPC) ───────────────────────

export async function dismissReport(
    reportId: string,
    reason: string
): Promise<{ success: boolean; error?: string }> {
    const admin = await requireAdmin("moderator")
    await requireRateLimit(RateLimitCategory.ADMIN_ACTION)

    const id = sanitizeUUID(reportId)
    if (!id) return { success: false, error: "ID inválido" }

    const cleanReason = sanitizeString(reason, MAX_RESOLUTION_LEN)
    if (!cleanReason || cleanReason.length < 5) {
        return { success: false, error: "O motivo deve ter pelo menos 5 caracteres" }
    }

    const supabase = await getSupabaseServerClient()
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

    return { success: true }
}

// ─── Mark Report as Spam (atomic via RPC) ──────────────────────────────────

export async function markReportSpam(
    reportId: string,
    reason: string
): Promise<{ success: boolean; error?: string }> {
    const admin = await requireAdmin("moderator")
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
    const admin = await requireAdmin("admin") // higher bar for reversals
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
