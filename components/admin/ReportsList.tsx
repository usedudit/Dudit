"use client"

import React, { useState, useTransition, useCallback } from "react"
import { Button, Badge, Input, Pagination } from "@/components/reusable"
import DefaultModal from "@/components/reusable/DefaultModal"
import { SearchIcon, AlertTriangleIcon, CheckCircleIcon, CancelCircleIcon, ClockIcon } from "@/lib/icons"
import type { CursorPaginatedResult } from "@/lib/admin/types"
import type { Report } from "@/app/actions/admin/reports"
import { getReports, resolveReport, dismissReport } from "@/app/actions/admin/reports"

// ─── Status badge ───────────────────────────────────────────────────────────

function ReportStatusBadge({ status }: { status: string }) {
    const map: Record<string, { variant: "orange" | "red" | "gray"; label: string }> = {
        pending: { variant: "orange", label: "Pendente" },
        validated: { variant: "red", label: "Validada" },
        dismissed: { variant: "gray", label: "Descartada" },
    }
    const info = map[status] || { variant: "gray" as const, label: status }
    return <Badge variant={info.variant}>{info.label}</Badge>
}

function TargetTypeBadge({ type }: { type: string }) {
    const labels: Record<string, string> = {
        product: "Produto",
        service: "Serviço",
        partner: "Parceiro",
        review: "Avaliação",
    }
    return <Badge variant="blue">{labels[type] || type}</Badge>
}

// ─── Main Component ─────────────────────────────────────────────────────────

interface ReportsListProps {
    initialData: CursorPaginatedResult<Report>
}

