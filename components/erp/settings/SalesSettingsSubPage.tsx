"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
    Button,
    FormSection,
    FormDropdown,
    FormTextarea,
    Input,
    Checkbox,
    RadioButton,
    ThreeDotsLoader,
} from "@/components/reusable"
import { ChevronLeftIcon, SaveIcon, ShoppingCartIcon, PrinterIcon } from "@/lib/icons"
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
    initialTab = "geral",
}: {
    partnerId: string
    storeId?: string
    onBack: () => void
    initialTab?: "geral" | "recibos"
}) {
    const { success: notifySuccess, error: notifyError } = useNotification()
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [isScrolled, setIsScrolled] = useState(false)
    const [currentTab, setCurrentTab] = useState<"geral" | "recibos">(initialTab)
    const scrollContainerRef = useRef<HTMLDivElement>(null)

    // Sales Settings
    const [settings, setSettings] = useState<SalesSettings>(DEFAULT_SALES_SETTINGS)
    const [initialSettings, setInitialSettings] = useState<SalesSettings>(DEFAULT_SALES_SETTINGS)

    // Receipt Settings
    const [receiptSettings, setReceiptSettings] = useState<ReceiptSettings>(DEFAULT_RECEIPT_SETTINGS)
    const [initialReceiptSettings, setInitialReceiptSettings] = useState<ReceiptSettings>(DEFAULT_RECEIPT_SETTINGS)
    const [previewTab, setPreviewTab] = useState<"thermal" | "a4">("thermal")

    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
    }, [])

    const handleBack = useCallback(() => onBack(), [onBack])

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            setLoading(true)
            const [salesRes, receiptRes] = await Promise.all([
                getSalesSettingsAction(partnerId, storeId),
                getReceiptSettingsAction(partnerId, storeId),
            ])

            if (cancelled) return

            if (salesRes.success && salesRes.data) {
                setSettings(salesRes.data)
                setInitialSettings(salesRes.data)
            } else {
                notifyError(salesRes.error || "Erro ao carregar configurações de vendas")
            }

            if (receiptRes.success && receiptRes.data) {
                const loadedReceipt: ReceiptSettings = {
                    receiptMessage: receiptRes.data.receiptMessage ?? "",
                    receiptShowPolicyBlock: receiptRes.data.receiptShowPolicyBlock,
                    receiptShowAcknowledgment: receiptRes.data.receiptShowAcknowledgment,
                    defaultReceiptFormat: receiptRes.data.defaultReceiptFormat || "thermal",
                    showStorePhone: receiptRes.data.showStorePhone,
                    showStoreAddress: receiptRes.data.showStoreAddress,
                    showSellerName: receiptRes.data.showSellerName,
                }
                setReceiptSettings(loadedReceipt)
                setInitialReceiptSettings(loadedReceipt)
                setPreviewTab(loadedReceipt.defaultReceiptFormat)
            } else {
                notifyError(receiptRes.error || "Erro ao carregar configurações de recibos")
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

    const updateReceiptField = <K extends keyof ReceiptSettings>(field: K, value: ReceiptSettings[K]) => {
        setReceiptSettings((prev) => {
            const next = { ...prev, [field]: value }
            if (field === "defaultReceiptFormat") {
                setPreviewTab(value as "thermal" | "a4")
                setSettings((s) => ({ ...s, defaultReceiptFormat: value as "thermal" | "a4" }))
            }
            return next
        })
    }

    const hasSalesChanges = useMemo(() => {
        return JSON.stringify(settings) !== JSON.stringify(initialSettings)
    }, [settings, initialSettings])

    const hasReceiptChanges = useMemo(() => {
        return JSON.stringify(receiptSettings) !== JSON.stringify(initialReceiptSettings)
    }, [receiptSettings, initialReceiptSettings])

    const hasChanges = hasSalesChanges || hasReceiptChanges

    async function handleSave() {
        setSaving(true)
        const promises: Promise<any>[] = []

        if (hasSalesChanges) {
            promises.push(updateSalesSettingsAction(partnerId, settings, storeId))
        }

        if (hasReceiptChanges) {
            promises.push(
                updateReceiptSettingsAction(
                    partnerId,
                    {
                        receiptMessage: (receiptSettings.receiptMessage || "").trim() || null,
                        receiptShowPolicyBlock: receiptSettings.receiptShowPolicyBlock,
                        receiptShowAcknowledgment: receiptSettings.receiptShowAcknowledgment,
                        defaultReceiptFormat: receiptSettings.defaultReceiptFormat,
                        showStorePhone: receiptSettings.showStorePhone,
                        showStoreAddress: receiptSettings.showStoreAddress,
                        showSellerName: receiptSettings.showSellerName,
                    },
                    storeId
                )
            )
        }

        const results = await Promise.all(promises)
        setSaving(false)

        const hasError = results.some((r) => !r.success)
        if (!hasError) {
            setInitialSettings({ ...settings })
            setInitialReceiptSettings({ ...receiptSettings })
            notifySuccess("Configurações salvas com sucesso!")
        } else {
            const err = results.find((r) => !r.success)?.error
            notifyError(err || "Erro ao salvar configurações")
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
                <div className="sticky top-0 z-30 w-full bg-white dark:bg-dark-surface border-b border-brand-border dark:border-dark-border transition-all duration-500 ease-in-out">
                    <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 pt-3">
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
                        <div className="hidden md:flex items-start justify-between mb-2">
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
                                    Defina regras de precificação, margem padrão, descontos, estoque, operação de PDV e emissão de recibos.
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

                        {/* Tabs Bar */}
                        <div className="flex items-center gap-6">
                            <button
                                type="button"
                                onClick={() => setCurrentTab("geral")}
                                className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
                                    currentTab === "geral"
                                        ? "border-brand-primary text-brand-dark dark:text-white"
                                        : "border-transparent text-brand-inactive-text dark:text-dark-body hover:text-brand-dark dark:hover:text-white"
                                }`}
                            >
                                <ShoppingCartIcon size={16} />
                                Dados Gerais
                            </button>
                            <button
                                type="button"
                                onClick={() => setCurrentTab("recibos")}
                                className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
                                    currentTab === "recibos"
                                        ? "border-brand-primary text-brand-dark dark:text-white"
                                        : "border-transparent text-brand-inactive-text dark:text-dark-body hover:text-brand-dark dark:hover:text-white"
                                }`}
                            >
                                <PrinterIcon size={16} />
                                Recibos e Impressão
                            </button>
                        </div>
                    </div>
                </div>

                {/* Content Body */}
                <div className="px-3 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
                    {currentTab === "geral" ? (
                        /* TAB 1: DADOS GERAIS */
                        <div className="grid grid-cols-12 gap-y-8 lg:gap-y-0 relative">
                            {/* Left Column */}
                            <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12 space-y-12">
                                {/* Margem e Precificação Padrão */}
                                <FormSection
                                    title="Margem de Lucro e Precificação"
                                    description="Defina a margem percentual padrão que será aplicada sobre o custo para sugerir o preço de venda."
                                >
                                    <div className="space-y-4">
                                        <div className="max-w-md">
                                            <Input
                                                label="Margem de lucro padrão (%)"
                                                type="number"
                                                min="0"
                                                step="any"
                                                value={settings.defaultProfitMarginPercent !== null && settings.defaultProfitMarginPercent !== undefined ? String(settings.defaultProfitMarginPercent) : ""}
                                                onChange={(e) => {
                                                    const val = e.target.value === "" ? null : Math.max(0, Number(e.target.value))
                                                    updateField("defaultProfitMarginPercent", val)
                                                }}
                                                placeholder="Ex: 30"
                                                suffix={<span className="text-brand-inactive-text text-sm font-medium">%</span>}
                                            />
                                            <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-1">
                                                Margem aplicada automaticamente para calcular o preço de venda a partir do preço de custo ao criar ou importar produtos e serviços (planilhas ou XML de NF-e), quando o preço final não for especificado.
                                            </p>
                                        </div>
                                    </div>
                                </FormSection>

                                {/* Descontos & Preços */}
                                <FormSection title="Descontos e Preços no PDV" hasSeparator>
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
                                            <strong className="text-brand-dark dark:text-dark-heading">Margem Padrão:</strong>{" "}
                                            Agiliza o cadastro e a importação em massa (XML ou planilhas), calculando automaticamente o preço de venda a partir do custo quando a margem ou o preço final não forem especificados.
                                        </p>
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
                    ) : (
                        /* TAB 2: RECIBOS E IMPRESSÃO */
                        <div className="grid grid-cols-12 gap-y-8 lg:gap-y-0 relative">
                            {/* Left Column - Formulário */}
                            <div className="col-span-12 lg:col-span-7 pr-0 lg:pr-8 space-y-10">
                                {/* Formato Padrão de Impressão */}
                                <FormSection title="Formato padrão de impressão">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div
                                            onClick={() => updateReceiptField("defaultReceiptFormat", "thermal")}
                                            className={`cursor-pointer p-4 rounded-xl border transition-all duration-200 flex flex-col justify-between ${
                                                receiptSettings.defaultReceiptFormat === "thermal"
                                                    ? "border-brand-dark dark:border-white bg-brand-light-gray/30 dark:bg-dark-surface-elevated ring-1 ring-brand-dark dark:ring-white"
                                                    : "border-brand-border dark:border-dark-border hover:border-brand-dark/40"
                                            }`}
                                        >
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="font-bold text-sm text-brand-dark dark:text-dark-heading">
                                                    Bobina Térmica (80mm)
                                                </span>
                                                <RadioButton
                                                    name="defaultReceiptFormat"
                                                    value="thermal"
                                                    checked={receiptSettings.defaultReceiptFormat === "thermal"}
                                                    onChange={() => updateReceiptField("defaultReceiptFormat", "thermal")}
                                                />
                                            </div>
                                            <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                                                Ideal para impressoras de cupom não fiscal e agilidade no balcão do PDV.
                                            </p>
                                        </div>

                                        <div
                                            onClick={() => updateReceiptField("defaultReceiptFormat", "a4")}
                                            className={`cursor-pointer p-4 rounded-xl border transition-all duration-200 flex flex-col justify-between ${
                                                receiptSettings.defaultReceiptFormat === "a4"
                                                    ? "border-brand-dark dark:border-white bg-brand-light-gray/30 dark:bg-dark-surface-elevated ring-1 ring-brand-dark dark:ring-white"
                                                    : "border-brand-border dark:border-dark-border hover:border-brand-dark/40"
                                            }`}
                                        >
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="font-bold text-sm text-brand-dark dark:text-dark-heading">
                                                    Folha A4 (Padrão)
                                                </span>
                                                <RadioButton
                                                    name="defaultReceiptFormat"
                                                    value="a4"
                                                    checked={receiptSettings.defaultReceiptFormat === "a4"}
                                                    onChange={() => updateReceiptField("defaultReceiptFormat", "a4")}
                                                />
                                            </div>
                                            <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                                                Ideal para vendas corporativas, faturamento e impressoras jato de tinta / laser.
                                            </p>
                                        </div>
                                    </div>
                                </FormSection>

                                {/* Mensagem do Recibo */}
                                <FormSection title="Mensagem do Recibo" hasSeparator>
                                    <div className="space-y-4">
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
                                        <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                                            Esta mensagem aparece destacada no rodapé de todos os recibos de venda emitidos no sistema.
                                        </p>
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

                                {/* Informações da Loja */}
                                <FormSection title="Informações no Cabeçalho" hasSeparator>
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
                                </FormSection>
                            </div>

                            {/* Right Column - Live Preview */}
                            <div className="col-span-12 lg:col-span-5 pl-0 lg:pl-8 border-l-0 lg:border-l border-brand-border dark:border-dark-border mt-8 lg:mt-0">
                                <div className="sticky top-24 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <PrinterIcon className="w-5 h-5 text-brand-dark dark:text-white" />
                                            <h3 className="font-bold text-sm text-brand-dark dark:text-dark-heading">
                                                Prévia em Tempo Real
                                            </h3>
                                        </div>
                                        <div className="flex gap-1 bg-brand-light-gray dark:bg-dark-surface p-1 rounded-lg border border-brand-border dark:border-dark-border">
                                            <button
                                                type="button"
                                                onClick={() => setPreviewTab("thermal")}
                                                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                                                    previewTab === "thermal"
                                                        ? "bg-white dark:bg-dark-background text-brand-dark dark:text-dark-heading shadow-xs"
                                                        : "text-brand-inactive-text dark:text-dark-body hover:text-brand-dark"
                                                }`}
                                            >
                                                Térmica (80mm)
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setPreviewTab("a4")}
                                                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                                                    previewTab === "a4"
                                                        ? "bg-white dark:bg-dark-background text-brand-dark dark:text-dark-heading shadow-xs"
                                                        : "text-brand-inactive-text dark:text-dark-body hover:text-brand-dark"
                                                }`}
                                            >
                                                Folha A4
                                            </button>
                                        </div>
                                    </div>

                                    {/* Mockup Box */}
                                    <div className="bg-[#f9fafb] dark:bg-[#18181b] p-4 sm:p-6 rounded-2xl border border-brand-border dark:border-dark-border overflow-hidden flex justify-center items-start shadow-inner">
                                        {previewTab === "thermal" ? (
                                            /* Térmica 80mm Preview Mock */
                                            <div className="w-full max-w-[280px] bg-white text-black font-mono text-[11px] p-4 shadow-md rounded-sm border border-neutral-200 leading-tight">
                                                <div className="text-center font-bold text-xs uppercase mb-1">
                                                    SUA LOJA EXEMPLO
                                                </div>
                                                <div className="text-center text-[10px] text-neutral-600 mb-2">
                                                    CNPJ: 12.345.678/0001-90
                                                    {receiptSettings.showStoreAddress && (
                                                        <div>Av. Principal, 1000 - Centro</div>
                                                    )}
                                                    {receiptSettings.showStorePhone && (
                                                        <div>Tel: (11) 99999-9999</div>
                                                    )}
                                                </div>

                                                <div className="border-b border-dashed border-neutral-400 my-2" />

                                                <div className="flex justify-between font-bold text-[10px]">
                                                    <span>PEDIDO #1024</span>
                                                    <span>27/08/2026 14:30</span>
                                                </div>
                                                {receiptSettings.showSellerName && (
                                                    <div className="text-[10px] text-neutral-600">
                                                        Vendedor: Carlos Silva
                                                    </div>
                                                )}

                                                <div className="border-b border-dashed border-neutral-400 my-2" />

                                                <div className="space-y-1 text-[10px]">
                                                    <div className="flex justify-between">
                                                        <span>1x Camiseta Básica</span>
                                                        <span>R$ 59,90</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span>2x Meia Esportiva</span>
                                                        <span>R$ 29,80</span>
                                                    </div>
                                                </div>

                                                <div className="border-b border-dashed border-neutral-400 my-2" />

                                                <div className="flex justify-between font-bold text-xs">
                                                    <span>TOTAL</span>
                                                    <span>R$ 89,70</span>
                                                </div>
                                                <div className="flex justify-between text-[10px] text-neutral-600">
                                                    <span>Forma de Pagto:</span>
                                                    <span>Pix</span>
                                                </div>

                                                {receiptSettings.receiptShowPolicyBlock && (
                                                    <div className="mt-3 pt-2 border-t border-dashed border-neutral-400 text-[9px] text-neutral-600 text-center">
                                                        * Trocas em até 30 dias com esta nota *
                                                    </div>
                                                )}

                                                {receiptSettings.receiptMessage && (
                                                    <div className="mt-3 text-center font-bold text-[10px] text-neutral-800 break-words whitespace-pre-line">
                                                        {receiptSettings.receiptMessage}
                                                    </div>
                                                )}

                                                {receiptSettings.receiptShowAcknowledgment && (
                                                    <div className="mt-4 pt-3 border-t border-neutral-400 text-[9px] text-center">
                                                        <div className="h-5 border-b border-neutral-400 mb-1" />
                                                        <span>Assinatura do Cliente</span>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            /* Folha A4 Preview Mock */
                                            <div className="w-full bg-white text-black font-sans text-[10px] p-5 shadow-md rounded-md border border-neutral-200 leading-normal">
                                                <div className="flex justify-between items-start border-b pb-3 mb-3">
                                                    <div>
                                                        <div className="font-bold text-sm text-neutral-900">
                                                            SUA LOJA EXEMPLO
                                                        </div>
                                                        <div className="text-neutral-500 text-[9px]">
                                                            CNPJ: 12.345.678/0001-90
                                                            {receiptSettings.showStorePhone && " • Tel: (11) 99999-9999"}
                                                        </div>
                                                        {receiptSettings.showStoreAddress && (
                                                            <div className="text-neutral-500 text-[9px]">
                                                                Av. Principal, 1000 - Centro, São Paulo/SP
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="text-right">
                                                        <span className="bg-neutral-100 text-neutral-800 px-2 py-0.5 rounded text-[9px] font-bold">
                                                            COMPROVANTE DE VENDA
                                                        </span>
                                                        <div className="text-[9px] text-neutral-500 mt-1">
                                                            Nº: 1024 • 27/08/2026
                                                        </div>
                                                        {receiptSettings.showSellerName && (
                                                            <div className="text-[9px] text-neutral-500">
                                                                Vendedor: Carlos Silva
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="bg-neutral-50 rounded p-2 mb-3">
                                                    <div className="font-bold text-[9px] text-neutral-700 mb-1">
                                                        ITENS DO PEDIDO
                                                    </div>
                                                    <div className="space-y-1">
                                                        <div className="flex justify-between">
                                                            <span>1x Camiseta Básica Algodão (Tam: M)</span>
                                                            <span className="font-semibold">R$ 59,90</span>
                                                        </div>
                                                        <div className="flex justify-between">
                                                            <span>2x Meia Esportiva Cano Médio</span>
                                                            <span className="font-semibold">R$ 29,80</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex justify-end mb-3">
                                                    <div className="text-right">
                                                        <div className="text-[9px] text-neutral-500">Valor Total:</div>
                                                        <div className="text-sm font-bold text-neutral-900">
                                                            R$ 89,70
                                                        </div>
                                                    </div>
                                                </div>

                                                {receiptSettings.receiptShowPolicyBlock && (
                                                    <div className="bg-neutral-50 p-2 rounded text-[8px] text-neutral-600 mb-2">
                                                        <strong>Política de Troca & Garantia:</strong> Trocas aceitas em até 30 dias mediante apresentação deste comprovante e produto com etiqueta original intacta.
                                                    </div>
                                                )}

                                                {receiptSettings.receiptMessage && (
                                                    <div className="text-center font-medium text-[9px] text-neutral-700 my-2 italic break-words whitespace-pre-line">
                                                        "{receiptSettings.receiptMessage}"
                                                    </div>
                                                )}

                                                {receiptSettings.receiptShowAcknowledgment && (
                                                    <div className="mt-4 pt-4 border-t border-dashed border-neutral-300 flex justify-between items-end text-[8px] text-neutral-600">
                                                        <div>Recebi as mercadorias descritas neste documento.</div>
                                                        <div className="w-32 border-b border-neutral-400 text-center pb-0.5">
                                                            Assinatura
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
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
