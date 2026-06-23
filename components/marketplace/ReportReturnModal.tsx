"use client"

import { useState } from "react"
import { DefaultModal, Button, FormDropdown, FormTextarea, Checkbox, InfoCard } from "@/components/reusable"
import { reportReturnToDuditAction } from "@/app/actions/returns/reports"
import { DUDIT_REPORT_LEGAL_NOTICE } from "@/lib/returns/policy"
import { useToast } from "@/components/ui/use-toast"
import { useCSRFToken } from "@/hooks/use-csrf-token"

type Props = {
  open: boolean
  onClose: () => void
  returnRequestId: string
  onReported?: () => void
}

const REASON_OPTIONS = [
  { value: "return_sla_violation", label: "Prazo de resposta expirado" },
  { value: "return_denied_unfairly", label: "Recusa indevida" },
  { value: "seller_abuse", label: "Abuso do vendedor" },
  { value: "return_abuse", label: "Denúncia de abuso" },
  { value: "scam_or_fraud", label: "Golpe / fraude" },
  { value: "other", label: "Outro motivo" },
]

export function ReportReturnModal({ open, onClose, returnRequestId, onReported }: Props) {
  const { toast } = useToast()
  const [reasonCode, setReasonCode] = useState("return_sla_violation")
  const [description, setDescription] = useState("")
  const [legalAck, setLegalAck] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const csrfToken = useCSRFToken()

  async function handleSubmit() {
    if (!legalAck) {
      toast({ title: "Confirme o aviso legal", variant: "destructive" })
      return
    }
    setSubmitting(true)
    const res = await reportReturnToDuditAction({
      returnRequestId,
      reasonCode: reasonCode as "return_sla_violation",
      description: description || null,
      legalAcknowledged: true,
      idempotencyKey: `report:${returnRequestId}`,
      csrf_token: csrfToken || undefined,
    })
    setSubmitting(false)

    if (res.success) {
      toast({ title: "Reporte enviado à Dudit" })
      onReported?.()
      onClose()
    } else {
      toast({ title: res.error || "Erro ao reportar", variant: "destructive" })
    }
  }

  return (
    <DefaultModal isOpen={open} onClose={onClose} title="Reportar à Dudit">
      <div className="space-y-4">
        <InfoCard message={DUDIT_REPORT_LEGAL_NOTICE} color="orange" />

        <FormDropdown
          label="Motivo"
          value={reasonCode}
          setValue={setReasonCode}
          options={REASON_OPTIONS}
        />

        <FormTextarea
          name="description"
          label="Detalhes (opcional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
        />

        <Checkbox
          label="Li e confirmo que entendo que a Dudit não realiza mediação jurídica"
          checked={legalAck}
          onCheckedChange={(v) => setLegalAck(v === true)}
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancelar</Button>
          <Button variant="filled" onClick={handleSubmit} disabled={submitting || !legalAck}>
            {submitting ? "Enviando..." : "Enviar reporte"}
          </Button>
        </div>
      </div>
    </DefaultModal>
  )
}
