"use client"

import { useState, useTransition, useMemo, useCallback } from "react"
import { Button, Badge, IconPlaceholder, Pagination, AlertModal } from "@/components/reusable"
import PartnerListRow from "./PartnerListRow"
import PartnersPageControls from "./PartnersPageControls"
import AdminPartnerDetailView from "./AdminPartnerDetailView"
import { FadeIn } from "@/components/animations/FadeIn"
import { AnimatePresence } from "framer-motion"
import { StoreIcon, ExportFileIcon } from "@/lib/icons"
import type { EnforcementPartner, CursorPaginatedResult } from "@/lib/admin/types"
import {
    getPartners,
    suspendPartner,
    unsuspendPartner,
    suspendStore,
    unsuspendStore,
    disableTenantAccess,
    enableTenantAccess,
    getAdminPartnerStats,
    type AdminPartnerStats,
} from "@/app/actions/admin/enforcement"
import { useMediaQuery } from "@/components/erp/hooks"
import { formatDate } from "@/lib/utils"
import { toast } from "@/hooks/use-notification"
import { useEntityState } from "@/hooks/use-entity-state"

type SortKey = "store" | "owner" | "risk" | "date" | "status"
type SortDirection = "asc" | "desc"

interface PartnersListProps {
    initialData: CursorPaginatedResult<EnforcementPartner>
    initialStats?: AdminPartnerStats
}

const ITEMS_PER_PAGE = 8

