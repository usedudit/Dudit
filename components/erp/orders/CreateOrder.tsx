"use client"

import React, { useState, useMemo, useCallback, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { 
    ChevronLeftIcon, 
    SaveIcon, 
    SearchIcon, 
    TrashIcon, 
    UserIcon, 
    PlusIcon, 
    ClockIcon, 
    CheckCircleIcon, 
    AlertCircleIcon,
    TruckIcon,
    StoreIcon
} from "@/lib/icons"
import { 
    Button, 
    Input as FormInput, 
    Tabs, 
    TabsList, 
    TabsTrigger, 
    TabsContent, 
    FormCurrencyInput, 
    FormDropdown, 
    MoneyInput, 
    PercentageInput,
    IconPlaceholder,
    AlertModal,
    CustomerCard,
    CepInput, 
    StateComboBox, 
    NumberInputWithCheckbox 
} from "@/components/reusable"
import QuantitySelector from "@/components/reusable/QuantitySelector"
import SelectCustomerSheet from "../clientes/SelectCustomerSheet"
import SelectVariantSheet from "../quotes/SelectVariantSheet"
import { useNotification } from "@/hooks/use-notification"
import { useStore } from "@/lib/store-context"
import { useMediaQuery } from "../hooks"
import { createERPOrderAction } from "@/app/actions/erp/orders"
import { FadeIn } from "@/components/animations/FadeIn"

interface CreateOrderProps {
    partnerId: string
    onBack: () => void
}

export default function CreateOrder({ partnerId, onBack }: CreateOrderProps) {
    const { success, error, warning } = useNotification()
    const { selectedStore } = useStore()
    const isMobile = useMediaQuery("(max-width: 767px)")
    const scrollContainerRef = useRef<HTMLDivElement>(null)

    // --- STATE ---
    const [activeTab, setActiveTab] = useState("Dados Gerais")
    const [isScrolled, setIsScrolled] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [showUnsavedAlert, setShowUnsavedAlert] = useState(false)

    // Order Information
    const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0])
    const [salesChannel, setSalesChannel] = useState("Loja Física")
    const [deliveryMethod, setDeliveryMethod] = useState<'pickup' | 'delivery'>('pickup')
    const [paymentStatus, setPaymentStatus] = useState<'unpaid' | 'partially_paid' | 'paid'>('unpaid')
    const [deliveryStatus, setDeliveryStatus] = useState<any>('not_sent')

    // Customer
    const [selectedCustomer, setSelectedCustomer] = useState<any>(null)
    const [isCustomerSheetOpen, setIsCustomerSheetOpen] = useState(false)

    // Items
    const [orderItems, setOrderItems] = useState<any[]>([])
    const [searchQuery, setSearchQuery] = useState("")
    const [isProductSearchOpen, setIsProductSearchOpen] = useState(false)
    const [isSearching, setIsSearching] = useState(false)
    const [filteredProducts, setFilteredProducts] = useState<any[]>([])
    const [isVariantSheetOpen, setIsVariantSheetOpen] = useState(false)
    const [activeProductForVariants, setActiveProductForVariants] = useState<any>(null)

    // Financials
    const [discount, setDiscount] = useState("0")
    const [discountType, setDiscountType] = useState<'R$' | '%'>('R$')
    const [shippingFee, setShippingFee] = useState("0")
    const [otherCosts, setOtherCosts] = useState("0")
    const [internalNote, setInternalNote] = useState("")

    // Address (Delivery Only)
    const [address, setAddress] = useState({
        zipCode: "",
        street: "",
        number: "",
        complement: "",
        neighborhood: "",
        city: "",
        state: "",
        noNumber: false
    })

    // --- DERIVED DATA ---
    const subtotal = useMemo(() => {
        return orderItems.reduce((acc, item) => acc + (item.price * item.qty), 0)
    }, [orderItems])

    const discountValue = useMemo(() => {
        const val = parseFloat(discount.replace(',', '.')) || 0
        if (discountType === '%') return (subtotal * val) / 100
        return val
    }, [subtotal, discount, discountType])

    const total = useMemo(() => {
        const ship = parseFloat(shippingFee) || 0
        const others = parseFloat(otherCosts) || 0
        return Math.max(0, subtotal - discountValue + ship + others)
    }, [subtotal, discountValue, shippingFee, otherCosts])

    const hasUnsavedChanges = useMemo(() => {
        return orderItems.length > 0 || selectedCustomer !== null || internalNote !== ""
    }, [orderItems, selectedCustomer, internalNote])

    // --- EFFECTS ---
    useEffect(() => {
        const handleScroll = () => {
            if (scrollContainerRef.current) {
                setIsScrolled(scrollContainerRef.current.scrollTop > 20)
            }
        }
        const container = scrollContainerRef.current
        container?.addEventListener("scroll", handleScroll)
        return () => container?.removeEventListener("scroll", handleScroll)
    }, [])

    useEffect(() => {
        if (!searchQuery) {
            setFilteredProducts([])
            return
        }

        const delayDebounceFn = setTimeout(async () => {
            setIsSearching(true)
            try {
                const response = await fetch(`/api/erp/products/search?q=${searchQuery}&partnerId=${partnerId}`)
                const data = await response.json()
                setFilteredProducts(data || [])
            } catch (err) {
                console.error("Error searching products:", err)
            } finally {
                setIsSearching(false)
            }
        }, 300)

        return () => clearTimeout(delayDebounceFn)
    }, [searchQuery, partnerId])

    // --- HANDLERS ---
    const handleBack = () => {
        if (hasUnsavedChanges) {
            setShowUnsavedAlert(true)
        } else {
            onBack()
        }
    }

    const handleProductClick = (product: any) => {
        if (product.variants && product.variants.length > 0) {
            setActiveProductForVariants(product)
            setIsVariantSheetOpen(true)
        } else {
            addItemToOrder({
                id: product.id,
                name: product.name,
                price: product.price,
                qty: 1,
                image: product.image,
                sku: product.sku
            })
        }
        setIsProductSearchOpen(false)
        setSearchQuery("")
    }

    const handleVariantConfirm = (variants: any[]) => {
        variants.forEach(v => {
            if (v.qty > 0) {
                addItemToOrder({
                    id: v.id,
                    productId: activeProductForVariants.id,
                    name: `${activeProductForVariants.name} - ${v.name}`,
                    price: v.price,
                    qty: v.qty,
                    image: v.image || activeProductForVariants.image,
                    sku: v.sku
                })
            }
        })
    }

    const addItemToOrder = (item: any) => {
        setOrderItems(prev => [...prev, item])
    }

    const addBlankItem = () => {
        setOrderItems(prev => [...prev, { id: `manual-${Date.now()}`, name: "", price: 0, qty: 1, isManual: true }])
    }

    const removeItem = (index: number) => {
        setOrderItems(prev => prev.filter((_, i) => i !== index))
    }

    const updateItemQty = (index: number, qty: number) => {
        setOrderItems(prev => prev.map((item, i) => i === index ? { ...item, qty } : item))
    }

    const updateItemPrice = (index: number, price: number) => {
        setOrderItems(prev => prev.map((item, i) => i === index ? { ...item, price } : item))
    }

    const updateItemName = (index: number, name: string) => {
        setOrderItems(prev => prev.map((item, i) => i === index ? { ...item, name } : item))
    }

    const handleSave = async () => {
        if (orderItems.length === 0) {
            warning("Pedido vazio", "Adicione pelo menos um item ao pedido.")
            return
        }

        setIsSaving(true)
        try {
            const res = await createERPOrderAction({
                partnerId,
                customerId: selectedCustomer?.id,
                customerName: selectedCustomer?.name,
                orderDate,
                salesChannel,
                deliveryMethod,
                paymentStatus,
                deliveryStatus,
                items: orderItems.map((item, idx) => ({
                    productId: item.productId || item.id.toString().startsWith('manual') ? null : item.id,
                    customName: item.isManual ? item.name : undefined,
                    quantity: item.qty,
                    unitPrice: item.price,
                    sortOrder: idx
                })),
                subtotal,
                discountValue,
                discountType: discountType === 'R$' ? 'fixed' : 'percentage',
                shippingCost: parseFloat(shippingFee) || 0,
                additionalCosts: parseFloat(otherCosts) || 0,
                totalAmount: total,
                notes: internalNote,
                address: deliveryMethod === 'delivery' ? {
                    zipCode: address.zipCode,
                    street: address.street,
                    number: address.number,
                    complement: address.complement,
                    neighborhood: address.neighborhood,
                    city: address.city,
                    state: address.state
                } : undefined
            })

            if (res.success) {
                success("Venda criada", `Pedido ${res.orderNumber} criado com sucesso!`)
                onBack()
            } else {
                error("Erro ao salvar", res.error || "Ocorreu um erro inesperado.")
            }
        } catch (err) {
            error("Erro de conexão", "Não foi possível salvar o pedido.")
        } finally {
            setIsSaving(false)
        }
    }

    // --- RENDER HELPERS ---
    const statusOptions = [
        { value: 'unpaid', label: 'Não Pago', icon: ClockIcon, color: 'text-red-500' },
        { value: 'partially_paid', label: 'Parcialmente Pago', icon: ClockIcon, color: 'text-amber-500' },
        { value: 'paid', label: 'Pago', icon: CheckCircleIcon, color: 'text-green-500' },
    ]

    const deliveryStatusOptions = [
        { value: 'not_sent', label: 'Não Enviado', icon: ClockIcon },
        { value: 'preparing', label: 'Preparando', icon: ClockIcon },
        { value: 'sent', label: 'Enviado', icon: TruckIcon },
        { value: 'delivered', label: 'Entregue', icon: CheckCircleIcon },
        { value: 'pickup_available', label: 'Disponível para Retirada', icon: StoreIcon },
        { value: 'delivery_failed', label: 'Falha na Entrega', icon: AlertCircleIcon },
    ]

    const salesChannelOptions = [
        { value: 'Loja Física', label: 'Loja Física' },
        { value: 'WhatsApp', label: 'WhatsApp' },
        { value: 'Instagram', label: 'Instagram' },
        { value: 'Site / E-commerce', label: 'Site / E-commerce' },
        { value: 'Marketplace', label: 'Marketplace' },
        { value: 'Outros', label: 'Outros' },
    ]

    const deliveryMethodOptions = [
        { value: 'pickup', label: 'Retirada em Unidade' },
        { value: 'delivery', label: 'Entrega / Delivery' },
    ]

    return (
        <FadeIn className="flex flex-col h-full bg-white dark:bg-dark-background overflow-hidden relative z-[50]">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full w-full">
                <div 
                    ref={scrollContainerRef} 
                    className="flex-1 overflow-y-auto w-full relative pb-24 md:pb-8 scroll-smooth custom-scrollbar"
                >
                    {/* STICKY HEADER */}
                    <div className={`sticky top-0 z-30 w-full bg-white/80 dark:bg-dark-surface/80 backdrop-blur-md border-b transition-all duration-300 ${isScrolled ? "py-2" : "py-4"}`}>
                        <div className="max-w-[1300px] mx-auto px-4 md:px-8 flex flex-col gap-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <Button variant="ghost" size="icon" onClick={handleBack} className="w-10 h-10 rounded-full">
                                        <ChevronLeftIcon className="w-5 h-5" />
                                    </Button>
                                    <div>
                                        <h1 className={`font-bold text-brand-dark dark:text-dark-heading transition-all ${isScrolled ? "text-xl" : "text-2xl md:text-3xl"}`}>
                                            Nova Venda
                                        </h1>
                                        {!isScrolled && (
                                            <p className="text-brand-inactive-text dark:text-dark-body text-sm font-medium">
                                                Crie um novo pedido manualmente no sistema.
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    <Button variant="outline" onClick={handleBack} disabled={isSaving}>
                                        Cancelar
                                    </Button>
                                    <Button onClick={handleSave} isLoading={isSaving} disabled={isSaving}>
                                        <SaveIcon className="w-5 h-5 mr-2" />
                                        Finalizar Venda
                                    </Button>
                                </div>
                            </div>

                            <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0 h-auto">
                                <TabsTrigger value="Dados Gerais" className="px-0 py-2 text-[15px] border-b-2 border-transparent data-[state=active]:border-brand-primary data-[state=active]:text-brand-primary rounded-none bg-transparent">
                                    Dados Gerais
                                </TabsTrigger>
                                {deliveryMethod === 'delivery' && (
                                    <TabsTrigger value="Entrega" className="px-0 py-2 text-[15px] border-b-2 border-transparent data-[state=active]:border-brand-primary data-[state=active]:text-brand-primary rounded-none bg-transparent">
                                        Entrega
                                    </TabsTrigger>
                                )}
                                <TabsTrigger value="Observações" className="px-0 py-2 text-[15px] border-b-2 border-transparent data-[state=active]:border-brand-primary data-[state=active]:text-brand-primary rounded-none bg-transparent">
                                    Observações
                                </TabsTrigger>
                            </TabsList>
                        </div>
                    </div>

                    {/* CONTENT BODY */}
                    <div className="px-4 md:px-8 py-8 max-w-[1300px] mx-auto min-h-[500px]">
                        <AnimatePresence mode="wait">
                            {/* TAB: DADOS GERAIS */}
                            <TabsContent value="Dados Gerais" className="mt-0 focus-visible:outline-none">
                                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="grid grid-cols-12 gap-8">
                                    
                                    {/* Left Column (Items & Customer) */}
                                    <div className="col-span-12 lg:col-span-8 space-y-10">
                                        
                                        {/* 1. CUSTOMER SECTION */}
                                        <section>
                                            <h3 className="font-bold text-lg text-brand-dark dark:text-dark-heading mb-6 flex items-center gap-2">
                                                <UserIcon size={20} /> Cliente
                                            </h3>
                                            {selectedCustomer ? (
                                                <CustomerCard
                                                    customer={selectedCustomer}
                                                    onRemove={() => setSelectedCustomer(null)}
                                                />
                                            ) : (
                                                <IconPlaceholder
                                                    icon={UserIcon}
                                                    title="Nenhum cliente selecionado"
                                                    subtitle="Selecione um cliente para vincular à venda."
                                                    itemButton={{
                                                        text: "Selecionar Cliente",
                                                        action: () => setIsCustomerSheetOpen(true),
                                                        variant: "outline"
                                                    }}
                                                />
                                            )}
                                        </section>

                                        <div className="h-px bg-brand-border dark:bg-dark-border w-full" />

                                        {/* 2. ITEMS SECTION */}
                                        <section>
                                            <h3 className="font-bold text-lg text-brand-dark dark:text-dark-heading mb-6">Itens do Pedido</h3>
                                            
                                            <div className="relative mb-6">
                                                <FormInput
                                                    label=""
                                                    name="productSearch"
                                                    placeholder="Buscar produtos para adicionar..."
                                                    prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
                                                    value={searchQuery}
                                                    onChange={(e) => {
                                                        setSearchQuery(e.target.value)
                                                        setIsProductSearchOpen(true)
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
                                                            className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl shadow-xl z-20 max-h-60 overflow-y-auto"
                                                        >
                                                            {isSearching ? (
                                                                <div className="p-4 text-center text-sm text-brand-inactive-text">Buscando...</div>
                                                            ) : filteredProducts.length > 0 ? (
                                                                filteredProducts.map(product => (
                                                                    <div
                                                                        key={product.id}
                                                                        onClick={() => handleProductClick(product)}
                                                                        className="flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-dark-border cursor-pointer border-b border-brand-border dark:border-dark-border last:border-0"
                                                                    >
                                                                        <img src={product.image} className="w-10 h-10 rounded-full bg-gray-100 object-cover" alt="" />
                                                                        <div className="flex-1">
                                                                            <div className="text-sm font-bold text-brand-dark dark:text-dark-heading">{product.name}</div>
                                                                            <div className="text-xs text-brand-inactive-text">SKU: {product.sku}</div>
                                                                        </div>
                                                                        <div className="text-sm font-bold text-brand-dark dark:text-dark-heading">R$ {product.price}</div>
                                                                    </div>
                                                                ))
                                                            ) : (
                                                                <div className="p-4 text-center text-sm text-brand-inactive-text">Nada encontrado.</div>
                                                            )}
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </div>

                                            {/* Items Table */}
                                            {orderItems.length > 0 ? (
                                                <div className="w-full overflow-hidden border border-brand-border dark:border-dark-border rounded-2xl">
                                                    <table className="w-full text-left border-separate border-spacing-0">
                                                        <thead className="bg-brand-gray dark:bg-dark-border/30">
                                                            <tr>
                                                                <th className="py-3 pl-6 pr-4 text-[13px] font-bold text-gray-500">Produto</th>
                                                                <th className="py-3 px-4 text-[13px] font-bold text-gray-500 w-32">Preço</th>
                                                                <th className="py-3 px-4 text-[13px] font-bold text-gray-500 text-center w-36">Qtd.</th>
                                                                <th className="py-3 px-4 text-[13px] font-bold text-gray-500 text-right w-32">Total</th>
                                                                <th className="py-3 px-4 text-[13px] font-bold text-gray-500 text-center w-16"></th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-brand-border dark:divide-dark-border">
                                                            {orderItems.map((item, idx) => (
                                                                <tr key={item.id + idx} className="hover:bg-brand-gray/20 transition-colors">
                                                                    <td className="py-4 pl-6 pr-4">
                                                                        {item.isManual ? (
                                                                            <input 
                                                                                className="w-full bg-transparent border-none focus:outline-none font-bold text-[13px] text-brand-dark dark:text-dark-heading" 
                                                                                placeholder="Nome do produto..."
                                                                                value={item.name}
                                                                                onChange={(e) => updateItemName(idx, e.target.value)}
                                                                            />
                                                                        ) : (
                                                                            <div className="flex items-center gap-3">
                                                                                <img src={item.image} className="w-8 h-8 rounded-full border dark:border-dark-border bg-gray-50" alt="" />
                                                                                <div className="flex flex-col">
                                                                                    <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading truncate max-w-[200px]">{item.name}</span>
                                                                                    <span className="text-[10px] text-brand-inactive-text font-medium uppercase tracking-wider">{item.sku}</span>
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </td>
                                                                    <td className="py-4 px-4">
                                                                        <div className="flex items-center gap-1">
                                                                            <span className="text-xs font-bold text-brand-inactive-text">R$</span>
                                                                            <input 
                                                                                type="number"
                                                                                className="w-20 bg-transparent border-none focus:outline-none font-bold text-[13px]"
                                                                                value={item.price}
                                                                                onChange={(e) => updateItemPrice(idx, parseFloat(e.target.value) || 0)}
                                                                            />
                                                                        </div>
                                                                    </td>
                                                                    <td className="py-4 px-4 text-center">
                                                                        <div className="flex justify-center">
                                                                            <QuantitySelector value={item.qty} onChange={(val) => updateItemQty(idx, val)} size="sm" />
                                                                        </div>
                                                                    </td>
                                                                    <td className="py-4 px-4 text-right">
                                                                        <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">
                                                                            {(item.price * item.qty).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                                        </span>
                                                                    </td>
                                                                    <td className="py-4 px-4 text-center">
                                                                        <Button variant="ghost" size="icon" className="w-8 h-8 text-brand-red hover:bg-red-50" onClick={() => removeItem(idx)}>
                                                                            <TrashIcon size={14} />
                                                                        </Button>
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            ) : (
                                                <IconPlaceholder
                                                    placeholderType="image"
                                                    title="Nenhum item adicionado"
                                                    subtitle="Busque produtos acima para começar a montar o pedido."
                                                />
                                            )}

                                            <button 
                                                onClick={addBlankItem}
                                                className="mt-6 flex items-center gap-2 text-sm font-bold text-brand-dark dark:text-dark-heading hover:opacity-80 transition-opacity underline underline-offset-4 decoration-brand-border"
                                            >
                                                <PlusIcon size={14} strokeWidth={3} /> Adicionar item manual
                                            </button>
                                        </section>

                                    </div>

                                    {/* Right Column (Settings & Summary) */}
                                    <div className="col-span-12 lg:col-span-4 space-y-6">
                                        
                                        {/* Settings Card */}
                                        <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-6 shadow-sm">
                                            <h3 className="font-bold text-brand-dark dark:text-dark-heading mb-6">Informações do Pedido</h3>
                                            <div className="space-y-4">
                                                <FormInput 
                                                    label="Data da Venda" 
                                                    type="date" 
                                                    value={orderDate} 
                                                    onChange={e => setOrderDate(e.target.value)} 
                                                />
                                                <FormDropdown 
                                                    label="Canal de Venda" 
                                                    value={salesChannel} 
                                                    setValue={setSalesChannel} 
                                                    options={salesChannelOptions} 
                                                />
                                                <FormDropdown 
                                                    label="Método de Entrega" 
                                                    value={deliveryMethod} 
                                                    setValue={(val: any) => setDeliveryMethod(val)} 
                                                    options={deliveryMethodOptions} 
                                                />
                                                <FormDropdown 
                                                    label="Status do Pagamento" 
                                                    value={paymentStatus} 
                                                    setValue={(val: any) => setPaymentStatus(val)} 
                                                    options={statusOptions} 
                                                />
                                                <FormDropdown 
                                                    label="Status da Entrega" 
                                                    value={deliveryStatus} 
                                                    setValue={setDeliveryStatus} 
                                                    options={deliveryStatusOptions} 
                                                />
                                            </div>
                                        </div>

                                        {/* Totals Card */}
                                        <div className="bg-brand-gray/40 dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-6 overflow-hidden relative shadow-sm">
                                            <div className="absolute top-0 left-0 w-full h-1 bg-brand-primary" />
                                            <h3 className="font-bold text-brand-dark dark:text-dark-heading mb-6">Resumo Financeiro</h3>
                                            
                                            <div className="space-y-4 mb-8">
                                                <div className="flex justify-between items-center text-sm">
                                                    <span className="text-brand-inactive-text font-medium">Subtotal</span>
                                                    <span className="font-bold text-brand-dark dark:text-dark-heading">{subtotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                                                </div>

                                                <div className="grid grid-cols-1 gap-2">
                                                    <div className="flex justify-between items-center text-sm mb-1">
                                                        <span className="text-brand-inactive-text font-medium">Desconto</span>
                                                        <span className="font-bold text-brand-red">-{discountValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                                                    </div>
                                                    <div className="relative">
                                                        {discountType === 'R$' ? (
                                                            <MoneyInput
                                                                label=""
                                                                value={discount}
                                                                onChange={(val) => setDiscount(val.toString())}
                                                                className="h-10 text-[13px] font-bold"
                                                                suffix={
                                                                    <div className="flex items-center gap-2 ml-2 pl-2 border-l border-brand-border text-[11px]">
                                                                        <button onClick={() => setDiscountType('R$')} className="font-black text-brand-primary">R$</button>
                                                                        <span className="text-brand-border">|</span>
                                                                        <button onClick={() => setDiscountType('%')} className="font-bold text-brand-inactive-text hover:text-brand-primary">%</button>
                                                                    </div>
                                                                }
                                                            />
                                                        ) : (
                                                            <PercentageInput
                                                                label=""
                                                                value={discount}
                                                                onChange={(val) => setDiscount(val.toString())}
                                                                className="h-10 text-[13px] font-bold"
                                                                suffix={
                                                                    <div className="flex items-center gap-2 ml-2 pl-2 border-l border-brand-border text-[11px]">
                                                                        <button onClick={() => setDiscountType('R$')} className="font-bold text-brand-inactive-text hover:text-brand-primary">R$</button>
                                                                        <span className="text-brand-border">|</span>
                                                                        <button onClick={() => setDiscountType('%')} className="font-black text-brand-primary">%</button>
                                                                    </div>
                                                                }
                                                            />
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 gap-4">
                                                    <FormCurrencyInput 
                                                        label="Frete" 
                                                        value={parseFloat(shippingFee)} 
                                                        onChange={(val: number) => setShippingFee(val.toString())}
                                                    />
                                                    <FormCurrencyInput 
                                                        label="Acréscimos" 
                                                        value={parseFloat(otherCosts)} 
                                                        onChange={(val: number) => setOtherCosts(val.toString())}
                                                    />
                                                </div>
                                            </div>

                                            <div className="h-px bg-brand-border dark:bg-dark-border w-full my-4" />

                                            <div className="flex justify-between items-center pt-2">
                                                <span className="text-lg font-bold text-brand-dark dark:text-dark-heading">Total</span>
                                                <span className="text-2xl font-black text-brand-primary">
                                                    {total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                </span>
                                            </div>
                                        </div>

                                    </div>
                                </motion.div>
                            </TabsContent>

                            {/* TAB: ENTREGA (CONDITIONAL) */}
                            {deliveryMethod === 'delivery' && (
                                <TabsContent value="Entrega" className="mt-0 focus-visible:outline-none">
                                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="grid grid-cols-12 gap-8">
                                        
                                        <div className="col-span-12 lg:col-span-8 space-y-8">
                                            <section>
                                                <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6">Endereço de Entrega</h3>
                                                <div className="space-y-4 max-w-[600px]">
                                                    <CepInput
                                                        label="CEP"
                                                        value={address.zipCode}
                                                        onChange={(val: string) => setAddress({ ...address, zipCode: val })}
                                                        onAddressFetched={(data: any) => {
                                                            setAddress(prev => ({
                                                                ...prev,
                                                                street: data.street || prev.street,
                                                                neighborhood: data.neighborhood || prev.neighborhood,
                                                                city: data.city || prev.city,
                                                                state: data.state || prev.state,
                                                            }))
                                                        }}
                                                    />
                                                    <FormInput
                                                        label="Logradouro"
                                                        placeholder="Rua, Avenida, etc."
                                                        value={address.street}
                                                        onChange={e => setAddress({ ...address, street: e.target.value })}
                                                    />

                                                    <div className="grid grid-cols-2 gap-4">
                                                        <NumberInputWithCheckbox
                                                            label="Número"
                                                            value={address.number}
                                                            number={address.number}
                                                            noNumber={address.noNumber}
                                                            onNumberChange={(e: any) => setAddress({ ...address, number: e.target.value })}
                                                            onNoNumberChange={(checked: boolean) => setAddress({ ...address, noNumber: checked, number: checked ? "S/N" : "" })}
                                                        />
                                                        <FormInput
                                                            label="Complemento"
                                                            placeholder="Apto, Bloco, etc."
                                                            value={address.complement}
                                                            onChange={e => setAddress({ ...address, complement: e.target.value })}
                                                        />
                                                    </div>

                                                    <FormInput
                                                        label="Bairro"
                                                        placeholder="Nome do bairro"
                                                        value={address.neighborhood}
                                                        onChange={e => setAddress({ ...address, neighborhood: e.target.value })}
                                                    />

                                                    <div className="grid grid-cols-2 gap-4">
                                                        <FormInput
                                                            label="Cidade"
                                                            placeholder="Nome da cidade"
                                                            value={address.city}
                                                            onChange={e => setAddress({ ...address, city: e.target.value })}
                                                        />
                                                        <StateComboBox
                                                            label="UF"
                                                            value={address.state}
                                                            onChange={(v: string) => setAddress({ ...address, state: v })}
                                                        />
                                                    </div>
                                                </div>
                                            </section>
                                        </div>

                                        <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 border-l-0 lg:border-l border-brand-border dark:border-dark-border">
                                            <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden flex flex-col shadow-sm">
                                                <div className="absolute top-0 left-0 w-full h-1 bg-brand-primary" />
                                                <div className="p-4 flex items-center justify-between border-b border-brand-border border-opacity-60">
                                                    <h3 className="font-bold text-brand-dark dark:text-dark-heading">Localização</h3>
                                                </div>
                                                <div className="p-4 flex flex-col">
                                                    <div
                                                        className="w-full h-[150px] bg-gray-200 dark:bg-dark-border rounded-lg relative overflow-hidden mb-4 flex items-center justify-center cursor-pointer group"
                                                        onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${address.street}, ${address.number}, ${address.city} - ${address.state}`)}`, '_blank')}
                                                    >
                                                        <div className="absolute inset-0 bg-[url('https://img.dudit.com.br/static/map_placeholder.png')] bg-cover opacity-60 group-hover:opacity-100 transition-opacity" />
                                                        <div className="relative z-10 flex flex-col items-center">
                                                            <div className="w-10 h-10 rounded-full bg-brand-primary flex items-center justify-center text-white shadow-xl animate-bounce">
                                                                <TruckIcon size={20} />
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col text-left">
                                                        <h4 className="font-bold text-brand-dark dark:text-dark-heading text-[15px] mb-1">Ponto de Entrega</h4>
                                                        <p className="text-brand-inactive-text text-[13px] leading-snug">
                                                            {address.street ? `${address.street}, ${address.number}` : 'Endereço não informado'}
                                                        </p>
                                                        <p className="text-brand-inactive-text text-[13px] leading-snug">
                                                            {address.city ? `${address.city} - ${address.state}` : 'Cidade não informada'}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                </TabsContent>
                            )}

                            {/* TAB: OBSERVAÇÕES */}
                            <TabsContent value="Observações" className="mt-0 focus-visible:outline-none">
                                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6">Notas Internas / Observações</h3>
                                    <div className="bg-brand-gray/40 dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-5 h-[400px]">
                                        <textarea
                                            className="w-full h-full bg-transparent border-none text-[15px] text-brand-dark dark:text-dark-heading leading-relaxed focus:outline-none resize-none placeholder:text-brand-inactive-text font-medium"
                                            placeholder="Adicione termos, condições ou notas internas sobre este pedido..."
                                            value={internalNote}
                                            onChange={(e) => setInternalNote(e.target.value)}
                                        ></textarea>
                                    </div>
                                </motion.div>
                            </TabsContent>

                        </AnimatePresence>
                    </div>
                </div>
            </Tabs>

            {/* SHEETS & MODALS */}
            <SelectCustomerSheet
                isOpen={isCustomerSheetOpen}
                onClose={() => setIsCustomerSheetOpen(false)}
                onSelect={(customer) => {
                    setSelectedCustomer(customer)
                    setIsCustomerSheetOpen(false)
                }}
            />

            <SelectVariantSheet
                isOpen={isVariantSheetOpen}
                onClose={() => setIsVariantSheetOpen(false)}
                product={activeProductForVariants}
                onConfirm={handleVariantConfirm}
            />

            <AlertModal
                isOpen={showUnsavedAlert}
                onClose={() => setShowUnsavedAlert(false)}
                onConfirm={() => {
                    setShowUnsavedAlert(false)
                    onBack()
                }}
                title="Descartar Alterações?"
                description="Você tem alterações não salvas no pedido. Se sair agora, todas as informações serão perdidas."
                confirmText="Sair sem Salvar"
                cancelText="Continuar Editando"
                variant="danger"
            />
        </FadeIn>
    )
}
