"use client"

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';

import {
    PlusIcon,
    ArrowUpDownIcon,
    ExportFileIcon,
    RotateIcon,
    Package
} from '@/lib/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { Button, Checkbox, IconPlaceholder, Input, Badge, AlertModal } from '@/components/reusable';
import FilterSheet, { FilterSectionConfig } from "@/components/reusable/FilterSheet";
import Pagination from "@/components/reusable/Pagination";
import FloatingActionBar from "@/components/reusable/FloatingActionBar";
import CreateStockMovement from './CreateStockMovement';
import StockMovementDetailPage from './StockMovementDetailPage';
import StockMovementPageControls from './StockMovementPageControls';
import StockMovementListItem from './StockMovementListItem';
import StockMovementGridCard from './StockMovementGridCard';
import { undoStockMovementAction, undoBatchStockMovementsAction, getStockMovementDetails, getERPStockMovementsPageAction, type ERPStockMovementListCursor } from '@/app/actions/erp/stock-movements';
import { useNotification } from '@/hooks/use-notification';
import { useMediaQuery } from '@/components/erp/hooks';
import { FadeIn } from '@/components/animations/FadeIn';
import { useInfiniteList } from '@/hooks/use-infinite-list';
import { useInfiniteScrollObserver } from '@/hooks/use-infinite-scroll-observer';
import {
    EMPTY_DATE_PERIOD,
    resolveDatePeriodBounds,
    ymdInBounds,
    msToBrazilYmd,
    isDatePeriodFilterActive,
    type DatePeriodFilterValue,
} from '@/lib/utils/filter-date-period';

interface StockMovementPageProps {
    partnerId: string;
    movements: any[];
    initialNextCursor: ERPStockMovementListCursor | null;
    initialHasMore: boolean;
}

type TabType = 'all' | 'in' | 'out';
type SortKey = 'movement' | 'reason' | 'reference' | 'date' | 'type';
type SortDirection = 'asc' | 'desc';

const ITEMS_PER_PAGE = 8;

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
    'sale': 'Venda',
    'return': 'Devolução',
    'adjustment': 'Ajuste',
    'purchase': 'Compra',
    'damaged': 'Avaria',
    'lost': 'Perda',
};

