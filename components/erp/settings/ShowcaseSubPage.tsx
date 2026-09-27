"use client"

import React, { useState, useCallback, useRef, useTransition, useMemo, useEffect } from "react"
import {
    Button,
    RadioButton,
    ListItem,
    Spinner,
    AlertModal,
    SavingStatusModal,
    FormSection,
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
    CepInput,
    StateComboBox,
    Input,
    SidebarCard,
    NumberInputWithCheckbox,
} from "@/components/reusable"
import { updateStoreAction } from "@/app/actions/erp/stores"
import { updatePartnerAction } from "@/app/actions/marketplace/partners"
import { ChevronLeftIcon, SaveIcon, Store, WhatsappIcon, TrashIcon, ClockIcon, MonitorIcon } from "@/lib/icons"
import { useNotification } from "@/hooks/use-notification"
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes"
import { usePermissions } from "@/lib/permission-context"
import ImageCropperModal from "@/components/ImageCropperModal"
import { fetchWithCSRF } from "@/lib/utils/fetch-with-csrf"
import { FadeIn } from "@/components/animations/FadeIn"
import { getRandomDefaultBanner } from "@/lib/utils/banner"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { isGifFile } from "@/lib/security/file-validator"
import { supabaseBrowser as supabase } from "@/lib/supabase/browser-client"
import { normalizeBusinessInfo } from "@/lib/business-info"
import ProductImagesSection from "@/components/erp/product/ProductImagesSection"

