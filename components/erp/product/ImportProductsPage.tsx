"use client"

import React, { useState, useMemo, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Button, Checkbox, Spinner, SelectionBanner, Pagination } from "@/components/reusable"
import { ChevronLeftIcon, UploadIcon, CheckCircleIcon, ChevronDownIcon } from "@/lib/icons"
import { useDropzone } from "react-dropzone"
import { useNotification } from "@/hooks/use-notification"
import { useStore } from "@/lib/store-context"
import type { Product } from "@/lib/types/product"
import { uploadPlanilhaAction, confirmImportAction, applyMappingAction } from "@/app/actions/erp/spreadsheet-import"
import type { ColumnMapping } from "@/lib/erp/import/types"
import ProductListItem from "./ProductListRow"
import ProductGridCard from "./ProductGridCard"
import ProductPageControls from "./ProductPageControls"

type ColumnId = "name" | "category" | "price" | "stock" | "status" | "actions" | "gtin" | "unit" | "ncm" | "brand" | "visibility"

interface ColumnDef {
  id: ColumnId
  label: string
  align?: "left" | "center" | "right"
  width: string
  minWidth?: string
}

const FIXED_COLUMNS: ColumnDef[] = [
  { id: "name", label: "Produto", align: "left", width: "300px" },
  { id: "category", label: "Categoria", align: "left", width: "130px", minWidth: "120px" },
  { id: "brand", label: "Marca", align: "left", width: "110px", minWidth: "100px" },
  { id: "stock", label: "Estoque", align: "left", width: "160px", minWidth: "140px" },
  { id: "price", label: "Preço", align: "left", width: "110px", minWidth: "100px" },
  { id: "visibility", label: "Visibilidade", align: "center", width: "90px", minWidth: "90px" },
  { id: "status", label: "Status", align: "center", width: "90px", minWidth: "90px" },
  { id: "actions", label: "Ações", align: "center", width: "70px", minWidth: "70px" },
]

const ITEMS_PER_PAGE = 25

interface FieldOption {
  name: string
  label: string
  required?: boolean
}

interface ImportProductsPageProps {
  partnerId: string
}

const CONFIDENCE_LABEL: Record<string, { label: string; color: string }> = {
  "1.0": { label: "Exato", color: "text-green-600 bg-green-50 dark:bg-green-900/20" },
  "0.9": { label: "Exato", color: "text-green-600 bg-green-50 dark:bg-green-900/20" },
  "0.85": { label: "Alto", color: "text-blue-600 bg-blue-50 dark:bg-blue-900/20" },
  "0.8": { label: "Alto", color: "text-blue-600 bg-blue-50 dark:bg-blue-900/20" },
  "0.7": { label: "Médio", color: "text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20" },
}

function getConfidenceDisplay(confidence: number) {
  const key = confidence.toFixed(1)
  return CONFIDENCE_LABEL[key] || { label: "Baixo", color: "text-red-600 bg-red-50 dark:bg-red-900/20" }
}

