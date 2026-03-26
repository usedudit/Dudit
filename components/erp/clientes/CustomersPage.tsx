"use client"

import { useState, useMemo, useEffect } from 'react';
import { useStoreData } from "@/lib/use-store-data"
import { useStore } from "@/lib/store-context"
import { motion, AnimatePresence } from 'framer-motion';
import { useMediaQuery } from "../hooks"
import { useToast } from "@/hooks/use-toast"

import {
    Button,
    Input,
    Badge,
    AlertModal,
    IconPlaceholder,
    Checkbox as FormCheckbox
} from "@/components/reusable"
import { Tabs, TabsList, TabsTrigger } from "@/components/reusable/Tabs"
import {
    Users,
    CheckCircleIcon,
    CancelCircleIcon,
    BlockedIcon,
    SearchIcon,
    FilterIcon,
    DashboardIcon,
    ListIcon,
    PlusIcon,
    FileIcon,
    MoreHorizontalIcon,
    ArrowUpDownIcon,
    Settings2Icon,
    ExportFileIcon
} from "@/lib/icons"

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
    const [searchQuery, setSearchQuery] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
    const [isNewCustomerPage, setIsNewCustomerPage] = useState(false);
    const [filterStatus, setFilterStatus] = useState<"Todos" | "Ativo" | "Inativo" | "Bloqueado">("Todos")
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
        const t = setTimeout(() => setDebouncedSearch(searchQuery), 500)
        return () => clearTimeout(t)
    }, [searchQuery])

    const filterSections: FilterSectionConfig[] = [
        { id: "status", title: "Status", type: "checkbox-list", options: ["Ativo", "Inativo"] },
    ]

    const filteredCustomers = useMemo(() => {
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
                const tabMatch = filterStatus === "Todos" ||
                    (filterStatus === "Ativo" && statusLabel === "Ativo") ||
                    (filterStatus === "Inativo" && statusLabel === "Inativo")

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
    }, [rawCustomers, selectedStore, debouncedSearch, filterStatus, filters]);

    const sortedCustomers = useMemo(() => {
        if (!sort) return filteredCustomers
        return [...filteredCustomers].sort((a, b) => {
            const valA = a[sort.key as keyof Customer]
            const valB = b[sort.key as keyof Customer]
            if (valA === valB) return 0
            const comparison = valA < valB ? -1 : 1
            return sort.direction === "asc" ? comparison : -comparison
        })
    }, [filteredCustomers, sort])

    const totalPages = Math.ceil(sortedCustomers.length / itemsPerPage)
    const paginated = sortedCustomers.slice((page - 1) * itemsPerPage, page * itemsPerPage)

    const hasActiveFilters = filters.status.length > 0
    const isFiltered = searchQuery.length > 0 || hasActiveFilters

    const selectedCustomer = useMemo(() => {
        if (!selectedCustomerId) return null;
        return filteredCustomers.find((c: Customer) => c.originalId === selectedCustomerId) || null;
    }, [selectedCustomerId, filteredCustomers]);

    if (selectedCustomerId && selectedCustomer) {
        return (
            <CustomerDetailPage
                customer={selectedCustomer}
                onBack={() => setSelectedCustomerId(null)}
            />
        );
    }

    if (isNewCustomerPage) {
        return (
            <NewCustomerPage
                partnerId={partnerId}
                onBack={() => setIsNewCustomerPage(false)}
                onSuccess={(msg) => toast({ title: "Sucesso", description: msg })}
                onError={(msg) => toast({ title: "Erro", description: msg, variant: "destructive" })}
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
                            <Users className="w-8 h-8 text-brand-dark dark:text-dark-heading" />
                            Clientes
                        </h1>
                        <p className="text-brand-inactive-text dark:text-dark-body text-sm mt-1">
                            Gerencie sua base de clientes e contatos
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <Button
                            className="hidden md:flex items-center gap-2 bg-brand-green hover:bg-brand-green/90 text-white shadow-sm shadow-brand-green/20"
                            onClick={() => setIsNewCustomerPage(true)}
                        >
                            <PlusIcon className="w-4 h-4" strokeWidth={3} />
                            Novo Cliente
                        </Button>
                        <Button
                            variant="outline"
                            className="md:hidden w-10 h-10 p-0 flex items-center justify-center rounded-full bg-brand-green text-white border-none"
                            onClick={() => setIsNewCustomerPage(true)}
                        >
                            <PlusIcon className="w-5 h-5" strokeWidth={3} />
                        </Button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="mb-6 px-4 md:px-8">
                    <Tabs
                        value={filterStatus}
                        onValueChange={(val) => setFilterStatus(val as any)}
                    >
                        <TabsList className="px-0">
                            <TabsTrigger value="Todos" icon={Users}>
                                Todos
                            </TabsTrigger>
                            <TabsTrigger value="Ativo" icon={CheckCircleIcon}>
                                Ativos
                            </TabsTrigger>
                            <TabsTrigger value="Inativo" icon={CancelCircleIcon}>
                                Inativos
                            </TabsTrigger>
                            <TabsTrigger value="Bloqueado" icon={BlockedIcon}>
                                Bloqueados
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
                                placeholder="Buscar clientes..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
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
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
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
                {/* 
                Loader de 3 pontos comentado conforme solicitado pelo usuário
                {isLoading && (
                    <div className="w-full py-20 flex justify-center opacity-50">
                        <div className="animate-pulse flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-brand-green"></div>
                            <div className="w-2 h-2 rounded-full bg-brand-green animation-delay-200"></div>
                            <div className="w-2 h-2 rounded-full bg-brand-green animation-delay-400"></div>
                        </div>
                    </div>
                )} 
                */}

                {/* Empty State / No Results */}
                {!isLoading && filteredCustomers.length === 0 && (
                    <div className="flex-1 flex items-center justify-center p-8">
                        <IconPlaceholder
                            placeholderType="image"
                            imageSrc="https://img.dudit.com.br/static/mascots/Clientes.png"
                            imageAlt="Nenhum cliente"
                            title={searchQuery ? "Nenhum cliente encontrado" : "Você ainda não tem clientes"}
                            subtitle={searchQuery ? "Tente buscar por outro nome ou documento." : "Cadastre seus clientes para gerenciar vendas e contatos."}
                            itemButton={!searchQuery ? {
                                text: "Cadastrar Primeiro Cliente",
                                action: () => setIsNewCustomerPage(true),
                            } : undefined}
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
                                                            <FormCheckbox checked={selection.ids.has(customer.originalId)} onChange={() => {
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
                                                        <FormCheckbox checked={selection.ids.size === paginated.length && paginated.length > 0} onChange={(checked) => {
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
                                                            <FormCheckbox checked={selection.ids.has(customer.originalId)} onChange={() => {
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
    );
};

export default CustomersPage;