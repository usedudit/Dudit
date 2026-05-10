"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react"
import { Button, Badge, Input, Pagination, IconPlaceholder } from "@/components/reusable"
import DefaultModal from "@/components/reusable/DefaultModal"
import ReportListRow from "./ReportListRow"
import ReportsPageControls from "./ReportsPageControls"
import { FadeIn } from "@/components/animations/FadeIn"
import { AnimatePresence } from "framer-motion"
import { supabaseBrowser } from "@/lib/supabase/browser-client"
import type { CursorPaginatedResult } from "@/lib/admin/types"
import type {
    Report,
    ReportsStats,
    ReportStatus,
    ReportTargetType,
    ReportListFilters,
    TargetReportSummary,
} from "@/app/actions/admin/reports"
import {
    getReports,
    resolveReport,
    dismissReport,
    markReportSpam,
    revertReportValidation,
    getReportsStats,
    getTargetReportSummary,
} from "@/app/actions/admin/reports"

// ─── Constants ──────────────────────────────────────────────────────────────

const PAGE_SIZE = 30
const REALTIME_DEBOUNCE_MS = 600
const REALTIME_MAX_PENDING = 30
const SEARCH_DEBOUNCE_MS = 300



// ─── Main Component ─────────────────────────────────────────────────────────

interface ReportsListProps {
    initialData: CursorPaginatedResult<Report>
    initialStats: ReportsStats
}

