"use server"

import { /* revalidateTag (use safeRevalidateTag helper) */ } from "next/cache"
import { TAGS } from "@/lib/utils/revalidation-tags"
import { safeRevalidateTag } from "@/lib/utils/revalidation"
import { requireAdmin } from "@/lib/auth/admin-authorization"
import { getAdminClient } from "@/lib/supabase/admin"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { adminAuditLog } from "@/lib/admin/audit"
import { AdminActionType } from "@/lib/admin/types"
import {
    advertisementFormSchema,
    normalizeAdvertisementInput,
    type AdvertisementFormValues,
} from "@/lib/ads/validation"
import type { AdStatus, Advertisement } from "@/lib/ads/types"
import { formatCtr } from "@/lib/ads/types"
import { sanitizeUUID } from "@/lib/security/input-sanitizer"

const LIST_COLUMNS = `
    id, title, description, image_url, destination_url,
    advertiser_name, advertiser_logo,
    target_mode, center_lat, center_lng, radius_km,
    cities, state, country, priority, status,
    starts_at, ends_at, impressions_count, clicks_count,
    created_at, updated_at
`

export interface AdminAdvertisementRow extends Advertisement {
    ctr: string
}

function mapAdminRow(row: Advertisement): AdminAdvertisementRow {
    return {
        ...row,
        cities: row.cities || [],
        ctr: formatCtr(row.clicks_count, row.impressions_count),
    }
}

function revalidateAdsCache() {
    // Use project helper to always pass the required profile argument
    safeRevalidateTag(TAGS.advertisements)
}

export async function getAdminAdvertisements(): Promise<AdminAdvertisementRow[]> {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requireAdmin()

    const supabase = getAdminClient()
    const { data, error } = await supabase
        .from("advertisements")
        .select(LIST_COLUMNS)
        .order("created_at", { ascending: false })
        .limit(200)

    if (error) throw new Error(error.message)
    return (data || []).map((row: Advertisement) => mapAdminRow(row))
}

export async function getAdminAdvertisement(id: string): Promise<AdminAdvertisementRow | null> {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requireAdmin()

    const safeId = sanitizeUUID(id)
    if (!safeId) return null

    const supabase = getAdminClient()
    const { data, error } = await supabase
        .from("advertisements")
        .select(LIST_COLUMNS)
        .eq("id", safeId)
        .maybeSingle()

    if (error) throw new Error(error.message)
    if (!data) return null
    return mapAdminRow(data as Advertisement)
}

export async function createAdvertisement(input: AdvertisementFormValues) {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    const admin = await requireAdmin()

    const parsed = advertisementFormSchema.safeParse(input)
    if (!parsed.success) {
        return { success: false as const, error: parsed.error.issues[0]?.message || "Dados inválidos" }
    }

    const normalized = normalizeAdvertisementInput(parsed.data)
    const supabase = getAdminClient()

    const { data, error } = await supabase
        .from("advertisements")
        .insert({
            title: normalized.title,
            description: normalized.description,
            image_url: normalized.image_url,
            destination_url: normalized.destination_url,
            advertiser_name: normalized.advertiser_name,
            advertiser_logo: normalized.advertiser_logo,
            target_mode: normalized.target_mode,
            center_lat: normalized.target_mode === "radius" ? normalized.center_lat : null,
            center_lng: normalized.target_mode === "radius" ? normalized.center_lng : null,
            radius_km: normalized.target_mode === "radius" ? normalized.radius_km : null,
            cities: normalized.target_mode === "cities" ? normalized.cities : [],
            state: normalized.target_mode === "state" ? normalized.state : null,
            country: normalized.target_mode === "country" ? normalized.country : normalized.country,
            priority: normalized.priority,
            status: normalized.status,
            starts_at: normalized.starts_at,
            ends_at: normalized.ends_at,
        })
        .select("id")
        .single()

    if (error) return { success: false as const, error: error.message }

    await adminAuditLog({
        adminUserId: admin.userId,
        actionType: AdminActionType.AD_CREATE,
        targetType: "advertisement" as const,
        targetId: data.id,
        metadata: { title: normalized.title, target_mode: normalized.target_mode },
    })

    revalidateAdsCache()
    return { success: true as const, id: data.id }
}

export async function updateAdvertisement(id: string, input: AdvertisementFormValues) {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    const admin = await requireAdmin()

    const safeId = sanitizeUUID(id)
    if (!safeId) return { success: false as const, error: "ID inválido" }

    const parsed = advertisementFormSchema.safeParse(input)
    if (!parsed.success) {
        return { success: false as const, error: parsed.error.issues[0]?.message || "Dados inválidos" }
    }

    const normalized = normalizeAdvertisementInput(parsed.data)
    const supabase = getAdminClient()

    const { error } = await supabase
        .from("advertisements")
        .update({
            title: normalized.title,
            description: normalized.description,
            image_url: normalized.image_url,
            destination_url: normalized.destination_url,
            advertiser_name: normalized.advertiser_name,
            advertiser_logo: normalized.advertiser_logo,
            target_mode: normalized.target_mode,
            center_lat: normalized.target_mode === "radius" ? normalized.center_lat : null,
            center_lng: normalized.target_mode === "radius" ? normalized.center_lng : null,
            radius_km: normalized.target_mode === "radius" ? normalized.radius_km : null,
            cities: normalized.target_mode === "cities" ? normalized.cities : [],
            state: normalized.target_mode === "state" ? normalized.state : null,
            country: normalized.target_mode === "country" ? normalized.country : normalized.country,
            priority: normalized.priority,
            status: normalized.status,
            starts_at: normalized.starts_at,
            ends_at: normalized.ends_at,
            updated_at: new Date().toISOString(),
        })
        .eq("id", safeId)

    if (error) return { success: false as const, error: error.message }

    await adminAuditLog({
        adminUserId: admin.userId,
        actionType: AdminActionType.AD_UPDATE,
        targetType: "advertisement" as const,
        targetId: safeId,
        metadata: { title: normalized.title, status: normalized.status },
    })

    revalidateAdsCache()
    return { success: true as const }
}

export async function updateAdvertisementStatus(id: string, status: AdStatus) {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    const admin = await requireAdmin()

    const safeId = sanitizeUUID(id)
    if (!safeId) return { success: false as const, error: "ID inválido" }

    const allowed: AdStatus[] = ["draft", "active", "paused", "expired"]
    if (!allowed.includes(status)) {
        return { success: false as const, error: "Status inválido" }
    }

    const supabase = getAdminClient()
    const { error } = await supabase
        .from("advertisements")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", safeId)

    if (error) return { success: false as const, error: error.message }

    await adminAuditLog({
        adminUserId: admin.userId,
        actionType: AdminActionType.AD_STATUS_CHANGE,
        targetType: "advertisement" as const,
        targetId: safeId,
        metadata: { status },
    })

    revalidateAdsCache()
    return { success: true as const }
}

export async function deleteAdvertisement(id: string) {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    const admin = await requireAdmin()

    const safeId = sanitizeUUID(id)
    if (!safeId) return { success: false as const, error: "ID inválido" }

    const supabase = getAdminClient()
    const { error } = await supabase.from("advertisements").delete().eq("id", safeId)

    if (error) return { success: false as const, error: error.message }

    await adminAuditLog({
        adminUserId: admin.userId,
        actionType: AdminActionType.AD_DELETE,
        targetType: "advertisement" as const,
        targetId: safeId,
    })

    revalidateAdsCache()
    return { success: true as const }
}
