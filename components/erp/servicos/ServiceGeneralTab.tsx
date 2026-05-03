"use client"

import type React from "react"
import { useMemo } from "react"
import { Input, FormDropdown, Checkbox, MoneyInput, Combobox } from "@/components/reusable"
import FormTextarea from "@/components/reusable/FormTextarea"
import { formatCurrency } from "@/lib/utils"
import { PlusIcon, DiceIcon } from "@/lib/icons"
import ProductImagesSection from "@/components/erp/product/ProductImagesSection"

const FormCombobox = ({
    label, value, onChange, options, disabled, width = "w-full", actionItem
}: {
    label: string, value: any, onChange: (val: string) => void, options: { label: string, value: string }[],
    disabled?: boolean, width?: string, actionItem?: { label: string, icon?: React.ReactNode, onClick: () => void }
}) => (
    <div className={`flex flex-col gap-1.5 ${width}`}>
        <label className="text-sm font-medium text-brand-dark dark:text-dark-heading">
            {label}
        </label>
        <Combobox options={options} value={value} onChange={onChange} disabled={disabled} width="w-full" className={width} actionItem={actionItem} />
    </div>
)

const SidebarCard = ({ children, className = "", hasTopStrip = false }: { children: React.ReactNode; className?: string; hasTopStrip?: boolean }) => (
    <div className={`bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden mb-6 transition-colors ${className}`}>
        {hasTopStrip && <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border rounded-t-2xl"></div>}
        {children}
    </div>
)

interface ServiceGeneralTabProps {
    serviceData: any
    handleInputChange: (e: any) => void
    generateRandomCode: () => void
    categories: { label: string, value: string }[]
    subCategories: { label: string, value: string }[]
    openAddItemModal: (type: any) => void
    isEditing: boolean
    images: (string | File)[]
    onImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void
    onRemoveImage: (index: number) => void
    onSetPrimaryImage: (index: number) => void
    fieldErrors?: Set<string>
    onFieldChange?: (field: string) => void
    uploadingImages?: Set<number>
    blockedImages?: Set<number>
    isSaving?: boolean
    mode?: "add" | "edit" | "details"
}

export const ServiceGeneralTab: React.FC<ServiceGeneralTabProps> = ({
    serviceData, handleInputChange, generateRandomCode, categories, subCategories, openAddItemModal, isEditing, images, onImageUpload, onRemoveImage, onSetPrimaryImage, fieldErrors, onFieldChange, uploadingImages, blockedImages, isSaving, mode = "edit"
}) => {
    const handleFieldChange = (e: any) => { if (onFieldChange && e.target.name) onFieldChange(e.target.name); handleInputChange(e) }

    const { salesPrice, profit, margin } = useMemo(() => {
        const p = Number(serviceData.price || 0), c = Number(serviceData.cost_price || 0)
        return { salesPrice: p, profit: p - c, margin: p > 0 ? ((p - c) / p * 100).toFixed(1) : "0.0" }
    }, [serviceData.price, serviceData.cost_price])

    const isFree = serviceData.price_type === 'free'

    return (
        <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
            {/* ESQUERDA (Principal) */}
            <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12">
                <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-5">Informações básicas</h3>
                
                <div className="mb-10">
                    <ProductImagesSection images={images} onImageUpload={onImageUpload} onRemoveImage={onRemoveImage} onSetPrimaryImage={onSetPrimaryImage} isEditing={isEditing} uploadingImages={uploadingImages} blockedImages={blockedImages} isSaving={isSaving} moderationStatus={'approved'} />
                </div>

                <div className="space-y-6">
                    <div className="grid grid-cols-12 gap-6">
                        <div className="col-span-12">
                            <Input
                                label="Nome do Serviço"
                                name="name"
                                value={serviceData.name}
                                onChange={handleFieldChange}
                                disabled={!isEditing}
                                required
                                error={fieldErrors?.has("name")}
                                errorMessage={fieldErrors?.has("name") ? "Nome é obrigatório" : undefined}
                            />
                        </div>

                        <div className="col-span-12 lg:col-span-6">
                            <FormDropdown
                                label="Status"
                                options={[{ value: "true", label: "Ativo" }, { value: "false", label: "Inativo" }]}
                                value={String(serviceData.is_active)}
                                setValue={(v) => handleFieldChange({ target: { name: "is_active", value: v === "true" } })}
                                disabled={!isEditing}
                                width="w-full"
                            />
                        </div>

                        <div className="col-span-12 lg:col-span-6">
                            <FormDropdown
                                label="Exibir na Vitrine"
                                options={[{ value: "true", label: "Sim" }, { value: "false", label: "Não" }]}
                                value={String(serviceData.show_in_marketplace)}
                                setValue={(v) => handleFieldChange({ target: { name: "show_in_marketplace", value: v === "true" } })}
                                disabled={!isEditing}
                                width="w-full"
                            />
                        </div>

                    </div>
                </div>

                {/* PREÇO */}
                <div className="mt-8">
                    <div className="border-t border-brand-border dark:border-dark-border mb-8 w-full"></div>
                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-5">Preço e Cobrança</h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-6">
                        <FormDropdown
                            label="Modelo de Preço"
                            options={[
                                { value: "fixed", label: "Preço Fixo" },
                                { value: "starting_at", label: "A partir de" },
                                { value: "free", label: "Gratuito" }
                            ]}
                            value={serviceData.price_type || 'fixed'}
                            setValue={(v) => handleFieldChange({ target: { name: "price_type", value: v } })}
                            disabled={!isEditing}
                            width="w-full"
                        />

                        <FormDropdown
                            label="Unidade de Cobrança"
                            options={[
                                { value: "per_service", label: "Por Serviço" },
                                { value: "per_hour", label: "Por Hora" },
                                { value: "per_day", label: "Por Dia" },
                                { value: "per_week", label: "Por Semana" },
                                { value: "per_month", label: "Por Mês" },
                                { value: "per_year", label: "Por Ano" }
                            ]}
                            value={serviceData.billing_unit || 'per_service'}
                            setValue={(v) => handleFieldChange({ target: { name: "billing_unit", value: v } })}
                            disabled={!isEditing}
                            width="w-full"
                        />
                    </div>

                    {!isFree && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-6">
                            <MoneyInput label="Custo do Serviço" name="cost_price" value={serviceData.cost_price || ""} onChange={(val) => handleFieldChange({ target: { name: "cost_price", value: val } })} disabled={!isEditing} />
                            <MoneyInput
                                label={serviceData.price_type === 'starting_at' ? "Preço Base" : "Preço de Venda"}
                                name="price"
                                value={serviceData.price || ""}
                                onChange={(val) => handleFieldChange({ target: { name: "price", value: val } })}
                                disabled={!isEditing}
                                required
                                error={fieldErrors?.has("price")}
                                errorMessage={fieldErrors?.has("price") ? "Preço é obrigatório" : undefined}
                            />
                        </div>
                    )}

                    {!isFree && (
                        <div className="border border-brand-border dark:border-dark-border rounded-xl p-4 md:p-6 mb-6 bg-white dark:bg-dark-surface">
                            <div className="flex flex-col sm:flex-row divide-y sm:divide-y-0 sm:divide-x divide-brand-border dark:divide-dark-border gap-6 sm:gap-0">
                                <div className="flex-1 px-4 first:pl-0"><span className="block text-sm text-brand-inactive-text mb-1">Preço do serviço</span><span className="text-xl font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(salesPrice)}</span></div>
                                <div className="flex-1 px-4"><span className="block text-sm text-brand-inactive-text mb-1">Lucro estimado</span><span className="text-xl font-bold text-emerald-600">{formatCurrency(profit)}</span></div>
                                <div className="flex-1 px-4 last:pr-0"><span className="block text-sm text-brand-inactive-text mb-1">Margem</span><span className="text-xl font-bold text-brand-dark dark:text-dark-heading">{margin}%</span></div>
                            </div>
                        </div>
                    )}
                </div>

                {/* TEMPO */}
                <div className="mt-8">
                    <div className="border-t border-brand-border dark:border-dark-border mb-8 w-full"></div>
                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-5">Duração e Agendamento</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-8">
                        <Input 
                            label="Duração do Serviço (minutos)" 
                            name="duration_minutes" 
                            type="number" 
                            value={serviceData.duration_minutes || ""} 
                            onChange={handleFieldChange} 
                            disabled={!isEditing}
                            required
                            error={fieldErrors?.has("duration_minutes")}
                            errorMessage={fieldErrors?.has("duration_minutes") ? "Duração é obrigatória" : undefined}
                        />
                        <Input 
                            label="Tempo de Buffer (minutos)" 
                            name="buffer_minutes" 
                            type="number" 
                            value={serviceData.buffer_minutes || ""} 
                            onChange={handleFieldChange} 
                            disabled={!isEditing} 
                            placeholder="Tempo de intervalo ou limpeza"
                        />
                    </div>
                </div>
            </div>

            {/* DIREITA (Widgets) */}
            <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 border-l-0 lg:border-l border-brand-border dark:border-dark-border mt-8 lg:mt-0">
                <SidebarCard hasTopStrip>
                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6 mt-2">Organização</h3>
                    <div className="space-y-5">
                        <Input
                            label="Código do Serviço (SKU)"
                            name="sku"
                            value={serviceData.sku}
                            onChange={handleFieldChange}
                            disabled={!isEditing}
                            suffix={
                                <div
                                    onClick={generateRandomCode}
                                    className="cursor-pointer p-1 text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                >
                                    <DiceIcon size={20} />
                                </div>
                            }
                        />

                        <FormCombobox
                            label="Categoria"
                            options={categories}
                            value={serviceData.category_id}
                            onChange={(v) => handleFieldChange({ target: { name: "category_id", value: v } })}
                            disabled={!isEditing}
                            width="w-full"
                            actionItem={{ label: "Criar nova categoria", icon: <PlusIcon className="w-4 h-4" />, onClick: () => openAddItemModal("category") }}
                        />

                        <FormCombobox
                            label="Subcategoria"
                            options={subCategories}
                            value={serviceData.subcategory_id}
                            onChange={(v) => handleFieldChange({ target: { name: "subcategory_id", value: v } })}
                            disabled={!isEditing}
                            width="w-full"
                            actionItem={{ label: "Criar nova subcategoria", icon: <PlusIcon className="w-4 h-4" />, onClick: () => openAddItemModal("subcategory") }}
                        />
                    </div>
                </SidebarCard>

                <SidebarCard>
                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6 mt-2">Observações Internas</h3>
                    <FormTextarea
                        label="Anotações"
                        name="notes"
                        value={serviceData.notes}
                        onChange={handleFieldChange}
                        disabled={!isEditing}
                        placeholder="Observações visíveis apenas para a equipe"
                        className="min-h-[120px]"
                    />
                </SidebarCard>
            </div>
        </div>
    )
}
