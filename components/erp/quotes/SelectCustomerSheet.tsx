"use client"

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeftIcon, XIcon, SearchIcon, PlusIcon, UserIcon } from '@/lib/icons';
import { Button, Input as FormInput, Spinner } from '@/components/reusable';
import IconPlaceholder from '@/components/reusable/IconPlaceholder';
import { searchCustomersForQuote } from '@/app/actions/erp/quotes';

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

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[70] flex justify-end">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        onClick={onClose}
                    />
                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                        className="relative w-full md:w-[500px] h-full bg-white dark:bg-dark-surface shadow-2xl flex flex-col overflow-hidden border-l border-brand-border dark:border-dark-border"
                    >
                        <div className="flex items-center justify-between px-6 py-5 border-b border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface z-10">
                            <div className="flex items-center gap-3">
                                <Button variant="outline" onClick={onClose} className="h-9 px-3 gap-1 shadow-sm">
                                    <ChevronLeftIcon size={16} /> Voltar
                                </Button>
                                <h2 className="text-[17px] font-bold text-brand-dark dark:text-dark-heading">Selecionar Cliente</h2>
                            </div>
                            <button onClick={onClose} className="text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading transition-colors">
                                <XIcon size={20} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
                            <FormInput
                                label=""
                                name="clientSearch"
                                placeholder="Pesquisar cliente por nome ou email..."
                                prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
                                autoFocus
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />

                            <div className="space-y-2">
                                {onAddNew && (
                                    <button
                                        onClick={onAddNew}
                                        className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-brand-gray dark:hover:bg-dark-border/50 transition-colors text-left group border border-transparent hover:border-brand-border dark:hover:border-dark-border"
                                    >
                                        <div className="w-12 h-12 rounded-full bg-[#f3e8ff] dark:bg-[#3b0764]/50 flex items-center justify-center text-[#7c3aed] dark:text-[#d8b4fe]">
                                            <PlusIcon size={20} />
                                        </div>
                                        <span className="font-bold text-[15px] text-brand-dark dark:text-dark-heading">Cadastrar novo cliente</span>
                                    </button>
                                )}

                                {onAddNew && <div className="border-t border-brand-border dark:border-dark-border my-4"></div>}

                                {isSearching ? (
                                    <div className="flex justify-center items-center py-12">
                                        <Spinner size={14} className="text-brand-dark dark:text-dark-heading" />
                                    </div>
                                ) : customers.length > 0 ? (
                                    customers.map(c => (
                                        <button
                                            key={c.id}
                                            onClick={() => { onSelect(c); onClose(); }}
                                            className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-brand-gray dark:hover:bg-dark-border/50 transition-colors text-left group border border-transparent hover:border-brand-border dark:hover:border-dark-border"
                                        >
                                            <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-800 flex items-center justify-center text-lg font-bold text-gray-600 dark:text-gray-300 border border-brand-border dark:border-dark-border shrink-0">
                                                {c.name.charAt(0).toUpperCase()}
                                            </div>
                                            <div className="flex flex-col flex-1 truncate">
                                                <div className="font-bold text-[15px] text-brand-dark dark:text-dark-heading truncate">{c.name}</div>
                                                <div className="text-[13px] text-brand-inactive-text dark:text-dark-body truncate">{c.email || c.phone || 'Sem contato'}</div>
                                            </div>
                                        </button>
                                    ))
                                ) : (
                                    <div className="py-8">
                                        <IconPlaceholder
                                            icon={UserIcon}
                                            title="Nenhum cliente encotrado"
                                            subtitle={searchQuery ? "Nenhum resultado para sua busca." : "Você ainda não possui clientes."}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default SelectCustomerSheet;
