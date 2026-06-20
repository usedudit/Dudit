"use client"

import React, { useState, useEffect } from "react"
import { Package, ShoppingCartIcon, AlertTriangleIcon, XIcon } from "@/lib/icons"
import { Button, Input, IconPlaceholder, Spinner, Badge } from "@/components/reusable"
import Portal from "@/components/Portal"
import BottomSheet from "@/components/BottomSheet"
import { useMediaQuery } from "@/components/erp/hooks"
import { getReplenishmentSuggestionsAction } from "@/app/actions/erp/products"
import { notifyReplenishmentSuggestedAction } from "@/app/actions/erp/notifications"
import { formatCurrency } from "@/lib/utils"
import { useRouter } from "next/navigation"

interface Suggestion {
    id: string
    name: string
    sku: string | null
    gtin: string | null
    stock_quantity: number
    min_stock: number
    suggestion: number
    unit: string
    cost_price: number | null
    image: string | null
    supplier_name: string | null
    supplier_cost: number | null
}

interface ReplenishmentSheetProps {
    isOpen: boolean
    onClose: () => void
    partnerId: string
}

export function ReplenishmentSheet({ isOpen, onClose, partnerId }: ReplenishmentSheetProps) {
    const isMobile = useMediaQuery("(max-width: 767px)")
    const router = useRouter()
    const [suggestions, setSuggestions] = useState<Suggestion[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!isOpen) { setSuggestions([]); setError(null); return }
        setLoading(true)
        getReplenishmentSuggestionsAction(partnerId).then((res) => {
            if (res.error) setError(res.error)
            else {
                setSuggestions(res.suggestions || [])
                if (res.suggestions && res.suggestions.length > 0) {
                    notifyReplenishmentSuggestedAction()
                }
            }
            setLoading(false)
        })
    }, [isOpen, partnerId])

    const content = (
        <div className="flex flex-col h-full">
            <div className="flex items-center justify-between p-4 border-b border-brand-border dark:border-dark-border">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-brand-orange/10 flex items-center justify-center">
                        <ShoppingCartIcon size={16} className="text-brand-orange" />
                    </div>
                    <h2 className="text-lg font-bold text-brand-dark dark:text-dark-heading">
                        Sugestões de Reposição
                    </h2>
                </div>
                <button onClick={onClose} className="p-1 hover:bg-brand-gray dark:hover:bg-dark-border rounded-lg">
                    <XIcon size={20} className="text-brand-inactive-text" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto">
                {loading ? (
                    <div className="flex items-center justify-center py-16"><Spinner size={28} /></div>
                ) : error ? (
                    <div className="p-6 text-center">
                        <p className="text-sm text-brand-red font-medium">{error}</p>
                    </div>
                ) : suggestions.length === 0 ? (
                    <IconPlaceholder
                        icon={Package}
                        title="Tudo ok!"
                        subtitle="Nenhum produto precisa de reposição no momento."
                    />
                ) : (
                    <div className="p-4 space-y-3">
                        <p className="text-sm text-brand-inactive-text font-medium px-1">
                            {suggestions.length} produto(s) abaixo do estoque mínimo
                        </p>
                        {suggestions.map((s) => (
                            <div
                                key={s.id}
                                className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl p-4 hover:shadow-sm transition-shadow cursor-pointer"
                                onClick={() => { onClose(); router.push(`/erp/products?view=${s.id}`) }}
                            >
                                <div className="flex items-start gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center overflow-hidden">
                                        {s.image ? (
                                            <img src={s.image} alt={s.name} className="w-full h-full object-cover" />
                                        ) : (
                                            <Package size={18} className="text-brand-inactive-text" />
                                        )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">{s.name}</p>
                                        <p className="text-xs text-brand-inactive-text">{s.sku || s.gtin || "Sem código"}</p>
                                    </div>
                                    <Badge variant="orange">{s.suggestion} {s.unit}</Badge>
                                </div>

                                <div className="mt-3 flex items-center gap-4 text-xs">
                                    <div>
                                        <span className="text-brand-inactive-text">Atual: </span>
                                        <span className="font-bold text-brand-red">{s.stock_quantity}</span>
                                    </div>
                                    <div>
                                        <span className="text-brand-inactive-text">Mínimo: </span>
                                        <span className="font-bold text-brand-dark dark:text-dark-heading">{s.min_stock}</span>
                                    </div>
                                    {s.supplier_name && (
                                        <div className="ml-auto text-right">
                                            <span className="text-brand-inactive-text block">{s.supplier_name}</span>
                                            {s.supplier_cost != null && (
                                                <span className="font-medium text-brand-dark dark:text-dark-heading">{formatCurrency(s.supplier_cost)}</span>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {s.suggestion > 0 && (
                                    <div className="mt-2 pt-2 border-t border-brand-border/50 dark:border-dark-border/50 flex items-center gap-1.5">
                                        <AlertTriangleIcon size={12} className="text-brand-orange shrink-0" />
                                        <span className="text-xs text-brand-orange font-medium">
                                            Sugerimos comprar {s.suggestion} {s.unit}(s)
                                        </span>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )

    if (isMobile) {
        return (
            <BottomSheet isOpen={isOpen} onClose={onClose}>
                {content}
            </BottomSheet>
        )
    }

    return (
        <Portal>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/30" onClick={onClose} />
                    <div className="relative bg-white dark:bg-dark-surface rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden">
                        {content}
                    </div>
                </div>
            )}
        </Portal>
    )
}
