"use client"

import React, { useState, useEffect } from "react"
import { DefaultModal, Button, FormTextarea } from "@/components/reusable"
import { submitFeedbackAction, type FeedbackType, type FeedbackSentiment } from "@/app/actions/feedback"
import { getClientFeedbackContext } from "@/lib/utils/client-feedback-context"
import { CheckCircleIcon, Sparkles, MessageSquare, AlertCircle, Heart } from "lucide-react"

interface GeneralFeedbackModalProps {
  isOpen: boolean
  onClose: () => void
  partnerId?: string | null
  partnerPlan?: string | null
  userRole?: string | null
}

type FeedbackCategoryOption = {
  id: "praise" | "suggestion" | "bug"
  label: string
  icon: React.ReactNode
  type: FeedbackType
  defaultSentiment: FeedbackSentiment
  description: string
}

const CATEGORIES: FeedbackCategoryOption[] = [
  {
    id: "praise",
    label: "Elogio",
    icon: <Heart className="w-4 h-4 text-emerald-500" />,
    type: "general",
    defaultSentiment: "positive",
    description: "Conte o que você mais gostou na plataforma",
  },
  {
    id: "suggestion",
    label: "Sugestão",
    icon: <Sparkles className="w-4 h-4 text-amber-500" />,
    type: "general",
    defaultSentiment: "neutral",
    description: "Tem uma ideia para melhorar a Dudit?",
  },
  {
    id: "bug",
    label: "Problema / Bug",
    icon: <AlertCircle className="w-4 h-4 text-red-500" />,
    type: "bug",
    defaultSentiment: "negative",
    description: "Encontrou um erro ou algo fora do lugar?",
  },
]

export function GeneralFeedbackModal({
  isOpen,
  onClose,
  partnerId,
  partnerPlan,
  userRole,
}: GeneralFeedbackModalProps) {
  const [selectedCategory, setSelectedCategory] = useState<FeedbackCategoryOption>(CATEGORIES[1]) // suggestion by default
  const [sentiment, setSentiment] = useState<FeedbackSentiment>("neutral")
  const [message, setMessage] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSuccess, setIsSuccess] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setIsSuccess(false)
      setErrorMessage(null)
      setMessage("")
      setSelectedCategory(CATEGORIES[1])
      setSentiment("neutral")
    }
  }, [isOpen])

  const handleCategorySelect = (cat: FeedbackCategoryOption) => {
    setSelectedCategory(cat)
    setSentiment(cat.defaultSentiment)
    setErrorMessage(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (message.trim().length < 3) {
      setErrorMessage("Por favor, escreva pelo menos algumas palavras para nos ajudar.")
      return
    }

    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      const clientContext = getClientFeedbackContext()

      const res = await submitFeedbackAction({
        type: selectedCategory.type,
        sentiment,
        message: message.trim(),
        pageUrl: clientContext.pageUrl,
        partnerId: partnerId || null,
        metadata: {
          browser: clientContext.browser,
          screen: clientContext.screen,
          app_area: clientContext.appArea,
          partner_plan: partnerPlan || undefined,
          user_role: userRole || undefined,
        },
      })

      if (res.success) {
        setIsSuccess(true)
      } else {
        setErrorMessage(res.error || "Ocorreu um erro ao enviar seu feedback. Tente novamente.")
      }
    } catch {
      setErrorMessage("Erro de conexão. Verifique sua internet e tente novamente.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <DefaultModal
      isOpen={isOpen}
      onClose={onClose}
      title={isSuccess ? "Feedback Enviado!" : "Enviar Feedback"}
      maxWidth="md"
    >
      {isSuccess ? (
        <div className="flex flex-col items-center justify-center py-8 text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <CheckCircleIcon className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">
              Muito obrigado pelo seu feedback!
            </h3>
            <p className="text-sm text-brand-inactive-text dark:text-dark-body max-w-sm">
              Sua opinião vai diretamente para o nosso time de produto e nos ajuda a melhorar a Dudit a cada dia.
            </p>
          </div>
          <Button variant="filled" className="mt-4 px-8" onClick={onClose}>
            Concluir
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5 pt-1">
          {/* Categoria */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-brand-inactive-text dark:text-dark-body uppercase tracking-wider">
              O que você gostaria de compartilhar?
            </label>
            <div className="grid grid-cols-3 gap-2">
              {CATEGORIES.map((cat) => {
                const isSelected = selectedCategory.id === cat.id
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => handleCategorySelect(cat)}
                    className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border text-xs font-medium transition-all ${
                      isSelected
                        ? "border-brand-primary bg-brand-primary/5 text-brand-primary dark:border-brand-primary dark:text-white"
                        : "border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface hover:bg-gray-50 dark:hover:bg-dark-border/40 text-gray-700 dark:text-dark-body"
                    }`}
                  >
                    {cat.icon}
                    <span>{cat.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Sentimento rápido */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-brand-inactive-text dark:text-dark-body uppercase tracking-wider">
              Sentimento
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "positive" as const, emoji: "🙂", label: "Gostando" },
                { id: "neutral" as const, emoji: "😐", label: "Neutro" },
                { id: "negative" as const, emoji: "🙁", label: "Problemas" },
              ].map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSentiment(s.id)}
                  className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-xs font-medium transition-colors ${
                    sentiment === s.id
                      ? "border-brand-dark bg-brand-dark text-white dark:border-white dark:bg-white dark:text-black"
                      : "border-brand-border dark:border-dark-border bg-gray-50/50 dark:bg-dark-surface text-gray-600 dark:text-dark-body hover:bg-gray-100 dark:hover:bg-dark-border/50"
                  }`}
                >
                  <span className="text-base leading-none">{s.emoji}</span>
                  <span>{s.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Campo de Mensagem */}
          <div className="space-y-1">
            <FormTextarea
              label="Sua mensagem"
              placeholder={
                selectedCategory.id === "praise"
                  ? "Conte o que você mais gostou ou achou prático..."
                  : selectedCategory.id === "bug"
                  ? "Descreva o que aconteceu de errado e o que você esperava..."
                  : "Compartilhe sua sugestão ou o que podemos melhorar..."
              }
              value={message}
              onChange={(e: any) => setMessage(e.target.value)}
              maxLength={2000}
              showCharacterCount
              className="min-h-[110px]"
            />
          </div>

          {errorMessage && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
              {errorMessage}
            </div>
          )}

          {/* Rodapé de Ações */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-brand-border dark:border-dark-border">
            <Button variant="outline" type="button" onClick={onClose} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button variant="filled" type="submit" disabled={isSubmitting || message.trim().length < 2}>
              {isSubmitting ? "Enviando..." : "Enviar Feedback"}
            </Button>
          </div>
        </form>
      )}
    </DefaultModal>
  )
}
