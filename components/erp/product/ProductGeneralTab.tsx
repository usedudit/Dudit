"use client"

import type React from "react"
import { useState, useMemo, useEffect } from "react"
import { Input, FormDropdown, Checkbox, Accordion, MoneyInput, InfoCard, Barcode, FormSection } from "@/components/reusable"
import { formatCurrency } from "@/lib/utils";
import { PlusIcon, DiceIcon } from "@/lib/icons"
import ProductImagesSection from "./ProductImagesSection"
import { Combobox } from "@/components/reusable"
import MarketplaceCategoryModal from "./MarketplaceCategoryModal"
import { getCategoryPathClient } from "@/lib/data/marketplace-categories-client"
import { RichTextEditor } from "@/components/reusable"
import { planStarIconForTarget, usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal"

const FormCombobox = ({
    label,
    value,
    onChange,
    options,
    disabled,
    width = "w-full",
    actionItem
}: {
    label: string,
    value: any,
    onChange: (val: string) => void,
    options: { label: string, value: string }[],
    disabled?: boolean,
    width?: string,
    actionItem?: { label: string | React.ReactNode, icon?: React.ReactNode, onClick: () => void }
}) => (
    <div className={`flex flex-col gap-1.5 ${width}`}>
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
        />
    </div>
)

const SidebarCard = ({ children, className = "", hasTopStrip = false }: { children: React.ReactNode; className?: string; hasTopStrip?: boolean }) => (
    <div className={`bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden mb-6 transition-colors ${className}`}>
        {hasTopStrip && <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border rounded-t-2xl"></div>}
        {children}
    </div>
)

const chartData = [
    { name: 'Feb 01', value: 200 }, { name: 'Feb 05', value: 300 }, { name: 'Feb 10', value: 450 },
    { name: 'Feb 15', value: 250 }, { name: 'Feb 20', value: 380 }, { name: 'Feb 25', value: 500 }, { name: 'Feb 28', value: 780 },
]

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
    mode?: "add" | "edit" | "details"
    isQuickMode?: boolean
    onGenerateBarcode?: () => void
}


export const ProductGeneralTab: React.FC<ProductGeneralTabProps> = ({
    productData, handleInputChange, generateRandomCode, categories, subCategories, brands, locations, unidadesMedida, openAddItemModal, metadataPlanBlocked = false, isEditing, images, onImageUpload, onRemoveImage, onSetPrimaryImage, fieldErrors, onFieldChange, uploadingImages, blockedImages, isSaving, mode = "edit", isQuickMode = false, onGenerateBarcode
}) => {
    const { openPlanUpgrade } = usePlanUpgrade()

    const handleFieldChange = (e: any) => { if (onFieldChange && e.target.name) onFieldChange(e.target.name); handleInputChange(e) }
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

    return (
        <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">

            {/* ESQUERDA (Principal) */}
            <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12">
                <FormSection title="Informações Básicas">
                    <div className="mb-10">
                        {hasVariants && (
                            <div className="mb-4">
                                <InfoCard
                                    color="blue"
                                    message="Este produto possui variações. As imagens podem ser configuradas individualmente para cada variação na aba Variações."
                                />
                            </div>
                        )}
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
                                    disabled={!isEditing}
                                    required
                                    error={fieldErrors?.has("name")}
                                    errorMessage={fieldErrors?.has("name") ? "Nome é obrigatório" : undefined}
                                />
                            </div>

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
                        </div>
                    </div>
                </FormSection>

                {/* PREÇO */}
                <FormSection hasSeparator title={isQuickMode ? "Preço e Estoque" : "Preço"}>
                    {hasVariants && (
                        <div className="mb-5">
                            <InfoCard
                                color="blue"
                                message="Este produto possui variações. Os preços individuais de cada variação podem ser configurados na aba Variações."
                            />
                        </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-6">
                        {!isQuickMode && (
                            <MoneyInput label="Preço de Custo" name="costPrice" value={productData.costPrice || ""} onChange={(val) => handleFieldChange({ target: { name: "costPrice", value: val } })} disabled={!isEditing || !showPrice} />
                        )}
                        <MoneyInput
                            label="Preço de Venda"
                            name="price"
                            value={productData.price || ""}
                            onChange={(val) => handleFieldChange({ target: { name: "price", value: val } })}
                            disabled={!isEditing || !showPrice}
                            required={showPrice}
                            error={fieldErrors?.has("price")}
                            errorMessage={fieldErrors?.has("price") ? "Preço de venda é obrigatório" : undefined}
                        />
                        <MoneyInput
                            label="Preço Promocional"
                            name="promotional_price"
                            value={productData.promotional_price || ""}
                            onChange={(val) => handleFieldChange({ target: { name: "promotional_price", value: val } })}
                            disabled={!isEditing || !showPrice}
                        />

                        {isQuickMode && (
                            <Input
                                label="Estoque Atual"
                                name="stock"
                                type="number"
                                value={productData.stock || ""}
                                onChange={handleFieldChange}
                                disabled={!isEditing}
                            />
                        )}
                    </div>

                    {!showPrice && (
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
                        <div className="mt-10">
                            <div className="border-t border-brand-border dark:border-dark-border mb-8 w-full"></div>
                            <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-5">Descrição</h3>
                            <RichTextEditor
                                label="Descrição Detalhada"
                                value={productData?.description || ""}
                                onChange={(val) => handleInputChange({ target: { name: "description", value: val } })}
                                disabled={!isEditing}
                            />
                        </div>
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
                            <Input label="Estoque Atual" name="stock" type="number" value={productData.stock || ""} onChange={handleFieldChange} disabled={!isEditing} />
                            <Input label="Mínimo" name="minStock" type="number" value={productData.minStock || ""} onChange={handleFieldChange} disabled={!isEditing} />

                                <FormCombobox
                                    label="Localização"
                                    options={locations}
                                    value={productData.location_id}
                                    onChange={(v) => handleFieldChange({ target: { name: "location_id", value: v } })}
                                    disabled={!isEditing}
                                    width="w-full"
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

                {/* ENVIO - Agora com estilo corrigido */}
                {!isQuickMode && (
                    <div className="mt-8">
                        <div className="border-t border-brand-border dark:border-dark-border mb-8 w-full"></div>

                        <Accordion title={
                            <span className="text-md lg:text-xl font-medium text-brand-dark dark:text-dark-heading mb-6">
                                Envio e Dimensões
                            </span>
                        } defaultOpen={false} triggerClass="text-lg font-bold text-brand-dark dark:text-dark-heading mb-5 text-left">
                            {hasVariants && (
                                <div className="mb-5">
                                    <InfoCard
                                        color="blue"
                                        message="Este produto possui variações. As dimensões e pesos podem variar por variação e devem ser configurados na aba Variações."
                                    />
                                </div>
                            )}
                            <div className="pb-4">
                                <div className="space-y-5">
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
                                        <Input label="Peso Líquido (kg)" name="weight_net" value={productData.weight_net} onChange={handleFieldChange} disabled={!isEditing} />
                                        {/* ... restante dos inputs ... */}
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

            {/* Right Column */}
            <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 border-l-0 lg:border-l border-brand-border dark:border-dark-border mt-8 lg:mt-0">
                <SidebarCard hasTopStrip>
                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6 mt-2">Organização</h3>
                    <div className="space-y-5">
                        <Input
                            label="Código do Produto"
                            name="sku"
                            value={productData.sku}
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
                                <div className="space-y-1.5 w-full">
                                    <Input
                                        label="Código de Barras (EAN/GTIN)"
                                        name="gtin"
                                        value={productData.gtin || ""}
                                        onChange={handleFieldChange}
                                        disabled={!isEditing}
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
                                    value={productData.brand_id}
                                    onChange={(v) => handleFieldChange({ target: { name: "brand_id", value: v } })}
                                    disabled={!isEditing}
                                    width="w-full"
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
                    <SidebarCard>
                        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-3 mt-1">Categoria oficial</h3>
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

                        <MarketplaceCategoryModal
                            isOpen={isOfficialCategoryModalOpen}
                            onClose={() => setIsOfficialCategoryModalOpen(false)}
                            onSelect={(category) => {
                                handleFieldChange({ target: { name: "marketplace_category_id", value: category.id } })
                                setOfficialCategoryPath(category.path)
                            }}
                        />
                    </SidebarCard>
                )}
            </div>
        </div>
    )
}
