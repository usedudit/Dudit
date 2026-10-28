"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { AlertTriangleIcon, ChevronRightIcon, ClockIcon, CreditCardIcon, XIcon } from "@/lib/icons"

type BannerStatus = "past_due" | "pending" | "cancelled" | "trialing" | "paused"

interface SubscriptionStatusBannerProps {
    status: string | null
    graceDaysLeft?: number | null
    planName?: string | null
    trialEnd?: string | null
}

const SETTINGS_HREF = "/erp/configuracoes?tab=assinatura"

function dismissKey(status: string) {
    const day = new Date().toISOString().slice(0, 10)
    return `dudit:sub-banner:${status}:${day}`
}

export function SubscriptionStatusBanner({
    status,
    graceDaysLeft = null,
    planName = null,
    trialEnd = null,
}: SubscriptionStatusBannerProps) {
    const pathname = usePathname()
    const [dismissed, setDismissed] = useState(true)

    useEffect(() => {
        if (!status) return
        try {
            setDismissed(localStorage.getItem(dismissKey(status)) === "1")
        } catch {
            setDismissed(false)
        }
    }, [status])

    // The subscription settings page already shows the full state; avoid noise.
    if (!status || dismissed) return null
    if (pathname?.startsWith("/erp/configuracoes")) return null
    if (!["past_due", "pending", "cancelled", "trialing", "paused"].includes(status)) return null

    const handleDismiss = () => {
        try {
            localStorage.setItem(dismissKey(status), "1")
        } catch {
            // ignore
        }
        setDismissed(true)
    }

    const planLabel = planName ? `do plano ${planName}` : "da sua assinatura"

    let tone = ""
    let Icon = AlertTriangleIcon
    let title = ""
    let description = ""
    let cta = "Ver assinatura"

    switch (status as BannerStatus) {
        case "past_due": {
            const days = graceDaysLeft ?? 0
            tone = "border-red-300 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-100"
            Icon = AlertTriangleIcon
            title = "Pagamento da assinatura em atraso"
            description = days > 0
                ? `Não conseguimos cobrar ${planLabel}. Regularize em até ${days} dia${days === 1 ? "" : "s"} para não perder os recursos do plano.`
                : `Não conseguimos cobrar ${planLabel}. Regularize agora para reativar os recursos do plano.`
            cta = "Regularizar pagamento"
            break
        }
        case "pending":
            tone = "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/50 dark:text-amber-100"
            Icon = ClockIcon
            title = "Assinatura aguardando pagamento"
            description = `O pagamento ${planLabel} ainda não foi confirmado. Se você gerou um PIX, ele pode levar alguns minutos para compensar.`
            cta = "Ver pagamento"
            break
        case "cancelled":
            tone = "border-neutral-300 bg-neutral-100 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
            Icon = CreditCardIcon
            title = "Assinatura cancelada"
            description = `Sua assinatura ${planLabel} foi cancelada. Você está no plano gratuito e pode reativar quando quiser.`
            cta = "Reativar plano"
            break
        case "paused":
            tone = "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/50 dark:text-amber-100"
            Icon = AlertTriangleIcon
            title = "Assinatura pausada"
            description = `A cobrança ${planLabel} está pausada e os recursos podem ficar limitados até a reativação.`
            cta = "Ver assinatura"
            break
        case "trialing":
            tone = "border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/50 dark:text-blue-100"
            Icon = ClockIcon
            title = "Período de teste"
            description = trialEnd
                ? `Seu teste ${planLabel} termina em ${new Date(trialEnd).toLocaleDateString("pt-BR")}.`
                : `Você está no período de teste ${planLabel}.`
            cta = "Ver assinatura"
            break
        default:
            return null
    }

    return (
        <div className={`mx-3 mt-3 flex items-start gap-3 rounded-2xl border px-4 py-3 md:mx-4 ${tone}`}>
            <Icon className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">{title}</p>
                <p className="text-xs opacity-90">{description}</p>
            </div>
            <Link
                href={SETTINGS_HREF}
                className="hidden shrink-0 items-center gap-1 rounded-xl bg-white/70 px-3 py-2 text-xs font-bold text-brand-dark transition-colors hover:bg-white sm:flex dark:bg-black/20 dark:text-white dark:hover:bg-black/30"
            >
                {cta}
                <ChevronRightIcon className="h-3.5 w-3.5" />
            </Link>
            <button
                type="button"
                onClick={handleDismiss}
                aria-label="Fechar aviso"
                className="shrink-0 rounded-lg p-1 opacity-60 transition-opacity hover:opacity-100"
            >
                <XIcon className="h-4 w-4" />
            </button>
        </div>
    )
}
