"use server"

/**
 * Admin subscription/financial server actions.
 *
 * SECURITY: Mercado Pago API calls use encrypted tokens decrypted server-side only.
 * forceCancelSubscription requires step-up re-auth.
 */

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requireAdmin } from "@/lib/auth/admin-authorization"
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
    await requireAdmin("admin")
    await requireRateLimit(RateLimitCategory.ADMIN_READ)

    const supabase = await getSupabaseServerClient()

    const [totalRes, connectedRes, disconnectedRes, suspendedRes] = await Promise.all([
        supabase.from("partners").select("id", { count: "exact", head: true }),
        supabase.from("partners").select("id", { count: "exact", head: true }).not("mp_user_id", "is", null),
        supabase.from("partners").select("id", { count: "exact", head: true }).is("mp_user_id", null),
        supabase.from("partners").select("id", { count: "exact", head: true }).not("suspended_at", "is", null),
    ])

    return {
        total: totalRes.count || 0,
        connected: connectedRes.count || 0,
        disconnected: disconnectedRes.count || 0,
        suspended: suspendedRes.count || 0,
    }
}

// ─── Get Subscriptions ──────────────────────────────────────────────────────

export async function getSubscriptions(
    cursor?: string | null,
    limit: number = 20,
    statusFilter?: string
): Promise<CursorPaginatedResult<SubscriptionEntry>> {
    const admin = await requireAdmin("admin")
    await requireRateLimit(RateLimitCategory.ADMIN_READ)

    const supabase = await getSupabaseServerClient()
    const pageSize = Math.min(limit, 50)

    let query = supabase
        .from("partners")
        .select(
            "id, user_id, is_active, mp_user_id, mp_connected_at, mp_public_key, mp_token_expires_at, suspended_at, erp_disabled, created_at, stores(name)"
        )

    // Filter by connection status
    if (statusFilter === "connected") {
        query = query.not("mp_user_id", "is", null)
    } else if (statusFilter === "disconnected") {
        query = query.is("mp_user_id", null)
    } else if (statusFilter === "suspended") {
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
    const items = (partners || []).slice(0, pageSize)

    const mapped: SubscriptionEntry[] = items.map((p: any) => ({
        partner_id: p.id,
        store_name: p.stores?.[0]?.name || "Loja",
        user_id: p.user_id,
        user_email: "",
        is_active: p.is_active,
        mp_user_id: p.mp_user_id,
        mp_connected_at: p.mp_connected_at,
        mp_public_key: p.mp_public_key,
        mp_live_mode: p.mp_live_mode,
        mp_token_expires_at: p.mp_token_expires_at,
        suspended_at: p.suspended_at,
        erp_disabled: p.erp_disabled,
        created_at: p.created_at,
    }))

    return {
        data: mapped,
        nextCursor: hasMore && items.length > 0 ? items[items.length - 1].created_at : null,
        prevCursor: cursor || null,
        hasMore,
    }
}

// ─── Get Subscription Detail ────────────────────────────────────────────────

export async function getSubscriptionDetail(
    partnerId: string
): Promise<{ success: boolean; data?: SubscriptionEntry; error?: string }> {
    const admin = await requireAdmin("admin")
    await requireRateLimit(RateLimitCategory.ADMIN_READ)

    const supabase = await getSupabaseServerClient()

    // Anti-IDOR: re-fetch
    const { data: partner, error: fetchError } = await supabase
        .from("partners")
        .select(
            "id, user_id, is_active, mp_user_id, mp_connected_at, mp_public_key, mp_live_mode, mp_token_expires_at, suspended_at, erp_disabled, created_at, stores(name)"
        )
        .eq("id", partnerId)
        .single()

    if (fetchError || !partner) {
        return { success: false, error: "Parceiro não encontrado" }
    }

    return {
        success: true,
        data: {
            partner_id: partner.id,
            store_name: partner.stores?.[0]?.name || "Loja",
            user_id: partner.user_id,
            user_email: "",
            is_active: partner.is_active,
            mp_user_id: partner.mp_user_id,
            mp_connected_at: partner.mp_connected_at,
            mp_public_key: partner.mp_public_key,
            mp_live_mode: partner.mp_live_mode,
            mp_token_expires_at: partner.mp_token_expires_at,
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
    const admin = await requireAdmin("admin")
    await requireRateLimit(RateLimitCategory.ADMIN_ACTION)
    await requireStepUp(admin.userId, stepUpToken)

    if (!reason || reason.trim().length < 5) {
        return { success: false, error: "O motivo deve ter pelo menos 5 caracteres" }
    }

    const supabase = await getSupabaseServerClient()

    // Anti-IDOR: re-fetch
    const { data: partner, error: fetchError } = await supabase
        .from("partners")
        .select("id, user_id, mp_user_id, mp_access_token_encrypted")
        .eq("id", partnerId)
        .single()

    if (fetchError || !partner) {
        return { success: false, error: "Parceiro não encontrado" }
    }

    // Get store name from stores table
    const { data: hqStore } = await supabase
        .from("stores")
        .select("name")
        .eq("partner_id", partnerId)
        .order("is_headquarters", { ascending: false })
        .limit(1)
        .maybeSingle()
    const storeName = hqStore?.name || "Loja"

    if (!partner.mp_user_id) {
        return { success: false, error: "Parceiro não possui conexão com Mercado Pago" }
    }

    // SECURITY: Clear MP tokens from the database.
    // We don't call the MP API to revoke since that would require decrypting,
    // and the token may already be expired. Instead we clear it locally.
    const { error: updateError } = await supabase
        .from("partners")
        .update({
            mp_user_id: null,
            mp_access_token_encrypted: null,
            mp_refresh_token_encrypted: null,
            mp_public_key: null,
            mp_token_expires_at: null,
            mp_connected_at: null,
        })
        .eq("id", partnerId)

    if (updateError) {
        return { success: false, error: updateError.message }
    }

    await adminAuditLog({
        adminUserId: admin.userId,
        actionType: AdminActionType.SUBSCRIPTION_CANCEL,
        targetType: "subscription",
        targetId: partnerId,
        metadata: {
            reason: reason.trim(),
            storeName,
            previousMpUserId: partner.mp_user_id,
        },
    })

    return { success: true }
}
