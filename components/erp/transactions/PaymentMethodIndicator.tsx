"use client"

import React from "react"
import { CreditCardIcon, MoneyBagIcon, MultiplePaymentsIcon } from "@/lib/icons"
import { formatPaymentMethodLabel } from "@/lib/utils/payment-method-label"

export function PaymentMethodIndicator({
    label,
    provider,
    simplifyMultiple = true,
    simplify = false
}: {
    label?: string | null
    provider?: string | null
    simplifyMultiple?: boolean
    simplify?: boolean
}) {
    if (!label) return <span className="text-xs font-semibold text-brand-inactive-text dark:text-dark-body truncate">Não informado</span>

    const parts = splitPaymentMethodLabels(label)
        .map(p => p.trim())
        .filter(Boolean)
        .map(p => formatPaymentMethodLabel(p, null))
        .filter(Boolean)

    if (parts.length > 1) {
        if (simplifyMultiple) {
            return <PaymentMethodIndicatorKeyed part="Múltiplos meios" provider={provider} simplify={simplify} />
        }
        return (
            <div className="flex flex-wrap gap-2 items-center">
                {parts.map((part, index) => (
                    <PaymentMethodIndicatorKeyed key={index} part={part} provider={provider} simplify={simplify} />
                ))}
            </div>
        )
    }

    return <PaymentMethodIndicatorKeyed part={parts[0] || label} provider={provider} simplify={simplify} />
}

function splitPaymentMethodLabels(label: string): string[] {
    const parts: string[] = []
    let current = ""
    let depth = 0
    for (const char of label) {
        if (char === "(") depth += 1
        else if (char === ")") depth = Math.max(0, depth - 1)

        if (char === "," && depth === 0) {
            parts.push(current)
            current = ""
        } else {
            current += char
        }
    }
    parts.push(current)
    return parts
}

