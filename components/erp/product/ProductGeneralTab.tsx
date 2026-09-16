"use client"

import type React from "react"
import { useState, useMemo, useEffect, useCallback } from "react"
import { Input, FormDropdown, Checkbox, Accordion, MoneyInput, InfoCard, FormSection, Button, Spinner, ListItem } from "@/components/reusable"
import { SalePriceCalculator } from "@/components/reusable/SalePriceCalculator"
import { PlusIcon, DiceIcon, SparklesIcon, Package, AlertTriangleIcon, MapPinIcon, CheckCircleIcon } from "@/lib/icons"
import ProductImagesSection from "./ProductImagesSection"
import { Combobox } from "@/components/reusable"
import MarketplaceCategoryModal from "./MarketplaceCategoryModal"
import { getCategoryPathClient } from "@/lib/data/marketplace-categories-client"
import { RichTextEditor } from "@/components/reusable"
import { planStarIconForTarget, usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal"
import { useRouter } from "next/navigation"
import QuickStockMovementSheet from "./QuickStockMovementSheet"
import { formatCurrency } from "@/lib/utils"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { ProductAddonsSection } from "./ProductAddonsSection"
import { usePermissions } from "@/lib/permission-context"
import { sanitizeRichText } from "@/lib/security/rich-text-sanitizer"

const CONDITION_OPTIONS = [
    { value: "Novo", label: "Novo" },
    { value: "Usado - Como novo", label: "Usado - Como novo" },
    { value: "Usado - Bom", label: "Usado - Bom" },
    { value: "Usado - Marcas de uso", label: "Usado - Marcas de uso" },
    { value: "Recondicionado", label: "Recondicionado" },
    { value: "Para conserto / peças", label: "Para conserto / peças" },
]

const FormCombobox = ({
    label,
    value,
    onChange,
    options,
    disabled,
    width = "w-full",
    actionItem,
    creatable = false,
    createLabel,
    searchPlaceholder,
    placeholder,
    dataField
}: {
    label: string,
    value: any,
    onChange: (val: string) => void,
    options: { label: string, value: string }[],
    disabled?: boolean,
    width?: string,
    actionItem?: { label: string | React.ReactNode, icon?: React.ReactNode, onClick: () => void },
    creatable?: boolean,
    createLabel?: (search: string) => React.ReactNode,
    searchPlaceholder?: string,
    placeholder?: string,
    dataField?: string
}) => (
    <div className={`flex flex-col gap-1.5 ${width}`} data-field={dataField}>
        <label className="text-sm font-medium text-brand-dark dark:text-dark-heading">
            {label}
        </label>
        <Combobox
            options={options}
            value={value}
            onChange={onChange}
            disabled={disabled}
            width="w-full"
            className={width}
            actionItem={actionItem}
            creatable={creatable}
            createLabel={createLabel}
            searchPlaceholder={searchPlaceholder}
            placeholder={placeholder}
        />
    </div>
)

const SidebarCard = ({ title, children, className = "", hasTopStrip = false }: { title?: React.ReactNode; children: React.ReactNode; className?: string; hasTopStrip?: boolean }) => (
    <div className={`bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden mb-6 transition-colors ${className}`}>
        {hasTopStrip && <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border rounded-t-2xl"></div>}
        {title ? <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6 mt-2">{title}</h3> : null}
        {children}
    </div>
)

interface ProductGeneralTabProps {
    productData: any
    handleInputChange: (e: any) => void
    generateRandomCode: () => void
    categories: { label: string, value: string }[]
    subCategories: { label: string, value: string }[]
    brands: { label: string, value: string }[]
    locations: { label: string, value: string }[]
    unidadesMedida: Array<{ codigo: string; descricao: string }>
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
    mode?: "add" | "edit" | "details" | "duplicate"
    isQuickMode?: boolean
    isDesapego?: boolean
    onGenerateBarcode?: () => void
    isGeneratingDetails?: boolean
    onGenerateDetails?: () => void
}

export const ProductGeneralTab: React.FC<ProductGeneralTabProps> = ({
    productData, handleInputChange, generateRandomCode, categories, subCategories, brands, locations, unidadesMedida, openAddItemModal, metadataPlanBlocked = false, isEditing, images, onImageUpload, onRemoveImage, onSetPrimaryImage, fieldErrors, onFieldChange, uploadingImages, blockedImages, isSaving, mode = "edit", isQuickMode = false, isDesapego = false, onGenerateBarcode, isGeneratingDetails = false, onGenerateDetails
}) => {
    const { openPlanUpgrade } = usePlanUpgrade()
    const router = useRouter()
    const { businessInfo } = usePermissions()
    const [isStockAdjustmentOpen, setIsStockAdjustmentOpen] = useState(false)

    const defaultMargin = useMemo(() => {
        const margin = (businessInfo as any)?.salesSettings?.defaultProfitMarginPercent
        return typeof margin === "number" && margin > 0 ? margin : null
    }, [businessInfo])

    const handleFieldChange = (e: any) => { if (onFieldChange && e.target.name) onFieldChange(e.target.name); handleInputChange(e) }

    const handleBrandChange = useCallback((v: string) => {
        if (!v || !v.trim()) {
            handleFieldChange({ target: { name: "brand_id", value: "" } })
            handleFieldChange({ target: { name: "brand", value: "" } })
            return
        }
        const trimmed = v.trim()
        const matched = (brands || []).find(b => b && (b.value === trimmed || (b.label || "").toLowerCase() === trimmed.toLowerCase()))
        if (matched) {
            handleFieldChange({ target: { name: "brand_id", value: matched.value } })
            handleFieldChange({ target: { name: "brand", value: matched.label } })
        } else {
            handleFieldChange({ target: { name: "brand_id", value: "" } })
            handleFieldChange({ target: { name: "brand", value: trimmed } })
        }
    }, [brands, onFieldChange, handleInputChange])

    const handleLocationChange = useCallback((v: string) => {
        if (!v || !v.trim()) {
            handleFieldChange({ target: { name: "location_id", value: "" } })
            handleFieldChange({ target: { name: "location", value: "" } })
            handleFieldChange({ target: { name: "localizacao", value: "" } })
            return
        }
        const trimmed = v.trim()
        const matched = (locations || []).find(l => l && (l.value === trimmed || (l.label || "").toLowerCase() === trimmed.toLowerCase()))
        if (matched) {
            handleFieldChange({ target: { name: "location_id", value: matched.value } })
            handleFieldChange({ target: { name: "location", value: matched.label } })
            handleFieldChange({ target: { name: "localizacao", value: matched.label } })
        } else {
            handleFieldChange({ target: { name: "location_id", value: "" } })
            handleFieldChange({ target: { name: "location", value: trimmed } })
            handleFieldChange({ target: { name: "localizacao", value: trimmed } })
        }
    }, [locations, onFieldChange, handleInputChange])

    const { salesPrice, profit, margin } = useMemo(() => {
        const p = Number(productData.price || 0), c = Number(productData.costPrice || 0)
        return { salesPrice: p, profit: p - c, margin: p > 0 ? ((p - c) / p * 100).toFixed(1) : "0.0" }
    }, [productData.price, productData.costPrice])

    const showPrice = productData.show_price_in_store ?? true
    const showInMarketplaceValue = productData.show_in_marketplace === undefined ? "true" : String(productData.show_in_marketplace)

    const hasVariants = (() => {
        const v = productData.variants
        if (!Array.isArray(v)) return false
        if (v.length === 0) return false
        if (typeof v[0]?.count === 'number') return v[0].count > 0
        return true
    })()

    const [isOfficialCategoryModalOpen, setIsOfficialCategoryModalOpen] = useState(false)
    const [officialCategoryPath, setOfficialCategoryPath] = useState("")

    useEffect(() => {
        let alive = true
        const id = productData?.marketplace_category_id
        if (!id) {
            setOfficialCategoryPath("")
            return
        }
        getCategoryPathClient(id).then((path) => {
            if (!alive) return
            setOfficialCategoryPath(path || "")
        })
        return () => { alive = false }
    }, [productData?.marketplace_category_id])

    const categoryName = useMemo(() => {
        return categories.find(c => c.value === productData.category_id)?.label || productData.category || "-"
    }, [categories, productData.category_id, productData.category])

    const subcategoryName = useMemo(() => {
        return subCategories.find(c => c.value === productData.subcategory_id)?.label || productData.subcategory || "-"
    }, [subCategories, productData.subcategory_id, productData.subcategory])

    const brandName = useMemo(() => {
        return brands.find(b => b.value === productData.brand_id)?.label || productData.brand || "-"
    }, [brands, productData.brand_id, productData.brand])

    const locationName = useMemo(() => {
        return locations.find(l => l.value === productData.location_id)?.label || productData.localizacao || productData.location || "-"
    }, [locations, productData.location_id, productData.localizacao, productData.location])

    const getImageSrc = (img: string | File) => {
        if (typeof img === 'string') {
            if (img.startsWith("data:") || img.startsWith("blob:")) return img
            return getR2ImageUrl(img) || "https://img.dudit.com.br/static/Placeholder.png"
        }
        return "https://img.dudit.com.br/static/Placeholder.png"
    }

    // ─── MODO DETALHES (READ-ONLY) ───────────────────────────────────────────
    if (!isEditing) {
        return (
            <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
                {/* ESQUERDA (Principal) */}
                <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12">
                    {/* Imagens do Produto no Topo */}
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
                                            alt={`${productData.name || "Produto"} ${index + 1}`}
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
                                <span className="text-sm text-brand-inactive-text dark:text-dark-body">Nome do Produto</span>
                                <h1 className="text-xl md:text-2xl font-bold text-brand-dark dark:text-dark-heading">
                                    {productData.name || "-"}
                                </h1>
                            </div>

                            {!isDesapego ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
                                    <div>
                                        <span className="text-sm text-brand-inactive-text dark:text-dark-body">Status</span>
                                        <div className="flex items-center gap-2">
                                            <span className={`inline-block w-2.5 h-2.5 rounded-full ${productData.is_active ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                                            <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading">
                                                {productData.is_active ? "Ativo" : "Inativo"}
                                            </span>
                                        </div>
                                    </div>

                                    <div>
                                        <span className="text-sm text-brand-inactive-text dark:text-dark-body">Exibir na Vitrine</span>
                                        <div className="flex items-center gap-2">
                                            <span className={`inline-block w-2.5 h-2.5 rounded-full ${productData.show_in_marketplace !== false ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                                            <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading">
                                                {productData.show_in_marketplace !== false ? "Sim" : "Não"}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-3 pt-2">
                                    <div>
                                        <span className="text-sm text-brand-inactive-text dark:text-dark-body">Condição do Item</span>
                                        <div className="mt-1">
                                            <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-brand-green/10 text-brand-green border border-brand-green/20">
                                                {productData.condicao || productData.condition || "Novo"}
                                            </span>
                                        </div>
                                    </div>
                                    {(productData.accepts_offers || productData.accepts_trades) && (
                                        <div className="flex flex-wrap gap-2 pt-1">
                                            {productData.accepts_offers && (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                                                    🤝 Aceita Propostas
                                                </span>
                                            )}
                                            {productData.accepts_trades && (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                                                    🔄 Aceita Trocas
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </FormSection>

                    {/* Preço */}
                    <FormSection hasSeparator title={isQuickMode ? "Preço e Estoque" : "Preço"}>
                        {hasVariants ? (
                            <InfoCard
                                color="blue"
                                message="Este produto possui variações. Os preços individuais de cada variação podem ser configurados na aba Variações."
                            />
                        ) : (
                            <div className={`grid grid-cols-1 ${isDesapego ? "sm:grid-cols-1" : isQuickMode ? "sm:grid-cols-2" : "sm:grid-cols-3"} gap-4 sm:gap-6 mb-2`}>
                                <div className="p-4 rounded-2xl bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border">
                                    <span className="text-xs font-semibold uppercase tracking-wider text-brand-inactive-text dark:text-dark-body block mb-1">
                                        Preço de Venda
                                    </span>
                                    <div className="text-xl md:text-2xl font-bold text-brand-dark dark:text-dark-heading">
                                        {showPrice ? formatCurrency(productData.price || 0) : "Sob consulta"}
                                    </div>
                                    {showPrice && !isDesapego && Number(productData.costPrice) > 0 && (
                                        <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-1 block">
                                            Margem: {margin}% ({formatCurrency(profit)})
                                        </span>
                                    )}
                                </div>

                                {!isQuickMode && !isDesapego && (
                                    <div className="p-4 rounded-2xl bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border">
                                        <span className="text-xs font-semibold uppercase tracking-wider text-brand-inactive-text dark:text-dark-body block mb-1">
                                            Preço de Custo
                                        </span>
                                        <div className="text-xl md:text-2xl font-bold text-brand-dark dark:text-dark-heading">
                                            {formatCurrency(productData.costPrice || 0)}
                                        </div>
                                    </div>
                                )}

                                {!isDesapego && (
                                    <div className="p-4 rounded-2xl bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border">
                                        <span className="text-xs font-semibold uppercase tracking-wider text-brand-inactive-text dark:text-dark-body block mb-1">
                                            Preço Promocional
                                        </span>
                                        <div className="text-xl md:text-2xl font-bold text-brand-dark dark:text-dark-heading">
                                            {productData.promotional_price ? formatCurrency(productData.promotional_price) : "-"}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {!showPrice && !hasVariants && (
                            <div className="mt-4">
                                <InfoCard
                                    color="orange"
                                    message="O produto está configurado para exibir 'Valor sob consulta' na sua vitrine online."
                                />
                            </div>
                        )}

                        {isQuickMode && productData.description && (
                            <div className="mt-8">
                                <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-4">Descrição</h3>
                                <div
                                    className="rich-text-content text-sm text-brand-dark dark:text-dark-heading"
                                    dangerouslySetInnerHTML={{ __html: sanitizeRichText(productData.description) }}
                                />
                            </div>
                        )}
                    </FormSection>

                    {/* Estoque */}
                    {!isQuickMode && (
                        <FormSection hasSeparator title="Estoque">
                            {hasVariants ? (
                                <InfoCard
                                    color="blue"
                                    message="Este produto possui variações. O estoque de cada variação pode ser configurado na aba Variações."
                                />
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <ListItem
                                        icon={Package}
                                        title="Estoque Atual"
                                        description={`${productData.stock || 0} ${productData.unidade || "UN"}`}
                                        className="p-4 cursor-default"
                                        right={
                                            <Button
                                                type="button"
                                                variant="outline"
                                                className="h-8 px-3 text-xs border border-brand-border hover:bg-brand-gray dark:border-dark-border dark:hover:bg-dark-border/50 text-brand-dark dark:text-dark-heading rounded-md font-medium"
                                                onClick={() => setIsStockAdjustmentOpen(true)}
                                            >
                                                Ajustar
                                            </Button>
                                        }
                                    />
                                    <ListItem
                                        icon={AlertTriangleIcon}
                                        title="Estoque Mínimo"
                                        description={`Mínimo: ${productData.minStock || 0} ${productData.unidade || "UN"}`}
                                        className="p-4 cursor-default"
                                    />
                                    <ListItem
                                        icon={MapPinIcon}
                                        title="Localização"
                                        description={locationName}
                                        className="p-4 cursor-default"
                                    />
                                    <ListItem
                                        icon={CheckCircleIcon}
                                        title="Venda sem Estoque"
                                        description={productData.allow_sell_without_stock ? "Permitida" : "Não permitida"}
                                        className="p-4 cursor-default"
                                    />
                                </div>
                            )}
                        </FormSection>
                    )}

                    {/* Envio e Dimensões */}
                    {!isQuickMode && (
                        <FormSection hasSeparator title="Envio e Dimensões">
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
                                <div>
                                    <span className="text-sm text-brand-inactive-text dark:text-dark-body">Dimensões (L × A × P)</span>
                                    <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading">
                                        {productData.width || 0} × {productData.height || 0} × {productData.length || 0} cm
                                    </span>
                                </div>
                                <div>
                                    <span className="text-sm text-brand-inactive-text dark:text-dark-body">Peso Líquido / Bruto</span>
                                    <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading">
                                        {productData.weight_net || 0} kg / {productData.weight_gross || 0} kg
                                    </span>
                                </div>
                                <div>
                                    <span className="text-sm text-brand-inactive-text dark:text-dark-body">Prazo de Preparação</span>
                                    <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading">
                                        {productData.preparation_days || 0} dias
                                    </span>
                                </div>
                                <div>
                                    <span className="text-sm text-brand-inactive-text dark:text-dark-body">Tipo de Embalagem</span>
                                    <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading">
                                        {productData.packaging_type === "package" ? "Pacote / Caixa" : productData.packaging_type === "cilinder" ? "Cilindro / Rolo" : productData.packaging_type === "envelope" ? "Envelope" : "Pacote / Caixa"}
                                    </span>
                                </div>
                            </div>
                        </FormSection>
                    )}
                </div>

                {/* DIREITA (SidebarCard) */}
                <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 border-l-0 lg:border-l border-brand-border dark:border-dark-border mt-8 lg:mt-0">
                    {!isDesapego && (
                        <SidebarCard hasTopStrip title="Organização">
                            <div className="space-y-4">
                                <div className="flex justify-between items-center pb-2 border-b border-brand-border/50 dark:border-dark-border/50">
                                    <span className="text-sm text-brand-inactive-text dark:text-dark-body">Código (SKU)</span>
                                    <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading">{hasVariants ? "Múltiplos SKUs" : (productData.sku || "-")}</span>
                                </div>

                                {!isQuickMode && (
                                    <div className="flex justify-between items-center py-2 border-b border-brand-border/50 dark:border-dark-border/50">
                                        <span className="text-sm text-brand-inactive-text dark:text-dark-body">Código de Barras</span>
                                        <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading">{productData.gtin || "-"}</span>
                                    </div>
                                )}

                                <div className="flex justify-between items-center py-2 border-b border-brand-border/50 dark:border-dark-border/50">
                                    <span className="text-sm text-brand-inactive-text dark:text-dark-body">Categoria</span>
                                    <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading">{categoryName}</span>
                                </div>

                                <div className="flex justify-between items-center py-2 border-b border-brand-border/50 dark:border-dark-border/50">
                                    <span className="text-sm text-brand-inactive-text dark:text-dark-body">Subcategoria</span>
                                    <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading">{subcategoryName}</span>
                                </div>

                                <div className="flex justify-between items-center py-2 border-b border-brand-border/50 dark:border-dark-border/50">
                                    <span className="text-sm text-brand-inactive-text dark:text-dark-body">Marca</span>
                                    <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading">{brandName}</span>
                                </div>

                                <div className="flex justify-between items-center py-2">
                                    <span className="text-sm text-brand-inactive-text dark:text-dark-body">Unidade</span>
                                    <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading">{productData.unidade || "UN"}</span>
                                </div>
                            </div>
                        </SidebarCard>
                    )}

                    {isQuickMode && officialCategoryPath && (
                        <SidebarCard title="Categoria oficial">
                            <div className="p-4 rounded-xl border border-brand-border dark:border-dark-border bg-brand-gray/30 dark:bg-dark-border/30 text-sm font-medium text-brand-dark dark:text-dark-heading">
                                {officialCategoryPath}
                            </div>
                        </SidebarCard>
                    )}
                </div>

                <QuickStockMovementSheet
                    isOpen={isStockAdjustmentOpen}
                    product={{
                        id: productData.id,
                        name: productData.name,
                        sku: productData.sku,
                        image: typeof images[0] === 'string' ? images[0] : (productData.images?.[0] || productData.image || null),
                        stock: Number(productData.stock || 0)
                    }}
                    onClose={() => setIsStockAdjustmentOpen(false)}
                    onSaveSuccess={(newStock) => {
                        handleInputChange({ target: { name: "stock", value: newStock } })
                        router.refresh()
                    }}
                />
            </div>
        )
    }

    // ─── MODO EDIÇÃO / CRIAÇÃO / DUPLICAÇÃO ──────────────────────────────────
    return (
        <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
            {/* ESQUERDA (Principal) */}
            <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12">
                <FormSection title="Informações Básicas" className="mb-8">
                    <div className="mb-10">
                        <ProductImagesSection images={images} onImageUpload={onImageUpload} onRemoveImage={onRemoveImage} onSetPrimaryImage={onSetPrimaryImage} isEditing={isEditing} uploadingImages={uploadingImages} blockedImages={blockedImages} isSaving={isSaving} moderationStatus={productData.moderation_status} />
                    </div>

                    <div className="space-y-6">
                        <div className="grid grid-cols-12 gap-6">
                            <div className="col-span-12">
                                <Input
                                    label="Nome do Produto"
                                    name="name"
                                    value={productData.name}
                                    onChange={handleFieldChange}
                                    disabled={!isEditing || isGeneratingDetails}
                                    required
                                    maxLength={150}
                                    error={fieldErrors?.has("name")}
                                    errorMessage={fieldErrors?.has("name") ? "Nome é obrigatório" : undefined}
                                    dataField="name"
                                    labelAddon={
                                        isEditing && onGenerateDetails && (
                                            <button
                                                type="button"
                                                onClick={onGenerateDetails}
                                                disabled={isGeneratingDetails || !productData.name?.trim()}
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

                            {!isDesapego ? (
                                <>
                                    <div className={`col-span-12 sm:col-span-6`}>
                                        <FormDropdown
                                            label="Status"
                                            options={[{ value: "true", label: "Ativo" }, { value: "false", label: "Inativo" }]}
                                            value={String(productData.is_active)}
                                            setValue={(v) => handleFieldChange({ target: { name: "is_active", value: v === "true" } })}
                                            disabled={!isEditing}
                                            width="w-full"
                                        />
                                    </div>

                                    <div className="col-span-12 sm:col-span-6">
                                        <FormDropdown
                                            label="Exibir na Vitrine"
                                            options={[{ value: "true", label: "Sim" }, { value: "false", label: "Não" }]}
                                            value={showInMarketplaceValue}
                                            setValue={(v) => handleFieldChange({ target: { name: "show_in_marketplace", value: v === "true" } })}
                                            disabled={!isEditing}
                                            width="w-full"
                                        />
                                    </div>
                                </>
                            ) : (
                                <div className="col-span-12 space-y-4">
                                    <FormDropdown
                                        label="Condição do Item"
                                        options={CONDITION_OPTIONS}
                                        value={productData.condicao || productData.condition || "Novo"}
                                        setValue={(v) => handleFieldChange({ target: { name: "condicao", value: v } })}
                                        disabled={!isEditing}
                                        width="w-full"
                                    />
                                    <div className="flex flex-wrap items-center gap-6 pt-1">
                                        <Checkbox
                                            checked={!!productData.accepts_offers}
                                            label="Aceita proposta de preço (negociação)"
                                            onChange={(checked) => handleFieldChange({ target: { name: "accepts_offers", value: checked } })}
                                            name="accepts_offers"
                                            disabled={!isEditing}
                                        />
                                        <Checkbox
                                            checked={!!productData.accepts_trades}
                                            label="Aceita troca por outro item"
                                            onChange={(checked) => handleFieldChange({ target: { name: "accepts_trades", value: checked } })}
                                            name="accepts_trades"
                                            disabled={!isEditing}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </FormSection>

                {/* PREÇO */}
                <FormSection hasSeparator title={isDesapego ? "Preço" : isQuickMode ? "Preço e Estoque" : "Preço"}>
                    {hasVariants && (
                        <div className="mb-5">
                            <InfoCard
                                color="blue"
                                message="Este produto possui variações. Os preços individuais de cada variação podem ser configurados na aba Variações."
                            />
                        </div>
                    )}
                    {!hasVariants && (
                        <div className={`grid grid-cols-1 ${isDesapego ? "sm:grid-cols-1" : isQuickMode ? "sm:grid-cols-2" : "sm:grid-cols-3"} gap-4 sm:gap-6 mb-6`}>
                            {!isQuickMode && !isDesapego && (
                                <MoneyInput
                                    label="Preço de Custo"
                                    name="costPrice"
                                    value={productData.costPrice || ""}
                                    onChange={(val) => {
                                        handleFieldChange({ target: { name: "costPrice", value: val } })
                                        const numVal = Number(val)
                                        if (defaultMargin && (!productData.price || Number(productData.price) === 0) && numVal > 0) {
                                            const calculated = Math.round(numVal * (1 + defaultMargin / 100) * 100) / 100
                                            handleFieldChange({ target: { name: "price", value: calculated } })
                                        }
                                    }}
                                    disabled={!isEditing || !showPrice}
                                    dataField="costPrice"
                                />
                            )}
                            <div className="flex flex-col">
                                <MoneyInput
                                    label="Preço de Venda"
                                    name="price"
                                    value={productData.price || ""}
                                    onChange={(val) => handleFieldChange({ target: { name: "price", value: val } })}
                                    disabled={!isEditing || !showPrice}
                                    required={showPrice}
                                    error={fieldErrors?.has("price")}
                                    errorMessage={fieldErrors?.has("price") ? "Preço de venda é obrigatório" : undefined}
                                    dataField="price"
                                />
                                {isEditing && showPrice && !isDesapego && (
                                    <SalePriceCalculator
                                        costPrice={Number(productData.costPrice || 0)}
                                        sellingPrice={Number(productData.price || 0)}
                                        defaultMarginPercent={defaultMargin}
                                        onApply={(cost, sell) => {
                                            handleFieldChange({ target: { name: "costPrice", value: cost } })
                                            handleFieldChange({ target: { name: "price", value: sell } })
                                        }}
                                    />
                                )}
                            </div>
                            {!isDesapego && (
                                <MoneyInput
                                    label="Preço Promocional"
                                    name="promotional_price"
                                    value={productData.promotional_price || ""}
                                    onChange={(val) => handleFieldChange({ target: { name: "promotional_price", value: val } })}
                                    disabled={!isEditing || !showPrice}
                                />
                            )}

                            {isQuickMode && !isDesapego && (
                                mode === "add" || mode === "duplicate" ? (
                                    <Input
                                        label="Estoque Atual"
                                        name="stock"
                                        type="number"
                                        value={productData.stock || ""}
                                        onChange={handleFieldChange}
                                        disabled={!isEditing}
                                        dataField="stock"
                                    />
                                ) : (
                                    <Input
                                        label="Estoque Atual"
                                        name="stock"
                                        type="number"
                                        value={productData.stock || 0}
                                        readOnly
                                        dataField="stock"
                                        suffix={
                                            <Button
                                                type="button"
                                                variant="outline"
                                                className="h-7 px-2.5 text-xs border border-brand-border hover:bg-brand-gray dark:border-dark-border dark:hover:bg-dark-border/50 text-brand-dark dark:text-dark-heading rounded-md font-medium"
                                                onClick={() => setIsStockAdjustmentOpen(true)}
                                            >
                                                Ajustar
                                            </Button>
                                        }
                                    />
                                )
                            )}
                        </div>
                    )}

                    {!showPrice && !hasVariants && (
                        <div className="mb-6">
                            <InfoCard
                                color="orange"
                                message="Ao não mostrar o preço, o produto será salvo com um valor de 0,00 e, na sua vitrine, será exibido o texto 'Valor sob consulta'"
                            />
                        </div>
                    )}

                    <div className="flex items-center gap-2 cursor-pointer w-fit mt-2 mb-8">
                        <Checkbox
                            checked={showPrice}
                            label="Exibir o preço na vitrine online"
                            onChange={(checked) => {
                                handleFieldChange({ target: { name: "show_price_in_store", value: checked } })
                                if (!checked) {
                                    handleFieldChange({ target: { name: "price", value: 0 } })
                                    handleFieldChange({ target: { name: "costPrice", value: 0 } })
                                    handleFieldChange({ target: { name: "promotional_price", value: 0 } })
                                }
                            }}
                            name="show_price_in_store"
                            disabled={!isEditing}
                        />
                    </div>

                    {isQuickMode && (
                        <>
                            <FormSection title="Descrição Detalhada" hasSeparator>
                                <RichTextEditor
                                    label="Descrição Detalhada"
                                    value={productData?.description || ""}
                                    onChange={(val) => handleInputChange({ target: { name: "description", value: val } })}
                                    disabled={!isEditing}
                                />
                            </FormSection>

                            {!isDesapego && (
                                <FormSection title="Complementos e Adicionais" hasSeparator>
                                    <ProductAddonsSection
                                        addonGroups={productData?.addon_groups || []}
                                        onChange={(groups) => handleInputChange({ target: { name: "addon_groups", value: groups } })}
                                        isEditing={isEditing}
                                    />
                                </FormSection>
                            )}
                        </>
                    )}
                </FormSection>

                {/* ESTOQUE */}
                {!isQuickMode && (
                    <FormSection hasSeparator title="Estoque">
                        {hasVariants && (
                            <div className="mb-5">
                                <InfoCard
                                    color="blue"
                                    message="Este produto possui variações. O estoque individual de cada variação pode ser configurado na aba Variações."
                                />
                            </div>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-8">
                            {!hasVariants && (
                                mode === "add" || mode === "duplicate" ? (
                                    <Input
                                        label="Estoque Atual"
                                        name="stock"
                                        type="number"
                                        value={productData.stock || ""}
                                        onChange={handleFieldChange}
                                        disabled={!isEditing}
                                        dataField="stock"
                                    />
                                ) : (
                                    <Input
                                        label="Estoque Atual"
                                        name="stock"
                                        type="number"
                                        value={productData.stock || 0}
                                        readOnly
                                        dataField="stock"
                                        suffix={
                                            <Button
                                                type="button"
                                                variant="outline"
                                                className="h-7 px-2.5 text-xs border border-brand-border hover:bg-brand-gray dark:border-dark-border dark:hover:bg-dark-border/50 text-brand-dark dark:text-dark-heading rounded-md font-medium"
                                                onClick={() => setIsStockAdjustmentOpen(true)}
                                            >
                                                Ajustar
                                            </Button>
                                        }
                                    />
                                )
                            )}
                            <Input label="Mínimo" name="minStock" type="number" value={productData.minStock || ""} onChange={handleFieldChange} disabled={!isEditing} />

                            <FormCombobox
                                label="Localização"
                                options={locations}
                                value={productData.location_id || productData.localizacao || productData.location || ""}
                                onChange={handleLocationChange}
                                disabled={!isEditing}
                                width="w-full"
                                creatable={true}
                                searchPlaceholder="Buscar ou digitar novo local..."
                                placeholder="Selecione ou digite..."
                                createLabel={(s) => <span>Usar local &ldquo;<strong>{s}</strong>&rdquo;</span>}
                                actionItem={{
                                    label: metadataPlanBlocked ? (
                                        <span className="inline-flex items-center gap-1.5">
                                            Novo local
                                            <img src={planStarIconForTarget("crescer")!} alt="" className="w-3.5 h-3.5 object-contain" />
                                        </span>
                                    ) : "Criar novo local",
                                    icon: metadataPlanBlocked ? undefined : <PlusIcon size={18} />,
                                    onClick: () => metadataPlanBlocked ? openPlanUpgrade("crescer") : openAddItemModal("location")
                                }}
                            />
                        </div>

                        <div className="flex items-center gap-2 cursor-pointer w-fit mt-2">
                            <Checkbox
                                checked={productData.allow_sell_without_stock}
                                onChange={(c) =>
                                    handleFieldChange({
                                        target: { name: "allow_sell_without_stock", value: c }
                                    })
                                }
                                name="allow_sell_without_stock"
                                disabled={!isEditing}
                                label="Permitir vender sem estoque"
                            />
                        </div>
                    </FormSection>
                )}

                {/* ENVIO */}
                {!isQuickMode && (
                    <div className="mt-8">
                        <div className="border-t border-brand-border dark:border-dark-border mb-8 w-full"></div>

                        <Accordion title={
                            <span className="text-md lg:text-xl font-medium text-brand-dark dark:text-dark-heading mb-6">
                                Envio e Dimensões
                            </span>
                        } defaultOpen={false} triggerClass="text-lg font-bold text-brand-dark dark:text-dark-heading mb-5 text-left">

                            <div className="pb-4">
                                <div className="space-y-5">
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
                                        <Input label="Peso Líquido (kg)" name="weight_net" value={productData.weight_net} onChange={handleFieldChange} disabled={!isEditing} />
                                        <Input label="Peso Bruto (kg)" name="weight_gross" value={productData.weight_gross} onChange={handleFieldChange} disabled={!isEditing} />
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <Input
                                                label="Prazo de Preparação (dias)"
                                                name="preparation_days"
                                                type="number"
                                                value={productData.preparation_days}
                                                onChange={handleFieldChange}
                                                disabled={!isEditing}
                                                placeholder="0"
                                            />
                                            <FormDropdown
                                                label="Tipo de Embalagem"
                                                options={[
                                                    { value: "package", label: "Pacote/Caixa" },
                                                    { value: "cilinder", label: "Cilindro/Rolo" },
                                                    { value: "envelope", label: "Envelope" }
                                                ]}
                                                value={productData.packaging_type}
                                                setValue={(v) => handleFieldChange({ target: { name: "packaging_type", value: v } })}
                                                disabled={!isEditing}
                                                width="w-full"
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
                                        <Input label="Largura (cm)" name="width" value={productData.width} onChange={handleFieldChange} disabled={!isEditing} />
                                        <Input label="Altura (cm)" name="height" value={productData.height} onChange={handleFieldChange} disabled={!isEditing} />
                                        <Input label="Profund. (cm)" name="length" value={productData.length} onChange={handleFieldChange} disabled={!isEditing} />
                                    </div>
                                </div>
                            </div>
                        </Accordion>
                    </div>
                )}
            </div>

            {/* Right Column (Organização / Categoria) */}
            <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 border-l-0 lg:border-l border-brand-border dark:border-dark-border mt-8 lg:mt-0">
                {!isDesapego && (
                    <>
                        {/* Mobile/Tablet: FormSection */}
                        <div className="block lg:hidden space-y-8">
                            <FormSection title="Organização" hasSeparator>
                                <div className="space-y-5">
                                    {!hasVariants && (
                                        <Input
                                            label="Código do Produto"
                                            name="sku"
                                            value={productData.sku}
                                            placeholder="Gerar automaticamente"
                                            onChange={handleFieldChange}
                                            disabled={!isEditing}
                                            dataField="sku"
                                            suffix={
                                                <div
                                                    onClick={generateRandomCode}
                                                    className="cursor-pointer p-1 text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                >
                                                    <DiceIcon size={20} />
                                                </div>
                                            }
                                        />
                                    )}

                                    {!isQuickMode && (
                                        <>
                                            <div className="space-y-1.5 w-full">
                                                <Input
                                                    label="Código de Barras (EAN/GTIN)"
                                                    name="gtin"
                                                    value={productData.gtin || ""}
                                                    onChange={handleFieldChange}
                                                    disabled={!isEditing}
                                                    dataField="gtin"
                                                    suffix={
                                                        <div
                                                            onClick={onGenerateBarcode}
                                                            className="cursor-pointer p-1 text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                        >
                                                            <DiceIcon size={20} />
                                                        </div>
                                                    }
                                                />
                                            </div>

                                            <FormCombobox
                                                label="Categoria"
                                                options={categories}
                                                value={productData.category_id}
                                                onChange={(v) => handleFieldChange({ target: { name: "category_id", value: v } })}
                                                disabled={!isEditing}
                                                width="w-full"
                                                dataField="category_id"
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
                                                value={productData.subcategory_id}
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

                                            <FormCombobox
                                                label="Marca"
                                                options={brands}
                                                value={productData.brand_id || productData.brand || ""}
                                                onChange={handleBrandChange}
                                                disabled={!isEditing}
                                                width="w-full"
                                                creatable={true}
                                                searchPlaceholder="Buscar ou digitar nova marca..."
                                                placeholder="Selecione ou digite..."
                                                createLabel={(s) => <span>Usar marca &ldquo;<strong>{s}</strong>&rdquo;</span>}
                                                actionItem={{
                                                    label: metadataPlanBlocked ? (
                                                        <span className="inline-flex items-center gap-1.5">
                                                            Nova marca
                                                            <img src={planStarIconForTarget("crescer")!} alt="" className="w-3.5 h-3.5 object-contain" />
                                                        </span>
                                                    ) : "Criar nova marca",
                                                    icon: metadataPlanBlocked ? undefined : <PlusIcon className="w-4 h-4" />,
                                                    onClick: () => metadataPlanBlocked ? openPlanUpgrade("crescer") : openAddItemModal("brand")
                                                }}
                                            />

                                            <FormCombobox
                                                label="Unidade"
                                                options={unidadesMedida.map(c => ({ value: c.codigo, label: c.codigo }))}
                                                value={productData.unidade}
                                                onChange={(v) => handleFieldChange({ target: { name: "unidade", value: v } })}
                                                disabled={!isEditing}
                                                width="w-full"
                                            />
                                        </>
                                    )}
                                </div>
                            </FormSection>

                            {isQuickMode && (
                                <FormSection title="Categoria oficial" description="Selecione a categoria oficial do seu produto." hasSeparator>
                                    <button
                                        type="button"
                                        disabled={!isEditing}
                                        onClick={() => setIsOfficialCategoryModalOpen(true)}
                                        className="w-full text-left p-4 rounded-xl border border-brand-border dark:border-dark-border hover:bg-brand-gray/40 dark:hover:bg-dark-border/40 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="text-sm font-medium text-brand-dark dark:text-dark-heading truncate">
                                                    {officialCategoryPath || "Selecionar categoria..."}
                                                </div>
                                                {officialCategoryPath ? (
                                                    <div className="text-xs text-brand-inactive-text dark:text-dark-body mt-1 truncate">
                                                        Clique para alterar
                                                    </div>
                                                ) : null}
                                            </div>
                                            <div className="shrink-0 text-brand-inactive-text">
                                                <PlusIcon className="w-4 h-4" />
                                            </div>
                                        </div>
                                    </button>
                                </FormSection>
                            )}
                        </div>

                        {/* Desktop: SidebarCard */}
                        <div className="hidden lg:block">
                            <SidebarCard hasTopStrip title="Organização">
                                <div className="space-y-5">
                                    {!hasVariants && (
                                        <Input
                                            label="Código do Produto"
                                            name="sku"
                                            value={productData.sku}
                                            placeholder="Gerar automaticamente"
                                            onChange={handleFieldChange}
                                            disabled={!isEditing}
                                            dataField="sku"
                                            suffix={
                                                <div
                                                    onClick={generateRandomCode}
                                                    className="cursor-pointer p-1 text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                >
                                                    <DiceIcon size={20} />
                                                </div>
                                            }
                                        />
                                    )}

                                    {!isQuickMode && (
                                        <>
                                            <div className="space-y-1.5 w-full">
                                                <Input
                                                    label="Código de Barras (EAN/GTIN)"
                                                    name="gtin"
                                                    value={productData.gtin || ""}
                                                    onChange={handleFieldChange}
                                                    disabled={!isEditing}
                                                    dataField="gtin"
                                                    suffix={
                                                        <div
                                                            onClick={onGenerateBarcode}
                                                            className="cursor-pointer p-1 text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                        >
                                                            <DiceIcon size={20} />
                                                        </div>
                                                    }
                                                />
                                            </div>

                                            <FormCombobox
                                                label="Categoria"
                                                options={categories}
                                                value={productData.category_id}
                                                onChange={(v) => handleFieldChange({ target: { name: "category_id", value: v } })}
                                                disabled={!isEditing}
                                                width="w-full"
                                                dataField="category_id"
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
                                                value={productData.subcategory_id}
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

                                            <FormCombobox
                                                label="Marca"
                                                options={brands}
                                                value={productData.brand_id || productData.brand || ""}
                                                onChange={handleBrandChange}
                                                disabled={!isEditing}
                                                width="w-full"
                                                creatable={true}
                                                searchPlaceholder="Buscar ou digitar nova marca..."
                                                placeholder="Selecione ou digite..."
                                                createLabel={(s) => <span>Usar marca &ldquo;<strong>{s}</strong>&rdquo;</span>}
                                                actionItem={{
                                                    label: metadataPlanBlocked ? (
                                                        <span className="inline-flex items-center gap-1.5">
                                                            Nova marca
                                                            <img src={planStarIconForTarget("crescer")!} alt="" className="w-3.5 h-3.5 object-contain" />
                                                        </span>
                                                    ) : "Criar nova marca",
                                                    icon: metadataPlanBlocked ? undefined : <PlusIcon className="w-4 h-4" />,
                                                    onClick: () => metadataPlanBlocked ? openPlanUpgrade("crescer") : openAddItemModal("brand")
                                                }}
                                            />

                                            <FormCombobox
                                                label="Unidade"
                                                options={unidadesMedida.map(c => ({ value: c.codigo, label: c.codigo }))}
                                                value={productData.unidade}
                                                onChange={(v) => handleFieldChange({ target: { name: "unidade", value: v } })}
                                                disabled={!isEditing}
                                                width="w-full"
                                            />
                                        </>
                                    )}
                                </div>
                            </SidebarCard>

                            {isQuickMode && (
                                <SidebarCard title="Categoria oficial">
                                    <p className="text-sm text-brand-inactive-text dark:text-dark-body mb-4">
                                        Selecione a categoria oficial do seu produto.
                                    </p>
                                    <button
                                        type="button"
                                        disabled={!isEditing}
                                        onClick={() => setIsOfficialCategoryModalOpen(true)}
                                        className="w-full text-left p-4 rounded-xl border border-brand-border dark:border-dark-border hover:bg-brand-gray/40 dark:hover:bg-dark-border/40 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="text-sm font-medium text-brand-dark dark:text-dark-heading truncate">
                                                    {officialCategoryPath || "Selecionar categoria..."}
                                                </div>
                                                {officialCategoryPath ? (
                                                    <div className="text-xs text-brand-inactive-text dark:text-dark-body mt-1 truncate">
                                                        Clique para alterar
                                                    </div>
                                                ) : null}
                                            </div>
                                            <div className="shrink-0 text-brand-inactive-text">
                                                <PlusIcon className="w-4 h-4" />
                                            </div>
                                        </div>
                                    </button>
                                </SidebarCard>
                            )}
                        </div>
                    </>
                )}

                {isDesapego && isQuickMode && (
                    <SidebarCard title="Categoria oficial">
                        <p className="text-sm text-brand-inactive-text dark:text-dark-body mb-4">
                            Selecione a categoria oficial do seu produto.
                        </p>
                        <button
                            type="button"
                            disabled={!isEditing}
                            onClick={() => setIsOfficialCategoryModalOpen(true)}
                            className="w-full text-left p-4 rounded-xl border border-brand-border dark:border-dark-border hover:bg-brand-gray/40 dark:hover:bg-dark-border/40 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="text-sm font-medium text-brand-dark dark:text-dark-heading truncate">
                                        {officialCategoryPath || "Selecionar categoria..."}
                                    </div>
                                    {officialCategoryPath ? (
                                        <div className="text-xs text-brand-inactive-text dark:text-dark-body mt-1 truncate">
                                            Clique para alterar
                                        </div>
                                    ) : null}
                                </div>
                                <div className="shrink-0 text-brand-inactive-text">
                                    <PlusIcon className="w-4 h-4" />
                                </div>
                            </div>
                        </button>
                    </SidebarCard>
                )}

                <MarketplaceCategoryModal
                    isOpen={isOfficialCategoryModalOpen}
                    onClose={() => setIsOfficialCategoryModalOpen(false)}
                    onSelect={(category) => {
                        handleFieldChange({ target: { name: "marketplace_category_id", value: category.id } })
                        setOfficialCategoryPath(category.path)
                    }}
                />
            </div>
            <QuickStockMovementSheet
                isOpen={isStockAdjustmentOpen}
                product={{
                    id: productData.id,
                    name: productData.name,
                    sku: productData.sku,
                    image: typeof images[0] === 'string' ? images[0] : (productData.images?.[0] || productData.image || null),
                    stock: Number(productData.stock || 0)
                }}
                onClose={() => setIsStockAdjustmentOpen(false)}
                onSaveSuccess={(newStock) => {
                    handleInputChange({ target: { name: "stock", value: newStock } })
                    router.refresh()
                }}
            />
        </div>
    )
}
