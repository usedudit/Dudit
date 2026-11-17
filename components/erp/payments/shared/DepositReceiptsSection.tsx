import React from "react"
import { Badge, Button, ListItem } from "@/components/reusable"
import { formatCurrency } from "@/lib/utils"
import { formatPaymentMethodLabel } from "@/lib/utils/payment-method-label"
import { normalizePaymentMethodKey } from "@/lib/payments/payment-ledger"
import {
  QRCodeIcon,
  MoneyIcon,
  CreditCardIcon,
  FileIcon,
  TagIcon,
} from "@/lib/icons"
import type { PaymentBreakdownLeg } from "./payment-utils"

type DepositReceiptsSectionProps = {
  legs: PaymentBreakdownLeg[]
  orderNumber?: string
  onSyncMp?: () => void
  syncing?: boolean
  onSelectLeg?: (leg: PaymentBreakdownLeg) => void
  hasRemainingBalance?: boolean
}

function isMpLeg(entry: PaymentBreakdownLeg) {
  const method = String(entry.method || "").toLowerCase()
  const provider = String(entry.provider || "").toLowerCase()
  return provider.includes("mercado pago") || method.includes("mercado pago")
}

function getPaymentMethodIcon(methodName?: string | null) {
  const norm = normalizePaymentMethodKey(String(methodName || ""))
  if (norm === "pix") return QRCodeIcon
  if (norm === "cash") return MoneyIcon
  if (norm === "credit_card" || norm === "debit_card") return CreditCardIcon
  if (norm === "bank_transfer" || norm === "boleto") return FileIcon
  return TagIcon
}

export function DepositReceiptsSection({
  legs,
  orderNumber,
  onSyncMp,
  syncing = false,
  onSelectLeg,
  hasRemainingBalance = false,
}: DepositReceiptsSectionProps) {
  const consolidatedLegs = React.useMemo(() => {
    const result: PaymentBreakdownLeg[] = []
    for (const entry of legs) {
      const received = Number(entry.amountReceived || 0)
      if (received <= 0.009) continue

      const existing = result.find((item) => {
        if (item.mpPaymentId || entry.mpPaymentId) {
          return Boolean(
            item.mpPaymentId &&
            entry.mpPaymentId &&
            String(item.mpPaymentId) === String(entry.mpPaymentId)
          )
        }
        if (item.paymentMethodId && entry.paymentMethodId) {
          return String(item.paymentMethodId) === String(entry.paymentMethodId)
        }
        const itemKey = normalizePaymentMethodKey(String(item.method || ""))
        const entryKey = normalizePaymentMethodKey(String(entry.method || ""))
        return Boolean(itemKey && entryKey && itemKey === entryKey)
      })

      if (existing) {
        existing.amount = Number((Number(existing.amount || 0) + Number(entry.amount || received)).toFixed(2))
        existing.amountReceived = Number((Number(existing.amountReceived || 0) + received).toFixed(2))
        existing.effectiveAmount = Number((Number(existing.effectiveAmount || 0) + Number(entry.effectiveAmount || received)).toFixed(2))
      } else {
        result.push({ ...entry })
      }
    }
    return result
  }, [legs])

  if (consolidatedLegs.length === 0) return null

  return (
    <div className="space-y-3">
      <h4 className="text-sm text-brand-inactive-text dark:text-dark-body font-medium">
        Recebimentos confirmados{orderNumber ? ` - ${orderNumber}` : ""}
      </h4>
      <div className="space-y-2">
        {consolidatedLegs.map((entry, index) => {
          const received = Number(entry.amountReceived || 0)
          const methodLabel = formatPaymentMethodLabel(entry.method, null)
          const mp = isMpLeg(entry)
          const MethodIcon = getPaymentMethodIcon(entry.method)
          const canPayMoreWithThis = hasRemainingBalance && Boolean(onSelectLeg)

          return (
            <ListItem
              key={`${entry.method}-${index}`}
              icon={MethodIcon}
              title={methodLabel}
              description={
                <span className="text-brand-green">
                  {formatCurrency(received)}
                </span>
              }
              right={
                <div className="flex items-center gap-2">
                  {mp && onSyncMp && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        onSyncMp()
                      }}
                      isLoading={syncing}
                    >
                      Verificar
                    </Button>
                  )}
                  {canPayMoreWithThis && (
                    <Button
                      variant="link"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelectLeg?.(entry)
                      }}
                    >
                      Receber restante
                    </Button>
                  )}
                </div>
              }
              onClick={
                canPayMoreWithThis
                  ? () => onSelectLeg?.(entry)
                  : undefined
              }
              className="px-4 py-3"
            />
          )
        })}
      </div>
    </div>
  )
}

export { isMpLeg }
