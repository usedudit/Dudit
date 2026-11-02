"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Button, FormSection, FormDropdown, FormTextarea, Checkbox, SidebarCard, SavingStatusModal } from "@/components/reusable"
import { ChevronLeftIcon, SaveIcon } from "@/lib/icons"
import { FadeIn } from "@/components/animations/FadeIn"
import { useNotification } from "@/hooks/use-notification"
import {
    getSystemSettingsAction,
    updateSystemSettingsAction,
} from "@/app/actions/erp/settings-system"

const TIMEZONE_OPTIONS = [
    { value: "America/Noronha", label: "Fernando de Noronha (UTC-2)" },
    { value: "America/Sao_Paulo", label: "Brasília (UTC-3)" },
    { value: "America/Manaus", label: "Amazonas (UTC-4)" },
    { value: "America/Rio_Branco", label: "Acre (UTC-5)" },
]

export function SystemSettingsSubPage({
    partnerId,
    onBack,
}: {
    partnerId: string
    onBack: () => void
}) {
    const { success: notifySuccess, error: notifyError } = useNotification()
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [timezone, setTimezone] = useState("America/Sao_Paulo")
    const [originalTimezone, setOriginalTimezone] = useState("America/Sao_Paulo")
    const [receiptMessage, setReceiptMessage] = useState("")
    const [originalReceiptMessage, setOriginalReceiptMessage] = useState("")
    const [receiptShowPolicyBlock, setReceiptShowPolicyBlock] = useState(true)
    const [originalReceiptShowPolicyBlock, setOriginalReceiptShowPolicyBlock] = useState(true)
    const [receiptShowAcknowledgment, setReceiptShowAcknowledgment] = useState(true)
    const [originalReceiptShowAcknowledgment, setOriginalReceiptShowAcknowledgment] = useState(true)

    const [isScrolled, setIsScrolled] = useState(false)
    const scrollContainerRef = useRef<HTMLDivElement>(null)

    const hasChanges =
        timezone !== originalTimezone ||
        receiptMessage !== originalReceiptMessage ||
        receiptShowPolicyBlock !== originalReceiptShowPolicyBlock ||
        receiptShowAcknowledgment !== originalReceiptShowAcknowledgment

    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
    }, [])

    const handleBack = useCallback(() => onBack(), [onBack])

    useEffect(() => {
        let cancelled = false
            ; (async () => {
                setLoading(true)
                const res = await getSystemSettingsAction(partnerId)
                if (cancelled) return
                if (res.success) {
                    setTimezone(res.timezone)
                    setOriginalTimezone(res.timezone)
                    setReceiptMessage(res.receiptMessage || "")
                    setOriginalReceiptMessage(res.receiptMessage || "")
                    setReceiptShowPolicyBlock(res.receiptShowPolicyBlock)
                    setOriginalReceiptShowPolicyBlock(res.receiptShowPolicyBlock)
                    setReceiptShowAcknowledgment(res.receiptShowAcknowledgment)
                    setOriginalReceiptShowAcknowledgment(res.receiptShowAcknowledgment)
                } else {
                    notifyError(res.error || "Erro ao carregar configurações")
                }
                setLoading(false)
            })()
        return () => { cancelled = true }
    }, [partnerId, notifyError])

    async function handleSave() {
        setSaving(true)
        const res = await updateSystemSettingsAction(partnerId, {
            timezone,
            receiptMessage: receiptMessage.trim() || null,
            receiptShowPolicyBlock,
            receiptShowAcknowledgment,
        })
        setSaving(false)
        if (res.success) {
            setOriginalTimezone(timezone)
            setOriginalReceiptMessage(receiptMessage.trim())
            setOriginalReceiptShowPolicyBlock(receiptShowPolicyBlock)
            setOriginalReceiptShowAcknowledgment(receiptShowAcknowledgment)
            notifySuccess("Configurações do sistema salvas com sucesso!")
        } else {
            notifyError(res.error || "Erro ao salvar")
        }
    }

    if (loading) {
        return (
            <FadeIn className="flex flex-col h-full bg-white dark:bg-dark-background overflow-hidden">
                <div className="flex items-center justify-center h-full text-brand-inactive-text">
                    Carregando configurações do sistema...
                </div>
            </FadeIn>
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
                        <div className={`absolute -left-12 top-3 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                            <Button variant="filled" onClick={handleBack} className="w-10 h-10 p-0 flex items-center justify-center">
                                <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                            </Button>
                        </div>

                        {/* Title row */}
                        <div className="hidden md:flex items-start justify-between">
                            <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                <h1 className={`font-bold text-brand-dark dark:text-dark-heading transition-all duration-500 flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                    <span className="truncate">Configurações do Sistema</span>
                                </h1>

                                <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                    Gerencie as configurações gerais do seu sistema
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
                            <FormSection title="Fuso horário">
                                <div className="space-y-2">
                                    <FormDropdown
                                        label="Fuso horário do negócio"
                                        value={timezone}
                                        setValue={setTimezone}
                                        options={TIMEZONE_OPTIONS}
                                    />
                                    <p className="text-xs text-brand-inactive-text">
                                        Define como datas e horários são interpretados no sistema. Altere apenas se sua
                                        loja opera em um fuso horário diferente de Brasília.
                                    </p>
                                </div>
                            </FormSection>

                            <FormSection title="Mensagem do Recibo" hasSeparator>
                                <div className="space-y-4">
                                    <Checkbox
                                        label="Incluir confirmação de recebimento e assinatura no recibo"
                                        checked={receiptShowAcknowledgment}
                                        onCheckedChange={(v) => setReceiptShowAcknowledgment(Boolean(v))}
                                    />
                                    <Checkbox
                                        label="Exibir bloco de política de trocas e devolução no recibo"
                                        checked={receiptShowPolicyBlock}
                                        onCheckedChange={(v) => setReceiptShowPolicyBlock(Boolean(v))}
                                    />
                                    <FormTextarea
                                        name="receiptMessage"
                                        label="Mensagem configurável no recibo"
                                        value={receiptMessage}
                                        onChange={(e) => setReceiptMessage(e.target.value)}
                                        rows={3}
                                        placeholder="Ex.: Obrigado pela preferência! Consulte nossa política de trocas na loja."
                                        maxLength={1000}
                                        showCharacterCount
                                    />
                                    <p className="text-xs text-brand-inactive-text">
                                        Estas opções e mensagem são aplicadas como padrão em todos os recibos de venda (térmicos de 80mm e folhas A4).
                                    </p>
                                </div>
                            </FormSection>
                        </div>

                        {/* Right Column / Sidebar */}
                        <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 border-l-0 lg:border-l border-brand-border dark:border-dark-border mt-8 lg:mt-0 space-y-6">
                            <SidebarCard hasTopStrip hasSeparator title="Sobre as Configurações do Sistema">
                                <div className="space-y-4 text-sm text-brand-inactive-text dark:text-dark-body">
                                    <p>
                                        <strong className="text-brand-dark dark:text-dark-heading">Fuso horário:</strong>{" "}
                                        Padroniza a exibição de datas e horários em agendamentos, relatórios e dashboard.
                                    </p>
                                    <p>
                                        <strong className="text-brand-dark dark:text-dark-heading">Mensagem do Recibo:</strong>{" "}
                                        Personalize a mensagem final que seus clientes leem ao receber o recibo da compra.
                                    </p>
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
                    Salvar
                </Button>
            </div>

            <SavingStatusModal isOpen={saving} text="Salvando configurações..." />
        </FadeIn>
    )
}

