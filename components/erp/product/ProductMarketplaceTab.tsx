"use client"

import React, { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Input, FormDropdown, RichTextEditor, TagsInput, Button, Accordion, IconPlaceholder, FormSection, Badge, Checkbox } from "@/components/reusable"
import { TrashIcon, PlusIcon, Package, ArrowUpDownIcon, EditIcon, CheckCircleIcon, ChevronDownIcon } from "@/lib/icons"
import MarketplaceCategoryModal from "./MarketplaceCategoryModal"
import { getCategoryPathClient } from "@/lib/data/marketplace-categories-client"
import ProductVideoSection from "./ProductVideoSection"
import { ProductAddonsSection } from "./ProductAddonsSection"

const CONDITION_OPTIONS = [
    { value: "Novo", label: "Novo" },
    { value: "Usado - Como novo", label: "Usado - Como novo" },
    { value: "Usado - Bom", label: "Usado - Bom" },
    { value: "Usado - Marcas de uso", label: "Usado - Marcas de uso" },
    { value: "Recondicionado", label: "Recondicionado" },
    { value: "Para conserto / peças", label: "Para conserto / peças" },
]

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

interface ProductMarketplaceTabProps {
    productData: any
    handleInputChange: (e: any) => void
    isEditing: boolean
    itemId: string
    video: any
    onVideoChange: (video: any) => void
    videoPlanBlocked?: boolean
}

