import React, { useMemo } from "react"
import { motion } from "framer-motion"
import { Package, AlertTriangleIcon, InfoIcon } from "@/lib/icons"
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
    minStock?: number
}

interface AppointmentItemsStepProps {
    items: ItemEntry[]
    onItemsChange: (items: ItemEntry[]) => void
    services: any[]
    partnerPlan?: string
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
                    image: res.image || res.product?.image || res.product?.images?.[0] || null,
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

export function AppointmentItemsStep({ items, onItemsChange, services, partnerPlan }: AppointmentItemsStepProps) {
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

    const isAdvancedPlan = partnerPlan === 'crescer' || partnerPlan === 'escalar'

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
                    {isAdvancedPlan && (
                        <span className="ml-2 text-xs text-blue-600 bg-blue-50 dark:bg-blue-900/10 px-2 py-0.5 rounded">
                            Estoque verificado antes de confirmar
                        </span>
                    )}
                </p>
            </div>

            <div className="space-y-3">
                {items.map((item) => {
                    const typeInfo = usageTypeLabels[item.usageType] || usageTypeLabels.reference
                    const isConsumed = item.usageType === 'consumed'
                    const currentStock = item.stock ?? 0
                    const projectedStock = currentStock - item.quantity
                    const minStock = item.minStock ?? 0
                    const willGoNegative = isConsumed && projectedStock < 0
                    const willGoBelowMin = isConsumed && minStock > 0 && projectedStock < minStock

                    const itemImg = item.image || (item as any).product?.image || (item as any).product?.images?.[0]
                    return (
                        <div
                            key={item.key}
                            className={`flex items-center gap-4 p-4 rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface ${(willGoNegative || willGoBelowMin) && isAdvancedPlan ? 'border-amber-300 dark:border-amber-800/30 bg-amber-50/50 dark:bg-amber-900/10' : ''}`}
                        >
                            <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center overflow-hidden border border-brand-border dark:border-dark-border">
                                {itemImg ? (
                                    <img src={getR2ImageUrl(itemImg, "thumbnail")} className="w-full h-full object-cover" alt="" />
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
                                {isConsumed && (
                                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                                        {item.stock === undefined ? (
                                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full border text-gray-400 bg-gray-50 dark:bg-gray-800 border-gray-200">
                                                Carregando estoque...
                                            </span>
                                        ) : (
                                            <>
                                                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${
                                                    willGoNegative ? 'text-red-600 bg-red-50 border-red-100' :
                                                    willGoBelowMin ? 'text-amber-600 bg-amber-50 border-amber-100' :
                                                    projectedStock <= minStock && minStock > 0 ? 'text-amber-600 bg-amber-50 border-amber-100' :
                                                    'text-emerald-600 bg-emerald-50 border-emerald-100'
                                                }`}>
                                                    {willGoNegative ? (
                                                        <>
                                                            <AlertTriangleIcon size={10} className="mr-0.5" />
                                                            Estoque ficará {projectedStock} (negativo)
                                                        </>
                                                    ) : willGoBelowMin ? (
                                                        <>
                                                            <InfoIcon size={10} className="mr-0.5" />
                                                            Abaixo do mínimo ({projectedStock}/{minStock})
                                                        </>
                                                    ) : (
                                                        `Estoque após: ${projectedStock} ${minStock > 0 ? `(mín: ${minStock})` : ''}`
                                                    )}
                                                </span>
                                                {Boolean(item.productId) && item.stock !== undefined && item.stock <= 0 && (
                                                    <span className="flex items-center gap-1 text-[10px] text-amber-600 font-medium">
                                                        <AlertTriangleIcon size={10} />
                                                        Sem estoque disponível
                                                    </span>
                                                )}
                                            </>
                                        )}
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
