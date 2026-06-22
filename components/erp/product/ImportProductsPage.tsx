"use client"

import React, { useState, useMemo, useCallback, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button, Checkbox, Spinner, SelectionBanner, Pagination, IconPlaceholder, Badge, FormDropdown } from "@/components/reusable"
import { ChevronLeftIcon, UploadIcon, CheckCircleIcon, ChevronDownIcon, FileTextIcon } from "@/lib/icons"
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

function MappingRow({
  col,
  availableFields,
  onMappingChange
}: {
  col: any
  availableFields: FieldOption[]
  onMappingChange: (headerIndex: number, newField: string | null) => void
}) {
  const confidenceKey = col.confidence.toFixed(2)
  const confidenceVal = parseFloat(confidenceKey)
  
  let badgeVariant: "green" | "blue" | "orange" | "red" | "gray" = "gray"
  let badgeLabel = "Baixo"

  if (confidenceVal >= 0.9) {
    badgeVariant = "green"
    badgeLabel = "Exato"
  } else if (confidenceVal >= 0.8) {
    badgeVariant = "blue"
    badgeLabel = "Alto"
  } else if (confidenceVal >= 0.6) {
    badgeVariant = "orange"
    badgeLabel = "Médio"
  } else if (col.field) {
    badgeVariant = "red"
    badgeLabel = "Baixo"
  }

  return (
    <tr className="hover:bg-brand-gray/30 dark:hover:bg-dark-border/10 transition-colors">
      <td className="py-4 px-4 align-middle">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
            <span className="text-[12px] font-bold text-brand-dark dark:text-dark-heading">
              {col.headerIndex + 1}
            </span>
          </div>
          <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">
            {col.header}
          </span>
        </div>
      </td>
      <td className="py-4 px-4 align-middle">
        <div className="w-full max-w-xs">
          <FormDropdown
            value={col.field || ""}
            setValue={(newVal) => onMappingChange(col.headerIndex, newVal || null)}
            options={[
              { value: "", label: "— Não importar —" },
              ...availableFields.map((f) => ({
                value: f.name,
                label: `${f.label}${f.required ? " *" : ""}`,
              })),
            ]}
            placeholder="— Não importar —"
          />
        </div>
      </td>
      <td className="py-4 px-4 align-middle">
        {col.field ? (
          <Badge variant={badgeVariant}>{badgeLabel}</Badge>
        ) : (
          <span className="text-[11px] text-brand-inactive-text dark:text-dark-body italic">Ignorado</span>
        )}
      </td>
    </tr>
  )
}