const ReportsList = ({ initialData }: ReportsListProps) => {
    const [allReports, setAllReports] = useState<Report[]>(initialData.data)
    const [statusFilter, setStatusFilter] = useState("pending")
    const [search, setSearch] = useState("")
    const [resolveTarget, setResolveTarget] = useState<Report | null>(null)
    const [dismissTarget, setDismissTarget] = useState<Report | null>(null)
    const [actionReason, setActionReason] = useState("")
    const [isPending, startTransition] = useTransition()
    const [page, setPage] = useState(1)

    const itemsPerPage = 20

    const fetchData = useCallback((filter?: string) => {
        startTransition(async () => {
            const result = await getReports(null, 200, filter || statusFilter)
            setAllReports(result.data)
            setPage(1)
        })
    }, [statusFilter])

    const handleFilterChange = (filter: string) => {
        setStatusFilter(filter)
        fetchData(filter)
    }

    const handleResolve = () => {
        if (!resolveTarget || !actionReason.trim() || actionReason.trim().length < 5) return
        startTransition(async () => {
            const result = await resolveReport(resolveTarget.id, actionReason)
            if (result.success) {
                setResolveTarget(null)
                setActionReason("")
                fetchData()
            }
        })
    }

    const handleDismiss = () => {
        if (!dismissTarget || !actionReason.trim() || actionReason.trim().length < 5) return
        startTransition(async () => {
            const result = await dismissReport(dismissTarget.id, actionReason)
            if (result.success) {
                setDismissTarget(null)
                setActionReason("")
                fetchData()
            }
        })
    }

    // Client-side filtering + pagination
    const filteredReports = allReports.filter(r =>
        !search || r.target_name.toLowerCase().includes(search.toLowerCase()) || r.reason.toLowerCase().includes(search.toLowerCase())
    )
    const totalPages = Math.ceil(filteredReports.length / itemsPerPage)
    const paginated = filteredReports.slice((page - 1) * itemsPerPage, page * itemsPerPage)

    return (
        <div className="mx-auto w-full pt-4 flex flex-col h-full overflow-hidden relative">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6 px-4 md:px-8">
                <div className="max-w-[220px]">
                    <Input
                        name="search"
                        placeholder="Buscar..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        prefix={
                            <SearchIcon
                                size={18}
                                className="text-brand-inactive-text flex-shrink-0"
                            />
                        }
                    />
                </div>
                <div className="flex gap-2">
                    {[
                        { value: "pending", label: "Pendentes" },
                        { value: "validated", label: "Validadas" },
                        { value: "dismissed", label: "Descartadas" },
                        { value: "all", label: "Todas" },
                    ].map(f => (
                        <Button
                            key={f.value}
                            variant={statusFilter === f.value ? "default" : "outline"}
                            onClick={() => handleFilterChange(f.value)}
                            className="h-[42px] px-3 text-xs"
                        >
                            {f.label}
                        </Button>
                    ))}
                </div>
            </div>

            {/* Reports list */}
            <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-20 md:pb-0">
                {paginated.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-[400px] text-center">
                        <AlertTriangleIcon className="w-12 h-12 text-brand-inactive-text dark:text-dark-body mb-3" />
                        <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading mb-2">Nenhuma denúncia</h3>
                        <p className="text-brand-inactive-text dark:text-dark-body text-[15px]">
                            Não há denúncias pendentes
                        </p>
                    </div>
                ) : (
                    <>
                        {/* Table header */}
                        <div className="hidden md:grid grid-cols-[80px_1fr_100px_130px_130px] gap-4 py-3 px-6 bg-brand-gray dark:bg-dark-border/50 rounded-lg mb-1">
                            <span className="text-[13px] font-medium text-gray-500 dark:text-dark-body">Tipo</span>
                            <span className="text-[13px] font-medium text-gray-500 dark:text-dark-body">Denúncia</span>
                            <span className="text-[13px] font-medium text-gray-500 dark:text-dark-body text-center">Status</span>
                            <span className="text-[13px] font-medium text-gray-500 dark:text-dark-body text-center">Criado em</span>
                            <span className="text-[13px] font-medium text-gray-500 dark:text-dark-body text-center">Ações</span>
                        </div>

                        {paginated.map((report) => (
                            <div
                                key={report.id}
                                className="grid grid-cols-1 md:grid-cols-[80px_1fr_100px_130px_130px] gap-2 md:gap-4 items-center py-3 px-4 md:px-6 border-b border-brand-border dark:border-dark-border hover:bg-brand-gray/30 dark:hover:bg-dark-border/20 transition-colors"
                            >
                                {/* Type */}
                                <div>
                                    <TargetTypeBadge type={report.target_type} />
                                </div>

                                {/* Info */}
                                <div className="min-w-0">
                                    <h3 className="text-sm font-semibold text-brand-dark dark:text-dark-heading truncate">
                                        {report.target_name}
                                    </h3>
                                    <p className="text-xs text-brand-dark dark:text-dark-body mt-0.5 truncate">
                                        Motivo: {report.reason}
                                    </p>
                                    <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5">
                                        Por: {report.reporter_name}
                                    </p>
                                </div>

                                {/* Status */}
                                <div className="flex justify-center">
                                    <ReportStatusBadge status={report.status} />
                                </div>

                                {/* Created at */}
                                <div className="flex items-center justify-center gap-1 text-xs text-brand-inactive-text dark:text-dark-body">
                                    <ClockIcon className="w-3 h-3" />
                                    {new Date(report.created_at).toLocaleDateString("pt-BR")}
                                </div>

                                {/* Actions */}
                                <div className="flex justify-center gap-2">
                                    {report.status === "pending" && (
                                        <>
                                            <Button
                                                variant="outline"
                                                onClick={() => setResolveTarget(report)}
                                                disabled={isPending}
                                                className="h-8 px-2 text-xs text-brand-red hover:text-brand-red"
                                            >
                                                <CheckCircleIcon className="w-3.5 h-3.5 mr-1" /> Validar
                                            </Button>
                                            <Button
                                                variant="outline"
                                                onClick={() => setDismissTarget(report)}
                                                disabled={isPending}
                                                className="h-8 px-2 text-xs"
                                            >
                                                <CancelCircleIcon className="w-3.5 h-3.5 mr-1" /> Descartar
                                            </Button>
                                        </>
                                    )}
                                </div>
                            </div>
                        ))}
                    </>
                )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
            )}

            {/* Resolve Modal — DefaultModal */}
            <DefaultModal
                isOpen={!!resolveTarget}
                onClose={() => { setResolveTarget(null); setActionReason("") }}
                title="Validar denúncia"
                maxWidth="md"
                footer={
                    <>
                        <Button variant="outline" onClick={() => { setResolveTarget(null); setActionReason("") }}>Cancelar</Button>
                        <Button
                            variant="destructive"
                            onClick={handleResolve}
                            disabled={!actionReason.trim() || actionReason.trim().length < 5 || isPending}
                        >
                            {isPending ? "Validando..." : "Validar"}
                        </Button>
                    </>
                }
            >
                <div className="flex flex-col gap-4">
                    <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                        Confirmar que a denúncia de &quot;{resolveTarget?.target_name}&quot; é válida. O risk_score do parceiro será incrementado em +5.
                    </p>
                    <Input
                        name="resolve-reason"
                        label="Motivo"
                        placeholder="Motivo da validação (mínimo 5 caracteres)..."
                        value={actionReason}
                        onChange={e => setActionReason(e.target.value)}
                        required
                        multiline
                        rows={3}
                    />
                </div>
            </DefaultModal>

            {/* Dismiss Modal — DefaultModal */}
            <DefaultModal
                isOpen={!!dismissTarget}
                onClose={() => { setDismissTarget(null); setActionReason("") }}
                title="Descartar denúncia"
                maxWidth="md"
                footer={
                    <>
                        <Button variant="outline" onClick={() => { setDismissTarget(null); setActionReason("") }}>Cancelar</Button>
                        <Button
                            variant="outline"
                            onClick={handleDismiss}
                            disabled={!actionReason.trim() || actionReason.trim().length < 5 || isPending}
                        >
                            {isPending ? "Descartando..." : "Descartar"}
                        </Button>
                    </>
                }
            >
                <div className="flex flex-col gap-4">
                    <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                        Marcar a denúncia de &quot;{dismissTarget?.target_name}&quot; como improcedente.
                    </p>
                    <Input
                        name="dismiss-reason"
                        label="Motivo"
                        placeholder="Motivo da descarte (mínimo 5 caracteres)..."
                        value={actionReason}
                        onChange={e => setActionReason(e.target.value)}
                        required
                        multiline
                        rows={3}
                    />
                </div>
            </DefaultModal>
        </div>
    )
}

export default ReportsList
