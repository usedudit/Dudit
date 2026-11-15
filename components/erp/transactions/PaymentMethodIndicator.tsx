"use client"

import React from "react"
import { MoneyBagIcon, MultiplePaymentsIcon } from "@/lib/icons"
import { formatPaymentMethodLabel } from "@/lib/utils/payment-method-label"

export function PaymentMethodIndicator({
    label,
    provider,
    simplifyMultiple = true,
    simplify = false,
    compact = false
}: {
    label?: string | null
    provider?: string | null
    simplifyMultiple?: boolean
    simplify?: boolean
    compact?: boolean
}) {
    if (!label) return <span className={`font-semibold text-brand-inactive-text dark:text-dark-body truncate ${compact ? "text-xs" : "text-sm"}`}>Não informado</span>

    const parts = splitPaymentMethodLabels(label)
        .map(p => p.trim())
        .filter(Boolean)
        .map(p => formatPaymentMethodLabel(p, null))
        .filter(Boolean)

    if (parts.length > 1) {
        if (simplifyMultiple) {
            return <PaymentMethodIndicatorKeyed part="Múltiplos meios" provider={provider} simplify={simplify} compact={compact} />
        }
        return (
            <div className="flex flex-wrap gap-2 items-center">
                {parts.map((part, index) => (
                    <PaymentMethodIndicatorKeyed key={index} part={part} provider={provider} simplify={simplify} compact={compact} />
                ))}
            </div>
        )
    }

    return <PaymentMethodIndicatorKeyed part={parts[0] || label} provider={provider} simplify={simplify} compact={compact} />
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

function simplifyLabel(part: string): string {
    const lower = part.toLowerCase()

    // "Mercado Pago (Boleto)" -> "Boleto (Mercado Pago)"
    if (lower.startsWith("mercado pago (") || lower.startsWith("mercadopago (")) {
        const match = part.match(/^(?:mercado\s*pago|mercadopago)\s*\(([^)]+)\)$/i)
        if (match) {
            const sub = match[1].trim()
            const capitalizedSub = sub.charAt(0).toUpperCase() + sub.slice(1)
            return `${capitalizedSub} (Mercado Pago)`
        }
    }

    // Already contains "Mercado Pago" - keep as-is
    if (lower.includes("mercado pago") || lower.includes("mercadopago")) {
        return part
    }

    // "Cartão de Crédito (6x)" -> "Cartão de Crédito" (strip parenthetical detail)
    // But NOT if it contains installment suffix like " - 6x" after the parens
    const match = part.match(/^([^(]+)\s*\(([^)]+)\)$/)
    if (match) {
        return match[1].trim()
    }

    return part
}

