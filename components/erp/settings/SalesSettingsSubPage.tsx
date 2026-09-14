"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
    Button,
    FormSection,
    FormDropdown,
    Input,
    Checkbox,
    ThreeDotsLoader,
} from "@/components/reusable"
import { ChevronLeftIcon, SaveIcon } from "@/lib/icons"
import { FadeIn } from "@/components/animations/FadeIn"
import { useNotification } from "@/hooks/use-notification"
import {
    getSalesSettingsAction,
    updateSalesSettingsAction,
} from "@/app/actions/erp/sales-settings"
import {
    DEFAULT_SALES_SETTINGS,
    type SalesSettings,
} from "@/lib/sales/sales-settings-types"

const QUOTE_VALIDITY_OPTIONS = [
    { value: "7", label: "7 dias" },
    { value: "15", label: "15 dias (recomendado)" },
    { value: "30", label: "30 dias" },
    { value: "60", label: "60 dias" },
    { value: "0", label: "Não expira automaticamente" },
]

const MANUAL_ORDER_EXPIRATION_OPTIONS = [
    { value: "0", label: "Nunca cancelar automaticamente" },
    { value: "24", label: "24 horas (1 dia)" },
    { value: "48", label: "48 horas (2 dias)" },
    { value: "72", label: "72 horas (3 dias)" },
    { value: "168", label: "7 dias" },
]

