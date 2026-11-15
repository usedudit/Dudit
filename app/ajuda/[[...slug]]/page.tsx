import React from "react"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { helpCategories, getArticleBySlug, type HelpArticle } from "@/lib/help-data"
import { safeJsonLdStringify } from "@/lib/utils/safe-json-ld"
import HelpCenterLayout from "@/components/help/HelpCenterLayout"
import HelpContent from "@/components/help/HelpContent"
import HelpHome from "@/components/help/HelpHome"
import HelpTOC from "@/components/help/HelpTOC"

export const revalidate = 86400 // Cache 24h

type Props = {
    params: Promise<{ slug?: string[] }>
}

export async function generateStaticParams() {
    const paramsList: { slug: string[] }[] = [
        { slug: [] },
    ]

    for (const cat of helpCategories) {
        paramsList.push({ slug: [cat.id] })
        for (const art of cat.articles) {
            paramsList.push({ slug: [cat.id, art.slug] })
        }
    }

    return paramsList
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { slug = [] } = await params

    const isHome = slug.length === 0
    const articleSlug = slug[slug.length - 1]
    const categorySlug = slug.length > 1 ? slug[0] : (slug.length === 1 ? slug[0] : null)

    const category = categorySlug ? helpCategories.find(c => c.id === categorySlug) : null
    const article = articleSlug ? getArticleBySlug(articleSlug) : null

    if (isHome) {
        const title = "Central de Ajuda e Tutoriais"
        const description = "Aprenda a gerenciar suas vendas, controlar estoque, emitir orçamentos e ordens de serviço, e usar seu catálogo online sem comissão na Dudit."
        const canonical = "https://dudit.com.br/ajuda"

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
                        alt: "Central de Ajuda Dudit",
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

    if (article) {
        const title = `${article.title} | Central de Ajuda Dudit`
        const description = article.description || `Guia passo a passo: ${article.title}. Saiba como configurar e gerenciar na plataforma Dudit.`
        const canonical = `https://dudit.com.br/ajuda/${article.category}/${article.slug}`

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
                type: "article",
                images: [
                    {
                        url: "https://img.dudit.com.br/static/og-image.png",
                        width: 1200,
                        height: 630,
                        alt: article.title,
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

    if (category) {
        const title = `${category.title} - Tutoriais e Ajuda`
        const description = `Confira todos os guias e tutoriais da categoria ${category.title} na Dudit.`
        const canonical = `https://dudit.com.br/ajuda/${category.id}`

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
            },
        }
    }

    return {
        title: "Página não encontrada | Central de Ajuda Dudit",
        robots: { index: false, follow: false },
    }
}

function parseFaqFromMarkdown(content: string) {
    const faqMatch = content.match(/## Perguntas frequentes([\s\S]*?)(?:$|##\s)/i)
    if (!faqMatch) return []

    const faqText = faqMatch[1]
    const questions: { q: string; a: string }[] = []
    const regex = /\*\*(.*?)\*\*\s*\n([\s\S]*?)(?=\*\*|$)/g
    let match

    while ((match = regex.exec(faqText)) !== null) {
        const q = match[1].trim()
        const a = match[2].trim().replace(/\n+/g, " ")
        if (q && a) {
            questions.push({ q, a })
        }
    }

    return questions
}

export default async function HelpCenterPage({ params }: Props) {
    const { slug = [] } = await params

    const isHome = slug.length === 0
    const articleSlug = slug.length > 0 ? slug[slug.length - 1] : undefined
    const categorySlug = slug.length > 1 ? slug[0] : (slug.length === 1 ? slug[0] : undefined)

    let article: HelpArticle | null = null
    if (articleSlug && articleSlug !== categorySlug) {
        article = getArticleBySlug(articleSlug) || null
    } else if (slug.length === 1) {
        // Category page or direct article slug
        article = getArticleBySlug(slug[0]) || null
    }

    // Category only route (/ajuda/vendas -> redirect to first article or show category list)
    const categoryData = categorySlug ? helpCategories.find(c => c.id === categorySlug) : null

    if (!isHome && !article && !categoryData) {
        notFound()
    }

    // If category route without specific article, use first article in category
    if (!isHome && !article && categoryData && categoryData.articles.length > 0) {
        article = categoryData.articles[0]
    }

    // Build Structured Data (JSON-LD)
    const jsonLdElements: any[] = []

    if (isHome) {
        // BreadcrumbList for Home
        jsonLdElements.push({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
                { "@type": "ListItem", position: 1, name: "Home", item: "https://dudit.com.br" },
                { "@type": "ListItem", position: 2, name: "Central de Ajuda", item: "https://dudit.com.br/ajuda" },
            ],
        })

        // CollectionPage
        jsonLdElements.push({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: "Central de Ajuda e Tutoriais Dudit",
            description: "Guias passo a passo para gerenciar seu negócio, catálogo, PDV e vendas locais.",
            url: "https://dudit.com.br/ajuda",
            publisher: {
                "@type": "Organization",
                name: "Dudit",
                url: "https://dudit.com.br",
                logo: "https://img.dudit.com.br/static/Logo.png",
            },
        })
    } else if (article) {
        const canonicalUrl = `https://dudit.com.br/ajuda/${article.category}/${article.slug}`
        const catName = article.category.replace(/-/g, " ")
        const formattedCat = catName.charAt(0).toUpperCase() + catName.slice(1)

        // BreadcrumbList
        jsonLdElements.push({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
                { "@type": "ListItem", position: 1, name: "Home", item: "https://dudit.com.br" },
                { "@type": "ListItem", position: 2, name: "Central de Ajuda", item: "https://dudit.com.br/ajuda" },
                { "@type": "ListItem", position: 3, name: formattedCat, item: `https://dudit.com.br/ajuda/${article.category}` },
                { "@type": "ListItem", position: 4, name: article.title, item: canonicalUrl },
            ],
        })

        // Article Schema
        jsonLdElements.push({
            "@context": "https://schema.org",
            "@type": "TechArticle",
            headline: article.title,
            description: article.description || article.title,
            url: canonicalUrl,
            inLanguage: "pt-BR",
            publisher: {
                "@type": "Organization",
                name: "Dudit",
                url: "https://dudit.com.br",
                logo: "https://img.dudit.com.br/static/Logo.png",
            },
            author: {
                "@type": "Organization",
                name: "Equipe Dudit",
                url: "https://dudit.com.br",
            },
        })

        // Parse FAQs if present
        const parsedFaqs = parseFaqFromMarkdown(article.content)
        if (parsedFaqs.length > 0) {
            jsonLdElements.push({
                "@context": "https://schema.org",
                "@type": "FAQPage",
                mainEntity: parsedFaqs.map(faq => ({
                    "@type": "Question",
                    name: faq.q,
                    acceptedAnswer: {
                        "@type": "Answer",
                        text: faq.a,
                    },
                })),
            })
        }
    }

    return (
        <>
            {jsonLdElements.map((schema, idx) => (
                <script
                    key={idx}
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(schema) }}
                />
            ))}

            <HelpCenterLayout
                toc={!isHome && article ? <HelpTOC content={article.content} article={article} /> : null}
            >
                {isHome ? (
                    <HelpHome />
                ) : (
                    article && <HelpContent article={article} />
                )}
            </HelpCenterLayout>
        </>
    )
}