const ReportsList = ({ initialData, initialStats }: ReportsListProps) => {
    // ── State ──
    const [items, setItems] = useState<Report[]>(initialData.data)
    const [nextCursor, setNextCursor] = useState<string | null>(initialData.nextCursor)
    const [hasMore, setHasMore] = useState<boolean>(initialData.hasMore)
    const [stats, setStats] = useState<ReportsStats>(initialStats)

    // Filters (URL-light: kept in component state to keep this PR focused).
    // Filters
    const [statusFilter, setStatusFilter] = useState<ReportStatus | "all">("pending")
    const [targetFilter, setTargetFilter] = useState<ReportTargetType | "all">("all")
    const [searchInput, setSearchInput] = useState("")
    const [search, setSearch] = useState("")
    const [page, setPage] = useState(1)
    const itemsPerPage = 10

    // Modals
    const [resolveTarget, setResolveTarget] = useState<Report | null>(null)
    const [dismissTarget, setDismissTarget] = useState<Report | null>(null)
    const [spamTarget, setSpamTarget] = useState<Report | null>(null)
    const [revertTarget, setRevertTarget] = useState<Report | null>(null)
    const [detailTarget, setDetailTarget] = useState<Report | null>(null)
    const [actionReason, setActionReason] = useState("")

    const [isPending, startTransition] = useTransition()
    const [isLoadingMore, setIsLoadingMore] = useState(false)

    // Refs
    const sentinelRef = useRef<HTMLDivElement | null>(null)
    const filtersRef = useRef<{ status: ReportListFilters["status"]; targetType: ReportListFilters["targetType"]; search: string }>({
        status: "pending",
        targetType: "all",
        search: "",
    })
    const realtimeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const pendingChangesRef = useRef<{ count: number }>({ count: 0 })

    // Keep filtersRef in sync with state (used by realtime handler without stale closures).
    useEffect(() => {
        filtersRef.current = { status: statusFilter, targetType: targetFilter, search }
    }, [statusFilter, targetFilter, search])

    // ── Helpers ──

    const buildFilters = useCallback((): ReportListFilters => ({
        status: statusFilter,
        targetType: targetFilter,
        search: search || undefined,
    }), [statusFilter, targetFilter, search])

    const refetchStats = useCallback(async () => {
        try {
            const fresh = await getReportsStats()
            setStats(fresh)
        } catch {
            // Stats are best-effort; never break the UI.
        }
    }, [])

    const refetchFirstPage = useCallback(async (overrides?: Partial<ReportListFilters>) => {
        const filters: ReportListFilters = { ...buildFilters(), ...(overrides || {}) }
        const result = await getReports(null, PAGE_SIZE, filters)
        setItems(result.data)
        setNextCursor(result.nextCursor)
        setHasMore(result.hasMore)
    }, [buildFilters])

    // ── Search debounce ──
    useEffect(() => {
        const t = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS)
        return () => clearTimeout(t)
    }, [searchInput])

    // ── Refetch on filter change (excluding initial mount when state matches initialData) ──
    const isFirstRender = useRef(true)
    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false
            return
        }
        startTransition(() => {
            setPage(1)
            refetchFirstPage().catch(() => { /* swallow */ })
        })
    }, [statusFilter, targetFilter, search, refetchFirstPage])

    // ── Infinite scroll via IntersectionObserver ──
    useEffect(() => {
        if (!hasMore) return
        const node = sentinelRef.current
        if (!node) return

        const observer = new IntersectionObserver(
            entries => {
                const entry = entries[0]
                if (!entry?.isIntersecting) return
                if (isLoadingMore || isPending || !nextCursor) return

                setIsLoadingMore(true)
                getReports(nextCursor, PAGE_SIZE, buildFilters())
                    .then(result => {
                        setItems(prev => {
                            const seen = new Set(prev.map(r => r.id))
                            const merged = [...prev]
                            for (const r of result.data) {
                                if (!seen.has(r.id)) merged.push(r)
                            }
                            return merged
                        })
                        setNextCursor(result.nextCursor)
                        setHasMore(result.hasMore)
                    })
                    .catch(() => { /* swallow */ })
                    .finally(() => setIsLoadingMore(false))
            },
            { rootMargin: "200px 0px" }
        )
        observer.observe(node)
        return () => observer.disconnect()
    }, [hasMore, nextCursor, isLoadingMore, isPending, buildFilters])

    // ── Realtime subscription (filtered, debounced, cleaned up) ──
    useEffect(() => {
        // Filter scope at the wire level: only listen to the active status when
        // the status filter is concrete (avoids global firehose on busy systems).
        const channelName = `admin-reports:${statusFilter || "pending"}:${targetFilter || "all"}`
        const filterStatus = statusFilter && statusFilter !== "all" ? `status=eq.${statusFilter}` : undefined

        const eventConfig: Record<string, unknown> = {
            event: "*",
            schema: "public",
            table: "reports",
        }
        if (filterStatus) eventConfig.filter = filterStatus

        const scheduleRefetch = () => {
            pendingChangesRef.current.count += 1

            // Hard cap: if a burst exceeds the cap, refetch immediately.
            if (pendingChangesRef.current.count >= REALTIME_MAX_PENDING) {
                if (realtimeTimerRef.current) {
                    clearTimeout(realtimeTimerRef.current)
                    realtimeTimerRef.current = null
                }
                pendingChangesRef.current.count = 0
                refetchFirstPage().catch(() => { /* swallow */ })
                refetchStats().catch(() => { /* swallow */ })
                return
            }

            if (realtimeTimerRef.current) return
            realtimeTimerRef.current = setTimeout(() => {
                realtimeTimerRef.current = null
                pendingChangesRef.current.count = 0
                // Re-fetch first page + stats. Keeps DB as source of truth and
                // avoids guessing item ordering in the client.
                refetchFirstPage().catch(() => { /* swallow */ })
                refetchStats().catch(() => { /* swallow */ })
            }, REALTIME_DEBOUNCE_MS)
        }

        const channel = supabaseBrowser
            .channel(channelName)
            .on("postgres_changes", eventConfig, () => {
                scheduleRefetch()
            })
            .subscribe()

        return () => {
            if (realtimeTimerRef.current) {
                clearTimeout(realtimeTimerRef.current)
                realtimeTimerRef.current = null
            }
            pendingChangesRef.current.count = 0
            try {
                supabaseBrowser.removeChannel(channel)
            } catch {
                // best effort
            }
        }
    }, [statusFilter, targetFilter, refetchFirstPage, refetchStats])

    // ── Action handlers ──

    const handleResolve = () => {
        if (!resolveTarget) return
        const reason = actionReason.trim()
        if (reason.length < 5) return
        startTransition(async () => {
            const result = await resolveReport(resolveTarget.id, reason)
            if (result.success) {
                setResolveTarget(null)
                setActionReason("")
                await Promise.all([refetchFirstPage(), refetchStats()])
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
                setDismissTarget(null)
                setActionReason("")
                await Promise.all([refetchFirstPage(), refetchStats()])
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
                setSpamTarget(null)
                setActionReason("")
                await Promise.all([refetchFirstPage(), refetchStats()])
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
                setRevertTarget(null)
                setActionReason("")
                await Promise.all([refetchFirstPage(), refetchStats()])
            }
        })
    }

    // ── Render ──

    const headerStats = useMemo(() => ([
        { key: "pending", label: "Pendentes", value: stats.pending, color: "text-brand-orange" },
        { key: "validated", label: "Validadas", value: stats.validated, color: "text-brand-red" },
        { key: "dismissed", label: "Descartadas", value: stats.dismissed, color: "text-brand-inactive-text" },
        { key: "spam", label: "Spam", value: stats.spam, color: "text-purple-600" },
    ]), [stats])

    // ── Pagination logic ──
    const totalPages = Math.ceil(items.length / itemsPerPage)
    const paginatedItems = useMemo(() => {
        const start = (page - 1) * itemsPerPage
        return items.slice(start, start + itemsPerPage)
    }, [items, page])

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

                {/* Controls (ERP Standard) */}
                <ReportsPageControls
                    statusFilter={statusFilter}
                    setStatusFilter={setStatusFilter}
                    targetFilter={targetFilter}
                    setTargetFilter={setTargetFilter}
                    search={searchInput}
                    onSearchChange={setSearchInput}
                    stats={stats}
                />

                {/* List Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar px-4 md:px-8 pb-20 md:pb-6">
                    <AnimatePresence mode="wait">
                        {items.length === 0 && !isPending ? (
                            <FadeIn key="empty" className="w-full">
                                <IconPlaceholder
                                    placeholderType="image"
                                    imageSrc="https://img.dudit.com.br/static/mascots/NaoEncontrado.png"
                                    imageAlt="Nenhuma denúncia"
                                    title="Nenhuma denúncia encontrada"
                                    subtitle="Não há denúncias que correspondam aos filtros atuais ou à sua busca."
                                    itemButton={{
                                        text: "Limpar Filtros",
                                        action: () => {
                                            setStatusFilter("pending")
                                            setTargetFilter("all")
                                            setSearchInput("")
                                        },
                                        variant: "outline"
                                    }}
                                />
                            </FadeIn>
                        ) : (
                            <div className="w-full">
                                {/* Table Header (Desktop Only) */}
                                <div className="hidden md:grid grid-cols-[100px_1fr_100px_100px_130px_180px] gap-4 py-3 px-6 bg-brand-gray/50 dark:bg-dark-border/30 rounded-lg mb-2">
                                    <span className="text-[12px] font-bold text-brand-inactive-text uppercase tracking-wider">Tipo</span>
                                    <span className="text-[12px] font-bold text-brand-inactive-text uppercase tracking-wider">Denúncia</span>
                                    <span className="text-[12px] font-bold text-brand-inactive-text uppercase tracking-wider text-center">Severidade</span>
                                    <span className="text-[12px] font-bold text-brand-inactive-text uppercase tracking-wider text-center">Status</span>
                                    <span className="text-[12px] font-bold text-brand-inactive-text uppercase tracking-wider text-center">Data</span>
                                    <span className="text-[12px] font-bold text-brand-inactive-text uppercase tracking-wider text-center">Ações</span>
                                </div>

                                {/* List Rows */}
                                <div className="flex flex-col">
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
                                </div>

                                {/* Pagination (ERP Standard) */}
                                {totalPages > 1 && (
                                    <div className="mt-6 flex justify-center">
                                        <Pagination
                                            currentPage={page}
                                            totalPages={totalPages}
                                            onPageChange={setPage}
                                        />
                                    </div>
                                )}

                                {/* Infinite Scroll Loader (Hidden but present for functionality) */}
                                {hasMore && (
                                    <div ref={sentinelRef} className="py-8 flex items-center justify-center">
                                        {isLoadingMore && <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-red"></div>}
                                    </div>
                                )}
                            </div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
            {/* Modals remain below */}


            {/* Resolve modal */}
            <ReportActionModal
                isOpen={!!resolveTarget}
                onClose={() => { setResolveTarget(null); setActionReason("") }}
                title="Validar denúncia"
                description={`Confirmar que a denúncia de "${resolveTarget?.target_name || ""}" é válida. O risk_score do parceiro será incrementado em +5 (com proteção contra duplicidade).`}
                actionLabel="Validar"
                actionVariant="destructive"
                isPending={isPending}
                reason={actionReason}
                setReason={setActionReason}
                onConfirm={handleResolve}
            />

            {/* Dismiss modal */}
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

            {/* Spam modal */}
            <ReportActionModal
                isOpen={!!spamTarget}
                onClose={() => { setSpamTarget(null); setActionReason("") }}
                title="Marcar como spam"
                description={`Marcar a denúncia de "${spamTarget?.target_name || ""}" como spam/fraudulenta. Não altera risk_score.`}
                actionLabel="Marcar como spam"
                actionVariant="warning"
                isPending={isPending}
                reason={actionReason}
                setReason={setActionReason}
                onConfirm={handleSpam}
            />

            {/* Revert modal */}
            <ReportActionModal
                isOpen={!!revertTarget}
                onClose={() => { setRevertTarget(null); setActionReason("") }}
                title="Reverter validação"
                description={`Reverter a validação da denúncia de "${revertTarget?.target_name || ""}". O risk_score do parceiro será decrementado nos pontos aplicados originalmente.`}
                actionLabel="Reverter"
                actionVariant="outline"
                isPending={isPending}
                reason={actionReason}
                setReason={setActionReason}
                onConfirm={handleRevert}
            />

            {/* Details modal */}
            <ReportDetailsModal
                report={detailTarget}
                onClose={() => setDetailTarget(null)}
            />
        </FadeIn>
    )
}

