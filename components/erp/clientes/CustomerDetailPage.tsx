"use client"
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { EditIcon, SparklesIcon, CheckCircleIcon, ChevronLeftIcon, ThreeDotsIcon, ClockIcon } from '@/lib/icons';
import { Button, Badge, Checkbox, Tabs, TabsList, TabsTrigger, TabsContent, ActionsDropdown, InfoCard } from '@/components/reusable';
import Pagination from '@/components/reusable/Pagination';
import { useNotification } from '@/hooks/use-notification';
import IconPlaceholder from '@/components/reusable/IconPlaceholder';
import { getCustomerOrdersAction } from '@/app/actions/erp/customers';

interface Props { customer: any; onBack: () => void; }

export const CustomerDetailPage = ({ customer, onBack }: Props) => {
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
    const [page, setPage] = useState(1);
    const itemsPerPage = 8;
    const [selection, setSelection] = useState<Set<string>>(new Set());

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

    const totalPages = Math.ceil(fetchedOrders.length / itemsPerPage);
    const paginatedOrders = fetchedOrders.slice((page - 1) * itemsPerPage, page * itemsPerPage);

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
                                    <Button>
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
                                            <div className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-gray-200 dark:divide-dark-border">
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
                                        <div className="w-full bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-border shadow-sm overflow-hidden hidden md:block mt-6">
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-left">
                                                    <thead>
                                                        <tr className="bg-gray-50 dark:bg-dark-surface border-b border-brand-border dark:border-dark-border">
                                                            <th className="py-4 px-4 w-12 pl-6 relative">
                                                                <div className="flex items-center">
                                                                    <Checkbox
                                                                        checked={selection.size === paginatedOrders.length && paginatedOrders.length > 0}
                                                                        onChange={(e) => {
                                                                            if (selection.size === paginatedOrders.length) {
                                                                                setSelection(new Set());
                                                                            } else {
                                                                                setSelection(new Set(paginatedOrders.map((o: any) => o.id)));
                                                                            }
                                                                        }}
                                                                    />
                                                                </div>
                                                            </th>
                                                            <th className="py-4 px-2 text-[13px] font-bold text-brand-inactive-text dark:text-dark-body">Pedido</th>
                                                            <th className="py-4 px-2 text-[13px] font-bold text-brand-inactive-text dark:text-dark-body">Data</th>
                                                            <th className="py-4 px-2 text-[13px] font-bold text-brand-inactive-text dark:text-dark-body">Itens</th>
                                                            <th className="py-4 px-2 text-[13px] font-bold text-brand-inactive-text dark:text-dark-body text-center">Status</th>
                                                            <th className="py-4 px-2 text-[13px] font-bold text-brand-inactive-text dark:text-dark-body text-right pr-6">Total</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {isLoadingOrders ? (
                                                            <tr>
                                                                <td colSpan={6} className="py-20 text-center"><div className="w-8 h-8 border-2 border-brand-green border-t-transparent rounded-full animate-spin mx-auto" /></td>
                                                            </tr>
                                                        ) : paginatedOrders.map(order => (
                                                            <tr key={order.id} className="border-b border-brand-border dark:border-dark-border hover:bg-gray-50/50 dark:hover:bg-dark-border/30 transition-colors group">
                                                                <td className="py-4 px-4 w-12 pl-6">
                                                                    <Checkbox
                                                                        checked={selection.has(order.id)}
                                                                        onChange={() => {
                                                                            setSelection(prev => {
                                                                                const newSet = new Set(prev);
                                                                                if (newSet.has(order.id)) newSet.delete(order.id);
                                                                                else newSet.add(order.id);
                                                                                return newSet;
                                                                            });
                                                                        }}
                                                                    />
                                                                </td>
                                                                <td className="py-4 px-2 font-bold text-brand-dark dark:text-dark-heading text-[14.5px]">
                                                                    {order.id}
                                                                </td>
                                                                <td className="py-4 px-2 text-brand-inactive-text dark:text-dark-body text-[14.5px]">
                                                                    {order.date}
                                                                </td>
                                                                <td className="py-4 px-2 text-brand-inactive-text dark:text-dark-body text-[14.5px]">
                                                                    {order.items} item(s)
                                                                </td>
                                                                <td className="py-4 px-2 text-center">
                                                                    <Badge variant={order.status === 'Paid' ? 'green' : 'orange'} className="scale-90 whitespace-nowrap px-3 py-1 text-[11px] font-bold">
                                                                        <div className="flex items-center gap-1.5">
                                                                            {order.status === 'Paid' ? <CheckCircleIcon className="w-3 h-3" /> : <ClockIcon className="w-3 h-3" />}
                                                                            {order.status === 'Paid' ? 'Paid' : 'Pending'}
                                                                        </div>
                                                                    </Badge>
                                                                </td>
                                                                <td className="py-4 px-2 text-right font-bold text-brand-dark dark:text-dark-heading text-[14.5px] pr-6">
                                                                    ${order.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>

                                        {totalPages > 1 && (
                                            <div className="flex justify-center mt-6 w-full hidden md:flex">
                                                <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
                                            </div>
                                        )}

                                        {!isLoadingOrders && paginatedOrders.length === 0 && (
                                            <div className="py-12 border border-brand-border dark:border-dark-border rounded-xl mt-6 hidden md:block">
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
                                    <h3 className="text-[17px] font-bold text-brand-dark dark:text-dark-heading mb-6">Detalhes</h3>
                                    <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden transition-colors shadow-sm">
                                        <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border"></div>

                                        {/* Top Part: Customer Identity */}
                                        <div className="p-6 text-left">
                                            <div className="flex items-center gap-4 mb-6 mt-2">
                                                <div className="relative">
                                                    <div className="w-12 h-12 rounded-full bg-brand-slate dark:bg-dark-border flex items-center justify-center text-xl font-bold text-brand-dark dark:text-dark-heading border border-white dark:border-dark-border overflow-hidden uppercase text-brand-inactive-text">
                                                        {customer.avatar ? (
                                                            <img src={customer.avatar} alt={customer.name} className="w-full h-full object-cover" />
                                                        ) : (
                                                            customer?.name?.charAt(0) || 'C'
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="min-w-0">
                                                    <h4 className="font-bold text-base text-brand-dark dark:text-dark-heading truncate">{customer.name}</h4>
                                                    <p className="text-sm text-brand-inactive-text dark:text-dark-body font-medium">#{customer.id}</p>
                                                </div>
                                            </div>

                                            {/* Informações Gerais (Cliente desde, Tipo) */}
                                            <div className="space-y-3">
                                                <div className="flex justify-between items-center py-2.5 border-b border-gray-100 dark:border-dark-border/50">
                                                    <span className="text-[13px] text-brand-inactive-text dark:text-dark-body font-semibold uppercase tracking-wider">Cliente desde</span>
                                                    <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading">
                                                        {customer.createdAt ? new Date(customer.createdAt).toLocaleDateString('pt-BR', { month: 'short', day: 'numeric', year: 'numeric' }).replace(' de ', ', ') : '-'}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-center py-2.5">
                                                    <span className="text-[13px] text-brand-inactive-text dark:text-dark-body font-semibold uppercase tracking-wider">Tipo de Pessoa</span>
                                                    <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading">{customer.personType === 'pj' || customer.cnpj ? 'Pessoa Jurídica' : 'Pessoa Física'}</span>
                                                </div>

                                                {(customer.personType === 'pj' || customer.cnpj) ? (
                                                    <div className="mt-2 pt-2 border-t border-gray-100 dark:border-dark-border/50 space-y-2.5">
                                                        {customer.cnpj && (
                                                            <div className="flex justify-between items-center">
                                                                <span className="text-[13px] text-brand-inactive-text dark:text-dark-body font-medium">CNPJ</span>
                                                                <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading">{customer.cnpj}</span>
                                                            </div>
                                                        )}
                                                        {customer.nomeFantasia && (
                                                            <div className="flex justify-between items-center">
                                                                <span className="text-[13px] text-brand-inactive-text dark:text-dark-body font-medium">Fantasia</span>
                                                                <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading text-right max-w-[60%] truncate">{customer.nomeFantasia}</span>
                                                            </div>
                                                        )}
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-[13px] text-brand-inactive-text dark:text-dark-body font-medium">Insc. Est.</span>
                                                            <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading text-right">{customer.inscricaoEstadual || 'Isento'}</span>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <>
                                                        {customer.cpf && (
                                                            <div className="mt-2 pt-2 border-t border-gray-100 dark:border-dark-border/50 flex justify-between items-center">
                                                                <span className="text-[13px] text-brand-inactive-text dark:text-dark-body font-medium">CPF</span>
                                                                <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading">{customer.cpf}</span>
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
                                                <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading uppercase tracking-wide">
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
                                                        Nenhum endereço cadastrado.
                                                    </p>
                                                </div>
                                            )}

                                            <div className="mt-6 pt-6 border-t border-brand-border dark:border-dark-border">
                                                <div className="flex justify-between items-center mb-4">
                                                    <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading uppercase tracking-wide">Contato</h3>
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
                                                            Nenhum contato disponível.
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
                    >
                        <EditIcon className="w-4 h-4 mr-2" />
                        Editar
                    </Button>
                </div>
            </Tabs>
        </div>
    );
};

export default CustomerDetailPage;