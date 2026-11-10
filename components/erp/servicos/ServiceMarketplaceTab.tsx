"use client"

import type React from "react"
import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Input, FormDropdown, Checkbox, Button, Accordion, IconPlaceholder, RichTextEditor, FormSection, Badge, SidebarCard } from "@/components/reusable"
import { TagsManagerModal } from "@/components/erp/shared/TagsManagerModal"
import { TagsListItem } from "@/components/erp/shared/TagsListItem"
import { XIcon, StoreIcon, ArrowUpDownIcon, TrashIcon, ChevronDownIcon } from "@/lib/icons"
import ProductVideoSection from "@/components/erp/product/ProductVideoSection"
import { OfficialCategoryCard } from "@/components/erp/OfficialCategoryCard"
import { sanitizeRichText } from "@/lib/security/rich-text-sanitizer"

interface ServiceMarketplaceTabProps {
    serviceData: any
    handleInputChange: (e: any) => void
    isEditing: boolean
    itemId: string
    video: any
    onVideoChange: (video: any) => void
    videoPlanBlocked?: boolean
}

export const ServiceMarketplaceTab: React.FC<ServiceMarketplaceTabProps> = ({
    serviceData, handleInputChange, isEditing, itemId, video, onVideoChange, videoPlanBlocked = false
}) => {
    const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false)
    const [isTagsModalOpen, setIsTagsModalOpen] = useState(false)

    const manualChange = (name: string, value: any) => {
        handleInputChange({
            target: { name, value }
        })
    }

    const technicalDetails = Array.isArray(serviceData?.technical_details) ? serviceData.technical_details : []
    const tags = Array.isArray(serviceData?.tags) ? serviceData.tags : []

    // --- Lógica dos Atributos (Ficha Técnica) ---
    const addAttribute = () => {
        if (technicalDetails.length >= 25) return
        const newAttributes = [...technicalDetails, { id: Date.now(), name: "", value: "" }]
        manualChange("technical_details", newAttributes)
    }

    const removeAttribute = (id: number) => {
        const newAttributes = technicalDetails.filter((attr: any) => attr.id !== id)
        manualChange("technical_details", newAttributes)
    }

    const updateAttribute = (id: number, field: string, newValue: string) => {
        const newAttributes = technicalDetails.map((attr: any) =>
            attr.id === id ? { ...attr, [field]: newValue } : attr
        )
        manualChange("technical_details", newAttributes)
    }

    const serviceTypeLabel = (() => {
        switch (serviceData?.service_type) {
            case 'online': return 'Online (Remoto)'
            case 'hybrid': return 'Híbrido'
            default: return 'Presencial'
        }
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
                            {serviceData?.description ? (
                                <div
                                    className="rich-text-content text-sm md:text-base text-brand-dark dark:text-dark-heading leading-relaxed"
                                    dangerouslySetInnerHTML={{ __html: sanitizeRichText(serviceData.description) }}
                                />
                            ) : (
                                <p className="text-sm text-brand-inactive-text dark:text-dark-body">Sem descrição cadastrada.</p>
                            )}
                            {!isDescriptionExpanded && (serviceData?.description?.length || 0) > 250 && (
                                <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white dark:from-dark-surface to-transparent pointer-events-none" />
                            )}
                        </div>
                        {(serviceData?.description?.length || 0) > 250 && (
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
                        {technicalDetails.length > 0 ? (
                            <div className="border border-brand-border dark:border-dark-border rounded-2xl overflow-hidden shadow-xs">
                                {technicalDetails.map((spec: any, i: number) => (
                                    <div
                                        key={i}
                                        className={`flex justify-between items-center px-5 py-3.5 ${i % 2 === 0
                                            ? "bg-brand-gray dark:bg-dark-border/30"
                                            : "bg-white dark:bg-dark-surface"
                                            } ${i < technicalDetails.length - 1 ? "border-b border-brand-border dark:border-dark-border" : ""}`}
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

                    {/* Vídeo */}
                    <FormSection hasSeparator title="Vídeo">
                        <ProductVideoSection
                            itemType="service"
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
                                <span className="text-sm text-brand-inactive-text dark:text-dark-body">Tipo de Serviço</span>
                                <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading">
                                    {serviceTypeLabel}
                                </span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-brand-border/50 dark:border-dark-border/50">
                                <span className="text-sm text-brand-inactive-text dark:text-dark-body">Garantia</span>
                                <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading">
                                    {serviceData?.warranty_value ? `${serviceData.warranty_value} ${serviceData.warranty_period || "Meses"}` : serviceData?.warranty || "Sem garantia"}
                                </span>
                            </div>
                            <div className="flex justify-between items-center py-2">
                                <span className="text-sm text-brand-inactive-text dark:text-dark-body">Intervalo para retorno</span>
                                <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading">
                                    {serviceData?.recurrence_interval_value ? `${serviceData.recurrence_interval_value} ${serviceData.recurrence_interval_unit || "Meses"}` : "Não definido"}
                                </span>
                            </div>
                        </div>
                    </SidebarCard>

                    <OfficialCategoryCard
                        categoryId={serviceData?.marketplace_category_id}
                        onChange={(id) => manualChange("marketplace_category_id", id)}
                        type="service"
                        isEditing={false}
                    />

                    <SidebarCard hasSeparator title="Tags e Buscas">
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
                <FormSection title="Dados Básicos">
                    <div className="space-y-6">
                        <RichTextEditor
                            label="Descrição Detalhada"
                            value={serviceData?.description || ""}
                            onChange={(val) => manualChange("description", val)}
                            disabled={!isEditing}
                        />
                    </div>
                </FormSection>

                {/* --- FICHA TÉCNICA (ATRIBUTOS) --- */}
                <div className="mt-8">
                    <div className="border-t border-brand-border dark:border-dark-border mb-8 w-full"></div>
                    <Accordion title={
                        <span className="text-md lg:text-xl font-medium text-brand-dark dark:text-dark-heading mb-6">
                            Especificações
                        </span>} defaultOpen={false} triggerClass="text-lg font-bold text-brand-dark dark:text-dark-heading text-left">
                        <div className="pt-2">
                            {technicalDetails.length === 0 ? (
                                <div className="flex flex-col items-center justify-center text-center py-8">
                                    <IconPlaceholder
                                        icon={ArrowUpDownIcon}
                                        title="Nenhum atributo técnico"
                                        subtitle="Adicione características do seu serviço."
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
                                    <div className="w-full overflow-hidden rounded-t-xl bg-brand-gray dark:bg-dark-border/50">
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
                                            {technicalDetails.map((attr: any) => (
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
                                                            placeholder="Nome (ex: Equipamento)"
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
                                                            placeholder="Valor (ex: Incluso)"
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

                <div className="mt-8 mb-8">
                    <div className="border-t border-brand-border dark:border-dark-border mb-8 w-full"></div>
                    <Accordion title={
                        <span className="text-md lg:text-xl font-medium text-brand-dark dark:text-dark-heading mb-6">
                            Vídeo
                        </span>} defaultOpen={false} triggerClass="text-lg font-bold text-brand-dark dark:text-dark-heading text-left">
                        <div className="pt-2">
                            <ProductVideoSection itemType="service" itemId={itemId} video={video} onChange={onVideoChange} isEditing={isEditing} videoPlanBlocked={videoPlanBlocked} />
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
                                label="Tipo de Serviço"
                                options={[
                                    { value: "in_person", label: "Presencial" },
                                    { value: "online", label: "Online (Remoto)" },
                                    { value: "hybrid", label: "Híbrido" }
                                ]}
                                value={serviceData?.service_type || 'in_person'}
                                setValue={(v) => manualChange("service_type", v)}
                                disabled={!isEditing}
                                width="w-full"
                            />

                            <div className="grid grid-cols-2 gap-4">
                                <Input
                                    label="Garantia"
                                    name="warranty_value"
                                    value={serviceData?.warranty_value || ""}
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
                                    value={serviceData?.warranty_period || "Meses"}
                                    setValue={(v) => manualChange("warranty_period", v)}
                                    disabled={!isEditing}
                                    width="w-full"
                                />
                            </div>

                            <div className="border-t border-brand-border dark:border-dark-border pt-5">
                                <h4 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-4">Intervalo para retorno</h4>
                                <p className="text-xs text-brand-inactive-text mb-3">Defina o tempo recomendado para o cliente repetir este serviço (ex: troca de óleo a cada 1 ano).</p>
                                <div className="grid grid-cols-2 gap-4">
                                    <Input
                                        label="Valor"
                                        name="recurrence_interval_value"
                                        value={serviceData?.recurrence_interval_value || ""}
                                        onChange={handleInputChange}
                                        disabled={!isEditing}
                                        type="number"
                                        placeholder="0"
                                        className="w-full"
                                    />
                                    <FormDropdown
                                        label="Unidade"
                                        options={[
                                            { value: "Dias", label: "Dias" },
                                            { value: "Semanas", label: "Semanas" },
                                            { value: "Meses", label: "Meses" },
                                            { value: "Anos", label: "Anos" },
                                        ]}
                                        value={serviceData?.recurrence_interval_unit || "Meses"}
                                        setValue={(v) => manualChange("recurrence_interval_unit", v)}
                                        disabled={!isEditing}
                                        width="w-full"
                                    />
                                </div>
                            </div>
                        </div>
                    </FormSection>

                    <OfficialCategoryCard
                        categoryId={serviceData?.marketplace_category_id}
                        onChange={(id) => manualChange("marketplace_category_id", id)}
                        type="service"
                        isEditing={isEditing}
                    />

                    <FormSection
                        title="Tags e Buscas"
                        description="Adicione palavras-chave para ajudar os clientes a encontrarem este serviço na busca."
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
                                label="Tipo de Serviço"
                                options={[
                                    { value: "in_person", label: "Presencial" },
                                    { value: "online", label: "Online (Remoto)" },
                                    { value: "hybrid", label: "Híbrido" }
                                ]}
                                value={serviceData?.service_type || 'in_person'}
                                setValue={(v) => manualChange("service_type", v)}
                                disabled={!isEditing}
                                width="w-full"
                            />

                            <div className="grid grid-cols-2 gap-4">
                                <Input
                                    label="Garantia"
                                    name="warranty_value"
                                    value={serviceData?.warranty_value || ""}
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
                                    value={serviceData?.warranty_period || "Meses"}
                                    setValue={(v) => manualChange("warranty_period", v)}
                                    disabled={!isEditing}
                                    width="w-full"
                                />
                            </div>

                            <div className="border-t border-brand-border dark:border-dark-border pt-5">
                                <h4 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-4">Intervalo para retorno</h4>
                                <p className="text-xs text-brand-inactive-text mb-3">Defina o tempo recomendado para o cliente repetir este serviço (ex: troca de óleo a cada 1 ano).</p>
                                <div className="grid grid-cols-2 gap-4">
                                    <Input
                                        label="Valor"
                                        name="recurrence_interval_value"
                                        value={serviceData?.recurrence_interval_value || ""}
                                        onChange={handleInputChange}
                                        disabled={!isEditing}
                                        type="number"
                                        placeholder="0"
                                        className="w-full"
                                    />
                                    <FormDropdown
                                        label="Unidade"
                                        options={[
                                            { value: "Dias", label: "Dias" },
                                            { value: "Semanas", label: "Semanas" },
                                            { value: "Meses", label: "Meses" },
                                            { value: "Anos", label: "Anos" },
                                        ]}
                                        value={serviceData?.recurrence_interval_unit || "Meses"}
                                        setValue={(v) => manualChange("recurrence_interval_unit", v)}
                                        disabled={!isEditing}
                                        width="w-full"
                                    />
                                </div>
                            </div>
                        </div>
                    </SidebarCard>

                    <OfficialCategoryCard
                        categoryId={serviceData?.marketplace_category_id}
                        onChange={(id) => manualChange("marketplace_category_id", id)}
                        type="service"
                        isEditing={isEditing}
                    />

                    {/* Card de Tags */}
                    <SidebarCard hasSeparator title="Tags e Buscas">
                        <div className="space-y-3">
                            <p className="text-sm text-brand-inactive-text mb-2">
                                Adicione palavras-chave para ajudar os clientes a encontrarem este serviço na busca.
                            </p>
                            <TagsListItem
                                tags={tags}
                                onClick={() => setIsTagsModalOpen(true)}
                                disabled={!isEditing}
                            />
                        </div>
                    </SidebarCard>
                </div>

            </div>

            <TagsManagerModal
                isOpen={isTagsModalOpen}
                onClose={() => setIsTagsModalOpen(false)}
                tags={tags}
                onChange={(t) => manualChange("tags", t)}
                disabled={!isEditing}
                title="Tags e Buscas"
                description="Adicione palavras-chave para ajudar os clientes a encontrarem este serviço na busca."
            />
        </div>
    )
}

