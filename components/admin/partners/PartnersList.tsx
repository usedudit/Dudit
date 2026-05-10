"use client"

import React, { useState, useTransition, useCallback, useEffect } from "react"
import { Button, Badge, Input, Pagination, IconPlaceholder } from "@/components/reusable"
import AlertModal from "@/components/reusable/AlertModal"
import DefaultModal from "@/components/reusable/DefaultModal"
import StepUpModal from "@/components/admin/StepUpModal"
import PartnerListRow from "./PartnerListRow"
import PartnersPageControls from "./PartnersPageControls"
import { FadeIn } from "@/components/animations/FadeIn"
import { AnimatePresence } from "framer-motion"
import { SearchIcon, StoreIcon, CheckCircleIcon, BlockedIcon, ClockIcon, AlertTriangleIcon } from "@/lib/icons"
import type { EnforcementPartner, CursorPaginatedResult } from "@/lib/admin/types"
import {
    getPartners,
    suspendPartner,
    unsuspendPartner,
    disableTenantAccess,
    enableTenantAccess,
} from "@/app/actions/admin/enforcement"


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
    const [statusTab, setStatusTab] = useState("all")
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

    // Filter by status
    const filteredByStatus = allPartners.filter(partner => {
        if (statusTab === "active") return partner.is_active && !partner.suspended_at && !partner.erp_disabled
        if (statusTab === "suspended") return !!partner.suspended_at
        if (statusTab === "erp_disabled") return !!partner.erp_disabled
        return true
    })

    // Reset page when filter changes
    useEffect(() => {
        setPage(1)
    }, [statusTab])

    // Client-side pagination
    const totalPages = Math.ceil(filteredByStatus.length / itemsPerPage)
    const paginated = filteredByStatus.slice((page - 1) * itemsPerPage, page * itemsPerPage)

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
        <FadeIn className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300">
            <div className="mx-auto w-full pt-4 flex flex-col h-full overflow-hidden relative">

                {/* Header Title/Subtitle (ERP Standard) */}
                <div className="hidden md:flex items-start justify-between mb-6 flex-none px-4 md:px-8">
                    <div className="flex flex-col gap-2 pt-1">
                        <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                            Parceiros e Lojas
                        </h1>
                        <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                            Gerencie o acesso ao ERP e o status de suspensão das lojas do marketplace.
                        </p>
                    </div>
                </div>

                {/* Page Controls (Standardized) */}
                <PartnersPageControls
                    search={search}
                    setSearch={setSearch}
                    statusTab={statusTab}
                    setStatusTab={setStatusTab}
                />

                {/* Partners List */}
                <div className="flex-1 overflow-y-auto custom-scrollbar px-4 md:px-8 pb-20 md:pb-6">
                    <AnimatePresence mode="wait">
                        {paginated.length === 0 ? (
                            <FadeIn key="empty" className="w-full">
                                <IconPlaceholder
                                    placeholderType="image"
                                    imageSrc="https://img.dudit.com.br/static/mascots/NaoEncontrado.png"
                                    imageAlt="Nenhum parceiro"
                                    title="Nenhum parceiro encontrado"
                                    subtitle={search ? "Tente ajustar sua busca." : "Nenhum parceiro cadastrado no sistema."}
                                    itemButton={search ? {
                                        text: "Limpar Busca",
                                        action: () => setSearch(""),
                                        variant: "outline"
                                    } : undefined}
                                />
                            </FadeIn>
                        ) : (
                            <div className="w-full">
                                {/* Table header (Desktop Only) */}
                                <div className="hidden md:grid grid-cols-[1fr_130px_100px_160px_140px] gap-4 py-3 px-6 bg-brand-gray/50 dark:bg-dark-border/30 rounded-lg mb-2">
                                    <span className="text-[12px] font-bold text-brand-inactive-text uppercase tracking-wider">Parceiro</span>
                                    <span className="text-[12px] font-bold text-brand-inactive-text uppercase tracking-wider text-center">Status</span>
                                    <span className="text-[12px] font-bold text-brand-inactive-text uppercase tracking-wider text-center">Risco</span>
                                    <span className="text-[12px] font-bold text-brand-inactive-text uppercase tracking-wider text-center">Data</span>
                                    <span className="text-[12px] font-bold text-brand-inactive-text uppercase tracking-wider text-center">Ações</span>
                                </div>

                                {/* List Rows */}
                                <div className="flex flex-col">
                                    {paginated.map((partner) => (
                                        <PartnerListRow
                                            key={partner.id}
                                            partner={partner}
                                            isPending={isPending}
                                            onUnsuspend={setUnsuspendTarget}
                                            onSuspend={setSuspendTarget}
                                            onEnableERP={setEnableTarget}
                                            onDisableERP={setDisableTarget}
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
                            </div>
                        )}
                    </AnimatePresence>
                </div>
            </div>


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
        </FadeIn>
    )
}

export default PartnersList
