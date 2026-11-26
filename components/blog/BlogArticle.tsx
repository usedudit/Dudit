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
    ShareIcon,
    XIcon,
} from "@/lib/icons"
import { Button, Input, DefaultModal, Separator } from "@/components/reusable"
import { getBlogCategory, BLOG_RELATED_LINKS } from "@/lib/blog/categories"
import type { BlogPost, BlogPostSummary } from "@/lib/blog/types"
import type { BlogTocItem } from "@/lib/blog/content"
import { formatBlogDate, getBlogCategoryUrl, getBlogPostUrl } from "@/lib/blog/utils"
import BlogCard from "./BlogCard"
import BlogHeader from "./BlogHeader"
import { useNotification } from "@/hooks/use-notification"

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
    const relatedLinks = BLOG_RELATED_LINKS[post.category] ?? BLOG_RELATED_LINKS.geral

    const [copied, setCopied] = useState(false)
    const [activeId, setActiveId] = useState<string>("")
    const [showShareModal, setShowShareModal] = useState(false)
    const [isLinkCopied, setIsLinkCopied] = useState(false)
    const { success } = useNotification()

    const shareUrl = typeof window !== "undefined" ? window.location.href : `https://dudit.com.br${getBlogPostUrl(post.slug)}`
    const shareText = useMemo(() => `${post.title} — Blog do Dino (Dudit)`, [post.title])

    const fullShareMessage = `${shareText}\n${shareUrl}`

    const socials = useMemo(() => [
        {
            icon: WhatsappIcon,
            name: "WhatsApp",
            color: "bg-[#25D366]",
            url: `https://api.whatsapp.com/send?text=${encodeURIComponent(fullShareMessage)}`
        },
        {
            icon: TwitterIcon,
            name: "X",
            color: "bg-black",
            url: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`
        },
        {
            icon: LinkedinIcon,
            name: "LinkedIn",
            color: "bg-[#0A66C2]",
            url: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`
        }
    ], [shareText, shareUrl])

    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(shareUrl)
            setCopied(true)
            setIsLinkCopied(true)
            success("Sucesso", "Link copiado para a área de transferência!")
            setTimeout(() => {
                setCopied(false)
                setIsLinkCopied(false)
            }, 2000)
        } catch {
            // Clipboard can be blocked by the browser; sharing still works.
        }
    }

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

    const handleShare = () => {
        setShowShareModal(true)
    }

    const coverFigure = post.cover_image_url ? (
        <figure className="overflow-hidden rounded-2xl border border-brand-border dark:border-dark-border">
            <img
                src={post.cover_image_url}
                alt={post.cover_image_alt || post.title}
                className="h-auto w-full object-cover"
                loading="lazy"
                decoding="async"
            />
            {post.cover_image_alt && (
                <figcaption className="border-t border-brand-border bg-brand-gray/60 px-4 py-2.5 text-center text-[11px] text-brand-inactive-text dark:border-dark-border dark:bg-dark-border/20 dark:text-dark-body">
                    {post.cover_image_alt}
                </figcaption>
            )}
        </figure>
    ) : null

    return (
        <div className="w-full bg-white dark:bg-dark-surface">
            <BlogHeader
                isArticle={true}
                onBack={() => window.history.back()}
                onShare={handleShare}
            />
            <article className="mx-auto w-full max-w-[1400px] px-4 pb-16 pt-8 lg:pt-12">
                <div className="my-8 lg:mb-8 lg:mt-0">
                    <h1 className="text-xl font-bold leading-snug tracking-tight text-brand-dark dark:text-dark-heading md:text-2xl lg:text-3xl">
                        {post.title}
                    </h1>
                    <Link
                        href={getBlogCategoryUrl(category.id)}
                        prefetch={false}
                        className="mt-1 inline-block text-xs font-semibold uppercase tracking-wider text-brand-green hover:underline"
                    >
                        {category.label}
                    </Link>
                </div>

                <header className="max-w-4xl">
                    {post.subtitle && (
                        <p className="text-lg leading-relaxed text-brand-inactive-text dark:text-dark-body">
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
                            onClick={handleShare}
                            aria-label="Compartilhar"
                        >
                            <ShareIcon size={15} />
                        </Button>
                    </div>
                </header>

                {coverFigure && <div className="mt-8 max-w-2xl lg:hidden">{coverFigure}</div>}

                <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="min-w-0">
                        {post.key_takeaways.length > 0 && (
                            <div className="mb-10 rounded-2xl border border-brand-border p-6 dark:border-dark-border">
                                <h2 className="text-base font-bold text-brand-dark dark:text-dark-heading">
                                    O que você vai aprender
                                </h2>
                                <ul className="mt-4 space-y-2.5">
                                    {post.key_takeaways.map((item, index) => (
                                        <li key={index} className="flex items-start gap-2.5 text-sm leading-relaxed text-brand-dark/80 dark:text-dark-body">
                                            <CheckCircleIcon size={16} className="mt-0.5 shrink-0 text-brand-green" />
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
                            {coverFigure}

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
                                                    className={`block text-sm leading-snug ${activeId === item.id
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

            {/* Share Modal */}
            <DefaultModal
                isOpen={showShareModal}
                onClose={() => {
                    setShowShareModal(false)
                    setIsLinkCopied(false)
                }}
                maxWidth="md"
                hideHeader={true}
            >
                <div className="flex flex-col relative">
                    <button
                        onClick={() => {
                            setShowShareModal(false)
                            setIsLinkCopied(false)
                        }}
                        className="absolute top-3 right-3 z-10 w-10 h-10 rounded-full bg-black/5 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20 flex items-center justify-center text-brand-dark dark:text-dark-heading transition-colors hidden md:flex"
                        title="Fechar"
                    >
                        <XIcon size={18} />
                    </button>

                    <div className="h-[200px] rounded-2xl flex items-end justify-center mb-8 relative overflow-hidden bg-[#eaf7f0]">
                        <img
                            src="https://img.dudit.com.br/static/illustrations/CompartilharItem.png"
                            alt="Compartilhar Artigo"
                            className="w-64 h-auto object-contain transform translate-y-7"
                        />
                    </div>

                    <h4 className="text-brand-dark dark:text-dark-heading text-xl font-bold mb-2 text-center">
                        Gostou? Espalhe a dica!
                    </h4>
                    <p className="text-brand-inactive-text dark:text-dark-body text-sm max-w-sm mx-auto mb-6 text-center leading-relaxed">
                        Compartilhe com seus amigos e ajude mais pessoas a descobrirem!
                    </p>

                    <div className="w-full space-y-6">
                        <div>
                            <div className="flex gap-2 items-end">
                                <Input
                                    label="Link do artigo"
                                    value={shareUrl}
                                    readOnly
                                    className="flex-1"
                                />
                                <Button
                                    variant="outline"
                                    className="shrink-0 h-[42px] w-[42px] p-0 mb-1 flex items-center justify-center"
                                    onClick={() => {
                                        navigator.clipboard.writeText(shareUrl)
                                        setIsLinkCopied(true)
                                        success("Sucesso", "Link copiado para a área de transferência!")
                                        setTimeout(() => setIsLinkCopied(false), 2000)
                                    }}
                                >
                                    {isLinkCopied ? <CheckCircleIcon size={20} className="text-brand-green" /> : <CopyIcon size={20} />}
                                </Button>
                            </div>
                        </div>

                        <Separator />

                        <div>
                            <label className="text-sm font-medium text-brand-dark dark:text-dark-body truncate block mb-4">
                                Compartilhar em:
                            </label>
                            <div className="flex items-center justify-center gap-4 sm:gap-6 pb-2">
                                {socials.map((social) => (
                                    <a
                                        key={social.name}
                                        href={social.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex flex-col items-center gap-2 group transition-transform hover:scale-105"
                                    >
                                        <div className={`${social.color} w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center text-white transition-all shadow-sm`}>
                                            <social.icon size={24} />
                                        </div>
                                        <span className="text-[10px] sm:text-xs font-medium text-brand-inactive-text dark:text-dark-body group-hover:text-brand-dark dark:text-dark-heading transition-colors">
                                            {social.name}
                                        </span>
                                    </a>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </DefaultModal>
        </div>
    )
}
