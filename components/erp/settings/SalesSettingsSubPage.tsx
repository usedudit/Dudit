"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button, FormSection, FormDropdown, Input, Checkbox, ThreeDotsLoader } from "@/components/reusable"
import { ChevronLeftIcon, SaveIcon } from "@/lib/icons"
import { FadeIn } from "@/components/animations/FadeIn"
import { useNotification } from "@/hooks/use-notification"
import {
    getSalesSettingsAction,
    updateSalesSettingsAction,
    DEFAULT_SALES_SETTINGS,
    type SalesSettings,
} from "@/app/actions/erp/sales-settings"

const QUOTE_VALIDITY_OPTIONS = [
    { value: "7", label: "7 dias" },
    { value: "15", label: "15 dias (recomendado)" },
    { value: "30", label: "30 dias" },
    { value: "60", label: "60 dias" },
    { value: "0", label: "Não expira automaticamente" },
]

const PIX_EXPIRATION_OPTIONS = [
    { value: "15", label: "15 minutos" },
    { value: "30", label: "30 minutos (recomendado)" },
    { value: "60", label: "1 hora" },
    { value: "120", label: "2 horas" },
    { value: "1440", label: "24 horas" },
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
    storeId,
    onBack,
}: {
    partnerId: string
    storeId?: string
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
        ;(async () => {
            setLoading(true)
            const res = await getSalesSettingsAction(partnerId, storeId)
            if (cancelled) return
            if (res.success && res.data) {
                setSettings(res.data)
                setInitialSettings(res.data)
            } else {
                notifyError(res.error || "Erro ao carregar configurações de vendas")
            }
            setLoading(false)
        })()
        return () => {
            cancelled = true
        }
    }, [partnerId, storeId, notifyError])

    const updateField = <K extends keyof SalesSettings>(field: K, value: SalesSettings[K]) => {
        setSettings((prev) => ({ ...prev, [field]: value }))
    }

    const hasChanges = useMemo(() => {
        return JSON.stringify(settings) !== JSON.stringify(initialSettings)
    }, [settings, initialSettings])

    async function handleSave() {
        setSaving(true)
        const res = await updateSalesSettingsAction(partnerId, settings, storeId)
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
            <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto w-full relative pb-24 md:pb-8 scroll-smooth custom-scrollbar"
            >
                {/* Sticky Header */}
                <div className="sticky top-0 z-30 w-full bg-white dark:bg-dark-surface transition-all duration-500 ease-in-out">
                    <div className="max-w-[1300px] mx-auto relative px-4 md:px-6">
                        {/* Back button - desktop only */}
                        <div
                            className={`absolute -left-12 top-3 h-full hidden xl:flex justify-center transition-all duration-500 ${
                                isScrolled ? "scale-90" : "scale-100"
                            }`}
                        >
                            <Button
                                variant="filled"
                                onClick={handleBack}
                                className="w-10 h-10 p-0 flex items-center justify-center"
                            >
                                <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                            </Button>
                        </div>

                        {/* Title row */}
                        <div className="hidden md:flex items-start justify-between">
                            <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                <h1
                                    className={`font-bold text-brand-dark dark:text-dark-heading transition-all duration-500 flex items-center gap-3 ${
                                        isScrolled ? "text-xl" : "text-xl md:text-3xl"
                                    }`}
                                >
                                    <span className="truncate">Configurações Gerais de Vendas</span>
                                </h1>

                                <div
                                    className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${
                                        isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"
                                    }`}
                                >
                                    Defina regras de descontos, comportamento de estoque, validações de PDV e prazos de cancelamento.
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
                                            label="Desconto máximo permitido no PDV (%)"
                                            type="number"
                                            min="0"
                                            max="100"
                                            value={settings.maxDiscountPercent !== null ? String(settings.maxDiscountPercent) : "100"}
                                            onChange={(e) => {
                                                const val = e.target.value === "" ? null : Math.min(100, Math.max(0, Number(e.target.value)))
                                                updateField("maxDiscountPercent", val)
                                            }}
                                            placeholder="Ex: 15"
                                        />
                                        <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-1">
                                            Limite percentual de desconto que vendedores podem aplicar diretamente no PDV sem autorização de gerente (100% = sem limite).
                                        </p>
                                    </div>

                                    <div className="pt-2">
                                        <Checkbox
                                            label="Permitir alteração manual de preço unitário no PDV"
                                            checked={settings.allowCustomItemPrice}
                                            onCheckedChange={(v) => updateField("allowCustomItemPrice", Boolean(v))}
                                        />
                                        <p className="text-xs text-brand-inactive-text dark:text-dark-body ml-7 mt-1">
                                            Quando desativado, o vendedor só pode conceder descontos dentro do limite estipulado, sem alterar o preço de tabela do item.
                                        </p>
                                    </div>
                                </div>
                            </FormSection>

                            {/* Controle de Estoque */}
                            <FormSection title="Controle de Estoque na Venda" hasSeparator>
                                <div className="space-y-3">
                                    <Checkbox
                                        label="Permitir venda com estoque zerado ou negativo"
                                        checked={settings.allowNegativeStock}
                                        onCheckedChange={(v) => updateField("allowNegativeStock", Boolean(v))}
                                    />
                                    <p className="text-xs text-brand-inactive-text dark:text-dark-body ml-7">
                                        Se ativado, o sistema permite concluir vendas no caixa mesmo que a quantidade disponível no estoque seja insuficiente (o saldo ficará negativo).
                                    </p>
                                </div>
                            </FormSection>

                            {/* Operação de PDV e Orçamentos */}
                            <FormSection title="Operação do PDV e Orçamentos" hasSeparator>
                                <div className="space-y-6">
                                    <div>
                                        <Checkbox
                                            label="Obrigar seleção de vendedor ao registrar pedidos e vendas"
                                            checked={settings.requireSeller}
                                            onCheckedChange={(v) => updateField("requireSeller", Boolean(v))}
                                        />
                                        <p className="text-xs text-brand-inactive-text dark:text-dark-body ml-7 mt-1">
                                            Garante que toda venda seja vinculada a um membro da equipe para apuração correta de comissões e métricas.
                                        </p>
                                    </div>

                                    <div className="max-w-md">
                                        <FormDropdown
                                            label="Validade padrão de orçamentos"
                                            value={String(settings.quoteValidityDays ?? 15)}
                                            setValue={(v) => updateField("quoteValidityDays", Number(v))}
                                            options={QUOTE_VALIDITY_OPTIONS}
                                        />
                                        <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-1">
                                            Tempo que um orçamento permanece válido para aceite do cliente antes de ser marcado como expirado.
                                        </p>
                                    </div>
                                </div>
                            </FormSection>

                            {/* Cancelamento Automático de Pedidos */}
                            <FormSection
                                title="Cancelamento Automático de Pedidos"
                                description="Configure prazos de expiração para pedidos pendentes e liberação automática de estoque."
                                hasSeparator
                            >
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <FormDropdown
                                            label="Expiração de Pix Online / Mercado Pago"
                                            value={String(settings.onlinePixExpirationMinutes ?? 30)}
                                            setValue={(v) => updateField("onlinePixExpirationMinutes", Number(v))}
                                            options={PIX_EXPIRATION_OPTIONS}
                                        />
                                        <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-1">
                                            Após esse prazo sem confirmação de pagamento online, o pedido é cancelado e o estoque é devolvido.
                                        </p>
                                    </div>

                                    <div>
                                        <FormDropdown
                                            label="Expiração de Pedidos Manuais / Balcão"
                                            value={String(settings.autoCancelManualOrdersHours ?? 0)}
                                            setValue={(v) => updateField("autoCancelManualOrdersHours", Number(v))}
                                            options={MANUAL_ORDER_EXPIRATION_OPTIONS}
                                        />
                                        <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-1">
                                            Prazo para cancelar automaticamente pedidos pendentes com pagamento a combinar no balcão ou WhatsApp.
                                        </p>
                                    </div>
                                </div>
                            </FormSection>
                        </div>

                        {/* Right Column / Sidebar */}
                        <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 border-l-0 lg:border-l border-brand-border dark:border-dark-border mt-8 lg:mt-0 space-y-6">
                            <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border rounded-t-2xl" />
                                <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-4 mt-2">
                                    Sobre as Regras de Vendas
                                </h3>
                                <div className="space-y-4 text-sm text-brand-inactive-text dark:text-dark-body">
                                    <p>
                                        <strong className="text-brand-dark dark:text-dark-heading">Desconto Máximo:</strong>{" "}
                                        Protege sua margem de lucro impedindo que vendedores apliquem descontos excessivos sem validação.
                                    </p>
                                    <p>
                                        <strong className="text-brand-dark dark:text-dark-heading">Estoque Negativo:</strong>{" "}
                                        Ideal para empresas de serviços, produtos sob encomenda ou com reposição rápida que não querem travar a fila do caixa.
                                    </p>
                                    <p>
                                        <strong className="text-brand-dark dark:text-dark-heading">Cancelamento de Pedidos:</strong>{" "}
                                        Garante que produtos em pedidos abandonados não fiquem travados na reserva, liberando-os novamente para venda.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Mobile Bottom Bar */}
            <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 flex gap-3">
                <Button variant="outline" onClick={handleBack} className="flex-1 h-12" disabled={saving}>
                    Cancelar
                </Button>
                <Button onClick={handleSave} className="flex-1 h-12" disabled={!hasChanges || saving}>
                    {saving ? "Salvando..." : "Salvar"}
                </Button>
            </div>
        </FadeIn>
    )
}
