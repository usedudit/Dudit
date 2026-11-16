"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { SearchIcon, XIcon } from "@/lib/icons"
import { Badge, Button, IconPlaceholder, Input } from "@/components/reusable"
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
            <section className="border-b border-brand-border bg-white dark:border-dark-border dark:bg-dark-surface">
                <div className="mx-auto w-full max-w-[1400px] px-4 py-12 lg:py-16">
                    <div className="max-w-3xl">
                        <Badge variant="green" icon={null}>
                            Blog do Dino
                        </Badge>

                        <h1 className="mt-4 text-3xl font-bold leading-tight tracking-tight text-brand-dark dark:text-dark-heading md:text-4xl lg:text-5xl">
                            Dicas para vender melhor, cuidar do caixa e crescer
                        </h1>

                        <p className="mt-4 text-base leading-relaxed text-brand-inactive-text dark:text-dark-body lg:text-lg">
                            Conteúdo prático para quem toca um pequeno negócio no Brasil: segurança, finanças, fotos, atendimento, marketing e rotinas de gestão. Sem enrolação e sem termo difícil.
                        </p>
                    </div>

                    <form onSubmit={(event) => event.preventDefault()} className="mt-8 max-w-xl">
                        <Input
                            variant="full-rounded"
                            placeholder="Buscar por golpes, fluxo de caixa, fotos..."
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            prefix={<SearchIcon size={16} />}
                            suffix={
                                query ? (
                                    <button
                                        type="button"
                                        onClick={() => setQuery("")}
                                        aria-label="Limpar busca"
                                        className="text-brand-inactive-text dark:text-dark-body"
                                    >
                                        <XIcon size={16} />
                                    </button>
                                ) : undefined
                            }
                        />
                    </form>

                    <div className="mt-6 flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setSelectedCategory("all")}
                            className={`rounded-full border px-4 py-2 text-sm font-semibold ${
                                selectedCategory === "all"
                                    ? "border-brand-dark bg-brand-dark text-white dark:border-brand-green dark:bg-brand-green"
                                    : "border-brand-border bg-white text-brand-inactive-text dark:border-dark-border dark:bg-dark-surface dark:text-dark-body"
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
                                    className={`rounded-full border px-4 py-2 text-sm font-semibold ${
                                        active
                                            ? `${accent.border} ${accent.softBg} ${accent.text}`
                                            : "border-brand-border bg-white text-brand-inactive-text dark:border-dark-border dark:bg-dark-surface dark:text-dark-body"
                                    }`}
                                >
                                    {category.shortLabel}
                                </button>
                            )
                        })}
                    </div>
                </div>
            </section>

            <div className="mx-auto w-full max-w-[1400px] px-4 py-12 lg:py-16">
                {posts.length === 0 ? (
                    <div className="mx-auto max-w-2xl py-10">
                        <IconPlaceholder
                            title="O Dino está preparando as primeiras dicas"
                            subtitle="Em breve você encontrará conteúdos sobre segurança, finanças, vendas e rotinas de gestão. Enquanto isso, a Central de Ajuda já está cheia de tutoriais."
                            titleClass="text-xl font-bold text-brand-dark dark:text-dark-heading mb-2"
                            subtitleClass="text-brand-inactive-text dark:text-dark-body max-w-md mb-2 text-sm"
                            itemButton={{
                                text: "Ir para a Central de Ajuda",
                                action: "/ajuda",
                            }}
                        />
                    </div>
                ) : (
                    <>
                        {showFeatured && (
                            <div className="mb-12">
                                <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                                    <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Dica em destaque</h2>
                                    <Link
                                        href={`/blog/categoria/${featured.category}`}
                                        prefetch={false}
                                        className="text-sm font-semibold text-brand-green hover:underline"
                                    >
                                        Ver mais de {getBlogCategory(featured.category).shortLabel}
                                    </Link>
                                </div>
                                <BlogCard post={featured} featured />
                            </div>
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
                                    <div className="mx-auto max-w-2xl py-10">
                                        <IconPlaceholder
                                            title="Nenhuma dica encontrada"
                                            subtitle="Tente outro termo ou veja todas as categorias."
                                            titleClass="text-xl font-bold text-brand-dark dark:text-dark-heading mb-2"
                                            subtitleClass="text-brand-inactive-text dark:text-dark-body max-w-md mb-2 text-sm"
                                            itemButton={{
                                                text: "Limpar filtros",
                                                action: () => {
                                                    setQuery("")
                                                    setSelectedCategory("all")
                                                },
                                                variant: "outline",
                                            }}
                                        />
                                    </div>
                                ) : (
                                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                                        {filtered.map((post) => (
                                            <BlogCard key={post.id} post={post} />
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </>
                )}

                <section className="mt-16 border-t border-brand-border pt-8 dark:border-dark-border">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div>
                            <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">
                                Prefere um passo a passo da plataforma?
                            </h2>
                            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-brand-inactive-text dark:text-dark-body">
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
                    </div>
                </section>
            </div>
        </div>
    )
}