function resolveIcons(normalized: string, providerIsMP: boolean): { icons: React.ReactNode[]; colorClass: string } {
    let icons: React.ReactNode[] = []
    let colorClass = "text-brand-inactive-text dark:text-dark-body"

    // ALWAYS add MercadoPago icon first if provider is MP
    if (providerIsMP) {
        icons.push(
            <img
                key="mp"
                src="https://img.dudit.com.br/static/icons/payments/MercadoPago.png"
                alt="Mercado Pago"
                className="w-3.5 h-3.5 object-contain"
            />
        )
        colorClass = "text-brand-dark dark:text-dark-heading"
    }

    // Then add the specific payment method icon
    if (normalized.includes("assinatura") || normalized.includes("subscription")) {
        icons.push(
            <img key="method" src="https://img.dudit.com.br/static/icons/payments/Voucher.png" alt="Assinatura" className="w-3.5 h-3.5 object-contain" />
        )
        colorClass = "text-brand-dark dark:text-dark-heading"
    } else if (
        normalized.includes("vale-compra") ||
        normalized.includes("vale_compra") ||
        normalized.includes("store_credit") ||
        normalized.includes("store credit") ||
        normalized.includes("voucher") ||
        normalized.includes("crédito do cliente") ||
        normalized.includes("credito do cliente") ||
        normalized.includes("crédito de cliente") ||
        normalized.includes("credito de cliente") ||
        normalized.includes("crédito cliente") ||
        normalized.includes("credito cliente") ||
        normalized.includes("crédito em loja") ||
        normalized.includes("credito em loja") ||
        normalized.includes("crédito de troca") ||
        normalized.includes("credito de troca")
    ) {
        icons.push(
            <img key="method" src="https://img.dudit.com.br/static/icons/payments/Voucher.png" alt="Crédito / Vale-compra" className="w-3.5 h-3.5 object-contain" />
        )
        colorClass = "text-brand-dark dark:text-dark-heading"
    } else if (normalized.includes("pix")) {
        icons.push(<img key="method" src="https://img.dudit.com.br/static/icons/payments/Pix.png" alt="Pix" className="w-3.5 h-3.5 object-contain" />)
        colorClass = "text-teal-700 dark:text-teal-400"
    } else if (normalized.includes("boleto")) {
        icons.push(<img key="method" src="https://img.dudit.com.br/static/icons/payments/Boleto.png" alt="Boleto" className="w-3.5 h-3.5 object-contain" />)
        colorClass = "text-brand-dark dark:text-dark-heading"
    } else if (normalized.includes("dinheiro") || normalized.includes("money") || normalized.includes("espécie") || normalized.includes("espece") || normalized.includes("cash") || normalized.includes("carteira")) {
        icons.push(<img key="method" src="https://img.dudit.com.br/static/icons/payments/Dinheiro.png" alt="Dinheiro" className="w-3.5 h-3.5 object-contain" />)
        colorClass = "text-brand-dark dark:text-dark-heading"
    } else if (normalized.includes("cartão") || normalized.includes("cartao") || normalized.includes("credit") || normalized.includes("debit") || normalized.includes("visa") || normalized.includes("master") || normalized.includes("elo") || normalized.includes("card") || normalized.includes("crédito") || normalized.includes("credito") || normalized.includes("débito") || normalized.includes("debito")) {
        icons.push(<img key="method" src="https://img.dudit.com.br/static/icons/payments/CreditCard.png" alt="Cartão" className="w-3.5 h-3.5 object-contain" />)
        colorClass = "text-brand-dark dark:text-dark-heading"
    } else if (normalized.includes("multiplo") || normalized.includes("múltiplo")) {
        icons.push(<MultiplePaymentsIcon key="method" className="w-3.5 h-3.5 text-brand-dark dark:text-dark-heading" />)
        colorClass = "text-brand-dark dark:text-dark-heading"
    } else if (!providerIsMP && (normalized.includes("mercado") || normalized.includes("mp"))) {
        icons.push(<img key="method" src="https://img.dudit.com.br/static/icons/payments/MercadoPago.png" alt="Mercado Pago" className="w-3.5 h-3.5 object-contain" />)
        colorClass = "text-brand-dark dark:text-dark-heading"
    } else if (!providerIsMP) {
        icons.push(<MoneyBagIcon key="method" className="w-3.5 h-3.5 text-brand-inactive-text dark:text-dark-body" />)
    }

    return { icons, colorClass }
}

function PaymentMethodIndicatorKeyed({ part, provider, simplify: doSimplify = false, compact = false }: { part: string; provider?: string | null; simplify?: boolean; compact?: boolean }) {
    const displayPart = doSimplify ? simplifyLabel(part) : part

    const normalized = displayPart.toLowerCase()
    const providerIsMP = !!provider?.toLowerCase().includes("mercado pago") || normalized.includes("mercado pago") || normalized.includes("mercadopago")
    const isMultipleMethods = normalized.includes("multiplos") || normalized.includes("múltiplos")
    const { icons, colorClass } = resolveIcons(normalized, providerIsMP && !isMultipleMethods)

    // Build display text: append " (Mercado Pago)" only for single-method payments via MP
    let displayText = displayPart
    if (providerIsMP && !isMultipleMethods && !normalized.includes("mercado pago") && !normalized.includes("mercadopago")) {
        displayText = `${displayPart} (Mercado Pago)`
    }

    return (
        <span className={`inline-flex items-center gap-2 font-semibold ${compact ? "text-xs" : "text-sm"} ${colorClass}`}>
            <span className="flex items-center gap-1">
                {icons}
            </span>
            <span>{displayText}</span>
        </span>
    )
}
