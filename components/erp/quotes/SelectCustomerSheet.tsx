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
        <div className="flex flex-col h-full bg-white dark:bg-dark-surface">
            <header className="border-b border-brand-border dark:border-dark-border p-6 flex justify-between items-center">
                <h2 className="text-xl font-bold dark:text-dark-heading">Selecionar Cliente</h2>
                <Button variant="ghost" onClick={onClose} size="icon">
                    <CloseIcon className="w-5 h-5" />
                </Button>
            </header>

            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-6">
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
                            <Spinner size={24} className="text-brand-primary" />
                        </div>
                    ) : customers.length > 0 ? (
                        <div className="space-y-2">
                            {customers.map(c => (
                                <button
                                    key={c.id}
                                    onClick={() => { onSelect(c); onClose(); }}
                                    className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-brand-gray dark:hover:bg-dark-border/50 transition-colors text-left group border border-transparent hover:border-brand-border dark:hover:border-dark-border"
                                >
                                    <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-800 flex items-center justify-center text-lg font-bold text-gray-600 dark:text-gray-300 border border-brand-border dark:border-dark-border shrink-0 overflow-hidden">
                                        {c.avatar ? (
                                            <img src={c.avatar} className="w-full h-full object-cover" />
                                        ) : (
                                            c.name.charAt(0).toUpperCase()
                                        )}
                                    </div>
                                    <div className="flex flex-col flex-1 truncate text-left">
                                        <div className="font-bold text-[15px] text-brand-dark dark:text-dark-heading truncate">{c.name}</div>
                                        <div className="text-[13px] text-brand-inactive-text dark:text-dark-body truncate">{c.email || c.phone || 'Sem contato'}</div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="py-8">
                            <IconPlaceholder
                                icon={UserIcon}
                                title="Nenhum cliente encontrado"
                                subtitle={searchQuery ? "Nenhum resultado para sua busca." : "Você ainda não possui clientes."}
                                itemButton={onAddNew ? {
                                    text: "Cadastrar novo cliente",
                                    action: onAddNew
                                } : undefined}
                            />
                        </div>
                    )}
                </div>
            </div>
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
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex justify-end"
                        onClick={onClose}
                    >
                        <motion.div
                            initial={{ x: "100%" }}
                            animate={{ x: 0 }}
                            exit={{ x: "100%" }}
                            transition={{ type: "spring", damping: 30, stiffness: 300 }}
                            className="w-[500px] h-[calc(100vh-32px)] bg-white dark:bg-dark-surface shadow-2xl rounded-2xl m-4 overflow-hidden"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {content}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </Portal>
    );
};

export default SelectCustomerSheet;
