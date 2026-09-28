"use server"

/**
 * Admin subscription/financial server actions.
 *
 * SECURITY: Mercado Pago API calls use encrypted tokens decrypted server-side only.
 * forceCancelSubscription requires step-up re-auth.
 */

import { getAdminClient } from "@/lib/supabase/admin"
import {
    MERCADOPAGO_PROVIDER,
    mapToMpPartnerFields,
    pickMercadoPagoIntegration,
} from "@/lib/services/payments/mercadopago-integration"
import { requireAdminScope } from "@/lib/auth/admin-authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { requireStepUp } from "@/lib/admin/step-up-auth"
import { adminAuditLog } from "@/lib/admin/audit"
import { AdminActionType } from "@/lib/admin/types"
import type { SubscriptionEntry, CursorPaginatedResult } from "@/lib/admin/types"

export interface AdminSubscriptionStats {
    total: number
    connected: number
    disconnected: number
    suspended: number
}

export async function getAdminSubscriptionStats(): Promise<AdminSubscriptionStats> {
    await requireAdminScope("billing_control", "admin")
    await requireRateLimit(RateLimitCategory.ADMIN_READ)

    // partner_integrations is only readable by its own partner members, and
    // admins act on other partners: use the service-role client here.
    const supabase = getAdminClient()

    const [totalRes, connectedRes, suspendedRes] = await Promise.all([
        supabase.from("partners").select("id", { count: "exact", head: true }),
        supabase
            .from("partner_integrations")
            .select("id", { count: "exact", head: true })
            .eq("provider_slug", MERCADOPAGO_PROVIDER)
            .eq("status", "connected"),
        supabase.from("partners").select("id", { count: "exact", head: true }).not("suspended_at", "is", null),
    ])

    const total = totalRes.count || 0
    const connected = connectedRes.count || 0

    return {
        total,
        connected,
        disconnected: Math.max(total - connected, 0),
        suspended: suspendedRes.count || 0,
    }
}

// ─── Get Subscriptions ──────────────────────────────────────────────────────

export async function getSubscriptions(
    cursor?: string | null,
    limit: number = 20,
    statusFilter?: string
): Promise<CursorPaginatedResult<SubscriptionEntry>> {
    const admin = await requireAdminScope("billing_control", "admin")
    await requireRateLimit(RateLimitCategory.ADMIN_READ)

    // partner_integrations is only readable by its own partner members, and
    // admins act on other partners: use the service-role client here.
    const supabase = getAdminClient()
    const pageSize = Math.min(limit, 50)

    let query = supabase
        .from("partners")
        .select(
            "id, user_id, is_active, suspended_at, erp_disabled, created_at, partner_integrations(provider_slug, status, account_id, connected_at, config, metadata), stores(name)"
        )

    // Connection status lives in partner_integrations, which cannot be used as
    // an anti-join here, so it is applied to the scanned page below.
    if (statusFilter === "suspended") {
        query = query.not("suspended_at", "is", null)
    }

    if (cursor) {
        query = query.lt("created_at", cursor)
    }

    query = query.order("created_at", { ascending: false }).limit(pageSize + 1)

    const { data: partners, error } = await query

    if (error) {
        console.error("[ADMIN_SUBSCRIPTIONS] Failed to fetch:", error.message)
        return { data: [], nextCursor: null, prevCursor: null, hasMore: false }
    }

    const hasMore = (partners?.length || 0) > pageSize
    const scanned = (partners || []).slice(0, pageSize)

    const wantsConnected = statusFilter === "connected" || statusFilter === "disconnected"
    const items = wantsConnected
        ? scanned.filter((p: any) => {
            const isConnected = !!mapToMpPartnerFields(p.partner_integrations).mp_user_id
            return statusFilter === "connected" ? isConnected : !isConnected
        })
        : scanned

    const mapped: SubscriptionEntry[] = items.map((p: any) => {
        const mp = mapToMpPartnerFields(p.partner_integrations)
        return {
            partner_id: p.id,
            store_name: p.stores?.[0]?.name || "Loja",
            user_id: p.user_id,
            user_email: "",
            is_active: p.is_active,
            mp_user_id: mp.mp_user_id,
            mp_connected_at: mp.mp_connected_at,
            mp_public_key: mp.mp_public_key,
            mp_live_mode: mp.mp_live_mode,
            mp_token_expires_at: mp.mp_token_expires_at,
            suspended_at: p.suspended_at,
            erp_disabled: p.erp_disabled,
            created_at: p.created_at,
        }
    })

    return {
        data: mapped,
        nextCursor: hasMore && scanned.length > 0 ? scanned[scanned.length - 1].created_at : null,
        prevCursor: cursor || null,
        hasMore,
    }
}

