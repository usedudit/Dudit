"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Portal from "@/components/Portal"
import { Button, Tabs, TabsContent, TabsList, TabsTrigger, Combobox, Checkbox, QuantitySelector, IconPlaceholder } from "@/components/reusable"
import { XIcon, PrinterIcon, DownloadIcon, TrashIcon, Package } from "@/lib/icons"
import { useMediaQuery } from "@/components/erp/hooks"
import { type LabelPreset, type LabelContentConfig, type PaperSize, DEFAULT_CONTENT_CONFIG, LABEL_PRESETS, buildCustomPreset, PAPER_SIZES } from "@/lib/labels/presets"
import { LabelSheet, type LabelProduct, type LabelVariant } from "./LabelSheet"
import { formatCurrency } from "@/lib/utils"
import { generateEAN13 } from "@/lib/utils/barcode"
import Pagination from "@/components/reusable/Pagination"
import SelectProductSheet from "./SelectProductSheet"
import SelectVariantSheet from "./SelectVariantSheet"
import { downloadPdf } from "@/lib/pdf/download"
import { toast } from "@/hooks/use-notification"

const MAX_QUANTITY = 300

interface ProductVariant {
    id: string
    variant_type: string
    variant_name: string
    sku: string | null
    price_adjustment: number
    stock_quantity: number
    is_active: boolean
}

interface ProductBase {
    id: string
    name: string
    sku: string | null
    gtin: string | null
    price: number
    promotional_price: number | null
    variants?: ProductVariant[]
}

interface LabelPrintModalProps {
    isOpen: boolean
    onClose: () => void
    allProducts: ProductBase[]
    maxInstallments?: number
}

interface SelectedItem {
    productId: string
    quantity: number
    product: ProductBase
    barcodeValue: string
    selectedVariantId?: string
}

const presetOptions = [
    ...LABEL_PRESETS.map((p) => ({
        label: `${p.name} - ${p.description}`,
        value: p.id,
    })),
    { label: "Customizado - Definir medidas manualmente", value: "custom" },
]

const SELECTED_PAGE_SIZE = 8

function makeBarcode(product: ProductBase): string {
    if (product.gtin) return product.gtin
    return generateEAN13()
}

function getVariantPrice(product: ProductBase, variantId?: string): number {
    if (!variantId || !product.variants) return product.price
    const variant = product.variants.find((v) => v.id === variantId)
    if (!variant) return product.price
    return product.price + variant.price_adjustment
}

function getVariantPromoPrice(product: ProductBase, variantId?: string): number | null {
    if (!variantId || !product.variants) return product.promotional_price
    const variant = product.variants.find((v) => v.id === variantId)
    if (!variant) return product.promotional_price
    if (product.promotional_price == null) return null
    return product.promotional_price + variant.price_adjustment
}

function getVariantSku(product: ProductBase, variantId?: string): string | null {
    if (!variantId || !product.variants) return product.sku
    const variant = product.variants.find((v) => v.id === variantId)
    if (!variant) return product.sku
    return variant.sku || product.sku
}

