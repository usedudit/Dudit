import React from 'react';
import {
    SearchIcon,
    TrashIcon,
    UserIcon,
    ChevronDownIcon,
    WandIcon,
    PlusIcon,
    CheckIcon,
    AlertCircleIcon,
    ClockIcon,
    CheckCircleIcon,
    EditIcon
} from '@/lib/icons';
import { motion, AnimatePresence } from 'framer-motion';
import QuantitySelector from '@/components/reusable/QuantitySelector';
import { Button, Input as FormInput, Dropdown, DropdownItem, TabsContent, FormCurrencyInput, FormDropdown, MoneyInput, PercentageInput, DatePicker } from '@/components/reusable';
import IconPlaceholder from '@/components/reusable/IconPlaceholder';

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

    // Layout Props
    primaryColor: string;
    setPrimaryColor: (val: string) => void;
    secondaryColor: string;
    setSecondaryColor: (val: string) => void;
    quoteTitle: string;
    setQuoteTitle: (val: string) => void;
    quoteSubtitle: string;
    setQuoteSubtitle: (val: string) => void;
    isReadOnly?: boolean;
}

const QuoteEditor = (props: QuoteEditorProps) => {
    const statusOptions = [
        { value: 'draft', label: 'Rascunho', icon: ClockIcon, color: 'text-gray-500' },
        { value: 'pending', label: 'Pendente', icon: ClockIcon, color: 'text-amber-500' },
        { value: 'approved', label: 'Aprovado', icon: CheckCircleIcon, color: 'text-green-500' },
        { value: 'rejected', label: 'Recusado', icon: AlertCircleIcon, color: 'text-red-500' },
        { value: 'expired', label: 'Expirado', icon: AlertCircleIcon, color: 'text-brand-inactive-text' },
    ];

    const currentStatus = statusOptions.find(o => o.value === props.status) || statusOptions[0];

    return (
        <div className="p-6 md:p-8 pt-4">
            <TabsContent value="Dados Gerais" className="mt-0 focus-visible:outline-none">
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>

                    {/* 1. PRODUCT SEARCH & TABLE */}
                    <div className="mb-8">
                        <h3 className="font-bold text-lg text-brand-dark dark:text-dark-heading mb-6">Itens da Proposta</h3>

                        <div className="relative mb-6">
                            {!props.isReadOnly && (
                                <FormInput
                                    label=""
                                    name="productSearch"
                                    placeholder="Buscar produtos para adicionar..."
                                    prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
                                    value={props.searchQuery}
                                    onChange={(e) => {
                                        props.setSearchQuery(e.target.value);
                                        props.setIsProductSearchOpen(true);
                                    }}
                                    onFocus={() => props.setIsProductSearchOpen(true)}
                                    className="mb-0"
                                />
                            )}

                            <AnimatePresence>
                                {props.isProductSearchOpen && props.searchQuery && !props.isReadOnly && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 5 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: 5 }}
                                        className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl shadow-xl z-20 max-h-60 overflow-y-auto"
                                    >
                                        {props.isSearching ? (
                                            <div className="p-4 text-center text-sm text-brand-inactive-text">Buscando produtos...</div>
                                        ) : props.filteredProducts.length > 0 ? (
                                            props.filteredProducts.map(product => (
                                                <div
                                                    key={product.id}
                                                    onClick={() => props.handleProductClick(product)}
                                                    className="flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-dark-border cursor-pointer border-b border-brand-border dark:border-dark-border last:border-0"
                                                >
                                                    <img src={product.image} className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 object-cover border border-brand-border dark:border-dark-border" />
                                                    <div className="flex-1">
                                                        <div className="text-sm font-bold text-brand-dark dark:text-dark-heading">{product.name}</div>
                                                        <div className="text-xs text-brand-inactive-text dark:text-dark-body">SKU: {product.sku}</div>
                                                    </div>
                                                    <div className="text-sm font-bold text-brand-dark dark:text-dark-heading">R$ {product.price}</div>
                                                    {product.variants && product.variants.length > 0 && (
                                                        <div className="px-2 py-0.5 bg-gray-100 dark:bg-zinc-700 text-[10px] font-bold rounded text-brand-inactive-text uppercase">
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
                        <div className="hidden md:block w-full overflow-x-auto pb-4 custom-scrollbar mb-4">
                            <table className="w-full text-left border-separate border-spacing-0">
                                <thead>
                                    <tr className="bg-brand-gray dark:bg-dark-border/50">
                                        <th className="py-3 pl-6 pr-4 text-[13px] font-medium text-gray-500 dark:text-dark-body rounded-l-lg">Produto</th>
                                        <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body w-44">Preço Unit.</th>
                                        <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body text-center w-36">Qtd.</th>
                                        <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body text-right w-36">Total</th>
                                        {!props.isReadOnly && <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body text-center w-24 rounded-r-lg">Ações</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {props.quoteItems.map((item, index) => (
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
                                                                onChange={(e) => props.updateItemField(index, 'name', e.target.value)}
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
                                                        value={item.price}
                                                        onChange={(e) => props.updateItemPrice(index, parseFloat(e.target.value) || 0)}
                                                        className="w-full h-9 px-2 rounded-lg border border-brand-border bg-white dark:bg-dark-background font-bold text-[13px] focus:ring-1 focus:ring-brand-primary outline-none transition-all"
                                                    />
                                                </div>
                                            </td>
                                            <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border">
                                                <div className="flex justify-center">
                                                    <QuantitySelector value={item.qty} onChange={(val) => props.updateItemQty(index, val)} size="sm" />
                                                </div>
                                            </td>
                                            <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border text-right">
                                                <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">
                                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.price * item.qty)}
                                                </span>
                                            </td>
                                            {!props.isReadOnly && (
                                                <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border">
                                                    <div className="flex justify-center gap-2">
                                                        {item.isEditing ? (
                                                            <button
                                                                onClick={() => props.toggleItemEdit(index, false)}
                                                                className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-green-50 dark:hover:bg-green-900/10 text-green-600 transition-colors"
                                                                title="Salvar nome"
                                                            >
                                                                <CheckIcon size={18} />
                                                            </button>
                                                        ) : (
                                                            <button
                                                                onClick={() => props.toggleItemEdit(index, true)}
                                                                className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-brand-gray dark:hover:bg-dark-border text-brand-inactive-text hover:text-brand-dark transition-colors"
                                                                title="Editar nome"
                                                            >
                                                                <EditIcon size={18} />
                                                            </button>
                                                        )}
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
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* --- ITEMS LIST (Mobile/Tablet) --- */}
                        <div className="block md:hidden space-y-2 mb-6">
                            {props.quoteItems.map((item, index) => (
                                <div key={index} className="flex items-center gap-4 py-4 border-b border-brand-border dark:border-dark-border last:border-0">
                                    {/* Left side: Avatar/Image */}
                                    <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border flex-shrink-0 overflow-hidden flex items-center justify-center">
                                        {item.image ? (
                                            <img src={item.image} className="w-full h-full object-cover" alt="" />
                                        ) : (
                                            <span className="text-xs font-bold text-brand-inactive-text">P</span>
                                        )}
                                    </div>

                                    {/* Middle: Content */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-start mb-0.5">
                                            {item.isEditing ? (
                                                <input
                                                    type="text"
                                                    value={item.name}
                                                    onChange={(e) => props.updateItemField(index, 'name', e.target.value)}
                                                    placeholder="Nome do produto..."
                                                    className="flex-1 h-8 px-2 rounded-lg border border-brand-border bg-white dark:bg-dark-background font-bold text-[13px] focus:ring-1 focus:ring-brand-primary outline-none transition-all mr-2"
                                                />
                                            ) : (
                                                <h4 className="font-bold text-[13px] text-brand-dark dark:text-dark-heading truncate pr-2">
                                                    {item.name || 'Produto sem nome'}
                                                </h4>
                                            )}
                                            <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading flex-shrink-0">
                                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.price * item.qty)}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <p className="text-[11px] font-medium text-brand-inactive-text pr-2 truncate">
                                                {item.sku || 'Sem SKU'} • {item.qty} un • {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.price)}
                                            </p>
                                            {!props.isReadOnly && (
                                                <div className="flex items-center gap-1">
                                                    {item.isEditing ? (
                                                        <button
                                                            onClick={() => props.toggleItemEdit(index, false)}
                                                            className="w-8 h-8 flex items-center justify-center text-green-600 hover:bg-green-50 dark:hover:bg-green-900/10 rounded-lg transition-colors"
                                                        >
                                                            <CheckIcon size={16} />
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={() => props.toggleItemEdit(index, true)}
                                                            className="w-8 h-8 flex items-center justify-center text-brand-inactive-text hover:text-brand-dark hover:bg-brand-gray dark:hover:bg-dark-border rounded-lg transition-colors"
                                                        >
                                                            <EditIcon size={16} />
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => props.removeItem(index)}
                                                        className="w-8 h-8 flex items-center justify-center text-brand-red hover:bg-red-50 dark:hover:bg-red-900/10 rounded-full transition-colors"
                                                    >
                                                        <TrashIcon size={14} />
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        {!props.isReadOnly && (
                                            <div className="flex items-center gap-4 mt-2">
                                                <QuantitySelector value={item.qty} onChange={(val) => props.updateItemQty(index, val)} size="sm" />
                                                <div className="flex items-center flex-1 max-w-[120px]">
                                                    <span className="text-[11px] font-medium text-brand-inactive-text mr-1">R$</span>
                                                    <input
                                                        type="number"
                                                        value={item.price}
                                                        onChange={(e) => props.updateItemPrice(index, parseFloat(e.target.value) || 0)}
                                                        className="w-full h-8 px-2 rounded-lg border border-brand-border bg-white dark:bg-dark-background font-bold text-[11px] focus:ring-1 focus:ring-brand-primary outline-none"
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Add Item Link */}
                        {props.quoteItems.length > 0 && !props.isReadOnly && (
                            <button
                                type="button"
                                className="text-sm font-bold text-brand-dark dark:text-dark-heading underline decoration-brand-border dark:decoration-dark-border underline-offset-4 hover:opacity-80 transition-opacity flex items-center gap-1 mb-8"
                                onClick={props.addBlankItem}
                            >
                                <PlusIcon size={14} strokeWidth={3} />
                                Adicionar item manual
                            </button>
                        )}
                    </div>

                    <div className="border-t border-brand-border dark:border-dark-border w-full my-8"></div>

                    {/* 2. CUSTOMER SECTION */}
                    <div className="mb-8">
                        <h3 className="font-bold text-lg text-brand-dark dark:text-dark-heading mb-6">Cliente</h3>

                        {props.selectedCustomer ? (
                            <div className="flex items-center justify-between p-4 rounded-xl bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border">
                                <div className="flex gap-4 items-center">
                                    <div className="relative">
                                        <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-gray-800 flex items-center justify-center text-lg font-bold text-brand-dark dark:text-dark-heading border border-white dark:border-dark-border shadow-sm overflow-hidden text-brand-inactive-text">
                                            {props.selectedCustomer.avatar && props.selectedCustomer.avatar.length > 2 ? (
                                                <img src={`https://i.pravatar.cc/150?u=${props.selectedCustomer.id}`} className="w-full h-full object-cover" alt="avatar" />
                                            ) : (
                                                props.selectedCustomer.name.charAt(0)
                                            )}
                                        </div>
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading leading-tight">{props.selectedCustomer.name}</h4>
                                        <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body">
                                            {props.selectedCustomer.email}
                                        </span>
                                    </div>
                                </div>
                                {!props.isReadOnly && (
                                    <Button
                                        variant="outline"
                                        className="text-xs font-bold text-brand-red hover:bg-red-50 dark:hover:bg-red-900/10 border-red-100 dark:border-red-900/30 h-9"
                                        onClick={() => props.setSelectedCustomer(null)}
                                    >
                                        Remover
                                    </Button>
                                )}
                            </div>
                        ) : (
                            <IconPlaceholder
                                icon={UserIcon}
                                title="Nenhum cliente selecionado"
                                subtitle={props.isReadOnly ? "Nenhum cliente vinculado a esta proposta." : "Selecione um cliente para vincular à proposta."}
                                itemButton={!props.isReadOnly ? {
                                    text: "Selecionar Cliente",
                                    action: () => props.setIsCustomerSheetOpen(true),
                                    variant: "outline"
                                } : undefined}
                            />
                        )}
                    </div>

                    <div className="border-t border-brand-border dark:border-dark-border w-full my-8"></div>

                    {/* 3. SETTINGS SECTION */}
                    <div className="mb-8">
                        <h3 className="font-bold text-lg text-brand-dark dark:text-dark-heading mb-6">Configurações</h3>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                            <DatePicker
                                label="Data Emissão"
                                value={props.quoteDate}
                                onChange={(date: any) => {
                                    if (date) {
                                        const d = new Date(date);
                                        props.setQuoteDate(d.toISOString().split('T')[0]);
                                    }
                                }}
                                disabled={props.isReadOnly}
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
                                disabled={props.isReadOnly}
                            />

                            <div className="flex flex-col gap-1.5">
                                <FormDropdown
                                    label="Status"
                                    value={props.status}
                                    setValue={props.setStatus}
                                    options={statusOptions.map(o => ({ value: o.value, label: o.label }))}
                                    disabled={props.isReadOnly}
                                />
                            </div>
                        </div>

                        {/* Financial Inputs Row */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="relative">
                                {props.discountType === 'R$' ? (
                                    <MoneyInput
                                        label="Desconto"
                                        value={props.discount}
                                        onChange={(val) => props.setDiscount(val.toString())}
                                        disabled={props.isReadOnly}
                                        suffix={
                                            <div className="flex items-center gap-1.5 border-l border-brand-border dark:border-dark-border ml-2 pl-2">
                                                <button type="button" onClick={() => props.setDiscountType('R$')} className="text-[11px] font-black text-brand-primary">R$</button>
                                                <div className="w-[1px] h-3 bg-brand-border dark:border-dark-border" />
                                                <button type="button" onClick={() => props.setDiscountType('%')} className="text-[11px] font-bold text-brand-inactive-text hover:text-brand-dark transition-colors">%</button>
                                            </div>
                                        }
                                    />
                                ) : (
                                    <PercentageInput
                                        label="Desconto"
                                        value={props.discount}
                                        onChange={(val) => props.setDiscount(val.toString())}
                                        disabled={props.isReadOnly}
                                        suffix={
                                            <div className="flex items-center gap-1.5 border-l border-brand-border dark:border-dark-border ml-2 pl-2">
                                                <button type="button" onClick={() => props.setDiscountType('R$')} className="text-[11px] font-bold text-brand-inactive-text hover:text-brand-dark transition-colors">R$</button>
                                                <div className="w-[1px] h-3 bg-brand-border dark:border-dark-border" />
                                                <button type="button" onClick={() => props.setDiscountType('%')} className="text-[11px] font-black text-brand-primary">%</button>
                                            </div>
                                        }
                                    />
                                )}
                            </div>

                            <FormCurrencyInput
                                label="Frete"
                                value={Number(props.shippingFee) || 0}
                                onChange={(val) => props.setShippingFee(val.toString())}
                                disabled={props.isReadOnly}
                            />

                            <FormCurrencyInput
                                label="Outros Custos"
                                value={Number(props.otherCosts) || 0}
                                onChange={(val) => props.setOtherCosts(val.toString())}
                                disabled={props.isReadOnly}
                            />
                        </div>
                    </div>
                </motion.div>
            </TabsContent>

            <TabsContent value="Layout" className="mt-0 focus-visible:outline-none">
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
                    <div className="mb-8">
                        <h3 className="font-bold text-lg text-brand-dark dark:text-dark-heading mb-6 flex items-center gap-2">
                            <WandIcon size={20} className="text-brand-dark dark:text-dark-heading" /> Personalizar Aparência
                        </h3>

                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-[13px] font-bold text-brand-dark dark:text-dark-heading mb-2">Cor Primária</label>
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-lg border border-brand-border dark:border-dark-border overflow-hidden relative shadow-sm">
                                            <input
                                                type="color"
                                                value={props.primaryColor}
                                                onChange={(e) => props.setPrimaryColor(e.target.value)}
                                                className="absolute inset-0 w-[150%] h-[150%] -translate-x-1/4 -translate-y-1/4 p-0 border-0 cursor-pointer"
                                                disabled={props.isReadOnly}
                                            />
                                        </div>
                                        <span className="text-[13px] font-bold tracking-wider uppercase text-brand-inactive-text dark:text-dark-body">{props.primaryColor}</span>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[13px] font-bold text-brand-dark dark:text-dark-heading mb-2">Cor Secundária</label>
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-lg border border-brand-border dark:border-dark-border overflow-hidden relative shadow-sm">
                                            <input
                                                type="color"
                                                value={props.secondaryColor}
                                                onChange={(e) => props.setSecondaryColor(e.target.value)}
                                                className="absolute inset-0 w-[150%] h-[150%] -translate-x-1/4 -translate-y-1/4 p-0 border-0 cursor-pointer"
                                                disabled={props.isReadOnly}
                                            />
                                        </div>
                                        <span className="text-[13px] font-bold tracking-wider uppercase text-brand-inactive-text dark:text-dark-body">{props.secondaryColor}</span>
                                    </div>
                                </div>
                            </div>

                            <FormInput
                                label="Título do Documento"
                                name="quoteTitle"
                                value={props.quoteTitle}
                                onChange={(e) => props.setQuoteTitle(e.target.value)}
                                placeholder="EX: ORÇAMENTO"
                                disabled={props.isReadOnly}
                            />

                            <FormInput
                                label="Subtítulo"
                                name="quoteSubtitle"
                                value={props.quoteSubtitle}
                                onChange={(e) => props.setQuoteSubtitle(e.target.value)}
                                placeholder="Ex: Proposta Comercial"
                                disabled={props.isReadOnly}
                            />
                        </div>
                    </div>
                </motion.div>
            </TabsContent>

            <TabsContent value="Observações" className="mt-0 focus-visible:outline-none">
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
                    <div className="bg-white dark:bg-dark-surface p-0">
                        <label className="block text-lg font-bold text-brand-dark dark:text-dark-heading mb-6">Observações da Proposta</label>
                        <div className="bg-brand-gray dark:bg-dark-border/30 rounded-2xl border border-brand-border dark:border-dark-border p-5 h-[350px]">
                            <textarea
                                className="w-full h-full bg-transparent border-none text-[15px] text-brand-dark dark:text-dark-heading leading-relaxed focus:outline-none resize-none placeholder:text-brand-inactive-text disabled:opacity-70 font-medium"
                                placeholder="Adicione termos, condições ou notas para o cliente..."
                                value={props.internalNote}
                                onChange={(e) => props.setInternalNote(e.target.value)}
                                disabled={props.isReadOnly}
                            ></textarea>
                        </div>
                    </div>
                </motion.div>
            </TabsContent>
        </div>
    );
};

export default QuoteEditor;
