"use client"

import React, { useState, useCallback, useRef, useTransition, useMemo, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
    Button,
    RadioButton,
    ListItem,
    Spinner,
    AlertModal,
    SavingStatusModal,
} from "@/components/reusable"
import { updatePartnerAction } from "@/app/actions/marketplace/partners"
import { ChevronLeftIcon, SaveIcon, Store } from "@/lib/icons"
import { useNotification } from "@/hooks/use-notification"
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes"
import ImageCropperModal from "@/components/ImageCropperModal"
import { fetchWithCSRF } from "@/lib/utils/fetch-with-csrf"
import { FadeIn } from "@/components/animations/FadeIn"
import { getRandomDefaultBanner } from "@/lib/utils/banner"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"

export const ShowcaseSubPage = ({
    partner,
    onBack,
}: {
    partner: any
    onBack: () => void
}) => {
    const { success: notifySuccess, error: notifyError } = useNotification()
    const [isPending, startTransition] = useTransition()
    const [isLoading, setIsLoading] = useState(false)
    const [isScrolled, setIsScrolled] = useState(false)
    const scrollContainerRef = useRef<HTMLDivElement>(null)

    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
    }, [])

    const [generalInfo, setGeneralInfo] = useState({
        storeImageUrl: partner.store_image_url || "",
        bannerUrl: partner.banner_url || "",
        isShowcaseActive: partner.is_showcase_active ?? true,
    })

    const [initialState, setInitialState] = useState(() => ({
        generalInfo: { ...generalInfo },
    }))

    const isDirty = useMemo(() => {
        return JSON.stringify(initialState.generalInfo) !== JSON.stringify(generalInfo)
    }, [initialState, generalInfo])

    const { showConfirmDialog, confirmNavigation, cancelNavigation, handleNavigation } = useUnsavedChanges(isDirty)

    const handleBack = useCallback(() => {
        handleNavigation(onBack)
    }, [handleNavigation, onBack])

    const [imagePreview, setImagePreview] = useState<string | null>(partner.store_image_url ? getR2ImageUrl(partner.store_image_url) : null)
    const [cropModalOpen, setCropModalOpen] = useState(false)
    const [tempImageFile, setTempImageFile] = useState<File | null>(null)
    const [imageUploading, setImageUploading] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [bannerPreview, setBannerPreview] = useState<string | null>(partner.banner_url ? getR2ImageUrl(partner.banner_url) : null)
    const [bannerCropModalOpen, setBannerCropModalOpen] = useState(false)
    const [tempBannerFile, setTempBannerFile] = useState<File | null>(null)
    const [bannerUploading, setBannerUploading] = useState(false)
    const bannerInputRef = useRef<HTMLInputElement>(null)

    const handleSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault()

        setIsLoading(true)
        startTransition(async () => {
            let finalLogoUrl = generalInfo.storeImageUrl
            let finalBannerUrl = generalInfo.bannerUrl

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

            try {
                const result = await updatePartnerAction(partner.id, {
                    storeImageUrl: finalLogoUrl || null,
                    logoModerationStatus: (finalLogoUrl && finalLogoUrl !== partner.store_image_url) ? 'pending_moderation' : undefined,
                    bannerUrl: finalBannerUrl || null,
                    bannerModerationStatus: (finalBannerUrl && finalBannerUrl !== partner.banner_url) ? 'pending_moderation' : undefined,
                    isShowcaseActive: generalInfo.isShowcaseActive,
                    userId: partner.user_id,
                })

                if (result?.error) {
                    notifyError(result.error)
                    setIsLoading(false)
                } else {
                    notifySuccess("Configurações da vitrine atualizadas!")
                    setInitialState({
                        generalInfo: {
                            storeImageUrl: finalLogoUrl || "",
                            bannerUrl: finalBannerUrl || "",
                            isShowcaseActive: generalInfo.isShowcaseActive,
                        },
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

    const handleBannerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        e.currentTarget.value = ""
        if (!file) return
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
        <FadeIn>
            <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden transition-colors duration-500 ease-in-out">
                <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-24 md:pb-8 scroll-smooth no-scrollbar">

                    {/* Sticky Header */}
                    <div className="sticky top-0 z-30 w-full bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out">
                        <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 py-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Button variant="filled" onClick={handleBack} className="w-10 h-10 p-0 flex items-center justify-center">
                                    <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                </Button>
                                <div className="flex flex-col">
                                    <h1 className="font-bold text-brand-dark dark:text-dark-heading text-xl md:text-2xl flex items-center gap-3">
                                        Minha Vitrine
                                    </h1>
                                    <div className="hidden md:block text-brand-inactive-text dark:text-dark-body text-xs font-medium">
                                        Personalize a logo, banner e status de exibição da sua vitrine
                                    </div>
                                </div>
                            </div>

                            {/* Desktop action buttons */}
                            <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                                <Button variant="outline" onClick={handleBack} disabled={isLoading}>
                                    Cancelar
                                </Button>
                                <Button onClick={handleSubmit} disabled={isLoading}>
                                    <SaveIcon className="w-5 h-5 mr-2" />
                                    {isLoading ? "Salvando..." : "Salvar"}
                                </Button>
                            </div>
                        </div>
                    </div>

                    {/* Content Body */}
                    <div className="px-3 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
                        <div className="grid grid-cols-12 gap-6 lg:gap-8">
                            <div className="col-span-12 lg:col-span-8 space-y-8">
                                {/* Status da Vitrine */}
                                <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border">
                                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6">Status da Vitrine</h3>
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
                                </div>

                                {/* Banner da Vitrine */}
                                <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border">
                                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6">Banner da Vitrine</h3>
                                    <div className="relative group overflow-hidden rounded-2xl border border-brand-border dark:border-dark-border aspect-[1300/300] bg-brand-gray dark:bg-dark-background flex items-center justify-center">
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
                                    <p className="mt-3 text-xs text-brand-inactive-text dark:text-dark-body">Tamanho recomendado: 1300x300px. Máximo 3MB.</p>
                                    <input ref={bannerInputRef} type="file" hidden accept="image/*" onChange={handleBannerChange} />
                                </div>
                            </div>

                            <div className="col-span-12 lg:col-span-4">
                                {/* Logo do Negócio */}
                                <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border flex flex-col relative overflow-hidden">
                                    <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border rounded-t-2xl" />
                                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6 mt-2">Logo do Negócio</h3>

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
                                            <p className="text-sm font-semibold text-brand-dark dark:text-dark-heading">Logo da Empresa</p>
                                            <p className="text-xs text-brand-inactive-text dark:text-dark-body">Máx 3MB (PNG, JPG, WEBP)</p>
                                        </div>
                                        <input ref={fileInputRef} type="file" hidden accept="image/*" onChange={handleImageChange} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Mobile Bottom Action Bar */}
            <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 flex gap-3">
                <Button
                    variant="outline"
                    onClick={handleBack}
                    className="flex-1 h-[48px]"
                    disabled={isLoading}
                >
                    Cancelar
                </Button>
                <Button
                    onClick={handleSubmit}
                    className="flex-1 h-[48px]"
                    disabled={isLoading}
                    isLoading={isLoading}
                >
                    Salvar
                </Button>
            </div>

            <SavingStatusModal isOpen={isLoading} text="Salvando configurações da vitrine..." />

            {showConfirmDialog && (
                <AlertModal
                    isOpen={showConfirmDialog}
                    onClose={cancelNavigation}
                    onConfirm={confirmNavigation}
                    title="Descartar alterações?"
                    description="Existem dados não salvos neste formulário. Se sair agora, você perderá o que preencheu."
                    confirmText="Sair sem salvar"
                    variant="warning"
                />
            )}

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
                aspectRatio={1300 / 300}
            />
        </FadeIn>
    )
}
