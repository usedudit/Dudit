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
  pendingAmount: number
  bonusAmount: number
  onSuccess: () => void
}

export default function CommissionPaymentModal({
  isOpen,
  onClose,
  partnerId,
  sellerName,
  sellerPartnerUserId,
  maxAmount,
  pendingAmount,
  bonusAmount,
  onSuccess,
}: Props) {
  const [amount, setAmount] = useState(maxAmount)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { toast } = useToast()

  const handleSubmit = async () => {
    if (amount <= 0) {
      toast({ title: "Valor inválido", description: "Informe um valor maior que zero.", variant: "destructive" })
      return
    }
    if (amount > maxAmount) {
      toast({ title: "Valor excede o permitido", description: `O valor máximo é ${formatCurrency(maxAmount)}.`, variant: "destructive" })
      return
    }

    setIsSubmitting(true)

    let remaining = amount
    let commissionPaid = 0
    let bonusPaid = 0

    if (remaining > 0 && pendingAmount > 0) {
      commissionPaid = Math.min(remaining, pendingAmount)
      const res = await recordCommissionPaymentAction(partnerId, sellerPartnerUserId, commissionPaid)
      if (!res.success) {
        toast({ title: "Erro", description: res.error || "Erro ao pagar comissão.", variant: "destructive" })
        setIsSubmitting(false)
        return
      }
      remaining -= commissionPaid
    }

    if (remaining > 0 && bonusAmount > 0) {
      bonusPaid = remaining
      const res = await recordCommissionPaymentAction(partnerId, sellerPartnerUserId, bonusPaid, null, "Metas e Bônus")
      if (!res.success) {
        toast({ title: "Erro", description: res.error || "Erro ao pagar bônus.", variant: "destructive" })
        setIsSubmitting(false)
        return
      }
    }

    setIsSubmitting(false)
    toast({ title: "Pagamento registrado", description: `${formatCurrency(amount)} pago para ${sellerName}.`, variant: "success" })
    onSuccess()
    onClose()
  }

  return (
    <DefaultModal isOpen={isOpen} onClose={onClose} title="Registrar Pagamento">
      <div className="p-6 space-y-6">
        <div>
          <p className="text-sm text-brand-inactive-text dark:text-dark-body mb-1">Vendedor</p>
          <p className="text-base font-bold text-brand-dark dark:text-dark-heading">{sellerName}</p>
        </div>

        {pendingAmount > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-brand-inactive-text dark:text-dark-body">Comissão pendente</span>
            <span className="text-sm font-bold text-orange-600">{formatCurrency(pendingAmount)}</span>
          </div>
        )}

        {bonusAmount > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-brand-inactive-text dark:text-dark-body">Bônus pendente</span>
            <span className="text-sm font-bold text-purple-600">{formatCurrency(bonusAmount)}</span>
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-brand-border dark:border-dark-border">
          <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">Total disponível</span>
          <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(maxAmount)}</span>
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
