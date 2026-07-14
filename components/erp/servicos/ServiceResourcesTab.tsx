"use client"

import React from "react"
import { useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button, Input, FormDropdown, IconPlaceholder, ThreeDotsLoader, FormSection } from "@/components/reusable"
import QuantitySelector from "@/components/reusable/QuantitySelector"
import { PlusIcon, TrashIcon, SearchIcon, CheckCircleIcon, EditIcon, AlertTriangleIcon } from "@/lib/icons"
import { useProductBucket } from "../hooks"
import { fetchPartnerProductsBucket } from "@/app/actions/erp/client-loaders"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import AlertModal from "@/components/reusable/AlertModal"

interface ServiceResourcesTabProps {
    serviceData: any
    handleInputChange: (e: any) => void
    isEditing: boolean
}

export const ServiceResourcesTab: React.FC<ServiceResourcesTabProps> = ({
    serviceData, handleInputChange, isEditing
}) => {
    const resources = serviceData.resources || []
    const searchRef = useRef<HTMLDivElement>(null)
    const productBucket = useProductBucket(fetchPartnerProductsBucket)

    const [isAlertOpen, setIsAlertOpen] = React.useState(false)
    const [pendingProduct, setPendingProduct] = React.useState<any>(null)

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
                productBucket.setSearchQuery("")
            }
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [productBucket])

    const manualChange = (name: string, value: any) => {
        handleInputChange({ target: { name, value } })
    }

    const addResource = () => {
        const newResources = [...resources, {
            name: "",
            quantity: 1,
            usage_type: "consumed",
            isEditing: true,
            isManual: true
        }]
        manualChange("resources", newResources)
    }

    const handleProductClick = (product: any) => {
        if (product.stock <= 0 && !product.allow_sell_without_stock) {
            setPendingProduct(product)
            setIsAlertOpen(true)
            return
        }
        confirmAddProduct(product)
    }

    const confirmAddProduct = (product: any) => {
        const newResources = [...resources, {
            product_id: product.id,
            name: product.name,
            sku: product.sku,
            quantity: 1,
            usage_type: "consumed",
            image: product.image,
            isManual: false
        }]
        manualChange("resources", newResources)
        productBucket.setSearchQuery("")
        setIsAlertOpen(false)
        setPendingProduct(null)
    }

    const updateResource = (index: number, field: string, value: any) => {
        const newResources = [...resources]
        newResources[index] = { ...newResources[index], [field]: value }
        manualChange("resources", newResources)
    }

    const removeResource = (index: number) => {
        const newResources = resources.filter((_: any, i: number) => i !== index)
        manualChange("resources", newResources)
    }

    const toggleItemEdit = (index: number, isEditing: boolean) => {
        const newResources = [...resources]
        if (isEditing && !newResources[index]?.isManual) return
        newResources[index] = { ...newResources[index], isEditing }
        manualChange("resources", newResources)
    }

    return (
        <div className="animate-fade-in">
            <div>
                <FormSection title="Itens e recursos necessários" description="Cadastre os materiais ou equipamentos utilizados na execução deste serviço.">
                    <div ref={searchRef} className="relative mb-6">
                        {isEditing && (
                            <Input
                                label=""
                                name="productSearch"
                                placeholder="Buscar itens para adicionar..."
                                prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
                                value={productBucket.searchQuery}
                                onChange={(e) => {
                                    productBucket.setSearchQuery(e.target.value)
                                    productBucket.loadBucket()
                                }}
                                onFocus={() => productBucket.loadBucket()}
                                className="mb-0"
                            />
                        )}

                        <AnimatePresence>
                            {productBucket.searchQuery && (
                                <motion.div
                                    initial={{ opacity: 0, y: 5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 5 }}
                                    className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl shadow-xl z-20 max-h-60 overflow-y-auto"
                                >
                                    {productBucket.isLoading ? (
                                        <div className="p-4"><ThreeDotsLoader /></div>
                                    ) : productBucket.filteredResults.length > 0 ? (
                                        productBucket.filteredResults.map((product: any) => (
                                            <div
                                                key={product.id}
                                                onClick={() => handleProductClick(product)}
                                                className="flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-dark-border cursor-pointer border-b border-brand-border dark:border-dark-border last:border-0"
                                            >
                                                <img src={getR2ImageUrl(product.image, "thumbnail")} className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border border border-brand-border dark:border-dark-border object-cover" />
                                                <div className="flex-1">
                                                    <div className="flex justify-between items-center">
                                                        <div className="text-sm font-bold text-brand-dark dark:text-dark-heading">{product.name}</div>
                                                        <div className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${product.stock > 0 ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-red-50 text-red-600 border border-red-100'}`}>
                                                            {product.stock} em estoque
                                                        </div>
                                                    </div>
                                                    <div className="text-xs font-medium text-brand-inactive-text dark:text-dark-body mt-0.5">SKU: {product.sku}</div>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="p-4 text-center text-sm text-brand-inactive-text">Nenhum item encontrado.</div>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* ITEMS TABLE */}
                    {resources.length > 0 ? (
                        <div className="w-full overflow-x-auto pb-4 custom-scrollbar mb-4">
                            <table className="w-full text-left border-separate border-spacing-0">
                                <thead>
                                    <tr className="bg-brand-gray dark:bg-dark-border/50">
                                        <th className="py-3 pl-6 pr-4 text-[13px] font-medium text-gray-500 dark:text-dark-body rounded-l-lg">Item</th>
                                        <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body w-40">Tipo de Uso</th>
                                        <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body text-center w-36">Qtd.</th>
                                        {isEditing && <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body text-center w-24 rounded-r-lg">Ações</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {resources.map((resource: any, index: number) => (
                                        <tr key={index} className="group hover:bg-brand-gray/20 dark:hover:bg-dark-border/10 transition-colors">
                                            <td className="py-4 pl-6 pr-4 border-b border-brand-border dark:border-dark-border">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border overflow-hidden">
                                                        <img src={getR2ImageUrl(resource.image, "thumbnail")} className={`w-full h-full ${!resource.image ? 'object-contain' : 'object-cover'}`} alt="" />
                                                    </div>
                                                    <div className="flex flex-col text-left flex-1 min-w-0">
                                                        {resource.isEditing ? (
                                                            <Input
                                                                name={`item-name-${index}`}
                                                                value={resource.name}
                                                                onChange={(e) => updateResource(index, "name", e.target.value)}
                                                                placeholder="Nome do item..."
                                                                className="mb-0"
                                                            />
                                                        ) : (
                                                            <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading truncate max-w-[250px]">
                                                                {resource.name || 'Item sem nome'}
                                                            </span>
                                                        )}
                                                        {!resource.isEditing && (
                                                            <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate">
                                                                {resource.sku || (resource.isManual ? 'Manual' : 'Sem SKU')}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border">
                                                <div className="w-full">
                                                    <FormDropdown
                                                        label=""
                                                        options={[
                                                            { value: "consumed", label: "Consumido" },
                                                            { value: "returnable", label: "Retornável" },
                                                            { value: "reference", label: "Referência" }
                                                        ]}
                                                        value={resource.usage_type}
                                                        setValue={(v) => updateResource(index, "usage_type", v)}
                                                        disabled={!isEditing}
                                                        width="w-full"
                                                        className="mb-0"
                                                    />
                                                </div>
                                            </td>
                                            <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border">
                                                <div className="flex justify-center">
                                                    <QuantitySelector value={resource.quantity} onChange={(val) => updateResource(index, "quantity", val)} size="md" disabled={!isEditing} />
                                                </div>
                                            </td>
                                            {isEditing && (
                                                <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border">
                                                    <div className="flex justify-center gap-2">
                                                        {resource.isEditing ? (
                                                            <button
                                                                onClick={() => toggleItemEdit(index, false)}
                                                                className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-green-50 dark:hover:bg-green-900/10 text-brand-green transition-colors"
                                                            >
                                                                <CheckCircleIcon size={18} />
                                                            </button>
                                                        ) : resource.isManual ? (
                                                            <button
                                                                onClick={() => toggleItemEdit(index, true)}
                                                                className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-brand-gray dark:hover:bg-dark-border text-brand-inactive-text hover:text-brand-dark transition-colors"
                                                            >
                                                                <EditIcon size={18} />
                                                            </button>
                                                        ) : null}
                                                        <button
                                                            onClick={() => removeResource(index)}
                                                            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-red-50 dark:hover:bg-red-900/10 text-brand-red transition-colors"
                                                        >
                                                            <TrashIcon size={18} />
                                                        </button>
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="w-full flex-col flex items-center justify-center py-10">
                            <IconPlaceholder
                                icon={SearchIcon}
                                title="Nenhum item adicionado"
                                subtitle="Busque itens no campo acima ou adicione manualmente."
                                itemButton={isEditing ? {
                                    text: "Adicionar item manual",
                                    action: addResource,
                                    variant: "outline",
                                } : undefined}
                            />
                        </div>
                    )}

                    {isEditing && resources.length > 0 && (
                        <Button
                            type="button"
                            variant="link"
                            onClick={addResource}
                            className="mt-2"
                        >
                            <PlusIcon size={14} strokeWidth={3} className="mr-1" />
                            Adicionar item manual
                        </Button>
                    )}
                </FormSection>
            </div>

            <AlertModal
                isOpen={isAlertOpen}
                onClose={() => setIsAlertOpen(false)}
                onConfirm={() => confirmAddProduct(pendingProduct)}
                title="Estoque insuficiente"
                description={`O item "${pendingProduct?.name}" está sem estoque disponível. Deseja adicionar assim mesmo?`}
                confirmText="Continuar mesmo assim"
                cancelText="Cancelar"
                variant="warning"
            />
        </div >
    )
}
