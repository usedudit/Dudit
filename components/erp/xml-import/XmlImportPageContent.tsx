"use client"

import React, { useState, useCallback, useEffect } from "react"
import { AnimatePresence } from "framer-motion"
import { Button, Input, IconPlaceholder, Badge, Spinner, Checkbox, SelectionBanner } from "@/components/reusable"
import { FadeIn } from "@/components/animations/FadeIn"
import DefaultModal from "@/components/reusable/DefaultModal"
import { Tabs, TabsList, TabsTrigger } from "@/components/reusable/Tabs"
import Pagination from "@/components/reusable/Pagination"
import { useNotification } from "@/hooks/use-notification"
import { useMediaQuery } from "@/components/erp/hooks"
import { useRouter } from "next/navigation"
import { uploadXMLAction, confirmImportAction, getImportPreviewAction, listImportsAction } from "@/app/actions/erp/xml-import"
import { useStore } from "@/lib/store-context"
import {
  UploadIcon, FileTextIcon, CheckCircleIcon, AlertTriangleIcon, XIcon,
  SearchIcon, PlusIcon, ArrowDownIcon, FileIcon, ClockIcon, GridIcon, ListIcon, CheckIcon
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

export function XmlImportPageContent({ partnerId, initialImports }: XmlImportPageContentProps) {
  const { selectedStore } = useStore()
  const storeId = selectedStore?.id || ""
  const { success, error: notifyError } = useNotification()
  const isMobile = useMediaQuery("(max-width: 768px)")
  const router = useRouter()

  const [activeTab, setActiveTab] = useState<TabType>("all")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [viewMode, setViewMode] = useState<"list" | "grid">("list")
  const [imports, setImports] = useState<ImportItem[]>(initialImports)
  const [selection, setSelection] = useState<Set<string>>(new Set())

  const [showUploadModal, setShowUploadModal] = useState(false)

  // Preview state
  const [previewImportId, setPreviewImportId] = useState<string | null>(null)
  const [pendingUploadId, setPendingUploadId] = useState<string | null>(null)

  // If there's a pending import just uploaded, auto-navigate to preview
  if (pendingUploadId) {
    return (
      <ImportPreviewView
        importId={pendingUploadId}
        partnerId={partnerId}
        storeId={storeId}
        onBack={() => { setPendingUploadId(null) }}
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

  const ITEMS_PER_PAGE = 10

  const tabs: { key: TabType; label: string }[] = [
    { key: "all", label: "Todas" },
    { key: "pending", label: "Pendentes" },
    { key: "completed", label: "Importadas" },
    { key: "failed", label: "Com Erro" },
  ]

  const filtered = imports.filter((imp) => {
    if (activeTab === "pending") return imp.status === "pending" || imp.status === "preview"
    if (activeTab === "completed") return imp.status === "completed"
    if (activeTab === "failed") return imp.status === "failed"
    return true
  }).filter((imp) => {
    if (!search) return true
    const s = search.toLowerCase()
    return (
      imp.supplier_name?.toLowerCase().includes(s) ||
      imp.invoice_number?.toLowerCase().includes(s) ||
      imp.access_key?.toLowerCase().includes(s)
    )
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE))
  const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)

  const handleSelect = (id: string) => {
    setSelection((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleSelectAll = () => {
    if (selection.size === paginated.length) {
      setSelection(new Set())
    } else {
      setSelection(new Set(paginated.map((i) => i.id)))
    }
  }

  const handleUploadSuccess = (newImportId: string) => {
    setShowUploadModal(false)
    setPendingUploadId(newImportId)
  }

  if (previewImportId) {
    return (
      <ImportPreviewView
        importId={previewImportId}
        partnerId={partnerId}
        storeId={storeId}
        onBack={() => setPreviewImportId(null)}
        onComplete={() => {
          setPreviewImportId(null)
          listImportsAction(partnerId, 50).then((res) => {
            if (res.success && res.imports) setImports(res.imports as ImportItem[])
          })
          router.refresh()
        }}
      />
    )
  }

  return (
    <div className="space-y-4">
      {/* Page Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as TabType); setPage(1) }}>
          <TabsList>
            {tabs.map((t) => (
              <TabsTrigger key={t.key} value={t.key}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-none sm:w-52">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-inactive-text" />
            <input
              type="text"
              placeholder="Buscar nota..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="w-full h-10 pl-9 pr-3 rounded-xl border border-brand-border dark:border-dark-border bg-transparent text-sm text-brand-dark dark:text-dark-heading placeholder:text-brand-inactive-text outline-none focus:ring-2 focus:ring-brand-green/20"
            />
          </div>
          <Button onClick={() => setShowUploadModal(true)}>
            <UploadIcon className="w-4 h-4" /> Importar XML
          </Button>
        </div>
      </div>

      {/* Selection Banner */}
      <AnimatePresence>
        {selection.size > 0 && (
          <SelectionBanner
            selectedCount={selection.size}
            totalCount={paginated.length}
            onSelectAll={handleSelectAll}
            onClearSelection={() => setSelection(new Set())}
          />
        )}
      </AnimatePresence>

      {/* Table */}
      <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border overflow-hidden">
        {paginated.length === 0 ? (
          <div className="p-12">
            <IconPlaceholder
              icon={FileTextIcon}
              title="Nenhuma importação encontrada"
              subtitle={search ? "Tente alterar a busca" : "Faça o upload de um XML de NF-e para começar"}
              itemButton={{
                text: "Importar XML",
                action: () => setShowUploadModal(true),
                variant: "default",
              }}
            />
          </div>
        ) : (
          <div className="divide-y divide-brand-border dark:divide-dark-border">
            {/* Header Row */}
            <div className="hidden md:flex items-center px-4 py-3 bg-brand-gray dark:bg-dark-background/50 text-xs font-bold text-brand-inactive-text uppercase tracking-wider">
              <div className="w-10 shrink-0">
                <Checkbox checked={selection.size === paginated.length && paginated.length > 0} onChange={() => handleSelectAll()} />
              </div>
              <div className="flex-1 min-w-0">Nota Fiscal</div>
              <div className="w-[180px] shrink-0">Fornecedor</div>
              <div className="w-[100px] shrink-0 text-center">Itens</div>
              <div className="w-[120px] shrink-0 text-center">Status</div>
              <div className="w-[140px] shrink-0 text-right">Data</div>
              <div className="w-12 shrink-0" />
            </div>

            {paginated.map((imp) => (
              <ImportListItem
                key={imp.id}
                item={imp}
                selected={selection.has(imp.id)}
                onSelect={() => handleSelect(imp.id)}
                onClick={() => imp.status === "preview" || imp.status === "pending" ? setPreviewImportId(imp.id) : null}
                isMobile={isMobile}
              />
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
      )}

      {/* Upload Modal */}
      <DefaultModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        title="Importar XML"
        maxWidth="2xl"
      >
        <XmlUploadForm
          partnerId={partnerId}
          storeId={storeId}
          onSuccess={(importId) => handleUploadSuccess(importId)}
          onCancel={() => setShowUploadModal(false)}
        />
      </DefaultModal>
    </div>
  )
}

// ─── List Item ──────────────────────────────────────────────────────────────

function ImportListItem({
  item, selected, onSelect, onClick, isMobile,
}: {
  item: ImportItem; selected: boolean; onSelect: () => void; onClick: (() => void) | null; isMobile: boolean
}) {
  const statusVariant: Record<string, "green" | "orange" | "red" | "gray"> = {
    completed: "green", preview: "orange", pending: "gray", failed: "red", reprocessing: "orange",
  }
  const statusLabel: Record<string, string> = {
    completed: "Importado", preview: "Revisar", pending: "Pendente", failed: "Erro", reprocessing: "Reprocessando",
  }

  const dateStr = item.created_at
    ? new Date(item.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
    : "-"

  const handleClick = () => {
    if (onClick) onClick()
  }

  if (isMobile) {
    return (
      <div
        className={`p-4 flex items-center gap-3 ${onClick ? 'cursor-pointer hover:bg-brand-gray dark:hover:bg-dark-background/50' : ''} transition-colors`}
        onClick={handleClick}
      >
        <Checkbox checked={selected} onChange={() => onSelect()} />
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
          item.status === "completed" ? "bg-brand-green-light dark:bg-emerald-900/30" :
          item.status === "failed" ? "bg-red-50 dark:bg-red-900/20" :
          "bg-brand-gray dark:bg-dark-background"
        }`}>
          {item.status === "completed" ? <CheckCircleIcon className="w-5 h-5 text-brand-green" /> :
           item.status === "failed" ? <AlertTriangleIcon className="w-5 h-5 text-brand-red" /> :
           <FileIcon className="w-5 h-5 text-brand-inactive-text" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
            NF-e {item.invoice_number || "Sem número"}
          </p>
          <p className="text-xs text-brand-inactive-text truncate">{item.supplier_name || "Fornecedor"}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-brand-inactive-text">{item.imported_items || 0}/{item.items_count || 0} itens</span>
            <Badge variant={statusVariant[item.status] || "gray"}>{statusLabel[item.status] || item.status}</Badge>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`flex items-center px-4 py-3.5 transition-colors ${onClick ? 'cursor-pointer hover:bg-brand-gray dark:hover:bg-dark-background/50' : ''}`}
      onClick={handleClick}
    >
      <div className="w-10 shrink-0">
        <Checkbox checked={selected} onChange={() => onSelect()} />
      </div>
      <div className="flex-1 min-w-0 flex items-center gap-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
          item.status === "completed" ? "bg-brand-green-light dark:bg-emerald-900/30" :
          item.status === "failed" ? "bg-red-50 dark:bg-red-900/20" :
          "bg-brand-gray dark:bg-dark-background"
        }`}>
          {item.status === "completed" ? <CheckCircleIcon className="w-5 h-5 text-brand-green" /> :
           item.status === "failed" ? <AlertTriangleIcon className="w-5 h-5 text-brand-red" /> :
           <FileIcon className="w-5 h-5 text-brand-inactive-text" />}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
            NF-e {item.invoice_number || "Sem número"}{item.invoice_series ? ` (Série ${item.invoice_series})` : ""}
          </p>
          <p className="text-xs text-brand-inactive-text truncate">Chave: {item.access_key}</p>
        </div>
      </div>
      <div className="w-[180px] shrink-0 truncate text-sm text-brand-dark dark:text-dark-heading">
        {item.supplier_name || "-"}
      </div>
      <div className="w-[100px] shrink-0 text-center text-sm text-brand-inactive-text">
        {item.imported_items || 0}/{item.items_count || 0}
      </div>
      <div className="w-[120px] shrink-0 flex justify-center">
        <Badge variant={statusVariant[item.status] || "gray"}>{statusLabel[item.status] || item.status}</Badge>
      </div>
      <div className="w-[140px] shrink-0 text-right text-sm text-brand-inactive-text">
        {dateStr}
      </div>
      <div className="w-12 shrink-0 flex justify-center">
        {(item.status === "preview" || item.status === "pending") && (
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onClick?.() }}>
            Revisar
          </Button>
        )}
      </div>
    </div>
  )
}

// ─── Upload Form ────────────────────────────────────────────────────────────

function XmlUploadForm({
  partnerId, storeId, onSuccess, onCancel,
}: {
  partnerId: string; storeId: string; onSuccess: (importId: string) => void; onCancel: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { success: notifySuccess, error: notifyError } = useNotification()

  const handleSubmit = async () => {
    if (!file) return
    setIsUploading(true)
    setError(null)

    try {
      const content = await file.text()
      const result = await uploadXMLAction(content, partnerId, storeId)

      if (!result.success) {
        if (result.error?.includes("Nota já importada")) {
          setError(result.error)
        } else if (result.error) {
          setError(result.error)
        } else {
          setError("Erro ao processar XML")
        }
        setIsUploading(false)
        return
      }

      if (result.preview) {
        notifySuccess("XML processado!", `${result.preview.items.length} produto(s) encontrados.`)
        onSuccess(result.preview.xml_import_id)
      }
    } catch (err: any) {
      setError(err.message || "Erro ao processar arquivo")
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-brand-inactive-text">
        Selecione o arquivo XML da NF-e. O sistema vai analisar os produtos e mostrar um preview para revisão.
      </p>

      <div
        className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center min-h-[180px] transition-colors cursor-pointer ${
          file
            ? "border-brand-green bg-brand-green-light/50 dark:bg-emerald-900/20"
            : "border-brand-border dark:border-dark-border bg-brand-gray dark:bg-dark-background/50"
        }`}
        onClick={() => document.getElementById("xml-upload-input")?.click()}
      >
        <input
          id="xml-upload-input"
          type="file"
          accept=".xml"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) setFile(f)
          }}
        />
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
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={(e) => { e.stopPropagation(); setFile(null) }}
            >
              Remover
            </Button>
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
          {isUploading ? (
            <span className="flex items-center gap-2"><Spinner className="w-4 h-4" /> Processando...</span>
          ) : "Analisar XML"}
        </Button>
      </div>
    </div>
  )
}

// ─── Import Preview View ────────────────────────────────────────────────────

function ImportPreviewView({
  importId, partnerId, storeId, onBack, onComplete,
}: {
  importId: string; partnerId: string; storeId: string; onBack: () => void; onComplete: () => void
}) {
  const [preview, setPreview] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [isConfirming, setIsConfirming] = useState(false)
  const [decisions, setDecisions] = useState<Record<string, any>>({})
  const { success: notifySuccess, error: notifyError } = useNotification()
  const isMobile = useMediaQuery("(max-width: 768px)")

  useEffect(() => {
    getImportPreviewAction(importId, partnerId).then((res) => {
      if (res.success && res.preview) {
        setPreview(res.preview)
        const initial: Record<string, any> = {}
        for (const item of res.preview.items) {
          initial[item.id] = {
            decision: item.match_status === "new" ? "create_product" :
                      item.match_status === "similar" ? "keep_product" : "keep_product",
            stock_action: "add",
            cost_action: "update",
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
      return {
        item_id: item.id,
        decision: d.decision,
        product_id: item.matched_product_id || undefined,
        stock_action: d.stock_action,
        cost_action: d.cost_action,
      }
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
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner className="w-8 h-8" />
      </div>
    )
  }

  if (!preview) {
    return (
      <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-12">
        <IconPlaceholder icon={AlertTriangleIcon} title="Preview não encontrado" subtitle="A importação pode ter sido processada ou removida." />
        <div className="flex justify-center mt-4">
          <Button variant="outline" onClick={onBack}>Voltar</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={onBack}>
            <ArrowDownIcon className="w-5 h-5 rotate-90" />
          </Button>
          <div>
            <h2 className="text-lg font-bold text-brand-dark dark:text-dark-heading">
              NF-e {preview.invoice.numero || "—"}
            </h2>
            <p className="text-sm text-brand-inactive-text">
              {preview.supplier.name} — {preview.items.length} produto(s)
            </p>
          </div>
        </div>
        <Button onClick={handleConfirm} disabled={isConfirming} size="lg">
          {isConfirming ? (
            <span className="flex items-center gap-2"><Spinner className="w-4 h-4" /> Importando...</span>
          ) : "Confirmar Importação"}
        </Button>
      </div>

      {/* Supplier info */}
      <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <p className="text-xs font-bold text-brand-inactive-text uppercase tracking-wider">Fornecedor</p>
          <p className="text-sm font-bold text-brand-dark dark:text-dark-heading mt-1">{preview.supplier.name}</p>
          <p className="text-xs text-brand-inactive-text mt-0.5">
            {preview.supplier.documentType === "cnpj" ? "CNPJ" : "CPF"}: {preview.supplier.document}
          </p>
        </div>
        <div>
          <p className="text-xs font-bold text-brand-inactive-text uppercase tracking-wider">Nota Fiscal</p>
          <p className="text-sm font-bold text-brand-dark dark:text-dark-heading mt-1">
            Série {preview.invoice.serie || "—"} | N° {preview.invoice.numero || "—"}
          </p>
          {preview.invoice.valor_total > 0 && (
            <p className="text-xs text-brand-inactive-text mt-0.5">Total: R$ {preview.invoice.valor_total.toFixed(2)}</p>
          )}
        </div>
        <div>
          <p className="text-xs font-bold text-brand-inactive-text uppercase tracking-wider">Chave NF-e</p>
          <p className="text-xs text-brand-dark dark:text-dark-heading mt-1 font-mono break-all">{preview.invoice.chave}</p>
        </div>
      </div>

      {/* Items */}
      <div className="space-y-3">
        {preview.items.map((item: any) => {
          const d = getDecision(item.id)
          const isNew = item.match_status === "new"
          const isSimilar = item.match_status === "similar"
          const isMatched = item.match_status === "matched"

          return (
            <div key={item.id} className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border overflow-hidden">
              <div className="p-4 flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    isNew ? "bg-blue-50 dark:bg-blue-900/20" :
                    isSimilar ? "bg-yellow-50 dark:bg-yellow-900/20" :
                    "bg-brand-green-light dark:bg-emerald-900/30"
                  }`}>
                    {isNew ? <PlusIcon className="w-5 h-5 text-blue-600" /> :
                     isSimilar ? <AlertTriangleIcon className="w-5 h-5 text-yellow-600" /> :
                     <CheckIcon className="w-5 h-5 text-brand-green" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">{item.raw_name}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                      {item.raw_sku && <span className="text-xs text-brand-inactive-text">SKU: {item.raw_sku}</span>}
                      {item.raw_ean && <span className="text-xs text-brand-inactive-text">EAN: {item.raw_ean}</span>}
                      {item.raw_ncm && <span className="text-xs text-brand-inactive-text">NCM: {item.raw_ncm}</span>}
                      <span className="text-xs text-brand-inactive-text">Qtd: {item.raw_quantity}</span>
                      <span className="text-xs text-brand-inactive-text">Custo: R$ {Number(item.raw_unit_cost).toFixed(4)}</span>
                      <span className="text-xs text-brand-inactive-text">Un: {item.raw_unit}</span>
                    </div>
                    {item.match_method && (
                      <p className="text-xs text-brand-green mt-1">Match por {item.match_method}</p>
                    )}
                    {item.conflicts?.map((c: any, i: number) => (
                      <div key={i} className="flex items-center gap-1.5 mt-1 text-xs">
                        <span className="font-bold text-brand-dark">{c.campo}:</span>
                        <span className="text-yellow-600 line-through">{c.valor_atual}</span>
                        <ArrowDownIcon className="w-3 h-3 text-brand-inactive-text rotate-270" />
                        <span className="text-brand-green">{c.valor_xml}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <Badge variant={isNew ? "blue" : isSimilar ? "orange" : "green"}>
                  {isNew ? "Novo" : isSimilar ? "Conflito" : "Match"}
                </Badge>
              </div>

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
            </div>
          )
        })}
      </div>

      {/* Bottom bar */}
      <div className="sticky bottom-0 bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <span className="text-sm text-brand-inactive-text">{preview.items.length} item(ns)</span>
          <Button onClick={handleConfirm} disabled={isConfirming} size="lg">
            {isConfirming ? (
              <span className="flex items-center gap-2"><Spinner className="w-4 h-4" /> Importando...</span>
            ) : "Confirmar Importação"}
          </Button>
        </div>
      </div>
    </div>
  )
}
