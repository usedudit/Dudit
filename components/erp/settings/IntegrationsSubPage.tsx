"use client"

import React, { useState, useRef, useCallback, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { Button, InfoCard, DefaultModal } from "@/components/reusable"
import { CheckCircleIcon, ChevronLeftIcon, ArrowLeftRightIcon, XIcon, InfoIcon } from "@/lib/icons"
import { disconnectMercadoPagoAction } from "@/app/actions/mercadopago"
import { FadeIn } from "@/components/animations/FadeIn"
import { motion, AnimatePresence } from "framer-motion"
import { getSubscriptionStatusAction } from "@/app/actions/erp/subscriptions"
import { hasMinimumPlan } from "@/lib/subscription/plan-tier"
import { usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal"
import { toast } from "sonner"

// ─── Integration Card (same style as IntegrationsPage.tsx) ───────────────────

export const IntegrationCard = ({
    name,
    description,
    status,
    colorClass,
    icon: Icon,
    children,
}: {
    name: string
    description: string
    status: "connected" | "disconnected"
    colorClass: string
    icon: any
    children: React.ReactNode
}) => (
    <div className="border border-brand-border dark:border-dark-border rounded-xl p-5 flex flex-col h-full bg-white dark:bg-dark-surface transition-all">
        <div className="flex justify-between items-start mb-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white ${colorClass}`}>
                <Icon size={24} />
            </div>
            {status === "connected" ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    <CheckCircleIcon size={12} />
                    Conectado
                </span>
            ) : (
                <span className="inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                    Desconectado
                </span>
            )}
        </div>
        <h3 className="font-bold text-brand-dark dark:text-dark-heading mb-2">{name}</h3>
        <p className="text-sm text-brand-inactive-text dark:text-dark-body mb-6 flex-1">{description}</p>
        {children}
    </div>
)

// ─── Mercado Pago icon ────────────────────────────────────────────────────────

export const MercadoPagoIcon = () => (
    <svg viewBox="0 0 48 48" width="24" height="24" fill="none" aria-hidden="true">
        <circle cx="24" cy="24" r="24" fill="white" fillOpacity="0.2" />
        <path
            d="M24 10C16.268 10 10 16.268 10 24c0 7.732 6.268 14 14 14 7.732 0 14-6.268 14-14 0-7.732-6.268-14-14-14zm6.5 16.5h-5v5h-3v-5h-5v-3h5v-5h3v5h5v3z"
            fill="white"
        />
    </svg>
)

export const IntegrationsSubPage = ({
    partner,
    mpConnected,
    onBack,
}: {
    partner: any
    mpConnected: boolean
    onBack: () => void
}) => {
    const searchParams = useSearchParams()
    const [isLoading, setIsLoading] = useState(false)
    const [isCheckingPlan, setIsCheckingPlan] = useState(true)
    const [planSlug, setPlanSlug] = useState<string>("free")
    const { openPlanUpgrade } = usePlanUpgrade()

    const [activeModal, setActiveModal] = useState<"info" | "knowMore" | "permissions" | null>(null)
    const [knowMoreStep, setKnowMoreStep] = useState(0)

    const [isScrolled, setIsScrolled] = useState(false)
    const scrollContainerRef = useRef<HTMLDivElement>(null)

    const handleBack = useCallback(() => onBack(), [onBack])

    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
    }, [])

    const checkPlan = useCallback(async () => {
        try {
            const res = await getSubscriptionStatusAction()
            if (res.success && res.data) {
                setPlanSlug(res.data.plan.slug)
            }
        } catch (err) {
            console.error("Error checking plan:", err)
        } finally {
            setIsCheckingPlan(false)
        }
    }, [])

    useEffect(() => {
        checkPlan()
    }, [checkPlan])

    const handleConnectClick = () => {
        if (!hasMinimumPlan(planSlug, "crescer")) {
            openPlanUpgrade("crescer")
            return
        }
        setActiveModal("info")
    }

    const handleStartOAuth = async () => {
        setIsLoading(true)
        try {
            window.location.href = "/api/mercadopago/oauth/start"
        } catch (err) {
            toast.error("Erro ao iniciar conexão com Mercado Pago. Tente novamente.")
            setIsLoading(false)
        }
    }

    const handleDisconnect = async () => {
        if (
            !confirm(
                "Tem certeza que deseja desconectar sua conta do Mercado Pago? Você não poderá mais receber pagamentos online.",
            )
        ) {
            return
        }

        setIsLoading(true)
        const result = await disconnectMercadoPagoAction()

        if (result.error) {
            toast.error(`Erro: ${result.error}`)
        }
        setIsLoading(false)
    }

    const KNOW_MORE_STEPS = [
        {
            title: "O que é o Mercado Pago?",
            description: "O Mercado Pago é uma solução de pagamentos simples e completa pra você vender com mais facilidade.\n\nCom ele, seus clientes podem pagar sem precisar ter conta ou finalizar a compra direto na sua loja, de forma rápida e segura.\n\nTudo isso com vários meios de pagamento em um só lugar.",
        },
        {
            title: "Como funciona o Mercado Pago?",
            description: "A integração é bem rápida e prática. Em poucos minutos, você já pode começar a vender.\n\nDá pra oferecer parcelamento em até 12x no cartão, além de aceitar Pix, boleto e débito.\n\nE quem já tem conta no Mercado Pago consegue pagar ainda mais rápido e até parcelar sem cartão.",
        },
        {
            title: "Funcionalidades do Mercado Pago",
            list: [
                "Pagamento com cartão, Pix, boleto e débito",
                "Parcelamento em até 12x",
                "Parcelamento sem cartão (pra quem tem conta Mercado Pago)",
                "Compra Garantida para mais segurança nas compras",
            ],
        },
        {
            title: "Por que usar o Mercado Pago?",
            list: [
                "🔒 Mais segurança com sistema antifraude sempre atualizado",
                "💳 Várias formas de pagamento pra facilitar a vida do cliente",
                "💰 Possibilidade de crédito para o seu negócio",
                "⚡ Pagamento rápido, sem complicação",
            ],
        },
    ]

    return (
        <FadeIn>
            <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden transition-colors duration-500 ease-in-out">
                <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-24 md:pb-8 scroll-smooth no-scrollbar">

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
                            <div className="hidden md:flex items-start justify-between">
                                <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                    <h1 className={`font-bold text-brand-dark dark:text-dark-heading transition-all duration-500 flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                        <span className="truncate">Dados do Negócio</span>
                                    </h1>

                                    <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                        Conecte seu negócio com ferramentas externas e meios de pagamento.
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Content Body */}
                    <div className="px-3 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
                        {searchParams.get("mp_connected") === "true" && (
                            <InfoCard
                                message="Mercado Pago conectado com sucesso! Agora você pode receber pagamentos online."
                                color="green"
                                className="mb-6"
                            />
                        )}

                        {searchParams.get("mp_error") && (
                            <InfoCard
                                message={`Erro ao conectar Mercado Pago: ${searchParams.get("mp_error")}`}
                                color="red"
                                className="mb-6"
                            />
                        )}

                        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-4">Pagamentos</h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            <IntegrationCard
                                name="Mercado Pago"
                                description="Conecte sua conta para receber pagamentos online com split automático. Aceite cartões, PIX e boleto."
                                status={mpConnected ? "connected" : "disconnected"}
                                colorClass="bg-blue-500"
                                icon={MercadoPagoIcon}
                            >
                                {mpConnected ? (
                                    <Button variant="destructive" onClick={handleDisconnect} isLoading={isLoading}>
                                        Desconectar Mercado Pago
                                    </Button>
                                ) : (
                                    <Button onClick={handleConnectClick} className="w-full" isLoading={isCheckingPlan}>
                                        Conectar com Mercado Pago
                                    </Button>
                                )}
                            </IntegrationCard>
                        </div>
                    </div>
                </div>

                {/* ─── Modals ───────────────────────────────────────────────────────── */}

                {/* 1. Connection Info Modal */}
                <DefaultModal
                    isOpen={activeModal === "info"}
                    onClose={() => setActiveModal(null)}
                    title="Conectar ao Mercado Pago"
                    maxWidth="md"
                >
                    <div className="flex flex-col">
                        {/* Header with Icons */}
                <div className="bg-brand-gray dark:bg-dark-border/50 rounded-2xl p-10 flex items-center justify-center gap-8 mb-8 relative group">
                    <div className="w-20 h-20 bg-white dark:bg-dark-surface rounded-2xl p-4 flex items-center justify-center transform transition-transform group-hover:-rotate-3">
                        <img src="https://img.dudit.com.br/static/Icon.png" alt="Dudit" className="w-full h-full object-contain" />
                    </div>

                    <div className="flex flex-col items-center gap-1">
                        <div className="w-12 h-6 bg-white dark:bg-dark-surface rounded-full flex items-center justify-center border border-brand-border/50 dark:border-dark-border/50">
                            <ArrowLeftRightIcon size={14} className="text-brand-dark dark:text-dark-heading" />
                        </div>
                    </div>

                    <div className="w-20 h-20 bg-white dark:bg-dark-surface rounded-2xl p-4 flex items-center justify-center transform transition-transform group-hover:rotate-3">
                        <img src="https://img.dudit.com.br/static/icons/payments/MercadoPago.png" alt="Mercado Pago" className="w-full h-full object-contain" />
                    </div>
                </div>

                <div className="px-2 text-center md:text-left">
                    <p className="text-[15px] text-brand-inactive-text dark:text-dark-body mb-6 leading-relaxed">
                                Venda de forma profissional aceitando as principais formas de pagamento do mercado com integração automática.
                            </p>

                            <Button
                                variant="link"
                                onClick={() => {
                                    setKnowMoreStep(0)
                                    setActiveModal("knowMore")
                                }}
                                className="flex items-center gap-2"
                            >
                                <InfoIcon size={14} className="ml-1" />
                                Saber mais sobre essa integração
                            </Button>

                            <div className="flex flex-col md:flex-row gap-3">
                                <Button variant="outline" className="flex-1 h-12" onClick={() => setActiveModal(null)}>
                                    Cancelar
                                </Button>
                                <Button className="flex-1 h-12" onClick={() => setActiveModal("permissions")}>
                                    Conectar agora
                                </Button>
                            </div>
                        </div>
                    </div>
                </DefaultModal>

                {/* 2. Know More Modal (Multi-step) */}
                <DefaultModal
                    isOpen={activeModal === "knowMore"}
                    onClose={() => setActiveModal("info")}
                    title="O que é o Mercado Pago?"
                    maxWidth="lg"
                >
                    <div className="flex flex-col min-h-[500px]">
                        {/* Banner */}
                        <div className="bg-brand-gray dark:bg-dark-border/30 rounded-2xl flex items-center justify-center relative group">
                            <img src="https://img.dudit.com.br/static/banners/MercadoPago.png" alt="" className="w-full h-full object-contain" />
                        </div>

                        <div className="p-8 flex-1 flex flex-col">
                            <div className="mb-8">
                                <div className="flex gap-2">
                                    {KNOW_MORE_STEPS.map((_, i) => (
                                        <motion.div
                                            key={i}
                                            layout
                                            className={`h-1 flex-1 rounded-full transition-colors duration-500 ${i <= knowMoreStep ? "bg-brand-green" : "bg-brand-gray dark:bg-dark-border"
                                                }`}
                                        />
                                    ))}
                                </div>
                            </div>

                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={knowMoreStep}
                                    initial={{ opacity: 0, x: 10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -10 }}
                                    transition={{ duration: 0.2 }}
                                    className="flex-1"
                                >
                                    <h3 className="text-2xl font-bold text-brand-dark dark:text-dark-heading mb-4 leading-tight">
                                        {KNOW_MORE_STEPS[knowMoreStep].title}
                                    </h3>

                                    {KNOW_MORE_STEPS[knowMoreStep].description && (
                                        <p className="text-[16px] text-brand-inactive-text dark:text-dark-body leading-relaxed whitespace-pre-wrap">
                                            {KNOW_MORE_STEPS[knowMoreStep].description}
                                        </p>
                                    )}

                                    {KNOW_MORE_STEPS[knowMoreStep].list && (
                                        <ul className="space-y-4 mt-6">
                                            {KNOW_MORE_STEPS[knowMoreStep].list.map((item, i) => (
                                                <li key={i} className="flex items-start gap-3 text-[15px] text-brand-dark dark:text-dark-heading font-medium">
                                                    <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-green/10 text-brand-green text-[8px]">
                                                        ●
                                                    </span>
                                                    {item}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </motion.div>
                            </AnimatePresence>

                            <div className="flex flex-col md:flex-row gap-3 mt-8">
                                <Button
                                    variant="outline"
                                    disabled={knowMoreStep === 0}
                                    onClick={() => setKnowMoreStep(prev => prev - 1)}
                                    className="flex-1 h-12"
                                >
                                    Anterior
                                </Button>

                                {knowMoreStep === KNOW_MORE_STEPS.length - 1 ? (
                                    <Button
                                        className="flex-1 h-12"
                                        onClick={() => setActiveModal("info")}
                                    >
                                        Entendido
                                    </Button>
                                ) : (
                                    <Button
                                        className="flex-1 h-12"
                                        onClick={() => setKnowMoreStep(prev => prev + 1)}
                                    >
                                        Próximo
                                    </Button>
                                )}
                            </div>
                        </div>
                    </div>
                </DefaultModal>

                {/* 3. Permissions Modal */}
                <DefaultModal
                    isOpen={activeModal === "permissions"}
                    onClose={() => setActiveModal("info")}
                    title="Permissões do Aplicativo"
                    maxWidth="lg"
                >
                    <div className="flex flex-col">
                        <div className="bg-brand-gray dark:bg-dark-border/50 rounded-2xl flex items-center justify-center relative group">
                            <img src="https://img.dudit.com.br/static/banners/MercadoPago.png" alt="" className="w-full h-full object-contain" />
                        </div>

                        <div className="p-8">

                            <div className="space-y-6 mb-8">
                                <InfoCard
                                    message="Antes de instalar, é importante dar uma olhada nas permissões do aplicativo e concordar com elas para ativar na sua loja."
                                    color="green"
                                />
                                <div className="flex flex-col gap-6">
                                    <div className="space-y-2">
                                        <h4 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-2">Sobre os dados da sua loja</h4>
                                        <p className="text-[14px] text-brand-inactive-text dark:text-dark-body leading-relaxed">
                                            O aplicativo terá acesso apenas para leitura dos seus produtos e categorias (ou seja, não poderá alterar essas informações).
                                        </p>
                                        <p className="text-[14px] text-brand-inactive-text dark:text-dark-body leading-relaxed mt-2">
                                            Também poderá gerenciar dados relacionados a fornecedores e transações de pagamento.
                                        </p>
                                    </div>

                                    <div className="space-y-2">
                                        <h4 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-2">Sobre os dados dos seus clientes</h4>
                                        <p className="text-[14px] text-brand-inactive-text dark:text-dark-body leading-relaxed">
                                            O app poderá criar, editar e excluir informações de vendas na sua loja.
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <h4 className="text-sm font-bold text-brand-green uppercase tracking-wide">Outras permissões</h4>
                                    <p className="text-[14px] text-brand-inactive-text dark:text-dark-body leading-relaxed">
                                        Pode adicionar componentes em JavaScript para melhorar o funcionamento da sua loja.
                                    </p>
                                </div>

                                <div className="pt-6 border-t border-brand-border dark:border-dark-border">
                                    <p className="text-[13px] text-brand-inactive-text dark:text-dark-body leading-relaxed">
                                        Ao conectar, você concorda com a{" "}
                                        <a
                                            href="https://www.mercadopago.com.br/privacidade"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-brand-green font-bold hover:underline"
                                        >
                                            política de privacidade do aplicativo
                                        </a>. Se quiser, pode desconectar o aplicativo a qualquer momento.
                                    </p>
                                    <InfoCard
                                        message="Importante: a plataforma não é responsável pelo funcionamento do aplicativo, então é sempre bom avaliar antes de instalar, ok?"
                                        color="orange"
                                    />
                                </div>
                            </div>

                            <div className="flex flex-col-reverse md:flex-row gap-3">
                                <Button variant="outline" className="flex-1 h-12" onClick={() => setActiveModal("info")}>
                                    Cancelar
                                </Button>
                                <Button
                                    className="flex-1 h-12"
                                    onClick={handleStartOAuth}
                                    isLoading={isLoading}
                                >
                                    Aceitar e Conectar
                                </Button>
                            </div>
                        </div>
                    </div>
                </DefaultModal>

                {/* Mobile Bottom Action Bar */}
                <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-gray-200 dark:border-dark-border px-4 py-3 flex gap-3">
                    <Button
                        variant="outline"
                        onClick={handleBack}
                        className="flex-1 h-[48px]"
                    >
                        Voltar
                    </Button>
                </div>
            </div>
        </FadeIn>
    )
}
