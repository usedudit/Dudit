"use server"

import { revalidatePath, revalidateTag } from "next/cache"
import { requireAdmin } from "@/lib/auth/admin-authorization"
import { getAdminClient } from "@/lib/supabase/admin"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { adminAuditLog } from "@/lib/admin/audit"
import { AdminActionType } from "@/lib/admin/types"
import { sanitizeInput } from "@/lib/input-validator"
import { sanitizeRichText } from "@/lib/security/rich-text-sanitizer"
import { sanitizeUUID } from "@/lib/security/input-sanitizer"
import { blogPostInputSchema, normalizeBlogPostInput } from "@/lib/blog/validation"
import type {
    AdminBlogPostListRow,
    AdminBlogPostRow,
    BlogPost,
    BlogPostStats,
    BlogPostStatus,
} from "@/lib/blog/types"
import { getPostDisplayStatus } from "@/lib/blog/utils"
import { TAGS } from "@/lib/utils/revalidation-tags"

const LIST_COLUMNS = `
    id, slug, title, subtitle, excerpt, cover_image_url, cover_image_alt,
    category, tags, author_name, reading_time_minutes, is_featured,
    status, published_at, updated_at
`

const FULL_COLUMNS = `
    id, slug, title, subtitle, excerpt, content, cover_image_url, cover_image_alt,
    category, tags, author_name, author_role, status, is_featured,
    seo_title, seo_description, seo_keywords, key_takeaways, faq,
    reading_time_minutes, views_count, published_at, created_at, updated_at
`

function normalizeAdminRow(row: any): AdminBlogPostListRow {
    return {
        id: row.id,
        slug: row.slug,
        title: row.title,
        subtitle: row.subtitle ?? null,
        excerpt: row.excerpt ?? null,
        cover_image_url: row.cover_image_url ?? null,
        cover_image_alt: row.cover_image_alt ?? null,
        category: row.category || "geral",
        tags: row.tags || [],
        author_name: row.author_name || "Equipe Dudit",
        reading_time_minutes: row.reading_time_minutes || 1,
        is_featured: Boolean(row.is_featured),
        status: row.status || "draft",
        published_at: row.published_at ?? null,
        updated_at: row.updated_at,
        display_status: getPostDisplayStatus({ status: row.status || "draft", published_at: row.published_at ?? null }),
    }
}

function normalizeFullRow(row: any): AdminBlogPostRow {
    return {
        ...normalizeAdminRow(row),
        content: row.content || "",
        author_role: row.author_role || "Time Dudit",
        seo_title: row.seo_title ?? null,
        seo_description: row.seo_description ?? null,
        seo_keywords: row.seo_keywords || [],
        key_takeaways: row.key_takeaways || [],
        faq: Array.isArray(row.faq) ? row.faq : [],
        views_count: Number(row.views_count || 0),
        created_at: row.created_at,
    }
}

async function ensureUniqueSlug(baseSlug: string, ignoreId?: string): Promise<string> {
    const supabase = getAdminClient()
    const root = baseSlug || `post-${Date.now()}`
    let candidate = root
    let suffix = 2

    for (let attempt = 0; attempt < 30; attempt += 1) {
        let query = supabase.from("blog_posts").select("id").eq("slug", candidate).limit(1)
        if (ignoreId) query = query.neq("id", ignoreId)
        const { data, error } = await query
        if (error) throw new Error(error.message)
        if (!data || data.length === 0) return candidate
        candidate = `${root}-${suffix}`
        suffix += 1
    }

    return `${root}-${Date.now().toString(36)}`
}

async function revalidateBlogPaths(slug: string, category: string, previousSlug?: string, previousCategory?: string) {
    // Drop the cross-request data cache used by the public blog queries.
    try {
        revalidateTag(TAGS.blogPosts, "max")
    } catch {
        // Ignore if called during a render pass; the path revalidation below still applies.
    }

    revalidatePath("/blog")
    revalidatePath(`/blog/${slug}`)
    revalidatePath(`/blog/categoria/${category}`)
    revalidatePath("/blog/feed.xml")
    revalidatePath("/sitemap.xml")
    revalidatePath("/ddt-admin/blog")

    if (previousCategory && previousCategory !== category) {
        revalidatePath(`/blog/categoria/${previousCategory}`)
    }

    if (previousSlug && previousSlug !== slug) {
        revalidatePath(`/blog/${previousSlug}`)
    }
}

