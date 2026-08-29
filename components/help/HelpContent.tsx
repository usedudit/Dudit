"use client"

import React, { useState } from "react"
import { HelpArticle, helpCategories } from "@/lib/help-data"
import { ChevronRightIcon, CopyIcon, CheckCircleIcon } from "@/lib/icons"
import { Badge, InfoCard, Button, DefaultModal, FormTextarea } from "@/components/reusable"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { submitFeedbackAction } from "@/app/actions/feedback"
import { getClientFeedbackContext } from "@/lib/utils/client-feedback-context"
import { Check } from "lucide-react"

const HELP_EMOJIS = [
    { sentiment: "positive" as const, emoji: "😊", label: "Útil" },
    { sentiment: "neutral" as const, emoji: "😐", label: "Mais ou menos" },
    { sentiment: "negative" as const, emoji: "🙁", label: "Não ajudou" },
]

export default function HelpContent({ article }: { article: HelpArticle }) {
    const [copied, setCopied] = useState(false)
    const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false)
    const [selectedSentiment, setSelectedSentiment] = useState<"positive" | "neutral" | "negative">("positive")
    const [commentText, setCommentText] = useState("")
    const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false)
    const [submittedSentiment, setSubmittedSentiment] = useState<string | null>(null)
    const [feedbackAuthError, setFeedbackAuthError] = useState(false)
    const router = useRouter()

    const handleCopyLink = () => {
        if (typeof window !== "undefined") {
            navigator.clipboard.writeText(window.location.href)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        }
    }

    const handleEmojiClick = (sentiment: "positive" | "neutral" | "negative") => {
        setFeedbackAuthError(false)
        setSelectedSentiment(sentiment)
        setCommentText("")
        setIsFeedbackModalOpen(true)
    }

    const handleSendFeedback = async (withComment: boolean) => {
        setFeedbackAuthError(false)
        setIsSubmittingFeedback(true)

        try {
            const clientContext = getClientFeedbackContext()
            const sentimentLabel =
                selectedSentiment === "positive"
                    ? "Positivo"
                    : selectedSentiment === "neutral"
                        ? "Neutro"
                        : "Negativo"

            const comment = withComment ? commentText.trim() : ""
            const message = comment
                ? `Artigo ("${article.title}") [${sentimentLabel}]: ${comment}`
                : `Artigo avaliado como ${sentimentLabel}: "${article.title}"`

            const res = await submitFeedbackAction({
                type: "help_article",
                sentiment: selectedSentiment,
                message,
                pageUrl: clientContext.pageUrl,
                metadata: {
                    browser: clientContext.browser,
                    screen: clientContext.screen,
                    app_area: "Central de Ajuda",
                    article_id: article.id,
                    article_title: article.title,
                    article_category: article.category,
                },
            })

            if (res.success) {
                setSubmittedSentiment(selectedSentiment)
                setIsFeedbackModalOpen(false)
            } else if (res.error?.includes("autenticado")) {
                setFeedbackAuthError(true)
                setIsFeedbackModalOpen(false)
            }
        } catch {
            // Silently handle
        } finally {
            setIsSubmittingFeedback(false)
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
            if (!text) return ""
            // Handle Bold: **text**
            const parts = text.split(/(\*\*.*?\*\*)/g)
            return parts.map((part, i) => {
                if (part.startsWith("**") && part.endsWith("**")) {
                    const content = part.slice(2, -2)
                    return <strong key={i} className="font-extrabold text-brand-dark dark:text-dark-heading">{content}</strong>
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
                const cleanRows = tableRows.filter(row => {
                    const isSeparator = row.every(cell => /^[ \-:|]*$/.test(cell.trim()) && cell.includes("---"))
                    return !isSeparator
                })

                elements.push(
                    <div key={`table-wrapper-${key}`} className="overflow-x-auto mb-8 border border-brand-border dark:border-dark-border rounded-xl">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-brand-gray dark:bg-dark-border/50 border-b border-brand-border dark:border-dark-border">
                                <tr>
                                    {cleanRows[0].map((cell, i) => (
                                        <th key={i} className="px-6 py-4 font-bold text-brand-dark dark:text-dark-heading">{cell.trim()}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-brand-border dark:divide-dark-border">
                                {cleanRows.slice(1).map((row, ri) => (
                                    <tr key={ri} className="hover:bg-brand-gray dark:hover:bg-dark-border/50 transition-colors">
                                        {row.map((cell, ci) => (
                                            <td key={ci} className="px-6 py-4 text-gray-600 dark:text-dark-body">
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
                    <div key={i} className="mb-8 rounded-xl overflow-hidden border border-brand-border dark:border-dark-border bg-gray-50 dark:bg-dark-surface">
                        <img src={url} alt={alt} className="w-full h-auto block dark:opacity-90" />
                        {alt && <div className="px-4 py-2 bg-white dark:bg-dark-surface text-sm text-brand-inactive-text dark:text-dark-body font-medium border-t border-gray-100 dark:border-dark-border text-center uppercase tracking-wider">{alt}</div>}
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
                    elements.push(<h2 id={id} key={i} className="text-2xl font-bold text-brand-dark dark:text-dark-heading mt-12 mb-6 scroll-mt-24">{text}</h2>)
                } else {
                    elements.push(<h3 id={id} key={i} className="text-xl font-bold text-brand-dark dark:text-dark-heading mt-8 mb-4 scroll-mt-24">{text}</h3>)
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
            <nav className="flex items-center gap-2 text-xs font-medium text-brand-text-inactive dark:text-dark-body mb-8 overflow-x-auto whitespace-nowrap scrollbar-hide">
                <span>Central de Ajuda</span>
                <ChevronRightIcon size={12} />
                <span className="capitalize">{article.category.replace("-", " ")}</span>
                <ChevronRightIcon size={12} />
                <span className="text-brand-dark dark:text-dark-heading font-bold">{article.title}</span>
            </nav>

            {/* Header */}
            <header className="mb-12">
                <div className="flex items-center gap-3 mb-6">
                    {(() => {
                        const catName = article.category.replace(/-/g, " ");
                        const formattedCat = catName.charAt(0).toUpperCase() + catName.slice(1);
                        const categoryData = helpCategories.find(c => c.id === article.category);
                        const catIcon = categoryData?.icon || (
                            article.category === "login-registro" ? "🔐" :
                                article.category === "pedidos" ? "📦" :
                                    article.category === "vendas" ? "🛒" :
                                        article.category === "financeiro" ? "💰" :
                                            article.category === "produtos-estoque" ? "📦" :
                                                article.category === "servicos" ? "🛠️" :
                                                    article.category === "clientes" ? "👥" :
                                                        article.category === "marketing" ? "📣" : "📁"
                        );
                        return (
                            <Badge variant="green" icon={null} className="px-3">
                                {catIcon} {formattedCat}
                            </Badge>
                        );
                    })()}



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

            {/* Isto foi útil? */}
            <div className="mt-12 pt-8 border-t border-brand-border dark:border-dark-border">
                <h3 className="text-base font-medium text-gray-700 dark:text-dark-heading mb-3">
                    Isto foi útil?
                </h3>

                {submittedSentiment ? (
                    <div className="flex items-center gap-2 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 px-3.5 py-2 rounded-xl w-fit">
                        <Check className="w-4 h-4" />
                        <span>Obrigado pelo seu feedback!</span>
                    </div>
                ) : (
                    <div className="flex items-center gap-3">
                        {HELP_EMOJIS.map((item) => (
                            <button
                                key={item.sentiment}
                                type="button"
                                onClick={() => handleEmojiClick(item.sentiment)}
                                className="w-11 h-11 rounded-full border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface hover:bg-gray-50 dark:hover:bg-dark-border/50 flex items-center justify-center text-xl transition-all duration-200 hover:scale-110 active:scale-95 shadow-sm hover:shadow"
                                title={item.label}
                                aria-label={item.label}
                            >
                                <span>{item.emoji}</span>
                            </button>
                        ))}
                    </div>
                )}

                {feedbackAuthError && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                        Você precisa estar autenticado para enviar feedback. <Link href={`/auth/login?redirect=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname : "/ajuda")}`} className="underline font-semibold">Entrar na conta</Link>
                    </p>
                )}
            </div>

            {/* Footer Navigation */}
            <div className="mt-20 pt-10 border-t border-brand-border dark:border-dark-border flex justify-between items-center gap-4">
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

            <DefaultModal
                isOpen={isFeedbackModalOpen}
                onClose={() => setIsFeedbackModalOpen(false)}
                title="Isto foi útil?"
                maxWidth="sm"
                footer={
                    <div className="flex items-center justify-end">
                        <Button
                            variant="outline"
                            onClick={() => handleSendFeedback(false)}
                            disabled={isSubmittingFeedback}
                        >
                            Apenas enviar
                        </Button>
                        <Button
                            onClick={() => handleSendFeedback(true)}
                            disabled={isSubmittingFeedback}
                        >
                            {isSubmittingFeedback ? "Enviando..." : "Enviar comentário"}
                        </Button>
                    </div>
                }
            >
                <div className="space-y-4 pt-1">
                    {/* Emojis selection row */}
                    <div className="flex items-center justify-center gap-4 py-2">
                        {HELP_EMOJIS.map((item) => {
                            const isSelected = selectedSentiment === item.sentiment
                            return (
                                <button
                                    key={item.sentiment}
                                    type="button"
                                    onClick={() => setSelectedSentiment(item.sentiment)}
                                    className={`w-12 h-12 rounded-full border flex items-center justify-center text-2xl transition-all ${isSelected
                                        ? "border-brand-primary bg-brand-primary/10 ring-2 ring-brand-primary scale-110"
                                        : "border-brand-border dark:border-dark-border bg-gray-50/50 dark:bg-dark-surface opacity-60 hover:opacity-100 hover:scale-105"
                                        }`}
                                    title={item.label}
                                >
                                    <span>{item.emoji}</span>
                                </button>
                            )
                        })}
                    </div>

                    <p className="text-xs text-center text-brand-inactive-text dark:text-dark-body">
                        {selectedSentiment === "positive"
                            ? "Que bom que ajudou! Quer deixar algum comentário ou sugestão?"
                            : selectedSentiment === "neutral"
                                ? "O que achou confuso ou o que poderíamos detalhar melhor?"
                                : "Sentimos muito. O que faltou ou não funcionou para você?"}
                    </p>

                    {/* Textarea */}
                    <div>
                        <FormTextarea
                            label="Quer escrever algo a mais? (opcional)"
                            placeholder="Escreva seu comentário aqui se desejar..."
                            value={commentText}
                            onChange={(e: any) => setCommentText(e.target.value)}
                            maxLength={1000}
                            showCharacterCount
                            className="min-h-[85px] text-xs"
                        />
                    </div>
                </div>
            </DefaultModal>
        </div>
    )
}
