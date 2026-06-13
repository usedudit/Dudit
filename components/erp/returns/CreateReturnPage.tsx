"use client"

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
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
    FormTextarea,
    Badge,
    Checkbox,
    Separator,
    FormSection,
} from "@/components/reusable"
import { FadeIn } from "@/components/animations/FadeIn"
import { ChevronLeftIcon, SaveIcon, SearchIcon, TrashIcon, AlertCircleIcon, CalendarIcon } from "@/lib/icons"
import { formatCurrency, formatDate } from "@/lib/utils"
import { fetchReturnOrderBucketAction } from "@/app/actions/erp/returns"
import { fetchPartnerProductsBucket } from "@/app/actions/erp/client-loaders"
import { ReturnRequest, ReturnItem } from "./types"
import { getReturnStatusMeta } from "./ReturnListRow"
import { usePickerBucket, useProductBucket, type ProductBucketItem } from "@/components/erp/hooks"
import { getDeliveryStatusMeta, getPaymentStatusMeta } from "@/lib/orders/status"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { useR2Upload } from "@/hooks/use-r2-upload"
import { calculateReturnNetTotal } from "@/lib/returns/calculations"
import ProductImagesSection from "@/components/erp/product/ProductImagesSection"
import ImageCropperModal from "@/components/ImageCropperModal"
import { useNotification } from "@/hooks/use-notification"
import AlertModal from "@/components/reusable/AlertModal"
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes"
import { UnsavedChangesDialog } from "@/components/reusable/UnsavedChangesDialog"


interface CreateReturnPageProps {
    partnerId: string
    mode: "create" | "edit" | "view"
    returnRequest?: ReturnRequest | null
    onBack: () => void
    onSave: (data: Partial<ReturnRequest> & Record<string, any>) => void
    isSaving: boolean
}

interface ReturnItemState extends Omit<ReturnItem, "reason" | "condition"> {
    maxQuantity: number
    checked: boolean
    reason: ReturnItem["reason"]
    condition: ReturnItem["condition"]
}

type ReplacementItemState = {
    product: ProductBucketItem
    quantity: number
}

function getOrderPreviewImage(order?: any | null) {
    const firstItem = (order?.order_items || order?.items)?.find((item: any) => item?.products?.images?.[0] || item?.products?.video_thumbnail)
    const firstItemImage = firstItem?.products?.images?.[0] || firstItem?.products?.video_thumbnail || null
    return getR2ImageUrl(firstItemImage || null, "thumb")
}

function mapToLegacyCondition(condition: string): "aberto" | "lacrado" | "danificado" {
    const raw = String(condition || "").toLowerCase()
    if (raw === "sealed") return "lacrado"
    if (raw === "damaged") return "danificado"
    return "aberto"
}

function mapToLegacyReason(reason: string): "defeito" | "arrependimento" | "tamanho_incorreto" | "outro" {
    const raw = String(reason || "").toLowerCase()
    if (raw === "defective") return "defeito"
    if (raw === "changed_mind") return "arrependimento"
    if (raw === "wrong_size") return "tamanho_incorreto"
    if (raw === "other") return "outro"
    if (raw === "defeito" || raw === "arrependimento" || raw === "tamanho_incorreto" || raw === "outro") return raw as any
    return "outro"
}

function getLegacyReasonLabel(reason: string): string {
    const legacy = mapToLegacyReason(reason)
    if (legacy === "defeito") return "Defeito"
    if (legacy === "arrependimento") return "Arrependimento"
    if (legacy === "tamanho_incorreto") return "Tamanho Incorreto"
    return "Outro"
}

function getLegacyConditionLabel(condition: string): string {
    const legacy = mapToLegacyCondition(condition)
    if (legacy === "lacrado") return "Lacrado"
    if (legacy === "danificado") return "Danificado"
    return "Aberto"
}

const PaymentRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex justify-between items-start text-[14px] gap-4 py-2 border-b border-brand-border/30 dark:border-dark-border/30 last:border-0">
        <span className="text-brand-inactive-text dark:text-dark-body font-medium">{label}</span>
        <div className="text-right font-bold text-brand-dark dark:text-dark-heading">{value}</div>
    </div>
)

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

    const paymentMeta = useMemo(() => getPaymentStatusMeta(selectedOrder?.status), [selectedOrder?.status])
    const deliveryMeta = useMemo(() => getDeliveryStatusMeta(selectedOrder?.deliveryStatus), [selectedOrder?.deliveryStatus])

    const [isOrderSearchOpen, setIsOrderSearchOpen] = useState(false)
    const searchRef = useRef<HTMLDivElement>(null)
    const replacementSearchRef = useRef<HTMLDivElement>(null)

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
        { pageSize: 10 }
    )
    const productBucket = useProductBucket(fetchPartnerProductsBucket)

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
                setIsOrderSearchOpen(false)
            }
            if (replacementSearchRef.current && !replacementSearchRef.current.contains(event.target as Node)) {
                setIsReplacementSearchOpen(false)
            }
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [])

    // Form fields state
    const [returnItems, setReturnItems] = useState<ReturnItemState[]>([])
    const [returnDate, setReturnDate] = useState<Date>(new Date())
    const [returnStatus, setReturnStatus] = useState<ReturnRequest["status"]>("PENDING_REVIEW")
    const [resolutionType, setResolutionType] = useState<"exchange" | "store_credit" | "refund" | "none" | "rejected">("refund")
    const [refundType, setRefundType] = useState<ReturnRequest["refundType"]>("full")
    const [refundValue, setRefundValue] = useState<number>(0)
    const [creditType, setCreditType] = useState<"full" | "partial">("full")
    const [creditValue, setCreditValue] = useState<number>(0)
    const [replacementProduct, setReplacementProduct] = useState("")
    const [replacementItems, setReplacementItems] = useState<ReplacementItemState[]>([])
    const [isReplacementSearchOpen, setIsReplacementSearchOpen] = useState(false)
    const [exchangeBalanceResolution, setExchangeBalanceResolution] = useState<"store_credit" | "refund">("store_credit")
    const [exchangeStatus, setExchangeStatus] = useState("pending")
    const [pendingSaveData, setPendingSaveData] = useState<(Partial<ReturnRequest> & Record<string, any>) | null>(null)
    const [isInventoryRestoreModalOpen, setIsInventoryRestoreModalOpen] = useState(false)
    const [evidenceImages, setEvidenceImages] = useState<(string | File)[]>([])
    const [evidenceUploads, setEvidenceUploads] = useState<any[]>([])
    const [observations, setObservations] = useState("")

    const { error: notifyError } = useNotification()
    const [showImageCropper, setShowImageCropper] = useState(false)
    const [selectedImageForCrop, setSelectedImageForCrop] = useState<File | null>(null)
    const [uploadingImages, setUploadingImages] = useState<Set<number>>(new Set())
    const [isUploading, setIsUploading] = useState(false)

    const isDirty = useMemo(() => {
        if (mode === "view" || isSaving || isUploading) return false
        if (mode === "create") {
            return selectedOrder !== null || observations !== "" || evidenceImages.length > 0 || replacementItems.length > 0
        }
        if (mode === "edit" && returnRequest) {
            const statusChanged = returnStatus !== returnRequest.status
            const resolutionTypeChanged = resolutionType !== (returnRequest.approvedResolution || returnRequest.desiredResolution || "refund")
            const observationsChanged = observations !== (returnRequest.observations || "")

            const itemsChanged = returnItems.some(item => {
                const orig = returnRequest.items.find(i => i.id === item.id)
                if (!orig) return true
                return !item.checked || item.quantity !== orig.quantity || item.reason !== mapToLegacyReason(orig.reason || "outro") || item.condition !== mapToLegacyCondition(orig.condition || "aberto")
            })

            const initialImages = returnRequest.evidenceImages || []
            const imagesChanged = evidenceImages.length !== initialImages.length || evidenceImages.some((img, idx) => img !== initialImages[idx])

            return statusChanged || resolutionTypeChanged || observationsChanged || itemsChanged || imagesChanged
        }
        return false
    }, [mode, isSaving, isUploading, selectedOrder, observations, evidenceImages, replacementItems.length, returnRequest, returnStatus, resolutionType, returnItems])

    const { showConfirmDialog, confirmNavigation, cancelNavigation, handleNavigation } = useUnsavedChanges(isDirty)
    const handleBack = useCallback(() => handleNavigation(onBack), [handleNavigation, onBack])

    // Load existing return data for edit/view modes
    useEffect(() => {
        if ((mode === "edit" || mode === "view") && returnRequest) {
            // Setup order info mock
            setSelectedOrder({
                id: returnRequest.orderId,
                displayId: returnRequest.orderNumber,
                order_number: returnRequest.orderNumber,
                customer_name: returnRequest.customerName,
                customer: {
                    name: returnRequest.customerName,
                    email: returnRequest.customerEmail || "",
                    phone: returnRequest.customerPhone || "",
                    addresses: returnRequest.customerAddress ? [{ street: returnRequest.customerAddress }] : []
                },
                delivery_address: returnRequest.customerAddress,
                orderDate: returnRequest.createdAt,
                status: returnRequest.orderStatus || "paid",
                deliveryStatus: returnRequest.deliveryStatus || "delivered",
                totalAmount: returnRequest.refundValue || 0,
            })

            // Setup items checklist
            const items = returnRequest.items.map(item => ({
                id: item.id,
                orderItemId: item.orderItemId || item.id,
                productId: item.productId || "",
                productName: item.productName,
                sku: item.sku || "",
                image: item.image ? getR2ImageUrl(item.image, "thumb") : "",
                price: item.price,
                netItemValue: item.netItemValue ?? item.price,
                quantity: item.quantity,
                maxQuantity: item.quantity, // cap at quantity saved
                checked: true,
                reason: mapToLegacyReason(item.reason || "outro"),
                condition: mapToLegacyCondition(item.condition || "aberto"),
            }))
            setReturnItems(items)

            // Setup details
            setReturnDate(new Date(returnRequest.returnDate || returnRequest.createdAt))
            setReturnStatus(returnRequest.status)
            setResolutionType((returnRequest.approvedResolution || returnRequest.desiredResolution || "refund") as any)
            setRefundType(returnRequest.refundType || (returnRequest.desiredResolution === "store_credit" ? "store_credit" : returnRequest.desiredResolution === "refund" ? "partial" : "none"))
            setRefundValue(returnRequest.refundValue)
            setCreditValue(returnRequest.storeCreditValue || 0)
            setReplacementProduct((returnRequest as any).replacementProduct || "")
            setEvidenceImages(returnRequest.evidenceImages || [])
            setEvidenceUploads((returnRequest.evidenceImages || []).map((url) => ({ file_url: url })))
            setObservations(returnRequest.observations || "")
        }
    }, [mode, returnRequest])

    useEffect(() => {
        setReplacementProduct(replacementItems.map(item => item.product.name).join(", "))
    }, [replacementItems])

    const evidenceUploader = useR2Upload({
        endpoint: "/api/r2/returns-evidence",
        allowedTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
    })

    // Handle local image file uploading
    const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        e.currentTarget.value = ""
        if (file) {
            setSelectedImageForCrop(file)
            setShowImageCropper(true)
        }
    }, [])

    const handleImageCropComplete = useCallback(async (croppedImageDataUrl: string) => {
        try {
            const blob = await (await fetch(croppedImageDataUrl)).blob()
            const extension = blob.type === "image/png" ? "png" : "jpg"
            const file = new File([blob], `evidence-image.${extension}`, { type: blob.type })
            setEvidenceImages((prev) => [...prev, file])
        } catch (err) {
            console.error("Error cropping image:", err)
        } finally {
            setShowImageCropper(false)
            setSelectedImageForCrop(null)
        }
    }, [])

    const handleRemoveImage = useCallback((indexToDelete: number) => {
        setEvidenceImages((prev) => prev.filter((_, i) => i !== indexToDelete))
    }, [])

    const handleSetPrimaryImage = useCallback((index: number) => {
        if (!evidenceImages.length) return
        const images = [...evidenceImages]
        const [primary] = images.splice(index, 1)
        images.unshift(primary)
        setEvidenceImages(images)
    }, [evidenceImages])

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
        return calculateReturnNetTotal(
            returnItems
                .filter(item => item.checked)
                .map(item => ({
                    netItemValue: item.netItemValue,
                    price: item.price,
                    quantity: item.quantity,
                    orderedQuantity: item.maxQuantity,
                }))
        )
    }, [returnItems])

    useEffect(() => {
        if (resolutionType === "refund" && refundType === "full") {
            setRefundValue(calculatedRefundValue)
        } else if (resolutionType !== "refund" || refundType === "none") {
            setRefundValue(0)
        }
        if (resolutionType === "store_credit" && creditType === "full") {
            setCreditValue(calculatedRefundValue)
        } else if (resolutionType !== "store_credit") {
            setCreditValue(0)
        }
    }, [calculatedRefundValue, creditType, refundType, resolutionType])

    const replacementTotal = useMemo(() => {
        return replacementItems.reduce((sum, item) => sum + Number(item.product.price || 0) * item.quantity, 0)
    }, [replacementItems])

    const exchangeDifference = useMemo(() => Math.max(0, replacementTotal - calculatedRefundValue), [calculatedRefundValue, replacementTotal])
    const exchangeSurplus = useMemo(() => Math.max(0, calculatedRefundValue - replacementTotal), [calculatedRefundValue, replacementTotal])

    const addReplacementProduct = useCallback((product: ProductBucketItem) => {
        setReplacementItems(prev => {
            if (prev.some(item => item.product.id === product.id)) return prev
            return [...prev, { product, quantity: 1 }]
        })
        productBucket.setSearchQuery("")
        setIsReplacementSearchOpen(false)
    }, [productBucket])

    const updateReplacementQty = useCallback((index: number, quantity: number) => {
        setReplacementItems(prev => prev.map((item, itemIndex) => (
            itemIndex === index ? { ...item, quantity: Math.max(1, quantity) } : item
        )))
    }, [])

    const removeReplacementProduct = useCallback((index: number) => {
        setReplacementItems(prev => prev.filter((_, itemIndex) => itemIndex !== index))
    }, [])

    const completeSave = useCallback((returnToInventory: boolean) => {
        if (!pendingSaveData) return
        onSave({ ...pendingSaveData, returnToInventory })
        setPendingSaveData(null)
        setIsInventoryRestoreModalOpen(false)
    }, [onSave, pendingSaveData])

    const handleFormSubmit = async () => {
        const checkedItems = returnItems.filter(item => item.checked)
        if (checkedItems.length === 0) return

        setIsUploading(true)

        try {
            const finalEvidenceUploads: any[] = []
            const finalEvidenceImages: string[] = []

            // Find which evidenceImages are Files and which are already uploaded strings
            const filesToUpload: { file: File; index: number }[] = []
            evidenceImages.forEach((img, idx) => {
                if (img instanceof File) {
                    filesToUpload.push({ file: img, index: idx })
                } else if (typeof img === "string") {
                    finalEvidenceImages[idx] = img
                    const existingUpload = evidenceUploads.find(u => u.file_url === img || u.publicUrl === img)
                    if (existingUpload) {
                        finalEvidenceUploads[idx] = existingUpload
                    } else {
                        finalEvidenceUploads[idx] = {
                            file_url: img,
                            file_name: img.substring(img.lastIndexOf("/") + 1),
                        }
                    }
                }
            })

            if (filesToUpload.length > 0) {
                setUploadingImages(new Set(filesToUpload.map(f => f.index)))

                for (const { file, index } of filesToUpload) {
                    try {
                        const uploaded = await evidenceUploader.uploadFile(file)
                        const uploadObj = {
                            file_url: uploaded.publicUrl,
                            file_key: uploaded.key,
                            file_name: file.name,
                            file_type: uploaded.contentType || file.type,
                            file_size: file.size,
                            metadata: { originalName: file.name },
                        }
                        finalEvidenceUploads[index] = uploadObj
                        finalEvidenceImages[index] = uploaded.publicUrl
                    } catch (uploadErr) {
                        console.error("Error uploading file:", file.name, uploadErr)
                        notifyError(`Falha ao fazer upload da imagem ${file.name}.`)
                        throw uploadErr
                    }
                }
                setUploadingImages(new Set())
            }

            const cleanEvidenceImages = finalEvidenceImages.filter(Boolean)
            const cleanEvidenceUploads = finalEvidenceUploads.filter(Boolean)

            const payload = {
                orderId: selectedOrder.id,
                orderNumber: selectedOrder.order_number,
                customerId: selectedOrder.buyer_id || "",
                customerName: selectedOrder.customer_name || selectedOrder.customer?.name || "Cliente",
                customerEmail: selectedOrder.customer?.email || "",
                customerPhone: selectedOrder.customer?.phone || "",
                customerAddress: customerAddress ? `${customerAddress.street}, ${customerAddress.number || ""} - ${customerAddress.city || ""}` : "",
                desiredResolution: resolutionType,
                resolutionType,
                refundType,
                creditType,
                status: returnStatus,
                refundValue,
                storeCreditValue: creditValue,
                replacementProduct,
                exchangeStatus,
                exchangeItems: replacementItems.map(item => ({
                    product_id: item.product.id,
                    variant_id: null,
                    quantity: item.quantity,
                    unit_price: Number(item.product.price || 0),
                })),
                exchangeBalanceResolution: exchangeSurplus > 0 ? exchangeBalanceResolution : null,
                returnDate: returnDate.toISOString(),
                observations,
                evidenceImages: cleanEvidenceImages,
                evidence: cleanEvidenceUploads,
                items: checkedItems.map(item => ({
                    id: item.id,
                    productId: item.productId,
                    productName: item.productName,
                    sku: item.sku,
                    image: item.image,
                    price: item.price,
                    netItemValue: item.netItemValue,
                    quantity: item.quantity,
                    reason: item.reason,
                    condition: item.condition,
                })),
            }

            const shouldAskInventoryRestore =
                mode === "edit" &&
                returnRequest &&
                returnStatus === "APPROVED" &&
                returnRequest.status !== "APPROVED" &&
                ["cancellation", "return", "exchange"].includes(returnRequest.requestType || "return")

            if (shouldAskInventoryRestore) {
                setPendingSaveData(payload)
                setIsInventoryRestoreModalOpen(true)
                return
            }

            onSave({ ...payload, returnToInventory: false })
        } catch (err) {
            console.error("Error saving return request:", err)
        } finally {
            setIsUploading(false)
        }
    }

    const isSaveDisabled = isSaving || isUploading || !selectedOrder || returnItems.filter(item => item.checked).length === 0

    const pageTitle = mode === "create" ? "Nova devolução" : mode === "edit" ? "Editar devolução" : "Detalhes da devolução"

    return (
        <FadeIn>
            <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full w-full">
                    <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-20 md:pb-0">

                        {/* Sticky Header */}
                        <div className="sticky top-0 z-30 w-full max-w-[1300px] mx-auto bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out">
                            <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">

                                {/* Back button - desktop only */}
                                <div className={`absolute -left-12 top-7 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                                    <Button variant="filled" onClick={handleBack} className="w-10 h-10 p-0 flex items-center justify-center">
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
                                        <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                            {mode === "create"
                                                ? "Crie uma nova solicitação de devolução vinculada a um pedido."
                                                : "Gerencie e atualize a solicitação de devolução de produtos."}
                                        </div>
                                    </div>

                                    {/* Desktop action buttons only */}
                                    <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                                        <Button variant="outline" onClick={handleBack} disabled={isSaving || isUploading}>
                                            Cancelar
                                        </Button><Button onClick={handleFormSubmit} disabled={isSaveDisabled} leftIcon={<SaveIcon size={18} />}>
                                            {isSaving || isUploading ? "Salvando..." : "Salvar"}
                                        </Button>
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
                        <div className="px-3 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
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
                                                                <motion.div
                                                                    initial={{ opacity: 0, y: 5 }}
                                                                    animate={{ opacity: 1, y: 0 }}
                                                                    exit={{ opacity: 0, y: 5 }}
                                                                    className="absolute left-0 right-0 top-full z-[9999] mt-2 max-h-72 overflow-y-auto rounded-xl border border-brand-border bg-white shadow-xl dark:border-dark-border dark:bg-dark-surface custom-scrollbar"
                                                                    onScroll={(e: React.UIEvent<HTMLDivElement>) => {
                                                                        const target = e.currentTarget
                                                                        if (target.scrollHeight - target.scrollTop - target.clientHeight < 20) {
                                                                            orderPicker.loadMore()
                                                                        }
                                                                    }}
                                                                >
                                                                    {orderPicker.displayed.map((order) => {
                                                                        const searchPaymentMeta = getPaymentStatusMeta(order.status)
                                                                        const searchDeliveryMeta = getDeliveryStatusMeta(order.deliveryStatus)

                                                                        return (
                                                                            <div
                                                                                key={order.id}
                                                                                className="flex items-center gap-4 p-3.5 border-b border-brand-border dark:border-dark-border last:border-0 transition-colors hover:bg-gray-50 dark:hover:bg-dark-border cursor-pointer"
                                                                                onClick={() => {
                                                                                    setSelectedOrder(order)
                                                                                    orderPicker.setSearchQuery(order.displayId)
                                                                                    setIsOrderSearchOpen(false)
                                                                                    // Map order items to returns checklist items
                                                                                    const mappedItems = (order.order_items || []).map((item: any) => {
                                                                                        const imgKey = Array.isArray(item.products?.images) && item.products.images[0]
                                                                                            ? item.products.images[0]
                                                                                            : (item.products?.video_thumbnail || item.products?.images || null)
                                                                                        return {
                                                                                            id: item.id,
                                                                                            productId: item.product_id || item.products?.sku || item.id,
                                                                                            productName: item.product_name || item.products?.name || "Produto",
                                                                                            sku: item.products?.sku || "",
                                                                                            image: getR2ImageUrl(imgKey, "thumb") || "",
                                                                                            price: item.product_price || 0,
                                                                                            netItemValue: item.net_item_value || item.subtotal || item.product_price || 0,
                                                                                            quantity: item.quantity || 1,
                                                                                            maxQuantity: item.quantity || 1,
                                                                                            checked: false,
                                                                                            reason: "defeito" as const,
                                                                                            condition: "aberto" as const,
                                                                                        }
                                                                                    })
                                                                                    setReturnItems(mappedItems)
                                                                                }}
                                                                            >
                                                                                <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border/50 overflow-hidden shrink-0 border border-brand-border dark:border-dark-border">
                                                                                    <img
                                                                                        src={getOrderPreviewImage(order)}
                                                                                        alt={order.displayId}
                                                                                        className="w-full h-full object-cover rounded-full bg-brand-gray dark:bg-dark-border border border-brand-border dark:border-dark-border"
                                                                                    />
                                                                                </div>

                                                                                <div className="min-w-0 flex-1">
                                                                                    <div className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
                                                                                        {order.displayId}
                                                                                    </div>
                                                                                    <div className="text-[11px] font-medium text-brand-inactive-text mt-0.5 tracking-wider uppercase truncate">
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
                                                                        )
                                                                    })}
                                                                </motion.div>
                                                            )}
                                                        </div>
                                                    ) : null}

                                                    {selectedOrder && (
                                                        <div className="overflow-hidden rounded-2xl border border-brand-border dark:border-dark-border">
                                                            <div className="border-b border-brand-border bg-brand-gray p-6 dark:border-dark-border dark:bg-dark-border/50">
                                                                <div className="flex flex-wrap items-center justify-between gap-3">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">
                                                                            Pedido:
                                                                        </span>
                                                                        <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                                            {selectedOrder.displayId || selectedOrder.order_number}
                                                                        </span>
                                                                    </div>

                                                                    <div className="text-sm font-medium text-brand-inactive-text dark:text-dark-body md:text-right">
                                                                        Cliente:{" "}
                                                                        <strong className="text-brand-dark dark:text-dark-heading">
                                                                            {selectedOrder.customer_name || selectedOrder.customer?.name || "Cliente"}
                                                                        </strong>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            <div className="bg-white dark:bg-dark-surface">
                                                                <div className="grid grid-cols-1 divide-y divide-brand-border dark:divide-dark-border md:grid-cols-4 md:divide-x md:divide-y-0">
                                                                    <div className="p-5">
                                                                        <div className="mb-3 flex items-center gap-2 text-brand-inactive-text dark:text-dark-body">
                                                                            <CalendarIcon className="h-4 w-4" />
                                                                            <span className="text-xs font-bold uppercase tracking-[0.14em]">
                                                                                Data
                                                                            </span>
                                                                        </div>
                                                                        <p className="text-2xl font-bold text-brand-dark dark:text-dark-heading">
                                                                            {selectedOrder.orderDate ? formatDate(selectedOrder.orderDate) : "-"}
                                                                        </p>
                                                                    </div>

                                                                    <div className="p-5">
                                                                        <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-brand-inactive-text dark:text-dark-body">
                                                                            Pagamento
                                                                        </p>
                                                                        <Badge variant={paymentMeta.variant}>{paymentMeta.label}</Badge>
                                                                    </div>

                                                                    <div className="p-5">
                                                                        <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-brand-inactive-text dark:text-dark-body">
                                                                            Entrega
                                                                        </p>
                                                                        <Badge variant={deliveryMeta.variant}>{deliveryMeta.label}</Badge>
                                                                    </div>

                                                                    <div className="p-5">
                                                                        <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-brand-inactive-text dark:text-dark-body">
                                                                            Total
                                                                        </p>
                                                                        <p className="text-2xl font-bold text-brand-dark dark:text-dark-heading">
                                                                            {formatCurrency(selectedOrder.totalAmount || selectedOrder.total_amount || 0)}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </FormSection>

                                            {/* Return Item Checklist */}
                                            {selectedOrder && (
                                                <FormSection hasSeparator title="Produtos para Devolução">
                                                    {mode === "view" ? (
                                                        <div className="flex flex-col gap-6">
                                                            {returnItems.filter(item => item.checked).map((item) => {
                                                                const lineTotal = item.netItemValue ? item.netItemValue * item.quantity : item.price * item.quantity;
                                                                return (
                                                                    <div key={item.id} className="flex items-start gap-4">
                                                                        <div className="w-16 h-16 overflow-hidden shrink-0 rounded-full border border-brand-border dark:border-dark-border">
                                                                            <img
                                                                                src={item.image || "https://img.dudit.com.br/static/Placeholder.png"}
                                                                                className="w-full h-full object-cover rounded-full"
                                                                                alt={item.productName}
                                                                                onError={(e: any) => {
                                                                                    e.target.src = "https://img.dudit.com.br/static/Placeholder.png"
                                                                                }}
                                                                            />
                                                                        </div>
                                                                        <div className="flex-1 min-w-0">
                                                                            <div className="flex justify-between items-start mb-1 gap-3">
                                                                                <h4 className="font-bold text-[14px] md:text-[15px] text-brand-dark dark:text-dark-heading truncate">{item.productName}</h4>
                                                                                <span className="font-bold text-[14px] md:text-[15px] text-brand-dark dark:text-dark-heading shrink-0">
                                                                                    {formatCurrency(lineTotal)}
                                                                                </span>
                                                                            </div>
                                                                            <div className="text-xs text-brand-inactive-text dark:text-dark-body uppercase mb-2">SKU: {item.sku || "Sem SKU"}</div>
                                                                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-brand-inactive-text dark:text-dark-body">
                                                                                <span>
                                                                                    Qtd devolvida: <strong className="text-brand-dark dark:text-dark-heading">{item.quantity}</strong> de {item.maxQuantity} un.
                                                                                </span>
                                                                                <span>•</span>
                                                                                <span>
                                                                                    Preço unitário: <strong className="text-brand-dark dark:text-dark-heading">{formatCurrency(item.price)}</strong>
                                                                                </span>
                                                                                <span>•</span>
                                                                                <span>
                                                                                    Motivo: <strong className="text-brand-dark dark:text-dark-heading">{getLegacyReasonLabel(item.reason)}</strong>
                                                                                </span>
                                                                                <span>•</span>
                                                                                <span>
                                                                                    Condição: <strong className="text-brand-dark dark:text-dark-heading">{getLegacyConditionLabel(item.condition)}</strong>
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                )
                                                            })}
                                                        </div>
                                                    ) : (
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
                                                                            <th className="py-3 pl-4 pr-6 text-[13px] font-medium text-gray-500 dark:text-dark-body text-center w-36 rounded-r-lg">Qtd Devolver</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {returnItems.map((item, idx) => (
                                                                            <tr key={item.id} className="group hover:bg-brand-gray/10 transition-colors bg-white dark:bg-dark-background">
                                                                                <td className="py-4 pl-6 pr-2 border-b border-brand-border dark:border-dark-border align-middle">
                                                                                    <Checkbox
                                                                                        checked={item.checked}
                                                                                        disabled={false}
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
                                                                                        disabled={!item.checked}
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
                                                                                        disabled={!item.checked}
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
                                                                                <td className="py-4 pl-4 pr-6 border-b border-brand-border dark:border-dark-border align-middle">
                                                                                    <div className="flex justify-center">
                                                                                        <div className={`flex items-center bg-brand-gray dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-lg h-[40px] px-2 w-fit gap-3 ${(!item.checked) ? "opacity-50 pointer-events-none" : ""}`}>
                                                                                            <button
                                                                                                type="button"
                                                                                                disabled={!item.checked || item.quantity <= 1}
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
                                                                                                disabled={!item.checked || item.quantity >= item.maxQuantity}
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
                                                                                disabled={false}
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
                                                                                    disabled={false}
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
                                                                                    disabled={false}
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
                                                                                <div className="flex flex-col">
                                                                                    <span className="text-sm font-medium text-brand-dark dark:text-dark-heading mb-1.5">Qtd Devolver</span>
                                                                                    <div className="flex items-center bg-brand-gray dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-lg h-[40px] px-2 w-fit gap-3">
                                                                                        <button
                                                                                            type="button"
                                                                                            disabled={item.quantity <= 1}
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
                                                                                            disabled={item.quantity >= item.maxQuantity}
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
                                                    )}
                                                </FormSection>
                                            )}
                                            {/* Refund/Exchange status details */}
                                            {selectedOrder && (
                                                <FormSection hasSeparator title="Resolução da devolução">
                                                    {mode === "view" ? (
                                                        <div className="space-y-1">
                                                            <PaymentRow label="Data" value={formatDate(returnDate)} />
                                                            <PaymentRow
                                                                label="Status da solicitação"
                                                                value={
                                                                    <Badge variant={getReturnStatusMeta(returnStatus).variant}>
                                                                        {getReturnStatusMeta(returnStatus).label}
                                                                    </Badge>
                                                                }
                                                            />
                                                            <PaymentRow
                                                                label="Tipo de resolução"
                                                                value={
                                                                    resolutionType === "refund" ? "Reembolso" :
                                                                        resolutionType === "store_credit" ? "Vale-compra" :
                                                                            resolutionType === "exchange" ? "Troca" :
                                                                                resolutionType === "rejected" ? "Recusada" : "Sem resolução"
                                                                }
                                                            />

                                                            {resolutionType === "refund" && (
                                                                <>
                                                                    <PaymentRow
                                                                        label="Tipo de reembolso"
                                                                        value={
                                                                            refundType === "full" ? "Integral" :
                                                                                refundType === "partial" ? "Parcial" : "Sem reembolso"
                                                                        }
                                                                    />
                                                                    <PaymentRow label="Valor do reembolso" value={formatCurrency(refundValue)} />
                                                                </>
                                                            )}

                                                            {resolutionType === "store_credit" && (
                                                                <>
                                                                    <PaymentRow
                                                                        label="Tipo de crédito"
                                                                        value={
                                                                            creditType === "full" ? "Integral" : "Parcial"
                                                                        }
                                                                    />
                                                                    <PaymentRow label="Valor do vale-compra" value={formatCurrency(creditValue)} />
                                                                </>
                                                            )}

                                                            {resolutionType === "exchange" && (
                                                                <>
                                                                    {replacementItems.length > 0 && (
                                                                        <PaymentRow
                                                                            label="Produtos substitutos"
                                                                            value={
                                                                                <div className="flex flex-col gap-1 items-end font-normal text-xs text-brand-inactive-text dark:text-dark-body">
                                                                                    {replacementItems.map((item, idx) => (
                                                                                        <span key={idx}>
                                                                                            <strong className="text-brand-dark dark:text-dark-heading font-medium">{item.product.name}</strong> ({item.quantity}x {formatCurrency(item.product.price || 0)})
                                                                                        </span>
                                                                                    ))}
                                                                                </div>
                                                                            }
                                                                        />
                                                                    )}
                                                                    <PaymentRow
                                                                        label="Status da troca"
                                                                        value={
                                                                            exchangeStatus === "pending" ? "Pendente" :
                                                                                exchangeStatus === "reserved" ? "Reservado" :
                                                                                    exchangeStatus === "sent" ? "Enviado" : "Concluído"
                                                                        }
                                                                    />
                                                                    <PaymentRow label="Total dos substitutos" value={formatCurrency(replacementTotal)} />
                                                                    <PaymentRow label="Crédito disponível" value={formatCurrency(calculatedRefundValue)} />
                                                                    <PaymentRow
                                                                        label={exchangeDifference > 0 ? "Diferença a cobrar" : "Saldo restante"}
                                                                        value={formatCurrency(exchangeDifference > 0 ? exchangeDifference : exchangeSurplus)}
                                                                    />
                                                                    {exchangeSurplus > 0 && (
                                                                        <PaymentRow
                                                                            label="Destino do saldo"
                                                                            value={
                                                                                exchangeBalanceResolution === "store_credit" ? "Gerar vale-compra" : "Gerar reembolso"
                                                                            }
                                                                        />
                                                                    )}
                                                                </>
                                                            )}

                                                            <div className="pt-4 border-t border-brand-border dark:border-dark-border mt-3 flex justify-between items-center">
                                                                <span className="font-bold text-lg text-brand-dark dark:text-dark-heading">Total da Resolução</span>
                                                                <span className="font-bold text-2xl tracking-tight text-brand-dark dark:text-dark-heading">
                                                                    {formatCurrency(
                                                                        resolutionType === "refund" ? refundValue :
                                                                            resolutionType === "store_credit" ? creditValue :
                                                                                resolutionType === "exchange" ? calculatedRefundValue :
                                                                                    calculatedRefundValue
                                                                    )}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                                            <DatePicker
                                                                label="Data"
                                                                disabled={false}
                                                                value={returnDate}
                                                                onChange={(d) => d && setReturnDate(d)}
                                                            />

                                                            <FormDropdown
                                                                label="Request status"
                                                                disabled={false}
                                                                value={returnStatus}
                                                                setValue={(val) => setReturnStatus(val as ReturnRequest["status"])}
                                                                options={[
                                                                    { value: "PENDING_REVIEW", label: "Pendente" },
                                                                    { value: "UNDER_ANALYSIS", label: "Em analise" },
                                                                    { value: "WAITING_CUSTOMER", label: "Aguardando cliente" },
                                                                    { value: "APPROVED", label: "Aprovada" },
                                                                    { value: "REJECTED", label: "Recusada" },
                                                                    { value: "RESOLVED", label: "Concluida" }
                                                                ]}
                                                            />

                                                            <FormDropdown
                                                                label="Resolution type"
                                                                disabled={false}
                                                                value={resolutionType}
                                                                setValue={(val) => setResolutionType(val as any)}
                                                                options={[
                                                                    { value: "refund", label: "Reembolso" },
                                                                    { value: "store_credit", label: "Vale-compra" },
                                                                    { value: "exchange", label: "Troca" },
                                                                    { value: "none", label: "Sem resolucao" },
                                                                    { value: "rejected", label: "Recusada" }
                                                                ]}
                                                            />

                                                            {resolutionType === "refund" && (
                                                                <>
                                                                    <FormDropdown
                                                                        label="Refund type"
                                                                        disabled={false}
                                                                        value={refundType || "partial"}
                                                                        setValue={(val) => setRefundType(val as ReturnRequest["refundType"])}
                                                                        options={[
                                                                            { value: "full", label: "Integral" },
                                                                            { value: "partial", label: "Parcial" },
                                                                            { value: "none", label: "Sem reembolso" }
                                                                        ]}
                                                                    />
                                                                    <MoneyInput
                                                                        label="Refund value"
                                                                        disabled={refundType === "full" || refundType === "none"}
                                                                        value={refundValue}
                                                                        onChange={(val) => setRefundValue(Math.min(Number(val || 0), calculatedRefundValue))}
                                                                    />
                                                                </>
                                                            )}

                                                            {resolutionType === "store_credit" && (
                                                                <>
                                                                    <FormDropdown
                                                                        label="Credit type"
                                                                        disabled={false}
                                                                        value={creditType}
                                                                        setValue={(val) => setCreditType(val as "full" | "partial")}
                                                                        options={[
                                                                            { value: "full", label: "Integral" },
                                                                            { value: "partial", label: "Parcial" }
                                                                        ]}
                                                                    />
                                                                    <MoneyInput
                                                                        label="Store credit amount"
                                                                        disabled={creditType === "full"}
                                                                        value={creditValue}
                                                                        onChange={(val) => setCreditValue(Math.min(Number(val || 0), calculatedRefundValue))}
                                                                    />
                                                                </>
                                                            )}

                                                            {resolutionType === "exchange" && (
                                                                <>
                                                                    <div ref={replacementSearchRef} className="relative md:col-span-2">
                                                                        <Input
                                                                            label="Replacement products"
                                                                            disabled={false}
                                                                            value={productBucket.searchQuery}
                                                                            onChange={(event) => {
                                                                                productBucket.setSearchQuery(event.target.value)
                                                                                setIsReplacementSearchOpen(true)
                                                                            }}
                                                                            onFocus={() => {
                                                                                setIsReplacementSearchOpen(true)
                                                                                void productBucket.loadBucket()
                                                                            }}
                                                                            placeholder="Buscar por nome ou SKU"
                                                                            prefix={<SearchIcon size={18} className="shrink-0 text-brand-inactive-text" />}
                                                                        />

                                                                        <AnimatePresence>
                                                                            {isReplacementSearchOpen && productBucket.searchQuery.trim() && (
                                                                                <motion.div
                                                                                    initial={{ opacity: 0, y: 5 }}
                                                                                    animate={{ opacity: 1, y: 0 }}
                                                                                    exit={{ opacity: 0, y: 5 }}
                                                                                    className="absolute left-0 right-0 top-full z-[9999] mt-2 max-h-72 overflow-y-auto rounded-xl border border-brand-border bg-white shadow-xl dark:border-dark-border dark:bg-dark-surface custom-scrollbar"
                                                                                    onScroll={(e) => {
                                                                                        const target = e.currentTarget
                                                                                        if (target.scrollHeight - target.scrollTop - target.clientHeight < 20) {
                                                                                            productBucket.loadMore()
                                                                                        }
                                                                                    }}
                                                                                >
                                                                                    {productBucket.isLoading ? (
                                                                                        <div className="p-6 text-center text-sm text-brand-inactive-text dark:text-dark-body">Carregando produtos...</div>
                                                                                    ) : productBucket.filteredResults.length > 0 ? (
                                                                                        productBucket.filteredResults.map((product) => {
                                                                                            const alreadyAdded = replacementItems.some(item => item.product.id === product.id)
                                                                                            return (
                                                                                                <div
                                                                                                    key={product.id}
                                                                                                    className={`flex items-center gap-4 p-3.5 border-b border-brand-border dark:border-dark-border last:border-0 transition-colors ${alreadyAdded ? 'opacity-40 cursor-default' : 'hover:bg-gray-50 dark:hover:bg-dark-border cursor-pointer'}`}
                                                                                                    onClick={() => !alreadyAdded && addReplacementProduct(product)}
                                                                                                >
                                                                                                    <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border/50 overflow-hidden shrink-0 border border-brand-border dark:border-dark-border">
                                                                                                        <img
                                                                                                            src={getR2ImageUrl(product.image, "thumbnail") || "https://img.dudit.com.br/static/Placeholder.png"}
                                                                                                            alt={product.name}
                                                                                                            className="w-full h-full object-cover rounded-full bg-brand-gray dark:bg-dark-border border border-brand-border dark:border-dark-border"
                                                                                                        />
                                                                                                    </div>
                                                                                                    <div className="flex-1 min-w-0">
                                                                                                        <div className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">{product.name}</div>
                                                                                                        <div className="text-[11px] font-medium text-brand-inactive-text mt-0.5 tracking-wider uppercase truncate">{product.sku || "Sem SKU"}</div>
                                                                                                    </div>
                                                                                                    <div className="flex flex-col items-end gap-1 shrink-0">
                                                                                                        <div className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                                                                            {formatCurrency(product.price || 0)}
                                                                                                        </div>
                                                                                                        <div className="text-xs font-bold text-white bg-brand-dark dark:bg-brand-green px-2 py-1 rounded-md whitespace-nowrap">
                                                                                                            {product.stock} em estoque
                                                                                                        </div>
                                                                                                    </div>
                                                                                                </div>
                                                                                            )
                                                                                        })
                                                                                    ) : (
                                                                                        <div className="p-6 text-center text-sm text-brand-inactive-text dark:text-dark-body">Nenhum produto encontrado.</div>
                                                                                    )}
                                                                                </motion.div>
                                                                            )}
                                                                        </AnimatePresence>
                                                                    </div>

                                                                    {replacementItems.length > 0 && (
                                                                        <div className="md:col-span-2 space-y-3 rounded-xl border border-brand-border dark:border-dark-border p-4">
                                                                            {replacementItems.map((item, index) => (
                                                                                <div key={item.product.id} className="flex flex-col gap-3 border-b border-brand-border pb-3 last:border-0 last:pb-0 dark:border-dark-border md:flex-row md:items-center">
                                                                                    <div className="min-w-0 flex-1">
                                                                                        <p className="truncate text-sm font-bold text-brand-dark dark:text-dark-heading">{item.product.name}</p>
                                                                                        <p className="text-xs text-brand-inactive-text dark:text-dark-body">{formatCurrency(item.product.price || 0)} cada</p>
                                                                                    </div>
                                                                                    <div className="flex items-center gap-3">
                                                                                        <button
                                                                                            type="button"
                                                                                            disabled={item.quantity <= 1}
                                                                                            onClick={() => updateReplacementQty(index, item.quantity - 1)}
                                                                                            className="h-9 w-9 rounded-full border border-brand-border text-brand-dark disabled:opacity-40 dark:border-dark-border dark:text-dark-heading"
                                                                                        >
                                                                                            -
                                                                                        </button>
                                                                                        <span className="w-8 text-center text-sm font-bold text-brand-dark dark:text-dark-heading">{item.quantity}</span>
                                                                                        <button
                                                                                            type="button"
                                                                                            disabled={false}
                                                                                            onClick={() => updateReplacementQty(index, item.quantity + 1)}
                                                                                            className="h-9 w-9 rounded-full border border-brand-border text-brand-dark disabled:opacity-40 dark:border-dark-border dark:text-dark-heading"
                                                                                        >
                                                                                            +
                                                                                        </button>
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={() => removeReplacementProduct(index)}
                                                                                            className="h-9 w-9 rounded-full text-brand-red hover:bg-brand-red-light"
                                                                                            title="Remover produto"
                                                                                        >
                                                                                            <TrashIcon size={17} className="mx-auto" />
                                                                                        </button>
                                                                                    </div>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    )}

                                                                    <FormDropdown
                                                                        label="Exchange status"
                                                                        disabled={false}
                                                                        value={exchangeStatus}
                                                                        setValue={setExchangeStatus}
                                                                        options={[
                                                                            { value: "pending", label: "Pendente" },
                                                                            { value: "reserved", label: "Reservado" },
                                                                            { value: "sent", label: "Enviado" },
                                                                            { value: "completed", label: "Concluido" }
                                                                        ]}
                                                                    />
                                                                    <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                                                                        <div className="rounded-xl border border-brand-border dark:border-dark-border p-4">
                                                                            <p className="text-brand-inactive-text dark:text-dark-body">Total dos substitutos</p>
                                                                            <p className="font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(replacementTotal)}</p>
                                                                        </div>
                                                                        <div className="rounded-xl border border-brand-border dark:border-dark-border p-4">
                                                                            <p className="text-brand-inactive-text dark:text-dark-body">Credito disponivel</p>
                                                                            <p className="font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(calculatedRefundValue)}</p>
                                                                        </div>
                                                                        <div className="rounded-xl border border-brand-border dark:border-dark-border p-4">
                                                                            <p className="text-brand-inactive-text dark:text-dark-body">{exchangeDifference > 0 ? "Diferenca a cobrar" : "Saldo restante"}</p>
                                                                            <p className="font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(exchangeDifference > 0 ? exchangeDifference : exchangeSurplus)}</p>
                                                                        </div>
                                                                    </div>
                                                                    {exchangeSurplus > 0 && (
                                                                        <FormDropdown
                                                                            label="Destino do saldo"
                                                                            disabled={false}
                                                                            value={exchangeBalanceResolution}
                                                                            setValue={(val) => setExchangeBalanceResolution(val as "store_credit" | "refund")}
                                                                            options={[
                                                                                { value: "store_credit", label: "Gerar vale-compra" },
                                                                                { value: "refund", label: "Gerar reembolso" }
                                                                            ]}
                                                                        />
                                                                    )}
                                                                </>
                                                            )}

                                                            <div className="md:col-span-2 rounded-xl border border-brand-border dark:border-dark-border p-4 text-sm text-brand-inactive-text dark:text-dark-body">
                                                                Valor pago proporcional selecionado: <strong className="text-brand-dark dark:text-dark-heading">{formatCurrency(calculatedRefundValue)}</strong>
                                                            </div>
                                                        </div>
                                                    )}
                                                </FormSection>
                                            )}
                                        </FadeIn>
                                    </TabsContent>

                                    <TabsContent value="evidence" className="mt-0">
                                        <FadeIn key="evidence" className="space-y-6">
                                            <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Evidências de Retorno</h3>
                                            <ProductImagesSection
                                                images={evidenceImages}
                                                onImageUpload={handleImageUpload}
                                                onRemoveImage={handleRemoveImage}
                                                onSetPrimaryImage={handleSetPrimaryImage}
                                                isEditing={mode !== "view"}
                                                uploadingImages={uploadingImages}
                                                isSaving={isSaving || isUploading}
                                            />
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
                <Button variant="outline" onClick={handleBack} className="flex-1" disabled={isSaving || isUploading}>
                    Cancelar
                </Button>
                {mode !== "view" && (
                    <Button onClick={handleFormSubmit} className="flex-1" disabled={isSaveDisabled}>
                        {isSaving || isUploading ? "Salvando..." : "Salvar"}
                    </Button>
                )}
            </div>

            {showImageCropper && selectedImageForCrop && (
                <ImageCropperModal
                    isOpen
                    imageFile={selectedImageForCrop}
                    onClose={() => setShowImageCropper(false)}
                    onCropComplete={handleImageCropComplete}
                />
            )}

            <AlertModal
                isOpen={isInventoryRestoreModalOpen}
                title="Restaurar itens ao estoque?"
                description="Escolha se os itens desta solicitacao devem voltar ao estoque. A movimentacao sera registrada como RETURN_IN."
                confirmText="Restaurar estoque"
                cancelText="Nao restaurar"
                variant="info"
                onConfirm={() => completeSave(true)}
                onClose={() => completeSave(false)}
                disabled={isSaving}
                isLoading={isSaving}
            />

            <UnsavedChangesDialog
                open={showConfirmDialog}
                onConfirm={confirmNavigation}
                onCancel={cancelNavigation}
                description="Você tem alterações na devolução que ainda não foram salvas."
            />
        </FadeIn>
    )
}
