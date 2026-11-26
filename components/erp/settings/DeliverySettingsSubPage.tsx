"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
    Button,
    Input,
    FormDropdown,
    DefaultModal,
    MoneyInput,
    IconPlaceholder,
    TimePicker,
    FormSection,
    Accordion,
    Checkbox,
    ActionsDropdown,
    AlertModal,
    Pagination,
    ThreeDotsLoader,
    SidebarCard,
    SavingStatusModal,
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
} from "@/components/reusable"
import { Switch } from "@/components/reusable/Switch"
import { ChevronLeftIcon, ClockIcon, PlusIcon, SaveIcon, TruckIcon } from "@/lib/icons"
import { FadeIn } from "@/components/animations/FadeIn"
import { formatCurrency } from "@/lib/utils"
import {
    deleteCarrierFreeShippingRuleAction,
    deleteDeliveryFeeRuleAction,
    getCarrierFreeShippingRulesAction,
    getPartnerDeliveryConfigAction,
    getServiceAttendanceSettingsAction,
    upsertCarrierFreeShippingRuleAction,
    upsertDeliveryFeeRuleAction,
    upsertPartnerDeliveryConfigAction,
    upsertServiceAttendanceSettingsAction,
} from "@/app/actions/shared/delivery"
import {
    BRAZILIAN_STATES,
    type BrazilianStateUf,
    type CarrierFreeShippingAppliesTo,
    type CarrierFreeShippingRule,
} from "@/lib/services/shipping/carrier-free-shipping"

