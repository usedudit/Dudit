"use client"

import { useState, useCallback, useRef, useMemo, useEffect } from "react"
import { AnimatePresence } from "framer-motion"
import { Tabs, TabsList, TabsTrigger, TabsContent, Button, AlertModal, ThreeDotsLoader } from "@/components/reusable"
import { ChevronLeftIcon, SaveIcon } from "@/lib/icons"
import { useToast } from "@/components/ui/use-toast"
import { useNotification } from "@/hooks/use-notification"
import { createERPOrderAction, getOrderDetailsAction, updateERPOrderAction } from "@/app/actions/erp/orders"
import SelectCustomerSheet from "../clientes/SelectCustomerSheet"
import SelectVariantSheet from "../quotes/SelectVariantSheet"
import { fetchPartnerProductsBucket } from "@/app/actions/erp/client-loaders"
import { useProductBucket } from "../hooks"
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
    editOrderId?: string
}

export default function CreateOrder({ onBack, partnerId, editOrderId }: CreateOrderProps) {
    const { toast } = useToast()
    const { success: notifySuccess, error: notifyError } = useNotification()
    const router = useRouter()
    const csrfToken = useCSRFToken()

    // --- State ---
    const [isLoadingData, setIsLoadingData] = useState(!!editOrderId)
    const [activeTab, setActiveTab] = useState("general")
    const [isScrolled, setIsScrolled] = useState(false)
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const [isSaving, setIsSaving] = useState(false)
    const [fieldErrors, setFieldErrors] = useState<Set<string>>(new Set())

    // Form State
    const [selectedCustomer, setSelectedCustomer] = useState<any>(null)
    const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0])
    const [salesChannel, setSalesChannel] = useState("Direct Sales")
    const [deliveryMethod, setDeliveryMethod] = useState<'delivery' | 'pickup'>("pickup")
    const [paymentStatus, setPaymentStatus] = useState<'paid' | 'partially_paid' | 'unpaid'>("unpaid")
    const [deliveryStatus, setDeliveryStatus] = useState('not_sent')

    // items
    const [items, setItems] = useState<any[]>([])

    // Instant product search (client-side bucket)
    const productBucket = useProductBucket(fetchPartnerProductsBucket)
    const [isProductSearchOpen, setIsProductSearchOpen] = useState(false)

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

    // --- Effects ---
    useEffect(() => {
        if (!editOrderId) return
        async function load() {
            setIsLoadingData(true)
            const res = await getOrderDetailsAction(editOrderId!, partnerId)
            if (res.success && res.data) {
                const order = res.data
                setSelectedCustomer(order.buyer_id ? { id: order.buyer_id, name: order.customer_name } : null)
                setOrderDate(order.created_at.split('T')[0])
                setSalesChannel(order.order_source || "Direct Sales")
                setDeliveryMethod(order.delivery_type as any || "pickup")
                setPaymentStatus(order.situation === "paid" ? "paid" : order.situation === "partially_paid" ? "partially_paid" : "unpaid")
                setDeliveryStatus(order.delivery_status || "not_sent")
                setNotes(order.notes || "")
                setShippingFee((order.shipping_cost || 0).toString())
                setOtherCosts((order.additional_costs || 0).toString())
                setDiscountValue(order.discount_value || 0)
                setDiscountType(order.discount_type || "fixed")

                if (order.order_items) {
                    setItems(order.order_items.map((item: any) => ({
                        id: item.id || Math.random().toString(36).substr(2, 9),
                        productId: item.product_id,
                        name: item.product_name,
                        unitPrice: Number(item.product_price),
                        quantity: Number(item.quantity),
                        image: item.image || item.product?.image || null,
                        sku: item.sku || item.product?.sku || "",
                        isEditing: false
                    })))
                }

                if (order.delivery_address) {
                    // try to parse if possible, or just dump to street, but complex logic can be brittle.
                    // string format: "street, number (complement), neighborhood, city - state, zipcode"
                    // we'll leave it empty for forms right now as splitting perfectly is hard and might overwrite
                    const addressParts = order.delivery_address.split(',')
                    if (addressParts.length >= 4) {
                        setStreet(addressParts[0].trim())
                        // rudimentary extraction just so fields aren't completely blank
                    }
                }
            } else {
                notifyError("Erro ao carregar pedido", res.error)
            }
            setIsLoadingData(false)
        }
        load()
    }, [editOrderId, partnerId, notifyError])

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
            productBucket.setSearchQuery("")
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
        productBucket.setSearchQuery("")
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
            router.refresh()
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
            const payload = {
                partnerId,
                customerId: selectedCustomer?.id,
                customerName: selectedCustomer ? selectedCustomer.name : "Consumidor final",
                deliveryMethod,
                paymentStatus: paymentData.paymentStatus,
                paymentMethod: paymentData.paymentMethod,
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
                discountType: 'fixed' as const,
                shippingCost: parseFloat(shippingFee || "0"),
                additionalCosts: parseFloat(otherCosts || "0"),
                totalAmount,
                notes,
                csrf_token: csrfToken || undefined
            }

            let result;
            if (editOrderId) {
                result = await updateERPOrderAction(editOrderId, payload)
            } else {
                result = await createERPOrderAction(payload)
            }

            if (result.success) {
                notifySuccess(editOrderId ? `Pedido atualizado com sucesso!` : `Pedido criado com sucesso!`)
                router.refresh()
                setWasSaleSuccessful(true)
                // updateERPOrderAction does not return orderNumber, so we default to an empty string if undefined to fix TS error
                const returnedOrderNumber = 'orderNumber' in result ? result.orderNumber : undefined;
                return { success: true, orderNumber: returnedOrderNumber }
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
            setFieldErrors(new Set(["productSearch"]))
            notifyError("Adicione pelo menos um item ao pedido.")
            return
        }
        setFieldErrors(new Set())
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
        { value: "unpaid", label: "Não pago", color: "brand-red" },
        { value: "paid", label: "Pago", color: "brand-green" },
        { value: "partially_paid", label: "Parcialmente Pago", color: "brand-orange" }
    ]

    const deliveryStatusOptions = [
        { value: "not_sent", label: "Não enviado" },
        { value: "preparing", label: "Preparando" },
        { value: "sent", label: "Enviado" },
        { value: "delivered", label: "Entregue" },
        { value: "pickup_available", label: "Disponível para retirada" },
        { value: "delivery_failed", label: "Entrega não realizada" }
    ]

    if (isLoadingData) {
        return (
            <div className="w-full h-full min-h-[500px] flex justify-center items-center">
                <ThreeDotsLoader />
            </div>
        )
    }

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
                                    <span className="hidden md:inline truncate">{editOrderId ? "Editar Pedido" : "Novo Pedido"}</span>
                                </h1>
                                <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                    {editOrderId ? "Atualize as informações da venda" : "Preencha as informações da nova venda"}
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
                            searchQuery={productBucket.searchQuery}
                            isProductSearchOpen={isProductSearchOpen}
                            isSearching={productBucket.isLoading}
                            searchResults={productBucket.filteredResults}
                            subtotal={subtotal}
                            discountAmount={discountAmount}
                            discountValue={discountValue}
                            discountType={discountType}
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
                            setSearchQuery={productBucket.setSearchQuery}
                            setIsProductSearchOpen={setIsProductSearchOpen}
                            onSearchFocus={productBucket.loadBucket}
                            addProductToOrder={addProductToOrder}
                            updateItemField={updateItemField}
                            updateItemPrice={updateItemPrice}
                            updateItemQty={updateItemQty}
                            toggleItemEdit={toggleItemEdit}
                            removeItem={removeItem}
                            addBlankItem={addBlankItem}
                            setShippingFee={setShippingFee}
                            setOtherCosts={setOtherCosts}
                            setDiscountValue={setDiscountValue}
                            setDiscountType={setDiscountType}
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
                            fieldErrors={fieldErrors}
                            setFieldErrors={setFieldErrors}
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
                        shippingFee={parseFloat(shippingFee || "0")}
                        otherCosts={parseFloat(otherCosts || "0")}
                        discountAmount={discountAmount}
                        onConfirm={handleConfirmPayment}
                    />
                )}
            </AnimatePresence>

            {/* Mobile Bottom Action Bar */}
            <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-gray-200 dark:border-dark-border px-4 py-3 flex gap-3">
                <Button
                    variant="outline"
                    onClick={handleBack}
                    disabled={isSaving}
                    className="flex-1"
                >
                    Cancelar
                </Button>
                <Button
                    onClick={handleSaveOrder}
                    disabled={isSaving}
                    className="flex-1"
                >
                    <SaveIcon className="w-4 h-4 mr-2" />
                    {isSaving ? "Salvando..." : "Salvar"}
                </Button>
            </div>
        </Tabs>
    )
}