function MappingMobileItem({
  col,
  availableFields,
  onMappingChange
}: {
  col: any
  availableFields: FieldOption[]
  onMappingChange: (headerIndex: number, newField: string | null) => void
}) {
  const confidenceKey = col.confidence.toFixed(2)
  const confidenceVal = parseFloat(confidenceKey)
  
  let badgeVariant: "green" | "blue" | "orange" | "red" | "gray" = "gray"
  let badgeLabel = "Baixo"

  if (confidenceVal >= 0.9) {
    badgeVariant = "green"
    badgeLabel = "Exato"
  } else if (confidenceVal >= 0.8) {
    badgeVariant = "blue"
    badgeLabel = "Alto"
  } else if (confidenceVal >= 0.6) {
    badgeVariant = "orange"
    badgeLabel = "Médio"
  } else if (col.field) {
    badgeVariant = "red"
    badgeLabel = "Baixo"
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
            <span className="text-[10px] font-bold text-brand-dark dark:text-dark-heading">
              {col.headerIndex + 1}
            </span>
          </div>
          <h4 className="text-[13px] font-bold text-brand-dark dark:text-dark-heading truncate">
            {col.header}
          </h4>
        </div>
        {col.field ? (
          <Badge variant={badgeVariant}>{badgeLabel}</Badge>
        ) : (
          <span className="text-[11px] text-brand-inactive-text dark:text-dark-body italic">Ignorado</span>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[10px] text-brand-inactive-text dark:text-dark-body uppercase font-bold tracking-wider">Campo no Sistema</span>
        <FormDropdown
          value={col.field || ""}
          setValue={(newVal) => onMappingChange(col.headerIndex, newVal || null)}
          options={[
            { value: "", label: "— Não importar —" },
            ...availableFields.map((f) => ({
              value: f.name,
              label: `${f.label}${f.required ? " *" : ""}`,
            })),
          ]}
          placeholder="— Não importar —"
        />
      </div>
    </div>
  )
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

  const [scrollState, setScrollState] = useState({ left: false, right: false })
  const tableContainerRef = useRef<HTMLDivElement>(null)
  const [isScrolled, setIsScrolled] = useState(false)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const handleScroll = useCallback(() => {
    if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
  }, [])

  const checkScroll = useCallback(() => {
    if (!tableContainerRef.current) return
    const { scrollLeft, scrollWidth, clientWidth } = tableContainerRef.current
    setScrollState((prev) => {
      const nextLeft = scrollLeft > 0
      const nextRight = scrollLeft < scrollWidth - clientWidth - 2
      if (prev.left === nextLeft && prev.right === nextRight) return prev
      return { left: nextLeft, right: nextRight }
    })
  }, [])

  useEffect(() => {
    if (step === "preview" && viewMode === "list" && parsedProducts.length > 0) {
      const timer = setTimeout(checkScroll, 50)
      window.addEventListener("resize", checkScroll)
      return () => {
        clearTimeout(timer)
        window.removeEventListener("resize", checkScroll)
      }
    }
  }, [checkScroll, step, viewMode, parsedProducts])

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
    <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background transition-colors duration-300">
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { height: 8px; width: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 9999px; border: 2px solid #fff; }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: #374151; border: 2px solid #1f2937; }
        .dark .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
      `}</style>

      <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-20 md:pb-0">
        
        {/* Sticky Header */}
        <div className={`sticky top-0 z-30 w-full bg-white dark:bg-dark-surface border-b transition-all duration-300 ${isScrolled ? "py-2 shadow-sm" : "py-4 md:py-6"}`}>
          <div className="max-w-[1300px] mx-auto px-4 md:px-6 flex items-start justify-between">
            <div className="flex flex-col gap-1.5 min-w-0">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => step === "upload" ? router.push("/erp/products") : setStep("upload")}
                  className="p-1 -ml-1 rounded-lg hover:bg-brand-gray dark:hover:bg-dark-border transition-colors"
                >
                  <ChevronLeftIcon className="w-5 h-5 text-brand-dark dark:text-dark-heading" />
                </button>
                <h1 className="text-xl md:text-3xl font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none truncate">
                  {step === "upload" ? "Importar Produtos" : step === "mapping" ? "Revisar Mapeamento" : fileName}
                </h1>
              </div>
              <p className="text-brand-inactive-text dark:text-dark-body text-xs md:text-sm font-medium">
                {step === "upload"
                  ? "Faça upload de uma planilha .xlsx, .xls ou .csv com produtos."
                  : step === "mapping"
                    ? `${totalRows} produto(s) encontrados — ${mappedCount} de ${headers.length} colunas mapeadas`
                    : `${totalRows} produto(s) encontrados`}
              </p>
            </div>

            {/* Desktop Actions */}
            <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
              {step === "mapping" && (
                <>
                  <Button variant="outline" onClick={() => { setStep("upload"); setParsedProducts([]); setMapping([]) }}>
                    <UploadIcon className="w-[18px] h-[18px]" /> Nova planilha
                  </Button>
                  <Button onClick={handleMappingConfirm} disabled={uploading || mappedCount === 0}>
                    {uploading ? <><Spinner /> Aplicando...</> : `Continuar (${mappedCount} campos)`}
                  </Button>
                </>
              )}
              {step === "preview" && (
                <>
                  <Button variant="outline" onClick={() => setStep("mapping")}>
                    Voltar ao mapeamento
                  </Button>
                  <Button onClick={handleImport} disabled={importing || parsedProducts.length === 0}>
                    {importing ? <><Spinner /> Importando...</> : `Importar ${parsedProducts.length} produto(s)`}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="max-w-[1300px] mx-auto w-full px-4 md:px-6 py-6 min-h-[400px]">
          {step === "upload" && (
            <div className="max-w-[800px] mx-auto w-full pt-8">
              <div
                {...getRootProps()}
                className={`cursor-pointer transition-opacity ${uploading ? "opacity-60 pointer-events-none" : ""}`}
                onClick={open}
              >
                <input {...getInputProps()} />
                {uploading ? (
                  <IconPlaceholder
                    placeholderType="default"
                    icon={Spinner}
                    title="Lendo Planilha..."
                    subtitle="Processando os dados da sua planilha de produtos. Aguarde um instante."
                  />
                ) : (
                  <IconPlaceholder
                    placeholderType="default"
                    icon={UploadIcon}
                    title={isDragActive ? "Solte a planilha aqui..." : "Importar Planilha de Produtos"}
                    subtitle="Arraste o arquivo ou clique para selecionar. Suporta .xlsx, .xls ou .csv (até 10 MB e 2.000 linhas)."
                    itemButton={{
                      text: "Selecionar Planilha",
                      type: "button",
                      action: open,
                      variant: "default"
                    }}
                  />
                )}
              </div>
            </div>
          )}

          {step === "mapping" && (
            <div>
              {/* Desktop Table View */}
              <div className="hidden md:block overflow-hidden bg-white dark:bg-dark-surface">
                <table className="w-full text-left border-separate border-spacing-0">
                  <thead>
                    <tr className="bg-brand-gray dark:bg-dark-border/50">
                      <th className="py-3 px-4 text-[13px] font-bold text-brand-dark dark:text-dark-heading rounded-l-lg bg-brand-gray dark:bg-dark-border/50">Coluna da Planilha</th>
                      <th className="py-3 px-4 text-[13px] font-bold text-brand-dark dark:text-dark-heading bg-brand-gray dark:bg-dark-border/50">Campo no Sistema</th>
                      <th className="py-3 px-4 text-[13px] font-bold text-brand-dark dark:text-dark-heading rounded-r-lg bg-brand-gray dark:bg-dark-border/50">Confiança</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mapping.map((col) => (
                      <MappingRow
                        key={col.headerIndex}
                        col={col}
                        availableFields={availableFields}
                        onMappingChange={updateMapping}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card List View */}
              <div className="md:hidden bg-white dark:bg-dark-surface">
                {mapping.map((col) => (
                  <MappingMobileItem
                    key={col.headerIndex}
                    col={col}
                    availableFields={availableFields}
                    onMappingChange={updateMapping}
                  />
                ))}
              </div>
            </div>
          )}

          {step === "preview" && (
            <div className="flex flex-col overflow-hidden">
              <div className="flex-none mb-6">
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
                <div className="flex-1 flex items-center justify-center text-brand-inactive-text dark:text-dark-body text-sm py-12">
                  Nenhum produto encontrado
                </div>
              ) : (
                <div className="flex-1">
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
                      <div className={`absolute top-0 left-0 h-full w-12 bg-gradient-to-r from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.left ? "opacity-100" : "opacity-0"}`} />
                      <div className={`absolute top-0 right-0 h-full w-12 bg-gradient-to-l from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.right ? "opacity-100" : "opacity-0"}`} />

                      <div className="overflow-x-auto pb-4 custom-scrollbar" ref={tableContainerRef} onScroll={checkScroll}>
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

      {/* Mobile Sticky Footers */}
      {step === "mapping" && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 flex gap-3 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
          <Button
            variant="outline"
            className="flex-1 h-12"
            onClick={() => { setStep("upload"); setParsedProducts([]); setMapping([]) }}
          >
            <UploadIcon className="w-[18px] h-[18px]" /> Nova planilha
          </Button>
          <Button
            onClick={handleMappingConfirm}
            disabled={uploading || mappedCount === 0}
            className="flex-1 h-12"
          >
            {uploading ? <><Spinner /> Aplicando...</> : `Continuar (${mappedCount} campos)`}
          </Button>
        </div>
      )}

      {step === "preview" && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 flex gap-3 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
          <Button
            variant="outline"
            className="flex-1 h-12"
            onClick={() => setStep("mapping")}
          >
            Voltar
          </Button>
          <Button
            onClick={handleImport}
            disabled={importing || parsedProducts.length === 0}
            className="flex-1 h-12"
          >
            {importing ? <><Spinner /> Importando...</> : `Importar ${parsedProducts.length} prod.`}
          </Button>
        </div>
      )}
    </div>
  )
}
