import type { Metadata } from "next"
import { notFound } from "next/navigation"
import {
    getPublishedBlogPostBySlug,
    getPublishedBlogPosts,
    getPublishedBlogSlugs,
    getRelatedBlogPosts,
} from "@/lib/blog/queries"
import { prepareBlogContent } from "@/lib/blog/content"
import { getBlogCategory } from "@/lib/blog/categories"
import { safeJsonLdStringify } from "@/lib/utils/safe-json-ld"
import BlogArticle from "@/components/blog/BlogArticle"

export const revalidate = 3600

const BASE_URL = "https://dudit.com.br"
const DEFAULT_OG_IMAGE = "https://img.dudit.com.br/static/og-image.png"

type Props = {
    params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
    const slugs = await getPublishedBlogSlugs()
    return slugs.map((post) => ({ slug: post.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { slug } = await params
    const post = await getPublishedBlogPostBySlug(slug)

    if (!post) {
        return {
            title: "Artigo não encontrado | Blog do Dino",
            robots: { index: false, follow: false },
        }
    }

    const title = post.seo_title || post.title
    const description =
        post.seo_description || post.excerpt || post.subtitle || `Dica do Blog do Dino: ${post.title}`
    const canonical = `${BASE_URL}/blog/${post.slug}`
    const image = post.cover_image_url || DEFAULT_OG_IMAGE

    return {
        title,
        description,
        keywords: post.seo_keywords.length > 0 ? post.seo_keywords : post.tags,
        alternates: { canonical },
        openGraph: {
            title,
            description,
            url: canonical,
            siteName: "Dudit",
            locale: "pt_BR",
            type: "article",
            publishedTime: post.published_at || undefined,
            modifiedTime: post.updated_at,
            authors: [post.author_name],
            tags: post.tags,
            images: [
                {
                    url: image,
                    width: 1200,
                    height: 630,
                    alt: post.cover_image_alt || post.title,
                },
            ],
        },
        twitter: {
            card: "summary_large_image",
            title,
            description,
            images: [image],
        },
    }
}

export default async function BlogPostPage({ params }: Props) {
    const { slug } = await params
    const post = await getPublishedBlogPostBySlug(slug)

    if (!post) notFound()

    const [allPosts, related] = await Promise.all([
        getPublishedBlogPosts(),
        getRelatedBlogPosts(post.category, post.id, 3),
    ])

    const index = allPosts.findIndex((item) => item.id === post.id)
    const previous = index >= 0 ? allPosts[index + 1] ?? null : null
    const next = index > 0 ? allPosts[index - 1] ?? null : null

    const { html, toc, wordCount } = prepareBlogContent(post.content)
    const category = getBlogCategory(post.category)
    const canonical = `${BASE_URL}/blog/${post.slug}`
    const categoryUrl = `${BASE_URL}/blog/categoria/${category.id}`

    const jsonLdElements: Record<string, unknown>[] = [
        {
            "@context": "https://schema.org",
            "@type": "BlogPosting",
            headline: post.title,
            description: post.seo_description || post.excerpt || post.subtitle || post.title,
            url: canonical,
            mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
            image: [post.cover_image_url || DEFAULT_OG_IMAGE],
            datePublished: post.published_at,
            dateModified: post.updated_at,
            inLanguage: "pt-BR",
            articleSection: category.label,
            keywords: (post.seo_keywords.length > 0 ? post.seo_keywords : post.tags).join(", "),
            wordCount,
            timeRequired: `PT${Math.max(1, post.reading_time_minutes)}M`,
            author: {
                "@type": "Organization",
                name: post.author_name,
                url: BASE_URL,
            },
            publisher: {
                "@type": "Organization",
                name: "Dudit",
                url: BASE_URL,
                logo: {
                    "@type": "ImageObject",
                    url: "https://img.dudit.com.br/static/Icon.png",
                },
            },
        },
        {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
                { "@type": "ListItem", position: 1, name: "Home", item: BASE_URL },
                { "@type": "ListItem", position: 2, name: "Blog do Dino", item: `${BASE_URL}/blog` },
                { "@type": "ListItem", position: 3, name: category.label, item: categoryUrl },
                { "@type": "ListItem", position: 4, name: post.title, item: canonical },
            ],
        },
    ]

    if (post.faq.length > 0) {
        jsonLdElements.push({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: post.faq.map((item) => ({
                "@type": "Question",
                name: item.question,
                acceptedAnswer: {
                    "@type": "Answer",
                    text: item.answer,
                },
            })),
        })
    }

    return (
        <>
            {jsonLdElements.map((schema, index) => (
                <script
                    key={index}
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(schema) }}
                />
            ))}
            <BlogArticle
                post={post}
                html={html}
                toc={toc}
                related={related}
                previous={previous}
                next={next}
            />
        </>
    )
}
