"use client"

import React, { useState, useEffect, useCallback, useRef, useMemo, type FC } from "react"
import { AnimatePresence } from "framer-motion"
import { Tabs, TabsList, TabsTrigger, Button, Badge, ActionsDropdown, DefaultModal, Input } from "@/components/reusable"
import { ChevronLeftIcon, ThreeDotsIcon, EditIcon, SaveIcon } from "@/lib/icons"
import { useToast } from "@/components/ui/use-toast"
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes"
import { useStore } from "@/lib/store-context"
import { useSidebar } from "@/lib/sidebar-context"
import { createServiceAction, updateServiceAction, deleteServiceAction, archiveServiceAction, unarchiveServiceAction } from "@/app/actions/erp/servicos"
import { createServiceCategoryAction, getServiceMetadataAction } from "@/app/actions/erp/service-metadata"
import { generateSKUBase } from "@/lib/utils/code-generators"
import { useNotification } from "@/hooks/use-notification"
import { useScrollToFirstError } from "@/hooks/use-scroll-to-first-error"
import { usePermissions } from "@/lib/permission-context"
import { hasMinimumPlan } from "@/lib/subscription/plan-tier"
import { planStarIconForTarget, usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal"
import { fetchWithCSRF, fetchJSONWithCSRF } from "@/lib/utils/fetch-with-csrf"
import { FadeIn } from "@/components/animations/FadeIn"
import { ShareModal } from "@/components/marketplace/ShareModal"
import { getServiceUrl } from "@/lib/utils/url-generator"
import { getPartnerProfile } from "@/app/actions/marketplace/partners"
import AlertModal from "@/components/reusable/AlertModal"
import SavingStatusModal from "@/components/reusable/SavingStatusModal"
import ImageCropperModal from "@/components/ImageCropperModal"
import { ServiceGeneralTab } from "./ServiceGeneralTab"
import { ServiceResourcesTab } from "./ServiceResourcesTab"
import { ServiceStaffTab } from "./ServiceStaffTab"
import { ServiceMarketplaceTab } from "./ServiceMarketplaceTab"
import { ServiceMetricsTab } from "./ServiceMetricsTab"

import { normalizeBusinessInfo, isQuickMode } from "@/lib/business-info"

const NUMERIC_FIELDS = new Set(["price", "cost_price", "duration_minutes", "buffer_minutes", "recurrence_interval_value"])
const BOOLEAN_FIELDS = new Set(["is_active", "show_in_marketplace", "show_price_in_store"])

const REQUIRED_FIELDS = [
    { field: "name", tab: "general", validate: (v: any) => !!v?.trim(), message: "Nome é obrigatório" },
    { field: "price", tab: "general", validate: (v: any, data: any) => data.show_price_in_store === false || data.price_type === 'free' || Number(v) > 0, message: "Preço é obrigatório" },
    { field: "duration_minutes", tab: "general", validate: (v: any, data: any) => (data.billing_unit && data.billing_unit !== 'per_service') || (Number(v) > 0 && Number(v) <= 525600), message: "Duração deve ser entre 1 minuto e 1 ano (525.600 min)" },
]

const getEmptyService = () => ({
    id: "", name: "", category: "", category_id: "", sku: "", description: "", subcategory: "", subcategory_id: "",
    price: null as unknown as number, promotional_price: null as unknown as number, cost_price: null as unknown as number, price_type: "fixed", billing_unit: "per_service",
    duration_minutes: null as unknown as number, buffer_minutes: null as unknown as number, service_type: "in_person",
    images: [], primary_image_index: 0, video_type: null, video_url: "", video_thumbnail: null, video_duration: null, video_provider_id: null,
    is_active: true, show_in_marketplace: true, show_price_in_store: true,
    fulfillment_modes: ["on_site"],
    warranty: "", technical_details: null,
    tags: [], resources: [], assigned_staff: { all: true, staff_ids: [] },
    recurrence_interval_value: null as unknown as number, recurrence_interval_unit: "Meses",
    notes: ""
})

interface AddServicePageProps {
    onBack: () => void
    service?: any | null
    mode: "add" | "details" | "edit" | "duplicate"
    setMode: (mode: "add" | "details" | "edit" | "duplicate") => void
    isSaving?: boolean
    serviceId?: string
    initialData?: any | null
    onClose?: () => void
    partnerId?: string
    storeId?: string
    isLoadingDetails?: boolean
    onSave?: (data: any, isDraft?: boolean) => Promise<{ success?: boolean; error?: string } | void>
    /** Painel admin: leitura das categorias via action admin (service role). */
    metadataLoader?: (partnerId: string) => Promise<{ success?: boolean; data?: { categories: any[] }; error?: string }>
    /** Painel admin: exclusão via action admin (com audit log). */
    onDeleteConfirm?: () => Promise<{ success?: boolean; error?: string } | void>
    /** Painel admin: arquivar/desarquivar via action admin. */
    onArchiveToggle?: (isCurrentlyArchived: boolean) => Promise<{ success?: boolean; error?: string } | void>
    /** Painel admin: abas extras na TabsList do header (ex.: Comprador e Loja, Histórico & Auditoria). */
    extraTabs?: Array<{ value: string; label: React.ReactNode; content: React.ReactNode }>
    /** Painel admin: itens extras (ações de admin) no ActionsDropdown (desktop e mobile). */
    extraDropdownItems?: React.ReactNode
    partner?: any
}

export const AddServicePage: FC<AddServicePageProps> = ({
    onBack, service: initialService, mode: initialModeProp, setMode,
    isSaving = false, serviceId, initialData, onClose,
    partnerId: propPartnerId, storeId: propStoreId, isLoadingDetails = false,
    onSave,
    metadataLoader,
    onDeleteConfirm,
    onArchiveToggle,
    extraTabs,
    extraDropdownItems,
    partner,
}) => {
    const [internalMode, setInternalMode] = useState(initialModeProp)
    useEffect(() => { setInternalMode(initialModeProp) }, [initialModeProp])

    const isEditing = useMemo(() => ["add", "edit", "duplicate"].includes(internalMode), [internalMode])

    const { toast } = useToast()
    const { success: notifySuccess, error: notifyError } = useNotification()
    const { selectedStore } = useStore()
    const { setHeaderOverride } = useSidebar()
    const { businessInfo: contextBusinessInfo, planSlug } = usePermissions()
    const { openPlanUpgrade } = usePlanUpgrade()
    const metadataPlanBlocked = !hasMinimumPlan(planSlug, "crescer")
    const metricsPlanBlocked = !hasMinimumPlan(planSlug, "escalar")
    const videoPlanBlocked = !hasMinimumPlan(planSlug, "crescer")
    const businessInfo = useMemo(() => normalizeBusinessInfo(contextBusinessInfo), [contextBusinessInfo])
    const isQuick = isQuickMode(businessInfo)
    const isDesapego = businessInfo.mode === "desapego"

    const partnerId = propPartnerId || selectedStore?.partner_id || ""
    const storeId = propStoreId || selectedStore?.id || ""

    const [isScrolled, setIsScrolled] = useState(false)
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
    }, [])

    const initialServiceState = useMemo(() => {
        const base = { ...getEmptyService(), id: crypto.randomUUID() }
        const mapped = initialService || initialData
        if (!mapped) return base
        if (internalMode === "duplicate") {
            return { ...base, ...mapped, id: crypto.randomUUID(), sku: "", name: `${mapped.name} (Cópia)`, images: mapped.images || [] }
        }
        const realImages = (mapped.images || []).filter((img: string | File) => typeof img === "string" && !img.startsWith("data:"))
        return { ...base, ...mapped, id: mapped.id || base.id, images: realImages.length > 0 ? realImages : base.images }
    }, [initialService, initialData, internalMode])

    const [serviceData, setServiceData] = useState<any>(initialServiceState)
    const [originalServiceData, setOriginalServiceData] = useState(initialServiceState)
    const [originalNameForDuplicate, setOriginalNameForDuplicate] = useState("")
    const csrfTokenCache = useRef<{ token: string; timestamp: number } | null>(null)

    const isDirty = useMemo(() => {
        return JSON.stringify(serviceData) !== JSON.stringify(originalServiceData)
    }, [serviceData, originalServiceData])

    const { showConfirmDialog, confirmNavigation, cancelNavigation } = useUnsavedChanges(isEditing && isDirty)
    const [showAlertModal, setShowAlertModal] = useState(false)
    const [nextAction, setNextAction] = useState<(() => void) | null>(null)

    const handleAttemptNav = useCallback((action: () => void) => {
        if (isEditing && isDirty) { setNextAction(() => action); setShowAlertModal(true) }
        else action()
    }, [isEditing, isDirty])

    const handleBack = useCallback(() => handleAttemptNav(onBack), [handleAttemptNav, onBack])
    const handleCancelEdit = useCallback(() => {
        handleAttemptNav(() => {
            setServiceData(initialServiceState)
            setOriginalServiceData(initialServiceState)
            onBack()
        })
    }, [handleAttemptNav, initialServiceState, onBack])

    const confirmNavigationAction = useCallback(() => {
        nextAction?.()
        setShowAlertModal(false)
    }, [nextAction])

    const [activeTab, setActiveTab] = useState("general")

    const [categories, setCategories] = useState<any[]>([])

    const loadCategories = useCallback(async () => {
        if (!partnerId) return
        const res = metadataLoader
            ? await metadataLoader(partnerId)
            : await getServiceMetadataAction(partnerId)
        if (res.success && res.data) {
            setCategories(res.data.categories)
        }
    }, [partnerId, metadataLoader])

    useEffect(() => {
        loadCategories()
    }, [loadCategories])

    const categoryOptions = useMemo(() =>
        categories.filter(c => !c.parent_id).map(c => ({ value: c.id, label: c.name })),
        [categories])

    const subCategoryOptions = useMemo(() => {
        if (!serviceData.category_id) return []
        return categories
            .filter(c => c.parent_id === serviceData.category_id)
            .map(c => ({ value: c.id, label: c.name }))
    }, [categories, serviceData.category_id])

    const [metadataModal, setMetadataModal] = useState<{
        isOpen: boolean,
        type: "category" | "subcategory" | null,
        name: string,
        parentId?: string | null,
        isSaving: boolean
    }>({ isOpen: false, type: null, name: "", parentId: null, isSaving: false })

    const handleOpenMetadataModal = (type: "category" | "subcategory") => {
        setMetadataModal({
            isOpen: true,
            type,
            name: "",
            parentId: type === "subcategory" ? serviceData.category_id : null,
            isSaving: false
        })
    }

    const handleSaveMetadata = async () => {
        if (!metadataModal.name.trim() || !partnerId) return
        setMetadataModal(prev => ({ ...prev, isSaving: true }))
        try {
            let result: any
            if (metadataModal.type === "category") {
                result = await createServiceCategoryAction({ partnerId, name: metadataModal.name })
                if (result.success) setServiceData((prev: any) => ({ ...prev, category_id: result.data.id }))
            } else if (metadataModal.type === "subcategory") {
                result = await createServiceCategoryAction({ partnerId, name: metadataModal.name, parentId: metadataModal.parentId })
                if (result.success) setServiceData((prev: any) => ({ ...prev, subcategory_id: result.data.id }))
            }

            if (result.success) {
                notifySuccess(`${metadataModal.type === "subcategory" ? "Subcategoria" : "Categoria"} adicionada com sucesso!`)
                await loadCategories()
                setMetadataModal({ isOpen: false, type: null, name: "", parentId: null, isSaving: false })
            } else {
                notifyError(result.error || "Erro ao salvar")
            }
        } catch (err) {
            notifyError("Erro ao processar solicitação")
        } finally {
            setMetadataModal(prev => ({ ...prev, isSaving: false }))
        }
    }

    const handleInputChange = useCallback((e: any) => {
        const { name, value } = e.target
        setServiceData((prev: any) => {
            if (BOOLEAN_FIELDS.has(name)) return { ...prev, [name]: value === true || value === "true" }
            if (NUMERIC_FIELDS.has(name)) return { ...prev, [name]: value === "" || value === null ? prev[name] : Number(value) }
            if (name === "category_id") return { ...prev, [name]: value, subcategory_id: "" }
            return { ...prev, [name]: value }
        })
    }, [])

    const [isGeneratingDetails, setIsGeneratingDetails] = useState(false)

    const handleGenerateAiDetails = useCallback(async () => {
        const serviceName = serviceData.name?.trim() || "Serviço"
        setIsGeneratingDetails(true)
        try {
            // Coletar até 3 imagens File para análise (limite do Groq)
            const fileImages = (serviceData.images || []).filter((img: string | File): img is File => img instanceof File).slice(0, 3)

            const images: Array<{ base64: string; mimeType: string }> = []
            for (const file of fileImages) {
                const reader = new FileReader()
                const base64Promise = new Promise<string>((resolve) => {
                    reader.onloadend = () => {
                        const result = reader.result as string
                        const base64 = result.split(",")[1] || ""
                        resolve(base64)
                    }
                    reader.readAsDataURL(file)
                })
                const base64 = await base64Promise
                if (base64) {
                    images.push({ base64, mimeType: file.type || "image/jpeg" })
                }
            }

            const body: any = { title: serviceName, partnerId, itemType: "service" }
            if (images.length > 0) {
                body.images = images
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
            setServiceData((prev: any) => {
                // Mapear especificações (specs) para technical_details
                const newSpecs = Object.entries(aiData.specs || {}).map(([name, value], idx) => ({
                    id: Date.now() + idx,
                    name,
                    value: String(value)
                }))

                return {
                    ...prev,
                    description: aiData.description || prev.description,
                    tags: aiData.tags || prev.tags,
                    technical_details: newSpecs,
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
    }, [serviceData.name, partnerId, notifyError, notifySuccess, openPlanUpgrade])

    const [fieldErrors, setFieldErrors] = useState<Set<string>>(new Set())

    const validateServiceData = useCallback(() =>
        REQUIRED_FIELDS
            .filter((r) => !r.validate(serviceData[r.field], serviceData))
            .map((r) => ({ field: r.field, tab: r.tab, message: r.message })),
        [serviceData]
    )

    const handleFieldChange = useCallback((field: string) => {
        setFieldErrors((prev) => { const next = new Set(prev); next.delete(field); return next })
    }, [])

    const getTabErrorCount = useCallback((tab: string) => {
        const fieldTabs: Record<string, string> = {
            name: "general", price: "general", duration_minutes: "general"
        }
        return Array.from(fieldErrors).filter(field => fieldTabs[field] === tab).length
    }, [fieldErrors])

    const { scrollToFirstError } = useScrollToFirstError({
        fieldErrors,
        REQUIRED_FIELDS,
        scrollContainerRef,
        activeTab,
        setActiveTab,
    })

    const fileInputRef = useRef<HTMLInputElement>(null)
    const [showImageCropper, setShowImageCropper] = useState(false)
    const [selectedImageForCrop, setSelectedImageForCrop] = useState<File | null>(null)
    const [blockedImages, setBlockedImages] = useState<Set<number>>(new Set())

    const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        e.currentTarget.value = ""
        if (file) { setSelectedImageForCrop(file); setShowImageCropper(true) }
    }, [])

    const handleImageCropComplete = useCallback(async (croppedImageDataUrl: string) => {
        const blob = await (await fetch(croppedImageDataUrl)).blob()
        const extension = blob.type === "image/png" ? "png" : "jpg"
        const file = new File([blob], `service-image.${extension}`, { type: blob.type })
        setServiceData((prev: any) => ({ ...prev, images: [...(prev.images || []), file] }))
        if (fileInputRef.current) fileInputRef.current.value = ""
        setShowImageCropper(false)
        setSelectedImageForCrop(null)
    }, [])

    const handleRemoveImage = useCallback((indexToDelete: number) => {
        setServiceData((prev: any) => ({ ...prev, images: prev.images?.filter((_: any, i: number) => i !== indexToDelete) || [] }))
        setBlockedImages((prev) => {
            const newBlocked = new Set<number>()
            let newIdx = 0
            for (let i = 0; i < (serviceData.images?.length || 0); i++) {
                if (i !== indexToDelete && prev.has(i)) newBlocked.add(newIdx)
                if (i !== indexToDelete) newIdx++
            }
            return newBlocked
        })
    }, [serviceData.images?.length])

    const handleSetPrimaryImage = useCallback((index: number) => {
        if (!serviceData.images?.length) return
        const images = [...serviceData.images]
        const [primary] = images.splice(index, 1)
        images.unshift(primary)
        setServiceData((prev: any) => ({ ...prev, images, primary_image_index: 0 }))
    }, [serviceData.images])

    const [showDeleteModal, setShowDeleteModal] = useState(false)
    const [showArchiveModal, setShowArchiveModal] = useState(false)
    const [isSavingService, setIsSavingService] = useState(false)
    const [isArchivingService, setIsArchivingService] = useState(false)
    const isSubmittingRef = useRef(false)

    const handleDeleteService = useCallback(async () => {
        if (!initialService?.id && !serviceId) return
        try {
            if (onDeleteConfirm) {
                const res = await onDeleteConfirm()
                if (res && res.success === false) {
                    if ((res as { cancelled?: boolean }).cancelled) return
                    toast({ title: "Erro", description: res.error, variant: "destructive" })
                }
                else { toast({ title: "Sucesso", description: "Serviço excluído" }); setTimeout(() => onBack(), 300) }
            } else {
                const result = await deleteServiceAction(initialService?.id || serviceId!)
                if (result.success) { toast({ title: "Sucesso", description: "Serviço excluído" }); setTimeout(() => onBack(), 300) }
                else toast({ title: "Erro", description: result.error, variant: "destructive" })
            }
        } catch { toast({ title: "Erro", variant: "destructive" }) }
        finally { setShowDeleteModal(false) }
    }, [initialService, serviceId, onBack, toast, onDeleteConfirm])

    const handleSaveService = useCallback(async () => {
        if (isSubmittingRef.current) return
        isSubmittingRef.current = true

        const errors = validateServiceData()
        if (errors.length > 0) {
            setFieldErrors(new Set(errors.map((e) => e.field))); scrollToFirstError(); isSubmittingRef.current = false; notifyError("Preencha os campos obrigatórios"); return
        }
        if (blockedImages.size > 0) { notifyError("Remova as imagens bloqueadas antes de salvar"); isSubmittingRef.current = false; return }

        setIsSavingService(true)
        let cleanedFinalImages: string[] = []

        try {
            const currentImages = serviceData.images || []
            const finalImages: string[] = []
            const filesToUpload: { file: File; index: number }[] = []

            currentImages.forEach((img: string | File, idx: number) => {
                if (img instanceof File) filesToUpload.push({ file: img, index: idx })
                else finalImages[idx] = img
            })

            let hasFlaggedUploads = false

            if (filesToUpload.length > 0) {
                const signedResults = await Promise.all(
                    filesToUpload.map(async ({ file, index }) => {
                        const formData = new FormData()
                        const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg"
                        formData.append("file", file, `service-image.${extension}`)
                        const response = await fetchWithCSRF("/api/upload-image", { method: "POST", body: formData })
                        const result = await response.json()
                        return { result, file, index }
                    })
                )

                let hasErrors = false
                let errorMessage = "Falha na validação de algumas imagens."
                hasFlaggedUploads = signedResults.some(({ result }) => result.moderation?.status === "FLAGGED")

                signedResults.forEach(({ result, index }) => {
                    if (result.success && result.key) {
                        finalImages[index] = result.key
                    } else {
                        hasErrors = true
                        if (result.error) errorMessage = result.error
                    }
                })

                if (hasErrors) {
                    notifyError(errorMessage)
                    setIsSavingService(false)
                    isSubmittingRef.current = false
                    return
                }
            }

            cleanedFinalImages = finalImages.filter(Boolean)

            const now = Date.now()
            let csrfToken = csrfTokenCache.current?.token
            if (!csrfToken || !csrfTokenCache.current || now - csrfTokenCache.current.timestamp > 5 * 60 * 1000) {
                const { token } = await (await fetchWithCSRF("/api/csrf-token", { method: "GET" })).json()
                csrfToken = token
                csrfTokenCache.current = { token, timestamp: now }
            }

            const payload: any = {
                id: serviceData.id || undefined,
                partnerId, storeId, csrf_token: csrfToken,
                name: serviceData.name, description: serviceData.description,
                requiresManualModeration: hasFlaggedUploads || (serviceData as any).moderation_status === "pending_moderation",
                sku: serviceData.sku, category_id: serviceData.category_id,
                subcategory_id: serviceData.subcategory_id,
                price: Number(serviceData.price),
                cost_price: Number(serviceData.cost_price) || 0,
                promotional_price: serviceData.promotional_price ? Number(serviceData.promotional_price) : null,
                price_type: serviceData.price_type,
                billing_unit: serviceData.billing_unit,
                duration_minutes: Number(serviceData.duration_minutes) || 60,
                buffer_minutes: Number(serviceData.buffer_minutes) || 0,
                service_type: serviceData.service_type,
                show_in_marketplace: !!serviceData.show_in_marketplace,
                show_price_in_store: serviceData.show_price_in_store !== false,
                fulfillment_modes: serviceData.fulfillment_modes || ["on_site"],
                recurrence_interval_value: serviceData.recurrence_interval_value ? Number(serviceData.recurrence_interval_value) : null,
                recurrence_interval_unit: serviceData.recurrence_interval_unit || "Meses",
                payment_requirement: serviceData.payment_requirement || "full_payment",
                tags: serviceData.tags || [],
                notes: serviceData.notes,
                video_type: serviceData.video_type || null,
                video_url: serviceData.video_url || null,
                video_thumbnail: serviceData.video_thumbnail || null,
                video_duration: serviceData.video_duration || null,
                video_provider_id: serviceData.video_provider_id || null,
                warranty: serviceData.warranty,
                technical_details: serviceData.technical_details,
                resources: serviceData.resources || [],
                assigned_staff: serviceData.assigned_staff || { all: true, staff_ids: [] },
                is_active: serviceData.is_active,
                images: cleanedFinalImages,
                isDuplicate: internalMode === "duplicate",
            }

            const result = onSave
                ? await onSave(payload)
                : internalMode === "edit" && (initialService?.id || serviceId)
                    ? await updateServiceAction({ ...payload, id: initialService?.id || serviceId! })
                    : await createServiceAction(payload)

            if (result && (result as any).success === false) {
                if ((result as { cancelled?: boolean }).cancelled) return
                notifyError((result as any).error || "Erro ao salvar")
            } else {
                notifySuccess(internalMode === "edit" ? "Serviço atualizado!" : "Serviço criado!")
                onClose?.()
                if (!onClose) onBack()
            }
        } catch (err) { console.error(err); notifyError("Erro ao salvar serviço") }
        finally {
            setIsSavingService(false)
            isSubmittingRef.current = false
        }
    }, [validateServiceData, serviceData, partnerId, storeId, internalMode, initialService, serviceId, notifySuccess, notifyError, onClose, onBack, blockedImages, onSave])

    const handleGenerateRandomCode = useCallback(() => {
        const randomCode = generateSKUBase(serviceData.name)
        setServiceData((prev: any) => ({ ...prev, sku: randomCode }))
    }, [serviceData.name])

    const [showShareModal, setShowShareModal] = useState(false)
    const [sharePartner, setSharePartner] = useState<any>(partner || null)
    const [isLoadingSharePartner, setIsLoadingSharePartner] = useState(false)

    const handleShareService = useCallback(() => {
        setShowShareModal(true)
        if (sharePartner || isLoadingSharePartner || !partnerId) return
        setIsLoadingSharePartner(true)
        getPartnerProfile(partnerId)
            .then((value) => { if (value) setSharePartner(value) })
            .catch(() => {})
            .finally(() => setIsLoadingSharePartner(false))
    }, [partnerId, sharePartner, isLoadingSharePartner])

    const handleDuplicateService = useCallback(() => {
        setOriginalNameForDuplicate(serviceData.name)
        setServiceData({ ...serviceData, id: crypto.randomUUID(), sku: "", name: `${serviceData.name} (Cópia)`, images: [...(serviceData.images || [])] })
        setInternalMode("duplicate"); setMode("add")
        toast({ title: "Duplicando serviço", description: "Edite e salve o novo serviço." })
    }, [serviceData, setMode, toast])

    const confirmArchiveService = useCallback(async () => {
        if (!serviceData.id) return
        const isCurrentlyArchived = serviceData.status === "arquivado" || serviceData.status === "archived"
        setIsArchivingService(true)
        try {
            if (onArchiveToggle) {
                const res = await onArchiveToggle(isCurrentlyArchived)
                if (res && res.success === false) {
                    if ((res as { cancelled?: boolean }).cancelled) return
                    toast({ title: isCurrentlyArchived ? "Erro ao desarquivar" : "Erro ao arquivar", description: res.error, variant: "destructive" })
                } else {
                    toast({ title: isCurrentlyArchived ? "Serviço desarquivado e reativado." : "Serviço arquivado com sucesso." })
                    onClose?.()
                }
            } else {
                const res = isCurrentlyArchived
                    ? await unarchiveServiceAction(serviceData.id)
                    : await archiveServiceAction(serviceData.id)
                if (!res.success) {
                    toast({ title: isCurrentlyArchived ? "Erro ao desarquivar" : "Erro ao arquivar", description: (res as any).error, variant: "destructive" })
                } else {
                    toast({ title: isCurrentlyArchived ? "Serviço desarquivado e reativado." : "Serviço arquivado com sucesso." })
                    onClose?.()
                }
            }
        } catch (e: any) {
            toast({ title: "Erro", description: e.message || "Erro ao arquivar", variant: "destructive" })
        } finally {
            setIsArchivingService(false)
            setShowArchiveModal(false)
        }
    }, [serviceData.id, serviceData.status, toast, onClose, onArchiveToggle])

    const handleArchiveService = useCallback(() => {
        if (onArchiveToggle) {
            void confirmArchiveService()
        } else {
            setShowArchiveModal(true)
        }
    }, [onArchiveToggle, confirmArchiveService])
    const handleUnarchiveService = handleArchiveService

    const dateCreated = serviceData.created_at ? new Date(serviceData.created_at).toLocaleDateString("pt-BR") : "N/A"
    const enterEditMode = useCallback(() => { setInternalMode("edit"); setMode("edit") }, [setMode])

    const pageTitle = internalMode === "add" ? "Adicionar novo serviço"
        : internalMode === "duplicate" ? "Duplicar serviço"
            : serviceData.name

    useEffect(() => {
        setHeaderOverride({
            title: pageTitle, onBack: handleCancelEdit, isSubPage: true
        })
        return () => setHeaderOverride(null)
    }, [pageTitle, handleCancelEdit, setHeaderOverride])

    return (
        <FadeIn>
            <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden">
                <Tabs value={activeTab} onValueChange={(v) => {
                    if (v === "metrics" && metricsPlanBlocked) { openPlanUpgrade("escalar"); return }
                    setActiveTab(v)
                }} className="flex flex-col h-full w-full">
                    <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-20 md:pb-0">

                        <div className="sticky top-0 z-30 w-full max-w-[1300px] mx-auto bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out">
                            <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">
                                <div className={`absolute -left-12 top-7 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                                    <Button variant="filled" onClick={handleBack} className="w-10 h-10 p-0 flex items-center justify-center">
                                        <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                    </Button>
                                </div>

                                <div className="hidden md:flex items-start justify-between md:py-0 md:mb-0">
                                    <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                        <h1 className={`font-bold transition-all duration-500 ease-in-out flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                            <span className="hidden md:inline truncate">{pageTitle}</span>
                                            {internalMode === "edit" && (
                                                <Badge variant="orange" icon={<EditIcon />} className="text-sm font-normal h-fit whitespace-nowrap px-2 py-0.5 hidden md:inline-flex">
                                                    Editando
                                                </Badge>
                                            )}
                                        </h1>
                                        <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                            {internalMode === "add" && "Preencha as informações do novo serviço"}
                                            {internalMode === "duplicate" && <>Original: <span className="font-medium">{originalNameForDuplicate}</span></>}
                                            {(internalMode === "details" || internalMode === "edit") && <>SKU {serviceData.sku || "N/A"} • Criado em {dateCreated}</>}
                                        </div>
                                    </div>

                                    <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                                        {isEditing ? (
                                            <>
                                                <Button variant="outline" onClick={handleCancelEdit} disabled={isSavingService || isLoadingDetails}>
                                                    Cancelar
                                                </Button>
                                                <Button onClick={handleSaveService} disabled={isSavingService || isLoadingDetails} leftIcon={<SaveIcon size={18} />}>
                                                    {isSavingService ? "Salvando..." : "Salvar"}
                                                </Button>
                                            </>
                                        ) : (
                                            <>
                                                {(() => {
                                                    const isArchived = serviceData.status === "arquivado" || serviceData.status === "archived"
                                                    return (
                                                        <ActionsDropdown
                                                            onDuplicate={handleDuplicateService}
                                                            onShare={handleShareService}
                                                            onArchive={!isArchived ? handleArchiveService : undefined}
                                                            onUnarchive={isArchived ? handleUnarchiveService : undefined}
                                                            onDelete={onDeleteConfirm ? () => void handleDeleteService() : () => setShowDeleteModal(true)}
                                                        >
                                                            {extraDropdownItems}
                                                        </ActionsDropdown>
                                                    )
                                                })()}
                                                <Button onClick={enterEditMode} className="whitespace-nowrap" disabled={isLoadingDetails} leftIcon={<EditIcon size={18} />}>
                                                    Editar serviço
                                                </Button>
                                            </>
                                        )}
                                    </div>
                                </div>

                                <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                                {!isDesapego && (
                                    <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                        <TabsTrigger value="general">
                                            Dados gerais
                                            {getTabErrorCount("general") > 0 && <span className="ml-2 w-2 h-2 bg-brand-red rounded-full inline-block" />}
                                        </TabsTrigger>
                                        {!isQuick && (
                                            <TabsTrigger value="resources" disabled={isLoadingDetails}>
                                                Itens e Recursos
                                            </TabsTrigger>
                                        )}
                                        {!isQuick && (
                                            <TabsTrigger value="staff" disabled={isLoadingDetails}>
                                                Profissionais
                                            </TabsTrigger>
                                        )}
                                        <TabsTrigger value="marketplace" disabled={isLoadingDetails}>
                                            Vitrine online
                                        </TabsTrigger>
                                        {serviceData.show_in_marketplace && internalMode === "details" && (
                                            <TabsTrigger value="metrics" disabled={isLoadingDetails}>
                                                <span className="inline-flex items-center gap-2">
                                                    Métricas
                                                    {metricsPlanBlocked ? (
                                                        <img src={planStarIconForTarget("escalar")!} alt="" className="w-4 h-4 object-contain" />
                                                    ) : null}
                                                </span>
                                            </TabsTrigger>
                                        )}
                                        {extraTabs?.map((tab) => (
                                            <TabsTrigger key={tab.value} value={tab.value} disabled={isLoadingDetails}>
                                                {tab.label}
                                            </TabsTrigger>
                                        ))}
                                    </TabsList>
                                )}
                                </div>
                            </div>
                        </div>

                        <div className="px-3 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
                            <AnimatePresence mode="wait">
                                {activeTab === "general" && (
                                    <FadeIn key="general" className="block">
                                        <ServiceGeneralTab
                                            serviceData={serviceData} handleInputChange={handleInputChange}
                                            categories={categoryOptions} subCategories={subCategoryOptions}
                                            isEditing={isEditing && !isSavingService}
                                            images={serviceData.images || []} onImageUpload={handleImageUpload}
                                            onRemoveImage={handleRemoveImage} onSetPrimaryImage={handleSetPrimaryImage}
                                            fieldErrors={fieldErrors} onFieldChange={handleFieldChange}
                                            mode={internalMode === "duplicate" ? "add" : internalMode}
                                            blockedImages={blockedImages}
                                            isQuickMode={isQuick}
                                            isDesapego={isDesapego}
                                            generateRandomCode={handleGenerateRandomCode}
                                            openAddItemModal={handleOpenMetadataModal}
                                            metadataPlanBlocked={metadataPlanBlocked}
                                            isGeneratingDetails={isGeneratingDetails}
                                            onGenerateDetails={handleGenerateAiDetails}
                                        />
                                    </FadeIn>
                                )}
                                {activeTab === "resources" && (
                                    <FadeIn key="resources" className="block">
                                        <ServiceResourcesTab
                                            serviceData={serviceData} handleInputChange={handleInputChange}
                                            isEditing={isEditing && !isSavingService}
                                        />
                                    </FadeIn>
                                )}
                                {activeTab === "staff" && (
                                    <FadeIn key="staff" className="block">
                                        <ServiceStaffTab
                                            serviceData={serviceData} handleInputChange={handleInputChange}
                                            isEditing={isEditing && !isSavingService} partnerId={partnerId}
                                        />
                                    </FadeIn>
                                )}
                                {activeTab === "marketplace" && (
                                    <FadeIn key="marketplace" className="block">
                                        <ServiceMarketplaceTab
                                            serviceData={serviceData} handleInputChange={handleInputChange}
                                            isEditing={isEditing && !isSavingService}
                                            itemId={serviceData.id}
                                            video={{
                                                video_type: serviceData.video_type || null,
                                                video_url: serviceData.video_url || null,
                                                video_thumbnail: serviceData.video_thumbnail || null,
                                                video_duration: serviceData.video_duration || null,
                                                video_provider_id: serviceData.video_provider_id || null,
                                            }}
                                            onVideoChange={(video) => setServiceData((prev: any) => ({ ...prev, ...video }))}
                                            videoPlanBlocked={videoPlanBlocked}
                                        />
                                    </FadeIn>
                                )}
                                {activeTab === "metrics" && serviceData.show_in_marketplace && internalMode === "details" && (
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
                                            <ServiceMetricsTab serviceData={serviceData} />
                                        )}
                                    </FadeIn>
                                )}
                                {extraTabs?.map((tab) =>
                                    activeTab === tab.value ? (
                                        <FadeIn key={tab.value} className="block">
                                            {tab.content}
                                        </FadeIn>
                                    ) : null
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
                                    disabled={isSavingService || isLoadingDetails}
                                    className="flex-1"
                                >
                                    Cancelar
                                </Button>
                                <Button
                                    onClick={handleSaveService}
                                    disabled={isSavingService || isLoadingDetails}
                                    className="flex-1"
                                    leftIcon={<SaveIcon size={18} />}
                                >
                                    {isSavingService ? "Salvando..." : "Salvar"}
                                </Button>
                            </>
                        ) : (
                            <>
                                <ActionsDropdown
                                    onDuplicate={handleDuplicateService}
                                    onShare={handleShareService}
                                    onDelete={onDeleteConfirm ? () => void handleDeleteService() : () => setShowDeleteModal(true)}
                                    trigger={
                                        <Button
                                            variant="outline"
                                            className="flex-1"
                                            disabled={isLoadingDetails}
                                            leftIcon={<ThreeDotsIcon size={18} />}
                                        >
                                            Opções
                                        </Button>
                                    }
                                >
                                    {extraDropdownItems}
                                </ActionsDropdown>
                                <Button
                                    onClick={enterEditMode}
                                    className="flex-1 whitespace-nowrap"
                                    disabled={isLoadingDetails}
                                    leftIcon={<EditIcon size={18} />}
                                >
                                    Editar serviço
                                </Button>
                            </>
                        )}
                    </div>
                </Tabs>
            </div>

            <AlertModal
                isOpen={showAlertModal}
                onClose={() => setShowAlertModal(false)}
                onConfirm={confirmNavigationAction}
                title="Sair sem salvar?"
                description="Você tem alterações no serviço que ainda não foram salvas."
                confirmText="Sair sem salvar"
                cancelText="Continuar editando"
                variant="warning"
            />

            {showConfirmDialog && (
                <AlertModal
                    isOpen={showConfirmDialog}
                    onClose={cancelNavigation}
                    onConfirm={confirmNavigation}
                    title="Sair sem salvar?"
                    description="Você tem alterações no serviço que ainda não foram salvas."
                    confirmText="Sair sem salvar"
                    cancelText="Continuar editando"
                    variant="warning"
                />
            )}

            {showShareModal && (
                <ShareModal
                    isOpen={showShareModal}
                    onClose={() => setShowShareModal(false)}
                    url={sharePartner && typeof window !== 'undefined' ? `${window.location.origin}${getServiceUrl(serviceData, sharePartner)}` : ""}
                    title={serviceData.name}
                    shareMessage={`🔥 Olha esse achado na Dudit!\n\n*${serviceData.name}*\nConfere aqui os detalhes:`}
                    label="Link do serviço"
                    isLoading={isLoadingSharePartner || !sharePartner}
                />
            )}

            <AlertModal
                isOpen={showArchiveModal}
                onClose={() => setShowArchiveModal(false)}
                onConfirm={confirmArchiveService}
                title="Arquivar serviço?"
                description={`Tem certeza que deseja arquivar "${serviceData.name}"? O serviço será movido para a lista de arquivados.`}
                confirmText={isArchivingService ? "Arquivando..." : "Arquivar"}
                variant="warning"
            />

            <SavingStatusModal isOpen={isSavingService || isArchivingService} text={isArchivingService ? "Arquivando serviço..." : "Salvando serviço..."} />

            <AlertModal
                isOpen={showDeleteModal}
                onClose={() => setShowDeleteModal(false)}
                onConfirm={handleDeleteService}
                title="Excluir Serviço"
                description={`Tem certeza que deseja excluir "${serviceData.name}"? Esta ação não pode ser desfeita.`}
                confirmText="Excluir"
                cancelText="Cancelar"
            />

            {showImageCropper && selectedImageForCrop && (
                <ImageCropperModal
                    isOpen={showImageCropper}
                    onClose={() => setShowImageCropper(false)}
                    imageFile={selectedImageForCrop}
                    onCropComplete={handleImageCropComplete}
                />
            )}

            <DefaultModal
                isOpen={metadataModal.isOpen}
                onClose={() => setMetadataModal({ isOpen: false, type: null, name: "", parentId: null, isSaving: false })}
                title={metadataModal.type === "category" ? "Nova categoria" : "Nova subcategoria"}
                maxWidth="sm"
            >
                <div className="space-y-5">
                    <Input
                        label="Nome"
                        value={metadataModal.name}
                        onChange={(e) => setMetadataModal(prev => ({ ...prev, name: e.target.value }))}
                        placeholder={metadataModal.type === "category" ? "Ex: Beleza, Saúde..." : "Ex: Corte de cabelo, Manutenção..."}
                        disabled={metadataModal.isSaving}
                        className="w-full"
                        maxLength={150}
                    />
                    <div className="flex gap-3 justify-end">
                        <Button
                            variant="outline"
                            onClick={() => setMetadataModal({ isOpen: false, type: null, name: "", parentId: null, isSaving: false })}
                            disabled={metadataModal.isSaving}
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleSaveMetadata}
                            disabled={!metadataModal.name.trim() || metadataModal.isSaving}
                        >
                            {metadataModal.isSaving ? "Salvando..." : "Salvar"}
                        </Button>
                    </div>
                </div>
            </DefaultModal>
        </FadeIn>
    )
}
