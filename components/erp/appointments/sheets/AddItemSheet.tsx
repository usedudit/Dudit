"use client"

import React, { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Package, SearchIcon, XIcon, CheckCircleIcon } from "@/lib/icons"
import { Button, Input, FormDropdown, ThreeDotsLoader } from "@/components/reusable"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { searchProductsForAppointmentItems } from "@/app/actions/erp/appointment-items"
import QuantitySelector from "@/components/reusable/QuantitySelector"

interface AddItemSheetProps {
    isOpen: boolean
    onClose: () => void
    onConfirm: (item: {
        product_id?: string | null
        variant_id?: string | null
        name: string
        quantity: number
        usage_type: 'consumed' | 'returnable' | 'reference'
        image?: string | null
    }) => void
}

export default function AddItemSheet({ isOpen, onClose, onConfirm }: AddItemSheetProps) {
    const [searchQuery, setSearchQuery] = useState("")
    const [searchResults, setSearchResults] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [selectedProduct, setSelectedProduct] = useState<any | null>(null)
    const [quantity, setQuantity] = useState(1)
    const [usageType, setUsageType] = useState<string>('consumed')
    const [isManualMode, setIsManualMode] = useState(false)
    const [manualName, setManualName] = useState("")

    useEffect(() => {
        if (!isOpen) {
            setSearchQuery("")
            setSearchResults([])
            setSelectedProduct(null)
            setQuantity(1)
            setUsageType('consumed')
            setIsManualMode(false)
            setManualName("")
        }
    }, [isOpen])

    useEffect(() => {
        if (!searchQuery || searchQuery.trim().length < 2) {
            setSearchResults([])
            return
        }

        const timer = setTimeout(async () => {
            setIsLoading(true)
            try {
                const results = await searchProductsForAppointmentItems(searchQuery)
                setSearchResults(results)
            } catch {
                setSearchResults([])
            } finally {
                setIsLoading(false)
            }
        }, 300)

        return () => clearTimeout(timer)
    }, [searchQuery])

    const handleConfirm = useCallback(() => {
        if (isManualMode) {
            if (!manualName.trim()) return
            onConfirm({
                name: manualName.trim(),
                quantity,
                usage_type: usageType as any,
            })
        } else if (selectedProduct) {
            onConfirm({
                product_id: selectedProduct.id,
                name: selectedProduct.name,
                quantity,
                usage_type: usageType as any,
                image: selectedProduct.image || null,
            })
        }
        onClose()
    }, [isManualMode, manualName, selectedProduct, quantity, usageType, onConfirm, onClose])

    const canConfirm = isManualMode ? manualName.trim().length > 0 : selectedProduct !== null

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[60] bg-black/50"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ x: '100%', opacity: 1 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: '100%', opacity: 1 }}
                        transition={{ type: "spring", stiffness: 400, damping: 40 }}
                        className="fixed right-4 top-4 bottom-4 z-[60] w-[450px] flex flex-col bg-white shadow-2xl dark:bg-dark-surface overflow-hidden rounded-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex h-full flex-col bg-white dark:bg-dark-surface">
                            <header className="z-10 flex shrink-0 items-center justify-between border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
                                <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">
                                    {selectedProduct ? selectedProduct.name : 'Adicionar Item'}
                                </h2>
                                <Button variant="filled" onClick={onClose} size="icon">
                                    <XIcon className="h-5 w-5" />
                                </Button>
                            </header>

                            <div className="flex-1 space-y-6 overflow-y-auto p-6 custom-scrollbar">
                                {!selectedProduct && (
                                    <>
                                        <div className="relative">
                                            <Input
                                                label=""
                                                name="search"
                                                placeholder="Buscar produto por nome ou SKU..."
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
                                                className="mb-0"
                                            />
                                        </div>

                                        {isLoading && (
                                            <div className="p-4"><ThreeDotsLoader /></div>
                                        )}

                                        {searchResults.length > 0 && !isLoading && (
                                            <div className="space-y-1">
                                                {searchResults.map((product) => (
                                                    <button
                                                        key={product.id}
                                                        onClick={() => setSelectedProduct(product)}
                                                        className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-brand-gray dark:hover:bg-dark-border transition-colors text-left"
                                                    >
                                                        <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center overflow-hidden border border-brand-border dark:border-dark-border">
                                                            {product.image ? (
                                                                <img src={getR2ImageUrl(product.image, "thumbnail")} className="w-full h-full object-cover" alt="" />
                                                            ) : (
                                                                <Package size={18} className="text-brand-inactive-text" />
                                                            )}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-[13px] font-medium text-brand-dark dark:text-dark-heading truncate">{product.name}</p>
                                                            <p className="text-[11px] text-brand-inactive-text">SKU: {product.sku}</p>
                                                        </div>
                                                        <div className="text-right shrink-0">
                                                            <p className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${product.stock > 0 ? 'text-emerald-600 bg-emerald-50' : 'text-red-600 bg-red-50'}`}>
                                                                {product.stock} em estoque
                                                            </p>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        )}

                                        {searchQuery.length >= 2 && searchResults.length === 0 && !isLoading && (
                                            <div className="text-center py-8">
                                                <p className="text-sm text-brand-inactive-text mb-4">Nenhum produto encontrado</p>
                                                <Button
                                                    variant="outline"
                                                    onClick={() => {
                                                        setIsManualMode(true)
                                                        setManualName(searchQuery)
                                                    }}
                                                >
                                                    Adicionar "{searchQuery}" manualmente
                                                </Button>
                                            </div>
                                        )}
                                    </>
                                )}

                                {selectedProduct && (
                                    <div className="space-y-6">
                                        <div className="flex items-center gap-4 p-4 rounded-xl border border-brand-border dark:border-dark-border bg-brand-gray/30 dark:bg-dark-border/20">
                                            <div className="w-14 h-14 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center overflow-hidden border border-brand-border dark:border-dark-border">
                                                {selectedProduct.image ? (
                                                    <img src={getR2ImageUrl(selectedProduct.image, "thumbnail")} className="w-full h-full object-cover" alt="" />
                                                ) : (
                                                    <Package size={24} className="text-brand-inactive-text" />
                                                )}
                                            </div>
                                            <div>
                                                <p className="font-bold text-brand-dark dark:text-dark-heading">{selectedProduct.name}</p>
                                                <p className="text-xs text-brand-inactive-text">SKU: {selectedProduct.sku}</p>
                                                <p className={`text-xs font-bold mt-1 ${selectedProduct.stock > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                    {selectedProduct.stock} em estoque
                                                </p>
                                            </div>
                                            <Button
                                                variant="link"
                                                className="ml-auto shrink-0"
                                                onClick={() => setSelectedProduct(null)}
                                            >
                                                Trocar
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                {isManualMode && (
                                    <div>
                                        <Input
                                            label="Nome do item"
                                            name="manualName"
                                            placeholder="Digite o nome do item..."
                                            value={manualName}
                                            onChange={(e) => setManualName(e.target.value)}
                                        />
                                    </div>
                                )}

                                {(selectedProduct || isManualMode) && (
                                    <>
                                        <div>
                                            <FormDropdown
                                                label="Tipo de Uso"
                                                options={[
                                                    { value: "consumed", label: "Consumido" },
                                                    { value: "returnable", label: "Retornável" },
                                                    { value: "reference", label: "Referência" },
                                                ]}
                                                value={usageType}
                                                setValue={setUsageType}
                                                width="w-full"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-bold text-brand-dark dark:text-dark-heading mb-2">
                                                Quantidade
                                            </label>
                                            <QuantitySelector
                                                value={quantity}
                                                onChange={setQuantity}
                                                size="md"
                                            />
                                        </div>
                                    </>
                                )}
                            </div>

                            {(selectedProduct || isManualMode) && (
                                <div className="border-t border-brand-border dark:border-dark-border p-6">
                                    <Button
                                        variant="default"
                                        className="w-full h-12 font-bold"
                                        onClick={handleConfirm}
                                        disabled={!canConfirm}
                                    >
                                        <CheckCircleIcon size={18} className="mr-2" />
                                        Adicionar Item
                                    </Button>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
