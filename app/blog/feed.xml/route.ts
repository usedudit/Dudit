import { getPublishedBlogPosts } from "@/lib/blog/queries"
import { getBlogCategory } from "@/lib/blog/categories"

export const revalidate = 3600

const BASE_URL = "https://dudit.com.br"

function escapeXml(value: string | null | undefined): string {
    if (!value) return ""
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;")
}

export async function GET() {
    const posts = await getPublishedBlogPosts()
    const lastBuildDate = posts[0]?.published_at
        ? new Date(posts[0].published_at).toUTCString()
        : new Date().toUTCString()

    const items = posts
        .map((post) => {
            const category = getBlogCategory(post.category)
            const url = `${BASE_URL}/blog/${post.slug}`
            const description = post.excerpt || post.subtitle || post.title
            const pubDate = post.published_at ? new Date(post.published_at).toUTCString() : ""

            return `        <item>
            <title>${escapeXml(post.title)}</title>
            <link>${escapeXml(url)}</link>
            <guid isPermaLink="true">${escapeXml(url)}</guid>
            <description>${escapeXml(description)}</description>
            <category>${escapeXml(category.label)}</category>
            ${pubDate ? `<pubDate>${pubDate}</pubDate>` : ""}
        </item>`
        })
        .join("\n")

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
    <channel>
        <title>Blog do Dino — Dudit</title>
        <link>${BASE_URL}/blog</link>
        <description>Dicas práticas sobre segurança, finanças, fotos de produtos, vendas e gestão para pequenos negócios.</description>
        <language>pt-BR</language>
        <lastBuildDate>${lastBuildDate}</lastBuildDate>
        <atom:link href="${BASE_URL}/blog/feed.xml" rel="self" type="application/rss+xml" />
${items}
    </channel>
</rss>`

    return new Response(xml, {
        headers: {
            "Content-Type": "application/rss+xml; charset=utf-8",
            "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
    })
}