export function SalesSettingsSubPage({
    partnerId,
    onBack,
}: {
    partnerId: string
    onBack: () => void
}) {
    const { success: notifySuccess, error: notifyError } = useNotification()
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [isScrolled, setIsScrolled] = useState(false)
    const scrollContainerRef = useRef<HTMLDivElement>(null)

    const [settings, setSettings] = useState<SalesSettings>(DEFAULT_SALES_SETTINGS)
    const [initialSettings, setInitialSettings] = useState<SalesSettings>(DEFAULT_SALES_SETTINGS)

    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
    }, [])

    const handleBack = useCallback(() => onBack(), [onBack])

    useEffect(() => {
        let cancelled = false
            ; (async () => {
                setLoading(true)
                const salesRes = await getSalesSettingsAction(partnerId)

                if (cancelled) return

                if (salesRes.success && salesRes.data) {
                    setSettings(salesRes.data)
                    setInitialSettings(salesRes.data)
                } else {
                    notifyError(salesRes.error || "Erro ao carregar configurações de vendas")
                }

                setLoading(false)
            })()
        return () => {
            cancelled = true
        }
    }, [partnerId, notifyError])

    const updateField = <K extends keyof SalesSettings>(field: K, value: SalesSettings[K]) => {
        setSettings((prev) => ({ ...prev, [field]: value }))
    }

    const hasChanges = useMemo(() => {
        return JSON.stringify(settings) !== JSON.stringify(initialSettings)
    }, [settings, initialSettings])

    async function handleSave() {
        setSaving(true)
        const res = await updateSalesSettingsAction(partnerId, settings)
        setSaving(false)

        if (res.success) {
            setInitialSettings({ ...settings })
            notifySuccess("Configurações de vendas salvas com sucesso!")
        } else {
            notifyError(res.error || "Erro ao salvar configurações")
        }
    }

    if (loading) {
        return (
            <div className="flex h-[calc(100vh-65px)] w-full items-center justify-center bg-white dark:bg-dark-background">
                <ThreeDotsLoader />
            </div>
        )
    }

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
                                    <span className="truncate">Configurações Gerais de Vendas</span>
                                </h1>

                                <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                    Defina as regras globais da empresa para descontos, controle de estoque, orçamentos e cancelamentos de pedidos.
                                </div>
                            </div>

                            {/* Desktop action buttons */}
                            <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                                <Button variant="outline" onClick={handleBack} disabled={saving}>
                                    Cancelar
                                </Button>
                                <Button onClick={handleSave} disabled={!hasChanges || saving} leftIcon={<SaveIcon size={18} />}>
                                    {saving ? "Salvando..." : "Salvar"}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Content Body */}
                <div className="px-3 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
                    <div className="grid grid-cols-12 gap-y-8 lg:gap-y-0 relative">
                        {/* Left Column */}
                        <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12 space-y-12">
                            {/* Descontos & Preços */}
                            <FormSection title="Descontos e Preços">
                                <div className="space-y-4">
                                    <div className="max-w-md">
                                        <Input
                                            label="Desconto máximo permitido nas vendas (%)"
                                            type="number"
                                            min="0"
                                            max="100"
                                            value={settings.maxDiscountPercent !== null ? String(settings.maxDiscountPercent) : "100"}
                                            onChange={(e) => {
                                                const val = e.target.value === "" ? null : Math.min(100, Math.max(0, Number(e.target.value)))
                                                updateField("maxDiscountPercent", val)
                                            }}
                                            placeholder="Ex: 15"
                                            suffix={<span className="text-brand-inactive-text text-sm font-medium">%</span>}
                                        />
                                    </div>

                                    <div className="max-w-md">
                                        <Input
                                            label="Margem padrão de lucro (%)"
                                            type="number"
                                            min="0"
                                            max="100"
                                            value={settings.defaultMarginPercent !== null ? String(settings.defaultMarginPercent) : "30"}
                                            onChange={(e) => {
                                                const val = e.target.value === "" ? null : Math.min(100, Math.max(0, Number(e.target.value)))
                                                updateField("defaultMarginPercent", val)
                                            }}
                                            placeholder="Ex: 30"
                                            suffix={<span className="text-brand-inactive-text text-sm font-medium">%</span>}
                                        />
                                    </div>

                                    <div className="pt-2">
                                        <Checkbox
                                            label="Permitir alteração manual de preço unitário no PDV e Pedidos"
                                            checked={settings.allowCustomItemPrice}
                                            onCheckedChange={(v) => updateField("allowCustomItemPrice", Boolean(v))}
                                        />
                                    </div>
                                </div>
                            </FormSection>

                            {/* Controle de Estoque */}
                            <FormSection title="Controle de Estoque na Venda" hasSeparator>
                                <div className="space-y-3">
                                    <Checkbox
                                        label="Permitir venda com estoque zerado ou negativo por padrão"
                                        checked={settings.allowNegativeStock}
                                        onCheckedChange={(v) => updateField("allowNegativeStock", Boolean(v))}
                                    />
                                </div>
                            </FormSection>

                            {/* Operação de PDV e Orçamentos */}
                            <FormSection title="Operação de Vendas e Orçamentos" hasSeparator>
                                <div className="space-y-6">
                                    <div>
                                        <Checkbox
                                            label="Obrigar seleção de vendedor ao registrar pedidos e vendas"
                                            checked={settings.requireSeller}
                                            onCheckedChange={(v) => updateField("requireSeller", Boolean(v))}
                                        />
                                    </div>

                                    <div className="max-w-md">
                                        <FormDropdown
                                            label="Validade padrão de orçamentos"
                                            value={String(settings.quoteValidityDays ?? 15)}
                                            setValue={(v) => updateField("quoteValidityDays", Number(v))}
                                            options={QUOTE_VALIDITY_OPTIONS}
                                        />
                                    </div>
                                </div>
                            </FormSection>

                            {/* Cancelamento Automático de Pedidos */}
                            <FormSection
                                title="Cancelamento Automático de Pedidos Pendentes"
                                description="Configure a expiração automática de pedidos manuais não pagos para liberar o estoque reservado."
                                hasSeparator
                            >
                                <div className="max-w-md">
                                    <FormDropdown
                                        label="Expiração de Pedidos Manuais / Balcão pendentes"
                                        value={String(settings.autoCancelManualOrdersHours ?? 0)}
                                        setValue={(v) => updateField("autoCancelManualOrdersHours", Number(v))}
                                        options={MANUAL_ORDER_EXPIRATION_OPTIONS}
                                    />
                                </div>
                            </FormSection>
                        </div>

                        {/* Right Column / Sidebar */}
                        <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 border-l-0 lg:border-l border-brand-border dark:border-dark-border mt-8 lg:mt-0 space-y-6">
                            <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border rounded-t-2xl" />
                                <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-4 mt-2">
                                    Cancelamento Automático e Prazos
                                </h3>
                                <div className="space-y-4 text-sm text-brand-inactive-text dark:text-dark-body">
                                    <p>
                                        <strong className="text-brand-dark dark:text-dark-heading">Desconto Máximo:</strong>{" "}
                                        Protege sua margem de lucro impedindo descontos excessivos no PDV e nos pedidos manuais.
                                    </p>
                                    <p>
                                        <strong className="text-brand-dark dark:text-dark-heading">Margem Padrão:</strong>{" "}
                                        Define a margem de lucro base para o cálculo automático de preços nos produtos.
                                    </p>
                                    <p>
                                        <strong className="text-brand-dark dark:text-dark-heading">Controle de Estoque:</strong>{" "}
                                        Produtos individuais com "Permitir venda sem estoque" ativo continuarão liberados. Os demais serão bloqueados se o saldo for insuficiente.
                                    </p>
                                    <p>
                                        <strong className="text-brand-dark dark:text-dark-heading">Vendedor Obrigatório:</strong>{" "}
                                        Evita vendas avulsas sem responsável e garante relatórios de comissão 100% consistentes.
                                    </p>
                                    <p>
                                        <strong className="text-brand-dark dark:text-dark-heading">Validade de Orçamentos:</strong>{" "}
                                        Orçamentos expiram automaticamente após o prazo configurado, evitando compromissos desatualizados.
                                    </p>
                                    <p>
                                        <strong className="text-brand-dark dark:text-dark-heading">Cancelamento de Pedidos:</strong>{" "}
                                        Pedidos não pagos são cancelados automaticamente pelo sistema após o prazo configurado, devolvendo o estoque ao catálogo.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Mobile Bottom Action Bar */}
                <div className="md:hidden fixed bottom-0 left-0 right-0 p-4 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border flex gap-3 z-20">
                    <Button variant="outline" onClick={handleBack} className="flex-1" disabled={saving}>
                        Cancelar
                    </Button>
                    <Button onClick={handleSave} className="flex-1" disabled={!hasChanges || saving} leftIcon={<SaveIcon size={18} />}>
                        {saving ? "Salvando..." : "Salvar"}
                    </Button>
                </div>
            </div>
        </FadeIn>
    )
}
