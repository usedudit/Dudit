export type BlogPostStatus = "draft" | "published" | "archived"

export interface BlogFaqItem {
    question: string
    answer: string
}

export interface BlogPost {
    id: string
    slug: string
    title: string
    subtitle: string | null
    excerpt: string | null
    content: string
    cover_image_url: string | null
    cover_image_alt: string | null
    category: string
    tags: string[]
    author_name: string
    author_role: string
    status: BlogPostStatus
    is_featured: boolean
    seo_title: string | null
    seo_description: string | null
    seo_keywords: string[]
    key_takeaways: string[]
    faq: BlogFaqItem[]
    reading_time_minutes: number
    views_count: number
    published_at: string | null
    created_at: string
    updated_at: string
}

export interface BlogPostSummary {
    id: string
    slug: string
    title: string
    subtitle: string | null
    excerpt: string | null
    cover_image_url: string | null
    cover_image_alt: string | null
    category: string
    tags: string[]
    author_name: string
    reading_time_minutes: number
    is_featured: boolean
    published_at: string | null
    updated_at: string
}

export interface BlogPostInput {
    title: string
    slug: string
    subtitle: string
    excerpt: string
    content: string
    cover_image_url: string
    cover_image_alt: string
    category: string
    tags: string[]
    author_name: string
    author_role: string
    status: BlogPostStatus
    is_featured: boolean
    seo_title: string
    seo_description: string
    seo_keywords: string[]
    key_takeaways: string[]
    faq: BlogFaqItem[]
    published_at: string | null
}

export interface BlogPostStats {
    total: number
    published: number
    draft: number
    scheduled: number
    archived: number
}

export interface AdminBlogPostRow extends BlogPost {
    display_status: "published" | "draft" | "scheduled" | "archived"
}

export interface AdminBlogPostListRow extends BlogPostSummary {
    status: BlogPostStatus
    display_status: "published" | "draft" | "scheduled" | "archived"
}
