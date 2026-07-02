import React from "react"
import {
  CreditCardIcon,
  MoneyIcon,
  QRCodeIcon,
  FileIcon,
  TagIcon,
  ColumnsIcon as SplitIcon,
} from "@/lib/icons"
import { PaymentMethodCard } from "@/components/erp/POSComponents"
import { normalizeMethodType, type PartnerPaymentMethod } from "./payment-utils"

type PaymentMethodSelectorProps = {
  availableMethodTypes: Set<string>
  isLoading?: boolean
  disabled?: boolean
  showMercadoPago?: boolean
  mpConnected?: boolean
  onSelectCash: () => void
  onSelectPix: () => void
  onSelectCreditCard: () => void
  onSelectDebitCard: () => void
  onSelectBankTransfer: () => void
  onSelectOther: () => void
  onSelectSplit: () => void
  onSelectMercadoPago?: () => void
}

export function PaymentMethodSelector({
  availableMethodTypes,
  isLoading = false,
  disabled = false,
  showMercadoPago = false,
  mpConnected = false,
  onSelectCash,
  onSelectPix,
  onSelectCreditCard,
  onSelectDebitCard,
  onSelectBankTransfer,
  onSelectOther,
  onSelectSplit,
  onSelectMercadoPago,
}: PaymentMethodSelectorProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="flex flex-col items-center justify-center gap-2 h-28 rounded-2xl border border-brand-border dark:border-dark-border bg-gray-50 dark:bg-dark-border/10 animate-pulse"
          >
            <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-dark-border/50" />
            <div className="h-3 w-20 bg-gray-200 dark:bg-dark-border/50 rounded" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      {availableMethodTypes.has("cash") && (
        <PaymentMethodCard icon={MoneyIcon} label="Dinheiro" disabled={disabled} onClick={onSelectCash} />
      )}
      {availableMethodTypes.has("pix") && (
        <PaymentMethodCard icon={QRCodeIcon} label="Pix" disabled={disabled} onClick={onSelectPix} />
      )}
      {availableMethodTypes.has("credit_card") && (
        <PaymentMethodCard icon={CreditCardIcon} label="Cartão de Crédito" disabled={disabled} onClick={onSelectCreditCard} />
      )}
      {availableMethodTypes.has("debit_card") && (
        <PaymentMethodCard icon={CreditCardIcon} label="Cartão de Débito" disabled={disabled} onClick={onSelectDebitCard} />
      )}
      {availableMethodTypes.has("bank_transfer") && (
        <PaymentMethodCard icon={FileIcon} label="Transferência" disabled={disabled} onClick={onSelectBankTransfer} />
      )}
      {availableMethodTypes.has("other") && (
        <PaymentMethodCard icon={TagIcon} label="Outros" disabled={disabled} onClick={onSelectOther} />
      )}
      <PaymentMethodCard icon={SplitIcon} label="Dividir" disabled={disabled} onClick={onSelectSplit} />
      {showMercadoPago && mpConnected && onSelectMercadoPago && (
        <button
          type="button"
          onClick={onSelectMercadoPago}
          disabled={disabled}
          className="flex flex-col items-center justify-center gap-2 h-28 rounded-2xl border border-brand-border dark:border-dark-border transition-colors group bg-white dark:bg-dark-surface hover:bg-gray-50 dark:hover:bg-dark-border/20 disabled:opacity-50"
        >
          <div className="w-10 h-10 rounded-full bg-[#00b1ea]/10 flex items-center justify-center overflow-hidden">
            <img src="https://img.dudit.com.br/static/icons/payments/MercadoPago.png" alt="MP" className="w-6 h-6 object-contain" />
          </div>
          <span className="font-bold text-xs text-brand-dark dark:text-dark-heading">Mercado Pago</span>
        </button>
      )}
    </div>
  )
}

export function buildAvailableMethodTypes(methods: PartnerPaymentMethod[]): Set<string> {
  const types = new Set(methods.filter((m) => m.is_active !== false).map((m) => normalizeMethodType(m.type)))
  types.add("cash")
  return types
}

export function MethodGridForPartnerMethods({
  methods,
  onSelect,
}: {
  methods: PartnerPaymentMethod[]
  onSelect: (method: PartnerPaymentMethod) => void
}) {
  return (
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
          <PaymentMethodCard
            key={method.id}
            icon={MethodIcon}
            label={method.name}
            onClick={() => onSelect(method)}
          />
        )
      })}
    </div>
  )
}
