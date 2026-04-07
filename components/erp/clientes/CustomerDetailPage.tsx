"use client"
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EditIcon, SparklesIcon, CheckCircleIcon, ChevronLeftIcon, ThreeDotsIcon, ClockIcon, ArrowUpDownIcon } from '@/lib/icons';
import { Button, Badge, Checkbox, Tabs, TabsList, TabsTrigger, TabsContent, ActionsDropdown, InfoCard, ThreeDotsLoader } from '@/components/reusable';
import Pagination from '@/components/reusable/Pagination';
import { useNotification } from '@/hooks/use-notification';
import IconPlaceholder from '@/components/reusable/IconPlaceholder';
import { getCustomerOrdersAction } from '@/app/actions/erp/customers';
import { UserProfileImage } from '@/lib/utils/UserProfileImage';
import OrderListItem from '../orders/OrderListItem';
import { useRouter } from 'next/navigation';

const COLUMNS: { id: string; label: string; align: "left" | "center" | "right"; width: string }[] = [
    { id: "order_id", label: "Pedido", align: "left", width: "200px" },
    { id: "total", label: "Total", align: "left", width: "150px" },
    { id: "status", label: "Status", align: "left", width: "220px" },
    { id: "date", label: "Data", align: "left", width: "150px" },
    { id: "actions", label: "Ações", align: "center", width: "120px" },
]

interface Props {
    customer: any;
    onBack: () => void;
    onEdit?: (customer: any) => void;
}

