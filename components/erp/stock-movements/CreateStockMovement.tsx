"use client"

import { useState, useCallback, useRef, useMemo, useEffect, type FC } from 'react';
import {
    ChevronLeftIcon,
    SaveIcon,
    SearchIcon,
    ChevronDownIcon,
    ChevronUpIcon,
    Package,
    FileIcon,
    TrashIcon,
    ArrowRightIcon,
    CameraIcon
} from '@/lib/icons';
import {
    Button,
    Input,
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
    FormDropdown,
    AlertModal,
    IconPlaceholder,
    ThreeDotsLoader,
    FormTextarea,
    FormSection
} from '@/components/reusable';
import { searchProductByBarcodeAction } from '@/app/actions/erp/products';
import { playBeepSound, vibrateMobile } from '@/lib/utils/barcode';
import { Lock, Unlock } from 'lucide-react';
import { CameraScannerModal } from '@/components/reusable/CameraScannerModal';
import QuantitySelector from '@/components/reusable/QuantitySelector';
import { getR2ImageUrl } from '@/lib/utils/get-r2-image-url';
import { formatUnit } from '@/lib/utils/formatters';
import { createBatchStockMovementAction } from '@/app/actions/erp/stock-movements';
import { fetchPartnerProductsBucket } from '@/app/actions/erp/client-loaders';
import { useNotification } from '@/hooks/use-notification';
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes"
import { useSidebar } from "@/lib/sidebar-context"
import { FadeIn } from "@/components/animations/FadeIn"
import { motion, AnimatePresence } from "framer-motion"
import SavingStatusModal from "@/components/reusable/SavingStatusModal"
import SelectProductVariantSheet from "../pdv/SelectProductVariantSheet"
import { GenericAttachmentsTab } from '@/components/erp/shared/GenericAttachmentsTab'

import { useProductBucket, type ProductBucketItem } from '../hooks'

interface MovementItem {
    product: ProductBucketItem;
    variant?: {
        id: string;
        name: string;
        sku: string;
        price: number;
        stock: number;
        image?: string | null;
    };
    quantity: number;
}

interface CreateStockMovementProps {
    onBack: () => void;
    onSuccess?: () => void;
}

