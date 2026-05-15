import { getGeneralAlerts, type AlertItem } from "@/lib/data/dashboard"
import { DashboardSectionCard } from "../../cards/DashboardSectionCard"
import {
    AlertCircleIcon,
    CreditCardIcon,
    ShoppingCartIcon,
    PackageIcon,
    CalendarIcon,
    TruckIcon,
    CheckCircleIcon,
} from "@/lib/icons"

const iconMap: Record<string, any> = {
    "credit-card": CreditCardIcon,
    cart: ShoppingCartIcon,
    package: PackageIcon,
    calendar: CalendarIcon,
    truck: TruckIcon,
}

const toneColors: Record<AlertItem["tone"], string> = {
    red: "text-brand-red",
    orange: "text-yellow-600 dark:text-yellow-400",
    blue: "text-blue-600 dark:text-blue-400",
}

const toneBg: Record<AlertItem["tone"], string> = {
    red: "bg-red-50 dark:bg-red-900/10",
    orange: "bg-yellow-50 dark:bg-yellow-900/10",
    blue: "bg-blue-50 dark:bg-blue-900/10",
}

export async function AlertsWidget({ partnerId, sells }: { partnerId: string; sells: string[] }) {
    const { alerts } = await getGeneralAlerts(partnerId, sells)

    if (alerts.length === 0) {
        return (
            <DashboardSectionCard title="Precisa de atenção">
                <div className="flex items-center gap-3 py-1">
                    <div className="w-10 h-10 rounded-full bg-brand-green/10 flex items-center justify-center shrink-0">
                        <CheckCircleIcon className="h-5 w-5 text-brand-green" />
                    </div>
                    <div>
                        <h2 className="text-[15px] font-bold text-brand-dark dark:text-dark-heading">Tudo em dia</h2>
                        <p className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Nenhum alerta no momento</p>
                    </div>
                </div>
            </DashboardSectionCard>
        )
    }

    return (
        <DashboardSectionCard title="Precisa de atenção" className="h-full">
            <div className="divide-y divide-brand-border dark:divide-dark-border -mx-6 -mb-6 border-t border-brand-border dark:border-dark-border">
                {alerts.map((alert) => {
                    const Icon = iconMap[alert.icon] || AlertCircleIcon
                    return (
                        <div key={alert.id} className="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-brand-gray/50 dark:hover:bg-dark-border/10">
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${toneBg[alert.tone]}`}>
                                <Icon className={`h-4 w-4 ${toneColors[alert.tone]}`} />
                            </div>
                            <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading flex-1 truncate">
                                {alert.message}
                            </span>
                            <span className={`text-[14px] font-bold tabular-nums ${toneColors[alert.tone]}`}>
                                {alert.count}
                            </span>
                        </div>
                    )
                })}
            </div>
        </DashboardSectionCard>
    )
}
