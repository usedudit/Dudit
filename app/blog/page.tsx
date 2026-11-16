import type { Metadata } from "next"
import { getPublishedBlogPosts } from "@/lib/blog/queries"
import { safeJsonLdStringify } from "@/lib/utils/safe-json-ld"
import BlogIndex from "@/components/blog/BlogIndex"

export const revalidate = 3600

const CANONICAL = "https://dudit.com.br/blog"

export const metadata: Metadata = {
    title: "Blog do Dino | Dicas para vender, cuidar do caixa e crescer",
    description:
        "Conteúdo prático para pequenos negócios: como evitar golpes, entender e controlar o fluxo de caixa, tirar fotos melhores dos produtos, vender mais e organizar a gestão.",
    keywords: [
        "blog pequenos negócios",
        "dicas para vender mais",
        "fluxo de caixa",
        "como evitar golpes",
        "fotos de produtos",
        "gestão de negócio",
        "blog do dino",
        "dudit",
    ],
    alternates: { canonical: CANONICAL },
    openGraph: {
        title: "Blog do Dino | Dicas para pequenos negócios",
        description:
            "Dicas práticas de segurança, finanças, fotos e gestão para quem toca um pequeno negócio no Brasil.",
        url: CANONICAL,
        siteName: "Dudit",
        locale: "pt_BR",
        type: "website",
        images: [
            {
                url: "https://img.dudit.com.br/static/og-image.png",
                width: 1200,
                height: 630,
                alt: "Blog do Dino — Dudit",
            },
        ],
    },
    twitter: {
        card: "summary_large_image",
        title: "Blog do Dino | Dicas para pequenos negócios",
        description:
            "Dicas práticas de segurança, finanças, fotos e gestão para quem toca um pequeno negócio no Brasil.",
        images: ["https://img.dudit.com.br/static/og-image.png"],
    },
}

type Props = {
    searchParams: Promise<{ q?: string | string[] }>
}

export default async function BlogPage({ searchParams }: Props) {
    const [{ q }, posts] = await Promise.all([searchParams, getPublishedBlogPosts()])
    const initialQuery = typeof q === "string" ? q : Array.isArray(q) ? q[0] ?? "" : ""

    const jsonLd = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "Blog",
                "@id": `${CANONICAL}#blog`,
                name: "Blog do Dino",
                description:
                    "Dicas práticas sobre segurança, finanças, fotos de produtos, vendas e gestão para pequenos negócios brasileiros.",
                url: CANONICAL,
                inLanguage: "pt-BR",
                publisher: {
                    "@type": "Organization",
                    name: "Dudit",
                    url: "https://dudit.com.br",
                    logo: "https://img.dudit.com.br/static/Logo.png",
                },
                blogPost: posts.slice(0, 20).map((post) => ({
                    "@type": "BlogPosting",
                    headline: post.title,
                    description: post.excerpt || post.subtitle || post.title,
                    url: `${CANONICAL}/${post.slug}`,
                    image: post.cover_image_url || "https://img.dudit.com.br/static/og-image.png",
                    datePublished: post.published_at,
                    dateModified: post.updated_at,
                    author: {
                        "@type": "Organization",
                        name: post.author_name,
                    },
                })),
            },
            {
                "@type": "BreadcrumbList",
                itemListElement: [
                    { "@type": "ListItem", position: 1, name: "Home", item: "https://dudit.com.br" },
                    { "@type": "ListItem", position: 2, name: "Blog do Dino", item: CANONICAL },
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
            <BlogIndex posts={posts} initialQuery={initialQuery} />
        </>
    )
}
