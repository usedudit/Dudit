"use client"

import React, { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { TextFirstlineRightIcon } from "@/lib/icons"
import { HelpArticle } from "@/lib/help-data"
import { Button, DefaultModal, FormTextarea } from "@/components/reusable"
import { submitFeedbackAction } from "@/app/actions/feedback"
import { getClientFeedbackContext } from "@/lib/utils/client-feedback-context"
import { Check } from "lucide-react"
import Link from "next/link"

interface TOCItem {
    id: string
    text: string
    level: number
}

const HELP_EMOJIS = [
    { sentiment: "positive" as const, emoji: "😊", label: "Útil" },
    { sentiment: "neutral" as const, emoji: "😐", label: "Mais ou menos" },
    { sentiment: "negative" as const, emoji: "🙁", label: "Não ajudou" },
]

export default function HelpTOC({ content, article }: { content: string; article: HelpArticle }) {
    const [items, setItems] = useState<TOCItem[]>([])
    const [activeId, setActiveId] = useState<string>("")

    const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false)
    const [selectedSentiment, setSelectedSentiment] = useState<"positive" | "neutral" | "negative">("positive")
    const [commentText, setCommentText] = useState("")
    const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false)
    const [submittedSentiment, setSubmittedSentiment] = useState<string | null>(null)
    const [feedbackAuthError, setFeedbackAuthError] = useState(false)

    useEffect(() => {
        const headingLines = content.split("\n").filter(line => line.startsWith("## ") || line.startsWith("### "))

        const tocItems = headingLines.map(line => {
            const level = line.startsWith("### ") ? 3 : 2
            const text = line.replace(/^#{2,3} /, "").trim()
            const id = text.toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-")
            return { id, text, level }
        })

        setItems(tocItems)
    }, [content])

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        setActiveId(entry.target.id)
                    }
                })
            },
            { rootMargin: "0% 0% -80% 0%" }
        )

        items.forEach((item) => {
            const element = document.getElementById(item.id)
            if (element) observer.observe(element)
        })

        return () => observer.disconnect()
    }, [items])

    if (items.length === 0) return null

    const scrollTo = (id: string) => {
        const element = document.getElementById(id)
        if (element) {
            const offset = 100
            const bodyRect = document.body.getBoundingClientRect().top
            const elementRect = element.getBoundingClientRect().top
            const elementPosition = elementRect - bodyRect
            const offsetPosition = elementPosition - offset

            window.scrollTo({
                top: offsetPosition,
                behavior: "smooth"
            })
        }
    }

    const handleEmojiClick = (sentiment: "positive" | "neutral" | "negative") => {
        setFeedbackAuthError(false)
        setSelectedSentiment(sentiment)
        setCommentText("")
        setIsFeedbackModalOpen(true)
    }

    const handleSendFeedback = async () => {
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

            const comment = commentText.trim()
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

    return (
        <aside className="hidden xl:block w-64 shrink-0 py-8 px-6 sticky top-[72px] h-[calc(100vh-72px)] overflow-y-auto custom-scrollbar">
            <h4 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-4 flex items-center gap-2">
                <TextFirstlineRightIcon className="h-4 w-4" />
                Nesta página
            </h4>

            <ul className="space-y-1">
                {items.map((item) => {
                    const isActive = activeId === item.id
                    return (
                        <li
                            key={item.id}
                            style={{ paddingLeft: item.level === 3 ? "0.75rem" : "0" }}
                        >
                            <button
                                onClick={() => scrollTo(item.id)}
                                className={cn(
                                    "w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13px] transition-all cursor-pointer text-left group relative",
                                    isActive
                                        ? "bg-brand-green/10 text-brand-green font-semibold"
                                        : "text-brand-inactive-text dark:text-dark-body hover:bg-brand-gray dark:hover:bg-dark-border/40 hover:text-brand-dark dark:hover:text-dark-heading"
                                )}
                            >
                                {isActive && (
                                    <div className="bg-brand-green w-1 rounded-full self-stretch shrink-0 min-h-5" />
                                )}
                                <span className="truncate">{item.text}</span>
                            </button>
                        </li>
                    )
                })}
            </ul>

            <div className="mt-10 pt-8 border-t border-gray-100 dark:border-dark-border">
                <p className="text-[13px] text-gray-500 dark:text-dark-body mb-4">Isto foi útil?</p>

                {submittedSentiment ? (
                    <div className="flex items-center gap-2 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 px-3 py-2 rounded-xl">
                        <Check className="w-4 h-4" />
                        <span>Obrigado!</span>
                    </div>
                ) : (
                    <div className="flex gap-2">
                        {HELP_EMOJIS.map((item) => (
                            <button
                                key={item.sentiment}
                                onClick={() => handleEmojiClick(item.sentiment)}
                                className="w-10 h-10 rounded-full border border-gray-100 dark:border-dark-border flex items-center justify-center hover:bg-gray-50 dark:hover:bg-dark-surface transition-all hover:scale-110 active:scale-95 text-xl"
                                title={item.label}
                                aria-label={item.label}
                            >
                                {item.emoji}
                            </button>
                        ))}
                    </div>
                )}

                {feedbackAuthError && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-2">
                        <Link href={`/auth/login?redirect=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname : "/ajuda")}`} className="underline font-semibold">Entrar na conta</Link> para enviar feedback.
                    </p>
                )}
            </div>

            <DefaultModal
                isOpen={isFeedbackModalOpen}
                onClose={() => setIsFeedbackModalOpen(false)}
                title="Isto foi útil?"
                maxWidth="sm"
                footer={
                    <div className="flex items-center justify-end">
                        <Button
                            onClick={handleSendFeedback}
                            disabled={isSubmittingFeedback}
                        >
                            {isSubmittingFeedback ? "Enviando..." : "Enviar"}
                        </Button>
                    </div>
                }
            >
                <div className="space-y-4 pt-1">
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

                    <div>
                        <FormTextarea
                            label="Comentário (opcional)"
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
        </aside>
    )
}