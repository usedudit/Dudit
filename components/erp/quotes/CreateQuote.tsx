"use client"

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Tabs } from '@/components/reusable';
import QuoteHeader from './QuoteHeader';
import QuoteEditor from './QuoteEditor';
import QuotePreview from './QuotePreview';
import SelectCustomerSheet from './SelectCustomerSheet';
import SelectVariantSheet from './SelectVariantSheet';
import { searchProductsForQuotes } from '@/app/actions/erp/quotes';

interface CreateQuoteProps {
    onBack: () => void;
    existingQuote?: any;
}

const CreateQuote = ({ onBack, existingQuote }: CreateQuoteProps) => {
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
    const invoiceNumber = existingQuote?.id || 'QTE-2024-NEW';

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

    const filteredProducts = searchResults;

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.98, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 10 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 z-50 flex h-full w-full bg-white dark:bg-dark-surface transition-colors duration-300 overflow-hidden shadow-2xl"
        >
            {/* LEFT SIDE - EDITOR (50% Width on Large Screens) */}
            <div
                className="flex flex-col h-full w-full lg:w-1/2 transition-all duration-300 ease-in-out relative z-10 border-r border-brand-border dark:border-dark-border"
            >
                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">

                    {/* MODULAR HEADER */}
                    <QuoteHeader
                        isScrolled={isScrolled}
                        onBack={onBack}
                        title={existingQuote ? `Editar Orçamento #${existingQuote.id}` : 'Novo Orçamento'}
                        subtitle="Crie uma proposta comercial para seu cliente"
                    />

                    {/* SCROLLABLE FORM AREA */}
                    <div
                        className="flex-1 overflow-auto no-scrollbar bg-white dark:bg-dark-surface transition-colors duration-300 scroll-smooth"
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
                        />
                    </div>
                </Tabs>
            </div>

            {/* RIGHT SIDE - PREVIEW */}
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
            />

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
        </motion.div>
    );
};

export default CreateQuote;
