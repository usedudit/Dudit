"use client"

import React, { useState, useEffect, useRef, useCallback } from "react"
import {
    ChevronLeftIcon,
    CheckCircleIcon,
    CancelCircleIcon,
    TrashIcon,
    EditIcon,
    InfoIcon,
    StoreIcon,
    UserIcon,
    ClockIcon,
} from "@/lib/icons"
import {
    Button,
    Badge,
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
    FormSection,
    Input,
    ActionsDropdown,
    DropdownItem,
} from "@/components/reusable"
import { FadeIn } from "@/components/animations/FadeIn"
import { formatCurrency, formatDate } from "@/lib/utils"
import { formatBrazilPhone } from "@/lib/utils/phone-utils"
import DefaultModal from "@/components/reusable/DefaultModal"
import { useSidebar } from "@/lib/sidebar-context"
import { toast } from "@/hooks/use-notification"
import {
    approveModeration,
    rejectFlaggedImages,
    rejectModeration,
} from "@/app/actions/admin/moderation"
import { removeImage } from "@/app/actions/admin/moderation-v2"
import type { ModerationItem } from "@/lib/admin/types"
import { useTransition } from "react"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"

const getStatusMeta = (status: string) => {
    switch (status) {
        case "pending_moderation":
            return { label: "Pendente", variant: "orange" as const }
        case "flagged":
            return { label: "Flagged", variant: "red" as const }
        case "approved":
            return { label: "Aprovado", variant: "green" as const }
        case "rejected":
            return { label: "Rejeitado", variant: "red" as const }
        case "needs_images":
            return { label: "Sem imagens", variant: "blue" as const }
        default:
            return { label: status, variant: "gray" as const }
    }
}

const getTypeLabel = (type: string) => {
    if (type === "product") return "Produto"
    if (type === "service") return "Serviço"
    if (type === "partner") return "Perfil"
    if (type === "community_video") return "Vídeo"
    return "Item"
}

interface AdminModerationDetailViewProps {
    item: ModerationItem
    onBack: () => void
}

