"use client"

import React, { useState, useEffect, useCallback, useTransition } from "react"
import {
    ChevronLeftIcon,
    AlertTriangleIcon,
    CheckCircleIcon,
    CancelCircleIcon,
    ReturnIcon,
    ShieldIcon,
    PackageIcon,
    StoreIcon,
    ClockIcon,
    UserIcon,
    MailIcon,
    ArrowRightIcon,
} from "@/lib/icons"
import {
    Button,
    Badge,
    FormSection,
    ThreeDotsLoader,
    DefaultModal,
    Input,
} from "@/components/reusable"
import { FadeIn } from "@/components/animations/FadeIn"
import { formatDate, formatDateTime } from "@/lib/utils"
import {
    getAdminReportDetailAction,
    resolveReport,
    dismissReport,
    markReportSpam,
    revertReportValidation,
    type Report,
} from "@/app/actions/admin/reports"
import Link from "next/link"
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
                const res = await dismissReport(report.id, actionReason || "Denúncia improcedente")
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
                const res = await markReportSpam(report.id, actionReason || "Denúncia marcada como spam")
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
            <div className="flex flex-col items-center justify-center p-8 space-y-4">
                <p className="text-sm text-brand-inactive-text">Denúncia não encontrada.</p>
                <Button variant="outline" size="sm" onClick={onBack}>Voltar</Button>
            </div>
        )
    }

    const targetTypeLabels: Record<string, string> = {
        product: "Produto",
        service: "Serviço",
        partner: "Loja / Parceiro",
        store: "Loja",
        review: "Avaliação",
        user: "Usuário",
    }

    const statusMap: Record<string, { variant: "orange" | "red" | "gray" | "purple"; label: string }> = {
        pending: { variant: "orange", label: "Pendente" },
        validated: { variant: "red", label: "Validada" },
        dismissed: { variant: "gray", label: "Descartada" },
        spam: { variant: "purple", label: "Spam" },
    }
    const statusInfo = statusMap[report.status] || { variant: "gray", label: report.status }

    const target = detail?.targetDetails
    const reporter = detail?.reporter
    const targetSummary = detail?.targetSummary
    const auditEvents = detail?.auditEvents || []

    return (
        <FadeIn className="flex flex-col h-full bg-white dark:bg-dark-background">
            {/* Header Desktop */}
            <div className="hidden md:flex items-center justify-between px-8 py-4 border-b border-brand-border dark:border-dark-border">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="sm" onClick={onBack} className="p-2 h-auto text-brand-dark dark:text-dark-heading">
                        <ChevronLeftIcon size={18} />
                    </Button>
                    <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl font-bold text-brand-dark dark:text-dark-heading">
                                Denúncia #{report.id.slice(0, 8)}
                            </h1>
                            <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                        </div>
                        <span className="text-xs text-brand-inactive-text">
                            Registrada em {formatDateTime(report.created_at)}
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {report.status === "pending" && (
                        <>
                            <Button
                                size="sm"
                                variant="outline"
                                className="text-brand-dark dark:text-dark-heading"
                                onClick={() => setDismissModalOpen(true)}
                                disabled={isPending}
                            >
                                Descartar
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                className="text-purple-600 border-purple-200 hover:bg-purple-50"
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
                            className="text-orange-600 border-orange-200 hover:bg-orange-50"
                            onClick={() => setRevertModalOpen(true)}
                            disabled={isPending}
                        >
                            Reverter Validação (-5 pts)
                        </Button>
                    )}
                </div>
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Coluna 1: Alvo Denunciado & Denunciante */}
                    <div className="space-y-6">
                        <FormSection
                            title="Item Denunciado"
                            description={`Tipo: ${targetTypeLabels[report.target_type] || report.target_type}`}
                        >
                            <div className="p-4 bg-brand-gray/40 dark:bg-dark-border/10 rounded-xl space-y-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex flex-col min-w-0">
                                        <span className="text-xs text-brand-inactive-text uppercase tracking-wider font-semibold">
                                            {targetTypeLabels[report.target_type] || report.target_type}
                                        </span>
                                        <span className="font-bold text-base text-brand-dark dark:text-dark-heading truncate">
                                            {report.target_type === "review"
                                                ? `Avaliação #${report.target_id.slice(0, 8)}`
                                                : target?.name || report.target_name || report.target_id}
                                        </span>
                                        <span className="text-xs text-brand-inactive-text opacity-70">
                                            ID: {report.target_id}
                                        </span>
                                    </div>
                                    {target?.risk_score !== undefined && (
                                        <Badge variant={target.risk_score >= 50 ? "red" : target.risk_score >= 25 ? "orange" : "gray"}>
                                            Score: {target.risk_score} pts
                                        </Badge>
                                    )}
                                </div>

                                {target?.store?.name && (
                                    <div className="pt-2 border-t border-brand-border dark:border-dark-border text-xs text-brand-inactive-text flex justify-between items-center">
                                        <span>Loja vinculada: <strong>{target.store.name}</strong></span>
                                        {target.store.id && (
                                            <Link
                                                href={`/ddt-admin/partners?view=${target.store.id}`}
                                                className="text-brand-dark dark:text-dark-heading font-medium hover:underline flex items-center gap-1"
                                            >
                                                Ver Loja <ArrowRightIcon size={12} />
                                            </Link>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Sumário de denúncias deste alvo */}
                            {targetSummary && (
                                <div className="grid grid-cols-3 gap-3 pt-2">
                                    <div className="p-3 bg-brand-gray/30 dark:bg-dark-border/10 rounded-lg text-center">
                                        <span className="text-[11px] text-brand-inactive-text">Total Denúncias</span>
                                        <p className="text-base font-bold text-brand-dark dark:text-dark-heading">{targetSummary.total}</p>
                                    </div>
                                    <div className="p-3 bg-brand-gray/30 dark:bg-dark-border/10 rounded-lg text-center">
                                        <span className="text-[11px] text-brand-inactive-text">Validadas</span>
                                        <p className="text-base font-bold text-red-600">{targetSummary.validated}</p>
                                    </div>
                                    <div className="p-3 bg-brand-gray/30 dark:bg-dark-border/10 rounded-lg text-center">
                                        <span className="text-[11px] text-brand-inactive-text">Descartadas</span>
                                        <p className="text-base font-bold text-brand-inactive-text">{targetSummary.dismissed}</p>
                                    </div>
                                </div>
                            )}
                        </FormSection>

                        <FormSection
                            title="Denunciante"
                            description="Identificação do usuário autor da denúncia"
                        >
                            <div className="p-4 bg-brand-gray/40 dark:bg-dark-border/10 rounded-xl space-y-2">
                                <div className="flex flex-col min-w-0">
                                    <span className="font-bold text-sm text-brand-dark dark:text-dark-heading">
                                        {reporter?.profile?.full_name || report.reporter_name || "Usuário Anônimo"}
                                    </span>
                                    <span className="text-xs text-brand-inactive-text">
                                        ID: {report.reporter_user_id}
                                    </span>
                                </div>
                                {reporter?.email && (
                                    <div className="text-xs text-brand-inactive-text pt-1">
                                        Email: {reporter.email}
                                    </div>
                                )}
                                {reporter?.profile?.phone && (
                                    <div className="text-xs text-brand-inactive-text">
                                        Telefone: {reporter.profile.phone}
                                    </div>
                                )}
                            </div>
                        </FormSection>
                    </div>

                    {/* Coluna 2: Detalhes do Motivo & Resolução */}
                    <div className="space-y-6">
                        <FormSection
                            title="Motivo da Denúncia"
                            description={`Gravidade: ${report.severity?.toUpperCase() || "NORMAL"}`}
                        >
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
                                        <div className="mt-1 p-3 bg-brand-gray/50 dark:bg-dark-border/20 rounded-lg text-sm text-brand-dark dark:text-dark-body whitespace-pre-wrap">
                                            {report.description}
                                        </div>
                                    </div>
                                )}

                                {report.resolution_reason && (
                                    <div className="p-3 bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-lg">
                                        <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">Justificativa da Moderação</span>
                                        <p className="text-sm text-brand-dark dark:text-dark-body mt-0.5">
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

                        {/* Histórico / Timeline */}
                        {auditEvents.length > 0 && (
                            <FormSection
                                title="Histórico de Auditoria"
                                description="Eventos registrados para este alvo"
                            >
                                <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                                    {auditEvents.map((evt: any) => (
                                        <div key={evt.id} className="p-3 bg-brand-gray/30 dark:bg-dark-border/10 rounded-lg text-xs space-y-1">
                                            <div className="flex justify-between items-center">
                                                <span className="font-semibold text-brand-dark dark:text-dark-heading">{evt.action_type}</span>
                                                <span className="text-[10px] text-brand-inactive-text">{formatDateTime(evt.created_at)}</span>
                                            </div>
                                            {evt.metadata?.reason && (
                                                <p className="text-brand-inactive-text">{String(evt.metadata.reason)}</p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </FormSection>
                        )}
                    </div>
                </div>
            </div>

            {/* Modal: Validar Denúncia */}
            <DefaultModal
                isOpen={resolveModalOpen}
                onClose={() => setResolveModalOpen(false)}
                title="Validar Denúncia"
                description="A validação atribui +5 pontos de risco ao parceiro/alvo e conclui a denúncia como procedente."
                footer={
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setResolveModalOpen(false)}>Cancelar</Button>
                        <Button variant="destructive" onClick={handleResolve} disabled={isPending}>Validar Denúncia</Button>
                    </div>
                }
            >
                <div className="space-y-2 pt-2">
                    <label className="text-xs font-medium text-brand-dark dark:text-dark-heading">
                        Justificativa da Decisão
                    </label>
                    <Input
                        placeholder="Informe a motivação para validação..."
                        value={actionReason}
                        onChange={(e) => setActionReason(e.target.value)}
                    />
                </div>
            </DefaultModal>

            {/* Modal: Descartar Denúncia */}
            <DefaultModal
                isOpen={dismissModalOpen}
                onClose={() => setDismissModalOpen(false)}
                title="Descartar Denúncia"
                description="A denúncia será marcada como descartada (improcedente) sem penalidades ao alvo."
                footer={
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setDismissModalOpen(false)}>Cancelar</Button>
                        <Button variant="default" onClick={handleDismiss} disabled={isPending}>Descartar</Button>
                    </div>
                }
            >
                <div className="space-y-2 pt-2">
                    <label className="text-xs font-medium text-brand-dark dark:text-dark-heading">
                        Motivo do Descarte
                    </label>
                    <Input
                        placeholder="Informe o motivo..."
                        value={actionReason}
                        onChange={(e) => setActionReason(e.target.value)}
                    />
                </div>
            </DefaultModal>

            {/* Modal: Marcar Spam */}
            <DefaultModal
                isOpen={spamModalOpen}
                onClose={() => setSpamModalOpen(false)}
                title="Marcar Denúncia como Spam"
                description="O registro será classificado como spam."
                footer={
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setSpamModalOpen(false)}>Cancelar</Button>
                        <Button variant="default" onClick={handleSpam} disabled={isPending}>Marcar como Spam</Button>
                    </div>
                }
            >
                <div className="space-y-2 pt-2">
                    <label className="text-xs font-medium text-brand-dark dark:text-dark-heading">
                        Observação (Opcional)
                    </label>
                    <Input
                        placeholder="Observação..."
                        value={actionReason}
                        onChange={(e) => setActionReason(e.target.value)}
                    />
                </div>
            </DefaultModal>

            {/* Modal: Reverter Validação */}
            <DefaultModal
                isOpen={revertModalOpen}
                onClose={() => setRevertModalOpen(false)}
                title="Reverter Validação da Denúncia"
                description="Isso removerá os 5 pontos de risco atribuídos anteriormente e mudará o status para descartada."
                footer={
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setRevertModalOpen(false)}>Cancelar</Button>
                        <Button variant="default" onClick={handleRevert} disabled={isPending}>Reverter Validação</Button>
                    </div>
                }
            >
                <div className="space-y-2 pt-2">
                    <label className="text-xs font-medium text-brand-dark dark:text-dark-heading">
                        Motivo da Reversão
                    </label>
                    <Input
                        placeholder="Informe o motivo da reversão..."
                        value={actionReason}
                        onChange={(e) => setActionReason(e.target.value)}
                    />
                </div>
            </DefaultModal>
        </FadeIn>
    )
}
