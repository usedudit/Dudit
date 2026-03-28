"use client"

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
    ChevronDownIcon,
    PlusIcon,
    MoreHorizontalIcon,
    ChevronUpIcon,
    FileIcon,
    FilterIcon,
    ListIcon,
    BoxIcon,
    TrendUpIcon,
    TrendDownIcon,
    TransferIcon,
    EyeIcon,
    TrashIcon
} from '@/lib/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { Button, Checkbox, IconPlaceholder, Input } from '@/components/reusable';
import { Badge } from '@/components/reusable/Badge';
import Dropdown from '@/components/reusable/Dropdown';
import { DropdownItem } from '@/components/reusable/Dropdown';
import FilterSheet, { FilterSectionConfig } from "@/components/reusable/FilterSheet";
import Pagination from "@/components/reusable/Pagination";
import CreateStockMovement from './CreateStockMovement';
import StockMovementDetailPage from './StockMovementDetailPage';
import StockMovementPageControls from './StockMovementPageControls';
import { getR2ImageUrl } from '@/lib/utils/get-r2-image-url';
import { getStockMovementDetails } from '@/app/actions/erp/stock-movements';
import { useNotification } from '@/hooks/use-notification';
import { useMediaQuery } from '@/components/erp/hooks';
import { useStoreData } from "@/lib/use-store-data";

interface StockMovementPageProps {
    partnerId: string;
    movements: any[];
}

type TabType = 'all' | 'in' | 'out';
type SortKey = 'product' | 'quantity' | 'date' | 'displayId';
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