export default function AdminModerationDetailView({ item, onBack }: AdminModerationDetailViewProps) {
    const [activeTab, setActiveTab] = useState("general")
    const [isScrolled, setIsScrolled] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)
    const [isPending, startTransition] = useTransition()

    // Modals
    const [showApproveModal, setShowApproveModal] = useState(false)
    const [showRejectImagesModal, setShowRejectImagesModal] = useState(false)
    const [showFullRejectModal, setShowFullRejectModal] = useState(false)
    const [rejectReason, setRejectReason] = useState("")
    const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set())
    const [removedImages, setRemovedImages] = useState<Set<string>>(new Set())

    // Lightbox
    const [showLightbox, setShowLightbox] = useState(false)
    const [lightboxIndex, setLightboxIndex] = useState(0)

    // Header override for mobile back button
    let sidebarContext: ReturnType<typeof useSidebar> | null = null
    try {
        sidebarContext = useSidebar()
    } catch { }

    const setHeaderOverride = sidebarContext?.setHeaderOverride

    const handleScroll = useCallback(() => {
        setIsScrolled((scrollRef.current?.scrollTop || 0) > 20)
    }, [])

    const statusMeta = getStatusMeta(item.moderation_status)
    const typeLabel = getTypeLabel(item.type)

    useEffect(() => {
        if (!setHeaderOverride) return
        setHeaderOverride({
            title: `${typeLabel} #${item.id.slice(0, 8)}`,
            onBack,
            isSubPage: true,
        })
        return () => setHeaderOverride(null)
    }, [item.id, typeLabel, onBack, setHeaderOverride])

    const handleRemoveImage = (url: string) => {
        startTransition(async () => {
            const itemType = item.type === "service" ? "service" : "product"
            const result = await removeImage("product", item.id, url, "images", 0, undefined, item.partner_id)
            const r = result || { success: false, error: "" }
            if (r.success) {
                toast.success("Imagem removida!")
                setRemovedImages(prev => new Set(prev).add(url))
                setSelectedImages(prev => {
                    const next = new Set(prev)
                    next.delete(url)
                    return next
                })
            } else {
                toast.error(r.error || "Erro ao remover imagem")
            }
        })
    }

    const allImages = (item.images || []).map(url => getR2ImageUrl(url))

    const toggleImage = (url: string) => {
        setSelectedImages(prev => {
            const next = new Set(prev)
            if (next.has(url)) next.delete(url)
            else next.add(url)
            return next
        })
    }

    const openLightbox = (index: number = 0) => {
        setLightboxIndex(index)
        setShowLightbox(true)
    }

    const handleApprove = () => {
        startTransition(async () => {
            const result = await approveModeration(item.id, item.type as any)
            if (result.success) {
                toast.success(`${typeLabel} aprovado com sucesso!`)
                onBack()
            } else {
                toast.error(result.error || `Erro ao aprovar ${typeLabel.toLowerCase()}`)
            }
        })
    }

    const handleRejectImages = () => {
        startTransition(async () => {
            const itemType = item.type === "service" ? "service" : "product"
            const result = await rejectFlaggedImages(item.id, rejectReason, [...selectedImages], itemType as "product" | "service")
            if (result.success) {
                toast.success("Imagens removidas com sucesso!")
                onBack()
            } else {
                toast.error(result.error || "Erro ao remover imagens")
            }
        })
    }

    const handleFullReject = () => {
        startTransition(async () => {
            const result = await rejectModeration(item.id, rejectReason, item.type as any)
            if (result.success) {
                toast.success(`${typeLabel} rejeitado com sucesso!`)
                onBack()
            } else {
                toast.error(result.error || `Erro ao rejeitar ${typeLabel.toLowerCase()}`)
            }
        })
    }



    return (
        <>
            <FadeIn>
                <div className="flex flex-col bg-white dark:bg-dark-background min-h-screen">
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full w-full">
                        <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-20 md:pb-0">

                            {/* Sticky Header */}
                            <div className="sticky top-0 z-30 w-full max-w-[1300px] mx-auto bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out">
                                <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">

                                    {/* Back button - desktop only */}
                                    <div className={`absolute -left-12 top-7 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                                        <Button variant="filled" onClick={onBack} className="w-10 h-10 p-0 flex items-center justify-center">
                                            <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                        </Button>
                                    </div>

                                    {/* Title row - desktop */}
                                    <div className="hidden md:flex items-start justify-between md:py-0 md:mb-0">
                                        <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                            <h1 className={`font-bold transition-all duration-500 ease-in-out flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                                <span className="hidden md:inline truncate">{typeLabel} #{item.id.slice(0, 8)}</span>
                                                <Badge variant={statusMeta.variant}>
                                                    {statusMeta.label}
                                                </Badge>
                                                {item.price > 0 && (
                                                    <Badge variant="blue">
                                                        {formatCurrency(item.price)}
                                                    </Badge>
                                                )}
                                            </h1>

                                            <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                                {item.title} • Criado em {formatDate(item.created_at)}
                                            </div>
                                        </div>
                                </div>

                                    {/* Title row - mobile */}
                                    <div className="md:hidden flex items-center justify-between gap-3 py-3">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <Button variant="filled" onClick={onBack} className="w-9 h-9 p-0 flex items-center justify-center shrink-0">
                                                <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                            </Button>
                                            <div className="flex flex-col gap-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <h1 className="text-lg font-bold text-brand-dark dark:text-dark-heading truncate">
                                                        {typeLabel} #{item.id.slice(0, 8)}
                                                    </h1>
                                                    <Badge variant={statusMeta.variant}>
                                                        {statusMeta.label}
                                                    </Badge>
                                                </div>
                                                <span className="text-xs text-brand-inactive-text truncate">
                                                    {item.title}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Tabs */}
                                    <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                                        <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                            <TabsTrigger value="general">Geral</TabsTrigger>
                                            <TabsTrigger value="store">Loja & Proprietário</TabsTrigger>
                                            <TabsTrigger value="images">Imagens ({item.images?.length || 0})</TabsTrigger>
                                            <TabsTrigger value="actions">Ações</TabsTrigger>
                                        </TabsList>
                                    </div>
                                </div>
                            </div>

                            {/* Content */}
                            <div className="px-3 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
                                <Tabs value={activeTab} onValueChange={setActiveTab}>
                                    {/* General Tab */}
                                    <TabsContent value="general" className="mt-0">
                                        <FadeIn key="general">
                                            <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
                                                {/* Main Column */}
                                                <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12">
                                                    <FormSection title="Informações do Item" hasSeparator>
                                                        <div className="space-y-4">
                                                            <div>
                                                                <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading leading-tight">
                                                                    {item.title}
                                                                </h3>
                                                                <div className="flex items-center gap-3 mt-2 flex-wrap">
                                                                    <Badge variant={statusMeta.variant}>
                                                                        {statusMeta.label}
                                                                    </Badge>
                                                                    {item.price > 0 && (
                                                                        <span className="text-[15px] font-bold text-brand-dark dark:text-dark-heading">
                                                                            {formatCurrency(item.price)}
                                                                        </span>
                                                                    )}
                                                                    {item.category_name && (
                                                                        <span className="px-3 py-1 bg-brand-gray dark:bg-dark-border rounded-lg text-sm font-medium text-brand-dark dark:text-dark-heading">
                                                                            {item.category_name}
                                                                        </span>
                                                                    )}
                                                                    {item.brand_name && (
                                                                        <span className="px-3 py-1 bg-brand-green/10 dark:bg-brand-green/20 text-brand-green dark:text-brand-green/80 rounded-lg text-sm font-medium">
                                                                            {item.brand_name}
                                                                        </span>
                                                                    )}
                                                                    {item.video_url && (
                                                                        <span className="px-3 py-1 bg-brand-blue/10 dark:bg-brand-blue/20 text-brand-blue dark:text-brand-blue/80 rounded-lg text-sm font-medium flex items-center gap-1">
                                                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                                                <polygon points="23 7 16 12 23 17 23 7" />
                                                                                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                                                                            </svg>
                                                                            Vídeo
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {/* Video Player */}
                                                            {item.video_url && item.video_type && (
                                                                <div className="space-y-2">
                                                                    <h4 className="text-[13px] font-bold text-brand-inactive-text dark:text-dark-body">Vídeo</h4>
                                                                    <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-black/10 dark:bg-black/30 border border-brand-border dark:border-dark-border">
                                                                        {item.video_type === "youtube" && (
                                                                            <iframe
                                                                                src={`https://www.youtube.com/embed/${item.video_url.split("v=")[1]?.split("&")[0]}`}
                                                                                title="Vídeo do produto"
                                                                                className="w-full h-full"
                                                                                frameBorder="0"
                                                                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                                                                allowFullScreen
                                                                            />
                                                                        )}
                                                                        {item.video_type === "vimeo" && (
                                                                            <iframe
                                                                                src={`https://player.vimeo.com/video/${item.video_url.split("/").pop()}`}
                                                                                title="Vídeo do produto"
                                                                                className="w-full h-full"
                                                                                frameBorder="0"
                                                                                allow="autoplay; fullscreen; picture-in-picture"
                                                                                allowFullScreen
                                                                            />
                                                                        )}
                                                                        {item.video_type === "upload" && item.video_url && (
                                                                            <video
                                                                            src={item.video_url.startsWith("http") ? item.video_url : getR2ImageUrl(item.video_url)}
                                                                             controls
                                                                             className="w-full h-full"
                                                                             poster={item.video_thumbnail ? (item.video_thumbnail.startsWith("http") ? item.video_thumbnail : getR2ImageUrl(item.video_thumbnail)) : undefined}
                                                                            />
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {/* Description */}
                                                            <div>
                                                                <h4 className="text-[13px] font-bold text-brand-inactive-text dark:text-dark-body mb-2">Descrição</h4>
                                                                <p className="text-sm text-brand-dark dark:text-dark-heading whitespace-pre-wrap leading-relaxed">
                                                                    {item.description || "Sem descrição disponível."}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </FormSection>
                                                </div>

                                                {/* Sidebar */}
                                                <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 border-0 xl:border-l border-brand-border dark:border-dark-border">
                                                    {/* Store Card */}
                                                    <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden mb-6 transition-colors">
                                                        <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border rounded-t-2xl"></div>
                                                        <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-4">
                                                            Informações da Loja
                                                        </h3>
                                                        <div className="space-y-3">
                                                            <div className="flex items-center justify-between">
                                                                <div className="flex items-center gap-2">
                                                                    <StoreIcon size={16} className="text-brand-inactive-text" />
                                                                    <span className="font-bold text-[14px] text-brand-dark dark:text-dark-heading truncate">{item.store_name || item.owner_store_name}</span>
                                                                </div>
                                                                {item.risk_score > 0 && (
                                                                    <Badge variant={item.risk_score >= 50 ? "red" : item.risk_score >= 20 ? "orange" : "blue"}>
                                                                        Risk: {item.risk_score}
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                            {item.store_phone && (
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-sm text-brand-inactive-text dark:text-dark-body">{formatBrazilPhone(item.store_phone || "")}</span>
                                                                </div>
                                                            )}
                                                            {item.store_description && (
                                                                <p className="text-sm text-brand-dark dark:text-dark-heading whitespace-pre-wrap leading-relaxed">
                                                                    {item.store_description}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Owner Card */}
                                                    <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden mb-6 transition-colors">
                                                        <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border rounded-t-2xl"></div>
                                                        <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-4">
                                                            Proprietário
                                                        </h3>
                                                        <div className="space-y-3">
                                                            <div className="flex items-center gap-2">
                                                                <UserIcon size={14} className="text-brand-inactive-text" />
                                                                <span className="text-sm text-brand-inactive-text truncate">
                                                                    <strong>{item.owner_user_name || "N/A"}</strong>
                                                                </span>
                                                            </div>
                                                            {item.owner_user_id && (
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-[10px] font-mono text-brand-inactive-text opacity-70 break-all">{item.owner_user_id}</span>
                                                                </div>
                                                            )}
                                                            <div className="flex items-center gap-2 pt-2 border-t border-brand-border dark:border-dark-border">
                                                                <ClockIcon size={14} className="text-brand-inactive-text" />
                                                                <span className="text-xs text-brand-inactive-text truncate">Enviado em {formatDate(item.created_at)}</span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* ID Card */}
                                                    <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden transition-colors">
                                                        <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border rounded-t-2xl"></div>
                                                        <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-2">
                                                            ID do Item
                                                        </h3>
                                                        <p className="text-xs font-mono text-brand-inactive-text break-all">{item.id}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </FadeIn>
                                    </TabsContent>

                                    {/* Store Tab */}
                                    <TabsContent value="store" className="mt-0">
                                        <FadeIn key="store">
                                            <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
                                                <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12">
                                                    <FormSection title="Dados da Loja" hasSeparator>
                                                        <div className="space-y-4">
                                                            <div className="flex items-center gap-4">
                                                                <div className="w-16 h-16 rounded-xl bg-brand-gray dark:bg-dark-border/40 border border-brand-border dark:border-dark-border flex items-center justify-center overflow-hidden shrink-0">
                                                                    {item.store_logo_url ? (
                                                                        <img
                                                                        src={getR2ImageUrl(item.store_logo_url)}
                                                                        alt=""
                                                                            className="w-full h-full object-cover"
                                                                        />
                                                                    ) : (
                                                                        <StoreIcon className="w-6 h-6 text-brand-inactive-text" />
                                                                    )}
                                                                </div>
                                                                <div>
                                                                    <h3 className="font-bold text-lg text-brand-dark dark:text-dark-heading">
                                                                        {item.store_name || item.owner_store_name}
                                                                    </h3>
                                                                    <span className="text-xs text-brand-inactive-text">
                                                                        {item.store_id || item.partner_id}
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            {item.store_description && (
                                                                <div>
                                                                    <h4 className="text-[13px] font-bold text-brand-inactive-text dark:text-dark-body mb-2">Descrição da Loja</h4>
                                                                    <p className="text-sm text-brand-dark dark:text-dark-heading whitespace-pre-wrap leading-relaxed">
                                                                        {item.store_description}
                                                                    </p>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </FormSection>

                                                    {/* Banner */}
                                                    {item.store_banner_url && (
                                                        <FormSection title="Banner da Vitrine" hasSeparator>
                                                            <div className="relative w-full h-40 rounded-xl overflow-hidden bg-brand-gray dark:bg-dark-border/50 border border-brand-border dark:border-dark-border">
                                                                <img
                                                                    src={getR2ImageUrl(item.store_banner_url)}
                                                                    alt="Banner"
                                                                    className="w-full h-full object-cover"
                                                                />
                                                            </div>
                                                        </FormSection>
                                                    )}

                                                    {/* Gallery */}
                                                    {item.store_gallery && item.store_gallery.length > 0 && (
                                                        <FormSection title={`Galeria da Loja (${item.store_gallery.length})`}>
                                                            <div className="grid grid-cols-3 gap-3">
                                                                {item.store_gallery.map((url: string, idx: number) => (
                                                                    <div key={idx} className="relative aspect-square rounded-xl overflow-hidden bg-brand-gray dark:bg-dark-border/50 border border-brand-border dark:border-dark-border">
                                                                        <img
                                                                            src={getR2ImageUrl(url)}
                                                                            alt={`Galeria ${idx + 1}`}
                                                                            className="w-full h-full object-cover"
                                                                        />
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </FormSection>
                                                    )}
                                                </div>

                                                <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 border-0 xl:border-l border-brand-border dark:border-dark-border">
                                                    <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden mb-6 transition-colors">
                                                        <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border rounded-t-2xl"></div>
                                                        <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-4">
                                                            Proprietário
                                                        </h3>
                                                        <div className="space-y-3">
                                                            <div className="flex items-center gap-2">
                                                                <UserIcon size={14} className="text-brand-inactive-text" />
                                                                <span className="text-sm text-brand-inactive-text">
                                                                    <strong>{item.owner_user_name || "N/A"}</strong>
                                                                </span>
                                                            </div>
                                                            {item.owner_user_id && (
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-[10px] font-mono text-brand-inactive-text opacity-70 break-all">{item.owner_user_id}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </FadeIn>
                                    </TabsContent>

                                    {/* Images Tab */}
                                    <TabsContent value="images" className="mt-0">
                                        <FadeIn key="images">
                                            <div className="space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">
                                                        Imagens do {typeLabel} ({item.images?.length || 0})
                                                    </h3>
                                                    {selectedImages.size > 0 && (
                                                        <span className="text-sm font-bold text-brand-red">{selectedImages.size} selecionada(s)</span>
                                                    )}
                                                </div>
                                                {item.images && item.images.length > 0 ? (
                                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                                        {item.images.map((url: string, idx: number) => {
                                                            const fullUrl = getR2ImageUrl(url)
                                                            const isSelected = selectedImages.has(url)
                                                            return (
                                                                <div
                                                                    key={idx}
                                                                    className={`relative group aspect-square rounded-xl overflow-hidden border-2 transition-all ${
                                                                        isSelected ? "border-red-500 ring-2 ring-red-300" : "border-brand-border dark:border-dark-border hover:border-brand-green/50"
                                                                    }`}
                                                                    onClick={() => {
                                                                        if (isSelected) {
                                                                            toggleImage(url)
                                                                        } else {
                                                                            openLightbox(idx)
                                                                        }
                                                                    }}
                                                                >
                                                                    <img src={fullUrl} alt={`Imagem ${idx + 1}`} className="w-full h-full object-cover" loading="lazy" />
                                                                    {isSelected && (
                                                                        <div className="absolute inset-0 bg-red-500/30 flex items-center justify-center">
                                                                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                                                <line x1="18" y1="6" x2="6" y2="18" />
                                                                                <line x1="6" y1="6" x2="18" y2="18" />
                                                                            </svg>
                                                                        </div>
                                                                    )}
                                                                    {!isSelected && (
                                                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                                                                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white opacity-0 group-hover:opacity-100 transition-opacity">
                                                                                <circle cx="12" cy="12" r="10" />
                                                                                <path d="M12 8v4M12 16h.01" />
                                                                            </svg>
                                                                        </div>
                                                                    )}
                                                                    <div className="absolute bottom-2 right-2">
                                                                        <span className="text-xs bg-black/70 text-white px-2 py-1 rounded">
                                                                            {idx + 1} / {item.images.length}
                                                                        </span>
                                                                    </div>
                                                                    {(item.type === "product" || item.type === "service") && (
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation()
                                                                                handleRemoveImage(url)
                                                                            }}
                                                                            className="absolute top-1 left-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-600 transition-all"
                                                                            aria-label="Remover imagem"
                                                                        >
                                                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                                                                <line x1="18" y1="6" x2="6" y2="18" />
                                                                                <line x1="6" y1="6" x2="18" y2="18" />
                                                                            </svg>
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                ) : (
                                                    <div className="flex flex-col items-center justify-center p-12 bg-brand-gray dark:bg-dark-border/30 rounded-2xl border border-dashed border-brand-border dark:border-dark-border text-brand-inactive-text">
                                                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-3 opacity-30">
                                                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                                            <circle cx="8.5" cy="8.5" r="1.5" />
                                                            <polyline points="21 15 16 10 5 21" />
                                                        </svg>
                                                        <span className="text-sm font-medium">Nenhuma imagem enviada</span>
                                                    </div>
                                                )}
                                            </div>
                                        </FadeIn>
                                    </TabsContent>

                                    {/* Actions Tab */}
                                    <TabsContent value="actions" className="mt-0">
                                        <FadeIn key="actions">
                                            <div className="max-w-xl">
                                                {item.moderation_status !== "approved" ? (
                                                    <FormSection title="Ações de Moderação" hasSeparator>
                                                        <div className="space-y-4">
                                                            <Button
                                                                variant="filled"
                                                                className="w-full rounded-full h-12 text-[15px] font-bold"
                                                                onClick={() => setShowApproveModal(true)}
                                                                disabled={isPending}
                                                                leftIcon={<CheckCircleIcon size={20} />}
                                                            >
                                                                Aprovar {typeLabel}
                                                            </Button>

                                                        {(item.type === "product" || item.type === "service") && (
                                                            <Button
                                                                variant="outline"
                                                                className="w-full rounded-full h-11 text-[14px] font-medium"
                                                                onClick={() => {
                                                                    if (item.type === "product") {
                                                                        window.open(`/erp/produtos/${item.id}`, "_blank")
                                                                    } else {
                                                                        window.open(`/erp/servicos?edit=${item.id}`, "_blank")
                                                                    }
                                                                }}
                                                                leftIcon={<EditIcon size={18} />}
                                                            >
                                                                Editar {typeLabel} no ERP
                                                            </Button>
                                                        )}

                                                            <div className="flex gap-3">
                                                                {selectedImages.size > 0 && (item.type === "product" || item.type === "service") && (
                                                                    <Button
                                                                        variant="outline"
                                                                        className="flex-1 rounded-full h-12 text-amber-600 border-amber-200 hover:bg-amber-50"
                                                                        onClick={() => setShowRejectImagesModal(true)}
                                                                        disabled={isPending}
                                                                        leftIcon={<CancelCircleIcon size={20} />}
                                                                    >
                                                                        Remover Imagens
                                                                    </Button>
                                                                )}
                                                                <Button
                                                                    variant="outline"
                                                                    className="flex-1 rounded-full h-12 text-brand-red border-red-200 hover:bg-red-50"
                                                                    onClick={() => setShowFullRejectModal(true)}
                                                                    disabled={isPending}
                                                                    leftIcon={<TrashIcon size={20} />}
                                                                >
                                                                    Rejeitar Tudo
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    </FormSection>
                                                ) : (
                                                    <FormSection title="Status" hasSeparator>
                                                        <div className="flex flex-col items-center text-center gap-4 py-8">
                                                            <div className="w-16 h-16 rounded-full bg-brand-green/10 flex items-center justify-center text-brand-green">
                                                                <CheckCircleIcon size={32} />
                                                            </div>
                                                            <div>
                                                                <p className="text-brand-dark dark:text-dark-heading font-bold text-lg">{typeLabel} aprovado</p>
                                                                <p className="text-brand-inactive-text dark:text-dark-body text-sm mt-1">
                                                                    Este item já foi aprovado e está visível no marketplace.
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </FormSection>
                                                )}
                                            </div>
                                        </FadeIn>
                                    </TabsContent>
                                </Tabs>
                            </div>
                        </div>
                    </Tabs>
                </div>
            </FadeIn>

            {/* Approve Modal */}
            <DefaultModal
                isOpen={showApproveModal}
                onClose={() => setShowApproveModal(false)}
                title={`Aprovar ${typeLabel}`}
                maxWidth="sm"
                footer={
                    <>
                        <Button variant="outline" onClick={() => setShowApproveModal(false)} disabled={isPending}>Cancelar</Button>
                        <Button onClick={handleApprove} isLoading={isPending}>Confirmar Aprovação</Button>
                    </>
                }
            >
                <div className="flex flex-col items-center text-center gap-4 py-4">
                    <div className="w-16 h-16 rounded-full bg-brand-green/10 flex items-center justify-center text-brand-green">
                        <CheckCircleIcon size={32} />
                    </div>
                    <div>
                        <p className="text-brand-dark dark:text-dark-heading font-bold text-lg">Confirmar aprovação?</p>
                        <p className="text-brand-inactive-text dark:text-dark-body text-sm mt-1">
                            {item.type === "product"
                                ? `O produto "${item.title}" ficará visível imediatamente.`
                                : `O serviço "${item.title}" ficará visível imediatamente.`}
                        </p>
                    </div>
                </div>
            </DefaultModal>

            {/* Reject Images Modal */}
            <DefaultModal
                isOpen={showRejectImagesModal}
                onClose={() => { setShowRejectImagesModal(false); setRejectReason("") }}
                title="Remover Imagens"
                maxWidth="md"
                footer={
                    <>
                        <Button variant="outline" onClick={() => { setShowRejectImagesModal(false); setRejectReason("") }} disabled={isPending}>Cancelar</Button>
                        <Button
                            variant="destructive"
                            disabled={!rejectReason.trim() || rejectReason.trim().length < 5 || isPending}
                            onClick={handleRejectImages}
                            isLoading={isPending}
                        >
                            Confirmar Remoção
                        </Button>
                    </>
                }
            >
                <div className="flex flex-col gap-4">
                    <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl text-amber-700 dark:text-amber-400">
                        <InfoIcon size={20} className="shrink-0 mt-0.5" />
                        <p className="text-sm font-medium">{selectedImages.size} imagem(ns) serão removidas. O parceiro será notificado para substituí-las.</p>
                    </div>
                    <Input
                        name="reject-images-reason"
                        label="Motivo da remoção"
                        placeholder="Explique ao parceiro por que as imagens foram removidas..."
                        value={rejectReason}
                        onChange={e => setRejectReason(e.target.value)}
                        multiline
                        rows={3}
                        required
                    />
                </div>
            </DefaultModal>

            {/* Full Reject Modal */}
            <DefaultModal
                isOpen={showFullRejectModal}
                onClose={() => { setShowFullRejectModal(false); setRejectReason("") }}
                title={`Rejeitar ${typeLabel}`}
                maxWidth="md"
                footer={
                    <>
                        <Button variant="outline" onClick={() => { setShowFullRejectModal(false); setRejectReason("") }} disabled={isPending}>Cancelar</Button>
                        <Button
                            variant="destructive"
                            disabled={!rejectReason.trim() || rejectReason.trim().length < 5 || isPending}
                            onClick={handleFullReject}
                            isLoading={isPending}
                        >
                            Confirmar Rejeição
                        </Button>
                    </>
                }
            >
                <div className="flex flex-col gap-4">
                    <p className="text-sm text-brand-inactive-text dark:text-dark-body">O item será removido da fila e o parceiro receberá o motivo da rejeição.</p>
                    <Input
                        name="full-reject-reason"
                        label="Motivo da rejeição"
                        placeholder="Explique detalhadamente o motivo da rejeição..."
                        value={rejectReason}
                        onChange={e => setRejectReason(e.target.value)}
                        multiline
                        rows={3}
                        required
                    />
                </div>
            </DefaultModal>

            {/* Image Lightbox */}
            <ImageLightbox
                isOpen={showLightbox}
                onClose={() => setShowLightbox(false)}
                images={allImages}
                currentIndex={lightboxIndex}
                onNavigate={(dir) => setLightboxIndex(prev => (prev + dir + allImages.length) % allImages.length)}
            />
        </>
    )
}

function ImageLightbox({ isOpen, onClose, images, currentIndex, onNavigate }: {
    isOpen: boolean
    onClose: () => void
    images: string[]
    currentIndex: number
    onNavigate: (dir: 1 | -1) => void
}) {
    if (!isOpen || images.length === 0) return null

    const currentImage = images[currentIndex]

    return (
        <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center" onClick={onClose}>
            <div className="relative w-full h-full max-w-[90vw] max-h-[90vh] flex items-center justify-center">
                <img
                    src={currentImage}
                    alt={`Imagem ${currentIndex + 1} de ${images.length}`}
                    className="max-w-full max-h-full object-contain"
                />
                {images.length > 1 && (
                    <>
                        <button
                            onClick={(e) => { e.stopPropagation(); onNavigate(-1) }}
                            className="absolute left-4 text-white/80 hover:text-white transition-colors p-2 rounded-full bg-black/50"
                        >
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="15 18 9 12 15 6" />
                            </svg>
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); onNavigate(1) }}
                            className="absolute right-4 text-white/80 hover:text-white transition-colors p-2 rounded-full bg-black/50"
                        >
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="9 18 15 12 9 6" />
                            </svg>
                        </button>
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/70 text-sm">
                            {currentIndex + 1} / {images.length}
                        </div>
                    </>
                )}
                <button
                    onClick={(e) => { e.stopPropagation(); onClose() }}
                    className="absolute top-4 right-4 text-white/80 hover:text-white transition-colors p-2 rounded-full bg-black/50"
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                </button>
            </div>
        </div>
    )
}
