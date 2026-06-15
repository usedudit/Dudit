"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Portal from "@/components/Portal"
import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/reusable"
import { XIcon, PrinterIcon, DownloadIcon } from "@/lib/icons"
import { useMediaQuery } from "@/components/erp/hooks"
import { type LabelPreset, type LabelContentConfig, DEFAULT_CONTENT_CONFIG, LABEL_PRESETS, buildCustomPreset } from "@/lib/labels/presets"
import { LabelSheet, type LabelProduct } from "./LabelSheet"

interface LabelPrintModalProps {
  isOpen: boolean
  onClose: () => void
  products: LabelProduct[]
}

export function LabelPrintModal({ isOpen, onClose, products }: LabelPrintModalProps) {
  const isMobile = useMediaQuery("(max-width: 1023px)")

  const [isVisible, setIsVisible] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const [activeTab, setActiveTab] = useState("Opções")
  const [presetId, setPresetId] = useState("pimaco-a4355")
  const [contentConfig, setContentConfig] = useState<LabelContentConfig>(DEFAULT_CONTENT_CONFIG)
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

  const totalLabels = products.reduce((sum, p) => sum + p.labelQuantity, 0)

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
      products: products.map((p) => ({ id: p.id, quantity: p.labelQuantity })),
    }
    return `/print/labels?data=${encodeURIComponent(JSON.stringify(data))}`
  }, [presetId, customPreset, contentConfig, products])

  const handlePrint = useCallback(() => {
    if (products.length === 0) return
    window.open(buildPrintUrl(), "_blank")
    onClose()
  }, [buildPrintUrl, products, onClose])

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
          className={`relative flex flex-col w-full h-full bg-white dark:bg-dark-background transition-opacity duration-200 ${isAnimating ? "opacity-100" : "opacity-0"
            }`}
        >
          {/* Header */}
          <div className="shrink-0 flex items-center justify-between px-4 md:px-6 py-4 border-b border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface">
            <h2 className="text-lg md:text-xl font-bold text-brand-dark dark:text-dark-heading">
              Imprimir etiquetas ({totalLabels})
            </h2>
            <Button
              variant="filled"
              onClick={onClose}
              className="w-10 h-10 p-0 flex items-center justify-center shrink-0"
            >
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

            {/* Left — options */}
            <div
              className={`w-full lg:w-1/2 flex flex-col border-r border-brand-border dark:border-dark-border overflow-hidden ${activeTab === "Visualização" ? "hidden lg:flex" : "flex"
                }`}
            >
              <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6 space-y-6">
                {/* Preset selector */}
                <div>
                  <p className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-3">
                    Modelo da etiqueta
                  </p>
                  <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto">
                    {LABEL_PRESETS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPresetId(p.id)}
                        className={`text-left px-3 py-2 rounded-lg border text-sm transition-colors ${presetId === p.id
                          ? "border-brand-dark dark:border-dark-heading bg-brand-dark dark:bg-dark-heading text-white"
                          : "border-brand-border dark:border-dark-border text-brand-dark dark:text-dark-heading hover:bg-brand-gray dark:hover:bg-dark-border/30"
                          }`}
                      >
                        <span className="font-medium">{p.name}</span>
                        <span className="block text-xs opacity-70">{p.description}</span>
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setPresetId("custom")}
                      className={`text-left px-3 py-2 rounded-lg border text-sm transition-colors ${presetId === "custom"
                        ? "border-brand-dark dark:border-dark-heading bg-brand-dark dark:bg-dark-heading text-white"
                        : "border-brand-border dark:border-dark-border text-brand-dark dark:text-dark-heading hover:bg-brand-gray dark:hover:bg-dark-border/30"
                        }`}
                    >
                      <span className="font-medium">Customizado</span>
                      <span className="block text-xs opacity-70">Definir medidas manualmente</span>
                    </button>
                  </div>
                </div>

                {/* Custom preset inputs */}
                {presetId === "custom" && (
                  <div className="grid grid-cols-2 gap-3 p-3 border border-brand-border dark:border-dark-border rounded-lg">
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
                          onChange={(e) =>
                            setCustomPreset((prev) => ({ ...prev, [field.key]: Number(e.target.value) }))
                          }
                          className="w-full rounded-lg border border-brand-border dark:border-dark-border bg-transparent px-2 py-1 text-sm"
                        />
                      </div>
                    ))}
                  </div>
                )}

                {/* Content config */}
                <div>
                  <p className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-3">
                    Conteúdo da etiqueta
                  </p>
                  <div className="space-y-2">
                    {[
                      { key: "showName" as const, label: "Nome do produto" },
                      { key: "showPrice" as const, label: "Preço" },
                      { key: "showPromotionalPrice" as const, label: "Preço promocional" },
                      { key: "showInstallment" as const, label: "Parcelamento" },
                      { key: "showSku" as const, label: "SKU" },
                      { key: "showInternalCode" as const, label: "Código interno" },
                      { key: "showBarcode" as const, label: "Código de barras" },
                    ].map((opt) => (
                      <label key={opt.key} className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={contentConfig[opt.key]}
                          onChange={() => toggleConfig(opt.key)}
                          className="w-4 h-4 rounded border-brand-border"
                        />
                        <span className="text-sm text-brand-dark dark:text-dark-heading">{opt.label}</span>
                      </label>
                    ))}
                  </div>

                  {contentConfig.showInstallment && (
                    <div className="mt-2">
                      <label className="text-xs text-brand-inactive-text">Texto de parcelamento</label>
                      <input
                        type="text"
                        value={contentConfig.installmentText}
                        onChange={(e) =>
                          setContentConfig((prev) => ({ ...prev, installmentText: e.target.value }))
                        }
                        className="w-full rounded-lg border border-brand-border dark:border-dark-border bg-transparent px-2 py-1 text-sm mt-1"
                        placeholder='Ex: "até 12x"'
                      />
                    </div>
                  )}
                </div>

                <div className="hidden lg:flex gap-3 pt-2">
                  <Button className="flex-1 h-12" onClick={handlePrint} leftIcon={<PrinterIcon size={18} />}>
                    Imprimir
                  </Button>
                  <Button variant="outline" className="flex-1 h-12" onClick={handleDownloadPdf} leftIcon={<DownloadIcon size={18} />}>
                    Salvar PDF
                  </Button>
                </div>
              </div>

              {/* Mobile footer actions */}
              <div className="lg:hidden shrink-0 p-4 border-t border-brand-border dark:border-dark-border flex gap-3">
                <Button className="flex-1 h-12" onClick={handlePrint} leftIcon={<PrinterIcon size={18} />}>
                  Imprimir
                </Button>
                <Button variant="outline" className="flex-1 h-12" onClick={handleDownloadPdf} leftIcon={<DownloadIcon size={18} />}>
                  PDF
                </Button>
              </div>
            </div>

            {/* Right — preview */}
            <div
              className={`w-full lg:w-1/2 bg-brand-gray dark:bg-dark-border/20 flex flex-col min-h-0 overflow-hidden ${activeTab === "Visualização" ? "flex flex-1" : "hidden lg:flex"
                }`}
            >
              <TabsContent
                value="Visualização"
                className="m-0 p-0 h-full flex flex-col flex-1 min-h-0 focus-visible:outline-none"
                forceMount
              >
                <div className="flex-1 overflow-auto custom-scrollbar p-4 md:p-6 flex flex-col items-center">
                  <div className="shrink-0 bg-white shadow-md rounded-sm overflow-hidden" style={{ transform: "scale(0.45)", transformOrigin: "top center" }}>
                    <LabelSheet
                      products={products}
                      preset={preset}
                      contentConfig={contentConfig}
                    />
                  </div>
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
    </Portal>
  )
}