export const ShowcaseSubPage = ({
    store,
    partnerId,
    partnerOrderFlow,
    onBack,
}: {
    store: any
    partnerId: string
    partnerOrderFlow?: string | null
    onBack: () => void
}) => {
    const { success: notifySuccess, error: notifyError } = useNotification()
    const [isPending, startTransition] = useTransition()
    const [isLoading, setIsLoading] = useState(false)
    const [isScrolled, setIsScrolled] = useState(false)
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const { planSlug, businessInfo: contextBusinessInfo } = usePermissions()

    const businessInfo = normalizeBusinessInfo(contextBusinessInfo || store?.business_info)
    const isDesapego = businessInfo.mode === "desapego"
    const isQuickMode = businessInfo.mode === "quick" || businessInfo.mode === "showcase"
    const [activeTab, setActiveTab] = useState<"general" | "address">("general")

    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
    }, [])

    const [generalInfo, setGeneralInfo] = useState({
        storeImageUrl: store.logo_url || "",
        bannerUrl: store.banner_url || "",
        isShowcaseActive: store.is_showcase_active ?? true,
        acceptOrdersWhenClosed: store.accept_orders_when_closed ?? true,
        gallery: store.gallery || [],
        orderFlow: partnerOrderFlow || store.order_flow || (isQuickMode ? "whatsapp" : "dudit"),
    })

    const initialStoreAddr = store.addresses?.[0] || store.address || {}
    const [address, setAddress] = useState({
        zipCode: store.zip_code || initialStoreAddr.zip_code || "",
        street: store.street || initialStoreAddr.street || "",
        number: store.number || initialStoreAddr.number || "",
        complement: store.complement || initialStoreAddr.complement || "",
        neighborhood: store.neighborhood || initialStoreAddr.neighborhood || "",
        city: store.city || initialStoreAddr.city || "",
        state: store.state || initialStoreAddr.state || "",
        noNumber: (store.number || initialStoreAddr.number) === "S/N",
        ibge: initialStoreAddr.municipio_codigo_ibge || "",
        latitude: initialStoreAddr.latitude ?? null,
        longitude: initialStoreAddr.longitude ?? null,
    })

    useEffect(() => {
        if (!store?.id) return
        const fetchAddress = async () => {
            const { data: storeData } = await supabase
                .from("stores")
                .select("*, addresses!store_id(id, zip_code, street, number, complement, neighborhood, city, state, is_default, municipio_codigo_ibge, latitude, longitude)")
                .eq("id", store.id)
                .single()
            if (storeData?.addresses?.[0]) {
                const addr = storeData.addresses[0] as any
                const newAddress = {
                    zipCode: addr.zip_code || "",
                    street: addr.street || "",
                    number: addr.number || "",
                    complement: addr.complement || "",
                    neighborhood: addr.neighborhood || "",
                    city: addr.city || "",
                    state: addr.state || "",
                    noNumber: addr.number === "S/N",
                    ibge: addr.municipio_codigo_ibge || "",
                    latitude: addr.latitude ?? null,
                    longitude: addr.longitude ?? null,
                }
                setAddress(newAddress)
                setInitialState((prev) => ({
                    ...prev,
                    address: { ...newAddress },
                }))
            }
        }
        fetchAddress()
    }, [store?.id])

    const [initialState, setInitialState] = useState(() => ({
        generalInfo: { ...generalInfo },
        address: { ...address },
    }))

    const isDirty = useMemo(() => {
        return JSON.stringify(initialState.generalInfo) !== JSON.stringify(generalInfo) ||
            JSON.stringify(initialState.address) !== JSON.stringify(address)
    }, [initialState, generalInfo, address])

    const { showConfirmDialog, confirmNavigation, cancelNavigation, handleNavigation } = useUnsavedChanges(isDirty)

    const handleBack = useCallback(() => {
        handleNavigation(onBack)
    }, [handleNavigation, onBack])

    const [imagePreview, setImagePreview] = useState<string | null>(store.logo_url ? getR2ImageUrl(store.logo_url) : null)
    const [cropModalOpen, setCropModalOpen] = useState(false)
    const [tempImageFile, setTempImageFile] = useState<File | null>(null)
    const [imageUploading, setImageUploading] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [bannerPreview, setBannerPreview] = useState<string | null>(store.banner_url ? getR2ImageUrl(store.banner_url) : null)
    const [bannerCropModalOpen, setBannerCropModalOpen] = useState(false)
    const [tempBannerFile, setTempBannerFile] = useState<File | null>(null)
    const [bannerUploading, setBannerUploading] = useState(false)
    const bannerInputRef = useRef<HTMLInputElement>(null)

    // Gallery upload states
    const [galleryCropModalOpen, setGalleryCropModalOpen] = useState(false)
    const [tempGalleryImageFile, setTempGalleryImageFile] = useState<File | null>(null)

    const planLimits = {
        free: 1,
        crescer: 5,
        escalar: 10
    }
    const limit = planLimits[planSlug as 'free' | 'crescer' | 'escalar'] || 1

    const handleGalleryImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files
        e.currentTarget.value = ""
        if (!files || files.length === 0) return
        const file = files[0]
        if (isGifFile(file)) return void notifyError("Arquivos GIF não são permitidos no sistema.")
        if (file.size > 3 * 1024 * 1024) return void notifyError("Máximo 3MB por imagem")
        if (generalInfo.gallery.length >= limit) {
            return void notifyError(`Seu plano atual permite apenas até ${limit} imagem(ns) na galeria.`)
        }
        setTempGalleryImageFile(file)
        setGalleryCropModalOpen(true)
    }

    const handleRemoveGalleryImage = (indexToRemove: number) => {
        setGeneralInfo((p: any) => ({ ...p, gallery: p.gallery.filter((_: any, i: number) => i !== indexToRemove) }))
    }

    const handleSetPrimaryGalleryImage = (indexToSet: number) => {
        setGeneralInfo((p: any) => {
            const gallery = [...p.gallery]
            const [primary] = gallery.splice(indexToSet, 1)
            gallery.unshift(primary)
            return { ...p, gallery }
        })
    }

    const handleGalleryCropComplete = (croppedBase64: string) => {
        setGeneralInfo((p: any) => ({ ...p, gallery: [...p.gallery, croppedBase64] }))
        setGalleryCropModalOpen(false)
        setTempGalleryImageFile(null)
    }

    const handleSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault()

        setIsLoading(true)
        startTransition(async () => {
            let finalLogoUrl = generalInfo.storeImageUrl
            let finalBannerUrl = generalInfo.bannerUrl
            const finalGalleryUrls = [...generalInfo.gallery]

            // 1. Upload logo if it's base64/blob
            if (finalLogoUrl && finalLogoUrl.startsWith("data:")) {
                setImageUploading(true)
                try {
                    const blob = await (await fetch(finalLogoUrl)).blob()
                    const ext = blob.type === "image/png" ? "png" : "jpg"
                    const file = new File([blob], `logo.${ext}`, { type: blob.type })
                    const formData = new FormData()
                    formData.append("file", file)
                    const res = await fetchWithCSRF("/api/upload-image?uploadType=partner-logo", { method: "POST", body: formData })
                    const data = await res.json()
                    if (data.success && data.key) {
                        finalLogoUrl = data.key
                    } else {
                        notifyError(data.error || "Erro no upload da logo")
                        setIsLoading(false); setImageUploading(false); return
                    }
                } catch {
                    notifyError("Erro no upload da logo")
                    setIsLoading(false); setImageUploading(false); return
                } finally { setImageUploading(false) }
            }

            // 2. Upload banner if it's base64/blob
            if (finalBannerUrl && finalBannerUrl.startsWith("data:")) {
                setBannerUploading(true)
                try {
                    const blob = await (await fetch(finalBannerUrl)).blob()
                    const ext = blob.type === "image/png" ? "png" : "jpg"
                    const file = new File([blob], `banner.${ext}`, { type: blob.type })
                    const formData = new FormData()
                    formData.append("file", file)
                    const res = await fetchWithCSRF("/api/upload-image?uploadType=partner-banner", { method: "POST", body: formData })
                    const data = await res.json()
                    if (data.success && data.key) {
                        finalBannerUrl = data.key
                    } else {
                        notifyError(data.error || "Erro no upload do banner")
                        setIsLoading(false); setBannerUploading(false); return
                    }
                } catch {
                    notifyError("Erro no upload do banner")
                    setIsLoading(false); setBannerUploading(false); return
                } finally { setBannerUploading(false) }
            }

            // 3. Upload gallery images if they are base64/blob
            let galleryUploadingError = false
            for (let i = 0; i < finalGalleryUrls.length; i++) {
                const img = finalGalleryUrls[i]
                if (img.startsWith("data:")) {
                    try {
                        const blob = await (await fetch(img)).blob()
                        const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg"
                        const file = new File([blob], `gallery-image-${Date.now()}-${i}.${ext}`, { type: blob.type })
                        const formData = new FormData()
                        formData.append("file", file)
                        const res = await fetchWithCSRF("/api/upload-image?uploadType=products", {
                            method: "POST",
                            body: formData
                        })
                        const data = await res.json()
                        if (data.success && data.key) {
                            finalGalleryUrls[i] = data.key
                        } else {
                            notifyError(data.error || "Erro no upload de imagem da galeria")
                            galleryUploadingError = true
                            break
                        }
                    } catch {
                        notifyError("Erro no upload de imagem da galeria")
                        galleryUploadingError = true
                        break
                    }
                }
            }

            if (galleryUploadingError) {
                setIsLoading(false)
                return
            }

            try {
                if (!isDesapego) {
                    await updatePartnerAction(partnerId, {
                        orderFlow: generalInfo.orderFlow as any,
                    })
                }

                const result = await updateStoreAction({
                    storeId: store.id,
                    partnerId,
                    logo_url: finalLogoUrl || null,
                    banner_url: finalBannerUrl || null,
                    is_showcase_active: generalInfo.isShowcaseActive,
                    accept_orders_when_closed: generalInfo.acceptOrdersWhenClosed,
                    gallery: finalGalleryUrls,
                    zip_code: address.zipCode || undefined,
                    street: address.street || undefined,
                    number: address.noNumber ? "S/N" : (address.number || undefined),
                    complement: address.complement || undefined,
                    neighborhood: address.neighborhood || undefined,
                    city: address.city || undefined,
                    state: address.state || undefined,
                    noNumber: address.noNumber,
                    municipioCodigoIbge: address.ibge || undefined,
                    latitude: address.latitude ?? undefined,
                    longitude: address.longitude ?? undefined,
                })

                if (!result.success) {
                    notifyError(result.error!)
                    setIsLoading(false)
                } else {
                    notifySuccess("Configurações atualizadas!")
                    setInitialState({
                        generalInfo: {
                            storeImageUrl: finalLogoUrl || "",
                            bannerUrl: finalBannerUrl || "",
                            isShowcaseActive: generalInfo.isShowcaseActive,
                            acceptOrdersWhenClosed: generalInfo.acceptOrdersWhenClosed,
                            gallery: finalGalleryUrls,
                            orderFlow: generalInfo.orderFlow,
                        },
                        address: { ...address },
                    })
                    setTimeout(() => {
                        onBack()
                    }, 500)
                }
            } catch (err) {
                notifyError("Erro ao atualizar vitrine")
                setIsLoading(false)
            }
        })
    }

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        e.currentTarget.value = ""
        if (!file) return
        if (isGifFile(file)) return void notifyError("Arquivos GIF não são permitidos no sistema.")
        if (file.size > 3 * 1024 * 1024) return void notifyError("Máximo 3MB")
        setTempImageFile(file)
        setCropModalOpen(true)
    }

    const handleCropComplete = (url: string) => {
        setCropModalOpen(false)
        setImagePreview(url)
        setGeneralInfo((p: any) => ({ ...p, storeImageUrl: url }))
        setTempImageFile(null)
    }

    const handleRemoveImage = () => {
        setImagePreview(null)
        setGeneralInfo((p: any) => ({ ...p, storeImageUrl: "" }))
        setTempImageFile(null)
    }

    const handleBannerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        e.currentTarget.value = ""
        if (!file) return
        if (isGifFile(file)) return void notifyError("Arquivos GIF não são permitidos no sistema.")
        if (file.size > 3 * 1024 * 1024) return void notifyError("Máximo 3MB")
        setTempBannerFile(file)
        setBannerCropModalOpen(true)
    }

    const handleBannerCropComplete = (url: string) => {
        setBannerCropModalOpen(false)
        setBannerPreview(url)
        setGeneralInfo((p: any) => ({ ...p, bannerUrl: url }))
        setTempBannerFile(null)
    }

    const handleRemoveBanner = () => {
        const randomBanner = getRandomDefaultBanner()
        setBannerPreview(randomBanner)
        setGeneralInfo((p: any) => ({ ...p, bannerUrl: randomBanner }))
    }

    return (
        <FadeIn className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden relative transition-colors duration-500 ease-in-out">
            <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-24 md:pb-8 scroll-smooth custom-scrollbar">

                {/* Sticky Header */}
                <div className="sticky top-0 z-30 w-full bg-white dark:bg-dark-surface transition-all duration-500 ease-in-out">
                    <div className="max-w-[1300px] mx-auto relative px-4 md:px-6">

                        {/* Back button - desktop only */}
                        <div className={`absolute -left-12 top-3 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                            <Button variant="filled" onClick={handleBack} className="w-10 h-10 p-0 flex items-center justify-center">
                                <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                            </Button>
                        </div>

                        {/* Title row */}
                        <div className="hidden md:flex items-start justify-between mb-4">
                            <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                <h1 className={`font-bold text-brand-dark dark:text-dark-heading transition-all duration-500 flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                    <span className="hidden md:inline truncate">Minha Vitrine</span>
                                </h1>

                                <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                    {isDesapego ? "Personalize o status, banner, logo e endereço da sua vitrine" : "Personalize a logo, banner, galeria e status de exibição da sua vitrine"}
                                </div>
                            </div>

                            {/* Desktop action buttons */}
                            <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                                <Button onClick={handleSubmit} disabled={isLoading} leftIcon={<SaveIcon size={18} />}>
                                    {isLoading ? "Salvando..." : "Salvar"}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Content Body */}
                <div className="px-3 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
                    {isDesapego ? (
                        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
                            <TabsList className="bg-transparent p-0 gap-8 w-full justify-start border-b border-brand-border dark:border-dark-border mb-8">
                                <TabsTrigger value="general">Dados Gerais</TabsTrigger>
                                <TabsTrigger value="address">Endereço</TabsTrigger>
                            </TabsList>

                            <TabsContent value="general" className="mt-0 focus-visible:outline-none">
                                <div className="grid grid-cols-12 gap-y-8 lg:gap-y-0 relative">
                                    <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12 space-y-8">
                                        {/* Status da Vitrine */}
                                        <FormSection title="Status da Vitrine">
                                            <div className="grid gap-3">
                                                <ListItem
                                                    title="Vitrine Ativa"
                                                    description="Seus anúncios estão visíveis e disponíveis"
                                                    icon={<Store className="text-brand-green" />}
                                                    onClick={() => setGeneralInfo({ ...generalInfo, isShowcaseActive: true })}
                                                    right={<RadioButton name="isShowcaseActive" value="active" checked={generalInfo.isShowcaseActive} onChange={() => setGeneralInfo({ ...generalInfo, isShowcaseActive: true })} />}
                                                    className="py-4 px-6 gap-4 cursor-pointer"
                                                />
                                                <ListItem
                                                    title="Vitrine Inativa"
                                                    description="Seus anúncios ficam ocultos temporariamente"
                                                    icon={<Store className="text-brand-inactive-text" />}
                                                    onClick={() => setGeneralInfo({ ...generalInfo, isShowcaseActive: false })}
                                                    right={<RadioButton name="isShowcaseActive" value="inactive" checked={!generalInfo.isShowcaseActive} onChange={() => setGeneralInfo({ ...generalInfo, isShowcaseActive: false })} />}
                                                    className="py-4 px-6 gap-4 cursor-pointer"
                                                />
                                            </div>
                                        </FormSection>

                                        {/* Banner da Vitrine */}
                                        <FormSection hasSeparator title="Banner da Vitrine">
                                            <div className="relative group overflow-hidden rounded-2xl border border-brand-border dark:border-dark-border aspect-[1400/300] bg-brand-gray dark:bg-dark-background flex items-center justify-center">
                                                {bannerPreview ? (
                                                    <img src={bannerPreview} alt="Banner" className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex flex-col items-center justify-center text-brand-inactive-text">
                                                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-2 opacity-40"><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></svg>
                                                        <span className="text-sm font-medium">Nenhum banner configurado</span>
                                                    </div>
                                                )}

                                                {bannerUploading && (
                                                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-20">
                                                        <Spinner size={32} className="text-white" />
                                                    </div>
                                                )}

                                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center gap-3 opacity-0 group-hover:opacity-100 z-10">
                                                    <Button variant="filled" onClick={() => bannerInputRef.current?.click()} className="bg-white text-brand-dark hover:bg-gray-100 border-none">
                                                        Trocar Banner
                                                    </Button>
                                                    {bannerPreview && !bannerPreview.includes('default/') && (
                                                        <Button variant="outline" onClick={handleRemoveBanner} className="bg-white/10 text-white hover:bg-white/20 border-white/40">
                                                            Remover
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                            <p className="mt-3 text-xs text-brand-inactive-text dark:text-dark-body">Tamanho recomendado: 1400x300px. Máximo 3MB.</p>
                                            <input ref={bannerInputRef} type="file" hidden accept="image/png, image/jpeg, image/webp, image/avif" onChange={handleBannerChange} />
                                        </FormSection>
                                    </div>

                                    <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 border-l-0 lg:border-l border-brand-border dark:border-dark-border space-y-6">
                                        <SidebarCard hasSeparator hasTopStrip title="Logo / Imagem de Perfil">
                                            <div className="flex items-center gap-4 dark:bg-dark-background/50">
                                                <div onClick={() => fileInputRef.current?.click()} className="w-16 h-16 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border cursor-pointer relative group overflow-hidden">
                                                    {imagePreview ? (
                                                        <img src={imagePreview} alt="Logo" className="object-cover w-full h-full rounded-full" />
                                                    ) : (
                                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 w-5 h-5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                                                    )}
                                                    {imageUploading && (
                                                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                                            <Spinner size={20} className="text-white" />
                                                        </div>
                                                    )}
                                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                                    </div>
                                                </div>
                                                <div className="flex-1">
                                                    <p className="text-sm font-semibold text-brand-dark dark:text-dark-heading">Logo / Perfil</p>
                                                    <p className="text-xs text-brand-inactive-text dark:text-dark-body">Máx 3MB (PNG, JPG, WEBP)</p>
                                                </div>
                                                {imagePreview && (
                                                    <Button
                                                        variant="ghostred"
                                                        size="icon"
                                                        className="w-8 h-8"
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            e.preventDefault()
                                                            handleRemoveImage()
                                                        }}
                                                    >
                                                        <TrashIcon size={14} />
                                                    </Button>
                                                )}
                                                <input ref={fileInputRef} type="file" hidden accept="image/png, image/jpeg, image/webp, image/avif" onChange={handleImageChange} />
                                            </div>
                                        </SidebarCard>
                                    </div>
                                </div>
                            </TabsContent>

                            <TabsContent value="address" className="mt-0 focus-visible:outline-none">
                                <div className="max-w-[700px] space-y-6">
                                    <FormSection title="Endereço de Localização">
                                        <div className="space-y-4">
                                            <CepInput
                                                value={address.zipCode}
                                                onChange={(val) => setAddress((p) => ({ ...p, zipCode: val }))}
                                                onAddressFetched={(addr) => {
                                                    setAddress((prev) => ({
                                                        ...prev,
                                                        city: addr.city || prev.city,
                                                        state: addr.state || prev.state,
                                                        neighborhood: addr.neighborhood || prev.neighborhood,
                                                        street: addr.street || prev.street,
                                                        ibge: addr.ibge || prev.ibge,
                                                        latitude: typeof addr.latitude === "number" ? addr.latitude : prev.latitude,
                                                        longitude: typeof addr.longitude === "number" ? addr.longitude : prev.longitude,
                                                    }))
                                                }}
                                            />
                                            <Input
                                                name="street"
                                                label="Rua / Logradouro"
                                                placeholder="Ex: Rua das Flores"
                                                value={address.street}
                                                onChange={(e) => setAddress((p) => ({ ...p, street: e.target.value }))}
                                            />
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <NumberInputWithCheckbox
                                                    label="Número"
                                                    placeholder="Ex: 123"
                                                    number={address.noNumber ? "" : address.number}
                                                    noNumber={address.noNumber}
                                                    onNumberChange={(val: string) => setAddress((p) => ({ ...p, number: val }))}
                                                    onNoNumberChange={(checked: boolean) => setAddress((p) => ({ ...p, noNumber: checked, number: checked ? "" : p.number }))}
                                                />
                                                <Input
                                                    name="complement"
                                                    label="Complemento"
                                                    placeholder="Ex: Apto 101, Sala 2"
                                                    value={address.complement}
                                                    onChange={(e) => setAddress((p) => ({ ...p, complement: e.target.value }))}
                                                />
                                            </div>
                                            <Input
                                                name="neighborhood"
                                                label="Bairro"
                                                placeholder="Ex: Centro"
                                                value={address.neighborhood}
                                                onChange={(e) => setAddress((p) => ({ ...p, neighborhood: e.target.value }))}
                                            />
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <Input
                                                    name="city"
                                                    label="Cidade"
                                                    placeholder="Ex: São Paulo"
                                                    value={address.city}
                                                    onChange={(e) => setAddress((p) => ({ ...p, city: e.target.value }))}
                                                    required
                                                />
                                                <StateComboBox
                                                    value={address.state}
                                                    onChange={(val) => setAddress((p) => ({ ...p, state: val }))}
                                                    className="w-full"
                                                />
                                            </div>
                                        </div>
                                    </FormSection>
                                </div>
                            </TabsContent>
                        </Tabs>
                    ) : (
                        <div className="grid grid-cols-12 gap-y-8 lg:gap-y-0 relative">
                            {/* Main Content (Left Column) */}
                            <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12 space-y-12">
                                {/* Status da Vitrine */}
                                <FormSection title="Status da Vitrine">
                                    <div className="grid gap-3">
                                        <ListItem
                                            title="Vitrine Ativa"
                                            description="Seu negócio está visível e apto a receber novos pedidos online."
                                            icon={<Store className="text-brand-green" />}
                                            onClick={() => setGeneralInfo({ ...generalInfo, isShowcaseActive: true })}
                                            right={<RadioButton name="isShowcaseActive" value="active" checked={generalInfo.isShowcaseActive} onChange={() => setGeneralInfo({ ...generalInfo, isShowcaseActive: true })} />}
                                            className="py-4 px-6 gap-4 cursor-pointer"
                                        />
                                        <ListItem
                                            title="Vitrine Inativa"
                                            description="Sua vitrine continua visível, mas não poderá receber pedidos temporariamente."
                                            icon={<Store className="text-brand-inactive-text" />}
                                            onClick={() => setGeneralInfo({ ...generalInfo, isShowcaseActive: false })}
                                            right={<RadioButton name="isShowcaseActive" value="inactive" checked={!generalInfo.isShowcaseActive} onChange={() => setGeneralInfo({ ...generalInfo, isShowcaseActive: false })} />}
                                            className="py-4 px-6 gap-4 cursor-pointer"
                                        />
                                    </div>
                                </FormSection>

                                {/* Pedidos fora do horário de funcionamento */}
                                <FormSection hasSeparator title="Pedidos fora do horário de funcionamento">
                                    <div className="grid gap-3">
                                        <ListItem
                                            title="Receber pedidos normalmente"
                                            description="Clientes podem fazer pedidos mesmo quando a loja estiver fora do horário de funcionamento."
                                            icon={<ClockIcon className="text-brand-green" size={20} />}
                                            onClick={() => setGeneralInfo({ ...generalInfo, acceptOrdersWhenClosed: true })}
                                            right={
                                                <RadioButton
                                                    name="acceptOrdersWhenClosed"
                                                    value="allow"
                                                    checked={generalInfo.acceptOrdersWhenClosed}
                                                    onChange={() => setGeneralInfo({ ...generalInfo, acceptOrdersWhenClosed: true })}
                                                />
                                            }
                                            className="py-4 px-6 gap-4 cursor-pointer"
                                        />
                                        <ListItem
                                            title="Bloquear pedidos com loja fechada"
                                            description="A vitrine não permitirá a realização de novos pedidos enquanto a loja estiver fora do horário de funcionamento."
                                            icon={<ClockIcon className="text-brand-inactive-text" size={20} />}
                                            onClick={() => setGeneralInfo({ ...generalInfo, acceptOrdersWhenClosed: false })}
                                            right={
                                                <RadioButton
                                                    name="acceptOrdersWhenClosed"
                                                    value="block"
                                                    checked={!generalInfo.acceptOrdersWhenClosed}
                                                    onChange={() => setGeneralInfo({ ...generalInfo, acceptOrdersWhenClosed: false })}
                                                />
                                            }
                                            className="py-4 px-6 gap-4 cursor-pointer"
                                        />
                                    </div>
                                </FormSection>

                                {/* Fluxo operacional dos pedidos */}
                                <FormSection hasSeparator title="Fluxo operacional dos pedidos">
                                    <div className="grid gap-3">
                                        <ListItem
                                            title="Gerenciar tudo na Dudit"
                                            description="Os clientes finalizam a compra pelo checkout da Dudit e você gerencia os pedidos e pagamentos pelo painel."
                                            icon={<MonitorIcon className="text-brand-green" size={20} />}
                                            onClick={() => setGeneralInfo({ ...generalInfo, orderFlow: "dudit" })}
                                            right={
                                                <RadioButton
                                                    name="orderFlow"
                                                    value="dudit"
                                                    checked={generalInfo.orderFlow === "dudit"}
                                                    onChange={() => setGeneralInfo({ ...generalInfo, orderFlow: "dudit" })}
                                                />
                                            }
                                            className="py-4 px-6 gap-4 cursor-pointer"
                                        />
                                        <ListItem
                                            title="Receber apenas pelo WhatsApp"
                                            description="Ao finalizar o pedido, o cliente é redirecionado para o seu WhatsApp com a mensagem do pedido já estruturada."
                                            icon={<WhatsappIcon className="text-brand-green" size={20} />}
                                            onClick={() => setGeneralInfo({ ...generalInfo, orderFlow: "whatsapp" })}
                                            right={
                                                <RadioButton
                                                    name="orderFlow"
                                                    value="whatsapp"
                                                    checked={generalInfo.orderFlow === "whatsapp"}
                                                    onChange={() => setGeneralInfo({ ...generalInfo, orderFlow: "whatsapp" })}
                                                />
                                            }
                                            className="py-4 px-6 gap-4 cursor-pointer"
                                        />
                                    </div>
                                </FormSection>

                                {/* Banner da Vitrine */}
                                <FormSection hasSeparator title="Banner da Vitrine">
                                    <div className="relative group overflow-hidden rounded-2xl border border-brand-border dark:border-dark-border aspect-[1400/300] bg-brand-gray dark:bg-dark-background flex items-center justify-center">
                                        {bannerPreview ? (
                                            <img src={bannerPreview} alt="Banner" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex flex-col items-center justify-center text-brand-inactive-text">
                                                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-2 opacity-40"><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></svg>
                                                <span className="text-sm font-medium">Nenhum banner configurado</span>
                                            </div>
                                        )}

                                        {bannerUploading && (
                                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-20">
                                                <Spinner size={32} className="text-white" />
                                            </div>
                                        )}

                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center gap-3 opacity-0 group-hover:opacity-100 z-10">
                                            <Button variant="filled" onClick={() => bannerInputRef.current?.click()} className="bg-white text-brand-dark hover:bg-gray-100 border-none">
                                                Trocar Banner
                                            </Button>
                                            {bannerPreview && !bannerPreview.includes('default/') && (
                                                <Button variant="outline" onClick={handleRemoveBanner} className="bg-white/10 text-white hover:bg-white/20 border-white/40">
                                                    Remover
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                    <p className="mt-3 text-xs text-brand-inactive-text dark:text-dark-body">Tamanho recomendado: 1400x300px. Máximo 3MB.</p>
                                    <input ref={bannerInputRef} type="file" hidden accept="image/png, image/jpeg, image/webp, image/avif" onChange={handleBannerChange} />
                                </FormSection>

                                {/* Galeria de Fotos */}
                                <FormSection hasSeparator title="Galeria de Fotos">
                                    <p className="text-sm font-medium text-brand-inactive-text dark:text-dark-body mb-4">
                                        Adicione fotos do seu estabelecimento, equipe ou produtos (Limite do plano: {limit} foto(s)).
                                    </p>
                                    <ProductImagesSection
                                        images={generalInfo.gallery as string[]}
                                        onImageUpload={handleGalleryImageUpload}
                                        onRemoveImage={handleRemoveGalleryImage}
                                        onSetPrimaryImage={handleSetPrimaryGalleryImage}
                                        isEditing={true}
                                        moderationStatus="approved"
                                    />
                                </FormSection>
                            </div>

                            {/* Sidebar (Right Column) */}
                            <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 border-l-0 lg:border-l border-brand-border dark:border-dark-border space-y-6">
                                {/* Logo do Negócio */}
                                <SidebarCard hasSeparator hasTopStrip title="Logo do Negócio">
                                    <div className="flex items-center gap-4 dark:bg-dark-background/50">
                                        <div onClick={() => fileInputRef.current?.click()} className="w-16 h-16 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border cursor-pointer relative group overflow-hidden">
                                            {imagePreview ? (
                                                <img src={imagePreview} alt="Logo" className="object-cover w-full h-full rounded-full" />
                                            ) : (
                                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 w-5 h-5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                                            )}
                                            {imageUploading && (
                                                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                                    <Spinner size={20} className="text-white" />
                                                </div>
                                            )}
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                            </div>
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-sm font-semibold text-brand-dark dark:text-dark-heading">Logo</p>
                                            <p className="text-xs text-brand-inactive-text dark:text-dark-body">Máx 3MB (PNG, JPG, WEBP)</p>
                                        </div>
                                        {imagePreview && (
                                            <Button
                                                variant="ghostred"
                                                size="icon"
                                                className="w-8 h-8"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    e.preventDefault()
                                                    handleRemoveImage()
                                                }}
                                            >
                                                <TrashIcon size={14} />
                                            </Button>
                                        )}
                                        <input ref={fileInputRef} type="file" hidden accept="image/png, image/jpeg, image/webp, image/avif" onChange={handleImageChange} />
                                    </div>
                                </SidebarCard>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Mobile Bottom Action Bar */}
            <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 flex gap-3">
                <Button
                    onClick={handleSubmit}
                    className="flex-1 h-12"
                    disabled={isLoading}
                    isLoading={isLoading}
                    leftIcon={<SaveIcon size={18} />}
                >
                    Salvar
                </Button>
            </div>

            <SavingStatusModal isOpen={isLoading} text="Salvando configurações da vitrine..." />

            {
                showConfirmDialog && (
                    <AlertModal
                        isOpen={showConfirmDialog}
                        onClose={cancelNavigation}
                        onConfirm={confirmNavigation}
                        title="Sair sem salvar?"
                        description="Você tem alterações na vitrine que ainda não foram salvas."
                        confirmText="Sair sem salvar"
                        cancelText="Continuar editando"
                        variant="warning"
                    />
                )
            }

            <ImageCropperModal
                isOpen={cropModalOpen}
                onClose={() => setCropModalOpen(false)}
                imageFile={tempImageFile}
                onCropComplete={handleCropComplete}
            />

            <ImageCropperModal
                isOpen={bannerCropModalOpen}
                onClose={() => setBannerCropModalOpen(false)}
                imageFile={tempBannerFile}
                onCropComplete={handleBannerCropComplete}
                aspectRatio={1400 / 300}
            />

            <ImageCropperModal
                isOpen={galleryCropModalOpen}
                onClose={() => {
                    setGalleryCropModalOpen(false)
                    setTempGalleryImageFile(null)
                }}
                imageFile={tempGalleryImageFile}
                onCropComplete={handleGalleryCropComplete}
                aspectRatio={1}
            />
        </FadeIn >
    )
}

