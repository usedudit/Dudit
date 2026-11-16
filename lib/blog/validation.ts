import { z } from "zod"
import { BLOG_CATEGORIES } from "./categories"
import type { BlogPostInput } from "./types"
import { estimateReadingTime, slugifyBlog, stripHtml } from "./utils"

const categoryIds = BLOG_CATEGORIES.map((category) => category.id) as [string, ...string[]]

const optionalUrl = z
    .string()
    .trim()
    .max(2048)
    .refine((value) => !value || /^(https?:\/\/|\/)/i.test(value), "Informe uma URL válida (https://...)")

const stringList = z.array(z.string().trim().min(1).max(120)).max(20)

export const blogPostInputSchema = z.object({
    title: z.string().trim().min(5, "O título precisa ter pelo menos 5 caracteres").max(160),
    slug: z.string().trim().max(140).optional().default(""),
    subtitle: z.string().trim().max(320).optional().default(""),
    excerpt: z.string().trim().max(500).optional().default(""),
    content: z.string().min(20, "Escreva um conteúdo com pelo menos 20 caracteres").max(200_000),
    cover_image_url: optionalUrl.optional().default(""),
    cover_image_alt: z.string().trim().max(240).optional().default(""),
    category: z.enum(categoryIds),
    tags: stringList.optional().default([]),
    author_name: z.string().trim().min(2).max(120).optional().default("Equipe Dudit"),
    author_role: z.string().trim().max(120).optional().default("Time Dudit"),
    status: z.enum(["draft", "published", "archived"]).default("draft"),
    is_featured: z.boolean().optional().default(false),
    seo_title: z.string().trim().max(70).optional().default(""),
    seo_description: z.string().trim().max(180).optional().default(""),
    seo_keywords: stringList.optional().default([]),
    key_takeaways: z.array(z.string().trim().min(1).max(300)).max(10).optional().default([]),
    faq: z
        .array(
            z.object({
                question: z.string().trim().min(3, "Pergunta muito curta").max(240),
                answer: z.string().trim().min(3, "Resposta muito curta").max(2000),
            }),
        )
        .max(12)
        .optional()
        .default([]),
    published_at: z.string().trim().nullable().optional(),
})

export type BlogPostFormValues = z.infer<typeof blogPostInputSchema>

export function normalizeBlogPostInput(input: BlogPostFormValues): {
    title: string
    slug: string
    subtitle: string | null
    excerpt: string
    content: string
    cover_image_url: string | null
    cover_image_alt: string | null
    category: string
    tags: string[]
    author_name: string
    author_role: string
    status: BlogPostFormValues["status"]
    is_featured: boolean
    seo_title: string | null
    seo_description: string | null
    seo_keywords: string[]
    key_takeaways: string[]
    faq: { question: string; answer: string }[]
    reading_time_minutes: number
    published_at: string | null
} {
    const title = input.title.trim()
    const slug = slugifyBlog(input.slug || title)
    const content = input.content.trim()
    const subtitle = input.subtitle?.trim() || null
    const excerpt = input.excerpt?.trim() || stripHtml(content).slice(0, 180)
    const tags = Array.from(new Set((input.tags || []).map((tag) => tag.trim()).filter(Boolean))).slice(0, 20)
    const seoKeywords = Array.from(
        new Set([...(input.seo_keywords || []), ...tags].map((keyword) => keyword.trim()).filter(Boolean)),
    ).slice(0, 20)

    let publishedAt = input.published_at || null
    if (input.status === "published" && !publishedAt) {
        publishedAt = new Date().toISOString()
    }
    if (input.status === "draft") {
        publishedAt = null
    }

    return {
        title,
        slug,
        subtitle,
        excerpt: excerpt || stripHtml(content).slice(0, 180),
        content,
        cover_image_url: input.cover_image_url?.trim() || null,
        cover_image_alt: input.cover_image_alt?.trim() || title,
        category: input.category,
        tags,
        author_name: input.author_name?.trim() || "Equipe Dudit",
        author_role: input.author_role?.trim() || "Time Dudit",
        status: input.status,
        is_featured: Boolean(input.is_featured),
        seo_title: input.seo_title?.trim() || null,
        seo_description: input.seo_description?.trim() || null,
        seo_keywords: seoKeywords,
        key_takeaways: (input.key_takeaways || []).map((item) => item.trim()).filter(Boolean),
        faq: (input.faq || []).filter((item) => item.question.trim() && item.answer.trim()),
        reading_time_minutes: estimateReadingTime(content),
        published_at: publishedAt,
    }
}

export function blogPostToInput(post: {
    title: string
    slug: string
    subtitle: string | null
    excerpt: string | null
    content: string
    cover_image_url: string | null
    cover_image_alt: string | null
    category: string
    tags: string[]
    author_name: string
    author_role: string
    status: BlogPostInput["status"]
    is_featured: boolean
    seo_title: string | null
    seo_description: string | null
    seo_keywords: string[]
    key_takeaways: string[]
    faq: { question: string; answer: string }[]
    published_at: string | null
}): BlogPostInput {
    return {
        title: post.title,
        slug: post.slug,
        subtitle: post.subtitle || "",
        excerpt: post.excerpt || "",
        content: post.content,
        cover_image_url: post.cover_image_url || "",
        cover_image_alt: post.cover_image_alt || "",
        category: post.category,
        tags: post.tags || [],
        author_name: post.author_name || "Equipe Dudit",
        author_role: post.author_role || "Time Dudit",
        status: post.status,
        is_featured: Boolean(post.is_featured),
        seo_title: post.seo_title || "",
        seo_description: post.seo_description || "",
        seo_keywords: post.seo_keywords || [],
        key_takeaways: post.key_takeaways || [],
        faq: post.faq || [],
        published_at: post.published_at,
    }
}
