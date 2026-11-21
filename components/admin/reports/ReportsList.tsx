"use client"

import { useMemo, useState, useTransition, useCallback } from "react"
import { FadeIn } from "@/components/animations/FadeIn"
import { AnimatePresence } from "framer-motion"
import { toast } from "@/hooks/use-notification"
import {
    Button,
    Pagination,
    IconPlaceholder,
    DefaultModal,
    Badge,
    FormTextarea,
} from "@/components/reusable"
import FilterSheet, { FilterSectionConfig } from "@/components/reusable/FilterSheet"
import { useMediaQuery } from "@/components/erp/hooks"
import type { Report, ReportsStats } from "@/app/actions/admin/reports"
import {
    getReports,
    getReportsStats,
    resolveReport,
    dismissReport,
    markReportSpam,
    revertReportValidation,
} from "@/app/actions/admin/reports"
import ReportListRow from "./ReportListRow"
import ReportsPageControls, { type ReportFilterState, INITIAL_REPORT_FILTERS } from "./ReportsPageControls"
import { AdminReportDetailView } from "./AdminReportDetailView"
import { useEntityState } from "@/hooks/use-entity-state"
import { ShieldIcon } from "@/lib/icons"

interface ReportsListProps {
    initialData: Report[]
    initialStats: ReportsStats
    initialHasMore?: boolean
    initialNextCursor?: string | null
}

const ITEMS_PER_PAGE = 8

type SortKey = "target" | "reason" | "reporter" | "date" | "type" | "status"
type SortDirection = "asc" | "desc"