export async function getAdminBlogPosts(): Promise<AdminBlogPostListRow[]> {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requireAdmin("admin")

    const supabase = getAdminClient()
    const { data, error } = await supabase
        .from("blog_posts")
        .select(LIST_COLUMNS)
        .order("updated_at", { ascending: false })
        .limit(300)

    if (error) throw new Error(error.message)
    return (data || []).map(normalizeAdminRow)
}

export async function getAdminBlogStats(): Promise<BlogPostStats> {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requireAdmin("admin")

    const supabase = getAdminClient()
    const { data, error } = await supabase
        .from("blog_posts")
        .select("status, published_at")

    if (error) throw new Error(error.message)

    const rows = (data || []) as { status: BlogPostStatus; published_at: string | null }[]
    const now = Date.now()

    return {
        total: rows.length,
        published: rows.filter((row) => row.status === "published" && !!row.published_at && new Date(row.published_at).getTime() <= now).length,
        draft: rows.filter((row) => row.status === "draft").length,
        scheduled: rows.filter((row) => row.status === "published" && !!row.published_at && new Date(row.published_at).getTime() > now).length,
        archived: rows.filter((row) => row.status === "archived").length,
    }
}

export async function getAdminBlogPost(id: string): Promise<AdminBlogPostRow | null> {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requireAdmin("admin")

    const safeId = sanitizeUUID(id)
    if (!safeId) return null

    const supabase = getAdminClient()
    const { data, error } = await supabase
        .from("blog_posts")
        .select(FULL_COLUMNS)
        .eq("id", safeId)
        .maybeSingle()

    if (error) throw new Error(error.message)
    return data ? normalizeFullRow(data) : null
}

export async function createAdminBlogPost(input: unknown): Promise<{ success: true; id: string; slug: string } | { success: false; error: string }> {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    const admin = await requireAdmin("admin")

    const parsed = blogPostInputSchema.safeParse(input)
    if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0]?.message || "Dados inválidos" }
    }

    const normalized = normalizeBlogPostInput(parsed.data)
    const supabase = getAdminClient()
    const slug = await ensureUniqueSlug(normalized.slug)

    const { data, error } = await supabase
        .from("blog_posts")
        .insert({
            ...normalized,
            slug,
            title: sanitizeInput(normalized.title),
            subtitle: normalized.subtitle ? sanitizeInput(normalized.subtitle) : null,
            excerpt: normalized.excerpt ? sanitizeInput(normalized.excerpt) : null,
            content: sanitizeRichText(normalized.content),
            seo_title: normalized.seo_title ? sanitizeInput(normalized.seo_title) : null,
            seo_description: normalized.seo_description ? sanitizeInput(normalized.seo_description) : null,
        })
        .select("id, slug")
        .single()

    if (error) return { success: false, error: error.message }

    await adminAuditLog({
        adminUserId: admin.userId,
        actionType: AdminActionType.BLOG_POST_CREATE,
        targetType: "blog_post",
        targetId: data.id,
        metadata: { title: normalized.title, status: normalized.status, slug },
    })

    await revalidateBlogPaths(data.slug, normalized.category)
    return { success: true, id: data.id, slug: data.slug }
}

