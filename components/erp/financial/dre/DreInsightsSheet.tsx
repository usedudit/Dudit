"use client"

import React from "react"
import { XIcon, CheckCircleIcon } from "@/lib/icons"
import { Button, InfoCard, IconPlaceholder } from "@/components/reusable"
import Portal from "@/components/Portal"
import BottomSheet from "@/components/BottomSheet"
import { useMediaQuery } from "@/components/erp/hooks"
import { useModalLayer } from "@/lib/modal-stack"
import { formatCurrency } from "@/lib/utils"
import type { DreDataIntegrityAlerts } from "@/lib/services/dre.service"

interface DreInsightsSheetProps {
    isOpen: boolean
    onClose: () => void
    alerts?: DreDataIntegrityAlerts
}

export function DreInsightsSheet({ isOpen, onClose, alerts }: DreInsightsSheetProps) {
    const isMobile = useMediaQuery("(max-width: 1023px)")
    const zIndex = useModalLayer(isOpen)

    const hasAlerts = Boolean(
        alerts && (alerts.zeroCostItemsCount > 0 || alerts.unclassifiedTransactionsCount > 0)
    )

    const mainContent = (
        <div className="flex h-full flex-col bg-white dark:bg-dark-surface">
            <header className="z-10 flex shrink-0 items-center justify-between border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
                <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">
                    Alertas & Insights
                </h2>
                <Button variant="filled" onClick={onClose} size="icon" className="hidden lg:flex">
                    <XIcon className="h-5 w-5" />
                </Button>
            </header>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 pb-8 space-y-3">
                {!hasAlerts ? (
                    <IconPlaceholder
                        icon={CheckCircleIcon}
                        title="DRE 100% consistente!"
                        subtitle="Nenhum alerta de integridade contábil foi identificado no período. Custos e classificações estão completos."
                    />
                ) : (
                    <>
                        <p className="text-xs font-semibold text-brand-inactive-text px-1">
                            Pendências de integridade identificadas no período selecionado
                        </p>
                        {alerts && alerts.zeroCostItemsCount > 0 && (
                            <InfoCard
                                title="Aviso de Custo"
                                message={`Foram identificados ${alerts.zeroCostItemsCount} itens vendidos sem preço de custo unitário cadastrado. Cadastre o custo nos produtos para que o CMV e a Margem Bruta tenham 100% de exatidão contábil.`}
                                color="orange"
                            />
                        )}
                        {alerts && alerts.unclassifiedTransactionsCount > 0 && (
                            <InfoCard
                                title="Movimentações Sem Classificação"
                                message={`Existem ${alerts.unclassifiedTransactionsCount} movimentações financeiras sem classificação contábil vinculada (${formatCurrency(alerts.unclassifiedTransactionsAmount)}). Foram atribuídas provisoriamente em Despesas Gerais.`}
                                color="blue"
                            />
                        )}
                    </>
                )}
            </div>

            <footer className="shrink-0 border-t border-brand-border bg-white p-4 dark:border-dark-border dark:bg-dark-surface">
                <Button variant="outline" className="w-full h-11" onClick={onClose}>
                    Fechar
                </Button>
            </footer>
        </div>
    )

    if (isMobile) {
        return (
            <BottomSheet isOpen={isOpen} onClose={onClose}>
                {mainContent}
            </BottomSheet>
        )
    }

    return (
        <Portal>
            <div
                className={`fixed inset-0 z-50 bg-black/50 transition-opacity duration-300 ${isOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
                style={{ zIndex }}
                onClick={onClose}
            >
                <div
                    className={`fixed right-4 top-4 bottom-4 w-[450px] overflow-hidden rounded-2xl bg-white shadow-2xl transition-all duration-300 dark:bg-dark-surface ${isOpen ? "translate-x-0 opacity-100" : "translate-x-[120%] opacity-100"}`}
                    onClick={(e) => e.stopPropagation()}
                >
                    {mainContent}
                </div>
            </div>
        </Portal>
    )
}
