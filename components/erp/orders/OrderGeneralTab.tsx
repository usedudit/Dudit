"use client"

import React, { useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { FadeIn } from "@/components/animations/FadeIn"
import {
    Input, Button, FormDropdown,
    CustomerCard, IconPlaceholder, DatePicker, Pagination,
    ThreeDotsLoader,
    MoneyInput
} from "@/components/reusable"
import {
    SearchIcon, PlusIcon, TagIcon, TrashIcon,
    CheckCircleIcon, EditIcon, UserIcon
} from "@/lib/icons"
import QuantitySelector from "@/components/reusable/QuantitySelector"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { formatCurrency } from "@/lib/utils"

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
    discountType: 'fixed' | 'percentage'
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
    isSaving: boolean

    // Handlers
    setSearchQuery: (val: string) => void
    setIsProductSearchOpen: (val: boolean) => void
    handleSearchProduct?: (term: string) => void  // deprecated, kept for compat
    onSearchFocus?: () => void
    addProductToOrder: (product: any) => void
    updateItemField: (index: number, field: string, value: any) => void
    updateItemPrice: (index: number, price: number) => void
    updateItemQty: (index: number, qty: number) => void
    toggleItemEdit: (index: number, isEditing: boolean) => void
    removeItem: (index: number) => void
    addBlankItem: () => void
    setShippingFee: (val: string) => void
    setOtherCosts: (val: string) => void
    setDiscountValue: (val: number) => void
    setDiscountType: (val: 'fixed' | 'percentage') => void
    setSelectedCustomer: (val: any) => void
    setIsCustomerSheetOpen: (val: boolean) => void
    setOrderDate: (val: string) => void
    setSalesChannel: (val: string) => void
    setDeliveryMethod: (val: any) => void
    setPaymentStatus: (val: any) => void
    setDeliveryStatus: (val: string) => void
    handleSaveOrder: () => void

    // Options
    salesChannelOptions: any[]
    deliveryMethodOptions: any[]
    statusOptions: any[]
    deliveryStatusOptions: any[]

    fieldErrors?: Set<string>
    setFieldErrors?: React.Dispatch<React.SetStateAction<Set<string>>>
}

