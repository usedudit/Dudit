"use client"

import { useState, useTransition, useMemo, useEffect, useCallback } from "react"
import { Button, Badge, IconPlaceholder, ThreeDotsLoader, Pagination } from "@/components/reusable"
import PartnerListRow from "./PartnerListRow"
import PartnersPageControls from "./PartnersPageControls"
import AdminPartnerDetailView from "./AdminPartnerDetailView"
import DestructiveActionModal from "@/components/admin/DestructiveActionModal"
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

interface PartnersListProps {
    initialData: CursorPaginatedResult<EnforcementPartner>
    initialStats?: AdminPartnerStats
}

const PartnersList = ({ initialData, initialStats }: PartnersListProps) => {
    const isMobile = useMediaQuery("(max-width: 768px)")
    const [statusTab, setStatusTab] = useState("all")
    const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()

    // Modals
    const [suspendStoreTarget, setSuspendStoreTarget] = useState<EnforcementPartner | null>(null)
    const [unsuspendStoreTarget, setUnsuspendStoreTarget] = useState<EnforcementPartner | null>(null)
    const [disableERPTarget, setDisableERPTarget] = useState<EnforcementPartner | null>(null)

    // Stats
    const [stats, setStats] = useState<AdminPartnerStats | undefined>(initialStats)

    // Search state
    const [search, setSearch] = useState("")
    const [debouncedSearch, setDebouncedSearch] = useState("")
    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(search), 300)
        return () => clearTimeout(t)
    }, [search])

    // Data State
    const [partners, setPartners] = useState<EnforcementPartner[]>(initialData.data || [])
    const [isLoading, setIsLoading] = useState(false)
    const [page, setPage] = useState(1)
    const itemsPerPage = 12

    const fetchPartners = useCallback(() => {
        setIsLoading(true)
        startTransition(async () => {
            try {
                const [res, statsRes] = await Promise.all([
                    getPartners(null, 100, debouncedSearch, statusTab === "all" ? undefined : statusTab),
                    getAdminPartnerStats(),
                ])
                setPartners(res.data || [])
                setStats(statsRes)
            } catch (err) {
                console.error("Failed to fetch admin partners:", err)
                toast.error("Erro ao carregar parceiros")
            } finally {
                setIsLoading(false)
            }
        })
    }, [statusTab, debouncedSearch])

    useEffect(() => {
        fetchPartners()
        setPage(1)
    }, [fetchPartners])

    const handleConfirmSuspendStore = (reason: string) => {
        if (!suspendStoreTarget) return
        startTransition(async () => {
            try {
                const res = await suspendStore(suspendStoreTarget.id, reason)
                if (res.success) {
                    toast.success("Loja suspensa com sucesso!")
                    setSuspendStoreTarget(null)
                    fetchPartners()
                } else {
                    toast.error(res.error || "Erro ao suspender loja")
                }
            } catch (err: any) {
                toast.error(err.message || "Erro inesperado")
            }
        })
    }

    const handleConfirmUnsuspendStore = (reason: string) => {
        if (!unsuspendStoreTarget) return
        startTransition(async () => {
            try {
                const res = await unsuspendStore(unsuspendStoreTarget.id, reason)
                if (res.success) {
                    toast.success("Loja reativada com sucesso!")
                    setUnsuspendStoreTarget(null)
                    fetchPartners()
                } else {
                    toast.error(res.error || "Erro ao reativar loja")
                }
            } catch (err: any) {
                toast.error(err.message || "Erro inesperado")
            }
        })
    }

    const handleConfirmDisableERP = (reason: string) => {
        if (!disableERPTarget) return
        startTransition(async () => {
            try {
                const res = await disableTenantAccess(disableERPTarget.id, reason)
                if (res.success) {
                    toast.success("Acesso ao ERP desabilitado!")
                    setDisableERPTarget(null)
                    fetchPartners()
                } else {
                    toast.error(res.error || "Erro ao desabilitar ERP")
                }
            } catch (err: any) {
                toast.error(err.message || "Erro inesperado")
            }
        })
    }

    // Pagination
    const totalPages = Math.ceil(partners.length / itemsPerPage)
    const paginatedItems = useMemo(() => {
        const start = (page - 1) * itemsPerPage
        return partners.slice(start, start + itemsPerPage)
    }, [partners, page])

    // If viewing detail of a specific partner / store
    if (selectedStoreId) {
        return (
            <AdminPartnerDetailView
                storeId={selectedStoreId}
                onBack={() => setSelectedStoreId(null)}
                onPartnerUpdated={fetchPartners}
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
                            Parceiros e Lojas
                        </h1>
                        <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                            Monitore a atividade, risk score e acesso ao ERP dos vendedores do marketplace.
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
                    search={search}
                    setSearch={setSearch}
                    statusTab={statusTab}
                    setStatusTab={setStatusTab}
                    tabCounts={stats}
                />

                {/* List Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar px-4 md:px-8 pb-24 md:pb-6 relative">
                    <AnimatePresence mode="wait">
                        {paginatedItems.length === 0 && !isLoading ? (
                            <FadeIn key="empty" className="w-full h-full flex items-center justify-center min-h-[400px]">
                                <IconPlaceholder
                                    placeholderType="image"
                                    imageSrc="https://img.dudit.com.br/static/mascots/SemLojas.png"
                                    imageAlt="Nenhuma loja"
                                    title="Nenhuma loja encontrada"
                                    subtitle={search ? "Tente ajustar sua busca." : "Nenhuma loja cadastrada nesta categoria."}
                                    itemButton={search ? {
                                        text: "Limpar Busca",
                                        action: () => setSearch(""),
                                        variant: "outline"
                                    } : undefined}
                                />
                            </FadeIn>
                        ) : isLoading ? (
                            <FadeIn key="loading" className="flex items-center justify-center min-h-[400px]">
                                <ThreeDotsLoader />
                            </FadeIn>
                        ) : (
                            <FadeIn key="list" className="w-full space-y-4">
                                {/* Mobile View (Cards) */}
                                <div className="md:hidden flex flex-col w-full divide-y divide-brand-border dark:divide-dark-border">
                                    {paginatedItems.map((partner) => (
                                        <div
                                            key={partner.id + partner.type}
                                            className="py-4 flex flex-col gap-2.5 cursor-pointer active:bg-brand-gray/50 dark:active:bg-dark-border/20 transition-colors"
                                            onClick={() => setSelectedStoreId(partner.id)}
                                        >
                                            <div className="flex justify-between items-start gap-2">
                                                <div className="flex flex-col gap-0.5 min-w-0">
                                                    <span className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate">
                                                        {partner.store_name || partner.stores?.[0]?.name || "Loja"}
                                                    </span>
                                                    <span className="text-xs text-brand-inactive-text truncate">
                                                        {partner.owner_name || partner.id}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    {partner.risk_score > 0 && (
                                                        <Badge variant={partner.risk_score >= 50 ? "red" : "orange"}>
                                                            {partner.risk_score} pts
                                                        </Badge>
                                                    )}
                                                    <Badge variant={partner.suspended_at ? "red" : partner.is_active ? "green" : "gray"}>
                                                        {partner.suspended_at ? "Suspensa" : partner.is_active ? "Ativa" : "Inativa"}
                                                    </Badge>
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-between text-xs text-brand-inactive-text">
                                                <span>Cadastrada em {formatDate(partner.created_at)}</span>
                                                <span className="capitalize">{partner.type === "store" ? "Loja" : "Parceiro"}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Desktop View: Table */}
                                <div className="hidden md:block w-full overflow-hidden rounded-xl relative">
                                    <div className="overflow-x-auto pb-4 custom-scrollbar">
                                        <table className="w-full text-left border-separate border-spacing-0 min-w-[1000px]">
                                            <thead>
                                                <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                    <th className="py-3 px-2 pl-6 rounded-l-lg bg-brand-gray dark:bg-dark-border/50 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight">Loja / Parceiro</th>
                                                    <th className="py-3 px-2 w-24 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 tracking-tight text-center">Tipo</th>
                                                    <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 tracking-tight">Proprietário</th>
                                                    <th className="py-3 px-2 w-32 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 tracking-tight text-center">Cadastro</th>
                                                    <th className="py-3 px-2 w-24 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 tracking-tight text-center">Risco</th>
                                                    <th className="py-3 px-2 w-28 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 tracking-tight text-center">Status</th>
                                                    <th className="py-3 px-2 w-24 pr-6 rounded-r-lg bg-brand-gray dark:bg-dark-border/50 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center">Ações</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paginatedItems.map((partner) => (
                                                    <PartnerListRow
                                                        key={partner.id + partner.type}
                                                        partner={partner}
                                                        isPending={isPending}
                                                        onSuspend={setSuspendStoreTarget}
                                                        onUnsuspend={setUnsuspendStoreTarget}
                                                        onEnableERP={() => {}}
                                                        onDisableERP={setDisableERPTarget}
                                                        onSuspendStore={setSuspendStoreTarget}
                                                        onUnsuspendStore={setUnsuspendStoreTarget}
                                                        onSuspendPartnerFromStore={setSuspendStoreTarget}
                                                        onView={(p) => setSelectedStoreId(p.id)}
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

            {/* Modals de Ação */}
            <DestructiveActionModal
                isOpen={!!suspendStoreTarget}
                onClose={() => setSuspendStoreTarget(null)}
                onConfirm={handleConfirmSuspendStore}
                title="Suspender Loja"
                description="A loja perderá visibilidade no marketplace e os produtos ficarão pausados."
                entityName={suspendStoreTarget?.store_name || suspendStoreTarget?.id || ""}
                consequences={[
                    "Ocultação imediata dos produtos do catálogo",
                    "Bloqueio de novas compras para esta loja",
                    "Registro no Audit Log",
                ]}
                confirmText="Confirmar Suspensão"
                isPending={isPending}
            />

            <DestructiveActionModal
                isOpen={!!unsuspendStoreTarget}
                onClose={() => setUnsuspendStoreTarget(null)}
                onConfirm={handleConfirmUnsuspendStore}
                title="Reativar Loja"
                description="A loja voltará a ter visibilidade e receber pedidos no marketplace."
                entityName={unsuspendStoreTarget?.store_name || unsuspendStoreTarget?.id || ""}
                consequences={[
                    "Reativação do catálogo de produtos",
                    "Desbloqueio de vendas",
                ]}
                confirmText="Confirmar Reativação"
                isPending={isPending}
            />

            <DestructiveActionModal
                isOpen={!!disableERPTarget}
                onClose={() => setDisableERPTarget(null)}
                onConfirm={handleConfirmDisableERP}
                title="Desabilitar Acesso ERP"
                description="O parceiro não conseguirá mais acessar o painel ERP do Dudit."
                entityName={disableERPTarget?.store_name || disableERPTarget?.id || ""}
                consequences={[
                    "Bloqueio imediato do login no ERP",
                    "Registro obrigatório no Audit Log",
                ]}
                confirmText="Desabilitar ERP"
                isPending={isPending}
            />
        </FadeIn>
    )
}
export default PartnersList