export function LabelPrintModal({ isOpen, onClose, allProducts, maxInstallments }: LabelPrintModalProps) {
    const isMobile = useMediaQuery("(max-width: 1023px)")

    const [isVisible, setIsVisible] = useState(false)
    const [isAnimating, setIsAnimating] = useState(false)
    const [activeTab, setActiveTab] = useState("Opções")
    const [presetId, setPresetId] = useState("pimaco-a4355")
    const [contentConfig, setContentConfig] = useState<LabelContentConfig>(DEFAULT_CONTENT_CONFIG)
    const [selected, setSelected] = useState<SelectedItem[]>([])
    const [showProductSheet, setShowProductSheet] = useState(false)
    const [showVariantSheet, setShowVariantSheet] = useState<string | null>(null)
    const [selectedPage, setSelectedPage] = useState(1)
    const [customPreset, setCustomPreset] = useState({
        labelWidth: 60,
        labelHeight: 40,
        cols: 3,
        rows: 7,
        marginTop: 10,
        marginRight: 7,
        marginBottom: 10,
        marginLeft: 7,
        spacingX: 3,
        spacingY: 3,
        paperSize: "a4" as PaperSize,
    })
    const [isDownloadingPdf, setIsDownloadingPdf] = useState(false)

    const totalLabels = selected.reduce((sum, p) => sum + p.quantity, 0)

    useEffect(() => {
        if (isOpen) {
            setIsVisible(true)
            const id = setTimeout(() => setIsAnimating(true), 50)
            return () => clearTimeout(id)
        }
        setIsAnimating(false)
        const id = setTimeout(() => setIsVisible(false), 200)
        return () => clearTimeout(id)
    }, [isOpen])

    const existingIds = useMemo(() => new Set(selected.map((s) => s.productId)), [selected])

    const handleProductConfirm = (ids: string[]) => {
        setSelected((prev) => {
            const existingIdsSet = new Set(prev.map((s) => s.productId))
            const newItems: SelectedItem[] = []
            ids.forEach((id) => {
                if (!existingIdsSet.has(id)) {
                    const product = allProducts.find((p) => p.id === id)
                    if (product) newItems.push({ productId: id, quantity: 1, product, barcodeValue: makeBarcode(product) })
                }
            })
            const keepItems = prev.filter((s) => ids.includes(s.productId))
            return [...keepItems, ...newItems]
        })
    }

    const removeProduct = (productId: string) => {
        setSelected((prev) => prev.filter((s) => s.productId !== productId))
        setSelectedPage(1)
    }

    const updateQty = (productId: string, qty: number) => {
        setSelected((prev) =>
            prev.map((s) => (s.productId === productId ? { ...s, quantity: Math.min(MAX_QUANTITY, Math.max(1, qty)) } : s)),
        )
    }

    const handleVariantConfirm = (productId: string, variantId: string | null) => {
        setSelected((prev) =>
            prev.map((s) => {
                if (s.productId !== productId) return s
                if (variantId) {
                    const variant = s.product.variants?.find((v) => v.id === variantId)
                    return { ...s, selectedVariantId: variantId, barcodeValue: variant?.sku || s.barcodeValue }
                }
                return { ...s, selectedVariantId: undefined, barcodeValue: makeBarcode(s.product) }
            }),
        )
    }

    const totalSelectedPages = Math.max(1, Math.ceil(selected.length / SELECTED_PAGE_SIZE))
    const paginatedSelected = useMemo(
        () => selected.slice((selectedPage - 1) * SELECTED_PAGE_SIZE, selectedPage * SELECTED_PAGE_SIZE),
        [selected, selectedPage],
    )

    const labelProducts: LabelProduct[] = useMemo(
        () =>
            selected.map((s) => {
                const variant = s.selectedVariantId ? s.product.variants?.find((v) => v.id === s.selectedVariantId) : null
                return {
                    id: variant ? variant.id : s.product.id,
                    name: s.product.name,
                    sku: getVariantSku(s.product, s.selectedVariantId),
                    gtin: s.product.gtin,
                    barcodeValue: s.barcodeValue,
                    price: getVariantPrice(s.product, s.selectedVariantId),
                    promotionalPrice: getVariantPromoPrice(s.product, s.selectedVariantId),
                    internalCode: getVariantSku(s.product, s.selectedVariantId),
                    labelQuantity: s.quantity,
                    variant: variant
                        ? {
                              type: variant.variant_type,
                              name: variant.variant_name,
                          }
                        : undefined,
                }
            }),
        [selected],
    )

    const installmentDisplay = useMemo(() => {
        if (!maxInstallments || maxInstallments <= 1) return null
        const price = selected.length > 0 ? selected[0].product.price : 0
        const perInstallment = price / maxInstallments
        return {
            maxInstallments,
            perInstallment,
            text: `${maxInstallments}x de ${formatCurrency(perInstallment)}`,
        }
    }, [maxInstallments, selected])

    const preset = useMemo((): LabelPreset => {
        if (presetId === "custom") {
            return buildCustomPreset(customPreset)
        }
        return LABEL_PRESETS.find((p) => p.id === presetId) || LABEL_PRESETS[0]
    }, [presetId, customPreset])

    const buildPrintData = useCallback(() => {
        return {
            presetId,
            customPreset: presetId === "custom" ? customPreset : undefined,
            contentConfig,
            products: selected.map((s) => ({ id: s.productId, quantity: s.quantity, barcodeValue: s.barcodeValue, variantId: s.selectedVariantId })),
        }
    }, [presetId, customPreset, contentConfig, selected])

    const buildPrintUrl = useCallback(() => {
        const data = buildPrintData()
        return `/print/labels?data=${encodeURIComponent(JSON.stringify(data))}`
    }, [buildPrintData])

    const handlePrint = useCallback(() => {
        if (selected.length === 0) return
        window.open(buildPrintUrl(), "_blank")
        onClose()
    }, [buildPrintUrl, selected, onClose])

    const handleDownloadPdf = useCallback(async () => {
        if (selected.length === 0 || isDownloadingPdf) return
        setIsDownloadingPdf(true)
        try {
            const data = buildPrintData()
            const params = new URLSearchParams({ data: JSON.stringify(data) })
            await downloadPdf(`/api/pdf/labels?${params.toString()}`, "etiquetas.pdf")
            onClose()
        } catch (error: any) {
            console.error("[LabelPrintModal] Error downloading PDF:", error)
            toast.error("Erro ao gerar PDF", error?.message || "Não foi possível gerar o PDF. Tente novamente.")
        } finally {
            setIsDownloadingPdf(false)
        }
    }, [selected, buildPrintData, isDownloadingPdf, onClose])

    if (!isVisible) return null

    return (
        <>
            <Portal>
                <div className="fixed inset-0 z-[130] flex flex-col bg-black/60">
                    <div
                        className={`relative flex flex-col w-full h-full bg-white dark:bg-dark-background transition-opacity duration-200 ${isAnimating ? "opacity-100" : "opacity-0"}`}
                    >
                        {/* Header */}
                        <div className="shrink-0 flex items-center justify-between px-4 md:px-6 py-4 border-b border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface">
                            <h2 className="text-lg md:text-xl font-bold text-brand-dark dark:text-dark-heading">
                                Imprimir etiquetas {totalLabels > 0 && `(${totalLabels})`}
                            </h2>
                            <Button variant="filled" onClick={onClose} className="w-10 h-10 p-0 flex items-center justify-center shrink-0">
                                <XIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                            </Button>
                        </div>

                        <Tabs
                            value={activeTab}
                            onValueChange={setActiveTab}
                            className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0"
                        >
                            {isMobile && (
                                <div className="shrink-0 px-4 pt-3 border-b border-brand-border dark:border-dark-border lg:hidden">
                                    <TabsList className="bg-transparent p-0 gap-4 w-full justify-start border-b-0">
                                        <TabsTrigger value="Opções">Opções</TabsTrigger>
                                        <TabsTrigger value="Visualização">Visualização</TabsTrigger>
                                    </TabsList>
                                </div>
                            )}

                            {/* Left panel */}
                            <div
                                className={`w-full lg:w-1/2 flex flex-col border-r border-brand-border dark:border-dark-border overflow-hidden ${activeTab === "Visualização" ? "hidden lg:flex" : "flex"}`}
                            >
                                <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6 space-y-5">
                                    {/* Selected products */}
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                Produtos selecionados {selected.length > 0 && `(${selected.length})`}
                                            </p>
                                            <Button variant="link" onClick={() => setShowProductSheet(true)}>
                                                + Adicionar
                                            </Button>
                                        </div>

                                        {selected.length === 0 ? (
                                            <IconPlaceholder
                                                icon={Package}
                                                title="Nenhum produto selecionado"
                                                subtitle="Selecione produtos para gerar etiquetas"
                                                itemButton={{
                                                    text: "Selecionar Produtos",
                                                    action: () => setShowProductSheet(true),
                                                    variant: "outline"
                                                }}
                                            />
                                        ) : (
                                            <>
                                                <div className="overflow-x-auto">
                                                    <table className="w-full text-left border-separate border-spacing-0">
                                                        <thead>
                                                            <tr className="text-xs text-brand-inactive-text">
                                                                <th className="py-3 pl-6 pr-0 font-medium">Produto</th>
                                                                <th className="py-3 px-2 font-medium w-28">Qtd</th>
                                                                <th className="py-3 pl-2 font-medium w-16">Ação</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {paginatedSelected.map((item) => {
                                                                const variant = item.selectedVariantId
                                                                    ? item.product.variants?.find((v) => v.id === item.selectedVariantId)
                                                                    : null
                                                                const hasVariants = item.product.variants && item.product.variants.length > 0
                                                                return (
                                                                    <tr
                                                                        key={item.productId}
                                                                        className="bg-white dark:bg-dark-background transition-colors hover:bg-brand-gray dark:hover:bg-dark-border/10 border-b border-brand-border dark:border-dark-border"
                                                                    >
                                                                        <td className="py-3 pl-6 pr-0">
                                                                            <div className="flex flex-col">
                                                                                <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading truncate max-w-[180px]">
                                                                                    {item.product.name}
                                                                                </span>
                                                                                {variant && (
                                                                                    <span className="text-xs font-medium text-brand-primary truncate max-w-[180px]">
                                                                                        {variant.variant_type}: {variant.variant_name}
                                                                                    </span>
                                                                                )}
                                                                                {hasVariants && !variant && (
                                                                                    <button
                                                                                        onClick={() => setShowVariantSheet(item.productId)}
                                                                                        className="text-xs font-medium text-brand-primary hover:underline text-left truncate max-w-[180px]"
                                                                                    >
                                                                                        Selecionar variacao
                                                                                    </button>
                                                                                )}
                                                                            </div>
                                                                        </td>
                                                                        <td className="py-3 px-2">
                                                                            <QuantitySelector
                                                                                value={item.quantity}
                                                                                onChange={(v) => updateQty(item.productId, v)}
                                                                                max={MAX_QUANTITY}
                                                                                size="sm"
                                                                            />
                                                                        </td>
                                                                        <td className="py-3 pl-2">
                                                                            <Button variant="outlinered" size="icon" onClick={() => removeProduct(item.productId)}>
                                                                                <TrashIcon size={16} />
                                                                            </Button>
                                                                        </td>
                                                                    </tr>
                                                                )
                                                            })}
                                                        </tbody>
                                                    </table>
                                                </div>

                                                {totalSelectedPages > 1 && (
                                                    <div className="mt-3">
                                                        <Pagination
                                                            currentPage={selectedPage}
                                                            totalPages={totalSelectedPages}
                                                            onPageChange={setSelectedPage}
                                                            inline
                                                        />
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>

                                    {/* Preset */}
                                    <div>
                                        <Combobox
                                            label="Modelo da etiqueta"
                                            options={presetOptions}
                                            value={presetId}
                                            onChange={setPresetId}
                                            placeholder="Selecione um modelo..."
                                        />
                                    </div>

                                    {/* Custom preset inputs */}
                                    {presetId === "custom" && (
                                        <div className="p-3 border border-brand-border dark:border-dark-border rounded-lg space-y-3">
                                            <Combobox
                                                label="Papel"
                                                options={[
                                                    { label: PAPER_SIZES.a4.label, value: "a4" },
                                                    { label: PAPER_SIZES.letter.label, value: "letter" },
                                                ]}
                                                value={customPreset.paperSize}
                                                onChange={(v) => setCustomPreset((prev) => ({ ...prev, paperSize: v as PaperSize }))}
                                                placeholder="Selecione o papel..."
                                            />
                                            <div className="grid grid-cols-2 gap-2">
                                                {[
                                                    { key: "labelWidth", label: "Largura (mm)", min: 10, max: 220 },
                                                    { key: "labelHeight", label: "Altura (mm)", min: 10, max: 290 },
                                                    { key: "cols", label: "Colunas", min: 1, max: 10 },
                                                    { key: "rows", label: "Linhas", min: 1, max: 20 },
                                                    { key: "marginTop", label: "Margem topo (mm)", min: 0, max: 50 },
                                                    { key: "marginRight", label: "Margem dir. (mm)", min: 0, max: 50 },
                                                    { key: "marginBottom", label: "Margem base (mm)", min: 0, max: 50 },
                                                    { key: "marginLeft", label: "Margem esq. (mm)", min: 0, max: 50 },
                                                    { key: "spacingX", label: "Espaço horiz. (mm)", min: 0, max: 20 },
                                                    { key: "spacingY", label: "Espaço vert. (mm)", min: 0, max: 20 },
                                                ].map((field) => (
                                                    <div key={field.key}>
                                                        <label className="text-xs text-brand-inactive-text">{field.label}</label>
                                                        <input
                                                            type="number"
                                                            min={field.min}
                                                            max={field.max}
                                                            step="0.1"
                                                            value={(customPreset as any)[field.key]}
                                                            onChange={(e) => setCustomPreset((prev) => ({ ...prev, [field.key]: Number(e.target.value) }))}
                                                            className="w-full rounded-lg border border-brand-border dark:border-dark-border bg-transparent px-2 py-1 text-sm"
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Content config */}
                                    <div>
                                        <p className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-2">Conteúdo da etiqueta</p>
                                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                                            <Checkbox name="showName" checked={contentConfig.showName} onChange={(c) => setContentConfig((prev) => ({ ...prev, showName: c }))} label="Nome do produto" />
                                            <Checkbox name="showPrice" checked={contentConfig.showPrice} onChange={(c) => setContentConfig((prev) => ({ ...prev, showPrice: c }))} label="Preço" />
                                            <Checkbox name="showPromotionalPrice" checked={contentConfig.showPromotionalPrice} onChange={(c) => setContentConfig((prev) => ({ ...prev, showPromotionalPrice: c }))} label="Preço promocional" />
                                            <Checkbox name="showInstallment" checked={contentConfig.showInstallment} onChange={(c) => setContentConfig((prev) => ({ ...prev, showInstallment: c }))} label="Parcelamento" />
                                            <Checkbox name="showInternalCode" checked={contentConfig.showInternalCode} onChange={(c) => setContentConfig((prev) => ({ ...prev, showInternalCode: c }))} label="Código interno" />
                                            <Checkbox name="showBarcode" checked={contentConfig.showBarcode} onChange={(c) => setContentConfig((prev) => ({ ...prev, showBarcode: c }))} label="Código de barras" />
                                        </div>
                                        {contentConfig.showInstallment && installmentDisplay && (
                                            <div className="mt-2 p-2 rounded-lg bg-brand-gray dark:bg-dark-border/20 border border-brand-border dark:border-dark-border">
                                                <p className="text-xs font-medium text-brand-dark dark:text-dark-heading">
                                                    Parcelamento padrao: {installmentDisplay.text}
                                                </p>
                                                <p className="text-xs text-brand-inactive-text mt-0.5">
                                                    Baseado no metodo de pagamento com mais parcelas
                                                </p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Desktop actions */}
                                    <div className="hidden lg:flex gap-3 pt-2">
                                        <Button className="flex-1 h-12" onClick={handlePrint} disabled={selected.length === 0} leftIcon={<PrinterIcon size={18} />}>
                                            Imprimir
                                        </Button>
                                        <Button variant="outline" className="flex-1 h-12" onClick={handleDownloadPdf} disabled={selected.length === 0 || isDownloadingPdf} leftIcon={<DownloadIcon size={18} />}>
                                            {isDownloadingPdf ? "Gerando PDF..." : "Salvar PDF"}
                                        </Button>
                                    </div>
                                </div>

                                {/* Mobile footer */}
                                <div className="lg:hidden shrink-0 p-4 border-t border-brand-border dark:border-dark-border flex gap-3">
                                    <Button className="flex-1 h-12" onClick={handlePrint} disabled={selected.length === 0} leftIcon={<PrinterIcon size={18} />}>
                                        Imprimir
                                    </Button>
                                    <Button variant="outline" className="flex-1 h-12" onClick={handleDownloadPdf} disabled={selected.length === 0 || isDownloadingPdf} leftIcon={<DownloadIcon size={18} />}>
                                        {isDownloadingPdf ? "Gerando..." : "PDF"}
                                    </Button>
                                </div>
                            </div>

                            {/* Right - preview */}
                            <div
                                className={`w-full lg:w-1/2 bg-brand-gray dark:bg-dark-border/20 flex flex-col min-h-0 overflow-hidden ${activeTab === "Visualização" ? "flex flex-1" : "hidden lg:flex"}`}
                            >
                                <div className="flex-1 overflow-auto custom-scrollbar p-4 md:p-6">
                                    {selected.length === 0 ? (
                                        <div className="h-full flex items-center justify-center text-brand-inactive-text text-sm">
                                            Selecione produtos para visualizar
                                        </div>
                                    ) : (
                                        <div className="flex justify-center">
                                            <div className="bg-white shadow-md rounded-sm overflow-hidden">
                                                <LabelSheet
                                                    key={activeTab}
                                                    products={labelProducts}
                                                    preset={preset}
                                                    contentConfig={contentConfig}
                                                    maxInstallments={maxInstallments}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </Tabs>
                    </div>
                </div>
            </Portal>

            <SelectProductSheet
                isOpen={showProductSheet}
                onClose={() => setShowProductSheet(false)}
                products={allProducts}
                existingIds={existingIds}
                onConfirm={handleProductConfirm}
            />

            {showVariantSheet && (
                <SelectVariantSheet
                    isOpen={!!showVariantSheet}
                    onClose={() => setShowVariantSheet(null)}
                    product={allProducts.find((p) => p.id === showVariantSheet)!}
                    selectedVariantId={selected.find((s) => s.productId === showVariantSheet)?.selectedVariantId}
                    onConfirm={(variantId) => {
                        handleVariantConfirm(showVariantSheet, variantId)
                        setShowVariantSheet(null)
                    }}
                />
            )}
        </>
    )
}
