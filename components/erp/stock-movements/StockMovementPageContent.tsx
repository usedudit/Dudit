"use client"

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
    SearchIcon,
    ChevronDownIcon,
    PlusIcon,
    ArrowUpDownIcon,
    MoreHorizontalIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    DashboardIcon,
    ChevronUpIcon,
    FileIcon,
    FilterIcon,
    ListIcon,
    BoxIcon,
    ArrowDownIcon,
    ArrowUpIcon,
    TrendUpIcon,
    TrendDownIcon,
    TransferIcon
} from '@/lib/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { Button, Checkbox as FormCheckbox, IconPlaceholder, Input } from '@/components/reusable';
import { Badge } from '@/components/reusable/Badge';
import { Tabs, TabsList, TabsTrigger } from "@/components/reusable/Tabs";
import FilterSheet, { FilterSectionConfig } from "@/components/reusable/FilterSheet";
import Pagination from "@/components/reusable/Pagination";
import CreateStockMovement from './CreateStockMovement';
import StockMovementDetailPage from './StockMovementDetailPage';
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

const ITEMS_PER_PAGE = 10;

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
    'sale': 'Venda',
    'return': 'Devolução',
    'adjustment': 'Ajuste',
    'purchase': 'Compra',
    'damaged': 'Avaria',
    'lost': 'Perda',
};

const MovementTypeBadge = ({ type }: { type: 'in' | 'out' }) =>
    type === 'in' ? (
        <Badge variant="green" className="flex items-center gap-1 w-max">
            <ChevronDownIcon size={12} /> Entrada
        </Badge>
    ) : (
        <Badge variant="red" className="flex items-center gap-1 w-max">
            <ChevronUpIcon size={12} /> Saída
        </Badge>
    );

