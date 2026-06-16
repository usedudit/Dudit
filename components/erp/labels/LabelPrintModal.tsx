"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Portal from "@/components/Portal"
import { Button, Tabs, TabsContent, TabsList, TabsTrigger, Combobox, Checkbox } from "@/components/reusable"
import { XIcon, PrinterIcon, DownloadIcon, SearchIcon } from "@/lib/icons"
import { useMediaQuery } from "@/components/erp/hooks"
import { type LabelPreset, type LabelContentConfig, DEFAULT_CONTENT_CONFIG, LABEL_PRESETS, buildCustomPreset } from "@/lib/labels/presets"
import { LabelSheet, type LabelProduct } from "./LabelSheet"
import { formatCurrency } from "@/lib/utils"
import Pagination from "@/components/reusable/Pagination"

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

const SELECTED_PAGE_SIZE = 6

export function LabelPrintModal({ isOpen, onClose, allProducts }: LabelPrintModalProps) {
  const isMobile = useMediaQuery("(max-width: 1023px)")

  const [isVisible, setIsVisible] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const [activeTab, setActiveTab] = useState("Opções")
  const [presetId, setPresetId] = useState("pimaco-a4355")
  const [contentConfig, setContentConfig] = useState<LabelContentConfig>(DEFAULT_CONTENT_CONFIG)
  const [selected, setSelected] = useState<SelectedItem[]>([])
  const [showProductPicker, setShowProductPicker] = useState(false)
  const [pickerSearch, setPickerSearch] = useState("")
  const [pickerSelected, setPickerSelected] = useState<Set<string>>(new Set())
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

  const filteredPickerProducts = useMemo(
    () =>
      allProducts.filter(
        (p) =>
          p.name.toLowerCase().includes(pickerSearch.toLowerCase()) ||
          p.sku?.toLowerCase().includes(pickerSearch.toLowerCase()) ||
          p.gtin?.toLowerCase().includes(pickerSearch.toLowerCase()),
      ),
    [allProducts, pickerSearch],
  )

  const togglePickerProduct = (id: string) => {
    setPickerSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const confirmPickerSelection = () => {
    setSelected((prev) => {
      const existingIds = new Set(prev.map((s) => s.productId))
      const newItems: SelectedItem[] = []
      pickerSelected.forEach((id) => {
        if (!existingIds.has(id)) {
          const product = allProducts.find((p) => p.id === id)
          if (product) newItems.push({ productId: id, quantity: 1, product })
        }
      })
      return [...prev, ...newItems]
    })
    setShowProductPicker(false)
    setPickerSearch("")
    setPickerSelected(new Set())
  }

  const removeProduct = (productId: string) => {
    setSelected((prev) => prev.filter((s) => s.productId !== productId))
    setSelectedPage(1)
  }

  const updateQty = (productId: string, qty: number) => {
    setSelected((prev) =>
      prev.map((s) => (s.productId === productId ? { ...s, quantity: Math.max(1, qty) } : s)),
    )
  }

  const totalSelectedPages = Math.max(1, Math.ceil(selected.length / SELECTED_PAGE_SIZE))
  const paginatedSelected = useMemo(
    () => selected.slice((selectedPage - 1) * SELECTED_PAGE_SIZE, selectedPage * SELECTED_PAGE_SIZE),
    [selected, selectedPage],
  )

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
                {/* Selected products */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                      Produtos selecionados {selected.length > 0 && `(${selected.length})`}
                    </p>
                    <Button variant="outline" onClick={() => setShowProductPicker(true)}>
                      + Adicionar
                    </Button>
                  </div>

                  {selected.length === 0 ? (
                    <div className="border border-dashed border-brand-border rounded-lg p-6 text-center">
                      <p className="text-sm text-brand-inactive-text mb-3">Nenhum produto selecionado</p>
                      <Button onClick={() => setShowProductPicker(true)}>Selecionar Produtos</Button>
                    </div>
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-separate border-spacing-0">
                          <thead>
                            <tr className="text-xs text-brand-inactive-text">
                              <th className="py-2 pr-2 font-medium">Produto</th>
                              <th className="py-2 px-2 font-medium w-24">Preço</th>
                              <th className="py-2 px-2 font-medium w-24">Qtd</th>
                              <th className="py-2 pl-2 font-medium w-20">Ação</th>
                            </tr>
                          </thead>
                          <tbody>
                            {paginatedSelected.map((item) => (
                              <tr key={item.productId} className="border-t border-brand-border/50">
                                <td className="py-2 pr-2">
                                  <p className="text-sm font-medium text-brand-dark dark:text-dark-heading truncate max-w-[180px]">
                                    {item.product.name}
                                  </p>
                                  <p className="text-xs text-brand-inactive-text">
                                    SKU: {item.product.sku || "-"}
                                  </p>
                                </td>
                                <td className="py-2 px-2 text-sm font-semibold text-brand-dark dark:text-dark-heading whitespace-nowrap">
                                  {formatCurrency(item.product.price)}
                                </td>
                                <td className="py-2 px-2">
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => updateQty(item.productId, item.quantity - 1)}
                                      className="w-7 h-7 flex items-center justify-center rounded border border-brand-border text-sm font-medium hover:bg-brand-gray"
                                    >−</button>
                                    <input
                                      type="number"
                                      min={1}
                                      max={999}
                                      value={item.quantity}
                                      onChange={(e) => updateQty(item.productId, Number(e.target.value) || 1)}
                                      className="w-12 text-center h-7 rounded border border-brand-border text-xs"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => updateQty(item.productId, item.quantity + 1)}
                                      className="w-7 h-7 flex items-center justify-center rounded border border-brand-border text-sm font-medium hover:bg-brand-gray"
                                    >+</button>
                                  </div>
                                </td>
                                <td className="py-2 pl-2">
                                  <Button variant="outlinered" onClick={() => removeProduct(item.productId)}>
                                    Remover
                                  </Button>
                                </td>
                              </tr>
                            ))}
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
                    <Checkbox name="showName" checked={contentConfig.showName} onChange={(c) => setContentConfig((prev) => ({ ...prev, showName: c }))} label="Nome do produto" />
                    <Checkbox name="showPrice" checked={contentConfig.showPrice} onChange={(c) => setContentConfig((prev) => ({ ...prev, showPrice: c }))} label="Preço" />
                    <Checkbox name="showPromotionalPrice" checked={contentConfig.showPromotionalPrice} onChange={(c) => setContentConfig((prev) => ({ ...prev, showPromotionalPrice: c }))} label="Preço promocional" />
                    <Checkbox name="showInstallment" checked={contentConfig.showInstallment} onChange={(c) => setContentConfig((prev) => ({ ...prev, showInstallment: c }))} label="Parcelamento" />
                    <Checkbox name="showSku" checked={contentConfig.showSku} onChange={(c) => setContentConfig((prev) => ({ ...prev, showSku: c }))} label="SKU" />
                    <Checkbox name="showInternalCode" checked={contentConfig.showInternalCode} onChange={(c) => setContentConfig((prev) => ({ ...prev, showInternalCode: c }))} label="Código interno" />
                    <Checkbox name="showBarcode" checked={contentConfig.showBarcode} onChange={(c) => setContentConfig((prev) => ({ ...prev, showBarcode: c }))} label="Código de barras" />
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
              <div className="flex-1 overflow-auto custom-scrollbar p-4 md:p-6 flex flex-col items-center">
                {selected.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center text-brand-inactive-text text-sm">
                    Selecione produtos para visualizar
                  </div>
                ) : (
                  <div
                    className="shrink-0 bg-white shadow-md rounded-sm overflow-hidden"
                    style={{
                      transform: "scale(0.6)",
                      transformOrigin: "top center",
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
            </div>
          </Tabs>

          {/* Product Picker */}
          {showProductPicker && (
            <Portal>
              <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/40">
                <div className="bg-white dark:bg-dark-background rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col mx-4">
                  <div className="flex items-center justify-between px-6 py-4 border-b border-brand-border dark:border-dark-border shrink-0">
                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Selecionar Produtos</h3>
                    <Button variant="filled" onClick={() => { setShowProductPicker(false); setPickerSearch(""); setPickerSelected(new Set()) }} className="w-8 h-8 p-0">
                      <XIcon className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="px-6 py-3 shrink-0">
                    <div className="relative">
                      <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-inactive-text" />
                      <input
                        type="text"
                        placeholder="Buscar por nome, SKU ou GTIN..."
                        value={pickerSearch}
                        onChange={(e) => setPickerSearch(e.target.value)}
                        className="w-full h-10 pl-9 pr-3 rounded-lg border border-brand-border dark:border-dark-border bg-brand-gray dark:bg-dark-border/30 text-sm text-brand-dark dark:text-dark-heading placeholder:text-brand-inactive-text focus:outline-none focus:border-brand-dark"
                      />
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar px-6 pb-3">
                    {filteredPickerProducts.length === 0 ? (
                      <p className="text-sm text-center py-8 text-brand-inactive-text">Nenhum produto encontrado</p>
                    ) : (
                      <div className="space-y-1">
                        {filteredPickerProducts.map((p) => (
                          <div
                            key={p.id}
                            className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-brand-gray dark:hover:bg-dark-border/30 cursor-pointer"
                            onClick={() => togglePickerProduct(p.id)}
                          >
                            <Checkbox name={`picker-${p.id}`} checked={pickerSelected.has(p.id)} onChange={() => togglePickerProduct(p.id)} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-brand-dark dark:text-dark-heading truncate">{p.name}</p>
                              <p className="text-xs text-brand-inactive-text">SKU: {p.sku || "-"}</p>
                            </div>
                            <p className="text-sm font-semibold text-brand-dark dark:text-dark-heading whitespace-nowrap">
                              {formatCurrency(p.price)}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end gap-3 px-6 py-4 border-t border-brand-border dark:border-dark-border shrink-0">
                    <Button variant="outline" onClick={() => { setShowProductPicker(false); setPickerSearch(""); setPickerSelected(new Set()) }}>
                      Cancelar
                    </Button>
                    <Button onClick={confirmPickerSelection} disabled={pickerSelected.size === 0}>
                      Adicionar ({pickerSelected.size})
                    </Button>
                  </div>
                </div>
              </div>
            </Portal>
          )}
        </div>
      </div>
    </Portal>
  )
}
