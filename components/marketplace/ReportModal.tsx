"use client"

import { useState } from "react"
import { FlagIcon } from "@/lib/icons"
import { Button, FormDropdown, FormTextarea, DefaultModal, IconPlaceholder } from "@/components/reusable"
import { useNotification } from "@/hooks/use-notification"
import { createReport, type ReportTargetType } from "@/app/actions/admin/reports"
import { REPORT_REASON_CODES, REPORT_REASON_LABELS, type ReportReasonCode } from "@/lib/admin/report-reasons"

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
      const res = await createReport({
        targetType,
        targetId,
        reasonCode,
        description: description.trim() || undefined
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

  return (
    <DefaultModal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="md"
    >
      <div className="flex flex-col">
        <div className="flex justify-center w-full mb-4">
          <IconPlaceholder icon={FlagIcon} />
        </div>

        <h4 className="text-brand-dark dark:text-dark-heading text-xl font-bold mb-2 text-center">
          Denunciar {targetType === "partner" ? "vendedor" : "produto"}
        </h4>
        <p className="text-brand-inactive-text dark:text-dark-body text-sm mb-6 text-center">
          Você está denunciando <strong>{targetName}</strong>. Sua denúncia é anônima e ajuda a manter nossa comunidade segura.
        </p>

        <div className="space-y-6">
          <FormDropdown
            label="Motivo da denúncia"
            placeholder="Selecione o motivo..."
            options={REPORT_REASON_CODES.map(code => ({
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
