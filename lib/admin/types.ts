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
    MODERATION_EDIT_FIELD = "moderation.edit_field",
    MODERATION_REMOVE_IMAGE = "moderation.remove_image",
    MODERATION_HIDE_REVIEW = "moderation.hide_review",
    MODERATION_EDIT_REVIEW = "moderation.edit_review",
    MODERATION_RISK_SCORE = "moderation.risk_score",

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

    // Deletions
    RECURRING_PLAN_DELETE = "recurring_plan.delete",
    REVIEW_DELETE = "review.delete",

    // Financial
    SUBSCRIPTION_CANCEL = "subscription.cancel",

    // Advertising
    AD_CREATE = "advertising.create",
    AD_UPDATE = "advertising.update",
    AD_DELETE = "advertising.delete",
    AD_STATUS_CHANGE = "advertising.status_change",

    // Notifications
    ANNOUNCEMENT_SEND = "notification.announcement_send",

    // Marketplace search config
    MARKETPLACE_SYNONYM_CHANGE = "marketplace.synonym_change",
}

// ─── Audit Log Types ────────────────────────────────────────────────────────

export type AuditTargetType =
    | "user"
    | "partner"
    | "product"
    | "service"
    | "subscription"
    | "recurring_plan"
    | "system"
    | "review"
    | "return_request"
    | "advertisement"
    | "marketplace_synonym_group"
    | "marketplace_synonym_term"
    | "community_video"
    | "collection"

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
    type: "product" | "service" | "partner" | "return_dispute" | "community_video"
    title: string
    description: string | null
    price: number
    images: string[]
    owner_store_name: string
    owner_user_name: string
    partner_id: string
    store_id?: string
    store_name?: string
    store_phone?: string
    store_description?: string | null
    store_banner_url?: string | null
    store_gallery?: string[]
    store_logo_url?: string | null
    owner_user_id?: string
    moderation_status: string
    risk_score: number
    created_at: string
}

export interface FetchedProduct {
    id: string
    name: string
    description: string | null
    price: number
    images: string[]
    tags: string[] | null
    video_url: string | null
    video_type: string | null
    video_thumbnail: string | null
    moderation_status: string
    is_active: boolean
    created_at: string
    partner: { id: string; store_name: string; stores?: { name: string }[]; risk_score: number } | null
    variants: FetchedVariant[] | null
}

export interface FetchedVariant {
    id: string
    variant_name: string
    variant_type: string | null
    variant_value: string | null
    sku: string | null
    price_adjustment: number
    stock_quantity: number
    stock_available: number
    variant_options: { image?: string } | null
    is_active: boolean
}

export interface FetchedService {
    id: string
    name: string
    description: string | null
    price: number
    images: string[] | null
    tags: string[] | null
    video_url: string | null
    video_type: string | null
    video_thumbnail: string | null
    moderation_status: string
    is_active: boolean
    created_at: string
    partner: { id: string; store_name: string; stores?: { name: string }[]; risk_score: number } | null
}

export interface FetchedRecurringPlan {
    id: string
    name: string
    description: string | null
    status: string
    frequency_type: string
    show_in_marketplace: boolean
    created_at: string
    partner: { id: string; store_name: string; stores?: { name: string }[]; risk_score: number } | null
    items: FetchedRecurringPlanItem[] | null
}

export interface FetchedRecurringPlanItem {
    id: string
    item_type: string
    product_id: string | null
    service_id: string | null
    quantity: number
    unit_price: number | null
}

export interface FetchedPartner {
    id: string
    store_name: string
    store_description: string | null
    store_image_url: string | null
    banner_url: string | null
    gallery: string[] | null
    risk_score: number
    is_active: boolean
    created_at: string
    owner: { full_name: string; email: string; risk_score: number } | null
}

export interface FetchedReview {
    id: string
    rating: number
    comment: string | null
    is_hidden: boolean
    created_at: string
    user: { full_name: string | null } | null
    partner: { id: string; store_name: string; stores?: { name: string }[]; risk_score: number } | null
    product: { id: string; name: string } | null
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
        stores?: { name: string }[]
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
    partner_id?: string
    type: "partner" | "store"
    stores?: AdminStoreEntry[]
}

export interface AdminStoreEntry {
    id: string
    name: string
    is_active: boolean
    suspended_at: string | null
    suspended_reason: string | null
    risk_score: number
    created_at: string
    partner_id: string
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
