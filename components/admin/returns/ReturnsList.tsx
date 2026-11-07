"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Button, IconPlaceholder, Pagination, Tabs, TabsList, TabsTrigger, ThreeDotsLoader } from "@/components/reusable";
import FilterSheet, { FilterSectionConfig } from "@/components/reusable/FilterSheet";
import { FadeIn } from "@/components/animations/FadeIn";
import { ExportFileIcon, ReloadIcon, RotateIcon, AlertCircleIcon, CheckCircleIcon, ClockIcon } from "@/lib/icons";
import type { CursorPaginatedResult } from "@/lib/admin/types";
import { getAdminReturnRequests, getAdminReturnRequestsStats, type AdminReturnStats } from "@/app/actions/admin/marketplace-ops";
import { useMediaQuery } from "@/components/erp/hooks";
import { useEntityState } from "@/hooks/use-entity-state";
import { toast } from "@/hooks/use-notification";
import ReturnListRow, { getReturnStatusMeta } from "@/components/erp/returns/ReturnListRow";
import ReturnGridCard from "@/components/erp/returns/ReturnGridCard";
import ReturnPageControls from "@/components/erp/returns/ReturnPageControls";
import type { ReturnRequest } from "@/components/erp/returns/types";
import { getReturnResolutionLabel } from "@/lib/returns/types";
import { ReturnDetailView } from "@/components/erp/returns/ReturnDetailView";
import AdminReturnDetailClientWrapper from "./AdminReturnDetailClientWrapper";
import { PermissionProvider } from "@/lib/permission-context";
import { ROUTE_PERMISSION_PRESETS } from "@/lib/permissions/route-permissions";
import { StoreProvider } from "@/lib/store-context";
import { DashboardSectionCard } from "@/components/erp/dashboard/cards/DashboardSectionCard";
import { HorizontalKPICard } from "@/components/erp/dashboard/cards/HorizontalKPICard";
import { FormSection } from "@/components/reusable/FormSection";
import { Dropdown, DropdownItem } from "@/components/reusable/Dropdown";
import { ThreeDotsIcon, ChevronDownIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";

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
}

const INITIAL_FILTERS: FilterState = {
  status: [],
  resolutionType: [],
  reason: [],
  condition: [],
  refundRange: { min: "", max: "" },
  storeCreditRange: { min: "", max: "" },
  hasEvidence: false,
};

