"use client"

import React, { useState, useEffect, useCallback, useRef, useMemo, type FC } from "react"
import { useScrollToFirstError } from "@/hooks/use-scroll-to-first-error"
import { AnimatePresence } from "framer-motion"
import { Tabs, TabsList, TabsTrigger, Button, Badge, Tooltip, Input, Combobox, ActionsDropdown } from "@/components/reusable"
import { ChevronLeftIcon, ThreeDotsIcon, EditIcon, SaveIcon } from "@/lib/icons"
import type { Product } from "@/lib/types/product"
import { useNotification } from "@/hooks/use-notification"
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes"
import { useStore } from "@/lib/store-context"
import { useSidebar } from "@/lib/sidebar-context"
import { createProductComprehensiveAction, updateProductComprehensiveAction, deleteProductAction, archiveProductAction, unarchiveProductAction } from "@/app/actions/erp/products"
import { createCategoryAction, createBrandAction, createLocationAction } from "@/app/actions/erp/product-metadata"
import { generateSKUBase } from "@/lib/utils/code-generators"
import { useProductMetadata } from "@/lib/product-metadata-context"
import { detectMonophasicByNcm } from "@/lib/fiscal-utils"
import { mapProductToFormData } from "@/lib/utils/product-mappers"
import { usePermissions } from "@/lib/permission-context"
import { hasMinimumPlan } from "@/lib/subscription/plan-tier"
import { getNextPlanTarget, isPlanLimitReachedError } from "@/lib/subscription/limit-upgrade"
import { planStarIconForTarget, usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal"
import { fetchJSONWithCSRF, fetchWithCSRF } from "@/lib/utils/fetch-with-csrf"
import { FadeIn } from "@/components/animations/FadeIn"
import { Spinner } from "@/components/reusable/Spinner"
import { normalizeBusinessInfo, isQuickMode } from "@/lib/business-info"
import { ShareModal } from "@/components/marketplace/ShareModal"
import { getProductUrl } from "@/lib/utils/url-generator"
import { generateEAN13 } from "@/lib/utils/barcode"
import DefaultModal from "@/components/reusable/DefaultModal"
import AlertModal from "@/components/reusable/AlertModal"
import SavingStatusModal from "@/components/reusable/SavingStatusModal"
import ImageCropperModal from "@/components/ImageCropperModal"
import NcmSelectionModal from "./NcmSelectionModal"
import { ProductGeneralTab } from "./ProductGeneralTab"
import { ProductVariationsTab } from "./ProductVariationsTab"
import { ProductSuppliersTab } from "./ProductSuppliersTab"
import { ProductMarketplaceTab } from "./ProductMarketplaceTab"
import { ProductMetricsTab } from "./ProductMetricsTab"

const NUMERIC_FIELDS = new Set([
    "price", "costPrice", "stock", "minStock", "maxStock", "promotional_price",
    "origin", "weight_gross", "weight_net", "width", "height", "length",
    "preparation_days", "warranty_value", "availability_value",
])

const BOOLEAN_FIELDS = new Set(["is_active", "allow_sell_without_stock", "show_in_marketplace", "show_price_in_store"])

const REQUIRED_FIELDS = [
    { field: "name", tab: "general", validate: (v: any) => !!v?.trim(), message: "Nome é obrigatório" },
    {
        field: "price",
        tab: "general",
        validate: (v: any, data: any) => {
            const hasVariants = (() => {
                const val = data.variants
                if (Array.isArray(val) && val.length > 0) {
                    if (typeof val[0]?.count === 'number') return val[0].count > 0
                    return true
                }
                const pv = data.pending_variants
                if (Array.isArray(pv) && pv.length > 0) return true
                return false
            })()
            return hasVariants || data.show_price_in_store === false || v > 0
        },
        message: "Preço inválido"
    },
    {
        field: "stock",
        tab: "general",
        validate: (v: any, data: any) => {
            if (data?.businessInfo?.mode === "desapego" || data?.mode === "desapego") return true
            return v !== undefined && v !== null
        },
        message: "Estoque é obrigatório"
    },
    { field: "sku", tab: "general", validate: () => true, message: "" },
    { field: "gtin", tab: "general", validate: () => true, message: "" },
    { field: "costPrice", tab: "general", validate: () => true, message: "" },
    { field: "category_id", tab: "general", validate: () => true, message: "" },
    { field: "origin", tab: "fiscal", validate: () => true, message: "" },
    { field: "cest", tab: "fiscal", validate: () => true, message: "" },
    { field: "ncm", tab: "fiscal", validate: () => true, message: "" },
]

const getEmptyProduct = () => ({
    id: "", name: "", category: "", category_id: "", productId: "", sku: "", description: "", subcategory: "", subcategory_id: "", brand: "", brand_id: "", gtin: "",
    price: 0, costPrice: 0, stock: 0, minStock: 0, maxStock: 0, promotional_price: null, promotionTypeId: null,
    condicao: "Novo", unidade: "UN", localizacao: "", location_id: "", productType: "Físico",
    images: [], primary_image_index: 0, video_type: null, video_url: "", video_thumbnail: null, video_duration: null, video_provider_id: null,
    is_active: true, show_in_marketplace: true, allow_sell_without_stock: false, show_price_in_store: true,
    marketplace_category_id: null, availability_value: 0, availability_unit: "Dias",
    warranty_value: 0, warranty_period: "Meses",
    attributes: [], related_products: [],
    addon_groups: [], accepts_offers: false, accepts_trades: false,
    ncm: "", cest: "", origin: 0, item_type: "00", fci_code: null,
    cfop_internal: "5102", cfop_external: "6102", csosn: "102", tax_percentage: 0,
    pis_cst: "99", pis_rate: 0, cofins_cst: "99", cofins_rate: 0, ipi_cst: "99", ipi_code: null,
    product_situation: "revenda", c_benef: null, inf_ad_prod: null,
    weight_gross: 0, weight_net: 0, width: 0, height: 0, length: 0, packaging_type: "package", preparation_days: 0,
    tags: [], pending_variants: [], pending_suppliers: [],
})



interface AddProductPageProps {
    onBack: () => void
    product?: Product | null
    mode: "add" | "details" | "edit" | "duplicate"
    setMode: (mode: "add" | "details" | "edit" | "duplicate") => void
    suppliers?: Array<{ id: string; name: string; email: string | null; phone: string | null }>
    isSaving?: boolean
    productId?: string
    initialData?: Product | null
    onClose?: () => void
    unidadesMedida?: Array<{ codigo: string; descricao: string }>
    partnerId?: string
    storeId?: string
    isLoadingDetails?: boolean
    onSave?: (data: any, isDraft?: boolean) => Promise<{ success: boolean; error?: string } | void>
    onDuplicate?: (product: Product) => void
    onDelete?: () => void
    partner?: any
}

const AddProductPage: FC<AddProductPageProps> = ({
    onBack, product: initialProduct, mode: initialModeProp, setMode,
    isSaving = false, productId, initialData, onClose, unidadesMedida = [],
    partnerId: propPartnerId, storeId: propStoreId, isLoadingDetails = false,
    onSave,
    partner,
}) => {
    const [internalMode, setInternalMode] = useState(initialModeProp)
    useEffect(() => { setInternalMode(initialModeProp) }, [initialModeProp])

    const isEditing = useMemo(() => ["add", "edit", "duplicate"].includes(internalMode), [internalMode])

    const { error: notifyError, success: notifySuccess, info: notifyInfo, warning: notifyWarning } = useNotification()
    const { selectedStore } = useStore()
    const { setHeaderOverride } = useSidebar()
    const { businessInfo: contextBusinessInfo, planSlug } = usePermissions()
    const { openPlanUpgrade } = usePlanUpgrade()
    const variantsPlanBlocked = !hasMinimumPlan(planSlug, "crescer")
    const metricsPlanBlocked = !hasMinimumPlan(planSlug, "escalar")
    const metadataPlanBlocked = !hasMinimumPlan(planSlug, "crescer")
    const videoPlanBlocked = !hasMinimumPlan(planSlug, "crescer")
    const suppliersPlanBlocked = !hasMinimumPlan(planSlug, "crescer")

    const businessInfo = useMemo(() => normalizeBusinessInfo(contextBusinessInfo), [contextBusinessInfo])
    const isQuick = isQuickMode(businessInfo)
    const isDesapego = businessInfo.mode === "desapego"

    const partnerId = propPartnerId || selectedStore?.partner_id || ""
    const storeId = propStoreId || selectedStore?.id || ""

    // Sidebar hiding logic removed per user plan (using specific mobile header)

    const [isScrolled, setIsScrolled] = useState(false)
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
    }, [])

    const initialProductState = useMemo(() => {
        const base = { ...getEmptyProduct(), id: crypto.randomUUID() }
        // @ts-ignore
        const mapped = mapProductToFormData(initialProduct || initialData)
        if (!mapped) return base
        if (internalMode === "duplicate") {
            return { ...base, ...mapped, id: crypto.randomUUID(), productId: "", sku: "", name: `${mapped.name} (Cópia)`, images: mapped.images || [] }
        }
        // @ts-ignore
        const realImages = (mapped.images || []).filter((img: string | File) => typeof img === "string" && !img.startsWith("data:"))
        return { ...base, ...mapped, id: mapped.id || base.id, images: realImages.length > 0 ? realImages : base.images }
    }, [initialProduct, initialData, internalMode])

    const quickAdjustedInitial = useMemo(() => {
        if (!isQuick) return initialProductState
        return {
            ...initialProductState,
            show_in_marketplace: true,
        }
    }, [initialProductState, isQuick])

    const [productData, setProductData] = useState<any>(quickAdjustedInitial)
    const [originalProductData, setOriginalProductData] = useState(quickAdjustedInitial)
    const [originalNameForDuplicate, setOriginalNameForDuplicate] = useState("")

    useEffect(() => {
        setProductData(quickAdjustedInitial)
        setOriginalProductData(quickAdjustedInitial)
    }, [quickAdjustedInitial])

    const lastNcmSearchRef = useRef<string>("")
    const csrfTokenCache = useRef<{ token: string; timestamp: number } | null>(null)

    const isDirty = useMemo(() => {
        for (const key in productData) {
            // @ts-ignore
            if (productData[key] !== originalProductData[key]) return true
        }
        return false
    }, [productData, originalProductData])

    const { showConfirmDialog: unsavedChangesDialogOpen, confirmNavigation: handleUnsavedChangesConfirm, cancelNavigation: handleUnsavedChangesDialogClose } = useUnsavedChanges(isEditing && isDirty)

    const [showAlertModal, setShowAlertModal] = useState(false)
    const [nextAction, setNextAction] = useState<(() => void) | null>(null)

    const handleAttemptNav = useCallback((action: () => void) => {
        if (isEditing && isDirty) { setNextAction(() => action); setShowAlertModal(true) }
        else action()
    }, [isEditing, isDirty])

    const handleBack = useCallback(() => handleAttemptNav(onBack), [handleAttemptNav, onBack])

    const handleCancelEdit = useCallback(() => {
        handleAttemptNav(() => {
            setProductData(initialProductState)
            setOriginalProductData(initialProductState)
            setPendingImages([])
            onBack()
        })
    }, [handleAttemptNav, initialProductState, onBack])

    const confirmNavigation = useCallback(() => {
        nextAction?.()
        setShowAlertModal(false)
    }, [nextAction])

    const [activeTab, setActiveTab] = useState("general")

    // Use shared metadata context (cached across form opens)
    const { metadata, isLoading: isLoadingMetadata, loadMetadata, refreshMetadata } = useProductMetadata()

    useEffect(() => {
        if (partnerId) loadMetadata(partnerId)
    }, [partnerId, loadMetadata])

    const fetchMetadata = useCallback(async () => {
        if (partnerId) await refreshMetadata(partnerId)
    }, [partnerId, refreshMetadata])

    const categoryOptions = useMemo(() =>
        metadata.categories.filter(c => !c.parent_id).map(c => ({ value: c.id, label: c.name })),
        [metadata.categories])

    const subCategoryOptions = useMemo(() => {
        if (!productData.category_id) return []
        return metadata.categories
            .filter(c => c.parent_id === productData.category_id)
            .map(c => ({ value: c.id, label: c.name }))
    }, [metadata.categories, productData.category_id])

    const brandOptions = useMemo(() =>
        metadata.brands.map(b => ({ value: b.id, label: b.name })),
        [metadata.brands])

    const locationOptions = useMemo(() =>
        metadata.locations.map(l => ({ value: l.id, label: l.name })),
        [metadata.locations])

    // State for metadata creation
    const [metadataModal, setMetadataModal] = useState<{
        isOpen: boolean,
        type: "category" | "subcategory" | "brand" | "location" | null,
        name: string,
        parentId?: string | null,
        isSaving: boolean
    }>({ isOpen: false, type: null, name: "", parentId: null, isSaving: false })

    const handleOpenMetadataModal = (type: "category" | "subcategory" | "brand" | "location") => {
        setMetadataModal({
            isOpen: true,
            type,
            name: "",
            parentId: type === "subcategory" ? productData.category_id : null,
            isSaving: false
        })
    }

    const handleSaveMetadata = async () => {
        if (!metadataModal.name.trim() || !partnerId) return
        setMetadataModal(prev => ({ ...prev, isSaving: true }))

        let result: any
        try {
            switch (metadataModal.type) {
                case "category":
                    result = await createCategoryAction({ partnerId, name: metadataModal.name })
                    if (result.success) setProductData((prev: any) => ({ ...prev, category_id: result.data.id }))
                    break
                case "subcategory":
                    result = await createCategoryAction({ partnerId, name: metadataModal.name, parentId: metadataModal.parentId })
                    if (result.success) setProductData((prev: any) => ({ ...prev, subcategory_id: result.data.id }))
                    break
                case "brand":
                    result = await createBrandAction({ partnerId, name: metadataModal.name })
                    if (result.success) setProductData((prev: any) => ({ ...prev, brand_id: result.data.id }))
                    break
                case "location":
                    result = await createLocationAction({ partnerId, name: metadataModal.name })
                    if (result.success) setProductData((prev: any) => ({ ...prev, location_id: result.data.id }))
                    break
            }

            if (result.success) {
                notifySuccess(`${metadataModal.type === "subcategory" ? "Subcategoria" : metadataModal.type === "category" ? "Categoria" : metadataModal.type === "brand" ? "Marca" : "Localização"} adicionada com sucesso!`)
                await fetchMetadata()
                setMetadataModal({ isOpen: false, type: null, name: "", isSaving: false })
            } else {
                notifyError(result.error || "Erro ao salvar")
            }
        } catch (err) {
            notifyError("Erro ao processar solicitação")
        } finally {
            setMetadataModal(prev => ({ ...prev, isSaving: false }))
        }
    }

    const handleNcmChange = useCallback((ncm: string) =>
        setProductData((prev: any) => ({ ...prev, ncm, is_monophasic: ncm.length === 8 && detectMonophasicByNcm(ncm) }))
        , [])

    const handleInputChange = useCallback((e: any) => {
        const { name, value } = e.target
        setProductData((prev: any) => {
            if (BOOLEAN_FIELDS.has(name)) return { ...prev, [name]: value === true || value === "true" }
            if (NUMERIC_FIELDS.has(name)) return { ...prev, [name]: value === "" || value === null ? prev[name] : Number(value) }
            if (name === "ncm") queueMicrotask(() => handleNcmChange(String(value)))

            // Special handling for category change to reset subcategory
            if (name === "category_id") return { ...prev, [name]: value, subcategory_id: "" }

            return { ...prev, [name]: value }
        })
    }, [handleNcmChange])

    const [showValidationModal, setShowValidationModal] = useState(false)
    const [validationErrors, setValidationErrors] = useState<Array<{ field: string; message: string; tab: string }>>([])
    const [fieldErrors, setFieldErrors] = useState<Set<string>>(new Set())

    const validateProductData = useCallback(() =>
        REQUIRED_FIELDS
            // @ts-ignore
            .filter((r) => !r.validate(productData[r.field], productData))
            .map((r) => ({ field: r.field, tab: r.tab, message: r.message })),
        [productData]
    )

    const handleFieldChange = useCallback((field: string) => {
        setFieldErrors((prev) => { const next = new Set(prev); next.delete(field); return next })
    }, [])

    const getTabErrorCount = useCallback((tab: string) => {
        const fieldTabs: Record<string, string> = {
            name: "general",
            price: "general",
            stock: "general",
            sku: "general",
            gtin: "general",
            costPrice: "general",
            category_id: "general",
            origin: "fiscal",
            cest: "fiscal",
            ncm: "fiscal",
        }
        return Array.from(fieldErrors).filter(field => fieldTabs[field] === tab).length
    }, [fieldErrors])

    const { scrollToFirstError } = useScrollToFirstError({
        fieldErrors,
        REQUIRED_FIELDS: REQUIRED_FIELDS.map(r => ({ field: r.field, tab: r.tab })),
        scrollContainerRef,
        activeTab,
        setActiveTab,
    })

    const [showNcmModal, setShowNcmModal] = useState(false)
    const [ncmSuggestions, setNcmSuggestions] = useState<any[]>([])
    const [isLoadingNcmSuggestion, setIsLoadingNcmSuggestion] = useState(false)

    const handleNcmSelect = useCallback((s: { ncm: string }) => { setShowNcmModal(false); handleNcmChange(s.ncm) }, [handleNcmChange])

    const handleSuggestNcm = useCallback(async () => {
        const productName = productData.name?.trim()
        if (!productName) return notifyWarning("Atenção", "Digite o nome do produto primeiro")
        if (lastNcmSearchRef.current === productName && ncmSuggestions.length > 0) { setShowNcmModal(true); return }
        setIsLoadingNcmSuggestion(true)
        try {
            const data = await fetchJSONWithCSRF<{ suggestions: any[]; error?: string }>("/api/ai/suggest-ncm", {
                method: "POST", body: { productName },
            })
            if (data.error) throw new Error(data.error)
            setNcmSuggestions(data.suggestions)
            lastNcmSearchRef.current = productName
            setShowNcmModal(true)
        } catch { notifyError("Erro", "Erro ao conectar com o servidor.") }
        finally { setIsLoadingNcmSuggestion(false) }
    }, [productData.name, notifyError, ncmSuggestions.length])

    const [isGeneratingDetails, setIsGeneratingDetails] = useState(false)

    const handleGenerateAiDetails = useCallback(async () => {
        const productName = productData.name?.trim()
        if (!productName) return notifyWarning("Atenção", "Digite o nome do produto primeiro")
        setIsGeneratingDetails(true)
        try {
            // Verificar se há imagem para enviar (primeira imagem File)
            let imageBase64: string | undefined
            let imageMimeType: string | undefined
            const firstImage = productData.images?.[0]
            if (firstImage instanceof File) {
                const reader = new FileReader()
                const base64Promise = new Promise<string>((resolve) => {
                    reader.onloadend = () => {
                        const result = reader.result as string
                        // Extrair apenas o base64 (remover prefixo data:image/...;base64,)
                        const base64 = result.split(",")[1] || ""
                        resolve(base64)
                    }
                    reader.readAsDataURL(firstImage)
                })
                imageBase64 = await base64Promise
                imageMimeType = firstImage.type || "image/jpeg"
            }

            const body: any = { title: productName, partnerId, itemType: "product" }
            if (imageBase64) {
                body.imageBase64 = imageBase64
                body.imageMimeType = imageMimeType
            }

            const data = await fetchJSONWithCSRF<{ data: any; error?: string }>("/api/ai/generate-product-details", {
                method: "POST",
                body,
            })
            if (data.error) {
                notifyError("Erro", data.error)
                return
            }

            const aiData = data.data
            setProductData((prev: any) => {
                let brandId = prev.brand_id
                let brandName = prev.brand
                if (aiData.brand && typeof aiData.brand === "string" && aiData.brand.trim()) {
                    const detected = aiData.brand.trim()
                    const matchedBrand = brandOptions.find(
                        (b: any) => b && (b.label || "").toLowerCase() === detected.toLowerCase()
                    )
                    if (matchedBrand) {
                        brandId = matchedBrand.value
                        brandName = matchedBrand.label
                    } else {
                        brandId = ""
                        brandName = detected
                    }
                }

                // Mapear especificações (specs) para attributes
                const newAttrs = Object.entries(aiData.specs || {}).map(([name, value], idx) => ({
                    id: Date.now() + idx,
                    name,
                    value: String(value)
                }))

                return {
                    ...prev,
                    name: aiData.name || prev.name,
                    description: aiData.description || prev.description,
                    brand: brandName,
                    brand_id: brandId,
                    tags: aiData.tags || prev.tags,
                    attributes: newAttrs,
                    marketplace_category_id: aiData.category?.id || prev.marketplace_category_id,
                }
            })

            notifySuccess("Sucesso", "Campos preenchidos com IA!")
        } catch (e: any) {
            const msg = e?.error || e?.message || "Falha ao conectar com o servidor."
            if (e?.code === "plan_blocked") {
                notifyError("Plano atual não inclui geração por IA", msg)
                openPlanUpgrade("crescer")
            } else {
                notifyError("Erro", msg)
            }
        } finally {
            setIsGeneratingDetails(false)
        }
    }, [productData.name, productData.images, partnerId, brandOptions, notifyError, notifySuccess, notifyWarning, openPlanUpgrade])

    const fileInputRef = useRef<HTMLInputElement>(null)
    const [showImageCropper, setShowImageCropper] = useState(false)
    const [selectedImageForCrop, setSelectedImageForCrop] = useState<File | null>(null)
    const [uploadingImages, setUploadingImages] = useState<Set<number>>(new Set())
    const [showDeleteImageModal, setShowDeleteImageModal] = useState(false)
    const [imageToDelete, setImageToDelete] = useState<number | null>(null)
    const [pendingImages, setPendingImages] = useState<Array<{ base64: string; file: File }>>([])
    const [blockedImages, setBlockedImages] = useState<Set<number>>(new Set())

    const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        e.currentTarget.value = ""
        if (file) { setSelectedImageForCrop(file); setShowImageCropper(true) }
    }, [])

    const handleImageCropComplete = useCallback(async (croppedImageDataUrl: string) => {
        const blob = await (await fetch(croppedImageDataUrl)).blob()
        const extension = blob.type === "image/png" ? "png" : "jpg"
        const file = new File([blob], `product-image.${extension}`, { type: blob.type })
        setProductData((prev: any) => ({ ...prev, images: [...(prev.images || []), file] }))
        if (fileInputRef.current) fileInputRef.current.value = ""
        setShowImageCropper(false)
        setSelectedImageForCrop(null)
    }, [])

    const handleRemoveImage = useCallback((indexToDelete: number) => {
        setProductData((prev: any) => ({ ...prev, images: prev.images?.filter((_: any, i: number) => i !== indexToDelete) || [] }))
        setBlockedImages((prev) => {
            const newBlocked = new Set<number>()
            let newIdx = 0
            for (let i = 0; i < (productData.images?.length || 0); i++) {
                if (i !== indexToDelete && prev.has(i)) newBlocked.add(newIdx)
                if (i !== indexToDelete) newIdx++
            }
            return newBlocked
        })
    }, [productData.images?.length])

    const handleSetPrimaryImage = useCallback((index: number) => {
        if (!productData.images?.length) return
        const images = [...productData.images]
        const [primary] = images.splice(index, 1)
        images.unshift(primary)
        setProductData((prev: any) => ({ ...prev, images, primary_image_index: 0 }))
    }, [productData.images])

    const [showDeleteModal, setShowDeleteModal] = useState(false)
    const [isSavingProduct, setIsSavingProduct] = useState(false)
    const isSubmittingRef = useRef(false)

    const handleDeleteProduct = useCallback(async () => {
        if (!initialProduct?.id && !productId) return
        try {
            const result = await deleteProductAction(initialProduct?.id || productId!)
            if (result.success) { notifySuccess("Sucesso", "Produto excluído"); setTimeout(() => onBack(), 300) }
            else notifyError("Erro", result.error)
        } catch { notifyError("Erro", "Ocorreu um erro") }
        finally { setShowDeleteModal(false) }
    }, [initialProduct, productId, onBack, notifyError, notifySuccess])

    const handleSaveProduct = useCallback(async () => {
        if (isSubmittingRef.current) return
        isSubmittingRef.current = true

        const errors = validateProductData()
        if (errors.length > 0) {
            setValidationErrors(errors); setFieldErrors(new Set(errors.map((e) => e.field))); setShowValidationModal(true); isSubmittingRef.current = false; return
        }
        if (blockedImages.size > 0) { notifyError("Remova as imagens bloqueadas antes de salvar"); isSubmittingRef.current = false; return }

        setIsSavingProduct(true)
        let cleanedFinalImages: string[] = []

        try {
            const currentImages = productData.images || []
            const finalImages: string[] = []
            const filesToUpload: { file: File; index: number }[] = []

            currentImages.forEach((img: string | File, idx: number) => {
                if (img instanceof File) filesToUpload.push({ file: img, index: idx })
                else finalImages[idx] = img
            })

            let signedUploads: { file: File; uploadUrl: string; key: string }[] = []

            let hasFlaggedUploads = false

            if (filesToUpload.length > 0) {
                setUploadingImages(new Set(filesToUpload.map((f) => f.index)))

                const signedResults = await Promise.all(
                    filesToUpload.map(async ({ file, index }) => {
                        const formData = new FormData()
                        const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg"
                        formData.append("file", file, `product-image.${extension}`)
                        const response = await fetchWithCSRF("/api/upload-image", { method: "POST", body: formData })
                        const result = await response.json()
                        return { result, file, index }
                    })
                )

                const newBlocked = new Set<number>()
                let hasErrors = false
                let errorMessage = "Falha na validação de algumas imagens. Tente novamente."
                hasFlaggedUploads = signedResults.some(({ result }) => result.moderation?.status === "FLAGGED")

                signedResults.forEach(({ result, file, index }) => {
                    if (result.success && result.key) {
                        finalImages[index] = result.key
                    } else {
                        hasErrors = true
                        if (result.error) errorMessage = result.error
                    }
                })

                if (hasErrors) {
                    if (newBlocked.size > 0) {
                        setBlockedImages(newBlocked)
                        notifyError(`${newBlocked.size} imagem(ns) foi(ram) bloqueada(s). Remova-as antes de salvar.`)
                    } else {
                        notifyError(errorMessage)
                    }
                    setUploadingImages(new Set())
                    setIsSavingProduct(false)
                    isSubmittingRef.current = false
                    return
                }

                setUploadingImages(new Set())
            }

            cleanedFinalImages = finalImages.filter(Boolean)

            const now = Date.now()
            let csrfToken = csrfTokenCache.current?.token
            if (!csrfToken || !csrfTokenCache.current || now - csrfTokenCache.current.timestamp > 5 * 60 * 1000) {
                const { token } = await (await fetchWithCSRF("/api/csrf-token", { method: "GET" })).json()
                csrfToken = token
                csrfTokenCache.current = { token, timestamp: now }
            }

            const d = productData
            const warranty = d.warranty_value > 0 ? `${d.warranty_value} ${d.warranty_period}` : undefined

            const hasVariants = (() => {
                const val = d.variants
                if (Array.isArray(val) && val.length > 0) {
                    if (typeof val[0]?.count === 'number') return val[0].count > 0
                    return true
                }
                const pv = d.pending_variants
                if (Array.isArray(pv) && pv.length > 0) return true
                return false
            })()

            const payload: any = {
                id: d.id || undefined,
                partnerId,
                storeId,
                csrf_token: csrfToken,
                name: d.name,
                description: d.description,
                sku: hasVariants ? null : (d.sku || null),
                requiresManualModeration: hasFlaggedUploads || productData.moderation_status === "pending_moderation",
                gtin: d.gtin,
                brand: d.brand || null,
                brand_id: d.brand_id || null,
                category_id: d.category_id || null,
                location_id: d.location_id || null,
                category: d.category,
                subcategory: d.subcategory,
                condition: d.condicao || d.condition || "Novo",
                unit: d.unidade,
                subcategory_id: d.subcategory_id || null,
                productType: d.productType,
                location: d.localizacao || d.location || null,
                deliveryFormat: d.digital_format,
                costPrice: (hasVariants || isDesapego) ? 0 : (Number(d.costPrice) || 0),
                price: hasVariants ? 0 : Number(d.price),
                promotionalPrice: (hasVariants || isDesapego) ? null : (d.promotional_price ? Number(d.promotional_price) : null),
                minStock: isDesapego ? 0 : (Number(d.minStock) || 0),
                maxStock: isDesapego ? 0 : (Number(d.maxStock) || 0),
                stockQuantity: isDesapego ? (Number(d.stock) > 0 ? Number(d.stock) : 1) : Number(d.stock),
                isActive: isDesapego ? true : d.is_active,
                isOnPromotion: (hasVariants || isDesapego) ? false : !!d.promotional_price,
                showPriceInStore: !!d.show_price_in_store,
                showInMarketplace: d.show_in_marketplace !== false,
                images: cleanedFinalImages,
                primaryImageIndex: 0,
                ncm: d.ncm?.trim() || "00000000",
                cest: d.cest,
                origin: d.origin,
                item_type: d.item_type,
                cfop_internal: d.cfop_internal,
                cfop_external: d.cfop_external,
                csosn: d.csosn,
                tax_percentage: Number(d.tax_percentage) || undefined,
                pis_cst: d.pis_cst,
                pis_rate: Number(d.pis_rate) || 0,
                cofins_cst: d.cofins_cst,
                cofins_rate: Number(d.cofins_rate) || 0,
                ipi_cst: d.ipi_cst,
                ipi_code: d.ipi_code,
                product_situation: d.product_situation,
                c_benef: d.c_benef,
                inf_ad_prod: d.inf_ad_prod,
                weight_gross: Number(d.weight_gross) || 0,
                weight_net: Number(d.weight_net) || 0,
                width: Number(d.width) || 0,
                height: Number(d.height) || 0,
                length: Number(d.length) || 0,
                fciCode: d.fci_code,
                packagingType: d.packaging_type,
                preparationDays: Number(d.preparation_days) || 0,
                allow_sell_without_stock: d.allow_sell_without_stock || false,
                videoType: d.video_type || null,
                videoUrl: d.video_url || null,
                videoThumbnail: d.video_thumbnail || null,
                videoDuration: d.video_duration || null,
                technicalSpecs: {
                    attributes: d.attributes || [],
                    addon_groups: d.addon_groups || [],
                    accepts_offers: !!d.accepts_offers,
                    accepts_trades: !!d.accepts_trades,
                },
                addon_groups: d.addon_groups || [],
                accepts_offers: !!d.accepts_offers,
                accepts_trades: !!d.accepts_trades,
                warranty,
                availability_value: Number(d.availability_value) || 0,
                availability_unit: d.availability_unit || "Dias",
                tags: d.tags || [],
                isDuplicate: internalMode === "duplicate",
            }

            // Optional official category (allowed in all modes)
            if (d.marketplace_category_id) payload.marketplace_category_id = d.marketplace_category_id

            if (onSave) {
                const saveRes = await onSave({
                    ...payload,
                    pending_variants: productData.pending_variants || [],
                    pending_suppliers: productData.pending_suppliers || [],
                })

                if (saveRes && saveRes.success === false) {
                    setIsSavingProduct(false)
                    isSubmittingRef.current = false
                    return
                }

                setPendingImages([])
                isSubmittingRef.current = false
                return
            }

            const dbPromise = internalMode === "edit" && (initialProduct?.id || productId)
                ? updateProductComprehensiveAction(initialProduct?.id || productId!, payload)
                : createProductComprehensiveAction({
                    ...payload,
                    pending_variants: productData.pending_variants || [],
                    pending_suppliers: productData.pending_suppliers || [],
                })

            const [result] = await Promise.all([dbPromise])

            if (result.success) {
                notifySuccess(internalMode === "edit" ? "Produto atualizado!" : "Produto criado!")
                setPendingImages([])
                onClose?.()
            } else {
                const errorMsg = result.error || "Erro ao salvar"
                if (isPlanLimitReachedError(errorMsg)) {
                    const target = getNextPlanTarget(planSlug)
                    if (target) openPlanUpgrade(target)
                    return
                }
                notifyError(errorMsg)
            }
        } catch (err) { console.error(err); notifyError("Erro ao salvar produto") }
        finally {
            setIsSavingProduct(false)
            isSubmittingRef.current = false
        }
    }, [validateProductData, productData, partnerId, storeId, internalMode, initialProduct, productId, notifySuccess, notifyError, onClose, onSave, blockedImages, isQuick])

    const handleGenerateRandomCode = useCallback(() => {
        const randomCode = generateSKUBase(productData.name)
        setProductData((prev: any) => ({ ...prev, sku: randomCode }))
    }, [productData.name])

    const handleGenerateBarcode = useCallback(() => {
        if (!productData.gtin) {
            if (productData.sku) {
                setProductData((prev: any) => ({ ...prev, gtin: prev.sku }))
                notifySuccess("Código de barras gerado a partir do SKU.")
            } else {
                const randomGtin = generateEAN13()
                setProductData((prev: any) => ({ ...prev, gtin: randomGtin }))
                notifySuccess("Código de barras EAN-13 interno gerado automaticamente.")
            }
        } else {
            const randomGtin = generateEAN13()
            setProductData((prev: any) => ({ ...prev, gtin: randomGtin }))
            notifySuccess("Novo código de barras EAN-13 gerado automaticamente.")
        }
    }, [productData.sku, productData.gtin, notifySuccess])


    const handleSavePendingVariants = useCallback((variantsToSave: any[]) => {
        setProductData((prev: any) => ({ ...prev, pending_variants: variantsToSave }))
    }, [])

    const handleSavePendingSuppliers = useCallback((suppliersToSave: any[]) => {
        setProductData((prev: any) => ({ ...prev, pending_suppliers: suppliersToSave }))
    }, [])

    const handleDuplicateProduct = useCallback(() => {
        setOriginalNameForDuplicate(productData.name)
        setProductData({ ...productData, id: crypto.randomUUID(), productId: "", sku: "", name: `${productData.name} (Cópia)`, images: [...(productData.images || [])] })
        setInternalMode("duplicate"); setMode("add")
        notifyInfo("Duplicando produto", "Edite e salve o novo produto.")
    }, [productData, setMode, notifyInfo])

    const [showShareModal, setShowShareModal] = useState(false)

    const handleShareProduct = useCallback(() => {
        setShowShareModal(true)
    }, [])

    const handleArchiveProduct = useCallback(async () => {
        if (!productData.id) return
        setIsSavingProduct(true)
        const res = await archiveProductAction(productData.id)
        setIsSavingProduct(false)
        if (res.error) {
            notifyError(res.error)
        } else {
            notifySuccess("Produto arquivado com sucesso.")
            onClose?.()
        }
    }, [productData.id, notifySuccess, notifyError, onClose])

    const handleUnarchiveProduct = useCallback(async () => {
        if (!productData.id) return
        setIsSavingProduct(true)
        const res = await unarchiveProductAction(productData.id)
        setIsSavingProduct(false)
        if (res.error) {
            if (isPlanLimitReachedError(res.error)) {
                const target = getNextPlanTarget(planSlug)
                if (target) openPlanUpgrade(target)
            } else {
                notifyError(res.error)
            }
        } else {
            notifySuccess("Produto desarquivado e reativado.")
            onClose?.()
        }
    }, [productData.id, planSlug, openPlanUpgrade, notifySuccess, notifyError, onClose])
    const dateCreated = productData.created_at
        ? new Date(productData.created_at).toLocaleDateString("pt-BR")
        : "N/A"

    const enterEditMode = useCallback(() => { setInternalMode("edit"); setMode("edit") }, [setMode])

    const pageTitle = internalMode === "add" ? "Adicionar novo produto"
        : internalMode === "duplicate" ? "Duplicar produto"
            : productData.name

    useEffect(() => {
        setHeaderOverride({
            title: pageTitle,
            onBack: handleCancelEdit,
            isSubPage: true
        })
        return () => setHeaderOverride(null)
    }, [pageTitle, handleCancelEdit, setHeaderOverride])

    return (
        <FadeIn>
            <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden">
                <Tabs value={activeTab} onValueChange={(v) => {
                    if (v === "variations" && variantsPlanBlocked) { openPlanUpgrade("crescer"); return }
                    if (v === "metrics" && metricsPlanBlocked) { openPlanUpgrade("escalar"); return }
                    if (v === "suppliers" && suppliersPlanBlocked) { openPlanUpgrade("crescer"); return }
                    setActiveTab(v)
                }}
                    className="flex flex-col h-full w-full">
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
                                            {/* Title hidden on mobile, shown on md+ */}
                                            <span className="hidden md:inline truncate">{pageTitle}</span>
                                            {internalMode === "edit" && (
                                                <Badge variant="orange" icon={<EditIcon />} className="text-sm font-normal h-fit whitespace-nowrap px-2 py-0.5 hidden md:inline-flex">
                                                    Editando
                                                </Badge>
                                            )}
                                            {productData.moderation_status === 'pending_moderation' && (
                                                <Tooltip text="Aguardando aprovação pela moderação para exibição na vitrine online.">
                                                    <Badge variant="orange" className="shrink-0 hidden md:inline-flex" />
                                                </Tooltip>
                                            )}
                                        </h1>

                                        <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-300 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                            {internalMode === "add" && "Preencha as informações do novo produto"}
                                            {internalMode === "duplicate" && <>Original: <span className="font-medium">{originalNameForDuplicate}</span></>}
                                            {(internalMode === "details" || internalMode === "edit") && <>SKU {productData.sku || "N/A"} • Criado em {dateCreated}</>}
                                        </div>
                                    </div>

                                    {/* Desktop action buttons */}
                                    <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                                        {isEditing ? (
                                            <>
                                                <Button variant="outline" onClick={handleCancelEdit} disabled={isSavingProduct || isLoadingDetails}>
                                                    Cancelar
                                                </Button>
                                                <Button onClick={handleSaveProduct} disabled={isSavingProduct || isLoadingDetails} leftIcon={<SaveIcon size={18} />}>
                                                    {isSavingProduct ? "Salvando..." : "Salvar"}
                                                </Button>
                                            </>
                                        ) : (
                                            <>
                                                {(() => {
                                                    const isArchived = productData.status === "arquivado" || productData.status === "archived"
                                                    return (
                                                        <ActionsDropdown
                                                            onDuplicate={handleDuplicateProduct}
                                                            onShare={handleShareProduct}
                                                            onArchive={!isArchived ? handleArchiveProduct : undefined}
                                                            onUnarchive={isArchived ? handleUnarchiveProduct : undefined}
                                                            onDelete={() => setShowDeleteModal(true)}
                                                        />
                                                    )
                                                })()}
                                                <Button onClick={enterEditMode} className="whitespace-nowrap" leftIcon={<EditIcon size={18} />} disabled={isLoadingDetails}>
                                                    Editar produto
                                                </Button>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Tabs */}
                                {!isDesapego && (
                                    <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                                        <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                            <TabsTrigger value="general">
                                                Dados gerais
                                                {getTabErrorCount("general") > 0 && <span className="ml-2 w-2 h-2 bg-brand-red rounded-full inline-block" />}
                                            </TabsTrigger>
                                            <TabsTrigger value="variations" disabled={isLoadingDetails}>
                                                <span className="inline-flex items-center gap-2">
                                                    Variações
                                                    {variantsPlanBlocked ? (
                                                        <img src={planStarIconForTarget("crescer")!} alt="" className="w-4 h-4 object-contain" />
                                                    ) : null}
                                                    {getTabErrorCount("variations") > 0 && <span className="ml-2 w-2 h-2 bg-brand-red rounded-full inline-block" />}
                                                </span>
                                            </TabsTrigger>
                                            {!isQuick && (
                                                <TabsTrigger value="suppliers" disabled={isLoadingDetails}>
                                                    <span className="inline-flex items-center gap-2">
                                                        Fornecedores
                                                        {suppliersPlanBlocked ? (
                                                            <img src={planStarIconForTarget("crescer")!} alt="" className="w-4 h-4 object-contain" />
                                                        ) : null}
                                                        {getTabErrorCount("suppliers") > 0 && <span className="ml-2 w-2 h-2 bg-brand-red rounded-full inline-block" />}
                                                    </span>
                                                </TabsTrigger>
                                            )}
                                            {productData.show_in_marketplace && (
                                                <TabsTrigger value="marketplace" disabled={isLoadingDetails}>
                                                    Vitrine online
                                                    {getTabErrorCount("marketplace") > 0 && <span className="ml-2 w-2 h-2 bg-brand-red rounded-full inline-block" />}
                                                </TabsTrigger>
                                            )}
                                            {productData.show_in_marketplace && internalMode === "details" && (
                                                <TabsTrigger value="metrics" disabled={isLoadingDetails}>
                                                    <span className="inline-flex items-center gap-2">
                                                        Métricas
                                                        {metricsPlanBlocked ? (
                                                            <img src={planStarIconForTarget("escalar")!} alt="" className="w-4 h-4 object-contain" />
                                                        ) : null}
                                                    </span>
                                                </TabsTrigger>
                                            )}
                                        </TabsList>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Tab Content */}
                        <div className="px-3 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
                            <AnimatePresence mode="wait">
                                {activeTab === "general" && (
                                    <FadeIn key="general" className="block">
                                        <ProductGeneralTab
                                            productData={productData} handleInputChange={handleInputChange}
                                            categories={categoryOptions} subCategories={subCategoryOptions} brands={brandOptions} locations={locationOptions}
                                            unidadesMedida={unidadesMedida} isEditing={isEditing && !isSavingProduct}
                                            images={productData.images || []} onImageUpload={handleImageUpload}
                                            onRemoveImage={handleRemoveImage} onSetPrimaryImage={handleSetPrimaryImage}
                                            fieldErrors={fieldErrors} onFieldChange={handleFieldChange}
                                            uploadingImages={uploadingImages} mode={internalMode === "duplicate" ? "add" : internalMode}
                                            blockedImages={blockedImages} isSaving={isSavingProduct}
                                            isQuickMode={isQuick}
                                            isDesapego={isDesapego}
                                            generateRandomCode={handleGenerateRandomCode}
                                            onGenerateBarcode={handleGenerateBarcode}
                                            openAddItemModal={handleOpenMetadataModal}
                                            metadataPlanBlocked={metadataPlanBlocked}
                                            isGeneratingDetails={isGeneratingDetails}
                                            onGenerateDetails={handleGenerateAiDetails}
                                        />
                                    </FadeIn>
                                )}
                                {activeTab === "variations" && (
                                    <FadeIn key="variations" className="block">
                                        {isLoadingDetails ? (
                                            <div className="flex flex-col items-center justify-center pt-24 pb-32">
                                                <Spinner size={36} className="text-brand-primary" />
                                                <p className="mt-4 text-[15px] text-brand-dark dark:text-dark-heading font-medium">Carregando variações...</p>
                                            </div>
                                        ) : (
                                            <ProductVariationsTab isEditing={isEditing} productData={productData} onSavePendingVariants={handleSavePendingVariants} />
                                        )}
                                    </FadeIn>
                                )}
                                {activeTab === "suppliers" && (
                                    <FadeIn key="suppliers" className="block">
                                        {isLoadingDetails ? (
                                            <div className="flex flex-col items-center justify-center pt-24 pb-32">
                                                <Spinner size={36} className="text-brand-primary" />
                                                <p className="mt-4 text-[15px] text-brand-dark dark:text-dark-heading font-medium">Carregando fornecedores...</p>
                                            </div>
                                        ) : (
                                            <ProductSuppliersTab isEditing={isEditing} productData={productData} partnerId={partnerId} onSavePendingSuppliers={handleSavePendingSuppliers} />
                                        )}
                                    </FadeIn>
                                )}
                                {activeTab === "marketplace" && productData.show_in_marketplace && (
                                    <FadeIn key="marketplace" className="block">
                                        {isLoadingDetails ? (
                                            <div className="flex flex-col items-center justify-center pt-24 pb-32">
                                                <Spinner size={36} className="text-brand-primary" />
                                                <p className="mt-4 text-[15px] text-brand-dark dark:text-dark-heading font-medium">Carregando marketplace...</p>
                                            </div>
                                        ) : (
                                            <ProductMarketplaceTab
                                                productData={productData} handleInputChange={handleInputChange}
                                                isEditing={isEditing && !isSavingProduct}
                                                itemId={productData.id}
                                                video={{
                                                    video_type: productData.video_type || null,
                                                    video_url: productData.video_url || null,
                                                    video_thumbnail: productData.video_thumbnail || null,
                                                    video_duration: productData.video_duration || null,
                                                    video_provider_id: productData.video_provider_id || null,
                                                }}
                                                onVideoChange={(video) => setProductData((prev: any) => ({ ...prev, ...video }))}
                                                videoPlanBlocked={videoPlanBlocked}
                                            />
                                        )}
                                    </FadeIn>
                                )}
                                {activeTab === "metrics" && productData.show_in_marketplace && internalMode === "details" && (
                                    <FadeIn key="metrics" className="block">
                                        {metricsPlanBlocked ? (
                                            <div className="flex flex-col items-center justify-center pt-24 pb-32">
                                                <p className="text-[15px] text-brand-inactive-text dark:text-dark-body font-medium">
                                                    Faça upgrade para o plano <strong>Escalar</strong> para acessar métricas detalhadas.
                                                </p>
                                                <button
                                                    onClick={() => openPlanUpgrade("escalar")}
                                                    className="mt-4 px-6 py-2 bg-brand-primary text-white rounded-xl font-medium text-sm hover:opacity-90 transition-opacity"
                                                >
                                                    Ver planos
                                                </button>
                                            </div>
                                        ) : (
                                            <ProductMetricsTab productData={productData} />
                                        )}
                                    </FadeIn>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>

                    {/* Mobile Bottom Action Bar */}
                    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 flex gap-3">
                        {isEditing ? (
                            <>
                                <Button
                                    variant="outline"
                                    onClick={handleCancelEdit}
                                    disabled={isSavingProduct || isLoadingDetails}
                                    className="flex-1 h-12"
                                >
                                    Cancelar
                                </Button>
                                <Button
                                    onClick={handleSaveProduct}
                                    disabled={isSavingProduct || isLoadingDetails}
                                    className="flex-1 h-12"
                                    leftIcon={<SaveIcon size={18} />}
                                >
                                    {isSavingProduct ? "Salvando..." : "Salvar"}
                                </Button>
                            </>
                        ) : (
                            <>
                                <ActionsDropdown
                                    onDuplicate={handleDuplicateProduct}
                                    onShare={handleShareProduct}
                                    onDelete={() => setShowDeleteModal(true)}
                                    trigger={
                                        <Button
                                            variant="outline"
                                            className="flex-1 h-12"
                                            disabled={isLoadingDetails}
                                            leftIcon={<ThreeDotsIcon size={18} />}
                                        >
                                            Opções
                                        </Button>
                                    }
                                />
                                <Button
                                    onClick={enterEditMode}
                                    className="flex-1 h-12"
                                    disabled={isLoadingDetails}
                                    leftIcon={<EditIcon size={18} />}
                                >
                                    Editar produto
                                </Button>
                            </>
                        )}
                    </div>
                </Tabs>

                {/* Modals */}
                {unsavedChangesDialogOpen && (
                    <AlertModal
                        isOpen={unsavedChangesDialogOpen}
                        onClose={handleUnsavedChangesDialogClose}
                        onConfirm={handleUnsavedChangesConfirm}
                        title="Sair sem salvar?"
                        description="Você tem alterações no produto que ainda não foram salvas."
                        confirmText="Sair sem salvar"
                        cancelText="Continuar editando"
                        variant="warning"
                    />
                )}
                {showDeleteModal && (
                    <AlertModal
                        isOpen
                        onClose={() => setShowDeleteModal(false)}
                        onConfirm={handleDeleteProduct}
                        title="Excluir produto?"
                        description="Esta ação é irreversível. O produto será removido permanentemente."
                        confirmText="Excluir"
                    />
                )}
                {showValidationModal && (
                    <AlertModal
                        isOpen
                        onClose={() => {
                            setShowValidationModal(false)
                            scrollToFirstError()
                        }}
                        title="Campos obrigatórios"
                        description="Existem campos pendentes. Verifique os erros abaixo antes de salvar."
                        message={<ul className="list-disc list-inside">{validationErrors.map((e, i) => <li key={i}>{e.message}</li>)}</ul>}
                        variant="warning"
                    />
                )}
                {showAlertModal && (
                    <AlertModal
                        isOpen
                        onClose={() => setShowAlertModal(false)}
                        onConfirm={confirmNavigation}
                        title="Sair sem salvar?"
                        description="Você tem alterações no produto que ainda não foram salvas."
                        confirmText="Sair sem salvar"
                        cancelText="Continuar editando"
                        variant="warning"
                    />
                )}
                {showImageCropper && selectedImageForCrop && (
                    <ImageCropperModal
                        isOpen
                        imageFile={selectedImageForCrop}
                        onClose={() => setShowImageCropper(false)}
                        onCropComplete={handleImageCropComplete}
                    />
                )}
                <NcmSelectionModal
                    isOpen={showNcmModal}
                    onClose={() => setShowNcmModal(false)}
                    suggestions={ncmSuggestions}
                    onSelect={handleNcmSelect}
                    isLoading={isLoadingNcmSuggestion}
                />
                <DefaultModal
                    isOpen={metadataModal.isOpen}
                    onClose={() => setMetadataModal(prev => ({ ...prev, isOpen: false }))}
                    title={`Adicionar ${metadataModal.type === "subcategory" ? "Subcategoria" : metadataModal.type === "category" ? "Categoria" : metadataModal.type === "brand" ? "Marca" : "Localização"}`}
                    maxWidth="md"
                >
                    <div className="space-y-6 pt-4 pb-2">
                        {metadataModal.type === "subcategory" && (
                            <div className="space-y-1.5">
                                <Combobox
                                    label="Categoria Pai"
                                    options={categoryOptions}
                                    value={metadataModal.parentId || ""}
                                    onChange={(v: string) => setMetadataModal(prev => ({ ...prev, parentId: v }))}
                                    width="w-full"
                                />
                            </div>
                        )}

                        <div className="space-y-1.5">
                            <Input
                                label="Nome"
                                placeholder="Digite o nome..."
                                value={metadataModal.name}
                                onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setMetadataModal(prev => ({ ...prev, name: e.target.value }))}
                                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => e.key === 'Enter' && handleSaveMetadata()}
                                autoFocus
                                maxLength={150}
                            />
                        </div>

                        <div className="flex justify-end gap-3 pt-4 border-t border-brand-border dark:border-dark-border">
                            <Button variant="outline" onClick={() => setMetadataModal(prev => ({ ...prev, isOpen: false }))}>
                                Cancelar
                            </Button>
                            <Button onClick={handleSaveMetadata} disabled={metadataModal.isSaving || !metadataModal.name.trim()}>
                                {metadataModal.isSaving ? "Salvando..." : "Salvar"}
                            </Button>
                        </div>
                    </div>
                </DefaultModal>

                {showShareModal && (
                    <ShareModal
                        isOpen={showShareModal}
                        onClose={() => setShowShareModal(false)}
                        url={typeof window !== 'undefined' ? `${window.location.origin}${getProductUrl(productData, partner)}` : ""}
                        title={productData.name}
                        shareMessage={`🔥 Olha esse achado na Dudit!\n\n*${productData.name}*\nConfere aqui os detalhes:`}
                        label="Link do produto"
                    />
                )}

                <SavingStatusModal
                    isOpen={isSavingProduct}
                    text={internalMode === "add" ? "Criando produto..." : "Salvando alterações..."}
                />
            </div>
        </FadeIn>
    )
}

export default AddProductPage
