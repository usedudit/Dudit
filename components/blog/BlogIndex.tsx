"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { SearchIcon, SparklesIcon, XIcon } from "@/lib/icons"
import { Badge, Button } from "@/components/reusable"
import { BLOG_CATEGORIES, getBlogCategory } from "@/lib/blog/categories"
import type { BlogPostSummary } from "@/lib/blog/types"
import BlogCard from "./BlogCard"
import { BLOG_ACCENT_CLASSES } from "./category-styles"

interface BlogIndexProps {
    posts: BlogPostSummary[]
    initialQuery?: string
}

const normalize = (text: string) =>
    text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()

export default function BlogIndex({ posts, initialQuery = "" }: BlogIndexProps) {
    const [query, setQuery] = useState(initialQuery)
    const [selectedCategory, setSelectedCategory] = useState<string>("all")

    const featured = useMemo(() => posts.find((post) => post.is_featured) ?? posts[0] ?? null, [posts])

    const filtered = useMemo(() => {
        const normalizedQuery = normalize(query.trim())
        const isFilteringNow = normalizedQuery.length > 0 || selectedCategory !== "all"
        return posts.filter((post) => {
            if (!isFilteringNow && featured && post.id === featured.id) return false
            const matchesCategory = selectedCategory === "all" || post.category === selectedCategory
            if (!matchesCategory) return false
            if (!normalizedQuery) return true

            const category = getBlogCategory(post.category)
            const haystack = normalize([
                post.title,
                post.subtitle || "",
                post.excerpt || "",
                category.label,
                ...(post.tags || []),
            ].join(" "))

            return haystack.includes(normalizedQuery)
        })
    }, [posts, query, selectedCategory, featured])

    const isFiltering = query.trim().length > 0 || selectedCategory !== "all"
    const showFeatured = !isFiltering && featured

    return (
        <div className="w-full">
            {/* Hero */}
            <section className="relative overflow-hidden border-b border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface">
                <div className="pointer-events-none absolute inset-0">
                    <img
                        src="https://img.dudit.com.br/static/banners/WavesPattern.png"
                        alt=""
                        className="h-full w-full object-cover opacity-[0.14]"
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/60 to-white dark:via-dark-surface/60 dark:to-dark-surface" />
                    <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-green/10 blur-3xl" />
                    <div className="absolute -bottom-32 left-1/4 h-72 w-72 rounded-full bg-brand-orange/10 blur-3xl" />
                </div>

                <div className="relative z-10 mx-auto flex w-full max-w-[1100px] flex-col items-center px-4 py-16 text-center lg:py-24">
                    <Badge variant="green" className="mb-6" icon={<SparklesIcon />}>
                        Blog do Dino
                    </Badge>

                    <h1 className="max-w-4xl text-4xl font-black leading-[1.08] tracking-tight text-brand-dark dark:text-dark-heading md:text-5xl lg:text-6xl">
                        Dicas para vender melhor, cuidar do caixa e crescer
                    </h1>

                    <p className="mt-6 max-w-2xl text-base leading-relaxed text-brand-inactive-text dark:text-dark-body lg:text-lg">
                        Conteúdo prático para quem toca um pequeno negócio no Brasil: segurança, finanças, fotos, atendimento, marketing e rotinas de gestão. Sem enrolação e sem termo difícil.
                    </p>

                    <form
                        onSubmit={(event) => event.preventDefault()}
                        className="relative mt-9 w-full max-w-xl"
                    >
                        <SearchIcon size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Buscar por golpes, fluxo de caixa, fotos..."
                            aria-label="Buscar dicas no blog"
                            className="h-14 w-full rounded-full border border-brand-border bg-white pl-12 pr-12 text-[15px] text-brand-dark outline-none transition-all placeholder:text-gray-400 focus:border-brand-green focus:ring-4 focus:ring-brand-green/10 dark:border-dark-border dark:bg-dark-surface dark:text-dark-heading"
                        />
                        {query && (
                            <button
                                type="button"
                                onClick={() => setQuery("")}
                                aria-label="Limpar busca"
                                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-brand-dark dark:hover:text-white"
                            >
                                <XIcon size={18} />
                            </button>
                        )}
                    </form>

                    <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                        <button
                            type="button"
                            onClick={() => setSelectedCategory("all")}
                            className={`rounded-full border px-4 py-2 text-sm font-semibold transition-all ${
                                selectedCategory === "all"
                                    ? "border-brand-dark bg-brand-dark text-white dark:border-brand-green dark:bg-brand-green"
                                    : "border-brand-border bg-white text-brand-inactive-text hover:border-brand-green/40 hover:text-brand-dark dark:border-dark-border dark:bg-dark-surface dark:text-dark-body dark:hover:text-dark-heading"
                            }`}
                        >
                            Todos
                        </button>
                        {BLOG_CATEGORIES.filter((category) => posts.some((post) => post.category === category.id)).map((category) => {
                            const active = selectedCategory === category.id
                            const accent = BLOG_ACCENT_CLASSES[category.accent]
                            return (
                                <button
                                    key={category.id}
                                    type="button"
                                    onClick={() => setSelectedCategory(category.id)}
                                    className={`rounded-full border px-4 py-2 text-sm font-semibold transition-all ${
                                        active
                                            ? `${accent.border} ${accent.softBg} ${accent.text}`
                                            : "border-brand-border bg-white text-brand-inactive-text hover:border-brand-green/40 hover:text-brand-dark dark:border-dark-border dark:bg-dark-surface dark:text-dark-body dark:hover:text-dark-heading"
                                    }`}
                                >
                                    {category.emoji} {category.shortLabel}
                                </button>
                            )
                        })}
                    </div>
                </div>
            </section>

            <div className="mx-auto w-full max-w-[1200px] px-4 py-14 lg:py-20">
                {posts.length === 0 ? (
                    <div className="mx-auto max-w-2xl rounded-3xl border border-dashed border-brand-border bg-brand-gray/40 p-10 text-center dark:border-dark-border dark:bg-dark-border/20">
                        <span className="text-5xl" aria-hidden="true">🦖</span>
                        <h2 className="mt-5 text-2xl font-bold text-brand-dark dark:text-dark-heading">
                            O Dino está preparando as primeiras dicas
                        </h2>
                        <p className="mt-3 text-brand-inactive-text dark:text-dark-body">
                            Em breve você encontrará conteúdos sobre segurança, finanças, vendas e rotinas de gestão. Enquanto isso, a Central de Ajuda já está cheia de tutoriais.
                        </p>
                        <Button asChild className="mt-6">
                            <Link href="/ajuda" prefetch={false}>Ir para a Central de Ajuda</Link>
                        </Button>
                    </div>
                ) : (
                    <>
                        {showFeatured && (
                            <motion.div
                                initial={{ opacity: 0, y: 16 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.4 }}
                                className="mb-14"
                            >
                                <div className="mb-5 flex items-center justify-between">
                                    <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Dica em destaque</h2>
                                    <Link href={`/blog/categoria/${featured.category}`} prefetch={false} className="text-sm font-semibold text-brand-green hover:underline">
                                        Ver mais de {getBlogCategory(featured.category).shortLabel}
                                    </Link>
                                </div>
                                <BlogCard post={featured} featured />
                            </motion.div>
                        )}

                        {(!showFeatured || filtered.length > 0) && (
                            <>
                        <div className="mb-6 flex items-end justify-between gap-4">
                            <div>
                                <h2 className="text-2xl font-bold tracking-tight text-brand-dark dark:text-dark-heading">
                                    {isFiltering ? "Resultados da busca" : "Últimas dicas"}
                                </h2>
                                <p className="mt-1 text-sm text-brand-inactive-text dark:text-dark-body">
                                    {filtered.length} {filtered.length === 1 ? "conteúdo encontrado" : "conteúdos encontrados"}
                                </p>
                            </div>
                        </div>

                        {filtered.length === 0 ? (
                            <div className="rounded-3xl border border-dashed border-brand-border bg-brand-gray/40 p-10 text-center dark:border-dark-border dark:bg-dark-border/20">
                                <SearchIcon size={32} className="mx-auto text-gray-400" />
                                <h3 className="mt-4 text-lg font-bold text-brand-dark dark:text-dark-heading">Nenhuma dica encontrada</h3>
                                <p className="mt-2 text-sm text-brand-inactive-text dark:text-dark-body">
                                    Tente outro termo ou veja todas as categorias.
                                </p>
                                <Button
                                    variant="outline"
                                    className="mt-5"
                                    onClick={() => {
                                        setQuery("")
                                        setSelectedCategory("all")
                                    }}
                                >
                                    Limpar filtros
                                </Button>
                            </div>
                        ) : (
                            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                                {filtered.map((post, index) => (
                                    <motion.div
                                        key={post.id}
                                        initial={{ opacity: 0, y: 14 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.35, delay: Math.min(index * 0.04, 0.3) }}
                                    >
                                        <BlogCard post={post} />
                                    </motion.div>
                                ))}
                            </div>
                        )}
                            </>
                        )}
                    </>
                )}

                {/* Help bridge */}
                <section className="mt-20 grid gap-6 rounded-3xl border border-brand-border bg-brand-gray/50 p-6 dark:border-dark-border dark:bg-dark-border/20 md:grid-cols-[1fr_auto] md:items-center md:p-10">
                    <div>
                        <h2 className="text-2xl font-bold text-brand-dark dark:text-dark-heading">
                            Prefere um passo a passo da plataforma?
                        </h2>
                        <p className="mt-2 max-w-2xl text-brand-inactive-text dark:text-dark-body">
                            O blog traz estratégias e ideias. A Central de Ajuda mostra exatamente onde clicar para configurar produtos, financeiro, entregas e muito mais.
                        </p>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row">
                        <Button asChild>
                            <Link href="/ajuda" prefetch={false}>Central de Ajuda</Link>
                        </Button>
                        <Button variant="outline" asChild>
                            <Link href="/institucional/segmentos" prefetch={false}>Ver segmentos</Link>
                        </Button>
                    </div>
                </section>
            </div>
        </div>
    )
}
