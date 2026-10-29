"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { AlertModal } from "@/components/reusable"
import { AlertTriangleIcon, ClockIcon, CreditCardIcon } from "@/lib/icons"
import { cn } from "@/lib/utils"

export type SubscriptionStatus =
    | "past_due"
    | "pending"
    | "cancelled"
    | "paused"
    | "trialing"

export interface SubscriptionStatusButtonProps {
    status: string | null
    graceDaysLeft?: number | null
    planName?: string | null
    trialEnd?: string | null
}

const SUBSCRIPTION_HREF = "/erp/configuracoes?tab=assinatura"

const STATUS_META = {
    past_due: {
        border: "border-brand-red",
        icon: "text-brand-red",
        Icon: AlertTriangleIcon,
    },
    pending: {
        border: "border-brand-orange",
        icon: "text-brand-orange",
        Icon: ClockIcon,
    },
    cancelled: {
        border: "border-brand-border dark:border-dark-border",
        icon: "text-brand-inactive-text dark:text-dark-body",
        Icon: CreditCardIcon,
    },
    paused: {
        border: "border-brand-orange",
        icon: "text-brand-orange",
        Icon: AlertTriangleIcon,
    },
    trialing: {
        border: "border-brand-blue",
        icon: "text-brand-blue",
        Icon: ClockIcon,
    },
} as const

function isSubscriptionStatus(status: string | null): status is SubscriptionStatus {
    return !!status && status in STATUS_META
}

export function SubscriptionStatusButton({
    status,
    graceDaysLeft = null,
    planName = null,
    trialEnd = null,
}: SubscriptionStatusButtonProps) {
    const router = useRouter()
    const [isOpen, setIsOpen] = useState(false)

    if (!isSubscriptionStatus(status)) return null

    const meta = STATUS_META[status]
    const Icon = meta.Icon
    const planLabel = planName ? `do plano ${planName}` : "da sua assinatura"

    let variant: "danger" | "warning" | "info" = "danger"
    let title = ""
    let description = ""
    let cta = "Ver assinatura"

    switch (status) {
        case "past_due": {
            const days = graceDaysLeft ?? 0
            variant = "danger"
            title = "Pagamento da assinatura em atraso"
            description = days > 0
                ? `Não conseguimos cobrar ${planLabel}. Regularize em até ${days} dia${days === 1 ? "" : "s"} para não perder os recursos do plano.`
                : `Não conseguimos cobrar ${planLabel}. Regularize agora para reativar os recursos do plano.`
            cta = "Regularizar pagamento"
            break
        }
        case "pending":
            variant = "warning"
            title = "Assinatura aguardando pagamento"
            description = `O pagamento ${planLabel} ainda não foi confirmado. Se você gerou um PIX, ele pode levar alguns minutos para compensar.`
            cta = "Ver pagamento"
            break
        case "cancelled":
            variant = "danger"
            title = "Assinatura cancelada"
            description = `Sua assinatura ${planLabel} foi cancelada. Você está no plano gratuito e pode reativar quando quiser.`
            cta = "Reativar plano"
            break
        case "paused":
            variant = "warning"
            title = "Assinatura pausada"
            description = `A cobrança ${planLabel} está pausada e os recursos podem ficar limitados até a reativação.`
            cta = "Ver assinatura"
            break
        case "trialing":
            variant = "info"
            title = "Período de teste"
            description = trialEnd
                ? `Seu teste ${planLabel} termina em ${new Date(trialEnd).toLocaleDateString("pt-BR")}.`
                : `Você está no período de teste ${planLabel}.`
            cta = "Ver assinatura"
            break
    }

    const handleAction = () => {
        setIsOpen(false)
        router.push(SUBSCRIPTION_HREF)
    }

    return (
        <>
            <button
                type="button"
                onClick={() => setIsOpen(true)}
                aria-label={title}
                aria-haspopup="dialog"
                title={title}
                className={cn(
                    "flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border bg-white transition-colors hover:bg-brand-gray dark:bg-dark-surface dark:hover:bg-dark-border",
                    meta.border,
                )}
            >
                <Icon className={cn("h-5 w-5", meta.icon)} />
            </button>

            <AlertModal
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
                title={title}
                message={description}
                icon={<Icon />}
                variant={variant}
                confirmText={cta}
                cancelText="Fechar"
                onConfirm={handleAction}
            />
        </>
    )
}
