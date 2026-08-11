import Link from "next/link"
import type { DashboardTab } from "@/lib/data/dashboard"
import { cn } from "@/lib/utils"

const tabs: Array<{ value: DashboardTab; label: string }> = [
  { value: "geral", label: "Geral" },
  { value: "produtos", label: "Produtos" },
  { value: "servicos", label: "Serviços" },
  { value: "financeiro", label: "Financeiro" },
  { value: "operacao", label: "Operação" },
]

export function DashboardTabs({ active }: { active: DashboardTab }) {
  return (
    <div className="overflow-x-auto pb-1">
      <div className="inline-flex min-w-max items-center rounded-xl border border-brand-border bg-brand-gray/50 p-1 dark:border-dark-border dark:bg-dark-background">
        {tabs.map((tab) => (
          <Link
            key={tab.value}
            href={`/erp/painel?tab=${tab.value}`}
            prefetch={false}
            className={cn(
              "h-9 rounded-lg px-4 text-[13px] font-bold transition-all",
              active === tab.value
                ? "bg-white text-brand-dark shadow-sm dark:bg-dark-surface dark:text-dark-heading"
                : "text-brand-inactive-text hover:text-brand-dark dark:text-dark-body dark:hover:text-dark-heading",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>
    </div>
  )
}
