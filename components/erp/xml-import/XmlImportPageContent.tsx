"use client"

import React, { useState, useMemo, useCallback, useRef, useEffect } from "react"
import { AnimatePresence } from "framer-motion"
import { Button, Checkbox, Input, IconPlaceholder, Badge, Spinner, SelectionBanner, ThreeDotsLoader, InfoCard, FormSection } from "@/components/reusable"
import { FadeIn } from "@/components/animations/FadeIn"
import DefaultModal from "@/components/reusable/DefaultModal"
import { Tabs, TabsList, TabsTrigger } from "@/components/reusable/Tabs"
import Pagination from "@/components/reusable/Pagination"
import { useNotification } from "@/hooks/use-notification"
import { useMediaQuery } from "@/components/erp/hooks"
import { useRouter } from "next/navigation"
import { useStore } from "@/lib/store-context"
import { uploadXMLAction, confirmImportAction, getImportPreviewAction, listImportsAction } from "@/app/actions/erp/xml-import"
import {
  UploadIcon, FileTextIcon, CheckCircleIcon, AlertTriangleIcon,
  SearchIcon, PlusIcon, FileIcon, ClockIcon, GridIcon, ListIcon, CheckIcon,
  PackageIcon, ArrowRightIcon, ChevronLeftIcon, InfoIcon
} from "@/lib/icons"

type TabType = "all" | "pending" | "completed" | "failed"

interface ImportItem {
  id: string
  access_key: string
  invoice_number: string
  invoice_series: string
  total_value: number
  supplier_name: string
  supplier_document: string
  status: string
  items_count: number
  imported_items: number
  skipped_items: number
  created_at: string
}

interface XmlImportPageContentProps {
  partnerId: string
  initialImports: ImportItem[]
}

const ITEMS_PER_PAGE = 10
const STATUS_META: Record<string, { label: string; variant: "green" | "orange" | "red" | "gray" }> = {
  completed: { label: "Importado", variant: "green" },
  preview: { label: "Revisar", variant: "orange" },
  pending: { label: "Pendente", variant: "gray" },
  failed: { label: "Erro", variant: "red" },
  reprocessing: { label: "Reprocessando", variant: "orange" },
}

const COLUMNS = [
  { id: "invoice" as const, label: "Nota Fiscal", align: "left" as const, width: "280px" },
  { id: "supplier" as const, label: "Fornecedor", align: "left" as const, width: "200px" },
  { id: "items" as const, label: "Itens", align: "center" as const, width: "100px" },
  { id: "status" as const, label: "Status", align: "center" as const, width: "130px" },
  { id: "date" as const, label: "Data", align: "right" as const, width: "150px" },
  { id: "actions" as const, label: "Ações", align: "center" as const, width: "80px" },
]

