"use client"

import React, { useMemo, useState, useEffect } from "react"
import { SearchIcon, PlusIcon, XIcon, CheckCircleIcon, BoxIcon } from "@/lib/icons"
import { Badge, Button, Input, IconPlaceholder } from "@/components/reusable"
import Portal from "@/components/Portal"
import BottomSheet from "@/components/BottomSheet"
import { useMediaQuery } from "@/components/erp/hooks"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { formatCurrency } from "@/lib/utils/formatters"

interface ProductItem {
    id: string
    name: string
    image?: string | null
    price?: number
    is_active?: boolean
}

interface SelectVideoProductSheetProps {
    isOpen: boolean
    onClose: () => void
    products: ProductItem[]
    selectedId: string | null
    onSave: (id: string | null) => void
    isLoading?: boolean
}

export default function SelectVideoProductSheet({
    isOpen,
    onClose,
    products,
    selectedId,
    onSave,
    isLoading = false,
}: SelectVideoProductSheetProps) {
    const [search, setSearch] = useState("")
    const [tempSelected, setTempSelected] = useState<string | null>(null)
    const isMobile = useMediaQuery("(max-width: 768px)")

    useEffect(() => {
        if (isOpen) {
            setTempSelected(selectedId)
            setSearch("")
        }
    }, [isOpen, selectedId])

    const filteredProducts = useMemo(() => {
        const term = search.trim().toLowerCase()
        const sorted = [...products].sort((a, b) => {
            const aInactive = a.is_active === false ? 1 : 0
            const bInactive = b.is_active === false ? 1 : 0
            if (aInactive !== bInactive) return aInactive - bInactive
            return a.name.localeCompare(b.name)
        })
        if (!term) return sorted
        return sorted.filter((item) => item.name.toLowerCase().includes(term))
    }, [products, search])

    const handleSave = () => {
        onSave(tempSelected)
        onClose()
    }

    const content = (
        <div className="flex h-full flex-col bg-white dark:bg-dark-surface">
            <header className="z-10 flex shrink-0 items-center justify-between border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
                <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Selecionar Produto</h2>
                <Button variant="filled" onClick={onClose} size="icon">
                    <XIcon className="h-5 w-5" />
                </Button>
            </header>

            <div className="z-10 shrink-0 border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
                <Input
                    label=""
                    name="productSearch"
                    placeholder="Buscar por nome..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
                    className="mb-0"
                    variant="full-rounded"
                />
            </div>

            <div className="custom-scrollbar flex-1 overflow-y-auto p-0">
                {isLoading ? (
                    <div className="flex flex-col">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="flex animate-pulse items-center gap-4 border-b border-brand-border p-3.5 last:border-0 dark:border-dark-border">
                                <div className="h-12 w-12 shrink-0 rounded-full bg-gray-100 dark:bg-dark-border" />
                                <div className="min-w-0 flex-1 space-y-2">
                                    <div className="h-4 w-2/3 rounded bg-gray-100 dark:bg-dark-border" />
                                    <div className="h-3 w-1/2 rounded bg-gray-100 dark:bg-dark-border" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : filteredProducts.length > 0 ? (
                    <div className="flex flex-col px-2 pb-2">
                        {filteredProducts.map((product) => {
                            const disabled = product.is_active === false
                            const isSelected = tempSelected === product.id
                            const imageUrl = product.image ? getR2ImageUrl(product.image, "thumbnail") : "https://img.dudit.com.br/static/Placeholder.png"

                            return (
                                <div
                                    key={product.id}
                                    role={disabled ? undefined : "button"}
                                    tabIndex={disabled ? undefined : 0}
                                    onClick={disabled ? undefined : () => setTempSelected(product.id)}
                                    onKeyDown={
                                        disabled ? undefined : (e) => {
                                            if (e.key === "Enter" || e.key === " ") {
                                                e.preventDefault()
                                                setTempSelected(product.id)
                                            }
                                        }
                                    }
                                    className={`group flex items-center gap-4 border-b border-brand-border p-3.5 transition-colors last:border-0 dark:border-dark-border ${disabled ? "cursor-not-allowed opacity-55" : isSelected ? "bg-brand-primary/5 dark:bg-brand-primary/10" : "cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-border/40"}`}
                                >
                                    <img
                                        src={imageUrl}
                                        alt={product.name}
                                        className={`h-12 w-12 shrink-0 rounded-full border border-brand-border dark:border-dark-border ${product.image ? "object-cover" : "object-contain"}`}
                                    />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                                            <span className="truncate text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                {product.name}
                                            </span>
                                            <Badge variant={product.is_active === false ? "gray" : "green"} className="whitespace-nowrap scale-90 shrink-0">
                                                {product.is_active === false ? "Inativo" : "Ativo"}
                                            </Badge>
                                        </div>
                                        <p className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">
                                            {product.price != null ? formatCurrency(product.price) : "Sem valor"}
                                        </p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                        {!disabled && isSelected ? (
                                            <div className="flex h-8 w-8 items-center justify-center text-brand-green">
                                                <CheckCircleIcon size={18} />
                                            </div>
                                        ) : !disabled ? (
                                            <div className="flex h-8 w-8 items-center justify-center text-brand-inactive-text opacity-0 transition-opacity group-hover:opacity-100">
                                                <PlusIcon size={18} />
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                ) : (
                    <div className="px-4 py-12">
                        <IconPlaceholder
                            icon={BoxIcon}
                            title="Nenhum produto encontrado"
                            subtitle="Tente outro termo de busca."
                        />
                    </div>
                )}
            </div>

            <footer className="shrink-0 border-t border-brand-border bg-white p-4 dark:border-dark-border dark:bg-dark-surface">
                <div className="flex items-center gap-4">
                    <Button variant="outline" className="h-12 flex-1" onClick={onClose}>
                        Cancelar
                    </Button>
                    <Button className="h-12 flex-1" onClick={handleSave}>
                        {tempSelected ? "Selecionar" : "Limpar seleção"}
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
                className={`fixed inset-0 z-[80] bg-black/50 transition-opacity duration-300 ${isOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
                onClick={onClose}
            >
                <div
                    className={`fixed right-4 top-4 bottom-4 z-[81] w-[450px] overflow-hidden rounded-2xl bg-white shadow-2xl transition-transform duration-300 dark:bg-dark-surface ${isOpen ? "translate-x-0" : "translate-x-[120%]"}`}
                    onClick={(e) => e.stopPropagation()}
                >
                    {content}
                </div>
            </div>
        </Portal>
    )
}