export default function PartnersList({ initialData, initialStats }: PartnersListProps) {
    const isMobile = useMediaQuery("(max-width: 768px)")
    const { state: entityState, open: openEntity, close: closeEntity } = useEntityState()

    const [statusTab, setStatusTab] = useState("all")
    const [isPending, startTransition] = useTransition()

    // Modals
    const [suspendStoreTarget, setSuspendStoreTarget] = useState<EnforcementPartner | null>(null)
    const [unsuspendStoreTarget, setUnsuspendStoreTarget] = useState<EnforcementPartner | null>(null)
    const [disableERPTarget, setDisableERPTarget] = useState<EnforcementPartner | null>(null)
    const [enableERPTarget, setEnableERPTarget] = useState<EnforcementPartner | null>(null)
    const [suspendPartnerTarget, setSuspendPartnerTarget] = useState<EnforcementPartner | null>(null)
    const [unsuspendPartnerTarget, setUnsuspendPartnerTarget] = useState<EnforcementPartner | null>(null)
    const [actionReason, setActionReason] = useState("")

    // Stats
    const [stats, setStats] = useState<AdminPartnerStats | undefined>(initialStats)

    // Search state
    const [search, setSearch] = useState("")

    // Sorting state
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>({
        key: "date",
        direction: "desc",
    })

    // Data State (initialized from SSR)
    const [partners, setPartners] = useState<EnforcementPartner[]>(initialData?.data || [])
    const [page, setPage] = useState(1)

    const handleSort = (key: SortKey) => {
        setSortConfig((prev) => {
            if (prev?.key === key) {
                return { key, direction: prev.direction === "asc" ? "desc" : "asc" }
            }
            return { key, direction: "desc" }
        })
    }

    const refreshPartners = useCallback(() => {
        startTransition(async () => {
            try {
                const [res, statsRes] = await Promise.all([
                    getPartners(null, 100),
                    getAdminPartnerStats(),
                ])
                setPartners(res.data || [])
                setStats(statsRes)
            } catch (err) {
                console.error("Failed to refresh admin partners:", err)
            }
        })
    }, [])

    const handleConfirmSuspendStore = () => {
        if (!suspendStoreTarget) return
        startTransition(async () => {
            try {
                const res = await suspendStore(suspendStoreTarget.id, actionReason || "Suspensão administrativa de loja")
                if (res.success) {
                    toast.success(`Loja suspensa com sucesso! ${res.caseId ? `Protocolo: ${res.caseId}` : ""}`)
                    setSuspendStoreTarget(null)
                    setActionReason("")
                    refreshPartners()
                } else {
                    toast.error(res.error || "Erro ao suspender loja")
                }
            } catch (err: any) {
                toast.error(err.message || "Erro inesperado")
            }
        })
    }

    const handleConfirmUnsuspendStore = () => {
        if (!unsuspendStoreTarget) return
        startTransition(async () => {
            try {
                const res = await unsuspendStore(unsuspendStoreTarget.id, actionReason || "Reativação administrativa de loja")
                if (res.success) {
                    toast.success("Loja reativada com sucesso!")
                    setUnsuspendStoreTarget(null)
                    setActionReason("")
                    refreshPartners()
                } else {
                    toast.error(res.error || "Erro ao reativar loja")
                }
            } catch (err: any) {
                toast.error(err.message || "Erro inesperado")
            }
        })
    }

    const handleConfirmDisableERP = () => {
        if (!disableERPTarget) return
        startTransition(async () => {
            try {
                const res = await disableTenantAccess(disableERPTarget.id, actionReason || "Desativação de acesso ao painel ERP")
                if (res.success) {
                    toast.success(`Acesso ao ERP desativado! ${res.caseId ? `Protocolo: ${res.caseId}` : ""}`)
                    setDisableERPTarget(null)
                    setActionReason("")
                    refreshPartners()
                } else {
                    toast.error(res.error || "Erro ao desativar ERP")
                }
            } catch (err: any) {
                toast.error(err.message || "Erro inesperado")
            }
        })
    }

    const handleConfirmEnableERP = () => {
        if (!enableERPTarget) return
        startTransition(async () => {
            try {
                const res = await enableTenantAccess(enableERPTarget.id)
                if (res.success) {
                    toast.success("Acesso ao ERP restabelecido com sucesso!")
                    setEnableERPTarget(null)
                    setActionReason("")
                    refreshPartners()
                } else {
                    toast.error(res.error || "Erro ao reativar ERP")
                }
            } catch (err: any) {
                toast.error(err.message || "Erro inesperado")
            }
        })
    }

    const handleConfirmSuspendPartner = () => {
        if (!suspendPartnerTarget) return
        startTransition(async () => {
            try {
                const res = await suspendPartner(suspendPartnerTarget.id, actionReason || "Suspensão administrativa de parceiro")
                if (res.success) {
                    toast.success(`Parceiro e lojas suspensos! ${res.caseId ? `Protocolo: ${res.caseId}` : ""}`)
                    setSuspendPartnerTarget(null)
                    setActionReason("")
                    refreshPartners()
                } else {
                    toast.error(res.error || "Erro ao suspender parceiro")
                }
            } catch (err: any) {
                toast.error(err.message || "Erro inesperado")
            }
        })
    }

    const handleConfirmUnsuspendPartner = () => {
        if (!unsuspendPartnerTarget) return
        startTransition(async () => {
            try {
                const res = await unsuspendPartner(unsuspendPartnerTarget.id, actionReason || "Reativação administrativa de parceiro")
                if (res.success) {
                    toast.success("Parceiro e lojas reativados com sucesso!")
                    setUnsuspendPartnerTarget(null)
                    setActionReason("")
                    refreshPartners()
                } else {
                    toast.error(res.error || "Erro ao reativar parceiro")
                }
            } catch (err: any) {
                toast.error(err.message || "Erro inesperado")
            }
        })
    }

    // Instant in-memory filtering (0ms)
    const filteredPartners = useMemo(() => {
        const term = search.trim().toLowerCase()

        let result = partners.filter((p) => {
            // Tab filter
            const isSuspended = !!p.suspended_at || !p.is_active
            const isHighRisk = (p.risk_score || 0) >= 50
            if (statusTab === "active" && isSuspended) return false
            if (statusTab === "suspended" && !isSuspended) return false
            if (statusTab === "high_risk" && !isHighRisk) return false

            // Search filter
            if (term) {
                const name = String(p.store_name || "").toLowerCase()
                const owner = String(p.owner_name || "").toLowerCase()
                const id = String(p.id || "").toLowerCase()

                if (!name.includes(term) && !owner.includes(term) && !id.includes(term)) {
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
                    case "store":
                        aVal = (a.store_name || "").toLowerCase()
                        bVal = (b.store_name || "").toLowerCase()
                        break
                    case "owner":
                        aVal = (a.owner_name || "").toLowerCase()
                        bVal = (b.owner_name || "").toLowerCase()
                        break
                    case "risk":
                        aVal = Number(a.risk_score || 0)
                        bVal = Number(b.risk_score || 0)
                        break
                    case "date":
                        aVal = new Date(a.created_at).getTime()
                        bVal = new Date(b.created_at).getTime()
                        break
                    case "status":
                        aVal = a.suspended_at ? "suspended" : "active"
                        bVal = b.suspended_at ? "suspended" : "active"
                        break
                }
                if (aVal === bVal) return 0
                const cmp = aVal < bVal ? -1 : 1
                return sortConfig.direction === "asc" ? cmp : -cmp
            })
        }

        return result
    }, [partners, statusTab, search, sortConfig])

    // Pagination (Strict 8 items)
    const totalPages = Math.ceil(filteredPartners.length / ITEMS_PER_PAGE) || 1
    const paginatedItems = useMemo(() => {
        const start = (page - 1) * ITEMS_PER_PAGE
        return filteredPartners.slice(start, start + ITEMS_PER_PAGE)
    }, [filteredPartners, page])

    // Reset to page 1 on filter/tab/search change
    useMemo(() => {
        setPage(1)
    }, [statusTab, search])

    // If viewing detail of a specific partner via URL (?view=id)
    if (entityState.isOpen && entityState.action === "view" && entityState.entityId) {
        return (
            <AdminPartnerDetailView
                storeId={entityState.entityId}
                onBack={closeEntity}
                onPartnerUpdated={refreshPartners}
            />
        )
    }

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
                            Lojas & Parceiros
                        </h1>
                        <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                            Monitore lojas credenciadas, pontuação de risco, conformidade e auditoria.
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <Button
                            variant="outline"
                            onClick={() => toast.success("Exportação iniciada em segundo plano")}
                            leftIcon={<ExportFileIcon size={18} />}
                        >
                            Exportar
                        </Button>
                    </div>
                </div>

                {/* Page Controls */}
                <PartnersPageControls
                    statusTab={statusTab}
                    setStatusTab={setStatusTab}
                    search={search}
                    setSearch={setSearch}
                    tabCounts={stats}
                />

                {/* List Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar px-4 md:px-8 pb-24 md:pb-6 relative">
                    <AnimatePresence mode="wait">
                        {paginatedItems.length === 0 ? (
                            <FadeIn key="empty" className="w-full h-full flex items-center justify-center min-h-[400px]">
                                <IconPlaceholder
                                    placeholderType="image"
                                    imageSrc="https://img.dudit.com.br/static/mascots/SemPedidos.png"
                                    imageAlt="Nenhum parceiro"
                                    title="Nenhuma loja encontrada"
                                    subtitle={search || statusTab !== "all" ? "Tente ajustar seus filtros de busca." : "Nenhuma loja cadastrada nesta categoria."}
                                    itemButton={search || statusTab !== "all" ? {
                                        text: "Limpar Filtros",
                                        action: () => {
                                            setSearch("")
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
                                    {paginatedItems.map((partner) => {
                                        const isSuspended = !!partner.suspended_at || !partner.is_active
                                        return (
                                            <div
                                                key={partner.id}
                                                className="py-4 flex flex-col gap-2.5 cursor-pointer active:bg-brand-gray/50 dark:active:bg-dark-border/20 transition-colors"
                                                onClick={() => openEntity("view", partner.id)}
                                            >
                                                <div className="flex justify-between items-start gap-2">
                                                    <div className="flex flex-col gap-0.5 min-w-0">
                                                        <span className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate">
                                                            {partner.store_name}
                                                        </span>
                                                        <span className="text-xs text-brand-inactive-text truncate">
                                                            {partner.owner_name || "Lojista"}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                        <Badge variant={partner.risk_score >= 50 ? "red" : partner.risk_score >= 25 ? "orange" : "gray"}>
                                                            {partner.risk_score || 0} pts
                                                        </Badge>
                                                        <Badge variant={isSuspended ? "red" : "green"}>
                                                            {isSuspended ? "Suspensa" : "Ativa"}
                                                        </Badge>
                                                    </div>
                                                </div>

                                                <div className="flex items-center justify-between text-xs text-brand-inactive-text">
                                                    <span>{formatDate(partner.created_at)}</span>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>

                                {/* Desktop View: Table */}
                                <div className="hidden md:block w-full overflow-hidden rounded-xl relative">
                                    <div className="overflow-x-auto pb-4 custom-scrollbar">
                                        <table className="w-full text-left border-separate border-spacing-0 min-w-[1000px]">
                                            <thead>
                                                <tr className="bg-brand-gray dark:bg-dark-border/50 select-none">
                                                    <th
                                                        onClick={() => handleSort("store")}
                                                        className="py-3 px-2 pl-6 rounded-l-lg text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                    >
                                                        Loja {sortConfig?.key === "store" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}
                                                    </th>
                                                    <th
                                                        onClick={() => handleSort("owner")}
                                                        className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                    >
                                                        Proprietário {sortConfig?.key === "owner" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}
                                                    </th>
                                                    <th
                                                        onClick={() => handleSort("date")}
                                                        className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors text-center"
                                                    >
                                                        Cadastro {sortConfig?.key === "date" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}
                                                    </th>
                                                    <th
                                                        onClick={() => handleSort("status")}
                                                        className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors text-center"
                                                    >
                                                        Status {sortConfig?.key === "status" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}
                                                    </th>
                                                    <th className="py-3 px-2 pr-6 rounded-r-lg text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center">
                                                        Ações
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paginatedItems.map((partner) => (
                                                    <PartnerListRow
                                                        key={partner.id}
                                                        partner={partner}
                                                        isPending={isPending}
                                                        onView={() => openEntity("view", partner.id)}
                                                        onSuspendStore={() => setSuspendStoreTarget(partner)}
                                                        onUnsuspendStore={() => setUnsuspendStoreTarget(partner)}
                                                        onDisableERP={() => setDisableERPTarget(partner)}
                                                        onEnableERP={() => setEnableERPTarget(partner)}
                                                        onSuspendPartner={() => setSuspendPartnerTarget(partner)}
                                                        onUnsuspendPartner={() => setUnsuspendPartnerTarget(partner)}
                                                    />
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Pagination */}
                                {totalPages > 1 && (
                                    <div className="pt-4">
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

            {/* 1. Modal: Suspender Loja (Apenas esta filial) */}
            <AlertModal
                isOpen={!!suspendStoreTarget}
                onClose={() => {
                    setSuspendStoreTarget(null)
                    setActionReason("")
                }}
                onConfirm={handleConfirmSuspendStore}
                title="Suspender Esta Loja"
                description={`Tem certeza que deseja suspender a loja "${suspendStoreTarget?.store_name}"? A loja deixará de receber pedidos e seus produtos ficarão ocultos na vitrine. Outras filiais deste parceiro continuarão ativas.`}
                confirmText="Suspender Esta Loja"
                variant="danger"
            />

            {/* 2. Modal: Reativar Loja (Apenas esta filial) */}
            <AlertModal
                isOpen={!!unsuspendStoreTarget}
                onClose={() => {
                    setUnsuspendStoreTarget(null)
                    setActionReason("")
                }}
                onConfirm={handleConfirmUnsuspendStore}
                title="Reativar Loja"
                description={`Deseja reativar a loja "${unsuspendStoreTarget?.store_name}"? Ela voltará a operar normalmente e receber novos pedidos na vitrine.`}
                confirmText="Reativar Loja"
                variant="success"
            />

            {/* 3. Modal: Desativar Acesso ao ERP */}
            <AlertModal
                isOpen={!!disableERPTarget}
                onClose={() => {
                    setDisableERPTarget(null)
                    setActionReason("")
                }}
                onConfirm={handleConfirmDisableERP}
                title="Desativar Acesso ao ERP"
                description={`Atenção: Ao desativar o acesso ao ERP, todos os operadores e administradores da organização do parceiro "${disableERPTarget?.store_name}" perderão acesso ao painel de gestão.`}
                confirmText="Desativar ERP"
                variant="danger"
            />

            {/* 4. Modal: Reativar Acesso ao ERP */}
            <AlertModal
                isOpen={!!enableERPTarget}
                onClose={() => {
                    setEnableERPTarget(null)
                    setActionReason("")
                }}
                onConfirm={handleConfirmEnableERP}
                title="Reativar Acesso ao ERP"
                description={`Deseja restabelecer o acesso ao ERP para todos os operadores e administradores do parceiro "${enableERPTarget?.store_name}"?`}
                confirmText="Reativar ERP"
                variant="success"
            />

            {/* 5. Modal: Suspender Parceiro Completo */}
            <AlertModal
                isOpen={!!suspendPartnerTarget}
                onClose={() => {
                    setSuspendPartnerTarget(null)
                    setActionReason("")
                }}
                onConfirm={handleConfirmSuspendPartner}
                title="Suspender Parceiro Completo"
                description={`ATENÇÃO: Esta ação suspenderá a organização "${suspendPartnerTarget?.store_name}" por completo, bloqueando o acesso ao ERP e desativando TODAS as suas lojas e filiais cadastradas.`}
                confirmText="Suspender Parceiro Inteiro"
                variant="danger"
            />

            {/* 6. Modal: Reativar Parceiro Completo */}
            <AlertModal
                isOpen={!!unsuspendPartnerTarget}
                onClose={() => {
                    setUnsuspendPartnerTarget(null)
                    setActionReason("")
                }}
                onConfirm={handleConfirmUnsuspendPartner}
                title="Reativar Parceiro Completo"
                description={`Deseja reativar a organização do parceiro "${unsuspendPartnerTarget?.store_name}" e restabelecer o funcionamento de todas as suas lojas?`}
                confirmText="Reativar Parceiro Completo"
                variant="success"
            />
        </FadeIn>
    )
}
