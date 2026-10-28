"use client"

import React, { useState, useCallback, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button, Tabs, TabsList, TabsTrigger, TabsContent, FormSection, FormDropdown, IconPlaceholder, SavingStatusModal, InfoCard, SidebarCard } from "@/components/reusable"
import { Switch } from "@/components/reusable/Switch"
import { ChevronLeftIcon, PlusIcon, SaveIcon } from "@/lib/icons"
import { FadeIn } from "@/components/animations/FadeIn"
import { PaymentMethodsSubPage } from "./payments/PaymentMethodsSubPage"
import { PaymentMethodEditPage } from "./payments/PaymentMethodEditPage"
import { getPickupPaymentPolicyAction, updatePickupPaymentPolicyAction } from "@/app/actions/partners/pickup-payment"
import { getServiceCheckoutSettingsAction, updateServiceCheckoutSettingsAction } from "@/app/actions/marketplace/service-checkout-settings"
import { useNotification } from "@/hooks/use-notification"
import { planStarIconForTarget, usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal"
import Link from "next/link"

const DEPOSIT_OPTIONS = [
    { value: "10", label: "10%" },
    { value: "20", label: "20%" },
    { value: "30", label: "30%" },
    { value: "50", label: "50%" },
]

export function PaymentsPage({
    partner,
    paymentMethods,
    onBack,
    planGate,
    storeId,
    orderFlow,
    isQuick,
}: {
    partner: any
    paymentMethods: any[]
    onBack: () => void
    planGate?: { requiredPlanSlug: "crescer" | "escalar" }
    storeId?: string | null
    orderFlow?: "whatsapp" | "dudit"
    isQuick?: boolean
}) {
    const isWhatsAppFlow = orderFlow === "whatsapp"
    const { openPlanUpgrade } = usePlanUpgrade()
    const { success: notifySuccess, error: notifyError } = useNotification()
    const [activeTab, setActiveTab] = useState("formas")
    const [isScrolled, setIsScrolled] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const scrollContainerRef = useRef<HTMLDivElement>(null)

    const handleBack = useCallback(() => onBack(), [onBack]);

    // Edit/create state
    const [editMethodId, setEditMethodId] = useState<string | null>(null)
    const [isCreating, setIsCreating] = useState(false)

    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
    }, [])

    // Pickup payment state
    const [pickupPaymentPolicy, setPickupPaymentPolicy] = useState<"require_online_payment" | "allow_pickup_payment">("require_online_payment")

    // Service checkout state
    const [depositFeatureAllowed, setDepositFeatureAllowed] = useState(false)
    const [depositEnabled, setDepositEnabled] = useState(false)
    const [depositPercentage, setDepositPercentage] = useState("50")
    const [depositMpEnabled, setDepositMpEnabled] = useState(false)
    const [depositBalanceManualEnabled, setDepositBalanceManualEnabled] = useState(false)
    const [mpConnected, setMpConnected] = useState(!!partner.mp_user_id)
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        const load = async () => {
            try {
                const pickupRes = await getPickupPaymentPolicyAction()
                if (pickupRes.pickupPaymentPolicy) {
                    setPickupPaymentPolicy(pickupRes.pickupPaymentPolicy as "require_online_payment" | "allow_pickup_payment")
                }

                const svcRes = await getServiceCheckoutSettingsAction(partner.id)
                if (svcRes.success && svcRes.settings) {
                    setDepositFeatureAllowed(svcRes.depositFeatureAllowed)
                    setDepositEnabled(svcRes.settings.depositEnabled)
                    setDepositPercentage(String(svcRes.settings.depositPercentage))
                    setDepositMpEnabled(svcRes.settings.depositMpEnabled)
                    setDepositBalanceManualEnabled(
                        Boolean(svcRes.settings.depositBalanceManualEnabled),
                    )
                    setMpConnected(svcRes.settings.mpConnected)
                }
            } catch {
                // silently fail
            }
            setIsLoading(false)
        }
        load()
    }, [partner.id])

    const handleSaveSettings = async () => {
        if (!depositFeatureAllowed && depositEnabled) {
            notifyError("Entrada (sinal) disponível apenas nos planos Crescer e Escalar.")
            return
        }

        if (depositEnabled) {
            if (!mpConnected) {
                notifyError("Para cobrar sinal obrigatório, conecte o Mercado Pago nas integrações.")
                return
            }
        }

        setIsSaving(true)
        try {
            const effectivePickupPolicy = depositEnabled ? "require_online_payment" : pickupPaymentPolicy
            const pickupRes = await updatePickupPaymentPolicyAction(effectivePickupPolicy)
            if (!pickupRes.success) {
                notifyError("Erro ao salvar", pickupRes.error || "Erro ao salvar política de pagamento na retirada.")
                setIsSaving(false)
                return
            }

            const svcRes = await updateServiceCheckoutSettingsAction({
                partnerId: partner.id,
                depositEnabled: depositFeatureAllowed ? depositEnabled : false,
                depositPercentage: Number(depositPercentage) as 10 | 20 | 30 | 50,
                depositMpEnabled: depositEnabled ? true : depositMpEnabled,
                depositBalanceManualEnabled,
            })

            if (!svcRes.success) {
                notifyError("Erro ao salvar", svcRes.error || "Erro ao salvar configurações de sinal.")
                setIsSaving(false)
                return
            }

            notifySuccess("Configurações salvas com sucesso!")
        } catch {
            notifyError("Erro ao salvar configurações")
        }
        setIsSaving(false)
    }

    const handleEditMethod = useCallback((id: string) => {
        setEditMethodId(id)
        setIsCreating(false)
    }, [])

    const handleCreateMethod = useCallback(() => {
        setEditMethodId(null)
        setIsCreating(true)
    }, [])

    const handleCloseEdit = useCallback((shouldReload?: boolean) => {
        setEditMethodId(null)
        setIsCreating(false)
        if (shouldReload) {
            window.dispatchEvent(new CustomEvent("payment-methods-updated"))
        }
    }, [])

    const isEditing = editMethodId !== null || isCreating

    if (planGate) {
        return (
            <FadeIn>
                <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden">
                    <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-24 md:pb-8 scroll-smooth no-scrollbar">

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
                                            <span className="truncate">Formas de Pagamento</span>
                                        </h1>

                                        <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100 mt-1"}`}>
                                            Gerencie os métodos de pagamento aceitos em seu negócio.
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="flex flex-col items-center justify-center text-center min-h-[400px] px-4">
                            <IconPlaceholder
                                placeholderType="image"
                                imageSrc="https://img.dudit.com.br/static/mascots/PlanoVender.png"
                                imageAlt="Recurso bloqueado"
                                title="Formas de Pagamento"
                                subtitle="Configure os métodos de pagamento aceitos no seu negócio. Disponível nos planos Crescer e Escalar."
                                itemButton={{
                                    text: "Fazer upgrade",
                                    action: () => openPlanUpgrade(planGate.requiredPlanSlug)
                                }}
                            />
                        </div>
                    </div>
                </div>
            </FadeIn>
        )
    }

    // Edit/create mode - show full-page edit
    if (isEditing) {
        return (
            <PaymentMethodEditPage
                partnerId={partner.id}
                storeId={storeId}
                editingMethod={isCreating ? null : { id: editMethodId!, name: "", is_active: true }}
                existingMethods={paymentMethods}
                onBack={handleCloseEdit}
                isQuick={isQuick}
            />
        )
    }

    return (
        <FadeIn>
            <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden transition-colors duration-500 ease-in-out">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full w-full">
                    <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-24 md:pb-8 scroll-smooth no-scrollbar">

                        {/* Sticky Header */}
                        <div className="sticky top-0 z-30 w-full max-w-[1300px] mx-auto bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out">
                            <div className="max-w-[1300px] mx-auto relative px-4 md:px-6">

                                {/* Back button - desktop only */}
                                <div className={`absolute -left-12 top-3 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                                    <Button variant="filled" onClick={onBack} className="w-10 h-10 p-0 flex items-center justify-center">
                                        <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                    </Button>
                                </div>

                                {/* Title row */}
                                <div className="hidden md:flex items-start justify-between">
                                    <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                        <h1 className={`font-bold text-brand-dark dark:text-dark-heading transition-all duration-500 flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                            <span className="truncate">Formas de Pagamento</span>
                                        </h1>

                                        <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                            Gerencie os métodos de pagamento e configurações de recebimento
                                        </div>
                                    </div>

                                    {/* Desktop action buttons */}
                                    <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                                        {activeTab === "formas" ? (
                                            <Button
                                                onClick={handleCreateMethod}
                                                leftIcon={<PlusIcon size={18} />}
                                            >
                                                Novo método
                                            </Button>
                                        ) : (
                                            <Button onClick={handleSaveSettings} disabled={isSaving} leftIcon={<SaveIcon size={18} />}>
                                                {isSaving ? "Salvando..." : "Salvar"}
                                            </Button>
                                        )}
                                    </div>
                                </div>

                                {/* Tabs */}
                                <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                                    <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                        <TabsTrigger value="formas">Formas de Pagamento</TabsTrigger>
                                        <TabsTrigger value="configuracoes">Configurações de Pagamento</TabsTrigger>
                                    </TabsList>
                                </div>
                            </div>
                        </div>

                        {/* Content Body */}
                        <div className="px-3 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
                            <AnimatePresence mode="wait">
                                <TabsContent value="formas" className="mt-0 focus-visible:outline-none">
                                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                        <PaymentMethodsSubPage
                                            partner={partner}
                                            paymentMethods={paymentMethods}
                                            handleBack={onBack}
                                            onEdit={handleEditMethod}
                                            onCreate={handleCreateMethod}
                                            storeId={storeId}
                                            embedded
                                            isQuick={isQuick}
                                        />
                                    </motion.div>
                                </TabsContent>

                                <TabsContent value="configuracoes" className="mt-0 focus-visible:outline-none">
                                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid grid-cols-12 gap-y-8 md:gap-y-0">
                                        <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12 space-y-6">
                                            {isWhatsAppFlow && (
                                                <InfoCard
                                                    color="orange"
                                                    message="Seu fluxo de pedidos está como WhatsApp. Estas configurações só terão efeito ao mudar o fluxo para Dudit."
                                                />
                                            )}

                                            {!isWhatsAppFlow && depositEnabled && (
                                                <InfoCard
                                                    color="orange"
                                                    message="Com sinal obrigatório ativo, o sinal é sempre cobrado online pelo Mercado Pago. O saldo restante só pode ser recebido na retirada/entrega se a opção de pagamento presencial do saldo estiver ativada."
                                                />
                                            )}

                                            {/* Pagamento na retirada */}
                                            <FormSection title="Pagamento na retirada / entrega">
                                                <div className="flex items-center justify-between py-3">
                                                    <div>
                                                        <p className="font-medium text-brand-dark dark:text-dark-heading">Permitir pagamento na retirada</p>
                                                        <p className="text-xs text-brand-inactive-text">Cliente pode pagar ao retirar o pedido</p>
                                                    </div>
                                                    <Switch
                                                        checked={depositEnabled ? false : pickupPaymentPolicy === "allow_pickup_payment"}
                                                        onCheckedChange={(checked) => {
                                                            if (!depositEnabled && !isWhatsAppFlow) {
                                                                setPickupPaymentPolicy(checked ? "allow_pickup_payment" : "require_online_payment")
                                                            }
                                                        }}
                                                        disabled={depositEnabled || isWhatsAppFlow}
                                                    />
                                                </div>
                                            </FormSection>

                                            {/* Entrada (sinal) */}
                                            <FormSection title="Sinal (pagamento antecipado)" hasSeparator>
                                                <div className="space-y-6">
                                                    <div className="flex items-center justify-between py-3">
                                                        <div>
                                                            <p className="font-medium text-brand-dark dark:text-dark-heading">Cobrar sinal</p>
                                                            <p className="text-xs text-brand-inactive-text">Cliente pode pagar apenas o sinal no checkout</p>
                                                        </div>
                                                        <Switch
                                                            checked={depositEnabled && depositFeatureAllowed && mpConnected}
                                                            onCheckedChange={(v) => {
                                                                if (v && !mpConnected) {
                                                                    notifyError("Mercado Pago não conectado", "Para cobrar sinal obrigatório, conecte o Mercado Pago nas integrações.")
                                                                    return
                                                                }
                                                                if (depositFeatureAllowed) {
                                                                    setDepositEnabled(v)
                                                                    if (v) {
                                                                        if (mpConnected) setDepositMpEnabled(true)
                                                                        setPickupPaymentPolicy("require_online_payment")
                                                                    }
                                                                }
                                                            }}
                                                            disabled={!depositFeatureAllowed || isWhatsAppFlow}
                                                        />
                                                    </div>

                                                    {!mpConnected && !isWhatsAppFlow && (
                                                        <InfoCard
                                                            title="Mercado Pago não conectado"
                                                            message="Para cobrar sinal, é necessário ter o Mercado Pago conectado."
                                                            color="blue"
                                                            bottomElement={
                                                                <Link href="/erp/configuracoes?tab=integracoes">
                                                                    <Button variant="link">Conectar Mercado Pago</Button>
                                                                </Link>
                                                            }
                                                        />
                                                    )}

                                                    {depositEnabled && (
                                                        <>
                                                            <FormDropdown
                                                                label="Percentual da entrada"
                                                                value={depositPercentage}
                                                                setValue={setDepositPercentage}
                                                                options={DEPOSIT_OPTIONS}
                                                                disabled={!depositEnabled || !depositFeatureAllowed}
                                                            />
                                                            <div className="flex items-center justify-between gap-4 py-3 border-t border-brand-border dark:border-dark-border">
                                                                <div>
                                                                    <p className="font-medium text-brand-dark dark:text-dark-heading">Permitir pagamento presencial do saldo</p>
                                                                    <p className="text-xs text-brand-inactive-text">
                                                                        Depois que o sinal for pago, o saldo restante pode ser recebido na retirada/entrega, em dinheiro, cartão ou Pix, inclusive em partes. O sinal continua sempre online.
                                                                    </p>
                                                                </div>
                                                                <Switch
                                                                    checked={depositBalanceManualEnabled}
                                                                    onCheckedChange={setDepositBalanceManualEnabled}
                                                                    disabled={!depositEnabled}
                                                                />
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            </FormSection>
                                        </div>

                                        <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 border-l-0 lg:border-l border-brand-border dark:border-dark-border mt-8 lg:mt-0 space-y-6">
                                            {/* Meios de recebimento */}
                                            <SidebarCard hasTopStrip hasSeparator title="Meios de recebimento">
                                                <p className="text-xs text-brand-inactive-text mb-6">
                                                    {isWhatsAppFlow
                                                        ? "Configure seus métodos de pagamento para exibir na vitrine. O recebimento do sinal requer fluxo de pedidos via Dudit."
                                                        : "O recebimento do sinal é feito exclusivamente online via Mercado Pago no checkout."}
                                                </p>

                                                <div className="space-y-6">
                                                    <div className="flex items-center justify-between">
                                                        <div>
                                                            <p className="font-semibold text-sm text-brand-dark dark:text-dark-heading">Integração Mercado Pago</p>
                                                            {mpConnected ? (
                                                                <p className="text-xs text-brand-green font-medium">Conectado</p>
                                                            ) : (
                                                                <p className="text-xs text-amber-500 font-medium">Requer conexão nas integrações</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </SidebarCard>
                                        </div>
                                    </motion.div>
                                </TabsContent>
                            </AnimatePresence>
                        </div>
                    </div>
                </Tabs>

                {/* Mobile Bottom Action Bar - only show on configuracoes tab */}
                {activeTab === "configuracoes" && (
                    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 flex gap-3">
                        <Button variant="outline" onClick={onBack} className="flex-1 h-12" disabled={isSaving}>
                            Cancelar
                        </Button>
                        <Button onClick={handleSaveSettings} className="flex-1 h-12" disabled={isSaving}>
                            Salvar
                        </Button>
                    </div>
                )}

                <SavingStatusModal isOpen={isSaving} text="Salvando configurações..." />
            </div>
        </FadeIn>
    )
}