export default ReportsList

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
}

function ReportActionModal({
    isOpen,
    onClose,
    title,
    description,
    actionLabel,
    actionVariant,
    isPending,
    reason,
    setReason,
    onConfirm,
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
                    label="Motivo"
                    placeholder="Mínimo 5 caracteres..."
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    required
                    multiline
                    rows={3}
                    maxLength={1000}
                />
            </div>
        </DefaultModal>
    )
}

interface ReportDetailsModalProps {
    report: Report | null
    onClose: () => void
}

function ReportDetailsModal({ report, onClose }: ReportDetailsModalProps) {
    const [summary, setSummary] = useState<TargetReportSummary | null>(null)
    const [isLoading, setIsLoading] = useState(false)

    useEffect(() => {
        if (!report) {
            setSummary(null)
            return
        }
        setIsLoading(true)
        let cancelled = false
        getTargetReportSummary({ targetType: report.target_type, targetId: report.target_id })
            .then(result => { if (!cancelled) setSummary(result) })
            .catch(() => { if (!cancelled) setSummary(null) })
            .finally(() => { if (!cancelled) setIsLoading(false) })
        return () => { cancelled = true }
    }, [report])

    return (
        <DefaultModal
            isOpen={!!report}
            onClose={onClose}
            title="Detalhes da denúncia"
            maxWidth="lg"
            footer={<Button variant="outline" onClick={onClose}>Fechar</Button>}
        >
            {report && (
                <div className="flex flex-col gap-4 text-sm">
                    <div className="flex items-center gap-2 flex-wrap">
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
                        <Badge variant={report.severity === "high" ? "red" : report.severity === "normal" ? "orange" : "gray"}>
                            {report.severity === "high" ? "Alto" : report.severity === "normal" ? "Médio" : "Baixo"}
                        </Badge>
                    </div>

                    <Field label="Alvo" value={report.target_name} />
                    <Field label="Motivo" value={report.reason_label || report.reason} />
                    {report.description && <Field label="Descrição" value={report.description} />}
                    <Field label="Reportado por" value={report.reporter_name} />
                    <Field label="Criado em" value={new Date(report.created_at).toLocaleString("pt-BR")} />

                    {report.resolved_at && (
                        <>
                            <Field label="Resolvida em" value={new Date(report.resolved_at).toLocaleString("pt-BR")} />
                            {report.resolution_reason && (
                                <Field label="Motivo da resolução" value={report.resolution_reason} />
                            )}
                        </>
                    )}

                    <div className="border-t border-brand-border dark:border-dark-border pt-3">
                        <div className="text-xs uppercase tracking-wide text-brand-inactive-text mb-2">
                            Outras denúncias para este alvo
                        </div>
                        {isLoading ? (
                            <div className="text-xs text-brand-inactive-text">Calculando...</div>
                        ) : summary ? (
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                <SummaryStat label="Total" value={summary.total} />
                                <SummaryStat label="Reporters únicos" value={summary.distinct_reporters} />
                                <SummaryStat label="Pendentes" value={summary.pending} />
                                <SummaryStat label="Validadas" value={summary.validated} />
                                <SummaryStat label="Descartadas" value={summary.dismissed} />
                                <SummaryStat label="Spam" value={summary.spam} />
                            </div>
                        ) : (
                            <div className="text-xs text-brand-inactive-text">Sem dados</div>
                        )}
                    </div>
                </div>
            )}
        </DefaultModal>
    )
}

function Field({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <div className="text-xs uppercase tracking-wide text-brand-inactive-text mb-1">{label}</div>
            <div className="text-sm text-brand-dark dark:text-dark-heading break-words">{value}</div>
        </div>
    )
}

function SummaryStat({ label, value }: { label: string; value: number }) {
    return (
        <div className="rounded-lg border border-brand-border dark:border-dark-border px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-brand-inactive-text">{label}</div>
            <div className="text-lg font-bold text-brand-dark dark:text-dark-heading">{value}</div>
        </div>
    )
}
