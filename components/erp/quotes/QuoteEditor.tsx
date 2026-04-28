import React, { useEffect, useRef } from 'react';
import {
    SearchIcon,
    TrashIcon,
    UserIcon,
    SparklesIcon,
    PlusIcon,
    CheckIcon,
    AlertCircleIcon,
    ClockIcon,
    CheckCircleIcon,
    EditIcon,
    FileIcon,
    TelegramIcon
} from '@/lib/icons';
import { motion, AnimatePresence } from 'framer-motion';
import QuantitySelector from '@/components/reusable/QuantitySelector';
import { Button, Input, TabsContent, FormDropdown, MoneyInput, PercentageInput, DatePicker, ThreeDotsLoader, IconPlaceholder, Pagination, InfoCard } from '@/components/reusable';
import { UserProfileImage } from "@/lib/utils/UserProfileImage";
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url";
import { formatCurrency } from "@/lib/utils";
import { QUOTE_DEFAULT_CUSTOMER_LABEL, type QuoteEditCaps } from "@/lib/quotes/quote-edit-rules";
import { FadeIn } from '@/components/animations/FadeIn';

interface QuoteEditorProps {
    searchQuery: string;
    setSearchQuery: (val: string) => void;
    isProductSearchOpen: boolean;
    setIsProductSearchOpen: (val: boolean) => void;
    filteredProducts: any[];
    isSearching: boolean;
    handleProductClick: (product: any) => void;
    addBlankItem: () => void;
    quoteItems: any[];
    updateItemPrice: (idx: number, price: number) => void;
    updateItemQty: (idx: number, qty: number) => void;
    updateItemField: (idx: number, field: string, value: any) => void;
    toggleItemEdit: (idx: number, isEditing: boolean) => void;
    removeItem: (idx: number) => void;
    discount: string;
    setDiscount: (val: string) => void;
    discountType: 'R$' | '%';
    setDiscountType: (val: 'R$' | '%') => void;
    shippingFee: string;
    setShippingFee: (val: string) => void;
    otherCosts: string;
    setOtherCosts: (val: string) => void;
    subtotal: number;
    discountValue: number;
    total: number;
    selectedCustomer: any;
    setSelectedCustomer: (customer: any) => void;
    setIsCustomerSheetOpen: (val: boolean) => void;
    quoteDate: string;
    setQuoteDate: (val: string) => void;
    expiryDate: string;
    setExpiryDate: (val: string) => void;
    status: string;
    setStatus: (val: string) => void;
    internalNote: string;
    setInternalNote: (val: string) => void;
    staffInternalNotes: string;
    setStaffInternalNotes: (val: string) => void;
    mode: 'create' | 'edit' | 'duplicate' | 'view';
    editCaps?: QuoteEditCaps | null;
    onReopenQuote?: () => void;
    onDuplicateQuote?: () => void;

    // Layout Props
    primaryColor: string;
    setPrimaryColor: (val: string) => void;
    secondaryColor: string;
    setSecondaryColor: (val: string) => void;
    quoteTitle: string;
    setQuoteTitle: (val: string) => void;
    quoteSubtitle: string;
    setQuoteSubtitle: (val: string) => void;
    isReadOnly?: boolean;
    onSearchFocus?: () => void;
    fieldErrors?: Set<string>;
    setFieldErrors?: React.Dispatch<React.SetStateAction<Set<string>>>;
    manualItemNameErrors?: Set<number>;
    manualItemPriceErrors?: Set<number>;
    isLoadingItems?: boolean;
}

