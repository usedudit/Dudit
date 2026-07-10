import React from "react"
import { Badge, Tooltip } from "@/components/reusable"
import { InfoIcon } from "@/lib/icons"
import { cn, formatCurrency } from "@/lib/utils"

const PaymentPricingTooltipBadge = React.memo(
  ({ calculation, baseAllocated }: { calculation: any; baseAllocated: number }) => {
    if (!calculation?.success) return null
    const base = Math.max(0, Number(baseAllocated || 0))
    const disc = Number(calculation.paymentMethodDiscountAmount || 0)
    const juros = Number(calculation.interestAmount || 0)
    const taxa = Number(calculation.feeAmount || 0)
    const custoMetodo = Number(calculation.fixedFeeAmount || 0)
    const final = Number(calculation.finalAmount || 0)

    const rows = [
      { label: "Subtotal", value: formatCurrency(base) },
      disc > 0 ? { label: "Desconto", value: `- ${formatCurrency(disc)}` } : null,
      juros > 0 ? { label: "Juros", value: `+ ${formatCurrency(juros)}` } : null,
      taxa > 0 ? { label: "Taxa", value: `+ ${formatCurrency(taxa)}` } : null,
      custoMetodo > 0 ? { label: "Custo do método", value: `+ ${formatCurrency(custoMetodo)}` } : null,
      { label: "Total a cobrar", value: formatCurrency(final), isTotal: true },
    ].filter(Boolean) as Array<{ label: string; value: string; isTotal?: boolean }>

    return (
      <Tooltip
        text={
          <div className="w-[240px] text-left">
            <div className="mb-2 font-bold">Detalhes do meio de pagamento</div>
            <div className="space-y-1.5">
              {rows.map((row) => (
                <div
                  key={`${row.label}-${row.value}`}
                  className={cn(
                    "flex justify-between items-center gap-3 min-w-0 w-full",
                    row.isTotal && "mt-2 border-t border-white/20 pt-2 font-bold dark:border-black/10",
                  )}
                >
                  <span className={cn("truncate min-w-0", !row.isTotal && "text-white/70 dark:text-black/60")} title={row.label}>
                    {row.label}
                  </span>
                  <span className="font-semibold shrink-0">{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        }
      >
        <span className="inline-flex shrink-0">
          <Badge variant="gray" icon={<InfoIcon className="w-3.5 h-3.5 text-brand-inactive-text dark:text-dark-body" />} className="cursor-help" />
        </span>
      </Tooltip>
    )
  },
)

PaymentPricingTooltipBadge.displayName = "PaymentPricingTooltipBadge"

/** Inline tooltip badge for merchant-absorbed costs (muted style) */
const AbsorbedCostsTooltipBadge = React.memo(
  ({ calculation }: { calculation: any }) => {
    if (!calculation?.success) return null
    const juros = Number(calculation.interestAmount || 0)
    const taxa = Number(calculation.feeAmount || 0)
    const custoMetodo = Number(calculation.fixedFeeAmount || 0)
    const totalAbsorbed = juros + taxa + custoMetodo
    if (totalAbsorbed <= 0.009) return null

    const rows = [
      juros > 0 ? { label: "Juros", value: formatCurrency(juros) } : null,
      taxa > 0 ? { label: "Taxa", value: formatCurrency(taxa) } : null,
      custoMetodo > 0 ? { label: "Custo do método", value: formatCurrency(custoMetodo) } : null,
      { label: "Total absorvido", value: formatCurrency(totalAbsorbed), isTotal: true },
    ].filter(Boolean) as Array<{ label: string; value: string; isTotal?: boolean }>

    return (
      <div className="flex items-center gap-1.5 mt-1">
        <span className="text-xs text-brand-inactive-text dark:text-dark-body/60">
          {formatCurrency(totalAbsorbed)} em taxas/juros absorvidos
        </span>
        <Tooltip
          text={
            <div className="w-[220px] text-left">
              <div className="mb-2 font-bold">Custos absorvidos pela empresa</div>
              <div className="space-y-1.5">
                {rows.map((row) => (
                  <div
                    key={`abs-${row.label}`}
                    className={cn(
                      "flex justify-between items-center gap-3 min-w-0 w-full",
                      row.isTotal && "mt-2 border-t border-white/20 pt-2 font-bold dark:border-black/10",
                    )}
                  >
                    <span className={cn("truncate min-w-0", !row.isTotal && "text-white/70 dark:text-black/60")} title={row.label}>
                      {row.label}
                    </span>
                    <span className="font-semibold shrink-0">{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          }
        >
          <span className="inline-flex shrink-0 cursor-help">
            <InfoIcon className="w-3 h-3 text-brand-inactive-text/60 dark:text-dark-body/40" />
          </span>
        </Tooltip>
      </div>
    )
  },
)

AbsorbedCostsTooltipBadge.displayName = "AbsorbedCostsTooltipBadge"

export const PaymentAmountLabel = React.memo(
  ({
    label,
    calculation,
    baseAllocated,
    flatAmount = false,
  }: {
    label: string
    calculation: any
    baseAllocated: number
    flatAmount?: boolean
  }) => {
    const isMerchantBearer = calculation?.feeBearer === "merchant"
    const hasAdjustment = calculation?.success && baseAllocated > 0.009

    return (
      <div className="mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{label}</span>
          {!flatAmount && hasAdjustment ? (
            <PaymentPricingTooltipBadge calculation={calculation} baseAllocated={baseAllocated} />
          ) : null}
        </div>
        {!flatAmount && hasAdjustment && isMerchantBearer ? (
          <AbsorbedCostsTooltipBadge calculation={calculation} />
        ) : null}
      </div>
    )
  },
)

PaymentAmountLabel.displayName = "PaymentAmountLabel"

