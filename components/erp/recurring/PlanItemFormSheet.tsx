"use client"

import React, { useMemo, useState, useEffect } from "react"
import { SearchIcon, PlusIcon, XIcon, CheckCircleIcon, BoxIcon, ClockIcon } from "@/lib/icons"
import { Button, Input, IconPlaceholder, FormDropdown, Tabs, TabsList, TabsTrigger } from "@/components/reusable"
import Portal from "@/components/Portal"
import BottomSheet from "@/components/BottomSheet"
import { useMediaQuery } from "@/components/erp/hooks"
import { useModalLayer } from "@/lib/modal-stack"
import { formatCurrency } from "@/lib/utils/formatters"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"

const PLACEHOLDER_IMAGE = "https://img.dudit.com.br/static/Placeholder.png"

interface SelectPlanItemSheetProps {
    isOpen: boolean
    onClose: () => void
    formData: {
        products: Array<{ id: string; name: string; price: number; images?: string[] | null }>
        services: Array<{ id: string; name: string; price: number; duration_minutes?: number; images?: string[] | null }>
        staff: Array<{ id: string; display_name: string }>
    }
    onSave: (item: {
        id?: string
        itemType: "product" | "service"
        productId: string | null
        variantId: string | null
        serviceId: string | null
        quantity: number
        unitPrice: number | null
        staffPartnerUserId: string | null
        preferredTime: string | null
        durationMinutes: number | null
        // UI fields for display
        name: string
        sku?: string | null
    }) => void
    editingItem?: any | null
}

