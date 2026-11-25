"use client"

import React, { useState } from "react"
import { HelpArticle, helpCategories } from "@/lib/help-data"
import { ChevronRightIcon, CopyIcon, CheckCircleIcon } from "@/lib/icons"
import { Badge, InfoCard, Button } from "@/components/reusable"
import Link from "next/link"

const linkClass =
    "text-brand-green font-semibold underline underline-offset-2 hover:opacity-80 break-words"

/** Converte negrito, itálico, código e links em elementos clicáveis. */
function parseInline(text: string): React.ReactNode {
    if (!text) return ""

    const pattern =
        /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(\[[^\]\n]+\]\([^)\n]+\))|(https?:\/\/[^\s<>()"]+)/g

    const nodes: React.ReactNode[] = []
    let lastIndex = 0
    let key = 0
    let match: RegExpExecArray | null

    while ((match = pattern.exec(text)) !== null) {
        if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index))
        const token = match[0]

        if (token.startsWith("`")) {
            nodes.push(
                <code
                    key={key++}
                    className="px-1.5 py-0.5 rounded-md bg-brand-gray dark:bg-dark-border text-[13px] font-mono text-brand-dark dark:text-dark-heading"
                >
                    {token.slice(1, -1)}
                </code>
            )
        } else if (token.startsWith("**")) {
            nodes.push(
                <strong key={key++} className="font-extrabold text-brand-dark dark:text-dark-heading">
                    {parseInline(token.slice(2, -2))}
                </strong>
            )
        } else if (token.startsWith("*")) {
            nodes.push(<em key={key++}>{parseInline(token.slice(1, -1))}</em>)
        } else if (token.startsWith("[")) {
            const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
            if (link) {
                const [, label, href] = link
                nodes.push(
                    href.startsWith("/") ? (
                        <Link key={key++} href={href} className={linkClass}>
                            {label}
                        </Link>
                    ) : (
                        <a key={key++} href={href} target="_blank" rel="noopener noreferrer" className={linkClass}>
                            {label}
                        </a>
                    )
                )
            } else {
                nodes.push(token)
            }
        } else {
            const trailing = token.match(/[.,;:!?]+$/)
            const url = trailing ? token.slice(0, -trailing[0].length) : token
            nodes.push(
                <a key={key++} href={url} target="_blank" rel="noopener noreferrer" className={linkClass}>
                    {url}
                </a>
            )
            if (trailing) nodes.push(trailing[0])
        }

        lastIndex = match.index + token.length
    }

    if (lastIndex < text.length) nodes.push(text.slice(lastIndex))
    return nodes
}

/** Imagem do artigo. Se a imagem não existir mais, ela simplesmente não aparece. */
function HelpImage({ src, alt, caption }: { src: string; alt: string; caption?: string }) {
    const [failed, setFailed] = useState(false)

    if (failed) return null

    return (
        <figure className="mb-8 rounded-xl overflow-hidden border border-brand-border dark:border-dark-border bg-gray-50 dark:bg-dark-surface">
            <img
                src={src}
                alt={alt}
                loading="lazy"
                onError={() => setFailed(true)}
                className="w-full h-auto block dark:opacity-90"
            />
            {(caption || alt) && (
                <figcaption className="px-4 py-2 bg-white dark:bg-dark-surface text-sm text-brand-inactive-text dark:text-dark-body font-medium border-t border-gray-100 dark:border-dark-border text-center">
                    {caption || alt}
                </figcaption>
            )}
        </figure>
    )
}

