"use client"

import type React from "react"
import { useMemo, useEffect, useState } from "react"
import { Input, FormDropdown, Checkbox, MoneyInput, Combobox, InfoCard, FormSection, Spinner, Button, ListItem } from "@/components/reusable"
import { SalePriceCalculator } from "@/components/reusable/SalePriceCalculator"
import { FulfillmentModesEditor } from "@/components/erp/shared/FulfillmentModesEditor"
import type { FulfillmentMode } from "@/lib/commerce/capabilities"
import FormTextarea from "@/components/reusable/FormTextarea"
import { formatCurrency } from "@/lib/utils"
import { PlusIcon, DiceIcon, Package, CheckCircleIcon, EditIcon, SparklesIcon, ClockIcon } from "@/lib/icons"
import { planStarIconForTarget, usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal"
import ProductImagesSection from "@/components/erp/product/ProductImagesSection"
import { RichTextEditor } from "@/components/reusable"
import MarketplaceCategoryModal from "@/components/erp/product/MarketplaceCategoryModal"
import { getCategoryPathClient } from "@/lib/data/marketplace-categories-client"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"

const FormCombobox = ({
    label, value, onChange, options, disabled, width = "w-full", actionItem
}: {
    label: string, value: any, onChange: (val: string) => void, options: { label: string, value: string }[],
    disabled?: boolean, width?: string, actionItem?: { label: string | React.ReactNode, icon?: React.ReactNode, onClick: () => void }
}) => (
    <div className={`flex flex-col gap-1.5 ${width}`}>
        <label className="text-sm font-medium text-brand-dark dark:text-dark-heading">
            {label}
        </label>
        <Combobox options={options} value={value} onChange={onChange} disabled={disabled} width="w-full" className={width} actionItem={actionItem} />
    </div>
)

const SidebarCard = ({ title, children, className = "", hasTopStrip = false }: { title?: React.ReactNode; children: React.ReactNode; className?: string; hasTopStrip?: boolean }) => (
    <>
        {/* Desktop: card */}
        <div className={`hidden lg:block bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden mb-6 transition-colors ${className}`}>
            {hasTopStrip && <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border rounded-t-2xl"></div>}
            {title ? <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6 mt-2">{title}</h3> : null}
            {children}
        </div>
        {/* Mobile/Tablet: FormSection */}
        <FormSection title={title} hasSeparator className="lg:hidden">
            {children}
        </FormSection>
    </>
)

interface ServiceGeneralTabProps {
    serviceData: any
    handleInputChange: (e: any) => void
    generateRandomCode: () => void
    categories: { label: string, value: string }[]
    subCategories: { label: string, value: string }[]
    openAddItemModal: (type: any) => void
    metadataPlanBlocked?: boolean
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
    isQuickMode?: boolean
    isGeneratingDetails?: boolean
    onGenerateDetails?: () => void
}

export const ServiceGeneralTab: React.FC<ServiceGeneralTabProps> = ({
    serviceData, handleInputChange, generateRandomCode, categories, subCategories, openAddItemModal, metadataPlanBlocked = false, isEditing, images, onImageUpload, onRemoveImage, onSetPrimaryImage, fieldErrors, onFieldChange, uploadingImages, blockedImages, isSaving, mode = "edit", isQuickMode = false, isGeneratingDetails = false, onGenerateDetails
}) => {
    const { openPlanUpgrade } = usePlanUpgrade()
    const handleFieldChange = (e: any) => { if (onFieldChange && e.target.name) onFieldChange(e.target.name); handleInputChange(e) }

    const manualChange = (name: string, value: any) => {
        handleInputChange({ target: { name, value } })
    }

    const [isOfficialCategoryModalOpen, setIsOfficialCategoryModalOpen] = useState(false)
    const [officialCategoryPath, setOfficialCategoryPath] = useState("")

    useEffect(() => {
        let alive = true
        const id = serviceData?.marketplace_category_id
        if (!id) {
            setOfficialCategoryPath("")
            return
        }
        getCategoryPathClient(id).then((path) => {
            if (!alive) return
            setOfficialCategoryPath(path || "")
        })
        return () => { alive = false }
    }, [serviceData?.marketplace_category_id])

    const { salesPrice, profit, margin } = useMemo(() => {
        const p = Number(serviceData.price || 0), c = Number(serviceData.cost_price || 0)
        return { salesPrice: p, profit: p - c, margin: p > 0 ? ((p - c) / p * 100).toFixed(1) : "0.0" }
    }, [serviceData.price, serviceData.cost_price])

    const isFree = serviceData.price_type === 'free'
    const showPrice = serviceData.show_price_in_store ?? true

    const categoryName = useMemo(() => {
        return categories.find(c => c.value === serviceData.category_id)?.label || serviceData.category || "-"
    }, [categories, serviceData.category_id, serviceData.category])

    const subcategoryName = useMemo(() => {
        return subCategories.find(c => c.value === serviceData.subcategory_id)?.label || serviceData.subcategory || "-"
    }, [subCategories, serviceData.subcategory_id, serviceData.subcategory])

    const getImageSrc = (img: string | File) => {
        if (typeof img === 'string') {
            if (img.startsWith("data:") || img.startsWith("blob:")) return img
            return getR2ImageUrl(img) || "https://img.dudit.com.br/static/Placeholder.png"
        }
        return "https://img.dudit.com.br/static/Placeholder.png"
    }

    const billingUnitLabel = useMemo(() => {
        switch (serviceData.billing_unit) {
            case 'per_hour': return 'Por Hora'
            case 'per_day': return 'Por Dia'
            case 'per_week': return 'Por Semana'
            case 'per_month': return 'Por Mês'
            case 'per_year': return 'Por Ano'
            default: return 'Por Serviço'
        }
    }, [serviceData.billing_unit])

    const priceTypeLabel = useMemo(() => {
        switch (serviceData.price_type) {
            case 'starting_at': return 'A partir de'
            case 'free': return 'Gratuito'
            default: return 'Preço Fixo'
        }
    }, [serviceData.price_type])

    // ─── MODO DETALHES (READ-ONLY) ───────────────────────────────────────────
    if (!isEditing) {
        const modes = (serviceData.fulfillment_modes || ["on_site"]) as FulfillmentMode[]

        return (
            <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
                {/* ESQUERDA (Principal) */}
                <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12">
                    {/* Imagens do Serviço no Topo */}
                    <div className="mb-8">
                        <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin">
                            {images && images.length > 0 ? (
                                images.map((img, index) => (
                                    <div
                                        key={index}
                                        className="relative shrink-0 w-28 h-28 md:w-32 md:h-32 rounded-2xl bg-brand-gray dark:bg-dark-border/30 border border-brand-border dark:border-dark-border overflow-hidden group shadow-xs"
                                    >
                                        <img
                                            src={getImageSrc(img)}
                                            alt={`${serviceData.name || "Serviço"} ${index + 1}`}
                                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                        />
                                        {index === 0 && (
                                            <div className="absolute top-2 left-2 bg-brand-dark/80 text-white text-[10px] font-bold px-2 py-0.5 rounded-md shadow-xs backdrop-blur-xs">
                                                Principal
                                            </div>
                                        )}
                                    </div>
                                ))
                            ) : (
                                <div className="w-28 h-28 md:w-32 md:h-32 rounded-2xl bg-brand-gray dark:bg-dark-border/30 border border-brand-border dark:border-dark-border flex items-center justify-center text-xs text-brand-inactive-text">
                                    Sem imagens
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Informações Básicas */}
                    <FormSection title="Informações Básicas" className="mb-8">
                        <div className="space-y-6">
                            <div>
                                <span className="text-sm text-brand-inactive-text dark:text-dark-body">Nome do Serviço</span>
                                <h1 className="text-xl md:text-2xl font-bold text-brand-dark dark:text-dark-heading">
                                    {serviceData.name || "-"}
                                </h1>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
                                <div>
                                    <span className="text-sm text-brand-inactive-text dark:text-dark-body">Status</span>
                                    <div className="flex items-center gap-2">
                                        <span className={`inline-block w-2.5 h-2.5 rounded-full ${serviceData.is_active ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                                        <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading">
                                            {serviceData.is_active ? "Ativo" : "Inativo"}
                                        </span>
                                    </div>
                                </div>

                                <div>
                                    <span className="text-sm text-brand-inactive-text dark:text-dark-body">Exibir na Vitrine</span>
                                    <div className="flex items-center gap-2">
                                        <span className={`inline-block w-2.5 h-2.5 rounded-full ${serviceData.show_in_marketplace !== false ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                                        <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading">
                                            {serviceData.show_in_marketplace !== false ? "Sim" : "Não"}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <span className="text-xs text-brand-inactive-text dark:text-dark-body font-medium block mb-2">Formas de Atendimento</span>
                                <div className="flex flex-wrap gap-2">
                                    {modes.includes("on_site") && (
                                        <span className="px-3 py-1.5 rounded-xl border border-brand-border dark:border-dark-border bg-brand-gray/40 dark:bg-dark-border/40 text-xs font-semibold text-brand-dark dark:text-dark-heading">
                                            No estabelecimento
                                        </span>
                                    )}
                                    {modes.includes("customer_location") && (
                                        <span className="px-3 py-1.5 rounded-xl border border-brand-border dark:border-dark-border bg-brand-gray/40 dark:bg-dark-border/40 text-xs font-semibold text-brand-dark dark:text-dark-heading">
                                            No local do cliente
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </FormSection>

                    {/* Preço e Cobrança */}
                    <FormSection hasSeparator title="Preço e Cobrança">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-2">
                            <div className="p-4 rounded-2xl bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border">
                                <span className="text-xs font-semibold uppercase tracking-wider text-brand-inactive-text dark:text-dark-body block mb-1">
                                    {serviceData.price_type === 'starting_at' ? "Preço Base" : "Preço de Venda"}
                                </span>
                                <div className="text-xl md:text-2xl font-bold text-brand-dark dark:text-dark-heading">
                                    {isFree ? "Gratuito" : showPrice ? formatCurrency(serviceData.price || 0) : "Sob consulta"}
                                </div>
                                {!isFree && showPrice && Number(serviceData.cost_price) > 0 && (
                                    <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-1 block">
                                        Margem: {margin}% ({formatCurrency(profit)})
                                    </span>
                                )}
                            </div>

                            {!isFree && !isQuickMode && (
                                <div className="p-4 rounded-2xl bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border">
                                    <span className="text-xs font-semibold uppercase tracking-wider text-brand-inactive-text dark:text-dark-body block mb-1">
                                        Custo do Serviço
                                    </span>
                                    <div className="text-xl md:text-2xl font-bold text-brand-dark dark:text-dark-heading">
                                        {formatCurrency(serviceData.cost_price || 0)}
                                    </div>
                                </div>
                            )}

                            {!isFree && (
                                <div className="p-4 rounded-2xl bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border">
                                    <span className="text-xs font-semibold uppercase tracking-wider text-brand-inactive-text dark:text-dark-body block mb-1">
                                        Preço Promocional
                                    </span>
                                    <div className="text-xl md:text-2xl font-bold text-brand-dark dark:text-dark-heading">
                                        {serviceData.promotional_price ? formatCurrency(serviceData.promotional_price) : "-"}
                                    </div>
                                </div>
                            )}

                            <div className="p-4 rounded-2xl bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border">
                                <span className="text-xs font-semibold uppercase tracking-wider text-brand-inactive-text dark:text-dark-body block mb-1">
                                    Modelo de Preço
                                </span>
                                <div className="text-sm font-bold text-brand-dark dark:text-dark-heading mt-1">
                                    {priceTypeLabel}
                                </div>
                            </div>

                            {!isQuickMode && (
                                <div className="p-4 rounded-2xl bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border">
                                    <span className="text-xs font-semibold uppercase tracking-wider text-brand-inactive-text dark:text-dark-body block mb-1">
                                        Unidade de Cobrança
                                    </span>
                                    <div className="text-sm font-bold text-brand-dark dark:text-dark-heading mt-1">
                                        {billingUnitLabel}
                                    </div>
                                </div>
                            )}
                        </div>

                        {!showPrice && !isFree && (
                            <div className="mt-4">
                                <InfoCard
                                    color="orange"
                                    message="O serviço está configurado para exibir 'Valor sob consulta' na sua vitrine online."
                                />
                            </div>
                        )}

                        {isQuickMode && serviceData.description && (
                            <div className="mt-8">
                                <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-4">Descrição</h3>
                                <div
                                    className="rich-text-content text-sm text-brand-dark dark:text-dark-heading"
                                    dangerouslySetInnerHTML={{ __html: serviceData.description }}
                                />
                            </div>
                        )}
                    </FormSection>

                    {/* Duração e Agendamento */}
                    {(!serviceData.billing_unit || serviceData.billing_unit === 'per_service') && (
                        <FormSection hasSeparator title="Duração e agendamento">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <ListItem
                                    icon={ClockIcon}
                                    title="Duração do Serviço"
                                    description={serviceData.duration_minutes ? `${serviceData.duration_minutes} minutos` : "Não informada"}
                                    className="p-4 cursor-default"
                                />
                                {!isQuickMode && (
                                    <ListItem
                                        icon={ClockIcon}
                                        title="Tempo de Buffer (Intervalo)"
                                        description={serviceData.buffer_minutes ? `${serviceData.buffer_minutes} minutos` : "Nenhum buffer cadastrado"}
                                        className="p-4 cursor-default"
                                    />
                                )}
                            </div>
                        </FormSection>
                    )}
                </div>

                {/* DIREITA (SidebarCard) */}
                <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 border-l-0 lg:border-l border-brand-border dark:border-dark-border mt-8 lg:mt-0">
                    <SidebarCard hasTopStrip title="Organização">
                        <div className="space-y-4">
                            <div className="flex justify-between items-center py-2 border-b border-brand-border/50 dark:border-dark-border/50">
                                <span className="text-sm text-brand-inactive-text dark:text-dark-body">Código (SKU)</span>
                                <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading">{serviceData.sku || "-"}</span>
                            </div>

                            <div className="flex justify-between items-center py-2 border-b border-brand-border/50 dark:border-dark-border/50">
                                <span className="text-sm text-brand-inactive-text dark:text-dark-body">Categoria</span>
                                <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading">{categoryName}</span>
                            </div>

                            <div className="flex justify-between items-center py-2">
                                <span className="text-sm text-brand-inactive-text dark:text-dark-body">Subcategoria</span>
                                <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading">{subcategoryName}</span>
                            </div>
                        </div>
                    </SidebarCard>

                    {isQuickMode && officialCategoryPath && (
                        <SidebarCard title="Categoria oficial">
                            <div className="p-4 rounded-xl border border-brand-border dark:border-dark-border bg-brand-gray/30 dark:bg-dark-border/30 text-sm font-medium text-brand-dark dark:text-dark-heading">
                                {officialCategoryPath}
                            </div>
                        </SidebarCard>
                    )}

                    {!isQuickMode && serviceData.notes && (
                        <SidebarCard title="Observações Internas">
                            <p className="text-sm text-brand-dark dark:text-dark-heading whitespace-pre-wrap leading-relaxed">
                                {serviceData.notes}
                            </p>
                        </SidebarCard>
                    )}
                </div>
            </div>
        )
    }

    // ─── MODO EDIÇÃO / CRIAÇÃO ────────────────────────────────────────────────
    return (
        <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
            {/* ESQUERDA (Principal) */}
            <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12">
                <FormSection title="Informações básicas" className="mb-8">
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
                                    disabled={!isEditing || isGeneratingDetails}
                                    required
                                    maxLength={150}
                                    error={fieldErrors?.has("name")}
                                    errorMessage={fieldErrors?.has("name") ? "Nome é obrigatório" : undefined}
                                    labelAddon={
                                        isEditing && onGenerateDetails && (
                                            <button
                                                type="button"
                                                onClick={onGenerateDetails}
                                                disabled={isGeneratingDetails || !serviceData.name?.trim()}
                                                className="flex items-center gap-1.5 text-xs text-brand-primary font-medium hover:opacity-80 transition-opacity disabled:opacity-50 cursor-pointer"
                                            >
                                                {isGeneratingDetails ? (
                                                    <>
                                                        <Spinner size={12} className="text-brand-primary animate-spin" />
                                                        <span>Gerando...</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <SparklesIcon className="w-3.5 h-3.5" />
                                                        <span>Gerar com IA</span>
                                                    </>
                                                )}
                                            </button>
                                        )
                                    }
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

                            <FulfillmentModesEditor
                                label="Formas de atendimento (vitrine)"
                                allowedModes={["on_site", "customer_location"]}
                                value={(serviceData.fulfillment_modes || ["on_site"]) as FulfillmentMode[]}
                                onChange={(modes) => manualChange("fulfillment_modes", modes)}
                                disabled={!isEditing}
                            />
                        </div>
                    </div>
                </FormSection>

                {/* PREÇO */}
                <FormSection title="Preço e Cobrança" hasSeparator>
                    <div className={`grid ${isQuickMode ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2'} gap-4 sm:gap-6 mb-6`}>
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

                        {isQuickMode ? (
                            !isFree && (
                                <div className="flex flex-col">
                                    <MoneyInput
                                        label={serviceData.price_type === 'starting_at' ? "Preço Base" : "Preço de Venda"}
                                        name="price"
                                        value={serviceData.price || ""}
                                        onChange={(val) => handleFieldChange({ target: { name: "price", value: val } })}
                                        disabled={!isEditing || !showPrice}
                                        required={showPrice}
                                        error={fieldErrors?.has("price")}
                                        errorMessage={fieldErrors?.has("price") ? "Preço é obrigatório" : undefined}
                                    />
                                    {isEditing && showPrice && (
                                        <SalePriceCalculator
                                            costPrice={Number(serviceData.cost_price || 0)}
                                            sellingPrice={Number(serviceData.price || 0)}
                                            onApply={(cost, sell) => {
                                                handleFieldChange({ target: { name: "cost_price", value: cost } })
                                                handleFieldChange({ target: { name: "price", value: sell } })
                                            }}
                                        />
                                    )}
                                </div>
                            )
                        ) : (
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
                        )}
                    </div>

                    {!isFree && !isQuickMode && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-6">
                            <MoneyInput label="Custo do Serviço" name="cost_price" value={serviceData.cost_price || ""} onChange={(val) => handleFieldChange({ target: { name: "cost_price", value: val } })} disabled={!isEditing || !showPrice} />
                            <div className="flex flex-col">
                                <MoneyInput
                                    label={serviceData.price_type === 'starting_at' ? "Preço Base" : "Preço de Venda"}
                                    name="price"
                                    value={serviceData.price || ""}
                                    onChange={(val) => handleFieldChange({ target: { name: "price", value: val } })}
                                    disabled={!isEditing || !showPrice}
                                    required={showPrice}
                                    error={fieldErrors?.has("price")}
                                    errorMessage={fieldErrors?.has("price") ? "Preço é obrigatório" : undefined}
                                />
                                {isEditing && showPrice && (
                                    <SalePriceCalculator
                                        costPrice={Number(serviceData.cost_price || 0)}
                                        sellingPrice={Number(serviceData.price || 0)}
                                        onApply={(cost, sell) => {
                                            handleFieldChange({ target: { name: "cost_price", value: cost } })
                                            handleFieldChange({ target: { name: "price", value: sell } })
                                        }}
                                    />
                                )}
                            </div>
                            <MoneyInput
                                label="Preço Promocional"
                                name="promotional_price"
                                value={serviceData.promotional_price || ""}
                                onChange={(val) => handleFieldChange({ target: { name: "promotional_price", value: val } })}
                                disabled={!isEditing || !showPrice}
                            />
                        </div>
                    )}

                    {!showPrice && !isFree && (
                        <div className="mb-6">
                            <InfoCard
                                color="orange"
                                message="Ao não mostrar o preço, o serviço será salvo com um valor de 0,00 e, na sua vitrine, será exibido o texto 'Valor sob consulta'"
                            />
                        </div>
                    )}

                    {!isFree && (
                        <div className="flex items-center gap-2 cursor-pointer w-fit mt-2 mb-6">
                            <Checkbox
                                checked={showPrice}
                                label="Exibir o preço na vitrine online"
                                onChange={(checked) => {
                                    handleFieldChange({ target: { name: "show_price_in_store", value: checked } })
                                    if (!checked) {
                                        handleFieldChange({ target: { name: "price", value: 0 } })
                                        handleFieldChange({ target: { name: "cost_price", value: 0 } })
                                    }
                                }}
                                name="show_price_in_store"
                                disabled={!isEditing}
                            />
                        </div>
                    )}
                </FormSection>

                {/* TEMPO */}
                {(!serviceData.billing_unit || serviceData.billing_unit === 'per_service') && (
                    <FormSection title="Duração e agendamento" hasSeparator>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-8">
                            <Input
                                label="Duração do Serviço (minutos)"
                                name="duration_minutes"
                                type="number"
                                min={1}
                                max={525600}
                                value={serviceData.duration_minutes || ""}
                                onChange={handleFieldChange}
                                disabled={!isEditing}
                                required
                                error={fieldErrors?.has("duration_minutes") || Number(serviceData.duration_minutes || 0) > 525600}
                                errorMessage={
                                    Number(serviceData.duration_minutes || 0) > 525600
                                        ? "Duração máxima permitida é de 1 ano (525.600 min)"
                                        : fieldErrors?.has("duration_minutes")
                                        ? "Duração é obrigatória (máx. 525.600 min)"
                                        : undefined
                                }
                            />
                            {!isQuickMode && (
                                <Input
                                    label="Tempo de Buffer (minutos)"
                                    name="buffer_minutes"
                                    type="number"
                                    value={serviceData.buffer_minutes || ""}
                                    onChange={handleFieldChange}
                                    disabled={!isEditing}
                                    placeholder="Tempo de intervalo ou limpeza"
                                />
                            )}
                        </div>
                    </FormSection>
                )}

                {isQuickMode && (
                    <div className="mt-10">
                        <div className="border-t border-brand-border dark:border-dark-border mb-8 w-full"></div>
                        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-5">Descrição</h3>
                        <RichTextEditor
                            label="Descrição Detalhada"
                            value={serviceData?.description || ""}
                            onChange={(val) => manualChange("description", val)}
                            disabled={!isEditing}
                        />
                    </div>
                )}
            </div>

            {/* DIREITA (Widgets) */}
            <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 border-l-0 lg:border-l border-brand-border dark:border-dark-border mt-8 lg:mt-0">
                <SidebarCard hasTopStrip title="Organização">
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

                        {!isQuickMode && (
                            <>
                                <FormCombobox
                                    label="Categoria"
                                    options={categories}
                                    value={serviceData.category_id}
                                    onChange={(v) => handleFieldChange({ target: { name: "category_id", value: v } })}
                                    disabled={!isEditing}
                                    width="w-full"
                                    actionItem={{
                                        label: metadataPlanBlocked ? (
                                            <span className="inline-flex items-center gap-1.5">
                                                Nova categoria
                                                <img src={planStarIconForTarget("crescer")!} alt="" className="w-3.5 h-3.5 object-contain" />
                                            </span>
                                        ) : "Criar nova categoria",
                                        icon: metadataPlanBlocked ? undefined : <PlusIcon className="w-4 h-4" />,
                                        onClick: () => metadataPlanBlocked ? openPlanUpgrade("crescer") : openAddItemModal("category")
                                    }}
                                />

                                <FormCombobox
                                    label="Subcategoria"
                                    options={subCategories}
                                    value={serviceData.subcategory_id}
                                    onChange={(v) => handleFieldChange({ target: { name: "subcategory_id", value: v } })}
                                    disabled={!isEditing}
                                    width="w-full"
                                    actionItem={{
                                        label: metadataPlanBlocked ? (
                                            <span className="inline-flex items-center gap-1.5">
                                                Nova subcategoria
                                                <img src={planStarIconForTarget("crescer")!} alt="" className="w-3.5 h-3.5 object-contain" />
                                            </span>
                                        ) : "Criar nova subcategoria",
                                        icon: metadataPlanBlocked ? undefined : <PlusIcon className="w-4 h-4" />,
                                        onClick: () => metadataPlanBlocked ? openPlanUpgrade("crescer") : openAddItemModal("subcategory")
                                    }}
                                />
                            </>
                        )}
                    </div>
                </SidebarCard>

                {isQuickMode && (
                    <SidebarCard title={<><Package className="w-5 h-5 text-brand-green" /> Categoria Oficial</>}>
                        {officialCategoryPath && (
                            <span className="text-xs font-medium bg-green-100 text-green-800 px-2 py-1 rounded-full flex items-center gap-1">
                                <CheckCircleIcon className="w-3 h-3" /> Categorizado
                            </span>
                        )}

                        <p className="text-sm text-gray-500 mt-2 mb-4">
                            Selecione a categoria oficial do seu serviço.
                        </p>

                        <div
                            onClick={() => isEditing && setIsOfficialCategoryModalOpen(true)}
                            className={`
                                group relative w-full p-4 rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer flex items-center justify-between
                                ${officialCategoryPath
                                    ? "border-brand-green/30 bg-brand-green/5 hover:bg-brand-green/10"
                                    : "border-gray-300 hover:border-brand-green hover:bg-brand-gray dark:border-gray-600 dark:hover:bg-dark-border"
                                }
                                ${!isEditing && "opacity-60 pointer-events-none"}
                            `}
                        >
                            <div className="flex flex-col">
                                <span className={`text-sm font-medium ${officialCategoryPath ? "text-brand-dark dark:text-dark-heading" : "text-gray-400 group-hover:text-gray-600"}`}>
                                    {officialCategoryPath || "Selecionar categoria..."}
                                </span>
                                {officialCategoryPath && <span className="text-xs text-brand-green font-medium mt-1">Clique para alterar</span>}
                            </div>

                            <div className={`p-2 rounded-full ${officialCategoryPath ? "bg-white text-brand-green" : "bg-gray-100 text-gray-400 group-hover:bg-white group-hover:text-brand-green group-hover:shadow-sm"} transition-all`}>
                                {officialCategoryPath ? <EditIcon className="w-4 h-4" /> : <PlusIcon className="w-5 h-5" />}
                            </div>
                        </div>

                        <MarketplaceCategoryModal
                            isOpen={isOfficialCategoryModalOpen}
                            onClose={() => setIsOfficialCategoryModalOpen(false)}
                            onSelect={(category) => {
                                manualChange("marketplace_category_id", category.id)
                                setOfficialCategoryPath(category.path)
                            }}
                        />
                    </SidebarCard>
                )}

                {!isQuickMode && (
                    <SidebarCard title="Observações Internas">
                        <FormTextarea
                            label="Anotações"
                            name="notes"
                            value={serviceData.notes}
                            onChange={handleFieldChange}
                            disabled={!isEditing}
                            placeholder="Observações visíveis apenas para a equipe"
                            className="min-h-[120px]"
                            maxLength={500}
                            showCharacterCount
                        />
                    </SidebarCard>
                )}
            </div>
        </div>
    )
}
