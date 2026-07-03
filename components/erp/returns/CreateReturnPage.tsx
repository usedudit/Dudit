"use client"

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
    Button,
    DatePicker,
    FormDropdown,
    Input,
    QuantitySelector,
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
    DefaultModal,
    InfoCard,
} from "@/components/reusable"
import { FadeIn } from "@/components/animations/FadeIn"
import { ChevronLeftIcon, SaveIcon, SearchIcon, TrashIcon, AlertCircleIcon, CalendarIcon, XIcon } from "@/lib/icons"
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils"
import { fetchReturnOrderBucketAction, getReturnRequestDetailsAction } from "@/app/actions/erp/returns"
import { fetchPartnerProductsBucket } from "@/app/actions/erp/client-loaders"
import { ReturnRequest, ReturnItem, ReturnEvent } from "./types"
import { ReturnHistoryTab } from "./ReturnHistoryTab"
import { getReturnStatusMeta } from "./ReturnListRow"
import { usePickerBucket, useProductBucket, type ProductBucketItem } from "@/components/erp/hooks"
import { getDeliveryStatusMeta, getPaymentStatusMeta } from "@/lib/orders/status"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { useR2Upload } from "@/hooks/use-r2-upload"
import { calculateReturnNetTotal } from "@/lib/returns/calculations"
import { computeItemDisplayPrice } from "@/lib/services/pricing-engine"
import { listActivePromotionsForMarketplaceAction } from "@/app/actions/shared/promotions"
import ProductImagesSection from "@/components/erp/product/ProductImagesSection"
import ImageCropperModal from "@/components/ImageCropperModal"
import { useNotification } from "@/hooks/use-notification"
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes"
import { UnsavedChangesDialog } from "@/components/reusable/UnsavedChangesDialog"
import SelectCustomerSheet from "@/components/erp/clientes/SelectCustomerSheet"

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

function mapToLegacyReason(reason: string): string {
    const raw = String(reason || "").toLowerCase()
    if (raw === "wrong_item" || raw === "item errado" || raw === "recebi item errado") return "wrong_item"
    if (raw === "defective" || raw === "item com defeito" || raw === "defeito") return "defective"
    if (raw === "damaged" || raw === "item danificado") return "damaged"
    if (raw === "different_from_description" || raw === "diferente da descricao" || raw === "diferente da descrição") return "different_from_description"
    if (raw === "missing_parts" || raw === "faltam partes") return "missing_parts"
    if (raw === "arrived_late" || raw === "chegou atrasado") return "arrived_late"
    if (raw === "changed_mind" || raw === "mudei de ideia" || raw === "arrependimento" || raw === "mudou de ideia") return "changed_mind"
    if (raw === "wrong_size" || raw === "tamanho_incorreto") return "other"
    if (raw === "other" || raw === "outro") return "other"
    return "other"
}

