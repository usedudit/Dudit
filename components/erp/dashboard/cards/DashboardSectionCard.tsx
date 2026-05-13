import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export function DashboardSectionCard({
  title,
  action,
  className,
  children,
}: {
  title: string
  action?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <section className={cn("overflow-hidden rounded-[24px] border border-brand-border bg-white shadow-sm shadow-brand-dark/5 dark:border-dark-border dark:bg-dark-surface", className)}>
      <div className="flex min-h-16 items-center justify-between gap-3 border-b border-brand-border px-5 py-4 dark:border-dark-border">
        <h2 className="text-[18px] font-bold text-brand-dark dark:text-dark-heading">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}
