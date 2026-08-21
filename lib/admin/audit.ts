/**
 * Admin audit logger.
 *
 * Writes to admin_audit_logs via service-role client (append-only, non-destructive).
 * This is the ONLY place service-role is used for mutations in the admin panel.
 * The audit_logs table has no UPDATE/DELETE - immutability enforced by DB trigger.
 *
 * @module admin/audit
 */

import "server-only"
import { headers } from "next/headers"
import { getAdminClient } from "@/lib/supabase/admin"
import type { AdminAuditLogEntry } from "@/lib/admin/types"
import { getTrustedClientIP } from "@/lib/security/client-ip"

// ─── IP / UA Resolution ────────────────────────────────────────────────────

async function getClientIP(): Promise<string> {
    try {
        const headersList = await headers()
        return getTrustedClientIP(headersList)
    } catch {
        return "unknown"
    }
}

async function getUserAgent(): Promise<string> {
    try {
        const headersList = await headers()
        return headersList.get("user-agent") || "unknown"
    } catch {
        return "unknown"
    }
}

async function getSessionId(): Promise<string | null> {
    try {
        const headersList = await headers()
        // Extract session hint from cookie - not the full JWT, just an identifier
        const cookieHeader = headersList.get("cookie") || ""
        const sessionMatch = cookieHeader.match(/sb-[^=]+-auth-token\.0=([^;]{8})/)
        return sessionMatch ? `sess_${sessionMatch[1]}` : null
    } catch {
        return null
    }
}

// ─── Main Logger ────────────────────────────────────────────────────────────

/**
 * Write an immutable admin audit log entry.
 *
 * Uses service-role client because admin_audit_logs has no RLS policies
 * for authenticated users (append-only, service-role only).
 *
 * This function is fire-and-forget safe: it never throws.
 * Errors are logged to console for monitoring.
 */
export async function adminAuditLog(entry: AdminAuditLogEntry): Promise<void> {
    try {
        const admin = getAdminClient()
        const [ip, ua, sessionId] = await Promise.all([getClientIP(), getUserAgent(), getSessionId()])

        await admin.from("admin_audit_logs").insert({
            admin_user_id: entry.adminUserId,
            action_type: entry.actionType,
            target_type: entry.targetType,
            target_id: entry.targetId || null,
            metadata: entry.metadata || {},
            session_id: entry.sessionId || sessionId,
            ip_address: ip,
            user_agent: ua,
        })
    } catch (error) {
        // Audit logging must NEVER break the primary action.
        console.error("[ADMIN_AUDIT] Failed to write audit log:", {
            action: entry.actionType,
            error: error instanceof Error ? error.message : String(error),
        })
    }
}
