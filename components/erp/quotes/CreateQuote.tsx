"use client"

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Tabs, Button, AlertModal } from '@/components/reusable';
import { FadeIn } from '@/components/animations/FadeIn';
import QuoteHeader from './QuoteHeader';
import QuoteEditor from './QuoteEditor';
import QuotePreview from './QuotePreview';
import SelectCustomerSheet from './SelectCustomerSheet';
import SelectVariantSheet from './SelectVariantSheet';
import { useNotification } from '@/hooks/use-notification';
import { useStore } from '@/lib/store-context';
import { searchProductsForQuotes, createQuoteAction, getQuoteDetailsAction, getPartnerAddressAction } from '@/app/actions/erp/quotes';
import { useSidebar } from '@/lib/sidebar-context';
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";

interface CreateQuoteProps {
    partnerId: string;
    onBack: () => void;
    existingQuote?: any;
    mode: 'create' | 'edit' | 'duplicate' | 'view';
}

const CreateQuote = ({ partnerId, onBack, existingQuote, mode }: CreateQuoteProps) => {
    const { success: notifySuccess, error: notifyError } = useNotification();
    const { selectedStore } = useStore();
    const { setHeaderOverride } = useSidebar();
    const [isSaving, setIsSaving] = useState(false);
    const [isLoadingDetails, setIsLoadingDetails] = useState(false);

    // Partner info for preview
    const partnerName = selectedStore?.name || 'Sua Loja';
    const [partnerAddress, setPartnerAddress] = useState('Endereço não informado');
    const partnerAvatar = selectedStore?.image_url || '';
    const [isScrolled, setIsScrolled] = useState(false);
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
    const [searchQuery, setSearchQuery] = useState('');
    const [isProductSearchOpen, setIsProductSearchOpen] = useState(false);
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);

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

    // Persistence State (for isDirty)
    const [originalQuoteData, setOriginalQuoteData] = useState<any>(null);

    // 1. Fetch Full Quote Details if existingQuote is provided
    useEffect(() => {
        const fetchDetails = async () => {
            if (!existingQuote?.id || (mode === 'create')) return;

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
                        image: item.products?.images?.[0] || 'https://img.dudit.com.br/static/mascots/Box.png',
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

    // Debounced real search
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (searchQuery.trim().length >= 2) {
                setIsSearching(true);
                const results = await searchProductsForQuotes(searchQuery);
                setSearchResults(results);
                setIsSearching(false);
            } else {
                setSearchResults([]);
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        setIsScrolled(e.currentTarget.scrollTop > 20);
    };

    // 1. Handle Product Click
    const handleProductClick = (product: any) => {
        // If product has no variants, add it directly
        const variants = product.variants || [];
        
        if (variants.length === 0) {
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
                newItems[existingItemIndex] = {
                    ...newItems[existingItemIndex],
                    qty: newItems[existingItemIndex].qty + qty
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
                    qty: qty,
                    isEditing: false
                }];
            }
        });

        setSearchQuery('');
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
                        newItems[existingIndex] = { ...newItems[existingIndex], qty: newItems[existingIndex].qty + v.qty };
                    } else {
                        const finalName = variantName === productToSelectVariant.name ? productToSelectVariant.name : `${productToSelectVariant.name} - ${v.name}`;
                        newItems.push({
                            ...productToSelectVariant,
                            rowId: `item-${Date.now()}-${Math.random()}-${v.id}`,
                            name: finalName,
                            sku: v.sku,
                            price: v.price,
                            variant: variantNameForCheck,
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
    };

    const updateItemQty = (index: number, newQty: number) => {
        if (newQty < 1) return;
        const newItems = [...quoteItems];
        newItems[index].qty = newQty;
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
    const tax = subtotal * 0.10; // Mock 10% tax
    const total = Math.max(0, subtotal + tax + shippingNum + otherCostsNum - discountValue);

    const quoteCode = existingQuote?.quote_number || "";
    const pageTitle = mode === 'create' ? 'Novo Orçamento' :
                      mode === 'edit' ? `Editar Orçamento ${quoteCode}`.trim() :
                      mode === 'duplicate' ? `Duplicar Orçamento ${quoteCode}`.trim() :
                      `Orçamento ${quoteCode}`.trim();

    useEffect(() => {
        setHeaderOverride({
            title: pageTitle,
            onBack: handleBackWithSafety,
            isSubPage: true
        });
        return () => setHeaderOverride(null);
    }, [pageTitle, handleBackWithSafety, setHeaderOverride]);

    const handleSave = async () => {
        if (quoteItems.length === 0) {
            notifyError("Carrinho vazio", "Adicione pelo menos um item ao orçamento.");
            return;
        }

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

    return (
        <FadeIn className="flex flex-col h-[calc(100vh-64px)] md:h-[calc(100vh-72px)] bg-white dark:bg-dark-background transition-colors duration-300 overflow-hidden relative">
            <div className="flex flex-row h-full w-full overflow-hidden">
                {/* EDITOR / TABS WRAPPER */}
                <div className="flex flex-col h-full w-full lg:w-1/2 relative z-10 border-r border-brand-border dark:border-dark-border">
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
                        <QuoteHeader
                            isScrolled={isScrolled}
                            onBack={handleBackWithSafety}
                            onSave={mode !== 'view' ? handleSave : undefined}
                            isSaving={isSaving}
                            title={pageTitle}
                            subtitle={mode === 'view' ? "Detalhes da proposta comercial" : "Crie uma proposta comercial para seu cliente"}
                            saveLabel={mode === 'edit' ? "Salvar Alterações" : "Salvar Orçamento"}
                            activeTab={activeTab}
                        />

                        {/* SCROLLABLE FORM AREA - Hidden when preview is active on mobile */}
                        <div
                            className={`flex-1 overflow-auto no-scrollbar bg-white dark:bg-dark-surface transition-colors duration-300 scroll-smooth pb-24 lg:pb-0 ${activeTab === 'Visualização' ? 'hidden lg:block' : 'block'}`}
                            onScroll={handleScroll}
                        >
                            <QuoteEditor
                                searchQuery={searchQuery}
                                setSearchQuery={setSearchQuery}
                                isProductSearchOpen={isProductSearchOpen}
                                setIsProductSearchOpen={setIsProductSearchOpen}
                                filteredProducts={searchResults}
                                isSearching={isSearching}
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
                                tax={tax}
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
                            />
                        </div>
                    </Tabs>
                </div>

                {/* RIGHT SIDE - PREVIEW */}
                <div className={`h-full lg:w-1/2 bg-brand-gray dark:bg-dark-border/20 ${activeTab === 'Visualização' ? 'flex w-full' : 'hidden lg:flex'}`}>
                    <QuotePreview
                        invoiceNumber={mode === 'create' ? 'QTE-2024-NEW' : (existingQuote?.quote_number || existingQuote?.id)}
                        quoteDate={quoteDate}
                        expiryDate={expiryDate}
                        selectedCustomer={selectedCustomer}
                        quoteItems={quoteItems}
                        subtotal={subtotal}
                        tax={tax}
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

            {/* Mobile Bottom Action Bar */}
            <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-gray-200 dark:border-dark-border px-4 py-3 flex gap-3 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
                <Button
                    variant="outline"
                    onClick={handleBackWithSafety}
                    disabled={isSaving}
                    className="flex-1 h-12 text-sm font-bold rounded-xl"
                >
                    {mode === 'view' ? "Voltar" : "Cancelar"}
                </Button>
                {mode !== 'view' && (
                    <Button
                        onClick={handleSave}
                        isLoading={isSaving}
                        className="flex-1 h-12 text-sm font-bold bg-brand-primary text-white rounded-xl shadow-lg shadow-brand-primary/20"
                    >
                        {mode === 'edit' ? "Salvar Alterações" : "Salvar Orçamento"}
                    </Button>
                )}
            </div>

            <SelectCustomerSheet
                isOpen={isCustomerSheetOpen}
                onClose={() => setIsCustomerSheetOpen(false)}
                onSelect={(c: any) => setSelectedCustomer(c)}
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
                confirmText="Sim, Descartar"
                cancelText="Continuar Editando"
            />

            <AlertModal
                isOpen={unsavedChangesDialogOpen}
                onClose={handleUnsavedChangesDialogClose}
                onConfirm={handleUnsavedChangesConfirm}
                title="Descartar Alterações"
                description="Você tem alterações não salvas. Deseja realmente sair sem salvar?"
                confirmText="Sim, Descartar"
                cancelText="Continuar Editando"
            />
        </FadeIn>
    );
};

export default CreateQuote;
