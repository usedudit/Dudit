"use client"

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Tabs, Button } from '@/components/reusable';
import { FadeIn } from '@/components/animations/FadeIn';
import QuoteHeader from './QuoteHeader';
import QuoteEditor from './QuoteEditor';
import QuotePreview from './QuotePreview';
import SelectCustomerSheet from './SelectCustomerSheet';
import SelectVariantSheet from './SelectVariantSheet';
import { useToast } from '@/hooks/use-toast';
import { useStore } from '@/lib/store-context';
import { searchProductsForQuotes, createQuoteAction } from '@/app/actions/erp/quotes';
import { useSidebar } from '@/lib/sidebar-context';

interface CreateQuoteProps {
    partnerId: string;
    onBack: () => void;
    existingQuote?: any;
    mode: 'create' | 'edit' | 'duplicate' | 'view';
}

const CreateQuote = ({ partnerId, onBack, existingQuote, mode }: CreateQuoteProps) => {
    const { toast } = useToast();
    const { selectedStore } = useStore();
    const { setHeaderOverride } = useSidebar();
    const [isSaving, setIsSaving] = useState(false);

    // Partner info for preview
    const partnerName = selectedStore?.name || 'Sua Loja';
    const partnerAddress = 'Endereço não informado'; // We'll stick with this for now as address isn't in selectedStore
    const partnerAvatar = selectedStore?.image_url || '';
    const [isScrolled, setIsScrolled] = useState(false);
    const [activeTab, setActiveTab] = useState('Dados Gerais');

    // Search States
    const [searchQuery, setSearchQuery] = useState('');
    const [isProductSearchOpen, setIsProductSearchOpen] = useState(false);
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);

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

    // Sheet States
    const [isCustomerSheetOpen, setIsCustomerSheetOpen] = useState(false);
    const [isVariantSheetOpen, setIsVariantSheetOpen] = useState(false);
    const [productToSelectVariant, setProductToSelectVariant] = useState<any | null>(null);

    // Quote State
    const [quoteItems, setQuoteItems] = useState<any[]>(existingQuote?.items || []);
    const [selectedCustomer, setSelectedCustomer] = useState<any>(existingQuote?.customer || null);
    const [internalNote, setInternalNote] = useState('');

    // Settings State
    const [quoteDate, setQuoteDate] = useState(existingQuote?.date || new Date().toISOString().split('T')[0]);
    const [expiryDate, setExpiryDate] = useState(existingQuote?.expiry || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    const [salesperson, setSalesperson] = useState('Jenny Wilson');

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

    // Derived Values
    const invoiceNumber = (mode === 'edit') ? existingQuote?.id : 'QTE-2024-NEW';

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        setIsScrolled(e.currentTarget.scrollTop > 20);
    };

    // 1. Handle Product Click
    const handleProductClick = (product: any) => {
        // Prepare variants or synthetic variant
        let variants = product.variants || [];

        if (variants.length === 0) {
            variants = [{
                id: 'default',
                name: product.name,
                sku: product.sku,
                price: product.price,
                stock: product.stock,
                qty: 0
            }];
        } else {
            variants = variants.map((v: any) => ({ ...v, qty: 0 }));
        }

        const productWithQty = {
            ...product,
            variants: variants
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
                    isEditing: false // Search items start in view mode
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
                isEditing: true // Starts in edit mode
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

    // Generic update for name/sku
    const updateItemField = (index: number, field: string, value: any) => {
        const newItems = [...quoteItems];
        newItems[index] = { ...newItems[index], [field]: value };
        setQuoteItems(newItems);
    };

    // Toggle Edit Mode
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

    const quoteCode = existingQuote?.quote_number || (existingQuote?.id ? `#${existingQuote.id.substring(0, 8)}` : '');
    const pageTitle = mode === 'create' ? 'Novo Orçamento' :
                      mode === 'edit' ? `Editar Orçamento ${quoteCode}` :
                      mode === 'duplicate' ? `Duplicar Orçamento ${quoteCode}` :
                      `Orçamento ${quoteCode}`;

    useEffect(() => {
        setHeaderOverride({
            title: pageTitle,
            onBack: onBack,
            isSubPage: true
        });
        return () => setHeaderOverride(null);
    }, [pageTitle, onBack, setHeaderOverride]);

    const handleSave = async () => {
        if (quoteItems.length === 0) {
            toast({
                title: "Carrinho vazio",
                description: "Adicione pelo menos um item ao orçamento.",
                variant: "destructive"
            });
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
                discountValue: discountNum,
                shippingCost: shippingNum,
                additionalCosts: otherCostsNum,
                items: quoteItems.map((item, idx) => ({
                    productId: item.isBlank ? null : item.id,
                    customName: item.isBlank ? item.name : undefined,
                    quantity: item.qty,
                    unitPrice: item.price,
                    sortOrder: idx
                }))
            });

            if (result.success) {
                toast({
                    title: "Orçamento criado!",
                    description: "O orçamento foi salvo com sucesso.",
                });
                onBack(); // Close wrapper
            } else {
                toast({
                    title: "Erro ao salvar",
                    description: (result as any).error || "Ocorreu um erro inesperado.",
                    variant: "destructive"
                });
            }
        } catch (error) {
            console.error(error);
            toast({
                title: "Erro fatal",
                description: "Não foi possível conectar ao servidor.",
                variant: "destructive"
            });
        } finally {
            setIsSaving(false);
        }
    };

    const filteredProducts = searchResults;

    return (
        <FadeIn className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300 overflow-hidden relative">
            <div className="flex flex-row h-full w-full overflow-hidden">
                {/* LEFT SIDE - EDITOR (Full width on mobile, 50% on large) */}
                <div className={`flex flex-col h-full w-full lg:w-1/2 transition-all duration-300 ease-in-out relative z-10 border-r border-brand-border dark:border-dark-border ${activeTab === 'Visualização' ? 'hidden lg:flex' : 'flex'}`}>
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">

                        {/* MODULAR HEADER */}
                        <QuoteHeader
                            isScrolled={isScrolled}
                            onBack={onBack}
                            onSave={mode !== 'view' ? handleSave : undefined}
                            isSaving={isSaving}
                            title={pageTitle}
                            subtitle={mode === 'view' ? "Detalhes da proposta comercial" : "Crie uma proposta comercial para seu cliente"}
                            saveLabel={mode === 'edit' ? "Salvar Alterações" : "Salvar Orçamento"}
                        />

                        {/* MOBILE TAB TOGGLE (Editor vs Preview) */}
                        <div className="lg:hidden px-4 md:px-8 py-2 border-b border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface">
                            <div className="flex items-center p-1 bg-brand-gray dark:bg-dark-border/20 rounded-full w-full">
                                <button
                                    onClick={() => setActiveTab('Dados Gerais')}
                                    className={`flex-1 py-1.5 text-xs font-bold rounded-full transition-all ${activeTab !== 'Visualização' ? 'bg-white dark:bg-dark-surface shadow-sm text-brand-primary' : 'text-brand-inactive-text'}`}
                                >
                                    Edição
                                </button>
                                <button
                                    onClick={() => setActiveTab('Visualização')}
                                    className={`flex-1 py-1.5 text-xs font-bold rounded-full transition-all ${activeTab === 'Visualização' ? 'bg-white dark:bg-dark-surface shadow-sm text-brand-primary' : 'text-brand-inactive-text'}`}
                                >
                                    Visualização
                                </button>
                            </div>
                        </div>

                        {/* SCROLLABLE FORM AREA */}
                        <div
                            className="flex-1 overflow-auto no-scrollbar bg-white dark:bg-dark-surface transition-colors duration-300 scroll-smooth pb-24 lg:pb-0"
                            onScroll={handleScroll}
                        >
                            <QuoteEditor
                                searchQuery={searchQuery}
                                setSearchQuery={setSearchQuery}
                                isProductSearchOpen={isProductSearchOpen}
                                setIsProductSearchOpen={setIsProductSearchOpen}
                                filteredProducts={filteredProducts}
                                isSearching={isSearching}
                                handleProductClick={handleProductClick}
                                addBlankItem={addBlankItem}
                                quoteItems={quoteItems}
                                updateItemPrice={updateItemPrice}
                                updateItemQty={updateItemQty}
                                updateItemField={updateItemField}
                                toggleItemEdit={toggleItemEdit}
                                removeItem={removeItem}
                                // Financial Props
                                discount={discount}
                                setDiscount={setDiscount}
                                discountType={discountType}
                                setDiscountType={setDiscountType}
                                shippingFee={shippingFee}
                                setShippingFee={setShippingFee}
                                otherCosts={otherCosts}
                                setOtherCosts={setOtherCosts}
                                // Calc Props
                                subtotal={subtotal}
                                tax={tax}
                                discountValue={discountValue}
                                total={total}
                                // Customer Props
                                selectedCustomer={selectedCustomer}
                                setSelectedCustomer={setSelectedCustomer}
                                setIsCustomerSheetOpen={setIsCustomerSheetOpen}
                                // Settings Props
                                quoteDate={quoteDate}
                                setQuoteDate={setQuoteDate}
                                expiryDate={expiryDate}
                                setExpiryDate={setExpiryDate}
                                salesperson={salesperson}
                                setSalesperson={setSalesperson}
                                internalNote={internalNote}
                                setInternalNote={setInternalNote}
                                // Layout Props
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

                {/* RIGHT SIDE - PREVIEW (Hidden on mobile if not in Preview tab) */}
                <div className={`h-full lg:w-1/2 bg-brand-gray dark:bg-dark-border/20 ${activeTab === 'Visualização' ? 'flex w-full' : 'hidden lg:flex'}`}>
                    <QuotePreview
                        invoiceNumber={invoiceNumber}
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
            <div className="lg:hidden fixed bottom-16 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-gray-200 dark:border-dark-border px-4 py-3 flex gap-3 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
                <Button
                    variant="outline"
                    onClick={onBack}
                    disabled={isSaving}
                    className="flex-1 h-12 text-sm font-bold"
                >
                    {mode === 'view' ? "Voltar" : "Cancelar"}
                </Button>
                {mode !== 'view' && (
                    <Button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex-1 h-12 text-sm font-bold bg-brand-primary text-white"
                    >
                        {isSaving ? "Salvando..." : mode === 'edit' ? "Salvar Alterações" : "Salvar Orçamento"}
                    </Button>
                )}
            </div>

            {/* Reusable Customer Selection Sheet */}
            <SelectCustomerSheet
                isOpen={isCustomerSheetOpen}
                onClose={() => setIsCustomerSheetOpen(false)}
                onSelect={(c: any) => {
                    setSelectedCustomer(c);
                    setIsCustomerSheetOpen(false);
                }}
            />

            {/* Variant Selection Modal */}
            <AnimatePresence>
                {productToSelectVariant && (
                    <SelectVariantSheet
                        isOpen={isVariantSheetOpen}
                        onClose={() => setIsVariantSheetOpen(false)}
                        product={productToSelectVariant}
                        onConfirm={handleConfirmVariants}
                    />
                )}
            </AnimatePresence>
        </FadeIn>
    );
};

export default CreateQuote;
