"use client"

import React, { useState, useEffect, useCallback, useRef, useMemo, type FC } from "react"
import { AnimatePresence } from "framer-motion"
import { Tabs, TabsList, TabsTrigger, Button, Badge, ActionsDropdown } from "@/components/reusable"
import { ChevronLeftIcon, EditIcon, SaveIcon } from "@/lib/icons"
import { useToast } from "@/components/ui/use-toast"
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes"
import { useStore } from "@/lib/store-context"
import { useSidebar } from "@/lib/sidebar-context"
import { createServiceAction, updateServiceAction, deleteServiceAction } from "@/app/actions/erp/servicos"
import { createServiceCategoryAction, getServiceMetadataAction } from "@/app/actions/erp/service-metadata"
import { generateSKUBase } from "@/lib/utils/code-generators"
import { useNotification } from "@/hooks/use-notification"
import { usePermissions } from "@/lib/permission-context"
import { fetchWithCSRF } from "@/lib/utils/fetch-with-csrf"
import { FadeIn } from "@/components/animations/FadeIn"

import AlertModal from "@/components/reusable/AlertModal"
import SavingStatusModal from "@/components/reusable/SavingStatusModal"
import ImageCropperModal from "@/components/ImageCropperModal"
import { ServiceGeneralTab } from "./ServiceGeneralTab"
import { ServiceResourcesTab } from "./ServiceResourcesTab"
import { ServiceStaffTab } from "./ServiceStaffTab"
import { ServiceMarketplaceTab } from "./ServiceMarketplaceTab"

const NUMERIC_FIELDS = new Set(["price", "cost_price", "duration_minutes", "buffer_minutes"])
const BOOLEAN_FIELDS = new Set(["is_active", "show_in_marketplace", "highlight_service"])

const REQUIRED_FIELDS = [
    { field: "name", tab: "general", validate: (v: any) => !!v?.trim(), message: "Nome é obrigatório" },
    { field: "price", tab: "general", validate: (v: any, data: any) => data.price_type === 'free' || Number(v) > 0, message: "Preço é obrigatório" },
    { field: "duration_minutes", tab: "general", validate: (v: any) => Number(v) > 0, message: "Duração é obrigatória" },
]

