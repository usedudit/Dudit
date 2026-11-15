import React from "react"
import { CreditCardIcon, MoneyIcon, QRCodeIcon, FileIcon, TagIcon, PlusIcon, XIcon } from "@/lib/icons"
import { Button } from "@/components/reusable"
import { formatCurrency } from "@/lib/utils"
import { CompactPaymentStatusAlert } from "./CompactPaymentStatusAlert"
import { PaymentMethodCard } from "@/components/erp/POSComponents"
import { normalizeMethodType, formatPaymentMethodToFullLabel, type PartnerPaymentMethod } from "./payment-utils"

export type SplitPaymentLeg = {
  id: number
  method: string | null
  paymentMethodId: string | null
  amount: number
  installmentNumber: number
}

type SplitPaymentViewProps = {
  legs: SplitPaymentLeg[]
  chargeTarget: number
  flatAmount?: boolean
  splitPreview?: { success: true; finalTotal: number; rows: any[] } | { success: false; error: string } | null
  isLoading?: boolean
  onLegClick: (index: number) => void
  onAddLeg?: () => void
  onRemoveLeg?: (index: number) => void
  disableLegEdit?: boolean
}

export function SplitPaymentView({
  legs,
  chargeTarget,
  flatAmount = false,
  splitPreview,
  isLoading = false,
  onLegClick,
  onAddLeg,
  onRemoveLeg,
  disableLegEdit = false,
}: SplitPaymentViewProps) {
  const totalAllocated = flatAmount
    ? legs.reduce((sum, leg) => sum + Math.max(0, Number(leg.amount || 0)), 0)
    : splitPreview && "success" in splitPreview && splitPreview.success
      ? splitPreview.finalTotal
      : legs.reduce((sum, leg) => sum + Math.max(0, Number(leg.amount || 0)), 0)

  return (
    <div className="flex flex-col w-full">
      <CompactPaymentStatusAlert totalPaid={totalAllocated} totalNeed={chargeTarget} />
      {isLoading && (
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-brand-inactive-text">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-border border-t-brand-green" />
          Calculando valores por meio de pagamento...
        </div>
      )}
      {splitPreview && !splitPreview.success && (
        <p className="text-sm text-red-600 dark:text-red-400 mb-3" role="alert">
          {splitPreview.error}
        </p>
      )}
      <div className="grid grid-cols-1 gap-4">
        {legs.map((leg, idx) => {
          const pr = !flatAmount && splitPreview && "success" in splitPreview && splitPreview.success ? splitPreview.rows[idx] : null
          const amtReceived = Number(pr?.amountReceived ?? leg.amount ?? 0)
          return (
            <div
              key={leg.id}
              onClick={() => {
                if (!disableLegEdit) onLegClick(idx)
              }}
              className="border border-brand-border dark:border-dark-border rounded-lg p-4 cursor-pointer hover:bg-brand-light-bg dark:hover:bg-dark-card-bg transition-colors"
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading">{leg.method ? formatPaymentMethodToFullLabel(leg.method) : `Selecionar método ${idx + 1}`}</span>
                {onRemoveLeg && legs.length > 2 && !disableLegEdit && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onRemoveLeg(idx)
                    }}
                    className="p-1 rounded-full text-brand-inactive-text hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    title="Remover este método"
                  >
                    <XIcon size={14} />
                  </button>
                )}
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-brand-inactive-text">Valor:</span>
                <span className="font-medium text-brand-dark dark:text-dark-heading">{formatCurrency(amtReceived)}</span>
              </div>
            </div>
          )
        })}
      </div>

      {onAddLeg && !disableLegEdit && (
        <Button
          type="button"
          variant="outline"
          className="w-full h-10 border-dashed text-xs mt-3 flex items-center justify-center gap-1.5"
          onClick={onAddLeg}
        >
          <PlusIcon size={14} />
          Adicionar outro meio de pagamento
        </Button>
      )}

      <div className="mt-4 flex flex-col gap-2 border-t border-brand-border dark:border-dark-border pt-4">
        <div className="flex justify-between items-baseline text-sm">
          <span className="text-brand-inactive-text">Saldo a receber:</span>
          <span className="font-semibold text-brand-dark dark:text-dark-heading">{formatCurrency(chargeTarget)}</span>
        </div>
        <div className="flex justify-between items-baseline text-sm">
          <span className="text-brand-inactive-text">Total informado:</span>
          <span className="font-semibold text-brand-dark dark:text-dark-heading">{formatCurrency(totalAllocated)}</span>
        </div>
      </div>
    </div>
  )
}

export function SplitMethodSelector({
  methods,
  onSelect,
}: {
  methods: PartnerPaymentMethod[]
  onSelect: (method: PartnerPaymentMethod) => void
}) {
  return (
    <div className="w-full">
      <h3 className="text-sm font-bold text-brand-inactive-text mb-4 tracking-wide uppercase">Selecione o método</h3>
      <div className="grid grid-cols-2 gap-4">
        {methods.map((method) => {
          const normalizedType = normalizeMethodType(method.type)
          const MethodIcon =
            normalizedType === "cash"
              ? MoneyIcon
              : normalizedType === "pix"
                ? QRCodeIcon
                : normalizedType === "bank_transfer"
                  ? FileIcon
                  : ["credit_card", "debit_card"].includes(normalizedType)
                    ? CreditCardIcon
                    : TagIcon
          return (
            <PaymentMethodCard key={method.id} icon={MethodIcon} label={method.name} onClick={() => onSelect(method)} />
          )
        })}
      </div>
    </div>
  )
}
