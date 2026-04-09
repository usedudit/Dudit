"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Tabs, TabsList, TabsTrigger, Badge, Button, AlertModal } from '@/components/reusable';
import { FadeIn } from '@/components/animations/FadeIn';
import { ChevronLeftIcon, SaveIcon } from '@/lib/icons';
import QuoteEditor from './QuoteEditor';
import QuotePreview from './QuotePreview';
import SelectCustomerSheet from '../clientes/SelectCustomerSheet';
import SelectVariantSheet from './SelectVariantSheet';
import { useNotification } from '@/hooks/use-notification';
import { useStore } from '@/lib/store-context';
import { createQuoteAction, getQuoteDetailsAction, getPartnerAddressAction, getNextQuoteNumberAction } from '@/app/actions/erp/quotes';
import { fetchPartnerProductsBucket } from "@/app/actions/erp/client-loaders";
import { useProductBucket } from "../hooks";
import { useSidebar } from '@/lib/sidebar-context';
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { useRouter } from "next/navigation";

interface CreateQuoteProps {
    partnerId: string;
    onBack: () => void;
    existingQuote?: any;
    mode: 'create' | 'edit' | 'duplicate' | 'view';
}

const REQUIRED_FIELDS = [
    { field: "productSearch", tab: "Dados Gerais" },
]

