"use client"

import React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { FadeIn } from "@/components/animations/FadeIn"
import {
    Input, Button, FormDropdown, FormCurrencyInput,
    CustomerCard, IconPlaceholder, DatePicker
} from "@/components/reusable"
import {
    SearchIcon, PlusIcon, TagIcon, TrashIcon,
    CheckIcon, EditIcon, ClockIcon, UserIcon
} from "@/lib/icons"
import QuantitySelector from "@/components/reusable/QuantitySelector"

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
    handleSearchProduct: (term: string) => void
    addProductToOrder: (product: any) => void
    updateItemField: (index: number, field: string, value: any) => void
    updateItemPrice: (index: number, price: number) => void
    updateItemQty: (index: number, qty: number) => void
    toggleItemEdit: (index: number, isEditing: boolean) => void
    removeItem: (index: number) => void
    addBlankItem: () => void
    setShippingFee: (val: string) => void
    setOtherCosts: (val: string) => void
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
}

export const OrderGeneralTab: React.FC<OrderGeneralTabProps> = ({
    items, searchQuery, isProductSearchOpen, isSearching, searchResults,
    subtotal, discountAmount, shippingFee, otherCosts, totalAmount,
    selectedCustomer, orderDate, salesChannel, deliveryMethod, paymentStatus, deliveryStatus, isSaving,
    setSearchQuery, setIsProductSearchOpen, handleSearchProduct, addProductToOrder,
    updateItemField, updateItemPrice, updateItemQty, toggleItemEdit, removeItem, addBlankItem,
    setShippingFee, setOtherCosts, setSelectedCustomer, setIsCustomerSheetOpen,
    setOrderDate, setSalesChannel, setDeliveryMethod, setPaymentStatus, setDeliveryStatus, handleSaveOrder,
    salesChannelOptions, deliveryMethodOptions, statusOptions, deliveryStatusOptions
}) => {
    return (
        <FadeIn>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-8 flex flex-col gap-8">
                    {/* 1. PRODUCT SEARCH & TABLE */}
                    <section>
                        <h3 className="font-bold text-lg text-brand-dark dark:text-dark-heading mb-6 flex items-center gap-2">
                            Itens do Pedido
                        </h3>

                        <div className="relative mb-6">
                            <Input
                                label=""
                                name="productSearch"
                                placeholder="Buscar produtos para adicionar..."
                                prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
                                value={searchQuery}
                                onChange={(e: any) => {
                                    setSearchQuery(e.target.value);
                                    setIsProductSearchOpen(true);
                                    handleSearchProduct(e.target.value);
                                }}
                                onFocus={() => setIsProductSearchOpen(true)}
                                className="mb-0"
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
                                            <div className="p-4 text-center text-sm text-brand-inactive-text">Buscando produtos...</div>
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
                                                    <img src={product.image} className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 object-cover border border-brand-border dark:border-dark-border" />
                                                    <div className="flex-1">
                                                        <div className="text-sm font-bold text-brand-dark dark:text-dark-heading">{product.name}</div>
                                                        <div className="text-xs text-brand-inactive-text dark:text-dark-body">SKU: {product.sku}</div>
                                                    </div>
                                                    <div className="text-sm font-bold text-brand-dark dark:text-dark-heading">R$ {product.price}</div>
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
                                    {items.map((item, index) => (
                                        <tr key={index} className="group hover:bg-brand-gray/20 dark:hover:bg-dark-border/10 transition-colors">
                                            <td className="py-4 pl-6 pr-4 border-b border-brand-border dark:border-dark-border">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border flex-shrink-0 overflow-hidden flex items-center justify-center">
                                                        {item.image ? (
                                                            <img src={item.image} className="w-full h-full object-cover" alt="" />
                                                        ) : (
                                                            <span className="text-xs font-bold text-brand-inactive-text">P</span>
                                                        )}
                                                    </div>
                                                    <div className="flex flex-col text-left flex-1 min-w-0">
                                                        {item.isEditing ? (
                                                            <input
                                                                type="text"
                                                                value={item.name}
                                                                onChange={(e) => updateItemField(index, 'name', e.target.value)}
                                                                placeholder="Nome do produto..."
                                                                className="w-full h-8 px-2 rounded-lg border border-brand-border bg-white dark:bg-dark-background font-bold text-[13px] focus:ring-1 focus:ring-brand-primary outline-none transition-all mb-1"
                                                            />
                                                        ) : (
                                                            <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading mb-0.5 truncate max-w-[250px]">
                                                                {item.name || 'Produto sem nome'}
                                                            </span>
                                                        )}
                                                        <span className="text-[11px] font-medium text-brand-inactive-text dark:text-dark-body truncate">
                                                            {item.sku || 'Sem SKU'}
                                                        </span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border">
                                                <div className="flex items-center">
                                                    <span className="text-[13px] font-medium text-brand-inactive-text mr-1">R$</span>
                                                    <input
                                                        type="number"
                                                        value={item.unitPrice}
                                                        onChange={(e) => updateItemPrice(index, parseFloat(e.target.value) || 0)}
                                                        className="w-full h-9 px-2 rounded-lg border border-brand-border bg-white dark:bg-dark-background font-bold text-[13px] focus:ring-1 focus:ring-brand-primary outline-none transition-all"
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
                                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.unitPrice * item.quantity)}
                                                </span>
                                            </td>
                                            <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border">
                                                <div className="flex justify-center gap-2">
                                                    {item.isEditing ? (
                                                        <button
                                                            onClick={() => toggleItemEdit(index, false)}
                                                            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-green-50 dark:hover:bg-green-900/10 text-green-600 transition-colors"
                                                            title="Salvar nome"
                                                        >
                                                            <CheckIcon size={18} />
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={() => toggleItemEdit(index, true)}
                                                            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-brand-gray dark:hover:bg-dark-border text-brand-inactive-text hover:text-brand-dark transition-colors"
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
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* --- ITEMS LIST (Mobile/Tablet) --- */}
                        <div className="block md:hidden space-y-2 mb-6">
                            {items.map((item, index) => (
                                <div key={index} className="flex items-center gap-4 py-4 border-b border-brand-border dark:border-dark-border last:border-0">
                                    <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border flex-shrink-0 overflow-hidden flex items-center justify-center">
                                        {item.image ? (
                                            <img src={item.image} className="w-full h-full object-cover" alt="" />
                                        ) : (
                                            <span className="text-xs font-bold text-brand-inactive-text">P</span>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-start mb-0.5">
                                            {item.isEditing ? (
                                                <input
                                                    type="text"
                                                    value={item.name}
                                                    onChange={(e) => updateItemField(index, 'name', e.target.value)}
                                                    placeholder="Nome do produto..."
                                                    className="flex-1 h-8 px-2 rounded-lg border border-brand-border bg-white dark:bg-dark-background font-bold text-[13px] focus:ring-1 focus:ring-brand-primary outline-none transition-all mr-2"
                                                />
                                            ) : (
                                                <h4 className="font-bold text-[13px] text-brand-dark dark:text-dark-heading truncate pr-2">
                                                    {item.name || 'Produto sem nome'}
                                                </h4>
                                            )}
                                            <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading flex-shrink-0">
                                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.unitPrice * item.quantity)}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <p className="text-[11px] font-medium text-brand-inactive-text pr-2 truncate">
                                                {item.sku || 'Sem SKU'} • {item.quantity} un • {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.unitPrice)}
                                            </p>
                                            <div className="flex items-center gap-1">
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
                                            <div className="flex items-center flex-1 max-w-[120px]">
                                                <span className="text-[11px] font-medium text-brand-inactive-text mr-1">R$</span>
                                                <input
                                                    type="number"
                                                    value={item.unitPrice}
                                                    onChange={(e) => updateItemPrice(index, parseFloat(e.target.value) || 0)}
                                                    className="w-full h-8 px-2 rounded-lg border border-brand-border bg-white dark:bg-dark-background font-bold text-[11px] focus:ring-1 focus:ring-brand-primary outline-none"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Add Item Link */}
                        <button
                            type="button"
                            className="text-sm font-bold text-brand-dark dark:text-dark-heading underline decoration-brand-border dark:decoration-dark-border underline-offset-4 hover:opacity-80 transition-opacity flex items-center gap-1 mb-8"
                            onClick={addBlankItem}
                        >
                            <PlusIcon size={14} strokeWidth={3} />
                            Adicionar item manual
                        </button>
                    </section>

                    <div className="h-px bg-brand-border dark:bg-dark-border w-full my-4" />

                    <section className="flex flex-col gap-6">
                        <h2 className="text-lg font-bold text-brand-dark dark:text-dark-heading flex items-center gap-2">
                            Pagamento
                        </h2>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormCurrencyInput
                                label="Frete"
                                value={parseFloat(shippingFee)}
                                onChange={(val) => setShippingFee(val.toString())}
                            />
                            <FormCurrencyInput
                                label="Outros Custos"
                                value={parseFloat(otherCosts)}
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
                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(subtotal)}
                                </span>
                            </div>
                            <div className="flex justify-between items-center text-[15px]">
                                <span className="text-brand-inactive-text font-medium">Desconto</span>
                                <span className="font-bold text-brand-red">
                                    -{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(discountAmount)}
                                </span>
                            </div>

                            <div className="border-t border-dashed border-brand-border dark:border-dark-border pt-4 mt-2">
                                <div className="flex justify-between items-end">
                                    <span className="text-xl font-bold text-brand-dark dark:text-dark-heading tracking-tight">Total a Pagar</span>
                                    <span className="text-[32px] font-bold text-brand-dark dark:text-dark-heading leading-none tracking-tighter">
                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalAmount)}
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

                <div className="lg:col-span-4 flex flex-col gap-8">
                    {/* --- 1. CUSTOMER CARD --- */}
                    <div>
                        {selectedCustomer ? (
                            <CustomerCard
                                customer={selectedCustomer}
                                onRemove={() => setSelectedCustomer(null)}
                            />
                        ) : (
                            <div
                                className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-8 flex flex-col items-center justify-center text-center relative overflow-hidden"
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
