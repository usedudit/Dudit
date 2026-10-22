"use client"

import React, { useState, useEffect } from "react"
import {
  DefaultModal,
  Button,
  EmailInput,
  FormDropdown,
  FormTextarea,
  InfoCard,
  IconPlaceholder,
  FormSection,
} from "@/components/reusable"
import { PhoneIcon } from "@/lib/icons"
import { submitSupportTicketAction } from "@/app/actions/support"
import type { SupportCategory } from "@/lib/services/discord-support.service"
import { getClientFeedbackContext } from "@/lib/utils/client-feedback-context"

const SUPPORT_CATEGORIES = [
  { value: "duvida", label: "❓ Dúvida" },
  { value: "bug", label: "🐛 Bug / Problema Técnico" },
  { value: "sugestao", label: "💡 Sugestão" },
  { value: "problema-conta", label: "👤 Problema com Conta" },
  { value: "problema-pedido", label: "📦 Problema com Pedido" },
  { value: "cobranca-plano", label: "💳 Cobrança / Plano" },
  { value: "outro", label: "📌 Outro" },
]

const WHATSAPP_NUMBER = "5518996229347"

interface SupportModalProps {
  isOpen: boolean
  onClose: () => void
  userEmail?: string | null
  partnerPlan?: string | null
  partnerId?: string | null
  userRole?: string | null
}

export function SupportModal({
  isOpen,
  onClose,
  userEmail,
  partnerPlan,
  partnerId,
  userRole,
}: SupportModalProps) {
  const [email, setEmail] = useState("")
  const [category, setCategory] = useState("")
  const [description, setDescription] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSuccess, setIsSuccess] = useState(false)
  const [ticketId, setTicketId] = useState<string | null>(null)

  const isPremiumPlan = partnerPlan === "crescer" || partnerPlan === "escalar"

  useEffect(() => {
    if (isOpen) {
      setIsSuccess(false)
      setTicketId(null)
      setErrorMessage(null)
      setDescription("")
      setCategory("")
      if (userEmail) {
        setEmail(userEmail)
      } else {
        setEmail("")
      }
    }
  }, [isOpen, userEmail])

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setErrorMessage(null)

    if (!email.trim() || !email.includes("@")) {
      setErrorMessage("Por favor, informe um e-mail válido.")
      return
    }

    if (!category) {
      setErrorMessage("Por favor, selecione o motivo do contato.")
      return
    }

    if (description.trim().length < 10) {
      setErrorMessage("A descrição deve conter pelo menos 10 caracteres.")
      return
    }

    setIsSubmitting(true)

    try {
      const clientContext = getClientFeedbackContext()

      const res = await submitSupportTicketAction({
        email: email.trim(),
        category: category as SupportCategory,
        description: description.trim(),
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

      if (res.success && res.ticketId) {
        setTicketId(res.ticketId)
        setIsSuccess(true)
      } else {
        setErrorMessage(res.error || "Ocorreu um erro ao enviar seu ticket. Tente novamente.")
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
      title={isSuccess ? "Ticket Criado!" : "Falar com Suporte"}
      maxWidth="md"
      description={
        isSuccess
          ? undefined
          : "Envie sua dúvida, problema ou sugestão. Nossa equipe responderá pelo e-mail informado."
      }
      footer={
        !isSuccess ? (
          <div className="flex justify-end gap-3 w-full">
            <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || !category || description.trim().length < 10}
            >
              {isSubmitting ? "Enviando..." : "Enviar Ticket"}
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
            title="Ticket Enviado com Sucesso!"
            subtitle={
              <span>
                Seu ticket <strong className="text-brand-dark dark:text-white">{ticketId}</strong> foi
                registrado. Nossa equipe analisará e responderá no e-mail{" "}
                <strong>{email}</strong>.
              </span>
            }
            itemButton={{
              text: "Concluir",
              action: onClose,
            }}
          />
        </div>
      ) : (
        <div className="space-y-5 pt-1">
          {/* WhatsApp para planos premium */}
          {isPremiumPlan && (
            <FormSection title="Atendimento Prioritário" description="Como assinante, você tem acesso direto ao nosso suporte via WhatsApp.">
              <a
                href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent("Olá! Preciso de ajuda com a Dudit.")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-4 p-4 rounded-xl border border-green-200 dark:border-green-900/40 bg-green-50 dark:bg-green-900/10 hover:bg-green-100 dark:hover:bg-green-900/20 transition-colors"
              >
                <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center shrink-0">
                  <PhoneIcon className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-green-900 dark:text-green-100">
                    Falar via WhatsApp
                  </p>
                  <p className="text-xs text-green-700 dark:text-green-300 mt-0.5">
                    Resposta mais rápida para assinantes
                  </p>
                </div>
              </a>

              <div className="flex items-center gap-3 my-1">
                <div className="flex-1 h-px bg-brand-border dark:bg-dark-border" />
                <span className="text-xs text-brand-inactive-text dark:text-dark-body">ou envie pelo formulário</span>
                <div className="flex-1 h-px bg-brand-border dark:bg-dark-border" />
              </div>
            </FormSection>
          )}

          {/* Email */}
          <div className="space-y-1.5">
            <EmailInput
              label="Seu e-mail"
              value={email}
              onChange={(e: any) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              disabled={!!userEmail}
            />
            {userEmail && (
              <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                Usando o e-mail da sua conta logada.
              </p>
            )}
          </div>

          {/* Categoria */}
          <FormDropdown
            label="Motivo do contato"
            options={SUPPORT_CATEGORIES}
            value={category}
            setValue={(v) => {
              setCategory(v)
              setErrorMessage(null)
            }}
            placeholder="Selecione o motivo"
          />

          {/* Descrição */}
          <div className="space-y-1">
            <FormTextarea
              label="Descreva seu problema ou dúvida"
              placeholder="Quanto mais detalhes, mais rápido podemos ajudar..."
              value={description}
              onChange={(e: any) => setDescription(e.target.value)}
              maxLength={2000}
              showCharacterCount
              rows={5}
              required
            />
          </div>

          {errorMessage && <InfoCard color="red" message={errorMessage} />}
        </div>
      )}
    </DefaultModal>
  )
}
