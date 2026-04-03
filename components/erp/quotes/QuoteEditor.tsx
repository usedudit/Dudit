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
    isSearching: boolean; // Add this to show loading state if needed
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

                            <AnimatePresence>
                                {props.isProductSearchOpen && props.searchQuery && (
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

                        <div className="space-y-4 mb-6">
                            {props.quoteItems.length > 0 ? (
                                <AnimatePresence initial={false} mode="popLayout">
                                    {props.quoteItems.map((item, index) => (
                                        <motion.div
                                            key={item.rowId || `item-${index}-${item.id}`}
                                            layout
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, scale: 0.95 }}
                                            className="p-4 rounded-2xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface/50 hover:border-brand-dark/20 dark:hover:border-dark-border/80 transition-all group"
                                        >
                                            <div className="flex flex-col md:flex-row md:items-center gap-4">
                                                {/* Product Info & Thumb */}
                                                <div className="flex items-center gap-4 flex-1 min-w-0">
                                                    <div className="w-14 h-14 rounded-2xl bg-brand-gray dark:bg-zinc-800 border border-brand-border dark:border-dark-border flex-shrink-0 overflow-hidden flex items-center justify-center">
                                                        {item.image ? (
                                                            <img src={item.image} className="w-full h-full object-cover mix-blend-multiply dark:mix-blend-normal" alt={item.name} />
                                                        ) : (
                                                            <div className="w-full h-full bg-gray-50 dark:bg-zinc-900" />
                                                        )}
                                                    </div>

                                                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                                                        {item.isEditing ? (
                                                            <FormInput
                                                                label=""
                                                                name={`name-${index}`}
                                                                value={item.name}
                                                                onChange={(e) => props.updateItemField(index, 'name', e.target.value)}
                                                                className="mb-0 h-9 text-sm font-bold"
                                                                placeholder="Nome do produto"
                                                                autoFocus
                                                            />
                                                        ) : (
                                                            <>
                                                                <span className="font-bold text-[15px] text-brand-dark dark:text-dark-heading truncate group-hover:text-brand-primary transition-colors">
                                                                    {item.name || 'Produto sem nome'}
                                                                </span>
                                                                {item.sku && (
                                                                    <span className="text-[11px] font-bold text-brand-inactive-text dark:text-dark-body uppercase tracking-widest mt-1">
                                                                        {item.sku}
                                                                    </span>
                                                                )}
                                                            </>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Inputs & Total Area */}
                                                <div className="flex flex-wrap items-center gap-4 md:gap-8 pt-3 md:pt-0 border-t md:border-t-0 border-brand-border/50 dark:border-dark-border/50">
                                                    
                                                    {/* Price Input */}
                                                    <div className="flex flex-col gap-1.5 min-w-[110px]">
                                                        <span className="text-[10px] uppercase font-bold text-brand-inactive-text dark:text-dark-body tracking-wider">Preço Unit.</span>
                                                        <FormInput
                                                            label=""
                                                            name={`price-${index}`}
                                                            value={item.price}
                                                            onChange={(e) => props.updateItemPrice(index, parseFloat(e.target.value))}
                                                            prefix="R$"
                                                            className="mb-0 h-10 text-sm font-bold"
                                                        />
                                                    </div>

                                                    {/* Quantity Selector */}
                                                    <div className="flex flex-col gap-1.5">
                                                        <span className="text-[10px] uppercase font-bold text-brand-inactive-text dark:text-dark-body tracking-wider">Qtd.</span>
                                                        <QuantitySelector
                                                            value={item.qty}
                                                            onChange={(val) => props.updateItemQty(index, val)}
                                                            min={1}
                                                            size="md"
                                                        />
                                                    </div>

                                                    {/* Row Total */}
                                                    <div className="flex flex-col gap-1.5 min-w-[100px] text-right ml-auto md:ml-0">
                                                        <span className="text-[10px] uppercase font-bold text-brand-inactive-text dark:text-dark-body tracking-wider">Total</span>
                                                        <span className="text-[15px] font-extrabold text-brand-dark dark:text-dark-heading bg-brand-gray/50 dark:bg-zinc-800 px-3 py-2 rounded-xl border border-brand-border/40 dark:border-dark-border/40">
                                                            R$ {(item.price * item.qty).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                        </span>
                                                    </div>

                                                    {/* Actions */}
                                                    <div className="flex items-center gap-2 ml-4">
                                                        {item.isBlank && (
                                                            <Button
                                                                variant="outline"
                                                                onClick={() => props.toggleItemEdit(index, !item.isEditing)}
                                                                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${item.isEditing ? 'text-green-600 bg-green-50 border-green-200' : 'text-brand-inactive-text'}`}
                                                            >
                                                                {item.isEditing ? <CheckIcon size={18} strokeWidth={3} /> : <EditIcon size={18} />}
                                                            </Button>
                                                        )}
                                                        <Button
                                                            variant="outline"
                                                            onClick={() => props.removeItem(index)}
                                                            className="w-10 h-10 rounded-xl flex items-center justify-center text-brand-inactive-text hover:text-brand-red hover:bg-red-50 dark:hover:bg-red-900/20 border-brand-border dark:border-dark-border"
                                                        >
                                                            <TrashIcon size={18} />
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            ) : (
                                <div className="py-12 bg-white dark:bg-dark-surface border border-dashed border-brand-border dark:border-dark-border rounded-3xl">
                                    <IconPlaceholder
                                        icon={SearchIcon}
                                        title="Nenhum produto"
                                        subtitle="Busque produtos acima ou adicione manualmente."
                                        itemButton={{
                                            text: "Adicionar item manual",
                                            action: props.addBlankItem,
                                            variant: "outline"
                                        }}
                                    />
                                </div>
                            )}
                        </div>

                        {/* Add Item Link (Visible below table if items exist) */}
                        {props.quoteItems.length > 0 && (
                            <button
                                className="text-sm font-bold text-brand-dark dark:text-dark-heading underline decoration-brand-border dark:decoration-dark-border underline-offset-4 hover:opacity-80 transition-opacity flex items-center gap-1"
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
                                                <img src={`https://i.pravatar.cc/150?u=${props.selectedCustomer.id}`} className="w-full h-full object-cover" />
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
                                <Button
                                    variant="outline"
                                    className="text-xs font-bold text-brand-red hover:bg-red-50 dark:hover:bg-red-900/10 border-red-100 dark:border-red-900/30 h-9"
                                    onClick={() => props.setSelectedCustomer(null)}
                                >
                                    Remover
                                </Button>
                            </div>
                        ) : (
                            <IconPlaceholder
                                icon={UserIcon}
                                title="Nenhum cliente selecionado"
                                subtitle="Selecione um cliente para vincular à proposta."
                                itemButton={{
                                    text: "Selecionar Cliente",
                                    action: () => props.setIsCustomerSheetOpen(true),
                                    variant: "outline"
                                }}
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
                            />

                            <FormInput
                                type="date"
                                label="Validade da Proposta"
                                name="expiryDate"
                                value={props.expiryDate}
                                onChange={(e) => props.setExpiryDate(e.target.value)}
                                className="mb-0"
                            />

                            <div className="flex flex-col gap-1.5">
                                <label className="block text-[13px] font-bold text-brand-dark dark:text-dark-heading">Vendedor</label>
                                <Dropdown
                                    width="w-full"
                                    trigger={
                                        <button className="flex items-center justify-between w-full h-[46px] px-4 bg-transparent border border-brand-border dark:border-dark-border rounded-xl text-[15px] font-medium text-brand-dark dark:text-dark-heading focus:outline-none focus:ring-1 focus:ring-brand-border transition-all">
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
                                suffix={
                                    <div className="flex items-center h-full">
                                        <div className="w-px h-6 bg-brand-border dark:bg-dark-border mx-2"></div>
                                        <Dropdown
                                            width="w-36"
                                            align="right"
                                            showChevron={false}
                                            trigger={
                                                <button className="h-full px-3 text-[15px] font-bold text-brand-inactive-text hover:text-brand-dark dark:text-dark-body dark:hover:text-dark-heading transition-colors">
                                                    {props.discountType}
                                                </button>
                                            }
                                        >
                                            <DropdownItem onClick={() => props.setDiscountType('R$')}>
                                                {/* Wait, lib/icons.tsx has MoneyIcon instead of DollarSign? I'll use text for now to be safe, PercentIcon doesn't exist */}
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
                            />
                            <FormInput
                                label="Outros Custos"
                                name="otherCosts"
                                type="number"
                                prefix="$"
                                value={props.otherCosts}
                                onChange={(e) => props.setOtherCosts(e.target.value)}
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
                            />

                            <FormInput
                                label="Subtítulo"
                                name="quoteSubtitle"
                                value={props.quoteSubtitle}
                                onChange={(e) => props.setQuoteSubtitle(e.target.value)}
                                placeholder="Ex: Proposta Comercial"
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
                                className="w-full h-full bg-transparent border-none text-[15px] text-brand-dark dark:text-dark-heading leading-relaxed focus:outline-none resize-none placeholder:text-brand-inactive-text"
                                placeholder="Adicione termos, condições ou notas para o cliente..."
                                value={props.internalNote}
                                onChange={(e) => props.setInternalNote(e.target.value)}
                            ></textarea>
                        </div>
                    </div>
                </motion.div>
            </TabsContent>
        </div>
    );
};

export default QuoteEditor;
