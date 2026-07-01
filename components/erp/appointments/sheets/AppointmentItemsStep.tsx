"use client"

import React, { useMemo } from "react"
import { motion } from "framer-motion"
import { Package, AlertTriangleIcon } from "@/lib/icons"
import { IconPlaceholder } from "@/components/reusable"
import QuantitySelector from "@/components/reusable/QuantitySelector"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"

interface ItemEntry {
    key: string
    productId?: string | null
    variantId?: string | null
    serviceId?: string | null
    name: string
    quantity: number
    usageType: 'consumed' | 'returnable' | 'reference'
    serviceName: string
    image?: string | null
    sku?: string | null
    stock?: number
}

interface AppointmentItemsStepProps {
    items: ItemEntry[]
    onItemsChange: (items: ItemEntry[]) => void
    services: any[]
}

function resolveResourcesFromServices(services: any[]): ItemEntry[] {
    const seen = new Map<string, ItemEntry>()

    for (const svc of services) {
        const svcResources = svc.resources || []
        for (const res of svcResources) {
            const key = res.product_id || `manual-${res.name}-${svc.id}`
            if (seen.has(key)) {
                const existing = seen.get(key)!
                existing.quantity += Number(res.quantity || 1)
            } else {
                seen.set(key, {
                    key,
                    productId: res.product_id || null,
                    variantId: res.variant_id || null,
                    serviceId: svc.id || null,
                    name: res.name,
                    quantity: Number(res.quantity || 1),
                    usageType: res.usage_type || 'consumed',
                    serviceName: svc.name,
                    image: res.image || null,
                    sku: res.sku || null,
                    stock: res.stock,
                })
            }
        }
    }

    return Array.from(seen.values())
}

const usageTypeLabels: Record<string, { label: string; color: string }> = {
    consumed: { label: 'Consumido', color: 'text-red-600 bg-red-50 dark:bg-red-900/10 border-red-100' },
    returnable: { label: 'Retornável', color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/10 border-blue-100' },
    reference: { label: 'Referência', color: 'text-gray-500 bg-gray-50 dark:bg-gray-800 border-gray-200' },
}

export function AppointmentItemsStep({ items, onItemsChange, services }: AppointmentItemsStepProps) {
    const hasItems = items.length > 0

    const handleQuantityChange = (key: string, quantity: number) => {
        onItemsChange(items.map(item =>
            item.key === key ? { ...item, quantity } : item
        ))
    }

    if (!hasItems) {
        return (
            <motion.div
                key="items"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
            >
                <IconPlaceholder
                    icon={Package}
                    title="Nenhum item necessário"
                    subtitle="Os serviços selecionados não utilizam itens de estoque."
                />
            </motion.div>
        )
    }

    return (
        <motion.div
            key="items"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
        >
            <div>
                <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-1">
                    Itens utilizados nos serviços
                </h3>
                <p className="text-brand-inactive-text dark:text-dark-body text-sm mb-6">
                    Ajuste a quantidade de cada item para este agendamento.
                </p>
            </div>

            <div className="space-y-3">
                {items.map((item) => {
                    const typeInfo = usageTypeLabels[item.usageType] || usageTypeLabels.reference
                    return (
                        <div
                            key={item.key}
                            className="flex items-center gap-4 p-4 rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface"
                        >
                            <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center overflow-hidden border border-brand-border dark:border-dark-border">
                                {item.image ? (
                                    <img src={getR2ImageUrl(item.image, "thumbnail")} className="w-full h-full object-cover" alt="" />
                                ) : (
                                    <Package size={18} className="text-brand-inactive-text" />
                                )}
                            </div>

                            <div className="flex-1 min-w-0">
                                <div className="font-bold text-[13px] text-brand-dark dark:text-dark-heading truncate">
                                    {item.name}
                                </div>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="text-[11px] text-brand-inactive-text truncate">
                                        {item.serviceName}
                                    </span>
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${typeInfo.color}`}>
                                        {typeInfo.label}
                                    </span>
                                </div>
                                {item.stock !== undefined && item.stock <= 0 && item.usageType !== 'reference' && (
                                    <div className="flex items-center gap-1 mt-1 text-[10px] text-amber-600 font-medium">
                                        <AlertTriangleIcon size={10} />
                                        Sem estoque disponível
                                    </div>
                                )}
                            </div>

                            <QuantitySelector
                                value={item.quantity}
                                onChange={(val) => handleQuantityChange(item.key, val)}
                                size="sm"
                            />
                        </div>
                    )
                })}
            </div>
        </motion.div>
    )
}

export { resolveResourcesFromServices }
export type { ItemEntry }