const StockMovementPageContent = ({ partnerId, movements: initialMovements, initialNextCursor, initialHasMore }: StockMovementPageProps) => {
    const { error: notifyError, success: notifySuccess } = useNotification();
    const isMobile = useMediaQuery("(max-width: 768px)");

    // State
    const [isCreating, setIsCreating] = useState(false);
    const [selectedMovementId, setSelectedMovementId] = useState<string | null>(null);
    const [detailedMovement, setDetailedMovement] = useState<any | null>(null);
    const [isDetailLoading, setIsDetailLoading] = useState(false);

    const [activeTab, setActiveTab] = useState<TabType>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [page, setPage] = useState(1);
    const [viewMode, setViewModeState] = useState<'grid' | 'list'>(isMobile ? 'grid' : 'list');
    const [filters, setFilters] = useState<{
        movement_type: string[];
        datePeriod: DatePeriodFilterValue;
    }>({
        movement_type: [],
        datePeriod: { ...EMPTY_DATE_PERIOD },
    });
    const [modals, setModals] = useState({
        filter: false,
        undo: false,
        bulkUndo: false,
    });
    const [undoingId, setUndoingId] = useState<string | null>(null);
    const [undoReason, setUndoReason] = useState('');
    const [isUndoing, setIsUndoing] = useState(false);
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>(null);

    // Selection state
    const [selection, setSelection] = useState({ ids: new Set<string>() });

    const tableContainerRef = useRef<HTMLDivElement>(null);
    const [scrollState, setScrollState] = useState({ left: false, right: false });

    const observerTarget = useRef<HTMLDivElement>(null);
    const queryKey = useMemo(() => ['erp', 'stock-movements', partnerId] as const, [partnerId]);
    const { items: loadedMovements, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteList<any, ERPStockMovementListCursor>({
        queryKey,
        initialPage: { items: initialMovements, nextCursor: initialNextCursor, hasMore: initialHasMore },
        fetchFn: async ({ cursor }) => {
            const res = await getERPStockMovementsPageAction(partnerId, { cursor, limit: 100 })
            if (!res.success) throw new Error(res.error || 'Erro ao carregar movimentações.')
            return { items: res.items, nextCursor: res.nextCursor, hasMore: res.hasMore }
        },
        dedupeKey: (m) => String(m?.id || ''),
    });

    const checkScroll = useCallback(() => {
        if (!tableContainerRef.current) return;
        const { scrollLeft, scrollWidth, clientWidth } = tableContainerRef.current;
        setScrollState({
            left: scrollLeft > 0,
            right: scrollLeft < scrollWidth - clientWidth - 2,
        });
    }, []);

    useEffect(() => {
        checkScroll();
        window.addEventListener("resize", checkScroll);
        return () => window.removeEventListener("resize", checkScroll);
    }, [checkScroll, viewMode, initialMovements]);

    const filterSections: FilterSectionConfig[] = [
        { id: "datePeriod", title: "Data da movimentação", type: "date-period" },
        {
            id: "movement_type",
            title: "Tipo de Movimentação",
            type: "checkbox-list",
            options: ["Venda", "Devolução", "Ajuste", "Compra", "Avaria", "Perda"],
        },
    ];

    const hasActiveFilters =
        filters.movement_type.length > 0 || isDatePeriodFilterActive(filters.datePeriod);
    const isFiltered = searchTerm !== "" || hasActiveFilters;

    const handleViewDetails = async (id: string) => {
        setSelectedMovementId(id);
        setDetailedMovement(null);
        setIsDetailLoading(true);
        try {
            const res = await getStockMovementDetails(id);
            if (res.success) {
                setDetailedMovement(res.data);
            } else {
                notifyError(res.error || "Erro ao carregar detalhes");
            }
        } catch (err) {
            notifyError("Erro de conexão ao carregar detalhes");
        } finally {
            setIsDetailLoading(false);
        }
    };

    const handleUndoClick = (id: string) => {
        setUndoingId(id);
        setUndoReason('');
        setModals(prev => ({ ...prev, undo: true }));
    };

    const confirmUndo = async () => {
        if (!undoingId) return;
        setIsUndoing(true);
        try {
            const res = await undoStockMovementAction(undoingId, undoReason);
            if (res.success) {
                notifySuccess('Movimentação desfeita com sucesso.');
            } else {
                notifyError(res.error || 'Erro ao desfazer.');
            }
        } catch (err) {
            notifyError('Erro de conexão.');
        } finally {
            setIsUndoing(false);
            setModals(prev => ({ ...prev, undo: false }));
            setUndoingId(null);
        }
    };

    const confirmBulkUndo = async () => {
        const ids = Array.from(selection.ids);
        if (ids.length === 0) return;
        setIsUndoing(true);
        try {
            const res = await undoBatchStockMovementsAction(ids, undoReason);
            if (res.success) {
                notifySuccess(`${ids.length} movimentações desfeitas com sucesso.`);
                setSelection({ ids: new Set() });
            } else {
                notifyError(res.error || 'Erro ao desfazer movimentações.');
            }
        } catch (err) {
            notifyError('Erro de conexão.');
        } finally {
            setIsUndoing(false);
            setModals(prev => ({ ...prev, bulkUndo: false }));
            setUndoReason('');
        }
    };

    const handleSelectRow = (id: string) => {
        setSelection(prev => {
            const s = new Set(prev.ids);
            s.has(id) ? s.delete(id) : s.add(id);
            return { ids: s };
        });
    };

    const handleTabChange = (tab: TabType) => {
        setActiveTab(tab);
        setPage(1);
    };

    const formattedMovements = useMemo(() => {
        return (loadedMovements || []).map(mov => {
            const dateObj = new Date(mov.created_at);
            let reason = mov.reason || MOVEMENT_TYPE_LABELS[mov.movement_type] || mov.movement_type;
            const orderReference = mov.order_id && mov.orders?.order_number
                ? `Pedido #${mov.orders.order_number}`
                : null;
            if (!mov.reason && mov.order_id && mov.orders?.order_number) {
                reason += ` (Pedido #${mov.orders.order_number})`;
            } else if (!mov.reason && mov.reference_name) {
                reason += ` (${mov.reference_name})`;
            }

            // Count items from child records or fallback to 1
            const items_count = mov.stock_movement_items?.length || 1;

            // Extract searchable content from child items
            const childProductNames = mov.stock_movement_items?.map((i: any) => i.products?.name).join(' ') || '';
            const childProductSkus = mov.stock_movement_items?.map((i: any) => i.products?.sku).join(' ') || '';

            // Calculate total quantity from child items
            const totalQuantity = mov.stock_movement_items?.reduce((sum: number, i: any) => sum + Math.abs(i.quantity), 0) || 0;

            return {
                id: mov.id,
                displayId: `${mov.id.split('-')[0].toUpperCase()}-${mov.id.slice(-4).toUpperCase()}`,
                date: `${dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}, ${dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
                rawDate: dateObj.getTime(),
                items_count,
                childProductNames,
                childProductSkus,
                type: mov.movement_type as 'in' | 'out',
                quantity: totalQuantity,
                reason,
                user: mov.created_by ? mov.created_by.split('@')[0] : 'Sistema',
                reference: orderReference || mov.reference_name || mov.reference_type || "-",
                notes: mov.notes || '',
            };
        });
    }, [loadedMovements]);

    const filteredMovements = useMemo(() => {
        const { startYmd, endYmd } = resolveDatePeriodBounds(filters.datePeriod);
        const dateBoundsActive = startYmd !== null || endYmd !== null;

        let result = activeTab !== 'all'
            ? formattedMovements.filter(mov => mov.type === activeTab)
            : formattedMovements;

        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            result = result.filter(mov =>
                mov.childProductNames.toLowerCase().includes(lower) ||
                mov.childProductSkus.toLowerCase().includes(lower) ||
                mov.reason.toLowerCase().includes(lower) ||
                mov.displayId.toLowerCase().includes(lower)
            );
        }

        if (filters.movement_type.length > 0) {
            result = result.filter(mov => filters.movement_type.some(f => mov.reason.includes(f)));
        }

        if (dateBoundsActive) {
            result = result.filter(mov =>
                ymdInBounds(msToBrazilYmd(mov.rawDate), startYmd, endYmd),
            );
        }

        if (sortConfig) {
            result = [...result].sort((a: any, b: any) => {
                let aVal: any;
                let bVal: any;

                switch (sortConfig.key) {
                    case 'movement':
                        aVal = a.displayId;
                        bVal = b.displayId;
                        break;
                    case 'date':
                        aVal = a.rawDate;
                        bVal = b.rawDate;
                        break;
                    default:
                        aVal = a[sortConfig.key];
                        bVal = b[sortConfig.key];
                }

                if (aVal === bVal) return 0;
                const comparison = aVal < bVal ? -1 : 1;
                return sortConfig.direction === 'asc' ? comparison : -comparison;
            });
        }

        return result;
    }, [formattedMovements, activeTab, searchTerm, sortConfig, filters]);

    const totalPages = Math.ceil(filteredMovements.length / ITEMS_PER_PAGE) || 1;
    const paginatedMovements = filteredMovements.slice(
        (page - 1) * ITEMS_PER_PAGE,
        page * ITEMS_PER_PAGE
    );

    useInfiniteScrollObserver(observerTarget, {
        enabled: true,
        hasNextPage: !!hasNextPage,
        isFetchingNextPage,
        fetchNextPage: () => fetchNextPage(),
        rootMargin: "320px",
        threshold: 0,
    });

    useEffect(() => {
        if (page === totalPages && hasNextPage && !isFetchingNextPage) {
            void fetchNextPage()
        }
    }, [page, totalPages, hasNextPage, isFetchingNextPage, fetchNextPage]);

    const handleClearFilters = () => {
        setSearchTerm("");
        setFilters({ movement_type: [], datePeriod: { ...EMPTY_DATE_PERIOD } });
    };

    const columns: { id: string; label: string; align: "left" | "center" | "right"; width?: string }[] = [
        { id: "movement", label: "Movimentação", align: "left", width: "200px" },
        { id: "reason", label: "Motivo", align: "left" },
        { id: "reference", label: "Referência", align: "left" },
        { id: "date", label: "Data", align: "left", width: "160px" },
        { id: "type", label: "Tipo", align: "center", width: "160px" },
        { id: "actions", label: "Ações", align: "center", width: "80px" },
    ];

    if (isCreating) {
        return (
            <CreateStockMovement
                onBack={() => setIsCreating(false)}
                onSuccess={() => { setIsCreating(false); }}
            />
        );
    }

    if (selectedMovementId) {
        const localData = formattedMovements.find(m => m.id === selectedMovementId) || null;
        const detailsReady = detailedMovement?.id === selectedMovementId;
        const movementToShow = isDetailLoading
            ? null
            : (detailsReady ? detailedMovement : localData);

        return (
            <StockMovementDetailPage
                movement={movementToShow}
                isLoading={isDetailLoading}
                onBack={() => {
                    setSelectedMovementId(null);
                    setDetailedMovement(null);
                }}
            />
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300"
        >
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
                <div className="hidden md:flex items-start justify-between mb-6 flex-none px-4 md:px-8">
                    <div className="flex flex-col gap-2 pt-1">
                        <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                            Movimentação de Estoque
                        </h1>
                        <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                            Gerencie as entradas e saídas do seu inventário.
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <Button variant="outline" onClick={() => { }}>
                            <ExportFileIcon className="w-[18px] h-[18px]" /> Exportar
                        </Button>

                        <Button onClick={() => setIsCreating(true)}>
                            <PlusIcon className="w-[18px] h-[18px]" strokeWidth={3} />
                            Nova Movimentação
                        </Button>
                    </div>
                </div>

                <StockMovementPageControls
                    activeTab={activeTab}
                    setActiveTab={handleTabChange}
                    search={searchTerm}
                    onSearchChange={setSearchTerm}
                    onOpenFilter={() => setModals(prev => ({ ...prev, filter: true }))}
                    onExport={() => { }}
                    onAddMovement={() => setIsCreating(true)}
                    filters={filters}
                    setFilters={setFilters}
                    viewMode={viewMode}
                    onViewModeChange={setViewModeState}
                    hasActiveFilters={hasActiveFilters}
                />

                <div className="flex-1 overflow-y-auto custom-scrollbar relative pb-20 md:pb-2 px-4 md:px-8">
                    <AnimatePresence mode="wait">
                        {paginatedMovements.length === 0 ? (
                            <motion.div
                                key="empty"
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                transition={{ duration: 0.4, ease: "easeOut" }}
                                className="flex flex-col items-center justify-center h-[600px] text-center p-8 w-full"
                            >
                                <IconPlaceholder
                                    placeholderType="image"
                                    imageSrc={isFiltered ? "https://img.dudit.com.br/static/mascots/NaoEncontrado.png" : "https://img.dudit.com.br/static/mascots/MovimentacaoEstoque.png"}
                                    imageAlt="Sem movimentações"
                                    title={isFiltered ? "Nenhuma movimentação encontrada" : "Sem movimentações"}
                                    subtitle={isFiltered ? "Tente ajustar seus filtros ou termos de busca." : "Sua história de movimentações aparecerá aqui."}
                                    itemButton={!isFiltered ? {
                                        text: "Nova Movimentação",
                                        action: () => setIsCreating(true),
                                    } : {
                                        text: "Limpar Filtros",
                                        action: handleClearFilters,
                                        variant: "outline"
                                    }}
                                />
                            </motion.div>
                        ) : (
                            <motion.div
                                key={viewMode}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300"
                            >
                                {isMobile ? (
                                    <div className="flex flex-col border-b border-brand-border dark:border-dark-border">
                                        {paginatedMovements.map((mov) => (
                                            <div
                                                key={mov.id}
                                                className="py-5 flex items-start gap-4 border-b border-gray-50 dark:border-dark-border/50 last:border-none"
                                                onClick={() => handleViewDetails(mov.id)}
                                            >
                                                <div className="w-14 h-14 rounded-full bg-brand-gray dark:bg-dark-border border border-brand-border dark:border-dark-border shrink-0 flex items-center justify-center">
                                                    <Package className="w-6 h-6 text-brand-inactive-text dark:text-dark-body" />
                                                </div>

                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between items-start mb-0.5">
                                                        <h3 className="font-bold text-[16px] text-brand-dark dark:text-dark-heading truncate pr-2">{mov.displayId}</h3>
                                                        <Badge variant={mov.type === 'in' ? 'green' : 'red'}>
                                                            {mov.type === 'in' ? 'Entrada' : 'Saída'}
                                                        </Badge>
                                                    </div>
                                                    <div className="flex items-center text-sm text-brand-inactive-text dark:text-dark-body font-medium truncate mb-2">
                                                        {mov.items_count} {mov.items_count === 1 ? 'item' : 'itens'} • {mov.reason}
                                                    </div>
                                                    <div className="flex items-center gap-2 text-md">
                                                        <span className="text-brand-inactive-text dark:text-dark-body font-medium">{mov.date.split(',')[0]}</span>
                                                        <div className="flex-none ml-auto -mb-1" onClick={(e) => e.stopPropagation()}>
                                                            <Checkbox checked={selection.ids.has(mov.id)} onChange={() => handleSelectRow(mov.id)} />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : viewMode === 'grid' ? (
                                    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-4">
                                        {paginatedMovements.map((mov) => (
                                            <StockMovementGridCard
                                                key={mov.id}
                                                movement={mov}
                                                selected={selection.ids.has(mov.id)}
                                                onSelect={handleSelectRow}
                                                onUndo={handleUndoClick}
                                                onDetails={handleViewDetails}
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    <div className="w-full overflow-hidden rounded-xl relative">
                                        <div className={`absolute top-0 left-0 h-full w-12 bg-gradient-to-r from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.left ? "opacity-100" : "opacity-0"}`} />
                                        <div className={`absolute top-0 right-0 h-full w-12 bg-gradient-to-l from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.right ? "opacity-100" : "opacity-0"}`} />

                                        <div className="overflow-x-auto pb-4 custom-scrollbar" ref={tableContainerRef} onScroll={checkScroll}>
                                            <table className="w-full text-left border-separate border-spacing-0 min-w-[1200px]">
                                                <thead>
                                                    <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                        <th className="py-3 px-2 w-12 pl-6 rounded-l-lg bg-brand-gray dark:bg-dark-border/50">
                                                            <div className="flex items-center">
                                                                <Checkbox
                                                                    checked={selection.ids.size === paginatedMovements.length && paginatedMovements.length > 0}
                                                                    onChange={(checked) => {
                                                                        setSelection({ ids: checked ? new Set(paginatedMovements.map(x => x.id)) : new Set() })
                                                                    }}
                                                                    className="bg-white dark:bg-dark-background"
                                                                />
                                                            </div>
                                                        </th>
                                                        {columns.map((col, idx) => {
                                                            const isSortable = col.id !== 'actions';
                                                            const isSorted = sortConfig?.key === col.id;
                                                            const isLast = idx === columns.length - 1;

                                                            return (
                                                                <th
                                                                    key={col.id}
                                                                    className={`py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'} ${isSortable ? 'cursor-pointer hover:text-gray-900 dark:hover:text-dark-heading group select-none transition-colors' : ''} ${isLast ? 'rounded-r-lg' : ''}`}
                                                                    style={{ width: col.width }}
                                                                    onClick={() => {
                                                                        if (!isSortable) return;
                                                                        setSortConfig(prev => ({
                                                                            key: col.id as SortKey,
                                                                            direction: prev?.key === col.id && prev.direction === 'asc' ? 'desc' : 'asc'
                                                                        }));
                                                                    }}
                                                                >
                                                                    <div className={`relative flex items-center ${col.align === 'right' ? 'justify-end' : col.align === 'center' ? 'justify-center' : 'justify-start'}`}>
                                                                        <span>{col.label}</span>
                                                                        {isSortable && (
                                                                            <div className={`flex items-center ${col.align === "center" ? "absolute -right-5" : "ml-1.5"}`}>
                                                                                <ArrowUpDownIcon
                                                                                    size={14}
                                                                                    className={`transition-all duration-200 ${isSorted ? 'text-brand-dark dark:text-dark-heading opacity-100 block' : 'text-brand-inactive-text hidden group-hover:block opacity-40'
                                                                                        } ${isSorted && sortConfig.direction === 'desc' ? 'rotate-180' : ''}`}
                                                                                />
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </th>
                                                            );
                                                        })}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {paginatedMovements.map((mov) => (
                                                        <StockMovementListItem
                                                            key={mov.id}
                                                            movement={mov}
                                                            columns={columns}
                                                            selected={selection.ids.has(mov.id)}
                                                            onSelect={handleSelectRow}
                                                            onUndo={handleUndoClick}
                                                            onDetails={handleViewDetails}
                                                        />
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                    {hasNextPage ? <div ref={observerTarget} className="h-12 w-full shrink-0" aria-hidden /> : null}
                </div>

                {filteredMovements.length > 0 && (
                    <Pagination
                        currentPage={page}
                        totalPages={totalPages}
                        onPageChange={(p) => {
                            setPage(p)
                            if (p === totalPages && hasNextPage && !isFetchingNextPage) {
                                void fetchNextPage()
                            }
                        }}
                    />
                )}
                {hasNextPage && page === totalPages && isFetchingNextPage ? (
                    <div className="flex flex-col gap-2 py-2 px-4">
                        <div className="h-10 w-full max-w-lg mx-auto rounded-lg bg-gray-100 dark:bg-dark-border/30 animate-pulse" />
                        <div className="h-10 w-full max-w-lg mx-auto rounded-lg bg-gray-100 dark:bg-dark-border/30 animate-pulse opacity-70" />
                    </div>
                ) : null}
            </div>

            <FilterSheet
                isOpen={modals.filter}
                onClose={() => setModals(prev => ({ ...prev, filter: false }))}
                sections={filterSections}
                filters={filters}
                setFilters={setFilters as any}
                onClear={() => setFilters({ movement_type: [], datePeriod: { ...EMPTY_DATE_PERIOD } })}
            />

            {/* Single undo modal */}
            <AlertModal
                isOpen={modals.undo}
                onClose={() => setModals(prev => ({ ...prev, undo: false }))}
                onConfirm={confirmUndo}
                title="Desfazer movimentação?"
                message={
                    <div className="flex flex-col gap-4 mt-2 text-left">
                        <p className="text-sm text-brand-inactive-text dark:text-dark-body">Esta ação criará uma movimentação inversa para estornar o estoque. Deseja continuar?</p>
                        <Input
                            label="Motivo do estorno (opcional)"
                            placeholder="Ex: Erro de preenchimento"
                            value={undoReason}
                            onChange={(e) => setUndoReason(e.target.value)}
                        />
                    </div>
                }
                confirmText={isUndoing ? "Desfazendo..." : "Desfazer"}
                variant="warning"
                isLoading={isUndoing}
            />

            {/* Bulk undo modal */}
            <AlertModal
                isOpen={modals.bulkUndo}
                onClose={() => setModals(prev => ({ ...prev, bulkUndo: false }))}
                onConfirm={confirmBulkUndo}
                title="Desfazer movimentações?"
                message={
                    <div className="flex flex-col gap-4 mt-2 text-left">
                        <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                            Esta ação criará movimentações inversas para estornar {selection.ids.size} movimentações selecionadas. Deseja continuar?
                        </p>
                        <Input
                            label="Motivo do estorno (opcional)"
                            placeholder="Ex: Erro de preenchimento"
                            value={undoReason}
                            onChange={(e) => setUndoReason(e.target.value)}
                        />
                    </div>
                }
                confirmText={isUndoing ? "Desfazendo..." : "Desfazer Todos"}
                variant="warning"
                isLoading={isUndoing}
            />

            {/* Floating Action Bar */}
            <FloatingActionBar
                selectedCount={selection.ids.size}
                onClearSelection={() => setSelection({ ids: new Set() })}
            >
                <Button
                    variant="ghost"
                    onClick={() => {
                        setUndoReason('');
                        setModals(prev => ({ ...prev, bulkUndo: true }));
                    }}
                    leftIcon={<RotateIcon className="w-4 h-4" />}
                    className="h-10 px-3 text-brand-dark dark:text-dark-heading hover:bg-brand-gray dark:hover:bg-dark-surface"
                >
                    Desfazer
                </Button>
            </FloatingActionBar>
        </motion.div >
    );
};

export default StockMovementPageContent;
