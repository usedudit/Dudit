"use client"

import { useState } from "react"
import DefaultModal from "@/components/reusable/DefaultModal"
import { Button } from "@/components/reusable/Button"
import { FormCurrencyInput } from "@/components/reusable/FormCurrencyInput"
import { recordCommissionPaymentAction } from "@/app/actions/erp/produtividade"
import { formatCurrency } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"

type Props = {
  isOpen: boolean
  onClose: () => void
  partnerId: string
  sellerName: string
  sellerPartnerUserId: string
  maxAmount: number
  onSuccess: () => void
}

export default function CommissionPaymentModal({
  isOpen,
  onClose,
  partnerId,
  sellerName,
  sellerPartnerUserId,
  maxAmount,
  onSuccess,
}: Props) {
  const [amount, setAmount] = useState(maxAmount)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { toast } = useToast()

  const handleSubmit = async () => {
    if (amount <= 0) {
      toast({ title: "Valor inválido", description: "Informe um valor maior que zero.", variant: "error" })
      return
    }
    if (amount > maxAmount) {
      toast({ title: "Valor excede o permitido", description: `O valor máximo é ${formatCurrency(maxAmount)}.`, variant: "error" })
      return
    }

    setIsSubmitting(true)
    const result = await recordCommissionPaymentAction(partnerId, sellerPartnerUserId, amount)
    setIsSubmitting(false)

    if (result.success) {
      toast({ title: "Pagamento registrado", description: `Comissão de ${formatCurrency(amount)} paga para ${sellerName}.`, variant: "success" })
      onSuccess()
      onClose()
    } else {
      toast({ title: "Erro", description: result.error || "Erro ao registrar pagamento.", variant: "error" })
    }
  }

  return (
    <DefaultModal isOpen={isOpen} onClose={onClose} title="Registrar Pagamento de Comissão">
      <div className="p-6 space-y-6">
        <div>
          <p className="text-sm text-brand-inactive-text dark:text-dark-body mb-1">Vendedor</p>
          <p className="text-base font-bold text-brand-dark dark:text-dark-heading">{sellerName}</p>
        </div>
        <div>
          <p className="text-sm text-brand-inactive-text dark:text-dark-body mb-1">Valor disponível</p>
          <p className="text-base font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(maxAmount)}</p>
        </div>
        <FormCurrencyInput
          label="Valor a pagar"
          value={amount}
          onChange={setAmount}
          placeholder="0,00"
        />
        <div className="flex items-center gap-2">
          <Button onClick={() => setAmount(maxAmount)} variant="outline" className="text-xs">
            Pagar valor total
          </Button>
          {maxAmount > 0 && (
            <Button onClick={() => setAmount(maxAmount / 2)} variant="outline" className="text-xs">
              50%
            </Button>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-brand-border dark:border-dark-border">
          <Button onClick={onClose} variant="outline">
            Cancelar
          </Button>
          <Button onClick={handleSubmit} isLoading={isSubmitting}>
            Confirmar Pagamento
          </Button>
        </div>
      </div>
    </DefaultModal>
  )
}
