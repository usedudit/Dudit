"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button, FormSection, FormTextarea, Checkbox, RadioButton, ThreeDotsLoader, SavingStatusModal } from "@/components/reusable"
import { ChevronLeftIcon, SaveIcon, PrinterIcon, CheckIcon } from "@/lib/icons"
import { FadeIn } from "@/components/animations/FadeIn"
import { useNotification } from "@/hooks/use-notification"
import {
    getReceiptSettingsAction,
    updateReceiptSettingsAction,
} from "@/app/actions/erp/sales-settings"
import {
    DEFAULT_RECEIPT_SETTINGS,
    type ReceiptSettings,
} from "@/lib/sales/sales-settings-types"

export function ReceiptSettingsSubPage({
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

    const [settings, setSettings] = useState<ReceiptSettings>(DEFAULT_RECEIPT_SETTINGS)
    const [initialSettings, setInitialSettings] = useState<ReceiptSettings>(DEFAULT_RECEIPT_SETTINGS)
    const [previewTab, setPreviewTab] = useState<"thermal" | "a4">("thermal")

    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
    }, [])

    const handleBack = useCallback(() => onBack(), [onBack])

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            setLoading(true)
            const res = await getReceiptSettingsAction(partnerId)
            if (cancelled) return
            if (res.success && res.data) {
                const loaded = {
                    receiptMessage: res.data.receiptMessage ?? "",
                    receiptShowPolicyBlock: res.data.receiptShowPolicyBlock,
                    receiptShowAcknowledgment: res.data.receiptShowAcknowledgment,
                    defaultReceiptFormat: res.data.defaultReceiptFormat || "thermal",
                    showStorePhone: res.data.showStorePhone,
                    showStoreAddress: res.data.showStoreAddress,
                    showSellerName: res.data.showSellerName,
                }
                setSettings(loaded)
                setInitialSettings(loaded)
                setPreviewTab(loaded.defaultReceiptFormat)
            } else {
                notifyError(res.error || "Erro ao carregar configurações de recibos")
            }
            setLoading(false)
        })()
        return () => {
            cancelled = true
        }
    }, [partnerId, notifyError])

    const updateField = <K extends keyof ReceiptSettings>(field: K, value: ReceiptSettings[K]) => {
        setSettings((prev) => {
            const next = { ...prev, [field]: value }
            if (field === "defaultReceiptFormat") {
                setPreviewTab(value as "thermal" | "a4")
            }
            return next
        })
    }

    const hasChanges = useMemo(() => {
        return JSON.stringify(settings) !== JSON.stringify(initialSettings)
    }, [settings, initialSettings])

    async function handleSave() {
        setSaving(true)
        const res = await updateReceiptSettingsAction(
            partnerId,
            {
                receiptMessage: (settings.receiptMessage || "").trim() || null,
                receiptShowPolicyBlock: settings.receiptShowPolicyBlock,
                receiptShowAcknowledgment: settings.receiptShowAcknowledgment,
                defaultReceiptFormat: settings.defaultReceiptFormat,
                showStorePhone: settings.showStorePhone,
                showStoreAddress: settings.showStoreAddress,
                showSellerName: settings.showSellerName,
            }
        )
        setSaving(false)
        if (res.success) {
            setInitialSettings({ ...settings })
            notifySuccess("Configurações de recibos salvas com sucesso!")
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
                                    <span className="truncate">Recibos e Impressão</span>
                                </h1>

                                <div
                                    className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${
                                        isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"
                                    }`}
                                >
                                    Personalize mensagens de rodapé, formato padrão e elementos dos seus comprovantes de venda.
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
                        {/* Left Column - Formulário */}
                        <div className="col-span-12 lg:col-span-7 pr-0 lg:pr-8 space-y-10">
                            {/* Formato Padrão de Impressão */}
                            <FormSection title="Formato padrão de impressão">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div
                                        onClick={() => updateField("defaultReceiptFormat", "thermal")}
                                        className={`cursor-pointer p-4 rounded-xl border transition-all duration-200 flex flex-col justify-between ${
                                            settings.defaultReceiptFormat === "thermal"
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
                                                checked={settings.defaultReceiptFormat === "thermal"}
                                                onChange={() => updateField("defaultReceiptFormat", "thermal")}
                                            />
                                        </div>
                                        <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                                            Ideal para impressoras de cupom não fiscal e agilidade no balcão do PDV.
                                        </p>
                                    </div>

                                    <div
                                        onClick={() => updateField("defaultReceiptFormat", "a4")}
                                        className={`cursor-pointer p-4 rounded-xl border transition-all duration-200 flex flex-col justify-between ${
                                            settings.defaultReceiptFormat === "a4"
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
                                                checked={settings.defaultReceiptFormat === "a4"}
                                                onChange={() => updateField("defaultReceiptFormat", "a4")}
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
                                        value={settings.receiptMessage || ""}
                                        onChange={(e) => updateField("receiptMessage", e.target.value)}
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
                                        checked={settings.receiptShowPolicyBlock}
                                        onCheckedChange={(v) => updateField("receiptShowPolicyBlock", Boolean(v))}
                                    />
                                    <Checkbox
                                        label="Incluir campo de assinatura e termo de recebimento do cliente"
                                        checked={settings.receiptShowAcknowledgment}
                                        onCheckedChange={(v) => updateField("receiptShowAcknowledgment", Boolean(v))}
                                    />
                                </div>
                            </FormSection>

                            {/* Informações da Loja */}
                            <FormSection title="Informações no Cabeçalho" hasSeparator>
                                <div className="space-y-4">
                                    <Checkbox
                                        label="Exibir telefone da loja no recibo"
                                        checked={settings.showStorePhone}
                                        onCheckedChange={(v) => updateField("showStorePhone", Boolean(v))}
                                    />
                                    <Checkbox
                                        label="Exibir endereço completo da loja"
                                        checked={settings.showStoreAddress}
                                        onCheckedChange={(v) => updateField("showStoreAddress", Boolean(v))}
                                    />
                                    <Checkbox
                                        label="Exibir nome do vendedor que realizou a venda"
                                        checked={settings.showSellerName}
                                        onCheckedChange={(v) => updateField("showSellerName", Boolean(v))}
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
                                            className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
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
                                            className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
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
                                                {settings.showStoreAddress && (
                                                    <div>Av. Principal, 1000 - Centro</div>
                                                )}
                                                {settings.showStorePhone && (
                                                    <div>Tel: (11) 99999-9999</div>
                                                )}
                                            </div>

                                            <div className="border-b border-dashed border-neutral-400 my-2" />

                                            <div className="flex justify-between font-bold text-[10px]">
                                                <span>PEDIDO #1024</span>
                                                <span>27/08/2026 14:30</span>
                                            </div>
                                            {settings.showSellerName && (
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

                                            {settings.receiptShowPolicyBlock && (
                                                <div className="mt-3 pt-2 border-t border-dashed border-neutral-400 text-[9px] text-neutral-600 text-center">
                                                    * Trocas em até 30 dias com esta nota *
                                                </div>
                                            )}

                                            {settings.receiptMessage && (
                                                <div className="mt-3 text-center font-bold text-[10px] text-neutral-800 break-words whitespace-pre-line">
                                                    {settings.receiptMessage}
                                                </div>
                                            )}

                                            {settings.receiptShowAcknowledgment && (
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
                                                        {settings.showStorePhone && " • Tel: (11) 99999-9999"}
                                                    </div>
                                                    {settings.showStoreAddress && (
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
                                                    {settings.showSellerName && (
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

                                            {settings.receiptShowPolicyBlock && (
                                                <div className="bg-neutral-50 p-2 rounded text-[8px] text-neutral-600 mb-2">
                                                    <strong>Política de Troca & Garantia:</strong> Trocas aceitas em até 30 dias mediante apresentação deste comprovante e produto com etiqueta original intacta.
                                                </div>
                                            )}

                                            {settings.receiptMessage && (
                                                <div className="text-center font-medium text-[9px] text-neutral-700 my-2 italic break-words whitespace-pre-line">
                                                    "{settings.receiptMessage}"
                                                </div>
                                            )}

                                            {settings.receiptShowAcknowledgment && (
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

            <SavingStatusModal isOpen={saving} text="Salvando configurações..." />
        </FadeIn>
    )
}
