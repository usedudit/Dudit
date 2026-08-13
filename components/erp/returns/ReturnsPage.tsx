"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { AnimatePresence } from "framer-motion"
import { Button, IconPlaceholder, Pagination, Tabs, TabsList, TabsTrigger, ThreeDotsLoader, DefaultModal, Checkbox } from "@/components/reusable"
import { FadeIn } from "@/components/animations/FadeIn"
import { usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal"
import { PlusIcon, ExportFileIcon, ReturnIcon, XIcon } from "@/lib/icons"
import { useMediaQuery } from "@/components/erp/hooks"
import { useEntityState } from "@/hooks/use-entity-state"
import { useToast } from "@/hooks/use-toast"
import { useErpExport } from "@/hooks/use-erp-export"
import { usePermissions } from "@/lib/permission-context"
import { useStore } from "@/lib/store-context"
import ExportSelectionModal from "@/components/erp/export/ExportSelectionModal"
import ExportColumnSelectionModal from "@/components/erp/export/ExportColumnSelectionModal"
import ReturnListRow, { getReturnStatusMeta } from "./ReturnListRow"
import ReturnGridCard from "./ReturnGridCard"
import ReturnPrintModal from "./ReturnPrintModal"
import CreateReturnPage from "./CreateReturnPage"
import ReturnPageControls from "./ReturnPageControls"
import type { ReturnRequest } from "./types"
import { createReturnRequestAction, getReturnRequestsPageAction, processReturnRequestAction } from "@/app/actions/erp/returns"
import { getReturnResolutionLabel } from "@/lib/returns/types"
import FilterSheet, { FilterSectionConfig } from "@/components/reusable/FilterSheet"

type ActiveTab = "Todos" | "Pendentes" | "Analise" | "AguardandoCliente" | "Aprovados" | "Finalizados"
type SortKey = "id" | "order_number" | "customer" | "date" | "refund_type" | "status"
type SortDirection = "asc" | "desc"

interface ReturnsPageProps {
    partnerId: string
    roleId: string
    storeId?: string
    planGate?: { requiredPlanSlug: "crescer" | "escalar" }
}

const ITEMS_PER_PAGE = 8

const COLUMNS = [
    { id: "id", label: "Código", align: "left" as const, width: "160px" },
    { id: "order_number", label: "Pedido", align: "left" as const, width: "180px" },
    { id: "customer", label: "Cliente", align: "left" as const, width: "240px" },
    { id: "date", label: "Data", align: "left" as const, width: "160px" },
    { id: "refund_type", label: "Resolução", align: "left" as const, width: "180px" },
    { id: "status", label: "Status", align: "left" as const, width: "180px" },
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

export default function ReturnsPage({ partnerId, roleId, storeId, planGate }: ReturnsPageProps) {
    const { toast } = useToast()
    const { openPlanUpgrade } = usePlanUpgrade()
    const { planSlug } = usePermissions()
    const { exportData, isExporting, columnSelectionModal, closeColumnSelectionModal, handleColumnConfirm, selectionModal, closeSelectionModal, handleExportSelected, handleExportAll } = useErpExport(planSlug)
    const isMobile = useMediaQuery("(max-width: 767px)")
    const isTablet = useMediaQuery("(max-width: 1024px)")
    const { state: entityState, open: openEntity, close: closeEntity } = useEntityState()
    const canManage = roleId === "owner" || roleId === "admin" || roleId === "manager"

    const queryClient = useQueryClient()
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

    // Filter state
    interface FilterState {
        status: string[]
        resolutionType: string[]
        reason: string[]
        condition: string[]
        refundRange: { min: string; max: string }
        storeCreditRange: { min: string; max: string }
        hasEvidence: boolean
    }

    const INITIAL_FILTERS: FilterState = {
        status: [],
        resolutionType: [],
        reason: [],
        condition: [],
        refundRange: { min: "", max: "" },
        storeCreditRange: { min: "", max: "" },
        hasEvidence: false,
    }

    const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS)
    const [modals, setModals] = useState({ filter: false })

    const [showMpPaymentNotFoundModal, setShowMpPaymentNotFoundModal] = useState(false)
    const [mpPaymentNotFoundChecked, setMpPaymentNotFoundChecked] = useState(false)
    const [pendingProcessData, setPendingProcessData] = useState<Record<string, any> | null>(null)
    const [printReturnId, setPrintReturnId] = useState<string | null>(null)

    const { data: returnsData, isLoading: isReturnsLoading } = useQuery({
        queryKey: ['erp', 'returns', partnerId, storeId],
        queryFn: async () => {
            const res = await getReturnRequestsPageAction(partnerId, { limit: 100 })
            if (res.success) return res.items as ReturnRequest[]
            throw new Error(res.error || "Erro ao carregar devoluções")
        },
        staleTime: 30000,
        refetchOnWindowFocus: false,
    })

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search), 300)
        return () => clearTimeout(timer)
    }, [search])

    useEffect(() => {
        setPage(1)
    }, [debouncedSearch, activeTab])

    const activeReturnRequest = useMemo(() => {
        if (!entityState.entityId) return null
        return (returnsData ?? []).find((r) => r.id === entityState.entityId) || null
    }, [returnsData, entityState.entityId])

    const handleSaveReturn = async (data: Partial<ReturnRequest> & Record<string, any>) => {
        setIsSaving(true)
        try {
            if (entityState.action === "create") {
                if (!data.orderId) throw new Error("Selecione um pedido")
                const selectedItems = data.items || []
                const response = await createReturnRequestAction({
                    partnerId,
                    orderId: data.orderId,
                    customerId: data.customerId || null,
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
                    idempotencyKey: `erp:${partnerId}:${data.orderId}:${typeof window !== "undefined" ? window.crypto.randomUUID() : crypto.randomUUID()}`,
                    refundValue: Number(data.refundValue || 0),
                    storeCreditValue: Number(data.storeCreditValue || 0),
                    exchangeItems: data.exchangeItems || [],
                    exchangeBalanceResolution: data.exchangeBalanceResolution || null,
                    returnToInventory: Boolean(data.returnToInventory),
                })
                if (!response.success) throw new Error(response.error)
                const requestId = response.data?.id
                if (data.status && data.status !== "PENDING_REVIEW" && requestId) {
                    const processRes = await processReturnRequestAction({
                        partnerId,
                        requestId,
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
                        idempotencyKey: `erp-init-process:${requestId}`,
                    })
                    if (!processRes.success) throw new Error(processRes.error)
                    if (processRes.success && (processRes as any).data?.mpPaymentNotFound) {
                        setPendingProcessData({
                            partnerId,
                            requestId,
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
                            idempotencyKey: `erp-init-process:${requestId}`,
                        })
                        setMpPaymentNotFoundChecked(false)
                        setShowMpPaymentNotFoundModal(true)
                        return
                    }
                }
                toast({ title: "Sucesso", description: "Solicitação criada com sucesso." })
            } else if (entityState.action === "edit" && entityState.entityId) {
                const processPayload: Record<string, any> = {
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
                }
                const response = await processReturnRequestAction(processPayload)
                if (!response.success) throw new Error(response.error)
                if (response.success && (response as any).data?.mpPaymentNotFound) {
                    setPendingProcessData(processPayload)
                    setMpPaymentNotFoundChecked(false)
                    setShowMpPaymentNotFoundModal(true)
                    return
                }
                toast({ title: "Sucesso", description: "Solicitação atualizada com sucesso." })
            }
            await queryClient.invalidateQueries({ queryKey: ['erp', 'returns', partnerId] })
            closeEntity()
        } catch (err: any) {
            toast({ title: "Erro", description: err?.message || "Erro ao salvar devolução.", variant: "destructive" })
        } finally {
            setIsSaving(false)
        }
    }

    const filteredReturns = useMemo(() => {
        const term = debouncedSearch.trim().toLowerCase()
        let result = (returnsData ?? []).filter((item) => {
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

            // Filter: Status
            const statusLabel = getReturnStatusMeta(item.status).label
            const statusMatch = filters.status.length === 0 || filters.status.includes(statusLabel)

            // Filter: Resolution Type
            const resolutionLabel = getReturnResolutionLabel(item.approvedResolution || item.desiredResolution || "")
            const resolutionMatch = filters.resolutionType.length === 0 || filters.resolutionType.includes(resolutionLabel)

            // Filter: Reason (from first item)
            const itemReason = item.items[0]?.reason || ""
            const reasonMatch = filters.reason.length === 0 || filters.reason.includes(itemReason)

            // Filter: Condition (from first item)
            const itemCondition = item.items[0]?.condition || ""
            const conditionMatch = filters.condition.length === 0 || filters.condition.includes(itemCondition)

            // Filter: Refund Value Range
            const refundValue = Number(item.refundValue || 0)
            const minRefund = filters.refundRange.min ? Number(filters.refundRange.min) : 0
            const maxRefund = filters.refundRange.max ? Number(filters.refundRange.max) : Number.POSITIVE_INFINITY
            const refundMatch = refundValue >= minRefund && refundValue <= maxRefund

            // Filter: Store Credit Range
            const storeCreditValue = Number(item.storeCreditValue || 0)
            const minCredit = filters.storeCreditRange.min ? Number(filters.storeCreditRange.min) : 0
            const maxCredit = filters.storeCreditRange.max ? Number(filters.storeCreditRange.max) : Number.POSITIVE_INFINITY
            const creditMatch = storeCreditValue >= minCredit && storeCreditValue <= maxCredit

            // Filter: Has Evidence
            const evidenceMatch = !filters.hasEvidence || (item.items[0]?.evidence?.length > 0)

            return matchesSearch && matchesTab && statusMatch && resolutionMatch && reasonMatch && conditionMatch && refundMatch && creditMatch && evidenceMatch
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
                    case "status":
                        aVal = getReturnStatusMeta(a.status).label
                        bVal = getReturnStatusMeta(b.status).label
                        break
                }
                if (aVal === bVal) return 0
                const cmp = aVal < bVal ? -1 : 1
                return sortConfig.direction === "asc" ? cmp : -cmp
            })
        }

        return result
    }, [returnsData, debouncedSearch, activeTab, sortConfig, filters])

    // Dynamic Filter Sections - only show if data exists for that filter
    const filterSections = useMemo<FilterSectionConfig[]>(() => {
        const data = returnsData ?? []
        if (data.length === 0) return []

        // Status labels present in data
        const statusLabels = [...new Set(data.map(item => getReturnStatusMeta(item.status).label))]

        // Resolution types present
        const resolutionLabels = [...new Set(data.map(item => getReturnResolutionLabel(item.approvedResolution || item.desiredResolution || "")).filter(Boolean))]

        // Reasons present (from first item of each return)
        const reasons = [...new Set(data.map(item => item.items[0]?.reason).filter(Boolean))]

        // Conditions present
        const conditions = [...new Set(data.map(item => item.items[0]?.condition).filter(Boolean))]

        // Has any with evidence
        const hasEvidence = data.some(item => item.items[0]?.evidence?.length > 0)

        // Has refund values
        const hasRefund = data.some(item => Number(item.refundValue || 0) > 0)

        // Has store credit values
        const hasStoreCredit = data.some(item => Number(item.storeCreditValue || 0) > 0)

        const sections: FilterSectionConfig[] = []

        if (statusLabels.length > 1) sections.push({ id: "status", title: "Status", type: "checkbox-list", options: statusLabels })
        if (resolutionLabels.length > 1) sections.push({ id: "resolutionType", title: "Tipo de Resolução", type: "checkbox-list", options: resolutionLabels })
        if (reasons.length > 1) sections.push({ id: "reason", title: "Motivo", type: "checkbox-list", options: reasons })
        if (conditions.length > 1) sections.push({ id: "condition", title: "Condição do Item", type: "checkbox-list", options: conditions })
        if (hasRefund) sections.push({ id: "refundRange", title: "Valor Reembolso", type: "range", rangeConfig: { minKey: "min", maxKey: "max", minPlaceholder: "Mín (R$)", maxPlaceholder: "Máx (R$)" } })
        if (hasStoreCredit) sections.push({ id: "storeCreditRange", title: "Valor Vale-Compra", type: "range", rangeConfig: { minKey: "min", maxKey: "max", minPlaceholder: "Mín (R$)", maxPlaceholder: "Máx (R$)" } })
        if (hasEvidence) sections.push({ id: "hasEvidence", title: "Tem Evidências", type: "switch", switchLabel: "Apenas com evidências" })

        return sections
    }, [returnsData])

    const totalPages = Math.max(1, Math.ceil(filteredReturns.length / ITEMS_PER_PAGE))
    const paginatedReturns = filteredReturns.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)
    const hasActiveFilters = debouncedSearch.length > 0 || activeTab !== "Todos" ||
        filters.status.length > 0 ||
        filters.resolutionType.length > 0 ||
        filters.reason.length > 0 ||
        filters.condition.length > 0 ||
        !!filters.refundRange.min ||
        !!filters.refundRange.max ||
        !!filters.storeCreditRange.min ||
        !!filters.storeCreditRange.max ||
        filters.hasEvidence

    const handleClearFilters = useCallback(() => {
        setSearch("")
        setFilters(INITIAL_FILTERS)
    }, [setSearch])

    const { selectedStore } = useStore()

    const handleExport = useCallback(() => {
        void exportData({
            partnerId,
            module: "returns",
            format: "xlsx",
            filters: {
                storeId: selectedStore?.id || null,
                search: debouncedSearch,
                activeTab,
                status: filters.status,
                resolutionType: filters.resolutionType,
                reason: filters.reason,
                condition: filters.condition,
                minRefund: filters.refundRange.min,
                maxRefund: filters.refundRange.max,
                minStoreCredit: filters.storeCreditRange.min,
                maxStoreCredit: filters.storeCreditRange.max,
                hasEvidence: filters.hasEvidence,
            },
        })
    }, [exportData, partnerId, selectedStore?.id, debouncedSearch, activeTab, filters])

    if (planGate) {
        return (
            <FadeIn className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300">
                <div className="flex flex-col items-center justify-center text-center min-h-[400px] px-4">
                    <IconPlaceholder
                        placeholderType="image"
                        imageSrc="https://img.dudit.com.br/static/mascots/Devolucoes.png"
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

    const handleMpPaymentNotFoundConfirm = useCallback(async () => {
        if (!pendingProcessData) return
        setIsSaving(true)
        setShowMpPaymentNotFoundModal(false)
        try {
            const retryResponse = await processReturnRequestAction({
                ...pendingProcessData,
                skipMpPaymentCheck: true,
            })
            if (!retryResponse.success) throw new Error(retryResponse.error)
            await queryClient.invalidateQueries({ queryKey: ['erp', 'returns', partnerId] })
            closeEntity()
            toast({ title: "Sucesso", description: "Solicitação atualizada com sucesso." })
        } catch (err: any) {
            toast({ title: "Erro", description: err?.message || "Erro ao salvar devolução.", variant: "destructive" })
        } finally {
            setIsSaving(false)
            setPendingProcessData(null)
        }
    }, [pendingProcessData, queryClient, partnerId, closeEntity, toast])

    return (
        <>
            <AnimatePresence mode="wait">
                {entityState.isOpen ? (
                    isReturnsLoading ? (
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
                                    <Button variant="outline" leftIcon={<ExportFileIcon size={18} />} onClick={handleExport} disabled={isExporting}>
                                        {isExporting ? "Exportando..." : "Exportar"}
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
                                onOpenFilter={() => setModals({ filter: true })}
                                onAdd={canManage ? () => openEntity("create") : undefined}
                                viewMode={effectiveViewMode}
                                onViewModeChange={setViewModeState}
                            />

                            <div className="flex-1 overflow-y-auto custom-scrollbar relative pb-20 md:pb-2 px-4 md:px-8">
                                <AnimatePresence mode="wait">
                                    {isReturnsLoading ? (
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
                                                itemButton={hasActiveFilters ? {
                                                    text: "Limpar filtros",
                                                    action: handleClearFilters,
                                                    variant: "outline"
                                                } : !hasActiveFilters && canManage ? { text: "Criar devolução", action: () => openEntity("create") } : undefined}
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
                                                    onPrint={() => setPrintReturnId(item.id)}
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
                                                                onPrint={(r) => setPrintReturnId(r.id)}
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

            <DefaultModal
                isOpen={showMpPaymentNotFoundModal}
                onClose={() => {
                    setShowMpPaymentNotFoundModal(false)
                    setPendingProcessData(null)
                }}
                maxWidth="md"
            >
                <div className="flex flex-col relative">
                    <button
                        onClick={() => {
                            setShowMpPaymentNotFoundModal(false)
                            setPendingProcessData(null)
                        }}
                        className="absolute top-3 right-3 z-10 w-10 h-10 rounded-full bg-black/5 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20 flex items-center justify-center text-brand-dark dark:text-dark-heading transition-colors hidden md:flex"
                        title="Fechar"
                    >
                        <XIcon size={18} />
                    </button>

                    <div className="h-[200px] rounded-2xl flex items-end justify-center mb-6 relative overflow-hidden bg-[#fff3e0]">
                        <img
                            src="https://img.dudit.com.br/static/illustrations/Pagamento.png"
                            alt="Pagamento não encontrado"
                            className="w-64 h-auto object-contain transform translate-y-4"
                        />
                    </div>

                    <h4 className="text-brand-dark dark:text-dark-heading text-xl font-bold mb-2 text-center">
                        Pagamento não detectado
                    </h4>
                    <p className="text-brand-inactive-text dark:text-dark-body text-[15px] mb-6 text-center leading-relaxed">
                        Não foi detectado pagamento via <strong>Mercado Pago</strong> para este pedido nos servidores do Mercado Pago. O reembolso automático pode não ser processado.
                    </p>

                    <div className="mb-6 flex items-start gap-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 rounded-xl p-4">
                        <Checkbox
                            checked={mpPaymentNotFoundChecked}
                            onChange={(checked: boolean) => setMpPaymentNotFoundChecked(!!checked)}
                        />
                        <div
                            className="text-xs font-medium text-amber-800 dark:text-amber-300 leading-normal select-none cursor-pointer"
                            onClick={() => setMpPaymentNotFoundChecked(!mpPaymentNotFoundChecked)}
                        >
                            Estou ciente de que o pagamento não foi localizado no Mercado Pago e o reembolso pode não ser processado automaticamente.
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3">
                        <Button
                            variant="outline"
                            onClick={() => {
                                setShowMpPaymentNotFoundModal(false)
                                setPendingProcessData(null)
                            }}
                            className="flex-1 h-[46px]"
                            disabled={isSaving}
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleMpPaymentNotFoundConfirm}
                            className={`flex-1 h-[46px] text-white border-none transition-colors ${mpPaymentNotFoundChecked
                                ? "bg-amber-600 hover:bg-amber-700"
                                : "bg-amber-600/50 cursor-not-allowed opacity-50"
                                }`}
                            disabled={!mpPaymentNotFoundChecked || isSaving}
                        >
                            {isSaving ? "Salvando..." : "Continuar mesmo assim"}
                        </Button>
                    </div>
                </div>
            </DefaultModal>

            <ExportColumnSelectionModal
                isOpen={columnSelectionModal.isOpen}
                canExportAllColumns={columnSelectionModal.canExportAllColumns}
                onConfirm={handleColumnConfirm}
                onClose={closeColumnSelectionModal}
            />

            {printReturnId && (
                <ReturnPrintModal
                    isOpen={!!printReturnId}
                    onClose={() => setPrintReturnId(null)}
                    returnId={printReturnId}
                    partnerId={partnerId}
                    storeId={selectedStore?.id}
                />
            )}

            <ExportSelectionModal
                isOpen={selectionModal.isOpen}
                selectedCount={selectionModal.selectedCount}
                totalCount={selectionModal.totalCount}
                onExportSelected={handleExportSelected}
                onExportAll={handleExportAll}
                onClose={closeSelectionModal}
            />

            <FilterSheet
                isOpen={modals.filter}
                onClose={() => setModals({ filter: false })}
                sections={filterSections}
                filters={filters}
                setFilters={setFilters}
                onClear={() => setFilters(INITIAL_FILTERS)}
            />
        </>
    )
}
