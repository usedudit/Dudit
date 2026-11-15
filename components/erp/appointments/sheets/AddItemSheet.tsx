"use client"

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Package, SearchIcon, XIcon, PlusIcon } from "@/lib/icons"
import { Button, Input, FormDropdown, ThreeDotsLoader } from "@/components/reusable"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { fetchPartnerProductsBucket } from "@/app/actions/erp/client-loaders"
import { useProductBucket, type ProductBucketItem } from "@/components/erp/hooks"
import { ProductSearchResultItem } from "@/components/erp/shared/ProductSearchResultItem"
import QuantitySelector from "@/components/reusable/QuantitySelector"
import { formatCurrency } from "@/lib/utils/formatters"
import { listActivePromotionsForMarketplaceAction } from "@/app/actions/shared/promotions"

interface AddItemSheetProps {
    isOpen: boolean
    onClose: () => void
    partnerId?: string
    storeId?: string | null
    onConfirm: (item: {
        product_id?: string | null
        variant_id?: string | null
        name: string
        quantity: number
        usage_type: 'consumed' | 'returnable' | 'reference'
        image?: string | null
    }) => void
}

export default function AddItemSheet({ isOpen, onClose, partnerId, storeId, onConfirm }: AddItemSheetProps) {
    const [searchQuery, setSearchQuery] = useState("")
    const [selectedProduct, setSelectedProduct] = useState<any | null>(null)
    const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null)
    const [quantity, setQuantity] = useState(1)
    const [usageType, setUsageType] = useState<string>('consumed')
    const [isManualMode, setIsManualMode] = useState(false)
    const [manualName, setManualName] = useState("")
    const [showResults, setShowResults] = useState(false)
    const [activePromotions, setActivePromotions] = useState<any[]>([])
    const searchRef = useRef<HTMLDivElement>(null)

    const loadProducts = useCallback(() => fetchPartnerProductsBucket(storeId), [storeId])
    const productBucket = useProductBucket<ProductBucketItem>(loadProducts, { pageSize: 10, preload: isOpen })
    const setBucketSearchQuery = productBucket.setSearchQuery

    useEffect(() => {
        if (isOpen && partnerId) {
            listActivePromotionsForMarketplaceAction(partnerId).then(res => {
                if (Array.isArray(res)) {
                    setActivePromotions(res)
                }
            }).catch(err => {
                console.error("Error loading active promotions for search:", err)
            })
        } else if (!isOpen) {
            setSearchQuery("")
            setSelectedProduct(null)
            setSelectedVariantId(null)
            setQuantity(1)
            setUsageType('consumed')
            setIsManualMode(false)
            setManualName("")
            setShowResults(false)
            setActivePromotions([])
            setBucketSearchQuery("")
        }
    }, [isOpen, partnerId, setBucketSearchQuery])

    useEffect(() => {
        if (!searchQuery || searchQuery.trim().length < 2) {
            setShowResults(false)
            return
        }
        setShowResults(true)
    }, [searchQuery])

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
                setShowResults(false)
            }
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [])

    const handleProductSelect = useCallback((product: any) => {
        setSelectedProduct(product)
        setShowResults(false)
        setManualName("")
        setIsManualMode(false)
        if (product.variants && product.variants.length > 0) {
            setSelectedVariantId(product.variants[0].id)
        } else {
            setSelectedVariantId(null)
        }
    }, [])

    const selectedVariant = useMemo(() => {
        if (!selectedProduct || !selectedProduct.variants) return null
        return selectedProduct.variants.find((v: any) => v.id === selectedVariantId) || null
    }, [selectedProduct, selectedVariantId])

    const displayStock = useMemo(() => {
        if (selectedVariant) return selectedVariant.stock
        if (selectedProduct) return selectedProduct.stock
        return 0
    }, [selectedProduct, selectedVariant])

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
                variant_id: selectedVariantId || null,
                name: selectedVariant ? `${selectedProduct.name} - ${selectedVariant.name}` : selectedProduct.name,
                quantity,
                usage_type: usageType as any,
                image: selectedVariant?.image || selectedProduct.image || selectedProduct.variants?.find((v: any) => v.image)?.image || null,
            })
        }
        onClose()
    }, [isManualMode, manualName, selectedProduct, selectedVariantId, selectedVariant, quantity, usageType, onConfirm, onClose])

    const handleManualClick = useCallback(() => {
        setIsManualMode(true)
        if (searchQuery.trim()) {
            setManualName(searchQuery.trim())
        }
        setShowResults(false)
    }, [searchQuery])

    const canConfirm = isManualMode ? manualName.trim().length > 0 : selectedProduct !== null

    const showSearch = !selectedProduct && !isManualMode
    const showSelectionForm = selectedProduct || isManualMode

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
                                    {selectedProduct
                                        ? selectedProduct.name
                                        : isManualMode
                                            ? 'Adicionar item manual'
                                            : 'Adicionar Item'}
                                </h2>
                                <Button variant="filled" onClick={onClose} size="icon" className="hidden lg:flex">
                                    <XIcon className="h-5 w-5" />
                                </Button>
                            </header>

                            <div className="flex-1 space-y-6 overflow-y-auto p-6 custom-scrollbar">
                                {/* SEARCH STEP */}
                                {showSearch && (
                                    <div ref={searchRef} className="relative">
                                        <Input
                                            label=""
                                            name="search"
                                            placeholder="Buscar produto por nome ou SKU..."
                                            value={searchQuery}
                                            onChange={(e) => {
                                                setSearchQuery(e.target.value)
                                                setBucketSearchQuery(e.target.value)
                                                setShowResults(true)
                                            }}
                                            onFocus={() => {
                                                productBucket.loadBucket()
                                                setShowResults(true)
                                            }}
                                            prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
                                            className="mb-0"
                                        />

                                        <AnimatePresence>
                                            {showResults && searchQuery.length >= 2 && (
                                                <motion.div
                                                    initial={{ opacity: 0, y: 5 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, y: 5 }}
                                                    className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl shadow-xl z-[9999] max-h-72 overflow-y-auto custom-scrollbar"
                                                >
                                                    {productBucket.isLoading ? (
                                                        <div className="p-4"><ThreeDotsLoader /></div>
                                                    ) : productBucket.filteredResults.length > 0 ? (
                                                        productBucket.filteredResults.map((product) => (
                                                            <ProductSearchResultItem
                                                                key={product.id}
                                                                item={product}
                                                                promotions={activePromotions}
                                                                onClick={() => handleProductSelect(product)}
                                                            />
                                                        ))
                                                    ) : (
                                                        <div className="p-4 text-center text-sm text-brand-inactive-text">
                                                            Nenhum produto encontrado
                                                        </div>
                                                    )}
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                )}

                                {/* "Adicionar item manual" link - always visible when searching */}
                                {showSearch && (
                                    <Button
                                        variant="link"
                                        onClick={handleManualClick}
                                    >
                                        <PlusIcon size={14} />
                                        Adicionar item manual
                                    </Button>
                                )}

                                {/* SELECTED PRODUCT VIEW */}
                                {selectedProduct && (
                                    <div className="space-y-6">
                                        <div className="flex items-center gap-4 p-4 rounded-xl border border-brand-border dark:border-dark-border bg-brand-gray/30 dark:bg-dark-border/20">
                                            <div className="w-14 h-14 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center overflow-hidden border border-brand-border dark:border-dark-border">
                                                {(() => {
                                                    const selectedImage = selectedVariant?.image || selectedProduct.image || selectedProduct.variants?.find((v: any) => v.image)?.image
                                                    return selectedImage ? (
                                                        <img src={getR2ImageUrl(selectedImage, "thumbnail")} className="w-full h-full object-cover" alt="" />
                                                    ) : (
                                                        <Package size={24} className="text-brand-inactive-text" />
                                                    )
                                                })()}
                                            </div>
                                            <div>
                                                <p className="font-bold text-brand-dark dark:text-dark-heading">{selectedProduct.name}</p>
                                                <p className="text-xs text-brand-inactive-text">SKU: {selectedVariant ? selectedVariant.sku : selectedProduct.sku}</p>
                                                <p className={`text-xs font-bold mt-1 ${displayStock > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                    {displayStock} em estoque
                                                </p>
                                            </div>
                                            <Button
                                                variant="link"
                                                className="ml-auto shrink-0"
                                                onClick={() => {
                                                    setSelectedProduct(null)
                                                    setSearchQuery("")
                                                    setBucketSearchQuery("")
                                                }}
                                            >
                                                Trocar
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                {/* MANUAL MODE */}
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

                                {/* USAGE TYPE & QUANTITY */}
                                {showSelectionForm && (
                                    <>
                                        {selectedProduct && selectedProduct.variants && selectedProduct.variants.length > 0 && (
                                            <div>
                                                <FormDropdown
                                                    label="Selecione a Variação"
                                                    options={selectedProduct.variants.map((v: any) => ({
                                                        value: v.id,
                                                        label: `${v.name || 'Variação'} - ${formatCurrency(v.price)} (${v.stock} em estoque)`
                                                    }))}
                                                    value={selectedVariantId || ""}
                                                    setValue={(val) => setSelectedVariantId(val || null)}
                                                    width="w-full"
                                                />
                                            </div>
                                        )}

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

                            {showSelectionForm && (
                                <div className="border-t border-brand-border dark:border-dark-border p-6">
                                    <Button
                                        variant="default"
                                        className="w-full h-12 font-bold"
                                        onClick={handleConfirm}
                                        disabled={!canConfirm}
                                    >
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