const CreateQuote = ({ partnerId, onBack, existingQuote, mode }: CreateQuoteProps) => {
    const { success: notifySuccess, error: notifyError } = useNotification();
    const router = useRouter();
    const { selectedStore } = useStore();
    const { setHeaderOverride } = useSidebar();
    const [isSaving, setIsSaving] = useState(false);
    const [isLoadingDetails, setIsLoadingDetails] = useState(false);
    const [realQuoteNumber, setRealQuoteNumber] = useState(existingQuote?.quote_number || '');

    // Partner info for preview
    const partnerName = selectedStore?.name || 'Sua Loja';
    const [partnerAddress, setPartnerAddress] = useState('Endereço não informado');
    const partnerAvatar = selectedStore?.image_url || '';
    const [isScrolled, setIsScrolled] = useState(false);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5);
    }, []);
    const [activeTab, setActiveTab] = useState('Dados Gerais');

    // Fetch Partner Address
    useEffect(() => {
        const fetchAddress = async () => {
            if (!partnerId) return;
            const res = await getPartnerAddressAction(partnerId);
            if (res.success && res.data?.formatted) {
                setPartnerAddress(res.data.formatted);
            }
        };
        fetchAddress();
    }, [partnerId]);

    // Search States
    const [isProductSearchOpen, setIsProductSearchOpen] = useState(false);
    const productBucket = useProductBucket(fetchPartnerProductsBucket);

    // Sheet States
    const [isCustomerSheetOpen, setIsCustomerSheetOpen] = useState(false);
    const [isVariantSheetOpen, setIsVariantSheetOpen] = useState(false);
    const [productToSelectVariant, setProductToSelectVariant] = useState<any | null>(null);

    // Quote State
    const [quoteItems, setQuoteItems] = useState<any[]>([]);
    const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
    const [internalNote, setInternalNote] = useState('');

    // Settings State
    const [quoteDate, setQuoteDate] = useState(new Date().toISOString().split('T')[0]);
    const [expiryDate, setExpiryDate] = useState(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    const [status, setStatus] = useState('draft');

    // Layout Settings State
    const [primaryColor, setPrimaryColor] = useState('#113833');
    const [secondaryColor, setSecondaryColor] = useState('#d4f995');
    const [quoteTitle, setQuoteTitle] = useState('ORÇAMENTO');
    const [quoteSubtitle, setQuoteSubtitle] = useState('');

    // Financials State
    const [discount, setDiscount] = useState('');
    const [discountType, setDiscountType] = useState<'R$' | '%'>('R$');
    const [shippingFee, setShippingFee] = useState('');
    const [otherCosts, setOtherCosts] = useState('');
    const [fieldErrors, setFieldErrors] = useState<Set<string>>(new Set());

    const getItemMaxQuantity = useCallback((item: any) => {
        if (!item || item.isBlank) return undefined;
        return Math.max(0, Number(item.stock ?? 0));
    }, []);

    const validateQuoteStock = useCallback((targetItems: any[]) => {
        const stockMap = new Map<string, { name: string; quantity: number; stock: number }>();

        for (const item of targetItems) {
            if (item.isBlank || !item.id) continue;
            const key = item.variantId ? `variant:${item.variantId}` : `product:${item.id}`;
            const existing = stockMap.get(key);

            if (existing) {
                existing.quantity += Number(item.qty || 0);
                continue;
            }

            stockMap.set(key, {
                name: item.name || "Produto",
                quantity: Number(item.qty || 0),
                stock: Number(item.stock ?? 0),
            });
        }

        for (const entry of stockMap.values()) {
            if (entry.quantity > entry.stock) {
                return `A quantidade de "${entry.name}" está maior que o estoque disponível.`;
            }
        }

        return null;
    }, []);

    // Persistence State (for isDirty)
    const [originalQuoteData, setOriginalQuoteData] = useState<any>(null);

    // Pre-populate immediately from existingQuote (basic data from list) before background fetch
    const prePopulatedRef = useRef(false);
    useEffect(() => {
        if (prePopulatedRef.current || mode === 'create' || !existingQuote) return;
        prePopulatedRef.current = true;

        // Set basic data immediately from the list object
        if (existingQuote.customers) setSelectedCustomer(existingQuote.customers);
        if (existingQuote.notes) setInternalNote(existingQuote.notes);
        if (existingQuote.issue_date) setQuoteDate(existingQuote.issue_date);
        if (existingQuote.expiration_date) setExpiryDate(existingQuote.expiration_date);
        if (existingQuote.status) setStatus(existingQuote.status);
        if (existingQuote.discount_value) setDiscount(existingQuote.discount_value.toString());
        if (existingQuote.discount_type) setDiscountType(existingQuote.discount_type === 'percentage' ? '%' : 'R$');
        if (existingQuote.shipping_cost) setShippingFee(existingQuote.shipping_cost.toString());
        if (existingQuote.additional_costs) setOtherCosts(existingQuote.additional_costs.toString());
    }, [existingQuote, mode]);

    // 1. Fetch Full Quote Details if existingQuote is provided
    useEffect(() => {
        const fetchDetails = async () => {
            if (mode === 'create') {
                const res = await getNextQuoteNumberAction(partnerId);
                if (res.success) setRealQuoteNumber(res.data);
                return;
            }
            if (!existingQuote?.id) return;

            setIsLoadingDetails(true);
            try {
                const res = await getQuoteDetailsAction(existingQuote.id, partnerId);
                if (res.success && res.data) {
                    const q = res.data;

                    // Map items
                    const items = q.items.map((item: any) => ({
                        id: item.product_id || `legacy-${item.id}`,
                        rowId: `item-${item.id}`,
                        name: item.custom_name || item.products?.name || 'Item sem nome',
                        sku: item.products?.sku || 'N/A',
                        price: Number(item.unit_price),
                        qty: Number(item.quantity),
                        stock: Number(item.products?.stock_quantity ?? 0),
                        image: item.products?.images?.[0] || 'https://img.dudit.com.br/static/Placeholder.png',
                        isEditing: false
                    }));

                    setQuoteItems(items);
                    setSelectedCustomer(q.customers);
                    setInternalNote(q.notes || '');
                    setQuoteDate(q.issue_date);
                    setExpiryDate(q.expiration_date);
                    setStatus(q.status);
                    setDiscount(q.discount_value?.toString() || '');
                    setDiscountType(q.discount_type === 'percentage' ? '%' : 'R$');
                    setShippingFee(q.shipping_cost?.toString() || '');
                    setOtherCosts(q.additional_costs?.toString() || '');

                    // Snapshot for dirty check
                    const snapshot = {
                        items,
                        customer: q.customers,
                        note: q.notes || '',
                        date: q.issue_date,
                        expiry: q.expiration_date,
                        status: q.status,
                        discount: q.discount_value?.toString() || '',
                        discountType: q.discount_type === 'percentage' ? '%' : 'R$',
                        shipping: q.shipping_cost?.toString() || '',
                        others: q.additional_costs?.toString() || ''
                    };
                    setOriginalQuoteData(snapshot);
                }
            } catch (err) {
                console.error("Error fetching quote details:", err);
            } finally {
                setIsLoadingDetails(false);
            }
        };

        fetchDetails();
    }, [existingQuote?.id, mode, partnerId]);

    // Unsaved Changes Logic
    const currentData = useMemo(() => ({
        items: quoteItems,
        customer: selectedCustomer,
        note: internalNote,
        date: quoteDate,
        expiry: expiryDate,
        status,
        discount,
        discountType,
        shipping: shippingFee,
        others: otherCosts
    }), [quoteItems, selectedCustomer, internalNote, quoteDate, expiryDate, status, discount, discountType, shippingFee, otherCosts]);

    const isDirty = useMemo(() => {
        if (!originalQuoteData) return mode === 'create' && quoteItems.length > 0;

        // Fast shallow checks first
        if (
            currentData.date !== originalQuoteData.date ||
            currentData.expiry !== originalQuoteData.expiry ||
            currentData.status !== originalQuoteData.status ||
            currentData.discount !== originalQuoteData.discount ||
            currentData.discountType !== originalQuoteData.discountType ||
            currentData.shipping !== originalQuoteData.shipping ||
            currentData.others !== originalQuoteData.others ||
            currentData.note !== originalQuoteData.note ||
            currentData.customer?.id !== originalQuoteData.customer?.id ||
            currentData.items.length !== originalQuoteData.items.length
        ) {
            return true;
        }

        // Fallback to deep check only for items if necessary
        return JSON.stringify(currentData.items) !== JSON.stringify(originalQuoteData.items);
    }, [currentData, originalQuoteData, mode, quoteItems.length]);

    const { showConfirmDialog: unsavedChangesDialogOpen, confirmNavigation: handleUnsavedChangesConfirm, cancelNavigation: handleUnsavedChangesDialogClose } = useUnsavedChanges(isDirty && mode !== 'view');

    const [showAlertModal, setShowAlertModal] = useState(false);
    const [nextAction, setNextAction] = useState<(() => void) | null>(null);

    const handleAttemptNav = useCallback((action: () => void) => {
        if (isDirty && mode !== 'view') {
            setNextAction(() => action);
            setShowAlertModal(true);
        } else {
            action();
        }
    }, [isDirty, mode]);

    const handleBackWithSafety = useCallback(() => handleAttemptNav(onBack), [handleAttemptNav, onBack]);

    const confirmNavigation = useCallback(() => {
        nextAction?.();
        setShowAlertModal(false);
    }, [nextAction]);




    // 1. Handle Product Click
    const handleProductClick = (product: any) => {
        // If product has no variants, add it directly
        const variants = product.variants || [];

        if (variants.length === 0) {
            if (Number(product.stock || 0) < 1) {
                notifyError("Estoque insuficiente", `"${product.name}" está sem estoque disponível.`);
                return;
            }
            addItem(product, undefined, undefined, 1, product.price);
            setIsProductSearchOpen(false);
            return;
        }

        const productWithQty = {
            ...product,
            variants: variants.map((v: any) => ({ ...v, qty: 0 }))
        };
        setProductToSelectVariant(productWithQty);
        setIsVariantSheetOpen(true);
        setIsProductSearchOpen(false);
    };

    // 2. Add Item Logic
    const addItem = (product: any, variantName?: string, variantSku?: string, qty: number = 1, price?: number) => {
        setQuoteItems(prevItems => {
            const finalName = (variantName && variantName !== product.name) ? `${product.name} - ${variantName}` : product.name;
            const finalSku = variantSku || product.sku;
            const finalPrice = price || product.price;

            const existingItemIndex = prevItems.findIndex(i => i.id === product.id && i.variant === variantName);

            if (existingItemIndex >= 0) {
                const newItems = [...prevItems];
                const nextQty = newItems[existingItemIndex].qty + qty;
                const maxQty = getItemMaxQuantity(newItems[existingItemIndex]);
                if (maxQty !== undefined && nextQty > maxQty) {
                    notifyError("Estoque insuficiente", `A quantidade de "${finalName}" está maior que o estoque disponível.`);
                    return prevItems;
                }
                newItems[existingItemIndex] = {
                    ...newItems[existingItemIndex],
                    qty: nextQty
                };
                return newItems;
            } else {
                return [...prevItems, {
                    ...product,
                    rowId: `item-${Date.now()}-${Math.random()}`,
                    name: finalName,
                    sku: finalSku,
                    price: finalPrice,
                    variant: variantName,
                    variantId: product.variantId || null,
                    qty: qty,
                    isEditing: false
                }];
            }
        });

        setFieldErrors(prev => {
            const next = new Set(prev);
            next.delete("productSearch");
            return next;
        });
        productBucket.setSearchQuery('');
        setIsProductSearchOpen(false);
    };

    // Add Blank Item (Starts in Edit Mode)
    const addBlankItem = () => {
        setQuoteItems(prevItems => [
            ...prevItems,
            {
                id: `blank-${Date.now()}`,
                rowId: `blank-${Date.now()}-${Math.random()}`,
                name: '',
                sku: '',
                price: 0,
                qty: 1,
                image: '',
                isBlank: true,
                isEditing: true
            }
        ]);
        setFieldErrors(prev => {
            const next = new Set(prev);
            next.delete("productSearch");
            return next;
        });
    };

    // 3. Add Variants from Sheet
    const handleConfirmVariants = (selectedVariants: any[]) => {
        if (!productToSelectVariant) return;

        setQuoteItems(prevItems => {
            const newItems = [...prevItems];
            selectedVariants.forEach((v: any) => {
                if (v.qty > 0) {
                    const variantName = v.name;
                    const variantNameForCheck = variantName;

                    const existingIndex = newItems.findIndex(i => i.id === productToSelectVariant.id && i.variant === variantNameForCheck);
                    if (existingIndex >= 0) {
                        const nextQty = newItems[existingIndex].qty + v.qty;
                        if (nextQty > Number(newItems[existingIndex].stock ?? 0)) {
                            return;
                        }
                        newItems[existingIndex] = { ...newItems[existingIndex], qty: nextQty };
                    } else {
                        const finalName = variantName === productToSelectVariant.name ? productToSelectVariant.name : `${productToSelectVariant.name} - ${v.name}`;
                        newItems.push({
                            ...productToSelectVariant,
                            rowId: `item-${Date.now()}-${Math.random()}-${v.id}`,
                            name: finalName,
                            sku: v.sku,
                            price: v.price,
                            variant: variantNameForCheck,
                            variantId: v.id,
                            stock: v.stock,
                            qty: v.qty,
                            isEditing: false
                        });
                    }
                }
            });
            return newItems;
        });
        setProductToSelectVariant(null);
        setIsVariantSheetOpen(false);
        setFieldErrors(prev => {
            const next = new Set(prev);
            next.delete("productSearch");
            return next;
        });
    };

    const updateItemQty = (index: number, newQty: number) => {
        if (newQty < 1) return;
        const newItems = [...quoteItems];
        const maxQty = getItemMaxQuantity(newItems[index]);
        if (maxQty !== undefined && newQty > maxQty) {
            notifyError("Estoque insuficiente", `A quantidade de "${newItems[index].name}" está maior que o estoque disponível.`);
            newItems[index].qty = maxQty;
        } else {
            newItems[index].qty = newQty;
        }
        setQuoteItems(newItems);
    };

    const removeItem = (index: number) => {
        const newItems = [...quoteItems];
        newItems.splice(index, 1);
        setQuoteItems(newItems);
    };

    const updateItemPrice = (index: number, newPrice: number) => {
        const newItems = [...quoteItems];
        newItems[index].price = newPrice;
        setQuoteItems(newItems);
    };

    const updateItemField = (index: number, field: string, value: any) => {
        const newItems = [...quoteItems];
        newItems[index] = { ...newItems[index], [field]: value };
        setQuoteItems(newItems);
    };

    const toggleItemEdit = (index: number, isEditing: boolean) => {
        const newItems = [...quoteItems];
        newItems[index] = { ...newItems[index], isEditing };
        setQuoteItems(newItems);
    };

    // Financial Calculations
    const subtotal = quoteItems.reduce((acc, item) => acc + (item.price * item.qty), 0);

    let discountValue = 0;
    const discountNum = parseFloat(discount) || 0;
    if (discountType === '%') {
        discountValue = subtotal * (discountNum / 100);
    } else {
        discountValue = discountNum;
    }

    const shippingNum = parseFloat(shippingFee) || 0;
    const otherCostsNum = parseFloat(otherCosts) || 0;
    const total = Math.max(0, subtotal + shippingNum + otherCostsNum - discountValue);

    const quoteCode = realQuoteNumber || existingQuote?.quote_number || "";
    const pageTitle = mode === 'create' ? 'Novo Orçamento' :
        mode === 'edit' ? `Editar Orçamento ${quoteCode}`.trim() :
            mode === 'duplicate' ? `Duplicar Orçamento ${quoteCode}`.trim() :
                `Orçamento ${quoteCode}`.trim();

    useEffect(() => {
        const isMobile = window.innerWidth < 768;
        if (isMobile) {
            setHeaderOverride(null);
        } else {
            setHeaderOverride({
                title: pageTitle,
                onBack: handleBackWithSafety,
                isSubPage: true
            });
        }
        return () => setHeaderOverride(null);
    }, [pageTitle, handleBackWithSafety, setHeaderOverride]);

    const handleSave = async () => {
        if (quoteItems.length === 0) {
            setFieldErrors(new Set(["productSearch"]));
            notifyError("Carrinho vazio", "Adicione pelo menos um item ao orçamento.");
            return;
        }
        const stockValidationMessage = validateQuoteStock(quoteItems);
        if (stockValidationMessage) {
            notifyError("Estoque insuficiente", stockValidationMessage);
            return;
        }
        setFieldErrors(new Set());

        setIsSaving(true);
        try {
            const result = await createQuoteAction({
                partnerId: partnerId,
                customerId: selectedCustomer?.id,
                issueDate: quoteDate,
                expirationDate: expiryDate,
                notes: internalNote,
                discountType: discountType === '%' ? 'percentage' : 'fixed',
                discountValue: Number(discount) || 0,
                shippingCost: Number(shippingFee) || 0,
                additionalCosts: Number(otherCosts) || 0,
                items: quoteItems.map((item, idx) => ({
                    productId: item.isBlank ? null : item.id,
                    customName: item.isBlank ? item.name : undefined,
                    quantity: item.qty,
                    unitPrice: item.price,
                    sortOrder: idx
                }))
            });

            if (result.success) {
                notifySuccess(mode === 'edit' ? "Alterações salvas!" : "Orçamento criado!",
                    "O orçamento foi salvo com sucesso.");
                router.refresh();
                onBack();
            } else {
                notifyError("Erro ao salvar", (result as any).error || "Ocorreu um erro inesperado.");
            }
        } catch (error) {
            console.error(error);
            notifyError("Erro fatal", "Não foi possível conectar ao servidor.");
        } finally {
            setIsSaving(false);
        }
    };

    const getTabErrorCount = useCallback((tab: string) => {
        return REQUIRED_FIELDS.filter(({ field, tab: fieldTab }) => fieldTab === tab && fieldErrors.has(field)).length
    }, [fieldErrors])

    const currentItems = quoteItems;
    const itemsCount = currentItems.length;
    const hasItems = itemsCount > 0;

    return (
        <FadeIn>
            <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden relative">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full w-full">
                    <div className="flex-1 w-full h-full relative pb-20 md:pb-0">
                        <div className="flex flex-col lg:flex-row w-full h-full">

                            {/* LEFT SIDE - EDITOR */}
                            <div
                                className="w-full lg:w-1/2 flex flex-col border-r-0 lg:border-r border-brand-border dark:border-dark-border bg-white dark:bg-dark-background overflow-y-auto no-scrollbar"
                                ref={scrollContainerRef}
                                onScroll={handleScroll}
                            >
                                {/* Sticky Header inside Left Side */}
                                <div className="sticky top-0 z-30 w-full bg-white dark:bg-dark-surface border-b border-brand-border dark:border-dark-border transition-all duration-300 ease-in-out">
                                    <div className="px-4 md:px-6 pt-4 md:pt-6">

                                        <div className="flex items-start justify-between">
                                            <div className="flex items-center gap-4 min-w-0">
                                                {/* Back button */}
                                                <Button
                                                    variant="filled"
                                                    onClick={handleBackWithSafety}
                                                    className={`flex-shrink-0 flex items-center justify-center transition-all duration-300 ${isScrolled ? "w-8 h-8" : "w-10 h-10"}`}
                                                >
                                                    <ChevronLeftIcon className={`${isScrolled ? "w-4 h-4" : "w-5 h-5"} text-brand-inactive-text dark:text-dark-body`} />
                                                </Button>

                                                <div className="flex flex-col gap-0.5 overflow-hidden min-w-0">
                                                    <h1 className={`font-bold transition-all duration-300 ease-in-out flex items-center gap-3 ${isScrolled ? "text-lg" : "text-xl md:text-2xl"}`}>
                                                        <span className="truncate">{pageTitle}</span>
                                                        {mode === "edit" && (
                                                            <Badge variant="gray">
                                                                Editando
                                                            </Badge>
                                                        )}
                                                    </h1>

                                                    <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[14px] font-medium transition-all duration-300 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100 mt-0.5"}`}>
                                                        {mode === 'create' && "Crie uma proposta comercial para seu cliente"}
                                                        {mode === 'duplicate' && "Crie uma nova proposta a partir de uma existente"}
                                                        {mode === 'edit' && "Edite os detalhes da sua proposta comercial"}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Desktop action buttons */}
                                            <div className="hidden md:flex items-center gap-3 flex-shrink-0 ml-3">
                                                <Button variant="outline" onClick={handleBackWithSafety} disabled={isSaving} className={isScrolled ? "h-9 px-3 text-xs" : ""}>
                                                    Cancelar
                                                </Button>
                                                <Button onClick={handleSave} disabled={isSaving} isLoading={isSaving} className={isScrolled ? "h-9 px-4 text-xs" : ""}>
                                                    {!isSaving && <SaveIcon className={`${isScrolled ? "w-3.5 h-3.5" : "w-[18px] h-[18px]"} mr-2`} />}
                                                    {mode === 'edit' ? "Salvar" : "Salvar"}
                                                </Button>
                                            </div>
                                        </div>

                                        {/* Tabs */}
                                        <div className={`w-full transition-all duration-300 ${isScrolled ? "mt-3" : "mt-6"}`}>
                                            <TabsList className="bg-transparent p-0 w-full justify-start border-b-0 h-auto gap-6">
                                                <TabsTrigger value="Dados Gerais" className={`px-0 transition-all duration-300 ${isScrolled ? "pb-2 text-[13px]" : "pb-3 text-sm"}`}>
                                                    Dados Gerais
                                                    {getTabErrorCount("Dados Gerais") > 0 && <span className="ml-2 w-2 h-2 bg-red-500 rounded-full inline-block" />}
                                                </TabsTrigger>
                                                <TabsTrigger value="Observações" className={`px-0 transition-all duration-300 ${isScrolled ? "pb-2 text-[13px]" : "pb-3 text-sm"}`}>Observações</TabsTrigger>
                                                <TabsTrigger value="Visualização" className={`px-0 transition-all duration-300 md:hidden ${isScrolled ? "pb-2 text-[13px]" : "pb-3 text-sm"}`}>Visualização</TabsTrigger>
                                            </TabsList>
                                        </div>
                                    </div>
                                </div>

                                <div className={`flex-1 pt-4 pb-12 px-4 md:px-6 ${activeTab === 'Visualização' ? 'hidden lg:block' : 'block'}`}>
                                    <QuoteEditor
                                        searchQuery={productBucket.searchQuery}
                                        setSearchQuery={productBucket.setSearchQuery}
                                        isProductSearchOpen={isProductSearchOpen}
                                        setIsProductSearchOpen={setIsProductSearchOpen}
                                        filteredProducts={productBucket.filteredResults}
                                        isSearching={productBucket.isLoading}
                                        onSearchFocus={productBucket.loadBucket}
                                        handleProductClick={handleProductClick}
                                        addBlankItem={addBlankItem}
                                        quoteItems={quoteItems}
                                        updateItemPrice={updateItemPrice}
                                        updateItemQty={updateItemQty}
                                        updateItemField={updateItemField}
                                        toggleItemEdit={toggleItemEdit}
                                        removeItem={removeItem}
                                        discount={discount}
                                        setDiscount={setDiscount}
                                        discountType={discountType}
                                        setDiscountType={setDiscountType}
                                        shippingFee={shippingFee}
                                        setShippingFee={setShippingFee}
                                        otherCosts={otherCosts}
                                        setOtherCosts={setOtherCosts}
                                        subtotal={subtotal}
                                        discountValue={discountValue}
                                        total={total}
                                        selectedCustomer={selectedCustomer}
                                        setSelectedCustomer={setSelectedCustomer}
                                        setIsCustomerSheetOpen={setIsCustomerSheetOpen}
                                        quoteDate={quoteDate}
                                        setQuoteDate={setQuoteDate}
                                        expiryDate={expiryDate}
                                        setExpiryDate={setExpiryDate}
                                        status={status}
                                        setStatus={setStatus}
                                        internalNote={internalNote}
                                        setInternalNote={setInternalNote}
                                        primaryColor={primaryColor}
                                        setPrimaryColor={setPrimaryColor}
                                        secondaryColor={secondaryColor}
                                        setSecondaryColor={setSecondaryColor}
                                        quoteTitle={quoteTitle}
                                        setQuoteTitle={setQuoteTitle}
                                        quoteSubtitle={quoteSubtitle}
                                        setQuoteSubtitle={setQuoteSubtitle}
                                        isReadOnly={mode === 'view'}
                                        fieldErrors={fieldErrors}
                                        setFieldErrors={setFieldErrors}
                                    />
                                </div>
                            </div>

                            {/* RIGHT SIDE / BELOW - PREVIEW */}
                            <div className={`w-full lg:w-1/2 bg-brand-gray dark:bg-dark-border/20 overflow-y-auto no-scrollbar ${activeTab === 'Visualização' ? 'flex flex-col flex-1 min-h-[1000px] lg:min-h-0' : 'hidden lg:flex flex-col'}`}>
                                <QuotePreview
                                    invoiceNumber={quoteCode || (mode === 'create' ? 'ORC-0000' : 'N/A')}
                                    quoteDate={quoteDate}
                                    expiryDate={expiryDate}
                                    selectedCustomer={selectedCustomer}
                                    quoteItems={quoteItems}
                                    subtotal={subtotal}
                                    shippingNum={shippingNum}
                                    otherCosts={parseFloat(otherCosts) || 0}
                                    discountValue={discountValue}
                                    total={total}
                                    note={internalNote}
                                    primaryColor={primaryColor}
                                    secondaryColor={secondaryColor}
                                    quoteTitle={quoteTitle}
                                    quoteSubtitle={quoteSubtitle}
                                    partnerName={partnerName}
                                    partnerAddress={partnerAddress}
                                    partnerAvatar={partnerAvatar}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Mobile Bottom Action Bar */}
                    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-gray-200 dark:border-dark-border px-4 py-3 flex gap-3 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
                        <Button
                            variant="outline"
                            onClick={handleBackWithSafety}
                            disabled={isSaving}
                            className="flex-1 h-12"
                        >
                            {mode === 'view' ? "Voltar" : "Cancelar"}
                        </Button>
                        {mode !== 'view' && (
                            <Button
                                onClick={handleSave}
                                isLoading={isSaving}
                                className="flex-1 h-12"
                            >
                                {mode === 'edit' ? "Salvar" : "Salvar"}
                            </Button>
                        )}
                    </div>
                </Tabs>

                <SelectCustomerSheet
                    isOpen={isCustomerSheetOpen}
                    onClose={() => setIsCustomerSheetOpen(false)}
                    onSelect={(c: any) => setSelectedCustomer(c)}
                    partnerId={partnerId}
                />

                <SelectVariantSheet
                    isOpen={isVariantSheetOpen}
                    onClose={() => setIsVariantSheetOpen(false)}
                    product={productToSelectVariant}
                    onConfirm={handleConfirmVariants}
                />

                {/* Confirmation Modals */}
                <AlertModal
                    isOpen={showAlertModal}
                    onClose={() => setShowAlertModal(false)}
                    onConfirm={confirmNavigation}
                    title="Descartar Alterações"
                    description="Você tem alterações não salvas. Deseja realmente sair sem salvar?"
                    confirmText="Descartar"
                    cancelText="Cancelar"
                    variant="warning"
                />

                <AlertModal
                    isOpen={unsavedChangesDialogOpen}
                    onClose={handleUnsavedChangesDialogClose}
                    onConfirm={handleUnsavedChangesConfirm}
                    title="Descartar Alterações"
                    description="Você tem alterações não salvas. Deseja realmente sair sem salvar?"
                    confirmText="Descartar"
                    cancelText="Cancelar"
                    variant="warning"
                />
            </div>
        </FadeIn>
    );
};

export default CreateQuote;
