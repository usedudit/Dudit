"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Button, IconPlaceholder, Pagination, Tabs, TabsList, TabsTrigger, ThreeDotsLoader } from "@/components/reusable";
import FilterSheet, { FilterSectionConfig } from "@/components/reusable/FilterSheet";
import { FadeIn } from "@/components/animations/FadeIn";
import { ExportFileIcon, RotateIcon, AlertCircleIcon, CheckCircleIcon, ClockIcon, FilterIcon } from "@/lib/icons";
import type { CursorPaginatedResult } from "@/lib/admin/types";
import { getAdminReturnRequests, getAdminReturnRequestsStats, type AdminReturnStats } from "@/app/actions/admin/marketplace-ops";
import { useMediaQuery } from "@/components/erp/hooks";
import { useEntityState } from "@/hooks/use-entity-state";
import { useEntityPage } from "@/hooks/use-entity-page";
import { useDebouncedSearch } from "@/hooks/use-debounced-search";
import { toast } from "@/hooks/use-notification";
import ReturnListRow, { getReturnStatusMeta } from "@/components/erp/returns/ReturnListRow";
import ReturnGridCard from "@/components/erp/returns/ReturnGridCard";
import ReturnPageControls from "@/components/erp/returns/ReturnPageControls";
import type { ReturnRequest } from "@/components/erp/returns/types";
import { getReturnResolutionLabel } from "@/lib/returns/types";
import AdminReturnDetailView from "./AdminReturnDetailView";
import { PermissionProvider } from "@/lib/permission-context";
import { ROUTE_PERMISSION_PRESETS } from "@/lib/permissions/route-permissions";
import { StoreProvider } from "@/lib/store-context";
import { TabCountBadge } from "@/components/reusable/TabCountBadge";
import { cn } from "@/lib/utils";
import {
    EMPTY_DATE_PERIOD,
    isDatePeriodFilterActive,
    type DatePeriodFilterValue,
} from "@/lib/utils/filter-date-period";

type ActiveTab = "Todos" | "Pendentes" | "Analise" | "AguardandoCliente" | "Aprovados" | "Finalizados";
type SortKey = "id" | "order_number" | "store" | "customer" | "date" | "refund_type" | "status";
type SortDirection = "asc" | "desc";

interface ReturnsListProps {
    initialData: CursorPaginatedResult<any>;
    initialStats?: AdminReturnStats;
}

const ITEMS_PER_PAGE = 8;

const COLUMNS = [
    { id: "id", label: "Código", align: "left" as const, width: "160px" },
    { id: "order_number", label: "Pedido", align: "left" as const, width: "160px" },
    { id: "store", label: "Loja", align: "left" as const, width: "180px" },
    { id: "customer", label: "Cliente", align: "left" as const, width: "220px" },
    { id: "date", label: "Data", align: "left" as const, width: "160px" },
    { id: "refund_type", label: "Resolução", align: "left" as const, width: "160px" },
    { id: "status", label: "Status", align: "left" as const, width: "160px" },
    { id: "actions", label: "Ações", align: "center" as const, width: "80px" },
];

interface FilterState {
    status: string[];
    resolutionType: string[];
    reason: string[];
    condition: string[];
    refundRange: { min: string; max: string };
    storeCreditRange: { min: string; max: string };
    hasEvidence: boolean;
    datePeriod: DatePeriodFilterValue;
}

const INITIAL_FILTERS: FilterState = {
    status: [],
    resolutionType: [],
    reason: [],
    condition: [],
    refundRange: { min: "", max: "" },
    storeCreditRange: { min: "", max: "" },
    hasEvidence: false,
    datePeriod: { ...EMPTY_DATE_PERIOD },
};

const TAB_STATUSES: Record<ActiveTab, string[]> = {
    Todos: [],
    Pendentes: ["PENDING_REVIEW"],
    Analise: ["UNDER_ANALYSIS", "ESCALATED"],
    AguardandoCliente: ["WAITING_CUSTOMER"],
    Aprovados: ["APPROVED", "WAITING_ITEM_RETURN", "PROCESSING"],
    Finalizados: ["RESOLVED", "REJECTED", "EXPIRED"],
};

