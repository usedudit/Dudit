"use client"

import React, { useState, useEffect, useCallback, useRef, useMemo, type FC } from "react"
import {
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
    Button,
    Badge,
    Input,
    Checkbox,
    FormTextarea,
    FormDropdown,
    SavingStatusModal,
    AlertModal,
    UnsavedChangesDialog,
    IconPlaceholder,
    SelectionBanner,
    DatePicker,
    FormSection,
} from "@/components/reusable"
import FloatingActionBar from "@/components/reusable/FloatingActionBar"
import { ChevronLeftIcon, SaveIcon, TrashIcon, PlusIcon, ArrowUpDownIcon, BoxIcon, ClockIcon, SearchIcon } from "@/lib/icons"
import { useNotification } from "@/hooks/use-notification"
import { useScrollToFirstError } from "@/hooks/use-scroll-to-first-error"
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes"
import { FadeIn } from "@/components/animations/FadeIn"
import { formatQuantityWithUnit } from "@/lib/utils/formatters"
import { AnimatePresence, motion } from "framer-motion"
import {
    createRecurringPlanAction,
    updateRecurringPlanAction,
    getRecurringPlanFormDataAction
} from "@/app/actions/erp/recurring-plans"
import type { RecurringPlan, RecurringPlanItem, RecurringFrequencyType } from "@/lib/types/recurring"
import { useSidebar } from "@/lib/sidebar-context"
import PlanItemFormSheet from "./PlanItemFormSheet"
import { formatCurrency } from "@/lib/utils/formatters"
import ProductImagesSection from "@/components/erp/product/ProductImagesSection"
import ImageCropperModal from "@/components/ImageCropperModal"

interface NewRecurringPlanPageProps {
    onBack: () => void
    partnerId: string
    plan?: any | null
    onSuccess?: (msg: string) => void
    onError?: (msg: string) => void
}

type FormData = {
    products: Array<{ id: string; name: string; price: number }>
    services: Array<{ id: string; name: string; price: number; duration_minutes?: number }>
    staff: Array<{ id: string; display_name: string }>
}

const REQUIRED_FIELDS = [
    { field: "name", tab: "general" },
    { field: "frequencyInterval", tab: "general" },
    { field: "startDate", tab: "general" },
]

