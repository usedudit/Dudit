"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Portal from "@/components/Portal"
import { Button, Tabs, TabsContent, TabsList, TabsTrigger, Combobox, Input, Checkbox } from "@/components/reusable"
import { XIcon, PrinterIcon, DownloadIcon, SearchIcon } from "@/lib/icons"
import { useMediaQuery } from "@/components/erp/hooks"
import { type LabelPreset, type LabelContentConfig, DEFAULT_CONTENT_CONFIG, LABEL_PRESETS, buildCustomPreset } from "@/lib/labels/presets"
import { LabelSheet, type LabelProduct } from "./LabelSheet"
import { formatCurrency } from "@/lib/utils"

interface ProductBase {
  id: string
  name: string
  sku: string | null
  gtin: string | null
  price: number
  promotional_price: number | null
}

interface LabelPrintModalProps {
  isOpen: boolean
  onClose: () => void
  allProducts: ProductBase[]
}

interface SelectedItem {
  productId: string
  quantity: number
  product: ProductBase
}

const presetOptions = [
  ...LABEL_PRESETS.map((p) => ({
    label: `${p.name} — ${p.description}`,
    value: p.id,
  })),
  { label: "Customizado — Definir medidas manualmente", value: "custom" },
]

export function LabelPrintModal({ isOpen, onClose, allProducts }: LabelPrintModalProps) {
  const isMobile = useMediaQuery("(max-width: 1023px)")

  const [isVisible, setIsVisible] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const [activeTab, setActiveTab] = useState("Opções")
  const [presetId, setPresetId] = useState("pimaco-a4355")
  const [contentConfig, setContentConfig] = useState<LabelContentConfig>(DEFAULT_CONTENT_CONFIG)
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<SelectedItem[]>([])
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
  })

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

  const filteredProducts = useMemo(
    () =>
      allProducts.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.sku?.toLowerCase().includes(search.toLowerCase()) ||
          p.gtin?.toLowerCase().includes(search.toLowerCase()),
      ),
    [allProducts, search],
  )

  const toggleProduct = (product: ProductBase) => {
    setSelected((prev) => {
      const exists = prev.find((s) => s.productId === product.id)
      if (exists) {
        return prev.filter((s) => s.productId !== product.id)
      }
      return [...prev, { productId: product.id, quantity: 1, product }]
    })
  }

  const updateQty = (productId: string, qty: number) => {
    setSelected((prev) =>
      prev.map((s) => (s.productId === productId ? { ...s, quantity: Math.max(1, qty) } : s)),
    )
  }

  const labelProducts: LabelProduct[] = useMemo(
    () =>
      selected.map((s) => ({
        id: s.product.id,
        name: s.product.name,
        sku: s.product.sku,
        gtin: s.product.gtin,
        price: s.product.price,
        promotionalPrice: s.product.promotional_price,
        internalCode: s.product.sku,
        labelQuantity: s.quantity,
      })),
    [selected],
  )

  const preset = useMemo((): LabelPreset => {
    if (presetId === "custom") {
      return buildCustomPreset(customPreset)
    }
    return LABEL_PRESETS.find((p) => p.id === presetId) || LABEL_PRESETS[0]
  }, [presetId, customPreset])

  const buildPrintUrl = useCallback(() => {
    const data = {
      presetId,
      customPreset: presetId === "custom" ? customPreset : undefined,
      contentConfig,
      products: selected.map((s) => ({ id: s.productId, quantity: s.quantity })),
    }
    return `/print/labels?data=${encodeURIComponent(JSON.stringify(data))}`
  }, [presetId, customPreset, contentConfig, selected])

  const handlePrint = useCallback(() => {
    if (selected.length === 0) return
    window.open(buildPrintUrl(), "_blank")
    onClose()
  }, [buildPrintUrl, selected, onClose])

  const handleDownloadPdf = useCallback(() => {
    handlePrint()
  }, [handlePrint])

  const toggleConfig = (key: keyof LabelContentConfig) => {
    if (key === "installmentText") return
    setContentConfig((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  if (!isVisible) return null

  return (
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
                {/* Search + product list */}
                <div>
                  <p className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-2">
                    Produtos
                  </p>
                  <div className="relative mb-2">
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-inactive-text" />
                    <input
                      type="text"
                      placeholder="Buscar por nome, SKU ou GTIN..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full h-[40px] pl-9 pr-3 rounded-lg border border-brand-border dark:border-dark-border bg-brand-gray dark:bg-dark-border/30 text-sm text-brand-dark dark:text-dark-heading placeholder:text-brand-inactive-text focus:outline-none focus:border-brand-dark"
                    />
                  </div>
                  <div className="max-h-40 overflow-y-auto space-y-1 border border-brand-border dark:border-dark-border rounded-lg p-1">
                    {filteredProducts.length === 0 ? (
                      <p className="text-sm text-center py-3 text-brand-inactive-text">Nenhum produto</p>
                    ) : (
                      filteredProducts.map((p) => {
                        const sel = selected.find((s) => s.productId === p.id)
                        return (
                          <div
                            key={p.id}
                            className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-sm cursor-pointer hover:bg-brand-gray dark:hover:bg-dark-border/50 ${sel ? "bg-brand-green-secondary/10" : ""}`}
                            onClick={() => toggleProduct(p)}
                          >
                            <Checkbox
                              name={`sel-${p.id}`}
                              checked={!!sel}
                              onChange={() => toggleProduct(p)}
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate text-brand-dark dark:text-dark-heading">{p.name}</p>
                              <p className="text-xs text-brand-inactive-text">SKU: {p.sku || "-"} | {formatCurrency(p.price)}</p>
                            </div>
                            {sel && (
                              <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={() => updateQty(p.id, sel.quantity - 1)}
                                  className="w-6 h-6 flex items-center justify-center rounded border border-brand-border text-sm font-medium hover:bg-brand-gray"
                                >−</button>
                                <input
                                  type="number"
                                  min={1}
                                  max={999}
                                  value={sel.quantity}
                                  onChange={(e) => updateQty(p.id, Number(e.target.value) || 1)}
                                  className="w-12 text-center h-6 rounded border border-brand-border text-xs"
                                />
                                <button
                                  type="button"
                                  onClick={() => updateQty(p.id, sel.quantity + 1)}
                                  className="w-6 h-6 flex items-center justify-center rounded border border-brand-border text-sm font-medium hover:bg-brand-gray"
                                >+</button>
                              </div>
                            )}
                          </div>
                        )
                      })
                    )}
                  </div>
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
                  <div className="grid grid-cols-2 gap-2 p-3 border border-brand-border dark:border-dark-border rounded-lg">
                    {[
                      { key: "labelWidth", label: "Largura (mm)", min: 10, max: 200 },
                      { key: "labelHeight", label: "Altura (mm)", min: 10, max: 200 },
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
                )}

                {/* Content config */}
                <div>
                  <p className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-2">Conteúdo da etiqueta</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                    {[
                      { key: "showName" as const, label: "Nome do produto" },
                      { key: "showPrice" as const, label: "Preço" },
                      { key: "showPromotionalPrice" as const, label: "Preço promocional" },
                      { key: "showInstallment" as const, label: "Parcelamento" },
                      { key: "showSku" as const, label: "SKU" },
                      { key: "showInternalCode" as const, label: "Código interno" },
                      { key: "showBarcode" as const, label: "Código de barras" },
                    ].map((opt) => (
                      <label key={opt.key} className="flex items-center gap-2 cursor-pointer text-sm">
                        <input
                          type="checkbox"
                          checked={contentConfig[opt.key]}
                          onChange={() => toggleConfig(opt.key)}
                          className="w-4 h-4 rounded border-brand-border"
                        />
                        <span className="text-brand-dark dark:text-dark-heading">{opt.label}</span>
                      </label>
                    ))}
                  </div>
                  {contentConfig.showInstallment && (
                    <div className="mt-2">
                      <label className="text-xs text-brand-inactive-text">Texto de parcelamento</label>
                      <input
                        type="text"
                        value={contentConfig.installmentText}
                        onChange={(e) => setContentConfig((prev) => ({ ...prev, installmentText: e.target.value }))}
                        className="w-full rounded-lg border border-brand-border dark:border-dark-border bg-transparent px-2 py-1 text-sm mt-1"
                        placeholder='Ex: "até 12x"'
                      />
                    </div>
                  )}
                </div>

                {/* Desktop actions */}
                <div className="hidden lg:flex gap-3 pt-2">
                  <Button className="flex-1 h-12" onClick={handlePrint} disabled={selected.length === 0} leftIcon={<PrinterIcon size={18} />}>
                    Imprimir
                  </Button>
                  <Button variant="outline" className="flex-1 h-12" onClick={handleDownloadPdf} disabled={selected.length === 0} leftIcon={<DownloadIcon size={18} />}>
                    Salvar PDF
                  </Button>
                </div>
              </div>

              {/* Mobile footer */}
              <div className="lg:hidden shrink-0 p-4 border-t border-brand-border dark:border-dark-border flex gap-3">
                <Button className="flex-1 h-12" onClick={handlePrint} disabled={selected.length === 0} leftIcon={<PrinterIcon size={18} />}>
                  Imprimir
                </Button>
                <Button variant="outline" className="flex-1 h-12" onClick={handleDownloadPdf} disabled={selected.length === 0} leftIcon={<DownloadIcon size={18} />}>
                  PDF
                </Button>
              </div>
            </div>

            {/* Right — preview */}
            <div
              className={`w-full lg:w-1/2 bg-brand-gray dark:bg-dark-border/20 flex flex-col min-h-0 overflow-hidden ${activeTab === "Visualização" ? "flex flex-1" : "hidden lg:flex"}`}
            >
              <TabsContent
                value="Visualização"
                className="m-0 p-0 h-full flex flex-col flex-1 min-h-0 focus-visible:outline-none"
                forceMount
              >
                <div className="flex-1 overflow-auto custom-scrollbar p-4 md:p-6 flex flex-col items-center">
                  {selected.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center text-brand-inactive-text text-sm">
                      Selecione produtos para visualizar
                    </div>
                  ) : (
                    <div
                      className="shrink-0 bg-white shadow-md rounded-sm overflow-hidden"
                      style={{
                        transform: "scale(0.65)",
                        transformOrigin: "top center",
                        maxWidth: "100%",
                      }}
                    >
                      <LabelSheet
                        products={labelProducts}
                        preset={preset}
                        contentConfig={contentConfig}
                      />
                    </div>
                  )}
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
    </Portal>
  )
}
