"use client"

import React, { useMemo, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { FadeIn } from "@/components/animations/FadeIn"
import {
    Input, Button, FormDropdown, Combobox,
    CustomerCard, CustomerMobileBar, IconPlaceholder, DatePicker, Pagination,
    ThreeDotsLoader,
    MoneyInput,
    InfoCard,
    ListItem,
    FormSection,
    Badge,
    Tooltip,
    SidebarCard,
} from "@/components/reusable"
import {
    SearchIcon, PlusIcon, TagIcon, TrashIcon,
    CheckCircleIcon, EditIcon, UserIcon,
    TruckIcon, Package, MotorbikeIcon
} from "@/lib/icons"
import QuantitySelector from "@/components/reusable/QuantitySelector"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { formatCurrency, formatQuantityWithUnit, formatUnitPriceWithUnit, formatDeliveryDaysRange } from "@/lib/utils"
import { getCarrierBrandIcon } from "@/lib/utils/carrier-brand"
import { getPaymentStatusMeta } from "@/lib/orders/status"
import { computeItemDisplayPrice } from "@/lib/services/pricing-engine"
import { PaymentMethodIndicator } from "@/components/erp/transactions/PaymentMethodIndicator"
import { formatPaymentMethodLabel } from "@/lib/utils/payment-method-label"
import { usePermissions } from "@/lib/permission-context"

function formatLocalISODate(date: Date) {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, "0")
    const d = String(date.getDate()).padStart(2, "0")
    return `${y}-${m}-${d}`
}

const formatProductQuantity = (qty: number, unit?: string | null) => {
    return formatQuantityWithUnit(qty, unit);
};

const formatProductUnitPrice = (price: number, unit?: string | null) => {
    return formatUnitPriceWithUnit(price, unit);
};

interface OrderGeneralTabProps {
    // Items state
    items: any[]
    searchQuery: string
    isProductSearchOpen: boolean
    isSearching: boolean
    searchResults: any[]

    // Financial state
    subtotal: number
    discountAmount: number
    discountValue: number
    discountType: 'fixed' | 'percentage' | 'coupon'
    couponCode?: string
    couponDiscountAmount?: number
    shippingFee: string
    otherCosts: string
    totalAmount: number

    // Order settings state
    selectedCustomer: any
    orderDate: string
    salesChannel: string
    deliveryMethod: string
    paymentStatus: string
    deliveryStatus: string
    financeAccountId: string
    accountOptions: Array<{ value: string; label: string }>
    remainingPaymentAmount?: number
    manualItemNameErrors?: Set<number>
    manualItemPriceErrors?: Set<number>
    isSaving: boolean

    searchPromotions?: any[]

    // Handlers
    setSearchQuery: (val: string) => void
    setIsProductSearchOpen: (val: boolean) => void
    handleSearchProduct?: (term: string) => void  // deprecated, kept for compat
    onSearchFocus?: () => void
    addProductToOrder: (product: any) => void
    updateItemField: (index: number, field: string, value: any) => void
    updateItemPrice: (index: number, price: number) => void
    updateItemQty: (index: number, qty: number) => void
    resolveItemQuantityMax?: (item: any) => number | undefined
    toggleItemEdit: (index: number, isEditing: boolean) => void
    removeItem: (index: number) => void
    addBlankItem: () => void
    setShippingFee: (val: string) => void
    setOtherCosts: (val: string) => void
    setDiscountValue: (val: number) => void
    setDiscountType: (val: 'fixed' | 'percentage' | 'coupon') => void
    setCouponCode?: (val: string) => void
    onApplyCoupon?: () => void
    onOpenDiscount?: () => void
    onOpenShipping: () => void
    setSelectedCustomer: (val: any) => void
    setIsCustomerSheetOpen: (val: boolean) => void
    setOrderDate: (val: string) => void
    setSalesChannel: (val: string) => void
    setDeliveryMethod: (val: any) => void
    setFinanceAccountId: (val: string) => void
    setDeliveryStatus: (val: string) => void
    onCreateAccount: () => void
    handleSaveOrder: () => void
    loadMoreProducts?: () => void
    hasMoreProducts?: boolean

    // Options
    salesChannelOptions: any[]
    deliveryMethodOptions: any[]
    deliveryStatusOptions: any[]

    isQuickMode?: boolean
    fieldErrors?: Set<string>
    setFieldErrors?: React.Dispatch<React.SetStateAction<Set<string>>>
    isMarketplaceOrder?: boolean
    isMarketplaceLocked?: boolean
    isPaidOrder?: boolean
    originalPaymentMethod?: string
    originalPaymentProvider?: string
    originalPaymentBreakdown?: Array<{ method: string; amount: number }>
    originalPaidAmount?: number
    paymentMethodDiscountAmount?: number
    paymentMethodExtraAmount?: number
    originalDeliveryPayer?: string
    originalDeliverySubsidy?: number
    role?: string
    deliveryBreakdown?: Record<string, unknown> | null
}