export function XmlImportPageContent({ partnerId, initialImports }: XmlImportPageContentProps) {
  const { selectedStore } = useStore()
  const storeId = selectedStore?.id || ""
  const { error: notifyError } = useNotification()
  const isTabletOrMobile = useMediaQuery("(max-width: 1023px)")
  const router = useRouter()

  const [activeTab, setActiveTab] = useState<TabType>("all")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [viewMode, setViewMode] = useState<"list" | "grid">("list")
  const [imports, setImports] = useState<ImportItem[]>(initialImports)
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const effectiveViewMode = isTabletOrMobile ? "grid" : viewMode

  const [showUploadModal, setShowUploadModal] = useState(false)
  const [viewingImportId, setViewingImportId] = useState<string | null>(null)
  const [pendingUploadId, setPendingUploadId] = useState<string | null>(null)

  const tableContainerRef = useRef<HTMLDivElement>(null)
  const [scrollState, setScrollState] = useState({ left: false, right: false })

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
    checkScroll()
    window.addEventListener("resize", checkScroll)
    return () => window.removeEventListener("resize", checkScroll)
  }, [checkScroll, effectiveViewMode, imports])

  if (pendingUploadId) {
    return (
      <ImportPreviewView
        importId={pendingUploadId}
        partnerId={partnerId}
        storeId={storeId}
        onBack={() => setPendingUploadId(null)}
        onComplete={() => {
          setPendingUploadId(null)
          listImportsAction(partnerId, 50).then((res) => {
            if (res.success && res.imports) setImports(res.imports as ImportItem[])
          })
          router.refresh()
        }}
      />
    )
  }

  if (viewingImportId) {
    return (
      <ImportPreviewView
        importId={viewingImportId}
        partnerId={partnerId}
        storeId={storeId}
        onBack={() => setViewingImportId(null)}
        onComplete={() => {
          setViewingImportId(null)
          listImportsAction(partnerId, 50).then((res) => {
            if (res.success && res.imports) setImports(res.imports as ImportItem[])
          })
          router.refresh()
        }}
      />
    )
  }

  const filtered = useMemo(() => {
    let result = imports.filter((imp) => {
      if (activeTab === "pending") return imp.status === "pending" || imp.status === "preview"
      if (activeTab === "completed") return imp.status === "completed"
      if (activeTab === "failed") return imp.status === "failed"
      return true
    })
    if (search) {
      const s = search.toLowerCase()
      result = result.filter(
        (imp) =>
          imp.supplier_name?.toLowerCase().includes(s) ||
          imp.invoice_number?.toLowerCase().includes(s) ||
          imp.access_key?.toLowerCase().includes(s)
      )
    }
    return result
  }, [imports, activeTab, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE))
  const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)
  const hasActiveFilters = activeTab !== "all" || search !== ""

  const handleTabChange = (tab: TabType) => { setActiveTab(tab); setPage(1) }

  const handleSelect = (id: string) => {
    setSelection((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleSelectAll = () => {
    if (selection.size === paginated.length) setSelection(new Set())
    else setSelection(new Set(paginated.map((i) => i.id)))
  }

  const handleClearFilters = () => { setSearch(""); setActiveTab("all") }

  const handleOpenDetail = (imp: ImportItem) => {
    setViewingImportId(imp.id)
  }

  return (
    <FadeIn className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300">
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { height: 8px; width: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 9999px; border: 2px solid #fff; }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: #374151; border: 2px solid #1f2937; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      <div className="mx-auto w-full pt-4 flex flex-col h-full overflow-hidden relative">
        <div className="hidden md:flex items-start justify-between mb-6 flex-none px-4 md:px-8">
          <div className="flex flex-col gap-2 pt-1">
            <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">Importar XML</h1>
            <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">Importe produtos de notas fiscais eletrônicas.</p>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={() => setShowUploadModal(true)}>
              <UploadIcon className="w-[18px] h-[18px]" strokeWidth={3} /> Importar XML
            </Button>
          </div>
        </div>

        <div className="mb-6 px-4 md:px-8">
          <Tabs value={activeTab} onValueChange={(val) => handleTabChange(val as TabType)}>
            <TabsList className="px-0">
              <TabsTrigger value="all" icon={PackageIcon}>Todas</TabsTrigger>
              <TabsTrigger value="pending" icon={ClockIcon}>Pendentes</TabsTrigger>
              <TabsTrigger value="completed" icon={CheckCircleIcon}>Importadas</TabsTrigger>
              <TabsTrigger value="failed" icon={AlertTriangleIcon}>Com Erro</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-4 flex-none px-4 md:px-8">
          <div className="md:hidden flex items-center gap-2 w-full">
            <div className="flex-1 min-w-0">
              <Input name="search" placeholder="Buscar..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                className="h-[42px] w-full" variant="full-rounded"
                prefix={<SearchIcon size={18} className="text-brand-inactive-text shrink-0" />} label=""
              />
            </div>
            <div className="flex-none flex items-center gap-2">
              <Button onClick={() => setShowUploadModal(true)} className="w-[42px] h-[42px] p-0 flex items-center justify-center" leftIcon={<PlusIcon size={18} />} />
            </div>
          </div>

          <div className="hidden md:flex items-center w-full gap-4">
            <div className="flex items-center gap-3 shrink-0">
              <div className="w-80">
                <Input name="search" placeholder="Buscar notas..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                  className="h-[42px]" variant="full-rounded"
                  prefix={<SearchIcon size={18} className="text-brand-inactive-text shrink-0" />} label=""
                />
              </div>
              {hasActiveFilters && <div className="h-8 w-px bg-brand-border dark:bg-dark-border mx-1" />}
            </div>
            <div className="flex-1 min-w-0 relative h-[42px] flex items-center" />
            <div className="flex items-center bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-full p-1 h-[42px] shrink-0">
              <button onClick={() => setViewMode("list")}
                className={`w-8 h-full flex items-center justify-center rounded-full transition-colors ${viewMode === "list" ? "bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading" : "text-gray-400 hover:text-gray-600 dark:text-dark-body"}`}>
                <ListIcon className="w-[18px] h-[18px]" />
              </button>
              <button onClick={() => setViewMode("grid")}
                className={`w-8 h-full flex items-center justify-center rounded-full transition-colors ${viewMode === "grid" ? "bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading" : "text-gray-400 hover:text-gray-600 dark:text-dark-body"}`}>
                <GridIcon className="w-[18px] h-[18px]" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar relative pb-20 md:pb-2 px-4 md:px-8">
          <AnimatePresence mode="wait">
            {paginated.length === 0 ? (
              <FadeIn key="empty" className="flex flex-col items-center justify-center h-[600px] text-center p-8 w-full">
                <IconPlaceholder
                  placeholderType="image"
                  imageSrc={hasActiveFilters ? "https://img.dudit.com.br/static/mascots/NaoEncontrado.png" : "https://img.dudit.com.br/static/mascots/MovimentacaoEstoque.png"}
                  imageAlt="Sem importações"
                  title={hasActiveFilters ? "Nenhuma importação encontrada" : "Sem importações"}
                  subtitle={hasActiveFilters ? "Tente ajustar seus filtros ou termos de busca." : "Suas notas importadas aparecerão aqui."}
                  itemButton={!hasActiveFilters ? { text: "Importar XML", action: () => setShowUploadModal(true) } : { text: "Limpar filtros", action: handleClearFilters, variant: "outline" }}
                />
              </FadeIn>
            ) : (
              <AnimatePresence mode="wait">
                <FadeIn key={activeTab + effectiveViewMode} className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300">
                  <SelectionBanner
                    selectedCount={selection.size} totalCount={filtered.length}
                    onSelectAll={() => setSelection(new Set(filtered.map((i) => i.id)))}
                    onClearSelection={() => setSelection(new Set())}
                    itemName="importações" singularItemName="importação"
                  />

                  {effectiveViewMode === "grid" ? (
                    <div className="grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-4">
                      {paginated.map((imp) => (
                        <ImportGridCard key={imp.id} item={imp} selected={selection.has(imp.id)}
                          onSelect={() => handleSelect(imp.id)} onClick={() => handleOpenDetail(imp)} />
                      ))}
                    </div>
                  ) : (
                    <div className="w-full overflow-hidden rounded-xl relative">
                      <div className={`absolute top-0 left-0 h-full w-12 bg-gradient-to-r from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.left ? "opacity-100" : "opacity-0"}`} />
                      <div className={`absolute top-0 right-0 h-full w-12 bg-gradient-to-l from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.right ? "opacity-100" : "opacity-0"}`} />
                      <div className="overflow-x-auto pb-4 custom-scrollbar" ref={tableContainerRef} onScroll={checkScroll}>
                        <table className="w-full text-left border-separate border-spacing-0 min-w-[900px]">
                          <thead>
                            <tr className="bg-brand-gray dark:bg-dark-border/50">
                              <th className="py-3 px-2 w-12 pl-6 rounded-l-lg bg-brand-gray dark:bg-dark-border/50">
                                <div className="flex items-center">
                                  <Checkbox checked={selection.size === paginated.length && paginated.length > 0} onChange={() => handleSelectAll()} className="bg-white dark:bg-dark-background" />
                                </div>
                              </th>
                              {COLUMNS.map((col, idx) => (
                                <th key={col.id}
                                  className={`py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 ${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"} ${idx === COLUMNS.length - 1 ? "rounded-r-lg" : ""}`}
                                  style={{ width: col.width }}>
                                  <span>{col.label}</span>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {paginated.map((imp) => (
                              <ImportListRow key={imp.id} item={imp} selected={selection.has(imp.id)}
                                onSelect={() => handleSelect(imp.id)} onClick={() => handleOpenDetail(imp)} />
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </FadeIn>
              </AnimatePresence>
            )}
          </AnimatePresence>
        </div>

        {filtered.length > 0 && (
          <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
        )}
      </div>

      <DefaultModal isOpen={showUploadModal} onClose={() => setShowUploadModal(false)} title="Importar XML" maxWidth="2xl">
        <XmlUploadForm partnerId={partnerId} storeId={storeId}
          onSuccess={(importId) => { setShowUploadModal(false); setPendingUploadId(importId) }}
          onCancel={() => setShowUploadModal(false)} />
      </DefaultModal>
    </FadeIn>
  )
}

// ─── List Row ───────────────────────────────────────────────────────────────

function ImportListRow({ item, selected, onSelect, onClick }: { item: ImportItem; selected: boolean; onSelect: () => void; onClick: () => void }) {
  const meta = STATUS_META[item.status] || { label: item.status, variant: "gray" as const }
  const dateStr = item.created_at ? new Date(item.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "-"

  return (
    <tr className="border-b border-brand-border dark:border-dark-border transition-colors cursor-pointer hover:bg-brand-gray dark:hover:bg-dark-background/50" onClick={() => onClick()}>
      <td className="py-3 px-2 pl-6" onClick={(e) => e.stopPropagation()}>
        <Checkbox checked={selected} onChange={() => onSelect()} />
      </td>
      <td className="py-3 px-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-brand-gray dark:bg-dark-border border border-brand-border dark:border-dark-border">
            <FileTextIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
          </div>
          <div className="flex flex-col text-left min-w-0">
            <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading truncate max-w-[200px] leading-tight mb-0.5">
              NF-e {item.invoice_number || "Sem número"}
            </span>
            <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate max-w-[200px]">
              Chave: {item.access_key?.slice(-8) || "—"}
            </span>
          </div>
        </div>
      </td>
      <td className="py-3 px-2">
        <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading truncate block max-w-[180px]">{item.supplier_name || "-"}</span>
      </td>
      <td className="py-3 px-2 text-center">
        <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body">{item.imported_items || 0}/{item.items_count || 0}</span>
      </td>
      <td className="py-3 px-2">
        <div className="flex justify-center"><Badge variant={meta.variant}>{meta.label}</Badge></div>
      </td>
      <td className="py-3 px-2 text-right">
        <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body">{dateStr}</span>
      </td>
      <td className="py-3 px-2" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-center">
          {(item.status === "preview" || item.status === "pending") && (
            <Button variant="ghost" size="sm" onClick={() => onClick()}>Revisar</Button>
          )}
          {item.status === "failed" && (
            <Button variant="ghost" size="sm" onClick={() => onClick()}>Ver erro</Button>
          )}
          {item.status === "completed" && (
            <Button variant="ghost" size="sm" onClick={() => onClick()}>Detalhes</Button>
          )}
        </div>
      </td>
    </tr>
  )
}

// ─── Grid Card ──────────────────────────────────────────────────────────────

function ImportGridCard({ item, selected, onSelect, onClick }: { item: ImportItem; selected: boolean; onSelect: () => void; onClick: () => void }) {
  const meta = STATUS_META[item.status] || { label: item.status, variant: "gray" as const }
  const dateStr = item.created_at ? new Date(item.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) : "-"

  return (
    <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 hover:border-brand-dark/30 dark:hover:border-brand-gray/30 transition-all duration-300 cursor-pointer group flex flex-col h-full relative" onClick={() => onClick()}>
      <div className="flex gap-4 mb-2">
        <div className="w-12 h-12 rounded-lg bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
          <FileTextIcon className="w-6 h-6 text-brand-inactive-text dark:text-dark-body" />
        </div>
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <div className="flex items-center gap-2 min-w-0 pr-1">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <h3 className="font-bold text-[14px] text-brand-dark dark:text-dark-heading leading-tight truncate shrink-0">NF-e {item.invoice_number || "—"}</h3>
            </div>
            <div onClick={(e) => e.stopPropagation()}>
              <Checkbox checked={selected} onChange={() => onSelect()} />
            </div>
          </div>
          <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate">{item.supplier_name || "Fornecedor"}</span>
        </div>
      </div>
      <div className="flex items-center justify-between mt-auto pt-3 border-t border-brand-border/50 dark:border-dark-border/50">
        <div className="flex items-center gap-2 text-xs text-brand-inactive-text dark:text-dark-body">
          <span>{item.imported_items || 0}/{item.items_count || 0} itens</span>
        </div>
        <Badge variant={meta.variant}>{meta.label}</Badge>
      </div>
    </div>
  )
}

// ─── Upload Form ────────────────────────────────────────────────────────────

function XmlUploadForm({ partnerId, storeId, onSuccess, onCancel }: { partnerId: string; storeId: string; onSuccess: (importId: string) => void; onCancel: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { success: notifySuccess } = useNotification()

  const handleSubmit = async () => {
    if (!file) return
    setIsUploading(true)
    setError(null)
    try {
      const content = await file.text()
      const result = await uploadXMLAction(content, partnerId, storeId)
      if (!result.success) { setError(result.error || "Erro ao processar XML"); setIsUploading(false); return }
      if (result.preview) {
        notifySuccess("XML processado!", `${result.preview.items.length} produto(s) encontrados.`)
        onSuccess(result.preview.xml_import_id)
      }
    } catch (err: any) { setError(err.message || "Erro ao processar arquivo") }
    finally { setIsUploading(false) }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-brand-inactive-text">Selecione o arquivo XML da NF-e. O sistema vai analisar os produtos e mostrar um preview para revisão.</p>
      <div
        className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center min-h-[180px] transition-colors cursor-pointer ${file ? "border-brand-green bg-brand-green-light/50 dark:bg-emerald-900/20" : "border-brand-border dark:border-dark-border bg-brand-gray dark:bg-dark-background/50"}`}
        onClick={() => document.getElementById("xml-upload-input")?.click()}
      >
        <input id="xml-upload-input" type="file" accept=".xml" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f) }} />
        {!file ? (
          <>
            <div className="w-12 h-12 rounded-full bg-brand-green-light dark:bg-emerald-900/30 flex items-center justify-center mb-3">
              <UploadIcon className="w-5 h-5 text-brand-green" />
            </div>
            <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">Clique para selecionar</p>
            <p className="text-xs text-brand-inactive-text mt-1">XML da NF-e</p>
          </>
        ) : (
          <>
            <div className="w-12 h-12 rounded-full bg-brand-green-light dark:bg-emerald-900/30 flex items-center justify-center mb-3">
              <FileTextIcon className="w-5 h-5 text-brand-green" />
            </div>
            <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">{file.name}</p>
            <p className="text-xs text-brand-inactive-text mt-1">{(file.size / 1024).toFixed(1)} KB</p>
            <Button variant="ghost" size="sm" className="mt-2" onClick={(e) => { e.stopPropagation(); setFile(null) }}>Remover</Button>
          </>
        )}
      </div>
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 rounded-lg px-4 py-3 flex items-start gap-3">
          <AlertTriangleIcon className="w-5 h-5 text-brand-red shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button onClick={handleSubmit} disabled={!file || isUploading}>
          {isUploading ? <span className="flex items-center gap-2"><Spinner className="w-4 h-4" /> Processando...</span> : "Analisar XML"}
        </Button>
      </div>
    </div>
  )
}

// ─── Import Preview View (Detail page pattern) ──────────────────────────────

const SidebarCard = ({ children, hasTopStrip = true }: { children: React.ReactNode; hasTopStrip?: boolean }) => (
  <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden">
    {hasTopStrip && <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border rounded-t-2xl" />}
    {children}
  </div>
)

function ImportPreviewView({ importId, partnerId, storeId, onBack, onComplete }: {
  importId: string; partnerId: string; storeId: string; onBack: () => void; onComplete: () => void
}) {
  const [preview, setPreview] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [isConfirming, setIsConfirming] = useState(false)
  const [decisions, setDecisions] = useState<Record<string, any>>({})
  const [isScrolled, setIsScrolled] = useState(false)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const { success: notifySuccess, error: notifyError } = useNotification()

  const handleScroll = useCallback(() => {
    if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
  }, [])

  useEffect(() => {
    getImportPreviewAction(importId, partnerId).then((res) => {
      if (res.success && res.preview) {
        setPreview(res.preview)
        const initial: Record<string, any> = {}
        for (const item of res.preview.items) {
          initial[item.id] = {
            decision: item.match_status === "new" ? "create_product" : item.match_status === "similar" ? "keep_product" : "keep_product",
            stock_action: "add", cost_action: "update",
          }
        }
        setDecisions(initial)
      }
      setLoading(false)
    })
  }, [importId, partnerId])

  const getDecision = (itemId: string) => decisions[itemId] || { decision: "keep_product", stock_action: "add", cost_action: "update" }

  const handleConfirm = async () => {
    setIsConfirming(true)
    const arr = preview.items.map((item: any) => {
      const d = getDecision(item.id)
      return { item_id: item.id, decision: d.decision, product_id: item.matched_product_id || undefined, stock_action: d.stock_action, cost_action: d.cost_action }
    })
    const result = await confirmImportAction(importId, partnerId, storeId, arr)
    if (result.success) {
      notifySuccess("Importação concluída!", `${result.imported} produto(s) importados.`)
      onComplete()
    } else {
      notifyError("Erro", result.error || "Falha ao importar")
    }
    setIsConfirming(false)
  }

  if (loading) {
    return <div className="flex-1 overflow-y-auto custom-scrollbar relative pb-20 md:pb-2 px-4 md:px-8"><ThreeDotsLoader /></div>
  }

  if (!preview) {
    return (
      <div className="flex flex-col items-center justify-center h-[600px] text-center p-8 w-full">
        <IconPlaceholder icon={FileTextIcon} title="Preview não encontrado" subtitle="A importação pode ter sido processada ou removida."
          itemButton={{ text: "Voltar", action: onBack, variant: "outline" }} />
      </div>
    )
  }

  const isFailed = preview.status === "failed"
  const isPreview = preview.status === "preview" || preview.status === "pending"
  const isCompleted = preview.status === "completed"

  const formatDate = (d: string) => d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }) : "—"
  const formatDateTime = (d: string) => d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"

  return (
    <FadeIn className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden relative transition-colors duration-500 ease-in-out">
      <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-24 md:pb-8 scroll-smooth custom-scrollbar">

        {/* Sticky Header */}
        <div className="sticky top-0 z-30 w-full max-w-[1300px] mx-auto bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out">
          <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">
            <div className="absolute -left-12 top-7 h-full hidden xl:flex justify-center transition-all duration-500" style={{ transform: isScrolled ? "scale(0.9)" : "scale(1)" }}>
              <Button variant="filled" onClick={onBack} className="w-10 h-10 p-0 flex items-center justify-center">
                <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
              </Button>
            </div>

            <div className="hidden md:flex items-start justify-between mb-4">
              <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                <h1 className={`font-bold text-brand-dark dark:text-dark-heading transition-all duration-500 flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                  <span className="truncate">NF-e {preview.invoice.numero || "—"}</span>
                  {isPreview && <Badge variant="orange" className="whitespace-nowrap scale-90 shrink-0">Preview</Badge>}
                  {isFailed && <Badge variant="red" className="whitespace-nowrap scale-90 shrink-0">Erro</Badge>}
                  {isCompleted && <Badge variant="green" className="whitespace-nowrap scale-90 shrink-0">Importado</Badge>}
                </h1>
                <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                  <div className="flex items-center gap-2">
                    <span>{preview.supplier.name}</span>
                    <span className="text-brand-inactive-text dark:text-dark-body opacity-50">•</span>
                    <span>{preview.items.length} produto(s)</span>
                  </div>
                </div>
              </div>

              {isPreview && (
                <div className="flex items-center gap-3 shrink-0 ml-3">
                  <Button onClick={handleConfirm} disabled={isConfirming} className="h-[42px]">
                    {isConfirming ? <span className="flex items-center gap-2"><Spinner className="w-4 h-4" /> Importando...</span> : "Confirmar Importação"}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="max-w-[1300px] mx-auto p-4 md:p-8 pt-6">
          <div className="grid grid-cols-12 gap-y-8 xl:gap-y-0">

            {/* LEFT COLUMN */}
            <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12">

              {/* Invoice / Supplier Info Card */}
              <div className="border border-brand-border dark:border-dark-border rounded-2xl overflow-hidden mb-8">
                <div className="bg-brand-gray dark:bg-dark-border/30 p-6 border-b border-brand-border dark:border-dark-border">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-bold text-brand-dark dark:text-dark-heading text-[16px]">
                      Série {preview.invoice.serie || "—"} | N° {preview.invoice.numero || "—"}
                    </div>
                    {preview.invoice.valor_total > 0 && (
                      <div className="text-right">
                        <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">Valor Total</span>
                        <p className="font-bold text-brand-dark dark:text-dark-heading text-[16px]">R$ {preview.invoice.valor_total.toFixed(2)}</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-white dark:bg-dark-surface">
                  <div className="p-6 border-b border-brand-border dark:border-dark-border">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-full border border-brand-border dark:border-dark-border overflow-hidden shrink-0 bg-brand-gray dark:bg-dark-border/20 flex items-center justify-center">
                        <FileTextIcon className="w-6 h-6 text-brand-inactive-text" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-lg text-brand-dark dark:text-dark-heading truncate">{preview.supplier.name}</h4>
                        <p className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">
                          {preview.supplier.documentType === "cnpj" ? "CNPJ" : "CPF"}: {preview.supplier.document}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <InfoIcon size={14} className="text-brand-inactive-text shrink-0" />
                      <span className="text-xs font-medium text-brand-inactive-text">Chave NF-e:</span>
                      <span className="text-xs font-mono text-brand-dark dark:text-dark-heading break-all">{preview.invoice.chave}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Error info for failed imports */}
              {isFailed && preview.errors?.length > 0 && (
                <div className="mb-8 space-y-2">
                  {preview.errors.map((e: any, i: number) => (
                    <InfoCard key={i} color="red" title={`Erro no item ${i + 1}`} message={e.error || e} />
                  ))}
                </div>
              )}

              {/* Items using FormSection */}
              <FormSection title="Produtos">
                {preview.items.map((item: any) => {
                  const d = getDecision(item.id)
                  const isNew = item.match_status === "new"
                  const isSimilar = item.match_status === "similar"
                  const isMatched = item.match_status === "matched"
                  const isSkipped = item.match_status === "skipped"

                  return (
                    <div key={item.id} className="border border-brand-border dark:border-dark-border rounded-2xl overflow-hidden">
                      <div className="bg-white dark:bg-dark-surface">
                        <div className="p-4 flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-brand-gray dark:bg-dark-border border border-brand-border dark:border-dark-border">
                              <PackageIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">{item.raw_name}</p>
                                <Badge variant={isNew ? "blue" : isSimilar ? "orange" : isSkipped ? "gray" : "green"}>
                                  {isSkipped ? "Ignorado" : isNew ? "Novo" : isSimilar ? "Conflito" : "Match"}
                                </Badge>
                              </div>
                              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                                {item.raw_sku && <span className="text-xs text-brand-inactive-text">SKU: {item.raw_sku}</span>}
                                {item.raw_ean && <span className="text-xs text-brand-inactive-text">EAN: {item.raw_ean}</span>}
                                {item.raw_ncm && <span className="text-xs text-brand-inactive-text">NCM: {item.raw_ncm}</span>}
                                <span className="text-xs text-brand-inactive-text">Qtd: {item.raw_quantity}</span>
                                <span className="text-xs text-brand-inactive-text">Custo: R$ {Number(item.raw_unit_cost).toFixed(4)}</span>
                                <span className="text-xs text-brand-inactive-text">Un: {item.raw_unit}</span>
                              </div>
                              {item.match_method && <p className="text-xs text-brand-green mt-1">Match por {item.match_method}</p>}
                              {(Array.isArray(item.conflicts) ? item.conflicts : []).map((c: any, i: number) => (
                                <div key={i} className="flex items-center gap-1.5 mt-1 text-xs">
                                  <span className="font-bold text-brand-dark">{c.campo}:</span>
                                  <span className="text-yellow-600 line-through">{c.valor_atual}</span>
                                  <ArrowRightIcon className="w-3 h-3 text-brand-inactive-text" />
                                  <span className="text-brand-green">{c.valor_xml}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        {isPreview && !isSkipped && (
                          <div className="px-4 pb-4 space-y-3">
                            <div className="flex flex-wrap gap-2">
                              {isMatched && (
                                <Button variant={d.decision === "keep_product" ? "default" : "outline"} size="sm"
                                  onClick={() => setDecisions((prev: any) => ({ ...prev, [item.id]: { ...prev[item.id], decision: "keep_product" } }))}>
                                  Manter
                                </Button>
                              )}
                              {isSimilar && (
                                <>
                                  <Button variant={d.decision === "keep_product" ? "default" : "outline"} size="sm"
                                    onClick={() => setDecisions((prev: any) => ({ ...prev, [item.id]: { ...prev[item.id], decision: "keep_product" } }))}>
                                    Manter cadastro
                                  </Button>
                                  <Button variant={d.decision === "update_fields" ? "default" : "outline"} size="sm"
                                    onClick={() => setDecisions((prev: any) => ({ ...prev, [item.id]: { ...prev[item.id], decision: "update_fields" } }))}>
                                    Atualizar campos
                                  </Button>
                                </>
                              )}
                              <Button variant={d.decision === "create_product" ? "default" : "outline"} size="sm"
                                onClick={() => setDecisions((prev: any) => ({ ...prev, [item.id]: { ...prev[item.id], decision: "create_product" } }))}>
                                Criar novo
                              </Button>
                              <Button variant={d.decision === "ignore" ? "default" : "outline"} size="sm"
                                onClick={() => setDecisions((prev: any) => ({ ...prev, [item.id]: { ...prev[item.id], decision: "ignore" } }))}>
                                Ignorar
                              </Button>
                            </div>

                            {d.decision !== "ignore" && (
                              <div className="flex flex-wrap gap-3 pt-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-brand-dark">Estoque:</span>
                                  <select value={d.stock_action}
                                    onChange={(e) => setDecisions((prev: any) => ({ ...prev, [item.id]: { ...prev[item.id], stock_action: e.target.value } }))}
                                    className="text-xs border border-brand-border rounded-lg px-2 py-1 bg-transparent text-brand-dark">
                                    <option value="add">Somar</option>
                                    <option value="weighted_average">Média ponderada</option>
                                    <option value="ignore">Não alterar</option>
                                  </select>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-brand-dark">Custo:</span>
                                  <select value={d.cost_action}
                                    onChange={(e) => setDecisions((prev: any) => ({ ...prev, [item.id]: { ...prev[item.id], cost_action: e.target.value } }))}
                                    className="text-xs border border-brand-border rounded-lg px-2 py-1 bg-transparent text-brand-dark">
                                    <option value="update">Atualizar</option>
                                    <option value="weighted_average">Média ponderada</option>
                                    <option value="ignore">Não alterar</option>
                                  </select>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </FormSection>
            </div>

            {/* RIGHT COLUMN - Sidebar */}
            <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 border-l-0 xl:border-l border-brand-border dark:border-dark-border space-y-6">
              {isFailed && preview.errors?.length > 0 && (
                <InfoCard color="red" title="Erro na importação" message={
                  <ul className="list-disc pl-4 text-sm space-y-1">
                    {preview.errors.map((e: any, i: number) => (
                      <li key={i}>{e.error || e}</li>
                    ))}
                  </ul>
                } />
              )}
              <SidebarCard>
                <h3 className="font-bold text-brand-dark dark:text-dark-heading mb-4">Resumo</h3>
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-brand-inactive-text dark:text-dark-body">Total de Itens</span>
                    <span className="font-bold text-brand-dark dark:text-dark-heading">{preview.items.length}</span>
                  </div>
                  {preview.invoice.valor_total > 0 && (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-brand-inactive-text dark:text-dark-body">Valor Total</span>
                      <span className="font-bold text-brand-dark dark:text-dark-heading">R$ {preview.invoice.valor_total.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-brand-inactive-text dark:text-dark-body">Fornecedor</span>
                    <span className="font-bold text-brand-dark dark:text-dark-heading text-right truncate max-w-[140px]">{preview.supplier.name}</span>
                  </div>
                  {preview.invoice.data_emissao && (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-brand-inactive-text dark:text-dark-body">Data de Emissão</span>
                      <span className="font-bold text-brand-dark dark:text-dark-heading">{formatDate(preview.invoice.data_emissao)}</span>
                    </div>
                  )}
                  {preview.created_at && (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-brand-inactive-text dark:text-dark-body">Importado em</span>
                      <span className="font-bold text-brand-dark dark:text-dark-heading">{formatDateTime(preview.created_at)}</span>
                    </div>
                  )}
                  {preview.invoice.chave && (
                    <div className="pt-2 border-t border-brand-border/50 dark:border-dark-border/50">
                      <span className="text-xs text-brand-inactive-text dark:text-dark-body block mb-1">Chave NF-e</span>
                      <span className="text-xs font-mono text-brand-dark dark:text-dark-heading break-all">{preview.invoice.chave}</span>
                    </div>
                  )}
                </div>
              </SidebarCard>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile action bar */}
      {isPreview && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 flex gap-3">
          <Button variant="outline" className="flex-1 h-12" onClick={onBack}>
            <ChevronLeftIcon className="w-5 h-5" /> Voltar
          </Button>
          <Button className="flex-1 h-12" onClick={handleConfirm} disabled={isConfirming}>
            {isConfirming ? <span className="flex items-center gap-2"><Spinner className="w-4 h-4" /> Importando...</span> : "Confirmar"}
          </Button>
        </div>
      )}
    </FadeIn>
  )
}
