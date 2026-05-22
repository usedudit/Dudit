"use client"

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react"
import {
    Button,
    DatePicker,
    FormDropdown,
    Input,
    MoneyInput,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
    CustomerCard,
    IconPlaceholder,
    FormTextarea,
    Badge,
    Checkbox,
    Separator,
    FormSection,
} from "@/components/reusable"
import { FadeIn } from "@/components/animations/FadeIn"
import { ChevronLeftIcon, SaveIcon, SearchIcon, TrashIcon, AlertCircleIcon } from "@/lib/icons"
import { formatCurrency, formatDate } from "@/lib/utils"
import { fetchReturnOrderBucketAction } from "@/app/actions/erp/returns"
import { ReturnRequest, ReturnItem } from "./types"
import { getReturnStatusMeta } from "./ReturnListRow"
import { usePickerBucket } from "@/components/erp/hooks"
import { getDeliveryStatusMeta, getPaymentStatusMeta } from "@/lib/orders/status"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { useR2Upload } from "@/hooks/use-r2-upload"


interface CreateReturnPageProps {
    partnerId: string
    mode: "create" | "edit" | "view"
    returnRequest?: ReturnRequest | null
    onBack: () => void
    onSave: (data: Partial<ReturnRequest> & Record<string, any>) => void
    isSaving: boolean
}

interface ReturnItemState extends Omit<ReturnItem, "reason" | "condition" | "resolution"> {
    maxQuantity: number
    checked: boolean
    reason: ReturnItem["reason"]
    condition: ReturnItem["condition"]
    resolution: ReturnItem["resolution"]
}

function getOrderPreviewImage(order?: any | null) {
    const firstItemImage = (order?.order_items || order?.items)?.find((item: any) => item?.products?.images)?.products?.images
    return getR2ImageUrl(firstItemImage || null, "thumb")
}

