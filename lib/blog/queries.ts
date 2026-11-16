import "server-only"

import { cache } from "react"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { createSupabasePerformanceFetch } from "@/lib/supabase/performance-fetch"
import type { BlogPost, BlogPostSummary } from "./types"

const SUMMARY_COLUMNS = `
    id, slug, title, subtitle, excerpt, cover_image_url, cover_image_alt,
    category, tags, author_name, reading_time_minutes, is_featured,
    published_at, updated_at
`

const FULL_COLUMNS = `
    id, slug, title, subtitle, excerpt, content, cover_image_url, cover_image_alt,
    category, tags, author_name, author_role, status, is_featured,
    seo_title, seo_description, seo_keywords, key_takeaways, faq,
    reading_time_minutes, views_count, published_at, created_at, updated_at
`

let _publicClient: SupabaseClient | null | undefined

/**
 * Public, session-less Supabase client.
 *
 * Blog pages are public and cacheable, so they must not read request cookies.
 * Using a dedicated anon client keeps them out of dynamic rendering and avoids
 * spreading a user's session into cached output.
 */
function getPublicBlogClient(): SupabaseClient | null {
    if (_publicClient !== undefined) return _publicClient

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !anonKey) {
        _publicClient = null
        return _publicClient
    }

    _publicClient = createClient(url, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { fetch: createSupabasePerformanceFetch("blog-public") },
    })

    return _publicClient
}

function normalizeSummary(row: any): BlogPostSummary {
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
        published_at: row.published_at ?? null,
        updated_at: row.updated_at,
    }
}

function normalizePost(row: any): BlogPost {
    return {
        ...normalizeSummary(row),
        content: row.content || "",
        author_role: row.author_role || "Time Dudit",
        status: row.status || "draft",
        seo_title: row.seo_title ?? null,
        seo_description: row.seo_description ?? null,
        seo_keywords: row.seo_keywords || [],
        key_takeaways: row.key_takeaways || [],
        faq: Array.isArray(row.faq) ? row.faq : [],
        views_count: Number(row.views_count || 0),
        created_at: row.created_at,
    }
}

export const getPublishedBlogPosts = cache(async (): Promise<BlogPostSummary[]> => {
    const client = getPublicBlogClient()
    if (!client) return []

    const { data, error } = await client
        .from("blog_posts")
        .select(SUMMARY_COLUMNS)
        .eq("status", "published")
        .lte("published_at", new Date().toISOString())
        .order("is_featured", { ascending: false })
        .order("published_at", { ascending: false })
        .limit(120)

    if (error) {
        console.error("[BLOG] Failed to load published posts:", error.message)
        return []
    }

    return (data || []).map(normalizeSummary)
})

export const getPublishedBlogPostsByCategory = cache(async (category: string): Promise<BlogPostSummary[]> => {
    const posts = await getPublishedBlogPosts()
    return posts.filter((post) => post.category === category)
})

export const getPublishedBlogPostBySlug = cache(async (slug: string): Promise<BlogPost | null> => {
    const client = getPublicBlogClient()
    if (!client) return null

    const { data, error } = await client
        .from("blog_posts")
        .select(FULL_COLUMNS)
        .eq("slug", slug)
        .eq("status", "published")
        .lte("published_at", new Date().toISOString())
        .maybeSingle()

    if (error) {
        console.error("[BLOG] Failed to load post by slug:", error.message)
        return null
    }

    return data ? normalizePost(data) : null
})

export const getRelatedBlogPosts = cache(async (category: string, excludeId: string, limit = 3): Promise<BlogPostSummary[]> => {
    const posts = await getPublishedBlogPosts()
    const sameCategory = posts.filter((post) => post.category === category && post.id !== excludeId)
    const others = posts.filter((post) => post.category !== category && post.id !== excludeId)
    return [...sameCategory, ...others].slice(0, limit)
})

export const getPublishedBlogSlugs = cache(async (): Promise<{ slug: string; updated_at: string; category: string }[]> => {
    const client = getPublicBlogClient()
    if (!client) return []

    const { data, error } = await client
        .from("blog_posts")
        .select("slug, updated_at, category")
        .eq("status", "published")
        .lte("published_at", new Date().toISOString())
        .order("published_at", { ascending: false })
        .limit(2000)

    if (error) {
        console.error("[BLOG] Failed to load slugs:", error.message)
        return []
    }

    return data || []
})
