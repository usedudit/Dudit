"use client"

import { useState, useMemo, useEffect } from 'react';
import { useStoreData } from "@/lib/use-store-data"
import { useStore } from "@/lib/store-context"
import { motion, AnimatePresence } from 'framer-motion';
import { useMediaQuery } from "../hooks"
import { useToast } from "@/hooks/use-toast"

import {
    SearchIcon,
    FilterIcon,
    PlusIcon,
    ExportFileIcon,
    ListIcon,
    DashboardIcon,
    MoreHorizontalIcon,
    Users as UsersIcon,
    CheckCircleIcon,
    BlockedIcon,
    ChevronDownIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    StoreIcon
} from '@/lib/icons';

import { Button, Checkbox, IconPlaceholder } from '@/components/reusable';
import { Badge } from '@/components/reusable/Badge';
import { Tabs, TabsList, TabsTrigger } from "@/components/reusable/Tabs"
import FilterSheet, { FilterSectionConfig } from "@/components/reusable/FilterSheet"
import Pagination from "@/components/reusable/Pagination"
import CustomerDetailPage from './CustomerDetailPage';
import NewCustomerPage from './NewCustomerPage';

interface Customer {
    id: string;
    originalId: string;
    name: string;
    avatar: string;
    orders: number;
    totalOrderValue: number;
    avgOrderValue: number;
    status: string;
    lastOrderDate: string;
}

interface CustomersPageProps {
    partnerId: string;
}