function PaymentMethodIndicatorKeyed({ part, provider, simplify = false }: { part: string; provider?: string | null; simplify?: boolean }) {
    const displayPart = simplify ? (() => {
        let targetPart = part
        const lower = part.toLowerCase()
        if (lower.startsWith("mercado pago (") || lower.startsWith("mercadopago (")) {
            const match = part.match(/^(?:mercado\s*pago|mercadopago)\s*\(([^)]+)\)$/i)
            if (match) {
                const sub = match[1].trim()
                const capitalizedSub = sub.charAt(0).toUpperCase() + sub.slice(1)
                targetPart = `${capitalizedSub} (Mercado Pago)`
            }
        }

        const normalized = targetPart.toLowerCase()
        if (normalized.includes("mercado pago") || normalized.includes("mercadopago")) {
            return targetPart
        }
        const match = targetPart.match(/^([^(]+)\s*\(([^)]+)\)$/)
        if (match) {
            return match[1].trim()
        }
        return targetPart
    })() : part

    const normalized = displayPart.toLowerCase()
    let icons: React.ReactNode[] = []
    let colorClass = "text-brand-inactive-text dark:text-dark-body"

    if (normalized.includes("vale-compra") || normalized.includes("vale_compra") || normalized.includes("store_credit") || normalized.includes("store credit") || normalized.includes("voucher")) {
        icons.push(
            <img
                key="vc"
                src="https://img.dudit.com.br/static/icons/payments/Voucher.png"
                alt="Vale-compra"
                className="w-3.5 h-3.5 object-contain"
            />
        )
        colorClass = "text-brand-dark dark:text-dark-heading"
    } else if (normalized.includes("mercado pago") || normalized.includes("mercadopago")) {
        icons.push(
            <img
                key="mp"
                src="https://img.dudit.com.br/static/icons/payments/MercadoPago.png"
                alt="Mercado Pago"
                className="w-3.5 h-3.5 object-contain"
            />
        )
        colorClass = "text-brand-dark dark:text-dark-heading"
        if (normalized.includes("pix")) {
            icons.push(
                <img
                    key="sub"
                    src="https://img.dudit.com.br/static/icons/payments/Pix.png"
                    alt="Pix"
                    className="w-3.5 h-3.5 object-contain"
                />
            )
        } else if (normalized.includes("cartão") || normalized.includes("cartao") || normalized.includes("credit") || normalized.includes("debit") || normalized.includes("visa") || normalized.includes("master") || normalized.includes("elo") || normalized.includes("card") || normalized.includes("crédito") || normalized.includes("credito") || normalized.includes("débito") || normalized.includes("debito")) {
            icons.push(
                <img
                    key="sub"
                    src="https://img.dudit.com.br/static/icons/payments/CreditCard.png"
                    alt="Cartão"
                    className="w-3.5 h-3.5 object-contain"
                />
            )
        } else if (normalized.includes("dinheiro") || normalized.includes("money") || normalized.includes("cash")) {
            icons.push(
                <img
                    key="sub"
                    src="https://img.dudit.com.br/static/icons/payments/Dinheiro.png"
                    alt="Dinheiro"
                    className="w-3.5 h-3.5 object-contain"
                />
            )
        } else if (normalized.includes("boleto")) {
            icons.push(
                <img
                    key="sub"
                    src="https://img.dudit.com.br/static/icons/payments/Boleto.png"
                    alt="Boleto"
                    className="w-3.5 h-3.5 object-contain"
                />
            )
        }
    } else if (normalized.includes("multiplo") || normalized.includes("múltiplo")) {
        icons.push(<MultiplePaymentsIcon key="icon" className="w-3.5 h-3.5 text-brand-dark dark:text-dark-heading" />)
        colorClass = "text-brand-dark dark:text-dark-heading"
    } else if (normalized.includes("pix")) {
        icons.push(<img key="icon" src="https://img.dudit.com.br/static/icons/payments/Pix.png" alt="Pix" className="w-3.5 h-3.5 object-contain" />)
        colorClass = "text-teal-700 dark:text-teal-400"
    } else if (normalized.includes("boleto")) {
        icons.push(<img key="icon" src="https://img.dudit.com.br/static/icons/payments/Boleto.png" alt="Boleto" className="w-3.5 h-3.5 object-contain" />)
        colorClass = "text-brand-dark dark:text-dark-heading"
    } else if (normalized.includes("dinheiro") || normalized.includes("money") || normalized.includes("espécie") || normalized.includes("espece") || normalized.includes("cash") || normalized.includes("carteira")) {
        icons.push(<img key="icon" src="https://img.dudit.com.br/static/icons/payments/Dinheiro.png" alt="Dinheiro" className="w-3.5 h-3.5 object-contain" />)
        colorClass = "text-brand-dark dark:text-dark-heading"
    } else if (normalized.includes("cartão") || normalized.includes("cartao") || normalized.includes("credit") || normalized.includes("debit") || normalized.includes("visa") || normalized.includes("master") || normalized.includes("elo") || normalized.includes("card")) {
        icons.push(<img key="icon" src="https://img.dudit.com.br/static/icons/payments/CreditCard.png" alt="Cartão" className="w-3.5 h-3.5 object-contain" />)
        colorClass = "text-brand-dark dark:text-dark-heading"
    } else if (normalized.includes("mercado") || normalized.includes("mp")) {
        icons.push(<img key="icon" src="https://img.dudit.com.br/static/icons/payments/MercadoPago.png" alt="Mercado Pago" className="w-3.5 h-3.5 object-contain" />)
        colorClass = "text-brand-dark dark:text-dark-heading"
    } else {
        icons.push(<MoneyBagIcon key="icon" className="w-3.5 h-3.5 text-brand-inactive-text dark:text-dark-body" />)
    }

    const hasMpIcon = icons.some((icon) => {
        if (React.isValidElement(icon) && icon.type === 'img') {
            return (icon.props as any)?.src?.includes('MercadoPago')
        }
        return false
    })
    if (!hasMpIcon && provider?.toLowerCase().includes("mercado pago")) {
        const hasSpecificMethodIcon = normalized.includes("pix") || normalized.includes("boleto") || normalized.includes("cartão") || normalized.includes("cartao") || normalized.includes("credit") || normalized.includes("debit") || normalized.includes("card") || normalized.includes("dinheiro") || normalized.includes("money") || normalized.includes("cash") || normalized.includes("vale-compra") || normalized.includes("voucher")
        if (!hasSpecificMethodIcon) {
            icons.unshift(
                <img
                    key="provider-mp"
                    src="https://img.dudit.com.br/static/icons/payments/MercadoPago.png"
                    alt="Mercado Pago"
                    className="w-3.5 h-3.5 object-contain"
                />
            )
            colorClass = "text-brand-dark dark:text-dark-heading"
        }
    }

    return (
        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${colorClass}`}>
            <span className="flex items-center gap-1">
                {icons}
            </span>
            <span>{displayPart}{provider?.toLowerCase().includes("mercado pago") && !displayPart.toLowerCase().includes("mercado pago") ? " (Mercado Pago)" : ""}</span>
        </span>
    )
}
