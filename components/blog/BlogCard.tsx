import Link from "next/link"
import { ClockIcon, ImageIcon, ShieldIcon } from "@/lib/icons"
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

    const aspectRatio = featured ? "aspect-[16/9]" : "aspect-[16/10]"

    return (
        <article
            className={`flex h-full flex-col overflow-hidden rounded-2xl border border-brand-border bg-white dark:border-dark-border dark:bg-dark-surface ${className}`}
        >
            <Link href={getBlogPostUrl(post.slug)} prefetch={false} className="flex h-full flex-col">
                <div className={`relative overflow-hidden ${aspectRatio}`}>
                    {post.cover_image_url ? (
                        <img
                            src={post.cover_image_url}
                            alt={post.cover_image_alt || post.title}
                            className="h-full w-full object-cover transition-transform duration-300 hover:scale-[1.02]"
                            loading={featured ? "eager" : "lazy"}
                            decoding="async"
                        />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center bg-brand-gray/50 dark:bg-dark-border/30">
                            <img
                                src="https://img.dudit.com.br/static/mascots/Artigos.png"
                                alt="Artigos"
                                className="w-24 h-24 opacity-60"
                                loading="lazy"
                                decoding="async"
                            />
                        </div>
                    )}

                    {!featured && (
                        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
                            <Badge variant={accent.badge} icon={null} className="text-[10px] px-2 py-0.5">
                                {category.shortLabel}
                            </Badge>
                            {post.is_featured && (
                                <Badge variant="green" icon={<ShieldIcon size={10} />} className="text-[10px] px-2 py-0.5">
                                    Destaque
                                </Badge>
                            )}
                        </div>
                    )}
                </div>

                <div className={`flex flex-1 flex-col p-5 ${featured ? "lg:p-6" : ""}`}>
                    <h2 className={`font-bold tracking-tight text-brand-dark dark:text-dark-heading transition-colors duration-200 hover:text-brand-green ${featured ? "text-xl" : "text-lg"}`}>
                        {post.title}
                    </h2>

                    {post.excerpt && (
                        <p className={`mt-3 flex-1 text-brand-inactive-text dark:text-dark-body ${featured ? "text-base leading-relaxed" : "text-sm leading-relaxed"} line-clamp-3`}>
                            {post.excerpt}
                        </p>
                    )}

                    <div className="mt-5 flex items-center justify-between gap-3 border-t border-brand-border pt-4 text-xs font-medium text-brand-inactive-text dark:border-dark-border dark:text-dark-body">
                        <span>{formatBlogDateShort(post.published_at)}</span>
                        <span className="flex items-center gap-1.5">
                            <ClockIcon size={13} />
                            {post.reading_time_minutes} min de leitura
                        </span>
                    </div>
                </div>
            </Link>
        </article>
    )
}
