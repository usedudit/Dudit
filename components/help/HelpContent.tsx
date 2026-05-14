"use client"

import React, { useState } from "react"
import { HelpArticle, helpCategories } from "@/lib/help-data"
import { ChevronRightIcon, CopyIcon, CheckCircleIcon } from "@/lib/icons"
import { Badge, InfoCard, Button } from "@/components/reusable"
import Link from "next/link"
import { useRouter } from "next/navigation"

export default function HelpContent({ article }: { article: HelpArticle }) {
    const [copied, setCopied] = useState(false)
    const router = useRouter()

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

    // Improved custom parser for markdown-like content
    const renderMarkdown = (content: string) => {
        const lines = content.split("\n")
        const elements: React.ReactNode[] = []
        let currentList: React.ReactNode[] = []
        let inTable = false
        let tableRows: string[][] = []

        const parseInline = (text: string) => {
            // Handle Bold: **text**
            const parts = text.split(/(\*\*.*?\*\*)/g)
            return parts.map((part, i) => {
                if (part.startsWith("**") && part.endsWith("**")) {
                    return <strong key={i} className="font-bold text-brand-dark dark:text-dark-heading">{part.slice(2, -2)}</strong>
                }
                return part
            })
        }

        const flushList = (key: number) => {
            if (currentList.length > 0) {
                elements.push(<ul key={`list-${key}`} className="list-disc pl-6 mb-6 space-y-2 text-gray-700 dark:text-dark-body">{currentList}</ul>)
                currentList = []
            }
        }

        const flushTable = (key: number) => {
            if (inTable && tableRows.length > 0) {
                // Filter out separator rows like | :--- | :--- |
                const cleanRows = tableRows.filter(row => !row.some(cell => cell.includes("---")))

                elements.push(
                    <div key={`table-wrapper-${key}`} className="overflow-x-auto mb-8 border border-gray-100 dark:border-dark-border rounded-xl">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 dark:bg-dark-surface border-b border-gray-100 dark:border-dark-border">
                                <tr>
                                    {cleanRows[0].map((cell, i) => (
                                        <th key={i} className="px-6 py-4 font-bold text-gray-900 dark:text-dark-heading">{cell.trim()}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 dark:divide-dark-border">
                                {cleanRows.slice(1).map((row, ri) => (
                                    <tr key={ri} className="hover:bg-gray-50/50 dark:hover:bg-dark-surface/50 transition-colors">
                                        {row.map((cell, ci) => (
                                            <td key={ci} className="px-6 py-4 text-gray-600 dark:text-dark-body leading-relaxed">
                                                {parseInline(cell.trim())}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )
                tableRows = []
                inTable = false
            }
        }

        lines.forEach((line, i) => {
            const trimmedLine = line.trim()

            // Images: ![alt](url)
            if (trimmedLine.startsWith("![") && trimmedLine.includes("](")) {
                flushList(i)
                flushTable(i)
                const alt = trimmedLine.match(/\[(.*?)\]/)?.[1] || ""
                const url = trimmedLine.match(/\((.*?)\)/)?.[1] || ""
                elements.push(
                    <div key={i} className="mb-8 rounded-xl overflow-hidden border border-gray-100 dark:border-dark-border shadow-sm bg-gray-50 dark:bg-dark-surface">
                        <img src={url} alt={alt} className="w-full h-auto block dark:opacity-90" />
                        {alt && <div className="px-4 py-2 bg-white dark:bg-dark-surface text-[11px] text-gray-400 dark:text-dark-body font-medium border-t border-gray-100 dark:border-dark-border text-center uppercase tracking-wider">{alt}</div>}
                    </div>
                )
            }
            // Headings
            else if (trimmedLine.startsWith("## ") || trimmedLine.startsWith("### ")) {
                flushList(i)
                flushTable(i)
                const level = trimmedLine.startsWith("### ") ? 3 : 2
                const text = trimmedLine.replace(/^#{2,3} /, "")
                const id = text.toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-")

                if (level === 2) {
                    elements.push(<h2 id={id} key={i} className="text-2xl font-bold text-gray-900 dark:text-dark-heading mt-12 mb-6 scroll-mt-24">{text}</h2>)
                } else {
                    elements.push(<h3 id={id} key={i} className="text-xl font-bold text-gray-900 dark:text-dark-heading mt-8 mb-4 scroll-mt-24">{text}</h3>)
                }
            }
            // Lists
            else if (trimmedLine.startsWith("* ") || trimmedLine.startsWith("- ") || /^\d+\./.test(trimmedLine)) {
                flushTable(i)
                const text = trimmedLine.replace(/^(\*|-|\d+\.) /, "")
                currentList.push(<li key={i} className="leading-relaxed">{parseInline(text)}</li>)
            }
            // Tables
            else if (trimmedLine.startsWith("|")) {
                flushList(i)
                inTable = true
                const cells = trimmedLine.split("|").map(c => c.trim()).filter((c, idx, arr) => {
                    if (idx === 0 && c === "") return false
                    if (idx === arr.length - 1 && c === "") return false
                    return true
                })
                if (cells.length > 0) tableRows.push(cells)
            }
            // Alerts / Callouts using InfoCard
            else if (trimmedLine.startsWith("> [!")) {
                flushList(i)
                flushTable(i)
                const type = trimmedLine.includes("TIP") ? "TIP" : trimmedLine.includes("IMPORTANT") ? "IMPORTANT" : "NOTE"
                const nextLine = lines[i + 1]?.trim() || ""

                elements.push(
                    <div key={i} className="mb-8">
                        <InfoCard
                            color={type === "TIP" ? "green" : type === "IMPORTANT" ? "red" : "blue"}
                            title={type === "TIP" ? "Dica" : type === "IMPORTANT" ? "Importante" : "Nota"}
                            message={parseInline(nextLine)}
                        />
                    </div>
                )
                lines[i + 1] = ""
            }
            // Paragraphs
            else if (trimmedLine !== "" && !trimmedLine.includes("---")) {
                flushList(i)
                flushTable(i)
                elements.push(<p key={i} className="text-gray-600 dark:text-dark-body leading-relaxed mb-6 text-[15px]">{parseInline(trimmedLine)}</p>)
            }
            else if (trimmedLine === "") {
                flushList(i)
                flushTable(i)
            }
        })

        flushList(lines.length)
        flushTable(lines.length)
        return elements
    }

    return (
        <div className="max-w-3xl mx-auto py-8 lg:py-12 px-6 lg:px-12">
            {/* Breadcrumbs */}
            <nav className="flex items-center gap-2 text-xs font-medium text-gray-400 dark:text-dark-body mb-8 overflow-x-auto whitespace-nowrap scrollbar-hide">
                <span>Central de Ajuda</span>
                <ChevronRightIcon size={12} />
                <span className="capitalize">{article.category.replace("-", " ")}</span>
                <ChevronRightIcon size={12} />
                <span className="text-gray-900 dark:text-dark-heading font-bold">{article.title}</span>
            </nav>

            {/* Header */}
            <header className="mb-12">
                <div className="flex items-center gap-3 mb-6">
                    <Badge variant="green" icon={null} className="px-3">
                        🚀 {article.category.replace("-", " ")}
                    </Badge>

                    <Button
                        variant="filled"
                        className="ml-auto text-xs h-9 px-4 rounded-lg dark:bg-brand-green dark:text-white"
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
                <h1 className="text-4xl lg:text-5xl font-black text-gray-900 dark:text-dark-heading mb-4 tracking-tight leading-tight">
                    {article.title}
                </h1>
                {article.description && (
                    <p className="text-xl text-gray-500 dark:text-dark-body font-medium leading-relaxed">
                        {article.description}
                    </p>
                )}
            </header>

            {/* Content Area */}
            <article className="prose prose-slate dark:prose-invert max-w-none">
                {renderMarkdown(article.content)}
            </article>

            {/* Footer Navigation */}
            <div className="mt-20 pt-10 border-t border-gray-100 dark:border-dark-border flex justify-between items-center gap-4">
                {prevArticle ? (
                    <Link
                        href={`/ajuda/${prevArticle.category}/${prevArticle.slug}`}
                        className="flex flex-col gap-1 group max-w-[45%]"
                    >
                        <span className="text-[10px] font-bold text-gray-400 dark:text-dark-body uppercase tracking-widest">Anterior</span>
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
                        <span className="text-[10px] font-bold text-gray-400 dark:text-dark-body uppercase tracking-widest">Próximo</span>
                        <span className="text-sm font-bold text-brand-green group-hover:underline truncate">
                            {nextArticle.title}
                        </span>
                    </Link>
                ) : <div />}
            </div>
        </div>
    )
}
