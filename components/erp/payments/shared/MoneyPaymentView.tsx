import React from "react"
import { Button, FormDropdown, MoneyInput } from "@/components/reusable"
import { Numpad } from "@/components/erp/POSComponents"
import { cn, formatNumber } from "@/lib/utils"
import { CompactPaymentStatusAlert } from "./CompactPaymentStatusAlert"
import { PaymentAmountLabel } from "./PaymentAmountLabel"

type MoneyPaymentViewProps = {
  amount: number
  onAmountChange: (value: number) => void
  calculation?: any
  baseAllocated: number
  flatAmount?: boolean
  isLoading?: boolean
  showFeeBearer?: boolean
  feeBearer?: string
  onFeeBearerChange?: (value: "merchant" | "customer") => void
  totalPaid?: number
  totalNeed?: number
  showNumpad?: boolean
}

export function MoneyPaymentView({
  amount,
  onAmountChange,
  calculation,
  baseAllocated,
  flatAmount = false,
  isLoading = false,
  showFeeBearer = false,
  feeBearer = "merchant",
  onFeeBearerChange,
  totalPaid = 0,
  totalNeed = 0,
  showNumpad = true,
}: MoneyPaymentViewProps) {
  const handleQuickDenomination = (amt: number) => {
    onAmountChange(Math.max(0, Number(amount || 0) + amt))
  }

  const handleNumpadInput = (digit: string) => {
    const current = String(Math.round(Math.max(0, amount) * 100))
    const next = (current + digit).replace(/^0+(?=\d)/, "")
    onAmountChange(Number(next) / 100)
  }

  const handleNumpadDelete = () => {
    const current = String(Math.round(Math.max(0, amount) * 100))
    const next = current.slice(0, -1)
    onAmountChange(next ? Number(next) / 100 : 0)
  }

  return (
    <div className={cn("w-full flex flex-col items-center px-2", isLoading && "opacity-60")}>
      {totalNeed > 0 ? <CompactPaymentStatusAlert totalPaid={totalPaid} totalNeed={totalNeed} /> : null}
      <div className="w-full max-w-sm space-y-3">
        <PaymentAmountLabel
          label="Valor a receber"
          calculation={calculation}
          baseAllocated={baseAllocated}
          flatAmount={flatAmount}
        />
        <MoneyInput value={amount} onChange={onAmountChange} />
      </div>
      <div className="flex flex-wrap justify-center gap-3 mb-6 mt-4 w-full px-2">
        {[5, 10, 20, 50, 100].map((amt) => (
          <button
            key={amt}
            type="button"
            onClick={() => handleQuickDenomination(amt)}
            className="px-5 py-3 bg-gray-100 dark:bg-dark-border/30 rounded-xl text-sm font-bold text-brand-dark dark:text-dark-heading hover:bg-gray-200 dark:hover:bg-dark-border/50 transition-colors border border-transparent hover:border-brand-border min-w-[70px]"
          >
            R$ {amt}
          </button>
        ))}
      </div>
      {showFeeBearer && onFeeBearerChange && !flatAmount && (
        <div className="w-full max-w-sm mt-4">
          <FormDropdown
            label="Quem paga a taxa?"
            value={feeBearer}
            setValue={(v: any) => onFeeBearerChange(v)}
            options={[
              { value: "merchant", label: "Empresa (absorve)" },
              { value: "customer", label: "Cliente (acrescenta no valor)" },
            ]}
          />
        </div>
      )}
      {isLoading && (
        <div className="mb-4 flex items-center gap-2 text-sm font-medium text-brand-inactive-text">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-border border-t-brand-green" />
          Calculando valor a cobrar...
        </div>
      )}
      {showNumpad && <Numpad onInput={handleNumpadInput} onDelete={handleNumpadDelete} />}
    </div>
  )
}

export function parseCalculatorInput(value: string) {
  const normalized = String(value || "").trim()
  if (!normalized) return 0
  if (normalized.includes(".")) {
    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
  }
  const digits = normalized.replace(/\D/g, "")
  return digits ? Number(digits) / 100 : 0
}

export function formatCalculatorAmount(value: number) {
  return `R$ ${formatNumber(Math.max(0, Number(value || 0)))}`
}