export const CustomerDetailPage = ({ customer, onBack, onEdit }: Props) => {
    const { success: notifySuccess, error: notifyError } = useNotification();
    const [activeTab, setActiveTab] = useState('Purchase History');
    const [isScrolled, setIsScrolled] = useState(false);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5);
    }, []);

    const [fetchedOrders, setFetchedOrders] = useState<any[]>([]);
    const [isLoadingOrders, setIsLoadingOrders] = useState(true);

    // Pagination and Selection
    const router = useRouter();
    const [page, setPage] = useState(1);
    const itemsPerPage = 8;
    const [selection, setSelection] = useState({ ids: new Set<string>() });
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>({ key: 'date', direction: 'desc' });
    const tableContainerRef = useRef<HTMLDivElement>(null);
    const [scrollState, setScrollState] = useState({ left: false, right: false });

    const checkScroll = useCallback(() => {
        if (!tableContainerRef.current) return
        const { scrollLeft, scrollWidth, clientWidth } = tableContainerRef.current
        setScrollState({
            left: scrollLeft > 0,
            right: scrollLeft < scrollWidth - clientWidth - 2,
        })
    }, []);

    useEffect(() => {
        checkScroll()
        window.addEventListener("resize", checkScroll)
        return () => window.removeEventListener("resize", checkScroll)
    }, [checkScroll, fetchedOrders]);

    useEffect(() => {
        const fetchOrders = async () => {
            setIsLoadingOrders(true);
            try {
                const res = await getCustomerOrdersAction(customer.originalId);
                if (res.orders) setFetchedOrders(res.orders);
            } catch (e) {
                console.error(e);
            } finally {
                setIsLoadingOrders(false);
            }
        };
        fetchOrders();
    }, [customer.originalId]);

    const isInformationTab = activeTab === 'Information';

    const formattedOrders = useMemo(() => {
        let result = fetchedOrders.map((o: any) => {
            const statusMap: Record<string, { label: string; color: string }> = {
                paid: { label: "Pago", color: "green" },
                shipped: { label: "Enviado", color: "blue" },
                delivered: { label: "Entregue", color: "green" },
                cancelled: { label: "Cancelado", color: "gray" },
                in_process: { label: "Em análise", color: "yellow" },
                pending: { label: "Pendente", color: "gray" },
            }
            const statusInfo = statusMap[o.situation] || { label: o.status, color: "gray" }

            return {
                originalId: o.originalId,
                displayId: o.id,
                customer_name: customer.name,
                total_amount: o.total,
                statusLabel: statusInfo.label,
                statusColor: statusInfo.color,
                isUnfulfilled: (o.situation === "pending" || o.situation === "in_process"),
                formattedDate: o.date,
                items_count: o.items,
                created_at_time: new Date(o.createdAt).getTime(),
                situation: o.situation
            }
        })

        if (sortConfig) {
            result = [...result].sort((a, b) => {
                let aVal: any
                let bVal: any

                switch (sortConfig.key) {
                    case "order_id": aVal = a.displayId; bVal = b.displayId; break
                    case "total": aVal = a.total_amount; bVal = b.total_amount; break
                    case "status": aVal = a.statusLabel; bVal = b.statusLabel; break
                    case "date": aVal = a.created_at_time; bVal = b.created_at_time; break
                    default: return 0
                }

                if (aVal === bVal) return 0
                const comparison = aVal < bVal ? -1 : 1
                return sortConfig.direction === "asc" ? comparison : -comparison
            })
        }
        return result
    }, [fetchedOrders, customer.name, sortConfig])

    const totalPages = Math.ceil(formattedOrders.length / itemsPerPage);
    const paginatedOrders = formattedOrders.slice((page - 1) * itemsPerPage, page * itemsPerPage);

    const handleSelectRow = (id: string) => {
        setSelection((p: { ids: Set<string> }) => {
            const s = new Set<string>(p.ids)
            s.has(id) ? s.delete(id) : s.add(id)
            return { ids: s }
        })
    }

    const handleDetailsOrder = (order: any) => {
        router.push(`/erp/orders?id=${order.originalId}`)
    }

    return (
        <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden transition-colors duration-500 ease-in-out">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full w-full">
                <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-24 md:pb-8 scroll-smooth custom-scrollbar">

                    {/* Sticky Header */}
                    <div className="sticky top-0 z-30 w-full bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out">
                        <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">

                            {/* Back button — desktop only */}
                            <div className={`absolute -left-12 top-7 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                                <Button variant="filled" onClick={onBack} className="w-10 h-10 p-0 flex items-center justify-center">
                                    <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                </Button>
                            </div>

                            {/* Title row */}
                            <div className="hidden md:flex items-start justify-between">
                                <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                    <h1 className={`font-bold text-brand-dark dark:text-dark-heading transition-all duration-500 flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                        <span className="truncate">{customer.name}</span>
                                        <Badge variant={customer.status === 'ativo' ? 'green' : customer.status === 'inativo' ? 'gray' : 'red'} className="whitespace-nowrap scale-90 shrink-0 mt-0.5">
                                            {customer.status === 'ativo' ? 'Ativo' : customer.status === 'inativo' ? 'Inativo' : 'Bloqueado'}
                                        </Badge>
                                    </h1>

                                    <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                        ID {customer.id} • {customer.email || 'Sem e-mail'}
                                    </div>
                                </div>

                                {/* Desktop action buttons */}
                                <div className="hidden md:flex items-center gap-3 flex-shrink-0 ml-3 mt-1">
                                    <ActionsDropdown
                                        onShare={() => { }}
                                        onArchive={() => { }}
                                        onDelete={() => { }}
                                    />
                                    <Button className='whitespace-nowrap' onClick={() => onEdit?.(customer)}>
                                        <EditIcon className="w-4 h-4 mr-2" />
                                        Editar Cliente
                                    </Button>
                                </div>
                            </div>

                            {/* Mobile Title Row is hidden entirely, except for Tabs */}

                            <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"} pt-4 md:pt-0 pb-0 flex items-center`}>
                                {/* Tiny mobile back button to preserve navigation since title logic was removed */}
                                <div className="md:hidden mr-4">
                                    <button onClick={onBack} className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-50 dark:bg-dark-border text-brand-dark dark:text-dark-heading border border-gray-200 dark:border-dark-border">
                                        <ChevronLeftIcon className="w-4 h-4" />
                                    </button>
                                </div>
                                <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                    <TabsTrigger value="Purchase History">Histórico</TabsTrigger>
                                    <TabsTrigger value="Review">Avaliações</TabsTrigger>
                                    <TabsTrigger value="Information">Informações</TabsTrigger>
                                </TabsList>
                            </div>
                        </div>
                    </div>

                    {/* Content Body */}
                    <div className="px-3 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
                        <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">

                            {/* Main Column */}
                            <div className={`col-span-12 lg:col-span-8 pr-0 lg:pr-12 ${isInformationTab ? 'hidden lg:block' : 'block'}`}>
                                <TabsContent value="Purchase History" className="mt-0">
                                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
                                        {/* Unified Stats Card */}
                                        <div className="w-full bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl shadow-sm overflow-hidden mb-10 transition-all duration-300 hover:shadow-md">
                                            <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-gray-200 dark:divide-dark-border">
                                                <div className="p-6 flex flex-col justify-center">
                                                    <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body mb-1.5">Pedidos</span>
                                                    <div className="text-2xl font-bold text-brand-dark dark:text-dark-heading">
                                                        {customer.orders || 0}
                                                    </div>
                                                </div>
                                                <div className="p-6 flex flex-col justify-center">
                                                    <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body mb-1.5">Total Gasto</span>
                                                    <div className="text-2xl font-bold text-brand-dark dark:text-dark-heading">
                                                        {customer.totalOrderValue ? `$${customer.totalOrderValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : "-"}
                                                    </div>
                                                </div>
                                                <div className="p-6 flex flex-col justify-center">
                                                    <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body mb-1.5">Valor médio dos pedidos</span>
                                                    <div className="text-2xl font-bold text-brand-dark dark:text-dark-heading">
                                                        {customer.orders && customer.totalOrderValue ? `$${(customer.totalOrderValue / customer.orders).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : "-"}
                                                    </div>
                                                </div>
                                                <div className="p-6 flex flex-col justify-center">
                                                    <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body mb-1.5">Última Compra</span>
                                                    <div className="text-2xl font-bold text-brand-dark dark:text-dark-heading">
                                                        {customer.lastOrderDate || '-'}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Orders List / Table */}
                                        <div className="mt-6">
                                            <AnimatePresence mode="wait">
                                                {isLoadingOrders ? (
                                                    <div className="flex-1 flex items-center justify-center p-8 py-20">
                                                        <ThreeDotsLoader />
                                                    </div>
                                                ) : (
                                                    <div className="w-full overflow-hidden rounded-xl relative">
                                                        <div className={`absolute top-0 left-0 h-full w-12 bg-gradient-to-r from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.left ? "opacity-100" : "opacity-0"}`} />
                                                        <div className={`absolute top-0 right-0 h-full w-12 bg-gradient-to-l from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.right ? "opacity-100" : "opacity-0"}`} />

                                                        <div className="overflow-x-auto pb-4 custom-scrollbar" ref={tableContainerRef} onScroll={checkScroll}>
                                                            <table className="w-full text-left border-separate border-spacing-0 min-w-[1000px]">
                                                                <thead>
                                                                    <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                                        <th className="py-3 px-2 w-12 pl-6 rounded-l-lg bg-brand-gray dark:bg-dark-border/50">
                                                                            <div className="flex items-center">
                                                                                <Checkbox
                                                                                    checked={selection.ids.size === paginatedOrders.length && paginatedOrders.length > 0}
                                                                                    onChange={(checked) => {
                                                                                        setSelection({ ids: checked ? new Set(paginatedOrders.map((x: any) => x.originalId)) : new Set() })
                                                                                    }}
                                                                                    className="bg-white dark:bg-dark-background"
                                                                                />
                                                                            </div>
                                                                        </th>
                                                                        {COLUMNS.map((col, idx) => {
                                                                            const isSortable = col.id !== 'actions';
                                                                            const isSorted = sortConfig?.key === col.id;
                                                                            const isLast = idx === COLUMNS.length - 1;

                                                                            return (
                                                                                <th
                                                                                    key={col.id}
                                                                                    className={`py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 ${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"} ${isSortable ? "cursor-pointer hover:text-gray-900 dark:hover:text-dark-heading group select-none transition-colors" : ""} ${isLast ? "rounded-r-lg" : ""}`}
                                                                                    style={{ width: col.width }}
                                                                                    onClick={() => {
                                                                                        if (!isSortable) return
                                                                                        setSortConfig((prev: any) => ({
                                                                                            key: col.id,
                                                                                            direction: prev?.key === col.id && prev.direction === 'asc' ? 'desc' : 'asc'
                                                                                        }))
                                                                                    }}
                                                                                >
                                                                                    <div className={`flex items-center gap-1.5 ${col.align === "right" ? "justify-end" : col.align === "center" ? "justify-center" : ""}`}>
                                                                                        {col.label}
                                                                                        {isSortable && (
                                                                                            <ArrowUpDownIcon
                                                                                                size={14}
                                                                                                className={`transition-all duration-200 ${isSorted ? 'text-brand-dark dark:text-dark-heading opacity-100 block' : 'text-brand-inactive-text hidden group-hover:block opacity-40'
                                                                                                    } ${isSorted && sortConfig.direction === 'desc' ? 'rotate-180' : ''}`}
                                                                                            />
                                                                                        )}
                                                                                    </div>
                                                                                </th>
                                                                            )
                                                                        })}
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {paginatedOrders.map((o: any) => (
                                                                        <OrderListItem
                                                                            key={o.originalId}
                                                                            order={o}
                                                                            columns={COLUMNS}
                                                                            selected={selection.ids.has(o.originalId)}
                                                                            onSelect={handleSelectRow}
                                                                            onEdit={() => { router.push(`/erp/orders/edit/${o.originalId}`) }}
                                                                            onDelete={() => { }}
                                                                            onCancel={() => { }}
                                                                            onDetails={handleDetailsOrder}
                                                                        />
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>
                                                )}
                                            </AnimatePresence>
                                        </div>

                                        {totalPages > 1 && (
                                            <div className="flex justify-center mt-6 w-full hidden md:flex">
                                                <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
                                            </div>
                                        )}

                                        {!isLoadingOrders && paginatedOrders.length === 0 && (
                                            <div className="mt-6 hidden md:block">
                                                <IconPlaceholder
                                                    title="Nenhum pedido encontrado"
                                                    subtitle="Este cliente ainda não realizou nenhum pedido."
                                                    imageSrc="https://img.dudit.com.br/static/mascots/SacolaVazia.png"
                                                    imageAlt='Nenhum pedido encontrado'
                                                    placeholderType="image"
                                                />
                                            </div>
                                        )}

                                    </motion.div>
                                </TabsContent>

                                <TabsContent value="Review" className="mt-0">
                                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                                        {/* Review content stays mostly the same but with standardized classes */}
                                        <div className="rounded-2xl bg-brand-green/5 dark:bg-brand-green/10 border border-brand-green/20 p-6 flex items-start gap-5 mb-10 shadow-sm relative overflow-hidden group">
                                            <div className="absolute top-0 right-0 w-32 h-32 bg-brand-green/10 rounded-full -mr-16 -mt-16 blur-3xl transition-all duration-500 group-hover:scale-150" />
                                            <div className="w-12 h-12 rounded-xl bg-brand-green/20 flex items-center justify-center flex-shrink-0">
                                                <SparklesIcon size={24} className="text-brand-green" />
                                            </div>
                                            <div className="flex-1">
                                                <h3 className="font-bold text-brand-dark dark:text-dark-heading mb-1 text-[17px]">O cliente está satisfeito</h3>
                                                <p className="text-sm text-brand-inactive-text dark:text-dark-body leading-relaxed max-w-lg">
                                                    Resumo gerado por IA: O cliente demonstra alta satisfação em compras recorrentes, destacando a qualidade e durabilidade.
                                                </p>
                                            </div>
                                        </div>
                                    </motion.div>
                                </TabsContent>
                            </div>

                            {/* Sidebar Column */}
                            <div className="col-span-12 lg:col-span-4 border-l border-brand-border dark:border-dark-border lg:pl-12 space-y-10">

                                {/* Observações utilizando o InfoCard, apenas se tiver notas */}
                                {customer.notes && (
                                    <section>
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="text-[17px] font-bold text-brand-dark dark:text-dark-heading">Observações</h3>
                                        </div>
                                        <InfoCard
                                            title="Anotação Interna"
                                            message={customer.notes}
                                            color="orange"
                                        />
                                    </section>
                                )}

                                {/* Detalhes e Contato no modelo CustomerCard */}
                                <section>
                                    <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden transition-colors shadow-sm">
                                        <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border"></div>

                                        <div className="px-6 py-5 border-b border-brand-border dark:border-dark-border bg-gray-50/50 dark:bg-dark-border/20">
                                            <h3 className="text-[17px] font-bold text-brand-dark dark:text-dark-heading">Detalhes</h3>
                                        </div>

                                        {/* Top Part: Customer Identity */}
                                        <div className="p-6 text-left">
                                            <div className="flex items-center gap-4 mb-6 mt-2">
                                                <div className="relative">
                                                    <UserProfileImage
                                                        fullName={customer.name || "Cliente"}
                                                        className="w-12 h-12 text-xl"
                                                    />
                                                </div>
                                                <div className="min-w-0">
                                                    <h4 className="font-bold text-base text-brand-dark dark:text-dark-heading truncate">{customer.name}</h4>
                                                    <p className="text-sm text-brand-inactive-text dark:text-dark-body font-medium">#{customer.id}</p>
                                                </div>
                                            </div>

                                            {/* Informações Gerais (Cliente desde, Tipo) */}
                                            <div className="space-y-3">
                                                <div className="flex justify-between items-center py-2.5 border-b border-brand-border dark:border-dark-border">
                                                    <span className="text-[13px] text-brand-inactive-text dark:text-dark-body font-semibold tracking-wider">Cliente desde</span>
                                                    <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading">
                                                        {customer.createdAt ? new Date(customer.createdAt).toLocaleDateString('pt-BR', { month: 'short', day: 'numeric', year: 'numeric' }).replace(' de ', ', ') : '-'}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-center py-2.5">
                                                    <span className="text-sm text-brand-inactive-text dark:text-dark-body font-semibold tracking-wider">Tipo de Pessoa</span>
                                                    <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{customer.personType === 'pj' || customer.cnpj ? 'Pessoa Jurídica' : 'Pessoa Física'}</span>
                                                </div>

                                                {(customer.personType === 'pj' || customer.cnpj) ? (
                                                    <div className="mt-2 pt-2 border-t border-gray-100 dark:border-dark-border/50 space-y-2.5">
                                                        {customer.cnpj && (
                                                            <div className="flex justify-between items-center">
                                                                <span className="text-sm text-brand-inactive-text dark:text-dark-body font-medium">CNPJ</span>
                                                                <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{customer.cnpj}</span>
                                                            </div>
                                                        )}
                                                        {customer.nomeFantasia && (
                                                            <div className="flex justify-between items-center">
                                                                <span className="text-sm text-brand-inactive-text dark:text-dark-body font-medium">Fantasia</span>
                                                                <span className="text-sm font-bold text-brand-dark dark:text-dark-heading text-right max-w-[60%] truncate">{customer.nomeFantasia}</span>
                                                            </div>
                                                        )}
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-sm text-brand-inactive-text dark:text-dark-body font-medium">Insc. Est.</span>
                                                            <span className="text-sm font-bold text-brand-dark dark:text-dark-heading text-right">{customer.inscricaoEstadual || 'Isento'}</span>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <>
                                                        {customer.cpf && (
                                                            <div className="mt-2 pt-2 border-t border-b border-brand-border dark:border-dark-border flex justify-between items-center">
                                                                <span className="text-sm text-brand-inactive-text dark:text-dark-body font-medium">CPF</span>
                                                                <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{customer.cpf}</span>
                                                            </div>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        </div>

                                        <div className="border-t border-brand-border dark:border-dark-border w-full"></div>

                                        {/* Bottom Part: Shipping Address */}
                                        <div className="p-6 text-left">
                                            <div className="flex justify-between items-center mb-4">
                                                <h3 className="font-bold text-lg text-brand-dark dark:text-dark-heading">
                                                    Endereço
                                                </h3>
                                            </div>

                                            {customer.address ? (
                                                <>
                                                    {/* Map Placeholder */}
                                                    <div className="w-full h-24 bg-blue-50 dark:bg-gray-800 rounded-lg mb-4 overflow-hidden relative border border-blue-100 dark:border-gray-700 group cursor-pointer">
                                                        <img src="https://img.dudit.com.br/static/maps/MapSample.png" className="w-full h-full object-cover opacity-60" alt="Map" />
                                                        <div className="absolute inset-0 flex items-center justify-center">
                                                            <div className="w-6 h-6 bg-brand-green rounded-full border-2 border-white flex items-center justify-center text-white">
                                                                <div className="w-2 h-2 bg-white rounded-full"></div>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="mb-0">
                                                        <div className="flex justify-between items-start mb-1">
                                                            <h4 className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate pr-2">Endereço Principal</h4>
                                                            <a href="#" className="text-xs font-bold text-brand-dark dark:text-dark-heading underline decoration-brand-dark dark:decoration-dark-heading flex-shrink-0">Ver Mapa</a>
                                                        </div>
                                                        <p className="text-[14px] text-brand-inactive-text dark:text-dark-body leading-relaxed">
                                                            {customer.address}
                                                        </p>
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="bg-brand-gray/30 dark:bg-dark-border/30 rounded-lg p-4 text-center">
                                                    <p className="text-sm text-brand-inactive-text dark:text-dark-body italic">
                                                        Nenhum endereço cadastrado para este cliente.
                                                    </p>
                                                </div>
                                            )}

                                            <div className="mt-6 pt-6 border-t border-brand-border dark:border-dark-border">
                                                <div className="flex justify-between items-center mb-4">
                                                    <h3 className="font-bold text-lg text-brand-dark dark:text-dark-heading">Contato</h3>
                                                </div>

                                                {(customer.email || customer.phone || customer.mobile) ? (
                                                    <div className="space-y-3">
                                                        {customer.email && (
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-sm font-medium text-[#1e40af] dark:text-[#60a5fa] bg-blue-50 dark:bg-blue-900/20 px-3 py-1.5 rounded-lg border border-blue-100 dark:border-blue-900/30 truncate w-full">
                                                                    {customer.email}
                                                                </span>
                                                            </div>
                                                        )}
                                                        {(customer.phone || customer.mobile) && (
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-sm font-medium text-[#1e40af] dark:text-[#60a5fa] bg-blue-50 dark:bg-blue-900/20 px-3 py-1.5 rounded-lg border border-blue-100 dark:border-blue-900/30 w-fit">
                                                                    {customer.phone || customer.mobile}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="bg-brand-gray/30 dark:bg-dark-border/30 rounded-lg p-4 text-center">
                                                        <p className="text-sm text-brand-inactive-text dark:text-dark-body italic">
                                                            Nenhuma informação de contato disponível.
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </section>

                            </div>
                        </div>
                    </div>
                </div>

                {/* Mobile Bottom Action Bar */}
                <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-gray-200 dark:border-dark-border px-4 py-3 flex gap-3 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
                    <ActionsDropdown
                        onShare={() => { }}
                        onArchive={() => { }}
                        onDelete={() => { }}
                        trigger={
                            <Button variant="outline" className="flex-1 h-[48px] font-bold">
                                <ThreeDotsIcon className="w-4 h-4 mr-2" />
                                Opções
                            </Button>
                        }
                    />
                    <Button
                        className="flex-1 h-[48px] font-bold"
                        onClick={() => onEdit?.(customer)}
                    >
                        <EditIcon className="w-4 h-4 mr-2" />
                        Editar
                    </Button>
                </div>
            </Tabs >
        </div >
    );
};

export default CustomerDetailPage;