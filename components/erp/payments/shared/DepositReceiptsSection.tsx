import React, { useState } from "react"
import { Badge, Button, ListItem, DefaultModal } from "@/components/reusable"
import { formatCurrency } from "@/lib/utils"
import { formatPaymentMethodLabel } from "@/lib/utils/payment-method-label"
import { formatBrazilDateFromDbInput } from "@/lib/utils/formatters"
import { normalizePaymentMethodKey } from "@/lib/payments/payment-ledger"
import {
  QRCodeIcon,
  MoneyIcon,
  CreditCardIcon,
  FileIcon,
  TagIcon,
  InstallmentIcon,
} from "@/lib/icons"
import type { PaymentBreakdownLeg } from "./payment-utils"
import type { OrderInstallmentItem } from "@/app/actions/erp/transactions"

type DepositReceiptsSectionProps = {
  legs: PaymentBreakdownLeg[]
  orderNumber?: string
  onSyncMp?: () => void
  syncing?: boolean
  onSelectLeg?: (leg: PaymentBreakdownLeg) => void
  hasRemainingBalance?: boolean
  installments?: OrderInstallmentItem[]
  onPayInstallment?: (installment: OrderInstallmentItem) => void
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
  installments = [],
  onPayInstallment,
}: DepositReceiptsSectionProps) {
  const [selectedLegForInstallmentsModal, setSelectedLegForInstallmentsModal] = useState<{
    leg: PaymentBreakdownLeg
    installments: OrderInstallmentItem[]
  } | null>(null)

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
        if (!existing.installmentNumber && entry.installmentNumber) {
          existing.installmentNumber = entry.installmentNumber
        }
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
          const normKey = normalizePaymentMethodKey(String(entry.method || ""))
          const isCreditCard = normKey === "credit_card"

          const parsedMatch = String(entry.method || "").match(/\((\d+)x\)/i)
          const declaredInstallments = entry.installmentNumber && entry.installmentNumber > 1
            ? entry.installmentNumber
            : parsedMatch ? parseInt(parsedMatch[1], 10) : 1

          const matchingInstallments = (installments || []).filter((inst) => {
            if (entry.paymentMethodId && inst.paymentMethodId) {
              return String(entry.paymentMethodId) === String(inst.paymentMethodId)
            }
            return isCreditCard
          })
          const hasLedgerInstallments = matchingInstallments.length > 0
          const totalInstCount = hasLedgerInstallments ? matchingInstallments.length : declaredInstallments
          const paidInstCount = matchingInstallments.filter((i) => i.status === "paid").length
          const hasInstallments = totalInstCount > 1 || hasLedgerInstallments
          const canPayMoreWithThis = !hasInstallments && !isCreditCard && hasRemainingBalance && Boolean(onSelectLeg)

          // Subtítulo do método (ex: "3x de R$ 300,00" ou "À vista (1x)")
          const installmentSubtitle = totalInstCount > 1
            ? `${totalInstCount}x de ${formatCurrency(received / totalInstCount)}`
            : isCreditCard
              ? "À vista (1x)"
              : null

          return (
            <div key={`${entry.method}-${index}`} className="flex flex-col">
              <ListItem
                icon={MethodIcon}
                title={
                  <div className="flex items-center gap-2 flex-wrap">
                    <span>{methodLabel}</span>
                    {totalInstCount > 1 && (
                      <Badge
                        variant={hasLedgerInstallments && paidInstCount === totalInstCount ? "green" : "gray"}
                        icon={null}
                      >
                        {hasLedgerInstallments
                          ? `${paidInstCount}/${totalInstCount} pagas`
                          : `${totalInstCount}x`}
                      </Badge>
                    )}
                  </div>
                }
                description={
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-brand-green font-semibold">
                      {formatCurrency(received)}
                    </span>
                    {installmentSubtitle && (
                      <span className="text-xs font-normal text-brand-inactive-text dark:text-dark-body">
                        • {installmentSubtitle}
                      </span>
                    )}
                  </div>
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
                    {hasInstallments ? (
                      <Button
                        variant="link"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedLegForInstallmentsModal({
                            leg: entry,
                            installments: matchingInstallments,
                          })
                        }}
                      >
                        Ver parcelas
                      </Button>
                    ) : canPayMoreWithThis ? (
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
                    ) : null}
                  </div>
                }
                onClick={
                  hasInstallments
                    ? () =>
                        setSelectedLegForInstallmentsModal({
                          leg: entry,
                          installments: matchingInstallments,
                        })
                    : canPayMoreWithThis
                      ? () => onSelectLeg?.(entry)
                      : undefined
                }
                className="px-4 py-3"
              />
            </div>
          )
        })}
      </div>

      {selectedLegForInstallmentsModal && (
        <DefaultModal
          isOpen={Boolean(selectedLegForInstallmentsModal)}
          onClose={() => setSelectedLegForInstallmentsModal(null)}
          title={`Parcelas - ${formatPaymentMethodLabel(selectedLegForInstallmentsModal.leg.method, null)}`}
          maxWidth="md"
        >
          <div className="space-y-2 py-2">
            {selectedLegForInstallmentsModal.installments.length > 0 ? (
              selectedLegForInstallmentsModal.installments.map((inst) => {
                const isPaid = inst.status === "paid"
                const isOverdue = inst.status === "overdue"
                return (
                  <ListItem
                    key={inst.id}
                    icon={InstallmentIcon}
                    title={
                      <div className="flex items-center gap-2 flex-wrap">
                        <span>
                          Parcela {inst.installmentNumber} de {inst.totalInstallments}
                        </span>
                        <Badge
                          variant={isPaid ? "green" : isOverdue ? "red" : "orange"}
                          icon={null}
                        >
                          {isPaid ? "Pago" : isOverdue ? "Atrasada" : "Pendente"}
                        </Badge>
                      </div>
                    }
                    description={
                      <span className="text-brand-inactive-text dark:text-dark-body text-xs">
                        {isPaid
                          ? `Pago ${inst.paymentDate ? `em ${formatBrazilDateFromDbInput(String(inst.paymentDate).slice(0, 10), "dayMonthYear")}` : ""}`
                          : `Vencimento: ${inst.dueDate ? formatBrazilDateFromDbInput(String(inst.dueDate).slice(0, 10), "dayMonthYear") : "-"}`}{" "}
                        • {formatCurrency(inst.originalAmount)}
                      </span>
                    }
                    right={
                      !isPaid && onPayInstallment ? (
                        <Button
                          variant="link"
                          size="sm"
                          onClick={() => {
                            setSelectedLegForInstallmentsModal(null)
                            onPayInstallment(inst)
                          }}
                        >
                          Receber parcela
                        </Button>
                      ) : undefined
                    }
                    className="px-4 py-3"
                  />
                )
              })
            ) : (
              <div className="p-4 text-center text-sm text-brand-inactive-text dark:text-dark-body">
                {(() => {
                  const receivedAmount = Number(
                    selectedLegForInstallmentsModal.leg.amountReceived ||
                      selectedLegForInstallmentsModal.leg.amount ||
                      0
                  )
                  const count =
                    selectedLegForInstallmentsModal.leg.installmentNumber || 1
                  return count > 1
                    ? `Venda parcelada em ${count}x de ${formatCurrency(receivedAmount / count)}. As parcelas serão geradas ou listadas conforme o faturamento.`
                    : "Venda à vista (1x) já liquidada no faturamento."
                })()}
              </div>
            )}
          </div>
        </DefaultModal>
      )}
    </div>
  )
}

export { isMpLeg }
