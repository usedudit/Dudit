import { sanitizeRichText } from "@/lib/security/rich-text-sanitizer"
import { slugifyBlog, stripHtml } from "./utils"

export interface BlogTocItem {
    id: string
    text: string
    level: 2 | 3
}

export interface PreparedBlogContent {
    html: string
    toc: BlogTocItem[]
    wordCount: number
}

/**
 * Sanitizes editorial HTML and prepares it for public rendering.
 * - Removes unsafe markup
 * - Adds stable ids to h2/h3 so the table of contents can link to sections
 * - Returns a table of contents and word count
 */
export function prepareBlogContent(rawHtml: string | null | undefined): PreparedBlogContent {
    const safeHtml = sanitizeRichText(rawHtml)
    if (!safeHtml) return { html: "", toc: [], wordCount: 0 }

    const toc: BlogTocItem[] = []
    const usedIds = new Map<string, number>()

    const html = safeHtml.replace(/<(h2|h3)([^>]*)>([\s\S]*?)<\/\1>/gi, (match, tag: string, attrs: string, inner: string) => {
        const level = tag.toLowerCase() === "h2" ? 2 : 3
        const text = stripHtml(inner)
        if (!text) return match

        const existingIdMatch = attrs.match(/\bid\s*=\s*["']([^"']+)["']/i)
        let id = existingIdMatch?.[1] || slugifyBlog(text) || `secao-${toc.length + 1}`

        const count = usedIds.get(id) ?? 0
        usedIds.set(id, count + 1)
        if (count > 0) id = `${id}-${count + 1}`

        const attrsWithoutId = attrs.replace(/\s*\bid\s*=\s*["'][^"']*["']/i, "").trim()
        toc.push({ id, text, level })

        return `<${tag}${attrsWithoutId ? ` ${attrsWithoutId}` : ""} id="${id}">${inner}</${tag}>`
    })

    const wordCount = stripHtml(html).split(/\s+/).filter(Boolean).length

    return { html, toc, wordCount }
}