const SidebarCard = ({ title, children, className = "", hasTopStrip = false }: { title?: React.ReactNode; children: React.ReactNode; className?: string; hasTopStrip?: boolean }) => (
    <>
        {/* Desktop: card */}
        <div className={`hidden lg:block bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden mb-6 transition-colors ${className}`}>
            {hasTopStrip && <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border rounded-t-2xl"></div>}
            {title ? <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6 mt-2">{title}</h3> : null}
            {children}
        </div>
        {/* Mobile/Tablet: FormSection */}
        <FormSection title={title} hasSeparator className="lg:hidden">
            {children}
        </FormSection>
    </>
)

export const NewRecurringPlanPage: FC<NewRecurringPlanPageProps> = ({
    onBack,
    partnerId,
    plan,
    onSuccess,
    onError
}) => {
    const { success: notifySuccess, error: notifyError } = useNotification()
    const { setHeaderOverride } = useSidebar()
    const [activeTab, setActiveTab] = useState("general")
    const [isScrolled, setIsScrolled] = useState(false)
    const scrollContainerRef = useRef<HTMLDivElement>(null)

    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
    }, [])

    // Form Fields State
    const [name, setName] = useState("")
    const [description, setDescription] = useState("")
    const [status, setStatus] = useState<"active" | "inactive" | "archived">("active")
    const [frequencyType, setFrequencyType] = useState<RecurringFrequencyType>("monthly")
    const [frequencyInterval, setFrequencyInterval] = useState(1)
    const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10))
    const [endDate, setEndDate] = useState("")
    const [showInMarketplace, setShowInMarketplace] = useState(true)
    const [items, setItems] = useState<any[]>([])

    // Novas configuracoes de cobranca e validade dos creditos
    const [billingMode, setBillingMode] = useState<"manual" | "auto_mercado_pago">("manual")
    const [creditExpirationPolicy, setCreditExpirationPolicy] = useState<"never" | "end_of_cycle" | "fixed_days">("end_of_cycle")
    const [creditExpirationDays, setCreditExpirationDays] = useState<number | null>(null)

    // Plan images state (similar to AddProductPage.tsx)
    const [images, setImages] = useState<(string | File)[]>([])
    const [uploadingImages, setUploadingImages] = useState<Set<number>>(new Set())
    const [blockedImages, setBlockedImages] = useState<Set<number>>(new Set())
    const [showImageCropper, setShowImageCropper] = useState(false)
    const [selectedImageForCrop, setSelectedImageForCrop] = useState<File | null>(null)

    // Search, Selection, Sheets on items tab
    const [itemSearch, setItemSearch] = useState("")
    const [debouncedItemSearch, setDebouncedItemSearch] = useState("")
    const [itemSortConfig, setItemSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>(null)
    const [selectedItemIds, setSelectedItemIds] = useState<Set<number>>(new Set())
    const [isSheetOpen, setIsSheetOpen] = useState(false)
    const [editingItem, setEditingItem] = useState<any | null>(null)

    const [formData, setFormData] = useState<FormData>({ products: [], services: [], staff: [] })
    const [isSaving, setIsSaving] = useState(false)
    const [isLoadingData, setIsLoadingData] = useState(false)
    const [fieldErrors, setFieldErrors] = useState<Set<string>>(new Set())

    // Load select options
    useEffect(() => {
        setIsLoadingData(true)
        getRecurringPlanFormDataAction(partnerId)
            .then((res) => {
                if (res.success && res.data) {
                    setFormData(res.data as FormData)
                }
            })
            .finally(() => {
                setIsLoadingData(false)
            })
    }, [partnerId])

    // Debounce search input
    useEffect(() => {
        const handler = setTimeout(() => setDebouncedItemSearch(itemSearch), 300)
        return () => clearTimeout(handler)
    }, [itemSearch])

    // Populate data when editing
    useEffect(() => {
        if (plan) {
            setName(plan.name || "")
            setDescription(plan.description || "")
            setStatus(plan.status || "active")
            setFrequencyType(plan.frequencyType || "monthly")
            setFrequencyInterval(plan.frequencyInterval || 1)
            setStartDate(plan.startDate ? plan.startDate.slice(0, 10) : new Date().toISOString().slice(0, 10))
            setEndDate(plan.endDate ? plan.endDate.slice(0, 10) : "")
            setShowInMarketplace(plan.showInMarketplace !== false && plan.show_in_marketplace !== false)
            if (plan.items && plan.items.length > 0) {
                setItems(
                    plan.items.map((item: any) => ({
                        id: item.id,
                        itemType: item.itemType,
                        productId: item.productId,
                        variantId: item.variantId,
                        serviceId: item.serviceId,
                        quantity: item.quantity,
                        unitPrice: item.unitPrice,
                        staffPartnerUserId: item.staffPartnerUserId,
                        preferredTime: item.preferredTime,
                        durationMinutes: item.durationMinutes,
                        name: item.product?.name || item.service?.name || "Item",
                    }))
                )
            } else {
                setItems([])
            }
            const planImages = Array.isArray(plan.images) ? plan.images.filter((img: any) => typeof img === "string" && !img.startsWith("data:")) : []
            setImages(planImages)
            setBillingMode(plan.billingMode || plan.billing_mode || "manual")
            setCreditExpirationPolicy(plan.creditExpirationPolicy || plan.credit_expiration_policy || "end_of_cycle")
            setCreditExpirationDays(plan.creditExpirationDays != null ? Number(plan.creditExpirationDays) : (plan.credit_expiration_days != null ? Number(plan.credit_expiration_days) : null))
        }
    }, [plan])

    const isDirty = useMemo(() => {
        if (!plan) {
            return name !== "" || description !== "" || items.length > 0 || images.length > 0
        }
        return (
            name !== (plan.name || "") ||
            description !== (plan.description || "") ||
            status !== (plan.status || "active") ||
            frequencyType !== (plan.frequencyType || plan.frequency_type || "monthly") ||
            frequencyInterval !== (plan.frequencyInterval || plan.frequency_interval || 1) ||
            startDate !== (plan.startDate ? plan.startDate.slice(0, 10) : (plan.start_date ? plan.start_date.slice(0, 10) : "")) ||
            endDate !== (plan.endDate ? plan.endDate.slice(0, 10) : (plan.end_date ? plan.end_date.slice(0, 10) : "")) ||
            showInMarketplace !== (plan.showInMarketplace !== false && plan.show_in_marketplace !== false) ||
            billingMode !== (plan.billingMode || plan.billing_mode || "manual") ||
            creditExpirationPolicy !== (plan.creditExpirationPolicy || plan.credit_expiration_policy || "end_of_cycle") ||
            creditExpirationDays !== (plan.creditExpirationDays != null ? Number(plan.creditExpirationDays) : (plan.credit_expiration_days != null ? Number(plan.credit_expiration_days) : null)) ||
            JSON.stringify(items) !== JSON.stringify(plan.items) ||
            JSON.stringify(images) !== JSON.stringify(plan.images || [])
        )
    }, [name, description, status, frequencyType, frequencyInterval, startDate, endDate, showInMarketplace, billingMode, creditExpirationPolicy, creditExpirationDays, items, images, plan])

    const { showConfirmDialog, confirmNavigation, cancelNavigation, handleNavigation } = useUnsavedChanges(isDirty)

    const handleBack = useCallback(() => handleNavigation(onBack), [handleNavigation, onBack])

    const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        e.currentTarget.value = ""
        if (file) { setSelectedImageForCrop(file); setShowImageCropper(true) }
    }, [])

    const handleImageCropComplete = useCallback(async (croppedImageDataUrl: string) => {
        const blob = await (await fetch(croppedImageDataUrl)).blob()
        const extension = blob.type === "image/png" ? "png" : "jpg"
        const file = new File([blob], `plan-image.${extension}`, { type: blob.type })
        setImages((prev) => [...prev, file])
        setShowImageCropper(false)
        setSelectedImageForCrop(null)
    }, [])

    const handleRemoveImage = useCallback((indexToDelete: number) => {
        setImages((prev) => prev.filter((_, i) => i !== indexToDelete))
        setBlockedImages((prev) => {
            const newBlocked = new Set<number>()
            let newIdx = 0
            for (let i = 0; i < images.length; i++) {
                if (i !== indexToDelete && prev.has(i)) newBlocked.add(newIdx)
                if (i !== indexToDelete) newIdx++
            }
            return newBlocked
        })
    }, [images.length])

    const handleSetPrimaryImage = useCallback((index: number) => {
        if (!images.length) return
        const imgs = [...images]
        const [primary] = imgs.splice(index, 1)
        imgs.unshift(primary)
        setImages(imgs)
    }, [images])

    const getTabErrorCount = useCallback((tab: string) => {
        return REQUIRED_FIELDS.filter(({ field, tab: fieldTab }) => fieldTab === tab && fieldErrors.has(field)).length
    }, [fieldErrors])

    const { scrollToFirstError } = useScrollToFirstError({
        fieldErrors,
        REQUIRED_FIELDS,
        scrollContainerRef,
        activeTab,
        setActiveTab,
    })

    const handleAddItemTrigger = () => {
        setEditingItem(null)
        setIsSheetOpen(true)
    }

    const handleEditItemTrigger = (item: any, index: number) => {
        setEditingItem({ ...item, id: String(index) })
        setIsSheetOpen(true)
    }

    const handleSaveItemFromSheet = (item: any) => {
        setItems((prev) => {
            const next = [...prev]
            if (item.id !== undefined) {
                next[Number(item.id)] = item
            } else {
                next.push(item)
            }
            return next
        })
        setSelectedItemIds(new Set())
    }

    const handleRemoveItem = (index: number) => {
        setItems((prev) => prev.filter((_, i) => i !== index))
        setSelectedItemIds(prev => {
            const next = new Set(prev)
            next.delete(index)
            return next
        })
    }

    const handleBulkDeleteItems = () => {
        setItems(prev => prev.filter((_, i) => !selectedItemIds.has(i)))
        setSelectedItemIds(new Set())
    }

    const handleSelectAllItems = () => {
        setSelectedItemIds(prev =>
            prev.size === filteredAndSortedItems.length
                ? new Set()
                : new Set(filteredAndSortedItems.map((_, i) => i))
        )
    }

    const handleSelectRowItem = (index: number) => {
        setSelectedItemIds(prev => {
            const next = new Set(prev)
            next.has(index) ? next.delete(index) : next.add(index)
            return next
        })
    }

    const handleSave = async () => {
        const errors = new Set<string>()
        if (!name.trim()) errors.add("name")
        if (frequencyInterval <= 0) errors.add("frequencyInterval")
        if (!startDate) errors.add("startDate")

        if (items.length === 0) {
            notifyError("Adicione ao menos um item ao plano recorrente.")
            return
        }

        if (errors.size > 0) {
            setFieldErrors(errors)
            scrollToFirstError()
            notifyError("Preencha todos os campos obrigatórios e verifique os itens do plano.")
            return
        }
        setFieldErrors(new Set())

        if (blockedImages.size > 0) {
            notifyError("Remova as imagens bloqueadas antes de salvar.")
            return
        }

        try {
            setIsSaving(true)

            // Upload files to R2 first
            const finalImages: string[] = []
            const filesToUpload: { file: File; index: number }[] = []

            images.forEach((img: string | File, idx: number) => {
                if (img instanceof File) filesToUpload.push({ file: img, index: idx })
                else finalImages[idx] = img
            })

            if (filesToUpload.length > 0) {
                setUploadingImages(new Set(filesToUpload.map((f) => f.index)))

                const uploadResults = await Promise.all(
                    filesToUpload.map(async ({ file, index }) => {
                        const formData = new FormData()
                        const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg"
                        formData.append("file", file, `plan-image.${extension}`)

                        const { fetchWithCSRF } = await import("@/lib/utils/fetch-with-csrf")
                        const response = await fetchWithCSRF("/api/upload-image", { method: "POST", body: formData })
                        const result = await response.json()
                        return { result, file, index }
                    })
                )

                let hasErrors = false
                let errorMessage = "Falha na validação de algumas imagens. Tente novamente."

                uploadResults.forEach(({ result, file, index }) => {
                    if (result.success && result.key) {
                        finalImages[index] = result.key
                    } else {
                        hasErrors = true
                        if (result.error) errorMessage = result.error
                    }
                })

                if (hasErrors) {
                    notifyError(errorMessage)
                    setUploadingImages(new Set())
                    setIsSaving(false)
                    return
                }

                setUploadingImages(new Set())
            }

            const cleanedFinalImages = finalImages.filter(Boolean)

            const payload = {
                partnerId,
                name,
                description: description || null,
                status,
                frequencyType,
                frequencyInterval,
                startDate: `${startDate}T12:00:00.000Z`,
                endDate: endDate ? `${endDate}T23:59:59.000Z` : null,
                showInMarketplace,
                billingMode,
                creditExpirationPolicy,
                creditExpirationDays: creditExpirationPolicy === "fixed_days" ? creditExpirationDays : null,
                items: items.map((item) => ({
                    itemType: item.itemType,
                    productId: item.productId,
                    variantId: item.variantId,
                    serviceId: item.serviceId,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                    staffPartnerUserId: item.staffPartnerUserId,
                    preferredTime: item.preferredTime ? (item.preferredTime.includes(":") && item.preferredTime.split(":").length === 2 ? `${item.preferredTime}:00` : item.preferredTime) : null,
                    durationMinutes: item.durationMinutes,
                })),
                images: cleanedFinalImages,
            }

            const res = plan?.id
                ? await updateRecurringPlanAction({ ...payload, planId: plan.id })
                : await createRecurringPlanAction(payload)

            if (res.success) {
                notifySuccess(plan?.id ? "Plano atualizado com sucesso!" : "Plano criado com sucesso!")
                if (onSuccess) onSuccess(plan?.id ? "Plano atualizado" : "Plano criado")
                onBack()
            } else {
                notifyError(res.error || "Erro ao salvar o plano.")
                if (onError) onError(res.error || "Erro ao salvar")
            }
        } catch (e) {
            console.error(e)
            notifyError("Ocorreu um erro ao salvar o plano.")
        } finally {
            setIsSaving(false)
        }
    }

    const pageTitle = plan ? "Editar plano" : "Novo plano recorrente"
    const isEditLoadingLocked = Boolean(plan && isLoadingData)

    useEffect(() => {
        setHeaderOverride({
            title: pageTitle,
            onBack: handleBack,
            isSubPage: true
        })
        return () => setHeaderOverride(null)
    }, [pageTitle, handleBack, setHeaderOverride])

    const frequencyOptions = [
        { value: "daily", label: "Diária" },
        { value: "weekly", label: "Semanal" },
        { value: "monthly", label: "Mensal" },
        { value: "yearly", label: "Anual" },
        { value: "custom", label: "Personalizada" }
    ]

    const statusOptions = [
        { value: "active", label: "Ativo" },
        { value: "inactive", label: "Inativo" },
        { value: "archived", label: "Arquivado" }
    ]

    const billingModeOptions = [
        { value: "manual", label: "Manual (A combinar)" },
        { value: "auto_mercado_pago", label: "Automático (Mercado Pago)" }
    ]

    const creditExpirationOptions = [
        { value: "end_of_cycle", label: "Fim do ciclo" },
        { value: "fixed_days", label: "Dias fixos" },
        { value: "never", label: "Nunca expira" }
    ]

    // Filter and sort items locally
    const filteredAndSortedItems = useMemo(() => {
        const list = items.map((item, index) => ({ ...item, originalIndex: index }))
        const term = debouncedItemSearch.toLowerCase()

        const filtered = list.filter(item => {
            if (!term) return true
            return item.name.toLowerCase().includes(term)
        })

        if (itemSortConfig) {
            filtered.sort((a, b) => {
                let aVal = a[itemSortConfig.key]
                let bVal = b[itemSortConfig.key]

                if (itemSortConfig.key === "unitPrice" || itemSortConfig.key === "quantity") {
                    aVal = Number(aVal) || 0
                    bVal = Number(bVal) || 0
                } else {
                    aVal = String(aVal || "").toLowerCase()
                    bVal = String(bVal || "").toLowerCase()
                }

                if (aVal === bVal) return 0
                const comp = aVal < bVal ? -1 : 1
                return itemSortConfig.direction === "asc" ? comp : -comp
            })
        }

        return filtered
    }, [items, debouncedItemSearch, itemSortConfig])

    const handleSortItem = (key: string) => {
        setItemSortConfig(prev => {
            if (prev?.key === key) {
                return { key, direction: prev.direction === "asc" ? "desc" : "asc" }
            }
            return { key, direction: "asc" }
        })
    }

    return (
        <FadeIn>
            <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden transition-colors duration-500 ease-in-out">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full w-full">
                    <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-24 md:pb-8 scroll-smooth no-scrollbar">

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
                                <div className="hidden md:flex items-start justify-between">
                                    <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                        <h1 className={`font-bold text-brand-dark dark:text-dark-heading transition-all duration-500 flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                            <span className="truncate">{pageTitle}</span>
                                        </h1>

                                        <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                            Configure as regras de cobrança e os produtos/serviços inclusos no plano.
                                        </div>
                                    </div>

                                    {/* Desktop action buttons */}
                                    <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                                        <Button variant="outline" onClick={handleBack} disabled={isSaving || isEditLoadingLocked}>
                                            Cancelar
                                        </Button>
                                        <Button onClick={handleSave} disabled={isSaving || isEditLoadingLocked} leftIcon={<SaveIcon size={18} />}>
                                            {isSaving ? "Salvando..." : "Salvar"}
                                        </Button>
                                    </div>
                                </div>

                                {/* Tabs */}
                                <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                                    <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                        <TabsTrigger value="general">
                                            Dados gerais
                                            {getTabErrorCount("general") > 0 && <span className="ml-2 w-2 h-2 bg-brand-red rounded-full inline-block" />}
                                        </TabsTrigger>
                                        <TabsTrigger value="items">
                                            Itens do plano
                                            {items.length === 0 && (
                                                <span className="ml-2 w-2 h-2 bg-brand-red rounded-full inline-block" />
                                            )}
                                        </TabsTrigger>
                                    </TabsList>
                                </div>
                            </div>
                        </div>

                        {/* Content Body */}
                        <div className={`px-3 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px] relative ${isEditLoadingLocked ? "pointer-events-none" : ""}`}>
                            {isEditLoadingLocked && (
                                <div className="absolute inset-0 z-20 bg-white/65 dark:bg-dark-background/65 backdrop-blur-[2px] flex items-center justify-center rounded-xl">
                                    <div className="text-sm font-semibold text-brand-dark dark:text-dark-heading">Carregando dados...</div>
                                </div>
                            )}

                            <TabsContent value="general" className="mt-0">
                                <FadeIn key="general">
                                    <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
                                        {/* Left Main Column */}
                                        <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12">
                                            <section className="space-y-6">
                                                <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-4">Identificação do Plano</h3>

                                                <div className="mb-6">
                                                    <ProductImagesSection
                                                        images={images}
                                                        onImageUpload={handleImageUpload}
                                                        onRemoveImage={handleRemoveImage}
                                                        onSetPrimaryImage={handleSetPrimaryImage}
                                                        isEditing={true}
                                                        uploadingImages={uploadingImages}
                                                        blockedImages={blockedImages}
                                                        isSaving={isSaving}
                                                        moderationStatus="approved"
                                                    />
                                                </div>

                                                <div className="grid grid-cols-12 gap-5">
                                                    <div className="col-span-12 md:col-span-8">
                                                        <Input
                                                            label="Nome do plano"
                                                            placeholder="Ex: Assinatura Mensal de Ração"
                                                            value={name}
                                                            onChange={(e) => {
                                                                setName(e.target.value)
                                                                setFieldErrors((prev) => {
                                                                    const next = new Set(prev)
                                                                    next.delete("name")
                                                                    return next
                                                                })
                                                            }}
                                                            required
                                                            maxLength={150}
                                                            error={fieldErrors.has("name")}
                                                            errorMessage={fieldErrors.has("name") ? "Nome é obrigatório" : undefined}
                                                            dataField="name"
                                                        />
                                                    </div>
                                                    <div className="col-span-12 md:col-span-4 mt-[1px]">
                                                        <FormDropdown
                                                            label="Status"
                                                            value={status}
                                                            setValue={(val) => setStatus(val as any)}
                                                            options={statusOptions}
                                                        />
                                                    </div>
                                                    <div className="col-span-12">
                                                        <FormTextarea
                                                            label="Descrição"
                                                            placeholder="Detalhes sobre o que este plano ofereçe..."
                                                            value={description}
                                                            onChange={(e) => setDescription(e.target.value)}
                                                            name="description"
                                                        />
                                                    </div>
                                                </div>

                                                <div className="mt-6 pt-6 border-t border-brand-border dark:border-dark-border">
                                                    <Checkbox
                                                        label="Exibir este plano no marketplace para venda pública"
                                                        checked={showInMarketplace}
                                                        onChange={(checked) => setShowInMarketplace(checked)}
                                                    />
                                                </div>
                                            </section>
                                        </div>

                                        {/* Right Sidebar Column */}
                                        <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 border-l-0 lg:border-l border-brand-border dark:border-dark-border mt-8 lg:mt-0">
                                            <SidebarCard hasTopStrip title="Regra de Recorrência">
                                                <div className="space-y-5">
                                                    <FormDropdown
                                                        label="Frequência"
                                                        value={frequencyType}
                                                        setValue={(val) => setFrequencyType(val as any)}
                                                        options={frequencyOptions}
                                                    />

                                                    <Input
                                                        type="number"
                                                        label="Intervalo (Frequência)"
                                                        placeholder="Ex: 1"
                                                        value={frequencyInterval}
                                                        onChange={(e) => {
                                                            setFrequencyInterval(Number(e.target.value))
                                                            setFieldErrors((prev) => {
                                                                const next = new Set(prev)
                                                                next.delete("frequencyInterval")
                                                                return next
                                                            })
                                                        }}
                                                        required
                                                        min={1}
                                                        error={fieldErrors.has("frequencyInterval")}
                                                        errorMessage={fieldErrors.has("frequencyInterval") ? "Intervalo inválido" : undefined}
                                                        dataField="frequencyInterval"
                                                    />

                                                    <DatePicker
                                                        label="Data de Início"
                                                        value={startDate}
                                                        onChange={(e) => {
                                                            setStartDate(e.target.value)
                                                            setFieldErrors((prev) => {
                                                                const next = new Set(prev)
                                                                next.delete("startDate")
                                                                return next
                                                            })
                                                        }}
                                                        required
                                                        error={fieldErrors.has("startDate")}
                                                        errorMessage={fieldErrors.has("startDate") ? "Data de início é obrigatória" : undefined}
                                                        dataField="startDate"
                                                    />

                                                    <DatePicker
                                                        label="Data de Fim (Opcional)"
                                                        value={endDate}
                                                        onChange={(e) => setEndDate(e.target.value)}
                                                    />
                                                </div>
                                            </SidebarCard>

                                            <SidebarCard title="Cobrança e Créditos">
                                                <div className="space-y-5">
                                                    <FormDropdown
                                                        label="Modo de Cobrança"
                                                        value={billingMode}
                                                        setValue={(val) => setBillingMode(val as any)}
                                                        options={billingModeOptions}
                                                    />

                                                    <FormDropdown
                                                        label="Validade dos Créditos"
                                                        value={creditExpirationPolicy}
                                                        setValue={(val) => setCreditExpirationPolicy(val as any)}
                                                        options={creditExpirationOptions}
                                                    />

                                                    {creditExpirationPolicy === "fixed_days" && (
                                                        <Input
                                                            type="number"
                                                            label="Dias de Validade"
                                                            placeholder="Ex: 30"
                                                            value={creditExpirationDays !== null ? creditExpirationDays : ""}
                                                            onChange={(e) => setCreditExpirationDays(e.target.value === "" ? null : Number(e.target.value))}
                                                            required
                                                            min={1}
                                                        />
                                                    )}
                                                </div>
                                            </SidebarCard>
                                        </div>
                                    </div>
                                </FadeIn>
                            </TabsContent>

                            <TabsContent value="items" className="mt-0">
                                <FadeIn key="items">
                                    {items.length === 0 ? (
                                        <div className="space-y-6">
                                            <div className="flex flex-col items-center justify-center text-center py-12 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl">
                                                <IconPlaceholder
                                                    icon={BoxIcon}
                                                    title="Não há itens no plano"
                                                    subtitle="Adicione produtos ou serviços a este plano recorrente."
                                                    itemButton={{
                                                        text: "Adicionar item",
                                                        action: handleAddItemTrigger,
                                                        variant: "outline"
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="max-w-[1300px] mx-auto pb-20 relative">
                                            {/* Header Section */}
                                            <div className="flex justify-between items-center mb-4">
                                                <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">
                                                    Itens do Plano ({filteredAndSortedItems.length})
                                                </h3>
                                                <Button variant="link" onClick={handleAddItemTrigger} className="flex items-center hidden md:flex">
                                                    + Adicionar Item
                                                </Button>
                                            </div>

                                            {/* Search & Actions Control Bar */}
                                            <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-4 flex-none">
                                                {/* Mobile Header Row */}
                                                <div className="md:hidden flex items-center gap-2 w-full">
                                                    <div className="flex-1 min-w-0">
                                                        <Input
                                                            name="searchItem"
                                                            placeholder="Buscar item..."
                                                            value={itemSearch}
                                                            onChange={(e) => setItemSearch(e.target.value)}
                                                            className="h-[42px] w-full"
                                                            variant="full-rounded"
                                                            prefix={<SearchIcon size={18} className="text-brand-inactive-text shrink-0" />}
                                                        />
                                                    </div>
                                                    <div className="flex-none flex items-center gap-2">
                                                        <Button
                                                            onClick={handleAddItemTrigger}
                                                            className="w-[42px] h-[42px] p-0 flex items-center justify-center rounded-full bg-brand-green hover:bg-brand-green/90 text-white shadow-sm"
                                                        >
                                                            <PlusIcon className="w-5 h-5" strokeWidth={3} />
                                                        </Button>
                                                    </div>
                                                </div>

                                                {/* Desktop Search Bar */}
                                                <div className="hidden md:flex items-center w-full gap-4">
                                                    <div className="w-80">
                                                        <Input
                                                            name="searchItem"
                                                            placeholder="Buscar item..."
                                                            prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
                                                            value={itemSearch}
                                                            onChange={(e) => setItemSearch(e.target.value)}
                                                            className="h-[42px]"
                                                            variant="full-rounded"
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Selection Banner */}
                                            <SelectionBanner
                                                selectedCount={selectedItemIds.size}
                                                totalCount={filteredAndSortedItems.length}
                                                onSelectAll={() => setSelectedItemIds(new Set(filteredAndSortedItems.map((_, i) => i)))}
                                                onClearSelection={() => setSelectedItemIds(new Set())}
                                                itemName="itens"
                                                singularItemName="item"
                                            />

                                            {/* Table / Grid Container */}
                                            <div className="w-full bg-white dark:bg-dark-surface rounded-xl border border-transparent dark:border-dark-border/20 overflow-hidden">

                                                {/* Mobile Layout */}
                                                <div className="md:hidden divide-y divide-brand-border dark:divide-dark-border">
                                                    {filteredAndSortedItems.map((item, idx) => (
                                                        <div key={idx} className="p-4 flex items-center gap-3">
                                                            <div className="shrink-0">
                                                                <Checkbox
                                                                    checked={selectedItemIds.has(item.originalIndex)}
                                                                    onChange={() => handleSelectRowItem(item.originalIndex)}
                                                                />
                                                            </div>
                                                            <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                                                                {item.itemType === "product" ? <BoxIcon size={18} className="text-brand-primary" /> : <ClockIcon size={18} className="text-brand-primary" />}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <span className="block truncate text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                                    {item.name}
                                                                </span>
                                                                <span className="block text-xs font-semibold text-brand-primary dark:text-dark-body">
                                                                    {item.itemType === "product" ? "Produto" : "Serviço"} • {formatQuantityWithUnit(item.quantity, item.unit)}
                                                                </span>
                                                            </div>
                                                            <div className="shrink-0 flex items-center gap-2">
                                                                <Button variant="outline" size="sm" onClick={() => handleEditItemTrigger(item, item.originalIndex)}>
                                                                    Editar
                                                                </Button>
                                                                <Button variant="outline" size="sm" className="border-brand-red text-brand-red" onClick={() => handleRemoveItem(item.originalIndex)}>
                                                                    Remover
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>

                                                {/* Desktop Table View */}
                                                <div className="hidden md:block">
                                                    <table className="w-full text-left border-separate border-spacing-0">
                                                        <thead>
                                                            <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                                <th className="py-3 px-6 w-12 bg-brand-gray dark:bg-dark-border/50 border-b border-brand-border dark:border-dark-border sticky left-0 z-20">
                                                                    <Checkbox
                                                                        checked={selectedItemIds.size === filteredAndSortedItems.length && filteredAndSortedItems.length > 0}
                                                                        onChange={handleSelectAllItems}
                                                                        className="bg-white dark:bg-dark-background"
                                                                    />
                                                                </th>
                                                                <th className="py-3 px-6 text-[13px] font-semibold text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 border-b border-brand-border dark:border-dark-border cursor-pointer hover:bg-gray-200 transition-colors" onClick={() => handleSortItem("name")}>
                                                                    <div className="flex items-center gap-1">
                                                                        <span>Item</span>
                                                                        <ArrowUpDownIcon className="w-3.5 h-3.5" />
                                                                    </div>
                                                                </th>
                                                                <th className="py-3 px-6 text-[13px] font-semibold text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 border-b border-brand-border dark:border-dark-border cursor-pointer hover:bg-gray-200 transition-colors" onClick={() => handleSortItem("itemType")}>
                                                                    <div className="flex items-center gap-1">
                                                                        <span>Tipo</span>
                                                                        <ArrowUpDownIcon className="w-3.5 h-3.5" />
                                                                    </div>
                                                                </th>
                                                                <th className="py-3 px-6 text-[13px] font-semibold text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 border-b border-brand-border dark:border-dark-border cursor-pointer hover:bg-gray-200 transition-colors" onClick={() => handleSortItem("unitPrice")}>
                                                                    <div className="flex items-center gap-1">
                                                                        <span>Preço Unitário</span>
                                                                        <ArrowUpDownIcon className="w-3.5 h-3.5" />
                                                                    </div>
                                                                </th>
                                                                <th className="py-3 px-6 text-[13px] font-semibold text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 border-b border-brand-border dark:border-dark-border cursor-pointer hover:bg-gray-200 transition-colors" onClick={() => handleSortItem("quantity")}>
                                                                    <div className="flex items-center gap-1">
                                                                        <span>Quantidade</span>
                                                                        <ArrowUpDownIcon className="w-3.5 h-3.5" />
                                                                    </div>
                                                                </th>
                                                                <th className="py-3 px-6 text-[13px] font-semibold text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 border-b border-brand-border dark:border-dark-border text-center">
                                                                    Ações
                                                                </th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {filteredAndSortedItems.map((item, idx) => (
                                                                <tr key={idx} className="group hover:bg-brand-gray/30 transition-colors bg-white dark:bg-dark-background border-b border-brand-border last:border-0">
                                                                    <td className="py-4 px-6 border-b border-brand-border w-12">
                                                                        <Checkbox
                                                                            checked={selectedItemIds.has(item.originalIndex)}
                                                                            onChange={() => handleSelectRowItem(item.originalIndex)}
                                                                        />
                                                                    </td>
                                                                    <td className="py-4 px-6 border-b border-brand-border">
                                                                        <div className="flex items-center gap-3">
                                                                            <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                                                                                {item.itemType === "product" ? <BoxIcon size={18} className="text-brand-primary" /> : <ClockIcon size={18} className="text-brand-primary" />}
                                                                            </div>
                                                                            <div className="flex flex-col text-left">
                                                                                <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading mb-0.5">
                                                                                    {item.name}
                                                                                </span>
                                                                                {item.itemType === "service" && item.staffPartnerUserId && (
                                                                                    <span className="text-xs text-brand-inactive-text">
                                                                                        Profissional: {formData.staff.find(s => s.id === item.staffPartnerUserId)?.display_name || "N/A"}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </td>
                                                                    <td className="py-4 px-6 border-b border-brand-border">
                                                                        <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading">
                                                                            {item.itemType === "product" ? "Produto" : "Serviço"}
                                                                        </span>
                                                                    </td>
                                                                    <td className="py-4 px-6 border-b border-brand-border">
                                                                        <span className="text-[13px] font-semibold text-brand-dark dark:text-dark-heading">
                                                                            {item.unitPrice != null ? formatCurrency(item.unitPrice) : "Padrão"}
                                                                        </span>
                                                                    </td>
                                                                    <td className="py-4 px-6 border-b border-brand-border">
                                                                        <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">
                                                                            {item.quantity} UN
                                                                        </span>
                                                                    </td>
                                                                    <td className="py-4 px-6 border-b border-brand-border text-center">
                                                                        <div className="flex justify-center gap-2">
                                                                            <Button variant="outline" size="sm" onClick={() => handleEditItemTrigger(item, item.originalIndex)}>
                                                                                Editar
                                                                            </Button>
                                                                            <Button variant="outline" size="sm" className="border-brand-red text-brand-red hover:bg-red-50" onClick={() => handleRemoveItem(item.originalIndex)}>
                                                                                Remover
                                                                            </Button>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </FadeIn>
                            </TabsContent>

                        </div>

                    </div>
                </Tabs>
            </div>

            {/* Floating Action Bar */}
            <FloatingActionBar selectedCount={selectedItemIds.size} onClearSelection={() => setSelectedItemIds(new Set())}>
                <Button
                    variant="ghostred"
                    onClick={handleBulkDeleteItems}
                    leftIcon={<TrashIcon size={18} />}
                    className="h-10 px-3"
                >
                    Remover Selecionados
                </Button>
            </FloatingActionBar>

            {/* Floating Save/Cancel bar for mobile */}
            <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-dark-surface border-t py-4 px-6 flex items-center justify-between gap-4 z-40">
                <Button variant="outline" className="flex-1" onClick={handleBack} disabled={isSaving || isEditLoadingLocked}>
                    Cancelar
                </Button>
                <Button className="flex-1" onClick={handleSave} disabled={isSaving || isEditLoadingLocked} leftIcon={<SaveIcon size={18} />}>
                    Salvar
                </Button>
            </div>

            <PlanItemFormSheet
                isOpen={isSheetOpen}
                onClose={() => setIsSheetOpen(false)}
                formData={formData}
                onSave={handleSaveItemFromSheet}
                editingItem={editingItem}
            />

            <SavingStatusModal isOpen={isSaving} text="Salvando plano..." />
            <UnsavedChangesDialog open={showConfirmDialog} onConfirm={confirmNavigation} onCancel={cancelNavigation} />
            <ImageCropperModal
                isOpen={showImageCropper}
                onClose={() => setShowImageCropper(false)}
                imageFile={selectedImageForCrop}
                onCropComplete={handleImageCropComplete}
            />
        </FadeIn>
    )
}

export default NewRecurringPlanPage
