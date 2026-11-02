"use client"

import React, { useState, useEffect, useCallback, useMemo } from "react"
import { XIcon, SearchIcon, CheckCircleIcon, ClockIcon, UserIcon } from "@/lib/icons"
import { AlertTriangle, CalendarCheck, CalendarSync, RotateCcw } from "lucide-react"
import {
    Button,
    IconPlaceholder,
    Badge,
    InfoCard,
    Tabs,
    TabsList,
    TabsTrigger,
    ThreeDotsLoader,
    Input,
    PeriodDropdown,
} from "@/components/reusable"
import Portal from "@/components/Portal"
import BottomSheet from "@/components/BottomSheet"
import { useMediaQuery } from "@/components/erp/hooks"
import { useModalLayer } from "@/lib/modal-stack"
import {
    getNoShowAlertsAction,
    getPendingConfirmationsAction,
    getRescheduleAlertsAction,
    getRetentionOpportunitiesAction,
    confirmAppointmentQuickAction,
} from "@/app/actions/erp/appointments"
import type {
    NoShowAlert,
    NoShowCounts,
    PendingConfirmationAlert,
    RescheduleOpportunity,
    RetentionOpportunity,
} from "@/lib/erp/appointment-insights"
import { formatCurrency } from "@/lib/utils"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import { useRouter } from "next/navigation"
import { useNotification } from "@/hooks/use-notification"

interface AppointmentsSuggestionsSheetProps {
    isOpen: boolean
    onClose: () => void
    partnerId: string
    storeId?: string
    onSelectAppointment?: (appointmentId: string) => void
}

const NO_SHOW_PERIOD_OPTIONS = [
    { value: "15", label: "15 dias" },
    { value: "30", label: "30 dias" },
    { value: "60", label: "60 dias" },
    { value: "90", label: "90 dias" },
]

const RETENTION_PERIOD_OPTIONS = [
    { value: "15", label: "15+ dias" },
    { value: "30", label: "30+ dias" },
    { value: "45", label: "45+ dias" },
    { value: "60", label: "60+ dias" },
    { value: "90", label: "90+ dias" },
]

