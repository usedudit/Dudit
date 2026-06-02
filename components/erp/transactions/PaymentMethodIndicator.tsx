"use client"

import React from "react"
import { CreditCardIcon, MoneyIcon } from "@/lib/icons"

const PixIcon = ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12.0003 3.5858L4.2932 11.2929C3.9027 11.6834 3.9027 12.3166 4.2932 12.7071L12.0003 20.4142L19.7074 12.7071C20.0979 12.3166 20.0979 11.6834 19.7074 11.2929L12.0003 3.5858ZM12.0003 6.4142L17.5861 12L12.0003 17.5858L6.4145 12L12.0003 6.4142Z" />
    </svg>
)

export function PaymentMethodIndicator({ label }: { label?: string | null }) {
    if (!label) return <span className="text-[11px] font-semibold text-brand-inactive-text dark:text-dark-body">Não informado</span>
    const normalized = label.toLowerCase()

    let icon: React.ReactNode = null
    let colorClass = "bg-brand-gray text-brand-inactive-text dark:bg-dark-border dark:text-dark-body border border-brand-border dark:border-dark-border"

    if (normalized.includes("mercado") || normalized.includes("mp") || normalized.includes("mercado pago") || normalized.includes("mercadopago")) {
        icon = <img src="https://img.dudit.com.br/static/icons/payments/MercadoPago.png" alt="Mercado Pago" className="w-3.5 h-3.5 object-contain" />
        colorClass = "bg-blue-50 text-blue-700 dark:bg-blue-950/20 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30"
    } else if (normalized.includes("pix")) {
        icon = <PixIcon className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
        colorClass = "bg-teal-50 text-teal-700 dark:bg-teal-950/20 dark:text-teal-400 border border-teal-100 dark:border-teal-900/30"
    } else if (normalized.includes("dinheiro") || normalized.includes("money") || normalized.includes("espécie") || normalized.includes("espece") || normalized.includes("cash") || normalized.includes("carteira")) {
        icon = <MoneyIcon className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
        colorClass = "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30"
    } else if (normalized.includes("cartão") || normalized.includes("cartao") || normalized.includes("credit") || normalized.includes("debit") || normalized.includes("visa") || normalized.includes("master") || normalized.includes("elo") || normalized.includes("card")) {
        icon = <CreditCardIcon className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
        colorClass = "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/20 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/30"
    }

    return (
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold tracking-wide ${colorClass}`}>
            {icon}
            <span>{label}</span>
        </span>
    )
}
