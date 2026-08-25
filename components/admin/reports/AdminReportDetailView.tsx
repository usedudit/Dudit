"use client"

import React, { useState, useEffect, useRef, useCallback, useTransition } from "react"
import {
    ChevronLeftIcon,
    ShareIcon,
    PackageIcon,
    StoreIcon,
    ClockIcon,
    UserIcon,
} from "@/lib/icons"
import {
    Button,
    Badge,
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
    ThreeDotsLoader,
    FormSection,
    IconPlaceholder,
    ListItem,
    DefaultModal,
} from "@/components/reusable"
import { FadeIn } from "@/components/animations/FadeIn"
import { formatDateTime } from "@/lib/utils"
import {
    getAdminReportDetailAction,
    resolveReport,
    dismissReport,
    markReportSpam,
    revertReportValidation,
    type Report,
} from "@/app/actions/admin/reports"
import Link from "next/link"
import { getProductUrl, getServiceUrl, getStoreUrl } from "@/lib/utils/url-generator"
import { toast } from "@/hooks/use-notification"
import { useSidebar } from "@/lib/sidebar-context"

interface AdminReportDetailViewProps {
    reportId: string
    initialReport?: Report
    onBack: () => void
    onReportUpdated?: () => void
}

export function AdminReportDetailView({
    reportId,
    initialReport,
    onBack,
    onReportUpdated,
}: AdminReportDetailViewProps) {
    const [detail, setDetail] = useState<any>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [activeTab, setActiveTab] = useState("general")
    const [isScrolled, setIsScrolled] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)
    const [isPending, startTransition] = useTransition()

    // Modals
    const [resolveModalOpen, setResolveModalOpen] = useState(false)
    const [dismissModalOpen, setDismissModalOpen] = useState(false)
    const [spamModalOpen, setSpamModalOpen] = useState(false)
    const [revertModalOpen, setRevertModalOpen] = useState(false)
    const [actionReason, setActionReason] = useState("")

    // Header override
    let sidebarContext: ReturnType<typeof useSidebar> | null = null
    try {
        sidebarContext = useSidebar()
    } catch { }
    const setHeaderOverride = sidebarContext?.setHeaderOverride

    const loadDetail = useCallback(async () => {
        try {
            const data = await getAdminReportDetailAction(reportId)
            if (data) {
                setDetail(data)
            } else {
                toast.error(`Denúncia não encontrada (ID: ${reportId})`)
            }
        } catch (err: any) {
            console.error("Error fetching report detail:", err)
            toast.error(`Erro ao carregar detalhes: ${err?.message || "Falha desconhecida"}`)
        } finally {
            setIsLoading(false)
        }
    }, [reportId])

    useEffect(() => {
        loadDetail()
    }, [loadDetail])

    const handleScroll = useCallback(() => {
        setIsScrolled((scrollRef.current?.scrollTop || 0) > 20)
    }, [])

    const handleShare = useCallback(() => {
        navigator.clipboard.writeText(window.location.href)
        toast.success("Link da denúncia copiado!")
    }, [])

    const report: Report | null = detail?.report || initialReport || null

    useEffect(() => {
        if (!setHeaderOverride) return
        setHeaderOverride({
            title: report ? `Denúncia #${report.id.slice(0, 8)}` : "Detalhes da Denúncia",
            onBack,
            isSubPage: true,
        })
        return () => setHeaderOverride(null)
    }, [setHeaderOverride, onBack, report])

    const handleResolve = () => {
        if (!report) return
        startTransition(async () => {
            try {
                const res = await resolveReport(report.id, actionReason || "Denúncia procedente confirmada")
                if (res.success) {
                    toast.success("Denúncia validada com sucesso (+5 score de risco atribuído)")
                    setResolveModalOpen(false)
                    setActionReason("")
                    loadDetail()
                    onReportUpdated?.()
                } else {
                    toast.error(res.error || "Erro ao validar denúncia")
                }
            } catch (err: any) {
                toast.error(err.message || "Erro inesperado")
            }
        })
    }

    const handleDismiss = () => {
        if (!report) return
        startTransition(async () => {
            try {
                const res = await dismissReport(report.id, actionReason || "Denúncia improcedente ou sem provas")
                if (res.success) {
                    toast.success("Denúncia descartada")
                    setDismissModalOpen(false)
                    setActionReason("")
                    loadDetail()
                    onReportUpdated?.()
                } else {
                    toast.error(res.error || "Erro ao descartar denúncia")
                }
            } catch (err: any) {
                toast.error(err.message || "Erro inesperado")
            }
        })
    }

    const handleSpam = () => {
        if (!report) return
        startTransition(async () => {
            try {
                const res = await markReportSpam(report.id, actionReason || "Denúncia abusiva / spam")
                if (res.success) {
                    toast.success("Denúncia marcada como spam")
                    setSpamModalOpen(false)
                    setActionReason("")
                    loadDetail()
                    onReportUpdated?.()
                } else {
                    toast.error(res.error || "Erro ao marcar como spam")
                }
            } catch (err: any) {
                toast.error(err.message || "Erro inesperado")
            }
        })
    }

    const handleRevert = () => {
        if (!report) return
        startTransition(async () => {
            try {
                const res = await revertReportValidation(report.id, actionReason || "Reversão administrativa de validação")
                if (res.success) {
                    toast.success("Validação revertida com sucesso (-5 score de risco)")
                    setRevertModalOpen(false)
                    setActionReason("")
                    loadDetail()
                    onReportUpdated?.()
                } else {
                    toast.error(res.error || "Erro ao reverter denúncia")
                }
            } catch (err: any) {
                toast.error(err.message || "Erro inesperado")
            }
        })
    }

    if (isLoading) {
        return (
            <div className="flex h-full w-full items-center justify-center min-h-[400px]">
                <ThreeDotsLoader />
            </div>
        )
    }

    if (!report) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] p-6 text-center">
                <IconPlaceholder
                    icon={ClockIcon}
                    containerSize="w-16 h-16 mb-2"
                    iconSize="w-6 h-6"
                    title="Denúncia não encontrada"
                    subtitle="A denúncia pode ter sido removida ou o link está incorreto."
                    itemButton={{
                        text: "Voltar para lista",
                        action: onBack,
                        variant: "outline",
                    }}
                />
            </div>
        )
    }

    const targetTypeLabels: Record<string, string> = {
        product: "Produto",
        service: "Serviço",
        partner: "Loja / Parceiro",
        store: "Loja / Parceiro",
        review: "Avaliação",
        return_request: "Devolução",
        order: "Pedido",
        user: "Usuário",
    }

    const statusMap: Record<string, { variant: "orange" | "green" | "gray" | "purple"; label: string }> = {
        pending: { variant: "orange", label: "Pendente" },
        validated: { variant: "green", label: "Validada" },
        dismissed: { variant: "gray", label: "Descartada" },
        spam: { variant: "purple", label: "Spam" },
    }
    const statusInfo = statusMap[report.status] || { variant: "gray", label: report.status }

    const target = detail?.targetDetails
    const reporter = detail?.reporter
    const targetSummary = detail?.targetSummary
    const auditEvents = detail?.auditEvents || []

    const DesktopActions = () => (
        <>
            {report.status === "pending" && (
                <>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setDismissModalOpen(true)}
                        disabled={isPending}
                    >
                        Descartar
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        className="text-purple-600 border-purple-200 hover:bg-purple-50 dark:hover:bg-purple-950/20"
                        onClick={() => setSpamModalOpen(true)}
                        disabled={isPending}
                    >
                        Marcar Spam
                    </Button>
                    <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setResolveModalOpen(true)}
                        disabled={isPending}
                    >
                        Validar Denúncia
                    </Button>
                </>
            )}
            {report.status === "validated" && (
                <Button
                    size="sm"
                    variant="outline"
                    className="text-orange-600 border-orange-200 hover:bg-orange-50 dark:hover:bg-orange-950/20"
                    onClick={() => setRevertModalOpen(true)}
                    disabled={isPending}
                >
                    Reverter Validação (-5 pts)
                </Button>
            )}
        </>
    )

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
                                    <div className={`absolute -left-12 top-7 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                                        <Button variant="filled" onClick={onBack} className="w-10 h-10 p-0 flex items-center justify-center">
                                            <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                        </Button>
                                    </div>

                                    {/* Title row - desktop */}
                                    <div className="hidden md:flex items-start justify-between md:py-0 md:mb-0">
                                        <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                            <h1 className={`font-bold transition-all duration-500 ease-in-out flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                                <span className="hidden md:inline truncate">Denúncia #{report.id.slice(0, 8)}</span>
                                                <Badge variant={statusInfo.variant}>
                                                    {statusInfo.label}
                                                </Badge>
                                            </h1>

                                            <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-300 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                                Registrada em {formatDateTime(report.created_at)} • Alvo: {targetTypeLabels[report.target_type] || report.target_type} • UUID: {report.id}
                                            </div>
                                        </div>

                                        {/* Desktop action buttons */}
                                        <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                                            <DesktopActions />
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
                                                        Denúncia #{report.id.slice(0, 8)}
                                                    </h1>
                                                    <Badge variant={statusInfo.variant}>
                                                        {statusInfo.label}
                                                    </Badge>
                                                </div>
                                                <span className="text-xs text-brand-inactive-text truncate">
                                                    {formatDateTime(report.created_at)}
                                                </span>
                                            </div>
                                        </div>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={handleShare}
                                            className="shrink-0"
                                        >
                                            Compartilhar
                                        </Button>
                                    </div>

                                    {/* Tabs */}
                                    <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                                        <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                            <TabsTrigger value="general">Denúncia</TabsTrigger>
                                            <TabsTrigger value="parties">Envolvidos</TabsTrigger>
                                            <TabsTrigger value="timeline">Auditoria ({auditEvents.length})</TabsTrigger>
                                        </TabsList>
                                    </div>
                                </div>
                            </div>

                            {/* Content */}
                            <div className="px-3 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
                                <Tabs value={activeTab} onValueChange={setActiveTab}>
                                    {/* Aba 1: Denúncia */}
                                    <TabsContent value="general" className="mt-0">
                                        <FadeIn key="general">
                                            <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
                                                {/* Coluna principal */}
                                                <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12">
                                                    <FormSection title="Motivo da Denúncia" hasSeparator description={`Gravidade: ${report.severity?.toUpperCase() || "NORMAL"}`}>
                                                        <div className="space-y-4">
                                                            <div>
                                                                <span className="text-xs text-brand-inactive-text">Motivo / Categoria</span>
                                                                <p className="text-sm font-semibold text-brand-dark dark:text-dark-heading mt-0.5">
                                                                    {report.reason_label || report.reason}
                                                                </p>
                                                            </div>

                                                            {report.description && (
                                                                <div>
                                                                    <span className="text-xs text-brand-inactive-text">Descrição Informada pelo Usuário</span>
                                                                    <div className="mt-1 p-3.5 bg-brand-gray/50 dark:bg-dark-border/20 rounded-xl text-sm text-brand-dark dark:text-dark-body whitespace-pre-wrap leading-relaxed">
                                                                        {report.description}
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {report.resolution_reason && (
                                                                <div className="p-3.5 bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-xl">
                                                                    <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">Justificativa da Moderação</span>
                                                                    <p className="text-sm text-brand-dark dark:text-dark-body mt-0.5 leading-relaxed">
                                                                        {report.resolution_reason}
                                                                    </p>
                                                                    {report.resolved_at && (
                                                                        <span className="text-[11px] text-brand-inactive-text block mt-1">
                                                                            Resolvido em {formatDateTime(report.resolved_at)}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </FormSection>
                                                </div>

                                                {/* Sidebar */}
                                                <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 border-0 xl:border-l border-brand-border dark:border-dark-border">
                                                    {/* Card do Item Denunciado */}
                                                    <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden mb-6 transition-colors">
                                                        <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border rounded-t-2xl"></div>
                                                        <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-4">
                                                            Item Denunciado
                                                        </h3>
                                                        <div className="space-y-3">
                                                            <div className="flex items-start justify-between gap-3">
                                                                <div className="flex flex-col min-w-0">
                                                                    <span className="text-xs text-brand-inactive-text uppercase tracking-wider font-semibold">
                                                                        {targetTypeLabels[report.target_type] || report.target_type}
                                                                    </span>
                                                                    <span className="font-bold text-base text-brand-dark dark:text-dark-heading break-all">
                                                                        {target?.name || report.target_name || `${targetTypeLabels[report.target_type] || report.target_type} #${report.target_id.slice(0, 8)}`}
                                                                    </span>
                                                                    <span className="text-xs text-brand-inactive-text opacity-70 font-mono break-all mt-0.5">
                                                                        ID: {report.target_id}
                                                                    </span>
                                                                </div>
                                                                {target?.risk_score !== undefined && (
                                                                    <Badge variant={target.risk_score >= 50 ? "red" : target.risk_score >= 25 ? "orange" : "gray"}>
                                                                        Score: {target.risk_score} pts
                                                                    </Badge>
                                                                )}
                                                            </div>

                                                            {(() => {
                                                                const targetType = report.target_type as string
                                                                const marketplaceUrl = targetType === "product" && target
                                                                    ? getProductUrl(target, target.store)
                                                                    : targetType === "service" && target
                                                                    ? getServiceUrl(target, target.store)
                                                                    : (targetType === "partner" || targetType === "store") && target
                                                                    ? getStoreUrl(target)
                                                                    : null

                                                                if (!marketplaceUrl) return null

                                                                return (
                                                                    <div className="pt-3 border-t border-brand-border dark:border-dark-border">
                                                                        <Link
                                                                            href={marketplaceUrl}
                                                                            target="_blank"
                                                                            rel="noopener noreferrer"
                                                                            className="text-xs font-bold text-brand-green hover:underline flex items-center gap-1"
                                                                        >
                                                                            Ver no marketplace →
                                                                        </Link>
                                                                    </div>
                                                                )
                                                            })()}
                                                        </div>
                                                    </div>

                                                    {/* Card de Histórico do Alvo */}
                                                    {targetSummary && (
                                                        <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden mb-6 transition-colors">
                                                            <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-4">
                                                                Histórico de Denúncias do Alvo
                                                            </h3>
                                                            <div className="space-y-2.5 text-sm">
                                                                <div className="flex justify-between text-brand-inactive-text">
                                                                    <span>Total de denúncias</span>
                                                                    <span className="font-semibold text-brand-dark dark:text-dark-heading">{targetSummary.total}</span>
                                                                </div>
                                                                <div className="flex justify-between text-brand-inactive-text">
                                                                    <span>Validadas</span>
                                                                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">{targetSummary.validated}</span>
                                                                </div>
                                                                <div className="flex justify-between text-brand-inactive-text">
                                                                    <span>Descartadas</span>
                                                                    <span className="font-semibold text-brand-inactive-text">{targetSummary.dismissed}</span>
                                                                </div>
                                                                {typeof targetSummary.spam === "number" && targetSummary.spam > 0 && (
                                                                    <div className="flex justify-between text-brand-inactive-text pt-2 border-t border-brand-border dark:border-dark-border">
                                                                        <span>Spam</span>
                                                                        <span className="font-semibold text-purple-600 dark:text-purple-400">{targetSummary.spam}</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Card de Identificadores */}
                                                    <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden mb-6 transition-colors">
                                                        <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-4">
                                                            Identificadores
                                                        </h3>
                                                        <div className="space-y-2 text-xs">
                                                            <div>
                                                                <span className="text-brand-inactive-text block">UUID da Denúncia</span>
                                                                <span className="font-mono text-brand-dark dark:text-dark-heading select-all break-all">{report.id}</span>
                                                            </div>
                                                            <div>
                                                                <span className="text-brand-inactive-text block">ID do Alvo</span>
                                                                <span className="font-mono text-brand-dark dark:text-dark-heading select-all break-all">{report.target_id}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </FadeIn>
                                    </TabsContent>

                                    {/* Aba 2: Envolvidos */}
                                    <TabsContent value="parties" className="mt-0">
                                        <FadeIn key="parties">
                                            <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
                                                {/* Coluna principal */}
                                                <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12">
                                                    <FormSection title="Denunciante" hasSeparator description="Identificação do usuário autor da denúncia">
                                                        <ListItem
                                                            left={
                                                                <UserProfileAvatar reporter={reporter} name={report.reporter_name} />
                                                            }
                                                            title={reporter?.profile?.full_name || report.reporter_name || "Usuário Anônimo"}
                                                            description={reporter?.email || "Sem e-mail revelado"}
                                                            right={
                                                                report.reporter_user_id ? (
                                                                    <Link
                                                                        href={`/ddt-admin/users?view=${report.reporter_user_id}`}
                                                                        className="text-xs font-bold text-brand-green hover:underline shrink-0"
                                                                    >
                                                                        Ver Usuário →
                                                                    </Link>
                                                                ) : undefined
                                                            }
                                                        />

                                                        <div className="space-y-2 text-sm">
                                                            <div className="flex justify-between">
                                                                <span className="text-brand-inactive-text text-xs">ID do Denunciante</span>
                                                                <span className="font-mono text-xs text-brand-dark dark:text-dark-heading">{report.reporter_user_id}</span>
                                                            </div>
                                                            {reporter?.profile?.phone && (
                                                                <div className="flex justify-between">
                                                                    <span className="text-brand-inactive-text text-xs">Telefone</span>
                                                                    <span className="font-bold text-xs text-brand-dark dark:text-dark-heading">{reporter.profile.phone}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </FormSection>
                                                </div>

                                                {/* Sidebar */}
                                                <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 border-0 xl:border-l border-brand-border dark:border-dark-border">
                                                    <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden mb-6 transition-colors">
                                                        <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-4">
                                                            Loja Vinculada ao Alvo
                                                        </h3>
                                                        {target?.store?.name ? (
                                                            <div className="space-y-3">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="w-12 h-12 rounded-xl bg-brand-gray dark:bg-dark-border/40 border border-brand-border dark:border-dark-border flex items-center justify-center overflow-hidden shrink-0">
                                                                        <StoreIcon className="w-6 h-6 text-brand-inactive-text" />
                                                                    </div>
                                                                    <div className="min-w-0">
                                                                        <h3 className="font-bold text-base text-brand-dark dark:text-dark-heading truncate">
                                                                            {target.store.name}
                                                                        </h3>
                                                                        {typeof target.risk_score === "number" && (
                                                                            <span className="text-xs text-brand-inactive-text">
                                                                                Pontuação de Risco: <strong>{target.risk_score} pts</strong>
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                {target.store.id && (
                                                                    <Link
                                                                        href={getStoreUrl(target)}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="inline-block text-xs font-bold text-brand-green hover:underline"
                                                                    >
                                                                        Ver loja no marketplace →
                                                                    </Link>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <p className="text-xs text-brand-inactive-text">
                                                                Este tipo de alvo não possui uma loja vinculada ou os dados não estão disponíveis.
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </FadeIn>
                                    </TabsContent>

                                    {/* Aba 3: Auditoria */}
                                    <TabsContent value="timeline" className="mt-0">
                                        <FadeIn key="timeline">
                                            <FormSection title="Histórico de Auditoria" hasSeparator description="Eventos registrados para este alvo">
                                                {auditEvents.length === 0 ? (
                                                    <div className="py-6">
                                                        <IconPlaceholder
                                                            icon={PackageIcon}
                                                            containerSize="w-14 h-14 mb-2"
                                                            iconSize="w-6 h-6"
                                                            title="Nenhum evento registrado"
                                                            subtitle="Este alvo ainda não possui eventos de auditoria."
                                                        />
                                                    </div>
                                                ) : (
                                                    <div className="space-y-4">
                                                        {auditEvents.map((evt: any) => (
                                                            <div key={evt.id} className="flex items-start gap-3 border-l-2 border-brand-border dark:border-dark-border pl-4 py-1">
                                                                <div className="flex-1 min-w-0">
                                                                    <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                                        {evt.action_type || "Ação Administrativa"}
                                                                    </p>
                                                                    <p className="text-xs text-brand-inactive-text">{formatDateTime(evt.created_at)}</p>
                                                                    {evt.metadata?.reason && (
                                                                        <p className="text-xs text-brand-inactive-text mt-1 line-clamp-2">
                                                                            {String(evt.metadata.reason)}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </FormSection>
                                        </FadeIn>
                                    </TabsContent>
                                </Tabs>
                            </div>
                        </div>
                    </Tabs>
                </div>
            </FadeIn>

            {/* Mobile bottom bar */}
            <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 flex gap-2">
                {report.status === "pending" ? (
                    <>
                        <Button variant="outline" className="flex-1" onClick={() => setDismissModalOpen(true)} disabled={isPending}>
                            Descartar
                        </Button>
                        <Button variant="destructive" className="flex-1" onClick={() => setResolveModalOpen(true)} disabled={isPending}>
                            Validar
                        </Button>
                    </>
                ) : report.status === "validated" ? (
                    <Button variant="outline" className="flex-1" onClick={() => setRevertModalOpen(true)} disabled={isPending}>
                        Reverter Validação (-5 pts)
                    </Button>
                ) : (
                    <Button variant="outline" className="flex-1" onClick={handleShare} leftIcon={<ShareIcon size={16} />}>
                        Compartilhar
                    </Button>
                )}
            </div>

            {/* Modal: Validar Denúncia */}
            <DefaultModal
                isOpen={resolveModalOpen}
                onClose={() => setResolveModalOpen(false)}
                title="Validar Denúncia"
                maxWidth="md"
                footer={
                    <div className="flex items-center justify-end gap-2 w-full">
                        <Button variant="outline" onClick={() => setResolveModalOpen(false)}>Cancelar</Button>
                        <Button variant="destructive" onClick={handleResolve} disabled={isPending}>Validar (+5 Risco)</Button>
                    </div>
                }
            >
                <div className="space-y-4 py-2">
                    <p className="text-xs text-brand-inactive-text">
                        A confirmação desta denúncia adicionará <strong>+5 pontos de score de risco</strong> ao alvo e marcará o registro como validado.
                    </p>
                    <textarea
                        value={actionReason}
                        onChange={(e) => setActionReason(e.target.value)}
                        placeholder="Justificativa da validação..."
                        className="w-full min-h-[90px] rounded-xl border border-brand-border bg-white p-3 text-sm text-brand-dark outline-none focus:border-brand-green dark:border-dark-border dark:bg-dark-surface dark:text-white"
                    />
                </div>
            </DefaultModal>

            {/* Modal: Descartar Denúncia */}
            <DefaultModal
                isOpen={dismissModalOpen}
                onClose={() => setDismissModalOpen(false)}
                title="Descartar Denúncia"
                maxWidth="md"
                footer={
                    <div className="flex items-center justify-end gap-2 w-full">
                        <Button variant="outline" onClick={() => setDismissModalOpen(false)}>Cancelar</Button>
                        <Button variant="default" onClick={handleDismiss} disabled={isPending}>Descartar</Button>
                    </div>
                }
            >
                <div className="space-y-4 py-2">
                    <p className="text-xs text-brand-inactive-text">
                        Descartar denúncias improcedentes encerra o ticket sem penalidades ao alvo.
                    </p>
                    <textarea
                        value={actionReason}
                        onChange={(e) => setActionReason(e.target.value)}
                        placeholder="Motivo do descarte..."
                        className="w-full min-h-[90px] rounded-xl border border-brand-border bg-white p-3 text-sm text-brand-dark outline-none focus:border-brand-green dark:border-dark-border dark:bg-dark-surface dark:text-white"
                    />
                </div>
            </DefaultModal>

            {/* Modal: Marcar Spam */}
            <DefaultModal
                isOpen={spamModalOpen}
                onClose={() => setSpamModalOpen(false)}
                title="Marcar Denúncia como Spam"
                maxWidth="md"
                footer={
                    <div className="flex items-center justify-end gap-2 w-full">
                        <Button variant="outline" onClick={() => setSpamModalOpen(false)}>Cancelar</Button>
                        <Button variant="default" onClick={handleSpam} disabled={isPending}>Marcar como Spam</Button>
                    </div>
                }
            >
                <div className="space-y-4 py-2">
                    <p className="text-xs text-brand-inactive-text">
                        Denúncias marcadas como spam indicam comportamento abusivo do denunciante e são arquivadas.
                    </p>
                    <textarea
                        value={actionReason}
                        onChange={(e) => setActionReason(e.target.value)}
                        placeholder="Observações sobre o spam..."
                        className="w-full min-h-[90px] rounded-xl border border-brand-border bg-white p-3 text-sm text-brand-dark outline-none focus:border-brand-green dark:border-dark-border dark:bg-dark-surface dark:text-white"
                    />
                </div>
            </DefaultModal>

            {/* Modal: Reverter Validação */}
            <DefaultModal
                isOpen={revertModalOpen}
                onClose={() => setRevertModalOpen(false)}
                title="Reverter Validação da Denúncia"
                maxWidth="md"
                footer={
                    <div className="flex items-center justify-end gap-2 w-full">
                        <Button variant="outline" onClick={() => setRevertModalOpen(false)}>Cancelar</Button>
                        <Button variant="default" onClick={handleRevert} disabled={isPending}>Reverter (-5 Risco)</Button>
                    </div>
                }
            >
                <div className="space-y-4 py-2">
                    <p className="text-xs text-brand-inactive-text">
                        A reversão retornará o registro para pendente e subtrairá <strong>-5 pontos de risco</strong> do alvo.
                    </p>
                    <textarea
                        value={actionReason}
                        onChange={(e) => setActionReason(e.target.value)}
                        placeholder="Justificativa da reversão..."
                        className="w-full min-h-[90px] rounded-xl border border-brand-border bg-white p-3 text-sm text-brand-dark outline-none focus:border-brand-green dark:border-dark-border dark:bg-dark-surface dark:text-white"
                    />
                </div>
            </DefaultModal>
        </>
    )
}

const UserProfileAvatar = ({ reporter, name }: { reporter: any; name?: string }) => {
    const initials = (reporter?.profile?.full_name || name || "U")
        .split(" ")
        .map((n: string) => n.charAt(0))
        .slice(0, 2)
        .join("")
        .toUpperCase()

    return (
        <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border/40 border border-brand-border dark:border-dark-border flex items-center justify-center shrink-0">
            <UserIcon className="w-5 h-5 text-brand-inactive-text" />
            <span className="sr-only">{initials}</span>
        </div>
    )
}

export default AdminReportDetailView