export const OrderGeneralTab: React.FC<OrderGeneralTabProps> = ({
    items, searchQuery, isProductSearchOpen, isSearching, searchResults,
    subtotal, discountAmount, discountValue, discountType, shippingFee, otherCosts, totalAmount,
    selectedCustomer, orderDate, salesChannel, deliveryMethod, paymentStatus, deliveryStatus, isSaving,
    setSearchQuery, setIsProductSearchOpen, handleSearchProduct, onSearchFocus, addProductToOrder,
    updateItemField, updateItemPrice, updateItemQty, toggleItemEdit, removeItem, addBlankItem,
    setShippingFee, setOtherCosts, setDiscountValue, setDiscountType, setSelectedCustomer, setIsCustomerSheetOpen,
    setOrderDate, setSalesChannel, setDeliveryMethod, setPaymentStatus, setDeliveryStatus, handleSaveOrder,
    salesChannelOptions, deliveryMethodOptions, statusOptions, deliveryStatusOptions,
    fieldErrors, setFieldErrors
}) => {
    const searchRef = useRef<HTMLDivElement>(null);
    const ITEMS_PER_PAGE = 8;
    const [currentPage, setCurrentPage] = React.useState(1);
    const [nameErrors, setNameErrors] = React.useState<Record<number, boolean>>({});

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

    return (
        <FadeIn>
            <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
                <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12">
                    {/* 1. PRODUCT SEARCH & TABLE */}
                    <section>
                        <h3 className="font-bold text-lg text-brand-dark dark:text-dark-heading mb-6 flex items-center gap-2">
                            Itens do Pedido
                        </h3>

                        <div ref={searchRef} className="relative mb-6">
                            <Input
                                label=""
                                name="productSearch"
                                placeholder="Buscar produtos para adicionar..."
                                prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
                                value={searchQuery}
                                onChange={(e: any) => {
                                    setSearchQuery(e.target.value);
                                    setIsProductSearchOpen(true);
                                    // Legacy support: if handleSearchProduct is provided, call it
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
                                        className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl shadow-xl z-[60] max-h-60 overflow-y-auto custom-scrollbar"
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
                                                    className="flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-dark-border cursor-pointer border-b border-brand-border dark:border-dark-border last:border-0"
                                                >
                                                    <img src={getR2ImageUrl(product.image, "thumbnail")} className={`w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border border border-brand-border dark:border-dark-border ${!product.image ? 'object-contain' : 'object-cover'}`} />
                                                    <div className="flex-1">
                                                        <div className="text-sm font-bold text-brand-dark dark:text-dark-heading">{product.name}</div>
                                                        <div className="text-xs text-brand-inactive-text dark:text-dark-body">SKU: {product.sku}</div>
                                                    </div>
                                                    <div className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                        {formatCurrency(product.price)}
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
                                            return (
                                                <tr key={index} className="group hover:bg-brand-gray/20 dark:hover:bg-dark-border/10 transition-colors">
                                                    <td className="py-4 pl-6 pr-4 border-b border-brand-border dark:border-dark-border">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border flex-shrink-0 overflow-hidden flex items-center justify-center">
                                                                <img src={getR2ImageUrl(item.image, "thumbnail")} className={`w-full h-full ${!item.image ? 'object-contain p-1.5' : 'object-cover'}`} alt="" />
                                                            </div>
                                                            <div className="flex flex-col text-left flex-1 min-w-0">
                                                                {item.isEditing ? (
                                                                    <div className="mb-0">
                                                                        <Input
                                                                            name={`item-name-${index}`}
                                                                            value={item.name}
                                                                            onChange={(e: any) => {
                                                                                updateItemField(index, 'name', e.target.value);
                                                                                if (nameErrors[index]) {
                                                                                    setNameErrors(prev => ({ ...prev, [index]: false }));
                                                                                }
                                                                            }}
                                                                            placeholder="Nome do produto..."
                                                                            error={nameErrors[index]}
                                                                            errorMessage="Nome obrigatório"
                                                                            className="mb-0"
                                                                        />
                                                                    </div>
                                                                ) : (
                                                                    <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading mb-0.5 truncate max-w-[250px]">
                                                                        {item.name || 'Produto sem nome'}
                                                                    </span>
                                                                )}
                                                                <span className="text-[11px] font-medium text-brand-inactive-text dark:text-dark-body truncate">
                                                                    {item.isEditing ? (item.sku || '') : (item.sku || 'Sem SKU')}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border">
                                                        <div className="w-[140px]">
                                                            <MoneyInput
                                                                name={`item-price-${index}`}
                                                                value={item.unitPrice}
                                                                onChange={(e: any) => updateItemPrice(index, parseFloat(e.target.value) || 0)}
                                                                className="mb-0"
                                                            />
                                                        </div>
                                                    </td>
                                                    <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border">
                                                        <div className="flex justify-center">
                                                            <QuantitySelector value={item.quantity} onChange={(val) => updateItemQty(index, val)} size="sm" />
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
                                                                        } else {
                                                                            toggleItemEdit(index, false);
                                                                        }
                                                                    }}
                                                                    className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-green-50 dark:hover:bg-green-900/10 text-brand-green transition-colors"
                                                                    title="Salvar nome"
                                                                >
                                                                    <CheckCircleIcon size={18} />
                                                                </button>
                                                            ) : (
                                                                <button
                                                                    onClick={() => toggleItemEdit(index, true)}
                                                                    className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-brand-gray dark:hover:bg-dark-border text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                                    title="Editar nome"
                                                                >
                                                                    <EditIcon size={18} />
                                                                </button>
                                                            )}
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
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* --- ITEMS LIST (Mobile/Tablet) --- */}
                        {items.length > 0 && (
                            <div className="block md:hidden space-y-2 mb-6">
                                {paginatedItems.map((item, paginatedIndex) => {
                                    const index = (currentPage - 1) * ITEMS_PER_PAGE + paginatedIndex;
                                    return (
                                        <div key={index} className="flex items-center gap-4 py-4 border-b border-brand-border dark:border-dark-border last:border-0">
                                            <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border flex-shrink-0 overflow-hidden flex items-center justify-center">
                                                <img src={getR2ImageUrl(item.image, "thumbnail")} className={`w-full h-full ${!item.image ? 'object-contain p-1.5' : 'object-cover'}`} alt="" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex justify-between items-start mb-0.5">
                                                    {item.isEditing ? (
                                                        <div className="flex-1 mr-2">
                                                            <Input
                                                                name={`item-name-mobile-${index}`}
                                                                value={item.name}
                                                                onChange={(e: any) => {
                                                                    updateItemField(index, 'name', e.target.value);
                                                                    if (nameErrors[index]) {
                                                                        setNameErrors(prev => ({ ...prev, [index]: false }));
                                                                    }
                                                                }}
                                                                placeholder="Nome do produto..."
                                                                error={nameErrors[index]}
                                                                errorMessage="Nome obrigatório"
                                                                className="mb-0"
                                                            />
                                                        </div>
                                                    ) : (
                                                        <h4 className="font-bold text-[13px] text-brand-dark dark:text-dark-heading truncate pr-2">
                                                            {item.name || 'Produto sem nome'}
                                                        </h4>
                                                    )}
                                                    <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading flex-shrink-0">
                                                        {formatCurrency(item.unitPrice * item.quantity)}
                                                    </span>
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <p className="text-[11px] font-medium text-brand-inactive-text pr-2 truncate">
                                                        {item.isEditing ? (item.sku ? `${item.sku} • ` : '') : `${item.sku || 'Sem SKU'} • `}{item.quantity} un • {formatCurrency(item.unitPrice)}
                                                    </p>
                                                    <div className="flex items-center gap-1">
                                                        {item.isEditing ? (
                                                            <button
                                                                onClick={() => {
                                                                    if (!item.name || item.name.trim() === '') {
                                                                        setNameErrors(prev => ({ ...prev, [index]: true }));
                                                                    } else {
                                                                        toggleItemEdit(index, false);
                                                                    }
                                                                }}
                                                                className="w-8 h-8 flex items-center justify-center text-green-600 hover:bg-green-50 dark:hover:bg-green-900/10 rounded-full transition-colors"
                                                            >
                                                                <CheckCircleIcon size={14} />
                                                            </button>
                                                        ) : (
                                                            <button
                                                                onClick={() => toggleItemEdit(index, true)}
                                                                className="w-8 h-8 flex items-center justify-center text-brand-inactive-text hover:bg-brand-gray dark:hover:bg-dark-border rounded-full transition-colors"
                                                            >
                                                                <EditIcon size={14} />
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => removeItem(index)}
                                                            className="w-8 h-8 flex items-center justify-center text-brand-red hover:bg-red-50 dark:hover:bg-red-900/10 rounded-full transition-colors"
                                                        >
                                                            <TrashIcon size={14} />
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-4 mt-2">
                                                    <QuantitySelector value={item.quantity} onChange={(val) => updateItemQty(index, val)} size="sm" />
                                                    <div className="flex-1 max-w-[140px]">
                                                        <Input
                                                            name={`item-price-mobile-${index}`}
                                                            type="number"
                                                            prefix="R$"
                                                            value={item.unitPrice}
                                                            onChange={(e: any) => updateItemPrice(index, parseFloat(e.target.value) || 0)}
                                                            className="mb-0"
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
                                    itemButton={{
                                        text: "Adicionar item manual",
                                        action: addBlankItem,
                                        variant: "outline",
                                    }}
                                />
                            </div>
                        )}

                        {/* Add Item Link */}
                        {items.length > 0 && (
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
                    </section>

                    <div className="h-px bg-brand-border dark:bg-dark-border w-full my-4" />

                    <section className="flex flex-col gap-6">
                        <h2 className="text-lg font-bold text-brand-dark dark:text-dark-heading flex items-center gap-2">
                            Pagamento
                        </h2>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="relative">
                                <MoneyInput
                                    label="Desconto"
                                    value={discountValue}
                                    onChange={(val) => setDiscountValue(val)}
                                    prefix={discountType === 'fixed' ? "R$" : ""}
                                    suffix={discountType === 'percentage' ? "%" : ""}
                                />
                                <div className="absolute top-0 right-0 flex gap-1 mt-1">
                                    <button
                                        onClick={() => setDiscountType('fixed')}
                                        className={`text-[10px] px-1.5 py-0.5 rounded ${discountType === 'fixed' ? 'bg-brand-dark text-white' : 'bg-gray-100 text-gray-400'}`}
                                    >
                                        $
                                    </button>
                                    <button
                                        onClick={() => setDiscountType('percentage')}
                                        className={`text-[10px] px-1.5 py-0.5 rounded ${discountType === 'percentage' ? 'bg-brand-dark text-white' : 'bg-gray-100 text-gray-400'}`}
                                    >
                                        %
                                    </button>
                                </div>
                            </div>
                            <MoneyInput
                                label="Frete"
                                value={parseFloat(shippingFee || "0")}
                                onChange={(val) => setShippingFee(val.toString())}
                            />
                            <MoneyInput
                                label="Outros Custos"
                                value={parseFloat(otherCosts || "0")}
                                onChange={(val) => setOtherCosts(val.toString())}
                            />
                        </div>

                        <div className="p-3 bg-brand-gray/30 dark:bg-dark-border/30 border border-brand-border dark:border-dark-border rounded-xl flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-brand-dark dark:bg-dark-heading flex items-center justify-center text-white flex-shrink-0">
                                <TagIcon size={18} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">Adicionar Promoção</span>
                                </div>
                            </div>
                            <Button className="h-9 px-6">
                                Adicionar
                            </Button>
                        </div>

                        <div className="flex flex-col gap-3 mt-4">
                            <div className="flex justify-between items-center text-[15px]">
                                <span className="text-brand-inactive-text font-medium">Subtotal</span>
                                <span className="font-bold text-brand-dark dark:text-dark-heading">
                                    {formatCurrency(subtotal)}
                                </span>
                            </div>

                            {discountAmount > 0 && (
                                <div className="flex justify-between items-center text-[15px]">
                                    <span className="text-brand-inactive-text font-medium">Desconto</span>
                                    <span className="font-bold text-brand-red">
                                        -{formatCurrency(discountAmount)}
                                    </span>
                                </div>
                            )}

                            {parseFloat(shippingFee || "0") > 0 && (
                                <div className="flex justify-between items-center text-[15px]">
                                    <span className="text-brand-inactive-text font-medium">Frete</span>
                                    <span className="font-bold text-brand-dark dark:text-dark-heading">
                                        {formatCurrency(shippingFee)}
                                    </span>
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
                                    <span className="text-[32px] font-bold text-brand-dark dark:text-dark-heading leading-none tracking-tighter">
                                        {formatCurrency(totalAmount)}
                                    </span>
                                </div>
                            </div>

                            <Button
                                size="lg"
                                className="w-full mt-6"
                                onClick={handleSaveOrder}
                                disabled={isSaving}
                            >
                                Ir para Pagamento
                            </Button>
                        </div>
                    </section>
                </div>

                <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 border-l-0 lg:border-l border-brand-border dark:border-dark-border mt-8 lg:mt-0">
                    {/* --- 1. CUSTOMER CARD --- */}
                    <div>
                        {selectedCustomer ? (
                            <CustomerCard
                                customer={selectedCustomer}
                                address={selectedCustomer.addresses?.find((a: any) => a.address_type === "primary" || a.is_default) || selectedCustomer.addresses?.[0]}
                                billingAddress={selectedCustomer.addresses?.find((a: any) => a.address_type === "billing")}
                                onRemove={() => setSelectedCustomer(null)}
                            />
                        ) : (
                            <div
                                className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-8 flex flex-col items-center justify-center text-center relative overflow-hidden mb-6"
                                onClick={() => setIsCustomerSheetOpen(true)}
                            >
                                <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border"></div>

                                <IconPlaceholder
                                    icon={UserIcon}
                                    title="Nenhum cliente selecionado"
                                    subtitle="Selecione um cliente para vincular ao pedido."
                                    itemButton={{
                                        text: "Selecionar Cliente",
                                        action: () => setIsCustomerSheetOpen(true),
                                        variant: "outline",
                                        className: "rounded-full px-8"
                                    }}
                                />
                            </div>
                        )}
                    </div>

                    {/* --- 2. ORDER SETTINGS --- */}
                    <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-6 flex flex-col gap-6">
                        <h3 className="font-bold text-lg text-brand-dark dark:text-dark-heading leading-tight">Configurações do Pedido</h3>

                        <div className="space-y-4">
                            <DatePicker
                                label="Data do Pedido"
                                value={orderDate}
                                onChange={(date) => {
                                    if (date) {
                                        // Adjust for timezone when converting to ISO string
                                        const d = new Date(date);
                                        setOrderDate(d.toISOString().split('T')[0]);
                                    }
                                }}
                            />

                            <FormDropdown
                                label="Canal de Venda"
                                value={salesChannel}
                                setValue={(val: any) => setSalesChannel(val)}
                                options={salesChannelOptions}
                            />

                            <FormDropdown
                                label="Método de Entrega"
                                value={deliveryMethod}
                                setValue={(val: any) => setDeliveryMethod(val)}
                                options={deliveryMethodOptions}
                            />

                            <FormDropdown
                                label="Status de Pagamento"
                                value={paymentStatus}
                                setValue={(val: any) => setPaymentStatus(val)}
                                options={statusOptions}
                            />

                            <FormDropdown
                                label="Status de Entrega"
                                value={deliveryStatus}
                                setValue={(val: any) => setDeliveryStatus(val)}
                                options={deliveryStatusOptions}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </FadeIn>
    )
}
