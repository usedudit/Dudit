"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent, Badge, Button, AlertModal, ThreeDotsLoader } from '@/components/reusable';
import { FadeIn } from '@/components/animations/FadeIn';
import { ChevronLeftIcon, EditIcon, SaveIcon } from '@/lib/icons';
import QuoteEditor from './QuoteEditor';
import { listActivePromotionsForMarketplaceAction } from "@/app/actions/shared/promotions"
import QuotePreview from './QuotePreview';
import QuoteAttachmentsTab from './QuoteAttachmentsTab';
import { uploadAndSavePendingAttachments } from '@/lib/utils/attachment-uploader';
import SelectCustomerSheet from '../clientes/SelectCustomerSheet';
import SelectProductVariantSheet from '@/components/erp/pdv/SelectProductVariantSheet';
import { useNotification } from '@/hooks/use-notification';
import { useScrollToFirstError } from '@/hooks/use-scroll-to-first-error';
import { useStore } from '@/lib/store-context';
import { usePermissions } from "@/lib/permission-context";
import { useSupabase } from "@/providers/supabase-provider";
import { usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal";
import { getNextPlanTarget, isPlanLimitReachedError } from "@/lib/subscription/limit-upgrade";
import {
    createQuoteAction,
    getQuoteDetailsAction,
    getPartnerAddressAction,
    getNextQuoteNumberAction,
    updateQuoteAction,
    updateQuoteStatusAction,
    addQuoteItemAction,
    updateQuoteItemAction,
    deleteQuoteItemAction,
    duplicateQuoteAction,
    getSalespeopleAction,
} from '@/app/actions/erp/quotes';
import { getQuoteEditCaps } from "@/lib/quotes/quote-edit-rules";
import { QUOTE_PREVIEW_PRIMARY_COLOR, QUOTE_PREVIEW_SECONDARY_COLOR } from "@/lib/quotes/quote-preview-theme";
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url";
import { fetchPartnerSalesCatalogBucket } from "@/app/actions/erp/client-loaders";
import { useProductBucket } from "../hooks";
import { useSidebar } from '@/lib/sidebar-context';
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { useRouter } from "next/navigation";
import { useDebouncedRefresh } from "@/hooks/use-debounced-refresh";
import SavingStatusModal from "@/components/reusable/SavingStatusModal";

interface CreateQuoteProps {
    partnerId: string;
    onBack: () => void;
    existingQuote?: any;
    mode: 'create' | 'edit' | 'duplicate' | 'view';
    onSaveOverride?: (payload: any, originalQuote: any) => Promise<{ success: boolean; error?: string } | void>;
}

const REQUIRED_FIELDS = [
    { field: "productSearch", tab: "Dados Gerais" },
    { field: "manualItemNames", tab: "Dados Gerais" },
    { field: "manualItemPrices", tab: "Dados Gerais" },
]

const CreateQuote = ({ partnerId, onBack, existingQuote, mode, onSaveOverride }: CreateQuoteProps) => {
    const { success: notifySuccess, error: notifyError } = useNotification();
    const router = useRouter();
    const debouncedRefresh = useDebouncedRefresh();
    const { selectedStore } = useStore();
    const { setHeaderOverride } = useSidebar();
    const { planSlug, hasSpecific } = usePermissions()
    const canDiscount = hasSpecific("quotes", "can_apply_discount")
    const { openPlanUpgrade } = usePlanUpgrade()
    const { user: authUser } = useSupabase();
    const [isSaving, setIsSaving] = useState(false);
    const [isLoadingDetails, setIsLoadingDetails] = useState(false);
    const [realQuoteNumber, setRealQuoteNumber] = useState(existingQuote?.quote_number || '');

    // Partner info for preview
    const partnerName = selectedStore?.name || 'Sua Loja';
    const [partnerAddress, setPartnerAddress] = useState('Endereço não informado');
    const [partnerPhone, setPartnerPhone] = useState('');
    const [partnerImage, setPartnerImage] = useState(selectedStore?.image_url || '');
    const [isScrolled, setIsScrolled] = useState(false);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5);
    }, []);
    const [activeTab, setActiveTab] = useState('Dados Gerais');

    useEffect(() => {
        const logo = selectedStore?.logo_url || selectedStore?.image_url;
        if (logo) {
            setPartnerImage(logo);
        }
    }, [selectedStore?.logo_url, selectedStore?.image_url]);

    useEffect(() => {
        if (!partnerImage && partnerId) {
            const fetchPartnerImage = async () => {
                const supabase = (await import("@/lib/supabase/browser-client")).supabaseBrowser;
                const storeId = selectedStore?.id || existingQuote?.store_id;
                const storeQuery = storeId
                    ? supabase.from("stores").select("logo_url").eq("id", storeId).maybeSingle()
                    : supabase.from("stores").select("logo_url").eq("partner_id", partnerId).limit(1).maybeSingle();
                const { data } = await storeQuery;
                const foundLogo = data?.logo_url;
                if (foundLogo) setPartnerImage(foundLogo);
            };
            fetchPartnerImage();
        }
    }, [partnerImage, partnerId, selectedStore?.id, existingQuote?.store_id]);

    const partnerAvatar = partnerImage ? getR2ImageUrl(partnerImage) : '';

    // Fetch Partner Address and Phone
    useEffect(() => {
        const fetchAddress = async () => {
            if (!partnerId) return;
            const storeId = selectedStore?.id || existingQuote?.store_id;
            const res = await getPartnerAddressAction(partnerId, storeId);
            if (res.success && res.data?.formatted) {
                setPartnerAddress(res.data.formatted);
            }
            // Also fetch phone from store
            const supabase = (await import("@/lib/supabase/browser-client")).supabaseBrowser;
            const storeQuery = storeId
                ? supabase.from("stores").select("phone").eq("id", storeId).maybeSingle()
                : supabase.from("stores").select("phone").eq("partner_id", partnerId).limit(1).maybeSingle();
            const { data: store } = await storeQuery;
            if (store?.phone) setPartnerPhone(store.phone);
        };
        fetchAddress();
    }, [partnerId, selectedStore?.id, existingQuote?.store_id]);

    // Salesperson State
    const [salespersonId, setSalespersonId] = useState<string>('');
    const [salespeople, setSalespeople] = useState<{ id: string; name: string }[]>([]);
    const [isSalespeopleLoaded, setIsSalespeopleLoaded] = useState(false);

    // Fetch salespeople list on mount
    useEffect(() => {
        const fetchSalespeople = async () => {
            const res = await getSalespeopleAction(partnerId);
            if (res.success && res.sellers) {
                setSalespeople(res.sellers);
            }
            setIsSalespeopleLoaded(true);
        };
        fetchSalespeople();
    }, [partnerId]);

    // Default salesperson to current user on creation
    useEffect(() => {
        if ((mode === 'create' || mode === 'duplicate') && authUser?.id && !salespersonId) {
            setSalespersonId(authUser.id);
        }
    }, [mode, authUser?.id, salespersonId]);

    // Search States
    const [isProductSearchOpen, setIsProductSearchOpen] = useState(false);
    const productBucket = useProductBucket(fetchPartnerSalesCatalogBucket, { pageSize: 10 });

    // Sheet States
    const [isCustomerSheetOpen, setIsCustomerSheetOpen] = useState(false);
    const [isVariantSheetOpen, setIsVariantSheetOpen] = useState(false);
    const [productToSelectVariant, setProductToSelectVariant] = useState<any | null>(null);
    const [pendingZeroStockItem, setPendingZeroStockItem] = useState<{ product: any; isVariant?: boolean; force?: boolean; callback?: () => void } | null>(null)
    const [showZeroStockAlert, setShowZeroStockAlert] = useState(false)

    // Quote State
    const [quoteItems, setQuoteItems] = useState<any[]>([]);
    const [quoteAttachments, setQuoteAttachments] = useState<any[]>(existingQuote?.attachments || []);
    const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
    /** Observações exibidas ao cliente na proposta (campo `notes` no banco). */
    const [internalNote, setInternalNote] = useState('');
    /** Observações internas da equipe (`internal_notes`). */
    const [staffInternalNotes, setStaffInternalNotes] = useState('');

    // Settings State
    const [quoteDate, setQuoteDate] = useState(new Date().toISOString().split('T')[0]);
    const [expiryDate, setExpiryDate] = useState(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    const [status, setStatus] = useState('draft');

    const isMarketplaceOrigin = Boolean(
        existingQuote?.metadata?.origin === "marketplace" ||
        existingQuote?.origin === "marketplace" ||
        (existingQuote?.customers && (existingQuote.customers as any).marketplace_user_id)
    );

    const editCaps = useMemo(() => {
        if (mode === "create" || mode === "duplicate") return getQuoteEditCaps("draft", false, false);
        return getQuoteEditCaps(status, Boolean(existingQuote?.converted), isMarketplaceOrigin);
    }, [mode, status, existingQuote?.converted, isMarketplaceOrigin]);

    // Layout Settings State
    const [primaryColor, setPrimaryColor] = useState(QUOTE_PREVIEW_PRIMARY_COLOR);
    const [secondaryColor, setSecondaryColor] = useState(QUOTE_PREVIEW_SECONDARY_COLOR);
    const [quoteTitle, setQuoteTitle] = useState('ORÇAMENTO');
    const [quoteSubtitle, setQuoteSubtitle] = useState('');
    const [showDecoration, setShowDecoration] = useState(true);

    // Financials State
    const [discount, setDiscount] = useState('');
    const [discountType, setDiscountType] = useState<'R$' | '%'>('R$');
    const [shippingFee, setShippingFee] = useState('');
    const [otherCosts, setOtherCosts] = useState('');
    const [fieldErrors, setFieldErrors] = useState<Set<string>>(new Set());
    const [manualItemNameErrors, setManualItemNameErrors] = useState<Set<number>>(new Set());
    const [manualItemPriceErrors, setManualItemPriceErrors] = useState<Set<number>>(new Set());
    const [showValidationModal, setShowValidationModal] = useState(false);
    const [validationMessage, setValidationMessage] = useState('');

    const getItemMaxQuantity = useCallback((item: any) => {
        if (!item || item.isBlank || item.isService || item.allowSellWithoutStock) return undefined;
        return Math.max(0, Number(item.stock ?? 0));
    }, []);

    const validateQuoteStock = useCallback((_targetItems: any[]) => {
        return null;
    }, []);

    // Persistence State (for isDirty)
    const [originalQuoteData, setOriginalQuoteData] = useState<any>(null);

    const [quotePromotions, setQuotePromotions] = useState<any[]>([])

    useEffect(() => {
        if (!partnerId) return
        listActivePromotionsForMarketplaceAction(partnerId).then(res => {
            if (Array.isArray(res)) setQuotePromotions(res)
        }).catch(() => { })
    }, [partnerId])

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
            if (mode === 'create' || mode === 'duplicate') {
                const res = await getNextQuoteNumberAction(partnerId, selectedStore?.id);
                if (res.success) setRealQuoteNumber(res.data);
                if (mode === 'create') return;
            }
            if (!existingQuote?.id) return;

            setIsLoadingDetails(true);
            try {
                const res = await getQuoteDetailsAction(existingQuote.id, partnerId);
                if (res.success && res.data) {
                    const q = res.data;

                    // Map items
                    const items = q.items.map((item: any) => ({
                        quoteItemId: item.id,
                        id: item.product_id || `legacy-${item.id}`,
                        rowId: `item-${item.id}`,
                        name: item.custom_name || item.products?.name || 'Item sem nome',
                        sku: item.products?.sku || 'N/A',
                        price: Number(item.unit_price),
                        qty: Number(item.quantity),
                        stock: Number(item.products?.stock_available ?? item.products?.stock_quantity ?? 0),
                        image: item.image || item.products?.images?.[0] || 'https://img.dudit.com.br/static/Placeholder.png',
                        isEditing: false,
                        isBlank: !item.product_id,
                        isManual: !item.product_id,
                    }));

                    setQuoteItems(items.map((it: any) => ({ ...it })));
                    if (q.attachments && Array.isArray(q.attachments)) {
                        setQuoteAttachments(q.attachments);
                    }
                    setSelectedCustomer(q.customers);
                    setInternalNote(q.notes || '');
                    setStaffInternalNotes((q as { internal_notes?: string | null }).internal_notes || '');
                    setQuoteDate(q.issue_date);
                    setExpiryDate(q.expiration_date);
                    setStatus(mode === "duplicate" ? "draft" : q.status);
                    setDiscount(q.discount_value?.toString() || '');
                    setDiscountType(q.discount_type === 'percentage' ? '%' : 'R$');
                    setShippingFee(q.shipping_cost?.toString() || '');
                    setOtherCosts(q.additional_costs?.toString() || '');
                    if (q.user_id || q.created_by_user_id) {
                        setSalespersonId(q.user_id || q.created_by_user_id);
                    }
                    // Load preview customization from metadata
                    const meta = q.metadata || {};
                    if (meta.preview) {
                        if (meta.preview.primaryColor) setPrimaryColor(meta.preview.primaryColor);
                        if (meta.preview.secondaryColor) setSecondaryColor(meta.preview.secondaryColor);
                        if (meta.preview.quoteTitle) setQuoteTitle(meta.preview.quoteTitle);
                        if (meta.preview.quoteSubtitle) setQuoteSubtitle(meta.preview.quoteSubtitle);
                        if (meta.preview.showDecoration !== undefined) setShowDecoration(meta.preview.showDecoration);
                    }

                    // Snapshot for dirty check
                    const snapshot = {
                        items: items.map((it: any) => ({ ...it })),
                        customer: q.customers,
                        note: q.notes || '',
                        internalStaff: (q as { internal_notes?: string | null }).internal_notes || '',
                        date: q.issue_date,
                        expiry: q.expiration_date,
                        status: mode === "duplicate" ? "draft" : q.status,
                        discount: q.discount_value?.toString() || '',
                        discountType: q.discount_type === 'percentage' ? '%' : 'R$',
                        shipping: q.shipping_cost?.toString() || '',
                        others: q.additional_costs?.toString() || '',
                        salesperson: q.created_by_user_id || '',
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
        internalStaff: staffInternalNotes,
        date: quoteDate,
        expiry: expiryDate,
        status,
        discount,
        discountType,
        shipping: shippingFee,
        others: otherCosts,
        salesperson: salespersonId,
    }), [quoteItems, selectedCustomer, internalNote, staffInternalNotes, quoteDate, expiryDate, status, discount, discountType, shippingFee, otherCosts, salespersonId]);

    const isDirty = useMemo(() => {
        if (!originalQuoteData) {
            if (mode === 'create' || mode === 'duplicate') {
                return quoteItems.length > 0 ||
                    !!selectedCustomer ||
                    !!internalNote.trim() ||
                    !!staffInternalNotes.trim() ||
                    Number(discount) > 0 ||
                    Number(shippingFee) > 0 ||
                    Number(otherCosts) > 0 ||
                    (!!salespersonId && !!authUser?.id && salespersonId !== authUser.id);
            }
            return false;
        }

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
            currentData.internalStaff !== originalQuoteData.internalStaff ||
            currentData.customer?.id !== originalQuoteData.customer?.id ||
            currentData.salesperson !== originalQuoteData.salesperson ||
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

    const handleBack = useCallback(() => handleAttemptNav(onBack), [handleAttemptNav, onBack]);

    const confirmNavigation = useCallback(() => {
        nextAction?.();
        setShowAlertModal(false);
    }, [nextAction]);




    // 1. Handle Product Click
    const proceedAddProduct = (product: any, forceBypass?: boolean) => {
        addItem(product, undefined, undefined, 1, (() => { const p = product.promotional_price ? Number(product.promotional_price) : 0; return p > 0 && p < Number(product.price || 0) ? p : Number(product.price || 0) })());
        if (forceBypass) {
            setQuoteItems(prev => {
                const copy = [...prev]
                if (copy.length > 0) {
                    copy[copy.length - 1].allowSellWithoutStock = true
                }
                return copy
            })
        }
        setIsProductSearchOpen(false);
    }

    const handleProductClick = (product: any) => {
        const variants = product.variants || [];

        if (variants.length === 0) {
            if (!product.isService && !product.allow_sell_without_stock && Number(product.stock || 0) < 1) {
                setPendingZeroStockItem({ product, callback: () => proceedAddProduct(product, true) })
                setShowZeroStockAlert(true)
                return;
            }
            proceedAddProduct(product, false);
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
    const getQuoteEffectivePrice = (prod: any) => {
        const p = prod.promotional_price ? Number(prod.promotional_price) : 0
        return p > 0 && p < Number(prod.price || 0) ? p : Number(prod.price || 0)
    }

    const addItem = (product: any, variantName?: string, variantSku?: string, qty: number = 1, price?: number) => {
        setQuoteItems(prevItems => {
            const finalName = (variantName && variantName !== product.name) ? `${product.name} - ${variantName}` : product.name;
            const finalSku = variantSku || product.sku;
            const finalPrice = price ?? getQuoteEffectivePrice(product);

            const existingItemIndex = prevItems.findIndex(i => i.id === product.id && i.variant === variantName);

            if (existingItemIndex >= 0) {
                const newItems = [...prevItems];
                const nextQty = newItems[existingItemIndex].qty + qty;
                const maxQty = getItemMaxQuantity(newItems[existingItemIndex]);
                if (maxQty !== undefined && nextQty > maxQty && !newItems[existingItemIndex].allowSellWithoutStock) {
                    setPendingZeroStockItem({
                        product: { name: finalName },
                        callback: () => {
                            setQuoteItems(prev => {
                                const updated = [...prev];
                                const idx = updated.findIndex(i => i.id === product.id && i.variant === variantName);
                                if (idx >= 0) {
                                    updated[idx] = { ...updated[idx], qty: updated[idx].qty + qty, allowSellWithoutStock: true };
                                }
                                return updated;
                            });
                        }
                    });
                    setShowZeroStockAlert(true);
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
                    isEditing: false,
                    isManual: false
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
                isEditing: true,
                isManual: true
            }
        ]);
        setFieldErrors(prev => {
            const next = new Set(prev);
            next.delete("productSearch");
            return next;
        });
    };

    // 3. Add Variants from Sheet
    const handleConfirmVariants = (selections: Array<{ variantId: string; qty: number }>) => {
        if (!productToSelectVariant) return;

        selections.forEach((sel: any) => {
            const v = productToSelectVariant.variants?.find((x: any) => String(x.id) === String(sel.variantId));
            if (!v) return;
            if (sel.qty > 0) {
                const variantName = v.name;
                const variantNameForCheck = variantName;

                const add = (forceBypass?: boolean) => {
                    setQuoteItems(prevItems => {
                        const newItems = [...prevItems];
                        const existingIndex = newItems.findIndex(i => i.id === productToSelectVariant.id && i.variant === variantNameForCheck);
                        if (existingIndex >= 0) {
                            newItems[existingIndex] = {
                                ...newItems[existingIndex],
                                qty: newItems[existingIndex].qty + sel.qty,
                                allowSellWithoutStock: forceBypass ? true : Boolean(newItems[existingIndex].allowSellWithoutStock)
                            };
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
                                qty: sel.qty,
                                image: v.variant_options?.image || v.image || productToSelectVariant.images?.[0] || 'https://img.dudit.com.br/static/Placeholder.png',
                                isEditing: false,
                                isManual: false,
                                allowSellWithoutStock: forceBypass || false
                            });
                        }
                        return newItems;
                    });
                };

                if (!productToSelectVariant.allow_sell_without_stock && sel.qty > Number(v.stock ?? 0)) {
                    setPendingZeroStockItem({
                        product: { ...productToSelectVariant, name: `${productToSelectVariant.name} - ${v.name}` },
                        isVariant: true,
                        callback: () => add(true)
                    });
                    setShowZeroStockAlert(true);
                } else {
                    add(false);
                }
            }
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
        const normalizedQty = Math.max(1, Number(newQty) || 1);
        const item = quoteItems[index];
        if (!item) return;

        const maxQty = getItemMaxQuantity(item);
        if (maxQty !== undefined && normalizedQty > maxQty && !item.allowSellWithoutStock) {
            setPendingZeroStockItem({
                product: { name: item.name },
                callback: () => {
                    setQuoteItems(prev => {
                        const updated = [...prev];
                        updated[index] = { ...updated[index], qty: normalizedQty, allowSellWithoutStock: true };
                        return updated;
                    });
                }
            });
            setShowZeroStockAlert(true);
            return;
        }

        setQuoteItems(prev => {
            const next = [...prev];
            next[index] = { ...next[index], qty: normalizedQty };
            return next;
        });
    };

    const removeItem = (index: number) => {
        const newItems = [...quoteItems];
        newItems.splice(index, 1);
        setQuoteItems(newItems);
        setManualItemNameErrors(new Set());
        setManualItemPriceErrors(new Set());
        setFieldErrors(prev => {
            if (!prev.has("manualItemNames")) return prev;
            const hasInvalidManualItems = newItems.some((item) => item.isManual && !String(item.name || "").trim());
            if (hasInvalidManualItems) return prev;
            const next = new Set(prev);
            next.delete("manualItemNames");
            return next;
        });
    };

    const updateItemPrice = (index: number, newPrice: number) => {
        const parsedPrice = Number(newPrice) || 0;
        setQuoteItems(prev => {
            const next = [...prev];
            next[index] = { ...next[index], price: parsedPrice };
            return next;
        });
        setManualItemPriceErrors(prev => {
            if (!prev.has(index)) return prev;
            const next = new Set(prev);
            if (parsedPrice > 0) next.delete(index);
            return next;
        });
        setFieldErrors(prev => {
            if (!prev.has("manualItemPrices")) return prev;
            const nextItems = quoteItems.map((it, idx) => idx === index ? { ...it, price: parsedPrice } : it);
            const hasInvalidManualPrice = nextItems.some((item) => item.isManual && Number(item.price || 0) <= 0);
            if (hasInvalidManualPrice) return prev;
            const next = new Set(prev);
            next.delete("manualItemPrices");
            return next;
        });
    };

    const updateItemField = (index: number, field: string, value: any) => {
        setQuoteItems(prev => {
            const next = [...prev];
            next[index] = { ...next[index], [field]: value };
            return next;
        });
        if (field === "name") {
            setManualItemNameErrors(prev => {
                if (!prev.has(index)) return prev;
                const next = new Set(prev);
                if (String(value || "").trim()) next.delete(index);
                return next;
            });
            setFieldErrors(prev => {
                if (!prev.has("manualItemNames")) return prev;
                const nextItems = quoteItems.map((it, idx) => idx === index ? { ...it, [field]: value } : it);
                const hasInvalidManualItems = nextItems.some((item) => item.isManual && !String(item.name || "").trim());
                if (hasInvalidManualItems) return prev;
                const next = new Set(prev);
                next.delete("manualItemNames");
                return next;
            });
        }
    };

    const toggleItemEdit = (index: number, isEditing: boolean) => {
        setQuoteItems(prev => {
            const next = [...prev];
            if (isEditing && !next[index]?.isManual) return prev;
            next[index] = { ...next[index], isEditing };
            return next;
        });
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
    const pageTitle = mode === 'create' ? 'Novo orçamento' :
        mode === 'edit' ? `Editar orçamento ${quoteCode}`.trim() :
            mode === 'duplicate' ? `Duplicar orçamento ${quoteCode}`.trim() :
                `Orçamento ${quoteCode}`.trim();

    useEffect(() => {
        setHeaderOverride({
            title: pageTitle,
            onBack: handleBack,
            isSubPage: true
        });
        return () => setHeaderOverride(null);
    }, [pageTitle, handleBack, setHeaderOverride]);

    const handleSave = async () => {
        if (quoteItems.length === 0) {
            setFieldErrors(new Set(["productSearch"]));
            scrollToFirstError();
            notifyError("Orçamento vazio", "Adicione pelo menos um item ao orçamento.");
            return;
        }
        const invalidManualIndexes = new Set<number>();
        const invalidManualPriceIndexes = new Set<number>();

        quoteItems.forEach((item, index) => {
            if (item.isManual && !String(item.name || "").trim()) {
                invalidManualIndexes.add(index);
            }
            if (item.isManual && Number(item.price || 0) <= 0) {
                invalidManualPriceIndexes.add(index);
            }
        });
        if (invalidManualIndexes.size > 0) {
            setManualItemNameErrors(invalidManualIndexes);
            setFieldErrors(new Set(["manualItemNames"]));
            setActiveTab("Dados Gerais");
            setValidationMessage("Preencha o nome dos itens adicionados manualmente antes de salvar o orçamento.");
            setShowValidationModal(true);
            return;
        }
        if (invalidManualPriceIndexes.size > 0) {
            setManualItemPriceErrors(invalidManualPriceIndexes);
            setFieldErrors(new Set(["manualItemPrices"]));
            setActiveTab("Dados Gerais");
            setValidationMessage("Preencha o preço dos itens adicionados manualmente antes de salvar o orçamento.");
            setShowValidationModal(true);
            return;
        }

        if (quoteItems.some((item) => Number(item.qty || 0) <= 0)) {
            setActiveTab("Dados Gerais");
            setValidationMessage("Todos os itens precisam ter quantidade mínima de 1.");
            setShowValidationModal(true);
            return;
        }
        if (total <= 0) {
            setActiveTab("Dados Gerais");
            setValidationMessage("O orçamento não pode ser salvo com valor total zerado.");
            setShowValidationModal(true);
            return;
        }
        setManualItemNameErrors(new Set());
        setManualItemPriceErrors(new Set());
        setFieldErrors(new Set());

        setIsSaving(true);
        try {
            if (mode === "edit" && existingQuote?.id) {
                if (onSaveOverride) {
                    const payload = {
                        customerId: selectedCustomer?.id ?? null,
                        issueDate: quoteDate,
                        expirationDate: expiryDate,
                        notes: internalNote,
                        internalNotes: staffInternalNotes,
                        discountType: discountType === "%" ? "percentage" : "fixed",
                        discountValue: Number(discount) || 0,
                        shippingCost: Number(shippingFee) || 0,
                        additionalCosts: Number(otherCosts) || 0,
                        status,
                        items: quoteItems.map((item, idx) => ({
                            productId: (item.isBlank || item.isService) ? null : item.id,
                            customName: item.name ? item.name.trim() : undefined,
                            description: undefined,
                            quantity: item.qty,
                            unitPrice: item.price,
                            sortOrder: idx,
                        })),
                        preview: {
                            primaryColor,
                            secondaryColor,
                            quoteTitle,
                            quoteSubtitle,
                            showDecoration,
                        },
                    };
                    const res = await onSaveOverride(payload, existingQuote);
                    if (res?.success) {
                        notifySuccess("Alterações salvas!", "O orçamento foi salvo com sucesso.");
                        debouncedRefresh();
                        onBack();
                        return;
                    } else if (res?.error) {
                        notifyError("Erro ao salvar", res.error);
                        return;
                    }
                    return;
                }

                if (!originalQuoteData) {
                    notifyError("Aguarde", "Os dados do orçamento ainda estão carregando.");
                    return;
                }

                // 1. Process Item Additions, Updates and Deletions FIRST
                const origItems: any[] = originalQuoteData.items || [];
                const origById = new Map<string, any>(
                    origItems.filter((x: any) => x.quoteItemId).map((x: any) => [x.quoteItemId, x]),
                );

                for (let idx = 0; idx < quoteItems.length; idx++) {
                    const cur = quoteItems[idx];
                    const isManualOrBlank = cur.isBlank || cur.isManual || String(cur.id || "").startsWith("legacy-");
                    if (!cur.quoteItemId) {
                        const addRes = await addQuoteItemAction({
                            quoteId: existingQuote.id,
                            partnerId,
                            productId: isManualOrBlank ? null : cur.id,
                            customName: cur.name ? cur.name.trim() : undefined,
                            description: undefined,
                            quantity: cur.qty,
                            unitPrice: cur.price,
                            sortOrder: idx,
                        });
                        if (!addRes.success) {
                            notifyError("Item", (addRes as { error?: string }).error || "Erro ao adicionar item.");
                            return;
                        }
                        continue;
                    }
                    const o = origById.get(cur.quoteItemId);
                    if (!o) continue;
                    const changed =
                        Number(o.qty) !== Number(cur.qty) ||
                        Number(o.price) !== Number(cur.price) ||
                        String(o.name || "") !== String(cur.name || "");
                    if (changed) {
                        const upd = await updateQuoteItemAction({
                            itemId: cur.quoteItemId,
                            partnerId,
                            customName: cur.name ? cur.name.trim() : undefined,
                            quantity: cur.qty,
                            unitPrice: cur.price,
                            sortOrder: idx,
                        });
                        if (!upd.success) {
                            notifyError("Item", (upd as { error?: string }).error || "Erro ao atualizar item.");
                            return;
                        }
                    }
                }

                for (const o of origItems) {
                    if (!o.quoteItemId) continue;
                    if (!quoteItems.some((c: any) => c.quoteItemId === o.quoteItemId)) {
                        const del = await deleteQuoteItemAction(o.quoteItemId, partnerId);
                        if (!del.success) {
                            notifyError("Item", (del as { error?: string }).error || "Erro ao remover item.");
                            return;
                        }
                    }
                }

                // 2. Update Quote Financials, Notes, and Settings (runs notification with fully updated items & totals)
                const upRes = await updateQuoteAction({
                    quoteId: existingQuote.id,
                    partnerId,
                    customerId: selectedCustomer?.id ?? null,
                    issueDate: quoteDate,
                    expirationDate: expiryDate,
                    notes: internalNote,
                    internalNotes: staffInternalNotes,
                    discountType: discountType === "%" ? "percentage" : "fixed",
                    discountValue: Number(discount) || 0,
                    shippingCost: Number(shippingFee) || 0,
                    additionalCosts: Number(otherCosts) || 0,
                    preview: {
                        primaryColor,
                        secondaryColor,
                        quoteTitle,
                        quoteSubtitle,
                        showDecoration,
                    },
                });
                if (!upRes.success) {
                    notifyError("Erro ao salvar", (upRes as { error?: string }).error || "Ocorreu um erro inesperado.");
                    return;
                }

                if (status !== originalQuoteData.status) {
                    const stRes = await updateQuoteStatusAction({
                        quoteId: existingQuote.id,
                        partnerId,
                        status: status as "draft" | "sent" | "approved" | "rejected" | "expired" | "cancelled",
                    });
                    if (!stRes.success) {
                        notifyError("Status", (stRes as { error?: string }).error || "Não foi possível atualizar o status.");
                        return;
                    }
                }

                const res = await getQuoteDetailsAction(existingQuote.id, partnerId);
                if (res.success && res.data) {
                    const q = res.data as any;
                    const items = (q.items || []).map((item: any) => ({
                        quoteItemId: item.id,
                        id: item.product_id || `legacy-${item.id}`,
                        rowId: `item-${item.id}`,
                        name: item.custom_name || item.products?.name || "Item sem nome",
                        sku: item.products?.sku || "N/A",
                        price: Number(item.unit_price),
                        qty: Number(item.quantity),
                        stock: Number(item.products?.stock_available ?? item.products?.stock_quantity ?? 0),
                        image: item.image || item.products?.images?.[0] || "https://img.dudit.com.br/static/Placeholder.png",
                        isEditing: false,
                        isBlank: !item.product_id,
                        isManual: !item.product_id,
                    }));
                    setQuoteItems(items);
                    setSelectedCustomer(q.customers);
                    setInternalNote(q.notes || "");
                    setStaffInternalNotes(q.internal_notes || "");
                    setQuoteDate(q.issue_date);
                    setExpiryDate(q.expiration_date);
                    setStatus(q.status);
                    setDiscount(q.discount_value?.toString() || "");
                    setDiscountType(q.discount_type === "percentage" ? "%" : "R$");
                    setShippingFee(q.shipping_cost?.toString() || "");
                    setOtherCosts(q.additional_costs?.toString() || "");
                    setOriginalQuoteData({
                        items,
                        customer: q.customers,
                        note: q.notes || "",
                        internalStaff: q.internal_notes || "",
                        date: q.issue_date,
                        expiry: q.expiration_date,
                        status: q.status,
                        discount: q.discount_value?.toString() || "",
                        discountType: q.discount_type === "percentage" ? "%" : "R$",
                        shipping: q.shipping_cost?.toString() || "",
                        others: q.additional_costs?.toString() || "",
                    });
                }

                notifySuccess("Alterações salvas!", "O orçamento foi salvo com sucesso.");
                debouncedRefresh();
                onBack();
                return;
            }

            const result = await createQuoteAction({
                partnerId: partnerId,
                customerId: selectedCustomer?.id,
                storeId: selectedStore?.id,
                issueDate: quoteDate,
                expirationDate: expiryDate,
                notes: internalNote,
                internalNotes: staffInternalNotes,
                discountType: discountType === "%" ? "percentage" : "fixed",
                discountValue: Number(discount) || 0,
                shippingCost: Number(shippingFee) || 0,
                additionalCosts: Number(otherCosts) || 0,
                items: quoteItems.map((item, idx) => ({
                    productId: (item.isBlank || item.isService) ? null : item.id,
                    customName: item.name ? item.name.trim() : undefined,
                    quantity: item.qty,
                    unitPrice: item.price,
                    sortOrder: idx,
                })),
                userId: salespersonId || undefined,
                preview: {
                    primaryColor,
                    secondaryColor,
                    quoteTitle,
                    quoteSubtitle,
                    showDecoration,
                },
            });

            if (result.success) {
                const newQuoteId = (result as any).data?.id;
                if (newQuoteId && quoteAttachments.length > 0) {
                    const pendingFiles = quoteAttachments.filter(att => att.file instanceof File);
                    if (pendingFiles.length > 0) {
                        const docFiles = pendingFiles.filter(att => !att.file_type?.startsWith("image/")).map(att => att.file);
                        const imageFiles = pendingFiles.filter(att => att.file_type?.startsWith("image/")).map(att => att.file);
                        await uploadAndSavePendingAttachments({
                            partnerId,
                            entityId: newQuoteId,
                            entityType: "quote",
                            files: docFiles,
                            images: imageFiles,
                        });
                    }
                }
                notifySuccess(mode === "edit" ? "Alterações salvas!" : "Orçamento criado!",
                    "O orçamento foi salvo com sucesso.");
                debouncedRefresh();
                onBack();
            } else {
                const errorMsg = (result as any).error || "Ocorreu um erro inesperado."
                if (isPlanLimitReachedError(errorMsg)) {
                    const target = getNextPlanTarget(planSlug)
                    if (target) openPlanUpgrade(target)
                    else notifyError("Limite atingido", "Você já está no plano máximo.")
                    return
                }
                notifyError("Erro ao salvar", errorMsg);
            }
        } catch (error) {
            console.error(error);
            notifyError("Erro fatal", "Não foi possível conectar ao servidor.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleReopenQuote = useCallback(() => {
        setStatus("draft");
        notifySuccess("Status alterado", "Status definido como Rascunho. Clique em Salvar para gravar.");
    }, [notifySuccess]);

    const handleDuplicateFromEditor = useCallback(async () => {
        if (!existingQuote?.id) return;
        const dup = await duplicateQuoteAction(existingQuote.id);
        if (dup.success) {
            notifySuccess("Cópia criada", "Um novo rascunho foi gerado a partir deste orçamento.");
            debouncedRefresh();
            onBack();
        } else {
            const errorMsg = (dup as { error?: string }).error || "Não foi possível duplicar."
            if (isPlanLimitReachedError(errorMsg)) {
                const target = getNextPlanTarget(planSlug)
                if (target) openPlanUpgrade(target)
                return
            }
            notifyError("Erro", errorMsg);
        }
    }, [existingQuote?.id, notifySuccess, notifyError, debouncedRefresh, onBack]);

    const getTabErrorCount = useCallback((tab: string) => {
        return REQUIRED_FIELDS.filter(({ field, tab: fieldTab }) => fieldTab === tab && fieldErrors.has(field)).length
    }, [fieldErrors])

    const { scrollToFirstError } = useScrollToFirstError({
        fieldErrors,
        REQUIRED_FIELDS,
        scrollContainerRef,
        activeTab,
        setActiveTab,
    })

    const currentItems = quoteItems;
    const itemsCount = currentItems.length;
    const hasItems = itemsCount > 0;
    const isLoadingProposalItems = isLoadingDetails && mode !== 'create';
    const isEditLoadingLocked = mode !== "create" && isLoadingDetails;

    const headerContent = (
        <div className="hidden lg:flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
                <Button variant="filled" onClick={handleBack} className={`w-10 h-10 p-0 flex items-center justify-center shrink-0 ${isScrolled ? "scale-90" : "scale-100"}`}>
                    <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                </Button>

                <div className="min-w-0">
                    <h1 className={`text-xl md:text-2xl font-bold text-brand-dark dark:text-dark-heading flex items-center gap-3 truncate ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                        <span className="truncate">{pageTitle}</span>
                        {mode === "edit" && (
                            <Badge variant="gray" icon={<EditIcon />}>Editando</Badge>
                        )}
                    </h1>
                    <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-300 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                        {mode === 'create' && "Crie uma proposta comercial para seu cliente"}
                        {mode === 'duplicate' && "Crie uma nova proposta a partir de uma existente"}
                        {mode === 'edit' && "Edite os detalhes da sua proposta comercial"}
                    </div>
                </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 md:gap-3 shrink-0">
                <Button variant="outline" onClick={handleBack} disabled={isSaving || isEditLoadingLocked} className="h-9">
                    {mode === 'view' ? "Voltar" : "Cancelar"}
                </Button>
                {mode !== 'view' && (
                    <Button onClick={handleSave} disabled={isSaving || isEditLoadingLocked} isLoading={isSaving} leftIcon={<SaveIcon size={16} />} className="h-9">
                        {mode === 'edit' ? "Salvar" : "Salvar"}
                    </Button>
                )}
            </div>
        </div>
    )

    return (
        <FadeIn className="flex flex-col h-full bg-white dark:bg-dark-background overflow-hidden relative">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full w-full">
                {/* DESKTOP (lg:): 50/50 Split View */}
                <div className="hidden lg:flex lg:flex-row w-full h-full overflow-hidden">
                    {/* LEFT SIDE - HEADER & CONTENT */}
                    <div className="w-1/2 flex flex-col flex-1 min-h-0 shrink-0 h-full border-r border-brand-border dark:border-dark-border bg-white dark:bg-dark-background relative">
                        {/* Header confined to Left Half */}
                        <div className={`shrink-0 z-30 w-full bg-white dark:bg-dark-surface border-b border-brand-border dark:border-dark-border transition-all duration-300 px-6 ${isScrolled ? "py-2.5" : "pt-4 pb-0"}`}>
                            {headerContent}
                            {/* Desktop Tabs - below subtitle, above items */}
                            <div className={`w-full transition-all duration-300 ${isScrolled ? "mt-2" : "mt-4"}`}>
                                <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0 overflow-x-auto custom-scrollbar">
                                    <TabsTrigger value="Dados Gerais">
                                        Dados Gerais
                                        {getTabErrorCount("Dados Gerais") > 0 && <span className="ml-2 w-2 h-2 bg-brand-red rounded-full inline-block" />}
                                    </TabsTrigger>
                                    <TabsTrigger value="Layout">Personalizar</TabsTrigger>
                                    <TabsTrigger value="Observações">
                                        Observações
                                        {getTabErrorCount("Observações") > 0 && <span className="ml-2 w-2 h-2 bg-brand-red rounded-full inline-block" />}
                                    </TabsTrigger>
                                    <TabsTrigger value="Anexos">Anexos</TabsTrigger>
                                </TabsList>
                            </div>
                        </div>

                        {/* Scrollable details on Left Half */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar relative" ref={scrollContainerRef} onScroll={handleScroll}>
                            {isEditLoadingLocked && (
                                <div className="flex items-center justify-center h-full min-h-[200px] w-full">
                                    <ThreeDotsLoader />
                                </div>
                            )}
                            <div className="flex-1 pt-4 pb-12 px-6">
                                <QuoteEditor
                                    mode={mode}
                                    searchQuery={productBucket.searchQuery}
                                    setSearchQuery={productBucket.setSearchQuery}
                                    isProductSearchOpen={isProductSearchOpen}
                                    setIsProductSearchOpen={setIsProductSearchOpen}
                                    filteredProducts={productBucket.filteredResults}
                                    isSearching={productBucket.isLoading}
                                    onSearchFocus={productBucket.loadBucket}
                                    loadMoreProducts={productBucket.loadMore}
                                    hasMoreProducts={productBucket.hasMore}
                                    quotePromotions={quotePromotions}
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
                                    staffInternalNotes={staffInternalNotes}
                                    setStaffInternalNotes={setStaffInternalNotes}
                                    editCaps={editCaps}
                                    onReopenQuote={mode === "edit" ? handleReopenQuote : undefined}
                                    onDuplicateQuote={mode === "edit" ? handleDuplicateFromEditor : undefined}
                                    primaryColor={primaryColor}
                                    setPrimaryColor={setPrimaryColor}
                                    secondaryColor={secondaryColor}
                                    setSecondaryColor={setSecondaryColor}
                                    quoteTitle={quoteTitle}
                                    setQuoteTitle={setQuoteTitle}
                                    quoteSubtitle={quoteSubtitle}
                                    setQuoteSubtitle={setQuoteSubtitle}
                                    showDecoration={showDecoration}
                                    setShowDecoration={setShowDecoration}
                                    isReadOnly={mode === 'view'}
                                    fieldErrors={fieldErrors}
                                    setFieldErrors={setFieldErrors}
                                    manualItemNameErrors={manualItemNameErrors}
                                    manualItemPriceErrors={manualItemPriceErrors}
                                    isLoadingItems={isLoadingProposalItems}
                                    salespersonId={salespersonId}
                                    setSalespersonId={setSalespersonId}
                                    salespeople={salespeople}
                                    canApplyDiscount={canDiscount}
                                    isMarketplaceOrigin={isMarketplaceOrigin}
                                />

                                {/* ANEXOS TAB */}
                                <TabsContent value="Anexos" className="mt-0 focus-visible:outline-none">
                                    <FadeIn key="Anexos">
                                        <QuoteAttachmentsTab
                                            partnerId={partnerId}
                                            quoteId={mode === "edit" ? existingQuote?.id : undefined}
                                            attachments={quoteAttachments}
                                            isEditing={mode !== "view"}
                                            onChange={(newAtts) => setQuoteAttachments(newAtts)}
                                            onMutation={mode === "edit" && existingQuote?.id ? async () => {
                                                const res = await getQuoteDetailsAction(existingQuote.id, partnerId);
                                                if (res.success && (res.data as any)?.attachments) {
                                                    setQuoteAttachments((res.data as any).attachments);
                                                }
                                            } : undefined}
                                        />
                                    </FadeIn>
                                </TabsContent>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT SIDE - PREVIEW (always visible on desktop) */}
                    <div className="w-1/2 bg-brand-gray dark:bg-dark-border/20 overflow-hidden flex flex-col h-full min-h-0">
                        <div className="flex-1 min-h-0 flex flex-col">
                            <QuotePreview
                                invoiceNumber={quoteCode || (mode === 'create' ? 'ORC00000' : 'N/A')}
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
                                partnerPhone={partnerPhone}
                                partnerAvatar={partnerAvatar}
                                showDecoration={showDecoration}
                                salespersonName={salespeople.find(s => s.id === salespersonId)?.name}
                            />
                        </div>
                    </div>
                </div>

                {/* MOBILE / TABLET VIEW (lg:hidden) */}
                <div className="lg:hidden flex flex-col h-full w-full overflow-hidden">
                    {/* Top Header & Tabs for Mobile/Tablet */}
                    <div className="shrink-0 z-30 w-full bg-white dark:bg-dark-surface border-b border-brand-border dark:border-dark-border px-4 pt-3 pb-0">
                        <div>
                            <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0 overflow-x-auto custom-scrollbar">
                                <TabsTrigger value="Dados Gerais">
                                    Dados Gerais
                                    {getTabErrorCount("Dados Gerais") > 0 && <span className="ml-2 w-2 h-2 bg-brand-red rounded-full inline-block" />}
                                </TabsTrigger>
                                <TabsTrigger value="Layout">Personalizar</TabsTrigger>
                                <TabsTrigger value="Observações">
                                    Observações
                                    {getTabErrorCount("Observações") > 0 && <span className="ml-2 w-2 h-2 bg-brand-red rounded-full inline-block" />}
                                </TabsTrigger>
                                <TabsTrigger value="Anexos">Anexos</TabsTrigger>
                                <TabsTrigger value="Visualização">Visualização</TabsTrigger>
                            </TabsList>
                        </div>
                    </div>

                    {/* Mobile/Tablet Content Area */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar relative pb-24">
                        <div className="px-4 py-4">
                            <QuoteEditor
                                mode={mode}
                                searchQuery={productBucket.searchQuery}
                                setSearchQuery={productBucket.setSearchQuery}
                                isProductSearchOpen={isProductSearchOpen}
                                setIsProductSearchOpen={setIsProductSearchOpen}
                                filteredProducts={productBucket.filteredResults}
                                isSearching={productBucket.isLoading}
                                onSearchFocus={productBucket.loadBucket}
                                loadMoreProducts={productBucket.loadMore}
                                hasMoreProducts={productBucket.hasMore}
                                quotePromotions={quotePromotions}
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
                                staffInternalNotes={staffInternalNotes}
                                setStaffInternalNotes={setStaffInternalNotes}
                                editCaps={editCaps}
                                onReopenQuote={mode === "edit" ? handleReopenQuote : undefined}
                                onDuplicateQuote={mode === "edit" ? handleDuplicateFromEditor : undefined}
                                primaryColor={primaryColor}
                                setPrimaryColor={setPrimaryColor}
                                secondaryColor={secondaryColor}
                                setSecondaryColor={setSecondaryColor}
                                quoteTitle={quoteTitle}
                                setQuoteTitle={setQuoteTitle}
                                quoteSubtitle={quoteSubtitle}
                                setQuoteSubtitle={setQuoteSubtitle}
                                showDecoration={showDecoration}
                                setShowDecoration={setShowDecoration}
                                isReadOnly={mode === 'view'}
                                fieldErrors={fieldErrors}
                                setFieldErrors={setFieldErrors}
                                manualItemNameErrors={manualItemNameErrors}
                                manualItemPriceErrors={manualItemPriceErrors}
                                isLoadingItems={isLoadingProposalItems}
                                salespersonId={salespersonId}
                                setSalespersonId={setSalespersonId}
                                salespeople={salespeople}
                                canApplyDiscount={canDiscount}
                                isMarketplaceOrigin={isMarketplaceOrigin}
                            />

                            {/* ANEXOS TAB */}
                            <TabsContent value="Anexos" className="mt-0 focus-visible:outline-none">
                                <FadeIn key="Anexos">
                                    <QuoteAttachmentsTab
                                        partnerId={partnerId}
                                        quoteId={mode === "edit" ? existingQuote?.id : undefined}
                                        attachments={quoteAttachments}
                                        isEditing={mode !== "view"}
                                        onChange={(newAtts) => setQuoteAttachments(newAtts)}
                                        onMutation={mode === "edit" && existingQuote?.id ? async () => {
                                            const res = await getQuoteDetailsAction(existingQuote.id, partnerId);
                                            if (res.success && (res.data as any)?.attachments) {
                                                setQuoteAttachments((res.data as any).attachments);
                                            }
                                        } : undefined}
                                    />
                                </FadeIn>
                            </TabsContent>

                            {/* VISUALIZAÇÃO TAB */}
                            <TabsContent value="Visualização" className="mt-0 focus-visible:outline-none">
                                <div className="w-full h-[calc(100vh-220px)] min-h-[500px] bg-brand-gray dark:bg-dark-border/20 rounded-2xl overflow-hidden p-2 sm:p-4">
                                    <QuotePreview
                                        invoiceNumber={quoteCode || (mode === 'create' ? 'ORC00000' : 'N/A')}
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
                                        partnerPhone={partnerPhone}
                                        partnerAvatar={partnerAvatar}
                                        showDecoration={showDecoration}
                                        salespersonName={salespeople.find(s => s.id === salespersonId)?.name}
                                    />
                                </div>
                            </TabsContent>
                        </div>
                    </div>

                    {/* Mobile Bottom Action Bar */}
                    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 flex gap-3 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
                        <Button
                            variant="outline"
                            onClick={handleBack}
                            disabled={isSaving || isEditLoadingLocked}
                            className="flex-1 h-12"
                        >
                            {mode === 'view' ? "Voltar" : "Cancelar"}
                        </Button>
                        {mode !== 'view' && (
                            <Button
                                onClick={handleSave}
                                disabled={isEditLoadingLocked}
                                isLoading={isSaving}
                                className="flex-1 h-12"
                            >
                                {mode === 'edit' ? "Salvar" : "Salvar"}
                            </Button>
                        )}
                    </div>
                </div>
            </Tabs>

            <SelectCustomerSheet
                isOpen={isCustomerSheetOpen}
                onClose={() => setIsCustomerSheetOpen(false)}
                onSelect={(c: any) => setSelectedCustomer(c)}
                partnerId={partnerId}
            />

            <SelectProductVariantSheet
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
                title="Sair sem salvar?"
                description="Você tem alterações no orçamento que ainda não foram salvas."
                confirmText="Sair sem salvar"
                cancelText="Continuar editando"
                variant="warning"
            />

            {unsavedChangesDialogOpen && (
                <AlertModal
                    isOpen={unsavedChangesDialogOpen}
                    onClose={handleUnsavedChangesDialogClose}
                    onConfirm={handleUnsavedChangesConfirm}
                    title="Sair sem salvar?"
                    description="Você tem alterações no orçamento que ainda não foram salvas."
                    confirmText="Sair sem salvar"
                    cancelText="Continuar editando"
                    variant="warning"
                />
            )}

            <AlertModal
                isOpen={showValidationModal}
                onClose={() => { setShowValidationModal(false); scrollToFirstError(); }}
                title="Campos obrigatórios pendentes"
                message={validationMessage || "Revise os campos obrigatórios antes de salvar o orçamento."}
                confirmText="Ok, entendi"
                variant="warning"
            />

            <SavingStatusModal isOpen={isSaving} text={mode === "edit" ? "Salvando orçamento..." : "Criando orçamento..."} />

            <AlertModal
                isOpen={showZeroStockAlert}
                onClose={() => setShowZeroStockAlert(false)}
                onConfirm={() => {
                    setShowZeroStockAlert(false)
                    pendingZeroStockItem?.callback?.()
                    setPendingZeroStockItem(null)
                }}
                title="Estoque insuficiente"
                message={`O produto "${pendingZeroStockItem?.product?.name || ''}" não possui estoque suficiente. Deseja continuar mesmo assim?`}
                confirmText="Continuar mesmo assim"
                cancelText="Cancelar"
                variant="warning"
            />
        </FadeIn>
    );
};

export default CreateQuote;
