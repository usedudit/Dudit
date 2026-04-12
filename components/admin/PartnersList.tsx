"use client"

import React, { useState, useTransition, useCallback, useEffect } from "react"
import { Button, Badge, Input, Pagination } from "@/components/reusable"
import AlertModal from "@/components/reusable/AlertModal"
import DefaultModal from "@/components/reusable/DefaultModal"
import StepUpModal from "@/components/admin/StepUpModal"
import { SearchIcon, StoreIcon, CheckCircleIcon, BlockedIcon, ClockIcon, AlertTriangleIcon } from "@/lib/icons"
import type { EnforcementPartner, CursorPaginatedResult } from "@/lib/admin/types"
import {
    getPartners,
    suspendPartner,
    unsuspendPartner,
    disableTenantAccess,
    enableTenantAccess,
} from "@/app/actions/admin/enforcement"

// ─── Partner Status Badge ───────────────────────────────────────────────────

function PartnerStatusBadge({ partner }: { partner: EnforcementPartner }) {
    if (partner.erp_disabled) return <Badge variant="red">ERP Desabilitado</Badge>
    if (partner.suspended_at) return <Badge variant="orange">Suspenso</Badge>
    if (!partner.is_active) return <Badge variant="gray">Inativo</Badge>
    return <Badge variant="green">Ativo</Badge>
}

// ─── Risk Score Badge ───────────────────────────────────────────────────────

function RiskScoreBadge({ score }: { score: number }) {
    if (score <= 0) return null
    const variant = score >= 50 ? "red" : score >= 20 ? "orange" : "blue"
    return <Badge variant={variant}>Risk: {score}</Badge>
}

// ─── Duration selector ──────────────────────────────────────────────────────

