/**
 * Admin-specific TypeScript types.
 * Shared across server actions, audit logger, and UI components.
 *
 * @module admin/types
 */

// ─── Admin Roles & Scopes ───────────────────────────────────────────────────

export type AdminRole = "super_admin" | "admin" | "moderator"

export type AdminScope =
    | "moderation"
    | "user_enforcement"
    | "billing_control"
    | "audit_access"
    | "system_settings"

export interface AdminUser {
    userId: string
    role: AdminRole
    email: string
    isProtected: boolean
    scopes: AdminScope[]
}

// ─── Admin Action Types (for audit logging) ─────────────────────────────────

export enum AdminActionType {
    // Auth events
    ADMIN_LOGIN = "admin.login",
    ADMIN_LOGOUT = "admin.logout",
    ADMIN_LOGIN_FAILED = "admin.login_failed",
    ADMIN_STEP_UP = "admin.step_up",

    // Moderation
    MODERATION_APPROVE = "moderation.approve",
    MODERATION_REJECT = "moderation.reject",
    MODERATION_REPROCESS = "moderation.reprocess",

    // Reports / Denúncias
    REPORT_VALIDATE = "report.validate",
    REPORT_DISMISS = "report.dismiss",
    REPORT_SPAM = "report.spam",
    REPORT_REVERT = "report.revert",

    // User enforcement
    USER_BAN = "user.ban",
    USER_UNBAN = "user.unban",

    // Partner enforcement
    PARTNER_SUSPEND = "partner.suspend",
    PARTNER_UNSUSPEND = "partner.unsuspend",
    PARTNER_DISABLE_ERP = "partner.disable_erp",
    PARTNER_ENABLE_ERP = "partner.enable_erp",

    // Product/Service
    PRODUCT_SOFT_DELETE = "product.soft_delete",
    SERVICE_SOFT_DELETE = "service.soft_delete",

    // Financial
    SUBSCRIPTION_CANCEL = "subscription.cancel",
}

// ─── Audit Log Types ────────────────────────────────────────────────────────

export type AuditTargetType =
    | "user"
    | "partner"
    | "product"
    | "service"
    | "subscription"
    | "system"
    | "review"

export interface AdminAuditLogEntry {
    adminUserId: string
    actionType: AdminActionType
    targetType: AuditTargetType
    targetId?: string
    metadata?: Record<string, unknown>
    sessionId?: string
}

export interface AuditLogRow {
    id: string
    admin_user_id: string
    action_type: string
    target_type: string
    target_id: string | null
    metadata: Record<string, unknown>
    session_id: string | null
    ip_address: string
    user_agent: string
    created_at: string
    // Joined fields
    admin_email?: string
    admin_name?: string
    target_name?: string
}

// ─── Cursor Pagination ──────────────────────────────────────────────────────

export interface CursorPaginationParams {
    cursor?: string | null
    limit: number
    direction?: "next" | "prev"
}

export interface CursorPaginatedResult<T> {
    data: T[]
    nextCursor: string | null
    prevCursor: string | null
    hasMore: boolean
}

// ─── Moderation Types ───────────────────────────────────────────────────────

export interface ModerationItem {
    id: string
    type: "product" | "service" | "partner"
    title: string
    description: string | null
    price: number
    images: string[]
    owner_store_name: string
    owner_user_name: string
    partner_id: string
    moderation_status: string
    risk_score: number
    created_at: string
}

// ─── Enforcement Types ──────────────────────────────────────────────────────

export interface EnforcementUser {
    user_id: string
    email: string
    full_name: string
    banned_at: string | null
    banned_until: string | null
    banned_reason: string | null
    created_at: string
    partner?: {
        id: string
        store_name: string
        is_active: boolean
        suspended_at: string | null
        erp_disabled: boolean
    } | null
}

export interface EnforcementPartner {
    id: string
    store_name: string
    owner_name: string
    owner_user_id: string
    is_active: boolean
    erp_disabled: boolean
    suspended_at: string | null
    suspended_until: string | null
    risk_score: number
    created_at: string
}

// ─── Subscription Types ─────────────────────────────────────────────────────

export interface SubscriptionEntry {
    partner_id: string
    store_name: string
    user_id: string
    user_email: string
    is_active: boolean
    mp_user_id: string | null
    mp_connected_at: string | null
    mp_public_key: string | null
    mp_token_expires_at: string | null
    suspended_at: string | null
    erp_disabled: boolean
    created_at: string
}

// ─── Dashboard Stats ────────────────────────────────────────────────────────

export interface AdminDashboardStats {
    pendingModeration: number
    bannedUsers: number
    activeSubscriptions: number
    recentAuditLogs: AuditLogRow[]
}
