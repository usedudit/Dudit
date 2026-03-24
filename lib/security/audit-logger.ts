/**
 * Centralized Audit Logger for security-critical actions.
 *
 * Writes structured audit records to the `audit_logs` table.
 * Designed for multi-tenant ERP: every entry is scoped to a partner (tenant).
 *
 * Usage:
 *   await auditLog({
 *     action: "invite.created",
 *     actorUserId: user.id,
 *     partnerId: "...",
 *     metadata: { role: "OPERATOR", email: "..." },
 *   })
 *
 * @module audit-logger
 */

import { headers } from "next/headers"

// ─── Types ──────────────────────────────────────────────────────────────────

export type AuditAction =
    // Invite lifecycle
    | "invite.created"
    | "invite.accepted"
    | "invite.accepted.failed"
    | "invite.validated"
    | "invite.revoked"
    | "invite.expired"
    // Role management
    | "role.changed"
    | "member.removed"
    // Auth events
    | "auth.login"
    | "auth.logout"
    | "auth.2fa_enabled"
    | "auth.2fa_disabled"
    // Data mutations (sensitive)
    | "partner.updated"
    | "partner.deleted"
    // Subscription lifecycle
    | "subscription.created"
    | "subscription.cancelled"
    | "subscription.upgraded"
    | "subscription.downgraded"
    | "subscription.payment_failed"
    | "subscription.status_changed"

interface AuditLogEntry {
    /** The action being logged */
    action: AuditAction
    /** The user who performed the action */
    actorUserId: string
    /** The tenant this action belongs to (nullable for auth events) */
    partnerId?: string | null
    /** Target user affected by the action (e.g. invited user, removed member) */
    targetUserId?: string | null
    /** Freeform metadata for the action */
    metadata?: Record<string, unknown>
}

// ─── IP Resolution ──────────────────────────────────────────────────────────

async function getClientIP(): Promise<string> {
    try {
        const headersList = await headers()
        const forwarded = headersList.get("x-forwarded-for")
        if (forwarded) return forwarded.split(",")[0].trim()
        return headersList.get("x-real-ip") || "unknown"
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

// ─── Main Logger ────────────────────────────────────────────────────────────

/**
 * Write a structured audit log entry.
 *
 * This function is fire-and-forget safe: it never throws.
 * Errors are logged to console but do not propagate.
 */
export async function auditLog(entry: AuditLogEntry): Promise<void> {
    try {
        const { createAdminClient } = await import("@/lib/supabase/server")
        const admin = createAdminClient()
        const [ip, ua] = await Promise.all([getClientIP(), getUserAgent()])

        await admin.from("audit_logs").insert({
            table_name: "security",
            action: entry.action,
            user_id: entry.actorUserId,
            partner_id: entry.partnerId || null,
            target_user_id: entry.targetUserId || null,
            new_values: { ...entry.metadata, _ua: ua },
            ip_address: ip,
        })
    } catch (error) {
        // Audit logging must NEVER break the primary action.
        // Log to console for monitoring/alerting systems to pick up.
        console.error("[AUDIT] Failed to write audit log:", {
            action: entry.action,
            error: error instanceof Error ? error.message : String(error),
        })
    }
}
