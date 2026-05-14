import type { Metric } from "@/lib/data/dashboard"
import { cn } from "@/lib/utils"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  MoneyIcon,
  ShoppingCartIcon,
  CalendarIcon,
  CreditCardIcon,
  Package as PackageIcon,
  FileIcon,
  TrendingUpIcon
} from "@/lib/icons"

const getIcon = (title: string) => {
  const t = title.toLowerCase()
  if (t.includes("receita") || t.includes("vendas") || t.includes("financeiro")) return MoneyIcon
  if (t.includes("pedido")) return ShoppingCartIcon
  if (t.includes("agendamento")) return CalendarIcon
  if (t.includes("conta")) return CreditCardIcon
  if (t.includes("estoque")) return PackageIcon
  if (t.includes("ordem") || t.includes("os")) return FileIcon
  return TrendingUpIcon
}

export function DashboardMetricCard({ metric, isLast }: { metric: Metric; isLast?: boolean }) {
  const Icon = getIcon(metric.title)
  const trendPositive = metric.trend?.trim().startsWith("+")
  const TrendIcon = trendPositive ? ArrowUpIcon : ArrowDownIcon

  return (
    <div className={cn(
      "flex flex-col gap-2 p-6",
      !isLast && "border-b md:border-b-0 md:border-r border-brand-border dark:border-dark-border"
    )}>
      {/* Icon + Title */}
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-gray/50 dark:bg-dark-border/50">
          <Icon className="h-4 w-4 text-brand-dark dark:text-dark-heading" />
        </div>
        <span className="text-[14px] font-bold text-brand-inactive-text dark:text-dark-body">
          {metric.title}
        </span>
      </div>

      {/* Value */}
      <div className="mt-1">
        <span className="text-[32px] font-bold tracking-tight text-brand-dark dark:text-dark-heading leading-tight">
          {metric.value}
        </span>
      </div>

      {/* Trend */}
      <div className="flex flex-wrap items-center gap-1.5">
        {metric.trend && (
          <span className={cn(
            "flex items-center gap-1 text-[13px] font-bold",
            trendPositive ? "text-brand-green" : "text-brand-red"
          )}>
            <TrendIcon className="h-3.5 w-3.5" />
            {metric.trend}
          </span>
        )}
        {metric.detail && (
          <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body">
            {metric.detail}
          </span>
        )}
      </div>
    </div>
  )
}
