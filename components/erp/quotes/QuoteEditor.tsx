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
    TelegramIcon,
    EyeIcon
} from '@/lib/icons';
import { motion, AnimatePresence } from 'framer-motion';
import QuantitySelector from '@/components/reusable/QuantitySelector';
import { Button, Input, TabsContent, FormDropdown, MoneyInput, PercentageInput, DatePicker, ThreeDotsLoader, IconPlaceholder, Pagination, InfoCard, ListItem, FormSection, Badge, FormTextarea } from '@/components/reusable';
import { UserProfileImage } from "@/lib/utils/UserProfileImage";
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url";
import { formatCurrency, formatQuantityWithUnit } from "@/lib/utils";
import { QUOTE_DEFAULT_CUSTOMER_LABEL, type QuoteEditCaps } from "@/lib/quotes/quote-edit-rules";
import { FadeIn } from '@/components/animations/FadeIn';
import { computeItemDisplayPrice } from "@/lib/services/pricing-engine";
import { Switch } from '@/components/reusable/Switch';



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
    showDecoration: boolean;
    setShowDecoration: (val: boolean) => void;
    isReadOnly?: boolean;
    onSearchFocus?: () => void;
    fieldErrors?: Set<string>;
    setFieldErrors?: React.Dispatch<React.SetStateAction<Set<string>>>;
    manualItemNameErrors?: Set<number>;
    manualItemPriceErrors?: Set<number>;
    isLoadingItems?: boolean;
    loadMoreProducts?: () => void;
    hasMoreProducts?: boolean;
    salespersonId?: string;
    setSalespersonId?: (val: string) => void;
    salespeople?: { id: string; name: string }[];
    quotePromotions?: any[];
    canApplyDiscount?: boolean;
    isMarketplaceOrigin?: boolean;
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
        { value: 'pending_client', label: 'Pendente do Cliente', icon: ClockIcon, color: 'text-brand-orange' },
        { value: 'viewed', label: 'Visualizado', icon: EyeIcon, color: 'text-teal-500' },
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
    const discountLocked = financialLocked || props.canApplyDiscount === false
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
                        <InfoCard
                            title="Atenção"
                            message={caps.bannerMessage}
                            color="orange"
                            className="mb-6"
                            bottomElement={
                                <div className="flex items-center gap-2">
                                    {caps.showReopenCta && props.onReopenQuote && (
                                        <Button variant="link" className="text-brand-orange hover:text-brand-orange/70" onClick={props.onReopenQuote}>
                                            Reabrir como rascunho
                                        </Button>
                                    )}
                                    {caps.showDuplicateCta && props.onDuplicateQuote && (
                                        <Button variant="link" className="text-brand-orange hover:text-brand-orange/70" onClick={props.onDuplicateQuote}>
                                            Duplicar orçamento
                                        </Button>
                                    )}
                                </div>
                            }
                        />
                    )}

                    {/* Customer Selection - Mobile/Tablet only */}
                    <div className="block lg:hidden mb-6">
                        <FormSection title="" className="mt-0">
                            {props.selectedCustomer ? (
                                <ListItem
                                    left={
                                        <UserProfileImage
                                            fullName={props.selectedCustomer.name || "Cliente"}
                                            imageUrl={props.selectedCustomer.image_url || props.selectedCustomer.avatar_url || props.selectedCustomer.avatar}
                                            className="w-10 h-10 text-base"
                                        />
                                    }
                                    title={props.selectedCustomer.name}
                                    description={
                                        <div className="flex flex-col gap-0.5">
                                            <span>{props.selectedCustomer.email || props.selectedCustomer.phone || "Cliente"}</span>
                                            {props.isMarketplaceOrigin && (
                                                <span className="text-[11px] text-brand-green font-semibold">Solicitado via Vitrine Digital</span>
                                            )}
                                        </div>
                                    }
                                    className="border-0 bg-transparent px-0 hover:bg-transparent"
                                    showChevron={!customerLocked}
                                    onClick={customerLocked ? undefined : () => props.setIsCustomerSheetOpen(true)}
                                />
                            ) : (
                                <ListItem
                                    left={
                                        <div className="w-10 h-10 rounded-full bg-brand-slate dark:bg-dark-border/50 flex items-center justify-center border border-brand-border dark:border-dark-border shrink-0">
                                            <UserIcon size={20} className="text-brand-dark dark:text-dark-heading" />
                                        </div>
                                    }
                                    title="Nenhum cliente selecionado"
                                    description="Clique para selecionar um cliente"
                                    className="border-0 bg-transparent px-0 hover:bg-transparent"
                                    showChevron={!customerLocked}
                                    onClick={customerLocked ? undefined : () => props.setIsCustomerSheetOpen(true)}
                                />
                            )}
                        </FormSection>
                        <div className="border-t border-brand-border dark:border-dark-border w-full my-6"></div>
                    </div>

                    {/* 1. PRODUCT SEARCH & TABLE */}
                    <FormSection title="Itens da Proposta" className="mb-8">
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
                                    dataField="productSearch"
                                />
                            )}

                            <AnimatePresence>
                                {props.isProductSearchOpen && props.searchQuery && !itemsLocked && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 5 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: 5 }}
                                        className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl shadow-xl z-[9999] max-h-72 overflow-y-auto custom-scrollbar"
                                        onScroll={(e) => {
                                            const target = e.currentTarget;
                                            if (target.scrollHeight - target.scrollTop - target.clientHeight < 20) {
                                                props.loadMoreProducts?.();
                                            }
                                        }}
                                    >
                                        {props.isSearching ? (
                                            <ThreeDotsLoader />
                                        ) : props.filteredProducts.length > 0 ? (
                                            props.filteredProducts.map(product => (
                                                <div
                                                    key={product.id}
                                                    onClick={() => props.handleProductClick(product)}
                                                    className="flex items-center gap-4 p-3.5 hover:bg-gray-50 dark:hover:bg-dark-border cursor-pointer border-b border-brand-border dark:border-dark-border last:border-0 transition-colors"
                                                >
                                                    <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border/50 overflow-hidden shrink-0 border border-brand-border dark:border-dark-border">
                                                        <img src={getR2ImageUrl(product.image, "thumbnail") || "https://img.dudit.com.br/static/Placeholder.png"} alt={product.name} className="w-full h-full object-cover rounded-full bg-brand-gray dark:bg-dark-border border border-brand-border dark:border-dark-border" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">{product.name}</div>
                                                        <div className="text-[11px] font-medium text-brand-inactive-text mt-0.5 tracking-wider uppercase truncate">
                                                            {(product.variants && product.variants.length > 0) ? "Múltiplos SKUs" : (product.sku || "N/A")}
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col items-end gap-1 shrink-0">
                                                        {(() => {
                                                            if (product.variants && product.variants.length > 0) {
                                                                const prices = product.variants.map((v: any) => Number(v.price || 0))
                                                                const minP = Math.min(...prices)
                                                                const maxP = Math.max(...prices)
                                                                const priceText = minP === maxP ? formatCurrency(minP) : `De: ${formatCurrency(minP)} Até: ${formatCurrency(maxP)}`
                                                                return <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{priceText}</span>
                                                            }
                                                            const pr = computeItemDisplayPrice(Number(product.price || 0), product.promotional_price && Number(product.promotional_price) < Number(product.price || 0) ? Number(product.promotional_price) : null, props.quotePromotions || [], { productId: product.id, categoryId: product.category_id || undefined });
                                                            return (
                                                                <div className="flex items-center gap-1.5">
                                                                    {pr.referencePrice && <span className="text-xs text-brand-inactive-text line-through">{formatCurrency(pr.referencePrice)}</span>}
                                                                    <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(pr.bestPrice)}</span>
                                                                    {pr.badgeVariant === "blue" && <Badge variant="blue" icon={null} className="whitespace-nowrap">-{pr.discountPercent}%</Badge>}
                                                                    {pr.badgeVariant === "orange" && <Badge variant="orange" icon={null} className="whitespace-nowrap">-{pr.discountPercent}%</Badge>}
                                                                </div>
                                                            )
                                                        })()}
                                                        <div className="text-xs font-bold text-white bg-brand-dark dark:bg-brand-green px-2 py-1 rounded-md whitespace-nowrap">
                                                            {product.isService ? "Serviço" : `${(product.variants && product.variants.length > 0) ? product.variants.reduce((sum: number, v: any) => sum + Number(v.stock || 0), 0) : (product.stock || 0)} em estoque`}
                                                        </div>
                                                    </div>
                                                    {product.variants && product.variants.length > 0 && (
                                                        <div className="px-2 py-0.5 bg-gray-100 dark:bg-zinc-700 text-[10px] font-bold rounded text-brand-inactive-text uppercase whitespace-nowrap">
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
                                                                            maxLength={150}
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
                                                            <QuantitySelector value={item.qty} onChange={(val) => props.updateItemQty(index, val)} size="md" disabled={itemsLocked} />
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
                                                                maxLength={150}
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
                                                        {item.isEditing ? (item.sku ? `${item.sku} • ` : '') : `${item.sku || 'Sem SKU'} • `}{formatQuantityWithUnit(item.qty, item.unit)} • {formatCurrency(item.price)}
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
                                                        <QuantitySelector value={item.qty} onChange={(val) => props.updateItemQty(index, val)} size="sm" />
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
                    </FormSection>

                    {/* 2. CUSTOMER SECTION (Desktop only - mobile/tablet uses top ListItem) */}
                    <div className="hidden lg:block">
                        <FormSection title="Cliente" hasSeparator>
                            {props.selectedCustomer ? (
                                <div className="flex items-center justify-between p-4 rounded-xl bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border">
                                    <div className="flex gap-4 items-center">
                                        <div className="relative">
                                            <UserProfileImage
                                                fullName={props.selectedCustomer.name || "Cliente"}
                                                imageUrl={props.selectedCustomer.image_url || props.selectedCustomer.avatar_url || props.selectedCustomer.avatar}
                                                className="w-12 h-12 text-lg border border-white dark:border-dark-border"
                                            />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h4 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading leading-tight">{props.selectedCustomer.name}</h4>
                                                {props.isMarketplaceOrigin && (
                                                    <Badge variant="blue" className="text-[10px] py-0 px-1.5 font-bold uppercase">
                                                        Vitrine Digital
                                                    </Badge>
                                                )}
                                            </div>
                                            <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body">
                                                {props.selectedCustomer.email || props.selectedCustomer.phone || "Cliente"}
                                            </span>
                                        </div>
                                    </div>
                                    {!customerLocked && (
                                        <Button variant="outlinered" onClick={() => props.setSelectedCustomer(null)}>
                                            Remover
                                        </Button>
                                    )}
                                    {customerLocked && props.isMarketplaceOrigin && (
                                        <span className="text-xs text-brand-inactive-text dark:text-dark-body italic">
                                            Cliente vinculado à vitrine digital
                                        </span>
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
                        </FormSection>
                    </div>

                    {/* 3. SETTINGS SECTION */}
                    <FormSection title="Configurações" hasSeparator>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
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

                            {props.mode !== 'create' && props.mode !== 'duplicate' && (
                                <div className="flex flex-col gap-1.5">
                                    <FormDropdown
                                        label="Status"
                                        value={props.status}
                                        setValue={props.setStatus}
                                        options={statusOptions.map(o => ({ value: o.value, label: o.label }))}
                                        disabled={statusLocked}
                                    />
                                </div>
                            )}

                            <div className="flex flex-col gap-1.5">
                                <FormDropdown
                                    label="Vendedor"
                                    value={props.salespersonId || ""}
                                    setValue={props.setSalespersonId || (() => { })}
                                    options={(props.salespeople || []).map(s => ({ value: s.id, label: s.name }))}
                                    disabled={props.mode === 'edit' || props.mode === 'view' || props.isReadOnly}
                                />
                            </div>
                        </div>

                        {/* Financial Inputs Row */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {!discountLocked && (
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
                            )}

                            <MoneyInput
                                label="Entrega"
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
                    </FormSection>
                </FadeIn>
            </TabsContent>

            <TabsContent value="Layout" className="mt-0 focus-visible:outline-none">
                <FadeIn key="Layout">
                    <FormSection title="Personalizar Aparência">
                        <div className="space-y-6">
                            <div>
                                <label className="block text-[13px] font-bold text-brand-dark dark:text-dark-heading mb-3">Temas de Cor</label>
                                <div className="flex flex-wrap gap-2">
                                    {[
                                        { p: "#003229", s: "#d4f995", label: "Padrão" },
                                        { p: "#1e40af", s: "#bfdbfe", label: "Azul" },
                                        { p: "#065f46", s: "#a7f3d0", label: "Verde" },
                                        { p: "#6b21a8", s: "#e9d5ff", label: "Roxo" },
                                        { p: "#991b1b", s: "#fca5a5", label: "Vermelho" },
                                        { p: "#c2410c", s: "#fed7aa", label: "Laranja" },
                                        { p: "#1e1e1e", s: "#e5e5e5", label: "Escuro" },
                                        { p: "#0369a1", s: "#bae6fd", label: "Celeste" },
                                    ].map((theme) => (
                                        <button
                                            key={theme.label}
                                            type="button"
                                            onClick={() => { props.setPrimaryColor(theme.p); props.setSecondaryColor(theme.s); }}
                                            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-brand-border dark:border-dark-border hover:border-brand-dark dark:hover:border-dark-heading transition-colors disabled:opacity-50"
                                            disabled={layoutLocked}
                                            title={theme.label}
                                        >
                                            <div className="w-5 h-5 rounded-full border border-white/50 shadow-sm" style={{ backgroundColor: theme.p }} />
                                            <div className="w-5 h-5 rounded-full border border-white/50 shadow-sm -ml-2" style={{ backgroundColor: theme.s }} />
                                            <span className="text-xs font-medium text-brand-dark dark:text-dark-body">{theme.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-[13px] font-bold text-brand-dark dark:text-dark-heading mb-2">Cor Primária</label>
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full border border-brand-border dark:border-dark-border overflow-hidden relative">
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
                                        <div className="w-10 h-10 rounded-full border border-brand-border dark:border-dark-border overflow-hidden relative">
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
                                onChange={(e) => { const v = e.target.value; if (v.length <= 30) props.setQuoteTitle(v); }}
                                placeholder="EX: ORÇAMENTO"
                                maxLength={30}
                                disabled={layoutLocked}
                            />

                            <Input
                                label="Subtítulo"
                                name="quoteSubtitle"
                                value={props.quoteSubtitle}
                                onChange={(e) => { const v = e.target.value; if (v.length <= 30) props.setQuoteSubtitle(v); }}
                                placeholder="Ex: Proposta Comercial"
                                maxLength={30}
                                disabled={layoutLocked}
                            />

                            <div className="flex items-center justify-between py-3 px-4 bg-brand-gray dark:bg-dark-border/30 rounded-xl">
                                <div>
                                    <span className="text-sm font-bold text-brand-dark dark:text-dark-heading block">Detalhes decorativos</span>
                                    <span className="text-xs text-brand-inactive-text">Mostrar círculos e enfeites no cabeçalho</span>
                                </div>

                                <Switch checked={props.showDecoration} onCheckedChange={() => props.setShowDecoration(!props.showDecoration)} />
                            </div>
                        </div>
                    </FormSection>
                </FadeIn>
            </TabsContent>

            <TabsContent value="Observações" className="mt-0 focus-visible:outline-none">
                <FadeIn key="Observações">
                    <FormSection title="Observações" className="bg-white dark:bg-dark-surface p-0 space-y-8">
                        <div>
                            <p className="text-xs text-brand-inactive-text dark:text-dark-body mb-4">Texto visível ao cliente na proposta / PDF.</p>
                            <FormTextarea
                                label="Observações da Proposta"
                                placeholder="Adicione termos, condições ou notas para o cliente..."
                                value={props.internalNote}
                                onChange={(e) => props.setInternalNote(e.target.value)}
                                disabled={proposalNotesLocked}
                                name="internalNote"
                                maxLength={500}
                                showCharacterCount
                            />
                        </div>
                        <div>
                            <p className="text-xs text-brand-inactive-text dark:text-dark-body mb-4">Uso interno da equipe; não aparecem na proposta ao cliente.</p>
                            <FormTextarea
                                label="Observações internas"
                                placeholder="Notas internas, lembretes, histórico comercial..."
                                value={props.staffInternalNotes}
                                onChange={(e) => props.setStaffInternalNotes(e.target.value)}
                                disabled={internalNotesLocked}
                                name="staffInternalNotes"
                                maxLength={500}
                                showCharacterCount
                            />
                        </div>
                    </FormSection>
                </FadeIn>
            </TabsContent>
        </div>
    );
};

export default QuoteEditor;
