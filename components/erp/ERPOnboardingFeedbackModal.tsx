"use client"

import React, { useState, useEffect } from "react"
import { DefaultModal, Button, FormTextarea, InfoCard, IconPlaceholder } from "@/components/reusable"
import {
  checkERPOnboardingFeedbackPromptAction,
  recordFeedbackPromptShownAction,
  dismissFeedbackPromptAction,
  submitFeedbackAction,
  type FeedbackSentiment,
} from "@/app/actions/feedback"
import { getClientFeedbackContext } from "@/lib/utils/client-feedback-context"

interface ERPOnboardingFeedbackModalProps {
  partnerId: string
  partnerPlan?: string
  userRole?: string
  isOpen?: boolean
  onClose?: () => void
}

const ONBOARDING_SENTIMENTS = [
  {
    id: "positive" as const,
    emoji: "🙂",
    title: "Estou gostando",
    desc: "A plataforma está atendendo bem minhas expectativas",
  },
  {
    id: "neutral" as const,
    emoji: "😐",
    title: "Tenho algumas dificuldades",
    desc: "Consegui usar, mas tive algumas dúvidas ou atritos",
  },
  {
    id: "negative" as const,
    emoji: "🙁",
    title: "Estou tendo problemas",
    desc: "Encontrei barreiras importantes para operar",
  },
]

export function ERPOnboardingFeedbackModal({
  partnerId,
  partnerPlan,
  userRole,
  isOpen: propIsOpen,
  onClose: propOnClose,
}: ERPOnboardingFeedbackModalProps) {
  const isControlled = typeof propIsOpen === "boolean"
  const [internalIsOpen, setInternalIsOpen] = useState(false)
  const isModalOpen = isControlled ? !!propIsOpen : internalIsOpen
  const [partnerStoreName, setPartnerStoreName] = useState<string>("")
  const [selectedSentiment, setSelectedSentiment] = useState<FeedbackSentiment | null>(null)
  const [comment, setComment] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (propIsOpen) {
      setIsSuccess(false)
      setSelectedSentiment(null)
      setComment("")
      setErrorMessage(null)
    }
  }, [propIsOpen])

  useEffect(() => {
    if (isControlled) return

    // Only verify for management / owners / admins
    const roleLower = String(userRole || "").toLowerCase()
    const isPrivileged = roleLower === "owner" || roleLower === "admin" || roleLower === "manager"
    if (!isPrivileged) return

    let isMounted = true

    async function checkPrompt() {
      try {
        const res = await checkERPOnboardingFeedbackPromptAction(partnerId)
        if (isMounted && res.shouldShow) {
          setInternalIsOpen(true)
          if (res.partnerName) setPartnerStoreName(res.partnerName)
          // Record shown
          recordFeedbackPromptShownAction(partnerId, "erp_onboarding")
        }
      } catch (err) {
        console.warn("[ERPOnboardingFeedbackModal] Failed to check onboarding prompt:", err)
      }
    }

    checkPrompt()

    return () => {
      isMounted = false
    }
  }, [partnerId, userRole, isControlled])

  const handleClose = async () => {
    if (propOnClose) {
      propOnClose()
    } else {
      setInternalIsOpen(false)
      if (!isSuccess) {
        // Mark dismissed so it never pesters the user again
        await dismissFeedbackPromptAction(partnerId, "erp_onboarding")
      }
    }
  }

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!selectedSentiment) {
      setErrorMessage("Por favor, selecione como está sendo sua experiência.")
      return
    }

    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      const clientContext = getClientFeedbackContext()
      const sentimentLabel =
        selectedSentiment === "positive"
          ? "Estou gostando"
          : selectedSentiment === "neutral"
            ? "Tenho algumas dificuldades"
            : "Estou tendo problemas"

      const commentText = comment.trim()
      const message = commentText
        ? `[Experiência: ${sentimentLabel}]\n${commentText}`
        : `Experiência inicial no ERP: ${sentimentLabel}`

      const res = await submitFeedbackAction({
        type: "onboarding",
        sentiment: selectedSentiment,
        message,
        pageUrl: clientContext.pageUrl,
        partnerId,
        metadata: {
          browser: clientContext.browser,
          screen: clientContext.screen,
          app_area: "ERP",
          partner_plan: partnerPlan,
          user_role: userRole,
          store_name: partnerStoreName,
        },
      })

      if (res.success) {
        setIsSuccess(true)
      } else {
        setErrorMessage(res.error || "Erro ao salvar feedback. Tente novamente.")
      }
    } catch {
      setErrorMessage("Erro de conexão ao enviar feedback.")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isModalOpen) return null

  return (
    <DefaultModal
      isOpen={isModalOpen}
      onClose={handleClose}
      title={isSuccess ? "Obrigado!" : "Como está sendo sua experiência na Dudit?"}
      maxWidth="md"
      footer={
        !isSuccess ? (
          <div className="flex justify-end gap-3 w-full">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Agora não
            </Button>

            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || !selectedSentiment}
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
            title="Obrigado pelo feedback!"
            subtitle="Sua experiência nos ajuda a aprimorar o dia a dia da gestão do seu negócio."
            itemButton={{
              text: "Continuar",
              action: handleClose,
            }}
          />
        </div>
      ) : (
        <div className="space-y-5 pt-1">
          <p className="text-sm text-brand-inactive-text dark:text-dark-body">
            Você está usando a Dudit há alguns dias. Queremos saber como está sendo sua experiência para continuarmos melhorando:
          </p>

          {/* Opções de Sentimento */}
          <div className="space-y-2.5">
            {ONBOARDING_SENTIMENTS.map((item) => {
              const isSelected = selectedSentiment === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setSelectedSentiment(item.id)
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
              placeholder="Quer deixar algum comentário ou sugestão?"
              value={comment}
              onChange={(e: any) => setComment(e.target.value)}
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
