"use client"

import { useState } from "react"
import { XIcon } from "@/lib/icons"
import { Button, QuantitySelector } from "@/components/reusable"
import Portal from "@/components/Portal"
import BottomSheet from "@/components/BottomSheet"
import { useMediaQuery } from "@/components/erp/hooks"
import { useModalLayer } from "@/lib/modal-stack"

interface ProductVariant {
    id: string
    variant_type: string
    variant_name: string
    sku: string | null
    price_adjustment: number
    stock_quantity: number
    is_active: boolean
}

interface ProductBase {
    id: string
    name: string
    sku: string | null
    price: number
    variants?: ProductVariant[]
}

interface SelectVariantSheetProps {
    isOpen: boolean
    onClose: () => void
    product: ProductBase
    selectedVariantId?: string
    onConfirm: (variantId: string | null) => void
}

function formatCurrency(value: number): string {
    return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

export default function SelectVariantSheet({ isOpen, onClose, product, selectedVariantId, onConfirm }: SelectVariantSheetProps) {
    const isMobile = useMediaQuery("(max-width: 1023px)")
    // z-index dinâmico: esta sheet abre acima de tudo que já estava aberto.
    const zIndex = useModalLayer(isOpen)
    const [selectedId, setSelectedId] = useState<string | null>(selectedVariantId || null)

    const variants = product.variants?.filter((v) => v.is_active) || []

    const variantTypes = Array.from(new Set(variants.map((v) => v.variant_type)))

    const handleSave = () => {
        onConfirm(selectedId)
    }

    const content = (
        <div className="flex h-full flex-col bg-white dark:bg-dark-surface">
            <header className="z-10 flex shrink-0 items-center justify-between border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
                <div>
                    <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Variacoes</h2>
                    <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-1">{product.name}</p>
                </div>
                <Button variant="filled" onClick={onClose} size="icon" className="hidden lg:flex">
                    <XIcon className="h-5 w-5" />
                </Button>
            </header>

            <div className="custom-scrollbar flex-1 overflow-y-auto p-4 space-y-4">
                {/* Option: no variant (base product) */}
                <button
                    onClick={() => setSelectedId(null)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors ${selectedId === null
                        ? "border-brand-primary bg-brand-primary/5 dark:bg-brand-primary/10"
                        : "border-brand-border dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-border/40"
                        }`}
                >
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${selectedId === null ? "border-brand-primary" : "border-gray-300 dark:border-dark-border"
                        }`}>
                        {selectedId === null && <div className="w-2 h-2 rounded-full bg-brand-primary" />}
                    </div>
                    <div className="flex-1 text-left">
                        <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">Produto base</p>
                        <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                            Sem variação - {formatCurrency(product.price)}
                        </p>
                    </div>
                </button>

                {/* Group variants by type */}
                {variantTypes.map((type) => (
                    <div key={type}>
                        <p className="text-xs font-bold text-brand-inactive-text dark:text-dark-body uppercase tracking-wide mb-2">
                            {type}
                        </p>
                        <div className="space-y-1.5">
                            {variants
                                .filter((v) => v.variant_type === type)
                                .map((variant) => {
                                    const isSelected = selectedId === variant.id
                                    const finalPrice = product.price + variant.price_adjustment
                                    return (
                                        <button
                                            key={variant.id}
                                            onClick={() => setSelectedId(variant.id)}
                                            className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors ${isSelected
                                                ? "border-brand-primary bg-brand-primary/5 dark:bg-brand-primary/10"
                                                : "border-brand-border dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-border/40"
                                                }`}
                                        >
                                            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${isSelected ? "border-brand-primary" : "border-gray-300 dark:border-dark-border"
                                                }`}>
                                                {isSelected && <div className="w-2 h-2 rounded-full bg-brand-primary" />}
                                            </div>
                                            <div className="flex-1 text-left">
                                                <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                    {variant.variant_name}
                                                </p>
                                                <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                                                    {variant.sku && `SKU: ${variant.sku}`}
                                                    {variant.sku && " | "}
                                                    {formatCurrency(finalPrice)}
                                                    {variant.price_adjustment !== 0 && (
                                                        <span className="text-brand-primary ml-1">
                                                            ({variant.price_adjustment > 0 ? "+" : ""}{formatCurrency(variant.price_adjustment)})
                                                        </span>
                                                    )}
                                                </p>
                                            </div>
                                            <div className="shrink-0 text-xs text-brand-inactive-text">
                                                Estoque: {variant.stock_quantity}
                                            </div>
                                        </button>
                                    )
                                })}
                        </div>
                    </div>
                ))}
            </div>

            <footer className="shrink-0 border-t border-brand-border bg-white p-4 dark:border-dark-border dark:bg-dark-surface">
                <div className="flex items-center gap-4">
                    <Button variant="outline" className="h-12 flex-1" onClick={onClose}>
                        Cancelar
                    </Button>
                    <Button className="h-12 flex-1" onClick={handleSave}>
                        Salvar
                    </Button>
                </div>
            </footer>
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
            <div
                className={`fixed inset-0 z-[140] bg-black/50 transition-opacity ${isOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
                style={{ zIndex }}
                onClick={onClose}
            >
                <div
                    className={`fixed right-4 top-4 bottom-4 w-[400px] overflow-hidden rounded-2xl bg-white shadow-2xl transition-all duration-300 dark:bg-dark-surface ${isOpen ? "translate-x-0 opacity-100" : "translate-x-[120%] opacity-100"}`}
                    style={{ zIndex: zIndex ? zIndex + 1 : undefined }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {content}
                </div>
            </div>
        </Portal>
    )
}
