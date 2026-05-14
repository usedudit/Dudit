import type { ReactNode, ComponentType } from "react"
import { cn } from "@/lib/utils"

export function DashboardSectionCard({
  title,
  icon: Icon,
  action,
  className,
  children,
}: {
  title: string
  icon?: ComponentType<{ className?: string }>
  action?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <section className={cn("overflow-hidden rounded-2xl border border-brand-border bg-white shadow-sm shadow-brand-dark/5 dark:border-dark-border dark:bg-dark-surface", className)}>
      <div className="flex min-h-16 items-center justify-between gap-3 px-6 py-4">
        <div className="flex items-center gap-3">
          {Icon && (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-gray/50 dark:bg-dark-border/50">
              <Icon className="h-5 w-5 text-brand-dark dark:text-dark-heading" />
            </div>
          )}
          <h2 className="text-lg font-bold text-brand-dark dark:text-dark-heading">{title}</h2>
        </div>
        {action}
      </div>
      <div className="px-6 pb-6">
        {children}
      </div>
    </section>
  )
}