const CustomersPage = ({ partnerId }: CustomersPageProps) => {
    const { toast } = useToast()
    const { selectedStore, isLoading: storeLoading } = useStore()
    const isMobile = useMediaQuery("(max-width: 767px)")

    // State
    const [viewMode, setViewModeState] = useState<'list' | 'grid'>(isMobile ? 'grid' : 'list');
    const [searchTerm, setSearchTerm] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
    const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
    const [activeTab, setActiveTab] = useState<"all" | "active" | "inactive">("all")
    const [page, setPage] = useState(1)
    const [sort, setSort] = useState<{ key: string; direction: "asc" | "desc" } | null>(null)
    const [modals, setModals] = useState({ filter: false })
    const [selection, setSelection] = useState({ ids: new Set<string>() })

    const [filters, setFilters] = useState({
        status: [] as string[],
    })

    const { customers: rawCustomers, isLoading: customersLoading } = useStoreData(partnerId, { includeCustomers: true });

    const isLoading = storeLoading || customersLoading;
    const itemsPerPage = 8
    const effectiveViewMode = isMobile ? "grid" : viewMode

    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(searchTerm), 500)
        return () => clearTimeout(t)
    }, [searchTerm])

    const filterSections: FilterSectionConfig[] = [
        { id: "status", title: "Status", type: "checkbox-list", options: ["Ativo", "Inativo"] },
    ]

    const displayedCustomers = useMemo(() => {
        if (!rawCustomers || !selectedStore) return [];

        const term = debouncedSearch.toLowerCase()

        return rawCustomers
            .filter((c: any) =>
                (!c.store_id || c.store_id === selectedStore.id) &&
                (c.name?.toLowerCase().includes(term) ||
                    c.email?.toLowerCase().includes(term) ||
                    c.phone?.includes(debouncedSearch))
            )
            .filter((c: any) => {
                const statusLabel = c.is_active !== false ? "Ativo" : "Inativo"
                const tabMatch = activeTab === "all" ||
                    (activeTab === "active" && statusLabel === "Ativo") ||
                    (activeTab === "inactive" && statusLabel === "Inativo")

                const filterMatch = filters.status.length === 0 || filters.status.includes(statusLabel)

                return tabMatch && filterMatch
            })
            .map((c: any): Customer => ({
                id: `#${c.id.substring(0, 5)}`,
                originalId: c.id,
                name: c.name || 'Cliente Sem Nome',
                avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(c.name || 'C')}&background=random`,
                orders: 0,
                totalOrderValue: 0.00,
                avgOrderValue: 0.00,
                status: c.is_active !== false ? 'Active' : 'Inactive',
                lastOrderDate: 'N/A'
            }));
    }, [rawCustomers, selectedStore, debouncedSearch, activeTab, filters]);

    const sortedCustomers = useMemo(() => {
        if (!sort) return displayedCustomers
        return [...displayedCustomers].sort((a, b) => {
            const valA = a[sort.key as keyof Customer]
            const valB = b[sort.key as keyof Customer]
            if (valA === valB) return 0
            const comparison = valA < valB ? -1 : 1
            return sort.direction === "asc" ? comparison : -comparison
        })
    }, [displayedCustomers, sort])

    const totalPages = Math.ceil(sortedCustomers.length / itemsPerPage)
    const paginated = sortedCustomers.slice((page - 1) * itemsPerPage, page * itemsPerPage)

    const hasActiveFilters = filters.status.length > 0
    const isFiltered = searchTerm.length > 0 || hasActiveFilters

    const selectedCustomer = useMemo(() => {
        if (!selectedCustomerId) return null;
        return displayedCustomers.find((c: Customer) => c.originalId === selectedCustomerId) || null;
    }, [selectedCustomerId, displayedCustomers]);

    if (selectedCustomerId && selectedCustomer) {
        return (
            <CustomerDetailPage
                customer={selectedCustomer}
                onBack={() => setSelectedCustomerId(null)}
            />
        );
    }

    if (isCreatingCustomer) {
        return (
            <NewCustomerPage
                partnerId={partnerId}
                onBack={() => setIsCreatingCustomer(false)}
                onSuccess={(msg) => toast({ title: "Sucesso", description: msg })}
                onError={(msg) => toast({ title: "Erro", description: msg, variant: "destructive" })}
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
                        <div className="flex items-center gap-3">
                            <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                                Clientes
                            </h1>
                        </div>
                        <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                            {selectedStore ? `Gerencie os clientes da loja ${selectedStore.name}.` : 'Selecione uma loja para ver os clientes.'}
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <Button
                            variant="outline"
                            className="flex items-center gap-2"
                        >
                            <ExportFileIcon size={16} /> Importar
                        </Button>
                        <Button
                            onClick={() => setIsCreatingCustomer(true)}
                        >
                            <PlusIcon size={18} strokeWidth={3} /> Novo Cliente
                        </Button>
                    </div>
                </div>

                {!isLoading && (displayedCustomers.length > 0 || isFiltered) && (
                    <>
                        <div className="mb-6 px-4 md:px-8 border-b border-brand-border dark:border-dark-border">
                            <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as any)}>
                                <TabsList className="px-0">
                                    <TabsTrigger value="all" icon={UsersIcon}>Todos</TabsTrigger>
                                    <TabsTrigger value="active" icon={CheckCircleIcon}>Ativos</TabsTrigger>
                                    <TabsTrigger value="inactive" icon={BlockedIcon}>Inativos</TabsTrigger>
                                </TabsList>
                            </Tabs>
                        </div>

                        <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-4 flex-none px-4 md:px-8">
                            <div className="md:hidden flex items-center gap-2 w-full">
                                <div className="flex-1 min-w-0">
                                    <input
                                        type="text"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        placeholder="Buscar..."
                                        className="h-[42px] w-full px-4 rounded-full border border-brand-border dark:border-dark-border bg-transparent text-[14px] focus:outline-none focus:ring-2 focus:ring-brand-green/20"
                                    />
                                </div>
                                <Button variant="outline" onClick={() => setModals({ filter: true })} className="w-[42px] h-[42px] p-0">
                                    <FilterIcon className="w-4 h-4" />
                                </Button>
                                <Button onClick={() => setIsCreatingCustomer(true)} className="w-[42px] h-[42px] p-0 flex items-center justify-center rounded-full">
                                    <PlusIcon className="w-5 h-5" strokeWidth={3} />
                                </Button>
                            </div>

                            <div className="hidden md:flex items-center w-full gap-4">
                                <div className="flex items-center gap-3 flex-shrink-0">
                                    <div className="w-80 relative flex items-center">
                                        <SearchIcon size={18} className="absolute left-3 text-brand-inactive-text" />
                                        <input
                                            type="text"
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            placeholder="Buscar clientes..."
                                            className="h-[42px] w-full pl-10 pr-4 rounded-full border border-brand-border dark:border-dark-border bg-transparent text-[14px] focus:outline-none focus:ring-2 focus:ring-brand-green/20"
                                        />
                                    </div>
                                    <Button variant="outline" onClick={() => setModals({ filter: true })} leftIcon={<FilterIcon className="h-[18px] w-[18px]" />}>
                                        Filtros
                                    </Button>
                                </div>

                                <div className="flex-1 min-w-0" />

                                <div className="flex items-center bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-full p-1 h-[42px] flex-shrink-0">
                                    <button
                                        onClick={() => setViewModeState('list')}
                                        className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors ${viewMode === 'list' ? 'bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading' : 'text-gray-400 hover:text-gray-600 dark:text-dark-body'}`}
                                    >
                                        <ListIcon className="w-[18px] h-[18px]" />
                                    </button>
                                    <button
                                        onClick={() => setViewModeState('grid')}
                                        className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors ${viewMode === 'grid' ? 'bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading' : 'text-gray-400 hover:text-gray-600 dark:text-dark-body'}`}
                                    >
                                        <DashboardIcon className="w-[18px] h-[18px]" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </>
                )}

                <div className="flex-1 overflow-y-auto custom-scrollbar relative pb-20 md:pb-0 px-4 md:px-8">
                    {isLoading && (
                        <div className="w-full py-20 flex justify-center opacity-50">
                            <div className="animate-pulse flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-brand-green"></div>
                                <div className="w-2 h-2 rounded-full bg-brand-green animation-delay-200"></div>
                                <div className="w-2 h-2 rounded-full bg-brand-green animation-delay-400"></div>
                            </div>
                        </div>
                    )}

                    {!isLoading && sortedCustomers.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-[600px] text-center p-8 w-full">
                            <IconPlaceholder
                                placeholderType="image"
                                imageSrc={isFiltered ? "https://img.dudit.com.br/static/mascots/NaoEncontrado.png" : "https://img.dudit.com.br/static/mascots/Clientes.png"}
                                imageAlt="Sem clientes"
                                title={isFiltered ? "Nenhum cliente encontrado" : "Você ainda não tem clientes"}
                                subtitle={isFiltered ? "Tente ajustar seus filtros ou termos de busca." : "Comece adicionando clientes para gerenciar sua base."}
                                itemButton={!isFiltered ? {
                                    text: "Adicionar Primeiro Cliente",
                                    action: () => setIsCreatingCustomer(true),
                                } : {
                                    text: "Limpar Filtros",
                                    action: () => { setSearchTerm(""); setFilters({ status: [] }) },
                                    variant: "outline"
                                }}
                            />
                        </div>
                    )}

                    {!isLoading && paginated.length > 0 && isMobile && (
                        <div className="flex flex-col divide-y divide-gray-100 dark:divide-gray-800 border-b border-brand-border dark:border-dark-border">
                            {paginated.map((customer: Customer) => (
                                <div
                                    key={customer.originalId}
                                    className="py-5 flex items-start gap-4 cursor-pointer"
                                    onClick={() => setSelectedCustomerId(customer.originalId)}
                                >
                                    <img src={customer.avatar} alt="" className="w-12 h-12 rounded-full object-cover" />

                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-start mb-0.5">
                                            <h3 className="font-bold text-[16px] text-brand-dark dark:text-dark-heading">{customer.name}</h3>
                                            <Badge variant={customer.status === 'Active' ? 'green' : 'red'}>
                                                {customer.status === 'Active' ? 'Ativo' : 'Inativo'}
                                            </Badge>
                                        </div>
                                        <div className="text-sm text-brand-inactive-text dark:text-dark-body font-medium mb-3">ID: {customer.id}</div>
                                        <div className="flex items-center gap-1.5 text-[14px]">
                                            <span className="text-brand-inactive-text dark:text-dark-body font-medium">Valor gasto</span>
                                            <span className="font-bold text-brand-dark dark:text-dark-heading">R$ {customer.totalOrderValue.toLocaleString('pt-BR')}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {!isLoading && paginated.length > 0 && !isMobile && (
                        <div className="w-full">
                            <AnimatePresence mode="wait">
                                {effectiveViewMode === 'grid' ? (
                                    <motion.div
                                        key="grid"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 0.2 }}
                                        className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-8"
                                    >
                                        {paginated.map((customer: Customer) => (
                                            <div
                                                key={customer.originalId}
                                                className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 transition-all duration-300 hover:shadow-md cursor-pointer group flex flex-col h-full min-h-[240px]"
                                                onClick={() => setSelectedCustomerId(customer.originalId)}
                                            >
                                                <div className="flex gap-4 mb-5">
                                                    <img src={customer.avatar} alt="" className="w-24 h-24 rounded-full object-cover border border-gray-100 dark:border-gray-700 flex-shrink-0" />

                                                    <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
                                                        <div className="flex justify-between items-start gap-1">
                                                            <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading leading-tight truncate">{customer.name}</h3>
                                                            <div className="flex-shrink-0 -mt-1 -mr-1" onClick={(e) => e.stopPropagation()}>
                                                                <Checkbox checked={selection.ids.has(customer.originalId)} onChange={() => {
                                                                    setSelection(prev => {
                                                                        const next = new Set(prev.ids)
                                                                        next.has(customer.originalId) ? next.delete(customer.originalId) : next.add(customer.originalId)
                                                                        return { ids: next }
                                                                    })
                                                                }} />
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">ID {customer.id}</span>
                                                            <Badge variant={customer.status === 'Active' ? 'green' : 'red'}>
                                                                {customer.status === 'Active' ? 'Ativo' : 'Inativo'}
                                                            </Badge>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 gap-2 mb-5 pt-2 border-t border-brand-border dark:border-dark-border mt-auto">
                                                    <div>
                                                        <span className="block text-[10px] text-brand-inactive-text dark:text-dark-body font-medium mb-1">Total gasto</span>
                                                        <div className="flex items-center gap-1">
                                                            <span className="text-[12px] font-bold text-brand-dark dark:text-dark-heading">R$ {customer.totalOrderValue.toLocaleString('pt-BR')}</span>
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <span className="block text-[10px] text-brand-inactive-text dark:text-dark-body font-medium mb-1">Pedidos</span>
                                                        <span className="text-[12px] font-bold text-brand-dark dark:text-dark-heading block">{customer.orders}</span>
                                                    </div>
                                                </div>

                                                <div className="flex items-end justify-between">
                                                    <div className="flex flex-col">
                                                        <span className="text-[10px] font-medium text-brand-inactive-text dark:text-dark-body">Último pedido</span>
                                                        <span className="text-xs font-bold text-brand-dark dark:text-dark-heading">{customer.lastOrderDate}</span>
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
                                            <table className="w-full text-left border-separate border-spacing-0 min-w-[1200px]">
                                                <thead>
                                                    <tr className="bg-brand-gray dark:bg-dark-border/50 transition-colors">
                                                        <th className="py-3 px-4 w-12 pl-6 border-b border-brand-border dark:border-dark-border">
                                                            <Checkbox checked={selection.ids.size === paginated.length && paginated.length > 0} onChange={(checked) => {
                                                                setSelection({ ids: checked ? new Set(paginated.map((c: Customer) => c.originalId)) : new Set() })
                                                            }} />
                                                        </th>
                                                        <th className="py-3 px-4 text-[13px] font-medium text-brand-inactive-text dark:text-dark-body border-b border-brand-border dark:border-dark-border">Nome</th>
                                                        <th className="py-3 px-4 text-[13px] font-medium text-brand-inactive-text dark:text-dark-body border-b border-brand-border dark:border-dark-border text-right">Pedidos</th>
                                                        <th className="py-3 px-4 text-[13px] font-medium text-brand-inactive-text dark:text-dark-body border-b border-brand-border dark:border-dark-border text-right">Total Gasto</th>
                                                        <th className="py-3 px-4 text-[13px] font-medium text-brand-inactive-text dark:text-dark-body border-b border-brand-border dark:border-dark-border">Status</th>
                                                        <th className="py-3 px-4 text-[13px] font-medium text-brand-inactive-text dark:text-dark-body border-b border-brand-border dark:border-dark-border">Último Pedido</th>
                                                        <th className="py-3 px-4 w-16 text-center text-[13px] font-medium text-brand-inactive-text dark:text-dark-body border-b border-brand-border dark:border-dark-border">Ações</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {paginated.map((customer: Customer) => (
                                                        <tr key={customer.originalId} className="group hover:bg-gray-50 dark:hover:bg-dark-border/10 transition-colors cursor-pointer" onClick={() => setSelectedCustomerId(customer.originalId)}>
                                                            <td className="p-4 pl-6 border-b border-brand-border dark:border-dark-border" onClick={(e) => e.stopPropagation()}>
                                                                <Checkbox checked={selection.ids.has(customer.originalId)} onChange={() => {
                                                                    setSelection(prev => {
                                                                        const next = new Set(prev.ids)
                                                                        next.has(customer.originalId) ? next.delete(customer.originalId) : next.add(customer.originalId)
                                                                        return { ids: next }
                                                                    })
                                                                }} />
                                                            </td>
                                                            <td className="p-4 border-b border-brand-border dark:border-dark-border">
                                                                <div className="flex items-center gap-3">
                                                                    <img src={customer.avatar} alt="" className="w-10 h-10 rounded-full object-cover" />
                                                                    <div className="flex flex-col">
                                                                        <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading leading-none mb-1.5">{customer.name}</span>
                                                                        <span className="text-[11px] text-brand-inactive-text dark:text-dark-body font-medium leading-none">ID {customer.id}</span>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="p-4 text-[13px] font-medium text-brand-dark dark:text-dark-heading border-b border-brand-border dark:border-dark-border text-right">{customer.orders}</td>
                                                            <td className="p-4 text-[13px] font-medium text-brand-dark dark:text-dark-heading border-b border-brand-border dark:border-dark-border text-right">R$ {customer.totalOrderValue.toLocaleString('pt-BR')}</td>
                                                            <td className="p-4 border-b border-brand-border dark:border-dark-border">
                                                                <Badge variant={customer.status === 'Active' ? 'green' : 'red'}>{customer.status === 'Active' ? 'Ativo' : 'Inativo'}</Badge>
                                                            </td>
                                                            <td className="p-4 text-[13px] font-medium text-brand-inactive-text dark:text-dark-body border-b border-brand-border dark:border-dark-border">{customer.lastOrderDate}</td>
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

                    {!isLoading && sortedCustomers.length > 0 && (
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
                    onClear={() => setFilters({ status: [] })}
                />
            </div>
        </motion.div>
    );
};

export default CustomersPage;