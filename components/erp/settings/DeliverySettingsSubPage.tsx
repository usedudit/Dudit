"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button, Input, FormDropdown, InfoCard, DefaultModal, MoneyInput, IconPlaceholder, TimePicker, FormSection, Accordion, Checkbox, ActionsDropdown, AlertModal } from "@/components/reusable"
import { Switch } from "@/components/reusable/Switch"
import { ChevronLeftIcon, ClockIcon, PlusIcon, TrashIcon, SaveIcon } from "@/lib/icons"
import { FadeIn } from "@/components/animations/FadeIn"
import { formatCurrency } from "@/lib/utils"
import {
    deleteDeliveryFeeRuleAction,
    getPartnerDeliveryConfigAction,
    upsertDeliveryFeeRuleAction,
    upsertPartnerDeliveryConfigAction,
} from "@/app/actions/shared/delivery"
import { getPickupPaymentPolicyAction, updatePickupPaymentPolicyAction } from "@/app/actions/partners/pickup-payment"
import { planStarIconForTarget, usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal"
import { useNotification } from "@/hooks/use-notification"

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

export function DeliverySettingsSubPage({ partnerId, onBack }: { partnerId: string; onBack: () => void }) {
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
    const [settings, setSettings] = useState({
        baseFee: "0",
        includedKm: "0",
        extraKmPrice: "0",
        maxDeliveryKm: "",
        isDeliveryEnabled: true,
        isPickupEnabled: true,
        freeDeliveryThreshold: "",
        pickupPaymentPolicy: "require_online_payment" as "require_online_payment" | "allow_pickup_payment",
    })
    const [rules, setRules] = useState<any[]>([])
    const [isRuleModalOpen, setIsRuleModalOpen] = useState(false)
    const [newRule, setNewRule] = useState({ startTime: "18:00", endTime: "22:00", type: "fixed", value: "0" })

    const handleBack = useCallback(() => onBack(), [onBack])

    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
    }, [])

    const isFree = planSlug === "free"
    const isCrescer = planSlug === "crescer"

    async function reload() {
        setLoading(true)
        const res = await getPartnerDeliveryConfigAction(partnerId)
        if (res.success) {
            setPlanSlug(res.planSlug)
            setAdvancedEnabled(res.capability.advancedEnabled)
            setSettings({
                baseFee: String(res.settings.baseFee || 0),
                includedKm: String(res.settings.includedKm || 0),
                extraKmPrice: String(res.settings.extraKmPrice || 0),
                maxDeliveryKm: res.settings.maxDeliveryKm == null ? "" : String(res.settings.maxDeliveryKm),
                isDeliveryEnabled: Boolean(res.settings.isDeliveryEnabled),
                isPickupEnabled: Boolean(res.settings.isPickupEnabled ?? true),
                freeDeliveryThreshold: res.settings.freeDeliveryThreshold == null ? "" : String(res.settings.freeDeliveryThreshold),
                pickupPaymentPolicy: "require_online_payment",
            })
            setChargeByDistance(Number(res.settings.extraKmPrice || 0) > 0 || res.settings.maxDeliveryKm != null)
            setRules(res.rules || [])
            const pickupRes = await getPickupPaymentPolicyAction()
            if (pickupRes.pickupPaymentPolicy) {
                setSettings(s => ({ ...s, pickupPaymentPolicy: (pickupRes.pickupPaymentPolicy as "require_online_payment" | "allow_pickup_payment") }))
            }
        }
        setLoading(false)
    }

    useEffect(() => { void reload() }, [partnerId])

    const upgradeHint = useMemo(
        () => isCrescer ? "Desbloqueie cálculo por distância e horários com o plano Escalar" : null,
        [isCrescer]
    )

    if (loading) return <FadeIn className="p-6">Carregando configurações de entrega...</FadeIn>

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
                                    <span className="truncate">Configurações de Entrega</span>
                                </h1>

                                <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                    Gerencie taxas e regras de entrega
                                </div>
                            </div>

                            {/* Desktop action buttons */}
                            <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                                <Button variant="outline" onClick={handleBack} disabled={saving}>
                                    Cancelar
                                </Button>
                                <Button
                                    disabled={saving || isFree}
                                    onClick={async () => {
                                        if (!settings.isDeliveryEnabled && !settings.isPickupEnabled) {
                                            notifyError("Erro de validação", "Pelo menos um método de entrega (Entrega ou Retirada) deve estar ativo.")
                                            return
                                        }
                                        setSaving(true)
                                        const res = await upsertPartnerDeliveryConfigAction({
                                            partnerId,
                                            settings: {
                                                baseFee: Number(settings.baseFee || 0),
                                                includedKm: chargeByDistance ? Number(settings.includedKm || 0) : 0,
                                                extraKmPrice: chargeByDistance ? Number(settings.extraKmPrice || 0) : 0,
                                                maxDeliveryKm: chargeByDistance && settings.maxDeliveryKm ? Number(settings.maxDeliveryKm) : null,
                                                isDeliveryEnabled: settings.isDeliveryEnabled,
                                                isPickupEnabled: settings.isPickupEnabled,
                                                freeDeliveryThreshold: settings.freeDeliveryThreshold ? Number(settings.freeDeliveryThreshold) : null,
                                            },
                                        })
                                        if (res.success) {
                                            const pickupRes = await updatePickupPaymentPolicyAction(settings.pickupPaymentPolicy)
                                            if (!pickupRes.success) {
                                                notifyError("Erro ao salvar", pickupRes.error || "Ocorreu um erro ao salvar política de pagamento na retirada.")
                                            } else {
                                                notifySuccess("Configurações salvas", "As configurações de entrega foram salvas com sucesso.")
                                            }
                                            await reload()
                                        } else {
                                            notifyError("Erro ao salvar", res.error || "Ocorreu um erro ao salvar as configurações.")
                                        }
                                        setSaving(false)
                                    }}
                                    leftIcon={<SaveIcon size={18} />}
                                >
                                    {saving ? "Salvando..." : "Salvar"}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Content Body */}
                <div className="max-w-[1300px] mx-auto p-4 md:p-8 pt-6">
                    {isFree && <InfoCard color="yellow" title="Plano Começar" message="O recurso de entrega está indisponível neste plano." className="mb-6" />}
                    {upgradeHint && <InfoCard color="blue" title="Disponível no plano Escalar" message={`${upgradeHint} - Faça upgrade em Assinatura.`} className="mb-6" />}

                    <div className="grid grid-cols-12 gap-y-8 lg:gap-y-0 relative">
                        {/* Main Content */}
                        <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12 space-y-12">
                            {/* Geral */}
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
                                    <div className="border-t border-brand-border dark:border-dark-border mb-8 w-full"></div>
                                    <Accordion
                                        title={
                                            <span className="text-md lg:text-xl font-medium text-brand-dark dark:text-dark-heading mb-6">
                                                Distância e Entrega
                                            </span>
                                        }
                                        defaultOpen={true}
                                        triggerClass="text-lg font-bold text-brand-dark dark:text-dark-heading mb-5 text-left"
                                    >
                                        <div className="space-y-6 pb-4">
                                            <p className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Configure as taxas básicas e limites por distância para entrega</p>
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
                                                    disabled={!advancedEnabled || !chargeByDistance}
                                                    label="KM incluído"
                                                    value={settings.includedKm}
                                                    onChange={(e) => setSettings((s) => ({ ...s, includedKm: e.target.value }))}
                                                    suffix="km"
                                                />
                                            </div>

                                            <div className="pt-2">
                                                <label className="flex items-center gap-3 cursor-pointer select-none">
                                                    <Checkbox
                                                        checked={chargeByDistance}
                                                        onChange={(checked) => {
                                                            if (!advancedEnabled) {
                                                                openPlanUpgrade("escalar")
                                                                return
                                                            }
                                                            setChargeByDistance(Boolean(checked))
                                                        }}
                                                    />
                                                    <span className="flex items-center gap-2 text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                        Cobrar por quilometragem adicional
                                                        {!advancedEnabled && (
                                                            <img src={planStarIconForTarget("escalar")!} alt="" className="w-4 h-4 object-contain" />
                                                        )}
                                                    </span>
                                                </label>
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
                                    <div className="border-t border-brand-border dark:border-dark-border mb-8 w-full"></div>
                                    <Accordion
                                        title={
                                            <span className="text-md lg:text-xl font-medium text-brand-dark dark:text-dark-heading mb-6">
                                                Regras por Horário
                                                {!advancedEnabled && (
                                                    <img src={planStarIconForTarget("escalar")!} alt="" className="w-4 h-4 object-contain" />
                                                )}
                                            </span>
                                        }
                                        defaultOpen={false}
                                        triggerClass="text-lg font-bold text-brand-dark dark:text-dark-heading mb-5 text-left"
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
                                                <div className="w-full overflow-hidden bg-white dark:bg-dark-background">
                                                    <div className="overflow-x-auto">
                                                        <table className="w-full border-separate border-spacing-0">
                                                            <thead>
                                                                <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                                    <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 text-center rounded-l-lg">Início</th>
                                                                    <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 text-center">Fim</th>
                                                                    <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 text-center">Tipo</th>
                                                                    <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 text-center">Valor</th>
                                                                    <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 text-center rounded-r-lg">Ações</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {rules.map((rule) => {
                                                                    const baseFeeNum = Number(settings.baseFee || 0);
                                                                    const finalFee = rule.type === "fixed" ? (baseFeeNum + Number(rule.value || 0)) : (baseFeeNum * Number(rule.value || 0));
                                                                    return (
                                                                        <tr key={rule.id} className="group hover:bg-brand-gray/50 dark:hover:bg-dark-border/10 transition-colors bg-white dark:bg-dark-background">
                                                                            <td className="py-4 px-5 border-b border-brand-border dark:border-dark-border text-[13px] font-medium text-brand-dark dark:text-dark-heading">{rule.startTime}</td>
                                                                            <td className="py-4 px-5 border-b border-brand-border dark:border-dark-border text-[13px] font-medium text-brand-dark dark:text-dark-heading">{rule.endTime}</td>
                                                                            <td className="py-4 px-5 border-b border-brand-border dark:border-dark-border text-[13px] font-medium text-brand-dark dark:text-dark-heading">
                                                                                {rule.type === "fixed" ? "Acréscimo" : "Multiplicador"}
                                                                            </td>
                                                                            <td className="py-4 px-5 border-b border-brand-border dark:border-dark-border text-[13px] font-bold text-brand-dark dark:text-dark-heading">
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
                                            )}
                                        </div>
                                    </Accordion>
                                </div>
                            )}
                        </div>

                        {/* Sidebar Info (Optional) */}
                        <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 border-l-0 lg:border-l border-brand-border dark:border-dark-border space-y-6">
                            <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border rounded-t-2xl" />
                                <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-4 mt-2">Dica Dudit</h3>
                                <div className="space-y-4">
                                    <p className="text-sm text-brand-inactive-text dark:text-dark-body leading-relaxed">
                                        Configure corretamente o preço por KM extra para garantir que entregas mais distantes cubram seus custos de combustível e tempo.
                                    </p>

                                    {settings.isPickupEnabled && (
                                        <>
                                            <div className="border-t border-brand-border dark:border-dark-border" />
                                            <div>
                                                <div className="flex items-center justify-between">
                                                    <div className="flex flex-col gap-0.5">
                                                        <span className="font-bold text-md text-brand-dark dark:text-dark-heading">Pagamento na retirada</span>
                                                        <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">Cliente pode pagar ao retirar o pedido</span>
                                                    </div>
                                                    <Switch
                                                        checked={settings.pickupPaymentPolicy === "allow_pickup_payment"}
                                                        onCheckedChange={(checked) => {
                                                            setSettings(s => ({ ...s, pickupPaymentPolicy: checked ? "allow_pickup_payment" : "require_online_payment" }))
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div >

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
                                        type: newRule.type as "fixed" | "multiplier",
                                        value: Number(newRule.value || 0),
                                        isActive: true,
                                    },
                                })
                                setNewRule({ startTime: "18:00", endTime: "22:00", type: "fixed", value: "0" })
                                setEditingRule(null)
                                await reload()
                                setIsRuleModalOpen(false)
                            }}
                        >
                            {editingRule ? "Salvar" : "Adicionar"}
                        </Button>
                    </>
                }
            >
                <div className="flex flex-col gap-4">
                    <div className="grid grid-cols-2 gap-4">
                        <TimePicker label="Início" value={newRule.startTime} onChange={(time) => setNewRule((r) => ({ ...r, startTime: time }))} />
                        <TimePicker label="Fim" value={newRule.endTime} onChange={(time) => setNewRule((r) => ({ ...r, endTime: time }))} />
                    </div>
                    <FormDropdown
                        label="Tipo de Taxa"
                        value={newRule.type}
                        setValue={(value) => setNewRule((r) => ({ ...r, type: value }))}
                        options={[{ value: "fixed", label: "Acréscimo na taxa base" }, { value: "multiplier", label: "Multiplicar a taxa base" }]}
                    />
                    {newRule.type === "fixed" ? (
                        <MoneyInput
                            label="Valor"
                            value={newRule.value}
                            onChange={(val) => setNewRule((r) => ({ ...r, value: String(val) }))}
                        />
                    ) : (
                        <Input
                            label="Valor"
                            type="number"
                            step="0.1"
                            value={newRule.value}
                            onChange={(e) => setNewRule((r) => ({ ...r, value: e.target.value }))}
                            placeholder="1.5"
                        />
                    )}
                    <div className="text-sm font-semibold text-brand-dark dark:text-dark-heading mt-2">
                        Taxa final estimada = {formatCurrency(
                            newRule.type === "fixed"
                                ? (Number(settings.baseFee || 0) + Number(newRule.value || 0))
                                : (Number(settings.baseFee || 0) * Number(newRule.value || 0))
                        )}
                    </div>
                </div>
            </DefaultModal>

            <AlertModal
                isOpen={ruleToDelete !== null}
                onClose={() => setRuleToDelete(null)}
                title="Excluir regra por horário"
                description={`Tem certeza que deseja excluir a regra de horário das ${ruleToDelete?.startTime} às ${ruleToDelete?.endTime}?`}
                onConfirm={async () => {
                    if (ruleToDelete) {
                        await deleteDeliveryFeeRuleAction(partnerId, ruleToDelete.id);
                        await reload();
                    }
                    setRuleToDelete(null);
                }}
                confirmText="Excluir"
                cancelText="Cancelar"
                isDestructive={true}
            />
        </FadeIn >
    )
}
