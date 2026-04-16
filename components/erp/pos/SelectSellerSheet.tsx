"use client"

import { useState, useEffect } from 'react';
import { SearchIcon, PlusIcon, XIcon, ClockIcon } from '@/lib/icons';
import { Button, Input, IconPlaceholder } from '@/components/reusable';
import Portal from "@/components/Portal";
import BottomSheet from "@/components/BottomSheet";
import { useMediaQuery } from "@/components/erp/hooks";
import { getTeamMembers } from '@/app/actions/erp/team';

interface SelectSellerSheetProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (seller: any) => void;
}

const SelectSellerSheet = ({ isOpen, onClose, onSelect }: SelectSellerSheetProps) => {
    const [search, setSearch] = useState('');
    const [members, setMembers] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const isMobile = useMediaQuery("(max-width: 768px)");

    const fetchMembers = async () => {
        setIsLoading(true);
        try {
            const res = await getTeamMembers();
            if (res.members) {
                setMembers(res.members);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchMembers();
        }
    }, [isOpen]);

    const filteredMembers = members.filter(member =>
        member.fullName?.toLowerCase().includes(search.toLowerCase()) ||
        member.email?.toLowerCase().includes(search.toLowerCase())
    );

    const content = (
        <div className="flex flex-col h-full bg-white dark:bg-dark-surface">
            {/* Header */}
            <header className="border-b border-brand-border dark:border-dark-border p-6 flex justify-between items-center bg-white dark:bg-dark-surface z-10 shrink-0">
                <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Selecionar Vendedor</h2>
                <Button variant="ghost" onClick={onClose} size="icon">
                    <XIcon className="w-5 h-5" />
                </Button>
            </header>

            {/* Sticky Search Bar */}
            <div className="p-6 border-b border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface z-10 shrink-0">
                <Input
                    label=""
                    name="sellerSearch"
                    placeholder="Buscar por nome ou email..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
                    className="mb-0"
                    variant="full-rounded"
                />
            </div>

            {/* List Content */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                {isLoading ? (
                    <div className="flex flex-col gap-3">
                        {[1, 2, 3, 4, 5].map(i => (
                            <div key={i} className="h-16 w-full animate-pulse bg-gray-100 dark:bg-dark-border rounded-xl" />
                        ))}
                    </div>
                ) : filteredMembers.length > 0 ? (
                    <div className="flex flex-col gap-2">
                        {filteredMembers.map(member => (
                            <button
                                key={member.id}
                                onClick={() => {
                                    onSelect(member);
                                    onClose();
                                }}
                                className="flex items-center gap-4 p-3 rounded-xl hover:bg-brand-gray/30 dark:hover:bg-dark-border/30 transition-all text-left border border-transparent hover:border-brand-border dark:hover:border-dark-border group"
                            >
                                <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-gray-800 flex items-center justify-center text-lg font-bold text-brand-inactive-text border border-brand-border dark:border-dark-border overflow-hidden">
                                    {member.fullName?.charAt(0) || 'V'}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading leading-tight truncate group-hover:text-brand-primary transition-colors">{member.fullName}</h4>
                                    <p className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body truncate">{member.role || 'Vendedor'}</p>
                                </div>
                                <div className="w-8 h-8 rounded-full flex items-center justify-center text-brand-inactive-text opacity-0 group-hover:opacity-100 transition-opacity">
                                    <PlusIcon size={18} />
                                </div>
                            </button>
                        ))}
                    </div>
                ) : (
                    <div className="py-12">
                        <IconPlaceholder
                            icon={ClockIcon}
                            title="Nenhum vendedor encontrado"
                            subtitle="Tente outro termo de busca."
                        />
                    </div>
                )}
            </div>

            {/* Footer */}
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
                className={`fixed inset-0 bg-black/50 z-50 transition-opacity duration-300 ${isOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
                onClick={onClose}
            >
                <div
                    className={`absolute right-0 top-0 h-full w-full max-w-[450px] bg-white dark:bg-dark-surface shadow-2xl transition-transform duration-300 ease-in-out transform ${isOpen ? "translate-x-0" : "translate-x-full"}`}
                    onClick={(e) => e.stopPropagation()}
                >
                    {content}
                </div>
            </div>
        </Portal>
    );
};

export default SelectSellerSheet;