export default function ReturnsList({ initialData, initialStats }: ReturnsListProps) {
  const isMobile = useMediaQuery("(max-width: 767px)");
  const isTablet = useMediaQuery("(max-width: 1024px)");
  const { state: entityState, open: openEntity, close: closeEntity } = useEntityState();

  const [requests, setRequests] = useState<ReturnRequest[]>(
    ((initialData?.data || []) as ReturnRequest[]),
  );
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [activeTab, setActiveTab] = useState<ActiveTab>("Todos");
  const [viewMode, setViewModeState] = useState<"list" | "grid">(isMobile ? "grid" : "list");
  const effectiveViewMode = isTablet ? "grid" : viewMode;
  const [page, setPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>({
    key: "date",
    direction: "desc",
  });
  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);

  // Stats state
  const [stats, setStats] = useState<AdminReturnStats | null>(initialStats || null);

  const refreshRequests = useCallback(async () => {
    setIsLoading(true);
    try {
      const [res, statsRes] = await Promise.all([
        getAdminReturnRequests(null, 100),
        getAdminReturnRequestsStats().catch(() => null),
      ]);
      setRequests((res.data || []) as ReturnRequest[]);
      if (statsRes) setStats(statsRes);
    } catch (err) {
      console.error("Failed to refresh admin returns:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshRequests();
  }, [refreshRequests]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, activeTab, filters]);

  const filteredReturns = useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase();
    let result = requests.filter((item) => {
      const matchesSearch =
        !term ||
        item.orderNumber.toLowerCase().includes(term) ||
        item.customerName.toLowerCase().includes(term) ||
        String(item.storeName || "").toLowerCase().includes(term) ||
        `dvl-${item.id}`.toLowerCase().includes(term);

      let matchesTab = true;
      if (activeTab === "Pendentes") matchesTab = item.status === "PENDING_REVIEW";
      else if (activeTab === "Analise") matchesTab = ["UNDER_ANALYSIS", "ESCALATED"].includes(item.status);
      else if (activeTab === "AguardandoCliente") matchesTab = item.status === "WAITING_CUSTOMER";
      else if (activeTab === "Aprovados") matchesTab = ["APPROVED", "WAITING_ITEM_RETURN", "PROCESSING"].includes(item.status);
      else if (activeTab === "Finalizados") matchesTab = ["RESOLVED", "REJECTED", "EXPIRED"].includes(item.status);

      const statusLabel = getReturnStatusMeta(item.status).label;
      const statusMatch = filters.status.length === 0 || filters.status.includes(statusLabel);

      const resolutionLabel = getReturnResolutionLabel(item.approvedResolution || item.desiredResolution || "");
      const resolutionMatch = filters.resolutionType.length === 0 || filters.resolutionType.includes(resolutionLabel);

      const itemReason = item.items[0]?.reason || "";
      const reasonMatch = filters.reason.length === 0 || filters.reason.includes(itemReason);

      const itemCondition = item.items[0]?.condition || "";
      const conditionMatch = filters.condition.length === 0 || filters.condition.includes(itemCondition);

      const refundValue = Number(item.refundValue || 0);
      const minRefund = filters.refundRange.min ? Number(filters.refundRange.min) : 0;
      const maxRefund = filters.refundRange.max ? Number(filters.refundRange.max) : Number.POSITIVE_INFINITY;
      const refundMatch = refundValue >= minRefund && refundValue <= maxRefund;

      const storeCreditValue = Number(item.storeCreditValue || 0);
      const minCredit = filters.storeCreditRange.min ? Number(filters.storeCreditRange.min) : 0;
      const maxCredit = filters.storeCreditRange.max ? Number(filters.storeCreditRange.max) : Number.POSITIVE_INFINITY;
      const creditMatch = storeCreditValue >= minCredit && storeCreditValue <= maxCredit;

      const evidenceMatch = !filters.hasEvidence || (item.items[0]?.evidence?.length > 0);

      return matchesSearch && matchesTab && statusMatch && resolutionMatch && reasonMatch && conditionMatch && refundMatch && creditMatch && evidenceMatch;
    });

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
            break;
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
  }, [requests, debouncedSearch, activeTab, sortConfig, filters]);

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

    return sections;
  }, [requests]);

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
    filters.hasEvidence;

  const handleClearFilters = useCallback(() => {
    setSearch("");
    setFilters(INITIAL_FILTERS);
    setActiveTab("Todos");
  }, []);

  // View Detail (read-only) - same pattern as ERP orders
  const handleViewDetail = useCallback((requestId: string) => {
    openEntity("view", requestId);
  }, [openEntity]);

  // Edit - opens admin edit form
  const handleEdit = useCallback((requestId: string) => {
    openEntity("edit", requestId);
  }, [openEntity]);

  // Print - handled by detail view's own print button
  const handlePrint = useCallback(() => {
    // No-op, detail view has its own print button
  }, []);

  // If viewing detail (read-only)
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
        <StoreProvider
          partnerId={partnerId}
        >
          <ReturnDetailView
            orderId={entityState.entityId}
            onBack={closeEntity}
            onEdit={handleEdit}
            onPrint={handlePrint}
            initialRequest={currentReq}
            adminContext={true}
          />
        </StoreProvider>
      </PermissionProvider>
    );
  }

  // If editing - use admin edit form
  if (entityState.isOpen && entityState.action === "edit" && entityState.entityId) {
    return (
      <AdminReturnDetailClientWrapper
        returnId={entityState.entityId}
        onBack={closeEntity}
      />
    );
  }

  // KPI Items for HorizontalKPICard
  const kpiItems = useMemo(() => {
    if (!stats) return [];
    return [
      {
        title: "Total",
        value: stats.total.toLocaleString("pt-BR"),
        trend: "Todas as solicitações",
        subtext: "Cadastradas no sistema",
        icon: RotateIcon,
        iconBg: "bg-brand-green-light dark:bg-dark-border/40",
        iconColor: "text-brand-dark dark:text-dark-heading",
      },
      {
        title: "Pendentes",
        value: stats.pending.toLocaleString("pt-BR"),
        trend: "Aguardando análise",
        subtext: "Precisam de ação",
        icon: AlertCircleIcon,
        iconBg: "bg-yellow-100 dark:bg-yellow-900/30",
        iconColor: "text-yellow-600 dark:text-yellow-400",
      },
      {
        title: "Em Análise / Aprovados",
        value: stats.approved.toLocaleString("pt-BR"),
        trend: "Processando",
        subtext: "Aprovados ou aguardando item",
        icon: ClockIcon,
        iconBg: "bg-blue-100 dark:bg-blue-900/30",
        iconColor: "text-blue-600 dark:text-blue-400",
      },
      {
        title: "Finalizados",
        value: stats.completed.toLocaleString("pt-BR"),
        trend: stats.rejected > 0 ? `${stats.rejected} rejeitados` : "Concluídos",
        subtext: "Resolvidos ou expirados",
        icon: CheckCircleIcon,
        iconBg: "bg-green-100 dark:bg-green-900/30",
        iconColor: "text-green-600 dark:text-green-400",
      },
    ];
  }, [stats]);

  return (
    <>
      <FadeIn className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300">
        <div className="mx-auto w-full pt-4 flex flex-col h-full overflow-hidden relative">

          {/* Header Section - DashboardSectionCard + HorizontalKPICard */}
          <DashboardSectionCard
            title="Trocas e devoluções"
            action={
              <Dropdown
                trigger={
                  <Button variant="outline" size="icon" className="h-[42px] w-[42px] rounded-[12px] shrink-0" leftIcon={<ThreeDotsIcon size={20} />}>
                  </Button>
                }
                align="right"
                width="w-48"
                showChevron={false}
              >
                <DropdownItem onClick={refreshRequests} disabled={isLoading}>
                  <ReloadIcon size={16} /> Atualizar
                </DropdownItem>
                <DropdownItem onClick={() => toast.success("Exportação iniciada em segundo plano")}>
                  <ExportFileIcon size={16} /> Exportar
                </DropdownItem>
              </Dropdown>
            }
            className="mb-0"
          >
            <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
              Gerencie trocas, devoluções, créditos e reembolsos de todas as lojas.
            </p>
            {kpiItems.length > 0 && <HorizontalKPICard items={kpiItems} />}
          </DashboardSectionCard>

          {/* Tabs Section - DashboardSectionCard */}
          <DashboardSectionCard
            title="Filtros por Status"
            className="mb-0"
          >
            <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as ActiveTab)}>
              <TabsList className="grid w-full grid-cols-6">
                <TabsTrigger value="Todos">Todos</TabsTrigger>
                <TabsTrigger value="Pendentes">Pendentes</TabsTrigger>
                <TabsTrigger value="Analise">Análise</TabsTrigger>
                <TabsTrigger value="AguardandoCliente">Aguardando cliente</TabsTrigger>
                <TabsTrigger value="Aprovados">Aprovados</TabsTrigger>
                <TabsTrigger value="Finalizados">Finalizados</TabsTrigger>
              </TabsList>
            </Tabs>
          </DashboardSectionCard>

          {/* Controls Section - FormSection */}
          <FormSection hasSeparator>
            <ReturnPageControls
              search={search}
              onSearchChange={setSearch}
              onOpenFilter={() => setIsFilterSheetOpen(true)}
              viewMode={effectiveViewMode}
              onViewModeChange={setViewModeState}
              onExport={() => toast.success("Exportação iniciada em segundo plano")}
            />
          </FormSection>

          {/* List/Grid Content */}
          <div className="flex-1 overflow-y-auto custom-scrollbar relative pb-20 md:pb-2">
            <AnimatePresence mode="wait">
              {isLoading && requests.length === 0 ? (
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
                      <tbody>
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
              <div className="flex justify-center mt-4 pt-4 border-t border-brand-border/60 dark:border-dark-border/60">
                <Pagination currentPage={page} totalPages={totalPages} onPageChange={(p) => setPage(p)} inline />
              </div>
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