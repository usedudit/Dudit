"use client"

import React, { useState, useEffect, useRef, useCallback, useTransition } from "react"
import {
    ChevronLeftIcon,
    CheckCircleIcon,
    TrashIcon,
    EditIcon,
    StoreIcon,
    UserIcon,
    ClockIcon,
    ThreeDotsIcon,
    XIcon,
} from "@/lib/icons"
import {
    Button,
    Badge,
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
    FormSection,
    ActionsDropdown,
    DropdownItem,
    SidebarCard,
} from "@/components/reusable"
import { FadeIn } from "@/components/animations/FadeIn"
import { formatCurrency, formatDate } from "@/lib/utils"
import { formatBrazilPhone } from "@/lib/utils/phone-utils"
import { useSidebar } from "@/lib/sidebar-context"
import { toast } from "@/hooks/use-notification"
import {
    approveModeration,
    rejectModeration,
    removeModerationImage,
    getAdminEntityTimeline,
} from "@/app/actions/admin/moderation"
import { useAdminActionModal } from "../AdminActionModal"
import { HistoryTimeline, type HistoryEntry } from "@/components/erp/shared/HistoryTimeline"
import type { ModerationItem } from "@/lib/admin/types"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import ProductImagesSection from "@/components/erp/product/ProductImagesSection"
import { AdminStoreCard } from "@/components/admin/AdminStoreCard"
import { useModalLayer } from "@/lib/modal-stack"

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

    // Admin Action Modal
    const { modal: actionModal, runAction } = useAdminActionModal()
    const [removedImages, setRemovedImages] = useState<Set<string>>(new Set())

    // Timeline entries
    const [timelineEntries, setTimelineEntries] = useState<HistoryEntry[]>([])
    const [isLoadingTimeline, setIsLoadingTimeline] = useState(false)

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

    const loadTimeline = useCallback(async () => {
        setIsLoadingTimeline(true)
        try {
            const res = await getAdminEntityTimeline(item.id, item.type as any)
            if (res.success && res.data) {
                setTimelineEntries(res.data)
            }
        } finally {
            setIsLoadingTimeline(false)
        }
    }, [item.id, item.type])

    useEffect(() => {
        if (activeTab === "timeline") {
            loadTimeline()
        }
    }, [activeTab, loadTimeline])

    useEffect(() => {
        if (!setHeaderOverride) return
        setHeaderOverride({
            title: `${typeLabel} #${item.id.slice(0, 8)}`,
            onBack,
            isSubPage: true,
        })
        return () => setHeaderOverride(null)
    }, [item.id, typeLabel, onBack, setHeaderOverride])

    // Filtered images (after removal)
    const visibleImages = (item.images || []).filter(url => !removedImages.has(url))
    const allImages = visibleImages.map(url => getR2ImageUrl(url))

    const openLightbox = (index: number = 0) => {
        setLightboxIndex(index)
        setShowLightbox(true)
    }

    const handleRemoveImageByIndex = async (index: number) => {
        const url = visibleImages[index]
        if (!url) return

        await runAction({
            title: "Remover imagem da moderação",
            description: `Deseja remover esta imagem do ${typeLabel.toLowerCase()} "${item.title}"?`,
            changedFields: ["1 imagem removida"],
            force: true,
            confirmLabel: "Remover Imagem",
            notifyLabel: "Enviar notificação ao vendedor pelo Dudit",
            runner: async (payload) => {
                const result = await removeModerationImage(item.id, url, item.type as any, {
                    reason: payload.reason || null,
                    riskScore: payload.riskScore,
                    notifySeller: payload.notifySeller,
                })
                if (result.success) {
                    toast.success("Imagem removida com sucesso!")
                    setRemovedImages(prev => new Set(prev).add(url))
                    if (visibleImages.length <= 1) {
                        setShowLightbox(false)
                    } else if (index >= visibleImages.length - 1) {
                        setLightboxIndex(Math.max(0, visibleImages.length - 2))
                    }
                    loadTimeline()
                    return { success: true }
                }
                return { success: false, error: result.error }
            },
        })
    }

    const handleApprove = async () => {
        await runAction({
            title: `Aprovar ${typeLabel}`,
            description: `Confirmar aprovação do ${typeLabel.toLowerCase()} "${item.title}"? O item ficará visível imediatamente na vitrine.`,
            changedFields: ["Status de moderação: Aprovado"],
            force: true,
            confirmLabel: "Aprovar",
            notifyLabel: "Enviar notificação ao vendedor pelo Dudit",
            runner: async (payload) => {
                const result = await approveModeration(item.id, item.type as any, {
                    reason: payload.reason || null,
                    riskScore: payload.riskScore,
                    notifySeller: payload.notifySeller,
                })
                if (result.success) {
                    toast.success(`${typeLabel} aprovado com sucesso!`)
                    onBack()
                    return { success: true }
                }
                return { success: false, error: result.error }
            },
        })
    }

    const handleFullReject = async () => {
        await runAction({
            title: `Rejeitar ${typeLabel}`,
            description: `Confirmar rejeição do ${typeLabel.toLowerCase()} "${item.title}"? O item não será exibido na vitrine e o vendedor receberá a notificação.`,
            changedFields: ["Status de moderação: Rejeitado"],
            requireReason: true,
            confirmLabel: "Rejeitar",
            notifyLabel: "Enviar notificação ao vendedor pelo Dudit",
            runner: async (payload) => {
                const result = await rejectModeration(item.id, payload.reason, item.type as any, {
                    reason: payload.reason,
                    riskScore: payload.riskScore,
                    notifySeller: payload.notifySeller,
                })
                if (result.success) {
                    toast.success(`${typeLabel} rejeitado com sucesso!`)
                    onBack()
                    return { success: true }
                }
                return { success: false, error: result.error }
            },
        })
    }



    return (
        <>
            <FadeIn>
                <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden">
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full w-full">
                        <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-20 md:pb-0">

                            {/* Sticky Header */}
                            <div className="sticky top-0 z-30 w-full max-w-[1300px] mx-auto bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out">
                                <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">

                                    {/* Back button - desktop only */}
                                    <div className={`absolute -left-12 top-7 h-full hidden lg:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                                        <Button variant="filled" onClick={onBack} className="w-10 h-10 p-0 flex items-center justify-center">
                                            <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                        </Button>
                                    </div>

                                    {/* Title row */}
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

                                    {/* Desktop action buttons */}
                                    <div className="hidden md:flex items-center gap-2 shrink-0 ml-3">
                                        {item.moderation_status !== "approved" && (
                                            <Button
                                                size="sm"
                                                onClick={handleApprove}
                                                className="bg-brand-green hover:bg-brand-green/90 text-white flex items-center gap-1.5 h-9 px-3 text-xs font-semibold"
                                            >
                                                <CheckCircleIcon size={14} /> Aprovar {typeLabel}
                                            </Button>
                                        )}
                                        <Button
                                            size="sm"
                                            variant="destructive"
                                            onClick={handleFullReject}
                                            className="flex items-center gap-1.5 h-9 px-3 text-xs font-semibold"
                                        >
                                            <TrashIcon size={14} /> Rejeitar {typeLabel}
                                        </Button>
                                        {(item.type === "product" || item.type === "service") && (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => {
                                                    if (item.type === "product") {
                                                        window.open(`/erp/produtos/${item.id}`, "_blank")
                                                    } else {
                                                        window.open(`/erp/servicos?edit=${item.id}`, "_blank")
                                                    }
                                                }}
                                                className="flex items-center gap-1.5 h-9 px-3 text-xs font-semibold"
                                            >
                                                <EditIcon size={14} /> Editar no ERP
                                            </Button>
                                        )}
                                    </div>

                                    {/* Tabs */}
                                    <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                                        <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                            <TabsTrigger value="general">Geral</TabsTrigger>
                                            <TabsTrigger value="store">Loja & Proprietário</TabsTrigger>
                                            <TabsTrigger value="images">Imagens ({visibleImages.length || 0})</TabsTrigger>
                                            <TabsTrigger value="timeline">Histórico</TabsTrigger>
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
                                                    <SidebarCard hasTopStrip hasSeparator title="Informações da Loja">
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
                                                    </SidebarCard>

                                                    {/* Owner Card */}
                                                    <SidebarCard hasTopStrip hasSeparator title="Proprietário">
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
                                                    </SidebarCard>

                                                    {/* ID Card */}
                                                    <SidebarCard hasTopStrip title="ID do Item">
                                                        <p className="text-xs font-mono text-brand-inactive-text break-all">{item.id}</p>
                                                    </SidebarCard>
                                                </div>
                                            </div>
                                        </FadeIn>
                                    </TabsContent>

                                    {/* Store Tab */}
                                    <TabsContent value="store" className="mt-0">
                                        <FadeIn key="store">
                                            <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
                                                <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12">
                                                    <AdminStoreCard
                                                        store={{
                                                            logo_url: item.store_logo_url,
                                                            name: item.store_name || item.owner_store_name,
                                                            id: item.store_id || item.partner_id,
                                                        }}
                                                        linkToPartner={false}
                                                    />

                                                    {item.store_description && (
                                                        <FormSection title="Descrição da Loja" hasSeparator>
                                                            <p className="text-sm text-brand-dark dark:text-dark-heading whitespace-pre-wrap leading-relaxed">
                                                                {item.store_description}
                                                            </p>
                                                        </FormSection>
                                                    )}

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
                                                    <SidebarCard hasTopStrip hasSeparator title="Proprietário">
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
                                                    </SidebarCard>
                                                </div>
                                            </div>
                                        </FadeIn>
                                    </TabsContent>

                                    {/* Images Tab */}
                                    <TabsContent value="images" className="mt-0">
                                        <FadeIn key="images">
                                            <div className="space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">
                                                            Imagens do {typeLabel} ({visibleImages.length})
                                                        </h3>
                                                        <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5">
                                                            Clique em qualquer imagem para inspecioná-la em tela cheia e moderar.
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {item.moderation_status !== "approved" && (
                                                            <Button
                                                                size="sm"
                                                                onClick={handleApprove}
                                                                className="bg-brand-green hover:bg-brand-green/90 text-white flex items-center gap-1.5 h-8 px-3 text-xs font-semibold"
                                                            >
                                                                <CheckCircleIcon size={14} /> Aprovar {typeLabel}
                                                            </Button>
                                                        )}
                                                        <Button
                                                            size="sm"
                                                            variant="destructive"
                                                            onClick={handleFullReject}
                                                            className="flex items-center gap-1.5 h-8 px-3 text-xs font-semibold"
                                                        >
                                                            <TrashIcon size={14} /> Rejeitar {typeLabel}
                                                        </Button>
                                                    </div>
                                                </div>
                                                <ProductImagesSection
                                                    images={visibleImages}
                                                    onImageUpload={() => { }}
                                                    onRemoveImage={handleRemoveImageByIndex}
                                                    onSetPrimaryImage={() => { }}
                                                    isEditing={true}
                                                    moderationStatus={item.moderation_status as any}
                                                    onImageClick={openLightbox}
                                                />
                                            </div>
                                        </FadeIn>
                                    </TabsContent>

                                    {/* Timeline Tab */}
                                    <TabsContent value="timeline" className="mt-0">
                                        <FadeIn key="timeline">
                                            <div className="max-w-[900px]">
                                                {isLoadingTimeline ? (
                                                    <div className="py-12 flex flex-col items-center justify-center text-sm text-brand-inactive-text gap-2">
                                                        <ClockIcon size={24} className="animate-spin text-brand-green" />
                                                        <span>Carregando histórico do item...</span>
                                                    </div>
                                                ) : (
                                                    <HistoryTimeline
                                                        entries={timelineEntries}
                                                        title="Histórico de Auditoria e Eventos"
                                                        emptyMessage="Este item ainda não possui eventos de auditoria."
                                                    />
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

            {/* Mobile Bottom Action Bar */}
            <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 flex gap-2">
                {item.moderation_status !== "approved" && (
                    <Button
                        onClick={handleApprove}
                        className="flex-1 bg-brand-green hover:bg-brand-green/90 text-white h-11 text-xs font-semibold flex items-center justify-center gap-1.5"
                    >
                        <CheckCircleIcon size={16} /> Aprovar
                    </Button>
                )}
                <Button
                    variant="destructive"
                    onClick={handleFullReject}
                    className="flex-1 h-11 text-xs font-semibold flex items-center justify-center gap-1.5"
                >
                    <TrashIcon size={16} /> Rejeitar
                </Button>
                {(item.type === "product" || item.type === "service") && (
                    <ActionsDropdown
                        trigger={
                            <Button variant="outline" className="w-11 h-11 p-0 flex items-center justify-center">
                                <ThreeDotsIcon size={18} className="text-brand-inactive-text" />
                            </Button>
                        }
                    >
                        <DropdownItem
                            onClick={() => {
                                if (item.type === "product") {
                                    window.open(`/erp/produtos/${item.id}`, "_blank")
                                } else {
                                    window.open(`/erp/servicos?edit=${item.id}`, "_blank")
                                }
                            }}
                        >
                            <EditIcon size={16} /> Editar no ERP
                        </DropdownItem>
                    </ActionsDropdown>
                )}
            </div>

            {/* Admin Action Modal (Salvar alterações, Aprovar, Rejeitar, Remover imagem) */}
            {actionModal}

            {/* Image Lightbox */}
            <ImageLightbox
                isOpen={showLightbox}
                onClose={() => setShowLightbox(false)}
                images={allImages}
                currentIndex={lightboxIndex}
                onNavigate={(dir) => setLightboxIndex(prev => (prev + dir + allImages.length) % allImages.length)}
                onRemoveImage={handleRemoveImageByIndex}
                onApprove={handleApprove}
                onReject={handleFullReject}
                typeLabel={typeLabel}
                isApproved={item.moderation_status === "approved"}
            />
        </>
    )
}

function ImageLightbox({
    isOpen,
    onClose,
    images,
    currentIndex,
    onNavigate,
    onRemoveImage,
    onApprove,
    onReject,
    typeLabel,
    isApproved,
}: {
    isOpen: boolean
    onClose: () => void
    images: string[]
    currentIndex: number
    onNavigate: (dir: 1 | -1) => void
    onRemoveImage: (index: number) => void
    onApprove: () => void
    onReject: () => void
    typeLabel: string
    isApproved: boolean
}) {
    // z-index dinâmico: o lightbox abre acima de tudo que já estava aberto.
    const zIndex = useModalLayer(isOpen)

    if (!isOpen || images.length === 0) return null

    const currentImage = images[currentIndex]

    return (
        <div
            className="fixed inset-0 bg-black/95 flex flex-col items-center justify-center select-none"
            style={{ zIndex }}
            onClick={onClose}
        >
            {/* Top Action Bar */}
            <div
                className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 md:px-6 py-3 bg-black/70 backdrop-blur-md border-b border-white/10"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center gap-3">
                    <span className="text-white font-medium text-xs md:text-sm bg-white/10 px-3 py-1 rounded-full">
                        Imagem {currentIndex + 1} de {images.length}
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => onRemoveImage(currentIndex)}
                        className="flex items-center gap-1.5 h-8 md:h-9 px-2.5 md:px-3 text-xs font-semibold"
                    >
                        <TrashIcon size={14} /> Remover esta imagem
                    </Button>

                    {!isApproved && (
                        <Button
                            size="sm"
                            onClick={onApprove}
                            className="bg-brand-green hover:bg-brand-green/90 text-white flex items-center gap-1.5 h-8 md:h-9 px-2.5 md:px-3 text-xs font-semibold"
                        >
                            <CheckCircleIcon size={14} /> Aprovar {typeLabel}
                        </Button>
                    )}

                    <Button
                        size="sm"
                        variant="outline"
                        onClick={onReject}
                        className="text-white border-white/20 hover:bg-white/10 flex items-center gap-1.5 h-8 md:h-9 px-2.5 md:px-3 text-xs font-semibold"
                    >
                        <TrashIcon size={14} className="text-brand-red" /> Rejeitar {typeLabel}
                    </Button>

                    <button
                        onClick={onClose}
                        className="text-white/80 hover:text-white transition-colors p-2 rounded-full hover:bg-white/10 ml-1 md:ml-3"
                        title="Fechar visualizador"
                    >
                        <XIcon size={20} />
                    </button>
                </div>
            </div>

            {/* Central Image View */}
            <div className="relative w-full h-full max-w-[90vw] max-h-[82vh] flex items-center justify-center mt-12 mb-6">
                <img
                    src={currentImage}
                    alt={`Imagem ${currentIndex + 1} de ${images.length}`}
                    className="max-w-full max-h-full object-contain select-none"
                    onClick={(e) => e.stopPropagation()}
                />

                {images.length > 1 && (
                    <>
                        <button
                            onClick={(e) => { e.stopPropagation(); onNavigate(-1) }}
                            className="absolute left-2 md:left-4 text-white/80 hover:text-white transition-colors p-2.5 rounded-full bg-black/60 hover:bg-black/80"
                        >
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="15 18 9 12 15 6" />
                            </svg>
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); onNavigate(1) }}
                            className="absolute right-2 md:right-4 text-white/80 hover:text-white transition-colors p-2.5 rounded-full bg-black/60 hover:bg-black/80"
                        >
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="9 18 15 12 9 6" />
                            </svg>
                        </button>
                    </>
                )}
            </div>
        </div>
    )
}
