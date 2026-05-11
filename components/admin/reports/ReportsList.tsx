"use client"

import React, { useMemo, useRef, useState, useTransition, useEffect } from "react"
import { FadeIn } from "@/components/animations/FadeIn"
import { AnimatePresence } from "framer-motion"
import { toast } from "sonner"
import Image from "next/image"
import {
    InfoIcon, AlertTriangleIcon, CheckCircleIcon, CancelCircleIcon,
    ReturnIcon, ShieldIcon, AllProductsIcon, StoreIcon, ClockIcon
} from "@/lib/icons"

import { Button, Badge, Input, Pagination, IconPlaceholder, ThreeDotsLoader } from "@/components/reusable"
import DefaultModal from "@/components/reusable/DefaultModal"
import FilterSheet, { FilterSectionConfig } from "@/components/reusable/FilterSheet"
import BottomSheet from "@/components/BottomSheet"
import { useMediaQuery } from "@/components/erp/hooks"

import type { Report, ReportsStats, ReportStatus, ReportTargetType, TargetReportSummary } from "@/app/actions/admin/reports"
import { getReports, resolveReport, dismissReport, markReportSpam, revertReportValidation, getTargetReportSummary, getAdminTargetDetails, removeProductFromMarketplace } from "@/app/actions/admin/reports"
import { getTargetAuditHistory } from "@/app/actions/admin/audit-logs"
import type { AuditLogRow } from "@/lib/admin/types"

import ReportListRow from "./ReportListRow"
import ReportsPageControls from "./ReportsPageControls"
import { useEntityPage } from "@/hooks/use-entity-page"
import { useInfiniteScrollObserver } from "@/hooks/use-infinite-scroll-observer"

// ─── Main Component ─────────────────────────────────────────────────────────

interface ReportsListProps {
    initialData: Report[]
    initialStats: ReportsStats
    initialHasMore: boolean
    initialNextCursor: string | null
}

interface FilterState {
    targetType: string[]
}

const INITIAL_FILTERS: FilterState = {
    targetType: [],
}

