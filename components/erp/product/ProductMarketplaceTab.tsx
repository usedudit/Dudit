"use client"

import React, { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Input, FormDropdown, RichTextEditor, Button, Accordion, IconPlaceholder, FormSection, Badge, Checkbox, SidebarCard } from "@/components/reusable"
import { TagsManagerModal } from "@/components/erp/shared/TagsManagerModal"
import { TagsListItem } from "@/components/erp/shared/TagsListItem"
import { TrashIcon, PlusIcon, ArrowUpDownIcon, ChevronDownIcon } from "@/lib/icons"
import { OfficialCategoryCard } from "@/components/erp/OfficialCategoryCard"
import ProductVideoSection from "./ProductVideoSection"
import { ProductAddonsSection } from "./ProductAddonsSection"
import { FulfillmentModesEditor } from "@/components/erp/shared/FulfillmentModesEditor"
import { sanitizeRichText } from "@/lib/security/rich-text-sanitizer"
import {
    DEFAULT_STORE_FULFILLMENT_CAPABILITIES,
    type FulfillmentMode,
    type StoreFulfillmentCapabilities,
} from "@/lib/commerce/capabilities"

const FULFILLMENT_LABELS: Record<FulfillmentMode, string> = {
    delivery: "Entrega local",
    pickup: "Retirada no local",
    shipping: "Envio nacional",
    on_site: "No estabelecimento",
    customer_location: "No endereço do cliente",
}

const CONDITION_OPTIONS = [
    { value: "Novo", label: "Novo" },
    { value: "Usado - Como novo", label: "Usado - Como novo" },
    { value: "Usado - Bom", label: "Usado - Bom" },
    { value: "Usado - Marcas de uso", label: "Usado - Marcas de uso" },
    { value: "Recondicionado", label: "Recondicionado" },
    { value: "Para conserto / peças", label: "Para conserto / peças" },
]

interface ProductMarketplaceTabProps {
    productData: any
    handleInputChange: (e: any) => void
    isEditing: boolean
    itemId: string
    video: any
    onVideoChange: (video: any) => void
    videoPlanBlocked?: boolean
    storeFulfillmentCapabilities?: StoreFulfillmentCapabilities
    isDesapego?: boolean
}

