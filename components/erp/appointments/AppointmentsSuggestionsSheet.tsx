"use client"

import React, { useState, useEffect, useCallback, useMemo } from "react"
import { XIcon, SearchIcon, CheckCircleIcon, ClockIcon, TrendingUpIcon } from "@/lib/icons"
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
    FormDropdown,
} from "@/components/reusable"
import AlertModal from "@/components/reusable/AlertModal"
import Portal from "@/components/Portal"
import BottomSheet from "@/components/BottomSheet"
import { useMediaQuery } from "@/components/erp/hooks"
import { useModalLayer } from "@/lib/modal-stack"
import { getNoShowAlertsAction, getStagnantServicesAction } from "@/app/actions/erp/appointments"
import {
    getServicesPricingAlertsAction,
    updateServiceSalePriceAction,
    type ServicePricingAlert,
} from "@/app/actions/erp/servicos"
import type { NoShowAlert, NoShowCounts, StagnantService } from "@/lib/erp/appointment-insights"
import { formatCurrency } from "@/lib/utils"
import { useRouter } from "next/navigation"
import { useNotification } from "@/hooks/use-notification"

interface AppointmentsSuggestionsSheetProps {
    isOpen: boolean
    onClose: () => void
    partnerId: string
    storeId?: string
}

const PERIOD_OPTIONS = [
    { value: "15", label: "15 dias" },
    { value: "30", label: "30 dias" },
    { value: "60", label: "60 dias" },
    { value: "90", label: "90 dias" },
]

const getInitials = (name: string) =>
    name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() || "")
        .join("") || "?"