import { planStarIconForTarget, usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal"
import { useNotification } from "@/hooks/use-notification"
import { useMediaQuery } from "@/hooks"

function toMinutes(time: string): number {
    const [h, m] = String(time || "00:00").split(":").map((v) => Number(v || 0))
    return (h * 60) + m
}

function rangeToMinutes(start: string, end: string): Set<number> {
    const startM = toMinutes(start);
    const endM = toMinutes(end);
    const minutes = new Set<number>();
    if (startM === endM) {
        for (let i = 0; i < 1440; i++) minutes.add(i);
    } else if (startM < endM) {
        for (let i = startM; i < endM; i++) minutes.add(i);
    } else {
        for (let i = startM; i < 1440; i++) minutes.add(i);
        for (let i = 0; i < endM; i++) minutes.add(i);
    }
    return minutes;
}

function checkOverlap(start1: string, end1: string, start2: string, end2: string): boolean {
    const m1 = rangeToMinutes(start1, end1);
    const m2 = rangeToMinutes(start2, end2);
    for (const m of m1) {
        if (m2.has(m)) return true;
    }
    return false;
}

export function DeliverySettingsSubPage({ partnerId, storeId, onBack, planGate }: { partnerId: string; storeId?: string | null; onBack: () => void; planGate?: { requiredPlanSlug: "crescer" | "escalar" } }) {
    const { openPlanUpgrade } = usePlanUpgrade()
    const { success: notifySuccess, error: notifyError } = useNotification()
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [planSlug, setPlanSlug] = useState("free")
    const [isScrolled, setIsScrolled] = useState(false)
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const [advancedEnabled, setAdvancedEnabled] = useState(false)
    const [chargeByDistance, setChargeByDistance] = useState(false)
    const [editingRule, setEditingRule] = useState<any | null>(null)
    const [ruleToDelete, setRuleToDelete] = useState<any | null>(null)
    const [activeTab, setActiveTab] = useState<string>("delivery")
    const [settings, setSettings] = useState({
        baseFee: "0",
        includedKm: "0",
        extraKmPrice: "0",
        maxDeliveryKm: "",
        isDeliveryEnabled: true,
        isPickupEnabled: true,
        freeDeliveryThreshold: "",
        deliveryPayer: "customer" as "customer" | "seller",
    })
    const [serviceSettings, setServiceSettings] = useState<{
        maxServiceKm: string
        travelFeeMode: "free" | "flat" | "per_km" | "tiered"
        freeTravelKm: string
        travelFlatFee: string
        travelPerKm: string
        enforceServiceArea: boolean
        hasOverride: boolean
    }>({
        maxServiceKm: "",
        travelFeeMode: "free",
        freeTravelKm: "0",
        travelFlatFee: "0",
        travelPerKm: "0",
        enforceServiceArea: true,
        hasOverride: false,
    })
    const [rules, setRules] = useState<any[]>([])
    const [isRuleModalOpen, setIsRuleModalOpen] = useState(false)
    const [newRule, setNewRule] = useState<{ startTime: string; endTime: string; type: "fixed" | "multiplier"; value: string }>({ startTime: "18:00", endTime: "22:00", type: "fixed", value: "0" })
    const [rulePage, setRulePage] = useState(1)
    const [hasSuperFrete, setHasSuperFrete] = useState(false)
    const [carrierRules, setCarrierRules] = useState<CarrierFreeShippingRule[]>([])
    const [carrierRulePage, setCarrierRulePage] = useState(1)
    const [isCarrierRuleModalOpen, setIsCarrierRuleModalOpen] = useState(false)
    const [editingCarrierRule, setEditingCarrierRule] = useState<CarrierFreeShippingRule | null>(null)
    const [carrierRuleToDelete, setCarrierRuleToDelete] = useState<CarrierFreeShippingRule | null>(null)
    const [savingCarrierRule, setSavingCarrierRule] = useState(false)
    const [carrierRuleForm, setCarrierRuleForm] = useState<{
        minOrderValue: string
        allStates: boolean
        states: BrazilianStateUf[]
        appliesTo: CarrierFreeShippingAppliesTo
        isActive: boolean
    }>({
        minOrderValue: "",
        allStates: false,
        states: [],
        appliesTo: "cheapest",
        isActive: true,
    })
    const isMobile = useMediaQuery("(max-width: 767px)")
    const rulesPerPage = isMobile ? 4 : 6
    const totalRulePages = Math.max(1, Math.ceil(rules.length / rulesPerPage))
    const paginatedRules = useMemo(() => {
        const start = (rulePage - 1) * rulesPerPage
        return rules.slice(start, start + rulesPerPage)
    }, [rules, rulesPerPage, rulePage])
    const totalCarrierRulePages = Math.max(1, Math.ceil(carrierRules.length / rulesPerPage))
    const paginatedCarrierRules = useMemo(() => {
        const start = (carrierRulePage - 1) * rulesPerPage
        return carrierRules.slice(start, start + rulesPerPage)
    }, [carrierRules, rulesPerPage, carrierRulePage])

    const handleBack = useCallback(() => onBack(), [onBack])

    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
    }, [])

    const isFree = planSlug === "free"

    const handlePayerSelect = useCallback((payer: "customer" | "seller") => {
        if (isFree) {
            openPlanUpgrade("crescer")
            return
        }
        setSettings(s => ({ ...s, deliveryPayer: payer }))
    }, [isFree, openPlanUpgrade])

    async function reload() {
        setLoading(true)
        const res = await getPartnerDeliveryConfigAction(partnerId, storeId)
        if (res.success) {
            setPlanSlug(res.planSlug)
            setAdvancedEnabled(res.capability.advancedEnabled)
            setHasSuperFrete(Boolean(res.hasSuperFrete))
            setSettings({
                baseFee: String(res.settings.baseFee || 0),
                includedKm: String(res.settings.includedKm || 0),
                extraKmPrice: String(res.settings.extraKmPrice || 0),
                maxDeliveryKm: res.settings.maxDeliveryKm == null ? "" : String(res.settings.maxDeliveryKm),
                isDeliveryEnabled: Boolean(res.settings.isDeliveryEnabled),
                isPickupEnabled: Boolean(res.settings.isPickupEnabled ?? true),
                freeDeliveryThreshold: res.settings.freeDeliveryThreshold == null ? "" : String(res.settings.freeDeliveryThreshold),
                deliveryPayer: res.settings.deliveryPayer || "customer",
            })
            setChargeByDistance(Number(res.settings.extraKmPrice || 0) > 0 || res.settings.maxDeliveryKm != null)
            setRules(res.rules || [])
            setRulePage(1)

            const [svcRes, carrierRulesRes] = await Promise.all([
                getServiceAttendanceSettingsAction(partnerId, storeId),
                res.hasSuperFrete
                    ? getCarrierFreeShippingRulesAction(partnerId, storeId)
                    : Promise.resolve({ success: true as const, rules: [] as CarrierFreeShippingRule[] }),
            ])
            if (carrierRulesRes.success) {
                setCarrierRules(carrierRulesRes.rules)
                setCarrierRulePage(1)
            }
            setServiceSettings({
                maxServiceKm: svcRes.maxServiceKm == null ? "" : String(svcRes.maxServiceKm),
                travelFeeMode: svcRes.travelFeeMode,
                freeTravelKm: String(svcRes.freeTravelKm || 0),
                travelFlatFee: String(svcRes.travelFlatFee || 0),
                travelPerKm: String(svcRes.travelPerKm || 0),
                enforceServiceArea: Boolean(svcRes.enforceServiceArea ?? true),
                hasOverride: svcRes.maxServiceKm != null
                    || svcRes.travelFeeMode !== "free"
                    || svcRes.freeTravelKm > 0
                    || svcRes.travelFlatFee > 0
                    || svcRes.travelPerKm > 0
                    || !svcRes.enforceServiceArea,
            })
        }
        setLoading(false)
    }

    useEffect(() => { void reload() }, [partnerId])

    if (loading) return <div className="flex h-full min-h-[200px] w-full items-center justify-center">
        <ThreeDotsLoader />
    </div>

    return (
        <FadeIn className="h-full">
            <div className="flex flex-col h-full bg-white dark:bg-dark-background overflow-hidden">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full w-full">
                    <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto custom-scrollbar w-full relative pb-20 md:pb-0">

                        {/* Sticky Header */}
                        <div className="sticky top-0 z-30 w-full max-w-[1300px] mx-auto bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out">
                            <div className="max-w-[1300px] mx-auto relative px-4 md:px-6">

                                {/* Back button - desktop only */}
                                <div className={`absolute -left-12 top-3 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                                    <Button variant="filled" onClick={handleBack} className="w-10 h-10 p-0 flex items-center justify-center">
                                        <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                    </Button>
                                </div>

                                {/* Title row */}
                                <div className="hidden md:flex items-start justify-between md:py-0 md:mb-0">
                                    <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                        <h1 className={`font-bold transition-all duration-500 ease-in-out flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                            <span className="truncate">Configurações de Entrega</span>
                                        </h1>

                                        <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                            Gerencie taxas de delivery{hasSuperFrete ? ", frete por transportadora" : ""} e atendimento a domicílio
                                        </div>
                                    </div>

                                    {/* Desktop action buttons */}
                                    <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                                        <Button variant="outline" onClick={handleBack} disabled={saving}>
                                            Cancelar
                                        </Button>
                                        <Button
                                            disabled={saving}
                                            onClick={async () => {
                                                if (!settings.isDeliveryEnabled && !settings.isPickupEnabled) {
                                                    notifyError("Erro de validação", "Pelo menos um método de entrega (Entrega ou Retirada) deve estar ativo.")
                                                    return
                                                }
                                                setSaving(true)
                                                const res = await upsertPartnerDeliveryConfigAction({
                                                    partnerId,
                                                    storeId,
                                                    settings: {
                                                        storeId,
                                                        baseFee: Number(settings.baseFee || 0),
                                                        includedKm: Number(settings.includedKm || 0),
                                                        extraKmPrice: chargeByDistance ? Number(settings.extraKmPrice || 0) : 0,
                                                        maxDeliveryKm: chargeByDistance && settings.maxDeliveryKm ? Number(settings.maxDeliveryKm) : null,
                                                        isDeliveryEnabled: settings.isDeliveryEnabled,
                                                        isPickupEnabled: settings.isPickupEnabled,
                                                        freeDeliveryThreshold: settings.freeDeliveryThreshold ? Number(settings.freeDeliveryThreshold) : null,
                                                        deliveryPayer: settings.deliveryPayer,
                                                    },
                                                })
                                                if (res.success) {
                                                    notifySuccess("Configurações salvas", "As configurações de entrega foram salvas com sucesso.")
                                                } else {
                                                    notifyError("Erro ao salvar", res.error || "Ocorreu um erro ao salvar as configurações.")
                                                }
                                                const svcRes = await upsertServiceAttendanceSettingsAction({
                                                    partnerId,
                                                    storeId,
                                                    settings: {
                                                        maxServiceKm: serviceSettings.maxServiceKm ? Number(serviceSettings.maxServiceKm) : null,
                                                        travelFeeMode: serviceSettings.travelFeeMode,
                                                        freeTravelKm: Number(serviceSettings.freeTravelKm || 0),
                                                        travelFlatFee: Number(serviceSettings.travelFlatFee || 0),
                                                        travelPerKm: Number(serviceSettings.travelPerKm || 0),
                                                        enforceServiceArea: serviceSettings.enforceServiceArea,
                                                    },
                                                })
                                                if (!svcRes.success) {
                                                    notifyError("Erro ao salvar atendimento", svcRes.error || "Não foi possível salvar as configurações de atendimento de serviços.")
                                                }
                                                await reload()
                                                setSaving(false)
                                            }}
                                            leftIcon={<SaveIcon size={18} />}
                                        >
                                            {saving ? "Salvando..." : "Salvar"}
                                        </Button>
                                    </div>
                                </div>

                                {/* Tabs */}
                                <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                                    <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                        <TabsTrigger value="delivery">{hasSuperFrete ? "Delivery" : "Entrega"}</TabsTrigger>
                                        {hasSuperFrete && (
                                            <TabsTrigger value="carrier">Transportadora</TabsTrigger>
                                        )}
                                        <TabsTrigger value="service">Atendimento a domicílio</TabsTrigger>
                                    </TabsList>
                                </div>
                            </div>
                        </div>

                        {/* Content Body */}
                        <div className="px-3 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
                            <AnimatePresence mode="wait">
                                {/* Tab: Entrega */}
                                <TabsContent value="delivery" className="mt-0 focus-visible:outline-none">
                                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                        <div className="grid grid-cols-12 gap-y-8 lg:gap-y-0 relative">
                                            {/* Main Content - Left Column */}
                                            <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12 space-y-4">
                                                {/* Configurações Gerais */}
                                                <FormSection title="Configurações Gerais">
                                                    <div className="space-y-6">
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex flex-col gap-1">
                                                                <span className="font-bold text-md text-brand-dark dark:text-dark-heading">Entrega ativa</span>
                                                                <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Permitir que clientes selecionem entrega no checkout</span>
                                                            </div>
                                                            <Switch
                                                                checked={settings.isDeliveryEnabled}
                                                                onCheckedChange={(checked) => {
                                                                    if (!checked && !settings.isPickupEnabled) {
                                                                        notifyError("Ação não permitida", "Pelo menos um método de entrega (Entrega ou Retirada) deve estar ativo.")
                                                                        return
                                                                    }
                                                                    setSettings(s => ({ ...s, isDeliveryEnabled: checked }))
                                                                }}
                                                                className={isFree ? "opacity-50 pointer-events-none" : ""}
                                                            />
                                                        </div>

                                                        <div className="flex items-center justify-between">
                                                            <div className="flex flex-col gap-1">
                                                                <span className="font-bold text-md text-brand-dark dark:text-dark-heading">Retirada ativa</span>
                                                                <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Permitir que clientes retirem o pedido no local</span>
                                                            </div>
                                                            <Switch
                                                                checked={settings.isPickupEnabled}
                                                                onCheckedChange={(checked) => {
                                                                    if (!checked && !settings.isDeliveryEnabled) {
                                                                        notifyError("Ação não permitida", "Pelo menos um método de entrega (Entrega ou Retirada) deve estar ativo.")
                                                                        return
                                                                    }
                                                                    setSettings(s => ({ ...s, isPickupEnabled: checked }))
                                                                }}
                                                                className={isFree ? "opacity-50 pointer-events-none" : ""}
                                                            />
                                                        </div>

                                                    </div>
                                                </FormSection>

                                                {/* Distância */}
                                                {settings.isDeliveryEnabled && (
                                                    <div className="mt-8">
                                                        <div className="border-t border-brand-border dark:border-dark-border w-full"></div>
                                                        <Accordion
                                                            title={
                                                                <span className="text-md lg:text-xl font-medium text-brand-dark dark:text-dark-heading inline-flex items-center gap-2">
                                                                    Distância e Entrega
                                                                    {isFree && <img src={planStarIconForTarget("crescer")!} alt="" className="w-4 h-4 object-contain" />}
                                                                </span>
                                                            }
                                                            defaultOpen={true}
                                                            triggerClass="text-lg font-bold text-brand-dark dark:text-dark-heading mb-5 mt-6 text-left"
                                                        >
                                                            <div className="space-y-6 pb-4">
                                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                                                    <MoneyInput
                                                                        label="Taxa base"
                                                                        value={settings.baseFee}
                                                                        onChange={(val) => setSettings((s) => ({ ...s, baseFee: String(val) }))}
                                                                    />
                                                                    <MoneyInput
                                                                        label="Entrega grátis a partir de"
                                                                        value={settings.freeDeliveryThreshold}
                                                                        onChange={(val) => setSettings((s) => ({ ...s, freeDeliveryThreshold: val ? String(val) : "" }))}
                                                                        placeholder="R$ 0,00"
                                                                    />
                                                                    <Input
                                                                        label="KM incluído"
                                                                        value={settings.includedKm}
                                                                        onChange={(e) => setSettings((s) => ({ ...s, includedKm: e.target.value }))}
                                                                        suffix="km"
                                                                    />
                                                                </div>

                                                                <div className="pt-2">
                                                                    <Checkbox
                                                                        label="Cobrar por quilometragem adicional"
                                                                        checked={chargeByDistance}
                                                                        onChange={(checked) => {
                                                                            if (!advancedEnabled) {
                                                                                openPlanUpgrade("escalar")
                                                                                return
                                                                            }
                                                                            setChargeByDistance(Boolean(checked))
                                                                        }}
                                                                    />
                                                                    {!advancedEnabled && (
                                                                        <img src={planStarIconForTarget("escalar")!} alt="" className="w-4 h-4 object-contain" />
                                                                    )}
                                                                </div>

                                                                {chargeByDistance && (
                                                                    <FadeIn>
                                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                                                                            <Input
                                                                                disabled={!advancedEnabled}
                                                                                label="Distância máxima"
                                                                                value={settings.maxDeliveryKm}
                                                                                onChange={(e) => setSettings((s) => ({ ...s, maxDeliveryKm: e.target.value }))}
                                                                                suffix="km"
                                                                            />
                                                                            <MoneyInput
                                                                                disabled={!advancedEnabled}
                                                                                label="Preço por KM extra"
                                                                                value={settings.extraKmPrice}
                                                                                onChange={(val) => setSettings((s) => ({ ...s, extraKmPrice: String(val) }))}
                                                                            />
                                                                        </div>
                                                                    </FadeIn>
                                                                )}
                                                            </div>
                                                        </Accordion>
                                                    </div>
                                                )}

                                                {/* Regras por horário */}
                                                {settings.isDeliveryEnabled && (
                                                    <div className="mt-8">
                                                        <div className="border-t border-brand-border dark:border-dark-border w-full"></div>
                                                        <Accordion
                                                            title={
                                                                <span className="text-md lg:text-xl font-medium text-brand-dark dark:text-dark-heading inline-flex items-center gap-2">
                                                                    Regras por Horário
                                                                    {!advancedEnabled && (
                                                                        <img src={planStarIconForTarget("escalar")!} alt="" className="w-4 h-4 object-contain" />
                                                                    )}
                                                                </span>
                                                            }
                                                            defaultOpen={false}
                                                            triggerClass="text-lg font-bold text-brand-dark dark:text-dark-heading mb-5 mt-6 text-left"
                                                            onToggle={(isOpen) => {
                                                                if (isOpen && !advancedEnabled) {
                                                                    openPlanUpgrade("escalar")
                                                                    return false
                                                                }
                                                            }}
                                                        >
                                                            <div className="space-y-6 pb-4">
                                                                <div className="flex items-center justify-between">
                                                                    <p className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Altere o valor da entrega em horários específicos.</p>
                                                                    <Button
                                                                        variant="link"
                                                                        disabled={!advancedEnabled}
                                                                        onClick={() => setIsRuleModalOpen(true)}
                                                                        leftIcon={<PlusIcon className="w-4 h-4" />}
                                                                    >
                                                                        Adicionar regra
                                                                    </Button>
                                                                </div>

                                                                {rules.length === 0 ? (
                                                                    <IconPlaceholder
                                                                        icon={ClockIcon}
                                                                        title="Nenhuma regra cadastrada"
                                                                        subtitle="Adicione regras para alterar o valor da entrega em horários específicos."
                                                                    />
                                                                ) : (
                                                                    <>
                                                                        {/* Desktop Table */}
                                                                        <div className="hidden md:block w-full overflow-hidden bg-white dark:bg-dark-background">
                                                                            <div className="overflow-x-auto">
                                                                                <table className="w-full border-separate border-spacing-0">
                                                                                    <thead>
                                                                                        <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                                                            <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 text-left rounded-l-lg">Início</th>
                                                                                            <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 text-left">Fim</th>
                                                                                            <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 text-left">Tipo</th>
                                                                                            <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 text-left">Valor</th>
                                                                                            <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 text-center rounded-r-lg">Ações</th>
                                                                                        </tr>
                                                                                    </thead>
                                                                                    <tbody>
                                                                                        {paginatedRules.map((rule) => {
                                                                                            const baseFeeNum = Number(settings.baseFee || 0);
                                                                                            const finalFee = rule.type === "fixed" ? (baseFeeNum + Number(rule.value || 0)) : (baseFeeNum * Number(rule.value || 0));
                                                                                            return (
                                                                                                <tr key={rule.id} className="group hover:bg-brand-gray/50 dark:hover:bg-dark-border/10 transition-colors bg-white dark:bg-dark-background">
                                                                                                    <td className="py-4 px-5 border-b border-brand-border dark:border-dark-border text-[13px] font-medium text-brand-dark dark:text-dark-heading text-left">{rule.startTime}</td>
                                                                                                    <td className="py-4 px-5 border-b border-brand-border dark:border-dark-border text-[13px] font-medium text-brand-dark dark:text-dark-heading text-left">{rule.endTime}</td>
                                                                                                    <td className="py-4 px-5 border-b border-brand-border dark:border-dark-border text-[13px] font-medium text-brand-dark dark:text-dark-heading text-left">
                                                                                                        {rule.type === "fixed" ? "Acréscimo" : "Multiplicador"}
                                                                                                    </td>
                                                                                                    <td className="py-4 px-5 border-b border-brand-border dark:border-dark-border text-[13px] font-bold text-brand-dark dark:text-dark-heading text-left">
                                                                                                        <div>{rule.type === "fixed" ? formatCurrency(rule.value) : `${rule.value}x`}</div>
                                                                                                        <div className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5 font-normal">
                                                                                                            Taxa final = {formatCurrency(finalFee)}
                                                                                                        </div>
                                                                                                    </td>
                                                                                                    <td className="py-4 px-5 border-b border-brand-border dark:border-dark-border text-center">
                                                                                                        <div className="flex justify-center" onClick={(e) => e.stopPropagation()}>
                                                                                                            <ActionsDropdown
                                                                                                                onEdit={() => {
                                                                                                                    setEditingRule(rule)
                                                                                                                    setNewRule({
                                                                                                                        startTime: rule.startTime,
                                                                                                                        endTime: rule.endTime,
                                                                                                                        type: rule.type,
                                                                                                                        value: String(rule.value),
                                                                                                                    })
                                                                                                                    setIsRuleModalOpen(true)
                                                                                                                }}
                                                                                                                onDelete={() => setRuleToDelete(rule)}
                                                                                                            />
                                                                                                        </div>
                                                                                                    </td>
                                                                                                </tr>
                                                                                            )
                                                                                        })}
                                                                                    </tbody>
                                                                                </table>
                                                                            </div>
                                                                        </div>

                                                                        {/* Mobile Grid Cards */}
                                                                        <div className="md:hidden grid grid-cols-1 gap-4">
                                                                            {paginatedRules.map((rule) => {
                                                                                const baseFeeNum = Number(settings.baseFee || 0);
                                                                                const finalFee = rule.type === "fixed" ? (baseFeeNum + Number(rule.value || 0)) : (baseFeeNum * Number(rule.value || 0));
                                                                                return (
                                                                                    <div key={rule.id} className="bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-border p-4">
                                                                                        <div className="flex items-center justify-between mb-3">
                                                                                            <div className="flex items-center gap-2">
                                                                                                <ClockIcon className="w-4 h-4 text-brand-inactive-text dark:text-dark-body" />
                                                                                                <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{rule.startTime} - {rule.endTime}</span>
                                                                                            </div>
                                                                                            <ActionsDropdown
                                                                                                onEdit={() => {
                                                                                                    setEditingRule(rule)
                                                                                                    setNewRule({
                                                                                                        startTime: rule.startTime,
                                                                                                        endTime: rule.endTime,
                                                                                                        type: rule.type,
                                                                                                        value: String(rule.value),
                                                                                                    })
                                                                                                    setIsRuleModalOpen(true)
                                                                                                }}
                                                                                                onDelete={() => setRuleToDelete(rule)}
                                                                                            />
                                                                                        </div>
                                                                                        <div className="flex items-center justify-between">
                                                                                            <div className="flex flex-col">
                                                                                                <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">Tipo</span>
                                                                                                <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{rule.type === "fixed" ? "Acréscimo" : "Multiplicador"}</span>
                                                                                            </div>
                                                                                            <div className="flex flex-col text-right">
                                                                                                <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">Valor</span>
                                                                                                <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{rule.type === "fixed" ? formatCurrency(rule.value) : `${rule.value}x`}</span>
                                                                                            </div>
                                                                                        </div>
                                                                                        <div className="mt-2 pt-2 border-t border-brand-border dark:border-dark-border">
                                                                                            <span className="text-xs text-brand-inactive-text dark:text-dark-body">Taxa final: <span className="font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(finalFee)}</span></span>
                                                                                        </div>
                                                                                    </div>
                                                                                )
                                                                            })}
                                                                        </div>

                                                                        {totalRulePages > 1 && (
                                                                            <div className="mt-4">
                                                                                <Pagination
                                                                                    currentPage={rulePage}
                                                                                    totalPages={totalRulePages}
                                                                                    onPageChange={setRulePage}
                                                                                />
                                                                            </div>
                                                                        )}
                                                                    </>
                                                                )}
                                                            </div>
                                                        </Accordion>
                                                    </div>
                                                )}

                                                {/* Mobile/Tablet - Quem paga a entrega como FormSection */}
                                                <div className="lg:hidden">
                                                    <FormSection title={
                                                        <span className="inline-flex items-center gap-2">
                                                            Quem paga a entrega
                                                            {isFree && <img src={planStarIconForTarget("crescer")!} alt="" className="w-4 h-4 object-contain" />}
                                                        </span>
                                                    }>
                                                        <p className="text-sm font-medium text-brand-inactive-text dark:text-dark-body -mt-4 mb-3">Define se a taxa de entrega é repassada ao cliente ou absorvida pela loja</p>
                                                        <div className="flex rounded-lg border border-brand-border dark:border-dark-border overflow-hidden">
                                                            <button
                                                                type="button"
                                                                onClick={() => handlePayerSelect("customer")}
                                                                className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${settings.deliveryPayer === "customer"
                                                                    ? "bg-brand-dark text-white dark:bg-dark-heading dark:text-dark-background"
                                                                    : "bg-white dark:bg-dark-surface text-brand-dark dark:text-dark-heading hover:bg-brand-gray/50 dark:hover:bg-dark-border/50"
                                                                    } ${isFree ? "opacity-50" : ""}`}
                                                            >
                                                                Cliente
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handlePayerSelect("seller")}
                                                                className={`flex-1 px-3 py-2 text-xs font-medium transition-colors border-l border-brand-border dark:border-dark-border ${settings.deliveryPayer === "seller"
                                                                    ? "bg-brand-dark text-white dark:bg-dark-heading dark:text-dark-background"
                                                                    : "bg-white dark:bg-dark-surface text-brand-dark dark:text-dark-heading hover:bg-brand-gray/50 dark:hover:bg-dark-border/50"
                                                                    } ${isFree ? "opacity-50" : ""}`}
                                                            >
                                                                Vendedor
                                                            </button>
                                                        </div>
                                                    </FormSection>
                                                </div>
                                            </div>

                                            {/* Right Column / Sidebar - Entrega tab */}
                                            <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 border-l-0 lg:border-l border-brand-border dark:border-dark-border mt-8 lg:mt-0 space-y-6">
                                                <SidebarCard hasTopStrip hasSeparator title={
                                                    <span className="inline-flex items-center gap-2">
                                                        Quem paga a entrega
                                                        {isFree && <img src={planStarIconForTarget("crescer")!} alt="" className="w-4 h-4 object-contain" />}
                                                    </span>
                                                }>
                                                    <p className="text-sm text-brand-inactive-text dark:text-dark-body leading-relaxed mb-4">Define se a taxa de entrega é repassada ao cliente ou absorvida pela loja</p>
                                                    <div className="flex rounded-lg border border-brand-border dark:border-dark-border overflow-hidden">
                                                        <button
                                                            type="button"
                                                            onClick={() => handlePayerSelect("customer")}
                                                            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${settings.deliveryPayer === "customer"
                                                                ? "bg-brand-dark text-white dark:bg-dark-heading dark:text-dark-background"
                                                                : "bg-white dark:bg-dark-surface text-brand-dark dark:text-dark-heading hover:bg-brand-gray/50 dark:hover:bg-dark-border/50"
                                                                } ${isFree ? "opacity-50" : ""}`}
                                                        >
                                                            Cliente
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handlePayerSelect("seller")}
                                                            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors border-l border-brand-border dark:border-dark-border ${settings.deliveryPayer === "seller"
                                                                ? "bg-brand-dark text-white dark:bg-dark-heading dark:text-dark-background"
                                                                : "bg-white dark:bg-dark-surface text-brand-dark dark:text-dark-heading hover:bg-brand-gray/50 dark:hover:bg-dark-border/50"
                                                                } ${isFree ? "opacity-50" : ""}`}
                                                        >
                                                            Vendedor
                                                        </button>
                                                    </div>
                                                </SidebarCard>
                                            </div>
                                        </div>
                                    </motion.div>
                                </TabsContent>

                                {/* Tab: Transportadora (SuperFrete) */}
                                {hasSuperFrete && (
                                    <TabsContent value="carrier" className="mt-0 focus-visible:outline-none">
                                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                            <div className="grid grid-cols-12 gap-y-8 lg:gap-y-0 relative">
                                                {/* Main Content - Left Column */}
                                                <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12 space-y-6">
                                                    <FormSection title="Frete grátis por estado (SuperFrete)">
                                                        <div className="space-y-6">
                                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                                                <p className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">
                                                                    Defina a partir de qual valor do pedido o frete via transportadora fica grátis em estados específicos ou em todo o Brasil.
                                                                </p>
                                                                <Button
                                                                    variant="link"
                                                                    className="shrink-0 self-start sm:self-auto"
                                                                    onClick={() => {
                                                                        setEditingCarrierRule(null)
                                                                        setCarrierRuleForm({
                                                                            minOrderValue: "",
                                                                            allStates: false,
                                                                            states: [],
                                                                            appliesTo: "cheapest",
                                                                            isActive: true,
                                                                        })
                                                                        setIsCarrierRuleModalOpen(true)
                                                                    }}
                                                                    leftIcon={<PlusIcon className="w-4 h-4" />}
                                                                >
                                                                    Adicionar regra
                                                                </Button>
                                                            </div>

                                                            {carrierRules.length === 0 ? (
                                                                <IconPlaceholder
                                                                    icon={TruckIcon}
                                                                    title="Nenhuma regra de frete grátis cadastrada"
                                                                    subtitle="Ex.: frete grátis a partir de R$ 50,00 para SP e PR, ou a partir de R$ 100,00 para SP, PR e SC ou todo o Brasil."
                                                                />
                                                            ) : (
                                                                <>
                                                                    {/* Desktop Table */}
                                                                    <div className="hidden md:block w-full overflow-hidden bg-white dark:bg-dark-background">
                                                                        <div className="overflow-x-auto">
                                                                            <table className="w-full border-separate border-spacing-0">
                                                                                <thead>
                                                                                    <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                                                        <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 text-left rounded-l-lg">A partir de</th>
                                                                                        <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 text-left">Estados</th>
                                                                                        <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 text-left">Aplicar em</th>
                                                                                        <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 text-center">Ativa</th>
                                                                                        <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 text-center rounded-r-lg">Ações</th>
                                                                                    </tr>
                                                                                </thead>
                                                                                <tbody>
                                                                                    {paginatedCarrierRules.map((rule) => (
                                                                                        <tr key={rule.id} className="group hover:bg-brand-gray/50 dark:hover:bg-dark-border/10 transition-colors bg-white dark:bg-dark-background">
                                                                                            <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border text-[13px] font-bold text-brand-dark dark:text-dark-heading text-left whitespace-nowrap">
                                                                                                {rule.minOrderValue > 0 ? formatCurrency(rule.minOrderValue) : "Qualquer valor"}
                                                                                            </td>
                                                                                            <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border text-[13px] font-medium text-brand-dark dark:text-dark-heading text-left">
                                                                                                {rule.allStates ? (
                                                                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-brand-green/10 text-brand-green">
                                                                                                        Todo o Brasil
                                                                                                    </span>
                                                                                                ) : (
                                                                                                    <div className="flex flex-wrap gap-1">
                                                                                                        {rule.states.map((uf) => (
                                                                                                            <span
                                                                                                                key={uf}
                                                                                                                className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-brand-gray dark:bg-dark-border/60 text-brand-dark dark:text-dark-heading"
                                                                                                            >
                                                                                                                {uf}
                                                                                                            </span>
                                                                                                        ))}
                                                                                                    </div>
                                                                                                )}
                                                                                            </td>
                                                                                            <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border text-[13px] font-medium text-brand-inactive-text dark:text-dark-body text-left whitespace-nowrap">
                                                                                                {rule.appliesTo === "all" ? "Todas as opções" : "Opção mais barata"}
                                                                                            </td>
                                                                                            <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border text-center">
                                                                                                <div className="flex justify-center">
                                                                                                    <Switch
                                                                                                        checked={rule.isActive}
                                                                                                        onCheckedChange={async (checked) => {
                                                                                                            const res = await upsertCarrierFreeShippingRuleAction({
                                                                                                                partnerId,
                                                                                                                storeId,
                                                                                                                rule: {
                                                                                                                    id: rule.id,
                                                                                                                    minOrderValue: rule.minOrderValue,
                                                                                                                    allStates: rule.allStates,
                                                                                                                    states: rule.states,
                                                                                                                    appliesTo: rule.appliesTo,
                                                                                                                    isActive: checked,
                                                                                                                },
                                                                                                            })
                                                                                                            if (res.success) {
                                                                                                                setCarrierRules((prev) => prev.map((r) => r.id === rule.id ? { ...r, isActive: checked } : r))
                                                                                                            } else {
                                                                                                                notifyError("Erro ao atualizar regra", res.error || "Não foi possível atualizar o status da regra.")
                                                                                                            }
                                                                                                        }}
                                                                                                    />
                                                                                                </div>
                                                                                            </td>
                                                                                            <td className="py-4 px-4 border-b border-brand-border dark:border-dark-border text-center">
                                                                                                <div className="flex justify-center" onClick={(e) => e.stopPropagation()}>
                                                                                                    <ActionsDropdown
                                                                                                        onEdit={() => {
                                                                                                            setEditingCarrierRule(rule)
                                                                                                            setCarrierRuleForm({
                                                                                                                minOrderValue: String(rule.minOrderValue),
                                                                                                                allStates: rule.allStates,
                                                                                                                states: rule.states,
                                                                                                                appliesTo: rule.appliesTo,
                                                                                                                isActive: rule.isActive,
                                                                                                            })
                                                                                                            setIsCarrierRuleModalOpen(true)
                                                                                                        }}
                                                                                                        onDelete={() => setCarrierRuleToDelete(rule)}
                                                                                                    />
                                                                                                </div>
                                                                                            </td>
                                                                                        </tr>
                                                                                    ))}
                                                                                </tbody>
                                                                            </table>
                                                                        </div>
                                                                    </div>

                                                                    {/* Mobile Grid Cards */}
                                                                    <div className="md:hidden grid grid-cols-1 gap-4">
                                                                        {paginatedCarrierRules.map((rule) => (
                                                                            <div key={rule.id} className="bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-border p-4 space-y-3">
                                                                                <div className="flex items-center justify-between">
                                                                                    <div>
                                                                                        <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body block">A partir de</span>
                                                                                        <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                                                            {rule.minOrderValue > 0 ? formatCurrency(rule.minOrderValue) : "Qualquer valor"}
                                                                                        </span>
                                                                                    </div>
                                                                                    <div className="flex items-center gap-2">
                                                                                        <Switch
                                                                                            checked={rule.isActive}
                                                                                            onCheckedChange={async (checked) => {
                                                                                                const res = await upsertCarrierFreeShippingRuleAction({
                                                                                                    partnerId,
                                                                                                    storeId,
                                                                                                    rule: {
                                                                                                        id: rule.id,
                                                                                                        minOrderValue: rule.minOrderValue,
                                                                                                        allStates: rule.allStates,
                                                                                                        states: rule.states,
                                                                                                        appliesTo: rule.appliesTo,
                                                                                                        isActive: checked,
                                                                                                    },
                                                                                                })
                                                                                                if (res.success) {
                                                                                                    setCarrierRules((prev) => prev.map((r) => r.id === rule.id ? { ...r, isActive: checked } : r))
                                                                                                } else {
                                                                                                    notifyError("Erro ao atualizar regra", res.error || "Não foi possível atualizar o status da regra.")
                                                                                                }
                                                                                            }}
                                                                                        />
                                                                                        <ActionsDropdown
                                                                                            onEdit={() => {
                                                                                                setEditingCarrierRule(rule)
                                                                                                setCarrierRuleForm({
                                                                                                    minOrderValue: String(rule.minOrderValue),
                                                                                                    allStates: rule.allStates,
                                                                                                    states: rule.states,
                                                                                                    appliesTo: rule.appliesTo,
                                                                                                    isActive: rule.isActive,
                                                                                                })
                                                                                                setIsCarrierRuleModalOpen(true)
                                                                                            }}
                                                                                            onDelete={() => setCarrierRuleToDelete(rule)}
                                                                                        />
                                                                                    </div>
                                                                                </div>
                                                                                <div className="flex flex-wrap gap-1.5">
                                                                                    {rule.allStates ? (
                                                                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-brand-green/10 text-brand-green">
                                                                                            Todo o Brasil
                                                                                        </span>
                                                                                    ) : (
                                                                                        rule.states.map((uf) => (
                                                                                            <span
                                                                                                key={uf}
                                                                                                className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-brand-gray dark:bg-dark-border/60 text-brand-dark dark:text-dark-heading"
                                                                                            >
                                                                                                {uf}
                                                                                            </span>
                                                                                        ))
                                                                                    )}
                                                                                </div>
                                                                                <div className="pt-2 border-t border-brand-border dark:border-dark-border text-xs text-brand-inactive-text dark:text-dark-body">
                                                                                    Aplicar em: <span className="font-semibold text-brand-dark dark:text-dark-heading">{rule.appliesTo === "all" ? "Todas as opções" : "Opção mais barata"}</span>
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>

                                                                    {totalCarrierRulePages > 1 && (
                                                                        <div className="mt-4">
                                                                            <Pagination
                                                                                currentPage={carrierRulePage}
                                                                                totalPages={totalCarrierRulePages}
                                                                                onPageChange={setCarrierRulePage}
                                                                            />
                                                                        </div>
                                                                    )}
                                                                </>
                                                            )}
                                                        </div>
                                                    </FormSection>
                                                </div>

                                                {/* Right Column / Sidebar - Transportadora tab */}
                                                <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 border-l-0 lg:border-l border-brand-border dark:border-dark-border mt-8 lg:mt-0 space-y-6">
                                                    <SidebarCard hasTopStrip hasSeparator title="Como funciona">
                                                        <div className="space-y-3 text-sm text-brand-inactive-text dark:text-dark-body leading-relaxed">
                                                            <p>
                                                                Estas regras valem exclusivamente para envios via transportadora (SuperFrete), de forma independente do delivery próprio.
                                                            </p>
                                                            <p>
                                                                O estado do comprador é identificado automaticamente pelo CEP informado na página do produto, carrinho, checkout e PDV.
                                                            </p>
                                                            <p>
                                                                Você pode combinar várias faixas (ex.: R$ 50 para SP e PR, R$ 100 para SP, PR e SC ou todo o Brasil).
                                                            </p>
                                                        </div>
                                                    </SidebarCard>
                                                </div>
                                            </div>
                                        </motion.div>
                                    </TabsContent>
                                )}

                                {/* Tab: Atendimento a domicílio */}
                                <TabsContent value="service" className="mt-0 focus-visible:outline-none">
                                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                        <div className="grid grid-cols-12 gap-y-8 lg:gap-y-0 relative">
                                            {/* Main Content - Left Column */}
                                            <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12 space-y-4">
                                                <FormSection title="Atendimento a domicílio de serviços" description={!serviceSettings.hasOverride ? "(padrão da loja)" : undefined}>
                                                    <div className="space-y-6 pb-4">
                                                        <Input
                                                            label="Distância máxima de atendimento"
                                                            value={serviceSettings.maxServiceKm}
                                                            onChange={(e) => setServiceSettings((s) => ({ ...s, maxServiceKm: e.target.value }))}
                                                            suffix="km"
                                                            placeholder="Ilimitado"
                                                        />
                                                        <FormDropdown
                                                            label="Taxa de deslocamento"
                                                            value={serviceSettings.travelFeeMode}
                                                            setValue={(value) => setServiceSettings((s) => ({ ...s, travelFeeMode: (value as any) || "free" }))}
                                                            options={[
                                                                { value: "free", label: "Gratuito" },
                                                                { value: "flat", label: "Valor fixo" },
                                                                { value: "per_km", label: "Por km cobrado" },
                                                                { value: "tiered", label: "Por faixa de km" },
                                                            ]}
                                                        />
                                                        <Input
                                                            label="KM gratuito de deslocamento"
                                                            value={serviceSettings.freeTravelKm}
                                                            onChange={(e) => setServiceSettings((s) => ({ ...s, freeTravelKm: e.target.value }))}
                                                            suffix="km"
                                                            type="number"
                                                            min={0}
                                                        />
                                                        {serviceSettings.travelFeeMode === "flat" && (
                                                            <MoneyInput
                                                                label="Taxa fixa de deslocamento"
                                                                value={serviceSettings.travelFlatFee}
                                                                onChange={(val) => setServiceSettings((s) => ({ ...s, travelFlatFee: String(val) }))}
                                                            />
                                                        )}
                                                        {serviceSettings.travelFeeMode === "per_km" && (
                                                            <MoneyInput
                                                                label="Preço por km cobrado"
                                                                value={serviceSettings.travelPerKm}
                                                                onChange={(val) => setServiceSettings((s) => ({ ...s, travelPerKm: String(val) }))}
                                                            />
                                                        )}
                                                    </div>
                                                </FormSection>
                                            </div>

                                            {/* Right Column / Sidebar - Service tab */}
                                            <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 border-l-0 lg:border-l border-brand-border dark:border-dark-border mt-8 lg:mt-0 space-y-6">
                                                <SidebarCard hasTopStrip hasSeparator title="Bloquear agendamento fora do raio">
                                                    <p className="text-sm text-brand-inactive-text dark:text-dark-body leading-relaxed mb-4">Impedir que clientes agendem quando o endereço estiver fora do raio de atendimento configurado.</p>
                                                    <div className="flex items-center justify-between">
                                                        <Switch
                                                            checked={serviceSettings.enforceServiceArea}
                                                            onCheckedChange={(checked) => setServiceSettings((s) => ({ ...s, enforceServiceArea: checked }))}
                                                        />
                                                    </div>
                                                </SidebarCard>
                                            </div>
                                        </div>
                                    </motion.div>
                                </TabsContent>
                            </AnimatePresence>
                        </div>
                    </div>
                </Tabs>

                {/* Mobile Bottom Action Bar */}
                <div className="md:hidden fixed bottom-0 left-0 right-0 p-4 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border flex gap-3 z-20">
                    <Button variant="outline" onClick={handleBack} className="flex-1" disabled={saving}>
                        Cancelar
                    </Button>
                    <Button
                        onClick={async () => {
                            if (!settings.isDeliveryEnabled && !settings.isPickupEnabled) {
                                notifyError("Erro de validação", "Pelo menos um método de entrega (Entrega ou Retirada) deve estar ativo.")
                                return
                            }
                            setSaving(true)
                            const res = await upsertPartnerDeliveryConfigAction({
                                partnerId,
                                storeId,
                                settings: {
                                    storeId,
                                    baseFee: Number(settings.baseFee || 0),
                                    includedKm: Number(settings.includedKm || 0),
                                    extraKmPrice: chargeByDistance ? Number(settings.extraKmPrice || 0) : 0,
                                    maxDeliveryKm: chargeByDistance && settings.maxDeliveryKm ? Number(settings.maxDeliveryKm) : null,
                                    isDeliveryEnabled: settings.isDeliveryEnabled,
                                    isPickupEnabled: settings.isPickupEnabled,
                                    freeDeliveryThreshold: settings.freeDeliveryThreshold ? Number(settings.freeDeliveryThreshold) : null,
                                    deliveryPayer: settings.deliveryPayer,
                                },
                            })
                            if (res.success) {
                                notifySuccess("Configurações salvas", "As configurações de entrega foram salvas com sucesso.")
                            } else {
                                notifyError("Erro ao salvar", res.error || "Ocorreu um erro ao salvar as configurações.")
                            }
                            const svcRes = await upsertServiceAttendanceSettingsAction({
                                partnerId,
                                storeId,
                                settings: {
                                    maxServiceKm: serviceSettings.maxServiceKm ? Number(serviceSettings.maxServiceKm) : null,
                                    travelFeeMode: serviceSettings.travelFeeMode,
                                    freeTravelKm: Number(serviceSettings.freeTravelKm || 0),
                                    travelFlatFee: Number(serviceSettings.travelFlatFee || 0),
                                    travelPerKm: Number(serviceSettings.travelPerKm || 0),
                                    enforceServiceArea: serviceSettings.enforceServiceArea,
                                },
                            })
                            if (!svcRes.success) {
                                notifyError("Erro ao salvar atendimento", svcRes.error || "Não foi possível salvar as configurações de atendimento de serviços.")
                            }
                            await reload()
                            setSaving(false)
                        }}
                        className="flex-1"
                        disabled={saving}
                        leftIcon={<SaveIcon size={18} />}
                    >
                        {saving ? "Salvando..." : "Salvar"}
                    </Button>
                </div>

                <SavingStatusModal isOpen={saving} text="Salvando configurações..." />
            </div>

            <DefaultModal
                isOpen={isRuleModalOpen}
                onClose={() => {
                    setIsRuleModalOpen(false)
                    setEditingRule(null)
                    setNewRule({ startTime: "18:00", endTime: "22:00", type: "fixed", value: "0" })
                }}
                title={editingRule ? "Editar regra por horário" : "Nova regra por horário"}
                maxWidth="md"
                footer={
                    <>
                        <Button variant="ghost" onClick={() => {
                            setIsRuleModalOpen(false)
                            setEditingRule(null)
                            setNewRule({ startTime: "18:00", endTime: "22:00", type: "fixed", value: "0" })
                        }}>Cancelar</Button>
                        <Button
                            onClick={async () => {
                                // Overlap validation
                                const hasOverlap = rules.some((r) => {
                                    if (editingRule && r.id === editingRule.id) return false;
                                    return checkOverlap(newRule.startTime, newRule.endTime, r.startTime, r.endTime);
                                });
                                if (hasOverlap) {
                                    notifyError("Conflito de horário", "Já existe uma regra cadastrada que conflita com este período.")
                                    return;
                                }

                                await upsertDeliveryFeeRuleAction({
                                    partnerId,
                                    rule: {
                                        id: editingRule?.id,
                                        startTime: newRule.startTime,
                                        endTime: newRule.endTime,
                                        type: newRule.type,
                                        value: Number(newRule.value),
                                    },
                                })
                                await reload()
                                setIsRuleModalOpen(false)
                                setEditingRule(null)
                                setNewRule({ startTime: "18:00", endTime: "22:00", type: "fixed", value: "0" })
                            }}
                            leftIcon={<SaveIcon size={18} />}
                        >
                            {editingRule ? "Salvar alterações" : "Criar regra"}
                        </Button>
                    </>
                }
            >
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <TimePicker
                            label="Hora de início"
                            value={newRule.startTime}
                            onChange={(val) => setNewRule((prev) => ({ ...prev, startTime: val }))}
                        />
                        <TimePicker
                            label="Hora de fim"
                            value={newRule.endTime}
                            onChange={(val) => setNewRule((prev) => ({ ...prev, endTime: val }))}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <FormDropdown
                            label="Tipo de regra"
                            value={newRule.type}
                            setValue={(value) => setNewRule((prev) => ({ ...prev, type: value as "fixed" | "multiplier" }))}
                            options={[
                                { value: "fixed", label: "Acréscimo fixo (R$)" },
                                { value: "multiplier", label: "Multiplicador (x)" },
                            ]}
                        />
                        <MoneyInput
                            label={newRule.type === "fixed" ? "Valor do acréscimo" : "Multiplicador"}
                            value={newRule.value}
                            onChange={(val) => setNewRule((prev) => ({ ...prev, value: String(val) }))}
                            placeholder={newRule.type === "fixed" ? "R$ 0,00" : "Ex: 1.5"}
                            min={0}
                            step={newRule.type === "fixed" ? "0.01" : "0.1"}
                        />
                    </div>
                </div>
            </DefaultModal>

            {ruleToDelete && (
                <AlertModal
                    isOpen={true}
                    onClose={() => setRuleToDelete(null)}
                    title="Excluir regra"
                    message={`Tem certeza que deseja excluir a regra das ${ruleToDelete.startTime} às ${ruleToDelete.endTime}?`}
                    confirmText="Excluir"
                    variant="danger"
                    onConfirm={async () => {
                        await deleteDeliveryFeeRuleAction(partnerId, ruleToDelete.id)
                        await reload()
                        setRuleToDelete(null)
                    }}
                />
            )}

            <DefaultModal
                isOpen={isCarrierRuleModalOpen}
                onClose={() => {
                    setIsCarrierRuleModalOpen(false)
                    setEditingCarrierRule(null)
                }}
                title={editingCarrierRule ? "Editar regra de frete grátis" : "Nova regra de frete grátis"}
                maxWidth="lg"
                footer={
                    <>
                        <Button
                            variant="ghost"
                            disabled={savingCarrierRule}
                            onClick={() => {
                                setIsCarrierRuleModalOpen(false)
                                setEditingCarrierRule(null)
                            }}
                        >
                            Cancelar
                        </Button>
                        <Button
                            disabled={savingCarrierRule}
                            onClick={async () => {
                                if (!carrierRuleForm.allStates && carrierRuleForm.states.length === 0) {
                                    notifyError("Selecione os estados", "Escolha pelo menos um estado ou marque Todo o Brasil.")
                                    return
                                }
                                setSavingCarrierRule(true)
                                const res = await upsertCarrierFreeShippingRuleAction({
                                    partnerId,
                                    storeId,
                                    rule: {
                                        id: editingCarrierRule?.id,
                                        minOrderValue: Number(carrierRuleForm.minOrderValue || 0),
                                        allStates: carrierRuleForm.allStates,
                                        states: carrierRuleForm.states,
                                        appliesTo: carrierRuleForm.appliesTo,
                                        isActive: carrierRuleForm.isActive,
                                    },
                                })
                                setSavingCarrierRule(false)
                                if (res.success) {
                                    notifySuccess(
                                        editingCarrierRule ? "Regra atualizada" : "Regra criada",
                                        "A regra de frete grátis para transportadora foi salva com sucesso.",
                                    )
                                    const refreshed = await getCarrierFreeShippingRulesAction(partnerId, storeId)
                                    if (refreshed.success) setCarrierRules(refreshed.rules)
                                    setIsCarrierRuleModalOpen(false)
                                    setEditingCarrierRule(null)
                                } else {
                                    notifyError("Erro ao salvar regra", res.error || "Não foi possível salvar a regra.")
                                }
                            }}
                            leftIcon={<SaveIcon size={18} />}
                        >
                            {savingCarrierRule ? "Salvando..." : editingCarrierRule ? "Salvar alterações" : "Criar regra"}
                        </Button>
                    </>
                }
            >
                <div className="space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <MoneyInput
                            label="Frete grátis a partir de"
                            value={carrierRuleForm.minOrderValue}
                            onChange={(val) => setCarrierRuleForm((prev) => ({ ...prev, minOrderValue: String(val ?? "") }))}
                            placeholder="R$ 0,00"
                            min={0}
                        />
                        <FormDropdown
                            label="Aplicar em"
                            value={carrierRuleForm.appliesTo}
                            setValue={(value) => setCarrierRuleForm((prev) => ({ ...prev, appliesTo: (value as CarrierFreeShippingAppliesTo) || "cheapest" }))}
                            options={[
                                { value: "cheapest", label: "Apenas a opção mais barata" },
                                { value: "all", label: "Todas as opções de transportadora" },
                            ]}
                        />
                    </div>

                    <div className="pt-1">
                        <Checkbox
                            label="Válido para todo o Brasil"
                            checked={carrierRuleForm.allStates}
                            onChange={(checked) => setCarrierRuleForm((prev) => ({
                                ...prev,
                                allStates: Boolean(checked),
                            }))}
                        />
                    </div>

                    {!carrierRuleForm.allStates && (
                        <div className="space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading">
                                    Estados ({carrierRuleForm.states.length} selecionado{carrierRuleForm.states.length === 1 ? "" : "s"})
                                </span>
                                <div className="flex flex-wrap gap-1.5">
                                    {(["Sul", "Sudeste", "Centro-Oeste", "Nordeste", "Norte"] as const).map((region) => {
                                        const regionUfs = BRAZILIAN_STATES.filter((s) => s.region === region).map((s) => s.uf)
                                        const allSelected = regionUfs.every((uf) => carrierRuleForm.states.includes(uf))
                                        return (
                                            <button
                                                key={region}
                                                type="button"
                                                onClick={() => {
                                                    setCarrierRuleForm((prev) => {
                                                        const next = new Set(prev.states)
                                                        if (allSelected) {
                                                            regionUfs.forEach((uf) => next.delete(uf))
                                                        } else {
                                                            regionUfs.forEach((uf) => next.add(uf))
                                                        }
                                                        return { ...prev, states: Array.from(next).sort() as BrazilianStateUf[] }
                                                    })
                                                }}
                                                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${allSelected
                                                    ? "bg-brand-dark text-white border-brand-dark dark:bg-dark-heading dark:text-dark-background dark:border-dark-heading"
                                                    : "bg-white dark:bg-dark-surface text-brand-inactive-text dark:text-dark-body border-brand-border dark:border-dark-border hover:border-brand-dark dark:hover:border-dark-heading"
                                                    }`}
                                            >
                                                {region}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>

                            <div className="grid grid-cols-5 sm:grid-cols-9 gap-2">
                                {BRAZILIAN_STATES.map((st) => {
                                    const selected = carrierRuleForm.states.includes(st.uf)
                                    return (
                                        <button
                                            key={st.uf}
                                            type="button"
                                            title={st.name}
                                            onClick={() => {
                                                setCarrierRuleForm((prev) => {
                                                    const exists = prev.states.includes(st.uf)
                                                    const next = exists
                                                        ? prev.states.filter((u) => u !== st.uf)
                                                        : ([...prev.states, st.uf].sort() as BrazilianStateUf[])
                                                    return { ...prev, states: next }
                                                })
                                            }}
                                            className={`py-2 px-1 rounded-lg text-xs font-bold border transition-colors ${selected
                                                ? "bg-brand-dark text-white border-brand-dark dark:bg-dark-heading dark:text-dark-background dark:border-dark-heading"
                                                : "bg-white dark:bg-dark-surface text-brand-dark dark:text-dark-heading border-brand-border dark:border-dark-border hover:bg-brand-gray/60 dark:hover:bg-dark-border/40"
                                                }`}
                                        >
                                            {st.uf}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </DefaultModal>

            {carrierRuleToDelete && (
                <AlertModal
                    isOpen={true}
                    onClose={() => setCarrierRuleToDelete(null)}
                    title="Excluir regra de frete grátis"
                    message={`Tem certeza que deseja excluir a regra a partir de ${carrierRuleToDelete.minOrderValue > 0 ? formatCurrency(carrierRuleToDelete.minOrderValue) : "qualquer valor"} (${carrierRuleToDelete.allStates ? "Todo o Brasil" : carrierRuleToDelete.states.join(", ")})?`}
                    confirmText="Excluir"
                    variant="danger"
                    onConfirm={async () => {
                        const res = await deleteCarrierFreeShippingRuleAction(partnerId, carrierRuleToDelete.id)
                        if (res.success) {
                            setCarrierRules((prev) => prev.filter((r) => r.id !== carrierRuleToDelete.id))
                            notifySuccess("Regra excluída", "A regra de frete grátis foi removida.")
                        } else {
                            notifyError("Erro ao excluir", res.error || "Não foi possível excluir a regra.")
                        }
                        setCarrierRuleToDelete(null)
                    }}
                />
            )}
        </FadeIn>
    )
}