export const ProductMarketplaceTab: React.FC<ProductMarketplaceTabProps> = ({
    productData,
    handleInputChange,
    isEditing,
    itemId,
    video,
    onVideoChange,
    videoPlanBlocked = false,
    storeFulfillmentCapabilities = DEFAULT_STORE_FULFILLMENT_CAPABILITIES,
    isDesapego = false,
}) => {
    const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false)
    const [isTagsModalOpen, setIsTagsModalOpen] = useState(false)

    const manualChange = (name: string, value: any) => {
        handleInputChange({
            target: { name, value }
        })
    }

    const attributes = Array.isArray(productData?.attributes) ? productData.attributes : []
    const tags = Array.isArray(productData?.tags) ? productData.tags : []

    // --- Lógica dos Atributos ---
    const addAttribute = () => {
        if (attributes.length >= 25) return
        const newAttributes = [...attributes, { id: Date.now(), name: "", value: "" }]
        manualChange("attributes", newAttributes)
    }

    const removeAttribute = (id: number) => {
        const newAttributes = attributes.filter((attr: any) => attr.id !== id)
        manualChange("attributes", newAttributes)
    }

    const updateAttribute = (id: number, field: string, newValue: string) => {
        const newAttributes = attributes.map((attr: any) =>
            attr.id === id ? { ...attr, [field]: newValue } : attr
        )
        manualChange("attributes", newAttributes)
    }

    const isDigital = productData?.productType === "Digital"

    const allowedFulfillmentModes: FulfillmentMode[] = isDigital
        ? ["pickup"]
        : ([
            ...(storeFulfillmentCapabilities.delivery ? ["delivery"] : []),
            ...(storeFulfillmentCapabilities.pickup ? ["pickup"] : []),
            ...(storeFulfillmentCapabilities.shipping ? ["shipping"] : []),
        ] as FulfillmentMode[])

    const rawFulfillmentModes: string[] = Array.isArray(productData?.fulfillment_modes)
        ? productData.fulfillment_modes
        : []
    const selectedFulfillmentModes: FulfillmentMode[] = (() => {
        const filtered = rawFulfillmentModes.filter((m) =>
            allowedFulfillmentModes.includes(m as FulfillmentMode),
        ) as FulfillmentMode[]
        if (filtered.length > 0) return filtered
        return allowedFulfillmentModes.length ? [allowedFulfillmentModes[0]] : ["pickup"]
    })()

    // ─── MODO DETALHES (READ-ONLY) ───────────────────────────────────────────
    if (!isEditing) {
        return (
            <div className="grid grid-cols-12 gap-y-8 md:gap-y-0 animate-fade-in">
                {/* --- COLUNA ESQUERDA (Principal) --- */}
                <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12">
                    {/* Descrição */}
                    <FormSection title="Descrição" className="mb-8">
                        <div className={`relative ${!isDescriptionExpanded ? "max-h-[160px] overflow-hidden" : ""}`}>
                            {productData?.description ? (
                                <div
                                    className="rich-text-content text-sm md:text-base text-brand-dark dark:text-dark-heading leading-relaxed"
                                    dangerouslySetInnerHTML={{ __html: sanitizeRichText(productData.description) }}
                                />
                            ) : (
                                <p className="text-sm text-brand-inactive-text dark:text-dark-body">Sem descrição cadastrada.</p>
                            )}
                            {!isDescriptionExpanded && (productData?.description?.length || 0) > 250 && (
                                <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white dark:from-dark-surface to-transparent pointer-events-none" />
                            )}
                        </div>
                        {(productData?.description?.length || 0) > 250 && (
                            <button
                                type="button"
                                onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                                className="flex items-center gap-1 text-brand-primary dark:text-brand-primary font-bold text-sm mt-3 hover:underline cursor-pointer"
                            >
                                {isDescriptionExpanded ? "Ver menos descrição" : "Ver mais descrição"}
                                <ChevronDownIcon size={16} className={`transition-transform duration-200 ${isDescriptionExpanded ? "rotate-180" : ""}`} />
                            </button>
                        )}
                    </FormSection>

                    {/* Especificações */}
                    <FormSection hasSeparator title="Especificações">
                        {attributes.length > 0 ? (
                            <div className="border border-brand-border dark:border-dark-border rounded-2xl overflow-hidden">
                                {attributes.map((spec: any, i: number) => (
                                    <div
                                        key={i}
                                        className={`flex justify-between items-center px-5 py-3.5 ${i % 2 === 0
                                            ? "bg-brand-gray dark:bg-dark-border/30"
                                            : "bg-white dark:bg-dark-surface"
                                            } ${i < attributes.length - 1 ? "border-b border-brand-border dark:border-dark-border" : ""}`}
                                    >
                                        <span className="text-sm text-brand-inactive-text dark:text-dark-body font-medium">
                                            {spec.name || spec.label || ""}
                                        </span>
                                        <span className="text-sm text-brand-dark dark:text-dark-heading font-semibold text-right">
                                            {spec.value || ""}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-brand-inactive-text dark:text-dark-body">Nenhuma especificação cadastrada.</p>
                        )}
                    </FormSection>

                    {/* Complementos e Adicionais */}
                    <FormSection hasSeparator title="Complementos e Adicionais" description="Ideal para itens de alimentação, lanches, combos ou opções adicionais personalizadas.">
                        <ProductAddonsSection
                            addonGroups={productData?.addon_groups || []}
                            onChange={() => { }}
                            isEditing={false}
                        />
                    </FormSection>

                    {/* Vídeo */}
                    <FormSection hasSeparator title="Vídeo">
                        <ProductVideoSection
                            itemType="product"
                            itemId={itemId}
                            video={video}
                            onChange={onVideoChange}
                            isEditing={false}
                            videoPlanBlocked={videoPlanBlocked}
                        />
                    </FormSection>
                </div>

                {/* --- COLUNA DIREITA (Sidebar) --- */}
                <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 border-l-0 lg:border-l border-brand-border dark:border-dark-border mt-8 lg:mt-0">
                    <SidebarCard hasSeparator hasTopStrip title="Configurações">
                        <div className="space-y-4">
                            <div className="flex justify-between items-center py-2 border-b border-brand-border/50 dark:border-dark-border/50">
                                <span className="text-sm text-brand-inactive-text dark:text-dark-body">Tipo de Produto</span>
                                <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading">
                                    {productData?.productType || "Físico"}
                                </span>
                            </div>
                            {isDigital ? (
                                <div className="flex justify-between items-center py-2 border-b border-brand-border/50 dark:border-dark-border/50">
                                    <span className="text-sm text-brand-inactive-text dark:text-dark-body">Formato de Entrega</span>
                                    <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading">
                                        {productData?.digital_format || "Download"}
                                    </span>
                                </div>
                            ) : (
                                <div className="flex justify-between items-center py-2 border-b border-brand-border/50 dark:border-dark-border/50">
                                    <span className="text-sm text-brand-inactive-text dark:text-dark-body">Condição</span>
                                    <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading">
                                        {productData?.condicao || productData?.condition || "Novo"}
                                    </span>
                                </div>
                            )}
                            <div className="flex justify-between items-center py-2 border-b border-brand-border/50 dark:border-dark-border/50">
                                <span className="text-sm text-brand-inactive-text dark:text-dark-body">Disponibilidade</span>
                                <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading">
                                    {productData?.availability_value ? `${productData.availability_value} ${productData.availability_unit || "Dias"}` : "Imediata"}
                                </span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-brand-border/50 dark:border-dark-border/50">
                                <span className="text-sm text-brand-inactive-text dark:text-dark-body">Garantia</span>
                                <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading">
                                    {productData?.warranty_value ? `${productData.warranty_value} ${productData.warranty_period || "Meses"}` : "Sem garantia"}
                                </span>
                            </div>

                            <div className="py-2">
                                <span className="text-sm text-brand-inactive-text dark:text-dark-body">Formas de entrega</span>
                                <div className="flex flex-wrap gap-2 mt-2">
                                    {selectedFulfillmentModes.map((mode) => (
                                        <Badge key={mode} variant="gray" icon={null}>{FULFILLMENT_LABELS[mode]}</Badge>
                                    ))}
                                </div>
                            </div>

                            {isDesapego && (productData?.accepts_offers || productData?.accepts_trades) && (
                                <div className="flex flex-wrap gap-2 pt-3 border-t border-brand-border/50 dark:border-dark-border/50">
                                    {productData?.accepts_offers && (
                                        <Badge variant="blue">Aceita Ofertas</Badge>
                                    )}
                                    {productData?.accepts_trades && (
                                        <Badge variant="purple">Aceita Trocas</Badge>
                                    )}
                                </div>
                            )}
                        </div>
                    </SidebarCard>

                    <OfficialCategoryCard
                        categoryId={productData?.marketplace_category_id}
                        onChange={(id) => manualChange("marketplace_category_id", id)}
                        type="product"
                        isEditing={false}
                    />

                    <SidebarCard hasSeparator hasTopStrip title="Palavras-chave de busca">
                        {tags && tags.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                                {tags.map((tag: string, i: number) => (
                                    <Badge key={i} variant="gray" icon={null} className="px-3 py-1 text-xs font-medium">
                                        {tag}
                                    </Badge>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-brand-inactive-text dark:text-dark-body">Nenhuma tag cadastrada.</p>
                        )}
                    </SidebarCard>
                </div>
            </div>
        )
    }

    // ─── MODO EDIÇÃO / CRIAÇÃO ────────────────────────────────────────────────
    return (
        <div className="grid grid-cols-12 gap-y-8 md:gap-y-0 animate-fade-in">
            {/* --- COLUNA ESQUERDA (Principal) --- */}
            <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12">
                <FormSection title="Dados básicos">
                    <div className="space-y-6">
                        <RichTextEditor
                            label="Descrição Detalhada"
                            value={productData?.description || ""}
                            onChange={(val) => manualChange("description", val)}
                            disabled={!isEditing}
                        />
                    </div>
                </FormSection>

                {/* --- FICHA TÉCNICA (ATRIBUTOS) --- */}
                <div className="mt-8 mb-8">
                    <div className="border-t border-brand-border dark:border-dark-border mb-8 w-full"></div>
                    <Accordion title={
                        <span className="text-md lg:text-xl font-medium text-brand-dark dark:text-dark-heading mb-6">
                            Especificações
                        </span>} defaultOpen={false} triggerClass="text-lg font-bold text-brand-dark dark:text-dark-heading text-left">
                        <div className="pt-2">
                            {attributes.length === 0 ? (
                                <div className="flex flex-col items-center justify-center text-center py-8">
                                    <IconPlaceholder
                                        icon={ArrowUpDownIcon}
                                        title="Nenhum atributo técnico"
                                        subtitle="Adicione características como material, dimensões ou voltagem."
                                        itemButton={{
                                            text: "Adicionar atributo",
                                            action: addAttribute,
                                            variant: "outline",
                                            className: `h-9 text-sm ${!isEditing ? "opacity-50 pointer-events-none" : ""}`
                                        }}
                                    />
                                </div>
                            ) : (
                                <>
                                    <div className="w-full overflow-hidden rounded-t-lg rounded-b-lg bg-brand-gray dark:bg-dark-border/50">
                                        <div className="flex">
                                            <div className="flex-1 py-3 px-4 relative">
                                                <span className="text-[13px] font-medium text-gray-500 dark:text-dark-body">Atributo</span>
                                            </div>
                                            <div className="flex-1 py-3 px-4 relative">
                                                <span className="text-[13px] font-medium text-gray-500 dark:text-dark-body pl-4">Valor</span>
                                            </div>
                                            <div className="w-[60px] py-3 px-4 relative">
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mb-6 rounded-b-xl p-4 bg-white dark:bg-dark-surface max-h-[300px] overflow-y-auto custom-scrollbar">
                                        <AnimatePresence initial={false}>
                                            {attributes.map((attr: any) => (
                                                <motion.div
                                                    key={attr.id}
                                                    initial={{ opacity: 0 }}
                                                    animate={{ opacity: 1 }}
                                                    exit={{ opacity: 0 }}
                                                    transition={{ duration: 0.2 }}
                                                    className="flex gap-4 mb-3 last:mb-0"
                                                >
                                                    <div className="flex-1">
                                                        <Input
                                                            label=""
                                                            name={`attr-name-${attr.id}`}
                                                            placeholder="Nome (ex: Material)"
                                                            value={attr.name || ""}
                                                            onChange={(e) => updateAttribute(attr.id, "name", e.target.value)}
                                                            disabled={!isEditing}
                                                            className="mb-0"
                                                        />
                                                    </div>
                                                    <div className="flex-1">
                                                        <Input
                                                            label=""
                                                            name={`attr-val-${attr.id}`}
                                                            placeholder="Valor (ex: Algodão)"
                                                            value={attr.value || ""}
                                                            onChange={(e) => updateAttribute(attr.id, "value", e.target.value)}
                                                            disabled={!isEditing}
                                                            className="mb-0"
                                                        />
                                                    </div>
                                                    <div className="h-[40px] mt-1.5 flex items-center justify-center">
                                                        <Button
                                                            type="button"
                                                            variant="outlinered"
                                                            className="w-[40px] h-[40px] p-0 flex items-center justify-center"
                                                            onClick={() => removeAttribute(attr.id)}
                                                            disabled={!isEditing}
                                                        >
                                                            <TrashIcon className="w-4 h-4 pointer-events-none" />
                                                        </Button>
                                                    </div>
                                                </motion.div>
                                            ))}
                                        </AnimatePresence>
                                    </div>

                                    <Button
                                        type="button"
                                        variant="link"
                                        onClick={addAttribute}
                                        disabled={!isEditing}
                                    >
                                        + Adicionar atributo
                                    </Button>
                                </>
                            )}
                        </div>
                    </Accordion>
                </div>

                {/* --- COMPLEMENTOS / ADICIONAIS (iFood Style) --- */}
                <div className="mt-8 mb-8">
                    <div className="border-t border-brand-border dark:border-dark-border mb-8 w-full"></div>
                    <Accordion
                        title={
                            <span className="text-md lg:text-xl font-medium text-brand-dark dark:text-dark-heading mb-6">
                                Complementos e Adicionais
                            </span>
                        }
                        defaultOpen={false}
                        triggerClass="text-lg font-bold text-brand-dark dark:text-dark-heading text-left"
                    >
                        <div className="pt-2">
                            <ProductAddonsSection
                                addonGroups={productData?.addon_groups || []}
                                onChange={(groups) => manualChange("addon_groups", groups)}
                                isEditing={isEditing}
                            />
                        </div>
                    </Accordion>
                </div>

                <div className="mt-8 mb-8">
                    <div className="border-t border-brand-border dark:border-dark-border mb-8 w-full"></div>
                    <Accordion title={
                        <span className="text-md lg:text-xl font-medium text-brand-dark dark:text-dark-heading mb-6">
                            Vídeo
                        </span>} defaultOpen={false} triggerClass="text-lg font-bold text-brand-dark dark:text-dark-heading text-left">
                        <div className="pt-2">
                            <ProductVideoSection itemType="product" itemId={itemId} video={video} onChange={onVideoChange} isEditing={isEditing} videoPlanBlocked={videoPlanBlocked} />
                        </div>
                    </Accordion>
                </div>
            </div>

            {/* --- COLUNA DIREITA (SIDEBAR) --- */}
            <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 border-l-0 lg:border-l border-brand-border dark:border-dark-border mt-8 lg:mt-0">
                {/* --- MOBILE / TABLET (< lg): FormSections --- */}
                <div className="block lg:hidden space-y-8">
                    <FormSection title="Configurações" hasSeparator>
                        <div className="space-y-5">
                            <FormDropdown
                                label="Tipo de Produto"
                                options={[
                                    { value: "Físico", label: "Físico" },
                                    { value: "Digital", label: "Digital" },
                                ]}
                                value={productData?.productType || "Físico"}
                                setValue={(v) => manualChange("productType", v)}
                                disabled={!isEditing}
                                width="w-full"
                            />

                            {isDigital ? (
                                <FormDropdown
                                    label="Formato de Entrega"
                                    options={[
                                        { value: "Download", label: "Arquivo p/ Download" },
                                        { value: "Key", label: "Chave/Serial" },
                                        { value: "Link", label: "Link Externo" },
                                        { value: "Service", label: "Serviço" },
                                    ]}
                                    value={productData?.digital_format || "Download"}
                                    setValue={(v) => manualChange("digital_format", v)}
                                    disabled={!isEditing}
                                    width="w-full"
                                />
                            ) : (
                                <FormDropdown
                                    label="Condição"
                                    options={CONDITION_OPTIONS}
                                    value={productData?.condicao || productData?.condition || "Novo"}
                                    setValue={(v) => {
                                        manualChange("condicao", v)
                                        manualChange("condition", v)
                                    }}
                                    disabled={!isEditing}
                                    width="w-full"
                                />
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <Input
                                    label="Disponibilidade"
                                    name="availability_value"
                                    value={productData?.availability_value || ""}
                                    onChange={handleInputChange}
                                    disabled={!isEditing}
                                    type="number"
                                    placeholder="0"
                                    className="w-full"
                                />
                                <FormDropdown
                                    label="Período"
                                    options={[
                                        { value: "Minutos", label: "Minutos" },
                                        { value: "Horas", label: "Horas" },
                                        { value: "Dias", label: "Dias" },
                                    ]}
                                    value={productData?.availability_unit || "Dias"}
                                    setValue={(v) => manualChange("availability_unit", v)}
                                    disabled={!isEditing}
                                    width="w-full"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <Input
                                    label="Garantia"
                                    name="warranty_value"
                                    value={productData?.warranty_value || ""}
                                    onChange={handleInputChange}
                                    disabled={!isEditing}
                                    type="number"
                                    placeholder="0"
                                    className="w-full"
                                />
                                <FormDropdown
                                    label="Período"
                                    options={[
                                        { value: "Dias", label: "Dias" },
                                        { value: "Meses", label: "Meses" },
                                        { value: "Anos", label: "Anos" },
                                    ]}
                                    value={productData?.warranty_period || "Meses"}
                                    setValue={(v) => manualChange("warranty_period", v)}
                                    disabled={!isEditing}
                                    width="w-full"
                                />
                            </div>

                            {isDesapego && (
                                <div className="pt-2 border-t border-brand-border/50 dark:border-dark-border/50 space-y-3">
                                    <Checkbox
                                        checked={!!productData?.accepts_offers}
                                        label="Aceita proposta de preço (negociação)"
                                        onChange={(val) => manualChange("accepts_offers", val)}
                                        disabled={!isEditing}
                                    />
                                    <Checkbox
                                        checked={!!productData?.accepts_trades}
                                        label="Aceita troca por outro item"
                                        onChange={(val) => manualChange("accepts_trades", val)}
                                        disabled={!isEditing}
                                    />
                                </div>
                            )}

                            <div className="pt-4 border-t border-brand-border/50 dark:border-dark-border/50">
                                <FulfillmentModesEditor
                                    label="Formas de entrega deste produto"
                                    allowedModes={allowedFulfillmentModes}
                                    value={selectedFulfillmentModes}
                                    onChange={(modes) => manualChange("fulfillment_modes", modes)}
                                    disabled={!isEditing}
                                />
                            </div>
                        </div>
                    </FormSection>

                    <FormSection
                        title="Palavras-chave de busca"
                        description="Adicione termos relacionados para ajudar clientes a encontrarem este produto na vitrine."
                        hasSeparator
                    >
                        <TagsListItem
                            tags={tags}
                            onClick={() => setIsTagsModalOpen(true)}
                            disabled={!isEditing}
                        />
                    </FormSection>
                </div>

                {/* --- DESKTOP (>= lg): CARDS NA SIDEBAR --- */}
                <div className="hidden lg:block">
                    {/* Card de Configurações */}
                    <SidebarCard hasSeparator hasTopStrip title="Configurações">

                        <div className="space-y-5">
                            <FormDropdown
                                label="Tipo de Produto"
                                options={[
                                    { value: "Físico", label: "Físico" },
                                    { value: "Digital", label: "Digital" },
                                ]}
                                value={productData?.productType || "Físico"}
                                setValue={(v) => manualChange("productType", v)}
                                disabled={!isEditing}
                                width="w-full"
                            />

                            {isDigital ? (
                                <FormDropdown
                                    label="Formato de Entrega"
                                    options={[
                                        { value: "Download", label: "Arquivo p/ Download" },
                                        { value: "Key", label: "Chave/Serial" },
                                        { value: "Link", label: "Link Externo" },
                                        { value: "Service", label: "Serviço" },
                                    ]}
                                    value={productData?.digital_format || "Download"}
                                    setValue={(v) => manualChange("digital_format", v)}
                                    disabled={!isEditing}
                                    width="w-full"
                                />
                            ) : (
                                <FormDropdown
                                    label="Condição"
                                    options={CONDITION_OPTIONS}
                                    value={productData?.condicao || productData?.condition || "Novo"}
                                    setValue={(v) => {
                                        manualChange("condicao", v)
                                        manualChange("condition", v)
                                    }}
                                    disabled={!isEditing}
                                    width="w-full"
                                />
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <Input
                                    label="Disponibilidade"
                                    name="availability_value"
                                    value={productData?.availability_value || ""}
                                    onChange={handleInputChange}
                                    disabled={!isEditing}
                                    type="number"
                                    placeholder="0"
                                    className="w-full"
                                />
                                <FormDropdown
                                    label="Período"
                                    options={[
                                        { value: "Minutos", label: "Minutos" },
                                        { value: "Horas", label: "Horas" },
                                        { value: "Dias", label: "Dias" },
                                    ]}
                                    value={productData?.availability_unit || "Dias"}
                                    setValue={(v) => manualChange("availability_unit", v)}
                                    disabled={!isEditing}
                                    width="w-full"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <Input
                                    label="Garantia"
                                    name="warranty_value"
                                    value={productData?.warranty_value || ""}
                                    onChange={handleInputChange}
                                    disabled={!isEditing}
                                    type="number"
                                    placeholder="0"
                                    className="w-full"
                                />
                                <FormDropdown
                                    label="Período"
                                    options={[
                                        { value: "Dias", label: "Dias" },
                                        { value: "Meses", label: "Meses" },
                                        { value: "Anos", label: "Anos" },
                                    ]}
                                    value={productData?.warranty_period || "Meses"}
                                    setValue={(v) => manualChange("warranty_period", v)}
                                    disabled={!isEditing}
                                    width="w-full"
                                />
                            </div>

                            {isDesapego && (
                                <div className="pt-2 border-t border-brand-border/50 dark:border-dark-border/50 space-y-3">
                                    <Checkbox
                                        checked={!!productData?.accepts_offers}
                                        label="Aceita proposta de preço (negociação)"
                                        onChange={(val) => manualChange("accepts_offers", val)}
                                        disabled={!isEditing}
                                    />
                                    <Checkbox
                                        checked={!!productData?.accepts_trades}
                                        label="Aceita troca por outro item"
                                        onChange={(val) => manualChange("accepts_trades", val)}
                                        disabled={!isEditing}
                                    />
                                </div>
                            )}

                            <div className="pt-4 border-t border-brand-border/50 dark:border-dark-border/50">
                                <FulfillmentModesEditor
                                    label="Formas de entrega deste produto"
                                    allowedModes={allowedFulfillmentModes}
                                    value={selectedFulfillmentModes}
                                    onChange={(modes) => manualChange("fulfillment_modes", modes)}
                                    disabled={!isEditing}
                                />
                            </div>
                        </div>
                    </SidebarCard>

                    {/* Card de Tags */}
                    <SidebarCard hasSeparator hasTopStrip title="Palavras-chave de busca">
                        <div className="space-y-3">
                            <p className="text-sm text-brand-inactive-text mb-2">
                                Adicione termos relacionados para ajudar clientes a encontrarem este produto na vitrine.
                            </p>
                            <TagsListItem
                                tags={tags}
                                onClick={() => setIsTagsModalOpen(true)}
                                disabled={!isEditing}
                            />
                        </div>
                    </SidebarCard>
                </div>

                <OfficialCategoryCard
                    categoryId={productData?.marketplace_category_id}
                    onChange={(id) => manualChange("marketplace_category_id", id)}
                    type="product"
                    isEditing={isEditing}
                />

                <TagsManagerModal
                    isOpen={isTagsModalOpen}
                    onClose={() => setIsTagsModalOpen(false)}
                    tags={tags}
                    onChange={(t) => manualChange("tags", t)}
                    disabled={!isEditing}
                    title="Palavras-chave de busca"
                    description="Adicione termos relacionados para ajudar clientes a encontrarem este produto na vitrine."
                />
            </div>
        </div>
    )
}

