"use client"

import React, { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import DeliveryKanbanCard from "./DeliveryKanbanCard"
import { IconPlaceholder } from "@/components/reusable"
import { CheckCircleIcon } from "@/lib/icons"

interface DeliveryKanbanBoardProps {
    deliveries: any[]
    onDetails: (deliveryId: string) => void
    onQuickStatusChange?: (deliveryId: string, status: string) => void
}

export default function DeliveryKanbanBoard({
    deliveries,
    onDetails,
    onQuickStatusChange,
}: DeliveryKanbanBoardProps) {
    // Tabs: "active" (Kanban with 4 columns) or "cancelled" (Grid of cancelled/failed deliveries)
    const [activeTab, setActiveTab] = useState<"active" | "cancelled">("active")

    // Group deliveries by status
    const pendingDeliveries = deliveries.filter(
        (d) => d.status === "pending" || d.status === "not_sent"
    )
    const preparingDeliveries = deliveries.filter((d) => d.status === "preparing")
    const sentDeliveries = deliveries.filter(
        (d) => d.status === "sent" || d.status === "pickup_available"
    )
    const deliveredDeliveries = deliveries.filter((d) => d.status === "delivered")
    const cancelledDeliveries = deliveries.filter(
        (d) => d.status === "cancelled" || d.status === "delivery_failed"
    )

    const columns = [
        {
            id: "pending",
            title: "Pendente",
            subtitle: "Novos pedidos",
            colorClass: "bg-gray-400 dark:bg-zinc-500",
            textClass: "text-gray-600 dark:text-zinc-400",
            bgColClass: "from-gray-50/50 to-gray-100/30 dark:from-zinc-900/10 dark:to-zinc-800/10",
            items: pendingDeliveries,
        },
        {
            id: "preparing",
            title: "Em preparação",
            subtitle: "Na cozinha / separação",
            colorClass: "bg-orange-500",
            textClass: "text-orange-600 dark:text-orange-400",
            bgColClass: "from-orange-50/30 to-orange-100/10 dark:from-orange-950/5 dark:to-orange-900/5",
            items: preparingDeliveries,
        },
        {
            id: "sent",
            title: "Saiu para entrega",
            subtitle: "A caminho",
            colorClass: "bg-blue-500",
            textClass: "text-blue-600 dark:text-blue-400",
            bgColClass: "from-blue-50/30 to-blue-100/10 dark:from-blue-950/5 dark:to-blue-900/5",
            items: sentDeliveries,
        },
        {
            id: "delivered",
            title: "Entregue",
            subtitle: "Concluída",
            colorClass: "bg-emerald-500",
            textClass: "text-emerald-600 dark:text-emerald-400",
            bgColClass: "from-emerald-50/30 to-emerald-100/10 dark:from-emerald-950/5 dark:to-emerald-900/5",
            items: deliveredDeliveries,
        },
    ]

    return (
        <div className="flex flex-col h-full w-full px-4 md:px-8">
            {/* Tab Switcher - Pill style */}
            <div className="flex justify-center md:justify-start mb-6">
                <div className="bg-brand-slate dark:bg-dark-border p-1 rounded-full flex gap-1 shadow-sm border border-brand-border dark:border-dark-border/40">
                    <button
                        onClick={() => setActiveTab("active")}
                        className={`px-6 py-2 rounded-full text-xs font-bold transition-all duration-200 cursor-pointer ${activeTab === "active"
                            ? "bg-white dark:bg-dark-surface text-brand-dark dark:text-dark-heading shadow-sm"
                            : "text-brand-inactive-text dark:text-dark-body hover:text-brand-dark dark:hover:text-dark-heading"
                            }`}
                    >
                        Entregas Ativas ({pendingDeliveries.length + preparingDeliveries.length + sentDeliveries.length + deliveredDeliveries.length})
                    </button>
                    <button
                        onClick={() => setActiveTab("cancelled")}
                        className={`px-6 py-2 rounded-full text-xs font-bold transition-all duration-200 cursor-pointer ${activeTab === "cancelled"
                            ? "bg-white dark:bg-dark-surface text-brand-dark dark:text-dark-heading shadow-sm"
                            : "text-brand-inactive-text dark:text-dark-body hover:text-brand-dark dark:hover:text-dark-heading"
                            }`}
                    >
                        Canceladas / Falhas ({cancelledDeliveries.length})
                    </button>
                </div>
            </div>

            <AnimatePresence mode="wait">
                {activeTab === "active" ? (
                    /* Kanban Board View */
                    <motion.div
                        key="kanban-active"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                        className="flex lg:grid lg:grid-cols-4 gap-5 overflow-x-auto lg:overflow-x-visible pb-6 snap-x snap-mandatory scrollbar-hide select-none"
                    >
                        {columns.map((col) => (
                            <div
                                key={col.id}
                                className="flex-none w-[310px] sm:w-[330px] lg:w-auto snap-center flex flex-col h-full min-h-[500px]"
                            >
                                {/* Column Header */}
                                <div className="flex items-center justify-between mb-3 px-1 shrink-0">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className={`w-2.5 h-2.5 rounded-full ${col.colorClass}`} />
                                        <h3 className="font-extrabold text-sm text-brand-dark dark:text-dark-heading truncate">
                                            {col.title}
                                        </h3>
                                        <span className="text-xs text-brand-inactive-text dark:text-dark-body font-bold">
                                            ({col.items.length})
                                        </span>
                                    </div>
                                    <span className="text-[10px] text-brand-inactive-text dark:text-dark-body font-medium truncate max-w-[100px]">
                                        {col.subtitle}
                                    </span>
                                </div>

                                {/* Column Body / Card Container */}
                                <div
                                    className={`flex-1 flex flex-col gap-3.5 p-3 rounded-2xl border border-brand-border dark:border-dark-border bg-gradient-to-b ${col.bgColClass} overflow-y-auto max-h-[calc(100vh-320px)] min-h-[400px] custom-scrollbar`}
                                >
                                    <AnimatePresence mode="popLayout">
                                        {col.items.length === 0 ? (
                                            <motion.div
                                                initial={{ opacity: 0, scale: 0.95 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                exit={{ opacity: 0, scale: 0.95 }}
                                                className="flex flex-col items-center justify-center py-16 px-4 text-center h-full border border-dashed border-brand-border/60 dark:border-dark-border/40 rounded-xl bg-white/50 dark:bg-dark-surface/20"
                                            >
                                                <IconPlaceholder
                                                    icon={CheckCircleIcon}
                                                    title="Tudo limpo por aqui!"
                                                    subtitle="Nenhuma entrega com este status."
                                                />
                                            </motion.div>
                                        ) : (
                                            col.items.map((delivery) => (
                                                <DeliveryKanbanCard
                                                    key={delivery.id}
                                                    delivery={delivery}
                                                    onDetails={() => onDetails(delivery.id)}
                                                    onQuickStatusChange={onQuickStatusChange}
                                                />
                                            ))
                                        )}
                                    </AnimatePresence>
                                </div>
                            </div>
                        ))}
                    </motion.div>
                ) : (
                    /* Cancelled & Failed Deliveries Grid */
                    <motion.div
                        key="kanban-cancelled"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                        className="w-full"
                    >
                        {cancelledDeliveries.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-24 text-center border border-dashed border-brand-border dark:border-dark-border rounded-2xl bg-white dark:bg-dark-surface">
                                <p className="font-bold text-brand-dark dark:text-dark-heading">
                                    Nenhuma entrega cancelada ou falha encontrada
                                </p>
                                <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-1">
                                    Somente entregas canceladas ou com falha aparecem nesta aba.
                                </p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-5 pb-6">
                                <AnimatePresence>
                                    {cancelledDeliveries.map((delivery) => (
                                        <DeliveryKanbanCard
                                            key={delivery.id}
                                            delivery={delivery}
                                            onDetails={() => onDetails(delivery.id)}
                                            onQuickStatusChange={onQuickStatusChange}
                                        />
                                    ))}
                                </AnimatePresence>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