export default function CreateReturnPage({
    partnerId,
    mode,
    returnRequest,
    onBack,
    onSave,
    isSaving,
}: CreateReturnPageProps) {
    const [activeTab, setActiveTab] = useState("general")
    const [selectedOrder, setSelectedOrder] = useState<any>(null)

    const [isOrderSearchOpen, setIsOrderSearchOpen] = useState(false)
    const searchRef = useRef<HTMLDivElement>(null)

    const [isScrolled, setIsScrolled] = useState(false)
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
    }, [])

    const orderPicker = usePickerBucket<any>(
        () => fetchReturnOrderBucketAction(partnerId) as Promise<any[]>,
        (order, q) =>
            String(order.displayId || "").toLowerCase().includes(q) ||
            String(order.order_number || "").toLowerCase().includes(q) ||
            String(order.customer_name || "").toLowerCase().includes(q),
        { pageSize: 8 }
    )

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
                setIsOrderSearchOpen(false)
            }
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [])

    // Form fields state
    const [returnItems, setReturnItems] = useState<ReturnItemState[]>([])
    const [returnDate, setReturnDate] = useState<Date>(new Date())
    const [returnStatus, setReturnStatus] = useState<ReturnRequest["status"]>("PENDING_REVIEW")
    const [refundType, setRefundType] = useState<ReturnRequest["refundType"]>("full")
    const [refundValue, setRefundValue] = useState<number>(0)
    const [evidenceImages, setEvidenceImages] = useState<string[]>([])
    const [evidenceUploads, setEvidenceUploads] = useState<any[]>([])
    const [observations, setObservations] = useState("")

    // Load existing return data for edit/view modes
    useEffect(() => {
        if ((mode === "edit" || mode === "view") && returnRequest) {
            // Setup order info mock
            setSelectedOrder({
                id: returnRequest.orderId,
                order_number: returnRequest.orderNumber,
                customer_name: returnRequest.customerName,
                customer: {
                    name: returnRequest.customerName,
                    email: returnRequest.customerEmail || "",
                    phone: returnRequest.customerPhone || "",
                    addresses: returnRequest.customerAddress ? [{ street: returnRequest.customerAddress }] : []
                },
                delivery_address: returnRequest.customerAddress,
            })

            // Setup items checklist
            const items = returnRequest.items.map(item => ({
                id: item.id,
                orderItemId: item.orderItemId || item.id,
                productId: item.productId || "",
                productName: item.productName,
                sku: item.sku || "",
                image: item.image || "",
                price: item.price,
                quantity: item.quantity,
                maxQuantity: item.quantity, // cap at quantity saved
                checked: true,
                reason: item.reason || "outro",
                condition: item.condition || "aberto",
                resolution: item.resolution || "reembolso",
            }))
            setReturnItems(items)

            // Setup details
            setReturnDate(new Date(returnRequest.returnDate || returnRequest.createdAt))
            setReturnStatus(returnRequest.status)
            setRefundType(returnRequest.refundType || (returnRequest.desiredResolution === "store_credit" ? "store_credit" : returnRequest.desiredResolution === "refund" ? "partial" : "none"))
            setRefundValue(returnRequest.refundValue)
            setEvidenceImages(returnRequest.evidenceImages || [])
            setEvidenceUploads((returnRequest.evidenceImages || []).map((url) => ({ file_url: url })))
            setObservations(returnRequest.observations || "")
        }
    }, [mode, returnRequest])

    const evidenceUploader = useR2Upload({
        endpoint: "/api/r2/returns-evidence",
        allowedTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
    })

    // Handle local image file uploading
    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files
        if (!files) return
        const remaining = Math.max(0, 5 - evidenceUploads.length)
        const selected = Array.from(files).slice(0, remaining)
        for (const file of selected) {
            const uploaded = await evidenceUploader.uploadFile(file)
            setEvidenceUploads(prev => [...prev, {
                file_url: uploaded.publicUrl,
                file_key: uploaded.key,
                file_name: file.name,
                file_type: uploaded.contentType || file.type,
                file_size: file.size,
                metadata: { originalName: file.name },
            }])
            setEvidenceImages(prev => [...prev, uploaded.publicUrl])
        }
        e.target.value = ""
    }

    const customerAddress = useMemo(() => {
        if (!selectedOrder) return null

        // If order has buyer customer address
        const customerAddr = selectedOrder.customer?.addresses?.[0]
        if (customerAddr) {
            return {
                street: customerAddr.street || "",
                number: customerAddr.number || "",
                complement: customerAddr.complement || "",
                neighborhood: customerAddr.neighborhood || "",
                city: customerAddr.city || "",
                state: customerAddr.state || customerAddr.uf || "",
                zipCode: customerAddr.zip_code || customerAddr.zipCode || "",
            }
        }

        // Fallback to order's delivery_address
        if (selectedOrder.delivery_address) {
            if (typeof selectedOrder.delivery_address === "object") {
                const addr = selectedOrder.delivery_address
                return {
                    street: addr.street || addr.logradouro || "",
                    number: addr.number || addr.numero || "",
                    complement: addr.complement || addr.complemento || "",
                    neighborhood: addr.neighborhood || addr.bairro || "",
                    city: addr.city || addr.localidade || "",
                    state: addr.state || addr.uf || "",
                    zipCode: addr.zipCode || addr.zip_code || addr.cep || "",
                }
            }
            return {
                street: selectedOrder.delivery_address,
            }
        }

        return null
    }, [selectedOrder])

    // Automatically calculate refund value based on checked items
    const calculatedRefundValue = useMemo(() => {
        return returnItems
            .filter(item => item.checked)
            .reduce((acc, item) => acc + (item.price * item.quantity), 0)
    }, [returnItems])

    useEffect(() => {
        if (refundType === "full") {
            setRefundValue(calculatedRefundValue)
        } else if (refundType === "none") {
            setRefundValue(0)
        }
    }, [calculatedRefundValue, refundType])

    const handleFormSubmit = () => {
        const checkedItems = returnItems.filter(item => item.checked)
        if (checkedItems.length === 0) return

        onSave({
            orderId: selectedOrder.id,
            orderNumber: selectedOrder.order_number,
            customerId: selectedOrder.buyer_id || "",
            customerName: selectedOrder.customer_name || selectedOrder.customer?.name || "Cliente",
            customerEmail: selectedOrder.customer?.email || "",
            customerPhone: selectedOrder.customer?.phone || "",
            customerAddress: customerAddress ? `${customerAddress.street}, ${customerAddress.number || ""} - ${customerAddress.city || ""}` : "",
            refundType,
            status: returnStatus,
            refundValue,
            returnDate: returnDate.toISOString(),
            observations,
            evidenceImages,
            evidence: evidenceUploads,
            items: checkedItems.map(item => ({
                id: item.id,
                productId: item.productId,
                productName: item.productName,
                sku: item.sku,
                image: item.image,
                price: item.price,
                quantity: item.quantity,
                reason: item.reason,
                condition: item.condition,
                resolution: item.resolution,
            })),
        })
    }

    const isSaveDisabled = isSaving || !selectedOrder || returnItems.filter(item => item.checked).length === 0

    const pageTitle = mode === "create" ? "Nova devolução" : mode === "edit" ? "Editar devolução" : "Detalhes da devolução"

    return (
        <FadeIn>
            <div className="flex flex-col h-screen bg-white dark:bg-dark-background overflow-hidden">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full w-full">
                    <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-20 md:pb-8">

                        {/* Sticky Header */}
                        <div className="sticky top-0 z-30 w-full bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out">
                            <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">

                                {/* Back button - desktop only */}
                                <div className={`absolute -left-12 top-7 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                                    <Button variant="filled" onClick={onBack} className="w-10 h-10 p-0 flex items-center justify-center">
                                        <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                    </Button>
                                </div>

                                {/* Title row */}
                                <div className="hidden md:flex items-start justify-between md:py-0 md:mb-0">
                                    <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                        <h1 className={`font-bold transition-all duration-500 ease-in-out flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                            <span className="hidden md:inline truncate">{pageTitle}</span>
                                            {mode !== "create" && returnRequest && (
                                                <Badge variant={getReturnStatusMeta(returnStatus).variant}>
                                                    {getReturnStatusMeta(returnStatus).label}
                                                </Badge>
                                            )}
                                        </h1>
                                        <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100 mt-0.5"}`}>
                                            {mode === "create"
                                                ? "Crie uma nova solicitação de devolução vinculada a um pedido."
                                                : "Gerencie e atualize a solicitação de devolução de produtos."}
                                        </div>
                                    </div>

                                    {/* Desktop action buttons only */}
                                    <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                                        <Button variant="outline" onClick={onBack} disabled={isSaving}>
                                            Cancelar
                                        </Button>
                                        {mode !== "view" && (
                                            <Button onClick={handleFormSubmit} disabled={isSaveDisabled}>
                                                <SaveIcon className="w-5 h-5 mr-2" />
                                                {isSaving ? "Salvando..." : "Salvar"}
                                            </Button>
                                        )}
                                    </div>
                                </div>

                                {/* Tabs */}
                                <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                                    <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                        <TabsTrigger value="general">Dados gerais</TabsTrigger>
                                        <TabsTrigger value="evidence">Evidências</TabsTrigger>
                                        <TabsTrigger value="observations">Observações</TabsTrigger>
                                    </TabsList>
                                </div>
                            </div>
                        </div>

                        {/* Content Area */}
                        <div className="px-4 py-6 max-w-[1300px] mx-auto min-h-[400px]">
                            <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
                                <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12">
                                    <TabsContent value="general" className="mt-0">
                                        <FadeIn key="general" className="space-y-8">
                                            {/* Search / Order Selection */}
                                            <FormSection title="Pedido Origem">
                                                <div className="space-y-4">
                                                    {mode === "create" ? (
                                                        <div ref={searchRef} className="relative">
                                                            <Input
                                                                placeholder="Pesquise pelo número do pedido..."
                                                                value={orderPicker.searchQuery}
                                                                onChange={(event) => {
                                                                    orderPicker.setSearchQuery(event.target.value)
                                                                    setIsOrderSearchOpen(true)
                                                                }}
                                                                onFocus={() => {
                                                                    setIsOrderSearchOpen(true)
                                                                    void orderPicker.loadBucket()
                                                                }}
                                                                prefix={<SearchIcon size={18} className="shrink-0 text-brand-inactive-text" />}
                                                                label="Buscar Pedido"
                                                                variant="full-rounded"
                                                            />

                                                            {isOrderSearchOpen && orderPicker.searchQuery.trim() && (
                                                                <FadeIn className="absolute left-0 right-0 top-full z-50 mt-2 max-h-72 overflow-y-auto overflow-hidden rounded-2xl border border-brand-border bg-white shadow-xl dark:border-dark-border dark:bg-dark-surface">
                                                                    {orderPicker.displayed.map((order) => {
                                                                        const searchPaymentMeta = getPaymentStatusMeta(order.status)
                                                                        const searchDeliveryMeta = getDeliveryStatusMeta(order.deliveryStatus)

                                                                        return (
                                                                            <button
                                                                                key={order.id}
                                                                                type="button"
                                                                                className="w-full border-b border-brand-border p-3 text-left transition-colors last:border-0 hover:bg-gray-50 dark:border-dark-border dark:hover:bg-dark-border"
                                                                                onClick={() => {
                                                                                    setSelectedOrder(order)
                                                                                    orderPicker.setSearchQuery(order.displayId)
                                                                                    setIsOrderSearchOpen(false)
                                                                                    // Map order items to returns checklist items
                                                                                    const mappedItems = (order.order_items || []).map((item: any) => {
                                                                                        const imgKey = Array.isArray(item.products?.images) ? item.products.images[0] : (item.products?.images || null)
                                                                                        return {
                                                                                            id: item.id,
                                                                                            productId: item.product_id || item.products?.sku || item.id,
                                                                                            productName: item.product_name || item.products?.name || "Produto",
                                                                                            sku: item.products?.sku || "",
                                                                                            image: getR2ImageUrl(imgKey, "thumb") || "",
                                                                                            price: item.product_price || 0,
                                                                                            quantity: item.quantity || 1,
                                                                                            maxQuantity: item.quantity || 1,
                                                                                            checked: false,
                                                                                            reason: "defeito" as const,
                                                                                            condition: "aberto" as const,
                                                                                            resolution: "reembolso" as const,
                                                                                        }
                                                                                    })
                                                                                    setReturnItems(mappedItems)
                                                                                }}
                                                                            >
                                                                                <div className="flex items-center gap-3">
                                                                                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-brand-border bg-brand-gray dark:border-dark-border dark:bg-dark-border/40">
                                                                                        <img
                                                                                            src={getOrderPreviewImage(order)}
                                                                                            alt={order.displayId}
                                                                                            className="h-full w-full object-cover"
                                                                                        />
                                                                                    </div>

                                                                                    <div className="min-w-0 flex-1">
                                                                                        <div className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                                                            {order.displayId}
                                                                                        </div>
                                                                                        <div className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">
                                                                                            {order.customer_name || "Cliente"} • {order.orderDate ? formatDate(order.orderDate) : "-"}
                                                                                        </div>
                                                                                    </div>

                                                                                    <div className="flex shrink-0 flex-col items-end gap-1">
                                                                                        <div className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                                                            {formatCurrency(order.totalAmount || 0)}
                                                                                        </div>
                                                                                        <div className="flex items-center gap-1">
                                                                                            <Badge variant={searchPaymentMeta.variant} className="scale-90 whitespace-nowrap">
                                                                                                {searchPaymentMeta.label}
                                                                                            </Badge>
                                                                                            <Badge variant={searchDeliveryMeta.variant} className="scale-90 whitespace-nowrap">
                                                                                                {searchDeliveryMeta.label}
                                                                                            </Badge>
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            </button>
                                                                        )
                                                                    })}
                                                                </FadeIn>
                                                            )}
                                                        </div>
                                                    ) : null}

                                                    {selectedOrder && (
                                                        <div className="rounded-2xl border border-brand-border dark:border-dark-border p-5 bg-brand-gray/20 dark:bg-dark-surface/10 space-y-3">
                                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                                                <div>
                                                                    <span className="text-xs text-brand-inactive-text dark:text-dark-body block">Número do Pedido</span>
                                                                    <span className="font-bold text-brand-dark dark:text-dark-heading">{selectedOrder.order_number}</span>
                                                                </div>
                                                                <div>
                                                                    <span className="text-xs text-brand-inactive-text dark:text-dark-body block">Canal</span>
                                                                    <span className="font-medium text-brand-dark dark:text-dark-heading capitalize">{selectedOrder.order_source || "-"}</span>
                                                                </div>
                                                                <div>
                                                                    <span className="text-xs text-brand-inactive-text dark:text-dark-body block">Total Pedido</span>
                                                                    <span className="font-bold text-brand-primary">{formatCurrency(selectedOrder.total_amount || 0)}</span>
                                                                </div>
                                                                <div>
                                                                    <span className="text-xs text-brand-inactive-text dark:text-dark-body block">Situação</span>
                                                                    <span className="font-medium text-brand-dark dark:text-dark-heading capitalize">{selectedOrder.situation || "-"}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </FormSection>

                                            {/* Return Item Checklist */}
                                            {selectedOrder && (
                                                <FormSection title="Produtos para Devolução">
                                                    <div className="space-y-4">
                                                        {/* Desktop listrow-style table */}
                                                        <div className="hidden md:block w-full overflow-x-auto pb-4 custom-scrollbar">
                                                            <table className="w-full text-left border-separate border-spacing-0">
                                                                <thead>
                                                                    <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                                        <th className="py-3 pl-6 pr-2 text-[13px] font-medium text-gray-500 dark:text-dark-body rounded-l-lg w-12"></th>
                                                                        <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body">Produto</th>
                                                                        <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body w-28">Preço</th>
                                                                        <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body text-center w-28">Comprado</th>
                                                                        <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body w-40">Motivo</th>
                                                                        <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body w-40">Condição</th>
                                                                        <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body w-40">Resolução</th>
                                                                        <th className="py-3 pl-4 pr-6 text-[13px] font-medium text-gray-500 dark:text-dark-body text-center w-36 rounded-r-lg">Qtd Devolver</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {returnItems.map((item, idx) => (
                                                                        <tr key={item.id} className="group hover:bg-brand-gray dark:hover:bg-dark-border/10 transition-colors bg-white dark:bg-dark-background">
                                                                            <td className="py-4 pl-6 pr-2 border-b border-brand-border dark:border-dark-border align-middle">
                                                                                <Checkbox
                                                                                    checked={item.checked}
                                                                                    disabled={mode === "view"}
                                                                                    onChange={(checked: boolean) => {
                                                                                        setReturnItems(prev => {
                                                                                            const next = [...prev]
                                                                                            next[idx] = { ...next[idx], checked: !!checked }
                                                                                            return next
                                                                                        })
                                                                                    }}
                                                                                />
                                                                            </td>
                                                                            <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border align-middle">
                                                                                <div className="flex items-center gap-3">
                                                                                    {item.image ? (
                                                                                        <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                                                                                            <img
                                                                                                src={item.image}
                                                                                                alt={item.productName}
                                                                                                className="w-full h-full object-cover rounded-full"
                                                                                            />
                                                                                        </div>
                                                                                    ) : (
                                                                                        <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                                                                                            <AlertCircleIcon className="w-5 h-5 text-brand-inactive-text" />
                                                                                        </div>
                                                                                    )}
                                                                                    <div className="flex flex-col text-left min-w-0">
                                                                                        <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading truncate max-w-[200px]" title={item.productName}>
                                                                                            {item.productName}
                                                                                        </span>
                                                                                        <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate">
                                                                                            {item.sku ? `SKU: ${item.sku}` : "Sem SKU"}
                                                                                        </span>
                                                                                    </div>
                                                                                </div>
                                                                            </td>
                                                                            <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border align-middle">
                                                                                <span className="text-sm font-medium text-brand-dark dark:text-dark-heading">
                                                                                    {formatCurrency(item.price)}
                                                                                </span>
                                                                            </td>
                                                                            <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border text-center align-middle">
                                                                                <span className="text-sm font-semibold text-brand-inactive-text dark:text-dark-body">
                                                                                    {item.maxQuantity}
                                                                                </span>
                                                                            </td>
                                                                            <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border align-middle">
                                                                                <FormDropdown
                                                                                    disabled={mode === "view" || !item.checked}
                                                                                    value={item.reason}
                                                                                    setValue={(val) => {
                                                                                        setReturnItems(prev => {
                                                                                            const next = [...prev]
                                                                                            next[idx] = { ...next[idx], reason: val as any }
                                                                                            return next
                                                                                        })
                                                                                    }}
                                                                                    options={[
                                                                                        { value: "defeito", label: "Defeito" },
                                                                                        { value: "arrependimento", label: "Arrependimento" },
                                                                                        { value: "tamanho_incorreto", label: "Tamanho Incorreto" },
                                                                                        { value: "outro", label: "Outro" }
                                                                                    ]}
                                                                                />
                                                                            </td>
                                                                            <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border align-middle">
                                                                                <FormDropdown
                                                                                    disabled={mode === "view" || !item.checked}
                                                                                    value={item.condition}
                                                                                    setValue={(val) => {
                                                                                        setReturnItems(prev => {
                                                                                            const next = [...prev]
                                                                                            next[idx] = { ...next[idx], condition: val as any }
                                                                                            return next
                                                                                        })
                                                                                    }}
                                                                                    options={[
                                                                                        { value: "aberto", label: "Aberto" },
                                                                                        { value: "lacrado", label: "Lacrado" },
                                                                                        { value: "danificado", label: "Danificado" }
                                                                                    ]}
                                                                                />
                                                                            </td>
                                                                            <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border align-middle">
                                                                                <FormDropdown
                                                                                    disabled={mode === "view" || !item.checked}
                                                                                    value={item.resolution}
                                                                                    setValue={(val) => {
                                                                                        setReturnItems(prev => {
                                                                                            const next = [...prev]
                                                                                            next[idx] = { ...next[idx], resolution: val as any }
                                                                                            return next
                                                                                        })
                                                                                    }}
                                                                                    options={[
                                                                                        { value: "reembolso", label: "Reembolso" },
                                                                                        { value: "troca", label: "Troca" },
                                                                                        { value: "vale_compra", label: "Vale-compra" }
                                                                                    ]}
                                                                                />
                                                                            </td>
                                                                            <td className="py-4 pl-4 pr-6 border-b border-brand-border dark:border-dark-border align-middle">
                                                                                <div className="flex justify-center">
                                                                                    <div className={`flex items-center bg-brand-gray dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-lg h-[40px] px-2 w-fit gap-3 ${(!item.checked || mode === "view") ? "opacity-50 pointer-events-none" : ""}`}>
                                                                                        <button
                                                                                            type="button"
                                                                                            disabled={mode === "view" || !item.checked || item.quantity <= 1}
                                                                                            className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-dark-border disabled:opacity-40 text-brand-dark dark:text-dark-heading font-bold"
                                                                                            onClick={() => {
                                                                                                setReturnItems(prev => {
                                                                                                    const next = [...prev]
                                                                                                    next[idx] = { ...next[idx], quantity: Math.max(1, next[idx].quantity - 1) }
                                                                                                    return next
                                                                                                })
                                                                                            }}
                                                                                        >
                                                                                            -
                                                                                        </button>
                                                                                        <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{item.quantity}</span>
                                                                                        <button
                                                                                            type="button"
                                                                                            disabled={mode === "view" || !item.checked || item.quantity >= item.maxQuantity}
                                                                                            className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-dark-border disabled:opacity-40 text-brand-dark dark:text-dark-heading font-bold"
                                                                                            onClick={() => {
                                                                                                setReturnItems(prev => {
                                                                                                    const next = [...prev]
                                                                                                    next[idx] = { ...next[idx], quantity: Math.min(next[idx].maxQuantity, next[idx].quantity + 1) }
                                                                                                    return next
                                                                                                })
                                                                                            }}
                                                                                        >
                                                                                            +
                                                                                        </button>
                                                                                    </div>
                                                                                </div>
                                                                            </td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>

                                                        {/* Mobile/Tablet list view */}
                                                        <div className="md:hidden space-y-4">
                                                            {returnItems.map((item, idx) => (
                                                                <div key={item.id} className="flex flex-col gap-4">
                                                                    <div className="flex items-center gap-3">
                                                                        <Checkbox
                                                                            checked={item.checked}
                                                                            disabled={mode === "view"}
                                                                            onChange={(checked: boolean) => {
                                                                                setReturnItems(prev => {
                                                                                    const next = [...prev]
                                                                                    next[idx] = { ...next[idx], checked: !!checked }
                                                                                    return next
                                                                                })
                                                                            }}
                                                                        />
                                                                        {item.image ? (
                                                                            <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                                                                                <img
                                                                                    src={item.image}
                                                                                    alt={item.productName}
                                                                                    className="w-full h-full object-cover rounded-full"
                                                                                />
                                                                            </div>
                                                                        ) : (
                                                                            <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                                                                                <AlertCircleIcon className="w-5 h-5 text-brand-inactive-text" />
                                                                            </div>
                                                                        )}
                                                                        <div className="flex-1 min-w-0">
                                                                            <p className="font-bold text-[14px] text-brand-dark dark:text-dark-heading truncate">{item.productName}</p>
                                                                            <p className="text-xs text-brand-inactive-text dark:text-dark-body truncate mt-0.5">
                                                                                {item.sku ? `SKU: ${item.sku}` : "Sem SKU"}
                                                                            </p>
                                                                        </div>
                                                                    </div>

                                                                    {/* Price and Purchased qty metadata row */}
                                                                    <div className="grid grid-cols-2 gap-4 pl-7 text-xs border-t border-brand-border/30 dark:border-dark-border/30 pt-2">
                                                                        <div>
                                                                            <span className="text-brand-inactive-text dark:text-dark-body block font-medium">Preço</span>
                                                                            <span className="font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(item.price)}</span>
                                                                        </div>
                                                                        <div>
                                                                            <span className="text-brand-inactive-text dark:text-dark-body block font-medium">Qtd. Comprada</span>
                                                                            <span className="font-bold text-brand-dark dark:text-dark-heading">{item.maxQuantity}</span>
                                                                        </div>
                                                                    </div>

                                                                    {/* Input elements only visible/interactive when checked */}
                                                                    {item.checked && (
                                                                        <div className="grid grid-cols-2 gap-4 pl-7">
                                                                            <FormDropdown
                                                                                label="Motivo"
                                                                                disabled={mode === "view"}
                                                                                value={item.reason}
                                                                                setValue={(val) => {
                                                                                    setReturnItems(prev => {
                                                                                        const next = [...prev]
                                                                                        next[idx] = { ...next[idx], reason: val as any }
                                                                                        return next
                                                                                    })
                                                                                }}
                                                                                options={[
                                                                                    { value: "defeito", label: "Defeito" },
                                                                                    { value: "arrependimento", label: "Arrependimento" },
                                                                                    { value: "tamanho_incorreto", label: "Tamanho Incorreto" },
                                                                                    { value: "outro", label: "Outro" }
                                                                                ]}
                                                                            />
                                                                            <FormDropdown
                                                                                label="Condição"
                                                                                disabled={mode === "view"}
                                                                                value={item.condition}
                                                                                setValue={(val) => {
                                                                                    setReturnItems(prev => {
                                                                                        const next = [...prev]
                                                                                        next[idx] = { ...next[idx], condition: val as any }
                                                                                        return next
                                                                                    })
                                                                                }}
                                                                                options={[
                                                                                    { value: "aberto", label: "Aberto" },
                                                                                    { value: "lacrado", label: "Lacrado" },
                                                                                    { value: "danificado", label: "Danificado" }
                                                                                ]}
                                                                            />
                                                                            <FormDropdown
                                                                                label="Resolução"
                                                                                disabled={mode === "view"}
                                                                                value={item.resolution}
                                                                                setValue={(val) => {
                                                                                    setReturnItems(prev => {
                                                                                        const next = [...prev]
                                                                                        next[idx] = { ...next[idx], resolution: val as any }
                                                                                        return next
                                                                                    })
                                                                                }}
                                                                                options={[
                                                                                    { value: "reembolso", label: "Reembolso" },
                                                                                    { value: "troca", label: "Troca" },
                                                                                    { value: "vale_compra", label: "Vale-compra" }
                                                                                ]}
                                                                            />
                                                                            <div className="flex flex-col">
                                                                                <span className="text-sm font-medium text-brand-dark dark:text-dark-heading mb-1.5">Qtd Devolver</span>
                                                                                <div className="flex items-center bg-brand-gray dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-lg h-[40px] px-2 w-fit gap-3">
                                                                                    <button
                                                                                        type="button"
                                                                                        disabled={mode === "view" || item.quantity <= 1}
                                                                                        className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-dark-border disabled:opacity-40 text-brand-dark dark:text-dark-heading font-bold"
                                                                                        onClick={() => {
                                                                                            setReturnItems(prev => {
                                                                                                const next = [...prev]
                                                                                                next[idx] = { ...next[idx], quantity: Math.max(1, next[idx].quantity - 1) }
                                                                                                return next
                                                                                            })
                                                                                        }}
                                                                                    >
                                                                                        -
                                                                                    </button>
                                                                                    <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{item.quantity}</span>
                                                                                    <button
                                                                                        type="button"
                                                                                        disabled={mode === "view" || item.quantity >= item.maxQuantity}
                                                                                        className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-dark-border disabled:opacity-40 text-brand-dark dark:text-dark-heading font-bold"
                                                                                        onClick={() => {
                                                                                            setReturnItems(prev => {
                                                                                                const next = [...prev]
                                                                                                next[idx] = { ...next[idx], quantity: Math.min(next[idx].maxQuantity, next[idx].quantity + 1) }
                                                                                                return next
                                                                                            })
                                                                                        }}
                                                                                    >
                                                                                        +
                                                                                    </button>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                    {idx < returnItems.length - 1 && <Separator className="opacity-50 my-2" />}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </FormSection>
                                            )}

                                            {/* Refund/Exchange status details */}
                                            {selectedOrder && (
                                                <FormSection hasSeparator title="Configurações do Reembolso">
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                                        <DatePicker
                                                            label="Data de Devolução"
                                                            disabled={mode === "view"}
                                                            value={returnDate}
                                                            onChange={(d) => d && setReturnDate(d)}
                                                        />

                                                        <FormDropdown
                                                            label="Status da Devolução"
                                                            disabled={mode === "view"}
                                                            value={returnStatus}
                                                            setValue={(val) => setReturnStatus(val as ReturnRequest["status"])}
                                                            options={[
                                                                { value: "PENDING_REVIEW", label: "Pendente" },
                                                                { value: "UNDER_ANALYSIS", label: "Em analise" },
                                                                { value: "APPROVED", label: "Aprovada" },
                                                                { value: "WAITING_CUSTOMER", label: "Aguardando cliente" },
                                                                { value: "WAITING_ITEM_RETURN", label: "Aguardando produto" },
                                                                { value: "PROCESSING", label: "Processando" },
                                                                { value: "RESOLVED", label: "Resolvida" },
                                                                { value: "REJECTED", label: "Recusada" },
                                                                { value: "ESCALATED", label: "Escalada" }
                                                            ]}
                                                        />

                                                        <FormDropdown
                                                            label="Opção de Reembolso"
                                                            disabled={mode === "view"}
                                                            value={refundType || "partial"}
                                                            setValue={(val) => setRefundType(val as ReturnRequest["refundType"])}
                                                            options={[
                                                                { value: "full", label: "Reembolso Integral" },
                                                                { value: "partial", label: "Reembolso Parcial" },
                                                                { value: "none", label: "Sem Reembolso" }
                                                            ]}
                                                        />

                                                        <MoneyInput
                                                            label="Valor Reembolso (R$)"
                                                            disabled={mode === "view" || refundType === "full" || refundType === "none"}
                                                            value={refundValue}
                                                            onChange={(val) => setRefundValue(val)}
                                                        />
                                                    </div>
                                                </FormSection>
                                            )}
                                        </FadeIn>
                                    </TabsContent>

                                    <TabsContent value="evidence" className="mt-0">
                                        <FadeIn key="evidence" className="space-y-6">
                                            <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Evidências de Retorno</h3>

                                            {evidenceImages.length === 0 ? (
                                                <div className="flex flex-col items-center justify-center min-h-[350px] border border-dashed border-brand-border dark:border-dark-border rounded-2xl p-8 bg-brand-gray/10">
                                                    <IconPlaceholder
                                                        placeholderType="image"
                                                        imageSrc="https://img.dudit.com.br/static/mascots/SemPedidos.png"
                                                        imageAlt="Nenhuma evidência por imagem"
                                                        title="Nenhuma imagem enviada"
                                                        subtitle={
                                                            mode === "view"
                                                                ? "Nenhuma imagem foi registrada como evidência para esta devolução."
                                                                : "Envie fotos do estado do produto ou pacote retornado."
                                                        }
                                                        itemButton={
                                                            mode !== "view"
                                                                ? {
                                                                    text: "Enviar imagem",
                                                                    type: "file",
                                                                    accept: "image/jpeg,image/png,image/webp,application/pdf",
                                                                    onChange: handleImageUpload,
                                                                }
                                                                : undefined
                                                        }
                                                    />
                                                </div>
                                            ) : (
                                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
                                                    {evidenceImages.map((src, i) => (
                                                        <div key={i} className="relative aspect-square rounded-2xl overflow-hidden border border-brand-border dark:border-dark-border group bg-brand-gray">
                                                            <img src={src} alt={`Evidência ${i + 1}`} className="w-full h-full object-cover" />
                                                            {mode !== "view" && (
                                                                <button
                                                                    type="button"
                                                                    className="absolute top-2 right-2 bg-brand-red text-white rounded-full p-2 hover:bg-red-700 shadow-md transition-colors"
                                                                    onClick={() => {
                                                                        setEvidenceImages(prev => prev.filter((_, idx) => idx !== i))
                                                                        setEvidenceUploads(prev => prev.filter((_, idx) => idx !== i))
                                                                    }}
                                                                >
                                                                    <TrashIcon size={16} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    ))}

                                                    {mode !== "view" && (
                                                        <label className="border-2 border-dashed border-brand-border dark:border-dark-border hover:bg-brand-gray/30 dark:hover:bg-dark-border/20 rounded-2xl flex flex-col items-center justify-center cursor-pointer aspect-square transition-all duration-200">
                                                            <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple className="hidden" onChange={handleImageUpload} />
                                                            <span className="text-sm font-semibold text-brand-inactive-text dark:text-dark-body">{evidenceUploader.isLoading ? "Enviando..." : "Adicionar evidencia"}</span>
                                                        </label>
                                                    )}
                                                </div>
                                            )}
                                        </FadeIn>
                                    </TabsContent>

                                    <TabsContent value="observations" className="mt-0">
                                        <FadeIn key="observations" className="space-y-6">
                                            <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Observações Gerais</h3>
                                            <FormTextarea
                                                name="observations"
                                                label="Observações da Devolução"
                                                placeholder="Adicione observações sobre a troca, feedback do cliente ou detalhes internos..."
                                                disabled={mode === "view"}
                                                value={observations}
                                                onChange={(e) => setObservations(e.target.value)}
                                                maxLength={1000}
                                                showCharacterCount={true}
                                            />
                                        </FadeIn>
                                    </TabsContent>
                                </div>

                                {/* Customer details right column (Sticky Customer Card) */}
                                <div className="col-span-12 lg:col-span-4 border-l-0 lg:border-l border-brand-border dark:border-dark-border pl-0 lg:pl-12">
                                    <div className="sticky top-6">
                                        {selectedOrder ? (
                                            <CustomerCard
                                                customer={{
                                                    name: selectedOrder.customer_name || selectedOrder.customer?.name || "Cliente",
                                                    email: selectedOrder.customer?.email || "",
                                                    phone: selectedOrder.customer?.phone || "",
                                                }}
                                                address={customerAddress}
                                                showMap={true}
                                            />
                                        ) : (
                                            <div className="rounded-2xl border border-dashed border-brand-border dark:border-dark-border p-6 text-sm text-brand-inactive-text dark:text-dark-body text-center bg-brand-gray/10">
                                                Selecione um pedido para visualizar os dados do cliente e o mapa de entrega aqui.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </Tabs>
            </div>

            {/* Mobile action bar */}
            <div className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-brand-border dark:border-dark-border bg-white dark:bg-dark-background p-4 flex gap-3">
                <Button variant="outline" onClick={onBack} className="flex-1" disabled={isSaving}>
                    Cancelar
                </Button>
                {mode !== "view" && (
                    <Button onClick={handleFormSubmit} className="flex-1" disabled={isSaveDisabled}>
                        {isSaving ? "Salvando..." : "Salvar"}
                    </Button>
                )}
            </div>
        </FadeIn>
    )
}
