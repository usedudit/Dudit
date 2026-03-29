"use client"

import React, { useState, useEffect, useCallback, useRef, useMemo, type FC } from 'react';
import {
    ChevronLeftIcon,
    SaveIcon,
    SearchIcon,
    ChevronDownIcon,
    ChevronUpIcon,
    Package,
    FileIcon,
    PlusIcon
} from '@/lib/icons';
import {
    Button,
    Input,
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
    Badge,
    FormDropdown,
    AlertModal,
    Separator,
    Spinner,
    IconPlaceholder
} from '@/components/reusable';
import { getR2ImageUrl } from '@/lib/utils/get-r2-image-url';
import { searchProductsForMovement, createStockMovementAction } from '@/app/actions/erp/stock-movements';
import { useNotification } from '@/hooks/use-notification';
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes"
import { FadeIn } from "@/components/animations/FadeIn"
import { motion, AnimatePresence } from "framer-motion"

interface ProductSearchResult {
    id: string;
    name: string;
    sku: string;
    stock: number;
    image: string;
}

interface CreateStockMovementProps {
    onBack: () => void;
    onSuccess?: () => void;
}

const CreateStockMovement: FC<CreateStockMovementProps> = ({ onBack, onSuccess }) => {
    const { success: notifySuccess, error: notifyError } = useNotification();
    const [activeTab, setActiveTab] = useState('Geral');
    const [isScrolled, setIsScrolled] = useState(false);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5);
    }, []);

    // Form State
    const [type, setType] = useState<'in' | 'out'>('in');
    const [notes, setNotes] = useState('');
    const [quantity, setQuantity] = useState<number | ''>('');
    const [reason, setReason] = useState('Selecione um motivo...');

    // Search State
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedProduct, setSelectedProduct] = useState<ProductSearchResult | null>(null);
    const [searchResults, setSearchResults] = useState<ProductSearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Debounced search
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (searchQuery.trim().length >= 2 && !selectedProduct) {
                setIsSearching(true);
                const results = await searchProductsForMovement(searchQuery);
                setSearchResults(results);
                setIsSearching(false);
            } else {
                setSearchResults([]);
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [searchQuery, selectedProduct]);

    const isDirty = useMemo(() => {
        return (selectedProduct !== null) || (quantity !== '' && quantity !== 0) || (notes !== '') || (reason !== 'Selecione um motivo...');
    }, [selectedProduct, quantity, notes, reason]);

    const { showConfirmDialog: unsavedChangesDialogOpen, confirmNavigation: handleUnsavedChangesConfirm, cancelNavigation: handleUnsavedChangesDialogClose } = useUnsavedChanges(isDirty)

    const [showAlertModal, setShowAlertModal] = useState(false)
    const [nextAction, setNextAction] = useState<(() => void) | null>(null)

    const handleAttemptNav = useCallback((action: () => void) => {
        if (isDirty) { setNextAction(() => action); setShowAlertModal(true) }
        else action()
    }, [isDirty])

    const handleBack = useCallback(() => handleAttemptNav(onBack), [handleAttemptNav, onBack])

    const confirmNavigation = useCallback(() => {
        nextAction?.()
        setShowAlertModal(false)
    }, [nextAction])

    const handleSave = async () => {
        if (!selectedProduct) {
            notifyError("Selecione um produto.");
            return;
        }
        if (!quantity || Number(quantity) <= 0) {
            notifyError("Informe uma quantidade válida maior que zero.");
            return;
        }
        if (reason === 'Selecione um motivo...') {
            notifyError("Selecione um motivo para a movimentação.");
            return;
        }

        setIsSaving(true);
        try {
            const res = await createStockMovementAction({
                productId: selectedProduct.id,
                type,
                quantity: Number(quantity),
                reason,
                notes,
            });

            if (!res || !res.success) {
                notifyError(res?.error || "Erro interno ao salvar movimentação.");
            } else {
                notifySuccess("Movimentação registrada com sucesso!");
                if (onSuccess) onSuccess();
                onBack();
            }
        } catch (err: any) {
            notifyError("Erro interno. Tente novamente.");
        } finally {
            setIsSaving(false);
        }
    };

    const pageTitle = "Nova Movimentação";

    return (
        <FadeIn>
            <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden relative transition-colors duration-300">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full w-full">
                    <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-24 md:pb-8 scroll-smooth no-scrollbar">

                        {/* Sticky Header */}
                        <div className="sticky top-0 z-30 w-full bg-white dark:bg-dark-surface border-b border-brand-border dark:border-dark-border transition-all duration-300">
                            <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">

                                {/* Back button — desktop only */}
                                <div className={`absolute -left-12 top-7 h-full hidden xl:flex justify-center transition-all duration-300 ${isScrolled ? "scale-90" : "scale-100"}`}>
                                    <Button variant="filled" onClick={handleBack} className="w-10 h-10 p-0 flex items-center justify-center">
                                        <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                    </Button>
                                </div>

                                {/* Title row */}
                                <div className="hidden md:flex items-start justify-between">
                                    <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                        <h1 className={`font-bold text-brand-dark dark:text-dark-heading transition-all duration-300 flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                            <span className="truncate">{pageTitle}</span>
                                        </h1>

                                        <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-300 overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                            Registre uma nova entrada ou saída de itens no seu estoque
                                        </div>
                                    </div>

                                    {/* Desktop action buttons */}
                                    <div className="hidden md:flex items-center gap-3 flex-shrink-0 ml-3 mb-4">
                                        <Button variant="outline" onClick={handleBack} disabled={isSaving}>
                                            Cancelar
                                        </Button>
                                        <Button onClick={handleSave} disabled={isSaving}>
                                            <SaveIcon className="w-4.5 h-4.5 mr-2" />
                                            {isSaving ? "Salvando..." : "Salvar"}
                                        </Button>
                                    </div>
                                </div>

                                {/* Tabs container - ensured alignment */}

                                {/* Tabs */}
                                <div className={`w-full transition-all duration-300 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                                    <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                        <TabsTrigger value="Geral" className="px-0 pb-3">Dados gerais</TabsTrigger>
                                        <TabsTrigger value="Observações" className="px-0 pb-3">Observações</TabsTrigger>
                                        <TabsTrigger value="Anexos" className="px-0 pb-3">Anexos</TabsTrigger>
                                    </TabsList>
                                </div>
                            </div>
                        </div>

                        {/* Content Body */}
                        <div className="px-4 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
                            <div className="grid grid-cols-12 gap-y-10 lg:gap-x-12">

                                {/* Form Column */}
                                <div className={activeTab === 'Geral' ? "col-span-12 lg:col-span-8" : "col-span-12"}>
                                    <AnimatePresence mode="wait">
                                        <TabsContent value="Geral" className="mt-0">
                                            <motion.div key="Geral" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-10">

                                                {/* Tipo de Movimentação */}
                                                <section>
                                                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6">Tipo de Movimentação</h3>
                                                    <div className="flex flex-col md:flex-row gap-4">
                                                        <motion.button
                                                            whileHover={{ y: -1 }}
                                                            onClick={() => { setType('in'); setReason('Selecione um motivo...'); }}
                                                            className={`flex-1 flex items-center justify-between p-5 rounded-2xl transition-all border ${type === 'in'
                                                                ? 'bg-green-50/50 dark:bg-green-900/10 border-brand-green'
                                                                : 'bg-white dark:bg-dark-surface hover:bg-gray-50 dark:hover:bg-dark-border border-brand-border dark:border-dark-border'
                                                                }`}
                                                        >
                                                            <div className="flex items-center gap-4">
                                                                <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${type === 'in' ? 'bg-brand-green text-white' : 'bg-brand-gray dark:bg-gray-800 text-brand-inactive-text'
                                                                    }`}>
                                                                    <ChevronDownIcon size={22} strokeWidth={2.5} />
                                                                </div>
                                                                <div className="flex flex-col items-start text-left">
                                                                    <span className={`font-bold text-[15px] ${type === 'in' ? 'text-brand-green' : 'text-brand-dark dark:text-dark-heading'}`}>Entrada</span>
                                                                    <span className="text-xs text-brand-inactive-text mt-0.5 font-medium">Adicionar itens ao estoque</span>
                                                                </div>
                                                            </div>
                                                        </motion.button>

                                                        <motion.button
                                                            whileHover={{ y: -1 }}
                                                            onClick={() => { setType('out'); setReason('Selecione um motivo...'); }}
                                                            className={`flex-1 flex items-center justify-between p-5 rounded-2xl transition-all border ${type === 'out'
                                                                ? 'bg-red-50/50 dark:bg-red-900/10 border-brand-red'
                                                                : 'bg-white dark:bg-dark-surface hover:bg-gray-50 dark:hover:bg-dark-border border-brand-border dark:border-dark-border'
                                                                }`}
                                                        >
                                                            <div className="flex items-center gap-4">
                                                                <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${type === 'out' ? 'bg-brand-red text-white' : 'bg-brand-gray dark:bg-gray-800 text-brand-inactive-text'
                                                                    }`}>
                                                                    <ChevronUpIcon size={22} strokeWidth={2.5} />
                                                                </div>
                                                                <div className="flex flex-col items-start text-left">
                                                                    <span className={`font-bold text-[15px] ${type === 'out' ? 'text-brand-red' : 'text-brand-dark dark:text-dark-heading'}`}>Saída</span>
                                                                    <span className="text-xs text-brand-inactive-text mt-0.5 font-medium">Remover itens do estoque</span>
                                                                </div>
                                                            </div>
                                                        </motion.button>
                                                    </div>
                                                </section>

                                                <div className="h-px bg-brand-border dark:bg-dark-border w-full" />

                                                {/* Detalhes do Produto */}
                                                <section>
                                                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6">Detalhes da Movimentação</h3>
                                                    <div className="space-y-6">

                                                        <div className="relative">
                                                            {!selectedProduct ? (
                                                                <div className="relative">
                                                                    <div className="relative flex items-center w-full">
                                                                        <Input
                                                                            type="text"
                                                                            placeholder="Buscar por nome ou SKU..."
                                                                            value={searchQuery}
                                                                            onChange={(e) => setSearchQuery(e.target.value)}
                                                                            prefix={
                                                                                <SearchIcon
                                                                                    size={18}
                                                                                    className="text-brand-inactive-text flex-shrink-0"
                                                                                />
                                                                            }
                                                                        />
                                                                    </div>

                                                                    {searchQuery.length > 0 && (
                                                                        <motion.div
                                                                            initial={{ opacity: 0, y: 5 }}
                                                                            animate={{ opacity: 1, y: 0 }}
                                                                            className="absolute z-50 top-full left-0 right-0 mt-2 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl overflow-hidden max-h-72 overflow-y-auto"
                                                                        >
                                                                            {isSearching ? (
                                                                                <div className="p-8 text-center text-sm text-brand-inactive-text flex flex-col items-center gap-2">
                                                                                    <Spinner size={16} />
                                                                                    Carregando produtos...
                                                                                </div>
                                                                            ) : searchResults.length > 0 ? (
                                                                                searchResults.map(product => (
                                                                                    <div
                                                                                        key={product.id}
                                                                                        className="flex items-center gap-4 p-3.5 hover:bg-gray-50 dark:hover:bg-dark-border cursor-pointer border-b border-brand-border dark:border-dark-border last:border-0 transition-colors"
                                                                                        onClick={() => {
                                                                                            setSelectedProduct(product);
                                                                                            setSearchQuery('');
                                                                                        }}
                                                                                    >
                                                                                        <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-gray-800 overflow-hidden flex-shrink-0 border border-brand-border dark:border-dark-border">
                                                                                            <img src={getR2ImageUrl(product.image, "thumbnail") || "https://img.dudit.com.br/static/Placeholder.png"} alt={product.name} className="w-full h-full object-cover rounded-full mix-blend-multiply dark:mix-blend-normal" />
                                                                                        </div>
                                                                                        <div className="flex-1 min-w-0">
                                                                                            <div className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">{product.name}</div>
                                                                                            <div className="text-[11px] font-medium text-brand-inactive-text mt-0.5 tracking-wider uppercase">{product.sku}</div>
                                                                                        </div>
                                                                                        <div className="text-xs font-bold text-white bg-brand-dark dark:bg-brand-green px-2 py-1 rounded-md whitespace-nowrap">
                                                                                            {product.stock} em estoque
                                                                                        </div>
                                                                                    </div>
                                                                                ))
                                                                            ) : (
                                                                                <div className="p-8 text-center text-sm text-brand-inactive-text">
                                                                                    Nenhum produto encontrado.
                                                                                </div>
                                                                            )}
                                                                        </motion.div>
                                                                    )}
                                                                </div>
                                                            ) : (
                                                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 rounded-xl border border-brand-border dark:border-dark-border bg-brand-gray dark:bg-dark-border/30 flex items-center gap-4 relative group">
                                                                    <div className="w-12 h-12 rounded-full bg-white dark:bg-gray-800 border border-brand-border dark:border-dark-border flex-shrink-0 overflow-hidden">
                                                                        <img src={getR2ImageUrl(selectedProduct.image, "thumbnail") || "https://img.dudit.com.br/static/Placeholder.png"} alt={selectedProduct.name} className="w-full h-full object-cover rounded-full mix-blend-multiply dark:mix-blend-normal" />
                                                                    </div>
                                                                    <div className="flex-1 min-w-0 pr-8">
                                                                        <div className="text-[15px] font-bold text-brand-dark dark:text-dark-heading truncate mb-0.5">{selectedProduct.name}</div>
                                                                        <div className="text-[13px] text-brand-inactive-text dark:text-dark-body flex items-center gap-2 font-medium">
                                                                            <span>{selectedProduct.sku}</span>
                                                                            <span className="w-1 h-1 rounded-full bg-brand-inactive-text opacity-40"></span>
                                                                            <span>Estoque atual: <strong className="text-brand-dark dark:text-dark-heading font-bold">{selectedProduct.stock} un</strong></span>
                                                                        </div>
                                                                    </div>
                                                                    <button
                                                                        className="absolute top-1/2 -translate-y-1/2 right-4 p-2 text-brand-inactive-text hover:text-brand-red transition-all rounded-full"
                                                                        onClick={() => { setSelectedProduct(null); setSearchQuery(''); }}
                                                                    >
                                                                        <PlusIcon size={18} className="rotate-45" />
                                                                    </button>
                                                                </motion.div>
                                                            )}
                                                        </div>

                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                            <Input
                                                                label="Quantidade *"
                                                                name="quantity"
                                                                type="number"
                                                                placeholder="Ex: 10"
                                                                value={quantity}
                                                                onChange={(e) => setQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                                                            />

                                                            <FormDropdown
                                                                label="Motivo"
                                                                value={reason}
                                                                setValue={setReason}
                                                                options={type === 'in' ? [
                                                                    { value: 'Compra de Fornecedor', label: 'Compra de Fornecedor' },
                                                                    { value: 'Devolução de Cliente', label: 'Devolução de Cliente' },
                                                                    { value: 'Ajuste de Estoque', label: 'Ajuste de Estoque' }
                                                                ] : [
                                                                    { value: 'Avaria / Perda', label: 'Avaria / Perda' },
                                                                    { value: 'Ajuste de Estoque', label: 'Ajuste de Estoque' },
                                                                    { value: 'Uso Interno', label: 'Uso Interno' }
                                                                ]}
                                                            />
                                                        </div>

                                                    </div>
                                                </section>
                                            </motion.div>
                                        </TabsContent>

                                        <TabsContent value="Observações" className="mt-0">
                                            <motion.div key="Observações" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                                <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6">Observações Internas</h3>
                                                <div className="bg-brand-gray dark:bg-dark-border/30 rounded-2xl border border-brand-border dark:border-dark-border p-5 h-[350px]">
                                                    <textarea
                                                        className="w-full h-full bg-transparent border-none text-[15px] text-brand-dark dark:text-dark-heading leading-relaxed focus:outline-none resize-none placeholder:text-brand-inactive-text"
                                                        placeholder="Adicione informações como número da nota fiscal, motivo detalhado, ou observações para controle interno..."
                                                        value={notes}
                                                        onChange={(e) => setNotes(e.target.value)}
                                                    ></textarea>
                                                </div>
                                            </motion.div>
                                        </TabsContent>

                                        <TabsContent value="Anexos" className="mt-0">
                                            <motion.div key="Anexos" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border overflow-hidden">
                                                <div className="p-6 border-b border-brand-border dark:border-dark-border flex justify-between items-center bg-gray-50/50 dark:bg-dark-surface">
                                                    <h3 className="font-bold text-brand-dark dark:text-dark-heading">Gerenciar Anexos</h3>
                                                    <Button variant="outline" className="h-9 text-xs font-bold">
                                                        <PlusIcon size={14} className="mr-2" />
                                                        Adicionar Arquivo
                                                    </Button>
                                                </div>
                                                <div className="p-16 flex flex-col items-center justify-center text-center">
                                                    <div className="w-16 h-16 rounded-full bg-brand-gray dark:bg-gray-800 flex items-center justify-center text-brand-inactive-text mb-5 shadow-inner">
                                                        <FileIcon size={28} />
                                                    </div>
                                                    <h4 className="font-bold text-brand-dark dark:text-dark-heading mb-2">Nenhum documento anexado</h4>
                                                    <p className="text-sm text-brand-inactive-text max-w-xs leading-relaxed">
                                                        Adicione digitalizações de notas, fotos de itens avariados ou comprovantes de recebimento.
                                                    </p>
                                                </div>
                                            </motion.div>
                                        </TabsContent>
                                    </AnimatePresence>
                                </div>

                                {/* Sidebar Column */}
                                {activeTab === 'Geral' && (
                                    <div className="hidden lg:block col-span-12 lg:col-span-4 border-l border-brand-border dark:border-dark-border pl-12 space-y-8">
                                        <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden transition-all duration-300">
                                            <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border rounded-t-2xl" />
                                            <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6 mt-2">Projeção de Estoque</h3>

                                            <AnimatePresence mode="wait">
                                                {selectedProduct ? (
                                                    <motion.div
                                                        key="projection-data"
                                                        initial={{ opacity: 0 }}
                                                        animate={{ opacity: 1 }}
                                                        exit={{ opacity: 0 }}
                                                        className="space-y-4"
                                                    >
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-[13px] text-brand-inactive-text font-medium">Estoque Atual:</span>
                                                            <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading">
                                                                {selectedProduct.stock} <span className="text-[11px] font-medium opacity-60">un</span>
                                                            </span>
                                                        </div>

                                                        <div className="flex items-center justify-between pt-4 border-t border-brand-border/40 dark:border-dark-border/40">
                                                            <span className="text-[13px] text-brand-inactive-text font-medium">Novo Estoque:</span>
                                                            <span className={`text-lg font-bold ${type === 'in' ? 'text-brand-green' : 'text-brand-red'}`}>
                                                                {type === 'in'
                                                                    ? (selectedProduct.stock + (Number(quantity) || 0))
                                                                    : (selectedProduct.stock - (Number(quantity) || 0))}
                                                                <span className="text-xs ml-1 font-bold">un</span>
                                                            </span>
                                                        </div>
                                                    </motion.div>
                                                ) : (
                                                    <motion.div
                                                        key="projection-empty"
                                                        initial={{ opacity: 0 }}
                                                        animate={{ opacity: 1 }}
                                                        exit={{ opacity: 0 }}
                                                        className="flex flex-col items-center justify-center py-8 text-center"
                                                    >
                                                        <IconPlaceholder
                                                            icon={Package}
                                                            title="Selecione um produto"
                                                            subtitle="Selecione um produto para visualizar a projeção de estoque."
                                                        />
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Mobile Bottom Action Bar */}
                    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-gray-200 dark:border-dark-border px-4 py-3 flex gap-3 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
                        <Button
                            variant="outline"
                            onClick={handleBack}
                            disabled={isSaving}
                            className="flex-1 h-[48px] font-bold"
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={isSaving}
                            className={`flex-1 h-[48px] font-bold ${type === 'in' ? 'bg-brand-green hover:bg-brand-green/90' : 'bg-brand-red hover:bg-red-600'}`}
                        >
                            <SaveIcon className="w-4 h-4 mr-2" />
                            {isSaving ? "Salvando..." : "Salvar"}
                        </Button>
                    </div>
                </Tabs>

                {/* Modals */}
                {unsavedChangesDialogOpen && (
                    <AlertModal
                        isOpen={unsavedChangesDialogOpen}
                        onClose={handleUnsavedChangesDialogClose}
                        onConfirm={handleUnsavedChangesConfirm}
                        title="Descartar alterações?"
                        description="Você tem uma movimentação em andamento. Se sair agora, perderá os dados preenchidos."
                        confirmText="Sair sem salvar"
                        variant="warning"
                    />
                )}
                {showAlertModal && (
                    <AlertModal
                        isOpen
                        onClose={() => setShowAlertModal(false)}
                        onConfirm={confirmNavigation}
                        title="Descartar alterações?"
                        description="Existem dados não salvos neste formulário. Tem certeza que deseja cancelar o registro?"
                        confirmText="Sair sem salvar"
                        variant="warning"
                    />
                )}
            </div>
        </FadeIn>
    );
};

export default CreateStockMovement;
