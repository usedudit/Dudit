"use client"

import React, { useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { AlertModal, Button, DefaultModal } from "@/components/reusable"

export type UpgradeTargetMode = "quick" | "erp"

interface ModeKnowMoreStep {
    title: string
    description?: string
    list?: string[]
}

interface ModeUpgradeConfig {
    modalTitle: string
    bannerImage: string
    bannerAlt: string
    confirmLabel: string
    alertTitle: string
    alertDescription: string
    alertConfirmText: string
    steps: ModeKnowMoreStep[]
}

const MODE_UPGRADE_CONFIG: Record<UpgradeTargetMode, ModeUpgradeConfig> = {
    quick: {
        modalTitle: "O que é a Vitrine Online?",
        bannerImage: "https://img.dudit.com.br/static/mascots/MaisUmaVitrine.png",
        bannerAlt: "Vitrine Online Dudit",
        confirmLabel: "Ativar Vitrine Online",
        alertTitle: "Mudar para o modo Vitrine Online?",
        alertDescription:
            "Você tem certeza que deseja mudar para o modo Vitrine Online? Seus itens cadastrados continuam salvos, novos módulos de vendas serão liberados e a página será recarregada.",
        alertConfirmText: "Sim, mudar para Vitrine",
        steps: [
            {
                title: "O que é a Vitrine Online?",
                description:
                    "A Vitrine Online transforma a sua conta em uma loja virtual com a sua marca, catálogo organizado e link exclusivo para divulgar.\n\nSeus clientes navegam pelos seus produtos e serviços com facilidade e podem fechar pedidos online ou direto pelo WhatsApp.",
            },
            {
                title: "O que você desbloqueia?",
                list: [
                    "🛍️ Vitrine personalizada com sua logo, banner e identidade",
                    "📦 Gestão de pedidos, orçamentos e agendamentos em um só lugar",
                    "💳 Recebimento online com Pix, Mercado Pago e formas de pagamento",
                    "🎟️ Cupons de desconto, campanhas promocionais e cálculo de entregas",
                ],
            },
            {
                title: "Antes de confirmar a mudança",
                list: [
                    "✅ Seus produtos e serviços já cadastrados continuam salvos normalmente",
                    "✨ Novas abas de vendas, vitrine e configurações serão liberadas no menu",
                    "⚙️ Você pode personalizar os módulos ativos em Configurações > Gerenciar recursos",
                    "🔄 A página será recarregada automaticamente para aplicar o modo Vitrine Online",
                ],
            },
        ],
    },
    erp: {
        modalTitle: "O que é a Gestão completa?",
        bannerImage: "https://img.dudit.com.br/static/mascots/Gestao.png",
        bannerAlt: "Gestão completa Dudit",
        confirmLabel: "Ativar Gestão completa",
        alertTitle: "Mudar para o modo Gestão completa?",
        alertDescription:
            "Você tem certeza que deseja mudar para o modo Gestão completa (ERP)? Os módulos de PDV, Financeiro, Estoque, Clientes e Equipe serão ativados e a página será recarregada.",
        alertConfirmText: "Sim, ativar Gestão completa",
        steps: [
            {
                title: "O que é o modo Gestão completa?",
                description:
                    "A Gestão completa desbloqueia o ERP da Dudit para você controlar toda a operação do seu negócio em um único sistema.\n\nAlém da sua vitrine e vendas online, você passa a gerenciar balcão, estoque, financeiro e equipe sem precisar de planilhas.",
            },
            {
                title: "O que você desbloqueia?",
                list: [
                    "🖥️ PDV frente de caixa para vendas presenciais e emissão de recibos",
                    "📊 Controle financeiro completo, fluxo de caixa, contas e relatórios",
                    "📦 Gestão de estoque, movimentações e importação de notas via XML (NF-e)",
                    "👥 Gestão de clientes, equipe, permissões, metas e comissões",
                ],
            },
            {
                title: "Antes de confirmar a mudança",
                list: [
                    "✅ Todo o seu catálogo, pedidos e dados atuais permanecem intactos",
                    "🚀 Os módulos de PDV, Financeiro, Estoque, Clientes e Equipe serão ativados",
                    "⚙️ Você pode ativar ou desativar recursos quando quiser em Configurações > Gerenciar recursos",
                    "🔄 A página será recarregada automaticamente para aplicar o modo Gestão completa",
                ],
            },
        ],
    },
}

interface ModeUpgradeModalProps {
    isOpen: boolean
    targetMode: UpgradeTargetMode
    loading?: boolean
    onClose: () => void
    onBackToSelector?: () => void
    onConfirm: (mode: UpgradeTargetMode) => void
}

export function ModeUpgradeModal({
    isOpen,
    targetMode,
    loading = false,
    onClose,
    onBackToSelector,
    onConfirm,
}: ModeUpgradeModalProps) {
    const [step, setStep] = useState(0)
    const [confirmAlertOpen, setConfirmAlertOpen] = useState(false)
    const config = MODE_UPGRADE_CONFIG[targetMode]
    const steps = config.steps
    const currentStep = steps[step] || steps[0]
    const isFirstStep = step === 0
    const isLastStep = step === steps.length - 1

    useEffect(() => {
        if (isOpen) {
            setStep(0)
            setConfirmAlertOpen(false)
        } else {
            setConfirmAlertOpen(false)
        }
    }, [isOpen, targetMode])

    const handleClose = () => {
        if (loading) return
        setConfirmAlertOpen(false)
        onClose()
    }

    const handlePrevious = () => {
        if (loading) return
        if (isFirstStep) {
            if (onBackToSelector) {
                onBackToSelector()
            }
            return
        }
        setStep((prev) => Math.max(0, prev - 1))
    }

    return (
        <>
            <DefaultModal
                isOpen={isOpen}
                onClose={handleClose}
                title={config.modalTitle}
                maxWidth="lg"
            >
                <div className="flex flex-col min-h-[500px]">
                    {/* Banner */}
                    <div className="bg-brand-gray dark:bg-dark-border/30 rounded-2xl flex items-center justify-center relative group h-[200px] p-4">
                        <img
                            src={config.bannerImage}
                            alt={config.bannerAlt}
                            className="w-full h-full object-contain"
                        />
                    </div>

                    <div className="p-6 md:p-8 flex-1 flex flex-col">
                        {/* Step indicator bars */}
                        <div className="mb-8">
                            <div className="flex gap-2">
                                {steps.map((_, i) => (
                                    <motion.div
                                        key={i}
                                        layout
                                        onClick={() => !loading && setStep(i)}
                                        className={`h-1 flex-1 rounded-full transition-colors duration-500 ${
                                            loading ? "" : "cursor-pointer"
                                        } ${
                                            i <= step
                                                ? "bg-brand-green"
                                                : "bg-brand-gray dark:bg-dark-border"
                                        }`}
                                    />
                                ))}
                            </div>
                        </div>

                        <AnimatePresence mode="wait">
                            <motion.div
                                key={`${targetMode}-${step}`}
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                transition={{ duration: 0.2 }}
                                className="flex-1"
                            >
                                <h3 className="text-2xl font-bold text-brand-dark dark:text-dark-heading mb-4 leading-tight">
                                    {currentStep.title}
                                </h3>

                                {currentStep.description && (
                                    <p className="text-md text-brand-inactive-text dark:text-dark-body leading-relaxed whitespace-pre-wrap">
                                        {currentStep.description}
                                    </p>
                                )}

                                {currentStep.list && (
                                    <ul className="space-y-4 mt-6">
                                        {currentStep.list.map((item, i) => (
                                            <li
                                                key={i}
                                                className="flex items-start gap-3 text-md text-brand-inactive-text dark:text-dark-body"
                                            >
                                                <span className="flex shrink-0 items-center justify-center text-md">
                                                    ●
                                                </span>
                                                <span>{item}</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </motion.div>
                        </AnimatePresence>

                        <div className="flex flex-col md:flex-row gap-3 mt-8">
                            <Button
                                variant="outline"
                                disabled={loading || (isFirstStep && !onBackToSelector)}
                                onClick={handlePrevious}
                                className="flex-1 h-[46px]"
                            >
                                {isFirstStep && onBackToSelector ? "Voltar" : "Anterior"}
                            </Button>

                            {isLastStep ? (
                                <Button
                                    className="flex-1 h-[46px]"
                                    disabled={loading}
                                    onClick={() => setConfirmAlertOpen(true)}
                                >
                                    {config.confirmLabel}
                                </Button>
                            ) : (
                                <Button
                                    className="flex-1 h-[46px]"
                                    disabled={loading}
                                    onClick={() => setStep((prev) => prev + 1)}
                                >
                                    Próximo
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            </DefaultModal>

            <AlertModal
                isOpen={confirmAlertOpen}
                onClose={() => {
                    if (!loading) setConfirmAlertOpen(false)
                }}
                onConfirm={() => onConfirm(targetMode)}
                title={config.alertTitle}
                description={config.alertDescription}
                confirmText={loading ? "Ativando..." : config.alertConfirmText}
                cancelText="Cancelar"
                variant="warning"
                isLoading={loading}
                disabled={loading}
            />
        </>
    )
}
