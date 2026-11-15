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
  const receivedLegs = legs.filter((entry) => Number(entry.amountReceived || 0) > 0.009)
  if (receivedLegs.length === 0) return null

  return (
    <div className="space-y-3">
      <h4 className="text-sm text-brand-inactive-text dark:text-dark-body font-medium">
        Recebimentos confirmados{orderNumber ? ` - ${orderNumber}` : ""}
      </h4>
      <div className="space-y-2">
        {receivedLegs.map((entry, index) => {
          const received = Number(entry.amountReceived || 0)
          const methodLabel = formatPaymentMethodLabel(entry.method, null)
          const mp = isMpLeg(entry)
          const MethodIcon = getPaymentMethodIcon(entry.method)
          const canPayMoreWithThis = hasRemainingBalance && Boolean(onSelectLeg)

          return (
            <ListItem
              key={`${entry.method}-${index}`}
              icon={MethodIcon}
              title={
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-brand-dark dark:text-dark-heading">
                    {methodLabel}
                  </span>
                  <Badge variant="green" className="scale-90 origin-left">
                    Recebido
                  </Badge>
                </div>
              }
              description={
                <span className="text-xs font-semibold text-brand-green">
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
