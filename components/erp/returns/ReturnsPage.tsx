"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { AnimatePresence } from "framer-motion"
import { Badge, Button, IconPlaceholder, Pagination, Tabs, TabsList, TabsTrigger, ThreeDotsLoader } from "@/components/reusable"
import { FadeIn } from "@/components/animations/FadeIn"
import { usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal"
import { PlusIcon, ExportFileIcon, ReturnIcon } from "@/lib/icons"
import { useMediaQuery } from "@/components/erp/hooks"
import { useEntityState } from "@/hooks/use-entity-state"
import { useToast } from "@/hooks/use-toast"
import ReturnListRow, { getReturnStatusMeta } from "./ReturnListRow"
import ReturnGridCard from "./ReturnGridCard"
import CreateReturnPage from "./CreateReturnPage"
import ReturnPageControls from "./ReturnPageControls"
import type { ReturnRequest } from "./types"
import { formatDate } from "@/lib/utils"
import { createReturnRequestAction, getReturnRequestsPageAction, processReturnRequestAction } from "@/app/actions/erp/returns"
import { getReturnResolutionLabel } from "@/lib/returns/types"

type ActiveTab = "Todos" | "Pendentes" | "Analise" | "AguardandoCliente" | "Aprovados" | "Finalizados"
type SortKey = "id" | "order_number" | "customer" | "date" | "refund_type" | "quantity"
type SortDirection = "asc" | "desc"

interface ReturnsPageProps {
    partnerId: string
    roleId: string
    planGate?: { requiredPlanSlug: "crescer" | "escalar" }
}

const ITEMS_PER_PAGE = 8

const COLUMNS = [
    { id: "id", label: "Código", align: "left" as const, width: "160px" },
    { id: "order_number", label: "Pedido", align: "left" as const, width: "180px" },
    { id: "customer", label: "Cliente", align: "left" as const, width: "240px" },
    { id: "date", label: "Data", align: "left" as const, width: "160px" },
    { id: "refund_type", label: "Resolução", align: "left" as const, width: "180px" },
    { id: "quantity", label: "Qtd", align: "left" as const, width: "100px" },
    { id: "actions", label: "Ações", align: "center" as const, width: "80px" },
]

function mapLegacyCondition(condition: unknown) {
    const raw = String(condition || "").toLowerCase()
    if (raw === "lacrado") return "sealed"
    if (raw === "danificado") return "damaged"
    if (raw === "sealed" || raw === "opened" || raw === "damaged") return raw
    return "opened"
}

function mapLegacyResolution(resolution: unknown) {
    const raw = String(resolution || "").toLowerCase()
    if (raw === "troca") return "exchange"
    if (raw === "vale_compra") return "store_credit"
    if (raw === "sem_resolucao") return "none"
    if (raw === "recusada") return "rejected"
    if (raw === "store_credit" || raw === "exchange" || raw === "refund" || raw === "none" || raw === "rejected") return raw
    return "refund"
}

function mapLegacyReason(reason: unknown) {
    const raw = String(reason || "").toLowerCase()
    if (raw === "defeito" || raw === "item com defeito") return "defective"
    if (raw === "arrependimento" || raw === "mudou de ideia") return "changed_mind"
    if (raw === "tamanho_incorreto") return "other"
    if (raw === "item errado" || raw === "recebi item errado") return "wrong_item"
    if (raw === "item danificado") return "damaged"
    if (raw === "diferente da descricao" || raw === "diferente da descrição") return "different_from_description"
    if (raw === "faltam partes") return "missing_parts"
    if (raw === "chegou atrasado") return "arrived_late"
    if ([
        "wrong_item",
        "defective",
        "damaged",
        "different_from_description",
        "missing_parts",
        "arrived_late",
        "changed_mind",
        "other",
    ].includes(raw)) return raw
    return "other"
}

export default function ReturnsPage({ partnerId, roleId, planGate }: ReturnsPageProps) {
    const { toast } = useToast()
    const { openPlanUpgrade } = usePlanUpgrade()
    const isMobile = useMediaQuery("(max-width: 767px)")
    const isTablet = useMediaQuery("(max-width: 1024px)")
    const { state: entityState, open: openEntity, close: closeEntity } = useEntityState()
    const canManage = roleId === "owner" || roleId === "admin" || roleId === "manager"

    const [returns, setReturns] = useState<ReturnRequest[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [search, setSearch] = useState("")
    const [debouncedSearch, setDebouncedSearch] = useState("")
    const [activeTab, setActiveTab] = useState<ActiveTab>("Todos")
    const [viewMode, setViewModeState] = useState<"list" | "grid">(isMobile ? "grid" : "list")
    const effectiveViewMode = isTablet ? "grid" : viewMode
    const [page, setPage] = useState(1)
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>({
        key: "date",
        direction: "desc",
    })

    const loadReturns = useCallback(async () => {
        setIsLoading(true)
        const res = await getReturnRequestsPageAction(partnerId, { limit: 100 })
        if (res.success) {
            setReturns(res.items as ReturnRequest[])
        } else {
            toast({ title: "Erro", description: res.error, variant: "destructive" })
        }
        setIsLoading(false)
    }, [partnerId, toast])

    useEffect(() => {
        void loadReturns()
    }, [loadReturns])

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search), 300)
        return () => clearTimeout(timer)
    }, [search])

    useEffect(() => {
        setPage(1)
    }, [debouncedSearch, activeTab])

    const activeReturnRequest = useMemo(() => {
        if (!entityState.entityId) return null
        return returns.find((r) => r.id === entityState.entityId) || null
    }, [returns, entityState.entityId])

    const handleSaveReturn = async (data: Partial<ReturnRequest> & Record<string, any>) => {
        setIsSaving(true)
        try {
            if (entityState.action === "create") {
                if (!data.orderId) throw new Error("Selecione um pedido")
                const selectedItems = data.items || []
                const response = await createReturnRequestAction({
                    partnerId,
                    orderId: data.orderId,
                    resolution: mapLegacyResolution(data.resolutionType || data.desiredResolution || data.refundType),
                    reason: mapLegacyReason(selectedItems[0]?.reason || data.reason),
                    message: data.observations || "",
                    items: selectedItems.map((item: any) => ({
                        order_item_id: item.orderItemId || item.id,
                        quantity: Number(item.quantity || 1),
                        reason: mapLegacyReason(item.reason),
                        condition: mapLegacyCondition(item.condition),
                        sku: item.sku || null,
                    })),
                    evidence: data.evidence || [],
                    idempotencyKey: `erp:${partnerId}:${data.orderId}:${Date.now()}`,
                    status: data.status,
                    refundValue: Number(data.refundValue || 0),
                    storeCreditValue: Number(data.storeCreditValue || 0),
                    exchangeItems: data.exchangeItems || [],
                    exchangeBalanceResolution: data.exchangeBalanceResolution || null,
                    returnToInventory: Boolean(data.returnToInventory),
                })
                if (!response.success) throw new Error(response.error)
                toast({ title: "Sucesso", description: "Solicitacao criada com sucesso." })
            } else if (entityState.action === "edit" && entityState.entityId) {
                const response = await processReturnRequestAction({
                    partnerId,
                    requestId: entityState.entityId,
                    action: "updated",
                    nextStatus: data.status,
                    refundAmount: Number(data.refundValue || 0),
                    refundStatus: Number(data.refundValue || 0) > 0 ? "APPROVED" : "PENDING",
                    refundPaymentMethod: (data.resolutionType === "refund" || (data.resolutionType === "exchange" && data.exchangeBalanceResolution === "refund")) ? data.refundPaymentMethod || null : null,
                    returnToInventory: Boolean(data.returnToInventory),
                    returnToInventoryItems: data.returnToInventoryItems || null,
                    customerId: data.customerId || null,
                    storeCreditAmount: data.resolutionType === "store_credit" ? Number(data.storeCreditValue || 0) : 0,
                    exchangeItems: data.resolutionType === "exchange" ? data.exchangeItems || [] : [],
                    exchangeBalanceResolution: data.exchangeBalanceResolution || null,
                    notes: data.observations || "",
                    idempotencyKey: `erp-update:${entityState.entityId}:${Date.now()}`,
                })
                if (!response.success) throw new Error(response.error)
                toast({ title: "Sucesso", description: "Solicitação atualizada com sucesso." })
            }
            await loadReturns()
            closeEntity()
        } catch (err: any) {
            toast({ title: "Erro", description: err?.message || "Erro ao salvar devolução.", variant: "destructive" })
        } finally {
            setIsSaving(false)
        }
    }

    const filteredReturns = useMemo(() => {
        const term = debouncedSearch.trim().toLowerCase()
        let result = returns.filter((item) => {
            const matchesSearch =
                !term ||
                item.orderNumber.toLowerCase().includes(term) ||
                item.customerName.toLowerCase().includes(term) ||
                `ret-${item.id}`.toLowerCase().includes(term)

            let matchesTab = true
            if (activeTab === "Pendentes") matchesTab = item.status === "PENDING_REVIEW"
            else if (activeTab === "Analise") matchesTab = ["UNDER_ANALYSIS", "ESCALATED"].includes(item.status)
            else if (activeTab === "AguardandoCliente") matchesTab = item.status === "WAITING_CUSTOMER"
            else if (activeTab === "Aprovados") matchesTab = ["APPROVED", "WAITING_ITEM_RETURN", "PROCESSING"].includes(item.status)
            else if (activeTab === "Finalizados") matchesTab = ["RESOLVED", "REJECTED", "EXPIRED"].includes(item.status)
            return matchesSearch && matchesTab
        })

        if (sortConfig) {
            result = [...result].sort((a, b) => {
                let aVal: any = ""
                let bVal: any = ""
                switch (sortConfig.key) {
                    case "id":
                        aVal = a.id
                        bVal = b.id
                        break
                    case "order_number":
                        aVal = a.orderNumber
                        bVal = b.orderNumber
                        break
                    case "customer":
                        aVal = a.customerName
                        bVal = b.customerName
                        break
                    case "date":
                        aVal = new Date(a.createdAt).getTime()
                        bVal = new Date(b.createdAt).getTime()
                        break
                    case "refund_type":
                        aVal = getReturnResolutionLabel(a.approvedResolution || a.desiredResolution || "")
                        bVal = getReturnResolutionLabel(b.approvedResolution || b.desiredResolution || "")
                        break
                    case "quantity":
                        aVal = a.items.reduce((acc, i) => acc + Number(i.quantity || 0), 0)
                        bVal = b.items.reduce((acc, i) => acc + Number(i.quantity || 0), 0)
                        break
                }
                if (aVal === bVal) return 0
                const cmp = aVal < bVal ? -1 : 1
                return sortConfig.direction === "asc" ? cmp : -cmp
            })
        }

        return result
    }, [returns, debouncedSearch, activeTab, sortConfig])

    const totalPages = Math.max(1, Math.ceil(filteredReturns.length / ITEMS_PER_PAGE))
    const paginatedReturns = filteredReturns.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)
    const hasActiveFilters = debouncedSearch.length > 0 || activeTab !== "Todos"

    if (planGate) {
        return (
            <FadeIn className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300">
                <div className="flex flex-col items-center justify-center text-center min-h-[400px] px-4">
                    <IconPlaceholder
                        placeholderType="image"
                        imageSrc="https://img.dudit.com.br/static/mascots/Estoque.png"
                        imageAlt="Recurso bloqueado"
                        title="Trocas e Devoluções"
                        subtitle="Gerencie trocas e devoluções de forma organizada. Disponível nos planos Crescer e Escalar."
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
        <AnimatePresence mode="wait">
            {entityState.isOpen ? (
                isLoading ? (
                    <div className="flex items-center justify-center h-[calc(100vh-65px)] w-full">
                        <ThreeDotsLoader />
                    </div>
                ) : (
                    <CreateReturnPage
                        key="form"
                        partnerId={partnerId}
                        mode={entityState.action as any}
                        returnRequest={activeReturnRequest}
                        onBack={closeEntity}
                        onSave={handleSaveReturn}
                        isSaving={isSaving}
                    />
                )
            ) : (
                <FadeIn key="list" className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300">
                    <div className="mx-auto w-full pt-4 flex flex-col h-full overflow-hidden relative">
                        <div className="hidden md:flex items-start justify-between mb-6 flex-none px-4 md:px-8">
                            <div className="flex flex-col gap-2 pt-1">
                                <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                                    Trocas e devoluções
                                </h1>
                                <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                                    Gerencie trocas, devoluções, créditos e reembolsos.
                                </p>
                            </div>
                            <div className="flex items-center gap-3">
                                <Button variant="outline" leftIcon={<ExportFileIcon size={18} />} onClick={() => toast({ title: "Exportacao", description: "Use os filtros atuais para revisar a lista antes de exportar." })}>
                                    Exportar
                                </Button>
                                {canManage && (
                                    <Button onClick={() => openEntity("create")} leftIcon={<PlusIcon size={18} />}>
                                        Nova devolução
                                    </Button>
                                )}
                            </div>
                        </div>

                        <div className="mb-6 px-4 md:px-8">
                            <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as ActiveTab)}>
                                <TabsList className="px-0">
                                    <TabsTrigger value="Todos">Todos</TabsTrigger>
                                    <TabsTrigger value="Pendentes">Pendentes</TabsTrigger>
                                    <TabsTrigger value="Analise">Análise</TabsTrigger>
                                    <TabsTrigger value="AguardandoCliente">Aguardando cliente</TabsTrigger>
                                    <TabsTrigger value="Aprovados">Aprovados</TabsTrigger>
                                    <TabsTrigger value="Finalizados">Finalizados</TabsTrigger>
                                </TabsList>
                            </Tabs>
                        </div>

                        <ReturnPageControls
                            search={search}
                            onSearchChange={setSearch}
                            onOpenFilter={() => undefined}
                            onAdd={canManage ? () => openEntity("create") : undefined}
                            viewMode={effectiveViewMode}
                            onViewModeChange={setViewModeState}
                        />

                        <div className="flex-1 overflow-y-auto custom-scrollbar relative pb-20 md:pb-2 px-4 md:px-8">
                            <AnimatePresence mode="wait">
                                {isLoading ? (
                                    <div className="h-[400px] flex items-center justify-center">
                                        <ThreeDotsLoader />
                                    </div>
                                ) : paginatedReturns.length === 0 ? (
                                    <FadeIn key="empty" className="flex flex-col items-center justify-center h-[500px] text-center p-8 w-full">
                                        <IconPlaceholder
                                            placeholderType="image"
                                            imageSrc={hasActiveFilters ? "https://img.dudit.com.br/static/mascots/NaoEncontrado.png" : "https://img.dudit.com.br/static/mascots/Devolucoes.png"}
                                            imageAlt="Sem devolucoes"
                                            title={hasActiveFilters ? "Nenhuma solicitação encontrada" : "Nenhuma solicitação cadastrada"}
                                            subtitle={hasActiveFilters ? "Ajuste a busca para encontrar o que procura." : "Comece criando a primeira solicitação de troca ou devolução."}
                                            itemButton={!hasActiveFilters && canManage ? { text: "Criar devolução", action: () => openEntity("create") } : undefined}
                                        />
                                    </FadeIn>
                                ) : effectiveViewMode === "grid" ? (
                                    <FadeIn key="grid" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-4">
                                        {paginatedReturns.map((item) => (
                                            <ReturnGridCard
                                                key={item.id}
                                                returnRequest={item}
                                                onDetails={() => openEntity("view", item.id)}
                                                onEdit={canManage && !["RESOLVED", "REJECTED", "EXPIRED"].includes(item.status) ? () => openEntity("edit", item.id) : undefined}
                                                canManage={canManage}
                                            />
                                        ))}
                                    </FadeIn>
                                ) : (
                                    <FadeIn key="list-table" className="w-full overflow-hidden rounded-xl relative">
                                        <div className="overflow-x-auto pb-4 custom-scrollbar">
                                            <table className="w-full text-left border-separate border-spacing-0 min-w-[1200px]">
                                                <thead>
                                                    <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                        {COLUMNS.map((col, idx) => {
                                                            const sortable = col.id !== "actions"
                                                            const sorted = sortConfig?.key === col.id
                                                            return (
                                                                <th
                                                                    key={col.id}
                                                                    style={{ width: col.width }}
                                                                    className={`py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 ${idx === 0 ? "rounded-l-lg pl-4" : ""} ${idx === COLUMNS.length - 1 ? "rounded-r-lg pr-4" : ""} ${sortable ? "cursor-pointer group" : ""}`}
                                                                    onClick={() => {
                                                                        if (!sortable) return
                                                                        setSortConfig((prev) => ({
                                                                            key: col.id as SortKey,
                                                                            direction: prev?.key === col.id && prev.direction === "asc" ? "desc" : "asc",
                                                                        }))
                                                                    }}
                                                                >
                                                                    <span>{col.label}</span>
                                                                    {sorted ? null : null}
                                                                </th>
                                                            )
                                                        })}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {paginatedReturns.map((item) => (
                                                        <ReturnListRow
                                                            key={item.id}
                                                            returnRequest={item}
                                                            columns={COLUMNS}
                                                            onDetails={(r) => openEntity("view", r.id)}
                                                            onEdit={(r) => openEntity("edit", r.id)}
                                                            canManage={canManage}
                                                        />
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </FadeIn>
                                )}
                            </AnimatePresence>
                        </div>

                        {filteredReturns.length > 0 && (
                            <Pagination currentPage={page} totalPages={totalPages} onPageChange={(p) => setPage(p)} />
                        )}
                    </div>
                </FadeIn>
            )}
        </AnimatePresence>
    )
}
