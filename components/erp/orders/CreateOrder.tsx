"use client"

import React, { useState, useCallback, useRef, useMemo, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { 
    Tabs, TabsList, TabsTrigger, 
    Button, Badge, Tooltip, 
    FormDropdown, FormCurrencyInput,
    IconPlaceholder, AlertModal, CustomerCard,
    FormTextarea
} from "@/components/reusable"
import { 
    ChevronLeftIcon, TrashIcon, PlusIcon, 
    SearchIcon, SaveIcon, 
    ClockIcon, UserIcon, ShoppingCart,
    Package, MoneyIcon, FileIcon,
    TagIcon
} from "@/lib/icons"
import { useToast } from "@/components/ui/use-toast"
import { useNotification } from "@/hooks/use-notification"
import { createERPOrderAction } from "@/app/actions/erp/orders"
import SelectCustomerSheet from "../clientes/SelectCustomerSheet"
import SelectVariantSheet from "../quotes/SelectVariantSheet"
import { searchProductsForQuote } from "@/app/actions/erp/quotes"
import { FadeIn } from "@/components/animations/FadeIn"
import QuantitySelector from "@/components/reusable/QuantitySelector"
import { useRouter } from "next/navigation"

interface CreateOrderProps {
    onBack: () => void
    partnerId: string
}

export default function CreateOrder({ onBack, partnerId }: CreateOrderProps) {
    const { toast } = useToast()
    const { success: notifySuccess, error: notifyError } = useNotification()
    const router = useRouter()

    // --- State ---
    const [activeTab, setActiveTab] = useState("general")
    const [isScrolled, setIsScrolled] = useState(false)
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const [isSaving, setIsSaving] = useState(false)

    // Form State
    const [selectedCustomer, setSelectedCustomer] = useState<any>(null)
    const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0])
    const [salesChannel, setSalesChannel] = useState("Direct Sales")
    const [deliveryMethod, setDeliveryMethod] = useState<'delivery' | 'pickup'>("pickup")
    const [paymentStatus, setPaymentStatus] = useState<'paid' | 'partially_paid' | 'unpaid'>("unpaid")
    const [deliveryStatus, setDeliveryStatus] = useState('not_sent')
    
    // Items
    const [items, setItems] = useState<any[]>([])
    const [searchTerm, setSearchTerm] = useState("")
    const [isSearchingProduct, setIsSearchingProduct] = useState(false)
    const [searchResults, setSearchResults] = useState<any[]>([])

    // Financial
    const [shippingFee, setShippingFee] = useState("0")
    const [otherCosts, setOtherCosts] = useState("0")
    const [discountValue, setDiscountValue] = useState(0)
    const [discountType, setDiscountType] = useState<'fixed' | 'percentage'>('fixed')

    // Observações
    const [notes, setNotes] = useState("")

    // Modals
    const [isCustomerSheetOpen, setIsCustomerSheetOpen] = useState(false)
    const [isVariantSheetOpen, setIsVariantSheetOpen] = useState(false)
    const [selectedProductForVariant, setSelectedProductForVariant] = useState<any>(null)
    const [showAlertModal, setShowAlertModal] = useState(false)

    // --- Calculations ---
    const subtotal = useMemo(() => {
        return items.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0)
    }, [items])

    const discountAmount = useMemo(() => {
        if (discountType === 'percentage') {
            return (subtotal * discountValue) / 100
        }
        return discountValue
    }, [subtotal, discountValue, discountType])

    const totalAmount = useMemo(() => {
        return subtotal - discountAmount + parseFloat(shippingFee || "0") + parseFloat(otherCosts || "0")
    }, [subtotal, discountAmount, shippingFee, otherCosts])

    // --- Handlers ---
    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
    }, [])

    const handleBack = () => {
        if (items.length > 0 || selectedCustomer) {
            setShowAlertModal(true)
        } else {
            onBack()
        }
    }

    const handleSearchProduct = async (term: string) => {
        setSearchTerm(term)
        if (term.length < 2) {
            setSearchResults([])
            return
        }
        setIsSearchingProduct(true)
        try {
            const results = await searchProductsForQuote(term)
            setSearchResults(results)
        } catch (error) {
            console.error(error)
        } finally {
            setIsSearchingProduct(false)
        }
    }

    const addProductToOrder = (product: any) => {
        if (product.has_variants) {
            setSelectedProductForVariant(product)
            setIsVariantSheetOpen(true)
        } else {
            const newItem = {
                id: Math.random().toString(36).substr(2, 9),
                productId: product.id,
                name: product.name,
                unitPrice: product.price,
                quantity: 1,
                image: product.image,
                sku: product.sku
            }
            setItems([...items, newItem])
            setSearchTerm("")
            setSearchResults([])
        }
    }

    const handleVariantsConfirm = (variants: any[]) => {
        const newItems: any[] = []
        variants.forEach(variant => {
            if (variant.qty > 0) {
                const newItem = {
                    id: Math.random().toString(36).substr(2, 9),
                    productId: selectedProductForVariant.id,
                    variantId: variant.id,
                    name: `${selectedProductForVariant.name} - ${variant.name}`,
                    unitPrice: variant.price || selectedProductForVariant.price,
                    quantity: variant.qty,
                    image: variant.image || selectedProductForVariant.image,
                    sku: variant.sku || selectedProductForVariant.sku
                }
                newItems.push(newItem)
            }
        })
        if (newItems.length > 0) {
            setItems([...items, ...newItems])
        }
        setIsVariantSheetOpen(false)
        setSearchTerm("")
        setSearchResults([])
    }

    const updateItemQuantity = (id: string, qty: number) => {
        setItems(items.map(item => item.id === id ? { ...item, quantity: qty } : item))
    }

    const removeItem = (id: string) => {
        setItems(items.filter(item => item.id !== id))
    }

    const handleSaveOrder = async () => {
        if (items.length === 0) {
            notifyError("Adicione pelo menos um item ao pedido.")
            return
        }
        setIsSaving(true)
        try {
            const result = await createERPOrderAction({
                partnerId,
                customerId: selectedCustomer?.id,
                customerName: selectedCustomer ? selectedCustomer.name : "Venda Rápida",
                orderDate,
                salesChannel,
                deliveryMethod,
                paymentStatus,
                deliveryStatus: deliveryStatus as any,
                items: items.map((item, idx) => ({
                    productId: item.productId,
                    customName: item.name,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                    sortOrder: idx
                })),
                subtotal,
                discountValue: discountAmount,
                discountType: 'fixed',
                shippingCost: parseFloat(shippingFee || "0"),
                additionalCosts: parseFloat(otherCosts || "0"),
                totalAmount,
                notes
            })

            if (result.success) {
                notifySuccess("Pedido criado com sucesso!")
                onBack()
            } else {
                notifyError(result.error || "Erro ao criar pedido")
            }
        } catch (error) {
            notifyError("Erro ao processar pedido")
        } finally {
            setIsSaving(false)
        }
    }

    const salesChannelOptions = [
        { value: "Direct Sales", label: "Venda Direta" },
        { value: "Online Store", label: "Loja Online" },
        { value: "WhatsApp", label: "WhatsApp" },
        { value: "Instagram", label: "Instagram" }
    ]

    const deliveryMethodOptions = [
        { value: "pickup", label: "Retirada pessoalmente" },
        { value: "delivery", label: "Entrega / Delivery" }
    ]

    const statusOptions = [
        { value: "unpaid", label: "Não pago", color: "#ef4444" },
        { value: "paid", label: "Pago", color: "#10b981" },
        { value: "partially_paid", label: "Parcialmente Pago", color: "#f59e0b" }
    ]

    const deliveryStatusOptions = [
        { value: "not_sent", label: "Não enviado" },
        { value: "preparing", label: "Preparando" },
        { value: "sent", label: "Enviado" },
        { value: "delivered", label: "Entregue" }
    ]

    return (
        <div className="flex flex-col h-screen bg-white dark:bg-dark-background overflow-hidden relative">
            <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-10">
                
                {/* --- STICKY HEADER --- */}
                <div className="sticky top-0 z-30 w-full bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out">
                    <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">
                        
                        <div className={`absolute -left-12 top-7 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                            <Button variant="filled" onClick={handleBack} className="w-10 h-10 p-0 flex items-center justify-center">
                                <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                            </Button>
                        </div>

                        <div className="hidden md:flex items-start justify-between md:py-0 md:mb-0">
                            <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                <h1 className={`font-bold transition-all duration-500 ease-in-out flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                    <span className="hidden md:inline truncate">Novo Pedido</span>
                                </h1>
                                <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                    Preencha as informações da nova venda
                                </div>
                            </div>

                            <div className="hidden md:flex items-center gap-3 flex-shrink-0 ml-3">
                                <Button variant="outline" onClick={handleBack} disabled={isSaving}>
                                    Cancelar
                                </Button>
                                <Button onClick={handleSaveOrder} disabled={isSaving}>
                                    <SaveIcon className="w-5 h-5 mr-2" />
                                    {isSaving ? "Salvando..." : "Finalizar Venda"}
                                </Button>
                            </div>
                        </div>

                        <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                                <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                    <TabsTrigger value="general">Dados gerais</TabsTrigger>
                                    <TabsTrigger value="observations">Observações</TabsTrigger>
                                </TabsList>
                            </Tabs>
                        </div>
                    </div>
                </div>

                <div className="px-4 md:px-6 py-8 max-w-[1300px] mx-auto min-h-[400px]">
                    <div className={activeTab === "general" ? "block" : "hidden"}>
                        <FadeIn>
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                                <div className="lg:col-span-8 flex flex-col gap-8">
                                    <section>
                                        <div className="flex items-center justify-between mb-4">
                                            <h2 className="text-lg font-bold text-brand-dark dark:text-dark-heading flex items-center gap-2">
                                                <ShoppingCart size={20} className="text-brand-green" />
                                                Itens do pedido
                                            </h2>
                                        </div>

                                        <div className="relative mb-6">
                                            <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-inactive-text" size={18} />
                                            <input 
                                                type="text"
                                                placeholder="Buscar produtos para adicionar..."
                                                className="w-full h-12 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl pl-11 pr-4 text-sm focus:border-brand-green focus:outline-none focus:ring-0 transition-colors"
                                                value={searchTerm}
                                                onChange={(e) => handleSearchProduct(e.target.value)}
                                            />
                                            
                                            <AnimatePresence>
                                                {searchResults.length > 0 && (
                                                    <motion.div 
                                                        initial={{ opacity: 0, y: 10 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        exit={{ opacity: 0, y: 10 }}
                                                        className="absolute top-14 left-0 right-0 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl shadow-2xl z-[50] max-h-[400px] overflow-y-auto custom-scrollbar"
                                                    >
                                                        {searchResults.map(p => (
                                                            <button 
                                                                key={p.id}
                                                                onClick={() => addProductToOrder(p)}
                                                                className="w-full flex items-center gap-4 p-4 hover:bg-brand-gray/30 dark:hover:bg-dark-border/30 border-b border-brand-border dark:border-dark-border last:border-0 transition-colors text-left group"
                                                            >
                                                                <div className="w-12 h-12 rounded-lg bg-brand-gray/50 overflow-hidden flex-shrink-0">
                                                                    {p.image ? <img src={p.image} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Package size={20} /></div>}
                                                                </div>
                                                                <div className="flex-1 min-w-0">
                                                                    <h4 className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate group-hover:text-brand-green">{p.name}</h4>
                                                                    <p className="text-xs text-brand-inactive-text">SKU: {p.sku || 'N/A'}</p>
                                                                </div>
                                                                <div className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p.price)}
                                                                </div>
                                                                <PlusIcon size={18} className="text-brand-inactive-text opacity-0 group-hover:opacity-100 transition-opacity" />
                                                            </button>
                                                        ))}
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>

                                        <div className="space-y-4">
                                            {items.length > 0 ? (
                                                <div className="border border-brand-border dark:border-dark-border rounded-2xl overflow-hidden divide-y divide-brand-border dark:divide-dark-border">
                                                    {items.map(item => (
                                                        <div key={item.id} className="p-4 flex items-center gap-4 bg-white dark:bg-dark-surface">
                                                            <div className="w-12 h-12 rounded-lg bg-brand-gray/50 overflow-hidden flex-shrink-0">
                                                                {item.image ? <img src={item.image} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Package size={20} /></div>}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <h4 className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate">{item.name}</h4>
                                                                <p className="text-xs text-brand-inactive-text">SKU: {item.sku || 'N/A'}</p>
                                                            </div>
                                                            <div className="flex items-center gap-6">
                                                                <div className="w-24">
                                                                    <QuantitySelector 
                                                                        value={item.quantity} 
                                                                        onChange={(val) => updateItemQuantity(item.id, val)}
                                                                    />
                                                                </div>
                                                                <div className="text-sm font-bold text-brand-dark dark:text-dark-heading w-24 text-right">
                                                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.unitPrice * item.quantity)}
                                                                </div>
                                                                <button onClick={() => removeItem(item.id)} className="p-2 text-brand-red hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                                                                    <TrashIcon size={18} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="py-12 border-2 border-dashed border-brand-border dark:border-dark-border rounded-2xl flex flex-col items-center justify-center text-center px-6">
                                                    <div className="w-16 h-16 rounded-full bg-brand-gray/50 flex items-center justify-center mb-4">
                                                        <Package size={32} className="text-brand-inactive-text" />
                                                    </div>
                                                    <h3 className="font-bold text-brand-dark dark:text-dark-heading mb-1">Nenhum produto adicionado</h3>
                                                    <p className="text-sm text-brand-inactive-text">Busque produtos acima para adicionar ao pedido.</p>
                                                </div>
                                            )}
                                        </div>
                                    </section>

                                    <div className="h-px bg-brand-border dark:bg-dark-border w-full my-4" />

                                    <section className="flex flex-col gap-6">
                                        <h2 className="text-lg font-bold text-brand-dark dark:text-dark-heading flex items-center gap-2">
                                            <MoneyIcon size={20} className="text-brand-green" />
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
                                            <Button variant="filled" className="h-9 px-6 bg-brand-green hover:bg-brand-green-dark">
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
                                                variant="filled" 
                                                size="lg" 
                                                className="w-full mt-6 bg-[#86cbb4] hover:bg-[#75b49f] border-0 text-white font-bold text-lg rounded-full"
                                                onClick={handleSaveOrder}
                                                disabled={isSaving}
                                            >
                                                Ir para Pagamento
                                            </Button>
                                        </div>
                                    </section>
                                </div>

                                <div className="lg:col-span-4 flex flex-col gap-8">
                                    <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-6 flex flex-col gap-6 shadow-sm">
                                        <h3 className="font-bold text-lg text-brand-dark dark:text-dark-heading leading-tight">Configurações do Pedido</h3>
                                        
                                        <div className="space-y-4">
                                            <div>
                                                <label className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-1.5 block">Data do Pedido</label>
                                                <div className="relative">
                                                    <input 
                                                        type="date"
                                                        className="w-full h-11 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl px-4 text-sm focus:border-brand-green focus:outline-none transition-colors"
                                                        value={orderDate}
                                                        onChange={(e) => setOrderDate(e.target.value)}
                                                    />
                                                    <ClockIcon className="absolute right-4 top-1/2 -translate-y-1/2 text-brand-inactive-text pointer-events-none" size={18} />
                                                </div>
                                            </div>

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

                                            <div>
                                                <label className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-1.5 block">Status de pagamento</label>
                                                <div className="relative">
                                                    <select 
                                                        className="w-full h-11 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl pl-10 pr-4 text-sm focus:border-brand-green focus:outline-none appearance-none transition-colors"
                                                        value={paymentStatus}
                                                        onChange={(e) => setPaymentStatus(e.target.value as any)}
                                                    >
                                                        {statusOptions.map(opt => (
                                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                        ))}
                                                    </select>
                                                    <div className="absolute left-4 top-1/2 -translate-y-1/2">
                                                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: statusOptions.find(o => o.value === paymentStatus)?.color }} />
                                                    </div>
                                                </div>
                                            </div>

                                            <div>
                                                <label className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-1.5 block">Status de entrega</label>
                                                <div className="relative">
                                                    <select 
                                                        className="w-full h-11 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl pl-10 pr-4 text-sm focus:border-brand-green focus:outline-none appearance-none transition-colors"
                                                        value={deliveryStatus}
                                                        onChange={(e) => setDeliveryStatus(e.target.value)}
                                                    >
                                                        {deliveryStatusOptions.map(opt => (
                                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                        ))}
                                                    </select>
                                                    <div className="absolute left-4 top-1/2 -translate-y-1/2">
                                                        <div className="w-2 h-2 rounded-full bg-gray-200" />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        {selectedCustomer ? (
                                            <CustomerCard 
                                                customer={selectedCustomer}
                                                onRemove={() => setSelectedCustomer(null)}
                                            />
                                        ) : (
                                            <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-8 flex flex-col items-center justify-center text-center shadow-sm relative overflow-hidden">
                                                <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark opacity-10"></div>
                                                <div className="flex items-center gap-2 mb-6 w-full justify-start border-b border-brand-border dark:border-dark-border pb-4 -mt-2 -mx-2 px-2">
                                                    <UserIcon size={18} className="text-brand-dark dark:text-dark-heading" />
                                                    <span className="font-bold text-[15px] text-brand-dark dark:text-dark-heading">Cliente</span>
                                                </div>
                                                
                                                <div className="w-12 h-12 rounded-full bg-brand-gray/50 flex items-center justify-center mb-4">
                                                    <UserIcon size={24} className="text-brand-inactive-text" />
                                                </div>
                                                <h4 className="font-bold text-sm text-brand-dark dark:text-dark-heading mb-1">Nenhum cliente selecionado</h4>
                                                <p className="text-xs text-brand-inactive-text mb-6">Selecione um cliente para vincular ao pedido.</p>
                                                
                                                <Button variant="outline" className="rounded-full px-8" onClick={() => setIsCustomerSheetOpen(true)}>
                                                    Selecionar Cliente
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </FadeIn>
                    </div>

                    <div className={activeTab === "observations" ? "block" : "hidden"}>
                        <FadeIn>
                            <div className="max-w-[800px] flex flex-col gap-4">
                                <h2 className="text-lg font-bold text-brand-dark dark:text-dark-heading flex items-center gap-2">
                                    <FileIcon size={20} className="text-brand-green" />
                                    Observações do Pedido
                                </h2>
                                <p className="text-sm text-brand-inactive-text">Estas informações são apenas para uso interno e não aparecerão para o cliente.</p>
                                <FormTextarea 
                                    name="notes"
                                    label=""
                                    placeholder="Escreva aqui observações internas sobre este pedido..."
                                    value={notes}
                                    onChange={(e: any) => setNotes(e.target.value)}
                                    className="min-h-[250px]"
                                />
                            </div>
                        </FadeIn>
                    </div>
                </div>
            </div>

            <SelectCustomerSheet 
                isOpen={isCustomerSheetOpen}
                onClose={() => setIsCustomerSheetOpen(false)}
                onSelect={(customer) => setSelectedCustomer(customer)}
            />

            <SelectVariantSheet 
                isOpen={isVariantSheetOpen}
                onClose={() => setIsVariantSheetOpen(false)}
                product={selectedProductForVariant}
                onConfirm={handleVariantsConfirm}
            />

            <AlertModal 
                isOpen={showAlertModal}
                onClose={() => setShowAlertModal(false)}
                onConfirm={onBack}
                title="Descartar alterações?"
                description="Você tem dados preenchidos que não foram salvos. Deseja realmente sair e descartar tudo?"
                confirmText="Sair e Descartar"
                variant="warning"
            />
        </div>
    )
}