const getEmptyService = () => ({
    id: "", name: "", category: "", category_id: "", sku: "", description: "", subcategory: "", subcategory_id: "",
    price: null as unknown as number, cost_price: null as unknown as number, price_type: "fixed", billing_unit: "per_service",
    duration_minutes: null as unknown as number, buffer_minutes: null as unknown as number, service_type: "in_person",
    images: [], primary_image_index: 0, video_url: "",
    is_active: true, show_in_marketplace: false, highlight_service: false,
    warranty: "", technical_details: null,
    tags: [], resources: [], assigned_staff: { all: true, staff_ids: [] },
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
    onSave?: (data: any, isDraft?: boolean) => Promise<void>
}

export const AddServicePage: FC<AddServicePageProps> = ({
    onBack, service: initialService, mode: initialModeProp, setMode,
    isSaving = false, serviceId, initialData, onClose,
    partnerId: propPartnerId, storeId: propStoreId, isLoadingDetails = false,
    onSave,
}) => {
    const [internalMode, setInternalMode] = useState(initialModeProp)
    useEffect(() => { setInternalMode(initialModeProp) }, [initialModeProp])

    const isEditing = useMemo(() => ["add", "edit", "duplicate"].includes(internalMode), [internalMode])

    const { toast } = useToast()
    const { success: notifySuccess, error: notifyError } = useNotification()
    const { selectedStore } = useStore()
    const { setHeaderOverride } = useSidebar()
    const { businessInfo } = usePermissions()

    const partnerId = propPartnerId || selectedStore?.partner_id || ""
    const storeId = propStoreId || selectedStore?.id || ""

    const [isScrolled, setIsScrolled] = useState(false)
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
    }, [])

    const initialServiceState = useMemo(() => {
        const base = getEmptyService()
        const mapped = initialService || initialData
        if (!mapped) return base
        if (internalMode === "duplicate") {
            return { ...base, ...mapped, id: "", sku: "", name: `${mapped.name} (Cópia)`, images: mapped.images || [] }
        }
        const realImages = (mapped.images || []).filter((img: string | File) => typeof img === "string" && !img.startsWith("data:"))
        return { ...base, ...mapped, images: realImages.length > 0 ? realImages : base.images }
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
        const res = await getServiceMetadataAction(partnerId)
        if (res.success && res.data) {
            setCategories(res.data.categories)
        }
    }, [partnerId])

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

    const fileInputRef = useRef<HTMLInputElement>(null)
    const [showImageCropper, setShowImageCropper] = useState(false)
    const [selectedImageForCrop, setSelectedImageForCrop] = useState<File | null>(null)
    const [blockedImages, setBlockedImages] = useState<Set<number>>(new Set())

    const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) { setSelectedImageForCrop(e.target.files[0]); setShowImageCropper(true) }
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
    const [isSavingService, setIsSavingService] = useState(false)
    const isSubmittingRef = useRef(false)

    const handleDeleteService = useCallback(async () => {
        if (!initialService?.id && !serviceId) return
        try {
            const result = await deleteServiceAction(initialService?.id || serviceId!)
            if (result.success) { toast({ title: "Sucesso", description: "Serviço excluído" }); setTimeout(() => onBack(), 300) }
            else toast({ title: "Erro", description: result.error, variant: "destructive" })
        } catch { toast({ title: "Erro", variant: "destructive" }) }
        finally { setShowDeleteModal(false) }
    }, [initialService, serviceId, onBack, toast])

    const handleSaveService = useCallback(async () => {
        if (isSubmittingRef.current) return
        isSubmittingRef.current = true

        const errors = validateServiceData()
        if (errors.length > 0) {
            setFieldErrors(new Set(errors.map((e) => e.field))); isSubmittingRef.current = false; notifyError("Preencha os campos obrigatórios"); return
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

            let needsManualModeration = false

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

                signedResults.forEach(({ result, index }) => {
                    if (result.success && result.key) {
                        finalImages[index] = result.key
                        if (result.blocked || (result.moderation?.status && result.moderation.status !== "APPROVED")) {
                            needsManualModeration = true
                        }
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
                partnerId, storeId, csrf_token: csrfToken,
                name: serviceData.name, description: serviceData.description,
                sku: serviceData.sku, category_id: serviceData.category_id,
                subcategory_id: serviceData.subcategory_id,
                price: Number(serviceData.price),
                cost_price: Number(serviceData.cost_price) || 0,
                price_type: serviceData.price_type,
                billing_unit: serviceData.billing_unit,
                duration_minutes: Number(serviceData.duration_minutes) || 60,
                buffer_minutes: Number(serviceData.buffer_minutes) || 0,
                service_type: serviceData.service_type,
                show_in_marketplace: !!serviceData.show_in_marketplace,
                highlight_service: !!serviceData.highlight_service,
                tags: serviceData.tags || [],
                notes: serviceData.notes,
                video_url: serviceData.video_url,
                warranty: serviceData.warranty,
                technical_details: serviceData.technical_details,
                resources: serviceData.resources || [],
                assigned_staff: serviceData.assigned_staff || { all: true, staff_ids: [] },
                is_active: serviceData.is_active,
                images: cleanedFinalImages,
            }

            const dbPromise = internalMode === "edit" && (initialService?.id || serviceId)
                ? updateServiceAction({ ...payload, id: initialService?.id || serviceId! })
                : createServiceAction(payload)

            const result = await dbPromise

            if (result.success) {
                notifySuccess(internalMode === "edit" ? "Serviço atualizado!" : "Serviço criado!")
                onClose?.()
                if (!onClose) onBack()
            } else {
                notifyError(result.error || "Erro ao salvar")
            }
        } catch (err) { console.error(err); notifyError("Erro ao salvar serviço") }
        finally {
            setIsSavingService(false)
            isSubmittingRef.current = false
        }
    }, [validateServiceData, serviceData, partnerId, storeId, internalMode, initialService, serviceId, notifySuccess, notifyError, onClose, onBack, blockedImages])

    const handleGenerateRandomCode = useCallback(() => {
        const randomCode = generateSKUBase(serviceData.name)
        setServiceData((prev: any) => ({ ...prev, sku: randomCode }))
    }, [serviceData.name])

    const handleDuplicateService = useCallback(() => {
        setOriginalNameForDuplicate(serviceData.name)
        setServiceData({ ...serviceData, id: "", sku: "", name: `${serviceData.name} (Cópia)`, images: [...(serviceData.images || [])] })
        setInternalMode("duplicate"); setMode("add")
        toast({ title: "Duplicando serviço", description: "Edite e salve o novo serviço." })
    }, [serviceData, setMode, toast])

    const dateCreated = serviceData.created_at ? new Date(serviceData.created_at).toLocaleDateString("pt-BR") : "N/A"
    const enterEditMode = useCallback(() => { setInternalMode("edit"); setMode("edit") }, [setMode])

    const pageTitle = internalMode === "add" ? "Adicionar Novo Serviço"
        : internalMode === "duplicate" ? "Duplicar Serviço"
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
                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full w-full">
                    <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-20 md:pb-0">

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
                                                <Button onClick={handleSaveService} disabled={isSavingService || isLoadingDetails}>
                                                    <SaveIcon className="w-5 h-5 mr-2" />
                                                    {isSavingService ? "Salvando..." : "Salvar"}
                                                </Button>
                                            </>
                                        ) : (
                                            <>
                                                <ActionsDropdown
                                                    onDuplicate={handleDuplicateService}
                                                    onDelete={() => setShowDeleteModal(true)}
                                                />
                                                <Button onClick={enterEditMode} className="whitespace-nowrap" disabled={isLoadingDetails}>
                                                    <EditIcon className="w-[18px] h-[18px] mr-2" />
                                                    Editar serviço
                                                </Button>
                                            </>
                                        )}
                                    </div>
                                </div>

                                <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                                    <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                        <TabsTrigger value="general">
                                            Dados gerais
                                            {getTabErrorCount("general") > 0 && <span className="ml-2 w-2 h-2 bg-red-500 rounded-full inline-block" />}
                                        </TabsTrigger>
                                        <TabsTrigger value="resources" disabled={isLoadingDetails}>
                                            Itens e Recursos
                                        </TabsTrigger>
                                        <TabsTrigger value="staff" disabled={isLoadingDetails}>
                                            Profissionais
                                        </TabsTrigger>
                                        <TabsTrigger value="marketplace" disabled={isLoadingDetails}>
                                            Marketplace
                                        </TabsTrigger>
                                    </TabsList>
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
                                            generateRandomCode={handleGenerateRandomCode}
                                            openAddItemModal={handleOpenMetadataModal}
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
                                        />
                                    </FadeIn>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </Tabs>
            </div>

            <AlertModal
                isOpen={showAlertModal}
                onClose={() => setShowAlertModal(false)}
                onConfirm={confirmNavigationAction}
                title="Descartar alterações?"
                description="Você tem dados não salvos neste formulário. Tem certeza que deseja cancelar?"
                confirmText="Sair sem salvar"
                variant="warning"
            />

            {showConfirmDialog && (
                <AlertModal
                    isOpen={showConfirmDialog}
                    onClose={cancelNavigation}
                    onConfirm={confirmNavigation}
                    title="Descartar alterações?"
                    description="Você tem alterações não salvas. Se sair agora, perderá todo o progresso."
                    confirmText="Sair sem salvar"
                    variant="warning"
                />
            )}

            <SavingStatusModal isOpen={isSavingService} text="Salvando serviço..." />

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
        </FadeIn>
    )
}
