import React from "react"
import { FormDropdown, MoneyInput } from "@/components/reusable"
import { formatCurrency } from "@/lib/utils"
import { CompactPaymentStatusAlert } from "./CompactPaymentStatusAlert"
import { PaymentAmountLabel } from "./PaymentAmountLabel"

type CardPaymentViewProps = {
  amount: number
  onAmountChange: (value: number) => void
  calculation?: any
  baseAllocated: number
  flatAmount?: boolean
  isLoading?: boolean
  installments: string
  onInstallmentsChange: (value: string) => void
  installmentOptions?: Array<{ installments: number; installmentValue: number; hasInterest?: boolean }>
  maxInstallments?: number
  showFeeBearer?: boolean
  feeBearer?: string
  onFeeBearerChange?: (value: "merchant" | "customer") => void
  totalPaid?: number
  totalNeed?: number
  readOnlyInstallments?: boolean
  hideInstallments?: boolean
}

export function CardPaymentView({
  amount,
  onAmountChange,
  calculation,
  baseAllocated,
  flatAmount = false,
  isLoading = false,
  installments,
  onInstallmentsChange,
  installmentOptions = [],
  maxInstallments = 1,
  showFeeBearer = false,
  feeBearer = "merchant",
  onFeeBearerChange,
  totalPaid = 0,
  totalNeed = 0,
  readOnlyInstallments = false,
  hideInstallments = false,
}: CardPaymentViewProps) {
  const installmentDropdownOptions =
    installmentOptions.length > 0
      ? installmentOptions.map((opt) => ({
          value: String(opt.installments),
          label: `${opt.installments}x de ${formatCurrency(opt.installmentValue)}${opt.hasInterest ? "" : " sem juros"}`,
        }))
      : Array.from({ length: Math.max(1, maxInstallments) }, (_, i) => {
          const num = i + 1
          return { value: String(num), label: `${num}x de ${formatCurrency(amount / num)}` }
        })

  return (
    <div className="flex flex-col items-center justify-start pt-2 w-full max-w-sm mx-auto">
      {totalNeed > 0 ? <CompactPaymentStatusAlert totalPaid={totalPaid} totalNeed={totalNeed} /> : null}
      <div className="mb-6 text-center">
        <div className="text-4xl font-bold text-brand-dark dark:text-dark-heading mb-2">{formatCurrency(amount)}</div>
      </div>
      <div className="w-full text-left space-y-4">
        <PaymentAmountLabel label="Valor a receber" calculation={calculation} baseAllocated={baseAllocated} flatAmount={flatAmount} />
        <MoneyInput value={amount} onChange={onAmountChange} className="font-bold text-lg" />
        {!hideInstallments && (
          readOnlyInstallments ? (
            <div className="rounded-xl bg-gray-50 dark:bg-dark-border/20 p-4">
              <div className="text-xs text-brand-inactive-text uppercase tracking-wide font-bold mb-1">Parcelas</div>
              <div className="font-bold text-brand-dark dark:text-dark-heading">
                {installmentDropdownOptions.find((o) => o.value === installments)?.label ||
                  `1x de ${formatCurrency(amount)}`}
              </div>
            </div>
          ) : (
            <FormDropdown label="Parcelas" value={installments} setValue={onInstallmentsChange} options={installmentDropdownOptions} />
          )
        )}
        {showFeeBearer && onFeeBearerChange && !flatAmount && (
          <FormDropdown
            label="Quem paga a taxa?"
            value={feeBearer}
            setValue={(v: any) => onFeeBearerChange(v)}
            options={[
              { value: "merchant", label: "Empresa (absorve)" },
              { value: "customer", label: "Cliente (acrescenta no valor)" },
            ]}
          />
        )}
        {isLoading && (
          <div className="flex items-center gap-2 text-sm font-medium text-brand-inactive-text">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-border border-t-brand-green" />
            Calculando valor a cobrar...
          </div>
        )}
      </div>
    </div>
  )
}
