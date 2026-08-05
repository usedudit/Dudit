"use client"

import React, { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import DeliveryKanbanCard from "./DeliveryKanbanCard"
import { IconPlaceholder, Tabs, TabsList, TabsTrigger } from "@/components/reusable"
import { CheckCircleIcon, ColumnsIcon, BlockedIcon, PlusIcon } from "@/lib/icons"

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
    const [dragOverCol, setDragOverCol] = useState<string | null>(null)

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
            title: "Não enviado",
            subtitle: "Novos pedidos",
            themeClass: "bg-blue-50/70 border-blue-100/50 text-blue-600 dark:bg-blue-950/20 dark:border-blue-900/30 dark:text-blue-400",
            dotBgClass: "bg-blue-100 dark:bg-blue-900/40",
            dotClass: "bg-blue-500",
            badgeClass: "bg-blue-100/60 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300",
            items: pendingDeliveries,
        },
        {
            id: "preparing",
            title: "Em preparação",
            subtitle: "Na expedição / separação",
            themeClass: "bg-amber-50/70 border-amber-100/50 text-amber-600 dark:bg-amber-950/20 dark:border-amber-900/30 dark:text-amber-400",
            dotBgClass: "bg-amber-100 dark:bg-amber-900/40",
            dotClass: "bg-amber-500",
            badgeClass: "bg-amber-100/60 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300",
            items: preparingDeliveries,
        },
        {
            id: "sent",
            title: "Enviado",
            subtitle: "A caminho",
            themeClass: "bg-rose-50/70 border-rose-100/50 text-rose-600 dark:bg-rose-950/20 dark:border-rose-900/30 dark:text-rose-400",
            dotBgClass: "bg-rose-100 dark:bg-rose-900/40",
            dotClass: "bg-rose-500",
            badgeClass: "bg-rose-100/60 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300",
            items: sentDeliveries,
        },
        {
            id: "delivered",
            title: "Entregue",
            subtitle: "Concluída",
            themeClass: "bg-emerald-50/70 border-emerald-100/50 text-emerald-600 dark:bg-emerald-950/20 dark:border-emerald-900/30 dark:text-emerald-400",
            dotBgClass: "bg-emerald-100 dark:bg-emerald-900/40",
            dotClass: "bg-emerald-500",
            badgeClass: "bg-emerald-100/60 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300",
            items: deliveredDeliveries,
        },
    ]

    const handleDragOver = (e: React.DragEvent, colId: string) => {
        e.preventDefault()
        setDragOverCol(colId)
    }

    const handleDragLeave = () => {
        setDragOverCol(null)
    }

    const handleDrop = (e: React.DragEvent, targetStatus: string) => {
        e.preventDefault()
        setDragOverCol(null)
        const deliveryId = e.dataTransfer.getData("text/plain")
        if (deliveryId && onQuickStatusChange) {
            onQuickStatusChange(deliveryId, targetStatus)
        }
    }

    return (
        <div className="flex flex-col h-full w-full px-4 md:px-8">
            {/* Standard ERP Tab Switcher */}
            <div className="mb-6 px-4 md:px-0">
                <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as "active" | "cancelled")}>
                    <TabsList className="px-0">
                        <TabsTrigger value="active" icon={ColumnsIcon}>
                            Entregas Ativas ({pendingDeliveries.length + preparingDeliveries.length + sentDeliveries.length + deliveredDeliveries.length})
                        </TabsTrigger>
                        <TabsTrigger value="cancelled" icon={BlockedIcon}>
                            Canceladas / Falhas ({cancelledDeliveries.length})
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
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
                                {/* Clean Column Header Pill */}
                                <div className={`flex items-center justify-between p-3 rounded-full border ${col.themeClass} shrink-0 mb-4`}>
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${col.dotBgClass}`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${col.dotClass}`} />
                                        </span>
                                        <h3 className="font-bold text-xs truncate">
                                            {col.title}
                                        </h3>
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${col.badgeClass}`}>
                                            {col.items.length}
                                        </span>
                                    </div>
                                    <PlusIcon className="w-3.5 h-3.5 opacity-60 shrink-0" />
                                </div>

                                {/* Column Body / Card Container with Drag & Drop */}
                                <div
                                    onDragOver={(e) => handleDragOver(e, col.id)}
                                    onDragLeave={handleDragLeave}
                                    onDrop={(e) => handleDrop(e, col.id)}
                                    className={`flex-1 flex flex-col gap-3.5 p-3 rounded-2xl border transition-all duration-200 ${
                                        dragOverCol === col.id
                                            ? "bg-gray-100/70 border-brand-green/30 dark:bg-zinc-800/40 dark:border-brand-green/30"
                                            : "border-transparent bg-gray-50/30 dark:bg-zinc-900/10"
                                    } overflow-y-auto max-h-[calc(100vh-320px)] min-h-[400px] custom-scrollbar`}
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
