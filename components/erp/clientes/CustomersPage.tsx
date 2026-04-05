"use client"

import React, { useState, useMemo, useCallback, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useMediaQuery } from "../hooks"
import { useToast } from "@/hooks/use-toast"
import { useStore } from "@/lib/store-context"
import { useStoreData } from "@/lib/use-store-data"

// Components
import { Button, IconPlaceholder, ThreeDotsLoader } from "@/components/reusable"
import FilterSheet, { FilterSectionConfig } from "@/components/reusable/FilterSheet"
import Pagination from "@/components/reusable/Pagination"
import CustomerListItem from "./CustomerListItem"
import CustomerGridCard from "./CustomerGridCard"
import CustomerPageControls from "./CustomerPageControls"
import CustomerDetailPage from "./CustomerDetailPage"
import NewCustomerPage from "./NewCustomerPage"

// Icons
import {
    PlusIcon,
    ExportFileIcon,
    Users,
    ArrowUpDownIcon
} from "@/lib/icons"

// --- TYPES & INTERFACES ---

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
    rawLastOrderDate: number;
    storeCredit?: number;
    createdAt?: string;
    address?: string;
}

interface FilterState {
    status: string[]
}

const INITIAL_FILTERS: FilterState = {
    status: [],
}

type SortKey = 'name' | 'orders' | 'total_spent' | 'store_credit' | 'status' | 'last_order';
type SortDirection = 'asc' | 'desc';

// --- CONFIGURAÇÃO DE COLUNAS ---
const COLUMNS = [
    { id: "name", label: "Cliente", align: "left" as const, width: "300px" },
    { id: "orders", label: "Pedidos", align: "center" as const, width: "100px" },
    { id: "total_spent", label: "Total Gasto", align: "right" as const, width: "150px" },
    { id: "store_credit", label: "Crédito", align: "right" as const, width: "130px" },
    { id: "status", label: "Status", align: "center" as const, width: "120px" },
    { id: "last_order", label: "Último Pedido", align: "left" as const, width: "160px" },
    { id: "actions", label: "Ações", align: "center" as const, width: "80px" },
]