const formatDateBr = (iso: string) => {
    const [y, m, d] = String(iso || "").split("-").map(Number)
    if (!y || !m || !d) return iso || "-"
    return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`
}

export function AppointmentsSuggestionsSheet({
    isOpen,
    onClose,
    partnerId,
    storeId,
    onSelectAppointment,
}: AppointmentsSuggestionsSheetProps) {
    const isMobile = useMediaQuery("(max-width: 1023px)")
    const router = useRouter()
    const { success: notifySuccess, error: notifyError } = useNotification()

    const [activeTab, setActiveTab] = useState<"faltas" | "confirmacoes" | "reagendamentos" | "retencao">("faltas")

    // Filtros e busca
    const [search, setSearch] = useState("")
    const [noShowPeriod, setNoShowPeriod] = useState<number>(90)
    const [retentionPeriod, setRetentionPeriod] = useState<number>(30)

    // Faltas (no-show)
    const [noShowAlerts, setNoShowAlerts] = useState<NoShowAlert[]>([])
    const [noShowCounts, setNoShowCounts] = useState<NoShowCounts | null>(null)
    const [loadingNoShow, setLoadingNoShow] = useState(false)

    // Confirmações pendentes
    const [pendingConfirmations, setPendingConfirmations] = useState<PendingConfirmationAlert[]>([])
    const [loadingConfirmations, setLoadingConfirmations] = useState(false)
    const [confirmingId, setConfirmingId] = useState<string | null>(null)

    // Reagendamentos pendentes
    const [rescheduleAlerts, setRescheduleAlerts] = useState<RescheduleOpportunity[]>([])
    const [loadingReschedule, setLoadingReschedule] = useState(false)

    // Oportunidades de Retorno / Retenção
    const [retentionOpportunities, setRetentionOpportunities] = useState<RetentionOpportunity[]>([])
    const [loadingRetention, setLoadingRetention] = useState(false)

    const zIndex = useModalLayer(isOpen)

    const fetchNoShows = useCallback(() => {
        setLoadingNoShow(true)
        getNoShowAlertsAction(partnerId, noShowPeriod, storeId).then((res) => {
            if ("error" in res && res.error) {
                notifyError(res.error)
            } else if ("alerts" in res) {
                setNoShowAlerts(res.alerts)
                setNoShowCounts(res.counts)
            }
            setLoadingNoShow(false)
        })
    }, [partnerId, noShowPeriod, storeId, notifyError])

    const fetchConfirmations = useCallback(() => {
        setLoadingConfirmations(true)
        getPendingConfirmationsAction(partnerId, storeId, 7).then((res) => {
            if ("error" in res && res.error) {
                notifyError(res.error)
            } else if ("items" in res) {
                setPendingConfirmations(res.items)
            }
            setLoadingConfirmations(false)
        })
    }, [partnerId, storeId, notifyError])

    const fetchReschedule = useCallback(() => {
        setLoadingReschedule(true)
        getRescheduleAlertsAction(partnerId, storeId, 30).then((res) => {
            if ("error" in res && res.error) {
                notifyError(res.error)
            } else if ("items" in res) {
                setRescheduleAlerts(res.items)
            }
            setLoadingReschedule(false)
        })
    }, [partnerId, storeId, notifyError])

    const fetchRetention = useCallback(() => {
        setLoadingRetention(true)
        getRetentionOpportunitiesAction(partnerId, retentionPeriod, storeId).then((res) => {
            if ("error" in res && res.error) {
                notifyError(res.error)
            } else if ("items" in res) {
                setRetentionOpportunities(res.items)
            }
            setLoadingRetention(false)
        })
    }, [partnerId, retentionPeriod, storeId, notifyError])

    useEffect(() => {
        if (!isOpen) {
            setSearch("")
            return
        }
        fetchNoShows()
        fetchConfirmations()
        fetchReschedule()
        fetchRetention()
    }, [isOpen, fetchNoShows, fetchConfirmations, fetchReschedule, fetchRetention])

    useEffect(() => {
        if (isOpen) fetchNoShows()
    }, [noShowPeriod, isOpen, fetchNoShows])

    useEffect(() => {
        if (isOpen) fetchRetention()
    }, [retentionPeriod, isOpen, fetchRetention])

    // Filtros de busca por aba
    const filteredNoShows = useMemo(() => {
        if (!search.trim()) return noShowAlerts
        const term = search.toLowerCase().trim()
        return noShowAlerts.filter((a) => a.customer_name.toLowerCase().includes(term))
    }, [noShowAlerts, search])

    const filteredConfirmations = useMemo(() => {
        if (!search.trim()) return pendingConfirmations
        const term = search.toLowerCase().trim()
        return pendingConfirmations.filter(
            (c) =>
                c.customer_name.toLowerCase().includes(term) ||
                c.service_name.toLowerCase().includes(term) ||
                c.staff_name.toLowerCase().includes(term)
        )
    }, [pendingConfirmations, search])

    const filteredReschedule = useMemo(() => {
        if (!search.trim()) return rescheduleAlerts
        const term = search.toLowerCase().trim()
        return rescheduleAlerts.filter(
            (r) =>
                r.customer_name.toLowerCase().includes(term) ||
                r.service_name.toLowerCase().includes(term) ||
                r.staff_name.toLowerCase().includes(term)
        )
    }, [rescheduleAlerts, search])

    const filteredRetention = useMemo(() => {
        if (!search.trim()) return retentionOpportunities
        const term = search.toLowerCase().trim()
        return retentionOpportunities.filter(
            (r) =>
                r.customer_name.toLowerCase().includes(term) ||
                r.last_service_name.toLowerCase().includes(term) ||
                r.last_staff_name.toLowerCase().includes(term)
        )
    }, [retentionOpportunities, search])

    const handleConfirmAppointment = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation()
        setConfirmingId(id)
        try {
            const res = await confirmAppointmentQuickAction(id)
            if (res.success) {
                notifySuccess("Agendamento confirmado!")
                setPendingConfirmations((prev) => prev.filter((item) => item.id !== id))
                router.refresh()
            } else {
                notifyError(res.error || "Erro ao confirmar agendamento")
            }
        } catch (err: any) {
            notifyError(err?.message || "Erro ao confirmar agendamento")
        } finally {
            setConfirmingId(null)
        }
    }

    const goToCustomer = (customerId: string | null) => {
        if (!customerId) return
        onClose()
        router.push(`/erp/clientes/${customerId}`)
    }

    const handleSelectAppointment = (appointmentId: string, customerId?: string | null) => {
        if (onSelectAppointment) {
            onClose()
            onSelectAppointment(appointmentId)
        } else if (customerId) {
            goToCustomer(customerId)
        }
    }

    // --- CONTEÚDO DA ABA FALTAS ---
    const noShowContent = loadingNoShow ? (
        <div className="flex items-center justify-center py-16">
            <ThreeDotsLoader />
        </div>
    ) : (
        <div className="space-y-3">
            <div className="mb-3 flex items-center gap-2">
                <Input
                    name="search-no-show"
                    placeholder="Buscar cliente..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    variant="full-rounded"
                    prefix={<SearchIcon size={18} className="text-brand-inactive-text shrink-0" />}
                    label=""
                />
                <PeriodDropdown
                    options={NO_SHOW_PERIOD_OPTIONS}
                    value={String(noShowPeriod)}
                    setValue={(v) => setNoShowPeriod(Number(v))}
                    placeholder="Período"
                />
            </div>

            {noShowAlerts.length === 0 ? (
                <div className="py-12">
                    <IconPlaceholder
                        icon={CheckCircleIcon}
                        title="Agenda sem faltas recorrentes!"
                        subtitle={`Nenhum cliente faltou mais de uma vez nos últimos ${noShowPeriod} dias.`}
                    />
                </div>
            ) : (
                <>
                    {noShowCounts && (
                        <InfoCard
                            title="Impacto das Faltas"
                            color={noShowCounts.lost_value > 0 ? "red" : "orange"}
                            message={`${noShowCounts.absences} falta(s) de ${noShowCounts.clients} cliente(s) nos últimos ${noShowPeriod} dias${noShowCounts.lost_value > 0 ? ` - ${formatCurrency(noShowCounts.lost_value)} deixaram de entrar` : ""}. ${noShowCounts.future_appointments} agendamento(s) futuro(s) desses clientes.`}
                        />
                    )}
                    <p className="text-xs font-semibold text-brand-inactive-text px-1">
                        {filteredNoShows.length} cliente(s) com faltas recorrentes
                    </p>
                    {filteredNoShows.map((a) => {
                        const canNavigate = Boolean(a.customer_id)
                        return (
                            <div
                                key={a.key}
                                onClick={canNavigate ? () => goToCustomer(a.customer_id) : undefined}
                                className={`bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 transition-all ${canNavigate
                                    ? "hover:border-brand-green cursor-pointer"
                                    : ""
                                    }`}
                            >
                                <div className="flex items-start gap-3">
                                    <UserProfileImage
                                        fullName={a.customer_name}
                                        className="w-11 h-11 text-sm shrink-0"
                                    />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
                                            {a.customer_name}
                                        </p>
                                        <p className="text-xs text-brand-inactive-text mt-0.5">
                                            Última falta em {formatDateBr(a.last_absence)}
                                            {!canNavigate && " · Cliente sem cadastro"}
                                        </p>
                                    </div>
                                    <Badge variant="red">
                                        {a.absences} falta(s)
                                    </Badge>
                                </div>

                                <div className="mt-3 flex items-center justify-between text-xs pt-2 border-t border-brand-border/60 dark:border-dark-border/60">
                                    <div>
                                        <span className="text-brand-inactive-text">Deixou de receber: </span>
                                        <span className="font-bold text-brand-red">{formatCurrency(a.lost_value)}</span>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-brand-inactive-text">Agendamentos futuros: </span>
                                        <span
                                            className={`font-bold ${a.future_appointments > 0 ? "text-brand-dark dark:text-dark-heading" : "text-brand-inactive-text"}`}
                                        >
                                            {a.future_appointments}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </>
            )}
        </div>
    )

    // --- CONTEÚDO DA ABA CONFIRMAÇÕES ---
    const confirmationsContent = loadingConfirmations ? (
        <div className="flex items-center justify-center py-16">
            <ThreeDotsLoader />
        </div>
    ) : (
        <div className="space-y-3">
            <div className="mb-3 flex items-center gap-2">
                <Input
                    name="search-confirmations"
                    placeholder="Buscar agendamento ou cliente..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    variant="full-rounded"
                    prefix={<SearchIcon size={18} className="text-brand-inactive-text shrink-0" />}
                    label=""
                />
            </div>

            {pendingConfirmations.length === 0 ? (
                <div className="py-12">
                    <IconPlaceholder
                        icon={CheckCircleIcon}
                        title="Tudo confirmado!"
                        subtitle="Nenhum agendamento pendente de confirmação para os próximos 7 dias."
                    />
                </div>
            ) : (
                <>
                    <InfoCard
                        title="Aguardando Confirmação"
                        color="orange"
                        message={`${pendingConfirmations.length} agendamento(s) nos próximos 7 dias ainda não confirmados. Confirme com o cliente com antecedência para evitar faltas e buracos na agenda.`}
                    />
                    <p className="text-xs font-semibold text-brand-inactive-text px-1">
                        {filteredConfirmations.length} agendamento(s) a confirmar
                    </p>
                    {filteredConfirmations.map((item) => (
                        <div
                            key={item.id}
                            onClick={() => handleSelectAppointment(item.id, item.customer_id)}
                            className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 transition-all hover:border-brand-green cursor-pointer"
                        >
                            <div className="flex items-start gap-3">
                                <UserProfileImage
                                    imageUrl={item.customer_avatar}
                                    fullName={item.customer_name}
                                    className="w-11 h-11 text-sm shrink-0"
                                />
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
                                        {item.customer_name}
                                    </p>
                                    <p className="text-xs text-brand-inactive-text mt-0.5 truncate">
                                        {item.service_name} • <span className="font-medium text-brand-dark dark:text-dark-heading">{item.staff_name}</span>
                                    </p>
                                    <div className="flex items-center gap-2 mt-1.5 text-xs text-brand-inactive-text">
                                        <span className="font-semibold text-brand-dark dark:text-dark-heading">
                                            {formatDateBr(item.start_date)} às {item.start_time}
                                        </span>
                                        {item.price > 0 && (
                                            <>
                                                <span>•</span>
                                                <span className="font-semibold text-brand-green">
                                                    {formatCurrency(item.price)}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <div className="flex flex-col items-end gap-2 shrink-0">
                                    <Badge variant="orange">{item.status}</Badge>
                                    <Button
                                        size="sm"
                                        variant="filled"
                                        className="h-8 text-xs gap-1.5 bg-brand-green hover:bg-emerald-600 text-white"
                                        disabled={confirmingId === item.id}
                                        onClick={(e) => handleConfirmAppointment(item.id, e)}
                                    >
                                        {confirmingId === item.id ? (
                                            <ThreeDotsLoader />
                                        ) : (
                                            <>
                                                <CalendarCheck size={14} />
                                                <span>Confirmar</span>
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    ))}
                </>
            )}
        </div>
    )

    // --- CONTEÚDO DA ABA REAGENDAMENTO ---
    const rescheduleContent = loadingReschedule ? (
        <div className="flex items-center justify-center py-16">
            <ThreeDotsLoader />
        </div>
    ) : (
        <div className="space-y-3">
            <div className="mb-3 flex items-center gap-2">
                <Input
                    name="search-reschedule"
                    placeholder="Buscar agendamento ou cliente..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    variant="full-rounded"
                    prefix={<SearchIcon size={18} className="text-brand-inactive-text shrink-0" />}
                    label=""
                />
            </div>

            {rescheduleAlerts.length === 0 ? (
                <div className="py-12">
                    <IconPlaceholder
                        icon={CheckCircleIcon}
                        title="Sem remarcações pendentes!"
                        subtitle="Nenhum agendamento com solicitação de remarcação ou cancelamento sem novo horário."
                    />
                </div>
            ) : (
                <>
                    <InfoCard
                        title="Oportunidade de Remarcação"
                        color="blue"
                        message={`${rescheduleAlerts.length} agendamento(s) que precisam de remarcação. Entre em contato com esses clientes para não perder o faturamento.`}
                    />
                    <p className="text-xs font-semibold text-brand-inactive-text px-1">
                        {filteredReschedule.length} agendamento(s) necessitando novo horário
                    </p>
                    {filteredReschedule.map((r) => (
                        <div
                            key={r.id}
                            onClick={() => handleSelectAppointment(r.id, r.customer_id)}
                            className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 transition-all hover:border-brand-green cursor-pointer"
                        >
                            <div className="flex items-start gap-3">
                                <UserProfileImage
                                    imageUrl={r.customer_avatar}
                                    fullName={r.customer_name}
                                    className="w-11 h-11 text-sm shrink-0"
                                />
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
                                        {r.customer_name}
                                    </p>
                                    <p className="text-xs text-brand-inactive-text mt-0.5 truncate">
                                        {r.service_name} • <span className="font-medium text-brand-dark dark:text-dark-heading">{r.staff_name}</span>
                                    </p>
                                    <p className="text-xs text-brand-inactive-text mt-1">
                                        Data original: {formatDateBr(r.date)} {r.time ? `às ${r.time}` : ""}
                                    </p>
                                </div>
                                <div className="flex flex-col items-end gap-1.5 shrink-0">
                                    <Badge variant={r.reason === "needs_reschedule" ? "orange" : "red"}>
                                        {r.reason === "needs_reschedule" ? "Remarcação Solicitada" : "Cancelado"}
                                    </Badge>
                                    {r.has_future_appointment && (
                                        <Badge variant="green" className="text-[10px]">
                                            Já tem futuro
                                        </Badge>
                                    )}
                                </div>
                            </div>

                            {r.notes && (
                                <p className="mt-2.5 text-xs text-brand-inactive-text bg-brand-gray/50 dark:bg-dark-border/40 rounded-xl px-3 py-2 italic line-clamp-2">
                                    &ldquo;{r.notes}&rdquo;
                                </p>
                            )}

                            <div className="mt-3 flex items-center justify-between text-xs pt-2 border-t border-brand-border/60 dark:border-dark-border/60">
                                <div>
                                    <span className="text-brand-inactive-text">Valor: </span>
                                    <span className="font-bold text-brand-dark dark:text-dark-heading">
                                        {formatCurrency(r.price)}
                                    </span>
                                </div>
                                <span className="font-semibold text-brand-green">
                                    Ver cliente →
                                </span>
                            </div>
                        </div>
                    ))}
                </>
            )}
        </div>
    )

    // --- CONTEÚDO DA ABA RETORNO / RETENÇÃO ---
    const retentionContent = loadingRetention ? (
        <div className="flex items-center justify-center py-16">
            <ThreeDotsLoader />
        </div>
    ) : (
        <div className="space-y-3">
            <div className="mb-3 flex items-center gap-2">
                <Input
                    name="search-retention"
                    placeholder="Buscar cliente..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    variant="full-rounded"
                    prefix={<SearchIcon size={18} className="text-brand-inactive-text shrink-0" />}
                    label=""
                />
                <PeriodDropdown
                    options={RETENTION_PERIOD_OPTIONS}
                    value={String(retentionPeriod)}
                    setValue={(v) => setRetentionPeriod(Number(v))}
                    placeholder="Sem retorno há"
                />
            </div>

            {retentionOpportunities.length === 0 ? (
                <div className="py-12">
                    <IconPlaceholder
                        icon={CheckCircleIcon}
                        title="Retenção em dia!"
                        subtitle={`Nenhum cliente assíduo sem retorno há mais de ${retentionPeriod} dias.`}
                    />
                </div>
            ) : (
                <>
                    <InfoCard
                        title="Oportunidade de Reengajamento"
                        color="blue"
                        message={`${retentionOpportunities.length} cliente(s) que já realizaram atendimentos mas estão há mais de ${retentionPeriod} dias sem novo agendamento. Convide-os de volta para aumentar a recorrência.`}
                    />
                    <p className="text-xs font-semibold text-brand-inactive-text px-1">
                        {filteredRetention.length} cliente(s) sem retorno
                    </p>
                    {filteredRetention.map((opp) => {
                        const canNavigate = Boolean(opp.customer_id)
                        return (
                            <div
                                key={opp.key}
                                onClick={canNavigate ? () => goToCustomer(opp.customer_id) : undefined}
                                className={`bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 transition-all ${canNavigate ? "hover:border-brand-green cursor-pointer" : ""
                                    }`}
                            >
                                <div className="flex items-start gap-3">
                                    <UserProfileImage
                                        imageUrl={opp.customer_avatar}
                                        fullName={opp.customer_name}
                                        className="w-11 h-11 text-sm shrink-0"
                                    />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
                                            {opp.customer_name}
                                        </p>
                                        <p className="text-xs text-brand-inactive-text mt-0.5 truncate">
                                            Último: <span className="font-semibold text-brand-dark dark:text-dark-heading">{opp.last_service_name}</span> ({formatDateBr(opp.last_date)})
                                        </p>
                                        <p className="text-xs text-brand-inactive-text mt-0.5 truncate">
                                            Profissional: {opp.last_staff_name}
                                        </p>
                                    </div>
                                    <Badge variant="orange">
                                        Ausente há {opp.days_since_last}d
                                    </Badge>
                                </div>

                                <div className="mt-3 flex items-center justify-between text-xs pt-2 border-t border-brand-border/60 dark:border-dark-border/60">
                                    <div>
                                        <span className="text-brand-inactive-text">Histórico: </span>
                                        <span className="font-semibold text-brand-dark dark:text-dark-heading">
                                            {opp.total_completed} visita(s)
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-brand-inactive-text">Total gasto: </span>
                                        <span className="font-bold text-brand-green">
                                            {formatCurrency(opp.total_spent)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </>
            )}
        </div>
    )

    // --- CONTEÚDO PRINCIPAL DA SHEET ---
    const mainContent = (
        <div className="flex h-full flex-col bg-white dark:bg-dark-surface">
            <header className="z-10 flex shrink-0 items-center justify-between border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
                <div className="flex items-center gap-2.5">
                    <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Sugestões & Oportunidades</h2>
                </div>
                <Button variant="filled" onClick={onClose} size="icon" className="hidden lg:flex">
                    <XIcon className="h-5 w-5" />
                </Button>
            </header>

            {/* Content List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 pb-32 relative">
                {/* Navigation Tabs */}
                <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as any); setSearch("") }}>
                    <TabsList className="bg-transparent p-0 gap-4 sm:gap-6 w-full justify-start border-b border-brand-border dark:border-dark-border mb-6 overflow-x-auto custom-scrollbar flex-nowrap">
                        <TabsTrigger value="faltas" className="px-0 pb-3 text-xs sm:text-sm shrink-0 whitespace-nowrap">
                            Faltas ({noShowAlerts.length})
                        </TabsTrigger>
                        <TabsTrigger value="confirmacoes" className="px-0 pb-3 text-xs sm:text-sm shrink-0 whitespace-nowrap">
                            Confirmações ({pendingConfirmations.length})
                        </TabsTrigger>
                        <TabsTrigger value="reagendamentos" className="px-0 pb-3 text-xs sm:text-sm shrink-0 whitespace-nowrap">
                            Reagendamento ({rescheduleAlerts.length})
                        </TabsTrigger>
                        <TabsTrigger value="retencao" className="px-0 pb-3 text-xs sm:text-sm shrink-0 whitespace-nowrap">
                            Retorno ({retentionOpportunities.length})
                        </TabsTrigger>
                    </TabsList>
                </Tabs>

                {activeTab === "faltas" && noShowContent}
                {activeTab === "confirmacoes" && confirmationsContent}
                {activeTab === "reagendamentos" && rescheduleContent}
                {activeTab === "retencao" && retentionContent}
            </div>

            {/* Footer */}
            <footer className="shrink-0 border-t border-brand-border bg-white p-4 dark:border-dark-border dark:bg-dark-surface">
                <Button variant="outline" className="w-full h-11" onClick={onClose}>
                    Fechar
                </Button>
            </footer>
        </div>
    )

    // --- RENDERIZADOR RESPONSIVO (DESKTOP SHEET VS BOTTOM SHEET) ---
    if (isMobile) {
        return (
            <BottomSheet isOpen={isOpen} onClose={onClose}>
                {mainContent}
            </BottomSheet>
        )
    }

    return (
        <Portal>
            <div
                className={`fixed inset-0 z-50 bg-black/50 transition-opacity duration-300 ${isOpen ? "opacity-100" : "pointer-events-none opacity-0"
                    }`}
                style={{ zIndex }}
                onClick={onClose}
            >
                <div
                    className={`fixed right-4 top-4 bottom-4 w-[480px] max-w-[calc(100vw-32px)] overflow-hidden rounded-2xl bg-white shadow-2xl transition-all duration-300 dark:bg-dark-surface ${isOpen
                        ? "translate-x-0 opacity-100"
                        : "translate-x-[120%] opacity-100"
                        }`}
                    onClick={(e) => e.stopPropagation()}
                >
                    {mainContent}
                </div>
            </div>
        </Portal>
    )
}
