"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
    CalendarIcon,
    CheckCircleIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    ClockIcon,
    CopyIcon,
    LinkedinIcon,
    TwitterIcon,
    UserIcon,
    WhatsappIcon,
} from "@/lib/icons"
import { Badge, Button } from "@/components/reusable"
import { getBlogCategory, BLOG_RELATED_LINKS } from "@/lib/blog/categories"
import type { BlogPost, BlogPostSummary } from "@/lib/blog/types"
import type { BlogTocItem } from "@/lib/blog/content"
import { formatBlogDate, getBlogCategoryUrl, getBlogPostUrl } from "@/lib/blog/utils"
import { BLOG_ACCENT_CLASSES } from "./category-styles"
import BlogCard from "./BlogCard"

interface BlogArticleProps {
    post: BlogPost
    html: string
    toc: BlogTocItem[]
    related: BlogPostSummary[]
    previous?: BlogPostSummary | null
    next?: BlogPostSummary | null
}

export default function BlogArticle({ post, html, toc, related, previous, next }: BlogArticleProps) {
    const category = getBlogCategory(post.category)
    const accent = BLOG_ACCENT_CLASSES[category.accent]
    const relatedLinks = BLOG_RELATED_LINKS[post.category] ?? BLOG_RELATED_LINKS.geral

    const [copied, setCopied] = useState(false)
    const [activeId, setActiveId] = useState<string>("")

    const shareUrl = typeof window !== "undefined" ? window.location.href : `https://dudit.com.br${getBlogPostUrl(post.slug)}`
    const shareText = useMemo(() => `${post.title} — Blog do Dino (Dudit)`, [post.title])

    useEffect(() => {
        if (toc.length === 0) return
        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries
                    .filter((entry) => entry.isIntersecting)
                    .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
                if (visible[0]?.target.id) setActiveId(visible[0].target.id)
            },
            { rootMargin: "-100px 0px -65% 0px", threshold: [0, 1] },
        )

        toc.forEach((item) => {
            const element = document.getElementById(item.id)
            if (element) observer.observe(element)
        })

        return () => observer.disconnect()
    }, [toc])

    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(shareUrl)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch {
            // Clipboard can be blocked by the browser; sharing still works.
        }
    }

    const openShare = (url: string) => {
        window.open(url, "_blank", "noopener,noreferrer,width=720,height=640")
    }

    return (
        <div className="w-full bg-white dark:bg-dark-surface">
            <article className="mx-auto w-full max-w-[1400px] px-4 pb-16 pt-8 lg:pt-12">
                <div className="mb-8 flex items-center gap-3">
                    <Button variant="filled" asChild className="h-10 w-10 shrink-0 p-0">
                        <Link href="/blog" prefetch={false} aria-label="Voltar para o blog">
                            <ChevronLeftIcon className="h-5 w-5 text-brand-inactive-text dark:text-dark-body" />
                        </Link>
                    </Button>
                    <div className="min-w-0">
                        <p className="text-xs font-medium uppercase tracking-wider text-brand-inactive-text dark:text-dark-body">
                            Blog do Dino
                        </p>
                        <Link
                            href={getBlogCategoryUrl(category.id)}
                            prefetch={false}
                            className="text-sm font-semibold text-brand-dark hover:text-brand-green dark:text-dark-heading"
                        >
                            {category.label}
                        </Link>
                    </div>
                </div>

                <header className="max-w-4xl">
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={accent.badge} icon={null}>
                            {category.label}
                        </Badge>
                        {post.is_featured && <Badge variant="green" icon={null}>Destaque</Badge>}
                    </div>

                    <h1 className="mt-4 text-3xl font-bold leading-tight tracking-tight text-brand-dark dark:text-dark-heading md:text-4xl lg:text-5xl">
                        {post.title}
                    </h1>

                    {post.subtitle && (
                        <p className="mt-4 text-lg leading-relaxed text-brand-inactive-text dark:text-dark-body">
                            {post.subtitle}
                        </p>
                    )}

                    <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-brand-inactive-text dark:text-dark-body">
                        <span className="flex items-center gap-1.5">
                            <UserIcon size={15} />
                            {post.author_name}
                        </span>
                        <span className="flex items-center gap-1.5">
                            <CalendarIcon size={15} />
                            {formatBlogDate(post.published_at)}
                        </span>
                        <span className="flex items-center gap-1.5">
                            <ClockIcon size={15} />
                            {post.reading_time_minutes} min de leitura
                        </span>
                    </div>

                    <div className="mt-5 flex flex-wrap items-center gap-2">
                        <Button variant="outline" size="sm" onClick={copyLink}>
                            {copied ? <CheckCircleIcon size={14} /> : <CopyIcon size={14} />}
                            {copied ? "Link copiado" : "Copiar link"}
                        </Button>
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => openShare(`https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`)}
                            aria-label="Compartilhar no WhatsApp"
                        >
                            <WhatsappIcon size={15} />
                        </Button>
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => openShare(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`)}
                            aria-label="Compartilhar no X"
                        >
                            <TwitterIcon size={15} />
                        </Button>
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => openShare(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`)}
                            aria-label="Compartilhar no LinkedIn"
                        >
                            <LinkedinIcon size={15} />
                        </Button>
                    </div>
                </header>

                {post.cover_image_url && (
                    <figure className="mt-8 max-w-5xl overflow-hidden rounded-2xl border border-brand-border dark:border-dark-border">
                        <img
                            src={post.cover_image_url}
                            alt={post.cover_image_alt || post.title}
                            className="h-auto max-h-[520px] w-full object-cover"
                        />
                        {post.cover_image_alt && (
                            <figcaption className="border-t border-brand-border bg-brand-gray/60 px-5 py-3 text-center text-xs text-brand-inactive-text dark:border-dark-border dark:bg-dark-border/20 dark:text-dark-body">
                                {post.cover_image_alt}
                            </figcaption>
                        )}
                    </figure>
                )}

                <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_280px]">
                    <div className="min-w-0">
                        {post.key_takeaways.length > 0 && (
                            <div className={`mb-10 rounded-2xl border ${accent.border} ${accent.softBg} p-6`}>
                                <h2 className="text-base font-bold text-brand-dark dark:text-dark-heading">
                                    O que você vai aprender
                                </h2>
                                <ul className="mt-4 space-y-2.5">
                                    {post.key_takeaways.map((item, index) => (
                                        <li key={index} className="flex items-start gap-2.5 text-sm leading-relaxed text-brand-dark/80 dark:text-dark-body">
                                            <CheckCircleIcon size={16} className={`mt-0.5 shrink-0 ${accent.text}`} />
                                            <span>{item}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        <div className="blog-content" dangerouslySetInnerHTML={{ __html: html }} />

                        {post.faq.length > 0 && (
                            <section className="mt-14 border-t border-brand-border pt-10 dark:border-dark-border">
                                <h2 className="text-2xl font-bold text-brand-dark dark:text-dark-heading">Perguntas frequentes</h2>
                                <div className="mt-5 space-y-3">
                                    {post.faq.map((item, index) => (
                                        <details key={index} className="rounded-xl border border-brand-border bg-white p-5 dark:border-dark-border dark:bg-dark-surface">
                                            <summary className="cursor-pointer list-none pr-6 text-sm font-bold text-brand-dark marker:hidden dark:text-dark-heading">
                                                {item.question}
                                            </summary>
                                            <p className="mt-3 text-sm leading-relaxed text-brand-inactive-text dark:text-dark-body">
                                                {item.answer}
                                            </p>
                                        </details>
                                    ))}
                                </div>
                            </section>
                        )}

                        <div className="mt-14 flex flex-col gap-4 rounded-2xl border border-brand-border bg-brand-gray/50 p-6 dark:border-dark-border dark:bg-dark-border/20 sm:flex-row sm:items-center">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-brand-dark dark:bg-dark-surface dark:text-dark-heading">
                                <UserIcon size={20} />
                            </div>
                            <div>
                                <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">{post.author_name}</p>
                                <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                                    {post.author_role} · Conteúdo produzido para ajudar pequenos negócios a vender e se organizar melhor.
                                </p>
                            </div>
                        </div>

                        <section className="mt-14">
                            <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Continue aprendendo</h2>
                            <div className="mt-5 grid gap-3 sm:grid-cols-3">
                                {relatedLinks.map((link) => (
                                    <Link
                                        key={link.href}
                                        href={link.href}
                                        prefetch={false}
                                        className="rounded-xl border border-brand-border p-4 dark:border-dark-border"
                                    >
                                        <p className="flex items-center justify-between gap-2 text-sm font-bold text-brand-dark dark:text-dark-heading">
                                            {link.label}
                                            <ChevronRightIcon size={14} className="shrink-0 text-brand-green" />
                                        </p>
                                        <p className="mt-2 text-xs leading-relaxed text-brand-inactive-text dark:text-dark-body">
                                            {link.description}
                                        </p>
                                    </Link>
                                ))}
                            </div>
                        </section>

                        <div className="mt-14 flex items-center justify-between gap-4 border-t border-brand-border pt-8 dark:border-dark-border">
                            {previous ? (
                                <Link href={getBlogPostUrl(previous.slug)} prefetch={false} className="flex max-w-[48%] items-start gap-2">
                                    <ChevronLeftIcon size={16} className="mt-1 shrink-0 text-brand-inactive-text dark:text-dark-body" />
                                    <span>
                                        <span className="block text-xs text-brand-inactive-text dark:text-dark-body">Anterior</span>
                                        <span className="line-clamp-2 text-sm font-bold text-brand-green">{previous.title}</span>
                                    </span>
                                </Link>
                            ) : <span />}
                            {next ? (
                                <Link href={getBlogPostUrl(next.slug)} prefetch={false} className="flex max-w-[48%] items-start gap-2 text-right">
                                    <span>
                                        <span className="block text-xs text-brand-inactive-text dark:text-dark-body">Próximo</span>
                                        <span className="line-clamp-2 text-sm font-bold text-brand-green">{next.title}</span>
                                    </span>
                                    <ChevronRightIcon size={16} className="mt-1 shrink-0 text-brand-inactive-text dark:text-dark-body" />
                                </Link>
                            ) : <span />}
                        </div>
                    </div>

                    <aside className="hidden lg:block">
                        <div className="sticky top-24 space-y-6">
                            {toc.length > 0 && (
                                <nav className="rounded-xl border border-brand-border p-5 dark:border-dark-border">
                                    <p className="mb-3 text-xs font-bold uppercase tracking-wider text-brand-inactive-text dark:text-dark-body">
                                        Neste artigo
                                    </p>
                                    <ul className="space-y-2">
                                        {toc.map((item) => (
                                            <li key={item.id} className={item.level === 3 ? "pl-3" : ""}>
                                                <a
                                                    href={`#${item.id}`}
                                                    className={`block text-sm leading-snug ${
                                                        activeId === item.id
                                                            ? "font-semibold text-brand-green"
                                                            : "text-brand-inactive-text hover:text-brand-dark dark:text-dark-body dark:hover:text-dark-heading"
                                                    }`}
                                                >
                                                    {item.text}
                                                </a>
                                            </li>
                                        ))}
                                    </ul>
                                </nav>
                            )}

                            <div className="rounded-xl bg-brand-dark p-5 text-white">
                                <p className="text-sm font-bold">Comece grátis na Dudit</p>
                                <p className="mt-2 text-xs leading-relaxed text-gray-300">
                                    Vitrine online, PDV, financeiro e ordens de serviço com 0% de comissão por venda.
                                </p>
                                <Button asChild className="mt-4 w-full justify-center" size="sm">
                                    <Link href="/auth/login?mode=partner" prefetch={false}>Criar minha loja</Link>
                                </Button>
                            </div>
                        </div>
                    </aside>
                </div>

                {related.length > 0 && (
                    <section className="mt-16 border-t border-brand-border pt-10 dark:border-dark-border">
                        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
                            <div>
                                <h2 className="text-2xl font-bold text-brand-dark dark:text-dark-heading">Leia também</h2>
                                <p className="mt-1 text-sm text-brand-inactive-text dark:text-dark-body">Mais dicas para aplicar no seu negócio.</p>
                            </div>
                            <Link href="/blog" prefetch={false} className="text-sm font-semibold text-brand-green hover:underline">
                                Ver todas as dicas
                            </Link>
                        </div>
                        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                            {related.map((item) => (
                                <BlogCard key={item.id} post={item} />
                            ))}
                        </div>
                    </section>
                )}
            </article>
        </div>
    )
}