export default function CustomersPage({ partnerId }: { partnerId: string }) {
    const { toast } = useToast()
    const { selectedStore, isLoading: storeLoading } = useStore()
    const isMobile = useMediaQuery("(max-width: 767px)")

    // State
    const [search, setSearch] = useState("")
    const [debouncedSearch, setDebouncedSearch] = useState("")
    const [activeTab, setActiveTab] = useState<"Todos" | "Ativo" | "Inativo" | "Bloqueado">("Todos")
    const [viewMode, setViewModeState] = useState<"list" | "grid">(isMobile ? "grid" : "list")
    const [page, setPage] = useState(1)
    const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS)
    const [modals, setModals] = useState({ filter: false })
    const [selection, setSelection] = useState({ ids: new Set<string>() })
    const [ui, setUi] = useState<{ pageState: "list" | "details" | "form"; selectedId: string | null }>({
        pageState: "list",
        selectedId: null
    })
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>(null)

    const { customers: rawCustomers, customersLoading, customersError } = useStoreData(partnerId, { includeCustomers: true })
    const isLoading = customersLoading && (rawCustomers === undefined || rawCustomers === null)
    const itemsPerPage = 12

    const tableContainerRef = useRef<HTMLDivElement>(null)
    const [scrollState, setScrollState] = useState({ left: false, right: false })

    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(search), 500)
        return () => clearTimeout(t)
    }, [search])

    const checkScroll = useCallback(() => {
        if (!tableContainerRef.current) return
        const { scrollLeft, scrollWidth, clientWidth } = tableContainerRef.current
        setScrollState({
            left: scrollLeft > 0,
            right: scrollLeft < scrollWidth - clientWidth - 2,
        })
    }, [])

    useEffect(() => {
        checkScroll()
        window.addEventListener("resize", checkScroll)
        return () => window.removeEventListener("resize", checkScroll)
    }, [checkScroll, viewMode, rawCustomers])

    const filterSections: FilterSectionConfig[] = [
        { id: "status", title: "Status", type: "checkbox-list", options: ["Ativo", "Inativo", "Bloqueado"] },
    ]

    const filteredCustomers: Customer[] = useMemo(() => {
        if (!rawCustomers) return []

        const term = debouncedSearch.toLowerCase()

        const filtered = rawCustomers
            .filter((c: any) => {
                const nameMatch = (c.name || "").toLowerCase().includes(term)
                const emailMatch = (c.email || "").toLowerCase().includes(term)
                const phoneMatch = (c.phone || "").includes(debouncedSearch)

                return nameMatch || emailMatch || phoneMatch
            })
            .filter((c: any) => {
                const statusLabel = c.status === 'Blocked' ? "Bloqueado" : (c.is_active !== false ? "Ativo" : "Inativo")

                let tabMatch = true
                if (activeTab === "Ativo") tabMatch = statusLabel === "Ativo"
                else if (activeTab === "Inativo") tabMatch = statusLabel === "Inativo"
                else if (activeTab === "Bloqueado") tabMatch = statusLabel === "Bloqueado"

                const filterMatch = filters.status.length === 0 || filters.status.includes(statusLabel)

                return tabMatch && filterMatch
            })
            .map((c: any): Customer => ({
                id: c.id ? `#${c.id.substring(0, 5).toUpperCase()}` : '-',
                originalId: c.id,
                name: c.name || 'Cliente Sem Nome',
                avatar: c.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(c.name || 'C')}&background=random`,
                orders: c.orders_count || 0,
                totalOrderValue: c.total_spent || 0.00,
                avgOrderValue: 0.00,
                status: c.status || (c.is_active !== false ? 'Active' : 'Inactive'),
                lastOrderDate: c.last_order_at ? new Date(c.last_order_at).toLocaleDateString('pt-BR') : '-',
                rawLastOrderDate: c.last_order_at ? new Date(c.last_order_at).getTime() : 0,
                storeCredit: c.store_credit || 0,
                createdAt: c.created_at,
                address: c.address
            }))

        const result = [...filtered]

        if (sortConfig) {
            const { key, direction } = sortConfig;
            result.sort((a, b) => {
                let aVal: any;
                let bVal: any;

                switch (key) {
                    case 'name':
                        aVal = a.name;
                        bVal = b.name;
                        break;
                    case 'orders':
                        aVal = a.orders;
                        bVal = b.orders;
                        break;
                    case 'total_spent':
                        aVal = a.totalOrderValue;
                        bVal = b.totalOrderValue;
                        break;
                    case 'store_credit':
                        aVal = a.storeCredit;
                        bVal = b.storeCredit;
                        break;
                    case 'status':
                        aVal = a.status;
                        bVal = b.status;
                        break;
                    case 'last_order':
                        aVal = a.rawLastOrderDate;
                        bVal = b.rawLastOrderDate;
                        break;
                    default:
                        aVal = (a as any)[key];
                        bVal = (b as any)[key];
                }

                if (aVal === bVal) return 0;
                const comparison = aVal < bVal ? -1 : 1;
                return direction === 'asc' ? comparison : -comparison;
            });
        }

        return result;
    }, [rawCustomers, debouncedSearch, activeTab, filters, sortConfig])

    const totalPages = Math.ceil(filteredCustomers.length / itemsPerPage)
    const paginated = filteredCustomers.slice((page - 1) * itemsPerPage, page * itemsPerPage)

    const hasActiveFilters = filters.status.length > 0 || debouncedSearch.length > 0
    const hasCustomers = (rawCustomers?.length || 0) > 0

    // Handlers
    const handleAddCustomer = () => setUi({ pageState: "form", selectedId: null })
    const handleEditCustomer = (customer: Customer) => {
        setUi({ pageState: "form", selectedId: customer.originalId })
    }
    const handleDetailsCustomer = (customer: Customer) => {
        setUi({ pageState: "details", selectedId: customer.originalId })
    }
    const handleSelectRow = (id: string) => {
        setSelection((p) => {
            const s = new Set(p.ids)
            s.has(id) ? s.delete(id) : s.add(id)
            return { ids: s }
        })
    }

    const handleClearFilters = () => {
        setSearch("")
        setFilters(INITIAL_FILTERS)
        setActiveTab("Todos")
    }

    if (ui.pageState === "form") {
        return (
            <NewCustomerPage
                partnerId={partnerId}
                onBack={() => setUi({ pageState: "list", selectedId: null })}
                onSuccess={(msg) => {
                    toast({ title: "Sucesso", description: msg })
                    setUi({ pageState: "list", selectedId: null })
                }}
                onError={(msg) => toast({ title: "Erro", description: msg, variant: "destructive" })}
            />
        )
    }

    const selectedCustomer = filteredCustomers.find((c: Customer) => c.originalId === ui.selectedId)

    if (ui.pageState === "details" && selectedCustomer) {
        return (
            <CustomerDetailPage
                customer={selectedCustomer}
                onBack={() => setUi({ pageState: "list", selectedId: null })}
            />
        )
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
                {/* Desktop Header */}
                <div className="hidden md:flex items-start justify-between mb-6 flex-none px-4 md:px-8">
                    <div className="flex flex-col gap-2 pt-1">
                        <div className="flex items-center gap-3">
                            <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                                Clientes
                            </h1>
                        </div>
                        <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                            Gerencie sua base de clientes e contatos.
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <Button variant="outline" onClick={() => { }}>
                            <ExportFileIcon className="w-[18px] h-[18px]" /> Exportar
                        </Button>

                        <Button onClick={handleAddCustomer}>
                            <PlusIcon className="w-[18px] h-[18px]" strokeWidth={3} />
                            Novo Cliente
                        </Button>
                    </div>
                </div>

                {hasCustomers && (
                    <CustomerPageControls
                        activeTab={activeTab}
                        setActiveTab={setActiveTab}
                        search={search}
                        onSearchChange={setSearch}
                        onOpenFilter={() => setModals({ filter: true })}
                        onExport={() => { }}
                        onAddCustomer={handleAddCustomer}
                        filters={filters}
                        setFilters={setFilters as any}
                        viewMode={viewMode}
                        onViewModeChange={setViewModeState}
                        hasActiveFilters={hasActiveFilters}
                    />
                )}

                <div className="flex-1 overflow-y-auto custom-scrollbar relative pb-20 md:pb-8 px-4 md:px-8">
                    <AnimatePresence mode="wait">
                        {isLoading ? (
                            <ThreeDotsLoader key="loading" />
                        ) : customersError && !hasCustomers ? (
                            <motion.div key="error-state" className="w-full h-full flex items-center justify-center min-h-[500px]">
                                <IconPlaceholder
                                    placeholderType="image"
                                    imageSrc="https://img.dudit.com.br/static/mascots/clientes/naoencontrado.png"
                                    imageAlt="Erro ao carregar"
                                    title="Erro ao carregar clientes"
                                    subtitle="Não foi possível carregar seus clientes. Tente novamente."
                                    itemButton={{
                                        text: "Tentar Novamente",
                                        action: () => window.location.reload(),
                                    }}
                                />
                            </motion.div>
                        ) : !hasCustomers ? (
                            <motion.div key="empty-no-data" className="w-full h-full flex items-center justify-center min-h-[500px]">
                                <IconPlaceholder
                                    placeholderType="image"
                                    imageSrc="https://img.dudit.com.br/static/mascots/Clientes.png"
                                    imageAlt="Sem clientes"
                                    title="Você ainda não tem clientes"
                                    subtitle="Cadastre seus clientes para gerenciar vendas e contatos."
                                    itemButton={{
                                        text: "Cadastrar Primeiro Cliente",
                                        action: handleAddCustomer,
                                    }}
                                />
                            </motion.div>
                        ) : paginated.length === 0 ? (
                            <motion.div key="empty-results" className="w-full h-full flex items-center justify-center min-h-[500px]">
                                <IconPlaceholder
                                    placeholderType="image"
                                    imageSrc="https://img.dudit.com.br/static/mascots/clientes/naoencontrado.png"
                                    imageAlt="Nenhum cliente encontrado"
                                    title="Nenhum cliente encontrado"
                                    subtitle="Tente ajustar seus filtros ou termos de busca."
                                    itemButton={{
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
                                className="w-full"
                            >
                                {viewMode === "grid" ? (
                                    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-4">
                                        {paginated.map((c: Customer) => (
                                            <CustomerGridCard
                                                key={c.originalId}
                                                customer={c}
                                                selected={selection.ids.has(c.originalId)}
                                                onSelect={() => handleSelectRow(c.originalId)}
                                                onDetails={() => handleDetailsCustomer(c)}
                                                onEdit={() => handleEditCustomer(c)}
                                                onDelete={() => { }}
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
                                                                <input
                                                                    type="checkbox"
                                                                    className="w-4 h-4 rounded border-brand-border"
                                                                    checked={selection.ids.size === paginated.length && paginated.length > 0}
                                                                    onChange={(e) => {
                                                                        const checked = e.target.checked
                                                                        setSelection({ ids: checked ? new Set(paginated.map((x: Customer) => x.originalId)) : new Set() })
                                                                    }}
                                                                />
                                                            </div>
                                                        </th>
                                                        {COLUMNS.map((col, idx) => {
                                                            const isSortable = col.id !== "actions";
                                                            const isSorted = sortConfig?.key === col.id;
                                                            return (
                                                                <th
                                                                    key={col.id}
                                                                    className={`py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 ${idx === COLUMNS.length - 1 ? "rounded-r-lg" : ""} ${isSortable ? "cursor-pointer hover:text-gray-900 dark:hover:text-dark-heading group select-none transition-colors" : ""}`}
                                                                    style={{ width: col.width }}
                                                                    onClick={() => {
                                                                        if (!isSortable) return;
                                                                        setSortConfig(prev => ({
                                                                            key: col.id as SortKey,
                                                                            direction: prev?.key === col.id && prev.direction === 'asc' ? 'desc' : 'asc'
                                                                        }));
                                                                    }}
                                                                >
                                                                    <div className={`flex items-center gap-1.5 ${col.align === "right" ? "justify-end" : col.align === "center" ? "justify-center" : ""}`}>
                                                                        {col.label}
                                                                        {isSortable && (
                                                                            <ArrowUpDownIcon
                                                                                size={14}
                                                                                className={`transition-all duration-200 ${isSorted ? 'text-brand-dark dark:text-dark-heading opacity-100' : 'text-brand-inactive-text opacity-0 group-hover:opacity-40'
                                                                                    } ${isSorted && sortConfig.direction === 'desc' ? 'rotate-180' : ''}`}
                                                                            />
                                                                        )}
                                                                    </div>
                                                                </th>
                                                            );
                                                        })}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {paginated.map((c: Customer) => (
                                                        <CustomerListItem
                                                            key={c.originalId}
                                                            customer={c}
                                                            columns={COLUMNS}
                                                            selected={selection.ids.has(c.originalId)}
                                                            onSelect={handleSelectRow}
                                                            onEdit={handleEditCustomer}
                                                            onDelete={() => { }}
                                                            onDetails={handleDetailsCustomer}
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
                </div>

                {!isLoading && filteredCustomers.length > itemsPerPage && (
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
                onClear={() => setFilters(INITIAL_FILTERS)}
            />
        </motion.div>
    )
}