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
}: ERPOnboardingFeedbackModalProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [partnerStoreName, setPartnerStoreName] = useState<string>("")
  const [selectedSentiment, setSelectedSentiment] = useState<FeedbackSentiment | null>(null)
  const [comment, setComment] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    // Only verify for management / owners / admins
    const roleLower = String(userRole || "").toLowerCase()
    const isPrivileged = roleLower === "owner" || roleLower === "admin" || roleLower === "manager"
    if (!isPrivileged) return

    let isMounted = true

    async function checkPrompt() {
      try {
        const res = await checkERPOnboardingFeedbackPromptAction(partnerId)
        if (isMounted && res.shouldShow) {
          setIsOpen(true)
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
  }, [partnerId, userRole])

  const handleClose = async () => {
    setIsOpen(false)
    if (!isSuccess) {
      // Mark dismissed so it never pesters the user again
      await dismissFeedbackPromptAction(partnerId, "erp_onboarding")
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
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

      const messageContent = comment.trim()
        ? `[Experiência: ${sentimentLabel}]\n${comment.trim()}`
        : `Experiência inicial no ERP: ${sentimentLabel}`

      const res = await submitFeedbackAction({
        type: "onboarding",
        sentiment: selectedSentiment,
        message: messageContent,
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

  if (!isOpen) return null

  return (
    <DefaultModal
      isOpen={isOpen}
      onClose={handleClose}
      title={isSuccess ? "Obrigado!" : "Como está sendo sua experiência na Dudit?"}
      maxWidth="md"
      footer={
        <div className="flex justify-end gap-3 w-full">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            Agora não
          </Button>

          <Button
            type="submit"
            disabled={isSubmitting || !selectedSentiment}
          >
            Enviar Resposta
          </Button>
        </div>
      }
    >
      {isSuccess ? (
        <div className="flex flex-col items-center justify-center">
          <IconPlaceholder
            placeholderType="image"
            imageSrc="https://img.dudit.com.br/static/mascots/Feedback.png"
            title="Obrigado pelo feedback!"
            subtitle="Sua experiência nos ajuda a aprimorar o dia a dia da gestão do seu negócio."
            itemButton={{
              text: "Continuar no ERP",
              action: handleClose,
            }}
          />
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">
              Agradecemos seu retorno!
            </h3>
            <p className="text-sm text-brand-inactive-text dark:text-dark-body max-w-sm">
              Sua experiência nos ajuda a aprimorar o dia a dia da gestão do seu negócio.
            </p>
          </div>
          <Button variant="filled" className="mt-4 px-8" onClick={handleClose}>
            Continuar no ERP
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5 pt-1">
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

          {/* Campo aberto opcional */}
          <div className="space-y-1">
            <FormTextarea
              label="Quer deixar algum comentário? (opcional)"
              placeholder="O que você mais gostou, dúvidas que teve ou sugestões para a Dudit..."
              value={comment}
              onChange={(e: any) => setComment(e.target.value)}
              maxLength={2000}
              showCharacterCount
              className="min-h-[90px]"
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