const StockMovementPageContent = ({ partnerId, movements: initialMovements }: StockMovementPageProps) => {
    const router = useRouter();
    const { error: notifyError } = useNotification();
    const { selectedStore } = useStoreData(partnerId);
    const isMobile = useMediaQuery("(max-width: 768px)");

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

    const filterSections: FilterSectionConfig[] = [
        {
            id: "movement_type",
            title: "Tipo de Movimentação",
            type: "checkbox-list",
            options: ["Venda", "Devolução", "Ajuste", "Compra", "Avaria", "Perda"],
        },
    ];

    const isFiltered = searchTerm !== "" || filters.movement_type.length > 0;

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
                    image: mov.products?.images?.length > 0
                        ? mov.products.images[0]
                        : 'https://img.dudit.com.br/static/mascots/MovimentacaoEstoque.png',
                    currentStock: mov.new_quantity,
                },
                type: (mov.quantity > 0 ? 'in' : 'out') as 'in' | 'out',
                quantity: Math.abs(mov.quantity),
                reason,
                user: mov.created_by ? mov.created_by.slice(0, 8) : 'Sistema',
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

    if (isCreating) {
        return (
            <CreateStockMovement
                onBack={() => setIsCreating(false)}
                onSuccess={() => { setIsCreating(false); router.refresh(); }}
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
            {/* Header */}
            <div className="flex-none pt-6 mb-6">
                <div className="px-4 md:px-8 flex items-center justify-between mb-6">
                    <div className="flex flex-col">
                        <h1 className="text-2xl md:text-3xl font-bold text-brand-dark dark:text-dark-heading flex items-center gap-3">
                            <BoxIcon className="w-8 h-8 text-brand-dark dark:text-dark-heading" />
                            Movimentação de Estoque
                        </h1>
                        <p className="text-brand-inactive-text dark:text-dark-body text-sm mt-1">
                            {selectedStore ? `Gerencie o estoque da loja ${selectedStore.name}.` : 'Gerencie as movimentações de entrada e saída.'}
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <Button
                            variant="outline"
                            className="hidden md:flex items-center gap-2"
                        >
                            <FileIcon size={16} /> Exportar
                        </Button>
                        <Button
                            className="hidden md:flex items-center gap-2 bg-brand-green hover:bg-brand-green/90 text-white shadow-sm shadow-brand-green/20"
                            onClick={() => setIsCreating(true)}
                        >
                            <PlusIcon className="w-4 h-4" strokeWidth={3} />
                            Nova Movimentação
                        </Button>
                        <Button
                            variant="outline"
                            className="md:hidden w-10 h-10 p-0 flex items-center justify-center rounded-full bg-brand-green text-white border-none"
                            onClick={() => setIsCreating(true)}
                        >
                            <PlusIcon className="w-5 h-5" strokeWidth={3} />
                        </Button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="mb-6 px-4 md:px-8">
                    <Tabs
                        value={activeTab}
                        onValueChange={(val) => handleTabChange(val as any)}
                    >
                        <TabsList className="px-0">
                            <TabsTrigger value="all" icon={TransferIcon}>
                                Todas
                            </TabsTrigger>
                            <TabsTrigger value="in" icon={TrendUpIcon}>
                                Entradas
                            </TabsTrigger>
                            <TabsTrigger value="out" icon={TrendDownIcon}>
                                Saídas
                            </TabsTrigger>
                        </TabsList>
                    </Tabs>
                </div>

                {/* Controls Bar */}
                <div className="flex flex-col md:flex-row items-center justify-between gap-4 flex-none px-4 md:px-8">
                    {/* Desktop Controls */}
                    <div className="hidden md:flex items-center w-full gap-4">
                        <div className="w-80">
                            <Input
                                name="search"
                                placeholder="Buscar movimentações..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="h-[42px]"
                                variant="full-rounded"
                                label=""
                            />
                        </div>
                        <Button
                            variant="outline"
                            onClick={() => setModals({ filter: true })}
                            leftIcon={<FilterIcon className="h-[18px] w-[18px]" />}
                        >
                            Filtros
                        </Button>

                        <div className="flex-1"></div>

                        <div className="flex items-center bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-full p-1 h-[42px] flex-shrink-0">
                            <button
                                onClick={() => setViewModeState("list")}
                                className={`w-8 h-full flex items-center justify-center rounded-full transition-colors ${viewMode === "list" ? "bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading" : "text-gray-400 hover:text-gray-600 dark:text-dark-body"}`}
                            >
                                <ListIcon className="w-[18px] h-[18px]" />
                            </button>
                            <button
                                onClick={() => setViewModeState("grid")}
                                className={`w-8 h-full flex items-center justify-center rounded-full transition-colors ${viewMode === "grid" ? "bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading" : "text-gray-400 hover:text-gray-600 dark:text-dark-body"}`}
                            >
                                <DashboardIcon className="w-[18px] h-[18px]" />
                            </button>
                        </div>
                    </div>

                    {/* Mobile Controls */}
                    <div className="md:hidden flex items-center gap-2 w-full">
                        <div className="flex-1">
                            <Input
                                name="search"
                                placeholder="Buscar..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="h-[42px] w-full"
                                variant="full-rounded"
                                label=""
                            />
                        </div>
                        <Button variant="outline" onClick={() => setModals({ filter: true })} className="w-[42px] h-[42px] p-0">
                            <FilterIcon className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar relative pb-20 md:pb-8 px-4 md:px-8">
                {/* Empty State / No Results */}
                {paginatedMovements.length === 0 && (
                    <div className="flex-1 flex items-center justify-center p-8">
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
                                action: () => { setSearchTerm(""); setFilters({ movement_type: [] }) },
                                variant: "outline"
                            }}
                        />
                    </div>
                )}

                {paginatedMovements.length > 0 && isMobile && (
                    <div className="flex flex-col divide-y divide-gray-100 dark:divide-gray-800 border-b border-brand-border dark:border-dark-border">
                        {paginatedMovements.map((mov) => (
                            <div
                                key={mov.id}
                                className="py-5 flex items-start gap-4 cursor-pointer"
                                onClick={() => handleViewDetails(mov.id)}
                            >
                                <div className="w-12 h-12 rounded-full bg-[#F3F4F6] dark:bg-gray-800 flex-shrink-0 overflow-hidden border border-brand-border dark:border-dark-border">
                                    <img src={mov.product.image} alt="" className="w-full h-full object-cover" />
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start mb-0.5">
                                        <h3 className="font-bold text-[16px] text-brand-dark dark:text-dark-heading truncate pr-2">{mov.product.name}</h3>
                                        <Badge variant={mov.type === 'in' ? 'green' : 'red'}>
                                            {mov.type === 'in' ? 'Entrada' : 'Saída'}
                                        </Badge>
                                    </div>
                                    <div className="text-sm text-brand-inactive-text dark:text-dark-body font-medium mb-3">ID: {mov.displayId}</div>
                                    <div className="flex items-center gap-1.5 text-[14px]">
                                        <span className={`font-bold ${mov.type === 'in' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                            {mov.type === 'in' ? '+' : '-'}{mov.quantity}
                                        </span>
                                        <span className="text-brand-inactive-text dark:text-dark-body font-medium">• {mov.date.split(',')[0]}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {paginatedMovements.length > 0 && !isMobile && (
                    <div className="w-full">
                        <AnimatePresence mode="wait">
                            {viewMode === 'grid' ? (
                                <motion.div
                                    key="grid"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-8"
                                >
                                    {paginatedMovements.map((mov) => (
                                        <div
                                            key={mov.id}
                                            className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 transition-all duration-300 hover:shadow-md cursor-pointer group flex flex-col h-full min-h-[240px]"
                                            onClick={() => handleViewDetails(mov.id)}
                                        >
                                            <div className="flex gap-4 mb-5">
                                                <div className="w-24 h-24 rounded-2xl bg-[#F3F4F6] dark:bg-gray-800 border border-brand-border dark:border-dark-border flex-shrink-0 overflow-hidden">
                                                    <img src={mov.product.image} alt="" className="w-full h-full object-cover" />
                                                </div>

                                                <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
                                                    <div className="flex justify-between items-start gap-1">
                                                        <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading leading-tight truncate">{mov.product.name}</h3>
                                                    </div>

                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">{mov.product.sku}</span>
                                                    </div>
                                                    <Badge variant={mov.type === 'in' ? 'green' : 'red'} className="w-max">
                                                        {mov.type === 'in' ? 'Entrada' : 'Saída'}
                                                    </Badge>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-2 mb-5 pt-2 border-t border-brand-border dark:border-dark-border mt-auto">
                                                <div>
                                                    <span className="block text-[10px] text-brand-inactive-text dark:text-dark-body font-medium mb-1">Quantidade</span>
                                                    <div className="flex items-center gap-1">
                                                        <span className={`text-[12px] font-bold ${mov.type === 'in' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                                            {mov.type === 'in' ? '+' : '-'}{mov.quantity}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div>
                                                    <span className="block text-[10px] text-brand-inactive-text dark:text-dark-body font-medium mb-1">Estoque Pós</span>
                                                    <span className="text-[12px] font-bold text-brand-dark dark:text-dark-heading block">{mov.product.currentStock}</span>
                                                </div>
                                            </div>

                                            <div className="flex items-end justify-between">
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] font-medium text-brand-inactive-text dark:text-dark-body">{mov.date.split(',')[0]}</span>
                                                    <span className="text-xs font-bold text-brand-dark dark:text-dark-heading">{mov.date.split(',')[1]}</span>
                                                </div>
                                                <Button variant="outline" size="icon" className="w-[38px] h-[38px] rounded-xl" onClick={(e) => e.stopPropagation()}>
                                                    <MoreHorizontalIcon size={18} />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="list"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="w-full overflow-hidden rounded-xl mb-6 shadow-sm border border-brand-border dark:border-dark-border"
                                >
                                    <div className="overflow-x-auto pb-4 custom-scrollbar bg-white dark:bg-dark-surface">
                                        <table className="w-full text-left border-separate border-spacing-0 min-w-[1000px]">
                                            <thead>
                                                <tr className="bg-brand-gray dark:bg-dark-border/50 transition-colors">
                                                    <th className="py-3 px-4 text-[13px] font-medium text-brand-inactive-text dark:text-dark-body border-b border-brand-border dark:border-dark-border pl-6">ID</th>
                                                    <th className="py-3 px-4 text-[13px] font-medium text-brand-inactive-text dark:text-dark-body border-b border-brand-border dark:border-dark-border">Produto</th>
                                                    <th className="py-3 px-4 text-[13px] font-medium text-brand-inactive-text dark:text-dark-body border-b border-brand-border dark:border-dark-border">Tipo</th>
                                                    <th className="py-3 px-4 text-[13px] font-medium text-brand-inactive-text dark:text-dark-body border-b border-brand-border dark:border-dark-border text-right">Qtd</th>
                                                    <th className="py-3 px-4 text-[13px] font-medium text-brand-inactive-text dark:text-dark-body border-b border-brand-border dark:border-dark-border text-right">Estoque</th>
                                                    <th className="py-3 px-4 text-[13px] font-medium text-brand-inactive-text dark:text-dark-body border-b border-brand-border dark:border-dark-border">Motivo</th>
                                                    <th className="py-3 px-4 text-[13px] font-medium text-brand-inactive-text dark:text-dark-body border-b border-brand-border dark:border-dark-border">Data</th>
                                                    <th className="py-3 px-4 w-16 text-center text-[13px] font-medium text-brand-inactive-text dark:text-dark-body border-b border-brand-border dark:border-dark-border">Ações</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paginatedMovements.map((mov) => (
                                                    <tr key={mov.id} className="group hover:bg-gray-50 dark:hover:bg-dark-border/10 transition-colors cursor-pointer" onClick={() => handleViewDetails(mov.id)}>
                                                        <td className="p-4 pl-6 border-b border-brand-border dark:border-dark-border">
                                                            <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading">{mov.displayId}</span>
                                                        </td>
                                                        <td className="p-4 border-b border-brand-border dark:border-dark-border">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-10 h-10 rounded-lg bg-[#F3F4F6] dark:bg-gray-800 p-1 border border-brand-border dark:border-dark-border flex-shrink-0 overflow-hidden">
                                                                    <img src={mov.product.image} alt="" className="w-full h-full object-cover" />
                                                                </div>
                                                                <div className="flex flex-col">
                                                                    <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading leading-none mb-1.5">{mov.product.name}</span>
                                                                    <span className="text-[11px] text-brand-inactive-text dark:text-dark-body font-medium leading-none">{mov.product.sku}</span>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="p-4 border-b border-brand-border dark:border-dark-border">
                                                            <Badge variant={mov.type === 'in' ? 'green' : 'red'}>{mov.type === 'in' ? 'Entrada' : 'Saída'}</Badge>
                                                        </td>
                                                        <td className={`p-4 text-[13px] font-bold border-b border-brand-border dark:border-dark-border text-right ${mov.type === 'in' ? 'text-green-600' : 'text-red-600'}`}>
                                                            {mov.type === 'in' ? '+' : '-'}{mov.quantity}
                                                        </td>
                                                        <td className="p-4 text-[13px] font-medium text-brand-dark dark:text-dark-heading border-b border-brand-border dark:border-dark-border text-right">{mov.product.currentStock}</td>
                                                        <td className="p-4 text-[13px] font-medium text-brand-inactive-text dark:text-dark-body border-b border-brand-border dark:border-dark-border">{mov.reason}</td>
                                                        <td className="p-4 text-[13px] border-b border-brand-border dark:border-dark-border">
                                                            <div className="flex flex-col">
                                                                <span className="font-bold text-brand-dark dark:text-dark-heading">{mov.date.split(',')[0]}</span>
                                                                <span className="text-[11px] text-brand-inactive-text dark:text-dark-body">{mov.date.split(',')[1]}</span>
                                                            </div>
                                                        </td>
                                                        <td className="p-4 text-center border-b border-brand-border dark:border-dark-border" onClick={(e) => e.stopPropagation()}>
                                                            <Button variant="outline" size="icon" className="w-8 h-8 rounded-lg">
                                                                <MoreHorizontalIcon size={16} />
                                                            </Button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                )}

                {paginatedMovements.length > 0 && (
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