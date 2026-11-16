import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ChevronLeftIcon } from "@/lib/icons"
import { Badge, Button, IconPlaceholder } from "@/components/reusable"
import { BLOG_CATEGORIES } from "@/lib/blog/categories"
import { getPublishedBlogPostsByCategory } from "@/lib/blog/queries"
import { safeJsonLdStringify } from "@/lib/utils/safe-json-ld"
import BlogCard from "@/components/blog/BlogCard"
import { BLOG_ACCENT_CLASSES } from "@/components/blog/category-styles"

export const dynamic = "force-dynamic"

const BASE_URL = "https://dudit.com.br"

type Props = {
    params: Promise<{ category: string }>
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

            <section className="border-b border-brand-border bg-white dark:border-dark-border dark:bg-dark-surface">
                <div className="mx-auto w-full max-w-[1400px] px-4 py-12 lg:py-16">
                    <Button variant="filled" asChild className="mb-6 h-10 w-10 shrink-0 p-0">
                        <Link href="/blog" prefetch={false} aria-label="Voltar para o blog">
                            <ChevronLeftIcon className="h-5 w-5 text-brand-inactive-text dark:text-dark-body" />
                        </Link>
                    </Button>

                    <Badge variant={accent.badge} icon={null}>
                        Blog do Dino
                    </Badge>

                    <h1 className="mt-4 max-w-4xl text-3xl font-bold leading-tight tracking-tight text-brand-dark dark:text-dark-heading md:text-4xl lg:text-5xl">
                        {category.label}
                    </h1>
                    <p className="mt-4 max-w-2xl text-base leading-relaxed text-brand-inactive-text dark:text-dark-body lg:text-lg">
                        {category.description}
                    </p>
                    <p className="mt-3 text-sm font-medium text-brand-inactive-text dark:text-dark-body">
                        {posts.length} {posts.length === 1 ? "artigo publicado" : "artigos publicados"}
                    </p>
                </div>
            </section>

            <div className="mx-auto w-full max-w-[1400px] px-4 py-12 lg:py-16">
                {posts.length > 0 ? (
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {posts.map((post) => (
                            <BlogCard key={post.id} post={post} />
                        ))}
                    </div>
                ) : (
                    <div className="mx-auto max-w-2xl py-10">
                        <IconPlaceholder
                            title="Ainda não há artigos nesta categoria"
                            subtitle="Estamos preparando novos conteúdos. Enquanto isso, explore todas as dicas ou a Central de Ajuda."
                            titleClass="text-xl font-bold text-brand-dark dark:text-dark-heading mb-2"
                            subtitleClass="text-brand-inactive-text dark:text-dark-body max-w-md mb-2 text-sm"
                            buttons={[
                                { text: "Ver todas as dicas", action: "/blog" },
                                { text: "Central de Ajuda", action: "/ajuda", variant: "outline" },
                            ]}
                        />
                    </div>
                )}

                <section className="mt-14 border-t border-brand-border pt-8 dark:border-dark-border">
                    <h2 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Explore outras categorias</h2>
                    <div className="mt-4 flex flex-wrap gap-2">
                        {BLOG_CATEGORIES.filter((item) => item.id !== category.id).map((item) => (
                            <Link
                                key={item.id}
                                href={`/blog/categoria/${item.id}`}
                                prefetch={false}
                                className="rounded-full border border-brand-border bg-white px-4 py-2 text-sm font-semibold text-brand-inactive-text hover:text-brand-dark dark:border-dark-border dark:bg-dark-surface dark:text-dark-body dark:hover:text-dark-heading"
                            >
                                {item.label}
                            </Link>
                        ))}
                    </div>
                </section>
            </div>
        </>
    )
}