export default function PlanItemFormSheet({
    isOpen,
    onClose,
    formData,
    onSave,
    editingItem = null,
}: SelectPlanItemSheetProps) {
    const isMobile = useMediaQuery("(max-width: 1023px)")
    // z-index dinâmico: esta sheet abre acima de tudo que já estava aberto.
    const zIndex = useModalLayer(isOpen)

    // Tabs: "product" | "service"
    const [activeTab, setActiveTab] = useState<"product" | "service">("product")
    const [search, setSearch] = useState("")

    // Form configurations (step 2 after selection, or directly when editing)
    const [selectedItem, setSelectedItem] = useState<any | null>(null)
    const [quantity, setQuantity] = useState(1)
    const [unitPrice, setUnitPrice] = useState<string>("")
    const [staffId, setStaffId] = useState("")
    const [preferredTime, setPreferredTime] = useState("")

    // Check if partner provides services
    const hasServices = formData.services.length > 0

    const getImageUrl = (item: any): string => {
        const img = item?.images?.[0]
        return img ? getR2ImageUrl(img, "thumbnail") || PLACEHOLDER_IMAGE : PLACEHOLDER_IMAGE
    }

    // Handle populating form fields when editing or changing item
    useEffect(() => {
        if (editingItem) {
            setActiveTab(editingItem.itemType)
            setQuantity(editingItem.quantity || 1)
            setUnitPrice(editingItem.unitPrice != null ? String(editingItem.unitPrice) : "")
            setStaffId(editingItem.staffPartnerUserId || "")
            setPreferredTime(editingItem.preferredTime ? editingItem.preferredTime.slice(0, 5) : "")

            if (editingItem.itemType === "product") {
                const prod = formData.products.find(p => p.id === editingItem.productId)
                setSelectedItem(prod || { id: editingItem.productId, name: editingItem.name, price: editingItem.unitPrice || 0 })
            } else {
                const serv = formData.services.find(s => s.id === editingItem.serviceId)
                setSelectedItem(serv || { id: editingItem.serviceId, name: editingItem.name, price: editingItem.unitPrice || 0 })
            }
        } else {
            setSelectedItem(null)
            setQuantity(1)
            setUnitPrice("")
            setStaffId("")
            setPreferredTime("")
        }
    }, [editingItem, isOpen, formData])

    // Filter list of items to select
    const filteredItems = useMemo(() => {
        const list = activeTab === "product" ? formData.products : formData.services
        const term = search.trim().toLowerCase()
        if (!term) return list

        return list.filter(item => item.name.toLowerCase().includes(term))
    }, [activeTab, formData, search])

    const handleSelectItem = (item: any) => {
        setSelectedItem(item)
        // Pre-populate price as placeholder or default if needed
        setUnitPrice("")
        if (activeTab === "service" && formData.staff.length > 0) {
            setStaffId(formData.staff[0].id)
        }
    }

    const handleTabChange = (value: string) => {
        setActiveTab(value as "product" | "service")
        setSelectedItem(null)
        setSearch("")
    }

    const handleSaveItem = () => {
        if (!selectedItem) return

        const priceVal = unitPrice.trim() !== "" ? Number(unitPrice) : null

        onSave({
            id: editingItem?.id,
            itemType: activeTab,
            productId: activeTab === "product" ? selectedItem.id : null,
            variantId: null,
            serviceId: activeTab === "service" ? selectedItem.id : null,
            quantity,
            unitPrice: priceVal,
            staffPartnerUserId: activeTab === "service" ? staffId : null,
            preferredTime: activeTab === "service" && preferredTime ? preferredTime : null,
            durationMinutes: activeTab === "service" ? selectedItem.duration_minutes || null : null,
            name: selectedItem.name,
        })

        onClose()
    }

    const selectionContent = (
        <div className="flex flex-col h-full bg-white dark:bg-dark-surface">
            <header className="z-10 flex shrink-0 items-center justify-between border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
                <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">
                    {editingItem ? "Editar Item" : "Adicionar Item ao Plano"}
                </h2>
                <Button variant="filled" onClick={onClose} size="icon" className="hidden lg:flex">
                    <XIcon className="h-5 w-5" />
                </Button>
            </header>

            {/* Tabs list (if not editing) */}
            {!editingItem && hasServices && (
                <div className="z-10 shrink-0 border-b border-brand-border bg-white px-6 pt-3 dark:border-dark-border dark:bg-dark-surface overflow-x-auto">
                    <Tabs value={activeTab} onValueChange={handleTabChange}>
                        <TabsList className="bg-transparent p-0 gap-4 justify-start border-b-0">
                            <TabsTrigger value="product">Produtos</TabsTrigger>
                            <TabsTrigger value="service">Serviços</TabsTrigger>
                        </TabsList>
                    </Tabs>
                </div>
            )}

            {/* Item details config screen */}
            {selectedItem ? (
                <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                    <div className="bg-brand-gray/30 dark:bg-dark-border/20 rounded-xl p-4 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border overflow-hidden">
                                <img
                                    src={getImageUrl(selectedItem)}
                                    alt=""
                                    className="w-full h-full object-cover rounded-full"
                                    loading="lazy"
                                />
                            </div>
                            <div className="min-w-0">
                                <span className="text-[11px] font-bold text-brand-primary uppercase tracking-wider">
                                    {activeTab === "product" ? "Produto Selecionado" : "Serviço Selecionado"}
                                </span>
                                <h4 className="font-bold text-brand-dark dark:text-dark-heading text-base leading-tight mt-0.5 truncate">
                                    {selectedItem.name}
                                </h4>
                                <p className="text-xs text-brand-inactive-text mt-1">
                                    Preço Padrão: {formatCurrency(selectedItem.price)}
                                </p>
                            </div>
                        </div>
                        {!editingItem && (
                            <Button variant="outline" size="sm" className="shrink-0" onClick={() => setSelectedItem(null)}>
                                Alterar
                            </Button>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <Input
                            type="number"
                            label="Quantidade"
                            value={quantity}
                            onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
                            min={1}
                            required
                        />
                        <Input
                            type="number"
                            label="Preço Unitário Customizado"
                            placeholder={`Padrão: ${selectedItem.price.toFixed(2)}`}
                            value={unitPrice}
                            onChange={(e) => setUnitPrice(e.target.value)}
                            min={0}
                            step="0.01"
                        />
                    </div>

                    {activeTab === "service" && (
                        <div className="space-y-4">
                            <FormDropdown
                                label="Profissional Preferencial"
                                value={staffId}
                                setValue={setStaffId}
                                options={formData.staff.map(s => ({ value: s.id, label: s.display_name }))}
                                placeholder="Selecione o profissional"
                            />
                            <Input
                                type="time"
                                label="Horário Preferencial (Opcional)"
                                value={preferredTime}
                                onChange={(e) => setPreferredTime(e.target.value)}
                            />
                        </div>
                    )}
                </div>
            ) : (
                /* Selection List Screen */
                <>
                    <div className="z-10 shrink-0 border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
                        <Input
                            label=""
                            name="itemSearch"
                            placeholder={activeTab === "product" ? "Buscar por nome do produto..." : "Buscar por nome do serviço..."}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
                            className="mb-0"
                            variant="full-rounded"
                        />
                    </div>

                    <div className="custom-scrollbar flex-1 overflow-y-auto p-0">
                        {filteredItems.length > 0 ? (
                            <div className="flex flex-col px-2 pb-2">
                                {filteredItems.map((item) => {
                                    const isSelected = selectedItem?.id === item.id
                                    return (
                                        <div
                                            key={item.id}
                                            role="button"
                                            tabIndex={0}
                                            onClick={() => handleSelectItem(item)}
                                            className={`group flex items-center gap-4 border-b border-brand-border p-3.5 transition-colors last:border-0 dark:border-dark-border cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-border/40 ${isSelected ? "bg-brand-primary/5 dark:bg-brand-primary/10" : ""}`}
                                        >
                                            <img
                                                src={getImageUrl(item)}
                                                alt=""
                                                className={`h-12 w-12 shrink-0 rounded-full border border-brand-border dark:border-dark-border ${item?.images?.[0] ? "object-cover" : "object-contain"}`}
                                                loading="lazy"
                                            />
                                            <div className="min-w-0 flex-1">
                                                <span className="block truncate text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                    {item.name}
                                                </span>
                                                <p className="truncate text-xs font-semibold text-brand-primary dark:text-dark-body">
                                                    {formatCurrency(item.price)}
                                                </p>
                                            </div>
                                            <div className="flex shrink-0 items-center justify-center">
                                                {isSelected ? (
                                                    <div className="flex h-8 w-8 items-center justify-center text-brand-green">
                                                        <CheckCircleIcon size={18} />
                                                    </div>
                                                ) : (
                                                    <div className="flex h-8 w-8 items-center justify-center text-brand-inactive-text opacity-0 transition-opacity group-hover:opacity-100">
                                                        <PlusIcon size={18} />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        ) : (
                            <div className="px-4 py-12">
                                <IconPlaceholder
                                    icon={activeTab === "product" ? BoxIcon : ClockIcon}
                                    title={activeTab === "product" ? "Nenhum produto encontrado" : "Nenhum serviço encontrado"}
                                    subtitle="Tente outro termo de busca."
                                />
                            </div>
                        )}
                    </div>
                </>
            )}

            <footer className="shrink-0 border-t border-brand-border bg-white p-4 dark:border-dark-border dark:bg-dark-surface">
                <div className="flex items-center gap-3">
                    <Button variant="outline" className="h-12 flex-1" onClick={onClose}>
                        Cancelar
                    </Button>
                    {selectedItem && (
                        <Button className="h-12 flex-1" onClick={handleSaveItem}>
                            Confirmar
                        </Button>
                    )}
                </div>
            </footer>
        </div>
    )

    if (isMobile) {
        return (
            <BottomSheet isOpen={isOpen} onClose={onClose}>
                {selectionContent}
            </BottomSheet>
        )
    }

    return (
        <Portal>
            <div
                className={`fixed inset-0 z-[80] bg-black/50 transition-opacity duration-300 ${isOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
                style={{ zIndex }}
                onClick={onClose}
            >
                <div
                    className={`fixed right-4 top-4 bottom-4 z-[81] w-[450px] overflow-hidden rounded-2xl bg-white shadow-2xl transition-transform duration-300 dark:bg-dark-surface ${isOpen ? "translate-x-0" : "translate-x-[120%]"}`}
                    style={{ zIndex: zIndex ? zIndex + 1 : undefined }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {selectionContent}
                </div>
            </div>
        </Portal>
    )
}