const formatDateBr = (iso: string) => {
    const [y, m, d] = String(iso || "").split("-").map(Number)
    if (!y || !m || !d) return iso || "-"
    return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`
}

export function AppointmentsSuggestionsSheet({ isOpen, onClose, partnerId, storeId }: AppointmentsSuggestionsSheetProps) {
    const isMobile = useMediaQuery("(max-width: 1023px)")
    const router = useRouter()
    const { success: notifySuccess, error: notifyError } = useNotification()

    const [activeTab, setActiveTab] = useState<"faltas" | "parados" | "precificacao">("faltas")

    // Filtros fixos por aba
    const [noShowPeriod, setNoShowPeriod] = useState<number>(90)
    const [stagnantPeriod, setStagnantPeriod] = useState<number>(90)
    const [noShowSearch, setNoShowSearch] = useState("")
    const [stagnantSearch, setStagnantSearch] = useState("")

    // Faltas (no-show)
    const [noShowAlerts, setNoShowAlerts] = useState<NoShowAlert[]>([])
    const [noShowCounts, setNoShowCounts] = useState<NoShowCounts | null>(null)
    const [loadingNoShow, setLoadingNoShow] = useState(false)

    // Serviços parados
    const [stagnantServices, setStagnantServices] = useState<StagnantService[]>([])
    const [loadingStagnant, setLoadingStagnant] = useState(false)

    // Precificação de serviços
    const [pricingAlerts, setPricingAlerts] = useState<ServicePricingAlert[]>([])
    const [pricingMeta, setPricingMeta] = useState<{
        counts: { loss: number; thin: number }
        thresholdPercent: number
        defaultMarginPercent: number
    } | null>(null)
    const [loadingPricing, setLoadingPricing] = useState(false)
    const [applyTarget, setApplyTarget] = useState<ServicePricingAlert | null>(null)
    const [isApplying, setIsApplying] = useState(false)

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

    const fetchStagnant = useCallback(() => {
        setLoadingStagnant(true)
        getStagnantServicesAction(partnerId, stagnantPeriod, storeId).then((res) => {
            if ("error" in res && res.error) {
                notifyError(res.error)
            } else if ("services" in res) {
                setStagnantServices(res.services)
            }
            setLoadingStagnant(false)
        })
    }, [partnerId, stagnantPeriod, storeId, notifyError])

    const fetchPricing = useCallback(() => {
        setLoadingPricing(true)
        getServicesPricingAlertsAction(partnerId, storeId).then((res) => {
            if ("error" in res && res.error) {
                notifyError(res.error)
            } else if ("alerts" in res) {
                setPricingAlerts(res.alerts)
                setPricingMeta({
                    counts: res.counts,
                    thresholdPercent: res.thresholdPercent,
                    defaultMarginPercent: res.defaultMarginPercent,
                })
            }
            setLoadingPricing(false)
        })
    }, [partnerId, storeId, notifyError])

    useEffect(() => {
        if (!isOpen) {
            setNoShowAlerts([])
            setNoShowCounts(null)
            setStagnantServices([])
            setPricingAlerts([])
            setPricingMeta(null)
            setNoShowSearch("")
            setStagnantSearch("")
            setApplyTarget(null)
            setActiveTab("faltas")
            return
        }
        fetchNoShows()
        fetchStagnant()
        fetchPricing()
    }, [isOpen, fetchNoShows, fetchStagnant, fetchPricing])

    useEffect(() => {
        if (isOpen) fetchNoShows()
    }, [noShowPeriod, isOpen, fetchNoShows])

    useEffect(() => {
        if (isOpen) fetchStagnant()
    }, [stagnantPeriod, isOpen, fetchStagnant])

    const filteredNoShows = useMemo(() => {
        if (!noShowSearch.trim()) return noShowAlerts
        const term = noShowSearch.toLowerCase().trim()
        return noShowAlerts.filter((a) => a.customer_name.toLowerCase().includes(term))
    }, [noShowAlerts, noShowSearch])

    const filteredStagnant = useMemo(() => {
        if (!stagnantSearch.trim()) return stagnantServices
        const term = stagnantSearch.toLowerCase().trim()
        return stagnantServices.filter(
            (s) => s.name.toLowerCase().includes(term) || (s.category || "").toLowerCase().includes(term)
        )
    }, [stagnantServices, stagnantSearch])

    const handleApplyPricing = async () => {
        if (!applyTarget) return
        const target = applyTarget
        const removePromo = target.cause === "promo"
        setIsApplying(true)

        const res = removePromo
            ? await updateServiceSalePriceAction({ serviceId: target.id, partnerId, clearPromotion: true })
            : await updateServiceSalePriceAction({ serviceId: target.id, partnerId, price: target.suggested_price })

        setIsApplying(false)
        setApplyTarget(null)

        if (res.error) {
            notifyError(res.error)
            return
        }

        notifySuccess(removePromo ? "Promoção removida!" : "Preço atualizado com sucesso!")
        fetchPricing()
        router.refresh()
    }

    const goToCustomer = (alert: NoShowAlert) => {
        if (!alert.customer_id) return
        onClose()
        router.push(`/erp/clientes/${alert.customer_id}`)
    }

    const goToService = (serviceId: string) => {
        onClose()
        router.push(`/erp/servicos?view=${serviceId}`)
    }

    // --- CONTEÚDO DA ABA FALTAS ---
    const noShowContent = loadingNoShow ? (
        <div className="flex items-center justify-center py-16">
            <ThreeDotsLoader />
        </div>
    ) : (
        <div className="space-y-3">
            <div className="mb-3 flex items-center justify-between">
                <FormDropdown
                    options={PERIOD_OPTIONS}
                    value={String(noShowPeriod)}
                    setValue={(v) => setNoShowPeriod(Number(v))}
                    placeholder="Período"
                    width="w-40"
                />
                <div className="w-56">
                    <Input
                        name="search-no-show"
                        placeholder="Buscar cliente..."
                        value={noShowSearch}
                        onChange={(e) => setNoShowSearch(e.target.value)}
                        variant="full-rounded"
                        prefix={<SearchIcon size={18} className="text-brand-inactive-text shrink-0" />}
                        label=""
                    />
                </div>
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
                                onClick={canNavigate ? () => goToCustomer(a) : undefined}
                                className={`bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 transition-all ${canNavigate
                                    ? "hover:border-brand-green cursor-pointer"
                                    : ""
                                    }`}
                            >
                                <div className="flex items-start gap-3">
                                    <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center text-sm font-bold text-brand-inactive-text">
                                        {getInitials(a.customer_name)}
                                    </div>
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

    // --- CONTEÚDO DA ABA PARADOS ---
    const stagnantContent = loadingStagnant ? (
        <div className="flex items-center justify-center py-16">
            <ThreeDotsLoader />
        </div>
    ) : (
        <div className="space-y-3">
            <div className="mb-3 flex items-center justify-between">
                <FormDropdown
                    options={PERIOD_OPTIONS}
                    value={String(stagnantPeriod)}
                    setValue={(v) => setStagnantPeriod(Number(v))}
                    placeholder="Período"
                    width="w-40"
                />
                <div className="w-56">
                    <Input
                        name="search-stagnant"
                        placeholder="Buscar..."
                        value={stagnantSearch}
                        onChange={(e) => setStagnantSearch(e.target.value)}
                        variant="full-rounded"
                        prefix={<SearchIcon size={18} className="text-brand-inactive-text shrink-0" />}
                        label=""
                    />
                </div>
            </div>

            {stagnantServices.length === 0 ? (
                <div className="py-12">
                    <IconPlaceholder
                        icon={ClockIcon}
                        title="Nenhum serviço parado!"
                        subtitle={`Todos os seus serviços possuem agendamentos ou foram cadastrados há menos de ${stagnantPeriod} dias.`}
                    />
                </div>
            ) : (
                <>
                    <p className="text-xs font-semibold text-brand-inactive-text px-1">
                        {filteredStagnant.length} serviço(s) sem agendamento há mais de {stagnantPeriod} dias
                    </p>
                    {filteredStagnant.map((s) => (
                        <div
                            key={s.id}
                            onClick={() => goToService(s.id)}
                            className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 hover:border-brand-green transition-all cursor-pointer"
                        >
                            <div className="flex items-start gap-3">
                                <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center overflow-hidden border border-brand-border dark:border-dark-border">
                                    {s.images && s.images[0] ? (
                                        <img src={s.images[0]} alt={s.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="text-sm font-bold text-brand-inactive-text">
                                            {getInitials(s.name)}
                                        </span>
                                    )}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
                                        {s.name}
                                    </p>
                                    <p className="text-xs text-brand-inactive-text mt-0.5">
                                        {s.category || "Sem categoria"}
                                        {s.duration_minutes ? ` • ${s.duration_minutes} min` : ""}
                                    </p>
                                </div>
                                <Badge variant="blue">Parado há {s.days_stagnant}d</Badge>
                            </div>

                            <div className="mt-3 flex items-center justify-between pt-2.5 border-t border-brand-border/60 dark:border-dark-border/60">
                                <div>
                                    <span className="text-xs text-brand-inactive-text block">Preço de Venda</span>
                                    <div className="flex items-center gap-2">
                                        {s.promotional_price && s.promotional_price > 0 && s.promotional_price < s.price ? (
                                            <>
                                                <span className="text-sm font-bold line-through text-brand-inactive-text">
                                                    {formatCurrency(s.price)}
                                                </span>
                                                <span className="text-sm font-bold text-brand-green">
                                                    {formatCurrency(s.promotional_price)}
                                                </span>
                                            </>
                                        ) : (
                                            <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                {formatCurrency(s.price)}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <span className="text-xs text-brand-inactive-text">
                                    Cadastrado em {formatDateBr(String(s.created_at).slice(0, 10))}
                                </span>
                            </div>
                        </div>
                    ))}
                </>
            )}
        </div>
    )

    // --- CONTEÚDO DA ABA PRECIFICAÇÃO ---
    const pricingContent = loadingPricing ? (
        <div className="flex items-center justify-center py-16">
            <ThreeDotsLoader />
        </div>
    ) : pricingAlerts.length === 0 ? (
        <div className="py-12">
            <IconPlaceholder
                icon={CheckCircleIcon}
                title="Preços em dia!"
                subtitle="Nenhum serviço está sendo vendido abaixo do custo ou com margem apertada."
            />
        </div>
    ) : (
        <div className="space-y-3">
            {pricingMeta && (
                <InfoCard
                    title="Saúde dos Preços"
                    color={pricingMeta.counts.loss > 0 ? "red" : "orange"}
                    message={`${pricingMeta.counts.loss} serviço(s) abaixo do custo e ${pricingMeta.counts.thin} com margem apertada (limite de ${pricingMeta.thresholdPercent}% - metade da sua margem padrão de ${pricingMeta.defaultMarginPercent}%). Comece pelos de maior impacto.`}
                />
            )}
            {pricingAlerts.map((a) => {
                const isLoss = a.status === "loss"
                const isPromoFix = a.cause === "promo"
                return (
                    <div
                        key={a.id}
                        onClick={() => goToService(a.id)}
                        className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 hover:border-brand-green transition-all cursor-pointer"
                    >
                        <div className="flex items-start gap-3">
                            <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center overflow-hidden border border-brand-border dark:border-dark-border">
                                {a.images && a.images[0] ? (
                                    <img src={a.images[0]} alt={a.name} className="w-full h-full object-cover" />
                                ) : (
                                    <span className="text-sm font-bold text-brand-inactive-text">
                                        {getInitials(a.name)}
                                    </span>
                                )}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
                                    {a.name}
                                </p>
                                <p className="text-xs text-brand-inactive-text mt-0.5">
                                    {a.category || "Sem categoria"}
                                    {a.duration_minutes ? ` • ${a.duration_minutes} min` : ""}
                                </p>
                            </div>
                            <Badge variant={isLoss ? "red" : "orange"}>
                                {isLoss ? "Abaixo do custo" : "Margem apertada"}
                            </Badge>
                        </div>

                        {isPromoFix && (
                            <p className="mt-2 text-xs font-semibold text-brand-orange">
                                O preço promocional está abaixo do custo
                            </p>
                        )}

                        <div className="mt-3 grid grid-cols-3 gap-2 text-xs pt-2.5 border-t border-brand-border/60 dark:border-dark-border/60">
                            <div>
                                <span className="text-brand-inactive-text block">Custo</span>
                                <span className="font-bold text-brand-dark dark:text-dark-heading">
                                    {formatCurrency(a.cost_price)}
                                </span>
                            </div>
                            <div>
                                <span className="text-brand-inactive-text block">Preço atual</span>
                                <span className={`font-bold ${isLoss ? "text-brand-red line-through" : "text-brand-dark dark:text-dark-heading"}`}>
                                    {formatCurrency(a.effective_price)}
                                </span>
                            </div>
                            <div>
                                <span className="text-brand-inactive-text block">Margem</span>
                                <span className={`font-bold ${isLoss ? "text-brand-red" : "text-brand-orange"}`}>
                                    {a.margin_percent !== null ? `${a.margin_percent}%` : "-"}
                                </span>
                            </div>
                        </div>

                        <div className="mt-2.5 flex items-center justify-between gap-2">
                            <div className="text-xs text-brand-inactive-text min-w-0">
                                {isLoss ? (
                                    <>
                                        Perde{" "}
                                        <span className="font-bold text-brand-red">
                                            {formatCurrency(a.loss_per_unit)}
                                        </span>
                                        /atendimento
                                    </>
                                ) : (
                                    <>
                                        Potencial:{" "}
                                        <span className="font-bold text-brand-green">
                                            +{formatCurrency(a.potential_gain_per_unit)}
                                        </span>
                                        /atendimento
                                    </>
                                )}
                            </div>
                            <Button
                                size="sm"
                                variant={isPromoFix ? "outlineorange" : "outline"}
                                className="h-8 text-xs gap-1.5 shrink-0"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    setApplyTarget(a)
                                }}
                            >
                                <TrendingUpIcon size={14} className="text-brand-primary" />
                                {isPromoFix ? "Remover promoção" : `Aplicar ${formatCurrency(a.suggested_price)}`}
                            </Button>
                        </div>
                    </div>
                )
            })}
        </div>
    )

    // --- CONTEÚDO DA SHEET PRINCIPAL ---
    const mainContent = (
        <div className="flex h-full flex-col bg-white dark:bg-dark-surface">
            <header className="z-10 flex shrink-0 items-center justify-between border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
                <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Sugestões & Oportunidades</h2>
                <Button variant="filled" onClick={onClose} size="icon" className="hidden lg:flex">
                    <XIcon className="h-5 w-5" />
                </Button>
            </header>

            {/* Content List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 pb-32 relative">
                {/* Navigation Tabs */}
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
                    <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b border-brand-border dark:border-dark-border mb-6">
                        <TabsTrigger value="faltas" className="px-0 pb-3 text-sm">
                            Faltas ({noShowAlerts.length})
                        </TabsTrigger>
                        <TabsTrigger value="parados" className="px-0 pb-3 text-sm">
                            Parados ({stagnantServices.length})
                        </TabsTrigger>
                        <TabsTrigger value="precificacao" className="px-0 pb-3 text-sm">
                            Precificação ({pricingAlerts.length})
                        </TabsTrigger>
                    </TabsList>
                </Tabs>

                {activeTab === "faltas" ? noShowContent : activeTab === "parados" ? stagnantContent : pricingContent}
            </div>

            {/* Footer */}
            <footer className="shrink-0 border-t border-brand-border bg-white p-4 dark:border-dark-border dark:bg-dark-surface">
                <Button variant="outline" className="w-full h-11" onClick={onClose}>
                    Fechar
                </Button>
            </footer>
        </div>
    )

    // --- MODAL DE CONFIRMAÇÃO (APLICAR PREÇO / REMOVER PROMOÇÃO) ---
    const applyConfirmModal = applyTarget ? (
        <AlertModal
            isOpen
            onClose={() => {
                if (!isApplying) setApplyTarget(null)
            }}
            onConfirm={handleApplyPricing}
            variant={applyTarget.cause === "promo" ? "warning" : "info"}
            title={applyTarget.cause === "promo" ? "Remover promoção?" : "Aplicar preço sugerido?"}
            confirmText={applyTarget.cause === "promo" ? "Remover" : "Aplicar"}
            isLoading={isApplying}
            disabled={isApplying}
            message={
                <div className="space-y-1.5 text-left">
                    <p className="font-bold text-brand-dark dark:text-dark-heading">{applyTarget.name}</p>
                    {applyTarget.cause === "promo" ? (
                        <>
                            <p>
                                Promoção atual: <strong>{formatCurrency(applyTarget.effective_price)}</strong> · Custo:{" "}
                                <strong>{formatCurrency(applyTarget.cost_price)}</strong>
                            </p>
                            <p>
                                Remover a promoção volta o preço para{" "}
                                <strong>{formatCurrency(applyTarget.base_price)}</strong>.
                            </p>
                        </>
                    ) : (
                        <>
                            <p>
                                Preço atual: <strong>{formatCurrency(applyTarget.effective_price)}</strong> · Custo:{" "}
                                <strong>{formatCurrency(applyTarget.cost_price)}</strong>
                            </p>
                            <p>
                                Novo preço: <strong>{formatCurrency(applyTarget.suggested_price)}</strong>
                                {pricingMeta && ` (margem padrão de ${pricingMeta.defaultMarginPercent}%)`}
                            </p>
                        </>
                    )}
                </div>
            }
        />
    ) : null

    // --- RENDERIZADOR RESPONSIVO (DESKTOP SHEET VS BOTTOM SHEET) ---
    if (isMobile) {
        return (
            <>
                <BottomSheet isOpen={isOpen} onClose={onClose}>
                    {mainContent}
                </BottomSheet>
                {applyConfirmModal}
            </>
        )
    }

    return (
        <>
            <Portal>
                <div
                    className={`fixed inset-0 z-50 bg-black/50 transition-opacity duration-300 ${isOpen ? "opacity-100" : "pointer-events-none opacity-0"
                        }`}
                    style={{ zIndex }}
                    onClick={onClose}
                >
                    <div
                        className={`fixed right-4 top-4 bottom-4 w-[450px] overflow-hidden rounded-2xl bg-white shadow-2xl transition-all duration-300 dark:bg-dark-surface ${isOpen
                            ? "translate-x-0 opacity-100"
                            : "translate-x-[120%] opacity-100"
                            }`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {mainContent}
                    </div>
                </div>
            </Portal>

            {applyConfirmModal}
        </>
    )
}
