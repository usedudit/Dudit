"use client"

import React, { useState, useEffect, useMemo } from 'react';
import { SearchIcon, UserIcon, PlusIcon, XIcon, CheckCircleIcon } from '@/lib/icons';
import { Button, Input, IconPlaceholder } from '@/components/reusable';
import Portal from "@/components/Portal";
import BottomSheet from "@/components/BottomSheet";
import { useMediaQuery } from "@/components/erp/hooks";
import { searchCustomersForQuote } from '@/app/actions/erp/quotes';

export type PinnedCustomerSummary = {
    id: string;
    name: string;
    email?: string | null;
};

interface SelectCustomerSheetProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (customer: any) => void;
    partnerId: string;
    selectedCustomerId?: string;
    pinnedCustomer?: PinnedCustomerSummary | null;
    onRequestRemoveSelected?: () => void;
    title?: string;
}

const SelectCustomerSheet = ({
    isOpen,
    onClose,
    onSelect,
    partnerId: _partnerId,
    selectedCustomerId,
    pinnedCustomer,
    onRequestRemoveSelected,
    title = "Selecionar Cliente",
}: SelectCustomerSheetProps) => {
    const [search, setSearch] = useState('');
    const [customers, setCustomers] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const isMobile = useMediaQuery("(max-width: 768px)");

    const fetchCustomers = async (query: string) => {
        setIsLoading(true);
        try {
            const results = await searchCustomersForQuote(query);
            setCustomers(results);
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchCustomers('');
        }
    }, [isOpen]);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (isOpen) fetchCustomers(search);
        }, 300);
        return () => clearTimeout(timer);
    }, [search, isOpen]);

    const orderedCustomers = useMemo(() => {
        if (!selectedCustomerId || !pinnedCustomer || pinnedCustomer.id !== selectedCustomerId) {
            return customers;
        }
        const rest = customers.filter((c) => c.id !== selectedCustomerId);
        const inList = customers.find((c) => c.id === selectedCustomerId);
        const head = inList || pinnedCustomer;
        return [head, ...rest];
    }, [customers, selectedCustomerId, pinnedCustomer]);

    const content = (
        <div className="flex flex-col h-full bg-white dark:bg-dark-surface">
            <header className="border-b border-brand-border dark:border-dark-border p-6 flex justify-between items-center bg-white dark:bg-dark-surface z-10 shrink-0">
                <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">{title}</h2>
                <Button variant="ghost" onClick={onClose} size="icon">
                    <XIcon className="w-5 h-5" />
                </Button>
            </header>

            <div className="p-6 border-b border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface z-10 shrink-0">
                <Input
                    label=""
                    name="customerSearch"
                    placeholder="Buscar por nome ou email..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
                    className="mb-0"
                />
            </div>

            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                {selectedCustomerId && pinnedCustomer && onRequestRemoveSelected && (
                    <div className="mb-4 rounded-xl border border-brand-primary/40 bg-brand-primary/5 p-4 dark:border-brand-primary/30 dark:bg-brand-primary/10">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-xs font-bold uppercase tracking-wide text-brand-primary">Cliente atual</p>
                                <p className="mt-1 font-bold text-brand-dark dark:text-dark-heading">{pinnedCustomer.name}</p>
                                <p className="text-sm text-brand-inactive-text dark:text-dark-body">{pinnedCustomer.email || "Sem email"}</p>
                            </div>
                            <Button variant="outline" size="sm" className="shrink-0" onClick={onRequestRemoveSelected}>
                                Remover
                            </Button>
                        </div>
                    </div>
                )}

                {isLoading ? (
                    <div className="flex flex-col gap-3">
                        {[1, 2, 3, 4, 5].map(i => (
                            <div key={i} className="h-16 w-full animate-pulse bg-gray-100 dark:bg-dark-border rounded-xl" />
                        ))}
                    </div>
                ) : orderedCustomers.length > 0 ? (
                    <div className="flex flex-col gap-2">
                        {orderedCustomers.map(customer => {
                            const isSelected = selectedCustomerId === customer.id;
                            return (
                            <button
                                key={customer.id}
                                onClick={() => onSelect(customer)}
                                className={`flex items-center gap-4 p-3 rounded-xl transition-all text-left border group ${
                                    isSelected
                                        ? "border-brand-primary bg-brand-primary/10 dark:bg-brand-primary/15"
                                        : "border-transparent hover:bg-brand-gray/30 dark:hover:bg-dark-border/30 hover:border-brand-border dark:hover:border-dark-border"
                                }`}
                            >
                                <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-gray-800 flex items-center justify-center text-lg font-bold text-brand-inactive-text border border-brand-border dark:border-dark-border overflow-hidden">
                                    {customer.name.charAt(0)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <h4 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading leading-tight truncate group-hover:text-brand-primary transition-colors">{customer.name}</h4>
                                        {isSelected && (
                                            <span className="inline-flex items-center gap-0.5 shrink-0 rounded-full bg-brand-primary/15 px-2 py-0.5 text-[11px] font-bold text-brand-primary">
                                                <CheckCircleIcon size={12} /> Selecionado
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body truncate">{customer.email || 'Sem email'}</p>
                                </div>
                                {!isSelected && (
                                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-brand-inactive-text opacity-0 group-hover:opacity-100 transition-opacity">
                                        <PlusIcon size={18} />
                                    </div>
                                )}
                            </button>
                            );
                        })}
                    </div>
                ) : (
                    <div className="py-12">
                        <IconPlaceholder
                            icon={UserIcon}
                            title="Nenhum cliente encontrado"
                            subtitle="Tente outro termo de busca ou cadastre um novo cliente."
                            itemButton={{
                                text: "Cadastrar Novo Cliente",
                                action: () => { /* Logic for new customer */ },
                                variant: "outline"
                            }}
                        />
                    </div>
                )}
            </div>

            <footer className="p-6 border-t border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface shrink-0">
                <Button variant="outline" className="w-full h-12" onClick={onClose}>
                    Cancelar
                </Button>
            </footer>
        </div>
    );

    if (isMobile) {
        return (
            <BottomSheet isOpen={isOpen} onClose={onClose}>
                {content}
            </BottomSheet>
        );
    }

    return (
        <Portal>
            <div
                className={`fixed inset-0 bg-black/50 z-50 transition-opacity ${isOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
                onClick={onClose}
            >
                <div
                    className={`fixed right-4 top-4 bottom-4 w-[450px] bg-white dark:bg-dark-surface shadow-2xl rounded-2xl transition-transform duration-300 overflow-hidden ${isOpen ? "translate-x-0" : "translate-x-[120%]"}`}
                    onClick={(e) => e.stopPropagation()}
                >
                    {content}
                </div>
            </div>
        </Portal>
    );
};

export default SelectCustomerSheet;
