"use client"

import React, { useState, useEffect } from "react"
import { DefaultModal, Button, FormTextarea, InfoCard, IconPlaceholder } from "@/components/reusable"
import { submitFeedbackAction, type FeedbackSentiment } from "@/app/actions/feedback"
import { getClientFeedbackContext } from "@/lib/utils/client-feedback-context"

interface GeneralFeedbackModalProps {
  isOpen: boolean
  onClose: () => void
  partnerId?: string | null
  partnerPlan?: string | null
  userRole?: string | null
}

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
      setSentiment(null)
    }
  }, [isOpen])

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!sentiment) {
      setErrorMessage("Por favor, selecione um sentimento.")
      return
    }

    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      const clientContext = getClientFeedbackContext()
      const sentimentLabel =
        sentiment === "positive"
          ? "Positivo"
          : sentiment === "neutral"
            ? "Neutro"
            : "Negativo"

      const commentText = message.trim()
      const feedbackMessage = commentText
        ? `Feedback [${sentimentLabel}]: ${commentText}`
        : `Feedback: ${sentimentLabel}`

      const res = await submitFeedbackAction({
        type: "general",
        sentiment,
        message: feedbackMessage,
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
              onClick={handleSubmit}
              disabled={isSubmitting || !sentiment}
            >
              {isSubmitting ? "Enviando..." : "Enviar"}
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
        <div className="space-y-5 pt-1">
          {/* Sentimento */}
          <div className="space-y-2.5">
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
                  className={`w-full flex items-center gap-3.5 p-3.5 rounded-xl border text-left transition-all ${isSelected
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

          {/* Comentário opcional */}
          <div className="space-y-1">
            <FormTextarea
              label="Comentário (opcional)"
              placeholder="Quer escrever algo mais?"
              value={message}
              onChange={(e: any) => setMessage(e.target.value)}
              maxLength={2000}
              showCharacterCount
              className="min-h-[80px]"
            />
          </div>

          {errorMessage && (
            <InfoCard
              color="red"
              message={errorMessage}
            />
          )}
        </div>
      )}
    </DefaultModal>
  )
}
