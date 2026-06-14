"use client"

import React from "react"
import { CreditCardIcon, MoneyIcon } from "@/lib/icons"

const PixIcon = ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12.0003 3.5858L4.2932 11.2929C3.9027 11.6834 3.9027 12.3166 4.2932 12.7071L12.0003 20.4142L19.7074 12.7071C20.0979 12.3166 20.0979 11.6834 19.7074 11.2929L12.0003 3.5858ZM12.0003 6.4142L17.5861 12L12.0003 17.5858L6.4145 12L12.0003 6.4142Z" />
    </svg>
)

export function PaymentMethodIndicator({ label, simplifyMultiple = true }: { label?: string | null; simplifyMultiple?: boolean }) {
    if (!label) return <span className="text-xs font-semibold text-brand-inactive-text dark:text-dark-body truncate">Não informado</span>
    
    const parts = label.split(",").map(p => p.trim()).filter(Boolean)
    if (parts.length > 1) {
        if (simplifyMultiple) {
            return <PaymentMethodIndicatorKeyed part="Múltiplos meios" />
        }
        return (
            <div className="flex flex-wrap gap-2 items-center">
                {parts.map((part, index) => (
                    <PaymentMethodIndicatorKeyed key={index} part={part} />
                ))}
            </div>
        )
    }
    
    return <PaymentMethodIndicatorKeyed part={parts[0] || label} />
}

function PaymentMethodIndicatorKeyed({ part }: { part: string }) {
    const normalized = part.toLowerCase()
    let icon: React.ReactNode = null
    let colorClass = "text-brand-inactive-text dark:text-dark-body"

    if (normalized.includes("multiplo") || normalized.includes("múltiplo")) {
        icon = <CreditCardIcon className="w-3.5 h-3.5 text-brand-inactive-text dark:text-dark-body" />
        colorClass = "text-brand-inactive-text dark:text-dark-body"
    } else if (normalized.includes("mercado") || normalized.includes("mp") || normalized.includes("mercado pago") || normalized.includes("mercadopago")) {
        icon = <img src="https://img.dudit.com.br/static/icons/payments/MercadoPago.png" alt="Mercado Pago" className="w-3.5 h-3.5 object-contain" />
        colorClass = "text-brand-blue dark:text-brand-blue"
    } else if (normalized.includes("pix")) {
        icon = <img src="https://img.dudit.com.br/static/icons/payments/Pix.png" alt="Pix" className="w-3.5 h-3.5 object-contain" />
        colorClass = "text-teal-700 dark:text-teal-400"
    } else if (normalized.includes("dinheiro") || normalized.includes("money") || normalized.includes("espécie") || normalized.includes("espece") || normalized.includes("cash") || normalized.includes("carteira")) {
        icon = <MoneyIcon className="w-3.5 h-3.5 text-brand-green" />
        colorClass = "text-emerald-700 dark:text-emerald-400"
    } else if (normalized.includes("cartão") || normalized.includes("cartao") || normalized.includes("credit") || normalized.includes("debit") || normalized.includes("visa") || normalized.includes("master") || normalized.includes("elo") || normalized.includes("card")) {
        icon = <CreditCardIcon className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
        colorClass = "text-indigo-700 dark:text-indigo-400"
    }

    return (
        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${colorClass}`}>
            {icon}
            <span>{part}</span>
        </span>
    )
}
