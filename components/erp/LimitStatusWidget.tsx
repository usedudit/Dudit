"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import { useQuery } from "@tanstack/react-query"
import { motion, AnimatePresence } from "framer-motion"
import { usePathname } from "next/navigation"
import { XIcon, AlertTriangleIcon } from "@/lib/icons"
import { Button } from "@/components/reusable"
import { usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal"
import { getLimitStatusAction } from "@/app/actions/erp/limits-status"
import type { LimitStatusData } from "@/app/actions/erp/limits-status"
import { getHardcodedPlan } from "@/lib/subscription/feature-labels"
import { usePermissions } from "@/lib/permission-context"

interface PageLimitConfig {
    key: string
    label: string
    limitName: string
    isMonthly: boolean
}

const PAGE_LIMIT_MAP: Record<string, PageLimitConfig> = {
    "/erp/produtos": { key: "items", label: "Produtos", limitName: "items", isMonthly: false },
    "/erp/pedidos": { key: "monthly_orders", label: "Pedidos/mês", limitName: "monthly_orders", isMonthly: true },
    "/erp/agendamentos": { key: "monthly_appointments", label: "Agendamentos/mês", limitName: "monthly_appointments", isMonthly: true },
    "/erp/orcamentos": { key: "monthly_quotes", label: "Orçamentos/mês", limitName: "monthly_quotes", isMonthly: true },
    "/erp/ordens-de-servico": { key: "monthly_service_orders", label: "Ordens de serviço/mês", limitName: "monthly_service_orders", isMonthly: true },
    "/erp/recorrentes/planos": { key: "recurring_plans", label: "Planos recorrentes", limitName: "recurring_plans", isMonthly: false },
    "/erp/recorrentes/assinaturas": { key: "active_subscriptions", label: "Assinaturas recorrentes", limitName: "active_subscriptions", isMonthly: false },
}

export function LimitStatusWidget() {
    const pathname = usePathname()
    const [isOpen, setIsOpen] = useState(false)
    const [dismissed, setDismissed] = useState(false)
    const popupRef = useRef<HTMLDivElement>(null)

    const { openPlanUpgrade } = usePlanUpgrade()
    const { partnerId } = usePermissions()

    const pageConfig = Object.entries(PAGE_LIMIT_MAP).find(([path]) =>
        pathname === path || pathname.startsWith(path + "/")
    )?.[1]

    const { data = null } = useQuery<LimitStatusData | null>({
        queryKey: ["erp", "limit-status", partnerId],
        queryFn: getLimitStatusAction,
        enabled: Boolean(pageConfig && partnerId),
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
    })

    useEffect(() => {
        if (!isOpen) return
        const handleClickOutside = (e: MouseEvent) => {
            if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
                const btn = document.getElementById("limit-widget-btn")
                if (btn && !btn.contains(e.target as Node)) {
                    setIsOpen(false)
                }
            }
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [isOpen])

    const handleClose = useCallback(() => {
        setIsOpen(false)
        setDismissed(true)
    }, [])

    if (!pageConfig || !data) return null

    if (data.planSlug === "escalar") return null

    const limitItem = data.items.find((i) => i.key === pageConfig.key)
    if (!limitItem || limitItem.limit === "unlimited") return null

    const atLimit = limitItem.percentage >= 90
    if (!atLimit) return null

    if (dismissed) return null

    const nextPlanName = data.nextPlanSlug
        ? getHardcodedPlan(data.nextPlanSlug).name
        : null

    return (
        <>
            <button
                id="limit-widget-btn"
                onClick={() => setIsOpen((prev) => !prev)}
                className="fixed bottom-6 right-6 z-[90] w-12 h-12 rounded-full shadow-lg shadow-black/10 hover:scale-105 active:scale-95 transition-all flex items-center justify-center bg-brand-dark dark:bg-white text-white dark:text-brand-dark"
                aria-label="Limite próximo"
            >
                <AlertTriangleIcon className="w-5 h-5" />
                <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 rounded-full border-2 border-white dark:border-brand-dark" />
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        ref={popupRef}
                        initial={{ opacity: 0, scale: 0.9, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 10 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        className="fixed bottom-24 right-6 z-[90] w-[340px] max-w-[calc(100vw-2rem)] bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl shadow-2xl overflow-hidden"
                    >
                        <div className="flex items-center justify-between px-5 py-4 border-b border-brand-border dark:border-dark-border">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                                    <AlertTriangleIcon className="w-4 h-4 text-brand-red" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                        {limitItem.limit === 0 ? "Recurso não incluído no plano" : "Limite quase atingido"}
                                    </h3>
                                    <p className="text-xs text-brand-inactive-text">
                                        {pageConfig.label}
                                    </p>
                                </div>
                            </div>
                            <Button variant="filled" onClick={handleClose} size="icon">
                                <XIcon className="w-5 h-5" />
                            </Button>
                        </div>

                        <div className="px-5 py-4">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-brand-dark dark:text-dark-heading">
                                    {limitItem.current} / {limitItem.limit} usados
                                </span>
                                <span className="text-xs font-bold text-brand-red">
                                    {limitItem.percentage}%
                                </span>
                            </div>
                            <div className="w-full h-2 bg-brand-gray/50 dark:bg-dark-border/50 rounded-full overflow-hidden">
                                <div
                                    className="h-2 rounded-full bg-brand-red transition-all duration-500"
                                    style={{ width: `${limitItem.percentage}%` }}
                                />
                            </div>
                            {limitItem.limit === 0 && (
                                <p className="text-xs text-brand-inactive-text mt-2">
                                    Faça upgrade para liberar este recurso no seu plano.
                                </p>
                            )}
                            {limitItem.isMonthly && limitItem.limit !== 0 && (
                                <p className="text-xs text-brand-inactive-text mt-2">
                                    Sua cota mensal está quase no fim. Os limites resetam no início do próximo mês.
                                </p>
                            )}
                            {!limitItem.isMonthly && limitItem.limit !== 0 && (
                                <p className="text-xs text-brand-inactive-text mt-2">
                                    Seu limite de {pageConfig.label.toLowerCase()} está quase no fim.
                                </p>
                            )}
                        </div>

                        {data.nextPlanSlug && (
                            <div className="px-5 py-4 border-t border-brand-border dark:border-dark-border bg-brand-gray/20 dark:bg-dark-border/20">
                                <div className="flex items-center gap-3">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-brand-inactive-text dark:text-dark-body font-semibold">
                                            Quer mais limites?
                                        </p>
                                    </div>
                                    <Button
                                        variant="default"
                                        className="h-9"
                                        onClick={() => {
                                            setIsOpen(false)
                                            openPlanUpgrade(data.nextPlanSlug as "crescer" | "escalar")
                                        }}
                                    >
                                        Fazer upgrade
                                    </Button>
                                </div>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    )
}