export default function ReturnsList({ initialData, initialStats }: ReturnsListProps) {
    const isMobile = useMediaQuery("(max-width: 767px)");
    const isTablet = useMediaQuery("(max-width: 1024px)");
    const { state: entityState, open: openEntity, close: closeEntity } = useEntityState();

    const [activeTab, setActiveTab] = useState<ActiveTab>("Todos");
    const [viewMode, setViewModeState] = useState<"list" | "grid">(isMobile ? "grid" : "list");
    const effectiveViewMode = isTablet ? "grid" : viewMode;

    // Local states - DECLARED BEFORE useEntityPage
    const { search, setSearch, debouncedSearch } = useDebouncedSearch();
    const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS);
    const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);

    // Sorting - DECLARED BEFORE filteredReturns
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>({
        key: "date",
        direction: "desc",
    });

    const isDefaultView = activeTab === "Todos" && !isDatePeriodFilterActive(filters.datePeriod);

    const entityPage = useEntityPage<any, any, any>({
        entityType: "returns",
        partnerId: "admin",
        queryKey: ["admin-returns", activeTab, debouncedSearch, filters.datePeriod],
        initialItems: initialData?.data || [],
        initialNextCursor: initialData?.nextCursor || null,
        initialHasMore: initialData?.hasMore || false,
        skipInitialData: !isDefaultView,
        search: debouncedSearch,
        setSearch,
        fetchPageFn: async ({ cursor }) => {
            const statuses = TAB_STATUSES[activeTab] || [];
            const res = await getAdminReturnRequests(cursor, 100, {
                status: statuses.length === 1 ? statuses[0] : statuses.length > 1 ? statuses : undefined,
                search: debouncedSearch || undefined,
                startDate: filters.datePeriod.from || undefined,
                endDate: filters.datePeriod.to || undefined,
            });
            return { items: res.data || [], nextCursor: res.nextCursor, hasMore: res.hasMore };
        },
        dedupeKey: useCallback((r: any) => String(r?.id || ""), []),
        getDetailFn: async (id: string) => {
            return null
        },
        listToDetail: (item) => ({ ...item, __partial: true }),
        staleTime: 30_000,
    });

    const {
        items: requests,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        entityState: epEntityState,
        openEntity: epOpenEntity,
        closeEntity: epCloseEntity,
        afterMutation,
    } = entityPage;

    const handleMutation = useCallback(() => {
        afterMutation()
        getAdminReturnRequestsStats().then(setStats).catch(console.error)
    }, [afterMutation]);

    // Sync stats when data loads
    const [stats, setStats] = useState<AdminReturnStats | null>(initialStats || null);

    const handleSearchChange = useCallback((val: string) => {
        setSearch(val);
    }, [setSearch]);

    // Pagination - DECLARED BEFORE useEffect
    const [page, setPage] = useState(1);
    useEffect(() => {
        setPage(1)
    }, [debouncedSearch, activeTab, filters.datePeriod]);

    // Client-side filters that aren't yet supported server-side
    const filteredReturns = useMemo(() => {
        let result = [...(requests || [])];

        // Filter Sheet: status
        if (filters.status && filters.status.length > 0) {
            result = result.filter(item => {
                const statusLabel = getReturnStatusMeta(item.status).label;
                return filters.status.includes(statusLabel);
            });
        }

        // Filter Sheet: resolution type
        if (filters.resolutionType && filters.resolutionType.length > 0) {
            result = result.filter(item => {
                const resolutionLabel = getReturnResolutionLabel(item.approvedResolution || item.desiredResolution || "");
                return filters.resolutionType.includes(resolutionLabel);
            });
        }

        // Filter Sheet: reason
        if (filters.reason && filters.reason.length > 0) {
            result = result.filter(item => filters.reason.includes(item.items[0]?.reason || ""));
        }

        // Filter Sheet: condition
        if (filters.condition && filters.condition.length > 0) {
            result = result.filter(item => filters.condition.includes(item.items[0]?.condition || ""));
        }

        // Filter Sheet: refund range
        if (filters.refundRange?.min) {
            const minVal = parseFloat(filters.refundRange.min);
            if (!isNaN(minVal)) {
                result = result.filter(item => Number(item.refundValue || 0) >= minVal);
            }
        }
        if (filters.refundRange?.max) {
            const maxVal = parseFloat(filters.refundRange.max);
            if (!isNaN(maxVal)) {
                result = result.filter(item => Number(item.refundValue || 0) <= maxVal);
            }
        }

        // Filter Sheet: store credit range
        if (filters.storeCreditRange?.min) {
            const minVal = parseFloat(filters.storeCreditRange.min);
            if (!isNaN(minVal)) {
                result = result.filter(item => Number(item.storeCreditValue || 0) >= minVal);
            }
        }
        if (filters.storeCreditRange?.max) {
            const maxVal = parseFloat(filters.storeCreditRange.max);
            if (!isNaN(maxVal)) {
                result = result.filter(item => Number(item.storeCreditValue || 0) <= maxVal);
            }
        }

        // Filter Sheet: has evidence
        if (filters.hasEvidence) {
            result = result.filter(item => item.items[0]?.evidence?.length > 0);
        }

        // Sorting - DECLARED AFTER filterSections
        if (sortConfig) {
            result = [...result].sort((a, b) => {
                let aVal: any = "";
                let bVal: any = "";
                switch (sortConfig.key) {
                    case "id":
                        aVal = a.id;
                        bVal = b.id;
                        break;
                    case "order_number":
                        aVal = a.orderNumber;
                        bVal = b.orderNumber;
                        break;
                    case "store":
                        aVal = a.storeName || "";
                        bVal = b.storeName || "";
                        break
                    case "customer":
                        aVal = a.customerName;
                        bVal = b.customerName;
                        break;
                    case "date":
                        aVal = new Date(a.createdAt).getTime();
                        bVal = new Date(b.createdAt).getTime();
                        break;
                    case "refund_type":
                        aVal = getReturnResolutionLabel(a.approvedResolution || a.desiredResolution || "");
                        bVal = getReturnResolutionLabel(b.approvedResolution || b.desiredResolution || "");
                        break;
                    case "status":
                        aVal = getReturnStatusMeta(a.status).label;
                        bVal = getReturnStatusMeta(b.status).label;
                        break;
                }
                if (aVal === bVal) return 0;
                const cmp = aVal < bVal ? -1 : 1;
                return sortConfig.direction === "asc" ? cmp : -cmp;
            });
        }

        return result;
    }, [requests, filters, sortConfig]);

    const filterSections = useMemo<FilterSectionConfig[]>(() => {
        const data = requests;
        if (data.length === 0) return [];

        const statusLabels = [...new Set(data.map(item => getReturnStatusMeta(item.status).label))];
        const resolutionLabels = [...new Set(data.map(item => getReturnResolutionLabel(item.approvedResolution || item.desiredResolution || "")).filter(Boolean))];
        const reasons = [...new Set(data.map(item => item.items[0]?.reason).filter(Boolean))];
        const conditions = [...new Set(data.map(item => item.items[0]?.condition).filter(Boolean))];
        const hasEvidence = data.some(item => item.items[0]?.evidence?.length > 0);
        const hasRefund = data.some(item => Number(item.refundValue || 0) > 0);
        const hasStoreCredit = data.some(item => Number(item.storeCreditValue || 0) > 0);

        const sections: FilterSectionConfig[] = [];

        if (statusLabels.length > 1) sections.push({ id: "status", title: "Status", type: "checkbox-list", options: statusLabels });
        if (resolutionLabels.length > 1) sections.push({ id: "resolutionType", title: "Tipo de Resolução", type: "checkbox-list", options: resolutionLabels });
        if (reasons.length > 1) sections.push({ id: "reason", title: "Motivo", type: "checkbox-list", options: reasons });
        if (conditions.length > 1) sections.push({ id: "condition", title: "Condição do Item", type: "checkbox-list", options: conditions });
        if (hasRefund) sections.push({ id: "refundRange", title: "Valor Reembolso", type: "range", rangeConfig: { minKey: "min", maxKey: "max", minPlaceholder: "Mín (R$)", maxPlaceholder: "Máx (R$)" } });
        if (hasStoreCredit) sections.push({ id: "storeCreditRange", title: "Valor Vale-Compra", type: "range", rangeConfig: { minKey: "min", maxKey: "max", minPlaceholder: "Mín (R$)", maxPlaceholder: "Máx (R$)" } });
        if (hasEvidence) sections.push({ id: "hasEvidence", title: "Tem Evidências", type: "switch", switchLabel: "Apenas com evidências" });
        sections.push({ id: "datePeriod", title: "Data da Solicitação", type: "date-period" });

        return sections;
    }, [requests]);

    // Sorting
    const handleSort = (key: SortKey) => {
        setSortConfig((prev) => {
            if (prev?.key === key) {
                return { key, direction: prev.direction === "asc" ? "desc" : "asc" }
            }
            return { key, direction: "desc" }
        })
    }

    // Pagination
    const totalPages = Math.max(1, Math.ceil(filteredReturns.length / ITEMS_PER_PAGE));
    const paginatedReturns = filteredReturns.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

    const hasActiveFilters =
        debouncedSearch.length > 0 ||
        activeTab !== "Todos" ||
        filters.status.length > 0 ||
        filters.resolutionType.length > 0 ||
        filters.reason.length > 0 ||
        filters.condition.length > 0 ||
        !!filters.refundRange.min ||
        !!filters.refundRange.max ||
        !!filters.storeCreditRange.min ||
        !!filters.storeCreditRange.max ||
        filters.hasEvidence ||
        isDatePeriodFilterActive(filters.datePeriod);

    const handleClearFilters = useCallback(() => {
        setSearch("");
        setFilters(INITIAL_FILTERS);
        setActiveTab("Todos");
    }, [setSearch]);

    // View Detail
    const handleViewDetail = useCallback((requestId: string) => {
        openEntity("view", requestId);
    }, [openEntity]);

    // Edit
    const handleEdit = useCallback((requestId: string) => {
        openEntity("edit", requestId);
    }, [openEntity]);

    // If viewing detail
    if (entityState.isOpen && entityState.action === "view" && entityState.entityId) {
        const currentReq = requests.find(r => r.id === entityState.entityId);
        const partnerId = currentReq?.partnerId || "";

        return (
            <PermissionProvider
                role="OWNER"
                routePermissions={ROUTE_PERMISSION_PRESETS.OWNER}
                partnerId={partnerId}
                businessInfo={{}}
                planSlug="escalar"
            >
                <StoreProvider partnerId={partnerId}>
                    <AdminReturnDetailView
                        detail={{ request: currentReq }}
                        onBack={closeEntity}
                    />
                </StoreProvider>
            </PermissionProvider>
        );
    }

    // If editing
    if (entityState.isOpen && entityState.action === "edit" && entityState.entityId) {
        const currentReq = requests.find(r => r.id === entityState.entityId);
        const partnerId = currentReq?.partnerId || "";

        return (
            <PermissionProvider
                role="OWNER"
                routePermissions={ROUTE_PERMISSION_PRESETS.OWNER}
                partnerId={partnerId}
                businessInfo={{}}
                planSlug="escalar"
            >
                <StoreProvider partnerId={partnerId}>
                    <AdminReturnDetailView
                        detail={{ request: currentReq }}
                        onBack={closeEntity}
                        initialMode="edit"
                    />
                </StoreProvider>
            </PermissionProvider>
        );
    }

    return (
        <>
            <FadeIn className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300">
                <div className="mx-auto w-full pt-4 flex flex-col h-full overflow-hidden relative">

                    {/* Desktop Header */}
                    <div className="hidden md:flex items-start justify-between mb-6 flex-none px-4 md:px-8">
                        <div className="flex flex-col gap-2 pt-1">
                            <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                                Trocas e devoluções
                            </h1>
                            <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                                Gerencie trocas, devoluções, créditos e reembolsos de todas as lojas.
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

                    {/* Tabs */}
                    <div className="mb-6 px-4 md:px-8">
                        <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as ActiveTab)}>
                            <TabsList className="px-0">
                                <TabsTrigger value="Todos" icon={RotateIcon} badge={<TabCountBadge count={stats?.total ?? 0} variant="gray" />}>
                                    Todos
                                </TabsTrigger>
                                <TabsTrigger value="Pendentes" icon={ClockIcon} badge={<TabCountBadge count={stats?.pending ?? 0} variant="yellow" />}>
                                    Pendentes
                                </TabsTrigger>
                                <TabsTrigger value="Analise" icon={AlertCircleIcon} badge={<TabCountBadge count={requests.filter((r) => ["UNDER_ANALYSIS", "ESCALATED"].includes(r.status)).length} variant="blue" />}>
                                    Análise
                                </TabsTrigger>
                                <TabsTrigger value="AguardandoCliente" icon={ClockIcon} badge={<TabCountBadge count={requests.filter((r) => r.status === "WAITING_CUSTOMER").length} variant="orange" />}>
                                    Aguardando cliente
                                </TabsTrigger>
                                <TabsTrigger value="Aprovados" icon={CheckCircleIcon} badge={<TabCountBadge count={stats?.approved ?? 0} variant="green" />}>
                                    Aprovados
                                </TabsTrigger>
                                <TabsTrigger value="Finalizados" icon={CheckCircleIcon} badge={<TabCountBadge count={stats?.completed ?? 0} variant="gray" />}>
                                    Finalizados
                                </TabsTrigger>
                            </TabsList>
                        </Tabs>
                    </div>

                    {/* Page Controls */}
                    <ReturnPageControls
                        search={search}
                        onSearchChange={handleSearchChange}
                        onOpenFilter={() => setIsFilterSheetOpen(true)}
                        viewMode={effectiveViewMode}
                        onViewModeChange={setViewModeState}
                        onExport={() => toast.success("Exportação iniciada em segundo plano")}
                    />

                    {/* List/Grid Content */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar px-4 md:px-8 pb-24 lg:pb-6 relative">
                        <AnimatePresence mode="wait">
                            {isFetchingNextPage && requests.length === 0 ? (
                                <div className="h-[400px] flex items-center justify-center">
                                    <ThreeDotsLoader />
                                </div>
                            ) : paginatedReturns.length === 0 ? (
                                <FadeIn key="empty" className="flex flex-col items-center justify-center h-[500px] text-center p-8 w-full">
                                    <IconPlaceholder
                                        placeholderType="image"
                                        imageSrc={hasActiveFilters
                                            ? "https://img.dudit.com.br/static/mascots/NaoEncontrado.png"
                                            : "https://img.dudit.com.br/static/mascots/Devolucoes.png"}
                                        imageAlt="Sem devoluções"
                                        title={hasActiveFilters ? "Nenhuma solicitação encontrada" : "Nenhuma solicitação cadastrada"}
                                        subtitle={hasActiveFilters ? "Ajuste a busca para encontrar o que procura." : "Nenhuma solicitação de troca ou devolução nesta categoria."}
                                        itemButton={hasActiveFilters ? {
                                            text: "Limpar filtros",
                                            action: handleClearFilters,
                                            variant: "outline",
                                        } : undefined}
                                    />
                                </FadeIn>
                            ) : effectiveViewMode === "grid" ? (
                                <FadeIn key="grid" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-4">
                                    {paginatedReturns.map((item) => (
                                        <ReturnGridCard
                                            key={item.id}
                                            returnRequest={item}
                                            onDetails={() => handleViewDetail(item.id)}
                                            onEdit={() => handleEdit(item.id)}
                                            canManage={true}
                                            canEditLocked={true}
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
                                                        const sortable = col.id !== "actions";
                                                        const sorted = sortConfig?.key === col.id;
                                                        return (
                                                            <th
                                                                key={col.id}
                                                                style={{ width: col.width }}
                                                                className={cn(
                                                                    "py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50",
                                                                    idx === 0 ? "rounded-l-lg pl-4" : "",
                                                                    idx === COLUMNS.length - 1 ? "rounded-r-lg pr-4" : "",
                                                                    sortable ? "cursor-pointer group" : ""
                                                                )}
                                                                onClick={() => {
                                                                    if (!sortable) return;
                                                                    setSortConfig((prev) => ({
                                                                        key: col.id as SortKey,
                                                                        direction: prev?.key === col.id && prev.direction === "asc" ? "desc" : "asc",
                                                                    }));
                                                                }}
                                                            >
                                                                <span>{col.label}</span>
                                                                {sorted ? null : null}
                                                            </th>
                                                        );
                                                    })}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-brand-border dark:divide-dark-border">
                                                {paginatedReturns.map((item) => (
                                                    <ReturnListRow
                                                        key={item.id}
                                                        returnRequest={item}
                                                        columns={COLUMNS}
                                                        onDetails={() => handleViewDetail(item.id)}
                                                        onEdit={() => handleEdit(item.id)}
                                                        canManage={true}
                                                        canEditLocked={true}
                                                    />
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </FadeIn>
                            )}
                        </AnimatePresence>

                        {filteredReturns.length > 0 && (
                            <Pagination currentPage={page} totalPages={totalPages} onPageChange={(p) => setPage(p)} fixedUntil="lg" />
                        )}
                    </div>
                </div>
            </FadeIn>

            <FilterSheet
                isOpen={isFilterSheetOpen}
                onClose={() => setIsFilterSheetOpen(false)}
                sections={filterSections}
                filters={filters}
                setFilters={setFilters}
                onClear={() => {
                    setFilters(INITIAL_FILTERS);
                    setIsFilterSheetOpen(false);
                }}
            />
        </>
    );
}