"use client"
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SearchIcon, ChevronDownIcon, EditIcon, PlusIcon, SparklesIcon, CheckCircleIcon, MoreHorizontalIcon, ArchiveIcon, ShareIcon, StarIcon, Package, CreditCardIcon, CopyIcon, ChevronLeftIcon, ChevronRightIcon, FileIcon, StoreIcon, ThreeDotsIcon, TrashIcon, ClockIcon, MapPin } from '@/lib/icons';
import { Button } from '@/components/reusable/Button';
import { Badge } from '@/components/reusable/Badge';
import { Input as FormInput } from '@/components/reusable/Input';
import Dropdown, { DropdownItem } from '@/components/reusable/Dropdown';
import { Checkbox as FormCheckbox } from '@/components/reusable/Checkbox';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/reusable/Tabs';
import { useNotification } from '@/hooks/use-notification';
import IconPlaceholder from '@/components/reusable/IconPlaceholder';
import { getCustomerOrdersAction } from '@/app/actions/erp/customers';

interface Props { customer: any; onBack: () => void; }

// Sub-components
const StyledDropdownItem: React.FC<{ onClick?: () => void; children: React.ReactNode; className?: string }> = ({ onClick, children, className }) => (
    <div
        className={`flex items-center gap-2 px-3 py-2 text-sm font-medium cursor-pointer rounded-md hover:bg-gray-100 dark:hover:bg-dark-border transition-colors ${className}`}
        onClick={(e) => { e.stopPropagation(); onClick?.(); }}
    >
        {children}
    </div>
);

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
    const displayedOrders = fetchedOrders;

    return (
        <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden transition-colors duration-300">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full w-full">
                <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-24 md:pb-8 scroll-smooth no-scrollbar">

                    {/* Sticky Header */}
                    <div className="sticky top-0 z-30 w-full bg-white dark:bg-dark-surface border-b border-brand-border dark:border-dark-border transition-all duration-300">
                        <div className="max-w-[1400px] mx-auto relative px-4 md:px-8 md:pt-6">

                            {/* Back button — desktop only */}
                            <div className={`absolute -left-12 top-8 h-full hidden xl:flex justify-center transition-all duration-300 ${isScrolled ? "scale-90" : "scale-100"}`}>
                                <Button variant="ghost" onClick={onBack} className="w-10 h-10 p-0 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-dark-border">
                                    <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                </Button>
                            </div>

                            {/* Title row */}
                            <div className="hidden md:flex items-start justify-between">
                                <div className="flex flex-col gap-1 overflow-hidden min-w-0 mb-6">
                                    <h1 className={`font-bold text-brand-dark dark:text-dark-heading transition-all duration-300 flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                        <span className="truncate">{customer.name}</span>
                                        <Badge variant="green" className="text-[10px] uppercase tracking-wider">Ativo</Badge>
                                    </h1>

                                    <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-300 overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100 mt-1"}`}>
                                        {customer.email || 'Sem e-mail cadastrado'} • Cliente desde 17 Mar, 2023
                                    </div>
                                </div>

                                {/* Desktop action buttons */}
                                <div className="hidden md:flex items-center gap-3 flex-shrink-0 ml-3">
                                    <Dropdown
                                        align="right"
                                        showChevron={false}
                                        trigger={
                                            <Button variant="outline" className="w-10 h-10 p-0 flex items-center justify-center bg-transparent">
                                                <ThreeDotsIcon className="w-5 h-5" />
                                            </Button>
                                        }
                                    >
                                        <StyledDropdownItem><ShareIcon className="w-[18px] h-[18px]" /> Compartilhar</StyledDropdownItem>
                                        <StyledDropdownItem className="text-brand-orange"><ArchiveIcon className="w-[18px] h-[18px]" /> Suspender</StyledDropdownItem>
                                        <StyledDropdownItem className="text-brand-red"><TrashIcon className="w-[18px] h-[18px]" /> Excluir</StyledDropdownItem>
                                    </Dropdown>
                                    <Button className="px-6 h-[42px] flex items-center gap-2">
                                        <EditIcon className="w-4.5 h-4.5" />
                                        Editar Cliente
                                    </Button>
                                </div>
                            </div>

                            {/* Mobile Title Row */}
                            <div className="md:hidden flex items-center gap-3 py-4">
                                <button onClick={onBack} className="p-2 -ml-2 text-brand-inactive-text">
                                    <ChevronLeftIcon size={24} />
                                </button>
                                <div className="flex flex-col min-w-0">
                                    <h1 className="text-xl font-bold text-brand-dark dark:text-dark-heading truncate">{customer.name}</h1>
                                    <span className="text-[10px] font-bold uppercase tracking-tight text-brand-green">Ativo</span>
                                </div>
                            </div>

                            {/* Tabs Trigger */}
                            <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
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
                            <div className={`col-span-12 lg:col-span-8 ${isInformationTab ? 'hidden lg:block' : 'block'}`}>
                                <TabsContent value="Purchase History" className="mt-0">
                                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                                        {/* Purchase Summary Cards */}
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
                                            {[
                                                { label: 'Total Gasto', value: `R$ ${(customer.totalOrderValue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, icon: PlusIcon, color: 'brand-green' },
                                                { label: 'Pedidos', value: customer.orders || 0, icon: Package, color: 'brand-dark' },
                                                { label: 'Crédito em Loja', value: `R$ ${(customer.storeCredit || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, icon: CreditCardIcon, color: 'brand-primary' },
                                                { label: 'Última Compra', value: customer.lastOrderDate || 'N/A', icon: ClockIcon, color: 'brand-inactive-text' }
                                            ].map((stat, i) => (
                                                <div key={i} className="bg-white dark:bg-dark-surface p-5 rounded-2xl border border-brand-border dark:border-dark-border shadow-sm group hover:shadow-md transition-all duration-300">
                                                    <span className="text-[11px] font-bold text-brand-inactive-text uppercase tracking-widest block mb-2">{stat.label}</span>
                                                    <div className="flex items-end justify-between">
                                                        <span className="text-xl font-bold text-brand-dark dark:text-dark-heading">{stat.value}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="w-full overflow-hidden rounded-2xl border border-brand-border dark:border-dark-border shadow-sm">
                                            <table className="w-full text-left border-collapse">
                                                <thead>
                                                    <tr className="bg-gray-50 dark:bg-dark-surface border-b border-brand-border dark:border-dark-border text-[11px] font-bold text-brand-inactive-text uppercase tracking-widest">
                                                        <th className="py-4 px-6">Pedido</th>
                                                        <th className="py-4 px-6">Data</th>
                                                        <th className="py-4 px-6">Itens</th>
                                                        <th className="py-4 px-6">Status</th>
                                                        <th className="py-4 px-6 text-right">Total</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {isLoadingOrders ? (
                                                        <tr>
                                                            <td colSpan={5} className="py-20 text-center"><div className="w-8 h-8 border-2 border-brand-green border-t-transparent rounded-full animate-spin mx-auto" /></td>
                                                        </tr>
                                                    ) : fetchedOrders.map(order => (
                                                        <tr key={order.id} className="border-b border-brand-border dark:border-dark-border hover:bg-gray-50/50 dark:hover:bg-dark-border/30 transition-colors">
                                                            <td className="py-4 px-6 font-bold text-brand-dark dark:text-dark-heading text-sm">{order.id}</td>
                                                            <td className="py-4 px-6 text-brand-inactive-text text-sm">{order.date}</td>
                                                            <td className="py-4 px-6 text-brand-inactive-text text-sm">{order.items} it{order.items > 1 ? 'ens' : 'em'}</td>
                                                            <td className="py-4 px-6"><Badge variant={order.status === 'Paid' ? 'green' : 'orange'}>{order.status === 'Paid' ? 'PAGO' : 'PENDENTE'}</Badge></td>
                                                            <td className="py-4 px-6 text-right font-bold text-brand-dark dark:text-dark-heading text-sm">R$ {order.total.toLocaleString('pt-BR')}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
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
                                        {/* ... (rest of review logic could be standardized or kept as is) */}
                                    </motion.div>
                                </TabsContent>
                            </div>

                            {/* Sidebar Column */}
                            <div className="col-span-12 lg:col-span-4 border-l border-brand-border dark:border-dark-border lg:pl-12 space-y-10">

                                <section>
                                    <div className="flex items-center justify-between mb-6">
                                        <h3 className="text-[17px] font-bold text-brand-dark dark:text-dark-heading">Observações</h3>
                                        <Button variant="ghost" size="icon" className="w-8 h-8 hover:bg-brand-orange/10 hover:text-brand-orange transition-colors"><EditIcon size={16} /></Button>
                                    </div>
                                    <div className="bg-brand-orange/5 dark:bg-brand-orange/10 p-5 rounded-2xl border-2 border-dashed border-brand-orange/20 relative group">
                                        <div className="absolute top-0 left-0 w-1 h-full bg-brand-orange rounded-full opacity-50" />
                                        <p className="text-sm text-brand-inactive-text dark:text-dark-body leading-relaxed font-medium">
                                            {customer.notes || "Nenhuma observação interna registrada para este cliente."}
                                        </p>
                                    </div>
                                </section>

                                <div className="h-px bg-brand-border dark:bg-dark-border w-full" />

                                <section>
                                    <h3 className="text-[17px] font-bold text-brand-dark dark:text-dark-heading mb-6">Contato e Endereço</h3>
                                    <div className="space-y-6">
                                        <div className="flex items-center gap-4 group">
                                            <div className="w-10 h-10 rounded-xl bg-gray-50 dark:bg-dark-surface flex items-center justify-center border border-brand-border dark:border-dark-border group-hover:border-brand-dark transition-all duration-300">
                                                <ShareIcon size={18} className="text-brand-inactive-text" />
                                            </div>
                                            <div>
                                                <span className="text-[11px] font-bold text-brand-inactive-text uppercase tracking-widest block mb-0.5">E-mail</span>
                                                <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{customer.email || "Sem e-mail"}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4 group">
                                            <div className="w-10 h-10 rounded-xl bg-gray-50 dark:bg-dark-surface flex items-center justify-center border border-brand-border dark:border-dark-border group-hover:border-brand-dark transition-all duration-300">
                                                <MapPin size={18} className="text-brand-inactive-text" />
                                            </div>
                                            <div>
                                                <span className="text-[11px] font-bold text-brand-inactive-text uppercase tracking-widest block mb-0.5">Endereço Principal</span>
                                                <span className="text-sm font-bold text-brand-dark dark:text-dark-heading leading-tight block truncate max-w-[200px]">Rua das Palmeiras, 123 - Centro</span>
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                <div className="mt-8 pt-8 border-t border-brand-border dark:border-dark-border">
                                    <p className="text-[11px] text-brand-inactive-text italic leading-relaxed">
                                        * Cliente cadastrado em 17/03/2023. Última movimentação em {customer.lastOrderDate || 'recentemente'}.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Mobile Bottom Action Bar */}
                <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-gray-200 dark:border-dark-border px-4 py-3 flex gap-3 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
                    <Dropdown
                        showChevron={false}
                        trigger={
                            <Button variant="outline" className="flex-1 h-[48px] font-bold">
                                <ThreeDotsIcon className="w-4 h-4 mr-2" />
                                Opções
                            </Button>
                        }
                    >
                        <StyledDropdownItem><ShareIcon className="w-[18px] h-[18px]" /> Compartilhar</StyledDropdownItem>
                        <StyledDropdownItem className="text-brand-orange"><ArchiveIcon className="w-[18px] h-[18px]" /> Suspender</StyledDropdownItem>
                        <StyledDropdownItem className="text-brand-red"><TrashIcon className="w-[18px] h-[18px]" /> Excluir</StyledDropdownItem>
                    </Dropdown>
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