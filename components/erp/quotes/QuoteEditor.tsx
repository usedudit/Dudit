"use client"

import {
    SearchIcon,
    TrashIcon,
    UserIcon,
    ChevronDownIcon,
    WandIcon,
    PlusIcon,
    EditIcon,
    CheckIcon
} from '@/lib/icons';
import { motion, AnimatePresence } from 'framer-motion';
import QuantitySelector from '@/components/reusable/QuantitySelector';
import { Button, Input as FormInput, Dropdown, DropdownItem, TabsContent } from '@/components/reusable';
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
    tax: number;
    discountValue: number;
    total: number;
    selectedCustomer: any;
    setSelectedCustomer: (customer: any) => void;
    setIsCustomerSheetOpen: (val: boolean) => void;
    quoteDate: string;
    setQuoteDate: (val: string) => void;
    expiryDate: string;
    setExpiryDate: (val: string) => void;
    salesperson: string;
    setSalesperson: (val: string) => void;
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
    return (
        <div className="p-6 md:p-8 pt-4">
            {/* Full width content within the left pane */}
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
                                                    <div className="text-sm font-bold text-brand-dark dark:text-dark-heading">${product.price}</div>
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

                        {/* --- ITEMS TABLE --- */}
                        <div className="w-full overflow-hidden border border-brand-border dark:border-dark-border rounded-xl bg-white dark:bg-dark-surface mb-4">
                            <table className="w-full border-collapse">
                                <thead>
                                    <tr className="bg-brand-gray/50 dark:bg-dark-border/30 border-b border-brand-border dark:border-dark-border">
                                        <th className="py-3 px-4 text-[11px] font-bold text-gray-500 dark:text-dark-body uppercase tracking-wider text-left">
                                            Produto
                                        </th>
                                        <th className="py-3 px-4 text-[11px] font-bold text-gray-500 dark:text-dark-body uppercase tracking-wider text-left w-40">
                                            Preço Unit.
                                        </th>
                                        <th className="py-3 px-4 text-[11px] font-bold text-gray-500 dark:text-dark-body uppercase tracking-wider text-center w-32">
                                            Qtd.
                                        </th>
                                        <th className="py-3 px-4 text-[11px] font-bold text-gray-500 dark:text-dark-body uppercase tracking-wider text-right w-32">
                                            Total
                                        </th>
                                        {!props.isReadOnly && (
                                            <th className="py-3 px-4 text-[11px] font-bold text-gray-500 dark:text-dark-body uppercase tracking-wider text-center w-24">
                                                Ações
                                            </th>
                                        )}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-brand-border dark:divide-dark-border">
                                    {props.quoteItems.length > 0 ? (
                                        <AnimatePresence initial={false} mode="popLayout">
                                            {props.quoteItems.map((item, index) => (
                                                <motion.tr
                                                    key={item.rowId || `item-${index}-${item.id}`}
                                                    layout
                                                    initial={{ opacity: 0 }}
                                                    animate={{ opacity: 1 }}
                                                    exit={{ opacity: 0 }}
                                                    className="group bg-white dark:bg-dark-surface hover:bg-brand-gray/30 dark:hover:bg-dark-border/10 transition-colors"
                                                >
                                                    {/* Product Info */}
                                                    <td className="py-3 px-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border flex-shrink-0 overflow-hidden flex items-center justify-center border border-brand-border dark:border-dark-border shadow-sm">
                                                                {item.image ? (
                                                                    <img src={item.image} className="w-full h-full object-cover" alt={item.name} />
                                                                ) : (
                                                                    <span className="text-[10px] font-bold text-brand-inactive-text uppercase">
                                                                        {item.name?.charAt(0) || 'P'}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="flex flex-col min-w-0">
                                                                {item.isEditing && !props.isReadOnly ? (
                                                                    <FormInput
                                                                        label=""
                                                                        name={`name-${index}`}
                                                                        value={item.name}
                                                                        onChange={(e) => props.updateItemField(index, 'name', e.target.value)}
                                                                        className="mb-0 h-8 text-sm font-bold min-w-[150px]"
                                                                        placeholder="Nome do produto"
                                                                        autoFocus
                                                                    />
                                                                ) : (
                                                                    <>
                                                                        <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading truncate max-w-[200px]">
                                                                            {item.name || 'Produto sem nome'}
                                                                        </span>
                                                                        <span className="text-[11px] font-medium text-brand-inactive-text dark:text-dark-body truncate">
                                                                            {item.sku || 'Sem SKU'}
                                                                        </span>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>

                                                    {/* Price Input */}
                                                    <td className="py-3 px-4">
                                                        <div className="relative group/price w-full">
                                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-brand-inactive-text">R$</span>
                                                            <input
                                                                type="number"
                                                                value={item.price}
                                                                onChange={(e) => props.updateItemPrice(index, parseFloat(e.target.value) || 0)}
                                                                disabled={props.isReadOnly}
                                                                className={`w-full h-9 pl-9 pr-3 rounded-lg border text-[13px] font-bold transition-all ${
                                                                    props.isReadOnly 
                                                                    ? 'bg-transparent border-transparent text-brand-primary cursor-default' 
                                                                    : 'bg-brand-gray/50 border-brand-border focus:bg-white focus:border-brand-primary'
                                                                }`}
                                                            />
                                                        </div>
                                                    </td>

                                                    {/* Quantity */}
                                                    <td className="py-3 px-4">
                                                        <QuantitySelector
                                                            value={item.qty}
                                                            onChange={(val) => props.updateItemQty(index, val)}
                                                            min={1}
                                                            size="sm"
                                                            disabled={props.isReadOnly}
                                                        />
                                                    </td>

                                                    {/* Total */}
                                                    <td className="py-3 px-4 text-right">
                                                        <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">
                                                            R$ {(item.price * item.qty).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                        </span>
                                                    </td>

                                                    {/* Actions */}
                                                    {!props.isReadOnly && (
                                                        <td className="py-3 px-4 text-center text-center">
                                                            <div className="flex items-center justify-center gap-2">
                                                                {item.isBlank && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => props.toggleItemEdit(index, !item.isEditing)}
                                                                        className={`group/edit p-1.5 rounded-full transition-all ${item.isEditing ? 'text-brand-green bg-brand-green/10' : 'text-gray-400 hover:text-brand-primary hover:bg-brand-primary/5'}`}
                                                                    >
                                                                        {item.isEditing ? <CheckIcon size={18} /> : <EditIcon size={18} />}
                                                                    </button>
                                                                )}
                                                                <button
                                                                    type="button"
                                                                    onClick={() => props.removeItem(index)}
                                                                    className="p-1.5 text-gray-400 hover:text-brand-red hover:bg-brand-red/5 rounded-full transition-all"
                                                                >
                                                                    <TrashIcon size={18} />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    )}
                                                </motion.tr>
                                            ))}
                                        </AnimatePresence>
                                    ) : (
                                        <tr>
                                            <td colSpan={props.isReadOnly ? 4 : 5} className="py-12 border-none">
                                                <IconPlaceholder
                                                    icon={SearchIcon}
                                                    title="Nenhum produto"
                                                    subtitle={props.isReadOnly ? "Esta proposta não possui itens." : "Busque produtos acima ou adicione manualmente."}
                                                    itemButton={!props.isReadOnly ? {
                                                        text: "Adicionar item manual",
                                                        action: props.addBlankItem,
                                                        variant: "outline"
                                                    } : undefined}
                                                />
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
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

                    {/* 3. SETTINGS SECTION (Moved Financials Here) */}
                    <div className="mb-8">
                        <h3 className="font-bold text-lg text-brand-dark dark:text-dark-heading mb-6">Configurações</h3>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                            <FormInput
                                type="date"
                                label="Data Emissão"
                                name="quoteDate"
                                value={props.quoteDate}
                                onChange={(e) => props.setQuoteDate(e.target.value)}
                                className="mb-0"
                                disabled={props.isReadOnly}
                            />

                            <FormInput
                                type="date"
                                label="Validade da Proposta"
                                name="expiryDate"
                                value={props.expiryDate}
                                onChange={(e) => props.setExpiryDate(e.target.value)}
                                className="mb-0"
                                disabled={props.isReadOnly}
                            />

                            <div className="flex flex-col gap-1.5">
                                <label className="block text-[13px] font-bold text-brand-dark dark:text-dark-heading">Vendedor</label>
                                <Dropdown
                                    width="w-full"
                                    trigger={
                                        <button 
                                            type="button"
                                            disabled={props.isReadOnly}
                                            className="flex items-center justify-between w-full h-[46px] px-4 bg-transparent border border-brand-border dark:border-dark-border rounded-xl text-[15px] font-medium text-brand-dark dark:text-dark-heading focus:outline-none focus:ring-1 focus:ring-brand-border transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                                            <div className="flex items-center gap-2">
                                                <UserIcon size={18} className="text-brand-inactive-text" />
                                                {props.salesperson}
                                            </div>
                                            <ChevronDownIcon size={18} className="text-brand-inactive-text" />
                                        </button>
                                    }
                                >
                                    <DropdownItem onClick={() => props.setSalesperson('Jenny Wilson')}>Jenny Wilson</DropdownItem>
                                    <DropdownItem onClick={() => props.setSalesperson('Robert Fox')}>Robert Fox</DropdownItem>
                                </Dropdown>
                            </div>
                        </div>

                        {/* Financial Inputs Row */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <FormInput
                                label="Desconto"
                                name="discount"
                                type="number"
                                value={props.discount}
                                onChange={(e) => props.setDiscount(e.target.value)}
                                disabled={props.isReadOnly}
                                suffix={
                                    <div className="flex items-center h-full">
                                        <div className="w-px h-6 bg-brand-border dark:bg-dark-border mx-2"></div>
                                        <Dropdown
                                            width="w-36"
                                            align="right"
                                            showChevron={false}
                                            trigger={
                                                <button 
                                                    type="button"
                                                    disabled={props.isReadOnly}
                                                    className="h-full px-3 text-[15px] font-bold text-brand-inactive-text hover:text-brand-dark dark:text-dark-body dark:hover:text-dark-heading transition-colors disabled:opacity-50">
                                                    {props.discountType}
                                                </button>
                                            }
                                        >
                                            <DropdownItem onClick={() => props.setDiscountType('R$')}>
                                                R$ (Dinheiro)
                                            </DropdownItem>
                                            <DropdownItem onClick={() => props.setDiscountType('%')}>
                                                % (Porcentagem)
                                            </DropdownItem>
                                        </Dropdown>
                                    </div>
                                }
                            />
                            <FormInput
                                label="Frete"
                                name="shippingFee"
                                type="number"
                                prefix="$"
                                value={props.shippingFee}
                                onChange={(e) => props.setShippingFee(e.target.value)}
                                disabled={props.isReadOnly}
                            />
                            <FormInput
                                label="Outros Custos"
                                name="otherCosts"
                                type="number"
                                prefix="$"
                                value={props.otherCosts}
                                onChange={(e) => props.setOtherCosts(e.target.value)}
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
