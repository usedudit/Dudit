import Link from "next/link"
import { ClockIcon, ArrowRightIcon } from "@/lib/icons"
import { Badge } from "@/components/reusable"
import { getBlogCategory } from "@/lib/blog/categories"
import { formatBlogDateShort, getBlogPostUrl } from "@/lib/blog/utils"
import type { BlogPostSummary } from "@/lib/blog/types"
import { BLOG_ACCENT_CLASSES } from "./category-styles"

interface BlogCardProps {
    post: BlogPostSummary
    featured?: boolean
    className?: string
}

export default function BlogCard({ post, featured = false, className = "" }: BlogCardProps) {
    const category = getBlogCategory(post.category)
    const accent = BLOG_ACCENT_CLASSES[category.accent]

    return (
        <article
            className={`group flex h-full flex-col overflow-hidden rounded-3xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface transition-all duration-300 hover:-translate-y-1 hover:border-brand-green/30 hover:shadow-[0_18px_50px_-24px_rgba(0,0,0,0.28)] ${className}`}
        >
            <Link href={getBlogPostUrl(post.slug)} prefetch={false} className="flex h-full flex-col">
                <div className={`relative overflow-hidden ${featured ? "aspect-[16/9] lg:aspect-[16/8]" : "aspect-[16/10]"}`}>
                    {post.cover_image_url ? (
                        <img
                            src={post.cover_image_url}
                            alt={post.cover_image_alt || post.title}
                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                            loading={featured ? "eager" : "lazy"}
                        />
                    ) : (
                        <div className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${accent.gradient} ${accent.softBg}`}>
                            <span className="text-6xl" aria-hidden="true">{category.emoji}</span>
                        </div>
                    )}

                    <div className="absolute left-4 top-4 flex flex-wrap gap-2">
                        <Badge variant={accent.badge} icon={null}>
                            {category.emoji} {category.shortLabel}
                        </Badge>
                        {post.is_featured && (
                            <Badge variant="green" icon={null}>
                                ⭐ Destaque
                            </Badge>
                        )}
                    </div>
                </div>

                <div className={`flex flex-1 flex-col p-5 ${featured ? "lg:p-8" : ""}`}>
                    <h2 className={`font-bold tracking-tight text-brand-dark dark:text-dark-heading transition-colors group-hover:text-brand-green ${featured ? "text-2xl lg:text-3xl" : "text-lg"}`}>
                        {post.title}
                    </h2>

                    {post.excerpt && (
                        <p className={`mt-3 flex-1 text-brand-inactive-text dark:text-dark-body ${featured ? "text-base leading-relaxed lg:text-lg" : "text-sm leading-relaxed"} line-clamp-3`}>
                            {post.excerpt}
                        </p>
                    )}

                    <div className="mt-5 flex items-center justify-between gap-3 border-t border-brand-border/70 pt-4 text-xs font-medium text-brand-inactive-text dark:border-dark-border dark:text-dark-body">
                        <span>{formatBlogDateShort(post.published_at)}</span>
                        <span className="flex items-center gap-1.5">
                            <ClockIcon size={13} />
                            {post.reading_time_minutes} min de leitura
                        </span>
                    </div>

                    <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-brand-green">
                        Ler dica
                        <ArrowRightIcon size={14} className="transition-transform group-hover:translate-x-1" />
                    </span>
                </div>
            </Link>
        </article>
    )
}
