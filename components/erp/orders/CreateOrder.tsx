"use client"

import { useState, useCallback, useRef, useMemo } from "react"
import { AnimatePresence } from "framer-motion"
import { Tabs, TabsList, TabsTrigger, TabsContent, Button, AlertModal } from "@/components/reusable"
import { ChevronLeftIcon, SaveIcon } from "@/lib/icons"
import { useToast } from "@/components/ui/use-toast"
import { useNotification } from "@/hooks/use-notification"
import { createERPOrderAction } from "@/app/actions/erp/orders"
import SelectCustomerSheet from "../clientes/SelectCustomerSheet"
import SelectVariantSheet from "../quotes/SelectVariantSheet"
import { searchProductsForQuote } from "@/app/actions/erp/quotes"
import { useRouter } from "next/navigation"
import PaymentModal from "./PaymentModal"
import { useCSRFToken } from "@/hooks/use-csrf-token"

// Tabs
import { OrderGeneralTab } from "./OrderGeneralTab"
import { AddressTab } from "./AddressTab"
import { OrderObservationsTab } from "./OrderObservationsTab"

interface CreateOrderProps {
    onBack: () => void
    partnerId: string
}

export default function CreateOrder({ onBack, partnerId }: CreateOrderProps) {
    const { toast } = useToast()
    const { success: notifySuccess, error: notifyError } = useNotification()
    const router = useRouter()
    const csrfToken = useCSRFToken()

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
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false)
    const [wasSaleSuccessful, setWasSaleSuccessful] = useState(false)

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

    const resetForm = () => {
        setItems([])
        setSelectedCustomer(null)
        setOrderDate(new Date().toISOString().split('T')[0])
        setNotes("")
        setShippingFee("0")
        setOtherCosts("0")
        setDiscountValue(0)
        setPaymentStatus("unpaid")
        setDeliveryStatus("not_sent")
        setActiveTab("general")
    }

    const handleClosePaymentModal = () => {
        setIsPaymentModalOpen(false)
        if (wasSaleSuccessful) {
            resetForm()
            setWasSaleSuccessful(false)
        }
    }

    const handleConfirmPayment = async (paymentData: any) => {
        if (items.length === 0) {
            notifyError("Adicione pelo menos um item ao pedido.")
            return { error: "Sem itens" }
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
                paymentStatus: paymentData.paymentStatus,
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
                notes,
                csrf_token: csrfToken || undefined
            })

            if (result.success) {
                notifySuccess(`Pedido ${result.orderNumber} criado com sucesso!`)
                setWasSaleSuccessful(true)
                return { success: true, orderNumber: result.orderNumber }
            } else {
                notifyError(result.error || "Erro ao criar pedido")
                return { error: result.error }
            }
        } catch (error) {
            notifyError("Erro ao processar pedido")
            return { error: "Erro de processamento" }
        } finally {
            setIsSaving(false)
        }
    }

    const handleSaveOrder = async () => {
        if (items.length === 0) {
            notifyError("Adicione pelo menos um item ao pedido.")
            return
        }
        setIsPaymentModalOpen(true)
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
                        <OrderGeneralTab
                            items={items}
                            searchQuery={searchQuery}
                            isProductSearchOpen={isProductSearchOpen}
                            isSearching={isSearching}
                            searchResults={searchResults}
                            subtotal={subtotal}
                            discountAmount={discountAmount}
                            shippingFee={shippingFee}
                            otherCosts={otherCosts}
                            totalAmount={totalAmount}
                            selectedCustomer={selectedCustomer}
                            orderDate={orderDate}
                            salesChannel={salesChannel}
                            deliveryMethod={deliveryMethod}
                            paymentStatus={paymentStatus}
                            deliveryStatus={deliveryStatus}
                            isSaving={isSaving}
                            setSearchQuery={setSearchQuery}
                            setIsProductSearchOpen={setIsProductSearchOpen}
                            handleSearchProduct={handleSearchProduct}
                            addProductToOrder={addProductToOrder}
                            updateItemField={updateItemField}
                            updateItemPrice={updateItemPrice}
                            updateItemQty={updateItemQty}
                            toggleItemEdit={toggleItemEdit}
                            removeItem={removeItem}
                            addBlankItem={addBlankItem}
                            setShippingFee={setShippingFee}
                            setOtherCosts={setOtherCosts}
                            setSelectedCustomer={setSelectedCustomer}
                            setIsCustomerSheetOpen={setIsCustomerSheetOpen}
                            setOrderDate={setOrderDate}
                            setSalesChannel={setSalesChannel}
                            setDeliveryMethod={setDeliveryMethod}
                            setPaymentStatus={setPaymentStatus}
                            setDeliveryStatus={setDeliveryStatus}
                            handleSaveOrder={handleSaveOrder}
                            salesChannelOptions={salesChannelOptions}
                            deliveryMethodOptions={deliveryMethodOptions}
                            statusOptions={statusOptions}
                            deliveryStatusOptions={deliveryStatusOptions}
                        />
                    </TabsContent>

                    <TabsContent value="delivery" className="mt-0">
                        <AddressTab
                            cep={cep}
                            street={street}
                            number={number}
                            complement={complement}
                            neighborhood={neighborhood}
                            city={city}
                            uf={uf}
                            noNumber={noNumber}
                            selectedCustomer={selectedCustomer}
                            setCep={setCep}
                            setStreet={setStreet}
                            setNumber={setNumber}
                            setComplement={setComplement}
                            setNeighborhood={setNeighborhood}
                            setCity={setCity}
                            setUf={setUf}
                            setNoNumber={setNoNumber}
                        />
                    </TabsContent>

                    <TabsContent value="observations" className="mt-0">
                        <OrderObservationsTab
                            notes={notes}
                            setNotes={setNotes}
                        />
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
                confirmText="Descartar"
                variant="warning"
            />
            <AnimatePresence>
                {isPaymentModalOpen && (
                    <PaymentModal
                        isOpen={isPaymentModalOpen}
                        onClose={handleClosePaymentModal}
                        cart={items}
                        customer={selectedCustomer}
                        partnerId={partnerId}
                        onConfirm={handleConfirmPayment}
                    />
                )}
            </AnimatePresence>
        </Tabs>
    )
}
