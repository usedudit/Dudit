import React from "react"
import { Badge, Button } from "@/components/reusable"
import { formatCurrency } from "@/lib/utils"
import { formatPaymentMethodLabel } from "@/lib/utils/payment-method-label"
import type { PaymentBreakdownLeg } from "./payment-utils"

type DepositReceiptsSectionProps = {
  legs: PaymentBreakdownLeg[]
  orderNumber?: string
  onSyncMp?: () => void
  syncing?: boolean
}

function isMpLeg(entry: PaymentBreakdownLeg) {
  const method = String(entry.method || "").toLowerCase()
  const provider = String(entry.provider || "").toLowerCase()
  return provider.includes("mercado pago") || method.includes("mercado pago")
}

export function DepositReceiptsSection({ legs, orderNumber, onSyncMp, syncing = false }: DepositReceiptsSectionProps) {
  const receivedLegs = legs.filter((entry) => Number(entry.amountReceived || 0) > 0.009)
  if (receivedLegs.length === 0) return null

  return (
    <div className="space-y-3">
      <h4 className="text-sm text-brand-inactive-text dark:text-dark-body font-medium">
        Recebimentos confirmados{orderNumber ? ` - ${orderNumber}` : ""}
      </h4>
      {receivedLegs.map((entry, index) => {
        const received = Number(entry.amountReceived || 0)
        const methodLabel = formatPaymentMethodLabel(entry.method, null)
        const mp = isMpLeg(entry)
        return (
          <div
            key={`${entry.method}-${index}`}
            className="flex flex-col gap-2 p-4 border border-brand-border dark:border-dark-border rounded-xl bg-brand-gray/40 dark:bg-dark-border/20"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">{methodLabel}</span>
                <Badge variant="green">Recebido</Badge>
              </div>
              <span className="text-sm font-bold text-brand-green shrink-0">{formatCurrency(received)}</span>
            </div>
            {mp && onSyncMp && (
              <Button variant="outline" className="w-full h-9" onClick={onSyncMp} isLoading={syncing}>
                Confirmar pagamento manualmente (fallback)
              </Button>
            )}
          </div>
        )
      })}
    </div>
  )
}

export { isMpLeg }
