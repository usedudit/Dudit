"use client"

import React, { useState, useMemo, useCallback, useRef, useEffect } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Button, Checkbox, Input, IconPlaceholder, Badge, Spinner, SelectionBanner, ThreeDotsLoader, InfoCard, FormSection, ActionsDropdown, DropdownItem, FormTextarea, Separator, FormDropdown, ListItem, Tooltip } from "@/components/reusable"
import { FadeIn } from "@/components/animations/FadeIn"
import DefaultModal from "@/components/reusable/DefaultModal"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/reusable/Tabs"
import Pagination from "@/components/reusable/Pagination"
import { useNotification } from "@/hooks/use-notification"
import { useSidebar } from "@/lib/sidebar-context"
import { usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal"
import { useMediaQuery } from "@/components/erp/hooks"
import { useRouter } from "next/navigation"
import { useStore } from "@/lib/store-context"
import { uploadXMLAction, confirmImportAction, getImportPreviewAction, listImportsAction, revertImportAction, getImportFinanceAction, getImportStockMovementsAction, getXmlImportTimelineAction } from "@/app/actions/erp/xml-import"
import { XmlImportHistoryTab } from "./XmlImportHistoryTab"
import {
    UploadIcon, FileTextIcon, CheckCircleIcon, AlertTriangleIcon,
    SearchIcon, PlusIcon, ClockIcon, GridIcon, ListIcon,
    PackageIcon, ChevronLeftIcon, InfoIcon, ArrowUpDownIcon,
    ReloadIcon, ExportFileIcon, MoneyIcon,
    FileIcon
} from "@/lib/icons"
import { useErpExport } from "@/hooks/use-erp-export"
import { usePermissions } from "@/lib/permission-context"
import ExportSelectionModal from "@/components/erp/export/ExportSelectionModal"
import ExportColumnSelectionModal from "@/components/erp/export/ExportColumnSelectionModal"
import { formatQuantityWithUnit } from "@/lib/utils/formatters"
import { useEntityState } from "@/hooks/use-entity-state"
import { ERPDetailLoading } from "@/components/erp/shared/ERPDetailLoading"

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
    planGate?: { requiredPlanSlug: "crescer" | "escalar" }
}

const ITEMS_PER_PAGE = 10
const STATUS_META: Record<string, { label: string; variant: "green" | "orange" | "red" | "gray" }> = {
    completed: { label: "Importado", variant: "green" },
    preview: { label: "Revisar", variant: "orange" },
    pending: { label: "Pendente", variant: "gray" },
    failed: { label: "Erro", variant: "red" },
    reprocessing: { label: "Reprocessando", variant: "orange" },
    reversed: { label: "Revertido", variant: "gray" },
}

const COLUMNS = [
    { id: "invoice" as const, label: "Nota Fiscal", align: "left" as const, width: "280px" },
    { id: "supplier" as const, label: "Fornecedor", align: "left" as const, width: "200px" },
    { id: "items" as const, label: "Itens", align: "center" as const, width: "100px" },
    { id: "date" as const, label: "Data", align: "right" as const, width: "170px" },
    { id: "status" as const, label: "Status", align: "center" as const, width: "130px" },
    { id: "actions" as const, label: "Ações", align: "center" as const, width: "80px" },
]

const ITEM_STOCK_OPTIONS = [
    { value: "add", label: "Somar" },
    { value: "weighted_average", label: "Média ponderada" },
    { value: "ignore", label: "Não alterar" },
]

const ITEM_COST_OPTIONS = [
    { value: "update", label: "Atualizar" },
    { value: "weighted_average", label: "Média ponderada" },
    { value: "ignore", label: "Não alterar" },
]

function getItemDecisionOptions(item: any) {
    const opts: { value: string; label: string }[] = []
    if (item.match_status === "new") {
        opts.push({ value: "create_product", label: "Criar novo" })
    } else {
        opts.push({ value: "keep_product", label: item.match_status === "similar" ? "Manter cadastro" : "Manter" })
        if (item.match_status === "similar") opts.push({ value: "update_fields", label: "Atualizar campos" })
        opts.push({ value: "create_product", label: "Criar novo" })
    }
    opts.push({ value: "ignore", label: "Ignorar" })
    return opts
}

function getItemDecisionLabel(v: string, item: any) {
    return getItemDecisionOptions(item).find((o) => o.value === v)?.label || v
}

function getDecisionToneClass(v: string) {
    switch (v) {
        case "create_product": return "text-blue-600 dark:text-blue-400"
        case "update_fields": return "text-orange-600 dark:text-orange-400"
        case "ignore": return "text-gray-400 dark:text-dark-body"
        default: return "text-brand-green dark:text-emerald-400"
    }
}

function getItemMatchBadge(item: any) {
    switch (item.match_status) {
        case "new": return { label: "Novo", variant: "blue" as const }
        case "similar": return { label: "Conflito", variant: "orange" as const }
        case "skipped": return { label: "Ignorado", variant: "gray" as const }
        default: return { label: "Match", variant: "green" as const }
    }
}

function getSupplierConflict(item: any) {
    return (item.conflicts || []).find((c: any) => c.campo === "fornecedor_diferente")
}

interface ImportItemRowProps {
    item: any
    d: any
    isPreview: boolean
    onOpenAction: (kind: "stock" | "cost" | "decision") => void
    supplierName?: string
    supplierAction?: string
    onSupplierAction?: (value: "add" | "keep") => void
}

function ImportItemListRow({ item, d, isPreview, onOpenAction, supplierName, supplierAction, onSupplierAction }: ImportItemRowProps) {
    const badge = getItemMatchBadge(item)
    const supplierConflictInfo = getSupplierConflict(item)
    return (
        <tr className="group bg-white dark:bg-dark-background hover:bg-brand-gray dark:hover:bg-dark-border/20 transition-colors">
            <td className="py-3 px-4 border-b border-brand-border dark:border-dark-border align-top">
                <div className="flex flex-col gap-0.5 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading truncate">{item.raw_name}</span>
                        <Badge variant={badge.variant} icon={null} className="whitespace-nowrap scale-90 shrink-0">{badge.label}</Badge>
                    </div>
                    {item.raw_sku && (
                        <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate">SKU: {item.raw_sku} • {isPreview && (<span className={`text-[11px] font-semibold ${getDecisionToneClass(d.decision)}`}> {getItemDecisionLabel(d.decision, item)} </span>)} </span>
                    )}
                    {isPreview && supplierConflictInfo && (
                        <div className="flex flex-col gap-1 w-full mt-1.5">
                            <span className="text-orange-600 dark:text-orange-400 font-semibold text-[11px]">
                                Já vinculado a outro fornecedor ({supplierConflictInfo.valor_atual_name || "desconhecido"})
                            </span>
                            <div className="flex flex-wrap gap-3">
                                <label className="flex items-center gap-1 cursor-pointer">
                                    <input type="radio" name={`supplier_${item.id}`} value="add"
                                        checked={supplierAction === "add"}
                                        onChange={() => onSupplierAction?.("add")}
                                        className="accent-brand-orange" />
                                    <span className="text-xs text-brand-dark dark:text-dark-heading">Adicionar {supplierName || "novo"} como fornecedor</span>
                                </label>
                                <label className="flex items-center gap-1 cursor-pointer">
                                    <input type="radio" name={`supplier_${item.id}`} value="keep"
                                        checked={supplierAction !== "add"}
                                        onChange={() => onSupplierAction?.("keep")}
                                        className="accent-brand-orange" />
                                    <span className="text-xs text-brand-dark dark:text-dark-heading">Não alterar fornecedores</span>
                                </label>
                            </div>
                        </div>
                    )}
                </div>
            </td>
            <td className="py-3 px-4 border-b border-brand-border dark:border-dark-border align-top">
                <span className="text-[13px] font-semibold text-brand-dark dark:text-dark-heading whitespace-nowrap">
                    {formatQuantityWithUnit(item.raw_quantity, item.raw_unit)}
                </span>
            </td>
            <td className="py-3 px-4 border-b border-brand-border dark:border-dark-border align-top">
                <span className="text-[13px] font-semibold text-brand-dark dark:text-dark-heading whitespace-nowrap">
                    R$ {Number(item.raw_unit_cost || 0).toFixed(2)}
                </span>
            </td>
            <td className="py-3 px-4 border-b border-brand-border dark:border-dark-border align-top text-right">
                {isPreview ? (
                    <div className="flex items-center justify-end action-btn">
                        <ActionsDropdown>
                            <DropdownItem onClick={() => onOpenAction("stock")}>
                                <PackageIcon size={18} /> Estoque
                            </DropdownItem>
                            <DropdownItem onClick={() => onOpenAction("cost")}>
                                <MoneyIcon size={18} /> Custo
                            </DropdownItem>
                            <DropdownItem onClick={() => onOpenAction("decision")}>
                                <CheckCircleIcon size={18} /> Decisão
                            </DropdownItem>
                        </ActionsDropdown>
                    </div>
                ) : (
                    <span className="text-xs text-brand-inactive-text dark:text-dark-body">-</span>
                )}
            </td>
        </tr>
    )
}