export default function ReportsList({ initialData, initialStats, initialHasMore, initialNextCursor }: ReportsListProps) {
    const isMobile = useMediaQuery("(max-width: 768px)")
    const observerTarget = useRef<HTMLDivElement>(null)

    // Filters
    const [statusFilter, setStatusFilter] = useState<string>("pending")
    const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS)
    const [modals, setModals] = useState({ filter: false })

    // Modals & Action State
    const [resolveTarget, setResolveTarget] = useState<Report | null>(null)
    const [dismissTarget, setDismissTarget] = useState<Report | null>(null)
    const [spamTarget, setSpamTarget] = useState<Report | null>(null)
    const [revertTarget, setRevertTarget] = useState<Report | null>(null)
    const [detailTarget, setDetailTarget] = useState<Report | null>(null)

    const [actionReason, setActionReason] = useState("")
    const [removeProduct, setRemoveProduct] = useState(false)
    const [isPending, startTransition] = useTransition()

    // ─── Entity Page ──────────────────────────────────────────────────────────
    const entityPage = useEntityPage<Report, any, string>({
        entityType: 'admin-reports',
        partnerId: 'admin',
        queryKey: ['admin', 'reports', statusFilter],
        initialItems: statusFilter === 'pending' ? initialData : [],
        initialNextCursor: statusFilter === 'pending' ? initialNextCursor : null,
        initialHasMore: statusFilter === 'pending' ? initialHasMore : true,
        fetchPageFn: async ({ cursor }) => {
            const res = await getReports(cursor, 50, {
                status: statusFilter as ReportStatus,
                targetType: "all",
            })
            return { items: res.data, nextCursor: res.nextCursor, hasMore: res.hasMore }
        },
        dedupeKey: (r) => r.id,
        getDetailFn: async () => null,
        listToDetail: (item) => item,
    })

    const {
        items: rawReports, fetchNextPage, hasNextPage, isFetchingNextPage, isListLoading, afterMutation,
        search, setSearch, debouncedSearch,
    } = entityPage

    useInfiniteScrollObserver(observerTarget, {
        enabled: true,
        hasNextPage: !!hasNextPage,
        isFetchingNextPage,
        fetchNextPage: () => fetchNextPage(),
        rootMargin: "320px",
        threshold: 0,
    })

    const filterSections: FilterSectionConfig[] = [
        {
            id: "targetType",
            title: "Tipo de Alvo",
            type: "checkbox-list",
            options: ["Produto", "Parceiro", "Avaliação", "Serviço"]
        },
    ]

    const targetTypeMap: Record<string, string> = {
        "Produto": "product",
        "Parceiro": "partner",
        "Avaliação": "review",
        "Serviço": "service"
    }

    const filteredReports = useMemo(() => {
        if (!rawReports) return []
        const term = debouncedSearch.toLowerCase()
        const selectedTargetTypes = filters.targetType.map(t => targetTypeMap[t] || t)

        return rawReports.filter(report => {
            const searchMatch =
                report.target_name.toLowerCase().includes(term) ||
                report.reporter_name.toLowerCase().includes(term) ||
                (report.reason_label || report.reason).toLowerCase().includes(term) ||
                report.target_id.toLowerCase().includes(term)

            const typeMatch = selectedTargetTypes.length === 0 || selectedTargetTypes.includes(report.target_type)

            return searchMatch && typeMatch
        })
    }, [rawReports, debouncedSearch, filters])

    // Pagination
    const [page, setPage] = useState(1)
    const itemsPerPage = 20
    const totalPages = Math.ceil(filteredReports.length / itemsPerPage)
    const paginatedItems = useMemo(() => {
        const start = (page - 1) * itemsPerPage
        return filteredReports.slice(start, start + itemsPerPage)
    }, [filteredReports, page])

    // Reset page when filters change
    useEffect(() => { setPage(1) }, [debouncedSearch, filters, statusFilter])

    // ─── Action Handlers ──────────────────────────────────────────────────────

    const handleActionComplete = () => {
        setActionReason("")
        setRemoveProduct(false)
        setResolveTarget(null)
        setDismissTarget(null)
        setSpamTarget(null)
        setRevertTarget(null)
        setDetailTarget(null)
        afterMutation() // Refresh current page
    }

    const handleResolve = () => {
        if (!resolveTarget) return
        const reason = actionReason.trim()
        if (reason.length < 5) return
        startTransition(async () => {
            const result = await resolveReport(resolveTarget.id, reason)
            if (result.success) {
                if (removeProduct && resolveTarget.target_type === 'product') {
                    const removeResult = await removeProductFromMarketplace(resolveTarget.target_id, reason)
                    if (!removeResult.success) {
                        toast.error("Denúncia validada, mas falhou ao remover produto.")
                        return handleActionComplete()
                    }
                }
                toast.success("Denúncia validada com sucesso!")
                handleActionComplete()
            } else {
                toast.error(result.error || "Erro ao validar denúncia")
            }
        })
    }

    const handleDismiss = () => {
        if (!dismissTarget) return
        const reason = actionReason.trim()
        if (reason.length < 5) return
        startTransition(async () => {
            const result = await dismissReport(dismissTarget.id, reason)
            if (result.success) {
                toast.success("Denúncia descartada com sucesso!")
                handleActionComplete()
            } else {
                toast.error(result.error || "Erro ao descartar denúncia")
            }
        })
    }

    const handleSpam = () => {
        if (!spamTarget) return
        const reason = actionReason.trim()
        if (reason.length < 5) return
        startTransition(async () => {
            const result = await markReportSpam(spamTarget.id, reason)
            if (result.success) {
                toast.success("Denúncia marcada como spam!")
                handleActionComplete()
            } else {
                toast.error(result.error || "Erro ao marcar como spam")
            }
        })
    }

    const handleRevert = () => {
        if (!revertTarget) return
        const reason = actionReason.trim()
        if (reason.length < 5) return
        startTransition(async () => {
            const result = await revertReportValidation(revertTarget.id, reason)
            if (result.success) {
                toast.success("Validação revertida com sucesso!")
                handleActionComplete()
            } else {
                toast.error(result.error || "Erro ao reverter validação")
            }
        })
    }

    const hasActiveFilters = filters.targetType.length > 0 || debouncedSearch.length > 0
    const hasData = (rawReports?.length || 0) > 0

    return (
        <FadeIn className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300">
            <div className="mx-auto w-full pt-4 flex flex-col h-full overflow-hidden relative">

                {/* Header Title/Subtitle (ERP Standard) */}
                <div className="hidden md:flex items-start justify-between mb-6 flex-none px-4 md:px-8">
                    <div className="flex flex-col gap-2 pt-1">
                        <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                            Relatórios e Denúncias
                        </h1>
                        <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                            Gerencie as denúncias de usuários e mantenha a integridade da plataforma.
                        </p>
                    </div>
                </div>

                <ReportsPageControls
                    activeTab={statusFilter}
                    setActiveTab={setStatusFilter}
                    search={search}
                    onSearchChange={setSearch}
                    onOpenFilter={() => setModals({ filter: true })}
                    hasActiveFilters={hasActiveFilters}
                    stats={initialStats}
                />

                <div className="flex-1 overflow-y-auto custom-scrollbar px-4 md:px-8 pb-20 md:pb-6 relative">
                    <AnimatePresence mode="wait">
                        {isListLoading ? (
                            <FadeIn key="loading" className="flex items-center justify-center min-h-[500px]">
                                <ThreeDotsLoader />
                            </FadeIn>
                        ) : !hasData ? (
                            <FadeIn key="empty" className="w-full h-full flex items-center justify-center min-h-[500px]">
                                <IconPlaceholder
                                    placeholderType="image"
                                    imageSrc="https://img.dudit.com.br/static/mascots/NaoEncontrado.png"
                                    imageAlt="Nenhuma denúncia"
                                    title="Nenhuma denúncia no sistema"
                                    subtitle="Você está em dia com as moderações!"
                                />
                            </FadeIn>
                        ) : paginatedItems.length === 0 ? (
                            <FadeIn key="empty-results" className="w-full h-full flex items-center justify-center min-h-[500px]">
                                <IconPlaceholder
                                    placeholderType="image"
                                    imageSrc="https://img.dudit.com.br/static/mascots/NaoEncontrado.png"
                                    imageAlt="Nenhum resultado"
                                    title="Nenhuma denúncia encontrada"
                                    subtitle="Tente ajustar seus filtros ou termos de busca."
                                    itemButton={{
                                        text: "Limpar Filtros",
                                        action: () => {
                                            setSearch("")
                                            setFilters(INITIAL_FILTERS)
                                        },
                                        variant: "outline"
                                    }}
                                />
                            </FadeIn>
                        ) : (
                            <FadeIn key="list" className="w-full">
                                {/* Mobile/Tablet View */}
                                <div className="md:hidden flex flex-col w-full border-b border-brand-border dark:border-dark-border">
                                    {paginatedItems.map(report => (
                                        <div
                                            key={report.id}
                                            className="py-5 border-b border-brand-border dark:border-dark-border last:border-0 flex flex-col gap-3 cursor-pointer"
                                            onClick={() => setDetailTarget(report)}
                                        >
                                            <div className="flex justify-between items-start gap-2">
                                                <div className="flex flex-col gap-1 min-w-0">
                                                    <span className="font-bold text-[15px] text-brand-dark dark:text-dark-heading leading-tight truncate">
                                                        {report.target_name}
                                                    </span>
                                                    <span className="text-xs font-medium text-brand-inactive-text">
                                                        Motivo: {report.reason_label || report.reason}
                                                    </span>
                                                </div>
                                                <Badge variant={report.severity === "high" ? "red" : report.severity === "normal" ? "orange" : "gray"}>
                                                    {report.severity === "high" ? "Alto" : report.severity === "normal" ? "Médio" : "Baixo"}
                                                </Badge>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <Badge variant="blue">
                                                    {report.target_type === "product" ? "Produto" :
                                                        report.target_type === "service" ? "Serviço" :
                                                            report.target_type === "partner" ? "Parceiro" :
                                                                report.target_type === "review" ? "Avaliação" : report.target_type}
                                                </Badge>
                                                <Badge variant={
                                                    report.status === "pending" ? "orange" :
                                                        report.status === "validated" ? "red" :
                                                            report.status === "dismissed" ? "gray" :
                                                                report.status === "spam" ? "purple" : "gray"
                                                }>
                                                    {report.status === "pending" ? "Pendente" :
                                                        report.status === "validated" ? "Validada" :
                                                            report.status === "dismissed" ? "Descartada" :
                                                                report.status === "spam" ? "Spam" : report.status}
                                                </Badge>
                                                <span className="text-xs text-brand-inactive-text ml-auto">
                                                    {new Date(report.created_at).toLocaleDateString("pt-BR")}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Desktop Table View */}
                                <div className="hidden md:block w-full overflow-hidden rounded-xl relative">
                                    <div className="overflow-x-auto pb-4 custom-scrollbar">
                                        <table className="w-full text-left border-separate border-spacing-0 min-w-[1000px]">
                                            <thead>
                                                <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                    <th className="py-3 px-2 pl-6 rounded-l-lg bg-brand-gray dark:bg-dark-border/50 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-wider">Item denunciado</th>
                                                    <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 tracking-wider">Motivo</th>
                                                    <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 tracking-wider">Quem denunciou</th>
                                                    <th className="py-3 px-2 w-32 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 tracking-wider text-center">Tipo</th>
                                                    <th className="py-3 px-2 w-40 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 tracking-wider text-center">Data</th>
                                                    <th className="py-3 px-2 w-32 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 tracking-wider text-center">Status</th>
                                                    <th className="py-3 px-2 w-24 pr-6 rounded-r-lg bg-brand-gray dark:bg-dark-border/50 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-wider text-center">Ações</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paginatedItems.map(report => (
                                                    <ReportListRow
                                                        key={report.id}
                                                        report={report}
                                                        isPending={isPending}
                                                        onDetail={setDetailTarget}
                                                        onResolve={setResolveTarget}
                                                        onDismiss={setDismissTarget}
                                                        onSpam={setSpamTarget}
                                                        onRevert={setRevertTarget}
                                                    />
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </FadeIn>
                        )}
                    </AnimatePresence>
                    {hasNextPage ? <div ref={observerTarget} className="h-12 w-full shrink-0" aria-hidden /> : null}
                </div>

                {hasData && paginatedItems.length > 0 && (
                    <Pagination
                        currentPage={page}
                        totalPages={totalPages}
                        onPageChange={(p) => {
                            setPage(p)
                            if (p === totalPages && hasNextPage && !isFetchingNextPage) {
                                void fetchNextPage()
                            }
                        }}
                    />
                )}
            </div>

            <FilterSheet
                isOpen={modals.filter}
                onClose={() => setModals({ filter: false })}
                sections={filterSections}
                filters={filters}
                setFilters={setFilters as any}
                onClear={() => setFilters(INITIAL_FILTERS)}
            />

            {/* Modals */}
            <ReportActionModal
                isOpen={!!resolveTarget}
                onClose={() => { setResolveTarget(null); setActionReason(""); setRemoveProduct(false) }}
                title="Validar denúncia"
                description={`Confirmar que a denúncia de "${resolveTarget?.target_name || ""}" é válida.`}
                actionLabel="Validar"
                actionVariant="destructive"
                isPending={isPending}
                reason={actionReason}
                setReason={setActionReason}
                onConfirm={handleResolve}
                showRemoveProduct={resolveTarget?.target_type === 'product'}
                removeProduct={removeProduct}
                setRemoveProduct={setRemoveProduct}
            />

            <ReportActionModal
                isOpen={!!dismissTarget}
                onClose={() => { setDismissTarget(null); setActionReason("") }}
                title="Descartar denúncia"
                description={`Marcar a denúncia de "${dismissTarget?.target_name || ""}" como improcedente.`}
                actionLabel="Descartar"
                actionVariant="outline"
                isPending={isPending}
                reason={actionReason}
                setReason={setActionReason}
                onConfirm={handleDismiss}
            />

            <ReportActionModal
                isOpen={!!spamTarget}
                onClose={() => { setSpamTarget(null); setActionReason("") }}
                title="Marcar como spam"
                description={`Marcar a denúncia de "${spamTarget?.target_name || ""}" como spam/fraudulenta.`}
                actionLabel="Marcar como spam"
                actionVariant="warning"
                isPending={isPending}
                reason={actionReason}
                setReason={setActionReason}
                onConfirm={handleSpam}
            />

            <ReportActionModal
                isOpen={!!revertTarget}
                onClose={() => { setRevertTarget(null); setActionReason("") }}
                title="Reverter validação"
                description={`Reverter a validação da denúncia de "${revertTarget?.target_name || ""}".`}
                actionLabel="Reverter"
                actionVariant="outline"
                isPending={isPending}
                reason={actionReason}
                setReason={setActionReason}
                onConfirm={handleRevert}
            />

            <ReportDetailsSheet
                report={detailTarget}
                isOpen={!!detailTarget}
                onClose={() => setDetailTarget(null)}
                onResolve={setResolveTarget}
                onDismiss={setDismissTarget}
                onSpam={setSpamTarget}
                onRevert={setRevertTarget}
            />
        </FadeIn>
    )
}

// ─── Sub-components ─────────────────────────────────────────────────────────

interface ReportActionModalProps {
    isOpen: boolean
    onClose: () => void
    title: string
    description: string
    actionLabel: string
    actionVariant: "default" | "outline" | "destructive" | "warning"
    isPending: boolean
    reason: string
    setReason: (v: string) => void
    onConfirm: () => void
    showRemoveProduct?: boolean
    removeProduct?: boolean
    setRemoveProduct?: (v: boolean) => void
}

function ReportActionModal({
    isOpen, onClose, title, description, actionLabel, actionVariant,
    isPending, reason, setReason, onConfirm,
    showRemoveProduct, removeProduct, setRemoveProduct
}: ReportActionModalProps) {
    const tooShort = !reason.trim() || reason.trim().length < 5
    return (
        <DefaultModal
            isOpen={isOpen}
            onClose={onClose}
            title={title}
            maxWidth="md"
            footer={
                <>
                    <Button variant="outline" onClick={onClose} disabled={isPending}>Cancelar</Button>
                    <Button
                        variant={actionVariant}
                        onClick={onConfirm}
                        disabled={tooShort || isPending}
                        isLoading={isPending}
                    >
                        {actionLabel}
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-4">
                <p className="text-sm text-brand-inactive-text dark:text-dark-body">{description}</p>
                <Input
                    name="action-reason"
                    label="Motivo da Ação"
                    placeholder="Mínimo 5 caracteres..."
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    required
                    multiline
                    rows={3}
                    maxLength={1000}
                />

                {showRemoveProduct && setRemoveProduct && (
                    <div className="flex items-start gap-3 p-4 bg-brand-red/5 border border-brand-red/20 rounded-xl mt-2">
                        <input
                            type="checkbox"
                            id="remove-product"
                            className="mt-1 shrink-0 cursor-pointer accent-brand-red"
                            checked={removeProduct}
                            onChange={(e) => setRemoveProduct(e.target.checked)}
                        />
                        <label htmlFor="remove-product" className="text-sm font-medium text-brand-red cursor-pointer leading-tight">
                            Remover produto do Marketplace
                            <span className="block text-xs font-normal text-brand-red/70 mt-1">O produto não será mais visível no catálogo público e receberá o status 'removido'.</span>
                        </label>
                    </div>
                )}
            </div>
        </DefaultModal>
    )
}

interface ReportDetailsSheetProps {
    report: Report | null
    isOpen: boolean
    onClose: () => void
    onResolve: (r: Report) => void
    onDismiss: (r: Report) => void
    onSpam: (r: Report) => void
    onRevert: (r: Report) => void
}

function ReportDetailsSheet({ report, isOpen, onClose, onResolve, onDismiss, onSpam, onRevert }: ReportDetailsSheetProps) {
    const [summary, setSummary] = useState<TargetReportSummary | null>(null)
    const [targetDetails, setTargetDetails] = useState<any>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [historyOpen, setHistoryOpen] = useState(false)

    useEffect(() => {
        if (report && isOpen) {
            setIsLoading(true)
            Promise.all([
                getTargetReportSummary({ targetId: report.target_id, targetType: report.target_type }).catch(() => null),
                getAdminTargetDetails(report.target_type, report.target_id).catch(() => null)
            ]).then(([sum, details]) => {
                if (sum) setSummary(sum)
                if (details) setTargetDetails(details)
            }).finally(() => setIsLoading(false))
        } else if (!isOpen) {
            setSummary(null)
            setTargetDetails(null)
            setHistoryOpen(false)
        }
    }, [report, isOpen])

    if (!report) return null

    return (
        <>
            <BottomSheet isOpen={isOpen} onClose={onClose}>
                <div className="flex flex-col h-full bg-white dark:bg-dark-surface overflow-hidden">
                    <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar pb-32 md:pb-6">
                        {/* Header */}
                        <div className="flex items-center justify-between">
                            <div>
                                <Badge variant={report.target_type === "product" ? "blue" : report.target_type === "partner" ? "orange" : "green"} className="mb-2">
                                    {report.target_type === "product" ? "Produto" : report.target_type === "service" ? "Serviço" : report.target_type === "partner" ? "Parceiro" : report.target_type === "review" ? "Avaliação" : report.target_type}
                                </Badge>
                                <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading leading-tight">{report.target_name}</h3>
                                <p className="text-xs font-medium text-brand-inactive-text mt-1 opacity-70">ID: {report.target_id}</p>
                            </div>
                            <Button
                                variant="outline"
                                className="h-10 px-4 rounded-full font-bold text-[13px]"
                                leftIcon={<ClockIcon size={16} />}
                                onClick={() => setHistoryOpen(true)}
                            >
                                Histórico
                            </Button>
                        </div>

                        {/* Rich Details Section */}
                        {isLoading ? (
                            <div className="flex justify-center py-4"><ThreeDotsLoader /></div>
                        ) : targetDetails ? (
                            <div className="p-4 bg-brand-gray/50 dark:bg-dark-border/20 border border-brand-border dark:border-dark-border rounded-xl space-y-4">
                                <h4 className="text-[13px] font-bold text-brand-inactive-text uppercase tracking-wider flex items-center gap-2">
                                    {report.target_type === 'product' ? <AllProductsIcon size={16} /> : <StoreIcon size={16} />}
                                    Detalhes do Alvo
                                </h4>

                                {report.target_type === 'product' && (
                                    <div className="flex gap-4">
                                        <div className="w-20 h-20 rounded-lg overflow-hidden border border-brand-border shrink-0 bg-white relative">
                                            {targetDetails.images?.[0] ? (
                                                <Image src={targetDetails.images[0]} alt="Produto" fill className="object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center bg-brand-gray text-brand-inactive-text"><AllProductsIcon size={24} /></div>
                                            )}
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <span className="font-bold text-brand-dark">{targetDetails.name}</span>
                                            <span className="text-xs text-brand-inactive-text line-clamp-2">{targetDetails.description || "Sem descrição."}</span>
                                            <div className="flex gap-4 mt-1">
                                                <span className="text-xs font-bold text-brand-green">{(targetDetails.price || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                                                <span className="text-xs font-medium text-brand-inactive-text">Estoque: {targetDetails.stock_quantity || 0}</span>
                                            </div>
                                            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-brand-border/50">
                                                <StoreIcon size={12} className="text-brand-inactive-text" />
                                                <span className="text-xs font-medium text-brand-dark">Vendedor: {targetDetails.partner?.business_name || "Desconhecido"}</span>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {report.target_type === 'partner' && (
                                    <div className="flex gap-4 items-center">
                                        <div className="w-16 h-16 rounded-full overflow-hidden border border-brand-border shrink-0 bg-white relative">
                                            {targetDetails.profile_image_url ? (
                                                <Image src={targetDetails.profile_image_url} alt="Parceiro" fill className="object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center bg-brand-gray text-brand-inactive-text"><StoreIcon size={24} /></div>
                                            )}
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <span className="font-bold text-brand-dark">{targetDetails.business_name}</span>
                                            <span className="text-xs font-medium text-brand-inactive-text">ID: {targetDetails.id}</span>
                                            <span className="text-xs font-medium text-brand-inactive-text">Entrou em: {new Date(targetDetails.created_at).toLocaleDateString("pt-BR")}</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : null}

                        {/* Summary Grid */}
                        {summary && (
                            <div className="grid grid-cols-2 gap-3 p-4 bg-brand-gray dark:bg-dark-border/30 rounded-2xl border border-brand-border dark:border-dark-border">
                                <div className="flex flex-col">
                                    <span className="text-[11px] font-bold text-brand-inactive-text dark:text-dark-body uppercase tracking-wider">Total de Denúncias</span>
                                    <span className="text-2xl font-bold text-brand-dark dark:text-dark-heading">{summary.total}</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[11px] font-bold text-brand-inactive-text dark:text-dark-body uppercase tracking-wider">Denunciantes Únicos</span>
                                    <span className="text-2xl font-bold text-brand-dark dark:text-dark-heading">{summary.distinct_reporters}</span>
                                </div>
                            </div>
                        )}

                        <div className="p-4 bg-blue-50 dark:bg-blue-900/10 rounded-xl border border-blue-100 dark:border-blue-900/20">
                            <div className="flex gap-3">
                                <InfoIcon className="text-blue-600 shrink-0" size={18} />
                                <div className="space-y-1">
                                    <p className="text-sm font-bold text-blue-900 dark:text-blue-300">Resumo do Alvo</p>
                                    <p className="text-xs text-blue-800 dark:text-blue-400">
                                        Este item recebeu {summary?.total || 0} denúncias no total, sendo {summary?.pending || 0} ainda pendentes de análise.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Sticky Actions */}
                    <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border">
                        {report.status === "pending" ? (
                            <div className="flex flex-col gap-3">
                                <Button
                                    variant="filled"
                                    className="w-full rounded-full h-12 text-[15px] font-bold"
                                    onClick={() => onResolve(report)}
                                >
                                    <CheckCircleIcon size={20} className="mr-2" /> Validar Denúncia
                                </Button>
                                <div className="flex gap-3">
                                    <Button
                                        variant="outline"
                                        className="flex-1 rounded-full h-11 text-brand-inactive-text"
                                        onClick={() => onDismiss(report)}
                                    >
                                        <CancelCircleIcon size={18} className="mr-2" /> Descartar
                                    </Button>
                                    <Button
                                        variant="outline"
                                        className="flex-1 rounded-full h-11 text-purple-600 border-purple-200"
                                        onClick={() => onSpam(report)}
                                    >
                                        <AlertTriangleIcon size={18} className="mr-2" /> Spam
                                    </Button>
                                </div>
                            </div>
                        ) : report.status === "validated" ? (
                            <Button variant="outline" className="w-full rounded-full h-12 font-bold" onClick={() => onRevert(report)}>
                                <ReturnIcon size={20} className="mr-2" /> Reverter Validação
                            </Button>
                        ) : (
                            <div className="flex items-center justify-center p-4 text-sm text-brand-inactive-text font-medium bg-brand-gray dark:bg-dark-border/20 rounded-xl">
                                Esta denúncia já foi processada como <strong className="mx-1 uppercase">{report.status}</strong>.
                            </div>
                        )}
                    </div>
                </div>
            </BottomSheet>

            {/* Nested History Sheet */}
            <AuditHistorySheet targetId={report.target_id} isOpen={historyOpen} onClose={() => setHistoryOpen(false)} />
        </>
    )
}

function AuditHistorySheet({ targetId, isOpen, onClose }: { targetId: string, isOpen: boolean, onClose: () => void }) {
    const [history, setHistory] = useState<AuditLogRow[]>([])
    const [isLoading, setIsLoading] = useState(false)

    useEffect(() => {
        if (isOpen && targetId) {
            setIsLoading(true)
            getTargetAuditHistory(targetId).then(setHistory).finally(() => setIsLoading(false))
        }
    }, [isOpen, targetId])

    return (
        <BottomSheet isOpen={isOpen} onClose={onClose}>
            <div className="flex flex-col h-full bg-white dark:bg-dark-surface overflow-hidden">
                <div className="p-4 md:p-6 border-b border-brand-border dark:border-dark-border flex items-center justify-between">
                    <div>
                        <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading leading-tight flex items-center gap-2">
                            <ClockIcon size={20} className="text-brand-inactive-text" /> Histórico de Ações
                        </h3>
                        <p className="text-xs font-medium text-brand-inactive-text mt-1 opacity-70">ID: {targetId}</p>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar pb-24 md:pb-6">
                    {isLoading ? (
                        <div className="flex justify-center py-8"><ThreeDotsLoader /></div>
                    ) : history.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                            <ShieldIcon size={48} className="text-brand-gray dark:text-dark-border mb-4" />
                            <h4 className="text-brand-dark font-bold">Nenhum histórico encontrado</h4>
                            <p className="text-brand-inactive-text text-sm mt-2">Este alvo ainda não sofreu nenhuma ação administrativa.</p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-4">
                            {history.map(log => (
                                <div key={log.id} className="p-4 bg-brand-gray/50 dark:bg-dark-border/20 rounded-xl border border-brand-border dark:border-dark-border flex flex-col gap-2">
                                    <div className="flex justify-between items-start">
                                        <div className="flex flex-col gap-1">
                                            <span className="font-bold text-[14px] text-brand-dark leading-none">{log.action_type}</span>
                                            <span className="text-xs text-brand-inactive-text">{log.admin_name || log.admin_email || log.admin_user_id}</span>
                                        </div>
                                        <div className="flex flex-col items-end">
                                            <span className="text-xs font-bold text-brand-dark">{new Date(log.created_at).toLocaleDateString("pt-BR")}</span>
                                            <span className="text-[10px] text-brand-inactive-text">{new Date(log.created_at).toLocaleTimeString("pt-BR")}</span>
                                        </div>
                                    </div>
                                    {!!(log.metadata && typeof log.metadata === 'object' && 'reason' in log.metadata && log.metadata.reason) && (
                                        <p className="text-xs text-brand-inactive-text italic border-t border-brand-border/50 pt-2 mt-1">
                                            "{String((log.metadata as any).reason)}"
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border z-10">
                    <Button variant="outline" className="w-full rounded-full h-12 font-bold" onClick={onClose}>
                        Voltar aos Detalhes
                    </Button>
                </div>
            </div>
        </BottomSheet>
    )
}
