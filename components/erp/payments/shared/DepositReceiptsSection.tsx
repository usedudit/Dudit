import React, { useState } from "react"
import { Badge, Button, ListItem } from "@/components/reusable"
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
  ChevronDownIcon,
  ChevronUpIcon,
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
  const [expandedIndices, setExpandedIndices] = useState<Set<number>>(new Set())

  const toggleExpanded = (index: number) => {
    setExpandedIndices((prev) => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }

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
          const isExpanded = expandedIndices.has(index)
          const canExpand = isCreditCard || totalInstCount > 1 || hasLedgerInstallments
          const canPayMoreWithThis = hasRemainingBalance && Boolean(onSelectLeg)

          // Subtítulo do método (ex: "3x de R$ 300,00" ou "À vista (1x)")
          const installmentSubtitle = isCreditCard
            ? totalInstCount > 1
              ? `${totalInstCount}x de ${formatCurrency(received / totalInstCount)}`
              : "À vista (1x)"
            : null

          return (
            <div key={`${entry.method}-${index}`} className="flex flex-col">
              <ListItem
                icon={MethodIcon}
                title={
                  <div className="flex items-center gap-2 flex-wrap">
                    <span>{methodLabel}</span>
                    {installmentSubtitle && (
                      <span className="text-xs font-normal text-brand-inactive-text dark:text-dark-body">
                        • {installmentSubtitle}
                      </span>
                    )}
                    {hasLedgerInstallments && totalInstCount > 1 && (
                      <Badge variant={paidInstCount === totalInstCount ? "green" : "gray"} icon={null}>
                        {paidInstCount}/{totalInstCount} pagas
                      </Badge>
                    )}
                  </div>
                }
                description={
                  <span className="text-brand-green font-semibold">
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
                    {canExpand && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleExpanded(index)
                        }}
                        className="text-xs flex items-center gap-1"
                      >
                        {isExpanded ? "Ocultar parcelas" : "Ver parcelas"}
                        {isExpanded ? (
                          <ChevronUpIcon className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDownIcon className="w-3.5 h-3.5" />
                        )}
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
                  canExpand
                    ? () => toggleExpanded(index)
                    : canPayMoreWithThis
                      ? () => onSelectLeg?.(entry)
                      : undefined
                }
                className="px-4 py-3"
              />

              {/* Seção expandida de parcelas */}
              {isExpanded && canExpand && (
                <div className="mt-2 ml-4 pl-3 border-l-2 border-brand-border dark:border-dark-border space-y-2">
                  {hasLedgerInstallments ? (
                    matchingInstallments.map((inst) => {
                      const isPaid = inst.status === "paid"
                      const isOverdue = inst.status === "overdue"
                      return (
                        <div
                          key={inst.id}
                          className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl bg-brand-gray/60 dark:bg-dark-border/20 border border-brand-border/60 dark:border-dark-border/40 gap-2"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-brand-primary/10 dark:bg-brand-primary/20 flex items-center justify-center text-brand-primary shrink-0">
                              <InstallmentIcon className="w-3.5 h-3.5" />
                            </div>
                            <div>
                              <span className="font-semibold text-xs text-brand-dark dark:text-dark-heading block">
                                Parcela {inst.installmentNumber} de {inst.totalInstallments}
                              </span>
                              <span className="text-[11px] text-brand-inactive-text dark:text-dark-body">
                                {isPaid
                                  ? `Pago ${inst.paymentDate ? `em ${formatBrazilDateFromDbInput(String(inst.paymentDate).slice(0, 10), "dayMonthYear")}` : ""}`
                                  : `Vencimento: ${inst.dueDate ? formatBrazilDateFromDbInput(String(inst.dueDate).slice(0, 10), "dayMonthYear") : "-"}`}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center justify-between sm:justify-end gap-2.5">
                            <span className="font-bold text-xs text-brand-dark dark:text-dark-heading">
                              {formatCurrency(inst.originalAmount)}
                            </span>
                            {isPaid ? (
                              <Badge variant="green">Pago</Badge>
                            ) : isOverdue ? (
                              <Badge variant="red">Atrasada</Badge>
                            ) : (
                              <Badge variant="orange">Pendente</Badge>
                            )}
                            {!isPaid && onPayInstallment && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs px-2.5"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onPayInstallment(inst)
                                }}
                              >
                                Receber parcela
                              </Button>
                            )}
                          </div>
                        </div>
                      )
                    })
                  ) : (
                    <div className="p-3 rounded-xl bg-brand-gray/40 dark:bg-dark-border/10 border border-brand-border/40 text-xs text-brand-inactive-text dark:text-dark-body">
                      {totalInstCount > 1
                        ? `Venda parcelada em ${totalInstCount}x de ${formatCurrency(received / totalInstCount)}.`
                        : "Venda à vista (1x) já liquidada no faturamento."}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export { isMpLeg }