export const ProductMarketplaceTab: React.FC<ProductMarketplaceTabProps> = ({
    productData,
    handleInputChange,
    isEditing,
    itemId,
    video,
    onVideoChange,
    videoPlanBlocked = false,
}) => {
    // --- Estados da Categoria Oficial ---
    const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false)
    const [categoryPath, setCategoryPath] = useState("")
    const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false)

    // --- Carregar Caminho da Categoria (Ex: Casa > Decoração) ---
    useEffect(() => {
        const fetchPath = async () => {
            if (productData?.marketplace_category_id) {
                const path = await getCategoryPathClient(productData.marketplace_category_id)
                if (path) setCategoryPath(path)
            }
        }
        fetchPath()
    }, [productData?.marketplace_category_id])

    // --- Helper para simular evento nativo ---
    const manualChange = (name: string, value: any) => {
        handleInputChange({
            target: { name, value }
        })
    }

    // --- Handler do Modal de Categoria ---
    const handleCategorySelect = (category: { id: string; name: string; path: string }) => {
        manualChange("marketplace_category_id", category.id)
        setCategoryPath(category.path)
    }

    // --- Helpers de Arrays (Segurança) ---
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

    // ─── MODO DETALHES (READ-ONLY) ───────────────────────────────────────────
    if (!isEditing) {
        return (
            <div className="grid grid-cols-12 gap-y-8 md:gap-y-0 animate-fade-in">
                {/* --- COLUNA ESQUERDA (Principal) --- */}
                <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12">
                    {/* Descrição */}
                    <FormSection title="Descrição">
                        <div className={`relative ${!isDescriptionExpanded ? "max-h-[160px] overflow-hidden" : ""}`}>
                            {productData?.description ? (
                                <div
                                    className="rich-text-content text-sm md:text-base text-brand-dark dark:text-dark-heading leading-relaxed"
                                    dangerouslySetInnerHTML={{ __html: productData.description }}
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
                            <div className="border border-brand-border dark:border-dark-border rounded-2xl overflow-hidden shadow-xs">
                                {attributes.map((spec: any, i: number) => (
                                    <div
                                        key={i}
                                        className={`flex justify-between items-center px-5 py-3.5 ${
                                            i % 2 === 0
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
                    <FormSection hasSeparator title="Complementos e Adicionais">
                        <ProductAddonsSection
                            addonGroups={productData?.addon_groups || []}
                            onChange={() => {}}
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
                    <SidebarCard hasTopStrip title="Configurações">
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
                            <div className="flex justify-between items-center py-2">
                                <span className="text-sm text-brand-inactive-text dark:text-dark-body">Garantia</span>
                                <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading">
                                    {productData?.warranty_value ? `${productData.warranty_value} ${productData.warranty_period || "Meses"}` : "Sem garantia"}
                                </span>
                            </div>

                            {(productData?.accepts_offers || productData?.accepts_trades) && (
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

                    <SidebarCard title={<><Package className="w-5 h-5 text-brand-green" /> Categoria Oficial</>}>
                        {categoryPath && (
                            <span className="text-xs font-medium bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                                <CheckCircleIcon className="w-3 h-3" /> Categorizado
                            </span>
                        )}
                        <p className="text-sm text-brand-dark dark:text-dark-heading font-medium mt-2">
                            {categoryPath || "Nenhuma categoria oficial selecionada."}
                        </p>
                    </SidebarCard>

                    <SidebarCard title="Palavras-chave de busca">
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
                        </div>
                    </FormSection>

                    <FormSection
                        title={
                            <div className="flex items-center justify-between w-full">
                                <span className="flex items-center gap-2">
                                    <Package className="w-5 h-5 text-brand-green" />
                                    Categoria Oficial
                                </span>
                                {categoryPath && (
                                    <span className="text-xs font-medium bg-green-100 text-green-800 px-2 py-1 rounded-full flex items-center gap-1">
                                        <CheckCircleIcon className="w-3 h-3" /> Categorizado
                                    </span>
                                )}
                            </div>
                        }
                        description="Selecione onde seu produto será exibido na árvore de categorias."
                        hasSeparator
                    >
                        <div
                            onClick={() => isEditing && setIsCategoryModalOpen(true)}
                            className={`
                                group relative w-full p-4 rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer flex items-center justify-between
                                ${categoryPath
                                    ? "border-brand-green/30 bg-brand-green/5 hover:bg-brand-green/10"
                                    : "border-gray-300 hover:border-brand-green hover:bg-brand-gray dark:border-gray-600 dark:hover:bg-dark-border"
                                }
                                ${!isEditing && "opacity-60 pointer-events-none"}
                            `}
                        >
                            <div className="flex flex-col">
                                <span className={`text-sm font-medium ${categoryPath ? "text-brand-dark dark:text-dark-heading" : "text-gray-400 group-hover:text-gray-600"}`}>
                                    {categoryPath || "Selecionar categoria..."}
                                </span>
                                {categoryPath && <span className="text-xs text-brand-green font-medium mt-1">Clique para alterar</span>}
                            </div>

                            <div className={`p-2 rounded-full ${categoryPath ? "bg-white text-brand-green" : "bg-gray-100 text-gray-400 group-hover:bg-white group-hover:text-brand-green group-hover:shadow-sm"} transition-all`}>
                                {categoryPath ? <EditIcon className="w-4 h-4" /> : <PlusIcon className="w-5 h-5" />}
                            </div>
                        </div>
                    </FormSection>

                    <FormSection
                        title="Palavras-chave de busca"
                        description="Adicione termos relacionados para ajudar clientes a encontrarem este produto no marketplace."
                        hasSeparator
                    >
                        <TagsInput
                            tags={tags}
                            onChange={(t) => manualChange("tags", t)}
                            disabled={!isEditing}
                            placeholder="Adicionar tag..."
                        />
                    </FormSection>
                </div>

                {/* --- DESKTOP (>= lg): CARDS NA SIDEBAR --- */}
                <div className="hidden lg:block">
                    {/* Card de Configurações */}
                    <SidebarCard hasTopStrip title="Configurações">

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
                        </div>
                    </SidebarCard>

                    {/* Card de Categoria Oficial */}
                    <SidebarCard title={<><Package className="w-5 h-5 text-brand-green" /> Categoria Oficial</>}>
                        {categoryPath && (
                            <span className="text-xs font-medium bg-green-100 text-green-800 px-2 py-1 rounded-full flex items-center gap-1">
                                <CheckCircleIcon className="w-3 h-3" /> Categorizado
                            </span>
                        )}

                        <p className="text-sm text-gray-500 mt-2 mb-4">
                            Selecione onde seu produto será exibido na árvore de categorias.
                        </p>

                        <div
                            onClick={() => isEditing && setIsCategoryModalOpen(true)}
                            className={`
                        group relative w-full p-4 rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer flex items-center justify-between
                        ${categoryPath
                                    ? "border-brand-green/30 bg-brand-green/5 hover:bg-brand-green/10"
                                    : "border-gray-300 hover:border-brand-green hover:bg-brand-gray dark:border-gray-600 dark:hover:bg-dark-border"
                                }
                        ${!isEditing && "opacity-60 pointer-events-none"}
                    `}
                        >
                            <div className="flex flex-col">
                                <span className={`text-sm font-medium ${categoryPath ? "text-brand-dark dark:text-dark-heading" : "text-gray-400 group-hover:text-gray-600"}`}>
                                    {categoryPath || "Selecionar categoria..."}
                                </span>
                                {categoryPath && <span className="text-xs text-brand-green font-medium mt-1">Clique para alterar</span>}
                            </div>

                            <div className={`p-2 rounded-full ${categoryPath ? "bg-white text-brand-green" : "bg-gray-100 text-gray-400 group-hover:bg-white group-hover:text-brand-green group-hover:shadow-sm"} transition-all`}>
                                {categoryPath ? <EditIcon className="w-4 h-4" /> : <PlusIcon className="w-5 h-5" />}
                            </div>
                        </div>
                    </SidebarCard>

                    {/* Card de Tags */}
                    <SidebarCard title="Palavras-chave de busca">
                        <p className="text-sm text-brand-inactive-text mb-4">
                            Adicione termos relacionados para ajudar clientes a encontrarem este produto no marketplace.
                        </p>
                        <TagsInput
                            tags={tags}
                            onChange={(t) => manualChange("tags", t)}
                            disabled={!isEditing}
                            placeholder="Adicionar tag..."
                        />
                    </SidebarCard>
                </div>

                <MarketplaceCategoryModal
                    isOpen={isCategoryModalOpen}
                    onClose={() => setIsCategoryModalOpen(false)}
                    onSelect={handleCategorySelect}
                />
            </div>
        </div>
    )
}
