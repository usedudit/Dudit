"use client"

import { useEffect, useMemo, useState } from "react"
import { Badge, Button, DefaultModal, IconPlaceholder, Input, MoneyInput } from "@/components/reusable"
import { formatCurrency } from "@/lib/utils"
import { formatInTz } from "@/lib/date"
import { usePartnerTimezone } from "@/lib/store-context"
import { ClockIcon } from "@/lib/icons"

type Props = {
    isOpenCashModalOpen: boolean
    setIsOpenCashModalOpen: (open: boolean) => void
    isOpeningCash: boolean
    openingBalance: number
    setOpeningBalance: (value: number) => void
    openingNotes: string
    setOpeningNotes: (value: string) => void
    onOpenCash: () => Promise<void>
    lastSession?: any | null
}

export default function POSCashClosedView({
    isOpenCashModalOpen,
    setIsOpenCashModalOpen,
    isOpeningCash,
    openingBalance,
    setOpeningBalance,
    openingNotes,
    setOpeningNotes,
    onOpenCash,
    lastSession,
}: Props) {
    const tz = usePartnerTimezone()
    const [now, setNow] = useState(() => new Date())

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 1000)
        return () => clearInterval(timer)
    }, [])

    const timeString = useMemo(() => {
        return formatInTz(now, tz, "dd/MM/yyyy '•' HH:mm:ss")
    }, [now, tz])

    const difference = lastSession ? Number(lastSession.difference_amount || 0) : null
    const hasDifference = difference !== null && Math.abs(difference) > 0.01

    return (
        <div className="flex h-full flex-col items-center justify-center gap-6 px-4 py-8">
            {/* Date/Time */}
            <div className="flex items-center gap-2 text-sm text-brand-inactive-text dark:text-dark-body">
                <ClockIcon className="h-4 w-4" />
                <span>{timeString}</span>
            </div>

            {/* Mascot + Status */}
            <div className="flex flex-col items-center gap-3">
                <IconPlaceholder
                    placeholderType="image"
                    imageSrc="https://img.dudit.com.br/static/mascots/PDV.png"
                    title="Caixa fechado"
                    subtitle="O caixa está fechado. Abra-o para começar a registrar vendas no PDV."
                    containerSize="h-20 w-20"
                    iconSize="h-8 w-8"
                    titleClass="text-2xl font-bold text-brand-dark dark:text-dark-heading"
                    subtitleClass="mt-2 max-w-md text-lg text-brand-inactive-text dark:text-dark-body"
                />
            </div>

            {/* Open Button */}
            <Button
                onClick={() => setIsOpenCashModalOpen(true)}
                className="h-12"
            >
                Abrir o Caixa
            </Button>

            {/* Modal */}
            <DefaultModal
                isOpen={isOpenCashModalOpen}
                onClose={() => setIsOpenCashModalOpen(false)}
                title="Abrir caixa"
                footer={
                    <div className="flex w-full items-center gap-3">
                        <Button
                            variant="outline"
                            className="flex-1"
                            onClick={() => setIsOpenCashModalOpen(false)}
                            disabled={isOpeningCash}
                        >
                            Cancelar
                        </Button>
                        <Button className="flex-1" onClick={onOpenCash} isLoading={isOpeningCash}>
                            Confirmar abertura
                        </Button>
                    </div>
                }
            >
                <div className="space-y-4 pt-2">
                    <MoneyInput
                        label="Saldo inicial em dinheiro"
                        value={openingBalance}
                        onChange={setOpeningBalance}
                    />
                    <Input
                        label="Observações"
                        value={openingNotes}
                        onChange={(e: any) => setOpeningNotes(e.target.value)}
                    />
                </div>
            </DefaultModal>
        </div>
    )
}
