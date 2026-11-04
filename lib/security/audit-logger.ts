/**
 * Centralized Audit Logger for security-critical actions.
 *
 * Delegates to the unified timeline service (audit_logs table).
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

import { logAuditEvent } from "@/lib/services/timeline.service"

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
    | "auth.password_changed"
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
    // Document uploads
    | "document.uploaded"
    | "document.deleted"
    // Account deletion lifecycle
    | "account.deletion_code_requested"
    | "account.deletion_code_failed"
    | "account.deletion_confirmed"
    | "account.deletion_requested"

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
    /** Source of the event (default: "system") */
    source?: "system" | "webhook" | "manual"
}

// ─── Action → Human-readable message mapping ───────────────────────────────

const ACTION_MESSAGES: Record<string, string> = {
    "invite.created": "criou um convite para a equipe.",
    "invite.accepted": "aceitou convite da equipe.",
    "invite.accepted.failed": "tentativa de aceitar convite falhou.",
    "invite.validated": "validou um convite.",
    "invite.revoked": "revogou um convite.",
    "invite.expired": "convite expirou.",
    "role.changed": "alterou o cargo de um membro.",
    "member.removed": "removeu um membro da equipe.",
    "auth.login": "realizou login.",
    "auth.logout": "realizou logout.",
    "auth.password_changed": "alterou a senha de acesso.",
    "auth.2fa_enabled": "ativou autenticação de dois fatores.",
    "auth.2fa_disabled": "desativou autenticação de dois fatores.",
    "partner.updated": "atualizou dados do parceiro.",
    "partner.deleted": "excluiu o parceiro.",
    "subscription.created": "criou assinatura.",
    "subscription.cancelled": "cancelou assinatura.",
    "subscription.upgraded": "fez upgrade do plano.",
    "subscription.downgraded": "fez downgrade do plano.",
    "subscription.payment_failed": "pagamento da assinatura falhou.",
    "subscription.status_changed": "status da assinatura alterado.",
    "document.uploaded": "enviou um documento.",
    "document.deleted": "deletou um documento.",
    "account.deletion_code_requested": "solicitou código de confirmação para exclusão de conta.",
    "account.deletion_code_failed": "falha na validação do código de exclusão de conta.",
    "account.deletion_confirmed": "confirmou a exclusão definitiva da conta.",
    "account.deletion_requested": "iniciou o processo de exclusão de conta.",
}

// ─── Main Logger ────────────────────────────────────────────────────────────

/**
 * Write a structured audit log entry.
 *
 * This function is fire-and-forget safe: it never throws.
 * Errors are logged to console but do not propagate.
 *
 * Internally delegates to logAuditEvent() from the unified timeline service.
 */
export async function auditLog(entry: AuditLogEntry): Promise<void> {
    try {
        const changeMessage = ACTION_MESSAGES[entry.action] || "ação registrada."
        const metadata: Record<string, unknown> = {
            ...(entry.metadata || {}),
        }
        if (entry.targetUserId) {
            metadata._targetUserId = entry.targetUserId
        }

        await logAuditEvent({
            partnerId: entry.partnerId || "",
            actorUserId: entry.actorUserId,
            entityType: "security",
            entityId: null,
            actionType: entry.action, // logAuditEvent normalizes dots → underscores
            changeLines: [changeMessage],
            metadata: Object.keys(metadata).length > 0 ? metadata : null,
            source: entry.source || "system",
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
