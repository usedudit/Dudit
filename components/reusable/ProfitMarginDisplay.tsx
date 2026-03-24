import type React from "react"

interface ProfitMarginDisplayProps {
  cost: number
  sale: number
}

const formatAsCurrency = (value: number): string => {
  if (typeof value !== "number" || isNaN(value)) {
    value = 0
  }
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value)
}

export const ProfitMarginDisplay: React.FC<ProfitMarginDisplayProps> = ({ cost, sale }) => {
  const profitValue = sale - cost
  const profitMargin = sale > 0 && cost > 0 ? (profitValue / cost) * 100 : 0

  const displayValue =
    profitValue >= 0 && sale > 0
      ? `${profitMargin.toFixed(2).replace(".", ",")}% (${formatAsCurrency(profitValue)})`
      : "-"

  return (
    <div className="flex-1 w-full">
      <label className="block text-sm font-medium text-brand-dark/80 dark:text-dark-body mb-1.5 truncate">
        Margem de Lucro
      </label>
      <div className="relative flex items-center">
        <input
          type="text"
          value={displayValue}
          disabled
          className="w-full bg-brand-gray dark:bg-dark-border/30 border border-brand-border dark:border-dark-border rounded-lg py-2.5 px-4 text-sm focus:outline-none text-brand-dark dark:text-dark-heading placeholder:text-brand-dark/70 dark:placeholder:text-dark-heading/70 transition-colors"
        />
      </div>
    </div>
  )
}
