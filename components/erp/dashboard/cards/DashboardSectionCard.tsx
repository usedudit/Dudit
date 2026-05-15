import type { ReactNode, ComponentType } from "react"
import { cn } from "@/lib/utils"

export function DashboardSectionCard({
    title,
    icon: Icon,
    action,
    className,
    children,
}: {
    title: ReactNode
    icon?: ComponentType<{ className?: string }>
    action?: ReactNode
    className?: string
    children: ReactNode
}) {
    return (
        <section className={cn("overflow-hidden rounded-2xl border border-brand-border bg-white shadow-sm shadow-brand-dark/5 dark:border-dark-border dark:bg-dark-surface", className)}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-6 py-5">
                <div className="flex items-center gap-2">
                    {Icon && <Icon className="h-5 w-5 text-brand-dark dark:text-dark-heading opacity-80" />}
                    <h2 className="text-[17px] font-bold text-brand-dark dark:text-dark-heading flex items-center gap-1.5">
                        {title}
                    </h2>
                </div>
                {action}
            </div>
            <div className="px-6 pb-6">
                {children}
            </div>
        </section>
    )
}