function DurationSelect({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
    return (
        <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-brand-dark dark:text-dark-body">Duração</label>
            <select
                value={value === null ? "permanent" : String(value)}
                onChange={e => {
                    const val = e.target.value
                    onChange(val === "permanent" ? null : parseInt(val))
                }}
                className="w-full h-[42px] px-4 rounded-lg border border-brand-border dark:border-dark-border bg-brand-gray dark:bg-dark-border/30 text-sm text-brand-dark dark:text-dark-heading focus:outline-none focus:border-brand-dark dark:focus:border-dark-body focus:bg-white dark:focus:bg-dark-surface transition-colors"
            >
                <option value="7">7 dias</option>
                <option value="14">14 dias</option>
                <option value="30">30 dias</option>
                <option value="90">90 dias</option>
                <option value="365">1 ano</option>
                <option value="permanent">Permanente</option>
            </select>
        </div>
    )
}

// ─── Main Component ─────────────────────────────────────────────────────────

interface PartnersListProps {
    initialData: CursorPaginatedResult<EnforcementPartner>
}

const PartnersList = ({ initialData }: PartnersListProps) => {
    const [allPartners, setAllPartners] = useState<EnforcementPartner[]>(initialData.data)
    const [search, setSearch] = useState("")
    const [debouncedSearch, setDebouncedSearch] = useState("")
    const [page, setPage] = useState(1)
    const [disableTarget, setDisableTarget] = useState<EnforcementPartner | null>(null)
    const [enableTarget, setEnableTarget] = useState<EnforcementPartner | null>(null)
    const [suspendTarget, setSuspendTarget] = useState<EnforcementPartner | null>(null)
    const [unsuspendTarget, setUnsuspendTarget] = useState<EnforcementPartner | null>(null)
    const [disableReason, setDisableReason] = useState("")
    const [disableDuration, setDisableDuration] = useState<number | null>(30)
    const [disableConfirmed, setDisableConfirmed] = useState(false)
    const [showStepUp, setShowStepUp] = useState(false)
    const [pendingStepUpAction, setPendingStepUpAction] = useState<"disable" | "suspend" | null>(null)
    const [isPending, startTransition] = useTransition()

    const itemsPerPage = 20

    // Debounced search
    useEffect(() => {
        const timeout = setTimeout(() => setDebouncedSearch(search), 400)
        return () => clearTimeout(timeout)
    }, [search])

    const fetchAllPartners = useCallback((searchTerm?: string) => {
        startTransition(async () => {
            const result = await getPartners(null, 200, searchTerm || undefined)
            setAllPartners(result.data)
            setPage(1)
        })
    }, [])

    useEffect(() => {
        fetchAllPartners(debouncedSearch || undefined)
    }, [debouncedSearch, fetchAllPartners])

    // Client-side pagination
    const totalPages = Math.ceil(allPartners.length / itemsPerPage)
    const paginated = allPartners.slice((page - 1) * itemsPerPage, page * itemsPerPage)

    const handleDisableERP = () => {
        if (!disableTarget) return
        if (!disableReason.trim() || disableReason.trim().length < 5) return
        if (!disableConfirmed) return
        // Show step-up modal instead of executing directly
        setPendingStepUpAction("disable")
        setShowStepUp(true)
    }

    const handleEnableERP = () => {
        if (!enableTarget) return
        startTransition(async () => {
            const result = await enableTenantAccess(enableTarget.id, "Reabilitado pelo admin")
            if (result.success) {
                setEnableTarget(null)
                fetchAllPartners(debouncedSearch || undefined)
            }
        })
    }

    const handleSuspend = () => {
        if (!suspendTarget) return
        // Show step-up modal instead of executing directly
        setPendingStepUpAction("suspend")
        setShowStepUp(true)
    }

    const handleStepUpAuthenticated = (token: string) => {
        setShowStepUp(false)

        if (pendingStepUpAction === "disable" && disableTarget) {
            startTransition(async () => {
                const result = await disableTenantAccess(disableTarget.id, disableReason, disableDuration, token)
                if (result.success) {
                    setDisableTarget(null)
                    setDisableReason("")
                    setDisableDuration(30)
                    setDisableConfirmed(false)
                    fetchAllPartners(debouncedSearch || undefined)
                }
            })
        } else if (pendingStepUpAction === "suspend" && suspendTarget) {
            startTransition(async () => {
                const result = await suspendPartner(suspendTarget.id, "Suspenso pelo admin", token)
                if (result.success) {
                    setSuspendTarget(null)
                    fetchAllPartners(debouncedSearch || undefined)
                }
            })
        }
        setPendingStepUpAction(null)
    }

    const handleUnsuspend = () => {
        if (!unsuspendTarget) return
        startTransition(async () => {
            const result = await unsuspendPartner(unsuspendTarget.id, "Reativado pelo admin")
            if (result.success) {
                setUnsuspendTarget(null)
                fetchAllPartners(debouncedSearch || undefined)
            }
        })
    }

    return (
        <div className="mx-auto w-full pt-4 flex flex-col h-full overflow-hidden relative">
            {/* Search bar */}
            <div className="flex items-center gap-3 mb-6 px-4 md:px-8">
                <div className="max-w-[220px]">
                    <Input
                        name="search"
                        placeholder="Buscar..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        prefix={
                            <SearchIcon
                                size={18}
                                className="text-brand-inactive-text shrink-0"
                            />
                        }
                    />
                </div>
            </div>

            {/* Partners list */}
            <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-20 md:pb-0">
                {paginated.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-[400px] text-center">
                        <StoreIcon className="w-12 h-12 text-brand-inactive-text dark:text-dark-body mb-3" />
                        <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading mb-2">Nenhum parceiro encontrado</h3>
                        <p className="text-brand-inactive-text dark:text-dark-body text-[15px]">
                            {search ? "Tente ajustar sua busca." : "Nenhum parceiro cadastrado no sistema."}
                        </p>
                    </div>
                ) : (
                    <>
                        {/* Table header */}
                        <div className="hidden md:grid grid-cols-[1fr_130px_100px_160px_140px] gap-4 py-3 px-6 bg-brand-gray dark:bg-dark-border/50 rounded-lg mb-1">
                            <span className="text-[13px] font-medium text-gray-500 dark:text-dark-body">Parceiro</span>
                            <span className="text-[13px] font-medium text-gray-500 dark:text-dark-body text-center">Status</span>
                            <span className="text-[13px] font-medium text-gray-500 dark:text-dark-body text-center">Risco</span>
                            <span className="text-[13px] font-medium text-gray-500 dark:text-dark-body text-center">Criado em</span>
                            <span className="text-[13px] font-medium text-gray-500 dark:text-dark-body text-center">Ações</span>
                        </div>

                        {/* Partner rows */}
                        {paginated.map((partner) => (
                            <div
                                key={partner.id}
                                className="grid grid-cols-1 md:grid-cols-[1fr_130px_100px_160px_140px] gap-2 md:gap-4 items-center py-3 px-4 md:px-6 border-b border-brand-border dark:border-dark-border hover:bg-brand-gray/30 dark:hover:bg-dark-border/20 transition-colors"
                            >
                                {/* Partner info */}
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-9 h-9 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center shrink-0">
                                        <StoreIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="text-sm font-semibold text-brand-dark dark:text-dark-heading truncate">
                                            {partner.store_name}
                                        </h3>
                                        <span className="text-xs text-brand-inactive-text dark:text-dark-body">
                                            Dono: {partner.owner_name}
                                        </span>
                                        {partner.suspended_at && partner.suspended_until && (
                                            <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-0.5">
                                                <AlertTriangleIcon className="w-3 h-3 shrink-0" />
                                                Até {new Date(partner.suspended_until).toLocaleDateString("pt-BR")}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* Status */}
                                <div className="flex justify-center">
                                    <PartnerStatusBadge partner={partner} />
                                </div>

                                {/* Risk score */}
                                <div className="flex justify-center">
                                    <RiskScoreBadge score={partner.risk_score} />
                                </div>

                                {/* Created at */}
                                <div className="flex items-center justify-center gap-1 text-xs text-brand-inactive-text dark:text-dark-body">
                                    <ClockIcon className="w-3 h-3" />
                                    {new Date(partner.created_at).toLocaleDateString("pt-BR")}
                                </div>

                                {/* Actions */}
                                <div className="flex justify-center gap-2">
                                    {partner.suspended_at ? (
                                        <Button variant="outline" onClick={() => setUnsuspendTarget(partner)} disabled={isPending} className="h-8 px-2 text-xs">
                                            <CheckCircleIcon className="w-3.5 h-3.5 mr-1" /> Reativar
                                        </Button>
                                    ) : (
                                        <Button variant="outline" onClick={() => setSuspendTarget(partner)} disabled={isPending} className="h-8 px-2 text-xs text-brand-orange hover:text-brand-orange">
                                            <AlertTriangleIcon className="w-3.5 h-3.5 mr-1" /> Suspender
                                        </Button>
                                    )}

                                    {partner.erp_disabled ? (
                                        <Button variant="outline" onClick={() => setEnableTarget(partner)} disabled={isPending} className="h-8 px-2 text-xs">
                                            <CheckCircleIcon className="w-3.5 h-3.5 mr-1" /> ERP
                                        </Button>
                                    ) : (
                                        <Button variant="outline" onClick={() => setDisableTarget(partner)} disabled={isPending} className="h-8 px-2 text-xs text-brand-red hover:text-brand-red">
                                            <BlockedIcon className="w-3.5 h-3.5 mr-1" /> ERP
                                        </Button>
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

            {/* Disable ERP Modal - DefaultModal with form */}
            <DefaultModal
                isOpen={!!disableTarget}
                onClose={() => { setDisableTarget(null); setDisableReason(""); setDisableDuration(30); setDisableConfirmed(false) }}
                title="Desabilitar acesso ERP"
                maxWidth="md"
                footer={
                    <>
                        <Button variant="outline" onClick={() => { setDisableTarget(null); setDisableReason(""); setDisableDuration(30); setDisableConfirmed(false) }}>
                            Cancelar
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleDisableERP}
                            disabled={!disableConfirmed || !disableReason.trim() || disableReason.trim().length < 5 || isPending}
                        >
                            {isPending ? "Desabilitando..." : "Desabilitar ERP"}
                        </Button>
                    </>
                }
            >
                <div className="flex flex-col gap-4">
                    {disableTarget && (
                        <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                            Desabilitar ERP de &quot;{disableTarget.store_name}&quot;.
                        </p>
                    )}

                    <DurationSelect value={disableDuration} onChange={setDisableDuration} />

                    <Input
                        name="disable-reason"
                        label="Motivo"
                        placeholder="Motivo (mínimo 5 caracteres)..."
                        value={disableReason}
                        onChange={e => setDisableReason(e.target.value)}
                        required
                        multiline
                        rows={3}
                    />

                    <label className="flex items-start gap-3 p-3 rounded-lg border border-red-200 dark:border-red-900/30 bg-red-50/50 dark:bg-red-900/10 cursor-pointer">
                        <input type="checkbox" checked={disableConfirmed} onChange={e => setDisableConfirmed(e.target.checked)} className="mt-1 w-4 h-4 text-red-600 rounded" />
                        <span className="text-sm text-red-800 dark:text-red-300 font-medium">
                            Confirmo que entendo as consequências desta ação
                        </span>
                    </label>
                </div>
            </DefaultModal>

            {/* Enable ERP - AlertModal */}
            <AlertModal
                isOpen={!!enableTarget}
                onClose={() => setEnableTarget(null)}
                onConfirm={handleEnableERP}
                title="Habilitar acesso ERP"
                message={`Restaurar acesso ERP de "${enableTarget?.store_name || ""}". O parceiro poderá acessar o ERP novamente.`}
                confirmText="Habilitar ERP"
                variant="warning"
            />

            {/* Suspend - AlertModal */}
            <AlertModal
                isOpen={!!suspendTarget}
                onClose={() => setSuspendTarget(null)}
                onConfirm={handleSuspend}
                title="Suspender parceiro"
                message={`Suspender "${suspendTarget?.store_name || ""}" do marketplace. Produtos ficarão ocultos.`}
                confirmText="Suspender"
                variant="danger"
            />

            {/* Unsuspend - AlertModal */}
            <AlertModal
                isOpen={!!unsuspendTarget}
                onClose={() => setUnsuspendTarget(null)}
                onConfirm={handleUnsuspend}
                title="Reativar parceiro"
                message={`Reativar "${unsuspendTarget?.store_name || ""}" no marketplace. Produtos voltarão a aparecer.`}
                confirmText="Reativar"
                variant="warning"
            />

            {/* Step-Up Auth Modal */}
            <StepUpModal
                isOpen={showStepUp}
                onClose={() => { setShowStepUp(false); setPendingStepUpAction(null) }}
                onAuthenticated={handleStepUpAuthenticated}
            />
        </div>
    )
}

export default PartnersList
