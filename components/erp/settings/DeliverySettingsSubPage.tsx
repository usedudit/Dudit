"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button, Input, FormDropdown, InfoCard, DefaultModal, MoneyInput, IconPlaceholder, TimePicker } from "@/components/reusable"
import { Switch } from "@/components/reusable/Switch"
import { ChevronLeftIcon, ClockIcon, PlusIcon, TrashIcon } from "@/lib/icons"
import { FadeIn } from "@/components/animations/FadeIn"
import { formatCurrency } from "@/lib/utils"
import {
    deleteDeliveryFeeRuleAction,
    getPartnerDeliveryConfigAction,
    upsertDeliveryFeeRuleAction,
    upsertPartnerDeliveryConfigAction,
} from "@/app/actions/shared/delivery"

export function DeliverySettingsSubPage({ partnerId, onBack }: { partnerId: string; onBack: () => void }) {
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [planSlug, setPlanSlug] = useState("free")
    const [isScrolled, setIsScrolled] = useState(false)
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const [advancedEnabled, setAdvancedEnabled] = useState(false)
    const [settings, setSettings] = useState({
        baseFee: "0",
        includedKm: "0",
        extraKmPrice: "0",
        maxDeliveryKm: "",
        isDeliveryEnabled: true,
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
            })
            setRules(res.rules || [])
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
            <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-24 md:pb-8 scroll-smooth custom-scrollbar"></div>

            {/* Sticky Header */}
            <div className="sticky top-0 z-30 w-full bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out">
                <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">

                    {/* Back button - desktop only */}
                    <div className={`absolute -left-12 top-7 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
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
                            <Button
                                disabled={saving || isFree}
                                onClick={async () => {
                                    setSaving(true)
                                    await upsertPartnerDeliveryConfigAction({
                                        partnerId,
                                        settings: {
                                            baseFee: Number(settings.baseFee || 0),
                                            includedKm: Number(settings.includedKm || 0),
                                            extraKmPrice: Number(settings.extraKmPrice || 0),
                                            maxDeliveryKm: settings.maxDeliveryKm ? Number(settings.maxDeliveryKm) : null,
                                            isDeliveryEnabled: settings.isDeliveryEnabled,
                                        },
                                    })
                                    await reload()
                                    setSaving(false)
                                }}
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

                <div className="flex flex-col gap-6">
                    {/* Geral */}
                    <div className="flex flex-col">
                        <div className="border-t border-brand-border dark:border-dark-border mb-8 w-full"></div>

                        <h2 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-5">Geral</h2>

                        <div className="overflow-hidden">
                            {/* Entrega Ativa */}
                            <div className="flex items-center justify-between gap-4">
                                <div className="flex flex-col gap-1">
                                    <span className="font-bold text-md text-brand-dark dark:text-dark-heading">Entrega ativa</span>
                                    <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Permitir que clientes selecionem entrega no checkout</span>
                                </div>
                                <Switch
                                    checked={settings.isDeliveryEnabled}
                                    onCheckedChange={(checked) => setSettings(s => ({ ...s, isDeliveryEnabled: checked }))}
                                    className={isFree ? "opacity-50 pointer-events-none" : ""}
                                />
                            </div>

                            {/* Taxa Base */}
                            <div className="flex items-center justify-between gap-4">
                                <div className="flex flex-col gap-1 flex-1">
                                    <span className="font-bold text-md text-brand-dark dark:text-dark-heading">Taxa base</span>
                                    <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Valor fixo cobrado por cada entrega</span>
                                </div>
                                <div className="w-[120px]">
                                    <MoneyInput
                                        value={settings.baseFee}
                                        onChange={(val) => setSettings((s) => ({ ...s, baseFee: String(val) }))}
                                        className="text-right"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Distância */}
                    <div className="flex flex-col mt-8">
                        <div className="border-t border-brand-border dark:border-dark-border mb-8 w-full"></div>

                        <div className="flex flex-col gap-1">
                            <h2 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Distância</h2>
                            <p className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Configure os limites e custos de entrega baseados na distância da loja.</p>
                        </div>

                        <div>
                            {!advancedEnabled && <p className="text-sm font-bold text-brand-primary mb-4 flex items-center gap-2">Recurso disponível no plano Escalar</p>}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <Input
                                    disabled={!advancedEnabled}
                                    label="KM incluído"
                                    value={settings.includedKm}
                                    onChange={(e) => setSettings((s) => ({ ...s, includedKm: e.target.value }))}
                                />
                                <Input
                                    disabled={!advancedEnabled}
                                    label="Preço por KM extra"
                                    value={settings.extraKmPrice}
                                    onChange={(e) => setSettings((s) => ({ ...s, extraKmPrice: e.target.value }))}
                                />
                                <Input
                                    disabled={!advancedEnabled}
                                    label="Distância máxima (km)"
                                    value={settings.maxDeliveryKm}
                                    onChange={(e) => setSettings((s) => ({ ...s, maxDeliveryKm: e.target.value }))}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Regras por horário */}
                    <div className="flex flex-col mt-8">
                        <div className="border-t border-brand-border dark:border-dark-border mb-8 w-full"></div>

                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-5">Regras por horário</h2>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={!advancedEnabled}
                                onClick={() => setIsRuleModalOpen(true)}
                                leftIcon={<PlusIcon className="w-4 h-4" />}
                            >
                                Adicionar regra
                            </Button>
                        </div>

                        {!advancedEnabled ? (
                            <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-5 flex items-center justify-center min-h-[100px]">
                                <p className="text-sm font-bold text-brand-primary">Recurso disponível no plano Escalar</p>
                            </div>
                        ) : rules.length === 0 ? (
                            <IconPlaceholder
                                icon={ClockIcon}
                                title="Nenhuma regra cadastrada"
                                subtitle="Adicione regras para alterar o valor da entrega em horários específicos."
                            />
                        ) : (
                            <div className="w-full overflow-hidden rounded-2xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-background">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-separate border-spacing-0">
                                        <thead>
                                            <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                <th className="py-3 px-5 text-[13px] font-medium text-brand-inactive-text dark:text-dark-body border-b border-brand-border dark:border-dark-border">Início</th>
                                                <th className="py-3 px-5 text-[13px] font-medium text-brand-inactive-text dark:text-dark-body border-b border-brand-border dark:border-dark-border">Fim</th>
                                                <th className="py-3 px-5 text-[13px] font-medium text-brand-inactive-text dark:text-dark-body border-b border-brand-border dark:border-dark-border">Tipo</th>
                                                <th className="py-3 px-5 text-[13px] font-medium text-brand-inactive-text dark:text-dark-body border-b border-brand-border dark:border-dark-border">Valor</th>
                                                <th className="py-3 px-5 text-[13px] font-medium text-brand-inactive-text dark:text-dark-body border-b border-brand-border dark:border-dark-border text-center w-20">Ações</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {rules.map((rule) => (
                                                <tr key={rule.id} className="group hover:bg-brand-gray dark:hover:bg-dark-border/10 transition-colors bg-white dark:bg-dark-background">
                                                    <td className="py-4 px-5 border-b border-brand-border dark:border-dark-border text-[13px] font-bold text-brand-dark dark:text-dark-heading">{rule.startTime}</td>
                                                    <td className="py-4 px-5 border-b border-brand-border dark:border-dark-border text-[13px] font-bold text-brand-dark dark:text-dark-heading">{rule.endTime}</td>
                                                    <td className="py-4 px-5 border-b border-brand-border dark:border-dark-border text-[13px] font-medium text-brand-dark dark:text-dark-heading">
                                                        {rule.type === "fixed" ? "Fixo" : "Multiplicador"}
                                                    </td>
                                                    <td className="py-4 px-5 border-b border-brand-border dark:border-dark-border text-[13px] font-bold text-brand-dark dark:text-dark-heading">
                                                        {rule.type === "fixed" ? formatCurrency(rule.value) : `${rule.value}x`}
                                                    </td>
                                                    <td className="py-4 px-5 border-b border-brand-border dark:border-dark-border text-center">
                                                        <button
                                                            onClick={async () => { await deleteDeliveryFeeRuleAction(partnerId, rule.id); await reload() }}
                                                            className="p-2 text-brand-inactive-text hover:text-brand-red transition-colors"
                                                        >
                                                            <TrashIcon className="w-4 h-4" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <DefaultModal
                    isOpen={isRuleModalOpen}
                    onClose={() => setIsRuleModalOpen(false)}
                    title="Nova Regra por Horário"
                    maxWidth="md"
                    footer={
                        <>
                            <Button variant="ghost" onClick={() => setIsRuleModalOpen(false)}>Cancelar</Button>
                            <Button
                                onClick={async () => {
                                    await upsertDeliveryFeeRuleAction({
                                        partnerId,
                                        rule: {
                                            startTime: newRule.startTime,
                                            endTime: newRule.endTime,
                                            type: newRule.type as "fixed" | "multiplier",
                                            value: Number(newRule.value || 0),
                                            isActive: true,
                                        },
                                    })
                                    setNewRule({ startTime: "18:00", endTime: "22:00", type: "fixed", value: "0" })
                                    await reload()
                                    setIsRuleModalOpen(false)
                                }}
                            >
                                Adicionar
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
                            options={[{ value: "fixed", label: "Valor Fixo" }, { value: "multiplier", label: "Multiplicador (Taxa Base x Valor)" }]}
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
                    </div>
                </DefaultModal>
            </div>
        </FadeIn>
    )
}
