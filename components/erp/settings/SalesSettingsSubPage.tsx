"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
    Button,
    FormSection,
    FormDropdown,
    FormTextarea,
    Input,
    Checkbox,
    ThreeDotsLoader,
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
    SidebarCard,
    SavingStatusModal,
} from "@/components/reusable"
import { ChevronLeftIcon, SaveIcon } from "@/lib/icons"
import { FadeIn } from "@/components/animations/FadeIn"
import { useNotification } from "@/hooks/use-notification"
import {
    getSalesSettingsAction,
    updateSalesSettingsAction,
    getReceiptSettingsAction,
    updateReceiptSettingsAction,
} from "@/app/actions/erp/sales-settings"
import {
    DEFAULT_SALES_SETTINGS,
    DEFAULT_RECEIPT_SETTINGS,
    type SalesSettings,
    type ReceiptSettings,
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
    const [activeTab, setActiveTab] = useState("general")

    const [settings, setSettings] = useState<SalesSettings>(DEFAULT_SALES_SETTINGS)
    const [initialSettings, setInitialSettings] = useState<SalesSettings>(DEFAULT_SALES_SETTINGS)

    const [receiptSettings, setReceiptSettings] = useState<ReceiptSettings>(DEFAULT_RECEIPT_SETTINGS)
    const [initialReceiptSettings, setInitialReceiptSettings] = useState<ReceiptSettings>(DEFAULT_RECEIPT_SETTINGS)

    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
    }, [])

    const handleBack = useCallback(() => onBack(), [onBack])

    useEffect(() => {
        let cancelled = false
            ; (async () => {
                setLoading(true)
                const [salesRes, receiptRes] = await Promise.all([
                    getSalesSettingsAction(partnerId),
                    getReceiptSettingsAction(partnerId),
                ])

                if (cancelled) return

                if (salesRes.success && salesRes.data) {
                    setSettings(salesRes.data)
                    setInitialSettings(salesRes.data)
                } else {
                    notifyError(salesRes.error || "Erro ao carregar configurações de vendas")
                }

                if (receiptRes.success && receiptRes.data) {
                    const loaded = {
                        receiptMessage: receiptRes.data.receiptMessage ?? "",
                        receiptShowPolicyBlock: receiptRes.data.receiptShowPolicyBlock,
                        receiptShowAcknowledgment: receiptRes.data.receiptShowAcknowledgment,
                        showStorePhone: receiptRes.data.showStorePhone,
                        showStoreAddress: receiptRes.data.showStoreAddress,
                        showSellerName: receiptRes.data.showSellerName,
                    }
                    setReceiptSettings(loaded)
                    setInitialReceiptSettings(loaded)
                } else {
                    notifyError(receiptRes.error || "Erro ao carregar configurações de recibos")
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

    const updateReceiptField = <K extends keyof ReceiptSettings>(field: K, value: ReceiptSettings[K]) => {
        setReceiptSettings((prev) => ({ ...prev, [field]: value }))
    }

    const hasChanges = useMemo(() => {
        return JSON.stringify(settings) !== JSON.stringify(initialSettings)
    }, [settings, initialSettings])

    const hasReceiptChanges = useMemo(() => {
        return JSON.stringify(receiptSettings) !== JSON.stringify(initialReceiptSettings)
    }, [receiptSettings, initialReceiptSettings])

    const anyHasChanges = hasChanges || hasReceiptChanges

    async function handleSave() {
        setSaving(true)

        const results = await Promise.all([
            hasChanges ? updateSalesSettingsAction(partnerId, settings) : Promise.resolve({ success: true as const }),
            hasReceiptChanges ? updateReceiptSettingsAction(partnerId, {
                receiptMessage: (receiptSettings.receiptMessage || "").trim() || null,
                receiptShowPolicyBlock: receiptSettings.receiptShowPolicyBlock,
                receiptShowAcknowledgment: receiptSettings.receiptShowAcknowledgment,
                showStorePhone: receiptSettings.showStorePhone,
                showStoreAddress: receiptSettings.showStoreAddress,
                showSellerName: receiptSettings.showSellerName,
            }) : Promise.resolve({ success: true as const }),
        ])

        setSaving(false)

        const allSuccess = results.every((r) => r.success)
        if (allSuccess) {
            if (hasChanges) setInitialSettings({ ...settings })
            if (hasReceiptChanges) setInitialReceiptSettings({ ...receiptSettings })
            notifySuccess("Configurações salvas com sucesso!")
        } else {
            const firstError = results.find((r) => !r.success)
            notifyError(firstError && "error" in firstError ? firstError.error || "Erro ao salvar configurações" : "Erro ao salvar configurações")
        }
    }

    if (loading) {
        return (
            <div className="flex h-full min-h-[200px] w-full items-center justify-center bg-white dark:bg-dark-background">
                <ThreeDotsLoader />
            </div>
        )
    }

    return (
        <FadeIn className="flex flex-col h-full bg-white dark:bg-dark-background overflow-hidden relative transition-colors duration-500 ease-in-out">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full w-full">
                <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-24 md:pb-8 scroll-smooth custom-scrollbar">

                    {/* Sticky Header */}
                    <div className="sticky top-0 z-30 w-full bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out">
                        <div className="max-w-[1300px] mx-auto relative px-4 md:px-6">

                            {/* Back button - desktop only */}
                            <div className={`absolute -left-12 top-3 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                                <Button variant="filled" onClick={handleBack} className="w-10 h-10 p-0 flex items-center justify-center">
                                    <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                </Button>
                            </div>

                            {/* Title row */}
                            <div className="hidden md:flex items-start justify-between">
                                <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                    <h1 className={`font-bold text-brand-dark dark:text-dark-heading transition-all duration-500 flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                        <span className="truncate">Configurações Gerais de Vendas</span>
                                    </h1>

                                    <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                        Defina regras de descontos, estoque, prazos e personalização de recibos.
                                    </div>
                                </div>

                                {/* Desktop action buttons */}
                                <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                                    <Button variant="outline" onClick={handleBack} disabled={saving}>
                                        Cancelar
                                    </Button>
                                    <Button onClick={handleSave} disabled={!anyHasChanges || saving} leftIcon={<SaveIcon size={18} />}>
                                        {saving ? "Salvando..." : "Salvar"}
                                    </Button>
                                </div>
                            </div>

                            {/* Tabs */}
                            <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                                <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                    <TabsTrigger value="general">Geral</TabsTrigger>
                                    <TabsTrigger value="receipts">
                                        Recibos e Impressão
                                    </TabsTrigger>
                                </TabsList>
                            </div>
                        </div>
                    </div>

                    {/* Content Body */}
                    <div className="px-3 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
                        <AnimatePresence mode="wait">
                            <TabsContent value="general" className="mt-0 focus-visible:outline-none">
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                    <div className="grid grid-cols-12 gap-y-8 lg:gap-y-0 relative">
                                        {/* Left Column */}
                                        <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12 space-y-12">
                                            {/* Descontos & Preços */}
                                            <FormSection title="Descontos e Preços">
                                                <div className="space-y-4">
                                                    <div className="col-span-12 sm:col-span-6">
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

                                                    <div className="col-span-12 sm:col-span-6">
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
                                                </div>
                                            </FormSection>
                                        </div>

                                        {/* Right Column / Sidebar */}
                                        <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 border-l-0 lg:border-l border-brand-border dark:border-dark-border mt-8 lg:mt-0 space-y-6">
                                            <SidebarCard hasTopStrip hasSeparator title="Cancelamento Automático e Prazos">
                                                <div className="space-y-4">
                                                    <FormDropdown
                                                        label="Expiração de Pedidos Manuais / Balcão"
                                                        value={String(settings.autoCancelManualOrdersHours ?? 0)}
                                                        setValue={(v) => updateField("autoCancelManualOrdersHours", Number(v))}
                                                        options={MANUAL_ORDER_EXPIRATION_OPTIONS}
                                                    />
                                                    <FormDropdown
                                                        label="Validade padrão de orçamentos"
                                                        value={String(settings.quoteValidityDays ?? 15)}
                                                        setValue={(v) => updateField("quoteValidityDays", Number(v))}
                                                        options={QUOTE_VALIDITY_OPTIONS}
                                                    />
                                                    <div className="flex items-center justify-between">
                                                        <p className="text-sm font-medium text-brand-dark dark:text-dark-heading">
                                                            Cancelar pedidos com sinal expirado
                                                        </p>
                                                        <Checkbox
                                                            checked={settings.cancelExpiredDepositOrders ?? false}
                                                            onChange={(checked: boolean) => updateField("cancelExpiredDepositOrders", Boolean(checked))}
                                                        />
                                                    </div>
                                                </div>
                                            </SidebarCard>
                                        </div>
                                    </div>
                                </motion.div>
                            </TabsContent>

                            <TabsContent value="receipts" className="mt-0 focus-visible:outline-none">
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                    <div className="grid grid-cols-12 gap-y-8 lg:gap-y-0 relative">
                                        {/* Left Column - Formulário */}
                                        <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12 space-y-10">
                                            {/* Mensagem do Recibo */}
                                            <FormSection title="Mensagem do Recibo">
                                                <div>
                                                    <FormTextarea
                                                        name="receiptMessage"
                                                        label="Mensagem personalizada de rodapé"
                                                        value={receiptSettings.receiptMessage || ""}
                                                        onChange={(e) => updateReceiptField("receiptMessage", e.target.value)}
                                                        rows={3}
                                                        placeholder="Ex.: Obrigado pela preferência! Siga nosso Instagram @sualoja"
                                                        maxLength={1000}
                                                        showCharacterCount
                                                    />
                                                </div>
                                            </FormSection>

                                            {/* Políticas e Termos */}
                                            <FormSection title="Políticas e Termos no Recibo" hasSeparator>
                                                <div className="space-y-4">
                                                    <Checkbox
                                                        label="Exibir resumo da política de trocas e garantia no recibo"
                                                        checked={receiptSettings.receiptShowPolicyBlock}
                                                        onCheckedChange={(v) => updateReceiptField("receiptShowPolicyBlock", Boolean(v))}
                                                    />
                                                    <Checkbox
                                                        label="Incluir campo de assinatura e termo de recebimento do cliente"
                                                        checked={receiptSettings.receiptShowAcknowledgment}
                                                        onCheckedChange={(v) => updateReceiptField("receiptShowAcknowledgment", Boolean(v))}
                                                    />
                                                </div>
                                            </FormSection>
                                        </div>

                                        {/* Right Column - Sidebar */}
                                        <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 border-l-0 lg:border-l border-brand-border dark:border-dark-border mt-8 lg:mt-0 space-y-6">
                                            <SidebarCard hasTopStrip hasSeparator title="Informações no Cabeçalho">
                                                <div className="space-y-4">
                                                    <Checkbox
                                                        label="Exibir telefone da loja no recibo"
                                                        checked={receiptSettings.showStorePhone}
                                                        onCheckedChange={(v) => updateReceiptField("showStorePhone", Boolean(v))}
                                                    />
                                                    <Checkbox
                                                        label="Exibir endereço completo da loja"
                                                        checked={receiptSettings.showStoreAddress}
                                                        onCheckedChange={(v) => updateReceiptField("showStoreAddress", Boolean(v))}
                                                    />
                                                    <Checkbox
                                                        label="Exibir nome do vendedor que realizou a venda"
                                                        checked={receiptSettings.showSellerName}
                                                        onCheckedChange={(v) => updateReceiptField("showSellerName", Boolean(v))}
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
                <Button onClick={handleSave} className="flex-1" disabled={!anyHasChanges || saving} leftIcon={<SaveIcon size={18} />}>
                    {saving ? "Salvando..." : "Salvar"}
                </Button>
            </div>

            <SavingStatusModal isOpen={saving} text="Salvando configurações..." />
        </FadeIn>
    )
}