const REQUIRED_FIELDS = [
    { field: "items", tab: "Geral" },
    { field: "reason", tab: "Geral" },
    { field: "customReason", tab: "Geral" },
]

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
    const [reason, setReason] = useState('Selecione um motivo...');
    const [customReason, setCustomReason] = useState('');

    // Staged attachments
    const [stagedFiles, setStagedFiles] = useState<File[]>([])
    const [stagedImages, setStagedImages] = useState<(string | File)[]>([])

    // Multi-item state
    const [items, setItems] = useState<MovementItem[]>([]);
    const [isProductSearchOpen, setIsProductSearchOpen] = useState(false);
    const [selectedProductForVariants, setSelectedProductForVariants] = useState<ProductBucketItem | null>(null);
    const searchRef = useRef<HTMLDivElement>(null);

    // Focus lock and camera scanner states
    const [focusLock, setFocusLock] = useState(false);
    const [isCameraOpen, setIsCameraOpen] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (focusLock) {
            const interval = setInterval(() => {
                if (inputRef.current && document.activeElement !== inputRef.current) {
                    inputRef.current.focus();
                }
            }, 500);
            return () => clearInterval(interval);
        }
    }, [focusLock]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.preventDefault();
            const scannedValue = productBucket.searchQuery.trim();
            if (scannedValue) {
                handleScanBarcode(scannedValue);
            }
        }
    };

    const focusLockSuffix = (
        <button
            type="button"
            onClick={(e) => {
                e.stopPropagation();
                setFocusLock(!focusLock);
                setTimeout(() => {
                    inputRef.current?.focus();
                }, 50);
            }}
            className={`p-1.5 rounded-full transition-colors flex items-center justify-center ${focusLock
                ? "text-brand-primary bg-brand-primary/15"
                : "text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading hover:bg-brand-gray dark:hover:bg-dark-border"
                }`}
            title={focusLock ? "Foco Travado (para leitor de código de barras)" : "Ativar Foco Automático"}
        >
            {focusLock ? <Lock size={16} /> : <Unlock size={16} />}
        </button>
    );

    // Instant product search (client-side bucket)
    const productBucket = useProductBucket<ProductBucketItem>(fetchPartnerProductsBucket, { pageSize: 10 });
    const [isSaving, setIsSaving] = useState(false);
    const [fieldErrors, setFieldErrors] = useState<Set<string>>(new Set());
    const getTabErrorCount = useCallback((tab: string) => {
        return REQUIRED_FIELDS.filter(({ field, tab: fieldTab }) => fieldTab === tab && fieldErrors.has(field)).length
    }, [fieldErrors]);

    const isDirty = useMemo(() => {
        return items.length > 0 || notes !== '' || reason !== 'Selecione um motivo...' || customReason !== '';
    }, [items, notes, reason, customReason]);

    const showSearchDropdown = isProductSearchOpen && productBucket.searchQuery.length > 0;

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
                setIsProductSearchOpen(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const { showConfirmDialog: unsavedChangesDialogOpen, confirmNavigation: handleUnsavedChangesConfirm, cancelNavigation: handleUnsavedChangesDialogClose } = useUnsavedChanges(isDirty)

    const [showAlertModal, setShowAlertModal] = useState(false)
    const [nextAction, setNextAction] = useState<(() => void) | null>(null)

    const handleAttemptNav = useCallback((action: () => void) => {
        if (isDirty) { setNextAction(() => action); setShowAlertModal(true) }
        else action()
    }, [isDirty])

    const handleBack = useCallback(() => handleAttemptNav(onBack), [handleAttemptNav, onBack])

    const { setHeaderOverride } = useSidebar()

    useEffect(() => {
        setHeaderOverride({
            title: "Nova movimentação",
            onBack: handleBack,
            isSubPage: true
        })
        return () => setHeaderOverride(null)
    }, [handleBack, setHeaderOverride])

    const confirmNavigation = useCallback(() => {
        nextAction?.()
        setShowAlertModal(false)
    }, [nextAction])


    const addProduct = useCallback((product: ProductBucketItem, quantity = 1, variant?: any) => {
        setItems(prev => {
            const existsIndex = prev.findIndex(item =>
                item.product.id === product.id &&
                (!variant ? !item.variant : item.variant?.id === variant.id)
            );
            const availableStock = variant ? Number(variant.stock || 0) : Number(product.stock || 0);
            const displayName = product.name + (variant ? ` - ${variant.name}` : '');

            if (existsIndex > -1) {
                const next = [...prev];
                const item = next[existsIndex];
                const nextQty = item.quantity + quantity;
                if (type === 'out' && nextQty > availableStock) {
                    notifyError(`A quantidade de "${displayName}" excede o estoque disponível.`);
                    return prev;
                }
                next[existsIndex] = { ...item, quantity: nextQty };
                return next;
            }
            // Add new item
            if (type === 'out' && quantity > availableStock) {
                notifyError(`A quantidade de "${displayName}" excede o estoque disponível.`);
                return prev;
            }
            return [...prev, { product, variant, quantity }];
        });
        productBucket.setSearchQuery('');
        setIsProductSearchOpen(false);
        setFieldErrors(prev => {
            const next = new Set(prev);
            next.delete('items');
            return next;
        });
    }, [productBucket, notifyError, type]);

    const handleConfirmVariants = useCallback((selections: Array<{ variantId: string; qty: number }>) => {
        if (!selectedProductForVariants) return;
        selections.forEach(sel => {
            const variantObj = selectedProductForVariants.variants?.find(v => v.id === sel.variantId);
            if (variantObj) {
                addProduct(selectedProductForVariants, sel.qty, variantObj);
            }
        });
        setSelectedProductForVariants(null);
    }, [selectedProductForVariants, addProduct]);

    const handleScanBarcode = useCallback(async (code: string) => {
        const cleanCode = code.trim();
        if (!cleanCode) return;

        // Force load the bucket if not already loaded
        let currentBucket = productBucket.bucket;
        if (!productBucket.isLoaded || currentBucket.length === 0) {
            try {
                currentBucket = await fetchPartnerProductsBucket();
            } catch (e) {
                console.error("Erro ao carregar bucket de produtos:", e);
            }
        }

        // 1. Search locally in the bucket (GTIN or SKU)
        const localMatch = currentBucket.find(item =>
            (item.gtin && item.gtin.toLowerCase() === cleanCode.toLowerCase()) ||
            (item.sku && item.sku.toLowerCase() === cleanCode.toLowerCase())
        );

        if (localMatch) {
            if (localMatch.has_variants) {
                setSelectedProductForVariants(localMatch);
            } else {
                addProduct(localMatch);
            }
            playBeepSound();
            vibrateMobile();
            productBucket.setSearchQuery('');
            return;
        }

        // 2. Search locally in the bucket (Variant SKU)
        const localVariantMatch = currentBucket.find(item =>
            item.variants?.some(v => v.sku && v.sku.toLowerCase() === cleanCode.toLowerCase())
        );
        if (localVariantMatch) {
            const matchedVar = localVariantMatch.variants?.find(v => v.sku && v.sku.toLowerCase() === cleanCode.toLowerCase());
            addProduct(localVariantMatch, 1, matchedVar);
            playBeepSound();
            vibrateMobile();
            productBucket.setSearchQuery('');
            return;
        }

        // 3. Fallback: Search server-side
        try {
            const res = await searchProductByBarcodeAction(null, cleanCode);
            if (res && res.success) {
                if (res.data) {
                    const fetchedProduct = res.data;
                    const bucketItem: ProductBucketItem = {
                        id: fetchedProduct.id,
                        name: fetchedProduct.name,
                        sku: fetchedProduct.sku || "",
                        gtin: fetchedProduct.gtin || null,
                        price: fetchedProduct.price || 0,
                        stock: fetchedProduct.stock_available ?? fetchedProduct.stock_quantity ?? 0,
                        image: fetchedProduct.images?.[0] || null,
                        has_variants: !!(fetchedProduct.product_variants && fetchedProduct.product_variants.length > 0),
                        variants: fetchedProduct.product_variants?.map((v: any) => ({
                            id: v.id,
                            name: v.variant_name,
                            sku: v.sku,
                            price: fetchedProduct.price + (v.price_adjustment || 0),
                            stock: v.stock_available ?? v.stock_quantity ?? 0,
                            image: typeof v.variant_options === 'object' && v.variant_options ? v.variant_options.image || null : null
                        }))
                    };
                    if (bucketItem.has_variants) {
                        setSelectedProductForVariants(bucketItem);
                    } else {
                        addProduct(bucketItem);
                    }
                    playBeepSound();
                    vibrateMobile();
                    productBucket.setSearchQuery('');
                } else {
                    notifyError("Produto não encontrado.");
                }
            } else {
                notifyError(res?.error || "Produto não encontrado.");
            }
        } catch (err: any) {
            notifyError("Erro ao buscar produto no servidor.");
        }
    }, [productBucket, addProduct, notifyError]);

    const updateItemQty = useCallback((index: number, qty: number) => {
        setItems(prev => prev.map((item, i) => {
            if (i !== index) return item;
            const nextQty = Math.max(1, qty);
            const stockLimit = item.variant ? Number(item.variant.stock || 0) : Number(item.product.stock || 0);
            const displayName = item.product.name + (item.variant ? ` - ${item.variant.name}` : '');
            if (type === 'out' && nextQty > stockLimit) {
                notifyError(`A quantidade de "${displayName}" está maior que o estoque disponível.`);
                return { ...item, quantity: stockLimit };
            }
            return { ...item, quantity: nextQty };
        }));
    }, [notifyError, type]);

    const handleReasonChange = useCallback((value: string) => {
        setReason(value);
        if (value !== 'Outro') setCustomReason('');
        setFieldErrors(prev => {
            const next = new Set(prev);
            next.delete('reason');
            next.delete('customReason');
            return next;
        });
    }, []);

    const removeItem = useCallback((index: number) => {
        setItems(prev => prev.filter((_, i) => i !== index));
    }, []);

    const handleSave = async () => {
        const errors = new Set<string>();

        if (items.length === 0) {
            errors.add('items');
            notifyError("Adicione pelo menos um produto.");
        }
        if (reason === 'Selecione um motivo...') {
            errors.add('reason');
            notifyError("Selecione um motivo para a movimentação.");
        }
        if (reason === 'Outro' && !customReason.trim()) {
            errors.add('customReason');
            notifyError("Informe o motivo da movimentação.");
        }

        // Validate individual quantities
        for (const item of items) {
            if (item.quantity <= 0) {
                errors.add('items');
                notifyError("Todas as quantidades devem ser maiores que zero.");
                break;
            }
            const stockLimit = item.variant ? Number(item.variant.stock || 0) : Number(item.product.stock || 0);
            const displayName = item.product.name + (item.variant ? ` - ${item.variant.name}` : '');
            if (type === 'out' && item.quantity > stockLimit) {
                errors.add('items');
                notifyError(`A quantidade de "${displayName}" está maior que o estoque disponível.`);
                break;
            }
        }

        if (errors.size > 0) {
            setFieldErrors(errors);
            return;
        }
        setFieldErrors(new Set());

        setIsSaving(true);
        try {
            const res = await createBatchStockMovementAction({
                type,
                reason: reason === 'Outro' ? customReason : reason,
                notes,
                items: items.map(item => ({
                    productId: item.product.id,
                    variantId: item.variant?.id || null,
                    quantity: item.quantity,
                })),
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

    const pageTitle = "Nova movimentação";

    return (
        <FadeIn>
            <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden relative transition-colors duration-300">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full w-full">
                    <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-24 md:pb-8 scroll-smooth no-scrollbar">

                        {/* Sticky Header */}
                        <div className="sticky top-0 z-30 w-full bg-white dark:bg-dark-surface border-b border-brand-border dark:border-dark-border transition-all duration-300">
                            <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">

                                {/* Back button - desktop only */}
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
                                    <div className="hidden md:flex items-center gap-3 shrink-0 ml-3 mb-4">
                                        <Button variant="outline" onClick={handleBack} disabled={isSaving}>
                                            Cancelar
                                        </Button>
                                        <Button onClick={handleSave} disabled={isSaving} leftIcon={<SaveIcon size={18} />}>
                                            {isSaving ? "Salvando..." : "Salvar"}
                                        </Button>
                                    </div>
                                </div>

                                {/* Tabs */}
                                <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                                    <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                        <TabsTrigger value="Geral" className="px-0 pb-3">
                                            Dados gerais
                                            {getTabErrorCount("Geral") > 0 && <span className="ml-2 w-2 h-2 bg-brand-red rounded-full inline-block" />}
                                        </TabsTrigger>
                                        <TabsTrigger value="Observações" className="px-0 pb-3">
                                            Observações
                                            {getTabErrorCount("Observações") > 0 && <span className="ml-2 w-2 h-2 bg-brand-red rounded-full inline-block" />}
                                        </TabsTrigger>
                                        <TabsTrigger value="Anexos" className="px-0 pb-3">
                                            Anexos
                                            {getTabErrorCount("Anexos") > 0 && <span className="ml-2 w-2 h-2 bg-brand-red rounded-full inline-block" />}
                                        </TabsTrigger>
                                    </TabsList>
                                </div>
                            </div>
                        </div>

                        {/* Content Body */}
                        <div className="px-3 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
                            <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">

                                {/* Form Column */}
                                <div className={activeTab === 'Geral' ? "col-span-12 lg:col-span-8 pr-0 lg:pr-12" : "col-span-12"}>
                                    <AnimatePresence mode="wait">
                                        <TabsContent value="Geral" className="mt-0">
                                            <motion.div key="Geral" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-10">

                                                {/* Tipo de Movimentação */}
                                                <FormSection title="Tipo de Movimentação">
                                                    <div className="flex flex-col md:flex-row gap-4">
                                                        <motion.button
                                                            onClick={() => { setType('in'); handleReasonChange('Selecione um motivo...'); }}
                                                            className={`flex-1 flex items-center justify-between p-5 rounded-2xl transition-all border ${type === 'in'
                                                                ? 'bg-green-50/50 dark:bg-green-900/10 border-brand-green'
                                                                : 'bg-white dark:bg-dark-surface hover:bg-gray-50 dark:hover:bg-dark-border border-brand-border dark:border-dark-border'
                                                                }`}
                                                        >
                                                            <div className="flex items-center gap-4">
                                                                <div className={`w-12 h-12 rounded-full border border-brand-border dark:border-dark-border flex items-center justify-center shrink-0 ${type === 'in' ? 'bg-brand-green text-white' : 'bg-brand-gray dark:bg-dark-border/50 text-brand-inactive-text'
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
                                                            onClick={() => { setType('out'); handleReasonChange('Selecione um motivo...'); }}
                                                            className={`flex-1 flex items-center justify-between p-5 rounded-2xl transition-all border ${type === 'out'
                                                                ? 'bg-red-50/50 dark:bg-red-900/10 border-brand-red'
                                                                : 'bg-white dark:bg-dark-surface hover:bg-gray-50 dark:hover:bg-dark-border border-brand-border dark:border-dark-border'
                                                                }`}
                                                        >
                                                            <div className="flex items-center gap-4">
                                                                <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${type === 'out' ? 'bg-brand-red text-white' : 'bg-brand-gray dark:bg-dark-border/50 text-brand-inactive-text'
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
                                                </FormSection>

                                                {/* Itens da Movimentação */}
                                                <FormSection title="Itens da Movimentação" hasSeparator>
                                                    <div className="space-y-6">

                                                        {/* Product Search */}
                                                        <div ref={searchRef} className="relative">
                                                            <div className="relative flex items-center w-full gap-2">
                                                                <div className="relative flex-1">
                                                                    <Input
                                                                        ref={inputRef}
                                                                        type="text"
                                                                        placeholder="Buscar por nome ou SKU para adicionar..."
                                                                        value={productBucket.searchQuery}
                                                                        onChange={(e) => {
                                                                            productBucket.setSearchQuery(e.target.value);
                                                                            setIsProductSearchOpen(true);
                                                                            setFieldErrors(prev => {
                                                                                const next = new Set(prev);
                                                                                next.delete('items');
                                                                                return next;
                                                                            });
                                                                        }}
                                                                        onFocus={() => {
                                                                            setIsProductSearchOpen(true);
                                                                            productBucket.loadBucket();
                                                                        }}
                                                                        onKeyDown={handleKeyDown}
                                                                        prefix={
                                                                            <SearchIcon
                                                                                size={18}
                                                                                className="text-brand-inactive-text shrink-0"
                                                                            />
                                                                        }
                                                                        suffix={focusLockSuffix}
                                                                        error={fieldErrors.has('items') && items.length === 0}
                                                                        errorMessage={fieldErrors.has('items') && items.length === 0 ? "Adicione pelo menos um produto" : undefined}
                                                                    />
                                                                </div>
                                                                <Button
                                                                    variant="outline"
                                                                    type="button"
                                                                    onClick={() => setIsCameraOpen(true)}
                                                                    className="h-10 px-3 shrink-0"
                                                                    leftIcon={<CameraIcon size={18} />}
                                                                    title="Escanear Câmera"
                                                                />
                                                            </div>

                                                            {showSearchDropdown && (
                                                                <motion.div
                                                                    initial={{ opacity: 0, y: 5 }}
                                                                    animate={{ opacity: 1, y: 0 }}
                                                                    className="absolute z-[9999] top-full left-0 right-0 mt-2 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl max-h-72 overflow-y-auto shadow-xl custom-scrollbar"
                                                                    onScroll={(e) => {
                                                                        const target = e.currentTarget
                                                                        if (target.scrollHeight - target.scrollTop - target.clientHeight < 20) {
                                                                            productBucket.loadMore()
                                                                        }
                                                                    }}
                                                                >
                                                                    {productBucket.isLoading ? (
                                                                        <div className="p-8 text-center text-sm text-brand-inactive-text flex flex-col items-center gap-2">
                                                                            <ThreeDotsLoader />
                                                                        </div>
                                                                    ) : productBucket.filteredResults.length > 0 ? (
                                                                        productBucket.filteredResults.map(product => {
                                                                            const alreadyAdded = !product.has_variants && items.some(item => item.product.id === product.id);
                                                                            return (
                                                                                <div
                                                                                    key={product.id}
                                                                                    className={`flex items-center gap-4 p-3.5 border-b border-brand-border dark:border-dark-border last:border-0 transition-colors ${alreadyAdded ? 'opacity-40 cursor-default' : 'hover:bg-gray-50 dark:hover:bg-dark-border cursor-pointer'}`}
                                                                                    onClick={() => {
                                                                                        if (alreadyAdded) return;
                                                                                        if (product.has_variants) {
                                                                                            setSelectedProductForVariants(product);
                                                                                        } else {
                                                                                            addProduct(product);
                                                                                        }
                                                                                    }}
                                                                                >
                                                                                    <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border/50 overflow-hidden shrink-0 border border-brand-border dark:border-dark-border">
                                                                                        <img src={getR2ImageUrl(product.image, "thumbnail") || "https://img.dudit.com.br/static/Placeholder.png"} alt={product.name} className="w-full h-full object-cover rounded-full bg-brand-gray dark:bg-dark-border border border-brand-border dark:border-dark-border" />
                                                                                    </div>
                                                                                    <div className="flex-1 min-w-0">
                                                                                        <div className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">{product.name}</div>
                                                                                        <div className="text-[11px] font-medium text-brand-inactive-text mt-0.5 tracking-wider uppercase">{product.sku}</div>
                                                                                    </div>
                                                                                    <div className="text-xs font-bold text-white bg-brand-dark dark:bg-brand-green px-2 py-1 rounded-md whitespace-nowrap">
                                                                                        {product.stock} em estoque
                                                                                    </div>
                                                                                </div>
                                                                            )
                                                                        })
                                                                    ) : (
                                                                        <div className="p-8 text-center text-sm text-brand-inactive-text">
                                                                            Nenhum produto encontrado.
                                                                        </div>
                                                                    )}
                                                                </motion.div>
                                                            )}
                                                        </div>

                                                        {/* Items List - Desktop Table */}
                                                        {items.length > 0 && (
                                                            <div className="hidden md:block w-full overflow-x-auto pb-4 custom-scrollbar">
                                                                <table className="w-full text-left border-separate border-spacing-0">
                                                                    <thead>
                                                                        <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                                            <th className="py-3 pl-6 pr-4 text-[13px] font-medium text-gray-500 dark:text-dark-body rounded-l-lg">Produto</th>
                                                                            <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body text-center w-36">Qtd.</th>
                                                                            <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body text-center w-24 rounded-r-lg">Ações</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {items.map((item, index) => {
                                                                            const itemImage = item.variant?.image || item.product.image;
                                                                            const itemName = item.product.name + (item.variant ? ` - ${item.variant.name}` : '');
                                                                            const itemSku = item.variant?.sku || item.product.sku;
                                                                            const itemStock = item.variant ? item.variant.stock : item.product.stock;

                                                                            return (
                                                                                <tr key={`${item.product.id}-${item.variant?.id || 'base'}`} className="group hover:bg-brand-gray/20 dark:hover:bg-dark-border/10 transition-colors">
                                                                                    <td className="py-4 pl-6 pr-4 border-b border-brand-border dark:border-dark-border">
                                                                                        <div className="flex items-center gap-3">
                                                                                            <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                                                                                                <img src={getR2ImageUrl(itemImage, "thumbnail") || "https://img.dudit.com.br/static/Placeholder.png"} className={`w-full h-full ${!itemImage ? 'object-contain' : 'object-cover'}`} alt="" />
                                                                                            </div>
                                                                                            <div className="flex flex-col text-left flex-1 min-w-0">
                                                                                                <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading mb-0.5 truncate max-w-[250px]">
                                                                                                    {itemName}
                                                                                                </span>
                                                                                                <div className="flex items-center gap-2">
                                                                                                    <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate">{itemSku}</span>
                                                                                                    <span className="w-1 h-1 rounded-full bg-brand-inactive-text opacity-40"></span>
                                                                                                    <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">Estoque: <strong className="text-brand-dark dark:text-dark-heading font-bold">{itemStock}</strong></span>
                                                                                                </div>
                                                                                            </div>
                                                                                        </div>
                                                                                    </td>
                                                                                    <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border">
                                                                                        <div className="flex justify-center">
                                                                                            <QuantitySelector value={item.quantity} onChange={(val) => updateItemQty(index, val)} max={type === 'out' ? Math.max(0, Number(itemStock || 0)) : undefined} size="md" />
                                                                                        </div>
                                                                                    </td>
                                                                                    <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border">
                                                                                        <div className="flex justify-center">
                                                                                            <button
                                                                                                onClick={() => removeItem(index)}
                                                                                                className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-red-50 dark:hover:bg-red-900/10 text-brand-red transition-colors"
                                                                                                title="Remover item"
                                                                                            >
                                                                                                <TrashIcon size={18} />
                                                                                            </button>
                                                                                        </div>
                                                                                    </td>
                                                                                </tr>
                                                                            );
                                                                        })}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        )}

                                                        {/* Items List - Mobile */}
                                                        {items.length > 0 && (
                                                            <div className="block md:hidden space-y-2">
                                                                {items.map((item, index) => {
                                                                    const itemImage = item.variant?.image || item.product.image;
                                                                    const itemName = item.product.name + (item.variant ? ` - ${item.variant.name}` : '');
                                                                    const itemSku = item.variant?.sku || item.product.sku;
                                                                    const itemStock = item.variant ? item.variant.stock : item.product.stock;

                                                                    return (
                                                                        <div key={`${item.product.id}-${item.variant?.id || 'base'}`} className="flex items-center gap-4 py-4 border-b border-brand-border dark:border-dark-border last:border-0">
                                                                            <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 overflow-hidden flex items-center justify-center">
                                                                                <img src={getR2ImageUrl(itemImage, "thumbnail") || "https://img.dudit.com.br/static/Placeholder.png"} className={`w-full h-full ${!itemImage ? 'object-contain p-1.5' : 'object-cover'}`} alt="" />
                                                                            </div>
                                                                            <div className="flex-1 min-w-0">
                                                                                <div className="flex justify-between items-start mb-0.5">
                                                                                    <h4 className="font-bold text-[13px] text-brand-dark dark:text-dark-heading truncate pr-2">
                                                                                        {itemName}
                                                                                    </h4>
                                                                                    <button
                                                                                        onClick={() => removeItem(index)}
                                                                                        className="w-8 h-8 flex items-center justify-center text-brand-red hover:bg-red-50 dark:hover:bg-red-900/10 rounded-full transition-colors shrink-0"
                                                                                    >
                                                                                        <TrashIcon size={14} />
                                                                                    </button>
                                                                                </div>
                                                                                <p className="text-[11px] font-medium text-brand-inactive-text pr-2 truncate mb-2">
                                                                                    {itemSku} • Estoque: {itemStock}
                                                                                </p>
                                                                                <QuantitySelector value={item.quantity} onChange={(val) => updateItemQty(index, val)} max={type === 'out' ? Math.max(0, Number(itemStock || 0)) : undefined} size="md" />
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}

                                                        {/* Empty State */}
                                                        {items.length === 0 && (
                                                            <div className="w-full flex-col flex items-center justify-center">
                                                                <IconPlaceholder
                                                                    icon={Package}
                                                                    title="Nenhum produto adicionado"
                                                                    subtitle="Busque e adicione produtos no campo acima."
                                                                />
                                                            </div>
                                                        )}

                                                        <div className="h-px bg-brand-border dark:bg-dark-border w-full" />

                                                        {/* Reason Dropdown */}
                                                        <div className="flex flex-col md:flex-row gap-4 items-start">
                                                            <div className="flex-1 w-full">
                                                                <FormDropdown
                                                                    label="Motivo"
                                                                    value={reason}
                                                                    setValue={handleReasonChange}
                                                                    error={fieldErrors.has('reason')}
                                                                    errorMessage={fieldErrors.has('reason') ? 'Selecione um motivo para a movimentação.' : undefined}
                                                                    options={type === 'in' ? [
                                                                        { value: 'Compra de Fornecedor', label: 'Compra de Fornecedor' },
                                                                        { value: 'Devolução de Cliente', label: 'Devolução de Cliente' },
                                                                        { value: 'Ajuste de Estoque', label: 'Ajuste de Estoque' },
                                                                        { value: 'Outro', label: 'Outro' }
                                                                    ] : [
                                                                        { value: 'Avaria / Perda', label: 'Avaria / Perda' },
                                                                        { value: 'Ajuste de Estoque', label: 'Ajuste de Estoque' },
                                                                        { value: 'Uso Interno', label: 'Uso Interno' },
                                                                        { value: 'Outro', label: 'Outro' }
                                                                    ]}
                                                                />
                                                            </div>

                                                            {reason === 'Outro' && (
                                                                <motion.div
                                                                    initial={{ opacity: 0, x: -10 }}
                                                                    animate={{ opacity: 1, x: 0 }}
                                                                    className="flex-[2] w-full"
                                                                >
                                                                    <Input
                                                                        label="Descreva o motivo"
                                                                        placeholder="Digite o motivo aqui..."
                                                                        value={customReason}
                                                                        onChange={(e) => {
                                                                            setCustomReason(e.target.value);
                                                                            if (e.target.value.trim()) {
                                                                                setFieldErrors(prev => {
                                                                                    const next = new Set(prev);
                                                                                    next.delete('customReason');
                                                                                    return next;
                                                                                });
                                                                            }
                                                                        }}
                                                                        maxLength={120}
                                                                        error={fieldErrors.has('customReason')}
                                                                        errorMessage={fieldErrors.has('customReason') ? 'Informe o motivo da movimentação.' : undefined}
                                                                    />
                                                                </motion.div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </FormSection>
                                            </motion.div>
                                        </TabsContent>

                                        <TabsContent value="Observações" className="mt-0">
                                            <motion.div key="Observações" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                                <FormTextarea
                                                    label="Observações Internas"
                                                    placeholder="Adicione informações como número da nota fiscal, motivo detalhado, ou observações para controle interno..."
                                                    value={notes}
                                                    onChange={(e) => setNotes(e.target.value)}
                                                    name="notes"
                                                    maxLength={500}
                                                    showCharacterCount
                                                />
                                            </motion.div>
                                        </TabsContent>

                                        <TabsContent value="Anexos" className="mt-0">
                                            <motion.div key="Anexos" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                                <GenericAttachmentsTab
                                                    partnerId=""
                                                    entityType="stock_movement"
                                                    isEditing={true}
                                                    stagedFiles={stagedFiles}
                                                    onStagedFilesChange={setStagedFiles}
                                                    stagedImages={stagedImages}
                                                    onStagedImagesChange={setStagedImages}
                                                />
                                            </motion.div>
                                        </TabsContent>
                                    </AnimatePresence>
                                </div>

                                {/* Sidebar Column - Projeção de Estoque */}
                                {activeTab === 'Geral' && (
                                    <div className="col-span-12 lg:col-span-4 lg:border-l border-brand-border dark:border-dark-border lg:pl-12 space-y-8 mt-12 lg:mt-0">
                                        <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden transition-all duration-300">
                                            <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border rounded-t-2xl" />
                                            <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6 mt-2">Projeção de Estoque</h3>

                                            <AnimatePresence mode="wait">
                                                {items.length > 0 ? (
                                                    <motion.div
                                                        key="projection-data"
                                                        initial={{ opacity: 0 }}
                                                        animate={{ opacity: 1 }}
                                                        exit={{ opacity: 0 }}
                                                        className="space-y-0"
                                                    >
                                                        {items.map((item, index) => {
                                                            const itemStock = item.variant ? item.variant.stock : item.product.stock;
                                                            const itemImage = item.variant?.image || item.product.image;
                                                            const itemName = item.product.name + (item.variant ? ` - ${item.variant.name}` : '');
                                                            const itemSku = item.variant?.sku || item.product.sku;
                                                            const newStock = type === 'in'
                                                                ? itemStock + item.quantity
                                                                : Math.max(0, itemStock - item.quantity);

                                                            return (
                                                                <div key={`${item.product.id}-${item.variant?.id || 'base'}`} className={`py-4 flex items-center justify-between gap-4 ${index > 0 ? 'border-t border-brand-border/40 dark:border-dark-border/40' : ''}`}>
                                                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                                                        <div className="w-8 h-8 rounded-full bg-brand-gray dark:bg-dark-border/50 overflow-hidden shrink-0 border border-brand-border dark:border-dark-border">
                                                                            <img src={getR2ImageUrl(itemImage, "thumbnail") || "https://img.dudit.com.br/static/Placeholder.png"} className="w-full h-full object-cover rounded-full" alt="" />
                                                                        </div>
                                                                        <div className="flex-1 min-w-0">
                                                                            <div className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">{itemName}</div>
                                                                            <div className="text-[10px] font-medium text-brand-inactive-text uppercase tracking-wider">{itemSku}</div>
                                                                        </div>
                                                                    </div>

                                                                    <div className="h-8 w-px bg-brand-border dark:bg-dark-border shrink-0" />

                                                                    <div className="flex items-center gap-2 shrink-0">
                                                                        <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">{itemStock} <span className="text-[10px] font-medium opacity-60">{formatUnit((item.variant as any)?.unit || (item.product as any)?.unit)}</span></span>
                                                                        <ArrowRightIcon size={14} className="text-brand-inactive-text" />
                                                                        <span className={`text-[15px] font-bold ${type === 'in' ? 'text-brand-green' : 'text-brand-red'}`}>
                                                                            {newStock} <span className="text-xs font-bold">{formatUnit((item.variant as any)?.unit || (item.product as any)?.unit)}</span>
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            )
                                                        })}
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
                    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 flex gap-3 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
                        <Button
                            variant="outline"
                            onClick={handleBack}
                            disabled={isSaving}
                            className="flex-1 h-12"
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={isSaving}
                            className={`flex-1 h-12 ${type === 'in' ? 'bg-brand-green hover:bg-brand-green/90' : 'bg-brand-red hover:bg-brand-red/90'}`}
                            leftIcon={<SaveIcon size={18} />}
                        >
                            {isSaving ? "Salvando..." : "Salvar"}
                        </Button>
                    </div>
                </Tabs>

                {/* Modals */}
                {
                    unsavedChangesDialogOpen && (
                        <AlertModal
                            isOpen={unsavedChangesDialogOpen}
                            onClose={handleUnsavedChangesDialogClose}
                            onConfirm={handleUnsavedChangesConfirm}
                            title="Sair sem salvar?"
                            description="Você tem alterações na movimentação que ainda não foram salvas."
                            confirmText="Sair sem salvar"
                            cancelText="Continuar editando"
                            variant="warning"
                        />
                    )
                }
                {
                    showAlertModal && (
                        <AlertModal
                            isOpen
                            onClose={() => setShowAlertModal(false)}
                            onConfirm={confirmNavigation}
                            title="Sair sem salvar?"
                            description="Você tem alterações na movimentação que ainda não foram salvas."
                            confirmText="Sair sem salvar"
                            cancelText="Continuar editando"
                            variant="warning"
                        />
                    )
                }

                <SavingStatusModal isOpen={isSaving} text="Salvando movimentação de estoque..." />

                <CameraScannerModal
                    isOpen={isCameraOpen}
                    onClose={() => setIsCameraOpen(false)}
                    onScan={handleScanBarcode}
                />

                <SelectProductVariantSheet
                    isOpen={!!selectedProductForVariants}
                    product={selectedProductForVariants}
                    onClose={() => setSelectedProductForVariants(null)}
                    onConfirm={handleConfirmVariants}
                />
            </div >
        </FadeIn >
    );
};

export default CreateStockMovement;