const StockMovementPageContent = ({ partnerId, movements: initialMovements }: StockMovementPageProps) => {
    const router = useRouter();
    const { error: notifyError } = useNotification();
    const { selectedStore } = useStoreData(partnerId);
    const isMobile = useMediaQuery("(max-width: 768px)");

    // State
    const [isCreating, setIsCreating] = useState(false);
    const [selectedMovementId, setSelectedMovementId] = useState<string | null>(null);
    const [selectedMovementDetails, setSelectedMovementDetails] = useState<any | null>(null);
    const [isLoadingDetails, setIsLoadingDetails] = useState(false);

    const [activeTab, setActiveTab] = useState<TabType>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [page, setPage] = useState(1);
    const [viewMode, setViewModeState] = useState<'grid' | 'list'>(isMobile ? 'grid' : 'list');
    const [filters, setFilters] = useState({
        movement_type: [] as string[],
    });
    const [modals, setModals] = useState({
        filter: false,
    });
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>(null);
    const [selection, setSelection] = useState<Set<string>>(new Set());

    const tableContainerRef = useRef<HTMLDivElement>(null);
    const [scrollState, setScrollState] = useState({ left: false, right: false });

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
        {
            id: "movement_type",
            title: "Tipo de Movimentação",
            type: "checkbox-list",
            options: ["Venda", "Devolução", "Ajuste", "Compra", "Avaria", "Perda"],
        },
    ];

    const hasActiveFilters = filters.movement_type.length > 0;
    const isFiltered = searchTerm !== "" || hasActiveFilters;

    const handleViewDetails = async (id: string) => {
        setSelectedMovementId(id);
        setIsLoadingDetails(true);
        const res = await getStockMovementDetails(id);
        if (res.success) {
            setSelectedMovementDetails(res.data);
        } else {
            notifyError('Erro', res.error || 'Erro ao carregar os detalhes.');
            setSelectedMovementId(null);
        }
        setIsLoadingDetails(false);
    };

    const handleTabChange = (tab: TabType) => {
        setActiveTab(tab);
        setPage(1);
    };

    const formattedMovements = useMemo(() => {
        return (initialMovements || []).map(mov => {
            const dateObj = new Date(mov.created_at);
            let reason = MOVEMENT_TYPE_LABELS[mov.movement_type] || mov.movement_type;
            if (mov.order_id && mov.orders?.order_number) {
                reason += ` (Pedido #${mov.orders.order_number})`;
            } else if (mov.reference_name) {
                reason += ` (${mov.reference_name})`;
            }

            return {
                id: mov.id,
                displayId: `${mov.id.split('-')[0].toUpperCase()}-${mov.id.slice(-4).toUpperCase()}`,
                date: `${dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}, ${dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
                rawDate: dateObj.getTime(),
                product: {
                    name: mov.products?.name || 'Produto Excluído',
                    sku: mov.products?.sku || 'N/A',
                    image: (mov.products?.images && mov.products.images.length > 0)
                        ? getR2ImageUrl(mov.products.images[0], "thumbnail")
                        : 'https://img.dudit.com.br/static/Placeholder.png',
                    currentStock: mov.new_quantity,
                },
                type: (mov.quantity > 0 ? 'in' : 'out') as 'in' | 'out',
                quantity: Math.abs(mov.quantity),
                reason,
                user: mov.created_by ? mov.created_by.split('@')[0] : 'Sistema',
            };
        });
    }, [initialMovements]);

    const filteredMovements = useMemo(() => {
        let result = activeTab !== 'all'
            ? formattedMovements.filter(mov => mov.type === activeTab)
            : formattedMovements;

        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            result = result.filter(mov =>
                mov.product.name.toLowerCase().includes(lower) ||
                mov.product.sku.toLowerCase().includes(lower) ||
                mov.reason.toLowerCase().includes(lower) ||
                mov.displayId.toLowerCase().includes(lower)
            );
        }

        if (filters.movement_type.length > 0) {
            result = result.filter(mov => filters.movement_type.some(f => mov.reason.includes(f)));
        }

        if (sortConfig) {
            result = [...result].sort((a: any, b: any) => {
                const aVal = sortConfig.key === 'product' ? a.product.name
                    : sortConfig.key === 'date' ? a.rawDate
                        : a[sortConfig.key];
                const bVal = sortConfig.key === 'product' ? b.product.name
                    : sortConfig.key === 'date' ? b.rawDate
                        : b[sortConfig.key];
                if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return result;
    }, [formattedMovements, activeTab, searchTerm, sortConfig, filters]);

    const totalPages = Math.ceil(filteredMovements.length / ITEMS_PER_PAGE) || 1;
    const paginatedMovements = filteredMovements.slice(
        (page - 1) * ITEMS_PER_PAGE,
        page * ITEMS_PER_PAGE
    );

    const handleSelectRow = (id: string) => {
        setSelection(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleSelectAll = (checked: boolean) => {
        if (checked) setSelection(new Set(paginatedMovements.map(m => m.id)));
        else setSelection(new Set());
    };

    const handleClearFilters = () => {
        setSearchTerm("");
        setFilters({ movement_type: [] });
    };

    if (isCreating) {
        return (
            <CreateStockMovement
                onBack={() => setIsCreating(false)}
                onSuccess={() => { setIsCreating(false); }}
            />
        );
    }

    if (selectedMovementId) {
        return (
            <StockMovementDetailPage
                movement={selectedMovementDetails}
                isLoading={isLoadingDetails}
                onBack={() => { setSelectedMovementId(null); setSelectedMovementDetails(null); }}
            />
        );
    }

    return (
        <div className="flex flex-col h-full bg-white dark:bg-dark-background overflow-hidden transition-colors duration-300">
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
                            Gerencie as entradas e saídas de produtos do seu inventário.
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <Button variant="outline" onClick={() => { }}>
                            <FileIcon className="w-[18px] h-[18px]" /> Exportar
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
                    onOpenFilter={() => setModals({ filter: true })}
                    onExport={() => { }}
                    onAddMovement={() => setIsCreating(true)}
                    filters={filters}
                    setFilters={setFilters as any}
                    viewMode={viewMode}
                    onViewModeChange={setViewModeState}
                    hasActiveFilters={hasActiveFilters}
                />

                <div className="flex-1 overflow-y-auto custom-scrollbar relative pb-20 md:pb-8 px-4 md:px-8">
                    <AnimatePresence mode="wait">
                        {paginatedMovements.length === 0 ? (
                            <motion.div
                                key="empty"
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="flex-1 flex items-center justify-center h-[500px]"
                            >
                                <IconPlaceholder
                                    placeholderType="image"
                                    imageSrc={isFiltered ? "https://img.dudit.com.br/static/mascots/NaoEncontrado.png" : "https://img.dudit.com.br/static/mascots/MovimentacaoEstoque.png"}
                                    imageAlt="Sem movimentações"
                                    title={isFiltered ? "Nenhuma movimentação encontrada" : "Sem movimentações"}
                                    subtitle={isFiltered ? "Tente ajustar seus filtros ou termos de busca." : "Ainda não houve entradas ou saídas de estoque."}
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
                                                <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border/20 flex-shrink-0 overflow-hidden border border-brand-border dark:border-dark-border">
                                                    <img src={mov.product.image} alt="" className="w-full h-full object-cover rounded-full" />
                                                </div>

                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between items-start mb-0.5">
                                                        <h3 className="font-bold text-[16px] text-brand-dark dark:text-dark-heading truncate pr-2">{mov.product.name}</h3>
                                                        <Badge variant={mov.type === 'in' ? 'green' : 'red'}>
                                                            {mov.type === 'in' ? 'Entrada' : 'Saída'}
                                                        </Badge>
                                                    </div>
                                                    <div className="text-xs text-brand-inactive-text dark:text-dark-body font-medium mb-2">ID: {mov.displayId}</div>
                                                    <div className="flex items-center gap-2 text-[14px]">
                                                        <span className={`font-bold ${mov.type === 'in' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                                            {mov.type === 'in' ? '+' : '-'}{mov.quantity}
                                                        </span>
                                                        <span className="text-gray-300 dark:text-gray-600">•</span>
                                                        <span className="text-brand-inactive-text dark:text-dark-body font-medium">{mov.date.split(',')[0]}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : viewMode === 'grid' ? (
                                    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-4">
                                        {paginatedMovements.map((mov) => (
                                            <div
                                                key={mov.id}
                                                className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-[20px] p-5 transition-all duration-300 hover:shadow-xl hover:-translate-y-1 group relative flex flex-col h-full"
                                                onClick={() => handleViewDetails(mov.id)}
                                            >
                                                <div className="absolute top-4 right-4 z-10 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                                                    <Checkbox
                                                        checked={selection.has(mov.id)}
                                                        onChange={() => handleSelectRow(mov.id)}
                                                    />
                                                </div>

                                                <div className="flex gap-4 mb-5">
                                                    <div className="w-20 h-20 rounded-full bg-brand-gray dark:bg-dark-border/20 border border-brand-border dark:border-dark-border flex-shrink-0 overflow-hidden">
                                                        <img src={mov.product.image} alt="" className="w-full h-full object-cover rounded-full" />
                                                    </div>

                                                    <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
                                                        <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading leading-tight truncate">{mov.product.name}</h3>
                                                        <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">{mov.product.sku}</span>
                                                        <Badge variant={mov.type === 'in' ? 'green' : 'red'} className="w-max mt-1 px-2 py-0.5 text-[10px]">
                                                            {mov.type === 'in' ? 'Entrada' : 'Saída'}
                                                        </Badge>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 gap-4 mb-5 pt-4 border-t border-brand-border dark:border-dark-border mt-auto">
                                                    <div>
                                                        <span className="block text-[10px] text-brand-inactive-text dark:text-dark-body font-bold uppercase tracking-wider mb-1">Quantidade</span>
                                                        <span className={`text-[14px] font-bold ${mov.type === 'in' ? 'text-green-600' : 'text-red-600'}`}>
                                                            {mov.type === 'in' ? '+' : '-'}{mov.quantity}
                                                        </span>
                                                    </div>
                                                    <div>
                                                        <span className="block text-[10px] text-brand-inactive-text dark:text-dark-body font-bold uppercase tracking-wider mb-1">Estoque Final</span>
                                                        <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading">{mov.product.currentStock}</span>
                                                    </div>
                                                </div>

                                                <div className="flex items-center justify-between pt-2">
                                                    <div className="flex flex-col">
                                                        <span className="text-[10px] font-bold text-brand-inactive-text dark:text-dark-body uppercase">{mov.date.split(',')[0]}</span>
                                                        <span className="text-xs font-bold text-brand-dark dark:text-dark-heading">{mov.date.split(',')[1]}</span>
                                                    </div>

                                                    <Dropdown
                                                        trigger={
                                                            <Button variant="outline" size="icon" className="w-[38px] h-[38px] rounded-full border-brand-border hover:bg-gray-50" onClick={(e) => e.stopPropagation()}>
                                                                <MoreHorizontalIcon size={18} />
                                                            </Button>
                                                        }
                                                        align="right"
                                                        showChevron={false}
                                                        fullWidth={false}
                                                    >
                                                        <DropdownItem onClick={() => handleViewDetails(mov.id)}>
                                                            <EyeIcon size={16} /> Ver Detalhes
                                                        </DropdownItem>
                                                    </Dropdown>
                                                </div>
                                            </div>
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
                                                            <Checkbox
                                                                checked={selection.size === paginatedMovements.length && paginatedMovements.length > 0}
                                                                onChange={handleSelectAll}
                                                                className="bg-white dark:bg-dark-background"
                                                            />
                                                        </th>
                                                        <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50">ID</th>
                                                        <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50">Produto</th>
                                                        <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50">Tipo</th>
                                                        <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 text-right">Quantidade</th>
                                                        <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 text-right">Estoque Final</th>
                                                        <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50">Motivo</th>
                                                        <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50">Data</th>
                                                        <th className="py-3 px-4 w-[70px] text-center text-[13px] font-medium text-gray-500 dark:text-dark-body rounded-r-lg bg-brand-gray dark:bg-dark-border/50">Ações</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {paginatedMovements.map((mov) => (
                                                        <tr
                                                            key={mov.id}
                                                            className="group hover:bg-gray-50/80 dark:hover:bg-dark-border/5 transition-colors cursor-pointer"
                                                            onClick={() => handleViewDetails(mov.id)}
                                                        >
                                                            <td className="py-4 px-2 pl-6 border-b border-brand-border dark:border-dark-border" onClick={(e) => e.stopPropagation()}>
                                                                <Checkbox
                                                                    checked={selection.has(mov.id)}
                                                                    onChange={() => handleSelectRow(mov.id)}
                                                                />
                                                            </td>
                                                            <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border">
                                                                <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading">{mov.displayId}</span>
                                                            </td>
                                                            <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border/20 border border-brand-border dark:border-dark-border flex-shrink-0 overflow-hidden">
                                                                        <img src={mov.product.image} alt="" className="w-full h-full object-cover rounded-full" />
                                                                    </div>
                                                                    <div className="flex flex-col min-w-0">
                                                                        <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading leading-tight truncate max-w-[200px] mb-1">{mov.product.name}</span>
                                                                        <span className="text-[11px] text-brand-inactive-text dark:text-dark-body font-medium">{mov.product.sku}</span>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border">
                                                                <Badge variant={mov.type === 'in' ? 'green' : 'red'}>{mov.type === 'in' ? 'Entrada' : 'Saída'}</Badge>
                                                            </td>
                                                            <td className={`py-4 px-4 text-[13px] font-bold border-b border-brand-border dark:border-dark-border text-right ${mov.type === 'in' ? 'text-green-600' : 'text-red-600'}`}>
                                                                {mov.type === 'in' ? '+' : '-'}{mov.quantity}
                                                            </td>
                                                            <td className="py-4 px-4 text-[13px] font-bold text-brand-dark dark:text-dark-heading border-b border-brand-border dark:border-dark-border text-right">{mov.product.currentStock}</td>
                                                            <td className="py-4 px-4 text-[13px] font-medium text-brand-inactive-text dark:text-dark-body border-b border-brand-border dark:border-dark-border max-w-[200px] truncate">{mov.reason}</td>
                                                            <td className="py-4 px-4 text-[13px] border-b border-brand-border dark:border-dark-border">
                                                                <div className="flex flex-col">
                                                                    <span className="font-bold text-brand-dark dark:text-dark-heading">{mov.date.split(',')[0]}</span>
                                                                    <span className="text-[11px] text-brand-inactive-text dark:text-dark-body">{mov.date.split(',')[1]}</span>
                                                                </div>
                                                            </td>
                                                            <td className="py-4 px-4 text-center border-b border-brand-border dark:border-dark-border" onClick={(e) => e.stopPropagation()}>
                                                                <Dropdown
                                                                    trigger={
                                                                        <Button variant="outline" size="icon" className="w-[34px] h-[34px] rounded-full border-brand-border hover:bg-white" onClick={(e) => e.stopPropagation()}>
                                                                            <MoreHorizontalIcon size={16} />
                                                                        </Button>
                                                                    }
                                                                    align="right"
                                                                    showChevron={false}
                                                                    fullWidth={false}
                                                                >
                                                                    <DropdownItem onClick={() => handleViewDetails(mov.id)}>
                                                                        <EyeIcon size={14} /> Ver Detalhes
                                                                    </DropdownItem>
                                                                </Dropdown>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {filteredMovements.length > ITEMS_PER_PAGE && (
                    <div className="flex justify-center mb-8 mt-4">
                        <Pagination
                            currentPage={page}
                            totalPages={totalPages}
                            onPageChange={setPage}
                        />
                    </div>
                )}
            </div>

            <FilterSheet
                isOpen={modals.filter}
                onClose={() => setModals({ filter: false })}
                sections={filterSections}
                filters={filters}
                setFilters={setFilters as any}
                onClear={() => setFilters({ movement_type: [] })}
            />
        </div>
    );
};

export default StockMovementPageContent;