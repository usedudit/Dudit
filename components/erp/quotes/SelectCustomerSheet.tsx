"use client"

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XIcon, SearchIcon, PlusIcon, UserIcon, CloseIcon } from '@/lib/icons';
import { Button, Input as FormInput, Spinner } from '@/components/reusable';
import IconPlaceholder from '@/components/reusable/IconPlaceholder';
import { searchCustomersForQuote } from '@/app/actions/erp/quotes';
import Portal from '@/components/Portal';
import BottomSheet from '@/components/BottomSheet';
import { useMediaQuery } from '@/components/erp/hooks';

interface SelectCustomerSheetProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (customer: any) => void;
    onAddNew?: () => void;
}

const SelectCustomerSheet = ({ isOpen, onClose, onSelect, onAddNew }: SelectCustomerSheetProps) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [customers, setCustomers] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const isMobile = useMediaQuery("(max-width: 768px)");

    useEffect(() => {
        if (!isOpen) return;

        let isMounted = true;
        const fetchCustomers = async () => {
            setIsSearching(true);
            try {
                const results = await searchCustomersForQuote(searchQuery);
                if (isMounted) {
                    setCustomers(results);
                }
            } catch (error) {
                console.error("Error fetching customers:", error);
                if (isMounted) {
                    setCustomers([]);
                }
            } finally {
                if (isMounted) {
                    setIsSearching(false);
                }
            }
        };

        const timeoutId = setTimeout(fetchCustomers, 400); // 400ms debounce
        return () => {
            isMounted = false;
            clearTimeout(timeoutId);
        };
    }, [searchQuery, isOpen]);

    // Reset state when opening/closing
    useEffect(() => {
        if (isOpen) {
            setSearchQuery('');
        }
    }, [isOpen]);

    const content = (
        <div className="flex flex-col h-full bg-white dark:bg-dark-surface shadow-2xl rounded-2xl overflow-hidden">
            <header className="border-b border-brand-border dark:border-dark-border p-6 flex justify-between items-center bg-white dark:bg-dark-surface z-10">
                <h2 className="text-xl font-bold dark:text-dark-heading">Selecionar Cliente</h2>
                <Button variant="ghost" onClick={onClose} size="icon" className="rounded-full hover:bg-brand-gray dark:hover:bg-dark-border">
                    <XIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                </Button>
            </header>

            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-6">
                <div className="sticky top-0 bg-white dark:bg-dark-surface z-10 pb-4">
                    <FormInput
                        label=""
                        name="clientSearch"
                        placeholder="Pesquisar cliente por nome ou email..."
                        prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
                        autoFocus
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="mb-0"
                    />
                </div>

                <div className="space-y-3">
                    {onAddNew && searchQuery && (
                        <button
                            onClick={onAddNew}
                            className="w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-brand-gray dark:hover:bg-dark-border/50 transition-all text-left border border-brand-border dark:border-dark-border group shadow-sm bg-white dark:bg-dark-surface"
                        >
                            <div className="w-12 h-12 rounded-full bg-brand-primary/10 flex items-center justify-center text-brand-primary group-hover:scale-110 transition-transform">
                                <PlusIcon size={24} strokeWidth={2.5} />
                            </div>
                            <div className="flex flex-col">
                                <span className="font-bold text-[15px] text-brand-dark dark:text-dark-heading">Novo Cliente</span>
                                <span className="text-[12px] font-medium text-brand-inactive-text dark:text-dark-body">Cadastrar "{searchQuery}" como novo cliente</span>
                            </div>
                        </button>
                    )}

                    {isSearching ? (
                        <div className="flex flex-col justify-center items-center py-16 gap-3">
                            <Spinner size={32} className="text-brand-primary" />
                            <span className="text-sm font-medium text-brand-inactive-text">Buscando clientes...</span>
                        </div>
                    ) : customers.length > 0 ? (
                        <div className="grid grid-cols-1 gap-3">
                            {customers.map(c => (
                                <button
                                    key={c.id}
                                    onClick={() => { onSelect(c); onClose(); }}
                                    className="w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-brand-gray dark:hover:bg-dark-border/50 transition-all text-left border border-transparent hover:border-brand-border dark:hover:border-dark-border group bg-white dark:bg-dark-surface"
                                >
                                    <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border flex items-center justify-center text-lg font-bold text-brand-dark dark:text-dark-heading border border-brand-border dark:border-dark-border shrink-0 overflow-hidden shadow-sm group-hover:scale-105 transition-transform">
                                        {c.avatar ? (
                                            <img src={c.avatar} className="w-full h-full object-cover" />
                                        ) : (
                                            <span className="text-brand-inactive-text">{c.name.charAt(0).toUpperCase()}</span>
                                        )}
                                    </div>
                                    <div className="flex flex-col flex-1 truncate">
                                        <div className="font-bold text-[15px] text-brand-dark dark:text-dark-heading truncate group-hover:text-brand-primary transition-colors">{c.name}</div>
                                        <div className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body truncate">{c.email || c.phone || 'Sem contato vinculado'}</div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="py-12 px-4">
                            <IconPlaceholder
                                icon={UserIcon}
                                title={searchQuery ? "Nenhum cliente encontrado" : "Nenhum cliente"}
                                subtitle={searchQuery ? `Não encontramos nenhum cliente correspondente a "${searchQuery}".` : "Sua lista de clientes cadastrados aparecerá aqui."}
                                itemButton={onAddNew ? {
                                    text: "Cadastrar Novo Cliente",
                                    action: onAddNew,
                                    variant: "outline"
                                } : undefined}
                            />
                        </div>
                    )}
                </div>
            </div>

            <footer className="border-t border-brand-border dark:border-dark-border p-6 bg-brand-gray/20 dark:bg-dark-surface">
                <Button
                    variant="outline"
                    onClick={onClose}
                    className="w-full rounded-full h-12 font-bold text-[15px]"
                >
                    Fechar
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
                className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-50 transition-opacity duration-300 ${isOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
                onClick={onClose}
            >
                <div
                    className={`fixed right-4 top-4 bottom-4 w-[480px] bg-white dark:bg-dark-surface shadow-2xl rounded-3xl transition-transform duration-500 ease-out overflow-hidden ${isOpen ? "translate-x-0" : "translate-x-[120%]"}`}
                    onClick={(e) => e.stopPropagation()}
                >
                    {content}
                </div>
            </div>
        </Portal>
    );
};

export default SelectCustomerSheet;
