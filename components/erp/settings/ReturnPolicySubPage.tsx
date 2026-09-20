"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button, Input, FormSection, Checkbox, FormDropdown, FormTextarea, ThreeDotsLoader, SidebarCard } from "@/components/reusable"
import { ChevronLeftIcon, SaveIcon } from "@/lib/icons"
import { FadeIn } from "@/components/animations/FadeIn"
import { useNotification } from "@/hooks/use-notification"
import {
    getPartnerReturnPolicyAction,
    upsertPartnerReturnPolicyAction,
} from "@/app/actions/erp/return-policies"
import {
    buildDefaultPolicyText,
    getShippingPayerLabel,
    type PartnerReturnPolicy,
} from "@/lib/returns/policy"
import { AnimatePresence, motion } from "framer-motion"

const STORE_CREDIT_VALIDITY_OPTIONS = [
    { value: "30", label: "30 dias" },
    { value: "60", label: "60 dias" },
    { value: "90", label: "90 dias" },
    { value: "180", label: "180 dias (padrão)" },
    { value: "365", label: "365 dias (1 ano)" },
    { value: "0", label: "Não expira" },
]

export function ReturnPolicySubPage({ partnerId, onBack }: { partnerId: string; onBack: () => void }) {
    const { success: notifySuccess, error: notifyError } = useNotification()
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [storeName, setStoreName] = useState("")
    const [isScrolled, setIsScrolled] = useState(false)
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const [policy, setPolicy] = useState<PartnerReturnPolicy | null>(null)
    const [initialPolicy, setInitialPolicy] = useState<PartnerReturnPolicy | null>(null)

    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
    }, [])

    const handleBack = useCallback(() => onBack(), [onBack])

    useEffect(() => {
        let cancelled = false
            ; (async () => {
                setLoading(true)
                const res = await getPartnerReturnPolicyAction(partnerId)
                if (cancelled) return
                if (res.success) {
                    setPolicy(res.data.policy)
                    setInitialPolicy(res.data.policy)
                    setStoreName(res.data.storeName || "")
                } else {
                    notifyError(res.error || "Erro ao carregar")
                }
                setLoading(false)
            })()
        return () => { cancelled = true }
    }, [partnerId, notifyError])

    const update = useCallback(<K extends keyof PartnerReturnPolicy>(key: K, value: PartnerReturnPolicy[K]) => {
        setPolicy((prev) => (prev ? { ...prev, [key]: value } : prev))
    }, [])

    const fillTemplate = useCallback(() => {
        update("fullPolicyText", buildDefaultPolicyText(storeName))
    }, [storeName, update])

    const hasChanges = useMemo(() => {
        if (!policy || !initialPolicy) return false
        return JSON.stringify(policy) !== JSON.stringify(initialPolicy)
    }, [policy, initialPolicy])

    async function handleSave() {
        if (!policy) return
        setSaving(true)
        const res = await upsertPartnerReturnPolicyAction({
            partnerId: policy.partnerId,
            legalOnlineRegretDays: policy.legalOnlineRegretDays,
            legalDurableProductDays: policy.legalDurableProductDays,
            legalNonDurableProductDays: policy.legalNonDurableProductDays,
            acceptsSizeExchange: policy.acceptsSizeExchange,
            acceptsColorExchange: policy.acceptsColorExchange,
            acceptsStoreCredit: policy.acceptsStoreCredit,
            storeCreditValidityDays: policy.storeCreditValidityDays,
            acceptsInPersonReturn: policy.acceptsInPersonReturn,
            acceptsShippingReturn: policy.acceptsShippingReturn,
            shippingPayer: policy.shippingPayer,
            commercialDeadlineDays: policy.commercialDeadlineDays,
            additionalWarrantyDays: policy.additionalWarrantyDays,
            commercialNotes: policy.commercialNotes,
            fullPolicyText: policy.fullPolicyText,
            receiptMessage: policy.receiptMessage || null,
            receiptShowPolicyBlock: policy.receiptShowPolicyBlock,
            slaResponseDays: policy.slaResponseDays,
        })
        setSaving(false)
        if (res.success) {
            setInitialPolicy({ ...policy })
            notifySuccess("Política de trocas salva com sucesso!")
        } else {
            notifyError(res.error || "Erro ao salvar")
        }
    }

    if (loading || !policy) {
        return <div className="flex h-[calc(100vh-65px)] w-full items-center justify-center">
            <ThreeDotsLoader />
        </div>
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
                        <div className={`absolute -left-12 top-3 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                            <Button variant="filled" onClick={handleBack} className="w-10 h-10 p-0 flex items-center justify-center">
                                <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                            </Button>
                        </div>

                        {/* Title row */}
                        <div className="hidden md:flex items-start justify-between">
                            <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                <h1 className={`font-bold text-brand-dark dark:text-dark-heading transition-all duration-500 flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                    <span className="truncate">Trocas e Devoluções</span>
                                </h1>

                                <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                    Configure as regras de trocas, devoluções e validade de vales-compra do seu negócio.
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
                    <AnimatePresence mode="wait">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <div className="grid grid-cols-12 gap-y-8 lg:gap-y-0 relative">
                                {/* Left Column */}
                                <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12 space-y-12">
                                    <FormSection title="Política comercial">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            <Checkbox label="Aceita troca por tamanho" checked={policy.acceptsSizeExchange} onCheckedChange={(v) => update("acceptsSizeExchange", Boolean(v))} />
                                            <Checkbox label="Aceita troca por cor" checked={policy.acceptsColorExchange} onCheckedChange={(v) => update("acceptsColorExchange", Boolean(v))} />
                                            <Checkbox label="Aceita vale-compra" checked={policy.acceptsStoreCredit} onCheckedChange={(v) => update("acceptsStoreCredit", Boolean(v))} />
                                            <Checkbox label="Aceita devolução presencial" checked={policy.acceptsInPersonReturn} onCheckedChange={(v) => update("acceptsInPersonReturn", Boolean(v))} />
                                            <Checkbox label="Aceita devolução por envio" checked={policy.acceptsShippingReturn} onCheckedChange={(v) => update("acceptsShippingReturn", Boolean(v))} />
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                                            <FormDropdown
                                                label="Quem paga o frete"
                                                value={policy.shippingPayer}
                                                setValue={(v) => update("shippingPayer", v as PartnerReturnPolicy["shippingPayer"])}
                                                options={[
                                                    { value: "case_by_case", label: getShippingPayerLabel("case_by_case") },
                                                    { value: "customer", label: getShippingPayerLabel("customer") },
                                                    { value: "seller", label: getShippingPayerLabel("seller") },
                                                ]}
                                            />
                                            <Input
                                                label="Prazo comercial (dias)"
                                                type="number"
                                                value={String(policy.commercialDeadlineDays)}
                                                onChange={(e) => update("commercialDeadlineDays", Number(e.target.value) || 0)}
                                            />
                                            <FormDropdown
                                                label="Validade do vale-compra"
                                                value={String(policy.storeCreditValidityDays ?? 180)}
                                                setValue={(v) => update("storeCreditValidityDays", Number(v))}
                                                options={STORE_CREDIT_VALIDITY_OPTIONS}
                                            />
                                            <Input
                                                label="Garantia adicional (dias)"
                                                type="number"
                                                value={String(policy.additionalWarrantyDays)}
                                                onChange={(e) => update("additionalWarrantyDays", Number(e.target.value) || 0)}
                                            />
                                            <Input
                                                label="SLA resposta vendedor (dias)"
                                                type="number"
                                                value={String(policy.slaResponseDays)}
                                                onChange={(e) => update("slaResponseDays", Math.min(90, Math.max(1, Number(e.target.value) || 5)))}
                                            />
                                        </div>

                                        <FormTextarea
                                            className="mt-4"
                                            name="commercialNotes"
                                            label="Observações comerciais"
                                            value={policy.commercialNotes || ""}
                                            onChange={(e) => update("commercialNotes", e.target.value || null)}
                                            rows={3}
                                            maxLength={500}
                                            showCharacterCount
                                        />
                                    </FormSection>

                                    <FormSection
                                        title="Política completa"
                                        description="Texto livre exibido ao cliente. Use o template e edite conforme necessário."
                                        hasSeparator
                                    >
                                        <div className="flex justify-end mb-2">
                                            <Button variant="outline" size="sm" onClick={fillTemplate}>Usar template padrão</Button>
                                        </div>
                                        <FormTextarea
                                            name="fullPolicyText"
                                            label="Texto da política"
                                            value={policy.fullPolicyText}
                                            onChange={(e) => update("fullPolicyText", e.target.value)}
                                            rows={10}
                                        />
                                    </FormSection>

                                    <FormSection
                                        title="Referência legal (informativo)"
                                        description="Não bloqueia regras comerciais - apenas orientação para o cliente (CDC)."
                                        hasSeparator
                                    >
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <Input
                                                label="Arrependimento online (dias)"
                                                type="number"
                                                value={String(policy.legalOnlineRegretDays)}
                                                onChange={(e) => update("legalOnlineRegretDays", Number(e.target.value) || 0)}
                                            />
                                            <Input
                                                label="Produto durável (dias)"
                                                type="number"
                                                value={String(policy.legalDurableProductDays)}
                                                onChange={(e) => update("legalDurableProductDays", Number(e.target.value) || 0)}
                                            />
                                            <Input
                                                label="Produto não durável (dias)"
                                                type="number"
                                                value={String(policy.legalNonDurableProductDays)}
                                                onChange={(e) => update("legalNonDurableProductDays", Number(e.target.value) || 0)}
                                            />
                                        </div>
                                    </FormSection>
                                </div>

                                {/* Right Column / Sidebar */}
                                <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 border-l-0 lg:border-l border-brand-border dark:border-dark-border mt-8 lg:mt-0 space-y-6">
                                    <SidebarCard hasTopStrip hasSeparator title="Sobre Trocas e Devoluções">
                                        <div className="space-y-4 text-sm text-brand-inactive-text dark:text-dark-body">
                                            <p>
                                                <strong className="text-brand-dark dark:text-dark-heading">Validade do Vale-Compra:</strong>{" "}
                                                Define por quanto tempo os vales-compra ou créditos de troca concedidos aos clientes permanecem ativos para novos pedidos.
                                            </p>
                                            <p>
                                                <strong className="text-brand-dark dark:text-dark-heading">Prazos Comerciais:</strong>{" "}
                                                Regras personalizadas pela sua empresa para aceitar trocas de tamanho, cor ou devoluções de produtos.
                                            </p>
                                            <p>
                                                <strong className="text-brand-dark dark:text-dark-heading">Referência Legal:</strong>{" "}
                                                Prazos baseados no Código de Defesa do Consumidor (CDC) para compras online e físicas.
                                            </p>
                                        </div>
                                    </SidebarCard>
                                </div>
                            </div>
                        </motion.div>
                    </AnimatePresence>
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
        </FadeIn>
    )
}
