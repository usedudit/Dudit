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
import { 
    SearchIcon, 
    StoreIcon, 
    CheckCircleIcon, 
    BlockedIcon, 
    ClockIcon, 
    AlertTriangleIcon,
    UserIcon,
    ShieldIcon,
    InfoIcon,
    AlertCircleIcon,
    MailIcon
} from "@/lib/icons"
import type { EnforcementPartner, CursorPaginatedResult } from "@/lib/admin/types"
import {
    getPartners,
    suspendPartner,
    unsuspendPartner,
    disableTenantAccess,
    enableTenantAccess,
} from "@/app/actions/admin/enforcement"
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
    SheetFooter,
} from "@/components/ui/sheet"
import BottomSheet from "@/components/BottomSheet"
import { useMediaQuery } from "@/components/erp/hooks"
import { toast } from "sonner"


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
    const [detailPartner, setDetailPartner] = useState<EnforcementPartner | null>(null)
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
                toast.success("Acesso ERP reabilitado com sucesso!")
                setEnableTarget(null)
                fetchAllPartners(debouncedSearch || undefined)
            } else {
                toast.error(result.error || "Erro ao habilitar ERP")
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
                    toast.success("Acesso ERP desabilitado com sucesso!")
                    setDisableTarget(null)
                    setDisableReason("")
                    setDisableDuration(30)
                    setDisableConfirmed(false)
                    fetchAllPartners(debouncedSearch || undefined)
                } else {
                    toast.error(result.error || "Erro ao desabilitar ERP")
                }
            })
        } else if (pendingStepUpAction === "suspend" && suspendTarget) {
            startTransition(async () => {
                const result = await suspendPartner(suspendTarget.id, "Suspenso pelo admin", token)
                if (result.success) {
                    toast.success("Parceiro suspenso com sucesso!")
                    setSuspendTarget(null)
                    fetchAllPartners(debouncedSearch || undefined)
                } else {
                    toast.error(result.error || "Erro ao suspender parceiro")
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
                toast.success("Parceiro reativado com sucesso!")
                setUnsuspendTarget(null)
                fetchAllPartners(debouncedSearch || undefined)
            } else {
                toast.error(result.error || "Erro ao reativar parceiro")
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

                {/* List Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar px-4 md:px-8 pb-20 md:pb-6 relative">
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
                            <FadeIn key="list" className="w-full">
                                {/* Mobile/Tablet View */}
                                <div className="md:hidden flex flex-col w-full divide-y divide-brand-border dark:divide-dark-border">
                                    {paginated.map((partner) => (
                                            <div 
                                                className="py-5 flex flex-col gap-3 cursor-pointer"
                                                onClick={() => setDetailPartner(partner)}
                                            >
                                                <div className="flex justify-between items-start gap-2">
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center shrink-0 border border-blue-100 dark:border-blue-900/30">
                                                            <StoreIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                                        </div>
                                                        <div className="min-w-0 flex flex-col">
                                                            <span className="font-bold text-[15px] text-brand-dark dark:text-dark-heading leading-tight truncate">
                                                                {partner.store_name}
                                                            </span>
                                                            <span className="text-xs font-medium text-brand-inactive-text">
                                                                Dono: {partner.owner_name}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    {partner.risk_score > 0 && (
                                                        <Badge variant={partner.risk_score >= 50 ? "red" : partner.risk_score >= 20 ? "orange" : "blue"}>
                                                            Risk: {partner.risk_score}
                                                        </Badge>
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    {partner.erp_disabled ? (
                                                        <Badge variant="red">ERP Desabilitado</Badge>
                                                    ) : partner.suspended_at ? (
                                                        <Badge variant="orange">Suspenso</Badge>
                                                    ) : !partner.is_active ? (
                                                        <Badge variant="gray">Inativo</Badge>
                                                    ) : (
                                                        <Badge variant="green">Ativo</Badge>
                                                    )}
                                                    <span className="text-xs text-brand-inactive-text ml-auto">
                                                        {new Date(partner.created_at).toLocaleDateString("pt-BR")}
                                                    </span>
                                                </div>

                                                <div className="flex items-center gap-2 mt-1">
                                                    <div className="flex gap-2 flex-1 action-btn" onClick={e => e.stopPropagation()}>
                                                        {partner.suspended_at ? (
                                                            <Button variant="outline" size="sm" onClick={() => setUnsuspendTarget(partner)} className="flex-1 text-xs h-9">Reativar</Button>
                                                        ) : (
                                                            <Button variant="outline" size="sm" onClick={() => setSuspendTarget(partner)} className="flex-1 text-xs h-9">Suspender</Button>
                                                        )}
                                                        {partner.erp_disabled ? (
                                                            <Button variant="outline" size="sm" onClick={() => setEnableTarget(partner)} className="flex-1 text-xs h-9">Habilitar ERP</Button>
                                                        ) : (
                                                            <Button variant="outline" size="sm" onClick={() => setDisableTarget(partner)} className="flex-1 text-xs h-9">Desativar ERP</Button>
                                                        )}
                                                    </div>
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
                                                    <th className="py-3 px-2 pl-6 rounded-l-lg bg-brand-gray dark:bg-dark-border/50 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-wider">Parceiro</th>
                                                    <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 tracking-wider">Dono</th>
                                                    <th className="py-3 px-2 w-40 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 tracking-wider text-center">Data</th>
                                                    <th className="py-3 px-2 w-32 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 tracking-wider text-center">Risco</th>
                                                    <th className="py-3 px-2 w-32 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 tracking-wider text-center">Status</th>
                                                    <th className="py-3 px-2 w-24 pr-6 rounded-r-lg bg-brand-gray dark:bg-dark-border/50 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-wider text-center">Ações</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paginated.map((partner) => (
                                                    <PartnerListRow
                                                        key={partner.id}
                                                        partner={partner}
                                                        isPending={isPending}
                                                        onUnsuspend={setUnsuspendTarget}
                                                        onSuspend={setSuspendTarget}
                                                        onEnableERP={setEnableTarget}
                                                        onDisableERP={setDisableTarget}
                                                        onView={setDetailPartner}
                                                    />
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Pagination (ERP Standard) */}
                                {totalPages > 1 && (
                                    <div className="mt-6">
                                        <Pagination
                                            currentPage={page}
                                            totalPages={totalPages}
                                            onPageChange={setPage}
                                        />
                                    </div>
                                )}
                            </FadeIn>
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

            {/* Detail Sheet */}
            <PartnerDetailsSheet
                partner={detailPartner}
                isOpen={!!detailPartner}
                onClose={() => setDetailPartner(null)}
                onSuspend={setSuspendTarget}
                onUnsuspend={setUnsuspendTarget}
                onEnableERP={setEnableTarget}
                onDisableERP={setDisableTarget}
            />
        </FadeIn>
    )
}

export default PartnersList

// ─── Detail Sheet Sub-component ──────────────────────────────────────────────

interface PartnerDetailsSheetProps {
    partner: EnforcementPartner | null
    isOpen: boolean
    onClose: () => void
    onSuspend: (p: EnforcementPartner) => void
    onUnsuspend: (p: EnforcementPartner) => void
    onEnableERP: (p: EnforcementPartner) => void
    onDisableERP: (p: EnforcementPartner) => void
}

function PartnerDetailsSheet({ 
    partner, isOpen, onClose, onSuspend, onUnsuspend, onEnableERP, onDisableERP 
}: PartnerDetailsSheetProps) {
    const isMobile = useMediaQuery("(max-width: 768px)")

    if (!partner) return null

    const content = (
        <div className="flex flex-col h-full bg-white dark:bg-dark-surface overflow-hidden">
            <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar pb-32 md:pb-6">
                {/* Header Store */}
                <div className="flex flex-col items-center text-center space-y-4">
                    <div className="w-20 h-20 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center border-2 border-blue-100 dark:border-blue-900/30">
                        <StoreIcon size={40} className="text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                        <h3 className="text-2xl font-bold text-brand-dark dark:text-dark-heading leading-tight">
                            {partner.store_name}
                        </h3>
                        <p className="text-sm font-medium text-brand-inactive-text opacity-70">ID: {partner.id}</p>
                    </div>
                    
                    <div className="flex gap-2">
                        {partner.erp_disabled ? (
                            <Badge variant="red" className="px-3 py-1">ERP BLOQUEADO</Badge>
                        ) : (
                            <Badge variant="green" className="px-3 py-1">ERP ATIVO</Badge>
                        )}
                        {partner.suspended_at ? (
                            <Badge variant="orange" className="px-3 py-1">SUSPENSO</Badge>
                        ) : (
                            <Badge variant="green" className="px-3 py-1">MARKETPLACE OK</Badge>
                        )}
                    </div>
                </div>

                {/* Risk Score Card */}
                <div className="p-5 bg-brand-gray dark:bg-dark-border/30 rounded-2xl border border-brand-border dark:border-dark-border flex items-center justify-between">
                    <div className="space-y-1">
                        <span className="text-[11px] font-bold text-brand-inactive-text uppercase tracking-widest block">Índice de Risco</span>
                        <p className="text-xs text-brand-inactive-text leading-tight max-w-[180px]">Calculado com base em denúncias e estornos recentes.</p>
                    </div>
                    <div className={`text-3xl font-black ${partner.risk_score >= 50 ? "text-brand-red" : partner.risk_score >= 20 ? "text-brand-orange" : "text-brand-green"}`}>
                        {partner.risk_score}
                    </div>
                </div>

                {/* Info Sections */}
                <div className="space-y-6">
                    {/* Owner Info */}
                    <div className="space-y-3">
                        <h4 className="text-[11px] font-bold text-brand-inactive-text uppercase tracking-widest">Informações do Proprietário</h4>
                        <div className="p-4 bg-brand-gray dark:bg-dark-border/30 rounded-2xl border border-brand-border dark:border-dark-border space-y-4">
                            <div className="flex items-center gap-3">
                                <UserIcon size={18} className="text-brand-inactive-text" />
                                <div className="flex flex-col">
                                    <span className="text-[11px] text-brand-inactive-text font-medium">Responsável</span>
                                    <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{partner.owner_name}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 pt-4 border-t border-brand-border/50 dark:border-dark-border/50">
                                <InfoIcon size={18} className="text-brand-inactive-text" />
                                <div className="flex flex-col">
                                    <span className="text-[11px] text-brand-inactive-text font-medium">User ID</span>
                                    <span className="text-[11px] font-mono font-bold text-brand-dark dark:text-dark-heading break-all">{partner.owner_user_id}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Metadata */}
                    <div className="space-y-3">
                        <h4 className="text-[11px] font-bold text-brand-inactive-text uppercase tracking-widest">Metadata do Sistema</h4>
                        <div className="p-4 bg-brand-gray dark:bg-dark-border/30 rounded-2xl border border-brand-border dark:border-dark-border space-y-4">
                            <div className="flex items-center gap-3">
                                <ClockIcon size={18} className="text-brand-inactive-text" />
                                <div className="flex flex-col">
                                    <span className="text-[11px] text-brand-inactive-text font-medium">Integrado em</span>
                                    <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{new Date(partner.created_at).toLocaleDateString("pt-BR")}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 pt-4 border-t border-brand-border/50 dark:border-dark-border/50">
                                <ShieldIcon size={18} className="text-brand-inactive-text" />
                                <div className="flex flex-col">
                                    <span className="text-[11px] text-brand-inactive-text font-medium">Status de Ativação</span>
                                    <Badge variant={partner.is_active ? "green" : "red"}>
                                        {partner.is_active ? "Parceiro Ativo" : "Parceiro Inativo"}
                                    </Badge>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Sticky Actions */}
            <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border flex flex-col gap-3">
                <div className="flex gap-3">
                    {partner.suspended_at ? (
                        <Button variant="outline" className="flex-1 rounded-full h-12 font-bold border-brand-green text-brand-green" onClick={() => onUnsuspend(partner)}>
                            <CheckCircleIcon size={18} className="mr-2" /> Reativar
                        </Button>
                    ) : (
                        <Button variant="outline" className="flex-1 rounded-full h-12 font-bold border-brand-orange text-brand-orange" onClick={() => onSuspend(partner)}>
                            <AlertTriangleIcon size={18} className="mr-2" /> Suspender
                        </Button>
                    )}
                    
                    {partner.erp_disabled ? (
                        <Button variant="outline" className="flex-1 rounded-full h-12 font-bold border-brand-blue text-brand-blue" onClick={() => onEnableERP(partner)}>
                            <CheckCircleIcon size={18} className="mr-2" /> Habilitar ERP
                        </Button>
                    ) : (
                        <Button variant="outline" className="flex-1 rounded-full h-12 font-bold border-brand-red text-brand-red" onClick={() => onDisableERP(partner)}>
                            <BlockedIcon size={18} className="mr-2" /> Bloquear ERP
                        </Button>
                    )}
                </div>
                <Button variant="outline" className="w-full rounded-full h-11 text-brand-inactive-text" onClick={onClose}>
                    Fechar Detalhes
                </Button>
            </div>
        </div>
    )

    if (isMobile) {
        return (
            <BottomSheet isOpen={isOpen} onClose={onClose}>
                {content}
            </BottomSheet>
        )
    }

    return (
        <Sheet open={isOpen} onOpenChange={(v) => !v && onClose()}>
            <SheetContent className="p-0 sm:max-w-md border-0" side="right">
                {content}
            </SheetContent>
        </Sheet>
    )
}