function ImportItemGridCard({ item, d, isPreview, onOpenAction, supplierName, supplierAction, onSupplierAction }: ImportItemRowProps) {
    const badge = getItemMatchBadge(item)
    const supplierConflictInfo = getSupplierConflict(item)
    return (
        <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 flex flex-col gap-3">
            <div className="flex items-start gap-2 min-w-0">
                <h4 className="font-bold text-[13px] text-brand-dark dark:text-dark-heading truncate" title={item.raw_name}>{item.raw_name}</h4>
                <Badge variant={badge.variant} className="whitespace-nowrap shrink-0">{badge.label}</Badge>
            </div>
            <div className="text-xs text-brand-inactive-text dark:text-dark-body font-medium truncate">
                {item.raw_sku ? <span>SKU: {item.raw_sku}</span> : <span>Sem SKU</span>}
                {item.raw_ean && <><span className="mx-1.5">•</span><span>EAN: {item.raw_ean}</span></>}
            </div>
            {isPreview && (
                <span className={`text-[11px] font-semibold ${getDecisionToneClass(d.decision)}`}>
                    {getItemDecisionLabel(d.decision, item)}
                </span>
            )}
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <span className="text-[11px] font-medium text-brand-inactive-text dark:text-dark-body block">Quantidade</span>
                    <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">{formatQuantityWithUnit(item.raw_quantity, item.raw_unit)}</span>
                </div>
                <div className="text-right">
                    <span className="text-[11px] font-medium text-brand-inactive-text dark:text-dark-body block">Custo unit.</span>
                    <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">R$ {Number(item.raw_unit_cost || 0).toFixed(2)}</span>
                </div>
            </div>
            {isPreview && (
                <div className="flex gap-2 mt-1">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => onOpenAction("stock")}>Estoque</Button>
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => onOpenAction("cost")}>Custo</Button>
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => onOpenAction("decision")}>Decisão</Button>
                </div>
            )}
            {isPreview && supplierConflictInfo && (
                <div className="flex flex-col gap-1 w-full border-t border-brand-border dark:border-dark-border pt-2">
                    <span className="text-orange-600 dark:text-orange-400 font-semibold text-[11px]">
                        Já vinculado a outro fornecedor ({supplierConflictInfo.valor_atual_name || "desconhecido"})
                    </span>
                    <div className="flex flex-col gap-1.5">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                            <input type="radio" name={`supplier_${item.id}`} value="add"
                                checked={supplierAction === "add"}
                                onChange={() => onSupplierAction?.("add")}
                                className="accent-brand-orange" />
                            <span className="text-xs text-brand-dark dark:text-dark-heading">Adicionar {supplierName || "novo"} como fornecedor</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                            <input type="radio" name={`supplier_${item.id}`} value="keep"
                                checked={supplierAction !== "add"}
                                onChange={() => onSupplierAction?.("keep")}
                                className="accent-brand-orange" />
                            <span className="text-xs text-brand-dark dark:text-dark-heading">Não alterar fornecedores</span>
                        </label>
                    </div>
                </div>
            )}
        </div>
    )
}

export function XmlImportPageContent({ partnerId, initialImports, planGate }: XmlImportPageContentProps) {
    const { selectedStore } = useStore()
    const storeId = selectedStore?.id || ""
    const { success: notifySuccess, error: notifyError } = useNotification()
    const { openPlanUpgrade } = usePlanUpgrade()
    const { planSlug } = usePermissions()
    const { exportData, isExporting, columnSelectionModal, closeColumnSelectionModal, handleColumnConfirm, selectionModal, closeSelectionModal, handleExportSelected, handleExportAll } = useErpExport(planSlug)
    const isTabletOrMobile = useMediaQuery("(max-width: 1023px)")
    const router = useRouter()

    const { state: entityState, open, close, isViewing, isCreating } = useEntityState()
    const viewingImportId = isViewing ? entityState.entityId : null
    const showUploadModal = isCreating

    useEffect(() => {
        const handleReset = () => close()
        window.addEventListener("erp-sidebar-reset", handleReset)
        return () => window.removeEventListener("erp-sidebar-reset", handleReset)
    }, [close])

    const setShowUploadModal = useCallback((show: boolean) => {
        if (show) open("create")
        else close()
    }, [open, close])

    const [activeTab, setActiveTab] = useState<TabType>("all")
    const [search, setSearch] = useState("")
    const [page, setPage] = useState(1)
    const [viewMode, setViewMode] = useState<"list" | "grid">("list")
    const [imports, setImports] = useState<ImportItem[]>(initialImports)
    const [selection, setSelection] = useState<Set<string>>(new Set())
    const effectiveViewMode = isTabletOrMobile ? "grid" : viewMode

    const [pendingUploadId, setPendingUploadId] = useState<string | null>(null)
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>(null)

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

    const showPreview = !!viewingImportId || !!pendingUploadId
    const previewImportId = pendingUploadId || viewingImportId || ""

    const handleBackFromPreview = useCallback(() => {
        setPendingUploadId(null)
        setReimportedFlag(false)
        close()
    }, [close])

    const handleComplete = useCallback(() => {
        setPendingUploadId(null)
        setReimportedFlag(false)
        close()
        listImportsAction(partnerId, { limit: 50, storeId }).then((res) => {
            if (res.success && res.imports) setImports(res.imports as ImportItem[])
        })
        router.refresh()
    }, [partnerId, router, storeId, close])

    const isPreviewView = !!previewImportId
    const listViewKey = "list-view"
    const previewKey = pendingUploadId ? "pending-preview" : `view-${viewingImportId}`

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
        if (sortConfig) {
            result = [...result].sort((a, b) => {
                const keyMap: Record<string, keyof ImportItem> = {
                    invoice: "invoice_number",
                    supplier: "supplier_name",
                    items: "items_count",
                    status: "status",
                    date: "created_at",
                }
                const field = keyMap[sortConfig.key]
                if (!field) return 0
                let valA = a[field]
                let valB = b[field]
                if (sortConfig.key === "items") {
                    valA = a.items_count ?? 0
                    valB = b.items_count ?? 0
                }
                if (sortConfig.key === "date") {
                    valA = a.created_at || ""
                    valB = b.created_at || ""
                }
                if (valA === valB) return 0
                const comparison = (valA ?? "") < (valB ?? "") ? -1 : 1
                return sortConfig.direction === "asc" ? comparison : -comparison
            })
        }
        return result
    }, [imports, activeTab, search, sortConfig])

    const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE))
    const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)
    const hasActiveFilters = activeTab !== "all" || search !== ""

    const handleSort = useCallback((key: string) => {
        setSortConfig((prev) => ({
            key,
            direction: prev?.key === key && prev.direction === "asc" ? "desc" : "asc",
        }))
    }, [])

    const handleTabChange = useCallback((tab: TabType) => { setActiveTab(tab); setPage(1) }, [])
    const handleSelect = useCallback((id: string) => {
        setSelection((prev) => {
            const next = new Set(prev)
            next.has(id) ? next.delete(id) : next.add(id)
            return next
        })
    }, [])
    const handleSelectAll = useCallback(() => {
        if (selection.size === paginated.length) setSelection(new Set())
        else setSelection(new Set(paginated.map((i) => i.id)))
    }, [selection.size, paginated])
    const handleExport = useCallback(() => {
        void exportData({
            partnerId,
            module: "xml-import",
            format: "xlsx",
            filters: { storeId: selectedStore?.id || null, search, activeTab, status: [] },
        }, { selectedIds: selection, totalCount: filtered.length })
    }, [exportData, partnerId, selectedStore?.id, search, activeTab, selection, filtered.length])

    const handleClearFilters = useCallback(() => { setSearch(""); setActiveTab("all") }, [])
    const handleOpenDetail = useCallback((imp: ImportItem) => open("view", imp.id), [open])
    const [reimportedFlag, setReimportedFlag] = useState(false)

    const handleUploadModalSuccess = useCallback((importId: string, reimported?: boolean) => {
        open("view", importId)
        setPendingUploadId(importId)
        setReimportedFlag(!!reimported)
    }, [open])

    const [revertTarget, setRevertTarget] = useState<ImportItem | null>(null)
    const [revertReason, setRevertReason] = useState("")
    const [isReverting, setIsReverting] = useState(false)

    const handleOpenRevert = useCallback((imp: ImportItem) => {
        setRevertReason("")
        setRevertTarget(imp)
    }, [])

    const handleRevert = useCallback(async () => {
        if (!revertTarget) return
        setIsReverting(true)
        const result = await revertImportAction(revertTarget.id, partnerId, revertReason, storeId)
        if (result.success) {
            notifySuccess("Importação revertida!", result.message)
            setRevertTarget(null)
            setRevertReason("")
            listImportsAction(partnerId, { limit: 50, storeId }).then((res) => {
                if (res.success && res.imports) setImports(res.imports as ImportItem[])
            })
            router.refresh()
        } else {
            notifyError("Erro", result.error || "Falha ao reverter")
        }
        setIsReverting(false)
    }, [revertTarget, partnerId, revertReason, storeId, notifySuccess, notifyError, router])

    if (planGate) {
        return (
            <FadeIn className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300">
                <div className="flex flex-col items-center justify-center text-center min-h-[400px] px-4">
                    <IconPlaceholder
                        placeholderType="image"
                        imageSrc="https://img.dudit.com.br/static/mascots/NotasFiscais.png"
                        imageAlt="Recurso bloqueado"
                        title="Importação XML (NF-e)"
                        subtitle="Importe produtos de notas fiscais eletrônicas. Disponível nos planos Crescer e Escalar."
                        itemButton={{
                            text: "Fazer upgrade",
                            action: () => openPlanUpgrade(planGate.requiredPlanSlug)
                        }}
                    />
                </div>
            </FadeIn>
        )
    }

    return (
        <div className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300">
            {!isPreviewView && (
                <ListContent
                    key={listViewKey}
                    imports={imports}
                    search={search}
                    setSearch={setSearch}
                    page={page}
                    setPage={setPage}
                    activeTab={activeTab}
                    handleTabChange={handleTabChange}
                    filtered={filtered}
                    totalPages={totalPages}
                    paginated={paginated}
                    hasActiveFilters={hasActiveFilters}
                    effectiveViewMode={effectiveViewMode}
                    viewMode={viewMode}
                    setViewMode={setViewMode}
                    selection={selection}
                    handleSelect={handleSelect}
                    handleSelectAll={handleSelectAll}
                    handleClearFilters={handleClearFilters}
                    handleOpenDetail={handleOpenDetail}
                    onRevert={handleOpenRevert}
                    showUploadModal={showUploadModal}
                    setShowUploadModal={setShowUploadModal}
                    handleUploadModalSuccess={handleUploadModalSuccess}
                    partnerId={partnerId}
                    storeId={storeId}
                    sortConfig={sortConfig}
                    handleSort={handleSort}
                    onExport={handleExport}
                    isExporting={isExporting}
                />
            )}
            <AnimatePresence mode="wait">
                {isPreviewView && (
                    <FadeIn key={previewKey} className="w-full h-full">
                        <ImportPreviewView
                            importId={previewImportId}
                            partnerId={partnerId}
                            storeId={storeId}
                            onBack={handleBackFromPreview}
                            onComplete={handleComplete}
                            reimported={reimportedFlag}
                        />
                    </FadeIn>
                )}
            </AnimatePresence>

            <ExportColumnSelectionModal
                isOpen={columnSelectionModal.isOpen}
                canExportAllColumns={columnSelectionModal.canExportAllColumns}
                onConfirm={handleColumnConfirm}
                onClose={closeColumnSelectionModal}
            />

            <ExportSelectionModal
                isOpen={selectionModal.isOpen}
                selectedCount={selectionModal.selectedCount}
                totalCount={selectionModal.totalCount}
                onExportSelected={handleExportSelected}
                onExportAll={handleExportAll}
                onClose={closeSelectionModal}
            />

            {revertTarget && (
                <DefaultModal isOpen={!!revertTarget} onClose={() => { setRevertTarget(null); setRevertReason("") }} title="Desfazer Importação">
                    <div className="space-y-4">
                        <InfoCard color="red" title="Atenção" message="Esta ação irá desfazer toda a importação, incluindo movimentações de estoque e contas a pagar geradas. Esta operação é irreversível." />
                        <div>
                            <FormTextarea
                                name="revert-reason"
                                value={revertReason}
                                onChange={(e) => setRevertReason(e.target.value)}
                                label="Motivo da reversão"
                                rows={3}
                            />
                        </div>
                        <div className="flex items-center justify-end gap-3 pt-2">
                            <Button variant="outline" onClick={() => { setRevertTarget(null); setRevertReason("") }}>
                                Cancelar
                            </Button>
                            <Button onClick={handleRevert} disabled={isReverting} className="bg-red-600 hover:bg-red-700 text-white">
                                {isReverting ? <span className="flex items-center gap-2"><Spinner size={18} /> Revertendo...</span> : "Confirmar Reversão"}
                            </Button>
                        </div>
                    </div>
                </DefaultModal>
            )}
        </div>
    )
}