export default function HelpContent({ article }: { article: HelpArticle }) {
    const [copied, setCopied] = useState(false)

    const handleCopyLink = () => {
        if (typeof window !== "undefined") {
            navigator.clipboard.writeText(window.location.href)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        }
    }

    // Flat list of articles for prev/next
    const allArticles = helpCategories.flatMap(cat => cat.articles)
    const currentIndex = allArticles.findIndex(a => a.id === article.id)
    const prevArticle = currentIndex > 0 ? allArticles[currentIndex - 1] : null
    const nextArticle = currentIndex < allArticles.length - 1 ? allArticles[currentIndex + 1] : null

    const categoryData = helpCategories.find(c => c.id === article.category)
    const catIcon = categoryData?.icon || "📁"
    const catTitle = categoryData?.title || article.category.replace(/-/g, " ")

    const renderMarkdown = (content: string) => {
        const lines = content.split(/\r?\n/)
        const elements: React.ReactNode[] = []
        let listType: "ul" | "ol" | null = null
        let listItems: string[] = []
        let tableRows: string[][] = []
        let key = 0

        const flushList = () => {
            if (!listType || listItems.length === 0) {
                listType = null
                listItems = []
                return
            }
            const items = listItems.map((item, idx) => (
                <li key={idx} className="leading-relaxed">{parseInline(item)}</li>
            ))
            elements.push(
                listType === "ol" ? (
                    <ol key={`list-${key++}`} className="list-decimal pl-6 mb-6 space-y-2 text-gray-700 dark:text-dark-body">{items}</ol>
                ) : (
                    <ul key={`list-${key++}`} className="list-disc pl-6 mb-6 space-y-2 text-gray-700 dark:text-dark-body">{items}</ul>
                )
            )
            listType = null
            listItems = []
        }

        const flushTable = () => {
            if (tableRows.length === 0) return

            // Remove as linhas separadoras do markdown (|---|---|)
            const cleanRows = tableRows.filter(row => {
                const isSeparator = row.every(cell => /^[ \-:|]*$/.test(cell.trim()) && cell.includes("---"))
                return !isSeparator
            })

            if (cleanRows.length === 0) {
                tableRows = []
                return
            }

            const [head, ...body] = cleanRows

            elements.push(
                <div key={`table-${key++}`} className="overflow-x-auto mb-8 border border-brand-border dark:border-dark-border rounded-xl">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-brand-gray dark:bg-dark-border/50 border-b border-brand-border dark:border-dark-border">
                            <tr>
                                {head.map((cell, ci) => (
                                    <th key={ci} className="px-6 py-4 font-bold text-brand-dark dark:text-dark-heading">{parseInline(cell.trim())}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-brand-border dark:divide-dark-border">
                            {body.map((row, ri) => (
                                <tr key={ri} className="hover:bg-brand-gray dark:hover:bg-dark-border/50 transition-colors">
                                    {row.map((cell, ci) => (
                                        <td key={ci} className="px-6 py-4 text-gray-600 dark:text-dark-body">{parseInline(cell.trim())}</td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )
            tableRows = []
        }

        let i = 0
        while (i < lines.length) {
            const line = lines[i].trim()

            if (line === "") {
                flushList()
                flushTable()
                i++
                continue
            }

            // Linha divisória
            if (/^-{3,}$/.test(line) || /^\*{3,}$/.test(line)) {
                flushList()
                flushTable()
                elements.push(<hr key={`hr-${key++}`} className="my-10 border-t border-brand-border dark:border-dark-border" />)
                i++
                continue
            }

            // Caixa de destaque (Dica / Importante / Nota) — pode ocupar várias linhas
            if (line.startsWith(">")) {
                flushList()
                flushTable()

                const block: string[] = []
                while (i < lines.length && lines[i].trim().startsWith(">")) {
                    block.push(lines[i].trim().replace(/^>\s?/, ""))
                    i++
                }

                let type: "TIP" | "IMPORTANT" | "NOTE" = "NOTE"
                let body = block
                const head = block[0] ?? ""
                const alert = head.match(/^\[!(\w+)\]/)

                if (alert) {
                    const raw = alert[1].toUpperCase()
                    type = raw === "TIP" ? "TIP" : ["IMPORTANT", "WARNING", "CAUTION"].includes(raw) ? "IMPORTANT" : "NOTE"
                    body = [head.replace(/^\[!\w+\]\s*/, ""), ...block.slice(1)]
                }

                body = body.map(item => item.trim()).filter(item => item !== "")

                elements.push(
                    <div key={`callout-${key++}`} className="mb-8">
                        <InfoCard
                            color={type === "TIP" ? "green" : type === "IMPORTANT" ? "red" : "blue"}
                            title={type === "TIP" ? "Dica" : type === "IMPORTANT" ? "Importante" : "Nota"}
                            message={parseInline(body.join(" "))}
                        />
                    </div>
                )
                continue
            }

            // Imagem (com legenda opcional na linha seguinte)
            const imageMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/)
            if (imageMatch) {
                flushList()
                flushTable()

                const [, alt, src] = imageMatch
                let caption: string | undefined
                let next = i + 1
                while (next < lines.length && lines[next].trim() === "") next++

                if (next < lines.length && /^Legenda:/i.test(lines[next].trim())) {
                    caption = lines[next].trim().replace(/^Legenda:\s*/i, "")
                    i = next + 1
                } else {
                    i++
                }

                elements.push(<HelpImage key={`img-${key++}`} src={src} alt={alt} caption={caption} />)
                continue
            }

            // Títulos
            const headingMatch = line.match(/^(#{1,4})\s+(.*)$/)
            if (headingMatch) {
                flushList()
                flushTable()

                const level = headingMatch[1].length
                const text = headingMatch[2].trim()
                const id = text.toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-")

                if (level <= 2) {
                    elements.push(
                        <h2 id={id} key={`h-${key++}`} className="text-md lg:text-xl font-medium text-brand-dark dark:text-dark-heading mt-12 mb-6 scroll-mt-24">
                            {parseInline(text)}
                        </h2>
                    )
                } else if (level === 3) {
                    elements.push(
                        <h3 id={id} key={`h-${key++}`} className="text-md font-medium text-brand-dark dark:text-dark-heading mt-8 mb-4 scroll-mt-24">
                            {parseInline(text)}
                        </h3>
                    )
                } else {
                    elements.push(
                        <h4 id={id} key={`h-${key++}`} className="text-[15px] font-semibold text-brand-dark dark:text-dark-heading mt-6 mb-3 scroll-mt-24">
                            {parseInline(text)}
                        </h4>
                    )
                }
                i++
                continue
            }

            // Listas numeradas e com marcadores
            const orderedMatch = line.match(/^(\d+)[.)]\s+(.*)$/)
            const bulletMatch = line.match(/^[-*+]\s+(.*)$/)
            if (orderedMatch || bulletMatch) {
                flushTable()

                const type: "ul" | "ol" = orderedMatch ? "ol" : "ul"
                if (listType && listType !== type) flushList()

                listType = type
                listItems.push(orderedMatch ? orderedMatch[2] : (bulletMatch as RegExpMatchArray)[1])
                i++
                continue
            }

            // Tabelas
            if (line.startsWith("|")) {
                flushList()

                const cells = line.split("|").map(cell => cell.trim())
                if (cells[0] === "") cells.shift()
                if (cells[cells.length - 1] === "") cells.pop()
                if (cells.length > 0) tableRows.push(cells)

                i++
                continue
            }

            // Parágrafo
            flushList()
            flushTable()
            elements.push(
                <p key={`p-${key++}`} className="text-gray-600 dark:text-dark-body leading-relaxed mb-6 text-[15px]">
                    {parseInline(line)}
                </p>
            )
            i++
        }

        flushList()
        flushTable()
        return elements
    }

    return (
        <div className="max-w-3xl mx-auto py-8 lg:py-12 px-6 lg:px-12">
            {/* Breadcrumbs */}
            <nav className="flex items-center gap-2 text-xs font-medium text-brand-text-inactive dark:text-dark-body mb-8 overflow-x-auto whitespace-nowrap scrollbar-hide">
                <Link href="/ajuda" className="hover:text-brand-green transition-colors">Central de Ajuda</Link>
                <ChevronRightIcon size={12} />
                <span>{catTitle}</span>
                <ChevronRightIcon size={12} />
                <span className="text-brand-dark dark:text-dark-heading font-bold">{article.title}</span>
            </nav>

            {/* Header */}
            <header className="mb-12">
                <div className="flex items-center gap-3 mb-6">
                    <Badge variant="green" icon={null} className="px-3">
                        {catIcon} {catTitle}
                    </Badge>

                    <Button
                        variant="filled"
                        className="ml-auto text-xs h-9 px-4"
                        onClick={handleCopyLink}
                    >
                        {copied ? (
                            <div className="flex items-center gap-2">
                                <CheckCircleIcon size={14} />
                                Link copiado!
                            </div>
                        ) : (
                            <div className="flex items-center gap-2">
                                <CopyIcon size={14} />
                                Copiar link
                            </div>
                        )}
                    </Button>
                </div>
                <h1 className="text-4xl font-bold text-brand-dark dark:text-dark-heading mb-4">
                    {article.title}
                </h1>
                {article.description && (
                    <p className="text-xl text-brand-text-inactive dark:text-dark-body font-medium leading-relaxed">
                        {article.description}
                    </p>
                )}
            </header>

            {/* Content Area */}
            <article className="prose prose-slate dark:prose-invert max-w-none">
                {renderMarkdown(article.content)}
            </article>

            {/* Bloco de Conversão & Links Internos para Lojistas */}
            <div className="my-14 p-6 sm:p-8 rounded-2xl bg-brand-gray/60 dark:bg-dark-border/30 border border-brand-border dark:border-dark-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
                <div className="space-y-1 max-w-xl">
                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">
                        Pronto para organizar seu negócio na prática?
                    </h3>
                    <p className="text-sm text-brand-inactive-text dark:text-dark-body leading-relaxed">
                        Crie sua vitrine online, controle estoque, gerencie pedidos no PDV e venda com 0% de comissão na Dudit.
                    </p>
                </div>
                <div className="flex items-center gap-3 shrink-0 w-full sm:w-auto">
                    <Button asChild variant="default" className="w-full sm:w-auto">
                        <Link href="/auth/login?mode=partner">Começar grátis</Link>
                    </Button>
                    <Button asChild variant="outline" className="w-full sm:w-auto">
                        <Link href="/institucional/planos">Ver planos</Link>
                    </Button>
                </div>
            </div>

            {/* Footer Navigation */}
            <div className="mt-14 pt-10 border-t border-brand-border dark:border-dark-border flex justify-between items-center gap-4">
                {prevArticle ? (
                    <Link
                        href={`/ajuda/${prevArticle.category}/${prevArticle.slug}`}
                        className="flex flex-col gap-1 group max-w-[45%]"
                    >
                        <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Anterior</span>
                        <span className="text-sm font-bold text-brand-green group-hover:underline truncate">
                            {prevArticle.title}
                        </span>
                    </Link>
                ) : <div />}

                {nextArticle ? (
                    <Link
                        href={`/ajuda/${nextArticle.category}/${nextArticle.slug}`}
                        className="flex flex-col gap-1 text-right group max-w-[45%]"
                    >
                        <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Próximo</span>
                        <span className="text-sm font-bold text-brand-green group-hover:underline truncate">
                            {nextArticle.title}
                        </span>
                    </Link>
                ) : <div />}
            </div>
        </div>
    )
}
