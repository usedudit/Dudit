import type { AdminBlogPostRow, BlogPost, BlogPostStatus } from "./types"

export function slugifyBlog(text: string): string {
    return text
        .toString()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/(^-|-$)/g, "")
        .slice(0, 120)
}

export function stripHtml(html: string | null | undefined): string {
    if (!html) return ""
    return html
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/\s+/g, " ")
        .trim()
}

export function countWords(html: string | null | undefined): number {
    const text = stripHtml(html)
    if (!text) return 0
    return text.split(/\s+/).filter(Boolean).length
}

export function estimateReadingTime(html: string | null | undefined): number {
    const words = countWords(html)
    // 200 words per minute is a comfortable reading pace for Portuguese content.
    return Math.max(1, Math.ceil(words / 200))
}

export function buildExcerpt(html: string | null | undefined, maxLength = 180): string {
    const text = stripHtml(html)
    if (text.length <= maxLength) return text
    return `${text.slice(0, maxLength).replace(/\s+\S*$/, "").trim()}...`
}

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
})

const shortDateFormatter = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
})

export function formatBlogDate(value: string | null | undefined): string {
    if (!value) return "Não publicado"
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return "Não publicado"
    return dateFormatter.format(date)
}

export function formatBlogDateShort(value: string | null | undefined): string {
    if (!value) return "Não publicado"
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return "Não publicado"
    return shortDateFormatter.format(date)
}

export function getBlogPostUrl(slug: string): string {
    return `/blog/${slug}`
}

export function getBlogCategoryUrl(categoryId: string): string {
    return `/blog/categoria/${categoryId}`
}

export function getPostDisplayStatus(post: Pick<BlogPost, "status" | "published_at">): AdminBlogPostRow["display_status"] {
    if (post.status === "archived") return "archived"
    if (post.status === "draft") return "draft"
    if (post.published_at && new Date(post.published_at).getTime() > Date.now()) return "scheduled"
    return "published"
}

export function getStatusLabel(status: AdminBlogPostRow["display_status"]): string {
    switch (status) {
        case "published":
            return "Publicado"
        case "scheduled":
            return "Agendado"
        case "draft":
            return "Rascunho"
        case "archived":
            return "Arquivado"
    }
}

export function statusBadgeVariant(status: AdminBlogPostRow["display_status"]): "green" | "orange" | "gray" | "red" {
    switch (status) {
        case "published":
            return "green"
        case "scheduled":
            return "orange"
        case "draft":
            return "gray"
        case "archived":
            return "red"
    }
}

export function isBlogStatus(value: unknown): value is BlogPostStatus {
    return value === "draft" || value === "published" || value === "archived"
}
