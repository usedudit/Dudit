"use client"

import { useState } from "react"
import { FlagIcon } from "@/lib/icons"
import { Button, FormDropdown, FormTextarea, DefaultModal } from "@/components/reusable"
import { useNotification } from "@/hooks/use-notification"
import { createReport, type ReportTargetType } from "@/app/actions/admin/reports"
import { REPORT_REASON_CODES, REPORT_REASON_LABELS, type ReportReasonCode } from "@/lib/admin/report-reasons"
import { getCSRFToken } from "@/lib/utils/fetch-with-csrf"
import { ArrowLeftRightIcon } from "@/lib/icons"

interface ReportModalProps {
  isOpen: boolean
  onClose: () => void
  targetType: ReportTargetType
  targetId: string
  targetName: string
}

export function ReportModal({
  isOpen,
  onClose,
  targetType,
  targetId,
  targetName
}: ReportModalProps) {
  const [reasonCode, setReasonCode] = useState<ReportReasonCode | "">("")
  const [description, setDescription] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { success, error } = useNotification()

  const handleSubmit = async () => {
    if (!reasonCode) {
      error("Erro", "Por favor, selecione um motivo para a denúncia.")
      return
    }

    setIsSubmitting(true)
    try {
      const csrf_token = await getCSRFToken()
      const res = await createReport({
        targetType,
        targetId,
        reasonCode,
        description: description.trim() || undefined,
        csrf_token
      })

      if (res.success) {
        success("Denúncia enviada", "Sua denúncia foi registrada e será analisada pela nossa equipe de moderação. Obrigado por ajudar a manter a Dudit segura!")
        setReasonCode("")
        setDescription("")
        onClose()
      } else {
        error("Não foi possível enviar", res.error || "Ocorreu um erro ao processar sua denúncia.")
      }
    } catch (err) {
      error("Erro", "Ocorreu um erro inesperado. Tente novamente mais tarde.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const targetLabel = targetType === "product" ? "este produto" : targetType === "partner" ? "este vendedor" : "este item"

  // Filtra as opções baseadas no targetType
  const getRelevantReasons = (): ReportReasonCode[] => {
    if (targetType === "partner") {
      return [
        "scam_or_fraud",
        "inappropriate_content",
        "spam_or_misleading",
        "harassment_or_hate",
        "fake_listing",
        "other"
      ];
    }
    // Para products, services, rental_items, etc
    return [
      "counterfeit",
      "illegal_or_dangerous",
      "copyright_violation",
      "scam_or_fraud",
      "fake_listing",
      "inappropriate_content",
      "other"
    ];
  };

  const relevantReasons = getRelevantReasons();

  return (
    <DefaultModal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="md"
    >
      <div className="flex flex-col">
        {/* Header with Icon Square */}
        <div className="bg-brand-gray dark:bg-dark-border/50 rounded-2xl p-10 flex items-center justify-center mb-8 relative group">
          <div className="w-20 h-20 bg-white dark:bg-dark-surface rounded-2xl p-4 flex items-center justify-center transform transition-transform group-hover:scale-105">
            <FlagIcon size={32} className="text-[#d32f2f]" />
          </div>
        </div>

        <h4 className="text-brand-dark dark:text-dark-heading text-xl font-bold mb-2 text-center">
          Denunciar {targetType === "partner" ? "vendedor" : "produto"}
        </h4>
        <p className="text-brand-inactive-text dark:text-dark-body text-[15px] mb-8 text-center leading-relaxed">
          Você está denunciando <strong>{targetName}</strong>. Sua denúncia é anônima e ajuda a manter nossa comunidade segura.
        </p>

        <div className="space-y-6">
          <FormDropdown
            label="Motivo da denúncia"
            placeholder="Selecione o motivo..."
            options={relevantReasons.map(code => ({
              value: code,
              label: REPORT_REASON_LABELS[code]
            }))}
            value={reasonCode}
            setValue={(val) => setReasonCode(val as ReportReasonCode)}
            width="w-full"
          />

          <FormTextarea
            label="Detalhes adicionais (opcional)"
            placeholder="Descreva brevemente o motivo da sua denúncia..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            maxLength={1000} name={""} />
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mt-8">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1 h-[46px]"
            disabled={isSubmitting}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            className="flex-1 h-[46px] bg-[#d32f2f] hover:bg-[#b71c1c] border-none"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Enviando..." : "Enviar Denúncia"}
          </Button>
        </div>
      </div>
    </DefaultModal>
  )
}
