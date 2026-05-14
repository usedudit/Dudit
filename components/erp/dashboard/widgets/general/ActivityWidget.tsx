import { getGeneralActivity, type ActivityItem } from "@/lib/data/dashboard"
import { DashboardSectionCard } from "../../cards/DashboardSectionCard"
import { ClockIcon, ShoppingCartIcon, MoneyIcon, Package as PackageIcon, CalendarIcon, WrenchIcon, UserIcon, TruckIcon, FileIcon } from "@/lib/icons"
import { cn } from "@/lib/utils"

const iconMap: Record<string, any> = {
    cart: ShoppingCartIcon,
    money: MoneyIcon,
    package: PackageIcon,
    calendar: CalendarIcon,
    wrench: WrenchIcon,
    user: UserIcon,
    truck: TruckIcon,
    file: FileIcon,
}

const toneClasses: Record<ActivityItem["tone"], string> = {
    green: "text-brand-green",
    blue: "text-blue-600 dark:text-blue-400",
    orange: "text-yellow-600 dark:text-yellow-400",
    red: "text-brand-red",
    default: "text-brand-inactive-text dark:text-dark-body",
}

const toneBgClasses: Record<ActivityItem["tone"], string> = {
    green: "bg-brand-green/10",
    blue: "bg-blue-50 dark:bg-blue-900/10",
    orange: "bg-yellow-50 dark:bg-yellow-900/10",
    red: "bg-red-50 dark:bg-red-900/10",
    default: "bg-brand-slate dark:bg-dark-border/50",
}

export async function ActivityWidget({ partnerId }: { partnerId: string }) {
    const { activity } = await getGeneralActivity(partnerId)

    if (activity.length === 0) return null

    return (
        <DashboardSectionCard title="Atividade recente" icon={ClockIcon}>
            <div className="space-y-0 -mx-6 -mb-6">
                {activity.map((item, i) => {
                    const Icon = iconMap[item.icon] || FileIcon
                    return (
                        <div
                            key={item.id}
                            className={cn(
                                "flex items-center gap-3.5 px-6 py-3",
                                i < activity.length - 1 && "border-b border-brand-border dark:border-dark-border"
                            )}
                        >
                            <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0", toneBgClasses[item.tone])}>
                                <Icon className={cn("h-4 w-4", toneClasses[item.tone])} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-[13px] font-bold text-brand-dark dark:text-dark-heading truncate">
                                    {item.title}
                                </p>
                                <p className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate">
                                    {item.description}
                                </p>
                            </div>
                            <span className="text-[11px] font-bold text-brand-inactive-text dark:text-dark-body whitespace-nowrap shrink-0">
                                {item.time}
                            </span>
                        </div>
                    )
                })}
            </div>
        </DashboardSectionCard>
    )
}