// ─── Get Subscription Detail ────────────────────────────────────────────────

export async function getSubscriptionDetail(
    partnerId: string
): Promise<{ success: boolean; data?: SubscriptionEntry; error?: string }> {
    const admin = await requireAdminScope("billing_control", "admin")
    await requireRateLimit(RateLimitCategory.ADMIN_READ)

    // partner_integrations is only readable by its own partner members, and
    // admins act on other partners: use the service-role client here.
    const supabase = getAdminClient()

    // Anti-IDOR: re-fetch
    const { data: partner, error: fetchError } = await supabase
        .from("partners")
        .select(
            "id, user_id, is_active, suspended_at, erp_disabled, created_at, partner_integrations(provider_slug, status, account_id, connected_at, config, metadata), stores(name)"
        )
        .eq("id", partnerId)
        .single()

    if (fetchError || !partner) {
        return { success: false, error: "Parceiro não encontrado" }
    }

    const mp = mapToMpPartnerFields(partner.partner_integrations)

    return {
        success: true,
        data: {
            partner_id: partner.id,
            store_name: partner.stores?.[0]?.name || "Loja",
            user_id: partner.user_id,
            user_email: "",
            is_active: partner.is_active,
            mp_user_id: mp.mp_user_id,
            mp_connected_at: mp.mp_connected_at,
            mp_public_key: mp.mp_public_key,
            mp_live_mode: mp.mp_live_mode,
            mp_token_expires_at: mp.mp_token_expires_at,
            suspended_at: partner.suspended_at,
            erp_disabled: partner.erp_disabled,
            created_at: partner.created_at,
        },
    }
}

// ─── Force Cancel Subscription ⚠️ (step-up required) ────────────────────────

export async function forceCancelSubscription(
    partnerId: string,
    reason: string,
    stepUpToken: string
): Promise<{ success: boolean; error?: string }> {
    const admin = await requireAdminScope("billing_control", "admin")
    await requireRateLimit(RateLimitCategory.ADMIN_ACTION)
    await requireStepUp(admin.userId, stepUpToken)

    if (!reason || reason.trim().length < 5) {
        return { success: false, error: "O motivo deve ter pelo menos 5 caracteres" }
    }

    // partner_integrations is only readable by its own partner members, and
    // admins act on other partners: use the service-role client here.
    const supabase = getAdminClient()

    // Anti-IDOR: re-fetch
    const { data: partner, error: fetchError } = await supabase
        .from("partners")
        .select("id, user_id, partner_integrations(provider_slug, status, account_id, config)")
        .eq("id", partnerId)
        .single()

    if (fetchError || !partner) {
        return { success: false, error: "Parceiro não encontrado" }
    }

    const mpIntegration = pickMercadoPagoIntegration(partner.partner_integrations)
    const mp = mapToMpPartnerFields(mpIntegration)

    // Get store name from stores table
    const { data: hqStore } = await supabase
        .from("stores")
        .select("name")
        .eq("partner_id", partnerId)
        .order("is_headquarters", { ascending: false })
        .limit(1)
        .maybeSingle()
    const storeName = hqStore?.name || "Loja"

    if (!mp.mp_user_id) {
        return { success: false, error: "Parceiro não possui conexão com Mercado Pago" }
    }

    // SECURITY: Clear MP connection from the database.
    // We don't call the MP API to revoke since that would require decrypting,
    // and the token may already be expired. Instead we clear it locally.
    const { error: integrationError } = await supabase
        .from("partner_integrations")
        .update({
            status: "disconnected",
            account_id: null,
            access_token_encrypted: null,
            credentials: {},
            metadata: {},
            // Connection-scoped settings die with the connection; accepted
            // payment methods are preferences and stay.
            config: { ...(mpIntegration?.config || {}), public_key: null, live_mode: null },
            connected_at: null,
            disconnected_at: new Date().toISOString(),
        })
        .eq("partner_id", partnerId)
        .eq("provider_slug", MERCADOPAGO_PROVIDER)

    if (integrationError) {
        return { success: false, error: integrationError.message }
    }

    await adminAuditLog({
        adminUserId: admin.userId,
        actionType: AdminActionType.SUBSCRIPTION_CANCEL,
        targetType: "subscription",
        targetId: partnerId,
        metadata: {
            reason: reason.trim(),
            storeName,
            previousMpUserId: mp.mp_user_id,
        },
    })

    return { success: true }
}