export async function updateAdminBlogPost(
    id: string,
    input: unknown,
): Promise<{ success: true; slug: string } | { success: false; error: string }> {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    const admin = await requireAdmin("admin")

    const safeId = sanitizeUUID(id)
    if (!safeId) return { success: false, error: "ID inválido" }

    const parsed = blogPostInputSchema.safeParse(input)
    if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0]?.message || "Dados inválidos" }
    }

    const normalized = normalizeBlogPostInput(parsed.data)
    const supabase = getAdminClient()

    const { data: current, error: fetchError } = await supabase
        .from("blog_posts")
        .select("slug, category")
        .eq("id", safeId)
        .maybeSingle()

    if (fetchError) return { success: false, error: fetchError.message }
    if (!current) return { success: false, error: "Post não encontrado" }

    const slug = await ensureUniqueSlug(normalized.slug, safeId)

    const { error } = await supabase
        .from("blog_posts")
        .update({
            ...normalized,
            slug,
            title: sanitizeInput(normalized.title),
            subtitle: normalized.subtitle ? sanitizeInput(normalized.subtitle) : null,
            excerpt: normalized.excerpt ? sanitizeInput(normalized.excerpt) : null,
            content: sanitizeRichText(normalized.content),
            seo_title: normalized.seo_title ? sanitizeInput(normalized.seo_title) : null,
            seo_description: normalized.seo_description ? sanitizeInput(normalized.seo_description) : null,
            updated_at: new Date().toISOString(),
        })
        .eq("id", safeId)

    if (error) return { success: false, error: error.message }

    await adminAuditLog({
        adminUserId: admin.userId,
        actionType: AdminActionType.BLOG_POST_UPDATE,
        targetType: "blog_post",
        targetId: safeId,
        metadata: { title: normalized.title, status: normalized.status, slug },
    })

    await revalidateBlogPaths(slug, normalized.category, current.slug, current.category)
    return { success: true, slug }
}

export async function updateAdminBlogPostStatus(
    id: string,
    status: BlogPostStatus,
): Promise<{ success: true } | { success: false; error: string }> {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    const admin = await requireAdmin("admin")

    const safeId = sanitizeUUID(id)
    if (!safeId) return { success: false, error: "ID inválido" }
    if (status !== "draft" && status !== "published" && status !== "archived") {
        return { success: false, error: "Status inválido" }
    }

    const supabase = getAdminClient()
    const { data: current, error: fetchError } = await supabase
        .from("blog_posts")
        .select("slug, category, status, published_at")
        .eq("id", safeId)
        .maybeSingle()

    if (fetchError) return { success: false, error: fetchError.message }
    if (!current) return { success: false, error: "Post não encontrado" }

    const payload: Record<string, unknown> = {
        status,
        updated_at: new Date().toISOString(),
    }

    if (status === "published" && !current.published_at) {
        payload.published_at = new Date().toISOString()
    }
    if (status === "draft") {
        payload.published_at = null
    }

    const { error } = await supabase.from("blog_posts").update(payload).eq("id", safeId)
    if (error) return { success: false, error: error.message }

    await adminAuditLog({
        adminUserId: admin.userId,
        actionType: AdminActionType.BLOG_POST_STATUS_CHANGE,
        targetType: "blog_post",
        targetId: safeId,
        metadata: { previousStatus: current.status, status, slug: current.slug },
    })

    await revalidateBlogPaths(current.slug, current.category)
    return { success: true }
}

export async function deleteAdminBlogPost(id: string): Promise<{ success: true } | { success: false; error: string }> {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    const admin = await requireAdmin("admin")

    const safeId = sanitizeUUID(id)
    if (!safeId) return { success: false, error: "ID inválido" }

    const supabase = getAdminClient()
    const { data: current, error: fetchError } = await supabase
        .from("blog_posts")
        .select("slug, category, title")
        .eq("id", safeId)
        .maybeSingle()

    if (fetchError) return { success: false, error: fetchError.message }
    if (!current) return { success: false, error: "Post não encontrado" }

    const { error } = await supabase.from("blog_posts").delete().eq("id", safeId)
    if (error) return { success: false, error: error.message }

    await adminAuditLog({
        adminUserId: admin.userId,
        actionType: AdminActionType.BLOG_POST_DELETE,
        targetType: "blog_post",
        targetId: safeId,
        metadata: { title: current.title, slug: current.slug },
    })

    await revalidateBlogPaths(current.slug, current.category)
    return { success: true }
}
