"use client"

import React, { useState, useCallback, useRef, useMemo, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
    Tabs, TabsList, TabsTrigger, TabsContent,
    Button, Badge, Tooltip,
    FormDropdown, FormCurrencyInput,
    IconPlaceholder, AlertModal, CustomerCard,
    FormTextarea, Input
} from "@/components/reusable"
import {
    ChevronLeftIcon, TrashIcon, PlusIcon,
    SearchIcon, SaveIcon,
    ClockIcon, UserIcon, ShoppingCart,
    Package, MoneyIcon, FileIcon,
    TagIcon, CheckIcon, EditIcon
} from "@/lib/icons"
import { CepInput } from "@/components/reusable/Inputs/CepInput"
import { StateComboBox } from "@/components/reusable/Inputs/StateComboBox"
import { NumberInputWithCheckbox } from "@/components/reusable/Inputs/NumberInputWithCheckbox"
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

    // items
    const [items, setItems] = useState<any[]>([])
    const [searchQuery, setSearchQuery] = useState("")
    const [isProductSearchOpen, setIsProductSearchOpen] = useState(false)
    const [isSearching, setIsSearching] = useState(false)
    const [searchResults, setSearchResults] = useState<any[]>([])

    // Financial
    const [shippingFee, setShippingFee] = useState("0")
    const [otherCosts, setOtherCosts] = useState("0")
    const [discountValue, setDiscountValue] = useState(0)
    const [discountType, setDiscountType] = useState<'fixed' | 'percentage'>('fixed')

    // Address / Delivery
    const [cep, setCep] = useState("")
    const [street, setStreet] = useState("")
    const [number, setNumber] = useState("")
    const [complement, setComplement] = useState("")
    const [neighborhood, setNeighborhood] = useState("")
    const [city, setCity] = useState("")
    const [uf, setUf] = useState("SP")
    const [noNumber, setNoNumber] = useState(false)

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
        setSearchQuery(term)
        if (term.length < 2) {
            setSearchResults([])
            return
        }
        setIsSearching(true)
        try {
            const results = await searchProductsForQuote(term)
            setSearchResults(results)
        } catch (error) {
            console.error(error)
        } finally {
            setIsSearching(false)
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
                sku: product.sku,
                isEditing: false
            }
            setItems([...items, newItem])
            setSearchQuery("")
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
                    sku: variant.sku || selectedProductForVariant.sku,
                    isEditing: false
                }
                newItems.push(newItem)
            }
        })
        if (newItems.length > 0) {
            setItems([...items, ...newItems])
        }
        setIsVariantSheetOpen(false)
        setSearchQuery("")
        setSearchResults([])
    }

    const updateItemField = (index: number, field: string, value: any) => {
        const newItems = [...items]
        newItems[index][field] = value
        setItems(newItems)
    }

    const updateItemPrice = (index: number, price: number) => {
        const newItems = [...items]
        newItems[index].unitPrice = price
        setItems(newItems)
    }

    const updateItemQty = (index: number, qty: number) => {
        const newItems = [...items]
        newItems[index].quantity = qty
        setItems(newItems)
    }

    const toggleItemEdit = (index: number, isEditing: boolean) => {
        const newItems = [...items]
        newItems[index].isEditing = isEditing
        setItems(newItems)
    }

    const addBlankItem = () => {
        const newItem = {
            id: Math.random().toString(36).substr(2, 9),
            name: "",
            unitPrice: 0,
            quantity: 1,
            isEditing: true,
            sku: ""
        }
        setItems([...items, newItem])
    }

    const removeItem = (index: number) => {
        const newItems = [...items]
        newItems.splice(index, 1)
        setItems(newItems)
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
                address: deliveryMethod === 'delivery' ? {
                    zipCode: cep,
                    street,
                    number,
                    complement,
                    neighborhood,
                    city,
                    state: uf
                } : undefined,
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
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-screen bg-white dark:bg-dark-background overflow-hidden relative">
            <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-10">

                {/* --- STICKY HEADER --- */}
                <div className="sticky top-0 z-30 w-full bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out">
                    <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">

                        {/* Back button — desktop only */}
                        <div className={`absolute -left-12 top-7 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                            <Button variant="filled" onClick={handleBack} className="w-10 h-10 p-0 flex items-center justify-center">
                                <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                            </Button>
                        </div>

                        {/* Title and Actions */}
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

                        {/* Tabs Navigation */}
                        <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                            <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                <TabsTrigger value="general">Dados gerais</TabsTrigger>
                                {deliveryMethod === 'delivery' && <TabsTrigger value="delivery">Entrega</TabsTrigger>}
                                <TabsTrigger value="observations">Observações</TabsTrigger>
                            </TabsList>
                        </div>
                    </div>
                </div>

                <div className="px-4 md:px-6 py-8 max-w-[1300px] mx-auto min-h-[400px]">
                    <TabsContent value="general" className="mt-0">
                        <FadeIn>
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                                <div className="lg:col-span-8 flex flex-col gap-8">
                                    {/* 1. PRODUCT SEARCH & TABLE */}
                                    <section>
                                        <h3 className="font-bold text-lg text-brand-dark dark:text-dark-heading mb-6 flex items-center gap-2">
                                            <ShoppingCart size={20} className="text-brand-green" />
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
                                                className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-8 flex flex-col items-center justify-center text-center relative overflow-hidden cursor-pointer group hover:bg-brand-gray/30 dark:hover:bg-dark-border/30 transition-colors"
                                                onClick={() => setIsCustomerSheetOpen(true)}
                                            >
                                                <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark opacity-10"></div>
                                                <div className="flex items-center gap-2 mb-6 w-full justify-start border-b border-brand-border dark:border-dark-border pb-4 -mt-2 -mx-2 px-2">
                                                    <UserIcon size={18} className="text-brand-dark dark:text-dark-heading" />
                                                    <span className="font-bold text-[15px] text-brand-dark dark:text-dark-heading">Cliente</span>
                                                </div>

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
                                </div>
                            </div>
                        </FadeIn>
                    </TabsContent>

                    <TabsContent value="delivery" className="mt-0">
                        <FadeIn>
                            <div className="max-w-[800px] space-y-10">
                                <section>
                                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6">Endereço de Entrega</h3>
                                    <div className="space-y-4">
                                        <CepInput
                                            label="CEP"
                                            placeholder="00000-000"
                                            value={cep}
                                            onChange={setCep}
                                            name="cep"
                                            onAddressFetched={(data) => {
                                                setStreet(data.street)
                                                setNeighborhood(data.neighborhood)
                                                setCity(data.city)
                                                setUf(data.state || "SP")
                                            }}
                                        />
                                        <Input label="Logradouro" placeholder="Rua, Avenida, etc." value={street} onChange={(e: any) => setStreet(e.target.value)} />

                                        <div className="grid grid-cols-2 gap-3 flex-row items-center pt-1.5 pb-1.5">
                                            <NumberInputWithCheckbox
                                                label="Número"
                                                value={number}
                                                number={number}
                                                noNumber={noNumber}
                                                onNumberChange={(e: any) => setNumber(e.target.value)}
                                                onNoNumberChange={checked => { setNoNumber(checked); if (checked) setNumber(""); }}
                                            />
                                            <Input label="Complemento" placeholder="Apto, Bloco, etc." value={complement} onChange={(e: any) => setComplement(e.target.value)} />
                                        </div>
                                        <Input label="Bairro" placeholder="Nome do bairro" value={neighborhood} onChange={(e: any) => setNeighborhood(e.target.value)} />

                                        <div className="grid grid-cols-2 gap-3 items-end">
                                            <Input label="Cidade" placeholder="Nome da cidade" value={city} onChange={(e: any) => setCity(e.target.value)} />
                                            <StateComboBox
                                                label="Estado"
                                                value={uf}
                                                onChange={setUf}
                                                className="w-full"
                                            />
                                        </div>
                                    </div>
                                </section>
                            </div>
                        </FadeIn>
                    </TabsContent>

                    <TabsContent value="observations" className="mt-0">
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
                    </TabsContent>
                </div>
            </div>

            <SelectCustomerSheet
                isOpen={isCustomerSheetOpen}
                onClose={() => setIsCustomerSheetOpen(false)}
                onSelect={(customer) => {
                    setSelectedCustomer(customer)
                    setIsCustomerSheetOpen(false)
                }}
                partnerId={partnerId}
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
                onConfirm={() => {
                    setShowAlertModal(false)
                    onBack()
                }}
                title="Descartar alterações?"
                description="Se você sair agora, todas as informações preenchidas serão perdidas. Tem certeza que deseja descartar?"
                confirmText="Sair sem salvar"
                variant="danger"
            />
        </Tabs>
    )
}