export default function ReportsList({
    initialData,
    initialStats,
}: ReportsListProps) {
    const isMobile = useMediaQuery("(max-width: 768px)")
    const { state: entityState, open: openEntity, close: closeEntity } = useEntityState()

    // Filters
    const [statusTab, setStatusTab] = useState<string>("all")
    const [viewMode, setViewMode] = useState<"list" | "grid">(isMobile ? "grid" : "list")
    const [filters, setFilters] = useState<ReportFilterState>(INITIAL_REPORT_FILTERS)
    const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false)
    const [search, setSearch] = useState("")

    // Sorting
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>({
        key: "date",
        direction: "desc",
    })

    // Data State
    const [reports, setReports] = useState<Report[]>(initialData || [])
    const [stats, setStats] = useState<ReportsStats>(initialStats)
    const [page, setPage] = useState(1)
    const [isPending, startTransition] = useTransition()

    // Modals
    const [resolveTarget, setResolveTarget] = useState<Report | null>(null)
    const [dismissTarget, setDismissTarget] = useState<Report | null>(null)
    const [spamTarget, setSpamTarget] = useState<Report | null>(null)
    const [revertTarget, setRevertTarget] = useState<Report | null>(null)
    const [actionReason, setActionReason] = useState("")

    const handleSort = (key: SortKey) => {
        setSortConfig((prev) => {
            if (prev?.key === key) {
                return { key, direction: prev.direction === "asc" ? "desc" : "asc" }
            }
            return { key, direction: "desc" }
        })
    }

    const refreshReports = useCallback(() => {
        startTransition(async () => {
            try {
                const [res, statsRes] = await Promise.all([
                    getReports(null, 100, { status: "all", targetType: "all" }),
                    getReportsStats(),
                ])
                setReports(res.data || [])
                setStats(statsRes)
            } catch (err) {
                console.error("Failed to refresh reports:", err)
            }
        })
    }, [])

    const handleResolve = () => {
        if (!resolveTarget) return
        startTransition(async () => {
            try {
                const res = await resolveReport(resolveTarget.id, actionReason || "Denúncia procedente confirmada")
                if (res.success) {
                    toast.success("Denúncia validada com sucesso (+5 score de risco atribuído)")
                    setResolveTarget(null)
                    setActionReason("")
                    refreshReports()
                } else {
                    toast.error(res.error || "Erro ao validar denúncia")
                }
            } catch (err: any) {
                toast.error(err.message || "Erro inesperado")
            }
        })
    }

    const handleDismiss = () => {
        if (!dismissTarget) return
        startTransition(async () => {
            try {
                const res = await dismissReport(dismissTarget.id, actionReason || "Denúncia improcedente ou sem provas")
                if (res.success) {
                    toast.success("Denúncia descartada")
                    setDismissTarget(null)
                    setActionReason("")
                    refreshReports()
                } else {
                    toast.error(res.error || "Erro ao descartar denúncia")
                }
            } catch (err: any) {
                toast.error(err.message || "Erro inesperado")
            }
        })
    }

    const handleSpam = () => {
        if (!spamTarget) return
        startTransition(async () => {
            try {
                const res = await markReportSpam(spamTarget.id, actionReason || "Denúncia abusiva / spam")
                if (res.success) {
                    toast.success("Denúncia marcada como spam")
                    setSpamTarget(null)
                    setActionReason("")
                    refreshReports()
                } else {
                    toast.error(res.error || "Erro ao marcar como spam")
                }
            } catch (err: any) {
                toast.error(err.message || "Erro inesperado")
            }
        })
    }

    const handleRevert = () => {
        if (!revertTarget) return
        startTransition(async () => {
            try {
                const res = await revertReportValidation(revertTarget.id, actionReason || "Reversão administrativa de validação")
                if (res.success) {
                    toast.success("Validação revertida com sucesso (-5 score de risco)")
                    setRevertTarget(null)
                    setActionReason("")
                    refreshReports()
                } else {
                    toast.error(res.error || "Erro ao reverter denúncia")
                }
            } catch (err: any) {
                toast.error(err.message || "Erro inesperado")
            }
        })
    }

    // Instant in-memory filtering (0ms)
    const filteredReports = useMemo(() => {
        const term = search.trim().toLowerCase()

        let result = reports.filter((r) => {
            // Tab filter
            if (statusTab !== "all" && r.status !== statusTab) {
                return false
            }

            // Target Type filter
            if (filters.targetType.length > 0) {
                const typeMap: Record<string, string[]> = {
                    "Produto": ["product"],
                    "Serviço": ["service"],
                    "Loja / Parceiro": ["partner", "store"],
                    "Parceiro": ["partner", "store"],
                    "Loja": ["partner", "store"],
                    "Avaliação": ["review"],
                    "Devolução": ["return_request"],
                }
                const match = filters.targetType.some((t) => {
                    const mappedList = typeMap[t] || [t.toLowerCase()]
                    return mappedList.includes(r.target_type)
                })
                if (!match) return false
            }

            // Search filter
            if (term) {
                const tName = String(r.target_name || "").toLowerCase()
                const tId = String(r.target_id || "").toLowerCase()
                const repName = String(r.reporter_name || "").toLowerCase()
                const reason = String(r.reason_label || r.reason || "").toLowerCase()
                if (!tName.includes(term) && !tId.includes(term) && !repName.includes(term) && !reason.includes(term)) {
                    return false
                }
            }

            return true
        })

        // In-memory sorting
        if (sortConfig) {
            result = [...result].sort((a, b) => {
                let aVal: any = ""
                let bVal: any = ""
                switch (sortConfig.key) {
                    case "target":
                        aVal = (a.target_name || a.target_id || "").toLowerCase()
                        bVal = (b.target_name || b.target_id || "").toLowerCase()
                        break
                    case "reason":
                        aVal = (a.reason_label || a.reason || "").toLowerCase()
                        bVal = (b.reason_label || b.reason || "").toLowerCase()
                        break
                    case "reporter":
                        aVal = (a.reporter_name || a.reporter_user_id || "").toLowerCase()
                        bVal = (b.reporter_name || b.reporter_user_id || "").toLowerCase()
                        break
                    case "date":
                        aVal = new Date(a.created_at).getTime()
                        bVal = new Date(b.created_at).getTime()
                        break
                    case "type":
                        aVal = a.target_type || ""
                        bVal = b.target_type || ""
                        break
                    case "status":
                        aVal = a.status || ""
                        bVal = b.status || ""
                        break
                }
                if (aVal === bVal) return 0
                const cmp = aVal < bVal ? -1 : 1
                return sortConfig.direction === "asc" ? cmp : -cmp
            })
        }

        return result
    }, [reports, statusTab, search, filters, sortConfig])

    // Pagination (Strict 8 items)
    const totalPages = Math.max(1, Math.ceil(filteredReports.length / ITEMS_PER_PAGE))
    const paginatedItems = useMemo(() => {
        const start = (page - 1) * ITEMS_PER_PAGE
        return filteredReports.slice(start, start + ITEMS_PER_PAGE)
    }, [filteredReports, page])

    // Reset page on tab/search/filter change
    useMemo(() => {
        setPage(1)
    }, [statusTab, search, filters])

    // If viewing detail of a specific report (?view=[id])
    if (entityState.isOpen && entityState.action === "view" && entityState.entityId) {
        return (
            <AdminReportDetailView
                reportId={entityState.entityId}
                initialReport={reports.find(r => r.id === entityState.entityId)}
                onBack={closeEntity}
                onReportUpdated={refreshReports}
            />
        )
    }

    const filterSections: FilterSectionConfig[] = [
        {
            id: "targetType",
            title: "Tipo de Alvo",
            type: "checkbox-list",
            options: ["Produto", "Serviço", "Loja / Parceiro", "Avaliação", "Devolução"],
        },
    ]

    const hasActiveFilters = search !== "" || filters.targetType.length > 0

    return (
        <FadeIn className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300">
            <style>{`
                .custom-scrollbar::-webkit-scrollbar { height: 8px; width: 8px; } 
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; } 
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 9999px; border: 2px solid #fff; }
                .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: #374151; border: 2px solid #1f2937; }
                .dark .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .hide-scrollbar::-webkit-scrollbar { display: none; }
                .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>

            <div className="mx-auto w-full pt-4 flex flex-col h-full overflow-hidden relative">
                {/* Desktop Header */}
                <div className="hidden md:flex items-start justify-between mb-6 flex-none px-4 md:px-8">
                    <div className="flex flex-col gap-2 pt-1">
                        <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                            Denúncias
                        </h1>
                        <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                            Gerencie, investigue e valide denúncias contra produtos, serviços, lojas e avaliações.
                        </p>
                    </div>
                </div>

                {/* Header Controls */}
                <ReportsPageControls
                    activeTab={statusTab}
                    setActiveTab={setStatusTab}
                    search={search}
                    onSearchChange={setSearch}
                    onOpenFilter={() => setIsFilterSheetOpen(true)}
                    filters={filters}
                    setFilters={setFilters}
                    hasActiveFilters={hasActiveFilters}
                    viewMode={viewMode}
                    onViewModeChange={setViewMode}
                    stats={stats}
                />

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto custom-scrollbar relative pb-24 lg:pb-6 px-4 md:px-8">
                    <AnimatePresence mode="wait">
                        {filteredReports.length === 0 ? (
                            <FadeIn key="empty" className="w-full h-full flex items-center justify-center min-h-[400px]">
                                <IconPlaceholder
                                    icon={ShieldIcon}
                                    title="Nenhuma denúncia encontrada"
                                    subtitle={hasActiveFilters ? "Tente ajustar seus filtros de busca." : "Nenhuma denúncia nesta categoria no momento."}
                                    itemButton={hasActiveFilters ? {
                                        text: "Limpar Filtros",
                                        action: () => {
                                            setSearch("")
                                            setFilters(INITIAL_REPORT_FILTERS)
                                            setStatusTab("all")
                                        },
                                        variant: "outline",
                                    } : undefined}
                                />
                            </FadeIn>
                        ) : (
                            <FadeIn key="list" className="w-full space-y-4">
                                {/* Mobile View (Cards) */}
                                <div className="md:hidden flex flex-col w-full divide-y divide-brand-border dark:divide-dark-border">
                                    {paginatedItems.map((report) => (
                                        <ReportListRow
                                            key={report.id}
                                            report={report}
                                            isPending={isPending}
                                            onDetail={() => openEntity("view", report.id)}
                                            onResolve={() => setResolveTarget(report)}
                                            onDismiss={() => setDismissTarget(report)}
                                            onSpam={() => setSpamTarget(report)}
                                            onRevert={() => setRevertTarget(report)}
                                        />
                                    ))}
                                </div>

                                {/* Desktop View */}
                                {viewMode === "grid" ? (
                                    <div className="hidden md:grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                        {paginatedItems.map((report) => {
                                            const statusMap: Record<string, { variant: "orange" | "red" | "gray" | "purple"; label: string }> = {
                                                pending: { variant: "orange", label: "Pendente" },
                                                validated: { variant: "red", label: "Validada" },
                                                dismissed: { variant: "gray", label: "Descartada" },
                                                spam: { variant: "purple", label: "Spam" },
                                            }
                                            const statusInfo = statusMap[report.status] || { variant: "gray" as const, label: report.status }
                                            const targetTypeLabels: Record<string, string> = {
                                                product: "Produto",
                                                service: "Serviço",
                                                partner: "Loja",
                                                store: "Loja",
                                                review: "Avaliação",
                                                return_request: "Devolução",
                                                order: "Pedido",
                                                user: "Usuário",
                                            }

                                            return (
                                                <div
                                                    key={report.id}
                                                    onClick={() => openEntity("view", report.id)}
                                                    className="bg-white dark:bg-dark-surface p-5 rounded-2xl border border-brand-border dark:border-dark-border hover:border-brand-dark/30 dark:hover:border-brand-gray/30 transition-all cursor-pointer flex flex-col justify-between gap-4"
                                                >
                                                    <div className="flex justify-between items-start gap-2">
                                                        <div className="min-w-0">
                                                            <h3 className="font-bold text-base text-brand-dark dark:text-dark-heading truncate">
                                                                {report.target_name || `${targetTypeLabels[report.target_type] || report.target_type} #${report.target_id.slice(0, 8)}`}
                                                            </h3>
                                                            <p className="text-xs text-brand-inactive-text mt-0.5 truncate">
                                                                {report.reason_label || report.reason}
                                                            </p>
                                                        </div>
                                                        <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                                                    </div>

                                                    <div className="text-xs space-y-1.5 text-brand-inactive-text border-t border-b border-brand-border/50 dark:border-dark-border/50 py-3">
                                                        <div className="flex justify-between items-center">
                                                            <span>Tipo</span>
                                                            <span>{targetTypeLabels[report.target_type] || report.target_type}</span>
                                                        </div>
                                                        <div className="flex justify-between">
                                                            <span>Denunciante</span>
                                                            <span className="truncate max-w-[120px]">{report.reporter_name || "Usuário"}</span>
                                                        </div>
                                                    </div>

                                                    <div className="flex justify-between items-center text-xs text-brand-inactive-text">
                                                        <span>{new Date(report.created_at).toLocaleDateString("pt-BR")}</span>
                                                        <span>{new Date(report.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                ) : (
                                    <div className="hidden md:block w-full overflow-hidden rounded-xl relative">
                                        <div className="overflow-x-auto pb-4 custom-scrollbar">
                                            <table className="w-full text-left border-separate border-spacing-0 min-w-[1000px]">
                                                <thead>
                                                    <tr className="bg-brand-gray dark:bg-dark-border/50 select-none">
                                                        <th
                                                            onClick={() => handleSort("target")}
                                                            className="py-3 px-2 pl-6 rounded-l-lg text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                        >
                                                            Alvo {sortConfig?.key === "target" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}
                                                        </th>
                                                        <th
                                                            onClick={() => handleSort("reason")}
                                                            className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                        >
                                                            Motivo {sortConfig?.key === "reason" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}
                                                        </th>
                                                        <th
                                                            onClick={() => handleSort("reporter")}
                                                            className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                        >
                                                            Denunciante {sortConfig?.key === "reporter" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}
                                                        </th>
                                                        <th
                                                            onClick={() => handleSort("date")}
                                                            className="py-3 px-2 w-32 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                        >
                                                            Data {sortConfig?.key === "date" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}
                                                        </th>
                                                        <th
                                                            onClick={() => handleSort("type")}
                                                            className="py-3 px-2 w-32 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                        >
                                                            Tipo {sortConfig?.key === "type" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}
                                                        </th>
                                                        <th
                                                            onClick={() => handleSort("status")}
                                                            className="py-3 px-2 w-32 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                        >
                                                            Status {sortConfig?.key === "status" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}
                                                        </th>
                                                        <th className="py-3 px-2 pr-6 rounded-r-lg w-24 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center">
                                                            Ações
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {paginatedItems.map((report) => (
                                                        <ReportListRow
                                                            key={report.id}
                                                            report={report}
                                                            isPending={isPending}
                                                            onDetail={() => openEntity("view", report.id)}
                                                            onResolve={() => setResolveTarget(report)}
                                                            onDismiss={() => setDismissTarget(report)}
                                                            onSpam={() => setSpamTarget(report)}
                                                            onRevert={() => setRevertTarget(report)}
                                                        />
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}

                                {/* Pagination */}
                                {totalPages > 1 && (
                                    <div className="pt-4">
                                        <Pagination
                                            currentPage={page}
                                            totalPages={totalPages}
                                            onPageChange={setPage}
                                            fixedUntil="lg"
                                        />
                                    </div>
                                )}
                            </FadeIn>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Filter Drawer */}
            <FilterSheet
                isOpen={isFilterSheetOpen}
                onClose={() => setIsFilterSheetOpen(false)}
                sections={filterSections}
                filters={filters}
                setFilters={setFilters}
                onClear={() => {
                    setFilters(INITIAL_REPORT_FILTERS)
                    setIsFilterSheetOpen(false)
                }}
            />

            {/* MODAL: Resolve / Validate */}
            <DefaultModal
                isOpen={!!resolveTarget}
                onClose={() => { setResolveTarget(null); setActionReason("") }}
                title="Validar Denúncia"
                maxWidth="md"
                footer={
                    <div className="flex items-center justify-end gap-2 w-full">
                        <Button variant="outline" onClick={() => setResolveTarget(null)} disabled={isPending}>
                            Cancelar
                        </Button>
                        <Button variant="destructive" onClick={handleResolve} isLoading={isPending}>
                            Validar (+5 Risco)
                        </Button>
                    </div>
                }
            >
                <div className="space-y-4 py-2">
                    <p className="text-sm text-brand-inactive-text">
                        A confirmação desta denúncia adicionará <strong>+5 pontos de score de risco</strong> ao alvo e marcará o registro como validado.
                    </p>
                    <FormTextarea
                        value={actionReason}
                        onChange={(e) => setActionReason(e.target.value)}
                        placeholder="Justificativa da validação..."
                        rows={3}
                        className="w-full min-h-[90px]"
                    />
                </div>
            </DefaultModal>

            {/* MODAL: Dismiss */}
            <DefaultModal
                isOpen={!!dismissTarget}
                onClose={() => { setDismissTarget(null); setActionReason("") }}
                title="Descartar Denúncia"
                maxWidth="md"
                footer={
                    <div className="flex items-center justify-end gap-2 w-full">
                        <Button variant="outline" onClick={() => setDismissTarget(null)} disabled={isPending}>
                            Cancelar
                        </Button>
                        <Button variant="default" onClick={handleDismiss} isLoading={isPending}>
                            Descartar
                        </Button>
                    </div>
                }
            >
                <div className="space-y-4 py-2">
                    <p className="text-sm text-brand-inactive-text">
                        Descartar denúncias improcedentes encerra o ticket sem penalizar o alvo denunciado.
                    </p>
                    <FormTextarea
                        label="Motivo do descarte (opcional)..."
                        value={actionReason}
                        onChange={(e) => setActionReason(e.target.value)}
                        placeholder="Descreva o motivo do ajuste que será enviado para o cliente..."
                        rows={2}
                    />
                </div>
            </DefaultModal>

            {/* MODAL: Spam */}
            <DefaultModal
                isOpen={!!spamTarget}
                onClose={() => { setSpamTarget(null); setActionReason("") }}
                title="Marcar Denúncia como Spam"
                maxWidth="md"
                footer={
                    <div className="flex items-center justify-end gap-2 w-full">
                        <Button variant="outline" onClick={() => setSpamTarget(null)} disabled={isPending}>
                            Cancelar
                        </Button>
                        <Button variant="default" onClick={handleSpam} isLoading={isPending}>
                            Confirmar Spam
                        </Button>
                    </div>
                }
            >
                <div className="space-y-4 py-2">
                    <p className="text-xs text-brand-inactive-text">
                        Denúncias marcadas como spam indicam comportamento abusivo do denunciante e são arquivadas.
                    </p>
                    <textarea
                        value={actionReason}
                        onChange={(e) => setActionReason(e.target.value)}
                        placeholder="Observações sobre o spam (opcional)..."
                        className="w-full min-h-[90px] rounded-xl border border-brand-border bg-white p-3 text-sm text-brand-dark outline-none focus:border-brand-green dark:border-dark-border dark:bg-dark-surface dark:text-white"
                    />
                </div>
            </DefaultModal>

            {/* MODAL: Revert */}
            <DefaultModal
                isOpen={!!revertTarget}
                onClose={() => { setRevertTarget(null); setActionReason("") }}
                title="Reverter Validação"
                maxWidth="md"
                footer={
                    <div className="flex items-center justify-end gap-2 w-full">
                        <Button variant="outline" onClick={() => setRevertTarget(null)} disabled={isPending}>
                            Cancelar
                        </Button>
                        <Button variant="default" onClick={handleRevert} isLoading={isPending}>
                            Reverter (-5 Risco)
                        </Button>
                    </div>
                }
            >
                <div className="space-y-4 py-2">
                    <p className="text-xs text-brand-inactive-text">
                        A reversão retornará o registro para pendente e subtrairá <strong>-5 pontos de risco</strong> do alvo.
                    </p>
                    <textarea
                        value={actionReason}
                        onChange={(e) => setActionReason(e.target.value)}
                        placeholder="Justificativa da reversão..."
                        className="w-full min-h-[90px] rounded-xl border border-brand-border bg-white p-3 text-sm text-brand-dark outline-none focus:border-brand-green dark:border-dark-border dark:bg-dark-surface dark:text-white"
                    />
                </div>
            </DefaultModal>
        </FadeIn>
    )
}