export const OrderGeneralTab: React.FC<OrderGeneralTabProps> = ({
    items, searchQuery, isProductSearchOpen, isSearching, searchResults,
    subtotal, discountAmount, discountValue, discountType, shippingFee, otherCosts, totalAmount,
    couponCode = "", couponDiscountAmount = 0,
    selectedCustomer, orderDate, salesChannel, deliveryMethod, paymentStatus, deliveryStatus, financeAccountId, accountOptions, isSaving,
    remainingPaymentAmount = 0,
    manualItemNameErrors = new Set<number>(),
    manualItemPriceErrors = new Set<number>(),
    setSearchQuery, setIsProductSearchOpen, handleSearchProduct, onSearchFocus, addProductToOrder,
    loadMoreProducts, hasMoreProducts,
    updateItemField, updateItemPrice, updateItemQty, resolveItemQuantityMax, toggleItemEdit, removeItem, addBlankItem,
    setShippingFee, setOtherCosts, setDiscountValue, setDiscountType, setSelectedCustomer, setIsCustomerSheetOpen,
    setCouponCode, onApplyCoupon, onOpenDiscount, onOpenShipping,
    setOrderDate, setSalesChannel, setDeliveryMethod, setFinanceAccountId, setDeliveryStatus, onCreateAccount, handleSaveOrder,
    salesChannelOptions, deliveryMethodOptions, deliveryStatusOptions,
    fieldErrors, setFieldErrors,
    isQuickMode = false,
    isMarketplaceOrder = false,
    isMarketplaceLocked: passedIsMarketplaceLocked = false,
    isPaidOrder = false,
    originalPaymentMethod = "Não informado",
    originalPaymentProvider = "",
    originalPaymentBreakdown = [],
    originalPaidAmount = 0,
    paymentMethodDiscountAmount = 0,
    paymentMethodExtraAmount = 0,
    originalDeliveryPayer = "customer",
    originalDeliverySubsidy = 0,
    role = "OPERATOR",
    searchPromotions = [],
    deliveryBreakdown = null,
}) => {
    const { canRbac } = usePermissions()
    const isMarketplaceLocked = isPaidOrder || !canRbac("orders.edit");
    const hasOnlyServices = items.length > 0 && items.every((item) => Boolean(item.isService));
    const PaymentRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
        <div className="flex justify-between items-start text-[14px] gap-4">
            <span className="text-brand-inactive-text dark:text-dark-body font-medium">{label}</span>
            <div className="text-right">{value}</div>
        </div>
    )

    const formatDateString = (dateStr: string) => {
        if (!dateStr) return "-"
        const parts = dateStr.split("-")
        if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`
        return dateStr
    }

    const payStatusMeta = useMemo(() => getPaymentStatusMeta(paymentStatus), [paymentStatus])
    const pendingSuffix = payStatusMeta.label !== "Pago" ? ` (${payStatusMeta.label})` : ""
    const paymentBreakdown = useMemo(() => {
        return Array.isArray(originalPaymentBreakdown) && originalPaymentBreakdown.length > 0
            ? originalPaymentBreakdown.filter((entry: any) => entry?.method)
            : Number(originalPaidAmount || 0) > 0 && originalPaymentMethod
                ? [{ method: originalPaymentMethod, amount: Number(originalPaidAmount || 0) }]
                : []
    }, [originalPaymentBreakdown, originalPaidAmount, originalPaymentMethod])
    const hasDetailedBreakdownFees = useMemo(
        () => paymentBreakdown.some((e: any) => e.interestAmount !== undefined || e.feeAmount !== undefined || e.fixedFeeAmount !== undefined),
        [paymentBreakdown]
    )
    const breakdownTotals = useMemo(() => {
        if (!hasDetailedBreakdownFees) return { customerInterest: 0, customerFee: 0, customerFixedFee: 0 }
        const totals = { customerInterest: 0, customerFee: 0, customerFixedFee: 0 }
        paymentBreakdown.forEach((e: any) => {
            const feeBearer = String(e?.feeBearer || "merchant").toLowerCase().trim()
            const installmentFeeBearer = String(e?.installmentFeeBearer || "merchant").toLowerCase().trim()
            const isCustomerFeeBearer = feeBearer === "customer" || feeBearer === "buyer"
            const isCustomerInstallmentBearer = installmentFeeBearer === "customer" || installmentFeeBearer === "buyer"
            const entryInterest = Number(e.interestAmount || 0)
            const entryInstallmentCost = Number(e.installmentCostAmount || 0)
            const entryFixedInterest = Math.max(0, entryInterest - entryInstallmentCost)
            const entryFee = Number(e.feeAmount || 0)
            const entryFixedFee = Number(e.fixedFeeAmount || 0)
            if (isCustomerFeeBearer) {
                totals.customerInterest += entryFixedInterest
                totals.customerFee += entryFee
                totals.customerFixedFee += entryFixedFee
            }
            if (isCustomerInstallmentBearer) {
                totals.customerInterest += entryInstallmentCost
            }
        })
        return totals
    }, [hasDetailedBreakdownFees, paymentBreakdown])
    const customerVisibleFeeTotal = breakdownTotals.customerInterest + breakdownTotals.customerFee + breakdownTotals.customerFixedFee
    const effectivePaymentMethodExtraAmount = hasDetailedBreakdownFees
        ? (customerVisibleFeeTotal > 0.009 ? paymentMethodExtraAmount : 0)
        : paymentMethodExtraAmount
    const friendlyMethod = useMemo(() => {
        const methodEntries = paymentBreakdown.filter((e: any) => e?.method)
        const paidMethodEntries = methodEntries.filter((e: any) => Number(e?.amountReceived ?? e?.amount ?? 0) > 0.009)
        const paidLabels = Array.from(new Set(paidMethodEntries.map((e: any) => String(e?.method || "").toLowerCase().trim()).filter(Boolean)))
        if (paidLabels.length > 1) return "Múltiplos meios"
        const preferred = paidMethodEntries[0] || methodEntries[0]
        const raw = preferred?.method || originalPaymentMethod
        return raw && raw !== "Não informado" ? formatPaymentMethodLabel(raw, null) : ""
    }, [paymentBreakdown, originalPaymentMethod])
    const paymentMethodLabel = `${friendlyMethod || "Não informado"}${pendingSuffix}`
    const searchRef = useRef<HTMLDivElement>(null);
    const ITEMS_PER_PAGE = 8;
    const [currentPage, setCurrentPage] = React.useState(1);
    const [nameErrors, setNameErrors] = React.useState<Record<number, boolean>>({});
    const [priceErrors, setPriceErrors] = React.useState<Record<number, boolean>>({});

    const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE);
    const paginatedItems = items.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    useEffect(() => {
        if (currentPage > totalPages && totalPages > 0) {
            setCurrentPage(totalPages);
        }
    }, [items.length, totalPages, currentPage]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
                setIsProductSearchOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [setIsProductSearchOpen]);

    const hasCoupon = useMemo(() => Number(couponDiscountAmount || 0) > 0, [couponDiscountAmount])

    return (
        <FadeIn>
            {/* Desktop View */}
            <div className="hidden lg:grid grid-cols-12 gap-y-8 md:gap-y-0">
                <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12">
                    {isPaidOrder ? (
                        <section className="space-y-6">
                            <FormSection title="Itens do Pedido" className="mb-8">
                                <div className="space-y-4">
                                    {items.map((item: any, idx: number) => (
                                        <div key={idx} className="flex items-start gap-4">
                                            <div className="w-16 h-16 overflow-hidden shrink-0 rounded-full border border-brand-border dark:border-dark-border">
                                                <img
                                                    src={getR2ImageUrl(item.image, "thumbnail")}
                                                    className="w-full h-full object-cover rounded-full"
                                                    alt={item.name}
                                                    onError={(e: any) => { e.target.src = "https://img.dudit.com.br/static/Placeholder.png" }} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex justify-between items-start mb-1">
                                                    <h4 className="font-bold text-[14px] md:text-[15px] text-brand-dark dark:text-dark-heading truncate">{item.name || "Produto sem nome"}</h4>
                                                    <span className="font-bold text-[14px] md:text-[15px] text-brand-dark dark:text-dark-heading">{formatCurrency(item.unitPrice * item.quantity)}</span>
                                                </div>
                                                <div className="text-xs text-brand-inactive-text dark:text-dark-body uppercase mb-2">SKU: {item.sku || "N/A"}</div>
                                                <div className="flex items-center gap-2 text-xs text-brand-inactive-text dark:text-dark-body">
                                                    <span>{formatProductQuantity(item.quantity, item.unit)} • {formatProductUnitPrice(item.unitPrice, item.unit)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </FormSection>
                        </section>
                    ) : (
                        <FormSection title="Itens do Pedido" className="mb-8">
                            <div ref={searchRef} className={`relative mb-6 ${isMarketplaceLocked ? 'pointer-events-none opacity-60' : ''}`}>
                                <Input
                                    label=""
                                    name="productSearch"
                                    dataField="productSearch"
                                    placeholder="Buscar produtos para adicionar..."
                                    prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
                                    value={searchQuery}
                                    onChange={(e: any) => {
                                        setSearchQuery(e.target.value);
                                        setIsProductSearchOpen(true);
                                        if (handleSearchProduct) handleSearchProduct(e.target.value);
                                        if (setFieldErrors) {
                                            setFieldErrors(prev => {
                                                const next = new Set(prev);
                                                next.delete("productSearch");
                                                return next;
                                            });
                                        }
                                    }}
                                    onFocus={() => {
                                        setIsProductSearchOpen(true);
                                        onSearchFocus?.();
                                    }}
                                    variant="full-rounded"
                                    error={fieldErrors?.has("productSearch")}
                                    errorMessage={fieldErrors?.has("productSearch") ? "Adicione um item" : undefined}
                                />

                                <AnimatePresence>
                                    {isProductSearchOpen && searchQuery && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 5 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: 5 }}
                                            className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl shadow-xl z-[9999] max-h-72 overflow-y-auto custom-scrollbar"
                                            onScroll={(e) => {
                                                const target = e.currentTarget
                                                if (target.scrollHeight - target.scrollTop - target.clientHeight < 20) {
                                                    loadMoreProducts?.()
                                                }
                                            }}
                                        >
                                            {isSearching ? (
                                                <ThreeDotsLoader />
                                            ) : searchResults.length > 0 ? (
                                                searchResults.map(product => (
                                                    <div
                                                        key={product.id}
                                                        onClick={() => {
                                                            addProductToOrder(product);
                                                            setIsProductSearchOpen(false);
                                                        }}
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
                                                            <div className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                                {(() => {
                                                                    if (product.variants && product.variants.length > 0) {
                                                                        const prices = product.variants.map((v: any) => Number(v.price || 0))
                                                                        const minP = Math.min(...prices)
                                                                        const maxP = Math.max(...prices)
                                                                        return minP === maxP ? formatCurrency(minP) : `De: ${formatCurrency(minP)} Até: ${formatCurrency(maxP)}`
                                                                    }
                                                                    const pr = computeItemDisplayPrice(Number(product.price || 0), product.promotional_price && Number(product.promotional_price) < Number(product.price || 0) ? Number(product.promotional_price) : null, searchPromotions, { productId: product.id, categoryId: product.category_id || undefined });
                                                                    return (
                                                                        <div className="flex items-center gap-1.5">
                                                                            {pr.referencePrice && <span className="text-xs text-brand-inactive-text line-through">{formatCurrency(pr.referencePrice)}</span>}
                                                                            <span className="text-sm font-bold">{formatCurrency(pr.bestPrice)}</span>
                                                                            {pr.badgeVariant === "blue" && <Badge variant="blue" icon={null} className="whitespace-nowrap">-{pr.discountPercent}%</Badge>}
                                                                            {pr.badgeVariant === "orange" && <Badge variant="orange" icon={null} className="whitespace-nowrap">-{pr.discountPercent}%</Badge>}
                                                                        </div>
                                                                    )
                                                                })()}
                                                            </div>
                                                            <div className="text-xs font-bold text-white bg-brand-dark dark:bg-brand-green px-2 py-1 rounded-md whitespace-nowrap">
                                                                {product.isService ? "Serviço" : `${(product.variants && product.variants.length > 0) ? product.variants.reduce((sum: number, v: any) => sum + Number(v.stock || 0), 0) : (product.stock || 0)} em estoque`}
                                                            </div>
                                                        </div>
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
                            {items.length > 0 && (
                                <div className="hidden md:block w-full overflow-x-auto pb-4 custom-scrollbar mb-4">
                                    <table className="w-full text-left border-separate border-spacing-0">
                                        <thead>
                                            <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                <th className="py-3 pl-6 pr-4 text-[13px] font-medium text-gray-500 dark:text-dark-body rounded-l-lg">Produto</th>
                                                <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body w-44">Preço Unit.</th>
                                                <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body text-center w-36">Qtd.</th>
                                                <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body text-right w-36">Total</th>
                                                <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body text-center w-24 rounded-r-lg">Ações</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {paginatedItems.map((item, paginatedIndex) => {
                                                const index = (currentPage - 1) * ITEMS_PER_PAGE + paginatedIndex;
                                                const hasNameError = Boolean(nameErrors[index] || manualItemNameErrors.has(index));
                                                const hasPriceError = Boolean(priceErrors[index] || manualItemPriceErrors.has(index));
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
                                                                                disabled={isMarketplaceLocked}
                                                                                onChange={(e: any) => {
                                                                                    updateItemField(index, 'name', e.target.value);
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
                                                                    value={item.unitPrice}
                                                                    disabled={isMarketplaceLocked}
                                                                    onChange={(val: number) => {
                                                                        updateItemPrice(index, val)
                                                                        if (priceErrors[index]) {
                                                                            setPriceErrors(prev => ({ ...prev, [index]: false }));
                                                                        }
                                                                    }}
                                                                    className="mb-0"
                                                                    error={hasPriceError}
                                                                    errorMessage="Preço obrigatório"
                                                                />
                                                            </div>
                                                        </td>
                                                        <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border">
                                                            <div className="flex justify-center items-center gap-1.5">
                                                                <QuantitySelector
                                                                    value={item.quantity}
                                                                    disabled={isMarketplaceLocked}
                                                                    onChange={(val) => updateItemQty(index, val)}
                                                                    size="md"
                                                                />
                                                                {!item.isService && !item.isManual && Boolean(item.productId) && Number(item.stock || 0) <= 0 && (
                                                                    <Tooltip text="Produto sem estoque disponível no momento">
                                                                        <Badge
                                                                            variant="orange"
                                                                            icon={<Package size={14} />}
                                                                            className="shrink-0"
                                                                        />
                                                                    </Tooltip>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border text-right">
                                                            <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">
                                                                {formatCurrency(item.unitPrice * item.quantity)}
                                                            </span>
                                                        </td>
                                                        <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border">
                                                            <div className="flex justify-center gap-2">
                                                                {item.isEditing ? (
                                                                    <button
                                                                        onClick={() => {
                                                                            if (!item.name || item.name.trim() === '') {
                                                                                setNameErrors(prev => ({ ...prev, [index]: true }));
                                                                            } else if (item.isManual && Number(item.unitPrice || 0) <= 0) {
                                                                                setPriceErrors(prev => ({ ...prev, [index]: true }));
                                                                            } else {
                                                                                toggleItemEdit(index, false);
                                                                            }
                                                                        }}
                                                                        className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${isMarketplaceLocked ? 'text-gray-300 pointer-events-none' : 'text-brand-green hover:bg-green-50 dark:hover:bg-green-900/10'}`}
                                                                    >
                                                                        <CheckCircleIcon size={14} />
                                                                    </button>
                                                                ) : item.isManual ? (
                                                                    <button
                                                                        onClick={() => toggleItemEdit(index, true)}
                                                                        className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${isMarketplaceLocked ? 'text-gray-300 pointer-events-none' : 'text-brand-inactive-text hover:bg-brand-gray dark:hover:bg-dark-border'}`}
                                                                    >
                                                                        <EditIcon size={14} />
                                                                    </button>
                                                                ) : null}
                                                                <button
                                                                    disabled={isMarketplaceLocked}
                                                                    onClick={() => removeItem(index)}
                                                                    className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${isMarketplaceLocked ? 'text-gray-300 pointer-events-none' : 'text-brand-red hover:bg-red-50 dark:hover:bg-red-900/10'}`}
                                                                >
                                                                    <TrashIcon size={14} />
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

                            {/* --- ITEMS LIST (Mobile) --- */}
                            {items.length > 0 && (
                                <div className="md:hidden flex flex-col gap-4 mb-4">
                                    {paginatedItems.map((item, paginatedIndex) => {
                                        const index = (currentPage - 1) * ITEMS_PER_PAGE + paginatedIndex;
                                        const hasNameError = Boolean(nameErrors[index] || manualItemNameErrors.has(index));
                                        const hasPriceError = Boolean(priceErrors[index] || manualItemPriceErrors.has(index));
                                        return (
                                            <div key={index} className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-4">
                                                <div className="flex items-start gap-4">
                                                    <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                                                        <img src={getR2ImageUrl(item.image, "thumbnail")} className={`w-full h-full rounded-full ${!item.image ? 'object-contain' : 'object-cover'}`} alt="" />
                                                    </div>
                                                    <div className="flex-1 min-w-0 text-left">
                                                        {item.isEditing ? (
                                                            <div className="mb-2">
                                                                <Input
                                                                    name={`item-name-mobile-${index}`}
                                                                    value={item.name}
                                                                    disabled={isMarketplaceLocked}
                                                                    onChange={(e: any) => {
                                                                        updateItemField(index, 'name', e.target.value);
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
                                                            <div className="font-bold text-[14px] text-brand-dark dark:text-dark-heading mb-0.5 truncate">
                                                                {item.name || 'Produto sem nome'}
                                                            </div>
                                                        )}
                                                        {!item.isEditing && (
                                                            <div className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate mb-2">
                                                                {item.sku || 'Sem SKU'}
                                                            </div>
                                                        )}
                                                        <div className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                            Total: {formatCurrency(item.unitPrice * item.quantity)}
                                                        </div>
                                                    </div>

                                                    <div className="flex flex-col gap-2 shrink-0">
                                                        <div className="flex gap-1">
                                                            {item.isEditing ? (
                                                                <button
                                                                    onClick={() => {
                                                                        if (!item.name || item.name.trim() === '') {
                                                                            setNameErrors(prev => ({ ...prev, [index]: true }));
                                                                        } else if (item.isManual && Number(item.unitPrice || 0) <= 0) {
                                                                            setPriceErrors(prev => ({ ...prev, [index]: true }));
                                                                        } else {
                                                                            toggleItemEdit(index, false);
                                                                        }
                                                                    }}
                                                                    className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${isMarketplaceLocked ? 'text-gray-300 pointer-events-none' : 'text-brand-green hover:bg-green-50 dark:hover:bg-green-900/10'}`}
                                                                >
                                                                    <CheckCircleIcon size={14} />
                                                                </button>
                                                            ) : item.isManual ? (
                                                                <button
                                                                    onClick={() => toggleItemEdit(index, true)}
                                                                    className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${isMarketplaceLocked ? 'text-gray-300 pointer-events-none' : 'text-brand-inactive-text hover:bg-brand-gray dark:hover:bg-dark-border'}`}
                                                                >
                                                                    <EditIcon size={14} />
                                                                </button>
                                                            ) : null}
                                                            <button
                                                                disabled={isMarketplaceLocked}
                                                                onClick={() => removeItem(index)}
                                                                className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${isMarketplaceLocked ? 'text-gray-300 pointer-events-none' : 'text-brand-red hover:bg-red-50 dark:hover:bg-red-900/10'}`}
                                                            >
                                                                <TrashIcon size={14} />
                                                            </button>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-4 mt-2">
                                                        <div className="flex items-center gap-1.5 shrink-0">
                                                            <QuantitySelector
                                                                value={item.quantity}
                                                                disabled={isMarketplaceLocked}
                                                                onChange={(val) => updateItemQty(index, val)}
                                                                size="sm"
                                                            />
                                                            {!item.isService && !item.isManual && Boolean(item.productId) && Number(item.stock || 0) <= 0 && (
                                                                <Tooltip text="Produto sem estoque disponível no momento">
                                                                    <Badge
                                                                        variant="orange"
                                                                        icon={<Package size={12} />}
                                                                        className="shrink-0"
                                                                    />
                                                                </Tooltip>
                                                            )}
                                                        </div>
                                                        <div className="flex-1 max-w-[140px]">
                                                            <MoneyInput
                                                                name={`item-price-mobile-${index}`}
                                                                disabled={isMarketplaceLocked}
                                                                value={item.unitPrice}
                                                                onChange={(val: number) => {
                                                                    updateItemPrice(index, val)
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
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}

                            {/* --- Empty State --- */}
                            {items.length === 0 && (
                                <div className="w-full flex-col flex items-center justify-center">
                                    <IconPlaceholder
                                        icon={SearchIcon}
                                        title="Nenhum produto adicionado"
                                        subtitle="Busque produtos no campo acima ou cadastre um item avulso manualmente."
                                        itemButton={isMarketplaceLocked ? undefined : {
                                            text: "Adicionar item manual",
                                            action: addBlankItem,
                                            variant: "outline",
                                        }}
                                    />
                                </div>
                            )}

                            {/* Add Item Link */}
                            {items.length > 0 && !isMarketplaceLocked && (
                                <Button
                                    variant="link"
                                    onClick={addBlankItem}
                                >
                                    <PlusIcon size={14} strokeWidth={3} />
                                    Adicionar item manual
                                </Button>
                            )}

                            <div className="mt-2">
                                <Pagination
                                    currentPage={currentPage}
                                    totalPages={totalPages}
                                    onPageChange={(page) => setCurrentPage(page)}
                                />
                            </div>
                        </FormSection>
                    )}

                    <FormSection title="Configurações do Pedido" hasSeparator>
                        {isPaidOrder ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <PaymentRow label="Data do Pedido" value={<span className="text-brand-dark dark:text-dark-heading font-bold text-sm">{formatDateString(orderDate)}</span>} />
                                <PaymentRow label="Origem da Venda" value={<span className="text-brand-dark dark:text-dark-heading font-bold text-sm">{salesChannel}</span>} />
                                {!hasOnlyServices && (
                                    <PaymentRow label="Método de Entrega" value={<span className="text-brand-dark dark:text-dark-heading font-bold text-sm">{deliveryMethod === "pickup" ? "Retirada pessoalmente" : "Entrega / Delivery"}</span>} />
                                )}
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <DatePicker
                                    label="Data do Pedido"
                                    disabled={isMarketplaceLocked}
                                    value={orderDate}
                                    onChange={(date) => {
                                        if (date) {
                                            const d = new Date(date)
                                            setOrderDate(formatLocalISODate(d))
                                        }
                                    }}
                                />

                                <FormDropdown
                                    label="Origem da Venda"
                                    disabled={isMarketplaceLocked}
                                    value={salesChannel}
                                    setValue={(val: any) => setSalesChannel(val)}
                                    options={salesChannelOptions}
                                />

                                {!hasOnlyServices && (
                                    <FormDropdown
                                        label="Método de Entrega"
                                        disabled={isMarketplaceLocked && isPaidOrder}
                                        value={deliveryMethod}
                                        setValue={(val: any) => setDeliveryMethod(val)}
                                        options={deliveryMethodOptions}
                                    />
                                )}

                                {!isQuickMode && (
                                    <Combobox
                                        label="Conta de recebimento"
                                        disabled={isMarketplaceLocked && isPaidOrder}
                                        value={financeAccountId || undefined}
                                        dataField="financeAccountId"
                                        onChange={(val) => {
                                            setFinanceAccountId(val)
                                            if (setFieldErrors) {
                                                setFieldErrors((prev) => {
                                                    const next = new Set(prev)
                                                    next.delete("financeAccountId")
                                                    return next
                                                })
                                            }
                                        }}
                                        options={accountOptions}
                                        actionItem={isMarketplaceLocked && isPaidOrder ? undefined : { label: "Criar conta", onClick: onCreateAccount }}
                                        error={fieldErrors?.has("financeAccountId")}
                                    />
                                )}
                            </div>
                        )}
                    </FormSection>

                    {isPaidOrder && (
                        <FormSection title="Pagamento" hasSeparator>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <PaymentRow
                                    label="Método de Pagamento"
                                    value={
                                        <div className="flex items-center gap-2">
                                            <PaymentMethodIndicator label={paymentMethodLabel} provider={originalPaymentProvider} />
                                        </div>
                                    }
                                />

                                {(() => {
                                    const paidBreakdown = paymentBreakdown.filter((entry: any) => Number(entry.amountReceived ?? entry.amount ?? 0) > 0.009)
                                    if (paidBreakdown.length <= 1 && !(paidBreakdown.length === 1 && Number(originalPaidAmount || 0) > 0.009 && remainingPaymentAmount > 0.009)) return null
                                    return (
                                        <div className="md:col-span-2">
                                            <PaymentRow
                                                label="Valores por meio"
                                                value={
                                                    <div className="flex flex-col gap-1">
                                                        {paidBreakdown.map((entry: any, index: number) => {
                                                            const received = Number(entry.amountReceived ?? entry.amount ?? 0)
                                                            const baseAmount = Number(entry.amount || 0)
                                                            const displayAmount = received > 0.009 ? received : baseAmount
                                                            return (
                                                                <span key={`${entry.method}-${index}`} className="text-brand-dark dark:text-dark-heading font-bold text-sm">
                                                                    {formatPaymentMethodLabel(entry.method, null)}: {formatCurrency(displayAmount)}
                                                                    {baseAmount > 0.009 && received > 0.009 && Math.abs(baseAmount - received) > 0.009
                                                                        ? <span className="text-brand-muted font-normal"> (de {formatCurrency(baseAmount)})</span>
                                                                        : null}
                                                                </span>
                                                            )
                                                        })}
                                                    </div>
                                                }
                                            />
                                        </div>
                                    )
                                })()}

                                <PaymentRow label="Valor Original" value={<span className="text-brand-dark dark:text-dark-heading font-bold text-sm">{formatCurrency(subtotal)}</span>} />

                                {!isQuickMode && (
                                    <PaymentRow label="Conta de recebimento" value={<span className="text-brand-dark dark:text-dark-heading font-bold text-sm">{accountOptions.find(opt => opt.value === financeAccountId)?.label || "Não informado"}</span>} />
                                )}

                                {(Number(shippingFee || 0) > 0 || originalDeliveryPayer === "seller" || Number(originalDeliverySubsidy || 0) > 0) && (
                                    <PaymentRow
                                        label="Valor da Entrega"
                                        value={
                                            (originalDeliveryPayer === "seller" || Number(originalDeliverySubsidy || 0) > 0) ? (
                                                <div className="text-right">
                                                    <span className="text-brand-dark dark:text-dark-heading font-bold text-sm">
                                                        {formatCurrency(Number(originalDeliverySubsidy || shippingFee || 0))}
                                                    </span>
                                                    <span className="text-brand-orange"> - Subsidiado pela loja</span>
                                                </div>
                                            ) : (
                                                <span className="text-brand-dark dark:text-dark-heading font-bold text-sm">{formatCurrency(shippingFee)}</span>
                                            )
                                        }
                                    />
                                )}

                                {Number(otherCosts || 0) > 0 && (
                                    <PaymentRow
                                        label="Outros Custos"
                                        value={<span className="text-brand-dark dark:text-dark-heading font-bold text-sm">{formatCurrency(otherCosts)}</span>}
                                    />
                                )}

                                {Number(discountAmount || 0) > 0 && (
                                    <PaymentRow
                                        label="Desconto do Pedido"
                                        value={<span className="text-brand-green font-bold">- {formatCurrency(discountAmount)}</span>}
                                    />
                                )}

                                {couponDiscountAmount > 0 && (
                                    <PaymentRow
                                        label="Desconto por Cupom"
                                        value={<span className="text-brand-green font-bold">- {formatCurrency(couponDiscountAmount)}</span>}
                                    />
                                )}

                                {paymentMethodDiscountAmount > 0 && (
                                    <PaymentRow
                                        label={
                                            originalPaymentMethod === "exchange" ? "Crédito de troca" :
                                                originalPaymentMethod === "store_credit" ? "Vale-compra" :
                                                    "Desconto do Método"
                                        }
                                        value={<span className="text-brand-green font-bold">- {formatCurrency(paymentMethodDiscountAmount)}</span>}
                                    />
                                )}

                                {effectivePaymentMethodExtraAmount > 0 && (
                                    <PaymentRow
                                        label="Taxa do Método"
                                        value={<span className="text-brand-dark dark:text-dark-heading font-bold text-sm">+ {formatCurrency(effectivePaymentMethodExtraAmount)}</span>}
                                    />
                                )}

                                <div className="md:col-span-2 flex justify-between items-center pt-4 border-t border-brand-border dark:border-dark-border mt-3">
                                    <span className="text-md lg:text-xl font-medium text-brand-dark dark:text-dark-heading">Total do Pedido</span>
                                    <span className="font-bold text-2xl text-brand-dark dark:text-dark-heading tracking-tight">{formatCurrency(totalAmount)}</span>
                                </div>
                            </div>
                        </FormSection>
                    )}
                </div>

                <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 border-l-0 lg:border-l border-brand-border dark:border-dark-border mt-8 lg:mt-0">
                    {paymentStatus !== "paid" && remainingPaymentAmount > 0.009 && (
                        <div className="mb-6">
                            <InfoCard
                                title="Valor ainda em aberto"
                                message={`Falta receber ${formatCurrency(remainingPaymentAmount)} para quitar este pedido.`}
                                color="orange"
                            />
                        </div>
                    )}

                    {isPaidOrder && (
                        <div className="mb-6">
                            <InfoCard color="orange" title="Edição Restrita (Pedido Pago)" message="Como o pedido já está pago, não é possível editar itens, valores, cliente ou formas de pagamento. Apenas observações podem ser atualizadas." />
                        </div>
                    )}

                    {/* --- 1. CUSTOMER CARD --- */}
                    {!isQuickMode && (
                        <div>
                            {selectedCustomer ? (
                                <CustomerCard
                                    customer={selectedCustomer}
                                    address={selectedCustomer.addresses?.find((a: any) => a.address_type === "primary" || a.is_default) || selectedCustomer.addresses?.[0]}
                                    billingAddress={selectedCustomer.addresses?.find((a: any) => a.address_type === "billing")}
                                    onRemove={isMarketplaceLocked ? undefined : () => setSelectedCustomer(null)}
                                />
                            ) : (
                                <div
                                    className={`bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-8 flex flex-col items-center justify-center text-center relative overflow-hidden mb-6 ${isMarketplaceLocked ? 'opacity-50 pointer-events-none' : ''}`}
                                    onClick={() => !isMarketplaceLocked && setIsCustomerSheetOpen(true)}
                                >
                                    <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border"></div>

                                    <IconPlaceholder
                                        icon={UserIcon}
                                        title="Nenhum cliente selecionado"
                                        subtitle="Selecione um cliente para vincular ao pedido."
                                        itemButton={isMarketplaceLocked ? undefined : {
                                            text: "Selecionar Cliente",
                                            action: () => setIsCustomerSheetOpen(true),
                                            variant: "outline",
                                            className: "rounded-full px-8"
                                        }}
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {/* --- 2. PAYMENT CARD --- */}
                    {!isPaidOrder && (
                        <SidebarCard title="Pagamento" hasSeparator hasTopStrip>
                            <div className="space-y-4">
                                <div className="flex flex-col gap-3">
                                    {!isQuickMode && (
                                        <>
                                            {onOpenDiscount && (
                                                <ListItem
                                                    icon={TagIcon}
                                                    title="Aplicar desconto"
                                                    description={hasCoupon ? "Desconto e/ou cupom aplicado" : "Escolha o tipo e aplique no pedido"}
                                                    onClick={isMarketplaceLocked ? undefined : onOpenDiscount}
                                                    className={`px-4 py-3 gap-4 ${isMarketplaceLocked ? 'opacity-50 pointer-events-none' : ''}`}
                                                />
                                            )}
                                            {deliveryMethod === "delivery" && (() => {
                                                const savedDelivery = deliveryBreakdown as any | null
                                                const isCarrier = savedDelivery?.source === "superfrete"
                                                const carrierIcon = isCarrier
                                                    ? getCarrierBrandIcon(savedDelivery?.companyName, savedDelivery?.serviceName, savedDelivery?.carrier)
                                                    : null
                                                if (savedDelivery) {
                                                    return (
                                                        <ListItem
                                                            icon={
                                                                isCarrier ? (
                                                                    <img src={carrierIcon || ""} alt="Transportadora" className="object-contain" />
                                                                ) : (
                                                                    <MotorbikeIcon className="text-brand-dark dark:text-dark-heading" />
                                                                )
                                                            }
                                                            title={
                                                                isCarrier
                                                                    ? [savedDelivery?.companyName, savedDelivery?.serviceName].filter(Boolean).join(" - ") || "Transportadora"
                                                                    : "Entrega"
                                                            }
                                                            description={
                                                                isCarrier
                                                                    ? formatDeliveryDaysRange(savedDelivery?.deliveryMinDays, savedDelivery?.deliveryMaxDays)
                                                                    : savedDelivery?.distanceKm != null
                                                                        ? `${Number(savedDelivery.distanceKm).toFixed(2)} km de distância`
                                                                        : "Entrega a combinar"
                                                            }
                                                            onClick={isMarketplaceLocked ? undefined : onOpenShipping}
                                                            className={`px-4 py-3 gap-4 ${isMarketplaceLocked ? 'opacity-50 pointer-events-none' : ''}`}
                                                        />
                                                    )
                                                }
                                                return (
                                                    <ListItem
                                                        icon={TruckIcon}
                                                        title="Adicionar entrega"
                                                        description="Define o valor da entrega do pedido"
                                                        onClick={isMarketplaceLocked ? undefined : onOpenShipping}
                                                        className={`px-4 py-3 gap-4 ${isMarketplaceLocked ? 'opacity-50 pointer-events-none' : ''}`}
                                                    />
                                                )
                                            })()}
                                        </>
                                    )}
                                    <MoneyInput
                                        label="Outros Custos"
                                        disabled={isMarketplaceLocked}
                                        value={parseFloat(otherCosts || "0")}
                                        onChange={(val) => setOtherCosts(val.toString())}
                                    />
                                </div>

                                <div className="flex flex-col gap-3 pt-2">
                                    <div className="flex justify-between items-center text-[15px]">
                                        <span className="text-brand-inactive-text font-medium">Subtotal</span>
                                        <span className="font-bold text-brand-dark dark:text-dark-heading">
                                            {formatCurrency(subtotal)}
                                        </span>
                                    </div>

                                    {discountAmount > 0 && (
                                        <div className="flex justify-between items-center text-[15px]">
                                            <span className="text-brand-inactive-text font-medium">Desconto</span>
                                            <span className="font-bold text-brand-green">
                                                -{formatCurrency(discountAmount)}
                                            </span>
                                        </div>
                                    )}

                                    {couponDiscountAmount > 0 && (
                                        <div className="flex justify-between items-center text-[15px]">
                                            <span className="text-brand-inactive-text font-medium">Cupom aplicado</span>
                                            <span className="font-bold text-brand-green">
                                                -{formatCurrency(couponDiscountAmount)}
                                            </span>
                                        </div>
                                    )}

                                    {(parseFloat(shippingFee || "0") > 0 || originalDeliveryPayer === "seller" || Number(originalDeliverySubsidy || 0) > 0) && (
                                        <div className="flex justify-between items-center text-[15px]">
                                            <span className="text-brand-inactive-text font-medium">Entrega</span>
                                            <div className="text-right font-bold text-brand-dark dark:text-dark-heading">
                                                {(originalDeliveryPayer === "seller" || Number(originalDeliverySubsidy || 0) > 0) ? (
                                                    <div>
                                                        <span>{formatCurrency(Number(originalDeliverySubsidy || shippingFee || 0))}</span>
                                                        <span className="text-brand-orange"> - Subsidiado pela loja</span>
                                                    </div>
                                                ) : (
                                                    formatCurrency(shippingFee)
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {parseFloat(otherCosts || "0") > 0 && (
                                        <div className="flex justify-between items-center text-[15px]">
                                            <span className="text-brand-inactive-text font-medium">Outros Custos</span>
                                            <span className="font-bold text-brand-dark dark:text-dark-heading">
                                                {formatCurrency(otherCosts)}
                                            </span>
                                        </div>
                                    )}

                                    <div className="border-t border-dashed border-brand-border dark:border-dark-border pt-4 mt-2">
                                        <div className="flex justify-between items-end">
                                            <span className="text-xl font-bold text-brand-dark dark:text-dark-heading tracking-tight">Total a Pagar</span>
                                            <span className="text-2xl font-bold text-brand-dark dark:text-dark-heading leading-none tracking-tighter">
                                                {formatCurrency(totalAmount)}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <Button
                                    size="lg"
                                    className="w-full mt-4"
                                    onClick={handleSaveOrder}
                                    disabled={isSaving}
                                >
                                    Ir para Pagamento
                                </Button>
                            </div>
                        </SidebarCard>
                    )}
                </div>
            </div>

            {/* Mobile/Tablet View */}
            <div className="lg:hidden space-y-6">
                {/* 1. Cliente */}
                {!isQuickMode && (
                    <CustomerMobileBar
                        customer={selectedCustomer}
                        address={selectedCustomer?.addresses?.find((a: any) => a.address_type === "primary" || a.is_default) || selectedCustomer?.addresses?.[0]}
                        billingAddress={selectedCustomer?.addresses?.find((a: any) => a.address_type === "billing")}
                        onSelect={() => setIsCustomerSheetOpen(true)}
                        onRemove={() => setSelectedCustomer(null)}
                        disabled={isMarketplaceLocked}
                    />
                )}

                {isPaidOrder && (
                    <FormSection title="" className="mt-0">
                        <InfoCard color="orange" title="Edição Restrita (Pedido Pago)" message="Como o pedido já está pago, não é possível editar itens, valores, cliente ou formas de pagamento. Apenas observações podem ser atualizadas." />
                    </FormSection>
                )}

                {/* 2. Itens do Pedido */}
                <FormSection title="Itens do Pedido">
                    {isPaidOrder ? (
                        <div className="space-y-4">
                            {items.map((item: any, idx: number) => (
                                <div key={idx} className="flex items-start gap-4">
                                    <div className="w-16 h-16 overflow-hidden shrink-0 rounded-full border border-brand-border dark:border-dark-border">
                                        <img
                                            src={getR2ImageUrl(item.image, "thumbnail")}
                                            className="w-full h-full object-cover rounded-full"
                                            alt={item.name}
                                            onError={(e: any) => { e.target.src = "https://img.dudit.com.br/static/Placeholder.png" }} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-start mb-1">
                                            <h4 className="font-bold text-[14px] md:text-[15px] text-brand-dark dark:text-dark-heading truncate">{item.name || "Produto sem nome"}</h4>
                                            <span className="font-bold text-[14px] md:text-[15px] text-brand-dark dark:text-dark-heading">{formatCurrency(item.unitPrice * item.quantity)}</span>
                                        </div>
                                        <div className="text-xs text-brand-inactive-text dark:text-dark-body uppercase mb-2">SKU: {item.sku || "N/A"}</div>
                                        <div className="flex items-center gap-2 text-xs text-brand-inactive-text dark:text-dark-body">
                                            <span>{formatProductQuantity(item.quantity, item.unit)} • {formatProductUnitPrice(item.unitPrice, item.unit)}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div ref={searchRef} className={`relative mb-6 ${isMarketplaceLocked ? 'pointer-events-none opacity-60' : ''}`}>
                                <Input
                                    label=""
                                    name="productSearchMobile"
                                    dataField="productSearch"
                                    placeholder="Buscar produtos para adicionar..."
                                    prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
                                    value={searchQuery}
                                    onChange={(e: any) => {
                                        setSearchQuery(e.target.value);
                                        setIsProductSearchOpen(true);
                                        if (setFieldErrors) {
                                            setFieldErrors(prev => {
                                                const next = new Set(prev);
                                                next.delete("productSearch");
                                                return next;
                                            });
                                        }
                                    }}
                                    onFocus={() => {
                                        setIsProductSearchOpen(true);
                                        onSearchFocus?.();
                                    }}
                                    className="mb-0"
                                    error={fieldErrors?.has("productSearch")}
                                    errorMessage={fieldErrors?.has("productSearch") ? "Adicione um item" : undefined}
                                />

                                <AnimatePresence>
                                    {isProductSearchOpen && searchQuery && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 5 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: 5 }}
                                            className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl shadow-xl z-[9999] max-h-72 overflow-y-auto custom-scrollbar"
                                            onScroll={(e) => {
                                                const target = e.currentTarget
                                                if (target.scrollHeight - target.scrollTop - target.clientHeight < 20) {
                                                    loadMoreProducts?.()
                                                }
                                            }}
                                        >
                                            {isSearching ? (
                                                <ThreeDotsLoader />
                                            ) : searchResults.length > 0 ? (
                                                searchResults.map(product => (
                                                    <div
                                                        key={product.id}
                                                        onClick={() => {
                                                            addProductToOrder(product);
                                                            setIsProductSearchOpen(false);
                                                        }}
                                                        className="flex items-center gap-4 p-3.5 hover:bg-gray-50 dark:hover:bg-dark-border cursor-pointer border-b border-brand-border dark:border-dark-border last:border-0 transition-colors"
                                                    >
                                                        <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border/50 overflow-hidden shrink-0 border border-brand-border dark:border-dark-border">
                                                            <img src={getR2ImageUrl(product.image, "thumbnail") || "https://img.dudit.com.br/static/Placeholder.png"} alt={product.name} className="w-full h-full object-cover rounded-full bg-brand-gray dark:bg-dark-border border border-brand-border dark:border-dark-border" />
                                                        </div>
                                                        <div className="flex-1 min-w-0 text-left">
                                                            <div className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">{product.name}</div>
                                                            <div className="text-[11px] font-medium text-brand-inactive-text mt-0.5 tracking-wider uppercase truncate">
                                                                {(product.variants && product.variants.length > 0) ? "Múltiplos SKUs" : (product.sku || "N/A")}
                                                            </div>
                                                        </div>
                                                        <div className="flex flex-col items-end gap-1 shrink-0">
                                                            <div className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                                {(() => {
                                                                    if (product.variants && product.variants.length > 0) {
                                                                        const prices = product.variants.map((v: any) => Number(v.price || 0))
                                                                        const minP = Math.min(...prices)
                                                                        const maxP = Math.max(...prices)
                                                                        return minP === maxP ? formatCurrency(minP) : `De: ${formatCurrency(minP)} Até: ${formatCurrency(maxP)}`
                                                                    }
                                                                    const pr = computeItemDisplayPrice(Number(product.price || 0), product.promotional_price && Number(product.promotional_price) < Number(product.price || 0) ? Number(product.promotional_price) : null, searchPromotions, { productId: product.id, categoryId: product.category_id || undefined });
                                                                    return (
                                                                        <div className="flex items-center gap-1.5">
                                                                            {pr.referencePrice && <span className="text-xs text-brand-inactive-text line-through">{formatCurrency(pr.referencePrice)}</span>}
                                                                            <span className="text-sm font-bold">{formatCurrency(pr.bestPrice)}</span>
                                                                            {pr.badgeVariant === "blue" && <Badge variant="blue" icon={null} className="whitespace-nowrap">-{pr.discountPercent}%</Badge>}
                                                                            {pr.badgeVariant === "orange" && <Badge variant="orange" icon={null} className="whitespace-nowrap">-{pr.discountPercent}%</Badge>}
                                                                        </div>
                                                                    )
                                                                })()}
                                                            </div>
                                                            <div className="text-xs font-bold text-white bg-brand-dark dark:bg-brand-green px-2 py-1 rounded-md whitespace-nowrap">
                                                                {product.isService ? "Serviço" : `${(product.variants && product.variants.length > 0) ? product.variants.reduce((sum: number, v: any) => sum + Number(v.stock || 0), 0) : (product.stock || 0)} em estoque`}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="p-4 text-center text-sm text-brand-inactive-text">Nenhum produto encontrado.</div>
                                            )}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            {items.length > 0 ? (
                                <div className="flex flex-col gap-4 mb-4">
                                    {paginatedItems.map((item, paginatedIndex) => {
                                        const index = (currentPage - 1) * ITEMS_PER_PAGE + paginatedIndex;
                                        const hasNameError = Boolean(nameErrors[index] || manualItemNameErrors.has(index));
                                        const hasPriceError = Boolean(priceErrors[index] || manualItemPriceErrors.has(index));
                                        return (
                                            <div key={index} className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-4">
                                                <div className="flex flex-col gap-3">
                                                    <div className="flex items-start gap-4">
                                                        <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                                                            <img src={getR2ImageUrl(item.image, "thumbnail")} className={`w-full h-full rounded-full ${!item.image ? 'object-contain' : 'object-cover'}`} alt="" />
                                                        </div>
                                                        <div className="flex-1 min-w-0 text-left">
                                                            {item.isEditing ? (
                                                                <div className="mb-2">
                                                                    <Input
                                                                        name={`item-name-mobile-general-${index}`}
                                                                        value={item.name}
                                                                        disabled={isMarketplaceLocked}
                                                                        onChange={(e: any) => {
                                                                            updateItemField(index, 'name', e.target.value);
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
                                                                <div className="font-bold text-[14px] text-brand-dark dark:text-dark-heading mb-0.5 truncate">
                                                                    {item.name || 'Produto sem nome'}
                                                                </div>
                                                            )}
                                                            {!item.isEditing && (
                                                                <div className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate mb-2">
                                                                    {item.sku || 'Sem SKU'}
                                                                </div>
                                                            )}
                                                            <div className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                                Total: {formatCurrency(item.unitPrice * item.quantity)}
                                                            </div>
                                                        </div>

                                                        <div className="flex gap-1 shrink-0">
                                                            {item.isEditing ? (
                                                                <button
                                                                    onClick={() => {
                                                                        if (!item.name || item.name.trim() === '') {
                                                                            setNameErrors(prev => ({ ...prev, [index]: true }));
                                                                        } else if (item.isManual && Number(item.unitPrice || 0) <= 0) {
                                                                            setPriceErrors(prev => ({ ...prev, [index]: true }));
                                                                        } else {
                                                                            toggleItemEdit(index, false);
                                                                        }
                                                                    }}
                                                                    className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${isMarketplaceLocked ? 'text-gray-300 pointer-events-none' : 'text-brand-green hover:bg-green-50 dark:hover:bg-green-900/10'}`}
                                                                >
                                                                    <CheckCircleIcon size={14} />
                                                                </button>
                                                            ) : item.isManual ? (
                                                                <button
                                                                    onClick={() => toggleItemEdit(index, true)}
                                                                    className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${isMarketplaceLocked ? 'text-gray-300 pointer-events-none' : 'text-brand-inactive-text hover:bg-brand-gray dark:hover:bg-dark-border'}`}
                                                                >
                                                                    <EditIcon size={14} />
                                                                </button>
                                                            ) : null}
                                                            <button
                                                                disabled={isMarketplaceLocked}
                                                                onClick={() => removeItem(index)}
                                                                className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${isMarketplaceLocked ? 'text-gray-300 pointer-events-none' : 'text-brand-red hover:bg-red-50 dark:hover:bg-red-900/10'}`}
                                                            >
                                                                <TrashIcon size={14} />
                                                            </button>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-4 mt-2">
                                                        <div className="flex items-center gap-1.5 shrink-0">
                                                            <QuantitySelector
                                                                value={item.quantity}
                                                                disabled={isMarketplaceLocked}
                                                                onChange={(val) => updateItemQty(index, val)}
                                                                size="sm"
                                                            />
                                                            {!item.isService && !item.isManual && Boolean(item.productId) && Number(item.stock || 0) <= 0 && (
                                                                <Tooltip text="Produto sem estoque disponível no momento">
                                                                    <Badge
                                                                        variant="orange"
                                                                        icon={<Package size={12} />}
                                                                        className="shrink-0"
                                                                    />
                                                                </Tooltip>
                                                            )}
                                                        </div>
                                                        <div className="flex-1 max-w-[140px]">
                                                            <MoneyInput
                                                                name={`item-price-mobile-general-${index}`}
                                                                disabled={isMarketplaceLocked}
                                                                value={item.unitPrice}
                                                                onChange={(val: number) => {
                                                                    updateItemPrice(index, val)
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
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            ) : (
                                <div className="w-full flex-col flex items-center justify-center py-6">
                                    <IconPlaceholder
                                        icon={SearchIcon}
                                        title="Nenhum produto adicionado"
                                        subtitle="Busque produtos no campo acima ou cadastre um item avulso manualmente."
                                        itemButton={isMarketplaceLocked ? undefined : {
                                            text: "Adicionar item manual",
                                            action: addBlankItem,
                                            variant: "outline",
                                        }}
                                    />
                                </div>
                            )}

                            {items.length > 0 && !isMarketplaceLocked && (
                                <Button
                                    variant="link"
                                    onClick={addBlankItem}
                                    className="p-0 h-auto"
                                >
                                    <PlusIcon size={14} strokeWidth={3} />
                                    Adicionar item manual
                                </Button>
                            )}

                            <div className="mt-2">
                                <Pagination
                                    currentPage={currentPage}
                                    totalPages={totalPages}
                                    onPageChange={(page) => setCurrentPage(page)}
                                />
                            </div>
                        </div>
                    )}
                </FormSection>

                {/* 3. Configurações do Pedido (Mobile) */}
                <FormSection title="Configurações do Pedido" hasSeparator>
                    {isPaidOrder ? (
                        <div className="space-y-4 text-left">
                            <PaymentRow label="Data do Pedido" value={<span className="text-brand-dark dark:text-dark-heading font-bold text-sm">{formatDateString(orderDate)}</span>} />
                            <PaymentRow label="Origem da Venda" value={<span className="text-brand-dark dark:text-dark-heading font-bold text-sm">{salesChannel}</span>} />
                            {!hasOnlyServices && (
                                <PaymentRow label="Método de Entrega" value={<span className="text-brand-dark dark:text-dark-heading font-bold text-sm">{deliveryMethod === "pickup" ? "Retirada pessoalmente" : "Entrega / Delivery"}</span>} />
                            )}
                            {!isQuickMode && (
                                <PaymentRow label="Conta de recebimento" value={<span className="text-brand-dark dark:text-dark-heading font-bold text-sm">{accountOptions.find(opt => opt.value === financeAccountId)?.label || "Não informado"}</span>} />
                            )}
                        </div>
                    ) : (
                        <div className="space-y-4 text-left">
                            <DatePicker
                                label="Data do Pedido"
                                disabled={isMarketplaceLocked}
                                value={orderDate}
                                onChange={(date) => {
                                    if (date) {
                                        const d = new Date(date)
                                        setOrderDate(formatLocalISODate(d))
                                    }
                                }}
                            />

                            <FormDropdown
                                label="Origem da Venda"
                                disabled={isMarketplaceLocked}
                                value={salesChannel}
                                setValue={(val: any) => setSalesChannel(val)}
                                options={salesChannelOptions}
                            />

                            {!hasOnlyServices && (
                                <FormDropdown
                                    label="Método de Entrega"
                                    disabled={isMarketplaceLocked && isPaidOrder}
                                    value={deliveryMethod}
                                    setValue={(val: any) => setDeliveryMethod(val)}
                                    options={deliveryMethodOptions}
                                />
                            )}

                            {!isQuickMode && (
                                <Combobox
                                    label="Conta de recebimento"
                                    disabled={isMarketplaceLocked && isPaidOrder}
                                    value={financeAccountId || undefined}
                                    dataField="financeAccountId"
                                    onChange={(val) => {
                                        setFinanceAccountId(val)
                                        if (setFieldErrors) {
                                            setFieldErrors((prev) => {
                                                const next = new Set(prev)
                                                next.delete("financeAccountId")
                                                return next
                                            })
                                        }
                                    }}
                                    options={accountOptions}
                                    actionItem={isMarketplaceLocked && isPaidOrder ? undefined : { label: "Criar conta", onClick: onCreateAccount }}
                                    error={fieldErrors?.has("financeAccountId")}
                                />
                            )}
                        </div>
                    )}
                </FormSection>

                {/* 4. Dados do Pagamento (Mobile) */}
                {isPaidOrder && (
                    <FormSection title="Pagamento" hasSeparator>
                        <div className="space-y-4 text-left">
                            <PaymentRow
                                label="Método de Pagamento"
                                value={
                                    <div className="flex items-center gap-2">
                                        <PaymentMethodIndicator label={paymentMethodLabel} provider={originalPaymentProvider} />
                                    </div>
                                }
                            />

                            {(() => {
                                const paidBreakdown = paymentBreakdown.filter((entry: any) => Number(entry.amountReceived ?? entry.amount ?? 0) > 0.009)
                                if (paidBreakdown.length <= 1 && !(paidBreakdown.length === 1 && Number(originalPaidAmount || 0) > 0.009 && remainingPaymentAmount > 0.009)) return null
                                return (
                                    <div className="md:col-span-2">
                                        <PaymentRow
                                            label="Valores por meio"
                                            value={
                                                <div className="flex flex-col gap-1">
                                                    {paidBreakdown.map((entry: any, index: number) => {
                                                        const received = Number(entry.amountReceived ?? entry.amount ?? 0)
                                                        const baseAmount = Number(entry.amount || 0)
                                                        const displayAmount = received > 0.009 ? received : baseAmount
                                                        return (
                                                            <span key={`${entry.method}-${index}`} className="text-brand-dark dark:text-dark-heading font-bold text-sm">
                                                                {formatPaymentMethodLabel(entry.method, null)}: {formatCurrency(displayAmount)}
                                                                {baseAmount > 0.009 && received > 0.009 && Math.abs(baseAmount - received) > 0.009
                                                                    ? <span className="text-brand-muted font-normal"> (de {formatCurrency(baseAmount)})</span>
                                                                    : null}
                                                            </span>
                                                        )
                                                    })}
                                                </div>
                                            }
                                        />
                                    </div>
                                )
                            })()}

                            <PaymentRow label="Valor Original" value={<span className="text-brand-dark dark:text-dark-heading font-bold text-sm">{formatCurrency(subtotal)}</span>} />

                            {!isQuickMode && (
                                <PaymentRow label="Conta de recebimento" value={<span className="text-brand-dark dark:text-dark-heading font-bold text-sm">{accountOptions.find(opt => opt.value === financeAccountId)?.label || "Não informado"}</span>} />
                            )}

                            {(Number(shippingFee || 0) > 0 || originalDeliveryPayer === "seller" || Number(originalDeliverySubsidy || 0) > 0) && (
                                <PaymentRow
                                    label="Valor da Entrega"
                                    value={
                                        (originalDeliveryPayer === "seller" || Number(originalDeliverySubsidy || 0) > 0) ? (
                                            <div className="text-right">
                                                <span className="text-brand-dark dark:text-dark-heading font-bold text-sm">
                                                    {formatCurrency(Number(originalDeliverySubsidy || shippingFee || 0))}
                                                </span>
                                                <span className="text-brand-orange"> - Subsidiado pela loja</span>
                                            </div>
                                        ) : (
                                            <span className="text-brand-dark dark:text-dark-heading font-bold text-sm">{formatCurrency(shippingFee)}</span>
                                        )
                                    }
                                />
                            )}

                            {Number(otherCosts || 0) > 0 && (
                                <PaymentRow
                                    label="Outros Custos"
                                    value={<span className="text-brand-dark dark:text-dark-heading font-bold text-sm">{formatCurrency(otherCosts)}</span>}
                                />
                            )}

                            {Number(discountAmount || 0) > 0 && (
                                <PaymentRow
                                    label="Desconto do Pedido"
                                    value={<span className="text-brand-green font-bold">- {formatCurrency(discountAmount)}</span>}
                                />
                            )}

                            {couponDiscountAmount > 0 && (
                                <PaymentRow
                                    label="Desconto por Cupom"
                                    value={<span className="text-brand-green font-bold">- {formatCurrency(couponDiscountAmount)}</span>}
                                />
                            )}

                            {paymentMethodDiscountAmount > 0 && (
                                <PaymentRow
                                    label={
                                        originalPaymentMethod === "exchange" ? "Crédito de troca" :
                                            originalPaymentMethod === "store_credit" ? "Vale-compra" :
                                                "Desconto do Método"
                                    }
                                    value={<span className="text-brand-green font-bold">- {formatCurrency(paymentMethodDiscountAmount)}</span>}
                                />
                            )}

                            {effectivePaymentMethodExtraAmount > 0 && (
                                <PaymentRow
                                    label="Taxa do Método"
                                    value={<span className="text-brand-dark dark:text-dark-heading font-bold text-sm">+ {formatCurrency(effectivePaymentMethodExtraAmount)}</span>}
                                />
                            )}

                            <div className="md:col-span-2 flex justify-between items-center pt-4 border-t border-brand-border dark:border-dark-border mt-3">
                                <span className="text-md lg:text-xl font-medium text-brand-dark dark:text-dark-heading">Total do Pedido</span>
                                <span className="font-bold text-2xl text-brand-dark dark:text-dark-heading tracking-tight">{formatCurrency(totalAmount)}</span>
                            </div>
                        </div>
                    </FormSection>
                )}
            </div>
        </FadeIn>
    )
}
