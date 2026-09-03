"use client"

import React, { useState, useEffect } from "react"
import { DefaultModal, Button, FormTextarea, InfoCard, IconPlaceholder } from "@/components/reusable"
import { submitFeedbackAction, type FeedbackType, type FeedbackSentiment } from "@/app/actions/feedback"
import { getClientFeedbackContext } from "@/lib/utils/client-feedback-context"
import { Sparkles, MessageSquare, AlertCircle, Heart } from "lucide-react"

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

const FEEDBACK_SENTIMENTS = [
  {
    id: "positive" as const,
    emoji: "🙂",
    title: "Gostando",
    desc: "A plataforma está atendendo bem minhas expectativas",
  },
  {
    id: "neutral" as const,
    emoji: "😐",
    title: "Neutro",
    desc: "Consegui usar, mas tive algumas dúvidas ou atritos",
  },
  {
    id: "negative" as const,
    emoji: "🙁",
    title: "Problemas",
    desc: "Encontrei barreiras importantes para operar",
  },
]

export function GeneralFeedbackModal({
  isOpen,
  onClose,
  partnerId,
  partnerPlan,
  userRole,
}: GeneralFeedbackModalProps) {
  const [selectedCategory, setSelectedCategory] = useState<FeedbackCategoryOption>(CATEGORIES[1])
  const [sentiment, setSentiment] = useState<FeedbackSentiment | null>(null)
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
      setSentiment(null)
    }
  }, [isOpen])

  const handleCategorySelect = (cat: FeedbackCategoryOption) => {
    setSelectedCategory(cat)
    setSentiment(null)
    setErrorMessage(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sentiment) {
      setErrorMessage("Por favor, selecione como está sendo sua experiência.")
      return
    }
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
      footer={
        !isSuccess ? (
          <div className="flex justify-end gap-3 w-full">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>

            <Button
              type="submit"
              disabled={isSubmitting || !sentiment || message.trim().length < 3}
            >
              {isSubmitting ? "Enviando..." : "Enviar Feedback"}
            </Button>
          </div>
        ) : undefined
      }
    >
      {isSuccess ? (
        <div className="flex flex-col items-center justify-center p-2">
          <IconPlaceholder
            placeholderType="image"
            imageSrc="https://img.dudit.com.br/static/mascots/Feedback.png"
            title="Obrigado pelo seu feedback!"
            subtitle="Sua opinião vai diretamente para o nosso time de produto e nos ajuda a melhorar a Dudit a cada dia."
            itemButton={{
              text: "Concluir",
              action: onClose,
            }}
          />
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

          {/* Sentimento */}
          <div className="space-y-2.5">
            <label className="text-xs font-semibold text-brand-inactive-text dark:text-dark-body uppercase tracking-wider">
              Sentimento
            </label>
            {FEEDBACK_SENTIMENTS.map((item) => {
              const isSelected = sentiment === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setSentiment(item.id)
                    setErrorMessage(null)
                  }}
                  className={`w-full flex items-center gap-3.5 p-3.5 rounded-xl border text-left transition-all ${
                    isSelected
                      ? "border-brand-primary bg-brand-primary/5 text-brand-dark dark:border-brand-primary dark:text-white ring-1 ring-brand-primary"
                      : "border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface hover:bg-gray-50 dark:hover:bg-dark-border/40 text-gray-800 dark:text-dark-body"
                  }`}
                >
                  <span className="text-2xl shrink-0 leading-none">{item.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-brand-dark dark:text-dark-heading">
                      {item.title}
                    </p>
                    <p className="text-xs text-brand-inactive-text dark:text-dark-body truncate mt-0.5">
                      {item.desc}
                    </p>
                  </div>
                </button>
              )
            })}
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
            <InfoCard
              color="red"
              message={errorMessage}
            />
          )}
        </form>
      )}
    </DefaultModal>
  )
}