export function ImportProductsPage({ partnerId }: ImportProductsPageProps) {
  const router = useRouter()
  const { selectedStore } = useStore()
  const storeId = selectedStore?.id || ""
  const { error: notifyError, success: notifySuccess } = useNotification()

  const [step, setStep] = useState<"upload" | "mapping" | "preview">("upload")
  const [uploading, setUploading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [parsedProducts, setParsedProducts] = useState<any[]>([])
  const [totalRows, setTotalRows] = useState(0)
  const [mapping, setMapping] = useState<ColumnMapping[]>([])
  const [fileName, setFileName] = useState("")
  const [availableFields, setAvailableFields] = useState<FieldOption[]>([])
  const [headers, setHeaders] = useState<string[]>([])

  const [page, setPage] = useState(1)
  const [viewMode, setViewMode] = useState<"list" | "grid">("list")
  const [search, setSearch] = useState("")
  const [activeTab, setActiveTab] = useState<"all" | "normal" | "low" | "out_of_stock">("all")
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [importDone, setImportDone] = useState(false)
  const [importCount, setImportCount] = useState(0)

  const onDrop = useCallback(async (accepted: File[]) => {
    const file = accepted[0]
    if (!file) return
    setUploading(true)

    const formData = new FormData()
    formData.append("file", file)
    formData.append("partnerId", partnerId)
    formData.append("storeId", storeId)

    const result = await uploadPlanilhaAction(formData)

    if (!result.success) {
      notifyError(result.error || "Erro ao processar arquivo")
      setUploading(false)
      return
    }

    setSessionId(result.sessionId!)
    setTotalRows(result.totalRows!)
    setFileName(result.fileName!)
    setHeaders(result.headers!)
    setMapping(structuredClone(result.suggestedMapping!))
    setAvailableFields(result.availableFields || [])
    setParsedProducts(result.previewProducts || [])
    setSelection(new Set())
    setPage(1)
    setSearch("")
    setUploading(false)
    setStep("mapping")
  }, [partnerId, storeId, notifyError])

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.ms-excel": [".xls"],
      "text/csv": [".csv"],
      "text/plain": [".csv"],
    },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
    noClick: true,
    disabled: uploading || importing,
  })

  const updateMapping = useCallback((headerIndex: number, newField: string | null) => {
    setMapping((prev) =>
      prev.map((m) =>
        m.headerIndex === headerIndex
          ? { ...m, field: newField, fieldLabel: availableFields.find((f) => f.name === newField)?.label || newField || undefined, isCustom: false, confidence: newField ? 1.0 : 0 }
          : m,
      ),
    )
  }, [availableFields])

  const handleMappingConfirm = useCallback(async () => {
    if (!sessionId) return
    setUploading(true)
    const result = await applyMappingAction(sessionId, partnerId, mapping)
    if (!result.success) {
      notifyError(result.error || "Erro ao aplicar mapeamento")
      setUploading(false)
      return
    }
    setParsedProducts(result.previewProducts || [])
    setPage(1)
    setSearch("")
    setSelection(new Set())
    setUploading(false)
    setStep("preview")
  }, [sessionId, partnerId, mapping, notifyError])

  const handleImport = useCallback(async () => {
    if (!sessionId) return
    setImporting(true)
    const result = await confirmImportAction(sessionId, partnerId, mapping, {
      skipDuplicates: true,
      skipErrors: true,
    })
    if (!result.success) {
      notifyError(result.error || "Erro ao importar")
      setImporting(false)
      return
    }
    setImportCount(result.result.successRows)
    setImportDone(true)
    setImporting(false)
  }, [sessionId, partnerId, mapping, notifyError])

  const filteredProducts = useMemo(() => {
    let items = parsedProducts
    if (search) {
      const q = search.toLowerCase()
      items = items.filter((p: any) => p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q))
    }
    return items
  }, [parsedProducts, search])

  const paginated = useMemo(() => {
    const start = (page - 1) * ITEMS_PER_PAGE
    return filteredProducts.slice(start, start + ITEMS_PER_PAGE)
  }, [filteredProducts, page])

  const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE)

  const mappedCount = mapping.filter((m) => m.field).length

  if (importDone) {
    return (
      <div className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300">
        <div className="mx-auto w-full pt-4 flex flex-col h-full overflow-hidden relative">
          <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
            <CheckCircleIcon className="w-16 h-16 text-green-500 mb-4" />
            <h2 className="text-2xl font-bold text-brand-dark dark:text-dark-heading mb-2">Importação concluída!</h2>
            <p className="text-brand-inactive-text dark:text-dark-body mb-6">
              {importCount} de {totalRows} produtos importados com sucesso.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => router.push("/erp/products")}>
                Ver Produtos
              </Button>
              <Button onClick={() => { setStep("upload"); setImportDone(false); setParsedProducts([]); setMapping([]) }}>
                Nova Importação
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300">
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { height: 8px; width: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 9999px; border: 2px solid #fff; }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: #374151; border: 2px solid #1f2937; }
        .dark .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
      `}</style>

      <div className="mx-auto w-full pt-4 flex flex-col h-full overflow-hidden relative">
        <div className="hidden md:flex items-start justify-between mb-6 flex-none px-4 md:px-8">
          <div className="flex flex-col gap-2 pt-1">
            <div className="flex items-center gap-3">
              <button
                onClick={() => step === "upload" ? router.push("/erp/products") : setStep("upload")}
                className="p-1 -ml-1 rounded-lg hover:bg-brand-gray dark:hover:bg-dark-border transition-colors"
              >
                <ChevronLeftIcon className="w-5 h-5 text-brand-dark dark:text-dark-heading" />
              </button>
              <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                {step === "upload" ? "Importar Produtos" : step === "mapping" ? "Revisar Mapeamento" : fileName}
              </h1>
            </div>
            <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
              {step === "upload"
                ? "Faça upload de uma planilha .xlsx, .xls ou .csv com produtos."
                : step === "mapping"
                  ? `${totalRows} produto(s) encontrados — ${mappedCount} de ${headers.length} colunas mapeadas`
                  : `${totalRows} produto(s) encontrados`}
            </p>
          </div>

          {step === "mapping" && (
            <div className="flex items-center gap-3 pt-1">
              <Button variant="outline" onClick={() => { setStep("upload"); setParsedProducts([]); setMapping([]) }}>
                <UploadIcon className="w-[18px] h-[18px]" /> Nova planilha
              </Button>
              <Button onClick={handleMappingConfirm} disabled={uploading || mappedCount === 0}>
                {uploading ? <><Spinner /> Aplicando...</> : `Continuar (${mappedCount} campos)`}
              </Button>
            </div>
          )}

          {step === "preview" && (
            <div className="flex items-center gap-3 pt-1">
              <Button variant="outline" onClick={() => setStep("mapping")}>
                Voltar ao mapeamento
              </Button>
              <Button onClick={handleImport} disabled={importing || parsedProducts.length === 0}>
                {importing ? <><Spinner /> Importando...</> : `Importar ${parsedProducts.length} produto(s)`}
              </Button>
            </div>
          )}
        </div>

        {step === "upload" && (
          <div className="flex-1 px-4 md:px-8">
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-xl p-16 text-center transition-colors cursor-pointer ${
                isDragActive ? "border-brand-orange bg-brand-orange/5" : "border-gray-300 hover:border-gray-400"
              } ${uploading ? "opacity-50 pointer-events-none" : ""}`}
              onClick={open}
            >
              <input {...getInputProps()} />
              <UploadIcon className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              {isDragActive ? (
                <p className="text-lg text-gray-600 font-medium">Solte o arquivo aqui...</p>
              ) : (
                <>
                  <p className="text-lg text-gray-600 font-medium">Arraste o arquivo ou clique para selecionar</p>
                  <p className="text-sm text-gray-400 mt-2">.xlsx .xls .csv — até 10 MB e 2.000 linhas</p>
                </>
              )}
            </div>
            {uploading && (
              <div className="flex items-center gap-2 mt-4 text-gray-500">
                <Spinner /> <span>Lendo planilha...</span>
              </div>
            )}
          </div>
        )}

        {step === "mapping" && (
          <div className="flex-1 overflow-auto px-4 md:px-8 pb-8">
            <div className="max-w-4xl mx-auto">
              <div className="overflow-hidden rounded-xl border border-brand-border dark:border-dark-border">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-brand-gray dark:bg-dark-border/50">
                      <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body">Coluna da Planilha</th>
                      <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body">Campo no Sistema</th>
                      <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body">Confiança</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mapping.map((col) => (
                      <tr key={col.headerIndex} className="border-t border-brand-border dark:border-dark-border hover:bg-brand-gray/50 dark:hover:bg-dark-border/20 transition-colors">
                        <td className="py-3 px-4 text-[13px] font-medium text-brand-dark dark:text-dark-heading">{col.header}</td>
                        <td className="py-3 px-4">
                          <select
                            value={col.field || ""}
                            onChange={(e) => updateMapping(col.headerIndex, e.target.value || null)}
                            className="w-full max-w-xs px-3 py-1.5 text-[13px] rounded-lg border border-brand-border dark:border-dark-border bg-white dark:bg-dark-background text-brand-dark dark:text-dark-heading focus:outline-none focus:ring-2 focus:ring-brand-orange/50"
                          >
                            <option value="">— Não importar —</option>
                            {availableFields.map((f) => (
                              <option key={f.name} value={f.name}>
                                {f.label}{f.required ? " *" : ""}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-3 px-4">
                          {col.field ? (
                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${getConfidenceDisplay(col.confidence).color}`}>
                              {getConfidenceDisplay(col.confidence).label}
                            </span>
                          ) : (
                            <span className="text-[11px] text-brand-inactive-text">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-none px-4 md:px-8">
              <ProductPageControls
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                search={search}
                onSearchChange={setSearch}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                onOpenFilter={() => {}}
                onOpenImport={() => {}}
                onOpenExport={() => {}}
                onAddProduct={() => {}}
                filters={{ categories: [], brands: [], units: [], stocks: [], status: [], priceRange: { min: "", max: "" } }}
                setFilters={() => {}}
                hasActiveFilters={false}
              />
            </div>

            {filteredProducts.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-brand-inactive-text dark:text-dark-body text-sm">
                Nenhum produto encontrado
              </div>
            ) : (
              <div className="flex-1 overflow-auto px-4 md:px-8">
                <SelectionBanner
                  selectedCount={selection.size}
                  totalCount={filteredProducts.length}
                  onSelectAll={() => setSelection(new Set(filteredProducts.map((p: any) => p.id)))}
                  onClearSelection={() => setSelection(new Set())}
                  itemName="produtos"
                  singularItemName="produto"
                />

                {viewMode === "grid" ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-4">
                    {paginated.map((product: any) => (
                      <ProductGridCard
                        key={product.id}
                        product={product}
                        selected={selection.has(product.id)}
                        onSelect={() => setSelection((prev) => {
                          const next = new Set(prev)
                          next.has(product.id) ? next.delete(product.id) : next.add(product.id)
                          return next
                        })}
                        onEdit={() => {}}
                        onDetails={() => {}}
                        onDelete={() => {}}
                        onDuplicate={() => {}}
                        onShare={() => {}}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="w-full overflow-hidden rounded-xl relative">
                    <div className="overflow-x-auto pb-4 custom-scrollbar">
                      <table className="w-full text-left border-separate border-spacing-0 min-w-[1000px]">
                        <thead>
                          <tr className="bg-brand-gray dark:bg-dark-border/50">
                            <th className="py-3 pl-6 pr-3 w-12 bg-brand-gray dark:bg-dark-border/50 rounded-l-lg">
                              <Checkbox
                                checked={selection.size === paginated.length && paginated.length > 0}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setSelection((prev) => {
                                      const next = new Set(prev)
                                      paginated.forEach((p: any) => next.add(p.id))
                                      return next
                                    })
                                  } else {
                                    setSelection((prev) => {
                                      const next = new Set(prev)
                                      paginated.forEach((p: any) => next.delete(p.id))
                                      return next
                                    })
                                  }
                                }}
                                className="bg-white dark:bg-dark-background"
                              />
                            </th>
                            {FIXED_COLUMNS.map((col) => (
                              <th
                                key={col.id}
                                className={`py-3 px-3 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 ${
                                  col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"
                                } ${col.id === "actions" ? "rounded-r-lg" : ""}`}
                                style={{ width: col.width, minWidth: col.minWidth }}
                              >
                                <span>{col.label}</span>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {paginated.map((product: any) => (
                            <ProductListItem
                              key={product.id}
                              product={product}
                              columns={FIXED_COLUMNS}
                              selected={selection.has(product.id)}
                              onSelect={(id) => setSelection((prev) => {
                                const next = new Set(prev)
                                next.has(id) ? next.delete(id) : next.add(id)
                                return next
                              })}
                              onEdit={() => {}}
                              onDetails={() => {}}
                              onDelete={() => {}}
                              onDuplicate={() => {}}
                              onShare={() => {}}
                              suppliers={[]}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="flex justify-center py-4">
                  <Pagination
                    currentPage={page}
                    totalPages={totalPages}
                    onPageChange={setPage}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