// ─── List Content (extracted to ensure consistent hooks) ────────────────

function ListContent({
    imports, search, setSearch, page, setPage, activeTab, handleTabChange,
    filtered, totalPages, paginated, hasActiveFilters, effectiveViewMode,
    viewMode, setViewMode, selection, handleSelect, handleSelectAll,
    handleClearFilters, handleOpenDetail, onRevert, showUploadModal, setShowUploadModal,
    handleUploadModalSuccess, partnerId, storeId, sortConfig, handleSort,
    onExport, isExporting,
}: {
    imports: ImportItem[]; search: string; setSearch: (v: string) => void;
    page: number; setPage: (v: number) => void;
    activeTab: TabType; handleTabChange: (t: TabType) => void;
    filtered: ImportItem[]; totalPages: number; paginated: ImportItem[];
    hasActiveFilters: boolean; effectiveViewMode: "list" | "grid";
    viewMode: "list" | "grid"; setViewMode: (v: "list" | "grid") => void;
    selection: Set<string>; handleSelect: (id: string) => void;
    handleSelectAll: () => void; handleClearFilters: () => void;
    handleOpenDetail: (imp: ImportItem) => void;
    onRevert: (imp: ImportItem) => void;
    showUploadModal: boolean; setShowUploadModal: (v: boolean) => void;
    handleUploadModalSuccess: (importId: string) => void;
    partnerId: string; storeId: string;
    sortConfig: { key: string; direction: "asc" | "desc" } | null;
    handleSort: (key: string) => void;
    onExport: () => void;
    isExporting: boolean;
}) {
    const [scrollState, setScrollState] = useState({ left: false, right: false })
    const tableContainerRef = useRef<HTMLDivElement>(null)

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

    return (
        <FadeIn className="flex flex-col h-full transition-colors duration-300">
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
                        <Button variant="outline" onClick={onExport} disabled={isExporting} leftIcon={<ExportFileIcon size={18} />}>
                            {isExporting ? "Exportando..." : "Exportar"}
                        </Button>
                        <Button onClick={() => setShowUploadModal(true)} leftIcon={<UploadIcon size={18} />} >
                            Importar XML
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
                            <Input name="search" placeholder="Buscar..." value={search}
                                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
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
                                <Input name="search" placeholder="Buscar notas..." value={search}
                                    onChange={(e) => { setSearch(e.target.value); setPage(1) }}
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
                                    imageSrc={hasActiveFilters ? "https://img.dudit.com.br/static/mascots/NaoEncontrado.png" : "https://img.dudit.com.br/static/mascots/NotasFiscais.png"}
                                    imageAlt="Sem importações"
                                    title={hasActiveFilters ? "Nenhuma importação encontrada" : "Sem importações"}
                                    subtitle={hasActiveFilters ? "Tente ajustar seus filtros ou termos de busca." : "Suas notas importadas aparecerão aqui."}
                                    itemButton={!hasActiveFilters ? { text: "Importar XML", action: () => setShowUploadModal(true) } : { text: "Limpar filtros", action: handleClearFilters, variant: "outline" }}
                                />
                            </FadeIn>
                        ) : (
                            <FadeIn key={activeTab + effectiveViewMode} className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300">
                                <SelectionBanner
                                    selectedCount={selection.size} totalCount={filtered.length}
                                    onSelectAll={() => handleSelectAll()}
                                    onClearSelection={() => handleSelectAll()}
                                    itemName="importações" singularItemName="importação"
                                />

                                {effectiveViewMode === "grid" ? (
                                    <div className="grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-4">
                                        {paginated.map((imp) => (
                                            <ImportGridCard key={imp.id} item={imp} selected={selection.has(imp.id)}
                                                onSelect={() => handleSelect(imp.id)} onClick={() => handleOpenDetail(imp)} onRevert={onRevert} />
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
                                                                <Checkbox checked={selection.size === paginated.length && paginated.length > 0} onChange={handleSelectAll} className="bg-white dark:bg-dark-background" />
                                                            </div>
                                                        </th>
                                                        {COLUMNS.map((col, idx) => {
                                                            const isSorted = sortConfig?.key === col.id
                                                            const justifyClass = col.align === "right" ? "justify-end" : col.align === "center" ? "justify-center" : "justify-start"
                                                            return (
                                                                <th key={col.id}
                                                                    onClick={col.id === "actions" ? undefined : () => handleSort(col.id)}
                                                                    className={`py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 ${idx === COLUMNS.length - 1 ? "rounded-r-lg" : ""} ${col.id !== "actions" ? "cursor-pointer select-none group" : ""}`}
                                                                    style={{ width: col.width }}>
                                                                    <div className={`relative flex items-center gap-1.5 ${justifyClass}`}>
                                                                        <span>{col.label}</span>
                                                                        {col.id !== "actions" && (
                                                                            <div className="flex items-center">
                                                                                <ArrowUpDownIcon
                                                                                    size={14}
                                                                                    className={`transition-all duration-200 ${isSorted
                                                                                        ? "text-brand-dark dark:text-dark-heading opacity-100 block"
                                                                                        : "text-brand-inactive-text hidden group-hover:block opacity-40"
                                                                                        } ${isSorted && sortConfig?.direction === "desc" ? "rotate-180" : ""
                                                                                        }`}
                                                                                />
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </th>
                                                            )
                                                        })}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {paginated.map((imp) => (
                                                        <ImportListRow key={imp.id} item={imp} selected={selection.has(imp.id)}
                                                            onSelect={() => handleSelect(imp.id)} onClick={() => handleOpenDetail(imp)} onRevert={onRevert} />
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </FadeIn>
                        )}
                    </AnimatePresence>
                </div>

                {filtered.length > 0 && (
                    <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
                )}
            </div>

            <DefaultModal isOpen={showUploadModal} onClose={() => setShowUploadModal(false)} title="Importar XML" maxWidth="2xl">
                <XmlUploadForm partnerId={partnerId} storeId={storeId}
                    onSuccess={handleUploadModalSuccess} onCancel={() => setShowUploadModal(false)} />
            </DefaultModal>
        </FadeIn>
    )
}

// ─── List Row ───────────────────────────────────────────────────────────────

function ImportListRow({ item, selected, onSelect, onClick, onRevert }: { item: ImportItem; selected: boolean; onSelect: () => void; onClick: () => void; onRevert?: (imp: ImportItem) => void }) {
    const meta = STATUS_META[item.status] || { label: item.status, variant: "gray" as const }
    const dateStr = item.created_at
        ? new Date(item.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
        : "-"
    const timeStr = item.created_at
        ? new Date(item.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
        : ""

    return (
        <motion.tr
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="group hover:[&:not(:has(.action-btn:hover))]:bg-brand-gray dark:hover:[&:not(:has(.action-btn:hover))]:bg-dark-border/20 transition-colors cursor-pointer bg-white dark:bg-dark-background"
            onClick={() => onClick()}>
            <td className="py-2 pl-6 pr-0 border-b border-brand-border dark:border-dark-border w-14" onClick={(e) => e.stopPropagation()}>
                <Checkbox checked={selected} onChange={() => onSelect()} />
            </td>
            <td className="p-2 border-b border-brand-border dark:border-dark-border">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                        <FileTextIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                    </div>
                    <div className="flex flex-col text-left min-w-0">
                        <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading truncate max-w-[200px] leading-tight mb-0.5">
                            NF-e {item.invoice_number || "Sem número"}
                        </span>
                        <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate max-w-[200px]">
                            Chave: {item.access_key?.slice(-8) || "-"}
                        </span>
                    </div>
                </div>
            </td>
            <td className="p-2 border-b border-brand-border dark:border-dark-border">
                <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading truncate block max-w-[180px]">{item.supplier_name || "-"}</span>
            </td>
            <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body">{item.imported_items || 0}/{item.items_count || 0}</span>
            </td>
            <td className="p-2 border-b border-brand-border dark:border-dark-border text-right">
                <div className="flex flex-col">
                    <span className="font-medium text-[13px] text-brand-dark dark:text-dark-heading">{dateStr}</span>
                    {timeStr && <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">{timeStr}</span>}
                </div>
            </td>
            <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                <div className="flex justify-center"><Badge variant={meta.variant}>{meta.label}</Badge></div>
            </td>
            <td className="p-2 border-b border-brand-border dark:border-dark-border" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-center action-btn">
                    {item.status === "completed" && onRevert && (
                        <ActionsDropdown>
                            <DropdownItem onClick={() => onRevert(item)}>
                                <ReloadIcon size={18} /> Desfazer importação
                            </DropdownItem>
                        </ActionsDropdown>
                    )}
                </div>
            </td>
        </motion.tr>
    )
}

// ─── Grid Card ──────────────────────────────────────────────────────────────

function ImportGridCard({ item, selected, onSelect, onClick, onRevert }: { item: ImportItem; selected: boolean; onSelect: () => void; onClick: () => void; onRevert?: (imp: ImportItem) => void }) {
    const meta = STATUS_META[item.status] || { label: item.status, variant: "gray" as const }

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 hover:border-brand-dark/30 dark:hover:border-brand-gray/30 transition-all duration-300 cursor-pointer group flex flex-col h-full relative"
            onClick={() => onClick()}>
            <div className="flex gap-4 mb-2">
                <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                    <FileTextIcon className="w-6 h-6 text-brand-inactive-text dark:text-dark-body" />
                </div>
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <div className="flex items-center gap-2 min-w-0 pr-1">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                            <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading leading-tight truncate">NF-e {item.invoice_number || "-"}</h3>
                            <Tooltip text={`Status: ${meta.label}`}>
                                <Badge variant={meta.variant} className="whitespace-nowrap scale-90 shrink-0" />
                            </Tooltip>
                        </div>
                        <div className="shrink-0 -mt-1 -mr-1" onClick={(e) => e.stopPropagation()}>
                            <Checkbox checked={selected} onChange={() => onSelect()} />
                        </div>
                    </div>
                    <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate">{item.supplier_name || "Fornecedor"}</span>
                </div>
            </div>
            <div className="flex items-center justify-between mt-auto pt-3 border-t border-brand-border dark:border-dark-border">
                <div className="flex items-center gap-2 text-xs text-brand-inactive-text dark:text-dark-body">
                    <span>{item.imported_items || 0}/{item.items_count || 0} itens</span>
                </div>
                <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                    {item.status === "completed" && onRevert && (
                        <ActionsDropdown>
                            <DropdownItem onClick={() => onRevert(item)}>
                                <ReloadIcon size={18} /> Desfazer importação
                            </DropdownItem>
                        </ActionsDropdown>
                    )}
                </div>
            </div>
        </motion.div>
    )
}

// ─── Upload Form ────────────────────────────────────────────────────────────

function XmlUploadForm({ partnerId, storeId, onSuccess, onCancel }: { partnerId: string; storeId: string; onSuccess: (importId: string, reimported?: boolean) => void; onCancel: () => void }) {
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
                if (result.reimported) {
                    notifySuccess("XML reimportado!", `${result.preview.items.length} produto(s) encontrados. Esta nota já havia sido importada e revertida anteriormente.`)
                } else {
                    notifySuccess("XML processado!", `${result.preview.items.length} produto(s) encontrados.`)
                }
                onSuccess(result.preview.xml_import_id, result.reimported)
            }
        } catch (err: any) { setError(err.message || "Erro ao processar arquivo") }
        finally { setIsUploading(false) }
    }

    return (
        <div className="space-y-4">
            <div
                className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center min-h-[180px] transition-colors cursor-pointer ${file ? "border-brand-green bg-brand-green-light/50 dark:bg-emerald-900/20" : "border-brand-border dark:border-dark-border bg-brand-gray dark:bg-dark-background/50"}`}
                onClick={() => document.getElementById("xml-upload-input")?.click()}
            >
                <input id="xml-upload-input" type="file" accept=".xml" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f) }} />
                {!file ? (
                    <IconPlaceholder
                        icon={FileIcon}
                        title="Envie o XML da NF-e"
                        subtitle="Selecione o arquivo XML da Nota Fiscal Eletrônica para importação"
                    />
                ) : (
                    <IconPlaceholder
                        icon={CheckCircleIcon}
                        title={file.name}
                        subtitle={`${(file.size / 1024).toFixed(1)} KB`}
                        itemButton={{
                            text: "Remover",
                            action: () => { setFile(null) }
                        }}
                    />
                )}
            </div>
            {error && <InfoCard color="red" message={error} />}
            <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={onCancel}>Cancelar</Button>
                <Button onClick={handleSubmit} disabled={!file || isUploading}>
                    {isUploading ? <span className="flex items-center gap-2"><Spinner size={18} /> Processando...</span> : "Analisar XML"}
                </Button>
            </div>
        </div>
    )
}

// ─── SidebarCard ────────────────────────────────────────────────────────────

const SidebarCard = ({ children, hasTopStrip = true }: { children: React.ReactNode; hasTopStrip?: boolean }) => (
    <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden">
        {hasTopStrip && <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border rounded-t-2xl" />}
        {children}
    </div>
)

// ─── Import Preview View ────────────────────────────────────────────────────

function ImportPreviewView({ importId, partnerId, storeId, onBack, onComplete, reimported }: {
    importId: string; partnerId: string; storeId: string; onBack: () => void; onComplete: () => void; reimported?: boolean
}) {
    const [preview, setPreview] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [isConfirming, setIsConfirming] = useState(false)
    const [decisions, setDecisions] = useState<Record<string, any>>({})
    const [supplierActions, setSupplierActions] = useState<Record<string, string>>({})
    const [isScrolled, setIsScrolled] = useState(false)
    const [createPayables, setCreatePayables] = useState(true)
    const [isReverting, setIsReverting] = useState(false)
    const [showRevertModal, setShowRevertModal] = useState(false)
    const [revertReason, setRevertReason] = useState("")
    const [showSummaryModal, setShowSummaryModal] = useState(false)
    const [financeData, setFinanceData] = useState<any[] | null>(null)
    const [stockData, setStockData] = useState<any[] | null>(null)
    const [detailTab, setDetailTab] = useState("details")
    const [historyEntries, setHistoryEntries] = useState<any[]>([])
    const [historyLoading, setHistoryLoading] = useState(false)
    const [historyLoaded, setHistoryLoaded] = useState(false)
    const [itemsPage, setItemsPage] = useState(1)
    const [actionModal, setActionModal] = useState<{ itemId: string; kind: "stock" | "cost" | "decision" } | null>(null)
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const isTabletOrMobile = useMediaQuery("(max-width: 1023px)")
    const ITEMS_PER_PAGE = 10
    const { success: notifySuccess, error: notifyError } = useNotification()
    const { setHeaderOverride } = useSidebar()

    useEffect(() => {
        const numero = preview?.invoice?.numero
        setHeaderOverride({
            title: numero ? `NF-e ${numero}` : "Importar XML",
            onBack,
            isSubPage: true
        })
        return () => setHeaderOverride(null)
    }, [preview?.invoice?.numero, onBack, setHeaderOverride])

    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
    }, [])

    useEffect(() => {
        let cancelled = false
        getImportPreviewAction(importId, partnerId, storeId).then((res) => {
            if (cancelled) return
            if (res.success && res.preview) {
                setPreview(res.preview)
                const initial: Record<string, any> = {}
                const initialSupplier: Record<string, string> = {}
                for (const item of res.preview.items) {
                    initial[item.id] = {
                        decision: item.match_status === "new" ? "create_product" : item.match_status === "similar" ? "keep_product" : "keep_product",
                        stock_action: "add", cost_action: "update",
                    }
                    const hasSupplierConflict = (item.conflicts || []).some((c: any) => c.campo === "fornecedor_diferente")
                    if (hasSupplierConflict) {
                        initialSupplier[item.id] = "keep"
                    }
                }
                setDecisions(initial)
                setSupplierActions(initialSupplier)
                // Load finance + stock data for completed/reversed imports
                const status = res.preview.status
                if (status === "completed" || status === "reversed") {
                    getImportFinanceAction(importId, partnerId).then(fr => {
                        if (!cancelled && fr.success) setFinanceData(fr.transactions || [])
                    })
                    getImportStockMovementsAction(importId, partnerId).then(sr => {
                        if (!cancelled && sr.success) setStockData(sr.movements || [])
                    })
                }
            }
            setLoading(false)
        }).catch(() => { if (!cancelled) setLoading(false) })
        return () => { cancelled = true }
    }, [importId, partnerId])

    useEffect(() => {
        let cancelled = false
        async function loadHistory() {
            if (detailTab !== "history" || historyLoaded) return
            setHistoryLoading(true)
            const res = await getXmlImportTimelineAction(importId, partnerId)
            if (!cancelled) {
                if (res.success) {
                    setHistoryEntries(res.data || [])
                    setHistoryLoaded(true)
                } else {
                    notifyError("Erro", res.error || "Erro ao carregar histórico")
                }
                setHistoryLoading(false)
            }
        }
        loadHistory()
        return () => { cancelled = true }
    }, [detailTab, historyLoaded, importId, partnerId, notifyError])

    const getDecision = (itemId: string) => decisions[itemId] || { decision: "keep_product", stock_action: "add", cost_action: "update" }

    const handleConfirm = async () => {
        setIsConfirming(true)
        const arr = preview.items.map((item: any) => {
            const d = getDecision(item.id)
            const hasSupplierConflict = (item.conflicts || []).some((c: any) => c.campo === "fornecedor_diferente")
            return {
                item_id: item.id,
                decision: d.decision,
                product_id: item.matched_product_id || undefined,
                stock_action: d.stock_action,
                cost_action: d.cost_action,
                supplier_action: hasSupplierConflict ? (supplierActions[item.id] || "keep") : undefined,
            }
        })
        const result = await confirmImportAction(importId, partnerId, storeId, arr, createPayables)
        if (result.success) {
            notifySuccess("Importação concluída!", `${result.imported} produto(s) importados.`)
            onComplete()
        } else {
            notifyError("Erro", result.error || "Falha ao importar")
        }
        setIsConfirming(false)
    }

    const handleRevert = async () => {
        setIsReverting(true)
        const result = await revertImportAction(importId, partnerId, revertReason, storeId)
        if (result.success) {
            notifySuccess("Importação revertida!", result.message)
            setShowRevertModal(false)
            setRevertReason("")
            window.location.reload()
        } else {
            notifyError("Erro", result.error || "Falha ao reverter")
        }
        setIsReverting(false)
    }

    if (loading) {
        return <ERPDetailLoading key="loading-xml-preview" />
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
    const isReversed = preview.status === "reversed"

    const summaryCounts = {
        total: preview.items?.length || 0,
        novos: preview.items?.filter((i: any) => i.match_status === "new").length || 0,
        existentes: preview.items?.filter((i: any) => i.match_status === "matched" || i.match_status === "similar").length || 0,
        conflitos: preview.items?.filter((i: any) => i.match_status === "similar").length || 0,
        estoque: preview.items?.filter((i: any) => i.match_status !== "skipped").reduce((s: number, i: any) => s + (i.raw_quantity || 0), 0) || 0,
        duplicatas: preview.duplicatas?.length || 0,
    }

    const safeDate = (d: string) => {
        if (!d) return "-"
        try {
            const dt = new Date(d)
            if (isNaN(dt.getTime())) return d
            return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
        } catch { return d }
    }

    const safeDateTime = (d: string) => {
        if (!d) return "-"
        try {
            const dt = new Date(d)
            if (isNaN(dt.getTime())) return d
            return dt.toLocaleString("pt-BR", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })
        } catch { return d }
    }

    const safeConflicts = (c: any) => Array.isArray(c) ? c : []

    const itemsTotalPages = Math.max(1, Math.ceil((preview.items?.length || 0) / ITEMS_PER_PAGE))
    const paginatedItems = (preview.items || []).slice((itemsPage - 1) * ITEMS_PER_PAGE, itemsPage * ITEMS_PER_PAGE)

    const actionItem = actionModal ? preview.items.find((i: any) => i.id === actionModal.itemId) : null
    const actionDecision = actionItem ? getDecision(actionItem.id) : null

    return (
        <FadeIn>
            <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden">
                <Tabs value={detailTab} onValueChange={setDetailTab} className="flex flex-col h-full w-full">
                    <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-20 md:pb-0">

                        {/* Sticky Header */}
                        <div className="sticky top-0 z-30 w-full max-w-[1300px] mx-auto bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out">
                            <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">

                                {/* Back button - desktop only */}
                                <div className={`absolute -left-12 top-7 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                                    <Button variant="filled" onClick={onBack} className="w-10 h-10 p-0 flex items-center justify-center">
                                        <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                    </Button>
                                </div>

                                {/* Title row */}
                                <div className="hidden md:flex items-start justify-between md:py-0 md:mb-0">
                                    <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                        <h1 className={`font-bold transition-all duration-500 ease-in-out flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                            <span className="truncate">NF-e {preview.invoice.numero || "-"}</span>
                                            {isPreview && <Badge variant="orange" className="whitespace-nowrap scale-90 shrink-0">Revisar</Badge>}
                                            {isFailed && <Badge variant="red" className="whitespace-nowrap scale-90 shrink-0">Erro</Badge>}
                                            {isCompleted && !isReversed && <Badge variant="green" className="whitespace-nowrap scale-90 shrink-0">Importado</Badge>}
                                            {isReversed && <Badge variant="gray" className="whitespace-nowrap scale-90 shrink-0">Revertido</Badge>}
                                        </h1>
                                        <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                            <span>{preview.supplier.name}</span>
                                            <span className="text-brand-inactive-text dark:text-dark-body opacity-50">•</span>
                                            <span>{preview.items.length} produto(s)</span>
                                        </div>
                                    </div>

                                    {/* Desktop action buttons */}
                                    <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                                        {isPreview && (
                                            <div className="flex items-center gap-3 shrink-0 ml-3">
                                                <Button onClick={handleConfirm} disabled={isConfirming}>
                                                    {isConfirming ? <span className="flex items-center gap-2"><Spinner size={18} /> Importando...</span> : "Confirmar Importação"}
                                                </Button>
                                            </div>
                                        )}
                                        {isCompleted && !isReversed && (
                                            <div className="flex items-center gap-3 shrink-0 ml-3">
                                                <Button variant="outlinered" onClick={() => setShowRevertModal(true)} leftIcon={<ReloadIcon size={18} />}>
                                                    Desfazer Importação
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Tabs Navigation */}
                                <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                                    <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                        <TabsTrigger value="details">Detalhes</TabsTrigger>
                                        <TabsTrigger value="history">Histórico</TabsTrigger>
                                    </TabsList>
                                </div>
                            </div>
                        </div>

                        <div className="px-3 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
                            <TabsContent value="details" className="mt-0">
                                <FadeIn key="details">
                                    <div className="grid grid-cols-12 gap-y-8 xl:gap-y-0">
                                        <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12">
                                            {/* Mobile/Tablet: Summary + InfoCards acima do card da NF-e */}
                                            <div className="xl:hidden mb-6">
                                                <h3 className="font-bold text-brand-dark dark:text-dark-heading mb-3 text-base">Resumo</h3>
                                                <ListItem
                                                    icon={FileTextIcon}
                                                    title={`${summaryCounts.total} ${summaryCounts.total === 1 ? "item" : "itens"}`}
                                                    description={preview.invoice.valor_total > 0 ? `R$ ${preview.invoice.valor_total.toFixed(2)}` : "Sem valor total"}
                                                    showChevron={true}
                                                    onClick={() => setShowSummaryModal(true)}
                                                    className="border-0 bg-transparent px-0 hover:bg-transparent"
                                                />
                                            </div>

                                            {(isFailed && preview.errors?.length > 0) || (isReversed && preview.reversed_at) || reimported ? (
                                                <div className="mb-6 space-y-3">
                                                    {isFailed && preview.errors?.length > 0 && (
                                                        <InfoCard color="red" title="Erro na importação" message={
                                                            <ul className="list-disc pl-4 text-sm space-y-1">
                                                                {preview.errors.map((e: any, i: number) => (
                                                                    <li key={i}>{typeof e === "string" ? e : e.error || ""}</li>
                                                                ))}
                                                            </ul>
                                                        } />
                                                    )}
                                                    {isReversed && preview.reversed_at && (
                                                        <InfoCard color="red" title={`Importação Revertida em ${safeDateTime(preview.reversed_at)}`} message={
                                                            <p>{preview.reversal_reason}</p>
                                                        } />
                                                    )}
                                                    {reimported && (
                                                        <InfoCard
                                                            color="orange"
                                                            message="Este XML já foi importado anteriormente e teve sua importação revertida. Revise os dados e confirme para importar novamente."
                                                        />
                                                    )}
                                                </div>
                                            ) : null}

                                            <div className="border border-brand-border dark:border-dark-border rounded-2xl overflow-hidden mb-8">
                                                <div className="bg-brand-gray dark:bg-dark-border/30 p-6 border-b border-brand-border dark:border-dark-border">
                                                    <div className="flex items-start justify-between">
                                                        <div className="flex flex-col gap-1.5">
                                                            <div className="flex items-center gap-1.5 font-bold text-brand-dark dark:text-dark-heading text-[16px]">
                                                                <span>Série {preview.invoice.serie || "-"} | N° {preview.invoice.numero || "-"}</span>
                                                                <span className="hidden md:inline-flex items-center gap-1.5">
                                                                    {preview.invoice.ambiente === "1" && <Badge variant="green" icon={null}>Produção</Badge>}
                                                                    {preview.invoice.ambiente === "2" && <Badge variant="orange" icon={null}>Homologação</Badge>}
                                                                </span>
                                                            </div>
                                                            {(preview.invoice.modelo || preview.invoice.protocolo || preview.invoice.data_saida) && (
                                                                <div className="hidden md:flex items-center gap-1.5 text-xs text-brand-inactive-text dark:text-dark-body">
                                                                    {preview.invoice.modelo && <span>Mod {preview.invoice.modelo}</span>}
                                                                    {(preview.invoice.modelo && (preview.invoice.protocolo || preview.invoice.data_saida)) && <span>•</span>}
                                                                    {preview.invoice.protocolo && <span>Prot {preview.invoice.protocolo}</span>}
                                                                    {(preview.invoice.protocolo && preview.invoice.data_saida) && <span>•</span>}
                                                                    {preview.invoice.data_saida && <span>Saída: {safeDate(preview.invoice.data_saida)}</span>}
                                                                </div>
                                                            )}
                                                            {preview.invoice.valor_total > 0 && (
                                                                <div className="md:hidden mt-1.5">
                                                                    <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">Valor Total</span>
                                                                    <p className="font-bold text-brand-dark dark:text-dark-heading text-[16px]">R$ {preview.invoice.valor_total.toFixed(2)}</p>
                                                                </div>
                                                            )}
                                                        </div>
                                                        {preview.invoice.valor_total > 0 && (
                                                            <div className="hidden md:block text-right">
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
                                                            <span className="text-xs text-brand-dark dark:text-dark-heading break-all">{preview.invoice.chave}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            <FormSection title="Produtos" hasSeparator>
                                                <div>
                                                    {isTabletOrMobile ? (
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                            {paginatedItems.map((item: any) => {
                                                                const d = getDecision(item.id)
                                                                return (
                                                                    <ImportItemGridCard
                                                                        key={item.id}
                                                                        item={item}
                                                                        d={d}
                                                                        isPreview={isPreview}
                                                                        onOpenAction={(kind) => setActionModal({ itemId: item.id, kind })}
                                                                        supplierName={preview.supplier?.name}
                                                                        supplierAction={supplierActions[item.id]}
                                                                        onSupplierAction={(v) => setSupplierActions((prev: any) => ({ ...prev, [item.id]: v }))}
                                                                    />
                                                                )
                                                            })}
                                                        </div>
                                                    ) : (
                                                        <div className="w-full overflow-hidden">
                                                            <table className="w-full text-left border-separate border-spacing-0">
                                                                <thead>
                                                                    <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                                        <th className="py-3 px-4 rounded-l-lg bg-brand-gray dark:bg-dark-border/50 text-[13px] font-medium text-gray-500 dark:text-dark-body">Produto</th>
                                                                        <th className="py-3 px-4 bg-brand-gray dark:bg-dark-border/50 text-[13px] font-medium text-gray-500 dark:text-dark-body">Qtd</th>
                                                                        <th className="py-3 px-4 bg-brand-gray dark:bg-dark-border/50 text-[13px] font-medium text-gray-500 dark:text-dark-body">Custo</th>
                                                                        <th className="py-3 px-4 rounded-r-lg bg-brand-gray dark:bg-dark-border/50 text-[13px] font-medium text-gray-500 dark:text-dark-body text-right">Ações</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {paginatedItems.map((item: any) => {
                                                                        const d = getDecision(item.id)
                                                                        return (
                                                                            <ImportItemListRow
                                                                                key={item.id}
                                                                                item={item}
                                                                                d={d}
                                                                                isPreview={isPreview}
                                                                                onOpenAction={(kind) => setActionModal({ itemId: item.id, kind })}
                                                                                supplierName={preview.supplier?.name}
                                                                                supplierAction={supplierActions[item.id]}
                                                                                onSupplierAction={(v) => setSupplierActions((prev: any) => ({ ...prev, [item.id]: v }))}
                                                                            />
                                                                        )
                                                                    })}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    )}
                                                    {paginatedItems.length > 0 && itemsTotalPages > 1 && (
                                                        <Pagination currentPage={itemsPage} totalPages={itemsTotalPages} onPageChange={setItemsPage} inline />
                                                    )}
                                                </div>
                                            </FormSection>
                                        </div>

                                        <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 border-l-0 xl:border-l border-brand-border dark:border-dark-border space-y-6">
                                            {/* Desktop: SidebarCard with summary */}
                                            <div className="hidden xl:block">
                                                <SidebarCard>
                                                    <h3 className="font-bold text-brand-dark dark:text-dark-heading mb-4">Resumo</h3>
                                                    <div className="space-y-3 text-sm">
                                                        {/* Itens */}
                                                        <div className="flex items-center justify-between gap-3">
                                                            <span className="text-brand-inactive-text dark:text-dark-body">Total de Itens</span>
                                                            <span className="font-bold text-brand-dark dark:text-dark-heading">{summaryCounts.total}</span>
                                                        </div>
                                                        {isPreview && (
                                                            <>
                                                                <div className="flex items-center justify-between gap-3">
                                                                    <span className="text-brand-inactive-text dark:text-dark-body">Novos</span>
                                                                    <span className="font-bold text-blue-600">{summaryCounts.novos}</span>
                                                                </div>
                                                                <div className="flex items-center justify-between gap-3">
                                                                    <span className="text-brand-inactive-text dark:text-dark-body">Existentes</span>
                                                                    <span className="font-bold text-brand-dark dark:text-dark-heading">{summaryCounts.existentes}</span>
                                                                </div>
                                                                {summaryCounts.conflitos > 0 && (
                                                                    <div className="flex items-center justify-between gap-3">
                                                                        <span className="text-brand-inactive-text dark:text-dark-body">Conflitos</span>
                                                                        <span className="font-bold text-orange-500">{summaryCounts.conflitos}</span>
                                                                    </div>
                                                                )}
                                                                <div className="flex items-center justify-between gap-3">
                                                                    <span className="text-brand-inactive-text dark:text-dark-body">Movimentações</span>
                                                                    <span className="font-bold text-brand-dark dark:text-dark-heading">{preview.items.filter((i: any) => i.match_status !== "skipped").length}</span>
                                                                </div>
                                                                <div className="flex items-center justify-between gap-3">
                                                                    <span className="text-brand-inactive-text dark:text-dark-body">Parcelas</span>
                                                                    <span className="font-bold text-brand-dark dark:text-dark-heading">{summaryCounts.duplicatas || "1"}</span>
                                                                </div>
                                                            </>
                                                        )}
                                                        {preview.invoice.valor_total > 0 && (
                                                            <div className="flex items-center justify-between gap-3">
                                                                <span className="text-brand-inactive-text dark:text-dark-body">Valor Total</span>
                                                                <span className="font-bold text-brand-dark dark:text-dark-heading">R$ {preview.invoice.valor_total.toFixed(2)}</span>
                                                            </div>
                                                        )}
                                                        {preview.invoice.data_emissao && (
                                                            <div className="flex items-center justify-between gap-3">
                                                                <span className="text-brand-inactive-text dark:text-dark-body">Data de Emissão</span>
                                                                <span className="font-bold text-brand-dark dark:text-dark-heading">{safeDate(preview.invoice.data_emissao)}</span>
                                                            </div>
                                                        )}
                                                        {preview.created_at && (
                                                            <div className="flex items-center justify-between gap-3">
                                                                <span className="text-brand-inactive-text dark:text-dark-body">Importado em</span>
                                                                <span className="font-bold text-brand-dark dark:text-dark-heading">{safeDateTime(preview.created_at)}</span>
                                                            </div>
                                                        )}
                                                        {/* Duplicatas / contas a pagar */}
                                                        {isPreview && preview.duplicatas?.length > 0 && (
                                                            <div className="pt-2 border-t border-brand-border dark:border-dark-border">
                                                                <span className="text-xs text-brand-inactive-text dark:text-dark-body block mb-2">Duplicatas</span>
                                                                <div className="space-y-1">
                                                                    {preview.duplicatas.map((d: any, i: number) => (
                                                                        <div key={i} className="flex items-center justify-between text-xs">
                                                                            <span className="text-brand-dark dark:text-dark-heading">Parcela {d.numero || i + 1}</span>
                                                                            <div className="text-right">
                                                                                <span className="font-bold text-brand-dark dark:text-dark-heading">R$ {Number(d.valor || 0).toFixed(2)}</span>
                                                                                <span className="text-brand-inactive-text ml-1">{d.vencimento ? safeDate(d.vencimento) : ""}</span>
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                        {isPreview && (
                                                            <div className="pt-2 border-t border-brand-border dark:border-dark-border">
                                                                <label className="flex items-center gap-2 cursor-pointer">
                                                                    <Checkbox checked={createPayables} onChange={setCreatePayables} />
                                                                    <span className="text-sm font-medium text-brand-dark dark:text-dark-heading">Criar contas a pagar</span>
                                                                </label>
                                                                <p className="text-xs text-brand-inactive-text mt-1 ml-6">
                                                                    {preview.duplicatas?.length > 0
                                                                        ? `${preview.duplicatas.length} parcela(s) da NF-e`
                                                                        : "Uma conta com vencimento em 30 dias"}
                                                                </p>
                                                            </div>
                                                        )}
                                                        {/* Finance data for completed/reversed imports */}
                                                        {(isCompleted || isReversed) && financeData && financeData.length > 0 && (
                                                            <div className="pt-2 border-t border-brand-border dark:border-dark-border">
                                                                <span className="text-xs text-brand-inactive-text dark:text-dark-body block mb-2">Contas a Pagar</span>
                                                                <div className="space-y-1">
                                                                    {financeData.map((t: any, i: number) => (
                                                                        <div key={i} className="flex items-center justify-between text-xs">
                                                                            <div className="flex items-center gap-1">
                                                                                <span className="text-brand-dark dark:text-dark-heading font-medium">R$ {Number(t.amount || 0).toFixed(2)}</span>
                                                                                <Badge variant={t.status === "paid" ? "green" : t.status === "cancelled" ? "gray" : "orange"}>
                                                                                    {t.status === "paid" ? "Pago" : t.status === "cancelled" ? "Cancelado" : "Pendente"}
                                                                                </Badge>
                                                                            </div>
                                                                            <span className="text-brand-inactive-text">{t.due_date ? safeDate(t.due_date) : ""}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                        {/* Stock movements for completed/reversed imports */}
                                                        {(isCompleted || isReversed) && stockData && stockData.length > 0 && (
                                                            <div className="pt-2 border-t border-brand-border dark:border-dark-border">
                                                                <span className="text-xs text-brand-inactive-text dark:text-dark-body block mb-2">Movimentações de Estoque</span>
                                                                <div className="space-y-1">
                                                                    {stockData.map((m: any, i: number) => (
                                                                        <div key={i} className="text-xs text-brand-dark dark:text-dark-heading">
                                                                            <span className="font-medium">
                                                                                {m.movement_type === "adjustment" ? "Ajuste (reversão)" : "Entrada"}:
                                                                            </span>{' '}
                                                                            {m.stock_movement_items?.map((smi: any, j: number) => (
                                                                                <span key={j}>
                                                                                    {smi.quantity > 0 ? "+" : ""}{formatQuantityWithUnit(smi.quantity, smi.unit || smi.raw_unit)}
                                                                                </span>
                                                                            ))}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </SidebarCard>
                                            </div>
                                        </div>
                                    </div>
                                </FadeIn>
                            </TabsContent>

                            <TabsContent value="history" className="mt-0">
                                <XmlImportHistoryTab events={historyEntries} loading={historyLoading} />
                            </TabsContent>
                        </div>
                    </div>
                </Tabs>
            </div>

            {isPreview && (
                <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 flex gap-3">
                    <Button variant="outline" className="flex-1 h-12" onClick={onBack}>
                        <ChevronLeftIcon className="w-5 h-5" /> Voltar
                    </Button>
                    <Button className="flex-1 h-12" onClick={handleConfirm} disabled={isConfirming}>
                        {isConfirming ? <span className="flex items-center gap-2"><Spinner size={18} /> Importando...</span> : "Confirmar"}
                    </Button>
                </div>
            )}

            {/* Mobile/Tablet: Summary modal */}
            <DefaultModal isOpen={showSummaryModal} onClose={() => setShowSummaryModal(false)} title="Resumo">
                <div className="space-y-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-brand-inactive-text dark:text-dark-body">Total de Itens</span>
                        <span className="font-bold text-brand-dark dark:text-dark-heading">{summaryCounts.total}</span>
                    </div>
                    {isPreview && (
                        <>
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-brand-inactive-text dark:text-dark-body">Novos</span>
                                <span className="font-bold text-blue-600">{summaryCounts.novos}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-brand-inactive-text dark:text-dark-body">Existentes</span>
                                <span className="font-bold text-brand-dark dark:text-dark-heading">{summaryCounts.existentes}</span>
                            </div>
                            {summaryCounts.conflitos > 0 && (
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-brand-inactive-text dark:text-dark-body">Conflitos</span>
                                    <span className="font-bold text-orange-500">{summaryCounts.conflitos}</span>
                                </div>
                            )}
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-brand-inactive-text dark:text-dark-body">Movimentações</span>
                                <span className="font-bold text-brand-dark dark:text-dark-heading">{preview.items.filter((i: any) => i.match_status !== "skipped").length}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-brand-inactive-text dark:text-dark-body">Parcelas</span>
                                <span className="font-bold text-brand-dark dark:text-dark-heading">{summaryCounts.duplicatas || "1"}</span>
                            </div>
                        </>
                    )}
                    {preview.invoice.valor_total > 0 && (
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-brand-inactive-text dark:text-dark-body">Valor Total</span>
                            <span className="font-bold text-brand-dark dark:text-dark-heading">R$ {preview.invoice.valor_total.toFixed(2)}</span>
                        </div>
                    )}
                    {preview.invoice.data_emissao && (
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-brand-inactive-text dark:text-dark-body">Data de Emissão</span>
                            <span className="font-bold text-brand-dark dark:text-dark-heading">{safeDate(preview.invoice.data_emissao)}</span>
                        </div>
                    )}
                    {preview.created_at && (
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-brand-inactive-text dark:text-dark-body">Importado em</span>
                            <span className="font-bold text-brand-dark dark:text-dark-heading">{safeDateTime(preview.created_at)}</span>
                        </div>
                    )}
                    {isPreview && preview.duplicatas?.length > 0 && (
                        <div className="pt-2 border-t border-brand-border dark:border-dark-border">
                            <span className="text-xs text-brand-inactive-text dark:text-dark-body block mb-2">Duplicatas</span>
                            <div className="space-y-1">
                                {preview.duplicatas.map((d: any, i: number) => (
                                    <div key={i} className="flex items-center justify-between text-xs">
                                        <span className="text-brand-dark dark:text-dark-heading">Parcela {d.numero || i + 1}</span>
                                        <div className="text-right">
                                            <span className="font-bold text-brand-dark dark:text-dark-heading">R$ {Number(d.valor || 0).toFixed(2)}</span>
                                            <span className="text-brand-inactive-text ml-1">{d.vencimento ? safeDate(d.vencimento) : ""}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    {isPreview && (
                        <div className="pt-2 border-t border-brand-border dark:border-dark-border">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <Checkbox checked={createPayables} onChange={setCreatePayables} />
                                <span className="text-sm font-medium text-brand-dark dark:text-dark-heading">Criar contas a pagar</span>
                            </label>
                            <p className="text-xs text-brand-inactive-text mt-1 ml-6">
                                {preview.duplicatas?.length > 0
                                    ? `${preview.duplicatas.length} parcela(s) da NF-e`
                                    : "Uma conta com vencimento em 30 dias"}
                            </p>
                        </div>
                    )}
                    {(isCompleted || isReversed) && financeData && financeData.length > 0 && (
                        <div className="pt-2 border-t border-brand-border dark:border-dark-border">
                            <span className="text-xs text-brand-inactive-text dark:text-dark-body block mb-2">Contas a Pagar</span>
                            <div className="space-y-1">
                                {financeData.map((t: any, i: number) => (
                                    <div key={i} className="flex items-center justify-between text-xs">
                                        <div className="flex items-center gap-1">
                                            <span className="text-brand-dark dark:text-dark-heading font-medium">R$ {Number(t.amount || 0).toFixed(2)}</span>
                                            <Badge variant={t.status === "paid" ? "green" : t.status === "cancelled" ? "gray" : "orange"}>
                                                {t.status === "paid" ? "Pago" : t.status === "cancelled" ? "Cancelado" : "Pendente"}
                                            </Badge>
                                        </div>
                                        <span className="text-brand-inactive-text">{t.due_date ? safeDate(t.due_date) : ""}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    {(isCompleted || isReversed) && stockData && stockData.length > 0 && (
                        <div className="pt-2 border-t border-brand-border dark:border-dark-border">
                            <span className="text-xs text-brand-inactive-text dark:text-dark-body block mb-2">Movimentações de Estoque</span>
                            <div className="space-y-1">
                                {stockData.map((m: any, i: number) => (
                                    <div key={i} className="text-xs text-brand-dark dark:text-dark-heading">
                                        <span className="font-medium">
                                            {m.movement_type === "adjustment" ? "Ajuste (reversão)" : "Entrada"}:
                                        </span>{' '}
                                        {m.stock_movement_items?.map((smi: any, j: number) => (
                                            <span key={j}>
                                                {smi.quantity > 0 ? "+" : ""}{formatQuantityWithUnit(smi.quantity, smi.unit || smi.raw_unit)}
                                            </span>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </DefaultModal>

            {/* Item action modal (estoque / custo / decisão) */}
            {actionModal && actionItem && (
                <DefaultModal
                    isOpen
                    onClose={() => setActionModal(null)}
                    title={actionModal.kind === "stock" ? "Ajuste de estoque" : actionModal.kind === "cost" ? "Atualização de custo" : "Decisão do produto"}
                    maxWidth="lg"
                >
                    <div className="space-y-4">
                        <div className="flex flex-col gap-0.5">
                            <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading">{actionItem.raw_name}</span>
                            {actionItem.raw_sku && (
                                <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">SKU: {actionItem.raw_sku}</span>
                            )}
                        </div>
                        <div className="border-t border-brand-border dark:border-dark-border pt-4">
                            {actionModal.kind === "stock" && (
                                <FormDropdown
                                    label="Estoque"
                                    options={ITEM_STOCK_OPTIONS}
                                    value={actionDecision?.stock_action || "add"}
                                    setValue={(v) => setDecisions((prev: any) => ({ ...prev, [actionItem.id]: { ...prev[actionItem.id], stock_action: v } }))}
                                />
                            )}
                            {actionModal.kind === "cost" && (
                                <FormDropdown
                                    label="Custo"
                                    options={ITEM_COST_OPTIONS}
                                    value={actionDecision?.cost_action || "update"}
                                    setValue={(v) => setDecisions((prev: any) => ({ ...prev, [actionItem.id]: { ...prev[actionItem.id], cost_action: v } }))}
                                />
                            )}
                            {actionModal.kind === "decision" && (
                                <FormDropdown
                                    label="Decisão"
                                    options={getItemDecisionOptions(actionItem)}
                                    value={actionDecision?.decision || "keep_product"}
                                    setValue={(v) => setDecisions((prev: any) => ({ ...prev, [actionItem.id]: { ...prev[actionItem.id], decision: v } }))}
                                />
                            )}
                        </div>
                        <div className="flex items-center justify-end gap-3 pt-2">
                            <Button variant="outline" onClick={() => setActionModal(null)}>Cancelar</Button>
                            <Button onClick={() => setActionModal(null)}>Concluir</Button>
                        </div>
                    </div>
                </DefaultModal>
            )}

            {/* Reversal confirmation modal */}
            {showRevertModal && (
                <DefaultModal isOpen={showRevertModal} onClose={() => { setShowRevertModal(false); setRevertReason("") }} title="Desfazer Importação">
                    <div className="space-y-4">
                        <InfoCard color="red" title="Atenção" message="Esta ação irá desfazer toda a importação, incluindo movimentações de estoque e contas a pagar geradas. Esta operação é irreversível." />
                        <div>
                            <FormTextarea
                                name="revert-reason"
                                value={revertReason}
                                onChange={(e) => setRevertReason(e.target.value)}
                                label="Motivo da reversão"
                                rows={3}
                            />
                        </div>
                        <div className="flex items-center justify-end gap-3 pt-2">
                            <Button variant="outline" onClick={() => { setShowRevertModal(false); setRevertReason("") }}>
                                Cancelar
                            </Button>
                            <Button onClick={handleRevert} disabled={isReverting} className="bg-red-600 hover:bg-red-700 text-white">
                                {isReverting ? <span className="flex items-center gap-2"><Spinner size={18} /> Revertendo...</span> : "Confirmar Reversão"}
                            </Button>
                        </div>
                    </div>
                </DefaultModal>
            )}
        </FadeIn>
    )
}
