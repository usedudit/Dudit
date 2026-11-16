import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeftIcon, SparklesIcon } from "@/lib/icons"
import { Badge, Button } from "@/components/reusable"
import { BLOG_CATEGORIES, getBlogCategory } from "@/lib/blog/categories"
import { getPublishedBlogPostsByCategory } from "@/lib/blog/queries"
import { safeJsonLdStringify } from "@/lib/utils/safe-json-ld"
import BlogCard from "@/components/blog/BlogCard"
import { BLOG_ACCENT_CLASSES } from "@/components/blog/category-styles"

export const revalidate = 3600

const BASE_URL = "https://dudit.com.br"

type Props = {
    params: Promise<{ category: string }>
}

export function generateStaticParams() {
    return BLOG_CATEGORIES.map((category) => ({ category: category.id }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { category: categoryId } = await params
    const category = BLOG_CATEGORIES.find((item) => item.id === categoryId)

    if (!category) {
        return {
            title: "Categoria não encontrada | Blog do Dino",
            robots: { index: false, follow: false },
        }
    }

    const title = `${category.label} | Blog do Dino`
    const description = `${category.description} Dicas práticas para pequenos negócios no Blog do Dino.`
    const canonical = `${BASE_URL}/blog/categoria/${category.id}`

    return {
        title,
        description,
        alternates: { canonical },
        openGraph: {
            title,
            description,
            url: canonical,
            siteName: "Dudit",
            locale: "pt_BR",
            type: "website",
            images: [
                {
                    url: "https://img.dudit.com.br/static/og-image.png",
                    width: 1200,
                    height: 630,
                    alt: `${category.label} — Blog do Dino`,
                },
            ],
        },
        twitter: {
            card: "summary_large_image",
            title,
            description,
        },
    }
}

export default async function BlogCategoryPage({ params }: Props) {
    const { category: categoryId } = await params
    const category = BLOG_CATEGORIES.find((item) => item.id === categoryId)

    if (!category) notFound()

    const posts = await getPublishedBlogPostsByCategory(category.id)
    const accent = BLOG_ACCENT_CLASSES[category.accent]
    const canonical = `${BASE_URL}/blog/categoria/${category.id}`

    const jsonLd = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "CollectionPage",
                name: `${category.label} — Blog do Dino`,
                description: category.description,
                url: canonical,
                inLanguage: "pt-BR",
                isPartOf: {
                    "@type": "Blog",
                    name: "Blog do Dino",
                    url: `${BASE_URL}/blog`,
                },
                publisher: {
                    "@type": "Organization",
                    name: "Dudit",
                    url: BASE_URL,
                },
            },
            {
                "@type": "BreadcrumbList",
                itemListElement: [
                    { "@type": "ListItem", position: 1, name: "Home", item: BASE_URL },
                    { "@type": "ListItem", position: 2, name: "Blog do Dino", item: `${BASE_URL}/blog` },
                    { "@type": "ListItem", position: 3, name: category.label, item: canonical },
                ],
            },
        ],
    }

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(jsonLd) }}
            />

            <section className="relative overflow-hidden border-b border-brand-border bg-white dark:border-dark-border dark:bg-dark-surface">
                <div className="pointer-events-none absolute inset-0">
                    <img
                        src="https://img.dudit.com.br/static/banners/WavesPattern.png"
                        alt=""
                        className="h-full w-full object-cover opacity-[0.12]"
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/60 to-white dark:via-dark-surface/60 dark:to-dark-surface" />
                    <div className={`absolute -right-24 -top-24 h-72 w-72 rounded-full ${accent.softBg} blur-3xl`} />
                </div>

                <div className="relative z-10 mx-auto w-full max-w-[1100px] px-4 py-14 lg:py-20">
                    <Link
                        href="/blog"
                        prefetch={false}
                        className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-brand-inactive-text transition-colors hover:text-brand-green dark:text-dark-body"
                    >
                        <ArrowLeftIcon size={15} />
                        Todos os artigos
                    </Link>

                    <Badge variant={accent.badge} className="mb-5" icon={<SparklesIcon />}>
                        {category.emoji} {category.label}
                    </Badge>

                    <h1 className="max-w-4xl text-3xl font-black leading-[1.1] tracking-tight text-brand-dark dark:text-dark-heading md:text-4xl lg:text-5xl">
                        {category.label}
                    </h1>
                    <p className="mt-5 max-w-2xl text-base leading-relaxed text-brand-inactive-text dark:text-dark-body lg:text-lg">
                        {category.description}
                    </p>
                    <p className="mt-3 text-sm font-medium text-brand-inactive-text dark:text-dark-body">
                        {posts.length} {posts.length === 1 ? "artigo publicado" : "artigos publicados"}
                    </p>
                </div>
            </section>

            <div className="mx-auto w-full max-w-[1200px] px-4 py-12 lg:py-16">
                {posts.length > 0 ? (
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {posts.map((post) => (
                            <BlogCard key={post.id} post={post} />
                        ))}
                    </div>
                ) : (
                    <div className="mx-auto max-w-2xl rounded-3xl border border-dashed border-brand-border bg-brand-gray/40 p-10 text-center dark:border-dark-border dark:bg-dark-border/20">
                        <span className="text-5xl" aria-hidden="true">{category.emoji}</span>
                        <h2 className="mt-5 text-2xl font-bold text-brand-dark dark:text-dark-heading">
                            Ainda não há artigos nesta categoria
                        </h2>
                        <p className="mt-3 text-brand-inactive-text dark:text-dark-body">
                            Estamos preparando novos conteúdos. Enquanto isso, explore todas as dicas ou a Central de Ajuda.
                        </p>
                        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
                            <Button asChild>
                                <Link href="/blog" prefetch={false}>Ver todas as dicas</Link>
                            </Button>
                            <Button variant="outline" asChild>
                                <Link href="/ajuda" prefetch={false}>Central de Ajuda</Link>
                            </Button>
                        </div>
                    </div>
                )}

                <section className="mt-16 border-t border-brand-border pt-10 dark:border-dark-border">
                    <h2 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Explore outras categorias</h2>
                    <div className="mt-4 flex flex-wrap gap-2">
                        {BLOG_CATEGORIES.filter((item) => item.id !== category.id).map((item) => (
                            <Link
                                key={item.id}
                                href={`/blog/categoria/${item.id}`}
                                prefetch={false}
                                className="rounded-full border border-brand-border bg-white px-4 py-2 text-sm font-semibold text-brand-inactive-text transition-all hover:border-brand-green/40 hover:text-brand-dark dark:border-dark-border dark:bg-dark-surface dark:text-dark-body dark:hover:text-dark-heading"
                            >
                                {item.emoji} {item.label}
                            </Link>
                        ))}
                    </div>
                </section>
            </div>
        </>
    )
}