const QuoteEditor = (props: QuoteEditorProps) => {
    const searchRef = useRef<HTMLDivElement>(null);
    const ITEMS_PER_PAGE = 8;
    const [currentPage, setCurrentPage] = React.useState(1);
    const totalPages = Math.ceil(props.quoteItems.length / ITEMS_PER_PAGE);
    const paginatedItems = props.quoteItems.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
    const [nameErrors, setNameErrors] = React.useState<Record<number, boolean>>({});
    const [priceErrors, setPriceErrors] = React.useState<Record<number, boolean>>({});
    const statusOptions = [
        { value: 'draft', label: 'Rascunho', icon: FileIcon, color: 'text-gray-500' },
        { value: 'sent', label: 'Enviado', icon: TelegramIcon, color: 'text-blue-500' },
        { value: 'approved', label: 'Aprovado', icon: CheckCircleIcon, color: 'text-green-500' },
        { value: 'rejected', label: 'Recusado', icon: AlertCircleIcon, color: 'text-red-500' },
        { value: 'expired', label: 'Expirado', icon: ClockIcon, color: 'text-brand-orange' },
        { value: 'cancelled', label: 'Cancelado', icon: AlertCircleIcon, color: 'text-gray-500' },
    ];

    const currentStatus = statusOptions.find(o => o.value === props.status) || statusOptions[0];

    const caps = props.editCaps
    const itemsLocked = Boolean(props.isReadOnly || (caps && !caps.canEditItems))
    const customerLocked = Boolean(props.isReadOnly || (caps && !caps.canEditCustomer))
    const issueDateLocked = Boolean(props.isReadOnly || (caps && !caps.canEditIssueDate))
    const expiryLocked = Boolean(props.isReadOnly || (caps && !caps.canEditExpirationDate))
    const financialLocked = Boolean(props.isReadOnly || (caps && !caps.canEditDiscountShipping))
    const proposalNotesLocked = Boolean(props.isReadOnly || (caps && !caps.canEditProposalNotes))
    const internalNotesLocked = Boolean(props.isReadOnly || (caps && !caps.canEditInternalNotes))
    const statusLocked = Boolean(props.isReadOnly || (caps && !caps.canChangeStatus))
    const layoutLocked = Boolean(props.isReadOnly || (caps && !caps.canEditLightFields))

    useEffect(() => {
        if (currentPage > totalPages && totalPages > 0) {
            setCurrentPage(totalPages);
        }
    }, [props.quoteItems.length, totalPages, currentPage]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
                props.setIsProductSearchOpen(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [props.setIsProductSearchOpen]);

    return (
        <div className="pt-4">
            <TabsContent value="Dados Gerais" className="mt-0 focus-visible:outline-none">
                <FadeIn key="Dados Gerais">

                    {caps?.bannerMessage && !props.isReadOnly && (
                        <><InfoCard title="Atenção" message={caps.bannerMessage} color="orange" className="mb-6" /><div className="flex flex-wrap gap-2">
                            {caps.showReopenCta && props.onReopenQuote && (
                                <Button type="button" variant="outline" className="h-9 text-xs" onClick={props.onReopenQuote}>
                                    Reabrir como rascunho
                                </Button>
                            )}
                            {caps.showDuplicateCta && props.onDuplicateQuote && (
                                <Button type="button" variant="outline" className="h-9 text-xs" onClick={props.onDuplicateQuote}>
                                    Duplicar orçamento
                                </Button>
                            )}
                        </div></>
                    )}

                    {/* 1. PRODUCT SEARCH & TABLE */}
                    <div className="mb-8">
                        <h3 className="font-bold text-lg text-brand-dark dark:text-dark-heading mb-6">Itens da Proposta</h3>

                        <div ref={searchRef} className="relative mb-6">
                            {!itemsLocked && (
                                <Input
                                    label=""
                                    name="productSearch"
                                    placeholder="Buscar produtos para adicionar..."
                                    prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
                                    value={props.searchQuery}
                                    onChange={(e) => {
                                        props.setSearchQuery(e.target.value);
                                        props.setIsProductSearchOpen(true);
                                        if (props.setFieldErrors) {
                                            props.setFieldErrors(prev => {
                                                const next = new Set(prev);
                                                next.delete("productSearch");
                                                return next;
                                            });
                                        }
                                    }}
                                    onFocus={() => {
                                        props.setIsProductSearchOpen(true);
                                        props.onSearchFocus?.();
                                    }}
                                    className="mb-0"
                                    error={props.fieldErrors?.has("productSearch")}
                                    errorMessage={props.fieldErrors?.has("productSearch") ? "Adicione um item" : undefined}
                                />
                            )}

                            <AnimatePresence>
                                {props.isProductSearchOpen && props.searchQuery && !itemsLocked && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 5 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: 5 }}
                                        className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl shadow-xl z-20 max-h-60 overflow-y-auto"
                                    >
                                        {props.isSearching ? (
                                            <ThreeDotsLoader />
                                        ) : props.filteredProducts.length > 0 ? (
                                            props.filteredProducts.map(product => (
                                                <div
                                                    key={product.id}
                                                    onClick={() => props.handleProductClick(product)}
                                                    className="flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-dark-border cursor-pointer border-b border-brand-border dark:border-dark-border last:border-0"
                                                >
                                                    <img src={getR2ImageUrl(product.image, "thumbnail")} className={`w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border border border-brand-border dark:border-dark-border ${!product.image ? 'object-contain' : 'object-cover'}`} />
                                                    <div className="flex-1">
                                                        <div className="text-sm font-bold text-brand-dark dark:text-dark-heading">{product.name}</div>
                                                        <div className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">SKU: {product.sku} • Estoque: {product.stock}</div>
                                                    </div>
                                                    <div className="text-sm font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(product.price)}</div>
                                                    {product.variants && product.variants.length > 0 && (
                                                        <div className="px-2 py-0.5 bg-gray-100 dark:bg-zinc-700 text-[10px] font-bold rounded text-brand-inactive-text uppercase">
                                                            Opções
                                                        </div>
                                                    )}
                                                </div>
                                            ))
                                        ) : (
                                            <div className="p-4 text-center text-sm text-brand-inactive-text">Nenhum produto encontrado.</div>
                                        )}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* --- ITEMS TABLE (Desktop) --- */}
                        {props.isLoadingItems ? (
                            <div className="flex items-center justify-center py-14">
                                <ThreeDotsLoader />
                            </div>
                        ) : props.quoteItems.length > 0 && (
                            <div className="hidden md:block w-full overflow-x-auto pb-4 custom-scrollbar mb-4">
                                <table className="w-full text-left border-separate border-spacing-0">
                                    <thead>
                                        <tr className="bg-brand-gray dark:bg-dark-border/50">
                                            <th className="py-3 pl-6 pr-4 text-[13px] font-medium text-gray-500 dark:text-dark-body rounded-l-lg">Produto</th>
                                            <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body w-44">Preço Unit.</th>
                                            <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body text-center w-36">Qtd.</th>
                                            <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body text-right w-36">Total</th>
                                            {!itemsLocked && <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body text-center w-24 rounded-r-lg">Ações</th>}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedItems.map((item, paginatedIndex) => {
                                            const index = (currentPage - 1) * ITEMS_PER_PAGE + paginatedIndex;
                                            const hasNameError = Boolean(nameErrors[index] || props.manualItemNameErrors?.has(index));
                                            const hasPriceError = Boolean(priceErrors[index] || props.manualItemPriceErrors?.has(index));
                                            return (
                                                <tr key={index} className="group hover:bg-brand-gray/20 dark:hover:bg-dark-border/10 transition-colors">
                                                    <td className="py-4 pl-6 pr-4 border-b border-brand-border dark:border-dark-border">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                                                                <img src={getR2ImageUrl(item.image, "thumbnail")} className={`w-full h-full rounded-full ${!item.image ? 'object-contain' : 'object-cover'}`} alt="" />
                                                            </div>
                                                            <div className="flex flex-col text-left flex-1 min-w-0">
                                                                {item.isEditing ? (
                                                                    <div className="mb-0">
                                                                        <Input
                                                                            name={`item-name-${index}`}
                                                                            value={item.name}
                                                                            onChange={(e: any) => {
                                                                                props.updateItemField(index, 'name', e.target.value);
                                                                                if (nameErrors[index]) {
                                                                                    setNameErrors(prev => ({ ...prev, [index]: false }));
                                                                                }
                                                                            }}
                                                                            placeholder="Nome do produto..."
                                                                            error={hasNameError}
                                                                            errorMessage="Nome obrigatório"
                                                                            className="mb-0"
                                                                        />
                                                                    </div>
                                                                ) : (
                                                                    <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading mb-0.5 truncate max-w-[250px]">
                                                                        {item.name || 'Produto sem nome'}
                                                                    </span>
                                                                )}
                                                                {!item.isEditing && (
                                                                    <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate">
                                                                        {item.sku || 'Sem SKU'}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border">
                                                        <div className="w-[140px]">
                                                            <MoneyInput
                                                                name={`item-price-${index}`}
                                                                value={item.price}
                                                                onChange={(val: number) => {
                                                                    props.updateItemPrice(index, val)
                                                                    if (priceErrors[index]) {
                                                                        setPriceErrors(prev => ({ ...prev, [index]: false }))
                                                                    }
                                                                }}
                                                                className="mb-0"
                                                                error={hasPriceError}
                                                                errorMessage="Preço obrigatório"
                                                                disabled={itemsLocked}
                                                            />
                                                        </div>
                                                    </td>
                                                    <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border">
                                                        <div className="flex justify-center">
                                                            <QuantitySelector value={item.qty} onChange={(val) => props.updateItemQty(index, val)} max={item.isManual ? undefined : Math.max(0, Number(item.stock ?? 0))} size="md" disabled={itemsLocked} />
                                                        </div>
                                                    </td>
                                                    <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border text-right">
                                                        <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">
                                                            {formatCurrency(item.price * item.qty)}
                                                        </span>
                                                    </td>
                                                    {!itemsLocked && (
                                                        <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border">
                                                            <div className="flex justify-center gap-2">
                                                                {item.isEditing ? (
                                                                    <button
                                                                        onClick={() => {
                                                                            if (!item.name || item.name.trim() === '') {
                                                                                setNameErrors(prev => ({ ...prev, [index]: true }))
                                                                            } else if (item.isManual && Number(item.price || 0) <= 0) {
                                                                                setPriceErrors(prev => ({ ...prev, [index]: true }))
                                                                            } else {
                                                                                props.toggleItemEdit(index, false)
                                                                            }
                                                                        }}
                                                                        className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-green-50 dark:hover:bg-green-900/10 text-brand-green transition-colors"
                                                                        title="Salvar nome"
                                                                    >
                                                                        <CheckCircleIcon size={18} />
                                                                    </button>
                                                                ) : item.isManual ? (
                                                                    <button
                                                                        onClick={() => props.toggleItemEdit(index, true)}
                                                                        className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-brand-gray dark:hover:bg-dark-border text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                                        title="Editar nome"
                                                                    >
                                                                        <EditIcon size={18} />
                                                                    </button>
                                                                ) : null}
                                                                <button
                                                                    onClick={() => props.removeItem(index)}
                                                                    className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-red-50 dark:hover:bg-red-900/10 text-brand-red transition-colors"
                                                                    title="Remover item"
                                                                >
                                                                    <TrashIcon size={18} />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    )}
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        {!props.isLoadingItems && props.quoteItems.length > 0 && (
                            <div className="block md:hidden space-y-2 mb-6">
                                {paginatedItems.map((item, paginatedIndex) => {
                                    const index = (currentPage - 1) * ITEMS_PER_PAGE + paginatedIndex;
                                    const hasNameError = Boolean(nameErrors[index] || props.manualItemNameErrors?.has(index));
                                    const hasPriceError = Boolean(priceErrors[index] || props.manualItemPriceErrors?.has(index));
                                    return (
                                        <div key={index} className="flex items-center gap-4 py-4 border-b border-brand-border dark:border-dark-border last:border-0">
                                            <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 overflow-hidden flex items-center justify-center">
                                                <img src={getR2ImageUrl(item.image, "thumbnail")} className={`w-full h-full ${!item.image ? 'object-contain' : 'object-cover'}`} alt="" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex justify-between items-start mb-0.5">
                                                    {item.isEditing ? (
                                                        <div className="flex-1 mr-2">
                                                            <Input
                                                                name={`item-name-mobile-${index}`}
                                                                value={item.name}
                                                                onChange={(e: any) => {
                                                                    props.updateItemField(index, 'name', e.target.value);
                                                                    if (nameErrors[index]) {
                                                                        setNameErrors(prev => ({ ...prev, [index]: false }));
                                                                    }
                                                                }}
                                                                placeholder="Nome do produto..."
                                                                error={hasNameError}
                                                                errorMessage="Nome obrigatório"
                                                                className="mb-0"
                                                            />
                                                        </div>
                                                    ) : (
                                                        <h4 className="font-bold text-[13px] text-brand-dark dark:text-dark-heading truncate pr-2">
                                                            {item.name || 'Produto sem nome'}
                                                        </h4>
                                                    )}
                                                    <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading shrink-0">
                                                        {formatCurrency(item.price * item.qty)}
                                                    </span>
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <p className="text-[11px] font-medium text-brand-inactive-text pr-2 truncate">
                                                        {item.isEditing ? (item.sku ? `${item.sku} • ` : '') : `${item.sku || 'Sem SKU'} • `}{item.qty} un • {formatCurrency(item.price)}
                                                    </p>
                                                    {!itemsLocked && (
                                                        <div className="flex items-center gap-1">
                                                            {item.isEditing ? (
                                                                <button
                                                                    onClick={() => {
                                                                        if (!item.name || item.name.trim() === '') {
                                                                            setNameErrors(prev => ({ ...prev, [index]: true }));
                                                                        } else if (item.isManual && Number(item.price || 0) <= 0) {
                                                                            setPriceErrors(prev => ({ ...prev, [index]: true }));
                                                                        } else {
                                                                            props.toggleItemEdit(index, false);
                                                                        }
                                                                    }}
                                                                    className="w-8 h-8 flex items-center justify-center text-green-600 hover:bg-green-50 dark:hover:bg-green-900/10 rounded-full transition-colors"
                                                                >
                                                                    <CheckCircleIcon size={14} />
                                                                </button>
                                                            ) : item.isManual ? (
                                                                <button
                                                                    onClick={() => props.toggleItemEdit(index, true)}
                                                                    className="w-8 h-8 flex items-center justify-center text-brand-inactive-text hover:text-brand-dark hover:bg-brand-gray dark:hover:bg-dark-border rounded-full transition-colors"
                                                                >
                                                                    <EditIcon size={14} />
                                                                </button>
                                                            ) : null}
                                                            <button
                                                                onClick={() => props.removeItem(index)}
                                                                className="w-8 h-8 flex items-center justify-center text-brand-red hover:bg-red-50 dark:hover:bg-red-900/10 rounded-full transition-colors"
                                                            >
                                                                <TrashIcon size={14} />
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>

                                                {!itemsLocked && (
                                                    <div className="flex items-center gap-4 mt-2">
                                                        <QuantitySelector value={item.qty} onChange={(val) => props.updateItemQty(index, val)} max={item.isManual ? undefined : Math.max(0, Number(item.stock ?? 0))} size="sm" />
                                                        <div className="flex-1 max-w-[140px]">
                                                            <MoneyInput
                                                                name={`item-price-mobile-${index}`}
                                                                value={item.price}
                                                                onChange={(val: number) => {
                                                                    props.updateItemPrice(index, val);
                                                                    if (priceErrors[index]) {
                                                                        setPriceErrors(prev => ({ ...prev, [index]: false }));
                                                                    }
                                                                }}
                                                                className="mb-0"
                                                                error={hasPriceError}
                                                                errorMessage="Preço obrigatório"
                                                            />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}

                        {props.quoteItems.length > ITEMS_PER_PAGE && (
                            <div className="mt-6 flex justify-center">
                                <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
                            </div>
                        )}

                        {/* --- ITEMS LIST (Mobile/Tablet) --- */}
                        {false && props.quoteItems.length > 0 && (
                            <div className="block md:hidden space-y-2 mb-6">
                                {props.quoteItems.map((item, index) => (
                                    <div key={index} className="flex items-center gap-4 py-4 border-b border-brand-border dark:border-dark-border last:border-0">
                                        {/* Left side: Avatar/Image */}
                                        <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 overflow-hidden flex items-center justify-center">
                                            <img src={getR2ImageUrl(item.image, "thumbnail")} className="w-full h-full object-cover" alt="" />
                                        </div>

                                        {/* Middle: Content */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-start mb-0.5">
                                                {item.isEditing ? (
                                                    <input
                                                        type="text"
                                                        value={item.name}
                                                        onChange={(e) => props.updateItemField(index, 'name', e.target.value)}
                                                        placeholder="Nome do produto..."
                                                        className="flex-1 h-8 px-2 rounded-lg border border-brand-border bg-white dark:bg-dark-background font-bold text-[13px] focus:ring-1 focus:ring-brand-primary outline-none transition-all mr-2"
                                                    />
                                                ) : (
                                                    <h4 className="font-bold text-[13px] text-brand-dark dark:text-dark-heading truncate pr-2">
                                                        {item.name || 'Produto sem nome'}
                                                    </h4>
                                                )}
                                                <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading shrink-0">
                                                    {formatCurrency(item.price * item.qty)}
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <p className="text-[11px] font-medium text-brand-inactive-text pr-2 truncate">
                                                    {item.sku || 'Sem SKU'} • {item.qty} un • {formatCurrency(item.price)}
                                                </p>
                                                {!itemsLocked && (
                                                    <div className="flex items-center gap-1">
                                                        {item.isEditing ? (
                                                            <button
                                                                onClick={() => {
                                                                    if (item.isBlank && Number(item.price || 0) <= 0) {
                                                                        setPriceErrors(prev => ({ ...prev, [index]: true }))
                                                                        return
                                                                    }
                                                                    props.toggleItemEdit(index, false)
                                                                }}
                                                                className="w-8 h-8 flex items-center justify-center text-green-600 hover:bg-green-50 dark:hover:bg-green-900/10 rounded-lg transition-colors"
                                                            >
                                                                <CheckIcon size={16} />
                                                            </button>
                                                        ) : (
                                                            <button
                                                                onClick={() => props.toggleItemEdit(index, true)}
                                                                className="w-8 h-8 flex items-center justify-center text-brand-inactive-text hover:text-brand-dark hover:bg-brand-gray dark:hover:bg-dark-border rounded-lg transition-colors"
                                                            >
                                                                <EditIcon size={16} />
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => props.removeItem(index)}
                                                            className="w-8 h-8 flex items-center justify-center text-brand-red hover:bg-red-50 dark:hover:bg-red-900/10 rounded-full transition-colors"
                                                        >
                                                            <TrashIcon size={14} />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>

                                            {!itemsLocked && (
                                                <div className="flex items-center gap-4 mt-2">
                                                    <QuantitySelector value={item.qty} onChange={(val) => props.updateItemQty(index, val)} max={item.isBlank ? undefined : Math.max(0, Number(item.stock ?? 0))} size="md" />
                                                    <div className="flex items-center flex-1 max-w-[120px]">
                                                        <span className="text-[11px] font-medium text-brand-inactive-text mr-1">R$</span>
                                                        <input
                                                            type="number"
                                                            value={item.price}
                                                            onChange={(e) => {
                                                                props.updateItemPrice(index, parseFloat(e.target.value) || 0)
                                                                if (priceErrors[index]) {
                                                                    setPriceErrors(prev => ({ ...prev, [index]: false }))
                                                                }
                                                            }}
                                                            className={`w-full h-8 px-2 rounded-lg border bg-white dark:bg-dark-background font-bold text-[11px] focus:ring-1 focus:ring-brand-primary outline-none ${priceErrors[index] ? 'border-red-500' : 'border-brand-border'}`}
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* --- Empty State --- */}
                        {props.quoteItems.length === 0 && (
                            <div className="w-full flex-col flex items-center justify-center">
                                <IconPlaceholder
                                    icon={SearchIcon}
                                    title="Nenhum produto adicionado"
                                    subtitle="Busque produtos no campo acima ou cadastre um item avulso manualmente."
                                    itemButton={!itemsLocked ? {
                                        text: "Adicionar item manual",
                                        action: props.addBlankItem,
                                        variant: "outline",
                                    } : undefined}
                                />
                            </div>
                        )}

                        {/* Add Item Link (When list has items) */}
                        {!itemsLocked && props.quoteItems.length > 0 && (
                            <Button
                                type="button"
                                variant="link"
                                onClick={props.addBlankItem}
                            >
                                <PlusIcon size={14} strokeWidth={3} />
                                Adicionar item manual
                            </Button>
                        )}
                    </div>

                    <div className="border-t border-brand-border dark:border-dark-border w-full my-8"></div>

                    {/* 2. CUSTOMER SECTION */}
                    <div className="mb-8">
                        <h3 className="font-bold text-lg text-brand-dark dark:text-dark-heading mb-6">Cliente</h3>

                        {props.selectedCustomer ? (
                            <div className="flex items-center justify-between p-4 rounded-xl bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border">
                                <div className="flex gap-4 items-center">
                                    <div className="relative">
                                        <UserProfileImage
                                            fullName={props.selectedCustomer.name || "Cliente"}
                                            imageUrl={props.selectedCustomer.avatar_url || props.selectedCustomer.avatar}
                                            className="w-12 h-12 text-lg border border-white dark:border-dark-border"
                                        />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading leading-tight">{props.selectedCustomer.name}</h4>
                                        <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body">
                                            {props.selectedCustomer.email}
                                        </span>
                                    </div>
                                </div>
                                {!customerLocked && (
                                    <Button variant="outlinered" onClick={() => props.setSelectedCustomer(null)}>
                                        Remover
                                    </Button>
                                )}
                            </div>
                        ) : (
                            <IconPlaceholder
                                icon={UserIcon}
                                title={QUOTE_DEFAULT_CUSTOMER_LABEL}
                                subtitle={props.isReadOnly ? "Nenhum cliente cadastrado vinculado; exibição usa o nome padrão." : "Sem cliente cadastrado - a proposta usa o nome padrão. Selecione um cliente para vincular dados de contato."}
                                itemButton={!customerLocked ? {
                                    text: "Selecionar Cliente",
                                    action: () => props.setIsCustomerSheetOpen(true),
                                    variant: "outline"
                                } : undefined}
                            />
                        )}
                    </div>

                    <div className="border-t border-brand-border dark:border-dark-border w-full my-8"></div>

                    {/* 3. SETTINGS SECTION */}
                    <div className="mb-8">
                        <h3 className="font-bold text-lg text-brand-dark dark:text-dark-heading mb-6">Configurações</h3>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                            <DatePicker
                                label="Data Emissão"
                                value={props.quoteDate}
                                onChange={(date: any) => {
                                    if (date) {
                                        const d = new Date(date);
                                        props.setQuoteDate(d.toISOString().split('T')[0]);
                                    }
                                }}
                                disabled={issueDateLocked}
                            />

                            <DatePicker
                                label="Validade da Proposta"
                                value={props.expiryDate}
                                onChange={(date: any) => {
                                    if (date) {
                                        const d = new Date(date);
                                        props.setExpiryDate(d.toISOString().split('T')[0]);
                                    }
                                }}
                                disabled={expiryLocked}
                            />

                            <div className="flex flex-col gap-1.5">
                                <FormDropdown
                                    label="Status"
                                    value={props.status}
                                    setValue={props.setStatus}
                                    options={(props.mode === 'create' || props.mode === 'duplicate' ? statusOptions.filter(o => o.value === 'draft') : statusOptions).map(o => ({ value: o.value, label: o.label }))}
                                    disabled={statusLocked}
                                />
                            </div>
                        </div>

                        {/* Financial Inputs Row */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="relative">
                                {props.discountType === 'R$' ? (
                                    <MoneyInput
                                        label="Desconto"
                                        value={props.discount}
                                        onChange={(val) => props.setDiscount(val.toString())}
                                        disabled={financialLocked}
                                        suffix={
                                            <div className="flex items-center gap-1.5 border-l border-brand-border dark:border-dark-border ml-2 pl-2">
                                                <button type="button" disabled={financialLocked} onClick={() => !financialLocked && props.setDiscountType('R$')} className="text-[11px] font-black text-brand-primary disabled:opacity-40">R$</button>
                                                <div className="w-[1px] h-3 bg-brand-border dark:border-dark-border" />
                                                <button type="button" disabled={financialLocked} onClick={() => !financialLocked && props.setDiscountType('%')} className="text-[11px] font-bold text-brand-inactive-text hover:text-brand-dark transition-colors disabled:opacity-40">%</button>
                                            </div>
                                        }
                                    />
                                ) : (
                                    <PercentageInput
                                        label="Desconto"
                                        value={props.discount}
                                        onChange={(val) => props.setDiscount(val.toString())}
                                        disabled={financialLocked}
                                        suffix={
                                            <div className="flex items-center gap-1.5 border-l border-brand-border dark:border-dark-border ml-2 pl-2">
                                                <button type="button" disabled={financialLocked} onClick={() => !financialLocked && props.setDiscountType('R$')} className="text-[11px] font-bold text-brand-inactive-text hover:text-brand-dark transition-colors disabled:opacity-40">R$</button>
                                                <div className="w-[1px] h-3 bg-brand-border dark:border-dark-border" />
                                                <button type="button" disabled={financialLocked} onClick={() => !financialLocked && props.setDiscountType('%')} className="text-[11px] font-black text-brand-primary disabled:opacity-40">%</button>
                                            </div>
                                        }
                                    />
                                )}
                            </div>

                            <MoneyInput
                                label="Frete"
                                value={Number(props.shippingFee) || 0}
                                onChange={(val) => props.setShippingFee(val.toString())}
                                disabled={financialLocked}
                            />

                            <MoneyInput
                                label="Outros Custos"
                                value={Number(props.otherCosts) || 0}
                                onChange={(val) => props.setOtherCosts(val.toString())}
                                disabled={financialLocked}
                            />
                        </div>
                    </div>
                </FadeIn>
            </TabsContent>

            <TabsContent value="Layout" className="mt-0 focus-visible:outline-none">
                <FadeIn key="Layout">
                    <div className="mb-8">
                        <h3 className="font-bold text-lg text-brand-dark dark:text-dark-heading mb-6 flex items-center gap-2">
                            <SparklesIcon size={20} className="text-brand-dark dark:text-dark-heading" /> Personalizar Aparência
                        </h3>

                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-[13px] font-bold text-brand-dark dark:text-dark-heading mb-2">Cor Primária</label>
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-lg border border-brand-border dark:border-dark-border overflow-hidden relative shadow-sm">
                                            <input
                                                type="color"
                                                value={props.primaryColor}
                                                onChange={(e) => props.setPrimaryColor(e.target.value)}
                                                className="absolute inset-0 w-[150%] h-[150%] -translate-x-1/4 -translate-y-1/4 p-0 border-0 cursor-pointer"
                                                disabled={layoutLocked}
                                            />
                                        </div>
                                        <span className="text-[13px] font-bold tracking-wider uppercase text-brand-inactive-text dark:text-dark-body">{props.primaryColor}</span>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[13px] font-bold text-brand-dark dark:text-dark-heading mb-2">Cor Secundária</label>
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-lg border border-brand-border dark:border-dark-border overflow-hidden relative shadow-sm">
                                            <input
                                                type="color"
                                                value={props.secondaryColor}
                                                onChange={(e) => props.setSecondaryColor(e.target.value)}
                                                className="absolute inset-0 w-[150%] h-[150%] -translate-x-1/4 -translate-y-1/4 p-0 border-0 cursor-pointer"
                                                disabled={layoutLocked}
                                            />
                                        </div>
                                        <span className="text-[13px] font-bold tracking-wider uppercase text-brand-inactive-text dark:text-dark-body">{props.secondaryColor}</span>
                                    </div>
                                </div>
                            </div>

                            <Input
                                label="Título do Documento"
                                name="quoteTitle"
                                value={props.quoteTitle}
                                onChange={(e) => props.setQuoteTitle(e.target.value)}
                                placeholder="EX: ORÇAMENTO"
                                disabled={layoutLocked}
                            />

                            <Input
                                label="Subtítulo"
                                name="quoteSubtitle"
                                value={props.quoteSubtitle}
                                onChange={(e) => props.setQuoteSubtitle(e.target.value)}
                                placeholder="Ex: Proposta Comercial"
                                disabled={layoutLocked}
                            />
                        </div>
                    </div>
                </FadeIn>
            </TabsContent>

            <TabsContent value="Observações" className="mt-0 focus-visible:outline-none">
                <FadeIn key="Observações">
                    <div className="bg-white dark:bg-dark-surface p-0 space-y-8">
                        <div>
                            <label className="block text-lg font-bold text-brand-dark dark:text-dark-heading mb-2">Observações da Proposta</label>
                            <p className="text-xs text-brand-inactive-text dark:text-dark-body mb-4">Texto visível ao cliente na proposta / PDF.</p>
                            <div className="bg-brand-gray dark:bg-dark-border/30 rounded-2xl border border-brand-border dark:border-dark-border p-5 h-[280px]">
                                <textarea
                                    className="w-full h-full bg-transparent border-none text-[15px] text-brand-dark dark:text-dark-heading leading-relaxed focus:outline-none resize-none placeholder:text-brand-inactive-text disabled:opacity-70 font-medium"
                                    placeholder="Adicione termos, condições ou notas para o cliente..."
                                    value={props.internalNote}
                                    onChange={(e) => props.setInternalNote(e.target.value)}
                                    disabled={proposalNotesLocked}
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-lg font-bold text-brand-dark dark:text-dark-heading mb-2">Observações internas</label>
                            <p className="text-xs text-brand-inactive-text dark:text-dark-body mb-4">Uso interno da equipe; não aparecem na proposta ao cliente.</p>
                            <div className="bg-brand-gray dark:bg-dark-border/30 rounded-2xl border border-brand-border dark:border-dark-border p-5 h-[200px]">
                                <textarea
                                    className="w-full h-full bg-transparent border-none text-[15px] text-brand-dark dark:text-dark-heading leading-relaxed focus:outline-none resize-none placeholder:text-brand-inactive-text disabled:opacity-70 font-medium"
                                    placeholder="Notas internas, lembretes, histórico comercial..."
                                    value={props.staffInternalNotes}
                                    onChange={(e) => props.setStaffInternalNotes(e.target.value)}
                                    disabled={internalNotesLocked}
                                />
                            </div>
                        </div>
                    </div>
                </FadeIn>
            </TabsContent>
        </div>
    );
};

export default QuoteEditor;