function getLegacyReasonLabel(reason: string): string {
    const legacy = mapToLegacyReason(reason)
    if (legacy === "wrong_item") return "Item errado"
    if (legacy === "defective") return "Item com defeito"
    if (legacy === "damaged") return "Item danificado"
    if (legacy === "different_from_description") return "Diferente da descrição"
    if (legacy === "missing_parts") return "Faltam partes"
    if (legacy === "arrived_late") return "Chegou atrasado"
    if (legacy === "changed_mind") return "Mudou de ideia"
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
    const productBucket = useProductBucket<ProductBucketItem>(fetchPartnerProductsBucket)

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
    const [refundPaymentMethod, setRefundPaymentMethod] = useState<string>("")

    const isViewOnly = useMemo(() => {
        return mode === "view" || !!(returnRequest && ["APPROVED", "REJECTED", "RESOLVED", "EXPIRED"].includes(returnRequest.status))
    }, [mode, returnRequest])

    const isMarketplaceRequest = useMemo(() => {
        return !!(returnRequest?.source === "marketplace")
    }, [returnRequest])

    const isMercadoPagoOrder = useMemo(() => {
        if (!selectedOrder) return false
        const provider = String(selectedOrder.payment_provider || selectedOrder.paymentProvider || "").toLowerCase()
        return Boolean(selectedOrder.mp_payment_id || selectedOrder.mpPaymentId) || provider.includes("mercado")
    }, [selectedOrder])

    useEffect(() => {
        if (isMercadoPagoOrder) {
            setRefundPaymentMethod("Mercado Pago")
        } else if (selectedOrder && mode === "create") {
            setRefundPaymentMethod("pix")
        }
    }, [isMercadoPagoOrder, selectedOrder, mode])
    const [creditType, setCreditType] = useState<"full" | "partial">("full")
    const [creditValue, setCreditValue] = useState<number>(0)
    const [replacementProduct, setReplacementProduct] = useState("")
    const [replacementItems, setReplacementItems] = useState<ReplacementItemState[]>([])
    const [isReplacementSearchOpen, setIsReplacementSearchOpen] = useState(false)
    const [exchangeBalanceResolution, setExchangeBalanceResolution] = useState<"store_credit" | "refund">("store_credit")
    const [exchangeStatus, setExchangeStatus] = useState("pending")
    const [pendingSaveData, setPendingSaveData] = useState<(Partial<ReturnRequest> & Record<string, any>) | null>(null)
    const [isInventoryRestoreModalOpen, setIsInventoryRestoreModalOpen] = useState(false)
    const [inventoryRestoreQuantities, setInventoryRestoreQuantities] = useState<Record<string, number>>({})
    const [isMpWarningModalOpen, setIsMpWarningModalOpen] = useState(false)
    const [mpWarningChecked, setMpWarningChecked] = useState(false)
    const [evidenceImages, setEvidenceImages] = useState<(string | File)[]>([])
    const [evidenceUploads, setEvidenceUploads] = useState<any[]>([])
    const [observations, setObservations] = useState("")
    const [returnEvents, setReturnEvents] = useState<ReturnEvent[]>([])
    const [historyLoading, setHistoryLoading] = useState(false)

    const [promotions, setPromotions] = useState<any[]>([])

    useEffect(() => {
        if (!partnerId) return
        listActivePromotionsForMarketplaceAction(partnerId).then(res => {
            if (Array.isArray(res)) setPromotions(res)
        }).catch(() => { })
    }, [partnerId])

    const { error: notifyError } = useNotification()
    const [showImageCropper, setShowImageCropper] = useState(false)
    const [selectedImageForCrop, setSelectedImageForCrop] = useState<File | null>(null)
    const [uploadingImages, setUploadingImages] = useState<Set<number>>(new Set())
    const [isUploading, setIsUploading] = useState(false)
    const [isCustomerSheetOpen, setIsCustomerSheetOpen] = useState(false)

    const isConsumidorFinal = useMemo(() => {
        if (!selectedOrder) return false
        const name = String(selectedOrder.customer_name || selectedOrder.customer?.name || "").toLowerCase()
        return name.includes("consumidor final") || name === "consumidor"
    }, [selectedOrder])

    const checkedItems = useMemo(() => returnItems.filter(item => item.checked), [returnItems])

    const isDirty = useMemo(() => {
        if (isViewOnly || isSaving || isUploading) return false
        if (mode === "create") {
            return selectedOrder !== null || observations !== "" || evidenceImages.length > 0 || replacementItems.length > 0
        }
        if (mode === "edit" && returnRequest) {
            const statusChanged = returnStatus !== returnRequest.status
            const resolutionTypeChanged = resolutionType !== (returnRequest.approvedResolution || returnRequest.desiredResolution || "refund")
            const observationsChanged = observations !== (returnRequest.sellerNotes || "")

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

    // Load return events for edit/view modes
    useEffect(() => {
        if ((mode === "edit" || mode === "view") && returnRequest?.id) {
            setHistoryLoading(true)
            getReturnRequestDetailsAction(partnerId, returnRequest.id)
                .then((res: any) => {
                    if (res.success && res.data?.returnEvents) {
                        setReturnEvents(res.data.returnEvents)
                    }
                })
                .catch(console.error)
                .finally(() => setHistoryLoading(false))
        }
    }, [mode, returnRequest?.id, partnerId])

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
                payment_provider: returnRequest.paymentProvider,
                paymentProvider: returnRequest.paymentProvider,
                mp_payment_id: returnRequest.mpPaymentId,
                mpPaymentId: returnRequest.mpPaymentId,
            })

            // Setup items checklist - use orderedQuantity for max if available
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
                maxQuantity: item.orderedQuantity || item.quantity,
                checked: true,
                reason: mapToLegacyReason(item.reason || "outro"),
                condition: mapToLegacyCondition(item.condition || "aberto"),
            }))
            setReturnItems(items)

            // Setup exchange items from snapshot
            if (returnRequest.exchangeItemsSnapshot && returnRequest.exchangeItemsSnapshot.length > 0) {
                // Proactively load product bucket to enrich exchange item names
                productBucket.loadBucket()

                const snapItems: ReplacementItemState[] = returnRequest.exchangeItemsSnapshot.map((ei: any) => ({
                    product: {
                        id: ei.product_id,
                        name: "",
                        sku: "",
                        gtin: null,
                        price: ei.unit_price || 0,
                        stock: 0,
                        allow_sell_without_stock: false,
                        image: null,
                        has_variants: false,
                    },
                    quantity: ei.quantity || 1,
                }))
                // Try to enrich with product names from the bucket
                if (productBucket.bucket.length > 0) {
                    const enriched = snapItems.map((si) => {
                        const found = productBucket.bucket.find((p) => p.id === si.product.id)
                        if (found) {
                            return { ...si, product: { ...found } }
                        }
                        return si
                    })
                    setReplacementItems(enriched)
                } else {
                    setReplacementItems(snapItems)
                }
            }

            // Setup details
            setReturnDate(new Date(returnRequest.returnDate || returnRequest.createdAt))
            setReturnStatus(returnRequest.status)
            setResolutionType((returnRequest.approvedResolution || returnRequest.desiredResolution || "refund") as any)
            setRefundType(returnRequest.refundType || (returnRequest.desiredResolution === "store_credit" ? "store_credit" : returnRequest.desiredResolution === "refund" ? "partial" : "none"))
            setRefundValue(returnRequest.refundValue)
            setRefundPaymentMethod(returnRequest.refundPaymentMethod || "")
            setCreditValue(returnRequest.storeCreditValue || 0)
            setExchangeStatus(returnRequest.exchangeSubstatus || "pending")
            setExchangeBalanceResolution(returnRequest.exchangeBalanceResolution || "store_credit")
            setReplacementProduct((returnRequest as any).replacementProduct || "")
            setEvidenceImages(returnRequest.evidenceImages || [])
            setEvidenceUploads((returnRequest.evidenceImages || []).map((url) => ({ file_url: url })))
            setObservations(returnRequest.sellerNotes || "")
        }
    }, [mode, returnRequest, productBucket.bucket])

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

    const replacementTotal = useMemo(() => {
        return replacementItems.reduce((sum, item) => sum + Number(item.product.price || 0) * item.quantity, 0)
    }, [replacementItems])

    const exchangeDifference = useMemo(() => Math.max(0, replacementTotal - calculatedRefundValue), [calculatedRefundValue, replacementTotal])
    const exchangeSurplus = useMemo(() => Math.max(0, calculatedRefundValue - replacementTotal), [calculatedRefundValue, replacementTotal])

    useEffect(() => {
        if (resolutionType === "refund") {
            if (refundType === "full") {
                setRefundValue(calculatedRefundValue)
            }
        } else if (resolutionType === "exchange" && exchangeBalanceResolution === "refund") {
            setRefundValue(exchangeSurplus)
        } else {
            setRefundValue(0)
        }

        if (resolutionType === "store_credit") {
            if (creditType === "full") {
                setCreditValue(calculatedRefundValue)
            }
        } else if (resolutionType === "exchange" && exchangeBalanceResolution === "store_credit") {
            setCreditValue(exchangeSurplus)
        } else {
            setCreditValue(0)
        }
    }, [calculatedRefundValue, creditType, refundType, resolutionType, exchangeBalanceResolution, exchangeSurplus])

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

    const completeSave = useCallback((returnToInventoryItems: { id: string; quantity: number }[] | null) => {
        if (!pendingSaveData) return
        onSave({
            ...pendingSaveData,
            returnToInventory: returnToInventoryItems !== null && returnToInventoryItems.length > 0,
            returnToInventoryItems,
        })
        setPendingSaveData(null)
        setIsInventoryRestoreModalOpen(false)
    }, [onSave, pendingSaveData])

    const handleSelectCustomer = useCallback((customer: any) => {
        setSelectedOrder((prev: any) => {
            if (!prev) return null
            return {
                ...prev,
                buyer_id: customer.id,
                customer_name: customer.name,
                customer: {
                    ...prev.customer,
                    id: customer.id,
                    name: customer.name,
                    email: customer.email || "",
                    phone: customer.phone || "",
                }
            }
        })
        setIsCustomerSheetOpen(false)
    }, [])

    const handleConfirmMpWarning = useCallback(() => {
        setIsMpWarningModalOpen(false)
        if (!pendingSaveData) return

        const shouldAskInventoryRestore =
            checkedItems.length > 0 &&
            resolutionType !== "rejected"

        if (shouldAskInventoryRestore) {
            const initialQty: Record<string, number> = {}
            checkedItems.forEach(i => { initialQty[i.id] = i.quantity })
            setInventoryRestoreQuantities(initialQty)
            setIsInventoryRestoreModalOpen(true)
            return
        }

        onSave({ ...pendingSaveData, returnToInventory: false, returnToInventoryItems: null })
        setPendingSaveData(null)
    }, [pendingSaveData, onSave, checkedItems, resolutionType, returnRequest])

    const handleFormSubmit = async () => {
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
                refundPaymentMethod,
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

            const isMpAutomaticRefund =
                returnStatus === "APPROVED" &&
                (resolutionType === "refund" || (resolutionType === "exchange" && exchangeSurplus > 0 && exchangeBalanceResolution === "refund")) &&
                refundPaymentMethod === "Mercado Pago" &&
                isMercadoPagoOrder

            if (isMpAutomaticRefund) {
                setPendingSaveData(payload)
                setIsMpWarningModalOpen(true)
                setMpWarningChecked(false)
                return
            }

            const shouldAskInventoryRestore =
                checkedItems.length > 0 &&
                resolutionType !== "rejected"

            if (shouldAskInventoryRestore) {
                setPendingSaveData(payload)
                const initialQty: Record<string, number> = {}
                checkedItems.forEach(i => { initialQty[i.id] = i.quantity })
                setInventoryRestoreQuantities(initialQty)
                setIsInventoryRestoreModalOpen(true)
                return
            }

            onSave({ ...payload, returnToInventory: false, returnToInventoryItems: null })
        } catch (err) {
            console.error("Error saving return request:", err)
        } finally {
            setIsUploading(false)
        }
    }

    const isSaveDisabled =
        isSaving ||
        isUploading ||
        !selectedOrder ||
        returnItems.filter(item => item.checked).length === 0 ||
        isViewOnly ||
        (isConsumidorFinal && (resolutionType === "store_credit" || (resolutionType === "exchange" && exchangeSurplus > 0 && exchangeBalanceResolution === "store_credit")))

    const pageTitle = mode === "create"
        ? "Nova devolução"
        : mode === "edit"
            ? `Editar devolução DVL-${returnRequest?.id.slice(0, 6).toUpperCase()}`
            : `Detalhes da devolução DVL-${returnRequest?.id.slice(0, 6).toUpperCase()}`

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
                                            {isViewOnly ? "Voltar" : "Cancelar"}
                                        </Button>
                                        {!isViewOnly && (
                                            <Button onClick={handleFormSubmit} disabled={isSaveDisabled} leftIcon={<SaveIcon size={18} />}>
                                                {isSaving || isUploading ? "Salvando..." : "Salvar"}
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
                                        {mode !== "create" && (
                                            <TabsTrigger value="history">Histórico</TabsTrigger>
                                        )}
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
                                                    {isViewOnly ? (
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
                                                                            <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body w-40 text-center">Motivo</th>
                                                                            <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body w-40 text-center">Condição</th>
                                                                            <th className="py-3 pl-4 pr-6 text-[13px] font-medium text-gray-500 dark:text-dark-body text-center w-36 rounded-r-lg">Qtd Devolver</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {returnItems.map((item, idx) => (
                                                                            <tr key={item.id} className="group hover:bg-brand-gray/10 transition-colors bg-white dark:bg-dark-background">
                                                                                <td className="py-4 pl-6 pr-2 border-b border-brand-border dark:border-dark-border align-middle">
                                                                                    <Checkbox
                                                                                        checked={item.checked}
                                                                                        disabled={isMarketplaceRequest}
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
                                                                                        disabled={!item.checked || isMarketplaceRequest}
                                                                                        value={item.reason}
                                                                                        setValue={(val) => {
                                                                                            setReturnItems(prev => {
                                                                                                const next = [...prev]
                                                                                                next[idx] = { ...next[idx], reason: val as any }
                                                                                                return next
                                                                                            })
                                                                                        }}
                                                                                        options={[
                                                                                            { value: "wrong_item", label: "Item errado" },
                                                                                            { value: "defective", label: "Item com defeito" },
                                                                                            { value: "damaged", label: "Item danificado" },
                                                                                            { value: "different_from_description", label: "Diferente da descrição" },
                                                                                            { value: "missing_parts", label: "Faltam partes" },
                                                                                            { value: "arrived_late", label: "Chegou atrasado" },
                                                                                            { value: "changed_mind", label: "Mudou de ideia" },
                                                                                            { value: "other", label: "Outro" }
                                                                                        ]}
                                                                                    />
                                                                                </td>
                                                                                <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border align-middle">
                                                                                    <FormDropdown
                                                                                        disabled={!item.checked || isMarketplaceRequest}
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
                                                                                        <QuantitySelector
                                                                                            value={item.quantity}
                                                                                            onChange={(val) => {
                                                                                                setReturnItems(prev => {
                                                                                                    const next = [...prev]
                                                                                                    next[idx] = { ...next[idx], quantity: val }
                                                                                                    return next
                                                                                                })
                                                                                            }}
                                                                                            min={1}
                                                                                            max={item.maxQuantity}
                                                                                            size="md"
                                                                                            disabled={!item.checked || isMarketplaceRequest}
                                                                                        />
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
                                                                                disabled={isMarketplaceRequest}
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
                                                                                    disabled={!item.checked || isMarketplaceRequest}
                                                                                    value={item.reason}
                                                                                    setValue={(val) => {
                                                                                        setReturnItems(prev => {
                                                                                            const next = [...prev]
                                                                                            next[idx] = { ...next[idx], reason: val as any }
                                                                                            return next
                                                                                        })
                                                                                    }}
                                                                                    options={[
                                                                                        { value: "wrong_item", label: "Item errado" },
                                                                                        { value: "defective", label: "Item com defeito" },
                                                                                        { value: "damaged", label: "Item danificado" },
                                                                                        { value: "different_from_description", label: "Diferente da descrição" },
                                                                                        { value: "missing_parts", label: "Faltam partes" },
                                                                                        { value: "arrived_late", label: "Chegou atrasado" },
                                                                                        { value: "changed_mind", label: "Mudou de ideia" },
                                                                                        { value: "other", label: "Outro" }
                                                                                    ]}
                                                                                />
                                                                                <FormDropdown
                                                                                    label="Condição"
                                                                                    disabled={!item.checked || isMarketplaceRequest}
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
                                                                                    <QuantitySelector
                                                                                        value={item.quantity}
                                                                                        onChange={(val) => {
                                                                                            setReturnItems(prev => {
                                                                                                const next = [...prev]
                                                                                                next[idx] = { ...next[idx], quantity: val }
                                                                                                return next
                                                                                            })
                                                                                        }}
                                                                                        min={1}
                                                                                        max={item.maxQuantity}
                                                                                        size="md"
                                                                                        disabled={!item.checked || isMarketplaceRequest}
                                                                                    />
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
                                                    {isViewOnly ? (
                                                        <div className="space-y-1">
                                                            <PaymentRow label="Data" value={formatDateTime(returnDate)} />
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
                                                                    {refundPaymentMethod && (
                                                                        <PaymentRow label="Método de reembolso" value={refundPaymentMethod} />
                                                                    )}
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
                                                                disabled={isViewOnly}
                                                                value={returnDate}
                                                                onChange={(d) => d && setReturnDate(d)}
                                                            />

                                                            <FormDropdown
                                                                label="Status da solicitação"
                                                                disabled={isViewOnly}
                                                                value={returnStatus}
                                                                setValue={(val) => setReturnStatus(val as ReturnRequest["status"])}
                                                                options={[
                                                                    { value: "PENDING_REVIEW", label: "Pendente" },
                                                                    { value: "UNDER_ANALYSIS", label: "Em analise" },
                                                                    { value: "WAITING_CUSTOMER", label: "Aguardando cliente" },
                                                                    { value: "APPROVED", label: "Aprovada" },
                                                                    { value: "REJECTED", label: "Recusada" },
                                                                ]}
                                                            />

                                                            <FormDropdown
                                                                label="Tipo de resolução"
                                                                disabled={isViewOnly || isMarketplaceRequest}
                                                                value={resolutionType}
                                                                setValue={(val) => setResolutionType(val as any)}
                                                                options={[
                                                                    { value: "refund", label: "Reembolso" },
                                                                    { value: "store_credit", label: "Vale-compra" },
                                                                    { value: "exchange", label: "Troca" },
                                                                    { value: "none", label: "Sem resolução" },
                                                                ]}
                                                            />

                                                            {isConsumidorFinal && (resolutionType === "store_credit" || (resolutionType === "exchange" && exchangeSurplus > 0 && exchangeBalanceResolution === "store_credit")) && (
                                                                <div className="md:col-span-2 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded-2xl">
                                                                    <InfoCard
                                                                        title="Cliente não cadastrado"
                                                                        message="Este pedido está vinculado a um 'Consumidor Final'. Para gerar vale-compra (crédito), é necessário vincular um cliente registrado no sistema."
                                                                        color="orange"
                                                                        rightElement={
                                                                            <Button
                                                                                variant="link"
                                                                                className="text-orange-700 dark:text-orange-300/80"
                                                                                onClick={() => setIsCustomerSheetOpen(true)}
                                                                                type="button"
                                                                            >
                                                                                Vincular Cliente
                                                                            </Button>
                                                                        }
                                                                    />
                                                                </div>
                                                            )}

                                                            {resolutionType === "refund" && (
                                                                <>
                                                                    <FormDropdown
                                                                        label="Tipo de reembolso"
                                                                        disabled={isViewOnly}
                                                                        value={refundType || "partial"}
                                                                        setValue={(val) => setRefundType(val as ReturnRequest["refundType"])}
                                                                        options={[
                                                                            { value: "full", label: "Integral" },
                                                                            { value: "partial", label: "Parcial" },
                                                                            { value: "none", label: "Sem reembolso" }
                                                                        ]}
                                                                    />
                                                                    <MoneyInput
                                                                        label="Valor do reembolso"
                                                                        disabled={refundType === "full" || refundType === "none" || isViewOnly}
                                                                        value={refundValue}
                                                                        onChange={(val) => setRefundValue(Math.min(Number(val || 0), calculatedRefundValue))}
                                                                    />
                                                                    <FormDropdown
                                                                        label="Método de reembolso"
                                                                        disabled={isViewOnly || isMercadoPagoOrder}
                                                                        value={refundPaymentMethod}
                                                                        setValue={(val) => setRefundPaymentMethod(val)}
                                                                        options={
                                                                            isMercadoPagoOrder
                                                                                ? [
                                                                                    { value: "Mercado Pago", label: "Mercado Pago (Automático)" },
                                                                                    { value: "pix", label: "Pix (Manual)" },
                                                                                    { value: "credit_card", label: "Cartão de Crédito (Manual)" },
                                                                                    { value: "other", label: "Outro (Manual)" }
                                                                                ]
                                                                                : [
                                                                                    { value: "pix", label: "Pix" },
                                                                                    { value: "credit_card", label: "Cartão de Crédito" },
                                                                                    { value: "other", label: "Outro" }
                                                                                ]
                                                                        }
                                                                    />
                                                                </>
                                                            )}

                                                            {resolutionType === "store_credit" && (
                                                                <>
                                                                    <FormDropdown
                                                                        label="Tipo do vale-compra"
                                                                        disabled={isViewOnly}
                                                                        value={creditType}
                                                                        setValue={(val) => setCreditType(val as "full" | "partial")}
                                                                        options={[
                                                                            { value: "full", label: "Integral" },
                                                                            { value: "partial", label: "Parcial" }
                                                                        ]}
                                                                    />
                                                                    <MoneyInput
                                                                        label="Valor do vale-compra"
                                                                        disabled={creditType === "full" || isViewOnly}
                                                                        value={creditValue}
                                                                        onChange={(val) => setCreditValue(Math.min(Number(val || 0), calculatedRefundValue))}
                                                                    />
                                                                </>
                                                            )}

                                                            {resolutionType === "exchange" && (
                                                                <>
                                                                    <div ref={replacementSearchRef} className="relative md:col-span-2">
                                                                        <Input
                                                                            label="Produtos de reposição"
                                                                            disabled={isViewOnly}
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
                                                                                            const prodAny = product as any
                                                                                            const promoPrice = prodAny.promotional_price
                                                                                            const categoryId = prodAny.category_id
                                                                                            const pr = computeItemDisplayPrice(
                                                                                                Number(product.price || 0),
                                                                                                promoPrice && Number(promoPrice) < Number(product.price || 0) ? Number(promoPrice) : null,
                                                                                                promotions,
                                                                                                { productId: product.id, categoryId: categoryId || undefined }
                                                                                            )
                                                                                            const displayStock = product.has_variants
                                                                                                ? (product.variants || []).reduce((sum: number, v: any) => sum + Number(v.stock || 0), 0)
                                                                                                : product.stock
                                                                                            return (
                                                                                                <div
                                                                                                    key={product.id}
                                                                                                    className={`flex items-center gap-4 p-3.5 border-b border-brand-border dark:border-dark-border last:border-0 transition-colors ${alreadyAdded ? 'opacity-40 cursor-default' : 'hover:bg-gray-50 dark:hover:bg-dark-border cursor-pointer'}`}
                                                                                                    onClick={() => !alreadyAdded && addReplacementProduct({
                                                                                                        ...product,
                                                                                                        price: pr.bestPrice,
                                                                                                    })}
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
                                                                                                        <div className="flex items-center gap-1.5">
                                                                                                            {pr.referencePrice && (
                                                                                                                <span className="text-xs text-brand-inactive-text line-through">{formatCurrency(pr.referencePrice)}</span>
                                                                                                            )}
                                                                                                            <div className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                                                                                {formatCurrency(pr.bestPrice)}
                                                                                                            </div>
                                                                                                            {pr.badgeVariant && (
                                                                                                                <Badge variant={pr.badgeVariant} icon={null} className="whitespace-nowrap text-[10px] px-1.5 py-0.5">
                                                                                                                    -{pr.discountPercent}%
                                                                                                                </Badge>
                                                                                                            )}
                                                                                                        </div>
                                                                                                        <div className="text-xs font-bold text-white bg-brand-dark dark:bg-brand-green px-2 py-1 rounded-md whitespace-nowrap">
                                                                                                            {displayStock} em estoque
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
                                                                                            disabled={item.quantity <= 1 || isViewOnly}
                                                                                            onClick={() => updateReplacementQty(index, item.quantity - 1)}
                                                                                            className="h-9 w-9 rounded-full border border-brand-border text-brand-dark disabled:opacity-40 dark:border-dark-border dark:text-dark-heading"
                                                                                        >
                                                                                            -
                                                                                        </button>
                                                                                        <span className="w-8 text-center text-sm font-bold text-brand-dark dark:text-dark-heading">{item.quantity}</span>
                                                                                        <button
                                                                                            type="button"
                                                                                            disabled={isViewOnly}
                                                                                            onClick={() => updateReplacementQty(index, item.quantity + 1)}
                                                                                            className="h-9 w-9 rounded-full border border-brand-border text-brand-dark disabled:opacity-40 dark:border-dark-border dark:text-dark-heading"
                                                                                        >
                                                                                            +
                                                                                        </button>
                                                                                        <button
                                                                                            type="button"
                                                                                            disabled={isViewOnly}
                                                                                            onClick={() => removeReplacementProduct(index)}
                                                                                            className="h-9 w-9 rounded-full text-brand-red hover:bg-brand-red-light disabled:opacity-40"
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
                                                                        label="Status da troca"
                                                                        disabled={isViewOnly}
                                                                        value={exchangeStatus}
                                                                        setValue={setExchangeStatus}
                                                                        options={[
                                                                            { value: "pending", label: "Pendente" },
                                                                            { value: "reserved", label: "Reservado" },
                                                                            { value: "sent", label: "Enviado" },
                                                                            { value: "completed", label: "Concluído" }
                                                                        ]}
                                                                    />
                                                                    <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                                                                        <div className="rounded-xl border border-brand-border dark:border-dark-border p-4">
                                                                            <p className="text-brand-inactive-text dark:text-dark-body">Total dos substitutos</p>
                                                                            <p className="font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(replacementTotal)}</p>
                                                                        </div>
                                                                        <div className="rounded-xl border border-brand-border dark:border-dark-border p-4">
                                                                            <p className="text-brand-inactive-text dark:text-dark-body">Crédito disponível</p>
                                                                            <p className="font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(calculatedRefundValue)}</p>
                                                                        </div>
                                                                        <div className="rounded-xl border border-brand-border dark:border-dark-border p-4">
                                                                            <p className="text-brand-inactive-text dark:text-dark-body">{exchangeDifference > 0 ? "Diferença a cobrar" : "Saldo restante"}</p>
                                                                            <p className="font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(exchangeDifference > 0 ? exchangeDifference : exchangeSurplus)}</p>
                                                                        </div>
                                                                    </div>
                                                                    {exchangeSurplus > 0 && (
                                                                        <>
                                                                            <FormDropdown
                                                                                label="Destino do saldo"
                                                                                disabled={isViewOnly}
                                                                                value={exchangeBalanceResolution}
                                                                                setValue={(val) => setExchangeBalanceResolution(val as "store_credit" | "refund")}
                                                                                options={[
                                                                                    { value: "store_credit", label: "Gerar vale-compra" },
                                                                                    { value: "refund", label: "Gerar reembolso" }
                                                                                ]}
                                                                            />
                                                                            {exchangeBalanceResolution === "refund" && (
                                                                                <>
                                                                                    <FormDropdown
                                                                                        label="Tipo de reembolso"
                                                                                        disabled={true}
                                                                                        value="full"
                                                                                        setValue={() => { }}
                                                                                        options={[
                                                                                            { value: "full", label: "Integral (Saldo restante)" },
                                                                                            { value: "partial", label: "Parcial" }
                                                                                        ]}
                                                                                    />
                                                                                    <MoneyInput
                                                                                        label="Valor do reembolso"
                                                                                        disabled={true}
                                                                                        value={exchangeSurplus}
                                                                                        onChange={() => { }}
                                                                                    />
                                                                                    <FormDropdown
                                                                                        label="Método de reembolso"
                                                                                        disabled={isViewOnly || isMercadoPagoOrder}
                                                                                        value={refundPaymentMethod}
                                                                                        setValue={(val) => setRefundPaymentMethod(val)}
                                                                                        options={
                                                                                            isMercadoPagoOrder
                                                                                                ? [
                                                                                                    { value: "Mercado Pago", label: "Mercado Pago (Automático)" },
                                                                                                    { value: "pix", label: "Pix (Manual)" },
                                                                                                    { value: "credit_card", label: "Cartão de Crédito (Manual)" },
                                                                                                    { value: "other", label: "Outro (Manual)" }
                                                                                                ]
                                                                                                : [
                                                                                                    { value: "pix", label: "Pix" },
                                                                                                    { value: "credit_card", label: "Cartão de Crédito" },
                                                                                                    { value: "other", label: "Outro" }
                                                                                                ]
                                                                                        }
                                                                                    />
                                                                                </>
                                                                            )}
                                                                        </>
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
                                                isEditing={!isViewOnly && !isMarketplaceRequest}
                                                uploadingImages={uploadingImages}
                                                isSaving={isSaving || isUploading}
                                            />
                                        </FadeIn>
                                    </TabsContent>

                                    <TabsContent value="observations" className="mt-0">
                                        <FadeIn key="observations" className="space-y-6">
                                            <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Observações da Devolução</h3>
                                            {returnRequest?.customerMessage && (
                                                <div className="space-y-2">
                                                    <label className="text-sm font-bold text-brand-dark dark:text-dark-heading">Observações do Cliente</label>
                                                    <div className="p-3.5 bg-brand-gray/50 dark:bg-dark-border/30 rounded-xl text-sm text-brand-dark dark:text-dark-heading whitespace-pre-wrap border border-brand-border/40 dark:border-dark-border/40">
                                                        {returnRequest.customerMessage}
                                                    </div>
                                                </div>
                                            )}
                                            <FormTextarea
                                                name="observations"
                                                label="Observações Internas (Vendedor)"
                                                placeholder="Adicione observações internas sobre a troca/devolução. O cliente também poderá visualizar essas observações."
                                                disabled={isViewOnly}
                                                value={observations}
                                                onChange={(e) => setObservations(e.target.value)}
                                                maxLength={1000}
                                                showCharacterCount={true}
                                            />
                                        </FadeIn>
                                    </TabsContent>

                                    {mode !== "create" && (
                                        <TabsContent value="history" className="mt-0">
                                            <ReturnHistoryTab events={returnEvents} loading={historyLoading} />
                                        </TabsContent>
                                    )}
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
                </Tabs >
            </div >

            {/* Mobile action bar */}
            < div className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-brand-border dark:border-dark-border bg-white dark:bg-dark-background p-4 flex gap-3" >
                <Button variant="outline" onClick={handleBack} className="flex-1" disabled={isSaving || isUploading}>
                    {isViewOnly ? "Voltar" : "Cancelar"}
                </Button>
                {
                    !isViewOnly && (
                        <Button onClick={handleFormSubmit} className="flex-1" disabled={isSaveDisabled}>
                            {isSaving || isUploading ? "Salvando..." : "Salvar"}
                        </Button>
                    )
                }
            </div >

            {showImageCropper && selectedImageForCrop && (
                <ImageCropperModal
                    isOpen
                    imageFile={selectedImageForCrop}
                    onClose={() => setShowImageCropper(false)}
                    onCropComplete={handleImageCropComplete}
                />
            )
            }

            <DefaultModal
                isOpen={isInventoryRestoreModalOpen}
                onClose={() => {
                    setPendingSaveData(null)
                    setIsInventoryRestoreModalOpen(false)
                }}
                title="Restaurar itens ao estoque?"
                maxWidth="lg"
            >
                <div className="flex flex-col gap-4">
                    <p className="text-brand-inactive-text dark:text-dark-body text-sm leading-relaxed">
                        Selecione quantos itens devolvidos devem retornar ao estoque.
                    </p>

                    {/* Table-like list of items */}
                    <div className="border border-brand-border/40 dark:border-dark-border/40 rounded-xl overflow-hidden mt-2">
                        {/* Header */}
                        <div className="bg-brand-gray dark:bg-dark-border/20 px-4 py-3 flex items-center justify-between border-b border-brand-border/40 dark:border-dark-border/40 text-xs font-bold text-brand-inactive-text dark:text-dark-body uppercase tracking-wider">
                            <div className="flex items-center gap-3">
                                <span>Item</span>
                            </div>
                            <span className="pr-2">Voltar ao estoque</span>
                        </div>

                        {/* Rows */}
                        <div className="divide-y divide-brand-border/40 dark:divide-dark-border/40 max-h-[300px] overflow-y-auto custom-scrollbar">
                            {checkedItems.map((item) => {
                                const currentQty = inventoryRestoreQuantities[item.id] ?? 0
                                return (
                                    <div key={item.id} className="px-4 py-3 flex items-center justify-between hover:bg-brand-gray/30 dark:hover:bg-dark-border/10 transition-colors">
                                        <div className="flex items-center gap-3 min-w-0 flex-1">
                                            <div className="w-10 h-10 rounded-lg overflow-hidden border border-brand-border/40 dark:border-dark-border/40 shrink-0 bg-brand-gray dark:bg-dark-border/30 flex items-center justify-center">
                                                <img
                                                    src={item.image || "https://img.dudit.com.br/static/Placeholder.png"}
                                                    alt={item.productName}
                                                    className="w-full h-full object-cover"
                                                />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
                                                    {item.productName}
                                                </p>
                                                <p className="text-xs text-brand-inactive-text dark:text-dark-body truncate">
                                                    SKU: {item.sku || "Sem SKU"} &bull; {item.quantity} devolvido(s)
                                                </p>
                                            </div>
                                        </div>
                                        <div className="shrink-0">
                                            <QuantitySelector
                                                value={currentQty}
                                                onChange={(val) => {
                                                    setInventoryRestoreQuantities(prev => ({
                                                        ...prev,
                                                        [item.id]: val,
                                                    }))
                                                }}
                                                min={0}
                                                max={item.quantity}
                                                size="sm"
                                            />
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 mt-4">
                        <Button
                            variant="outline"
                            onClick={() => {
                                setPendingSaveData(null)
                                setIsInventoryRestoreModalOpen(false)
                            }}
                            disabled={isSaving}
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={() => completeSave([])}
                            variant="outline"
                            className="text-brand-red hover:bg-brand-red-light hover:border-brand-red"
                            disabled={isSaving}
                        >
                            Não retornar nenhum
                        </Button>
                        <Button
                            onClick={() => {
                                const items = Object.entries(inventoryRestoreQuantities)
                                    .filter(([_, qty]) => qty > 0)
                                    .map(([id, quantity]) => ({ id, quantity }))
                                completeSave(items)
                            }}
                            disabled={isSaving}
                        >
                            {isSaving ? "Salvando..." : "Confirmar e salvar"}
                        </Button>
                    </div>
                </div>
            </DefaultModal>

            <DefaultModal
                isOpen={isMpWarningModalOpen}
                onClose={() => {
                    setIsMpWarningModalOpen(false)
                    setPendingSaveData(null)
                }}
                maxWidth="md"
            >
                <div className="flex flex-col relative">
                    <button
                        onClick={() => {
                            setIsMpWarningModalOpen(false)
                            setPendingSaveData(null)
                        }}
                        className="absolute top-3 right-3 z-10 w-10 h-10 rounded-full bg-black/5 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20 flex items-center justify-center text-brand-dark dark:text-dark-heading transition-colors hidden md:flex"
                        title="Fechar"
                    >
                        <XIcon size={18} />
                    </button>

                    <div className="h-[200px] rounded-2xl flex items-end justify-center mb-6 relative overflow-hidden bg-[#e6f4ea]">
                        <img
                            src="https://img.dudit.com.br/static/illustrations/Pagamento.png"
                            alt="Reembolso Automático"
                            className="w-64 h-auto object-contain transform translate-y-4"
                        />
                    </div>

                    <h4 className="text-brand-dark dark:text-dark-heading text-xl font-bold mb-2 text-center">
                        Confirmar Reembolso Automático
                    </h4>
                    <p className="text-brand-inactive-text dark:text-dark-body text-[15px] mb-6 text-center leading-relaxed">
                        Você está prestes a aprovar uma devolução com reembolso automático via <strong>Mercado Pago</strong>. O valor será estornado diretamente na conta ou cartão do comprador.
                    </p>

                    <div className="bg-brand-gray dark:bg-dark-border/30 rounded-xl p-4 mb-6 space-y-2.5">
                        <div className="flex justify-between text-sm">
                            <span className="text-brand-inactive-text dark:text-dark-body">Pedido</span>
                            <span className="font-bold text-brand-dark dark:text-dark-heading">{selectedOrder?.displayId || selectedOrder?.order_number}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-brand-inactive-text dark:text-dark-body">Cliente</span>
                            <span className="font-bold text-brand-dark dark:text-dark-heading">{selectedOrder?.customer_name || selectedOrder?.customer?.name}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-brand-inactive-text dark:text-dark-body">Valor do Estorno</span>
                            <span className="font-extrabold text-emerald-600 dark:text-emerald-400">
                                {formatCurrency(refundValue)}
                            </span>
                        </div>
                    </div>

                    <div className="mb-6 flex items-start gap-3 bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 rounded-xl p-4">
                        <Checkbox
                            checked={mpWarningChecked}
                            onChange={(checked: boolean) => setMpWarningChecked(!!checked)}
                        />
                        <div
                            className="text-xs font-medium text-red-800 dark:text-red-300 leading-normal select-none cursor-pointer"
                            onClick={() => setMpWarningChecked(!mpWarningChecked)}
                        >
                            Estou ciente de que o estorno de <strong className="font-bold">{formatCurrency(refundValue)}</strong> será solicitado imediatamente ao Mercado Pago e que esta ação não poderá ser desfeita.
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3">
                        <Button
                            variant="outline"
                            onClick={() => {
                                setIsMpWarningModalOpen(false)
                                setPendingSaveData(null)
                            }}
                            className="flex-1 h-[46px]"
                            disabled={isSaving}
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleConfirmMpWarning}
                            className={`flex-1 h-[46px] text-white border-none transition-colors ${mpWarningChecked
                                ? "bg-emerald-600 hover:bg-emerald-700"
                                : "bg-emerald-600/50 cursor-not-allowed opacity-50"
                                }`}
                            disabled={!mpWarningChecked || isSaving}
                        >
                            Confirmar Estorno
                        </Button>
                    </div>
                </div>
            </DefaultModal>

            <UnsavedChangesDialog
                open={showConfirmDialog}
                onConfirm={confirmNavigation}
                onCancel={cancelNavigation}
                description="Você tem alterações na devolução que ainda não foram salvas."
            />

            {
                isCustomerSheetOpen && (
                    <SelectCustomerSheet
                        isOpen={isCustomerSheetOpen}
                        onClose={() => setIsCustomerSheetOpen(false)}
                        partnerId={partnerId}
                        onSelect={handleSelectCustomer}
                        selectedCustomerId={selectedOrder?.buyer_id}
                    />
                )
            }
        </FadeIn >
    )
}
