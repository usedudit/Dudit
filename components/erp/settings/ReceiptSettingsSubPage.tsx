"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button, FormSection, FormTextarea, Checkbox, ThreeDotsLoader, SidebarCard, SavingStatusModal } from "@/components/reusable"
import { ChevronLeftIcon, SaveIcon } from "@/lib/icons"
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

    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
    }, [])

    const handleBack = useCallback(() => onBack(), [onBack])

    useEffect(() => {
        let cancelled = false
            ; (async () => {
                setLoading(true)
                const res = await getReceiptSettingsAction(partnerId)
                if (cancelled) return
                if (res.success && res.data) {
                    const loaded = {
                        receiptMessage: res.data.receiptMessage ?? "",
                        receiptShowPolicyBlock: res.data.receiptShowPolicyBlock,
                        receiptShowAcknowledgment: res.data.receiptShowAcknowledgment,
                        showStorePhone: res.data.showStorePhone,
                        showStoreAddress: res.data.showStoreAddress,
                        showSellerName: res.data.showSellerName,
                    }
                    setSettings(loaded)
                    setInitialSettings(loaded)
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
        setSettings((prev) => ({ ...prev, [field]: value }))
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
            <div className="flex h-full min-h-[200px] w-full items-center justify-center bg-white dark:bg-dark-background">
                <ThreeDotsLoader />
            </div>
        )
    }

    return (
        <FadeIn className="flex flex-col h-full bg-white dark:bg-dark-background overflow-hidden relative transition-colors duration-500 ease-in-out">
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
                            className={`absolute -left-12 top-3 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"
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
                                    className={`font-bold text-brand-dark dark:text-dark-heading transition-all duration-500 flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"
                                        }`}
                                >
                                    <span className="truncate">Recibos e Impressão</span>
                                </h1>

                                <div
                                    className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"
                                        }`}
                                >
                                    Personalize mensagens de rodapé e elementos dos seus comprovantes de venda.
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
                        <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12 space-y-10">
                            {/* Mensagem do Recibo */}
                            <FormSection title="Mensagem do Recibo">
                                <div>
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
                        </div>

                        {/* Right Column - Sidebar */}
                        <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 border-l-0 lg:border-l border-brand-border dark:border-dark-border mt-8 lg:mt-0 space-y-6">
                            <SidebarCard hasTopStrip hasSeparator title="Informações no Cabeçalho">
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
                            </SidebarCard>
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
